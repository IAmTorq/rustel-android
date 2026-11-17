"""Inspect the fixed one-cycle score produced by export-audio.cjs.

This checks generated PCM and MIDI independently of Rustel's decoders. It is
not a general MIDI validator or an MP3 decoder.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import wave

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--results', required=True, type=Path)
args = parser.parse_args()
folder = args.results.resolve()
result = json.loads((folder / 'export-audio.json').read_text(encoding='utf-8'))
assert result['complete']
assert len(result['apkSha256']) == 64

with wave.open(str(folder / 'export-probe.wav'), 'rb') as wav:
    assert wav.getsampwidth() == 2 and wav.getcomptype() == 'NONE'
    samples = array.array('h', wav.readframes(wav.getnframes()))
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(abs(sample) for sample in samples) / 32768
    rms = math.sqrt(sum((sample / 32768) ** 2 for sample in samples) / len(samples))
    assert wav.getframerate() == 48000 and wav.getnchannels() == 2
    assert wav.getnframes() == 96000 and 0 < rms <= peak < 1
    assert math.isfinite(rms)
    result['wav'] = dict(sampleRate=wav.getframerate(), channels=wav.getnchannels(),
                         frames=wav.getnframes(), seconds=2, peak=peak, rms=rms)

data = (folder / 'export-probe.mid').read_bytes()
assert data[:8] == b'MThd\x00\x00\x00\x06'
kind, tracks, ppq = struct.unpack('>HHH', data[8:14])
assert kind == 1 and tracks == 2 and ppq == 480
position, notes, tempos = 14, [], []


def vlq(track, offset):
    value = 0
    for _ in range(4):
        byte = track[offset]
        offset += 1
        value = (value << 7) | (byte & 127)
        if byte < 128:
            return value, offset
    raise ValueError('Oversized MIDI variable-length quantity')


for _ in range(tracks):
    assert data[position:position + 4] == b'MTrk'
    size = struct.unpack('>I', data[position + 4:position + 8])[0]
    track = data[position + 8:position + 8 + size]
    assert len(track) == size
    position += 8 + size
    offset, tick, running, ended = 0, 0, None, False
    while offset < len(track):
        delta, offset = vlq(track, offset)
        tick += delta
        status = track[offset]
        if status >= 128:
            offset += 1
            running = status if status < 240 else None
        else:
            assert running is not None
            status = running
        if status == 255:
            meta = track[offset]
            length, offset = vlq(track, offset + 1)
            payload = track[offset:offset + length]
            assert len(payload) == length
            offset += length
            if meta == 81:
                assert length == 3
                tempos.append(int.from_bytes(payload, 'big'))
            if meta == 47:
                assert length == 0 and offset == len(track)
                ended = True
        elif 128 <= status < 240:
            length = 1 if status >> 4 in (12, 13) else 2
            payload = track[offset:offset + length]
            assert len(payload) == length and all(byte < 128 for byte in payload)
            offset += length
            if status >> 4 in (8, 9):
                on = status >> 4 == 9 and payload[1] > 0
                notes.append(dict(tick=tick, on=on, note=payload[0], velocity=payload[1], channel=status & 15))
        else:
            raise ValueError('Unexpected system event in fixed export fixture')
    assert ended
assert position == len(data) and tempos == [500000]
ons = [event for event in notes if event['on']]
offs = [event for event in notes if not event['on']]
assert [event['note'] for event in ons] == [48, 52, 55, 60]
assert [event['tick'] for event in ons] == [0, 480, 960, 1440]
assert [event['note'] for event in offs] == [48, 52, 55, 60]
assert [event['tick'] for event in offs] == [480, 960, 1440, 1920]
assert all(event['channel'] == 0 for event in notes)
result['midi'] = dict(format=kind, tracks=tracks, ppq=ppq, tempoMicroseconds=500000,
                      chunksComplete=True, events=notes, expectedPitchesAndTicks=True)
result['fileSha256'] = {suffix: hashlib.sha256((folder / ('export-probe.' + suffix)).read_bytes()).hexdigest()
                        for suffix in ('wav', 'mp3', 'mid')}
result['limits'].append('MIDI content checks cover only the fixed four-note, one-cycle fixture; MP3 decode and listening are separate.')
(folder / 'exports-inspected.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
