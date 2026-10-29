const test=require('node:test');
const assert=require('node:assert/strict');
const {auditConceptRules,checkFirstHintGenerality,conceptMatches,stylePrinciple}=require('./audit_concept_rules.cjs');
const lessons=require('./audit/primary_concept_lessons.json');
function group(tag){return lessons[tag].principles.map(p=>p+' A board observation.');}
test('rejects a royal fork spoiler but accepts the general two-target principle',()=>{
 assert.equal(checkFirstHintGenerality('A fork can threaten the king and another target at once. A clue.')[0].code,'hint1-over-specific-principle');
 assert.deepEqual(checkFirstHintGenerality('A fork can threaten two targets at once. A clue.'),[]);
});
test('checks all three opening principles against the actual first tag',()=>{
 const data={sample:{puzzles:{url:{tags:['attraction','fork'],moveHints:[group('fork')]}}}};
 assert.equal(auditConceptRules(data).failures.filter(f=>f.rule===10).length,3);
});
test('later move principles need not match the first tag',()=>{
 const data={sample:{puzzles:{url:{tags:['attraction'],moveHints:[group('attraction'),group('fork'),group('clearance')]}}}};
 assert.deepEqual(auditConceptRules(data).failures,[]);
});
test('a visible concept name is not a moving-piece spoiler',()=>{
 const hint=lessons['queen-rook-endgame'].principles[0]+' A heavy target has one guard.';
 assert.ok(conceptMatches(hint,'queen-rook-endgame'));
 assert.doesNotMatch(stylePrinciple(hint,'queen-rook-endgame',0),/\bqueen|rook\b/);
 assert.match(stylePrinciple(hint,'queen-rook-endgame',1),/\bqueen/);
});
test('generality checks apply to later first hints too',()=>{
 const g=group('fork');g[0]='A fork can threaten the king and another target at once. A clue.';
 const data={sample:{puzzles:{url:{tags:['attraction'],moveHints:[group('attraction'),g]}}}};
 assert.ok(auditConceptRules(data).failures.some(f=>f.rule===2&&f.move===2));
});
