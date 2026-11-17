"""Check generated live edits against desktop event queries, without audio output."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--binary', default='rustel')
args = parser.parse_args()
folder = Path(__file__).resolve().parent / 'generated'
metadata = json.loads((folder / 'live-editing.json').read_text(encoding='utf-8'))
lines = (folder / metadata['file']).read_text(encoding='utf-8').split('\n')
first = metadata['blocks'][0]['start']
alternative = next(b['start'] for b in metadata['blocks'] if b['section'] == 32 and b['track'] == 0)
steps = [('initial', None, 0, 16), ('single-off', first, 4, 15),
         ('single-on', first, 4, 16), ('group-eight-off', first, 32, 8),
         ('group-eight-on', first, 32, 16), ('original-eight-off', first, 32, 8),
         ('alternative-eight-on', alternative, 32, 16),
         ('alternative-eight-off', alternative, 32, 8),
         ('original-eight-on', first, 32, 16), ('repeat-off', first, 32, 8),
         ('repeat-on', first, 32, 16)]
results = []
for name, start, count, tracks in steps:
    if start is not None:
        selected = lines[start:start + count]
        commented = all(s.startswith('// ') for s in selected)
        lines[start:start + count] = [s[3:] if commented else '// ' + s for s in selected]
    source = '\n'.join(lines)
    score = folder / 'reference-edit.strudel'
    score.write_text(source, encoding='utf-8', newline='\n')
    process = subprocess.run([args.binary, 'query', str(score), '--begin', '0', '--end', '1',
        '--json', '--no-input', '--no-update-check', '--quiet'],
        capture_output=True, encoding='utf-8', timeout=30)
    if process.returncode:
        raise RuntimeError(process.stderr[-2000:])
    haps = json.loads(process.stdout)['haps']
    assert len(haps) == tracks * 4, (name, len(haps), tracks)
    sounds = {hap['value']['s'] for hap in haps}
    assert len(sounds) == tracks, (name, sounds)
    result = {'name': name, 'tracks': tracks, 'events': len(haps),
              'sourceRevision': hashlib.sha256(source.encode('utf-8')).hexdigest(),
              'status': 'desktop-query-passed'}
    results.append(result)
    print(json.dumps(result), flush=True)
(folder / 'live-editing-reference-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
