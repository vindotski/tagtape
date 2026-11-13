#import "PyBridge.h"

#import <Python/Python.h>
#import <ffmpegkit/FFmpegKit.h>
#import <ffmpegkit/FFmpegKitConfig.h>
#import <ffmpegkit/FFmpegSession.h>
#import <ffmpegkit/ReturnCode.h>
#import <signal.h>

static NSError *bridgeError(NSString *message) {
  return [NSError errorWithDomain:@"PyBridge" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
}

/// The pending Python exception as text; clears it. Needs the GIL.
static NSString *pythonError(void) {
  PyObject *type, *value, *traceback;
  PyErr_Fetch(&type, &value, &traceback);
  PyErr_NormalizeException(&type, &value, &traceback);
  NSString *message = @"Python error";
  if (value != NULL) {
    PyObject *text = PyObject_Str(value);
    if (text != NULL) {
      const char *utf8 = PyUnicode_AsUTF8(text);
      if (utf8 != NULL) message = [NSString stringWithUTF8String:utf8];
      Py_DECREF(text);
    }
  }
  if (type != NULL && ((PyTypeObject *)type)->tp_name != NULL) {
    message = [NSString stringWithFormat:@"%s: %@", ((PyTypeObject *)type)->tp_name, message];
  }
  Py_XDECREF(type);
  Py_XDECREF(value);
  Py_XDECREF(traceback);
  PyErr_Clear();
  return message;
}

@implementation PyBridge

+ (BOOL)startWithHome:(NSString *)home appPath:(NSString *)appPath error:(NSError **)error {
  static BOOL started = NO;
  static NSString *failure = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // A reader that goes away must be an error in the writer, not a crash.
    signal(SIGPIPE, SIG_IGN);

    PyConfig config;
    PyConfig_InitPythonConfig(&config);
    config.install_signal_handlers = 0;
    config.write_bytecode = 0;
    config.buffered_stdio = 0;
    PyStatus status = PyConfig_SetBytesString(&config, &config.home, home.UTF8String);
    if (!PyStatus_Exception(status)) status = Py_InitializeFromConfig(&config);
    PyConfig_Clear(&config);
    if (PyStatus_Exception(status)) {
      failure = [NSString stringWithFormat:@"Python didn't start: %s", status.err_msg ?: "unknown"];
      return;
    }
    PyObject *path = PySys_GetObject("path"); // borrowed
    PyObject *entry = PyUnicode_FromString(appPath.UTF8String);
    PyList_Insert(path, 0, entry);
    Py_DECREF(entry);
    started = YES;
    PyEval_SaveThread(); // release the GIL; every call takes it again
  });
  if (!started && error != NULL) *error = bridgeError(failure ?: @"Python didn't start");
  return started;
}

+ (NSString *)call:(NSString *)function arguments:(NSArray *)arguments error:(NSError **)error {
  PyGILState_STATE gil = PyGILState_Ensure();
  NSString *result = nil;
  NSString *problem = nil;
  PyObject *module = PyImport_ImportModule("ios");
  PyObject *callable = module ? PyObject_GetAttrString(module, function.UTF8String) : NULL;
  PyObject *tuple = callable ? PyTuple_New((Py_ssize_t)arguments.count) : NULL;
  if (tuple != NULL) {
    for (NSUInteger index = 0; index < arguments.count; index++) {
      id argument = arguments[index];
      PyObject *item = [argument isKindOfClass:[NSNumber class]]
                           ? PyLong_FromLongLong([argument longLongValue])
                           : PyUnicode_FromString([[argument description] UTF8String]);
      PyTuple_SetItem(tuple, (Py_ssize_t)index, item); // steals the reference
    }
    PyObject *value = PyObject_CallObject(callable, tuple);
    if (value != NULL) {
      PyObject *text = PyObject_Str(value);
      const char *utf8 = text ? PyUnicode_AsUTF8(text) : NULL;
      result = utf8 ? [NSString stringWithUTF8String:utf8] : @"";
      Py_XDECREF(text);
      Py_DECREF(value);
    }
  }
  if (result == nil) problem = pythonError();
  Py_XDECREF(tuple);
  Py_XDECREF(callable);
  Py_XDECREF(module);
  PyGILState_Release(gil);
  if (result == nil && error != NULL) *error = bridgeError(problem ?: @"Python error");
  return result;
}

+ (NSString *)ffmpeg:(NSArray<NSString *> *)arguments {
  FFmpegSession *session = [FFmpegKit executeWithArguments:arguments];
  if ([ReturnCode isSuccess:[session getReturnCode]]) return nil;
  NSString *log = [session getAllLogsAsString] ?: @"";
  return log.length > 0 ? log : @"ffmpeg failed";
}

+ (void)cancelFfmpeg {
  [FFmpegKit cancel];
}

+ (NSString *)ffmpegVersion {
  return [FFmpegKitConfig getFFmpegVersion] ?: @"?";
}

@end
