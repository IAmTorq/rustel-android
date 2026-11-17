"""Generate Android QA cases from the original public upstream score fixtures."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent
corpus = root.parents[1]/'crates/runtime/tests/e2e'
expected = []
for name in ('docs', 'probes', 'corpus'):
    for line in (corpus/'golden'/f'{name}.jsonl').read_text(encoding='utf-8').splitlines():
        if line.strip():
            expected.append(json.loads(line))
cases = []
for golden in expected:
    score = corpus/'scores'/(golden['case']+'.strudel')
    cases.append({'case':golden['case'], 'dur':golden['dur'],
                  'source':score.read_text(encoding='utf-8')})
(root/'cases.json').write_text(json.dumps(cases),encoding='utf-8')
(root/'goldens.json').write_text(json.dumps(expected),encoding='utf-8')
print('Prepared', len(cases), 'public score/golden pairs')
