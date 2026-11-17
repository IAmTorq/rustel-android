"""Check corresponding-source permissions independently of host file modes."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

PREPARE = Path(__file__).resolve().parents[1] / 'prepare-source.py'


class SourceArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'android/app/assets').mkdir(parents=True)
        shutil.copyfile(PREPARE, self.root / 'android/prepare-source.py')
        self.files = ['configure', 'notes.txt', 'android/source-files.json',
                      'android/source-executables.json']
        (self.root / 'configure').write_bytes(b'#!/bin/sh\nexit 0\n')
        (self.root / 'configure').chmod(0o644)
        (self.root / 'notes.txt').write_bytes(b'plain source\n')
        (self.root / 'notes.txt').chmod(0o755)
        self.manifest('source-files.json', self.files)
        self.manifest('source-executables.json', ['configure'])

    def manifest(self, name, value):
        (self.root / 'android' / name).write_text(json.dumps(value), encoding='utf-8')

    def prepare(self):
        return subprocess.run([sys.executable, str(self.root / 'android/prepare-source.py')],
                              capture_output=True, text=True)

    def assert_archive(self):
        with tarfile.open(self.root / 'android/app/assets/rustel-android-source.tar.gz') as archive:
            self.assertEqual(sorted(member.name for member in archive),
                             sorted('rustel-android/' + name for name in self.files))
            self.assertEqual(archive.getmember('rustel-android/configure').mode, 0o755)
            self.assertEqual(archive.getmember('rustel-android/notes.txt').mode, 0o644)
            self.assertEqual(archive.extractfile('rustel-android/configure').read(),
                             (self.root / 'configure').read_bytes())

    def test_exported_source_uses_recorded_modes(self):
        result = self.prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_archive()
        # Repacking a source export must retain modes even without Git metadata.
        self.assertEqual(self.prepare().returncode, 0)
        self.assert_archive()

    def test_git_checkout_uses_allowlisted_tracked_files(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), 'add', *self.files], check=True)
        (self.root / 'untracked.private.txt').write_text('private', encoding='utf-8')
        result = self.prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_archive()

    def test_rejects_executable_outside_source_allowlist(self):
        self.manifest('source-executables.json', ['../outside.sh'])
        result = self.prepare()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Executable source path missing', result.stderr)


if __name__ == '__main__':
    unittest.main()
