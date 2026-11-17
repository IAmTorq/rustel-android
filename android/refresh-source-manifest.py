"""Refresh the source archive allowlist after staging reviewed source additions."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parent.parent
files = {entry.decode('utf-8') for entry in subprocess.check_output(
    ['git', '-C', str(root), 'ls-files', '-z']).split(b'\0') if entry}
files.update({'android/source-files.json', 'android/source-executables.json'})
destination = root/'android/source-files.json'
destination.write_text(json.dumps(sorted(files), indent=2)+'\n', encoding='utf-8', newline='\n')
print('Source archive allowlist:', len(files), 'files')

# Archive permissions must come from Git, not Windows filesystem attributes.
entries = subprocess.check_output(['git', '-C', str(root), 'ls-files', '--stage', '-z'])
executables = []
for entry in entries.split(b'\0'):
    if entry:
        metadata, path = entry.decode('utf-8').split('\t', 1)
        if metadata.split()[0] == '100755':
            executables.append(path)
(root/'android/source-executables.json').write_text(
    json.dumps(sorted(executables), indent=2)+'\n', encoding='utf-8', newline='\n')
print('Source executable allowlist:', len(executables), 'files')
