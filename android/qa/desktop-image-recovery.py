"""Observe the shared Windows Studio image-replacement deadline.

Requires pywinpty and a built desktop Rustel binary. Runs in a hidden PTY with
an isolated config/set, silent audio output and loopback-only test services.
This is an observation probe, not a passing prompt-cancellation assertion.
"""
import argparse
import binascii
from collections import deque
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import select
import socket
import struct
import threading
import time
import zlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--binary', required=True, type=Path)
parser.add_argument('--results', required=True, type=Path)
args = parser.parse_args()
if os.name != 'nt':
    parser.error('This PTY probe targets Windows; use the native device runner for Android')
from winpty import PtyProcess

folder = args.results.resolve()
folder.mkdir(parents=True, exist_ok=True)
scratch = folder / ('desktop-image-' + str(time.time_ns()))
config, scores = scratch / 'config', scratch / 'set'
config.mkdir(parents=True)
scores.mkdir()


def png_chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', binascii.crc32(kind + body) & 0xffffffff)


pixels = b''.join(b'\0' + bytes(value for x in range(8) for value in
                                (230 if x < 4 else 40, 30 if y < 4 else 180,
                                 50 if x < 4 else 220, 255)) for y in range(8))
image = (b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 6, 0, 0, 0)) +
         png_chunk(b'IDAT', zlib.compress(pixels)) + png_chunk(b'IEND', b''))
slow = threading.Event()
finished = threading.Event()
timing = {}


class Images(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path.startswith('/slow'):
            timing['slowReceived'] = time.monotonic()
            slow.set()
            deadline = time.monotonic() + 25
            while not finished.is_set() and time.monotonic() < deadline:
                if select.select([self.connection], [], [], .1)[0]:
                    if not self.connection.recv(1, socket.MSG_PEEK):
                        timing['slowClosed'] = time.monotonic()
                        return
            return
        self.send_response(200)
        self.send_header('Content-Type', 'image/png')
        self.send_header('Content-Length', str(len(image)))
        self.end_headers()
        self.wfile.write(image)


server = ThreadingHTTPServer(('127.0.0.1', 0), Images)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = 'http://127.0.0.1:' + str(server.server_port)
with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    remote_port = reservation.getsockname()[1]
token = secrets.token_urlsafe(18)
environment = os.environ.copy()
for name in ('RUSTEL_THEME', 'RUSTEL_THEME_DIR', 'TERM_PROGRAM', 'KITTY_WINDOW_ID',
             'WT_SESSION', 'RUSTEL_SESSION_DIR'):
    environment.pop(name, None)
environment.update(RUSTEL_CONFIG_DIR=str(config), RUSTEL_HEADLESS='1',
                   RUSTEL_NO_UPDATE_CHECK='1', RUSTEL_VST3_PATH='', TERM='xterm-256color')
(scores / 'first.strudel').write_text('// QA_IMAGE_BOOT\nnote("c3").s("sine").gain(.02)', encoding='utf-8')
process, peer, stream = None, None, None
terminal_tail = deque(maxlen=8)
try:
    process = PtyProcess.spawn([str(args.binary.resolve()), 'studio', str(scores / 'first.strudel'),
                                '--output', 'silent', '--theme', 'rustel-dark', '--no-update-check',
                                '--remote-control=127.0.0.1:' + str(remote_port), '--auth-token', token,
                                '--allow-sample-origin', origin + '/'], cwd=str(scratch),
                               env=environment, dimensions=(36, 94))

    def drain():
        try:
            while process.isalive():
                terminal_tail.append(process.read(16384))
        except (EOFError, OSError):
            pass

    threading.Thread(target=drain, daemon=True).start()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            peer = socket.create_connection(('127.0.0.1', remote_port), timeout=2)
            break
        except OSError:
            if not process.isalive():
                raise RuntimeError('Desktop Studio exited during startup')
            time.sleep(.1)
    assert peer is not None, 'Desktop remote listener did not start'
    peer.settimeout(5)
    stream = peer.makefile('r', encoding='utf-8')

    def command(text):
        peer.sendall((text + '\n').encode())
        line = stream.readline(2 * 1024 * 1024)
        assert line, 'Remote peer closed'
        return line.rstrip('\n')

    assert command('auth ' + token) == 'ok'

    def screen():
        response = command('screen')
        assert response.startswith('screen ')
        return json.loads(response[7:])['text']

    def install(marker, endpoint):
        # Legacy Windows Console PTYs can translate pasted newlines into
        # key events. A single-line score keeps this network probe independent
        # of that terminal-input behavior.
        code = ('/* ' + marker + ' */ await initHydra({feedStrudel:1}); s0.initImage("' + origin + '/' + endpoint +
                '.png"); src(s0).out(); note("c3 e3 g3").s("sine").gain(.02)')
        assert command('key ctrl-a') == 'ok'
        screen()  # Flush the queued selection before the PTY paste.
        process.write('\x1b[200~' + code + '\x1b[201~')
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline and marker not in screen():
            time.sleep(.05)
        assert marker in screen(), 'Desktop editor did not receive the public score'
        assert command('key ctrl-s') == 'ok'

    log = config / 'sessions/studio.log'

    def wait_ready(offset):
        deadline = time.monotonic() + 22
        while time.monotonic() < deadline:
            if log.is_file() and 'image ready (8x8)' in log.read_bytes()[offset:].decode('utf-8', errors='replace'):
                return
            time.sleep(.05)
        raise RuntimeError('Desktop image-ready diagnostic did not arrive')

    install('QA_IMAGE_BASELINE', 'valid')
    wait_ready(0)
    install('QA_IMAGE_SLOW', 'slow')
    assert slow.wait(8), 'Desktop did not request the slow image'
    offset = log.stat().st_size
    began = time.monotonic()
    install('QA_IMAGE_RECOVERY', 'recovery')
    wait_ready(offset)
    elapsed = (time.monotonic() - began) * 1000
    result = dict(observationOnly=True, complete=True, platform='Windows Studio in PTY, silent output',
                  binarySha256=hashlib.sha256(args.binary.read_bytes()).hexdigest(),
                  fixtureSha256=hashlib.sha256(image).hexdigest(), baselineImageDecoded=True,
                  replacementImageDecoded=True, replacementImageReadyMilliseconds=elapsed,
                  promptRecoveryTargetMilliseconds=10000, promptRecoveryTargetMet=elapsed < 10000,
                  documentedImageFetchDeadlineMilliseconds=15000,
                  limits=['Observation of one blocked response-header request; not acoustic or GPU-pixel qualification.',
                          'Timing includes remote/editor input and log polling. Generated auth token and raw terminal output are private.'])
    (folder / 'desktop-image-recovery.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))
finally:
    if peer:
        peer.close()
    if stream:
        stream.close()
    if process:
        try:
            process.write('\x11\x11')
            time.sleep(.5)
            process.close(force=True)
        except (OSError, EOFError):
            pass
    finished.set()
    server.shutdown()
    server.server_close()
    (scratch / 'terminal-tail.private.txt').write_text(''.join(list(terminal_tail)), encoding='utf-8')
