"""Spike: yt-dlp in-process on Android, under TagTape's rules.

- Every connection goes through a guard: public addresses, ports 80/443 only.
  It replaces the desktop egress proxy (nothing here spawns a process).
- Never the generic extractor, no playlists, no cookies, no cache directory.
- Media is written to a pipe that ffmpeg reads; nothing is stored on the way.
"""

import ipaddress
import json
import os
import socket
import sys
import threading
import urllib.request

import yt_dlp
from yt_dlp.utils import DownloadCancelled

FORMAT = "bestaudio[protocol!*=dash]/best[protocol!*=dash]"
ALLOWED_PORTS = (80, 443)

# --- network guard -----------------------------------------------------------

_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex


def _check(address):
    if not isinstance(address, tuple) or len(address) < 2:
        raise OSError("blocked: not an internet address")
    host, port = address[0], address[1]
    try:
        ip = ipaddress.ip_address(str(host).split("%")[0])
    except ValueError as error:
        raise OSError("blocked: unresolved host") from error
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    if not ip.is_global:
        raise OSError(f"blocked: {ip} is not a public address")
    if port not in ALLOWED_PORTS:
        raise OSError(f"blocked: port {port}")


def _connect(self, address):
    _check(address)
    return _real_connect(self, address)


def _connect_ex(self, address):
    _check(address)
    return _real_connect_ex(self, address)


socket.socket.connect = _connect
socket.socket.connect_ex = _connect_ex

# --- per-thread stdout, so "-o -" lands in that download's pipe ---------------

_local = threading.local()
_real_stdout = sys.stdout


class _Stdout:
    @property
    def buffer(self):
        stream = getattr(_local, "stream", None)
        if stream is None:
            raise OSError("no output stream for this thread")
        return stream

    def write(self, text):
        return _real_stdout.write(text)

    def flush(self):
        _real_stdout.flush()

    def isatty(self):
        return False

    encoding = "utf-8"


sys.stdout = _Stdout()


class _Log:
    def __init__(self, callback):
        self.callback = callback
        self.last_error = None

    def debug(self, message):
        pass

    def info(self, message):
        pass

    def warning(self, message):
        self.callback.onLog("warning: " + str(message))

    def error(self, message):
        self.last_error = str(message)
        self.callback.onLog("error: " + str(message))


def _options(callback, extra=None):
    options = {
        "quiet": True,
        "no_warnings": False,
        "noprogress": True,
        "logtostderr": True,
        "logger": _Log(callback),
        "allowed_extractors": ["default", "-generic"],
        "noplaylist": True,
        "extract_flat": "in_playlist",
        "cachedir": False,
        "format": FORMAT,
        "socket_timeout": 30,
    }
    if extra:
        options.update(extra)
    return options


def version():
    return yt_dlp.version.__version__


def probe(url, callback):
    """Returns the single track's info as JSON, like --dump-single-json."""
    with yt_dlp.YoutubeDL(_options(callback)) as ydl:
        info = ydl.extract_info(url, download=False)
        return json.dumps(ydl.sanitize_info(info))


def download(url, fd, temp_dir, callback):
    """Streams the chosen audio format into the pipe. Blocks until done."""

    def hook(status):
        if callback.isCancelled():
            raise DownloadCancelled("cancelled")
        if status.get("status") == "downloading":
            callback.onProgress(
                int(status.get("downloaded_bytes") or 0),
                int(status.get("total_bytes") or status.get("total_bytes_estimate") or 0),
            )

    options = _options(
        callback,
        {
            "outtmpl": {"default": "-"},
            "paths": {"temp": temp_dir, "home": temp_dir},
            "hls_prefer_native": True,
            "fixup": "never",
            "updatetime": False,
            "continuedl": False,
            "nopart": True,
            "postprocessors": [],
            "progress_hooks": [hook],
        },
    )
    with os.fdopen(fd, "wb", buffering=0, closefd=False) as stream:
        _local.stream = stream
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                ydl.extract_info(url, download=True)
        finally:
            _local.stream = None


def fetch(url, fd, max_bytes, callback):
    """A direct file link, streamed into the pipe (spike stand-in for `direct`)."""
    request = urllib.request.Request(url, headers={"User-Agent": "TagTape"})
    done = 0
    with os.fdopen(fd, "wb", buffering=0, closefd=False) as stream:
        with urllib.request.urlopen(request, timeout=30) as response:
            total = int(response.headers.get("content-length") or 0)
            while True:
                if callback.isCancelled():
                    raise OSError("cancelled")
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                done += len(chunk)
                if done > max_bytes:
                    raise OSError("file too large")
                stream.write(chunk)
                callback.onProgress(done, total)


def fetch_bytes(url, max_bytes):
    """A small file (the cover), fully in memory."""
    request = urllib.request.Request(url, headers={"User-Agent": "TagTape"})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise OSError("file too large")
    return data


def guard_selftest():
    """Each of these must be refused by the guard."""
    results = {}
    for name, target in {
        "loopback": ("127.0.0.1", 80),
        "private": ("10.0.2.2", 80),
        "link-local": ("169.254.169.254", 80),
        "odd-port": ("1.1.1.1", 8080),
    }.items():
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        try:
            sock.connect(target)
            results[name] = "CONNECTED (bad)"
        except OSError as error:
            results[name] = str(error)
        finally:
            sock.close()
    return json.dumps(results)
