"""Bundle the current tracked source, including staged/uncommitted modifications."""
from pathlib import Path
import subprocess
import tarfile
import json

root = Path(__file__).resolve().parent.parent
destination = root / 'android/app/assets/rustel-android-source.tar.gz'
if (root/'.git').exists():
    files = [entry.decode('utf-8') for entry in subprocess.check_output(
        ['git', '-C', str(root), 'ls-files', '-z']).split(b'\0') if entry]
else:
    # Exported corresponding-source archives do not contain .git metadata.
    files = json.loads((root/'android/source-files.json').read_text(encoding='utf-8'))
executables = set(json.loads((root/'android/source-executables.json').read_text(encoding='utf-8')))
assert executables.issubset(files), 'Executable source path missing from the source allowlist'


def source_mode(info):
    relative = info.name.removeprefix('rustel-android/')
    info.mode = 0o755 if relative in executables else 0o644
    return info


with tarfile.open(destination, 'w:gz', compresslevel=6) as archive:
    for relative in files:
        path = root / relative
        assert path.resolve().is_relative_to(root), 'Source path escapes the repository'
        if path.is_file() and path != destination:
            archive.add(path, arcname='rustel-android/' + relative, recursive=False, filter=source_mode)
print(destination)
