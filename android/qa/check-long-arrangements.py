"""Check early/late and boundary queries without playing an hour of music."""
import argparse
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--binary', default='rustel')
args = parser.parse_args()
root = Path(__file__).resolve().parent
folder = root / 'generated'
inventory = json.loads((folder / 'coverage-inventory.json').read_text(encoding='utf-8'))
results = []
for item in inventory['longArrangements']:
    path = folder / item['file']
    boundary = 2048 // item['sections']
    windows = sorted({0, boundary - 1, boundary, 511, 1023, 1024, 1535, 2047})
    for begin in windows:
        started = time.perf_counter()
        process = subprocess.run([args.binary, 'query', str(path), '--begin', str(begin),
            '--end', str(begin + 1), '--json', '--no-input', '--no-update-check', '--quiet'],
            capture_output=True, encoding='utf-8', timeout=30)
        elapsed = time.perf_counter() - started
        if process.returncode:
            raise RuntimeError(f'{path.name} at {begin}: {process.stderr[-2000:]}')
        data = json.loads(process.stdout)
        assert data['haps'], f'No events at {begin} in {path.name}'
        result = {'file': path.name, 'sections': item['sections'], 'begin': begin,
                  'end': begin + 1, 'haps': len(data['haps']), 'elapsedSeconds': elapsed,
                  'status': 'passed', 'platform': 'desktop reference'}
        results.append(result)
        (folder / 'long-reference-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps(result), flush=True)
