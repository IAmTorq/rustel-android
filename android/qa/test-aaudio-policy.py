"""Run the Android output-policy boundary tests without an Android device."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = root / 'android-native/vendor/cpal/src/host/aaudio/output_policy.rs'
with tempfile.TemporaryDirectory(prefix='rustel-aaudio-policy-') as folder:
    executable = Path(folder) / ('policy.exe' if os.name == 'nt' else 'policy')
    subprocess.run([os.environ.get('RUSTC', 'rustc'), '--edition=2021', '--test',
                    str(source), '-o', str(executable)], check=True)
    subprocess.run([str(executable)], check=True)
