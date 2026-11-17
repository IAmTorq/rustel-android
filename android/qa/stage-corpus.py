"""Copy generated public cases into the isolated QA app without shell encoding changes."""
from pathlib import Path
import argparse
import hashlib
import os
import subprocess

root = Path(__file__).resolve().parent
adb = os.environ.get('ADB', 'adb')
parser = argparse.ArgumentParser()
parser.add_argument('--cases', type=Path, default=root / 'cases.json')
args = parser.parse_args()
cases = args.cases.read_bytes()
temporary = '/data/local/tmp/rustel-qa-cases.json'
subprocess.run([adb, 'push', str(args.cases), temporary], capture_output=True, check=True)
subprocess.run([adb, 'shell', 'chmod', '644', temporary], check=True)
subprocess.run([adb, 'shell', 'run-as', 'cc.rustel.qa', 'mkdir', '-p', 'files/qa-corpus'], check=True)
subprocess.run([adb, 'shell', 'run-as', 'cc.rustel.qa', 'cp', temporary, 'files/qa-corpus/cases.json'], check=True)
actual = subprocess.check_output([adb, 'shell', 'run-as', 'cc.rustel.qa',
    'sha256sum', 'files/qa-corpus/cases.json'], encoding='utf-8').split()[0]
assert actual == hashlib.sha256(cases).hexdigest(), 'Staged cases differ from the source'
print('Staged public cases in cc.rustel.qa; production data is untouched')
