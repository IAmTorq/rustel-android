"""Generate a bounded functional parity batch from attributed upstream examples."""
from pathlib import Path
import hashlib
import json

repo = Path(__file__).resolve().parents[2]
folder = Path(__file__).resolve().parent / 'generated'
folder.mkdir(exist_ok=True)
cases = []
for name in ['adsr', 'bpf', 'hpf', 'lpf', 'ftype', 'lpenv', 'phaser',
             'tremolodepth', 'distort', 'coarse', 'crush', 'compressor',
             'delay', 'room', 'pan', 'postgain', 'velocity', 'pattack']:
    relative = 'crates/runtime/tests/e2e/scores/docs/learn-effects/' + name + '.strudel'
    source = (repo / relative).read_text(encoding='utf-8')
    cases.append(dict(case='functional/effects/' + name, dur=4, source=source,
                      upstreamFixture=relative,
                      sourceSha256=hashlib.sha256(source.encode()).hexdigest()))
programs = {
    'nested-mini': 'note("[c3 [e3 g3]] <b3 ~>").s("sine").gain(.03)',
    'polymeter-mini': 'note("{c3 e3 g3}%8").s("triangle").gain(.03)',
    'repetition-rest-mini': 'note("<c3 e3>!2 [g3 ~]*2").s("sine").gain(.03)',
    'function-and-variable': 'const phrase = notes => note(notes).s("triangle").gain(.03); phrase("c3 e3 g3 b3").slow(2)',
    'loop-and-array': 'const layers = []; for (const [i, pitch] of ["c3","e3","g3"].entries()) layers.push(note(pitch).s("sine").gain(.02).pan(i/2)); stack(...layers)',
    'repeated-transform': 'let phrase = note("c3 e3 g3 b3"); for (let i=0;i<3;i++) phrase=phrase.add(2); phrase.s("triangle").gain(.03)',
    'filter-envelope-delay': 'note("c3 e3 g3 b3").s("sawtooth").gain(.03).lpf(800).lpenv(2).attack(.01).decay(.1).sustain(.3).release(.2).delay(.2).delaytime(.125).delayfeedback(.2)',
    'filter-distortion-room': 'note("c3 e3 g3 b3").s("triangle").gain(.03).hpf(200).distort(.2).room(.15).roomsize(2)',
}
for name, source in programs.items():
    source = '// Public functional regression\nsetCps(.5);\n' + source
    cases.append(dict(case='functional/constructs/' + name, dur=4, source=source,
                      sourceSha256=hashlib.sha256(source.encode()).hexdigest()))
(folder / 'functional-cases.json').write_text(json.dumps(cases, indent=2)+'\n', encoding='utf-8', newline='\n')
print('Generated', len(cases), 'public cases; generation is not a passing result')

# Asset/extension checks remain separate so unavailable assets cannot silently
# reduce the passing core-function batch.
asset_cases = []
for name in ['wavetable/wt', 'wavetable/warp', 'kabelsalat/nested-saw-feedback',
             'kabelsalat/modulated-saw-envelopes', 'temporal/repeatCycles']:
    relative = 'crates/runtime/tests/e2e/scores/docs/' + name + '.strudel'
    source = (repo / relative).read_text(encoding='utf-8')
    asset_cases.append(dict(case='functional/assets/' + name, dur=8, source=source,
                           upstreamFixture=relative,
                           sourceSha256=hashlib.sha256(source.encode()).hexdigest()))
(folder / 'asset-extension-cases.json').write_text(
    json.dumps(asset_cases, indent=2)+'\n', encoding='utf-8', newline='\n')
print('Generated', len(asset_cases), 'separate asset/extension cases')
