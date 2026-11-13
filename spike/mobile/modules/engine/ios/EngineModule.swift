import ExpoModulesCore
import Foundation

private let maxDirectBytes = 300 * 1024 * 1024

/// iOS side of the spike. Same shape as Android: source (yt-dlp in embedded
/// Python, or a direct fetch) → pipe → ffmpeg (library) → pipe → tag + MP3
/// into a `.part` file that is renamed when complete. iOS can't start child
/// processes, so everything runs in-process.
public class EngineModule: Module {
  private var documents: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }

  private func python(_ function: String, _ arguments: [Any] = []) throws -> String {
    guard let resources = Bundle(for: EngineModule.self).resourceURL?.appendingPathComponent("python") else {
      throw EngineError("no Python resources in the bundle")
    }
    // The interpreter has no system certificate store on iOS.
    setenv("SSL_CERT_FILE", resources.appendingPathComponent("app/certifi/cacert.pem").path, 1)
    try PyBridge.start(withHome: resources.path, appPath: resources.appendingPathComponent("app").path)
    return try PyBridge.call(function, arguments: arguments)
  }

  public func definition() -> ModuleDefinition {
    Name("Engine")

    Events("onLog", "onProgress")

    AsyncFunction("versions") { () -> [String: String] in
      ["ytdlp": try self.python("version"), "ffmpeg": PyBridge.ffmpegVersion()]
    }

    AsyncFunction("guardSelfTest") { () -> String in
      try self.python("guard_selftest")
    }

    AsyncFunction("readConfig") { () -> String in
      (try? String(contentsOf: self.documents.appendingPathComponent("spike.json"), encoding: .utf8)) ?? ""
    }

    AsyncFunction("defaultDestination") { () -> String in
      let out = self.documents.appendingPathComponent("out")
      try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
      return out.path
    }

    AsyncFunction("probe") { (url: String) -> String in
      try self.python("probe", [url])
    }

    AsyncFunction("convert") {
      (id: String, kind: String, url: String, copy: Bool, destination: String,
       folderName: String, fileName: String, tagBase64: String) -> [String: Any] in
      guard let tag = Data(base64Encoded: tagBase64) else { throw EngineError("bad tag") }
      return try self.convert(
        id: id, kind: kind, url: url, copy: copy, destination: destination,
        folderName: folderName, fileName: fileName, tag: tag)
    }

    AsyncFunction("cancel") { (id: String) in
      _ = try? self.python("cancel", [id])
      PyBridge.cancelFfmpeg()
    }

    AsyncFunction("listTemp") { () -> [String] in
      let manager = FileManager.default
      var found: [String] = []
      let roots = [manager.temporaryDirectory] + manager.urls(for: .cachesDirectory, in: .userDomainMask)
      for root in roots {
        guard let walker = manager.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) else { continue }
        for case let file as URL in walker {
          let values = try? file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
          if values?.isRegularFile == true { found.append("\(file.path) (\(values?.fileSize ?? 0) bytes)") }
        }
      }
      return found
    }
  }

  private func convert(
    id: String, kind: String, url: String, copy: Bool, destination: String,
    folderName: String, fileName: String, tag: Data
  ) throws -> [String: Any] {
    let manager = FileManager.default
    let folder = URL(fileURLWithPath: destination).appendingPathComponent(folderName)
    try manager.createDirectory(at: folder, withIntermediateDirectories: true)
    let part = folder.appendingPathComponent(fileName + ".part")
    let done = folder.appendingPathComponent(fileName)
    let workDir = manager.temporaryDirectory.appendingPathComponent("engine-\(id)")
    try manager.createDirectory(at: workDir, withIntermediateDirectories: true)

    var source: [Int32] = [0, 0]  // source → ffmpeg
    var mp3: [Int32] = [0, 0]  // ffmpeg → us
    guard pipe(&source) == 0, pipe(&mp3) == 0 else { throw EngineError("can't create pipes") }

    let lock = NSLock()
    var failure: Error?
    func fail(_ error: Error) {
      lock.lock()
      if failure == nil { failure = error }
      lock.unlock()
    }

    let work = DispatchGroup()
    DispatchQueue.global().async(group: work) {
      do {
        if kind == "site" {
          _ = try self.python("download", [id, url, NSNumber(value: source[1]), workDir.path])
        } else {
          _ = try self.python("fetch", [id, url, NSNumber(value: source[1]), NSNumber(value: maxDirectBytes)])
        }
      } catch { fail(error) }
      close(source[1])  // EOF for ffmpeg
    }
    DispatchQueue.global().async(group: work) {
      let codec = copy ? ["-c:a", "copy"] : ["-c:a", "libmp3lame", "-b:a", "256k"]
      let arguments =
        ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "pipe",
         "-i", "pipe:\(source[0])", "-vn", "-map_metadata", "-1"] + codec
        + ["-t", "7200", "-threads", "1", "-id3v2_version", "0", "-write_id3v1", "0",
           "-write_xing", "0", "-f", "mp3", "pipe:\(mp3[1])"]
      if let log = PyBridge.ffmpeg(arguments) { fail(EngineError("ffmpeg: \(log.suffix(600))")) }
      close(mp3[1])  // EOF for the writer below
      close(source[0])
    }

    manager.createFile(atPath: part.path, contents: nil)
    var written = 0
    do {
      let output = try FileHandle(forWritingTo: part)
      defer { try? output.close() }
      try output.write(contentsOf: tag)
      let input = FileHandle(fileDescriptor: mp3[0], closeOnDealloc: true)
      while let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty {
        try output.write(contentsOf: chunk)
        written += chunk.count
      }
    } catch { fail(error) }
    work.wait()
    try? manager.removeItem(at: workDir)

    if failure == nil && written == 0 { failure = EngineError("no audio came out") }
    if let failure {
      try? manager.removeItem(at: part)
      if (try? manager.contentsOfDirectory(atPath: folder.path).isEmpty) == true {
        try? manager.removeItem(at: folder)
      }
      throw failure
    }
    if manager.fileExists(atPath: done.path) { try manager.removeItem(at: done) }
    try manager.moveItem(at: part, to: done)
    return ["bytes": Double(written + tag.count), "location": done.path]
  }
}

private struct EngineError: Error, LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
