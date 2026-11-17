"""Generate public display workloads without changing the instrument-count limit."""
from pathlib import Path
import hashlib
import json
import re

destination = Path(__file__).resolve().parent / 'generated'
cases_path = destination / 'interaction-cases.json'
if not cases_path.exists():
    raise SystemExit('Run generate-interaction-cases.py first.')
cases = json.loads(cases_path.read_text(encoding='utf-8'))
baseline = '''// Public reproducible 60-fps playback baseline.
setCps(.5);
$: note("c3 e3 g3 b3").s("triangle").gain(.05)._pianoroll()
$: s("sbd!2").gain(.08)
$: s("white!4").hpf(6000).decay(.03).sustain(0).gain(.02)
'''
workloads = [('fps-three-parts.strudel', baseline, 3, 1)]
for count in (8, 16):
    source = next(case['source'] for case in cases
                  if case['case'] == f'load/{count}-layers-mixed-visuals')
    source = re.sub(r'\.gain\([0-9.]+\)', '.gain(0.025)', source)
    workloads.append((f'fps-{count}-parts.strudel', source+'\n', count, count))
    lines = source.splitlines()
    for index, line in enumerate(lines):
        if index > 2:
            lines[index] = re.sub(
                r'\._(?:scope|tscope|pianoroll|punchcard|wordfall|spiral|pitchwheel|spectrum)\(\)',
                '', line)
    workloads.append((f'fps-{count}-parts-two-visuals.strudel', '\n'.join(lines)+'\n', count, 2))
metadata = []
for filename, source, parts, visuals in workloads:
    (destination/filename).write_text(source, encoding='utf-8', newline='\n')
    metadata.append({'file': filename, 'parts': parts, 'inlineVisualizers': visuals,
                     'sha256': hashlib.sha256(source.encode()).hexdigest()})
(destination/'fps-cases.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print(json.dumps(metadata))
