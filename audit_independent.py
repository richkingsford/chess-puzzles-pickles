#!/usr/bin/env python3
"""Independent nine-rule audit using python-chess, not the JS hint generator.
Install python-chess, then run python audit_independent.py [dataset.json].
This verifies recorded board claims and tactical preconditions independently;
semantic approval of the lesson prose is a separate editorial requirement.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote
import chess

ROOT = Path(__file__).resolve().parent

def initial_fen(url):
    return unquote(url.split('/analysis/')[1].split('?')[0].removeprefix('standard/')).replace('_', ' ')

def sentences(text):
    return [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]

def distance(a, b):
    return max(abs(chess.square_file(a)-chess.square_file(b)), abs(chess.square_rank(a)-chess.square_rank(b)))

def relation(a, b):
    dx=abs(chess.square_file(a)-chess.square_file(b));dy=abs(chess.square_rank(a)-chess.square_rank(b))
    return 'file' if dx==0 else 'rank' if dy==0 else 'diagonal' if dx==dy else None

def color(code): return code=='w'

def audit(dataset, evidence, reviews):
    failures=[]; totals=collections.Counter(); evidence_index={(e['category'],e['url'],e['move']):e for e in evidence}
    values={chess.PAWN:1,chess.KNIGHT:3,chess.BISHOP:3,chess.ROOK:5,chess.QUEEN:9,chess.KING:100}
    def fail(rule, code, c, u, mi, **details):
        failures.append(dict(rule=rule,code=code,category=c,url=u,move=mi,**details))
    for c, category in dataset.items():
        for u,p in category['puzzles'].items():
            totals['puzzles']+=1
            try: board=chess.Board(initial_fen(u))
            except Exception as e: fail(8,'invalid-initial-position',c,u,0,detail=str(e));continue
            sans=[s.strip() for s in p['answer'].split(',')]
            groups=p.get('moveHints',[])
            if len(groups)!=(len(sans)+1)//2:fail(1,'wrong-move-group-count',c,u,0)
            previous=None
            for answer_index,san in enumerate(sans):
                if answer_index%2:
                    try:board.push_san(san)
                    except ValueError:fail(8,'illegal-reply',c,u,0,san=san)
                    continue
                mi=answer_index//2+1;totals['groups']+=1
                try:move=board.parse_san(san)
                except ValueError:fail(8,'illegal-player-move',c,u,mi,san=san);continue
                group=groups[mi-1] if mi<=len(groups) else []
                if len(group)!=3:fail(1,'wrong-hint-count',c,u,mi)
                if previous and group[:2]==previous[:2]:fail(5,'repeated-opening-pair',c,u,mi)
                previous=group
                for hi,hint in enumerate(group):
                    totals['hints']+=1;parts=sentences(hint)
                    if len(parts)!=2:fail(3,'not-two-sentences',c,u,mi,hint=hi+1)
                    if not parts:continue
                    verdict=reviews.get(parts[0],{})
                    if verdict.get('status')!='approved' or not verdict.get('reason'):fail(9,'unreviewed-principle',c,u,mi,hint=hi+1)
                    context=evidence_index.get((c,u,mi))
                    if context and verdict.get('topics') and context['topic'] not in verdict['topics']:fail(8,'principle-for-different-move-role',c,u,mi,hint=hi+1)
                    if re.search(r'\b(?:always|guarantees|wins because|will win)\b',parts[0],re.I):fail(9,'unconditional-win-claim',c,u,mi,hint=hi+1)
                    if hi<2 and re.search(r'\b[a-h][1-8]\b',hint):fail(4,'early-square',c,u,mi,hint=hi+1)
                    if hi<2 and re.search(r'\b(?:your|our|my)\b',hint,re.I):fail(2,'early-own-side',c,u,mi,hint=hi+1)
                    if hi==0:
                        if len(hint.split())>30 or (len(parts)>1 and len(parts[1].split())>12):fail(7,'hint1-too-long',c,u,mi)
                        if re.search(r'\b(?:queen|rook|bishop|knight|L-shaped|\d+[ -]?point)\b',hint,re.I):fail(2,'hint1-piece-spoiler',c,u,mi)
                        if len(parts)>1 and re.match(r'(?:Play|Move|Look for|Use|Try)\b',parts[1]):fail(2,'hint1-gives-instruction',c,u,mi)
                    if hi==1:
                        if len(parts)>1 and not parts[1].startswith('Look for '):fail(2,'hint2-no-search-cue',c,u,mi)
                        if re.search(r'\b(?:king|queen|rook|bishop|knight|pawn)\b',hint,re.I):fail(2,'hint2-piece-name',c,u,mi)
                    if re.search(r'[;:\n]',hint) or len(hint.split())>45:fail(7,'dense-phrasing',c,u,mi,hint=hi+1)
                if len(group)==3 and (len(sentences(group[2]))!=2 or sentences(group[2])[-1]!=f'Play {san}'):
                    fail(8,'wrong-direct-move',c,u,mi)
                if len(group)>=2 and sentences(group[0])[0]==sentences(group[1])[0]:fail(5,'repeated-principle',c,u,mi)
                e=evidence_index.get((c,u,mi))
                after=board.copy();after.push(move)
                if not e:fail(8,'missing-current-move-evidence',c,u,mi);board=after;continue
                if chess.Board(e['beforeFen']).fen()!=board.fen() or e['san']!=san:
                    fail(8,'wrong-evidence-position',c,u,mi)
                mover=board.piece_at(move.from_square)
                obs=e['observation'];kind=obs['kind'];first_cue=sentences(group[0])[1] if len(sentences(group[0]))>1 else ''
                if kind=='target':
                    target=chess.parse_square(obs['square']);pce=board.piece_at(target)
                    defenders=set(chess.square_name(s) for s in board.attackers(color(obs['color']),target))
                    if not pce or pce.symbol().lower()!=obs['type'] or pce.color!=color(obs['color']) or defenders!=set(obs['guards']):fail(8,'wrong-target-fact',c,u,mi)
                    # A true fact about an unrelated piece is still an invalid hint.
                    ep_capture=board.is_en_passant(move) and target==chess.square(chess.square_file(move.to_square),chess.square_rank(move.from_square))
                    captured=board.is_capture(move) and (target==move.to_square or ep_capture)
                    reached=target in after.attacks(move.to_square)
                    uncovered=any(chess.square_name(target)==item['target'] for item in e.get('uncovered',[]))
                    staged=False
                    if e['topic']=='maneuver' and answer_index+2<len(sans):
                        stage=after.copy();stage.push_san(sans[answer_index+1]);following=stage.parse_san(sans[answer_index+2]);stage.push(following)
                        staged=following.from_square==move.to_square and target in stage.attacks(following.to_square) and board.piece_at(target)==stage.piece_at(target)
                    if not captured and not reached and not uncovered and not staged:fail(8,'unrelated-board-target',c,u,mi,target=obs['square'])
                    if obs.get('relation')!=relation(target,board.king(pce.color)):fail(8,'wrong-target-line',c,u,mi)
                    if 'unguarded' in first_cue.lower() and defenders:fail(8,'guarded-target-called-unguarded',c,u,mi)
                    if 'beside its king' in first_cue.lower() and distance(target,board.king(pce.color))!=1:fail(8,'target-not-beside-king',c,u,mi)
                    expected_class='medium piece' if pce.piece_type in (chess.KNIGHT,chess.BISHOP) else 'heavy piece' if pce.piece_type in (chess.ROOK,chess.QUEEN) else 'pawn'
                    if expected_class not in first_cue.lower():fail(8,'wrong-target-class-in-text',c,u,mi)
                elif kind=='king-neighbors':
                    ks=board.king(color(obs['color']));near={chess.square_name(s) for s,pce in board.piece_map().items() if pce.color==color(obs['color']) and pce.piece_type!=chess.KING and distance(s,ks)==1}
                    if near!=set(obs['neighbors']) or chess.square_name(ks)!=obs['square']:fail(8,'wrong-king-neighbors',c,u,mi)
                elif kind=='pawn-distance':
                    s=chess.parse_square(obs['square']);pce=board.piece_at(s);steps=7-chess.square_rank(s) if pce and pce.color else chess.square_rank(s)
                    if not pce or pce.piece_type!=chess.PAWN or steps!=obs['steps']:fail(8,'wrong-pawn-distance',c,u,mi)
                    if steps>=5 and 'advanced' in first_cue.lower():fail(8,'starting-pawn-called-advanced',c,u,mi)
                elif kind=='king-pawn-distance':
                    ps=chess.parse_square(obs['square']);ks=chess.parse_square(obs['king']);dist=distance(ps,ks)
                    if not board.piece_at(ps) or board.piece_type_at(ps)!=chess.PAWN or board.piece_type_at(ks)!=chess.KING or dist!=obs['distance']:fail(8,'wrong-king-pawn-distance',c,u,mi)
                    if 'near' in first_cue.lower() and dist>2:fail(8,'distant-target-described-near',c,u,mi,distance=dist)
                elif kind in ('support-target','space-entry'):
                    target=chess.parse_square(obs['square']);guards={chess.square_name(s) for s in board.attackers(board.turn,target)}
                    if guards!=set(obs['guards']) or target not in after.attacks(move.to_square) or mover.piece_type!=chess.PAWN:fail(8,'false-pawn-support-fact',c,u,mi)
                    if kind=='support-target' and (board.color_at(target)!=board.turn or board.piece_type_at(target)!=chess.PAWN):fail(8,'wrong-supported-target',c,u,mi)
                    if kind=='space-entry' and board.piece_at(target):fail(8,'entry-not-empty',c,u,mi)
                elif kind=='home-piece':
                    source=chess.parse_square(obs['square']);pc=board.piece_at(source)
                    if source!=move.from_square or not pc or pc.piece_type not in (chess.KNIGHT,chess.BISHOP) or chess.square_rank(source)!=(0 if board.turn else 7):fail(8,'false-home-piece',c,u,mi)
                elif kind=='king-distance':
                    a=board.king(board.turn);b=board.king(not board.turn)
                    if obs['from']!=chess.square_name(a) or obs['to']!=chess.square_name(b) or obs['distance']!=distance(a,b):fail(8,'false-king-distance',c,u,mi)
                elif kind=='king-escapes':
                    moves=[m for m in board.legal_moves if board.piece_type_at(m.from_square)==chess.KING]
                    if not board.is_check() or len(moves)!=obs['count']:fail(8,'false-king-escape-count',c,u,mi)
                elif kind=='passer-shield':
                    ps=chess.parse_square(obs['pawn']);ds=chess.parse_square(obs['defender']);block=chess.parse_square(obs['block'])
                    if board.piece_type_at(ps)!=chess.PAWN or board.color_at(ps)!=board.turn or board.piece_type_at(ds) not in (chess.ROOK,chess.BISHOP,chess.QUEEN) or ps not in board.attacks(ds) or block!=move.to_square or block not in chess.SquareSet(chess.between(ps,ds)) or ps in after.attacks(ds):fail(8,'false-passer-shield',c,u,mi)
                    if not after.attackers(board.turn,block):fail(8,'unguarded-passer-shield',c,u,mi)
                elif kind=='castling':
                    if not board.is_castling(move):fail(8,'false-castling-clue',c,u,mi)
                elif kind=='in-check':
                    if not board.is_check():fail(8,'false-check-clue',c,u,mi)
                else:fail(8,'unrecognized-observation',c,u,mi,kind=kind)
                # Catch the user's stale attraction instruction even if a ledger entry
                # accidentally assigns it the current move's otherwise valid role.
                if len(group)>=2:
                    cue=sentences(group[1])[-1].lower()
                    if re.search(r'offer|lure|draw|bait|sacrifice',cue):
                        can_be_taken=any(m.to_square==move.to_square and after.is_capture(m) for m in after.legal_moves)
                        if not can_be_taken:fail(8,'offer-advice-after-setup-is-over',c,u,mi)
                topic=e['topic'];checker_squares=set(after.checkers());mover=board.piece_at(move.from_square)
                if topic=='mate' and not after.is_checkmate():fail(8,'false-mate-topic',c,u,mi)
                if topic in ('check','captureCheck','contactCheck','forkCheck','doubleCheck') and not after.is_check():fail(8,'false-check-topic',c,u,mi)
                if topic=='blockade':
                    target=chess.parse_square(e['target']);pc=board.piece_at(target)
                    if not pc or pc.piece_type!=chess.PAWN or pc.color==board.turn or move.to_square!=target+(8 if pc.color else -8):fail(8,'false-blockade',c,u,mi)
                if topic=='mateThreat':
                    threatboard=after.copy();threatboard.turn=board.turn
                    mating=[]
                    for tm in list(threatboard.legal_moves):
                        test=threatboard.copy();test.push(tm)
                        if test.is_checkmate():mating.append(tm)
                    if not mating:fail(8,'no-actual-mating-threat',c,u,mi)
                    if not any(threatboard.attackers(board.turn,tm.to_square) for tm in mating):fail(8,'unprotected-mating-entry',c,u,mi)
                if topic=='maneuver':
                    stage=after.copy();stage.push_san(sans[answer_index+1]);fm=stage.parse_san(sans[answer_index+2]);stage.push(fm)
                    ts=[s for s in stage.attacks(fm.to_square) if stage.piece_at(s) and stage.color_at(s)!=board.turn and values[stage.piece_type_at(s)]>=3]
                    if fm.from_square!=move.to_square or len(ts)<2 or not stage.is_check():fail(8,'false-fork-staging',c,u,mi)
                if topic=='checkingOffer':
                    if not after.is_check() or answer_index+2>=len(sans):fail(8,'false-checking-offer',c,u,mi)
                    else:
                        test=after.copy();rm=test.parse_san(sans[answer_index+1])
                        if rm.to_square!=move.to_square or not test.is_capture(rm):fail(8,'offer-not-captured',c,u,mi)
                        test.push(rm);test.push_san(sans[answer_index+2])
                        if not test.is_check():fail(8,'no-forcing-followup-to-offer',c,u,mi)
                if topic=='doubleCheck' and len(checker_squares)<2:fail(8,'false-double-check',c,u,mi)
                if topic in ('fork','forkCheck'):
                    targets={s for s in after.attacks(move.to_square) if after.piece_at(s) and after.color_at(s)!=board.turn and values[after.piece_type_at(s)]>=3}
                    if len(targets)<2:fail(8,'false-fork',c,u,mi)
                    test=after.copy();test.turn=board.turn
                    legal_targets={m.to_square for m in test.legal_moves if m.from_square==move.to_square}
                    nonroyal={s for s in targets if after.piece_type_at(s)!=chess.KING}
                    if not (nonroyal & legal_targets):fail(8,'fork-capture-not-legal',c,u,mi)
                if topic in ('capture','captureCheck','removeGuard') and not board.is_capture(move):fail(8,'false-capture',c,u,mi)
                if topic=='removeGuard':
                    cap=move.to_square
                    guarded=[s for s in board.attacks(cap) if board.piece_at(s) and board.color_at(s)!=board.turn and board.piece_type_at(s)!=chess.KING and values[board.piece_type_at(s)]>=3]
                    if not guarded:fail(8,'false-guard-removal',c,u,mi)
                if topic in ('promotion','underPromotion') and not move.promotion:fail(8,'false-promotion',c,u,mi)
                if topic=='enPassant' and not board.is_en_passant(move):fail(8,'false-en-passant',c,u,mi)
                if topic=='escapeCheck' and (not board.is_check() or mover.piece_type!=chess.KING):fail(8,'false-escape',c,u,mi)
                if topic=='blockCheck' and (not board.is_check() or mover.piece_type==chess.KING):fail(8,'false-block',c,u,mi)
                if topic=='opposition':
                    fk=after.king(not board.turn);r=relation(move.to_square,fk)
                    if mover.piece_type!=chess.KING or distance(move.to_square,fk)!=2 or r not in ('file','rank'):fail(8,'false-opposition',c,u,mi)
                if topic=='discovered':
                    for item in e['uncovered']:
                        attacker=chess.parse_square(item['attacker']);target=chess.parse_square(item['target'])
                        if not after.piece_at(target) or after.color_at(target)==board.turn or target in board.attacks(attacker) or target not in after.attacks(attacker):fail(8,'false-discovered-target',c,u,mi,target=item['target'])
                if topic in ('attraction','exchangeAttraction'):
                    if answer_index+1>=len(sans):fail(8,'attraction-without-reply',c,u,mi)
                    else:
                        reply=after.parse_san(sans[answer_index+1]);capturer=after.piece_at(reply.from_square)
                        if reply.to_square!=move.to_square or not after.is_capture(reply):fail(8,'not-a-recapture',c,u,mi)
                        if topic=='attraction' and capturer.piece_type!=chess.KING:fail(8,'wrong-attracted-piece',c,u,mi)
                        if topic=='exchangeAttraction':
                            replyboard=after.copy();replyboard.push(reply)
                            if answer_index+2>=len(sans):fail(8,'attraction-without-payoff',c,u,mi)
                            else:
                                follow=replyboard.parse_san(sans[answer_index+2]);later=replyboard.copy();later.push(follow)
                                if follow.to_square!=reply.to_square and reply.to_square not in later.attacks(follow.to_square):fail(8,'recapturer-not-target-of-next-attack',c,u,mi)
                if e.get('line'):
                    line=e['line'];a=chess.parse_square(line['from']);target=chess.parse_square(line['to'])
                    if a not in checker_squares or target not in after.attacks(a) or relation(a,target)!=line['relation']:fail(8,'wrong-checking-line',c,u,mi)
                if topic=='pawnPush' and len(group)>1 and 'supported advance' in group[1].lower() and not after.attackers(board.turn,move.to_square):fail(8,'unsupported-advance-called-supported',c,u,mi)
                board=after
            if p.get('hints')!=groups[0]:fail(8,'stale-legacy-hints',c,u,0)
    return dict(totals=totals,failures=failures)

if __name__=='__main__':
    file=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'game/public/puzzles.json'
    result=audit(json.loads(file.read_text()),json.loads((ROOT/'audit/move_hint_evidence.json').read_text()),json.loads((ROOT/'audit/principle_reviews.json').read_text()))
    result['dataset_sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
    result['by_code']=dict(collections.Counter(f['code'] for f in result['failures']))
    print(json.dumps(result,indent=2))
    sys.exit(bool(result['failures']))
