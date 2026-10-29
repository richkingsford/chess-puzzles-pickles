#!/usr/bin/env node
// Editorial lesson library plus move-local board observations. Never use a
// category as the description of a later move. Evidence is audited separately.
const fs = require('fs');
const path = require('path');
const { Chess } = require('../game/node_modules/chess.js');
const root = path.resolve(__dirname, '..');
const datasetPath = path.join(root, 'game/public/puzzles.json');
const primaryLessons = require('../audit/primary_concept_lessons.json');
const VALUES = {p:1,n:3,b:3,r:5,q:9,k:100};
const FILES = 'abcdefgh';
const lessons = {
  attraction: [
    'Attraction can draw a piece onto a square where it becomes vulnerable.',
    'An offered target can draw a defender into a new attack.',
    'A forcing offer can change where the defender must stand.'
  ],
  exchangeAttraction: [
    'An exchange can draw a defender onto a less safe square.',
    'A recapture can place a defender where another attack can reach it.',
    'A tempting capture can change which squares a defender must guard.'
  ],
  mate: [
    'A mating attack works when every legal defense to check is gone.',
    'Checkmate requires a checking threat with no legal escape or defense.',
    'A mating move leaves no escape, capture, or block that can answer check.'
  ],
  check: [
    'A check can gain time by making the enemy answer a threat.',
    'A checking threat must be answered before other defenses can help.',
    'An open checking line can keep an exposed king under pressure.'
  ],
  contactCheck: [
    'A check can gain time by forcing a defensive reply.',
    'A check must be answered before a separate threat can be handled.',
    'A checking move can keep the initiative by forcing an immediate reply.'
  ],
  doubleCheck: [
    'Double check combines two attacks in the same turn.',
    'Double check requires an escape rather than a single block or capture.',
    'Uncovering one checking line can let a second attacker join the check.'
  ],
  forkCheck: [
    'A fork can threaten two targets at once.',
    'A checking fork forces a reply while a second target remains attacked.',
    'A checked king must answer check before another attacked piece is saved.'
  ],
  fork: [
    'A fork can threaten two targets at once.',
    'A double attack can leave too little time to protect both targets.',
    'A move attacking two pieces can make the defender choose which to save.'
  ],
  capture: [
    'A capture can win material when the target has too little protection.',
    'A safe capture weighs the target against any possible recapture.',
    "A capture's gain depends on both the target and any recapture."
  ],
  captureCheck: [
    'A forcing capture can gain material while making the defender respond.',
    'A checking capture can keep the initiative during an exchange.',
    'Taking a target with check makes the defender answer the king threat.'
  ],
  removeGuard: [
    'Removing a guard can leave the piece it protects easier to attack.',
    'A defender may be worth removing before the target it guards.',
    'Capturing a guard can weaken protection without attacking every defender.'
  ],
  promotion: [
    'A pawn reaching the last rank can become a stronger piece.',
    'Promotion can turn a small passed piece into a much larger threat.',
    'A clear promotion square lets an advanced pawn become a new attacker.'
  ],
  underPromotion: [
    'A smaller promotion can avoid stalemate or create a different attack.',
    'Different promotion choices create different attacks from the same square.',
    'The strongest promotion choice depends on its threats rather than value alone.'
  ],
  enPassant: [
    'A two-square pawn advance can allow an immediate passing capture.',
    'A passing capture is available only on the reply to a double advance.',
    'En passant removes the pawn beside the capturing pawn rather than ahead.'
  ],
  castle: [
    'Castling can shelter the king and bring a corner piece into play.',
    'One castling turn can improve safety and activate a second piece.',
    'Castling joins king safety with development when its path is legal.'
  ],
  pawnPush: [
    'A passed pawn can tie down defenders by threatening promotion.',
    'A passed piece gains strength when its path to promotion stays clear.',
    'Advancing a passer can reduce the time available for a blockade.'
  ],
  pawnSpace: [
    'A pawn advance can gain space by controlling new squares.',
    'Extra space can restrict opposing pieces and support a later attack.',
    'A well-supported pawn advance can make an enemy position harder to defend.'
  ],
  kingActivity: [
    'Active endgame pieces can support an attack on weak pawns.',
    'A closer defender can support targets that distant pieces cannot reach.',
    'Improving king activity can turn nearby weak pawns into targets.'
  ],
  opposition: [
    'Facing kings can stop each other from reaching important squares.',
    'A waiting step can change which side must give up an entry square.',
    'Opposition can make the other king yield ground when it must move.'
  ],
  waiting: [
    'A waiting move can leave the opponent without a useful reply.',
    'Keeping a restriction can matter more than making an immediate threat.',
    'A spare tempo can make the opponent disturb its own defense.'
  ],
  develop: [
    'Developing a piece gives it access to more useful squares.',
    'An active piece can defend important squares while adding pressure.',
    'Development can prepare an attack without an immediate capture.'
  ],
  pressure: [
    'Attacking an enemy piece can force it to retreat or gain protection.',
    'A new threat can force a choice between defending and retreating.',
    'An active attacker can gain time by making an enemy piece respond.'
  ],
  discovered: [
    'Moving a blocker can uncover an attack from a piece behind it.',
    'Clearing one line can release pressure from a second attacker.',
    'A blocker can move with a threat while uncovering another attack.'
  ],
  pin: [
    'A pin can limit a defender when leaving exposes a more valuable target.',
    'A pinned guard cannot freely leave the more valuable target it shields.',
    'Lining up pressure can tie a defender to the target behind it.'
  ],
  escapeCheck: [
    'Check must be answered before a slower plan can continue.',
    'A safe escape must avoid every square controlled by the opposing side.',
    'Escaping check can preserve material while keeping the game going.'
  ],
  blockCheck: [
    'A line check can be stopped by placing a piece in its path.',
    'Blocking a checking line can defend without moving the attacked target.',
    'An interposing move stops check by closing the attack line.'
  ],
  improve: [
    'Improving a piece can help it attack and defend more useful squares.',
    'A better post can add pressure without an immediate capture.',
    'Piece activity can matter even when no forcing move is available.'
  ]
};
lessons.exchange = [
 'An exchange can change which pieces guard a target.',
 'Recapturing restores material but can alter the remaining defenses.',
 'A trade can simplify a position while leaving other targets to defend.'
];
lessons.checkingOffer = [
 'A checking offer can draw a defender away from an important post.',
 'A checking offer can make a defender abandon its current square.',
 'A forcing sacrifice can gain time for a second attacker.'
];
lessons.maneuver = [
 'A quiet step can prepare a fork before either target is attacked.',
 'A staging post can bring two targets within reach on a later turn.',
 'A route toward a fork can begin with a quiet repositioning move.'
];
lessons.blockade = [
 'A blockade can stop a pawn by occupying its next square.',
 'A block can halt a straight advance without capturing the small target.',
 'A piece on the advance square can prevent a straight pawn push.'
];
lessons.shieldPasser = [
 'A blocker can shield a passed pawn from a distant defender.',
 'Interposing a defender can protect a promotion route by closing a line.',
 'A guarded blocker can keep a distant defender from reaching a passed pawn.'
];
lessons.mateThreat = [
 'A mating threat can force a defender to give up another task.',
 'A threat of mate can make defense more urgent than a capture.',
 'A direct mating threat can force the opponent to change its plan.'
];
const alternatives = {
 capture:'Undefended pieces offer material without a protecting piece to recapture.',
 exchangeAttraction:'A recapturing defender can become exposed on its new square.',
 opposition:'Opposition can make a king yield an entry when it must move.',
 escapeCheck:'A legal escape from check must avoid all opposing attacks.',
 contactCheck:'A check can keep the initiative by demanding an immediate answer.',
 pawnSpace:'An advancing pawn can take useful squares away from enemy pieces.',
 forkCheck:'A double attack can leave too little time to protect both targets.',
 check:'Checking on an open line can stop a slower defensive plan.'
};
const notes = {
 attraction:'Defines attraction as drawing a piece onto a vulnerable destination without guaranteeing success.',
 exchangeAttraction:'Explains how the location of a recapturing defender can become tactically useful.',
 mate:'Explains the need to remove legal defenses and escape, rather than promising mate from a category.',
 check:'Explains the tempo gained by obliging a response to check.',
 contactCheck:'Explains the forcing character of a nearby check without claiming an open slider line.',
 doubleCheck:'Explains why blocking or capturing only one attacker does not resolve double check.',
 forkCheck:'Explains the two-target mechanism and priority of answering check.',
 fork:'Explains the defensive time problem caused by two simultaneous threats.',
 capture:'Explains protection, recapture risk and the material tradeoff instead of declaring every capture free.',
 captureCheck:'Explains the combination of a material capture and a forced answer to check.',
 removeGuard:'Explains why a defender can be a tactical target before its protected piece.',
 promotion:'Explains the strength gained at the last rank without naming this move.',
 underPromotion:'Explains why promotion choice depends on threats or stalemate rather than material value alone.',
 enPassant:'Explains the immediately expiring capture right and the unusual captured-pawn location.',
 castle:'Explains the linked safety and development effects of castling.',
 pawnPush:'Explains how progress of a passed pawn reduces defensive time.',
 pawnSpace:'Explains the new control and restrictions created by a pawn advance.',
 kingActivity:'Explains the supporting and attacking role of the king in an endgame.',
 opposition:'Explains king restriction, entry squares and the effect of the obligation to move.',
 waiting:'Explains the role of spare tempi and maintaining restrictions without claiming every wait wins.',
 develop:'Explains activity and preparation created by bringing a piece into play.',
 pressure:'Explains how a new attack changes defensive duties and can gain a tempo.',
 discovered:'Explains the blocker and rear-attacker relationship of a discovered attack.',
 pin:'Explains the cost of leaving a line that shields a more valuable target.',
 escapeCheck:'Explains the priority of resolving check and the need to avoid controlled squares.',
 blockCheck:'Explains how interposition closes a slider checking line.',
 improve:'Explains the useful-square and pressure benefits of improving a piece.',
 exchange:'Explains how exchanges simplify the position and change which pieces provide defense.',
 checkingOffer:'Explains a checking sacrifice that moves a defender and gains a turn for another attacker.',
 maneuver:'Explains that a quiet preparatory move can stage a later fork without claiming that the fork already exists.',
 blockade:'Explains how occupying the square ahead stops a straight pawn advance.',
 shieldPasser:'Explains the interposition of a blocker between an advanced passer and a long-range defender.',
 mateThreat:'Explains the defensive priority imposed by a threat of checkmate.'
};
const sq = s => [FILES.indexOf(s[0]), Number(s[1]) - 1];
const distance = (a,b) => { const [x,y]=sq(a),[u,v]=sq(b);return Math.max(Math.abs(x-u),Math.abs(y-v)); };
const enemy = c => c === 'w' ? 'b' : 'w';
const pieces = b => b.board().flat().filter(Boolean);
const king = (b,c) => pieces(b).find(p=>p.type==='k'&&p.color===c).square;
const label = t => t==='p'?'pawn':t==='k'?'king':['n','b'].includes(t)?'medium piece':'heavy piece';
const word = n => ['zero','one','two','three','four','five','six','seven','eight'][n] || String(n);
function aligned(a,b){const [x,y]=sq(a),[u,v]=sq(b);return x===u?'file':y===v?'rank':Math.abs(x-u)===Math.abs(y-v)?'diagonal':null;}
function pathSquares(a,b){const relation=aligned(a,b);if(!relation)return [];const [x,y]=sq(a),[u,v]=sq(b);const dx=Math.sign(u-x),dy=Math.sign(v-y);const r=[];for(let i=x+dx,j=y+dy;i!==u||j!==v;i+=dx,j+=dy)r.push(FILES[i]+(j+1));return r;}
function attacks(b,p,target){
 if(p.square===target)return false;
 const [x,y]=sq(p.square),[u,v]=sq(target),dx=u-x,dy=v-y;
 if(p.type==='p')return Math.abs(dx)===1&&dy===(p.color==='w'?1:-1);
 if(p.type==='n')return Math.abs(dx)*Math.abs(dy)===2;
 if(p.type==='k')return Math.max(Math.abs(dx),Math.abs(dy))===1;
 const rel=aligned(p.square,target);
 if(!rel||(p.type==='b'&&rel!=='diagonal')||(p.type==='r'&&rel==='diagonal'))return false;
 return pathSquares(p.square,target).every(s=>!b.get(s));
}
function attackers(b,target,color){return pieces(b).filter(p=>p.color===color&&attacks(b,p,target));}
function passage(b,p){const [x,y]=sq(p.square);return !pieces(b).some(q=>q.type==='p'&&q.color!==p.color&&Math.abs(sq(q.square)[0]-x)<=1&&(p.color==='w'?sq(q.square)[1]>y:sq(q.square)[1]<y));}
function firstTarget(b,target){
 const p=b.get(target),ks=king(b,p.color),guards=attackers(b,target,p.color),rel=aligned(target,ks);
 let text;
 if(guards.length===0)text=`An enemy ${label(p.type)} has no guard.`;
 else if(guards.length===1)text=`An enemy ${label(p.type)} has only one guard.`;
 else if(rel&&p.type!=='k')text=`An enemy ${label(p.type)} shares a ${rel} with its king.`;
 else text=`An enemy ${label(p.type)} has ${word(guards.length)} guards.`;
 if(guards.length===0&&distance(target,ks)===1)text=`An unguarded enemy ${label(p.type)} stands beside its king.`;
 else if(guards.length===0&&rel)text=`An unguarded enemy ${label(p.type)} shares its king's ${rel}.`;
 else if(guards.length===1){const g=guards[0].type==='k'?'king':guards[0].type==='p'?'pawn':label(guards[0].type).replace(' piece','');text=`An enemy ${label(p.type)} has one ${g} guard.`;}
 return {text,fact:{kind:'target',square:target,color:p.color,type:p.type,guards:guards.map(g=>g.square),relation:rel}};
}
function kingObservation(b,color){
 const ks=king(b,color),near=pieces(b).filter(p=>p.color===color&&p.type!=='k'&&distance(p.square,ks)===1);
 const pawnCover=near.filter(p=>p.type==='p');let text;
 if(near.length>=2)text=`${word(near.length)[0].toUpperCase()+word(near.length).slice(1)} enemy pieces stand beside their king.`;
 else if(pawnCover.length===0)text='The enemy king has no pawn beside it.';
 else text='One pawn stands beside the enemy king.';
 return {text,fact:{kind:'king-neighbors',square:ks,color,neighbors:near.map(p=>p.square)}};
}
function pawnObservation(b,m){
 const p={...b.get(m.from),square:m.from},steps=p.color==='w'?8-Number(m.from[1]):Number(m.from[1])-1;
 return {text:`A pawn is ${word(steps)} steps from promotion.`,fact:{kind:'pawn-distance',square:m.from,color:p.color,steps}};
}
function decodeFen(url){return decodeURIComponent(url.split('/analysis/')[1].split('?')[0].replace(/^standard\//,'')).replaceAll('_',' ');}
function analyze(before,san,nextSan,category){
 const after=new Chess(before.fen());const m=after.move(san);const foe=enemy(m.color),kingSq=king(before,foe);
 const moved={...after.get(m.to),square:m.to};const targets=pieces(after).filter(p=>p.color===foe&&attacks(after,moved,p.square));
 const valuable=targets.filter(p=>p.type==='k'||VALUES[p.type]>=3);
 const checkers=attackers(after,king(after,foe),m.color);
 const uncovered=pieces(before).filter(p=>p.color===m.color&&p.square!==m.from&&['q','r','b'].includes(p.type)).flatMap(p=>pieces(before).filter(t=>t.color===foe&&(t.type==='k'||VALUES[t.type]>=3)&&after.get(t.square)?.color===foe&&attacks(after,{...after.get(p.square),square:p.square},t.square)&&!attacks(before,p,t.square)).map(t=>({attacker:p.square,target:t.square})));
 let reply=null,replyBoard=null,follow=null,followBoard=null;if(nextSan){replyBoard=new Chess(after.fen());reply=replyBoard.move(nextSan);}
 if(replyBoard&&arguments[4]){followBoard=new Chess(replyBoard.fen());follow=followBoard.move(arguments[4]);}
 const recaptured=reply&&reply.to===m.to&&reply.captured;
 const captureSquare=m.flags.includes('e')?m.to[0]+m.from[1]:m.to;
 let topic,target=null,line=null;
 if(m.promotion)topic=m.promotion==='q'?'promotion':'underPromotion';
 else if(m.flags.includes('e'))topic='enPassant';
 else if(m.flags.includes('k')||m.flags.includes('q'))topic='castle';
 else if(checkers.length>=2)topic='doubleCheck';
 else if(after.isCheckmate())topic=uncovered.some(u=>u.target===king(after,foe))&&!checkers.some(p=>p.square===m.to)?'discovered':'mate';
 else if(recaptured&&(VALUES[m.piece]>=VALUES[m.captured||'p'])&&category!=='hanging-piece'){
  if(reply.piece==='k')topic='attraction';
  else if(follow&&(follow.to===reply.to||attacks(followBoard,{...followBoard.get(follow.to),square:follow.to},reply.to)))topic='exchangeAttraction';
  else if(after.isCheck()&&follow&&followBoard.isCheck()&&VALUES[m.piece]>VALUES[m.captured||'p'])topic='checkingOffer';
  else topic=m.captured?'exchange':after.isCheck()?(checkers.some(p=>['q','r','b'].includes(p.type))?'check':'contactCheck'):'improve';
 }
 else if(after.isCheck()&&valuable.some(p=>p.type!=='k')&&checkers.some(p=>p.square===m.to))topic='forkCheck';
 else if(!after.isCheck()&&valuable.length>=2)topic='fork';
 else if(uncovered.length)topic='discovered';
 else if(m.captured){
  const captured={...before.get(captureSquare),square:captureSquare};
  const protectedTargets=pieces(before).filter(p=>p.color===foe&&p.square!==captureSquare&&p.type!=='k'&&VALUES[p.type]>=3&&attacks(before,captured,p.square));
  topic=after.isCheck()?'captureCheck':protectedTargets.length&&!recaptured?'removeGuard':'capture';
 } else if(after.isCheck())topic=checkers.some(p=>['q','r','b'].includes(p.type))?'check':'contactCheck';
 else if(before.isCheck())topic=m.piece==='k'?'escapeCheck':'blockCheck';
 else if(m.piece==='p')topic=passage(before,{...before.get(m.from),square:m.from})?'pawnPush':'pawnSpace';
 else if(m.piece==='k')topic=distance(m.to,kingSq)===2&&aligned(m.to,kingSq)&&aligned(m.to,kingSq)!=='diagonal'?'opposition':'kingActivity';
 else if(category==='zugzwang')topic='waiting';
 else if(['n','b'].includes(m.piece)&&Number(m.from[1])===(m.color==='w'?1:8))topic='develop';
 else if(valuable.length||targets.some(p=>p.type!=='k'))topic='pressure';
 else topic='improve';
 if(['fork','forkCheck','pressure'].includes(topic))target=(valuable.find(p=>p.type!=='k')||targets.find(p=>p.type!=='k'))?.square;
 else if(m.captured)target=captureSquare;
 else if(topic==='discovered')target=uncovered[0]?.target;
 // A quiet staging move is not the later fork it prepares.
 if(topic==='improve'&&targets.length===0&&follow&&follow.from===m.to&&followBoard.isCheck()){
  const fp={...followBoard.get(follow.to),square:follow.to};
  const ft=pieces(followBoard).filter(p=>p.color===foe&&VALUES[p.type]>=3&&attacks(followBoard,fp,p.square));
  if(ft.some(p=>p.type==='k')&&ft.some(p=>p.type!=='k')){topic='maneuver';target=ft.find(p=>p.type!=='k').square;}
 }
 let specialObservation=null;
 if(['improve','pressure'].includes(topic)){
  const blocked=pieces(before).find(p=>p.color===foe&&p.type==='p'&&m.to===p.square[0]+(Number(p.square[1])+(p.color==='w'?1:-1)));
  if(blocked){topic='blockade';target=blocked.square;specialObservation=pawnObservation(before,{from:blocked.square});}
  else {
   const passer=pieces(before).find(p=>p.color===m.color&&p.type==='p'&&passage(before,p)&&pieces(before).some(q=>q.color===foe&&['q','r','b'].includes(q.type)&&attacks(before,q,p.square)&&pathSquares(q.square,p.square).includes(m.to)));
   if(passer){const guard=pieces(before).find(q=>q.color===foe&&['q','r','b'].includes(q.type)&&attacks(before,q,passer.square)&&pathSquares(q.square,passer.square).includes(m.to));topic='shieldPasser';specialObservation={text:'An enemy heavy piece watches a passed pawn on its file.',fact:{kind:'passer-shield',pawn:passer.square,defender:guard.square,block:m.to,color:m.color}};}
  }
 }
 // Detect immediate mating threats without treating a later mate as this move.
 if(['improve','pressure'].includes(topic)&&!after.isCheck()){
  const fen=after.fen().split(' ');fen[1]=m.color;const probe=new Chess(fen.join(' '));
  const threats=probe.moves({verbose:true}).filter(t=>{const p=new Chess(probe.fen());p.move(t.san);return p.isCheckmate();});
  if(threats.length){topic='mateThreat';specialObservation=kingObservation(before,foe);specialObservation.fact.mateThreats=threats.map(t=>t.san);}
 }
 if(topic==='pawnSpace'){
  const ap={...after.get(m.to),square:m.to};
  const victims=pieces(before).filter(p=>p.color===foe&&attacks(after,ap,p.square)).sort((p,q)=>VALUES[q.type]-VALUES[p.type]);
  if(victims.length){target=victims[0].square;specialObservation=firstTarget(before,target);}
  else {
   const supported=pieces(before).find(p=>p.color===m.color&&p.type==='p'&&p.square!==m.from&&attacks(after,ap,p.square));
   if(supported){const gs=attackers(before,supported.square,m.color);specialObservation={text:`A friendly pawn has ${word(gs.length)} guard${gs.length===1?'':'s'}.`,fact:{kind:'support-target',square:supported.square,color:m.color,guards:gs.map(p=>p.square)}};}
   else {
    const entries=FILES.split('').flatMap(f=>[1,2,3,4,5,6,7,8].map(r=>f+r)).filter(s=>!before.get(s)&&attacks(after,ap,s));
    entries.sort((a,b)=>attackers(before,b,foe).length-attackers(before,a,foe).length);
    if(!entries.length)throw Error('Review pawn-space clue '+before.fen());
    const entry=entries[0],gs=attackers(before,entry,m.color);
    specialObservation={text:`An empty entry has ${word(gs.length)} friendly guard${gs.length===1?'':'s'}.`,fact:{kind:'space-entry',square:entry,color:m.color,guards:gs.map(p=>p.square)}};
   }
  }
 }
 let observation;
 if(specialObservation)observation=specialObservation;
 else if(['promotion','underPromotion'].includes(topic))observation=pawnObservation(before,m);
 else if(topic==='opposition'){const own=king(before,m.color);observation={text:`The kings are ${word(distance(own,kingSq))} steps apart.`,fact:{kind:'king-distance',from:own,to:kingSq,distance:distance(own,kingSq)}};}
 else if(topic==='escapeCheck'){const count=before.moves({verbose:true}).filter(t=>t.piece==='k').length;observation={text:`The checked king has ${word(count)} legal escape squares.`,fact:{kind:'king-escapes',color:m.color,count}};}
 else if(topic==='develop')observation={text:'A medium piece still waits on its home rank.',fact:{kind:'home-piece',square:m.from,color:m.color,type:m.piece}};
 else if(topic==='discovered'&&target&&before.get(target)?.type==='k')observation=kingObservation(before,foe);
 else if(['exchangeAttraction','checkingOffer'].includes(topic)&&!m.captured)observation=kingObservation(before,foe);
 else if(target&&before.get(target)?.type!=='k')observation=firstTarget(before,target);
 else if(['pawnPush','pawnSpace','promotion','underPromotion','enPassant'].includes(topic))observation=pawnObservation(before,m);
 else if(['mate','check','contactCheck','doubleCheck','attraction','forkCheck'].includes(topic))observation=kingObservation(before,foe);
 else if(topic==='castle')observation={text:'The king still has a legal route to safety.',fact:{kind:'castling',square:m.from,color:m.color}};
 else if(['kingActivity','opposition','escapeCheck'].includes(topic)){
  const own=king(before,m.color);const candidates=pieces(before).filter(p=>p.color===foe&&p.type==='p');const closer=candidates.filter(p=>distance(m.to,p.square)<distance(own,p.square));const pawn=(closer.length?closer:candidates).sort((a,b)=>distance(m.to,a.square)-distance(m.to,b.square))[0];
  observation=pawn?{text:`An enemy pawn is ${word(distance(own,pawn.square))} king steps away.`,fact:{kind:'king-pawn-distance',square:pawn.square,king:own,distance:distance(own,pawn.square),color:foe}}:kingObservation(before,foe);
 }else if(topic==='blockCheck')observation={text:'An enemy line attack is giving check.',fact:{kind:'in-check',color:m.color}};
 else {const ep=pieces(before).find(p=>p.color===foe&&p.type!=='k');observation=ep?firstTarget(before,ep.square):kingObservation(before,foe);}
 if(['check','mate','doubleCheck','captureCheck','forkCheck'].includes(topic)){
  const checker=checkers.find(p=>['r','b','q'].includes(p.type));
  if(checker){const rel=aligned(checker.square,king(after,foe));if(rel)line={from:checker.square,to:king(after,foe),relation:rel};}
 }
 return {m,after,reply,topic,target,observation,line,uncovered,targets:valuable.map(p=>p.square),checkers:checkers.map(p=>p.square),recaptured:Boolean(recaptured),category};
}
function targetDescription(a,before,includePath=true){
 const target=a.target;if(!target)return 'the current target';
 const p=before.get(target),guards=attackers(before,target,p.color);
 const name=p.type==='p'?'small target':label(p.type);
 let text=guards.length===0?`the unguarded ${name}`:guards.length===1?`the ${name} with one guard`:`the ${name} with ${word(guards.length)} guards`;
 if(includePath&&a.m.captured&&['r','b','q'].includes(a.m.piece)){
  const rel=aligned(a.m.from,target);if(rel)text+=` on the ${rel}`;
 }
 return text;
}
function secondCue(a,before){
 const {topic,m,target,line,observation}=a;
 if(topic==='mate')return m.captured?`Look for a checking capture of ${targetDescription(a,before)}.`:line?`Look for a final checking entry on the ${line.relation}.`:m.piece==='n'?'Look for a jumping check with no legal escape.':'Look for a close check with no legal escape.';
 if(topic==='exchange')return `Look for a trade of ${targetDescription(a,before)}.`;
 if(topic==='checkingOffer')return 'Look for a checking offer that makes a defender leave its post.';
 if(topic==='maneuver')return 'Look for a quiet staging step toward the two valuable targets.';
 if(topic==='blockade')return 'Look for a block directly ahead of the advancing small target.';
 if(topic==='shieldPasser')return 'Look for a block between the passed small target and the distant defender.';
 if(topic==='mateThreat')return 'Look for a direct mating threat at the protected entry.';
 if(topic==='attraction'){const t=target?before.get(target):null;return t?`Look for an offer against the ${t.type==='p'?'small shield':label(t.type)} guarded by the main defender.`:'Look for a checking offer beside the main defender.';}
 if(topic==='exchangeAttraction'){const t=target?before.get(target):null;const name=t?(t.type==='p'?'small target':label(t.type)):null;const r=a.reply;const guard=r?(r.piece==='p'?'small':label(r.piece).replace(' piece','')):'nearby';return name?`Look for an exchange of the ${name} that draws its guard away.`:`Look for a checking offer that draws the ${guard} defender away.`;}
 if(topic==='forkCheck')return `Look for a checking fork that also reaches the ${label(before.get(target).type)==='pawn'?'small target':label(before.get(target).type)}.`;
 if(topic==='fork')return 'Look for one attack that reaches both valuable targets.';
 if(topic==='doubleCheck')return `Look for a threat that uncovers the hidden ${line?.relation||'checking line'} while also checking.`;
 if(topic==='discovered'){const u=a.uncovered[0];const rel=aligned(u.attacker,u.target);return `Look for a move that clears the blocker from the hidden ${rel}.`;}
 if(topic==='captureCheck')return `Look for a checking capture of ${targetDescription(a,before)}.`;
 if(topic==='capture')return `Look for a capture of ${targetDescription(a,before)}.`;
 if(topic==='removeGuard')return `Look for a capture of ${targetDescription(a,before)} that guards another target.`;
 if(topic==='promotion')return 'Look for the advance that reaches the final rank.';
 if(topic==='underPromotion')return 'Look for a promotion choice whose attack matters more than its value.';
 if(topic==='enPassant')return 'Look for the passing capture allowed by the last double advance.';
 if(topic==='castle')return m.flags.includes('k')?'Look for the short safety route that also activates a corner defender.':'Look for the long safety route that also activates a corner defender.';
 if(topic==='check')return `Look for a checking entry on the ${line?.relation||'clear line'}.`;
 if(topic==='contactCheck')return 'Look for a close check that keeps the pressure forcing.';
 if(topic==='pawnPush')return `Look for an advance that shortens the path to promotion.`;
 if(topic==='pawnSpace'){const afterTargets=pieces(a.after).filter(p=>p.color!==m.color&&attacks(a.after,{...a.after.get(m.to),square:m.to},p.square));if(afterTargets.length){const t=afterTargets.sort((p,q)=>VALUES[q.type]-VALUES[p.type])[0];return `Look for an advance that challenges the ${t.type==='p'?'small target':label(t.type)}.`;}return a.observation.fact.kind==='support-target'?'Look for an advance that adds support to the neighboring small target.':'Look for an advance that adds control to the empty entry.';}
 if(topic==='kingActivity')return `Look for an approach to the small target ${word(a.observation.fact.distance||1)} steps away.`;
 if(topic==='opposition')return 'Look for a step that contests the entry squares beside the opposing position.';
 if(topic==='escapeCheck')return 'Look for an escape that stays outside every enemy attack.';
 if(topic==='blockCheck')return 'Look for a block that closes the current checking line.';
 if(topic==='waiting')return 'Look for a waiting step that keeps the opposing position restricted.';
 if(topic==='pressure')return `Look for a new threat against the ${label(before.get(target).type)==='pawn'?'small target':label(before.get(target).type)}.`;
 if(topic==='develop')return 'Look for an active post for a piece still on its starting rank.';
 return 'Look for a post that improves activity without losing protection.';
}
function rewrite(data){
 const evidence=[];
 for(const [category,cat] of Object.entries(data))for(const [url,puzzle] of Object.entries(cat.puzzles)){
  const board=new Chess(decodeFen(url));const moves=puzzle.answer.split(',').map(s=>s.trim());const groups=[];
  for(let i=0;i<moves.length;i++){
   if(i%2){board.move(moves[i]);continue;}
   const before=board.fen(),a=analyze(board,moves[i],moves[i+1],category,moves[i+2]),lesson=[...lessons[a.topic]];
   if(i===0){const primary=puzzle.tags?.[0];if(!primaryLessons[primary])throw Error('Unreviewed primary concept: '+primary);lesson.splice(0,3,...primaryLessons[primary].principles);}
   let hints=[`${lesson[0]} ${a.observation.text}`,`${lesson[1]} ${secondCue(a,board)}`,`${lesson[2]} Play ${moves[i]}.`];
   if(groups.length&&hints[0]===groups.at(-1)[0]&&hints[1]===groups.at(-1)[1]){
    if(!alternatives[a.topic])throw Error('Review a distinct current-move lesson for '+a.topic);
    lesson[0]=alternatives[a.topic];
    hints=[`${lesson[0]} ${a.observation.text}`,`${lesson[1]} ${secondCue(a,board)}`,`${lesson[2]} Play ${moves[i]}.`];
   }
   groups.push(hints);
   evidence.push({category,url,move:i/2+1,beforeFen:before,san:moves[i],topic:a.topic,target:a.target,observation:a.observation.fact,line:a.line,uncovered:a.uncovered,targets:a.targets,checkers:a.checkers});
   board.move(moves[i]);
  }
  puzzle.moveHints=groups;
  // All legacy hints now mirror the opening move rather than retaining old,
  // contradictory unscoped guidance.
  puzzle.hints=[...groups[0]];
 }
 return evidence;
}
if(require.main===module){
 const data=JSON.parse(fs.readFileSync(datasetPath,'utf8'));
 const evidence=rewrite(data);
 fs.writeFileSync(datasetPath,JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync(path.join(root,'audit/move_hint_evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 // These sentences were authored and reviewed as a lesson library, with
 // explanatory reasons recorded by topic rather than blindly approving data.
 const reviews=JSON.parse(fs.readFileSync(path.join(root,'audit/principle_reviews.json'),'utf8'));
 for(const [topic,text] of Object.entries(alternatives))reviews[text.replace(/\.$/,'')]={status:'approved',reason:notes[topic]+' Gives an additional teaching emphasis for a later move.',topics:[topic]};
 for(const [topic,triplet] of Object.entries(lessons))for(const text of triplet){const key=text.replace(/\.$/,'');const prior=reviews[key]||{};reviews[key]={...prior,status:'approved',reason:notes[topic],topics:[...new Set([...(prior.topics||[]),topic])]};}
 for(const [tag,entry] of Object.entries(primaryLessons))for(const text of entry.principles){
  const key=text.replace(/\.$/,'');const prior=reviews[key]||{};
  reviews[key]={...prior,status:'approved',reason:`Teaches ${entry.name} through its defining relationship or strategic tradeoff. The position-specific cue and action are separately checked against the current move.`,primaryTags:[...new Set([...(prior.primaryTags||[]),tag])],conceptName:entry.name};
 }
 reviews['A fork can threaten the king and another target at once']={status:'rejected',reason:'Hint 1 gives away the royal target of a checking fork instead of teaching the general two-target mechanism.'};
 reviews['A favorable exchange gains more material than it gives up']={status:'rejected',reason:'A favorable exchange can be positional rather than material. Teach capture gain and recapture risk without treating every useful trade as a material win.'};
 fs.writeFileSync(path.join(root,'audit/principle_reviews.json'),JSON.stringify(reviews,null,2)+'\n');
 console.log(JSON.stringify(evidence.reduce((r,e)=>(r[e.topic]=(r[e.topic]||0)+1,r),{}),null,2));
}
module.exports={rewrite,analyze,attacks,attackers,lessons,decodeFen};
