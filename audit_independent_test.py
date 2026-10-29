import copy
import json
from pathlib import Path
import unittest
from audit_independent import audit

ROOT=Path(__file__).resolve().parent
class MoveLocalHintTests(unittest.TestCase):
    def setUp(self):
        full=json.loads((ROOT/'game/public/puzzles.json').read_text())
        url=next(iter(full['attraction']['puzzles']))
        self.data={'attraction':{'puzzles':{url:copy.deepcopy(full['attraction']['puzzles'][url])}}}
        self.puzzle=self.data['attraction']['puzzles'][url]
        self.evidence=[e for e in json.loads((ROOT/'audit/move_hint_evidence.json').read_text()) if e['category']=='attraction' and e['url']==url]
        self.reviews=json.loads((ROOT/'audit/principle_reviews.json').read_text())
    def findings(self):return audit(self.data,self.evidence,self.reviews)['failures']
    def test_second_move_is_a_checking_fork_not_an_attraction_setup(self):
        self.assertEqual(self.evidence[1]['san'],'Qb3+')
        self.assertEqual(self.evidence[1]['topic'],'forkCheck')
        self.assertEqual(self.findings(),[])
    def test_rejects_stale_setup_advice_after_attraction(self):
        principle=self.puzzle['moveHints'][1][1].split('. ')[0]
        self.puzzle['moveHints'][1][1]=principle+'. Look for an offer that lures a defender onto a new square.'
        self.assertTrue(any(f['rule']==8 and f['code']=='offer-advice-after-setup-is-over' for f in self.findings()))
    def test_rejects_first_move_position_as_second_move_evidence(self):
        self.evidence[1]['beforeFen']=self.evidence[0]['beforeFen']
        self.assertTrue(any(f['code']=='wrong-evidence-position' for f in self.findings()))
    def test_rejects_a_later_moves_direct_answer(self):
        self.puzzle['moveHints'][0][2]=self.puzzle['moveHints'][1][2]
        self.assertTrue(any(f['code']=='wrong-direct-move' for f in self.findings()))
    def test_rejects_false_guard_counts(self):
        self.evidence[0]['observation']['guards']=[]
        self.assertTrue(any(f['code']=='wrong-target-fact' for f in self.findings()))

if __name__=='__main__':unittest.main()
