#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// The two C libraries behind the engine, wrapped so Swift needs no C API:
/// embedded CPython (yt-dlp runs in-process; iOS can't start child processes)
/// and ffmpeg as a library.
@interface PyBridge : NSObject

/// Starts the interpreter once. `home` holds lib/python3.13, `appPath` our modules.
+ (BOOL)startWithHome:(NSString *)home appPath:(NSString *)appPath error:(NSError **)error;

/// Calls `ios.<function>(*arguments)` (strings and integers) and returns its string result.
+ (nullable NSString *)call:(NSString *)function
                  arguments:(NSArray *)arguments
                      error:(NSError **)error;

/// Runs ffmpeg with an argument array; returns nil on success, its log otherwise.
+ (nullable NSString *)ffmpeg:(NSArray<NSString *> *)arguments;

+ (void)cancelFfmpeg;
+ (NSString *)ffmpegVersion;

@end

NS_ASSUME_NONNULL_END
