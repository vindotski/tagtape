Pod::Spec.new do |s|
  s.name           = 'Engine'
  s.version        = '1.0.0'
  s.summary        = 'TagTape engine spike'
  s.description    = 'yt-dlp on embedded CPython and ffmpeg as a library'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Top level only: the vendored frameworks carry their own headers.
  s.source_files = "*.{h,m,swift}"
  s.public_header_files = "PyBridge.h"

  # Fetched by scripts/fetch-ios-deps.sh (git-ignored).
  s.vendored_frameworks = "Frameworks/*.xcframework"
  s.resources = ["python"]
  s.libraries = "z", "bz2", "iconv", "c++"
  s.frameworks = "AudioToolbox", "AVFoundation", "CoreMedia", "VideoToolbox"
end
