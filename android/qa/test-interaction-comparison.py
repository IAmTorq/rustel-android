"""Exercise the comparison CLI with synthetic measurement records."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ComparisonContract(unittest.TestCase):
    def setUp(self):
        self.row = dict(case='public-fixture', status='measured', haps=4, ctx=4,
                        frames=96000, peak=.1, rms=.05, audible=[0, 95999],
                        audio_sha256='a' * 64, elapsed_ms=5)

    def compare(self, actual, expected=None):
        with tempfile.TemporaryDirectory(prefix='rustel-comparison-') as directory:
            root = Path(directory)
            (root / 'reference.json').write_text(json.dumps(expected if expected is not None else [self.row]), encoding='utf-8')
            (root / 'actual.jsonl').write_text(''.join(json.dumps(row) + '\n' for row in actual), encoding='utf-8')
            process = subprocess.run([sys.executable, str(Path(__file__).with_name('compare-interactions.py')),
                                      '--reference', str(root / 'reference.json'), '--actual', str(root / 'actual.jsonl'),
                                      '--output', str(root / 'report.json')], capture_output=True, text=True)
            return process.returncode

    def test_matching_and_in_tolerance_measurements(self):
        self.assertEqual(self.compare([self.row]), 0)
        self.assertEqual(self.compare([{**self.row, 'audio_sha256': 'b' * 64,
                                       'peak': .10005, 'audible': [100, 95900]}]), 0)

    def test_incomplete_duplicate_unknown_failed_and_unavailable(self):
        for actual in ([], [self.row, self.row], [{**self.row, 'case': 'unknown'}],
                       [{**self.row, 'status': 'failed'}], [{**self.row, 'status': 'samples_unavailable'}]):
            with self.subTest(actual=actual):
                self.assertNotEqual(self.compare(actual), 0)

    def test_invalid_numbers_and_metric_failure_even_with_matching_hash(self):
        for field in ('peak', 'rms', 'elapsed_ms'):
            for value in (float('nan'), float('inf'), -1, None, True, '0'):
                with self.subTest(field=field, value=value):
                    self.assertNotEqual(self.compare([{**self.row, field: value}]), 0)
        self.assertNotEqual(self.compare([{**self.row, 'peak': .2}]), 0)

    def test_reference_is_nonempty_unique_and_finite(self):
        for expected in ([], [self.row, self.row], [{**self.row, 'peak': float('nan')}]):
            with self.subTest(expected=expected):
                self.assertNotEqual(self.compare([self.row], expected), 0)


if __name__ == '__main__':
    unittest.main()
