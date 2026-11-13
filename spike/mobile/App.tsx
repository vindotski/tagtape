import { StorageAccessFramework } from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import { Button, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import Engine, { type TrackKind } from "./modules/engine";
import { createTag, fromBase64, toBase64 } from "./src/id3";

// The spike reads its input from a file pushed with adb, so no link is ever
// typed into the repo:
//   adb push spike.json /sdcard/Android/data/<package>/files/spike.json
type Config = {
  auto?: boolean;
  cancelAfterMs?: number;
  album: { title: string; artist: string; year?: string; genre?: string; coverUrl?: string };
  tracks: { title: string; url: string; kind: TrackKind }[];
};

function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";
}

export default function App() {
  const [lines, setLines] = useState<string[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const current = useRef<string | null>(null);
  const started = useRef(false);

  const log = (line: string) => {
    console.log(`SPIKE ${line}`);
    setLines((all) => [...all, line]);
  };

  const guarded = (label: string, work: () => Promise<void>) => async () => {
    try {
      await work();
    } catch (error) {
      log(`${label} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const versions = guarded("versions", async () => {
    log(`versions ${JSON.stringify(await Engine.versions())}`);
  });

  const guardTest = guarded("guard", async () => {
    log(`guard ${await Engine.guardSelfTest()}`);
  });

  const listTemp = guarded("temp", async () => {
    const files = await Engine.listTemp();
    log(`temp files: ${files.length ? files.join(" | ") : "none"}`);
  });

  const pickFolder = guarded("pick", async () => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (result.granted) {
      setDestination(result.directoryUri);
      log(`destination ${result.directoryUri}`);
    }
  });

  const run = guarded("run", async () => {
    const text = await Engine.readConfig();
    if (!text) {
      log("no spike.json");
      return;
    }
    const config: Config = JSON.parse(text);
    const target = destination ?? (await Engine.defaultDestination());
    const { album } = config;
    const folder = safeName(`${album.artist} - ${album.title}`);

    let cover: Uint8Array | undefined;
    // The spike resizes covers natively on Android only.
    if (album.coverUrl && Platform.OS === "android") {
      cover = fromBase64(await Engine.cover(album.coverUrl));
      log(`cover ${cover.length} bytes`);
    }

    for (const [index, track] of config.tracks.entries()) {
      const id = `t${index + 1}-${Date.now()}`;
      let copy = false;
      if (track.kind === "site") {
        const info = JSON.parse(await Engine.probe(track.url));
        log(
          `probe type=${info._type ?? "video"} duration=${info.duration} live=${info.is_live} ` +
            `acodec=${info.acodec} protocol=${info.protocol} extractor=${info.extractor_key ? "ok" : "?"}`,
        );
        if (info._type === "playlist") throw new Error("playlists are refused");
        copy = info.acodec === "mp3";
      }
      const tag = createTag({
        title: track.title,
        artist: album.artist,
        album: album.title,
        track: `${index + 1}/${config.tracks.length}`,
        year: album.year,
        genre: album.genre,
        coverJpeg: cover,
      });
      const number = String(index + 1).padStart(2, "0");
      current.current = id;
      const timer = config.cancelAfterMs
        ? setTimeout(() => {
            log(`cancelling ${id}`);
            Engine.cancel(id);
          }, config.cancelAfterMs)
        : null;
      const began = Date.now();
      try {
        const result = await Engine.convert(
          id,
          track.kind,
          track.url,
          copy,
          target,
          folder,
          `${number} ${safeName(track.title)}.mp3`,
          toBase64(tag),
        );
        log(`track ${index + 1} done: ${result.bytes} bytes in ${Date.now() - began} ms → ${result.location}`);
      } finally {
        if (timer) clearTimeout(timer);
        current.current = null;
      }
    }
    log("ALL DONE");
  });

  useEffect(() => {
    const logs = Engine.addListener("onLog", (event) => log(`[${event.id}] ${event.message}`));
    const progress = Engine.addListener("onProgress", (event) =>
      console.log(`SPIKE progress ${event.id} ${event.done}/${event.total}`),
    );
    if (!started.current) {
      started.current = true;
      (async () => {
        await versions();
        await guardTest();
        const text = await Engine.readConfig();
        if (text && (JSON.parse(text) as Config).auto) {
          await run();
          await listTemp();
        }
      })();
    }
    return () => {
      logs.remove();
      progress.remove();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>TagTape engine spike</Text>
      <View style={styles.buttons}>
        <Button title="Versions" onPress={versions} />
        <Button title="Guard test" onPress={guardTest} />
        <Button title="Pick folder" onPress={pickFolder} />
        <Button title="Run spike.json" onPress={run} />
        <Button title="Cancel" onPress={() => current.current && Engine.cancel(current.current)} />
        <Button title="Temp files" onPress={listTemp} />
      </View>
      <ScrollView style={styles.log}>
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
          <Text key={index} style={styles.line}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 56, paddingHorizontal: 12, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  log: { flex: 1 },
  line: { fontFamily: "monospace", fontSize: 11, marginBottom: 4 },
});
