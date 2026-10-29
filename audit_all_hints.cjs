#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {auditPrinciples}=require('./audit_principles');
const {auditConceptRules}=require('./audit_concept_rules.cjs');
const ROOT=__dirname;
async function main(){
 const file=path.join(ROOT,'game/public/puzzles.json');const raw=fs.readFileSync(file);
 const data=JSON.parse(raw),dictionary=JSON.parse(fs.readFileSync(path.join(ROOT,'dictionary.json')));
 const {auditPuzzlesData,buildTagDefinitionIndex}=await import(pathToFileURL(path.join(ROOT,'game/src/lib/puzzleAudit.js')));
 const application=auditPuzzlesData(data,{tagDefinitionIndex:buildTagDefinitionIndex(dictionary)});
 const principles=auditPrinciples(data);
 const concepts=auditConceptRules(data);
 const independent=spawnSync(process.env.PYTHON||'python',['audit_independent.py'],{cwd:ROOT,encoding:'utf8',maxBuffer:20*1024*1024,timeout:60000});
 if(independent.error||!independent.stdout.trim())throw Error(independent.error?.message||independent.stderr||'Independent Python audit did not run');
 const board=JSON.parse(independent.stdout);
 const rules=[
  'Three hints per player move','Progressive disclosure','One teaching point per hint',
  'Early hints avoid exact notation','No redundant hints within a move',
  'Dictionary and taxonomy alignment','Clear short phrasing','Current-move relevance',
  'Independent principle first','Move-one principles tie to the first tag'
 ].map((name,i)=>({number:i+1,name,failures:board.failures.filter(f=>f.rule===i+1).length}));
 rules[8].failures+=principles.failures.length;
 for(const f of concepts.failures)rules[f.rule-1].failures++;
 for(const f of application.failures){const r=/tag/.test(f.code)?6:/count|index/.test(f.code)?1:/vague/.test(f.code)?7:8;rules[r-1].failures++;}
 const result={datasetSha256:createHash('sha256').update(raw).digest('hex'),puzzles:board.totals.puzzles,playerMoves:board.totals.groups,hints:board.totals.hints,positionEngines:['chess.js','python-chess'],rules,applicationFindings:application.failures.length,principleFindings:principles.failures.length,conceptFindings:concepts.failures.length,openingPrinciplesChecked:concepts.openingPrinciples,firstHintsChecked:concepts.firstHints,independentFindings:board.failures.length,examples:[...application.failures,...principles.failures,...concepts.failures,...board.failures].slice(0,15)};
 console.log(JSON.stringify(result,null,2));
 if(rules.some(r=>r.failures)||independent.status!==0)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
