"""Build a separate host consumer and dump the actual registry/reference names.

Use the root build prerequisites. Inherit the caller's Cargo/Rustup configuration
and optionally its existing target directory; no product source is modified.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tomllib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cargo', default='cargo')
parser.add_argument('--toolchain')
parser.add_argument('--target-dir')
parser.add_argument('--offline', action='store_true')
parser.add_argument('--output', type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
generated = repo/'android/qa/generated'
consumer = generated/'reference-inventory-consumer'
(consumer/'src').mkdir(parents=True, exist_ok=True)
shutil.copyfile(repo/'Cargo.lock', consumer/'Cargo.lock')
shutil.copyfile(repo/'android/qa/reference-inventory.rs', consumer/'src/main.rs')
manifest = '''[workspace]
[package]
name = "rustel-reference-inventory"
version = "0.0.0"
edition = "2024"
publish = false
[dependencies]
serde_json = "1"
'''
for name in ('studio', 'runtime'):
    manifest += f'rustel-{name} = {{ path = {json.dumps((repo/"crates"/name).as_posix())} }}\n'
for origin, entries in tomllib.loads((repo/'Cargo.toml').read_text())['patch'].items():
    manifest += '\n[patch.' + json.dumps(origin) + ']\n'
    for name, spec in entries.items():
        spec = dict(spec)
        if 'path' in spec:
            spec['path'] = (repo/spec['path']).as_posix()
        manifest += name+' = { '+', '.join(key+' = '+json.dumps(value) for key,value in spec.items())+' }\n'
(consumer/'Cargo.toml').write_text(manifest, encoding='utf-8')
env = os.environ.copy()
if args.target_dir:
    env['CARGO_TARGET_DIR'] = str(Path(args.target_dir).resolve())
command = [args.cargo]
if args.toolchain:
    command.append('+'+args.toolchain)
command += ['run', '--manifest-path', str(consumer/'Cargo.toml')]
if args.offline:
    command.append('--offline')
output = (args.output or generated/'reference-inventory.json').resolve()
output.parent.mkdir(parents=True, exist_ok=True)
with (generated/'reference-inventory-build.log').open('w') as log, output.open('w', encoding='utf-8') as stream:
    subprocess.run(command, env=env, stdout=stream, stderr=log, check=True)
value = json.loads(output.read_text(encoding='utf-8'))
assert value['schema'] == 1 and value['registeredNames']
print(json.dumps({'registeredNames': len(value['registeredNames']), 'documentedEntries': len(value['documentedEntries'])}))
