'use strict';
const reviews=require('./audit/principle_reviews.json');
const first=h=>String(h||'').split(/[.!?]+/)[0].trim();
const normalize=s=>String(s).toLowerCase().replace(/[’]/g,"'").replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();
function conceptMatches(hint,primaryTag){
 const text=first(hint),r=reviews[text];
 return Boolean(r?.status==='approved'&&r.primaryTags?.includes(primaryTag)&&r.conceptName&&normalize(text).includes(normalize(r.conceptName)));
}
function stylePrinciple(hint,primaryTag,moveIndex){
 const text=normalize(first(hint));
 // The already-visible concept name is context, not the identity of the
 // piece to move. Never remove names elsewhere in the principle or clue.
 return moveIndex===0&&conceptMatches(hint,primaryTag)?text.replace(normalize(reviews[first(hint)].conceptName),''):text;
}
function checkFirstHintGenerality(hint){
 const sentence=first(hint);
 const failures=[];
 if(/\bfork\b.*\bking\b|\bking\b.*\bfork\b|\bchecking fork\b|\bL-shaped\b|\bone (?:knight )?jump\b/i.test(sentence)){
  failures.push({rule:2,code:'hint1-over-specific-principle',detail:'Teach the general mechanism without identifying a royal fork target, checking subtype, or exact movement pattern.'});
 }
 return failures;
}
function auditConceptRules(data){
 const failures=[];let openingPrinciples=0,firstHints=0;
 for(const [category,d] of Object.entries(data))for(const [url,p] of Object.entries(d.puzzles||{})){
  const groups=p.moveHints||[p.hints||[]];const primaryTag=p.tags?.[0];
  groups.forEach((g,mi)=>{
   firstHints++;
   for(const f of checkFirstHintGenerality(g[0]))failures.push({category,url,move:mi+1,hint:1,...f});
   if(mi===0)g.forEach((h,hi)=>{openingPrinciples++;if(!conceptMatches(h,primaryTag))failures.push({rule:10,code:'opening-principle-primary-tag-mismatch',category,url,move:1,hint:hi+1,primaryTag,principle:first(h)});});
  });
 }
 return {openingPrinciples,firstHints,failures};
}
module.exports={auditConceptRules,checkFirstHintGenerality,stylePrinciple,conceptMatches};
