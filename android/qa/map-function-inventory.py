"""Map host registry/reference names to candidate public corpus/test files.

Text matches are investigation leads, never executed coverage or passing cases.
Run the standalone reference-inventory.rs consumer first, then pass its JSON
and an output JSON filename. No personal projects or device logs are read.
"""
import hashlib
import argparse
import json
from pathlib import Path
import re

repo = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input_path', type=Path)
parser.add_argument('output_path', type=Path)
parser.add_argument('--actions-json', type=Path)
parser.add_argument('--apk-sha256')
args = parser.parse_args()
input_path, output_path = args.input_path, args.output_path
if args.actions_json and not re.fullmatch('[a-f0-9]{64}', args.apk_sha256 or ''):
    parser.error('--actions-json requires --apk-sha256')
source = json.loads(input_path.read_text(encoding='utf-8'))
assert source['schema'] == 1
registered = set(source['registeredNames'])
assert len(registered) == len(source['registeredNames'])
entries = {}
for entry in source['documentedEntries']:
    for name in [entry['name'], *entry['synonyms']]:
        entries.setdefault(name, []).append(entry)
names = registered | entries.keys()
mentions = {name: {'corpus': [], 'test': []} for name in names}
calls = re.compile(r'(?<![\w$])([A-Za-z_$][\w$]*)\s*\(')
files = {'corpus': sorted((repo/'crates/runtime/tests/e2e/scores').rglob('*.strudel')),
         'test': sorted((repo/'crates').rglob('*.rs'))}
for kind, paths in files.items():
    for path in paths:
        text = path.read_text(encoding='utf-8')
        if kind == 'test' and '/tests/' not in path.as_posix() and '#[test]' not in text:
            continue
        for name in set(calls.findall(text)) & names:
            mentions[name][kind].append(path.relative_to(repo).as_posix())
rows = []
for name in sorted(names):
    documented = entries.get(name, [])
    rows.append({'name': name, 'registeredInHost': name in registered,
                 'rowKind': 'host-registered-name' if name in registered else 'reference-name-or-synonym',
                 'documentedUnder': sorted({e['name'] for e in documented}),
                 'tags': sorted({tag for e in documented for tag in e['tags']}),
                 'candidateCorpusFiles': mentions[name]['corpus'],
                 'candidateTestFiles': mentions[name]['test'],
                 'validCase': 'UNASSESSED', 'invalidCase': 'UNASSESSED',
                 'boundaryCase': 'UNASSESSED', 'combinationCase': 'UNASSESSED',
                 'deviceQualification': 'UNASSESSED'})
result = {'schema': 1, 'hostProfile': source['profile'],
          'registryInputSha256': hashlib.sha256(input_path.read_bytes()).hexdigest(),
          'registeredNames': len(registered), 'documentedEntries': len(source['documentedEntries']),
          'inventoryRows': len(rows), 'corpusFilesScanned': len(files['corpus']),
          'registeredWithCorpusTextCandidates': sum(bool(mentions[n]['corpus']) for n in registered),
          'registeredWithoutCorpusTextCandidates': sum(not mentions[n]['corpus'] for n in registered),
          'limits': ['Host registry/reference inventory; Android availability must be verified separately.',
                     'Reference-only names can include chords, scales, sounds or topics; they are not all callable functions.',
                     'Textual call matches can include comments, strings, unrelated methods or inactive code.',
                     'Candidate test files may contain production functions beside unit tests.',
                     'A mention does not prove execution, success, argument coverage or correct audio.',
                     'All valid/invalid/boundary/combination/device qualification remains explicitly UNASSESSED.'],
          'referenceMetadata': source['documentedEntries'],
          'functions': rows}
if args.actions_json:
    actions = json.loads(args.actions_json.read_text(encoding='utf-8-sig'))
    assert len(actions) == len(set(actions)) and all(re.fullmatch('[a-z0-9-]+', key) for key in actions)
    result['androidActionInventory'] = {
        'apkSha256': args.apk_sha256,
        'scope': 'Native action catalog only; Java-only buttons and gestures require separate tests.',
        'actions': [{'key': key, 'qualification': 'UNASSESSED'} for key in sorted(actions)]}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ('functions','limits','androidActionInventory','referenceMetadata')}))
