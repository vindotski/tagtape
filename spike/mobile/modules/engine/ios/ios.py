"""iOS entry points: plain strings and integers in, a string out, so the
Objective-C bridge needs no object marshalling. The engine is the same file
Android runs."""

import sys

import engine

_cancelled = set()


class _Callback:
    def __init__(self, job):
        self.job = job

    def onLog(self, message):
        print(f"SPIKE-PY [{self.job}] {message}", file=sys.stderr)

    def onProgress(self, done, total):
        pass

    def isCancelled(self):
        return self.job in _cancelled


def version():
    return f"{engine.version()} on Python {sys.version.split()[0]}"


def guard_selftest():
    return engine.guard_selftest()


def probe(url):
    return engine.probe(url, _Callback("probe"))


def download(job, url, fd, temp_dir):
    engine.download(url, fd, temp_dir, _Callback(job))
    return ""


def fetch(job, url, fd, max_bytes):
    engine.fetch(url, fd, max_bytes, _Callback(job))
    return ""


def cancel(job):
    _cancelled.add(job)
    return ""
