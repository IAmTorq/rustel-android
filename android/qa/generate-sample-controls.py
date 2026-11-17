"""Generate representative sample-control cases for host/device comparisons."""
import json
from pathlib import Path

base = 's("bd!4")'
controls = [
    ('baseline', ''),
    ('half-speed', '.speed(.5)'),
    ('double-speed', '.speed(2)'),
    ('reverse', '.speed(-1)'),
    ('zero-speed', '.speed(0)'),
    ('full-range', '.begin(0).end(1)'),
    ('middle-range', '.begin(.25).end(.75)'),
    ('empty-range', '.begin(1).end(1)'),
    ('reversed-range', '.begin(.75).end(.25)'),
    ('chop', '.chop(4)'),
    ('slice', '.slice(4,"0 1 2 3")'),
    ('striate', '.striate(4)'),
    ('loop', '.loop(1).legato(4)'),
    ('fit-two-cycles', '.loopAt(2)'),
    ('patterned-speed', '.speed(".5 1 2 -1")'),
    ('sliced-reverse-envelope', '.slice(4,"0 3 1 2").speed(-1).attack(.005).release(.1)'),
    ('chopped-filter', '.chop(4).lpf(1200).hpf(80)'),
    ('sample-pair', None),
]
cases = []
for name, control in controls:
    body = (base + control + '.gain(.1)' if control is not None else
            'stack(s("bd!4").speed(.5).pan(.2).gain(.08),'
            's("sd!4").slice(4,"0 1 2 3").pan(.8).gain(.08))')
    cases.append({'case': 'sample-control-' + name, 'dur': 4,
                  'source': '// Public sample-control regression\nsetCps(.5);\n' + body})
folder = Path(__file__).resolve().parent / 'generated'
folder.mkdir(exist_ok=True)
(folder / 'sample-control-cases.json').write_text(json.dumps(cases, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'cases': len(cases), 'secondsPerOfflineRender': 4,
                  'limits': 'Generated inputs are not results; use actual PC/device references.'}))
