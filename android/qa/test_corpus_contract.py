import unittest
from corpus_contract import validate


class CorpusContract(unittest.TestCase):
    def setUp(self):
        self.row=dict(case='public/a',status='measured',peak=.1,rms=.05,elapsed_ms=12)
        self.expected={'public/a':{}}

    def test_complete_valid_output(self):
        validate([self.row],self.expected)

    def test_incomplete_unknown_duplicate_and_empty_inputs(self):
        for rows,expected in [([],self.expected),([self.row,self.row],self.expected),([{**self.row,'case':'other'}],self.expected),([], {})]:
            with self.subTest(rows=rows):
                with self.assertRaises(ValueError):validate(rows,expected)

    def test_nonfinite_negative_missing_or_wrong_type_metrics(self):
        for field in ['peak','rms','elapsed_ms']:
            for value in [float('nan'),float('inf'),-1,None,True,'0']:
                with self.subTest(field=field,value=value):
                    with self.assertRaises(ValueError):validate([{**self.row,field:value}],self.expected)

    def test_failure_records_reach_the_comparator(self):
        for status in ['failed','samples_unavailable']:
            validate([dict(case='public/a',status=status)],self.expected)


if __name__=='__main__':unittest.main()
