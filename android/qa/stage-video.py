"""Stage tiny upstream video fixtures in the isolated QA set, never production."""
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess

adb = os.environ.get('ADB', 'adb')
root = Path(__file__).resolve().parents[2]
prefs = json.loads(subprocess.check_output([adb, 'shell', 'run-as', 'cc.rustel.qa',
    'cat', 'files/config/studio.json'], encoding='utf-8'))
set_path = prefs['last_set']
assert re.fullmatch(r'/data/user/0/cc\.rustel\.qa/files/config/sets/[A-Za-z0-9_-]+', set_path), 'Use an isolated QA set with a simple name'
fixtures = [('vp8', 'tiny_video_vp8.webm'), ('vp9', 'tiny_ramp_vp9.webm'),
            ('h264', 'tiny_ramp_h264.mp4'), ('hevc', 'tiny_ramp_hevc.mp4'),
            ('av1', 'tiny_ramp_av1.webm'), ('av1_10bit', 'tiny_ramp_av1_10bit.webm'),
            ('mjpeg', 'tiny_video_mjpeg.mov'), ('h264_audio', 'tiny_video.mp4')]
for codec, name in fixtures:
    source = root / 'crates/runtime/src' / ('samples/testdata' if codec == 'h264_audio' else 'video/testdata') / name
    data = source.read_bytes()
    destination = set_path + '/qa_' + codec + Path(name).suffix
    temporary = '/data/local/tmp/rustel-qa-' + codec + Path(name).suffix
    subprocess.run([adb, 'push', str(source), temporary], capture_output=True, check=True)
    subprocess.run([adb, 'shell', 'chmod', '644', temporary], check=True)
    subprocess.run([adb, 'shell', 'run-as', 'cc.rustel.qa', 'cp', temporary, destination], check=True)
    actual = subprocess.check_output([adb, 'shell', 'run-as', 'cc.rustel.qa',
        'sha256sum', destination], encoding='utf-8').split()[0]
    assert actual == hashlib.sha256(data).hexdigest(), 'Staged fixture bytes differ'
    print(json.dumps({'codec': codec, 'bytes': len(data), 'status': 'staged-not-tested'}))
