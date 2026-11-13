package app.tagtape.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.ReturnCode
import com.chaquo.python.PyObject
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val MAX_DIRECT_BYTES = 300L * 1024 * 1024
private const val MAX_COVER_BYTES = 5 * 1024 * 1024
private const val COVER_SIZE = 1000

/**
 * Spike engine: source (yt-dlp in embedded Python, or a direct fetch) → pipe →
 * ffmpeg (library) → pipe → ID3 tag + MP3 written into the chosen folder.
 * Both pipes are anonymous, in-process file descriptors: no media touches the
 * app's storage on the way.
 */
class EngineModule : Module() {
  private class Running(val cancelled: AtomicBoolean, val session: AtomicReference<FFmpegSession?>)

  private val running = ConcurrentHashMap<String, Running>()

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("no context")

  private fun engine(): PyObject {
    if (!Python.isStarted()) Python.start(AndroidPlatform(context))
    return Python.getInstance().getModule("engine")
  }

  /** What the Python side calls back into, by name: R8 must not rename it. */
  @androidx.annotation.Keep
  inner class Callback(private val id: String, private val cancelled: AtomicBoolean) {
    private val lastSent = AtomicLong(0)

    fun onLog(message: String) {
      sendEvent("onLog", mapOf("id" to id, "message" to message))
    }

    fun onProgress(done: Long, total: Long) {
      val now = System.currentTimeMillis()
      if (now - lastSent.get() < 500) return
      lastSent.set(now)
      sendEvent("onProgress", mapOf("id" to id, "done" to done.toDouble(), "total" to total.toDouble()))
    }

    fun isCancelled(): Boolean = cancelled.get()
  }

  override fun definition() = ModuleDefinition {
    Name("Engine")

    Events("onLog", "onProgress")

    AsyncFunction("versions") Coroutine { ->
      withContext(Dispatchers.IO) {
        mapOf(
          "ytdlp" to engine().callAttr("version").toString(),
          "ffmpeg" to FFmpegKitConfig.getFFmpegVersion(),
          "python" to Python.getInstance().getModule("sys").get("version").toString(),
        )
      }
    }

    AsyncFunction("guardSelfTest") Coroutine { ->
      withContext(Dispatchers.IO) { engine().callAttr("guard_selftest").toString() }
    }

    AsyncFunction("readConfig") { ->
      val file = File(context.getExternalFilesDir(null), "spike.json")
      if (file.exists()) file.readText() else ""
    }

    AsyncFunction("defaultDestination") { ->
      File(context.getExternalFilesDir(null), "out").apply { mkdirs() }.path
    }

    AsyncFunction("probe") Coroutine { url: String ->
      withContext(Dispatchers.IO) {
        engine().callAttr("probe", url, Callback("probe", AtomicBoolean(false))).toString()
      }
    }

    AsyncFunction("cover") Coroutine { url: String ->
      withContext(Dispatchers.IO) {
        val bytes = engine().callAttr("fetch_bytes", url, MAX_COVER_BYTES).toJava(ByteArray::class.java)
        squareJpeg(bytes)
      }
    }

    AsyncFunction("convert") Coroutine {
        id: String, kind: String, url: String, copy: Boolean, destination: String,
        folderName: String, fileName: String, tagBase64: String ->
      withContext(Dispatchers.IO) {
        convert(id, kind, url, copy, destination, folderName, fileName, Base64.decode(tagBase64, Base64.DEFAULT))
      }
    }

    AsyncFunction("cancel") { id: String ->
      running[id]?.let {
        it.cancelled.set(true)
        it.session.get()?.let { session -> FFmpegKit.cancel(session.sessionId) }
      }
    }

    AsyncFunction("listTemp") { ->
      val roots = listOfNotNull(context.cacheDir, context.externalCacheDir, context.codeCacheDir)
      val found = mutableListOf<String>()
      for (root in roots) {
        root.walkTopDown().filter { it.isFile }.forEach { found.add("${it.path} (${it.length()} bytes)") }
      }
      // Anything in filesDir that isn't Chaquopy's extracted Python code.
      context.filesDir.walkTopDown()
        .onEnter { it.name != "chaquopy" }
        .filter { it.isFile }
        .forEach { found.add("${it.path} (${it.length()} bytes)") }
      found
    }
  }

