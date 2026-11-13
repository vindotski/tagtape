# Mobile engine spike (throwaway)

Proves that TagTape's pipeline runs inside a React Native app on Android and
iOS. It is not part of the pnpm workspace, Biome or CI, and goes away when the
real `mobile/` app lands.

What it runs, on both platforms:

source (yt-dlp on embedded CPython, or a direct fetch) → pipe → ffmpeg as a
library (libmp3lame, 256 kbps CBR, no Xing header) → pipe → ID3v2.3 tag + MP3
into `<album folder>/NN Title.mp3.part`, renamed when complete.

- `modules/engine/android/src/main/python/engine.py`: yt-dlp under TagTape's
  rules, shared by both platforms. A socket guard (public addresses, ports
  80/443) replaces the desktop egress proxy.
- `modules/engine/android`: Kotlin, Chaquopy (Python 3.13) and an FFmpegKit
  fork's `ffmpeg-kit-audio`.
- `modules/engine/ios`: Swift + an Objective-C bridge to CPython
  (Python-Apple-support) and FFmpegKit xcframeworks. Simulator only.
- `src/id3.ts`: an ID3v2.3 writer on `Uint8Array` (node-id3 needs Node).

## Running it

Needs Node, pnpm, JDK 17, the Android SDK and Xcode. Nothing else is installed
system-wide; build tools go under `.tools/` (git-ignored).

```bash
pnpm install
# A Python 3.13 for the Android build, if the machine has none: unpack a
# python-build-standalone release into .tools/python (see android/build.gradle).
pnpm exec expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a)

./scripts/fetch-ios-deps.sh
LANG=en_US.UTF-8 pnpm exec expo prebuild --platform ios
```

Input comes from a `spike.json` pushed to the app's files folder (Android:
`/sdcard/Android/data/app.tagtape.spike/files/`, iOS: the app's `Documents`),
so no link is ever written into the repo:

```json
{
  "auto": true,
  "album": { "title": "Album", "artist": "Artist", "coverUrl": "https://example.com/cover.jpg" },
  "tracks": [{ "title": "Song", "kind": "direct", "url": "https://example.com/song.mp3" }]
}
```

`kind` is `direct` or `site`. `cancelAfterMs` cancels each track after that long.
