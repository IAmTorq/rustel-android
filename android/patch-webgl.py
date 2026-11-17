"""Reproduce the vendored add-on patch from the exact original compiled file."""
from pathlib import Path
import hashlib
import json
import sys
import base64

root = Path(__file__).resolve().parent
patch = json.loads((root/'webgl.patch.json').read_text(encoding='utf-8'))
data = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(data).hexdigest() == patch['originalSha256'], 'Unexpected upstream asset'
for edit in reversed(patch['edits']):
    data = data[:edit['start']] + base64.b64decode(edit['insertBase64']) + data[edit['end']:]
assert hashlib.sha256(data).hexdigest() == patch['patchedSha256']
destination = root/'app/assets/addon-webgl.js'
destination.write_bytes(data)
print(destination, patch['patchedSha256'])
