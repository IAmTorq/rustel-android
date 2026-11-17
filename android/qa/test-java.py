"""Run Android-independent Java contracts with a JDK, without an emulator."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

android = Path(__file__).resolve().parents[1]
java_home = os.environ.get('JAVA_HOME')
tools = Path(java_home) / 'bin' if java_home else None
suffix = '.exe' if os.name == 'nt' else ''


def executable(name):
    candidate = tools / (name + suffix) if tools else None
    found = str(candidate) if candidate and candidate.is_file() else shutil.which(name)
    if not found:
        raise SystemExit(f'{name} not found: set JAVA_HOME to a JDK or add its bin to PATH')
    return found


classes = ['CameraFrames', 'TerminalFrameBatcher', 'PatternImport']
sources = []
for name in classes:
    sources.extend([
        android / 'app/src/cc/rustel/android' / f'{name}.java',
        android / 'qa' / f'{name}Test.java',
    ])
with tempfile.TemporaryDirectory(prefix='rustel-java-check-') as output:
    subprocess.run([executable('javac'), '-encoding', 'UTF-8', '-d', output,
                    *map(str, sources)], check=True)
    for name in classes:
        subprocess.run([executable('java'), '-cp', output,
                        f'cc.rustel.android.{name}Test'], check=True)
