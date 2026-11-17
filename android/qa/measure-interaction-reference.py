"""Measure generated public mixes with desktop CLI queries and float-WAV export.

Requires numpy. Each worker reuses one bounded scratch WAV; no sample archive
is retained. This measures offline behavior, not realtime device headroom.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import threading
import time

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--binary', default='rustel')
parser.add_argument('--jobs', type=int, default=2)
parser.add_argument('--limit', type=int)
parser.add_argument('--cases', type=Path, help='Alternate public case list')
parser.add_argument('--output', type=Path, help='Private result JSON destination')
args = parser.parse_args()
folder = Path(__file__).resolve().parent / 'generated'
cases = json.loads((args.cases or folder / 'interaction-cases.json').read_text(encoding='utf-8'))
output = args.output or folder / 'interaction-reference-results.json'
output.parent.mkdir(parents=True, exist_ok=True)
if args.limit:
    cases = cases[:args.limit]


def measure(case):
    scratch = folder / ('reference-' + str(threading.get_ident()))
    scratch.mkdir(exist_ok=True)
    score, wave = scratch / 'score.strudel', scratch / 'audio.wav'
    score.write_text(case['source'], encoding='utf-8', newline='\n')
    common = ['--no-input', '--no-update-check', '--quiet']
    begin = time.perf_counter()
    query = subprocess.run([args.binary, 'query', str(score), '--begin', '0', '--end', '4',
        '--json', *common], capture_output=True, encoding='utf-8', timeout=30)
    if query.returncode:
        return {'case': case['case'], 'status': 'failed-query', 'error': query.stderr[-2000:]}
    haps = json.loads(query.stdout)['haps']
    render = subprocess.run([args.binary, 'render', str(score), '--duration', str(case['dur']),
        '--sample-rate', '48000', '--format', 'scalar-f32', '--output', str(wave), *common],
        capture_output=True, encoding='utf-8', timeout=60)
    if render.returncode:
        return {'case': case['case'], 'status': 'failed-render', 'error': render.stderr[-2000:]}
    data = wave.read_bytes()
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    offset, channels, pcm = 12, None, None
    while offset + 8 <= len(data):
        kind, length = struct.unpack_from('<4sI', data, offset)
        payload = data[offset + 8:offset + 8 + length]
        if kind == b'fmt ':
            format_id, channels, rate, _, _, bits = struct.unpack_from('<HHIIHH', payload)
            assert format_id == 3 and bits == 32 and rate == 48000, (format_id, bits, rate)
        elif kind == b'data':
            pcm = np.frombuffer(payload, dtype='<f4')
        offset += 8 + length + length % 2
    assert channels and pcm is not None and np.isfinite(pcm).all()
    audible = np.flatnonzero(np.abs(pcm) >= 1e-7) // channels
    # Rust f32::round rounds halfway away from zero. Keep the multiply in f32.
    scaled = pcm * np.float32(64)
    quantized = (np.sign(scaled) * np.floor(np.abs(scaled.astype(np.float64)) + .5)).astype('<i4')
    return {'case': case['case'], 'status': 'measured', 'dur': case['dur'],
            'haps': len(haps), 'ctx': sum(len(hap['context']) for hap in haps),
            'frames': len(pcm) // channels, 'peak': float(np.abs(pcm).max(initial=0)),
            'rms': float(np.sqrt(np.mean(pcm.astype(np.float64) ** 2))),
            'audible': [int(audible[0]), int(audible[-1])] if len(audible) else None,
            'audio_sha256': hashlib.sha256(quantized.tobytes()).hexdigest(),
            'elapsedSeconds': time.perf_counter() - begin}


results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(4, args.jobs))) as pool:
    for result in pool.map(measure, cases):
        results.append(result)
        output.write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps({k: result[k] for k in ('case', 'status')}), flush=True)
