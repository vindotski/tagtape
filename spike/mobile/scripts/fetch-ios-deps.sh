#!/bin/sh
# Spike only: fetches what the iOS engine links against, checksum-verified,
# into git-ignored folders. Nothing is installed system-wide.
#   - CPython for iOS (BeeWare's Python-Apple-support, the build python.org's
#     iOS docs point to)
#   - ffmpeg with libmp3lame as xcframeworks (a community FFmpegKit fork;
#     LGPL-3.0). A real app should build these itself: see the spike report.
#   - yt-dlp's pure-Python wheel, same version as Android.
set -eu
cd "$(dirname "$0")/.."

PY_TAG=3.13-b18
PY_SHA=d06acf2a9c7964a8689566353a0e707402eff822037de5e29ba0e16040f7047d
FF_TAG=8.1.2-audio
YTDLP=2026.10.26

TOOLS=.tools/ios
IOS=modules/engine/ios
mkdir -p "$TOOLS" "$IOS/Frameworks"

check() { [ "$(shasum -a 256 "$1" | cut -d' ' -f1)" = "$2" ] || { echo "checksum mismatch: $1" >&2; exit 1; }; }

if [ ! -d "$TOOLS/python/Python.xcframework" ]; then
  curl -fsSL -o "$TOOLS/py.tar.gz" "https://github.com/beeware/Python-Apple-support/releases/download/$PY_TAG/Python-3.13-iOS-support.${PY_TAG#3.13-}.tar.gz"
  check "$TOOLS/py.tar.gz" "$PY_SHA"
  mkdir -p "$TOOLS/python" && tar xzf "$TOOLS/py.tar.gz" -C "$TOOLS/python" && rm "$TOOLS/py.tar.gz"
fi
rm -rf "$IOS/Frameworks/Python.xcframework"
cp -R "$TOOLS/python/Python.xcframework" "$IOS/Frameworks/"

curl -fsSL -o "$TOOLS/checksums.json" "https://github.com/sk3llo/ffmpeg_kit_flutter/releases/download/$FF_TAG/checksums.json"
for name in ffmpegkit libavcodec libavdevice libavfilter libavformat libavutil libswresample libswscale; do
  if [ ! -d "$IOS/Frameworks/$name.xcframework" ]; then
    curl -fsSL -o "$TOOLS/$name.zip" "https://github.com/sk3llo/ffmpeg_kit_flutter/releases/download/$FF_TAG/$name.xcframework.zip"
    check "$TOOLS/$name.zip" "$(sed -n "s/.*\"$name\": \"\([a-f0-9]*\)\".*/\1/p" "$TOOLS/checksums.json")"
    unzip -q -o "$TOOLS/$name.zip" -d "$IOS/Frameworks" -x '__MACOSX/*' '*/._*' && rm "$TOOLS/$name.zip"
    # iOS only: the macOS slice isn't needed and confuses CocoaPods.
    rm -rf "$IOS/Frameworks/$name.xcframework"/macos-*
    python3 - "$IOS/Frameworks/$name.xcframework/Info.plist" <<'PY'
import plistlib, sys
path = sys.argv[1]
with open(path, "rb") as file:
    info = plistlib.load(file)
info["AvailableLibraries"] = [l for l in info["AvailableLibraries"] if l["SupportedPlatform"] == "ios"]
with open(path, "wb") as file:
    plistlib.dump(info, file)
PY
  fi
done

# The Python resources the app bundles: standard library, binary modules for
# the Apple Silicon simulator (a device build needs the framework conversion
# from Python.xcframework/build/utils.sh instead), yt-dlp and our engine.
RES="$IOS/python"
rm -rf "$RES" && mkdir -p "$RES/lib" "$RES/app"
cp -R "$TOOLS/python/Python.xcframework/lib/python3.13" "$RES/lib/"
# lib-dynload and the platform's _sysconfigdata module.
cp -R "$TOOLS/python/Python.xcframework/ios-arm64_x86_64-simulator/lib-arm64/python3.13/." "$RES/lib/python3.13/"
rm -rf "$RES/lib/python3.13/test" "$RES/lib/python3.13/idlelib" "$RES/lib/python3.13/tkinter" "$RES/lib/python3.13/turtledemo"
# certifi: the interpreter has no system certificate store on iOS.
.tools/python/bin/python3.13 -m pip download --quiet --no-deps --only-binary :all: -d "$TOOLS/wheels" "yt-dlp==$YTDLP" certifi
for wheel in "$TOOLS"/wheels/*.whl; do unzip -q -o "$wheel" -d "$RES/app"; done
cp modules/engine/android/src/main/python/engine.py "$IOS/ios.py" "$RES/app/"
echo "iOS dependencies ready"
