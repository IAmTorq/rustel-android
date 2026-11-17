"""Check tracked Android additions for private artifacts before publication.

Also preserve the executable modes required by the vendored Unix encoder build.
This is a focused guard, not a general-purpose secret scanner. Review the diff.
"""
from pathlib import Path
import re
import json
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
files = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).split(b'\0')
problems = []
private_parts = {'signing', 'screens', 'host-config', 'pc-reference', 'node_modules'}
private_suffixes = {'.jks', '.keystore', '.p12', '.apk', '.idsig', '.zip'}
for raw in files:
    if not raw:
        continue
    relative = raw.decode('utf-8')
    if not relative.startswith(('android/', 'android-native/')):
        continue
    path = root / relative
    parts = set(Path(relative).parts)
    if parts & private_parts or path.suffix.lower() in private_suffixes:
        problems.append(relative + ': private/build artifact')
    if relative.startswith('android/app/assets/themes/') or path.name == 'rustel-android-source.tar.gz':
        problems.append(relative + ': personal overlay or recursive source bundle')
    if path.is_file() and path.suffix.lower() in {'.py', '.ps1', '.java', '.rs', '.cjs', '.json'}:
        content = path.read_text(encoding='utf-8', errors='replace')
        if re.search(r'C:[/\\]Users[/\\]', content):
            problems.append(relative + ': machine-specific user path')
        if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content):
            problems.append(relative + ': private key')
        if re.search(r'gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}', content):
            problems.append(relative + ': GitHub credential')
# Windows imports can silently lose executable bits. Autotools invokes
# configure directly; its helper scripts also need their upstream modes.
encoder_scripts = {'configure', 'config.guess', 'config.sub', 'install-sh',
                   'missing', 'depcomp', 'ltmain.sh'}
prefix = 'android-native/vendor/mp3lame-sys/lame-3.100/'
entries = subprocess.check_output(['git', '-C', str(root), 'ls-files', '--stage', '-z',
                                   '--', prefix]).split(b'\0')
modes = {}
for entry in entries:
    if entry:
        metadata, relative = entry.decode('utf-8').split('\t', 1)
        modes[relative] = metadata.split()[0]
for name in sorted(encoder_scripts):
    relative = prefix + name
    if modes.get(relative) != '100755':
        problems.append(relative + ': expected tracked executable mode 100755')
executable_manifest = root/'android/source-executables.json'
if executable_manifest.is_file():
    recorded = set(json.loads(executable_manifest.read_text(encoding='utf-8')))
    indexed = subprocess.check_output(['git', '-C', str(root), 'ls-files', '--stage', '-z'])
    expected = set()
    for entry in indexed.split(b'\0'):
        if entry:
            metadata, relative = entry.decode('utf-8').split('\t', 1)
            if metadata.split()[0] == '100755':
                expected.add(relative)
    if recorded != expected:
        problems.append('android/source-executables.json: stale executable allowlist')
else:
    problems.append('android/source-executables.json: missing executable allowlist')
if problems:
    print('\n'.join(problems))
    sys.exit(1)
print('PASS: tracked Android files contain no prohibited artifacts or recognized credentials; encoder script modes are intact')
