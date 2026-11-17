"""Independently inspect the short WAV captured by record-take.cjs (requires numpy)."""
import argparse
import json
from pathlib import Path
import struct
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--results', required=True, type=Path)
folder = parser.parse_args().results
b = (folder / 'recorded-take.wav').read_bytes()
assert b[:4] == b'RIFF' and b[8:12] == b'WAVE' and len(b) == struct.unpack_from('<I', b, 4)[0] + 8
fmt = data = None
offset = 12
while offset + 8 <= len(b):
    kind, size = struct.unpack_from('<4sI', b, offset)
    body = b[offset + 8:offset + 8 + size]
    assert len(body) == size
    if kind == b'fmt ': fmt = struct.unpack_from('<HHIIHH', body)
    if kind == b'data': data = body
    offset += 8 + size + size % 2
assert fmt and data is not None
tag, channels, rate, byte_rate, align, bits = fmt
assert channels == 2 and rate == 48000 and align == channels * bits // 8 and byte_rate == rate * align
if tag == 1 and bits == 24:
    raw = np.frombuffer(data, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
    values = raw[:, 0] | raw[:, 1] << 8 | raw[:, 2] << 16
    samples = ((values ^ 0x800000) - 0x800000).astype(np.float64) / 8388608
elif tag == 1 and bits == 16:
    samples = np.frombuffer(data, dtype='<i2').astype(np.float64) / 32768
elif tag == 3 and bits == 32:
    samples = np.frombuffer(data, dtype='<f4').astype(np.float64)
else:
    raise AssertionError(('Unsupported take encoding', tag, bits))
assert np.isfinite(samples).all()
frames = len(samples) // channels
peak, rms = float(np.abs(samples).max()), float(np.sqrt(np.mean(samples * samples)))
assert 4 < frames / rate < 9 and 0 < rms < 1 and peak < 1
result = dict(formatTag=tag, bits=bits, channels=channels, sampleRate=rate,
              frames=frames, seconds=frames / rate, peak=peak, rms=rms, allFinite=True)
(folder / 'record-take-pcm.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result))
