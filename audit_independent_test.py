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

class LaterMoveRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full=json.loads((ROOT/'game/public/puzzles.json').read_text())
        cls.all_evidence=json.loads((ROOT/'audit/move_hint_evidence.json').read_text())
        cls.reviews=json.loads((ROOT/'audit/principle_reviews.json').read_text())
    def fixture(self,category,san,topic):
        row=next(e for e in self.all_evidence if e['category']==category and e['move']==2 and e['san']==san and e['topic']==topic)
        self.url=row['url'];self.category=category
        self.puzzle=copy.deepcopy(self.full[category]['puzzles'][self.url])
        self.data={category:{'puzzles':{self.url:self.puzzle}}}
        self.evidence=copy.deepcopy([e for e in self.all_evidence if e['category']==category and e['url']==self.url])
        self.assertEqual(self.codes(),set())
    def codes(self):return {f['code'] for f in audit(self.data,self.evidence,self.reviews)['failures']}
    def test_clearance_quiet_attack_rejects_checking_advice(self):
        self.fixture('clearance','Re1','pressure')
        self.puzzle['moveHints'][1][1]='A new threat can force a choice between defending and retreating. Look for a checking offer that draws the heavy defender away.'
        self.assertIn('checking-cue-for-quiet-move',self.codes())
    def test_clearance_rejects_true_but_unrelated_king_fact(self):
        self.fixture('clearance','Re1','pressure')
        self.evidence[1]['observation']={'kind':'king-neighbors','square':'g8','color':'b','neighbors':['f7']}
        self.puzzle['moveHints'][1][0]='Attacking an enemy piece can force it to retreat or gain protection. One pawn stands beside the enemy king.'
        self.assertIn('unrelated-king-neighbor-clue',self.codes())
    def test_incidental_guard_role_is_not_a_capture_lesson(self):
        self.fixture('trapped-piece','Qxg4','capture')
        self.evidence[1]['topic']='removeGuard'
        self.assertIn('incidental-guard-removal',self.codes())
    def test_blocking_check_is_not_falsely_rejected(self):
        self.fixture('kings-gambit-accepted','d4','blockCheck')
    def test_xray_offer_requires_opening_the_recapture_line(self):
        self.fixture('x-ray-attack','Rd1+','xrayOffer')
        self.evidence[1]['topic']='supportedOffer'
        self.assertIn('unsupported-checking-offer',self.codes())
    def test_pawn_breakthrough_is_not_checking_attraction(self):
        self.fixture('pawn-endgame','h6','pawnBreak')
    def test_deflection_releases_promotion_file(self):
        self.fixture('pin','Rxh5','deflectPromotion')

if __name__=='__main__':unittest.main()