  private fun convert(
    id: String, kind: String, url: String, copy: Boolean, destination: String,
    folderName: String, fileName: String, tag: ByteArray,
  ): Map<String, Any> {
    val state = Running(AtomicBoolean(false), AtomicReference(null))
    running[id] = state
    val callback = Callback(id, state.cancelled)
    val failure = AtomicReference<Throwable?>(null)
    val workDir = File(context.cacheDir, "engine/$id").apply { mkdirs() }

    // source → ffmpeg, and ffmpeg → us.
    val (sourceRead, sourceWrite) = ParcelFileDescriptor.createPipe()
    val (mp3Read, mp3Write) = ParcelFileDescriptor.createPipe()

    val feeder = thread(name = "source-$id") {
      try {
        if (kind == "site") {
          engine().callAttr("download", url, sourceWrite.fd, workDir.path, callback)
        } else {
          engine().callAttr("fetch", url, sourceWrite.fd, MAX_DIRECT_BYTES, callback)
        }
      } catch (error: Throwable) {
        failure.compareAndSet(null, error)
      } finally {
        runCatching { sourceWrite.close() } // EOF for ffmpeg
      }
    }

    val encoder = thread(name = "ffmpeg-$id") {
      try {
        val codec = if (copy) listOf("-c:a", "copy") else listOf("-c:a", "libmp3lame", "-b:a", "256k")
        val arguments = listOf(
          "-hide_banner", "-loglevel", "error",
          "-protocol_whitelist", "pipe",
          "-i", "pipe:${sourceRead.fd}",
          "-vn", "-map_metadata", "-1",
        ) + codec + listOf(
          "-t", "7200", "-threads", "1",
          "-id3v2_version", "0", "-write_id3v1", "0", "-write_xing", "0",
          "-f", "mp3", "pipe:${mp3Write.fd}",
        )
        val session = FFmpegSession.create(arguments.toTypedArray())
        state.session.set(session)
        FFmpegKitConfig.ffmpegExecute(session)
        if (!ReturnCode.isSuccess(session.returnCode)) {
          failure.compareAndSet(null, RuntimeException("ffmpeg: ${session.allLogsAsString.takeLast(600)}"))
        }
      } catch (error: Throwable) {
        failure.compareAndSet(null, error)
      } finally {
        runCatching { mp3Write.close() } // EOF for the writer below
        runCatching { sourceRead.close() }
      }
    }

    val sink = Sink.open(context, destination, folderName, fileName)
    var written = 0L
    try {
      sink.stream.use { out ->
        out.write(tag)
        ParcelFileDescriptor.AutoCloseInputStream(mp3Read).use { input ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            out.write(buffer, 0, count)
            written += count
          }
        }
      }
      feeder.join()
      encoder.join()
      if (state.cancelled.get()) throw RuntimeException("cancelled")
      failure.get()?.let { throw it }
      if (written == 0L) throw RuntimeException("no audio came out")
      val location = sink.finish()
      return mapOf("bytes" to (written + tag.size).toDouble(), "location" to location)
    } catch (error: Throwable) {
      state.cancelled.set(true)
      state.session.get()?.let { FFmpegKit.cancel(it.sessionId) }
      runCatching { mp3Read.close() }
      feeder.join()
      encoder.join()
      sink.discard()
      // The source's own error says more than a broken pipe does.
      throw failure.get() ?: error
    } finally {
      running.remove(id)
      workDir.deleteRecursively()
      File(context.cacheDir, "engine").let { if (it.list()?.isEmpty() == true) it.delete() }
    }
  }

  /** Centre-crops to a square and scales to 1000×1000 JPEG, as the desktop pipeline does. */
  private fun squareJpeg(bytes: ByteArray): String {
    val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: throw RuntimeException("the cover isn't an image this device can read")
    val side = minOf(source.width, source.height)
    val square = Bitmap.createBitmap(source, (source.width - side) / 2, (source.height - side) / 2, side, side)
    val scaled = Bitmap.createScaledBitmap(square, COVER_SIZE, COVER_SIZE, true)
    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 90, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}

/** Where a track is written: `<name>.part` first, renamed once complete. */
private abstract class Sink(val stream: OutputStream) {
  abstract fun finish(): String
  abstract fun discard()

  companion object {
    fun open(context: Context, destination: String, folderName: String, fileName: String): Sink =
      if (destination.startsWith("content://")) {
        // A folder the user picked through the Storage Access Framework.
        val root = DocumentFile.fromTreeUri(context, Uri.parse(destination))
          ?: throw RuntimeException("can't open the chosen folder")
        val folder = root.findFile(folderName) ?: root.createDirectory(folderName)
          ?: throw RuntimeException("can't create the album folder")
        val part = folder.createFile("application/octet-stream", "$fileName.part")
          ?: throw RuntimeException("can't create the file")
        val stream = context.contentResolver.openOutputStream(part.uri)
          ?: throw RuntimeException("can't write the file")
        object : Sink(stream) {
          override fun finish(): String {
            folder.findFile(fileName)?.delete()
            if (!part.renameTo(fileName)) throw RuntimeException("can't rename the finished file")
            return part.uri.toString()
          }

          override fun discard() {
            part.delete()
            if (folder.listFiles().isEmpty()) folder.delete()
          }
        }
      } else {
        val folder = File(destination, folderName).apply { mkdirs() }
        val part = File(folder, "$fileName.part")
        val done = File(folder, fileName)
        object : Sink(part.outputStream()) {
          override fun finish(): String {
            if (!part.renameTo(done)) throw RuntimeException("can't rename the finished file")
            return done.path
          }

          override fun discard() {
            part.delete()
            if (folder.list()?.isEmpty() == true) folder.delete()
          }
        }
      }
  }
}
