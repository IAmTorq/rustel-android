"""Generate reproducible native-synth pairs, load ramps and long arrangements.

Generated cases are inputs, never passing evidence. Compare desktop/Android
events and PCM separately, then exercise realtime cases on the actual device.
"""
import itertools
import json
from pathlib import Path
import random
import re

repo = Path(__file__).resolve().parents[2]
destination = Path(__file__).resolve().parent / 'generated'
destination.mkdir(exist_ok=True)
voice = (repo / 'crates/voice/src/lib.rs').read_text(encoding='utf-8')
match = re.search(r'pub const NATIVE_SYNTH_SOUNDS:.*?= &\[(.*?)\];', voice, re.S)
assert match, 'Native synth catalogue changed; inspect before generating cases'
instruments = re.findall(r'"([a-z_]+)"', match[1])
assert len(instruments) == len(set(instruments)) and len(instruments) >= 19


def voice_pattern(name, index, gain=0.035):
    notes = ('c3 e3 g3 b3', 'g3 b3 d4 f4')[index % 2]
    return (f'note("{notes}").s("{name}").gain({gain:.6f})'
            '.attack(.005).decay(.1).sustain(.3).release(.12)')


cases = []
for name in instruments:
    cases.append({'case': f'interactions/solo/{name}', 'dur': 4,
                  'source': 'setCps(.5);\n' + voice_pattern(name, 0),
                  'kind': 'solo', 'instruments': [name]})
for a, b in itertools.combinations(instruments, 2):
    for mode in ('separate', 'shared-effects', 'duck-and-delay', 'reverse-duck-and-delay'):
        left, right = voice_pattern(a, 0), voice_pattern(b, 1)
        if mode == 'separate':
            left += '.orbit(0)'
            right += '.orbit(1)'
        elif mode == 'shared-effects':
            left += '.orbit(0).room(.15).roomsize(2).delay(.125).delaytime(.25).delayfeedback(.2)'
            right += '.orbit(0).room(.15).roomsize(2).delay(.125).delaytime(.25).delayfeedback(.2)'
        elif mode == 'duck-and-delay':
            left += '.orbit(0).duck(1).duckattack(.02).duckdepth(.3)'
            right += '.orbit(1).lpf(1800).delay(.15).delaytime(.125).delayfeedback(.2)'
        else:
            left += '.orbit(1).lpf(1800).delay(.15).delaytime(.125).delayfeedback(.2)'
            right += '.orbit(0).duck(1).duckattack(.02).duckdepth(.3)'
        cases.append({'case': f'interactions/{mode}/{a}--{b}', 'dur': 4,
                      'source': f'setCps(.5);\nstack({left},\n{right})',
                      'kind': mode, 'instruments': [a, b]})
for count in (2, 4, 8, 16):
    layers = [voice_pattern(instruments[i % len(instruments)], i, .8 / count)
              + f'.orbit({i % 4}).lpf({900 + i * 50})' for i in range(count)]
    cases.append({'case': f'load/{count}-layers', 'dur': 8,
                  'source': 'setCps(.5);\nstack(\n' + ',\n'.join(layers) + ')',
                  'kind': 'load-ramp', 'layers': count})
    visuals = ('_scope', '_tscope', '_pianoroll', '_punchcard',
               '_wordfall', '_spiral', '_pitchwheel', '_spectrum')
    tracks = [f'$qa{i}: {layer}.{visuals[i % len(visuals)]}()'
              for i, layer in enumerate(layers)]
    cases.append({'case': f'load/{count}-layers-mixed-visuals', 'dur': 8,
                  'source': 'setCps(.5);\n' + '\n'.join(tracks),
                  'kind': 'visual-load-ramp', 'layers': count,
                  'visuals': list(visuals[:min(count, len(visuals))])})

# Each arrangement spans 2048 cycles at 0.5 cps: 4096 seconds (68 min 16 sec).
# Explicit varied sections exercise AST/query/editor growth, not just comments.
rng = random.Random(28017)
long_files = []
for sections in (32, 128, 256, 512):
    parts = []
    for section in range(sections):
        pitches = rng.sample(('c', 'd', 'e', 'g', 'a', 'b'), 4)
        bass = ' '.join(p + '2' for p in pitches)
        lead = ' '.join(p + '4' for p in reversed(pitches))
        bass_sound = ('sine', 'sawtooth', 'triangle', 'square')[section % 4]
        lead_sound = ('pulse', 'supersaw', 'sine')[section % 3]
        parts.append(
            f'  // Section {section + 1}: distinct notes, timbre, rhythm and filter\n'
            f'  [{2048 // sections}, stack(\n'
            f'    s("sbd!{2 + section % 3}").gain(.14).orbit(0).duck("1:2").duckdepth(.25),\n'
            f'    note("{bass}").s("{bass_sound}").gain(.045).euclid({3 + section % 3},8)'
            f'.lpf({250 + section % 7 * 70}).lpenv(2).release(.12).orbit(1),\n'
            f'    note("{lead}").s("{lead_sound}").gain(.025).slow(2)'
            f'.fm(.3).fmh({1 + section % 5 * .25}).release(.25).lpf(1800)'
            '.room(.12).roomsize(2).orbit(2),\n'
            f'    s("white!{4 + section % 5}").gain(.012).hpf(6500).decay(.025)'
            '.sustain(0).release(.01).orbit(3)\n'
            '  )]')
    source = '// Generated long-arrangement capacity fixture; not a composed release.\nsetCps(.5);\narrange(\n' + ',\n'.join(parts) + '\n)\n'
    filename = f'long-{sections}-sections.strudel'
    (destination / filename).write_text(source, encoding='utf-8', newline='\n')
    long_files.append({'file': filename, 'sections': sections, 'cycles': 2048,
                       'durationSeconds': 4096, 'bytes': len(source.encode('utf-8')),
                       'lines': len(source.splitlines()), 'status': 'not-run'})

controls = []
for path in sorted((repo / 'crates/core/src/control_catalog').glob('*.rs')):
    for names, aliases in re.findall(r'ControlRow\s*\{\s*names:\s*&\[(.*?)\],\s*aliases:\s*&\[(.*?)\]', path.read_text(encoding='utf-8'), re.S):
        values = re.findall(r'"([^"]+)"', names)
        if values:
            controls.append({'name': values[0], 'aliases': re.findall(r'"([^"]+)"', aliases),
                             'catalogue': path.relative_to(repo).as_posix(), 'status': 'not-mapped'})
inventory = {'nativeInstruments': instruments, 'unorderedPairs': len(list(itertools.combinations(instruments, 2))),
             'pairModes': ['separate', 'shared-effects', 'duck-and-delay', 'reverse-duck-and-delay'],
             'caseCount': len(cases), 'controls': controls, 'longArrangements': long_files,
             'limitations': ['Generated inputs are not test results.',
                            'Control inventory is static metadata, not the entire runtime function surface.',
                            'Sample instruments, fonts, wavetables, bus/input and extensions need separate inventories.',
                            'No exhaustive claim about arbitrary higher-order combinations.']}
(destination / 'interaction-cases.json').write_text(json.dumps(cases, indent=2), encoding='utf-8', newline='\n')
(destination / 'coverage-inventory.json').write_text(json.dumps(inventory, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({k: inventory[k] for k in ('caseCount', 'unorderedPairs', 'longArrangements')}))
