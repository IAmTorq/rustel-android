"""Generate one large score for live comment/uncomment device checks."""
import json
from pathlib import Path

destination = Path(__file__).resolve().parent / 'generated'
destination.mkdir(exist_ok=True)
sounds = ('sine', 'triangle', 'square', 'sawtooth', 'supersaw', 'pulse',
          'sbd', 'white', 'pink', 'brown', 'crackle', 'bytebeat', 'zzfx',
          'z_sine', 'z_sawtooth', 'z_triangle')
visuals = ('_scope', '_tscope', '_pianoroll', '_punchcard',
           '_wordfall', '_spiral', '_pitchwheel', '_spectrum')
lines = ['// Public fixture: one score, at most 16 enabled tracks.', 'setCps(.5);', '']
blocks = []
for section in range(33):
    for track, sound in enumerate(sounds):
        first = len(lines)
        notes = ('c3 e3 g3 b3', 'g3 b3 d4 f4', 'a3 c4 e4 g4')[(section + track) % 3]
        part = [f'$qa{section:02}_{track:02}: note("{notes}").s("{sound}")',
                '  .gain(.05).attack(.005).decay(.1).sustain(.3).release(.12)',
                f'  .orbit({track % 4}).lpf({900 + (section + track) % 16 * 50})',
                f'  .{visuals[track % len(visuals)]}()']
        lines.extend(part if section == 0 else ['// ' + line for line in part])
        blocks.append({'section': section, 'track': track, 'start': first, 'count': len(part)})
    lines.append('')
source = '\n'.join(lines) + '\n'
(destination / 'live-editing.strudel').write_text(source, encoding='utf-8', newline='\n')
metadata = {'file': 'live-editing.strudel', 'tracksPerSection': 16,
            'preparedSections': 33, 'lines': len(source.split('\n')),
            'bytes': len(source.encode('utf-8')), 'blocks': blocks,
            'limitations': ['Prepared variations are not an automatic hour-long arrangement.',
                            'Generated inputs are not passing device evidence.']}
(destination / 'live-editing.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8', newline='\n')
print(json.dumps({k: v for k, v in metadata.items() if k != 'blocks'}))
