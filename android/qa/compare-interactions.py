"""Compare completed QA interaction renders with desktop float-WAV measurements."""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from corpus_contract import validate

folder = Path(__file__).resolve().parent / 'generated'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference', type=Path, default=folder / 'interaction-reference-results.json')
parser.add_argument('--actual', type=Path, help='Previously captured private device JSONL')
parser.add_argument('--output', type=Path, default=folder / 'interaction-comparison.json')
args = parser.parse_args()
adb = os.environ.get('ADB', 'adb')
raw = args.actual.read_bytes() if args.actual else subprocess.check_output(
    [adb, 'shell', 'run-as', 'cc.rustel.qa', 'cat', 'files/qa-corpus/results.jsonl'])
actual = [json.loads(line) for line in raw.decode('utf-8').splitlines() if line.strip()]
references = json.loads(args.reference.read_text(encoding='utf-8'))
expected = {row['case']: row for row in references}
if not expected or len(expected) != len(references):
    raise SystemExit('Reference cases must be nonempty and uniquely named')
validate(actual, expected)
issues, exact, passed = [], 0, 0
for row in actual:
    reference = expected.get(row['case'])
    if not reference or row['status'] != 'measured' or reference['status'] != 'measured':
        issues.append({'case': row['case'], 'reason': 'missing reference or failed measurement', 'actualStatus': row['status']})
        continue
    different = [field for field in ('haps', 'ctx', 'frames') if row[field] != reference[field]]
    if row['audio_sha256'] == reference['audio_sha256']:
        exact += 1
    for field in ('peak', 'rms'):
        a, b = row[field], reference[field]
        if not math.isfinite(a) or not math.isfinite(b) or abs(a - b) > .001 * max(abs(a), abs(b), 1e-9):
            different.append(field)
    a, b = row['audible'], reference['audible']
    if (a is None) != (b is None) or (a and b and any(abs(x - y) > 128 for x, y in zip(a, b))):
        different.append('audible')
    if different:
        issues.append({'case': row['case'], 'differences': different, 'actual': row, 'expected': reference})
    else:
        passed += 1
names = [r['case'] for r in actual]
complete = len(names) == len(expected) and len(set(names)) == len(expected) and set(names) == set(expected)
report = {'completed': len(actual), 'expected': len(expected), 'complete': complete,
          'passed': passed, 'exactAudioHashMatches': exact, 'issues': issues,
          'method': 'Exact hap count, context count and frame count. Quantized float-PCM hash plus upstream 0.1% peak/RMS and 128 audible-frame bounds for every case.',
          'limitations': ['Offline render comparison, not realtime speaker testing.',
                          'Hap hashes are not compared by this CLI-based reference.',
                          'Generated native pairs do not cover sample banks, hardware input or every higher-order combination.']}
args.output.parent.mkdir(parents=True, exist_ok=True)
capture = (folder / 'interaction-device-results.jsonl' if args.output == folder / 'interaction-comparison.json'
           else args.output.with_name(args.output.stem + '-device.jsonl'))
capture.write_bytes(raw)
args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'issues'}))
print(json.dumps({'firstIssues': issues[:3]}))
sys.exit(0 if complete and not issues else 1)
