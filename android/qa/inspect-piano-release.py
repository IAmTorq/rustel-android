"""Inspect the fixed event sequence captured by piano-release.cjs (numpy required)."""
import argparse
import json
from pathlib import Path
import struct
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--results', required=True, type=Path)
folder = parser.parse_args().results
b = (folder / 'piano-release.wav').read_bytes()
assert b[:4] == b'RIFF' and b[8:12] == b'WAVE'
offset = 12
fmt = data = None
while offset + 8 <= len(b):
    kind, size = struct.unpack_from('<4sI', b, offset)
    if kind == b'fmt ': fmt = struct.unpack_from('<HHIIHH', b, offset + 8)
    if kind == b'data': data = b[offset + 8:offset + 8 + size]
    offset += 8 + size + size % 2
assert fmt and data is not None and fmt[0] == 1 and fmt[1] == 2 and fmt[2] == 48000 and fmt[5] == 24
raw = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
values = raw[:, 0] | raw[:, 1] << 8 | raw[:, 2] << 16
samples = (((values ^ 0x800000) - 0x800000) / 8388608.).reshape(-1, 2)
assert np.isfinite(samples).all()
active = np.flatnonzero(np.abs(samples).max(axis=1) > 1e-5)
assert len(active)
peak = lambda a: float(np.abs(a).max())
result = dict(seconds=len(samples)/48000, peak=peak(samples),
              tailSecondPeak=peak(samples[-48000:]), lastAudibleSeconds=int(active[-1])/48000,
              keyUpGapPeak=peak(samples[72000:91200]), heldPastTimedFallbackPeak=peak(samples[134400:148800]), allFinite=True)
assert 6 < result['seconds'] < 12 and 0 < result['peak'] < 1
assert result['tailSecondPeak'] < 1e-6 and result['keyUpGapPeak'] < 1e-6
assert result['heldPastTimedFallbackPeak'] > 1e-5 and result['lastAudibleSeconds'] < result['seconds'] - 2
(folder / 'piano-release-pcm.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result))
