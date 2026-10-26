"""Apply reviewed first-hint edits by category, without touching later hints.

Each category is a small editorial batch. Clues follow the dataset's puzzle /
player-move order; a source digest prevents applying them to a different order.
Run with --apply to write, or without arguments to validate the source mapping.
"""
import argparse
import hashlib
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'game/public/puzzles.json'
SOURCE_SHA256 = 'ec2ae85f820fab94aaa5810bad7bc9d525e48e10e7f1ef975bb43936101c659a'
CLUES = {}

def batch(category, text):
    CLUES[category] = text.strip().splitlines()

# Batch 1: mating patterns and the first two openings.
batch('back-rank-mate', '''
The king is boxed in beside an open line.
A defender is tied to the king's home rank.
The king's own pawns leave little room.
A heavy blocker is pinned near the king.
The king has little room behind its defenders.
A medium blocker stands beside the boxed king.
The king's shelter leaves few safe squares.
A heavy guard stands near the boxed king.
A heavy blocker is pinned on the file.
The king has little room near its home rank.
A heavy guard covers the king's shelter.
A heavy blocker shares the king's file.
The king's own blockers leave little room.
A heavy guard stands near an open file.
A heavy blocker stands beside the boxed king.
A heavy blocker stands near the trapped king.
A heavy piece shares the boxed king's rank.
A blocker stands near the trapped king.
A heavy defender stands on a clear file.
A heavy blocker shields the crowded king.
The king's blocker has too much to guard.
An open file leads toward the crowded king.
''')
batch('smothered-mate', '''
The king is crowded by its own pieces.
The boxed king has little room.
The king's own pieces form walls.
The king has few safe squares nearby.
A guard stands beside the crowded king.
The king's own guards seal its exits.
The king has little room among its defenders.
A guard crowds the king's shelter.
The king's defenders leave no room.
A guard stands near the cornered king.
The king is boxed in by its own guards.
The king's own pieces crowd its shelter.
A heavy guard stands near the crowded king.
The king is packed in by its own pieces.
The king is crowded by its defenders.
A heavy guard stands near the king's last exit.
The king has no empty square nearby.
The king's shelter is crowded.
A heavy guard stands beside the boxed king.
The king's own guards complete the cage.
''')
batch('anastasia-mate', '''
The king has little room near the edge.
A loose shield stands beside the edge king.
The king's nearby exits are covered.
A shield crowds the king's edge file.
The edge king has few safe exits.
A shield stands near the edge king.
The king is exposed on an edge file.
The king's shield stands near the edge.
One heavy guard covers the edge king.
A heavy blocker is pinned on the edge file.
A shield stands beside the crowded king.
An open file leads toward the edge king.
The king's shield stands beside an open file.
The king has little room on the edge file.
A shield stands beside the edge-bound king.
A heavy guard stands near the exposed king.
A heavy blocker is pinned near the edge king.
The edge king has a thin shield.
The king has few safe squares near the edge.
''')
batch('arabian-mate', '''
The cornered king has few safe exits.
An open line leads toward the cornered king.
The king has little room in the corner.
A heavy blocker stands near the cornered king.
An open line runs beside the crowded king.
A heavy blocker shields the edge king.
The cornered king stands near an open line.
A shield crowds the cornered king.
The king's nearby exits are covered.
A shield stands on the corner king's line.
The corner king has only one escape.
The king's escape squares are already covered.
The corner king's shelter is crowded.
An open file leads toward the corner king.
''')
batch('bodens-mate', '''
A defender stands near the boxed king.
The king is crowded beside open diagonals.
A blocker stands near the crowded king.
The king's own shield leaves little room.
The king has few safe exits.
A heavy blocker stands near the crowded king.
A heavy piece shares the king's diagonal.
A medium blocker is pinned near the king.
A blocker crowds the king's diagonal shelter.
The king has little room beside an open diagonal.
An open diagonal leads toward the crowded king.
The boxed king stands beside a diagonal.
The king's own heavy pieces crowd its shelter.
The king has little room among its defenders.
A loose blocker stands on the king's diagonal.
A heavy blocker is pinned near the crowded king.
''')
batch('double-bishop-mate', '''
The king has little room beside the diagonals.
An open diagonal leads toward the crowded king.
A pawn blocks a line near the king.
The king has few safe squares nearby.
A heavy blocker stands on the king's diagonal.
A blocker crowds the king's shelter.
A heavy blocker shields the crowded king.
The corner king has few safe exits.
A pawn blocks a line near the boxed king.
The corner king's exits are nearly closed.
The boxed king stands beside an open diagonal.
The king has little room among the diagonals.
''')
batch('dovetail-mate', '''
The king's diagonal exits are crowded.
The king's own blockers leave little room.
A medium guard and pawn crowd the king.
The edge king's diagonal escapes are crowded.
A pawn and heavy guard crowd the king.
The king's own side blocks its shelter.
The boxed king has few safe exits.
A pawn and heavy guard hem in the king.
The king has little room among its blockers.
Two pawns crowd the king's shelter.
The king is crowded by its own pieces.
The king stands between its own blockers.
Two pawns stand beside the exposed king.
The king's own side leaves little room.
Two guards crowd the king's shelter.
''')
batch('hook-mate', '''
The boxed king stands beside an open line.
A guard stands near the trapped king.
The king's nearby exits are covered.
The king's own medium pieces crowd its shelter.
Blockers crowd the king beside an open line.
The trapped king has few safe exits.
The boxed king has little room.
The king's nearby exits are still covered.
An open line runs near the boxed king.
A pawn crowds the king's shelter.
A loose valuable target stands near the crowded king.
The king is crowded by a pawn and guard.
''')
batch('french-defense', '''
A loose piece stands near the cramped center.
A loose heavy invader stands beside the king.
An unguarded medium piece stands beside the king.
The king's shelter is crowded.
A heavy piece is exposed near the king.
A guard near the king has too many jobs.
A heavy piece stands near a medium piece.
An active piece stands near the king.
A heavy piece has thin cover near the king.
A loose piece stands near the center.
An advanced pawn stands in front of two pieces.
An unguarded medium piece stands on an open diagonal.
One defender holds the pawn chain together.
A heavy piece is exposed near the king.
The king has very little room.
A heavy piece stands on a clear file.
A pinned defender has little freedom.
A heavy piece stands on a long diagonal.
A loose piece stands outside the pawn chain.
A medium piece stands near a heavy piece.
A loose medium piece stands beside the pawn chain.
A medium piece is pinned in front of its king.
The center pawns are under tension.
The king's diagonal is open before development is finished.
A center target has weak support.
Two pieces share an entry on the wing.
''')
batch('ruy-lopez', '''
A pinned defender has little freedom.
A heavy piece is exposed near a developed piece.
The king's shelter is crowded.
A valuable target stands beside the boxed king.
A heavy defender covers the king's home rank.
A heavy blocker is pinned beside the king.
A medium piece has thin support.
A medium piece stands beside the pawn shield.
The pawn chain stands near two targets.
A pawn blocks a line toward a heavy piece.
A heavy piece stands beside an open diagonal.
A medium piece depends on a nearby defender.
A medium piece stands in front of a heavy guard.
A loose heavy piece stands near the king's line.
A heavy piece shares a diagonal with its king.
A medium target stands near the exposed king.
A loose medium piece stands beside a heavy piece.
A medium piece has little cover near the center.
A medium piece stands beside a heavy piece.
An unguarded medium piece stands in the center.
''')
# Batch 2: central tension, development, and exposed pieces in openings.
batch('sicilian-defense', '''
A center pawn has lost its guard.
A loose pawn stands near the king.
A heavy piece has only one defender.
A medium piece stands on an open file.
A thin shield stands beside the boxed king.
The king's own pieces leave little room.
An unguarded medium piece stands outside the pawn fight.
A medium piece stands beside a heavy piece.
The king's shield pawn has thin support.
A small guard stands next to the king.
The king is trapped among its own pieces.
A loose piece stands near the center.
A medium piece stands on an open rank.
A medium piece depends on nearby guards.
A medium piece has one heavy guard.
A heavy piece stands near a medium piece.
A loose pawn stands near the king's line.
A medium piece stands on an open rank.
A center pawn has only one defender.
Two medium pieces stand near the center pawn.
A medium piece near the king has too many jobs.
Two pawns stand near an open entry.
''')
batch('caro-kann-defense', '''
An undefended medium piece stands in the center.
A heavy invader stands near a medium defender.
A central defender has little support.
A medium piece stands on an open file.
A heavy piece stands on a clear file.
A medium piece stands outside the pawn chain.
The king's shelter is crowded.
A heavy piece has only one guard.
A medium piece stands beside a heavy piece.
A medium piece near the king has thin cover.
A medium piece stands on an open diagonal.
A medium piece near the king has one guard.
A medium piece stands near a defending pawn.
An outside medium piece has one defender.
A heavy piece stands near an advanced pawn.
An unguarded piece stands away from the center.
A medium piece stands on an open rank.
The king's shelter leaves little room.
A heavy blocker stands beside the boxed king.
The center pawns are under tension.
An advanced pawn stands near a developed piece.
An active medium piece has no guard.
An advanced medium piece has few retreats.
An undefended pawn stands in the center.
An isolated center pawn has little help.
''')
batch('italian-game', '''
A pinned defender has little freedom.
A heavy piece stands near a defending pawn.
The king's shelter is exposed.
A medium piece stands near the exposed king.
An undefended piece stands near the attack.
A medium piece stands beside a heavy piece.
The center pawns are under tension.
A medium piece has only one matching guard.
A medium piece stands on an open line.
One defender holds the home rank together.
A heavy piece stands on a defender's diagonal.
An open line leads toward the exposed king.
An open diagonal leads toward the king.
A small guard stands beside the king.
A heavy piece stands near an active medium piece.
The king's shield cannot protect everything.
The center needs support before the attack grows.
The uncastled king faces an open center.
''')
batch('queens-gambit-declined', '''
A medium piece has one guard on the home rank.
A heavy piece stands near a central entry.
A medium piece near the king has thin support.
A heavy invader stands near a defending pawn.
The king has few safe exits.
A heavy invader stands on a clear file.
A heavy piece has only one defender.
A heavy piece shares a line with its king.
A heavy piece stands on an open rank.
An exposed medium piece stands near the king's line.
A medium piece stands beside a heavy piece.
A loose medium piece stands in the center.
The king and a heavy piece stand near each other.
A heavy piece has been left exposed.
A medium piece stands between an attacker and its king.
A medium piece stands near a defending pawn.
The uncastled king has little room.
The king's shelter has few safe exits.
A heavy piece has little cover on a clear file.
''')
batch('english-opening', '''
A medium piece has thin cover on a diagonal.
A loose medium piece stands among the center pawns.
A loose medium piece stands on a long diagonal.
A medium piece stands near a defending pawn.
An advanced center pawn has too few guards.
A medium piece stands on an open file.
A medium target has weak cover near the king.
A medium piece stands on an open rank.
A defender crowds the cramped king.
A heavy blocker stands in front of the king.
A loose heavy piece stands near the king.
A medium piece has lost its guard.
A medium piece has few exits deep in danger.
A medium piece stands on an open line.
A medium piece stands among the center pawns.
A medium piece stands on a defender's diagonal.
A central medium piece faces several attackers.
A medium piece stands on an open file.
''')
batch('philidor-defense', '''
Loose pieces stand near the crowded center.
A heavy invader stands near a medium defender.
A loose pawn stands beside a heavy piece.
A central medium piece has too few guards.
A medium piece stands on a defender's diagonal.
A medium piece near the king has thin cover.
The king's exits are blocked.
The boxed king has few safe squares.
Two targets stand close together.
A medium piece has been left exposed.
A loose heavy piece shares the king's line.
A medium piece stands on an open rank.
An advanced medium piece has little support.
A medium piece stands near a defending pawn.
An open line leads toward the trapped king.
A medium piece stands near a center pawn.
A medium piece stands near an advanced pawn.
A medium piece stands beside the king without support.
''')
batch('scandinavian-defense', '''
An advanced pawn has little support.
A medium piece stands on a defender's diagonal.
A heavy target stands behind the king's blocker.
A heavy piece stands on a clear file.
A loose heavy piece stands on an open file.
A heavy piece stands near an open file.
A heavy piece has weak cover on a clear file.
A heavy piece stands beside the king.
The king's shield helps guard a heavy piece.
An unguarded heavy piece stands on the center file.
A medium piece stands beside a heavy piece.
A heavy piece stands on a defender's diagonal.
A heavy piece stands on an open rank.
A medium piece stands near a defending pawn.
A center pawn guards the king's line.
A medium piece stands beside a heavy piece.
A loose heavy piece stands beside the boxed king.
''')
batch('scotch-game', '''
The king stands on a clear diagonal.
A pawn shields an exposed heavy piece.
A heavy piece stands on an open file.
A heavy piece is exposed in the center.
A heavy piece stands near a defending pawn.
An advanced pawn is blocked near promotion.
A heavy piece shares a diagonal with its king.
A heavy blocker is pinned to its king.
A medium piece has weak support on a diagonal.
A medium piece stands on an open file.
A defender stands near the boxed king.
A heavy blocker is pinned on the king's file.
A heavy piece has little cover near a pawn.
A heavy piece stands near a defending pawn.
A central medium piece has too little cover.
A heavy piece shares an open file with its king.
A medium piece stands near a defending pawn.
A pawn stands near a medium target.
A medium piece stands beside a heavy piece.
A medium defender stands in front of the king.
A loose heavy piece stands beside the boxed king.
''')
batch('modern-defense', '''
A thin pawn shield stands beside the king.
A loose heavy piece stands near a diagonal.
A heavy piece stands beside a medium defender.
A pawn guards the center.
A medium piece stands near a center pawn.
An unguarded heavy piece stands beside the king.
A medium piece stands among the center pawns.
A heavy piece stands near a medium defender.
A medium defender stands beside the king.
A medium piece stands on an open diagonal.
A medium defender stands near the king.
A medium invader has little support.
A heavy piece shares the king's diagonal.
A heavy piece stands near an active medium piece.
A central medium piece has too little support.
A heavy piece stands on an open rank.
''')
batch('four-knights-defense', '''
A heavy piece is exposed on a diagonal.
A heavy piece stands beside a matching defender.
A heavy piece stands near the pawn shield.
A medium piece stands beside a heavy piece.
A heavy piece stands near a defending pawn.
A medium piece has thin support on a diagonal.
A heavy piece stands on a clear file.
A shield pawn depends on a heavy guard.
A heavy target stands near the exposed king's rank.
A loose heavy piece stands near the king's line.
The king and a medium piece share a line.
A medium piece stands in front of a heavy piece.
A center pawn has too few guards.
Two medium pieces stand near a center pawn.
An advanced medium piece has little room.
A medium piece stands near a defending pawn.
A medium piece has few retreats near the shield.
A medium piece stands on an open diagonal.
The king's shield depends on a nearby defender.
A heavy piece stands near a medium target.
''')
# Batch 3: remaining openings and endgame relationships.
batch('kings-gambit-accepted', '''
Two medium pieces stand near an advanced pawn.
Two targets stand beside a center pawn.
A trapped heavy piece shares the king's route.
A corner heavy piece stands on an open diagonal.
A central heavy piece has too few guards.
A medium defender stands beside the king.
A heavy piece stands on a clear file.
A pawn shields a loose heavy piece.
A heavy piece is trapped near an open diagonal.
An exposed heavy piece stands near a guarded square.
Two heavy pieces stand near each other.
A loose heavy piece depends on the king.
An unguarded heavy piece stands on the center file.
A heavy piece has thin cover on a diagonal.
A heavy piece stands near a matching defender.
A loose medium piece stands on an open diagonal.
An advanced passer stands near the exposed king.
The exposed king stands beside an advanced pawn.
A pawn stands one step from promotion.
A heavy piece stands in front of a heavy attacker.
A medium defender stands near a corner target.
A pawn shields a loose corner heavy piece.
A loose heavy piece stands on an open line.
''')
batch('pirc-defense', '''
A heavy piece has no guard on a clear file.
A medium piece stands on a clear file.
A loose heavy piece depends on the king.
A loose heavy piece stands on the home rank.
A heavy piece stands on a clear file.
A central heavy piece has weak support.
A heavy piece has few retreats on an open file.
A medium piece stands near the exposed king.
A medium piece is exposed beside a heavy piece.
A heavy defender guards the thin pawn shield.
A heavy piece stands on a clear diagonal.
The edge king has only one corner escape.
A loose pawn shields the corner king.
A medium attacker has little support near the king.
An unprotected medium piece stands in the center.
A medium defender stands near the center pawns.
A pawn stands near a developed medium piece.
''')
batch('damiano-defense', '''
The uncastled king faces a clear diagonal.
Two pawns stand on the king's diagonal.
A pawn blocks the open diagonal to the king.
A heavy piece has only one medium guard.
A heavy piece stands near the uncastled king.
A heavy piece has been left exposed.
A medium piece has only one heavy guard.
A heavy piece stands near a medium defender.
An unguarded pawn shields an unprotected heavy piece.
A loose heavy piece stands on an open diagonal.
A heavy piece stands beside its heavy defender.
The king stands near a heavy target.
A heavy piece has been left exposed.
A medium piece stands on the king's line.
A heavy piece is pinned to its king.
A loose heavy invader stands on the home rank.
An unguarded pawn stands beside an unprotected heavy piece.
A heavy piece shares the king's diagonal.
A heavy piece stands near a guarded square.
A heavy piece has been left exposed.
''')
batch('rapport-jobava-system', '''
A medium piece stands near the exposed king.
A medium piece stands beside a heavy piece.
A medium piece stands near a defending pawn.
An unsupported heavy piece stands deep in the position.
A medium piece stands on an open line.
A heavy piece stands near the king.
The king stands near a heavy target.
A heavy piece has been left exposed.
An advanced medium piece has thin cover.
A medium checker stands near a defending pawn.
A medium checker still stands near an advanced pawn.
Two pawns shield a boxed-in heavy piece.
A pawn shields an exposed corner heavy piece.
A loose heavy piece stands on an open file.
A heavy piece has only one medium guard.
A medium piece stands on an open file.
A medium checker has only one medium guard.
A medium piece stands on a clear line.
The exposed king is crowded by its own pieces.
A heavy defender covers the exposed king's thin shelter.
A heavy piece has been left exposed.
''')
batch('vienna-game', '''
A medium target depends on a heavy defender.
A heavy piece stands near the king.
A heavy piece has been left exposed.
A corner heavy piece stands near the uncastled king.
A shield pawn faces pressure from two lines.
An unguarded pawn stands beside the first target.
The king's own pieces seal most exits.
The king's own valuable pieces crowd its shelter.
Three pawns crowd the exposed king.
A shield pawn faces pressure near the uncastled king.
A medium blocker shields the exposed king.
A medium blocker is pinned to its king.
An undefended medium piece stands on a clear line.
A medium piece stands on a clear file.
A heavy piece shares a diagonal with a medium piece.
A loose medium piece stands on an open diagonal.
The king's own pieces crowd its pawn shield.
A loose corner target stands near the king's lines.
A loose corner heavy piece stands on an open diagonal.
''')
batch('zugzwang', '''
The king stands beside its last pawn.
The kings face each other across one rank.
The kings still face each other across one rank.
The enemy king is tied to the locked center.
A loose pawn has little help from its king.
An unguarded pawn blocks a protected passer's path.
The king is far from its pawn blocker.
Two pawns face each other on the same file.
A medium piece depends on the king's defense.
Two pawns have no safe advance.
An unprotected pawn stands beside a blocking pawn.
An advanced pawn has no defender nearby.
Three pawns are frozen far from their king.
The king is tied to a guarded pawn.
A loose pawn stands beside the active king.
The locked pawns have no spare move.
The kings face each other beside locked pawns.
A weak outside pawn needs the king's help.
The king is too far from its loose pawn.
A loose pawn stands beside the active king.
A loose medium piece has little support.
The king cannot easily help its blocked pawn.
The king is tied to an outside passer.
''')
batch('pawn-endgame', '''
A loose pawn stands beside the king.
Two passers have clear lanes far from both kings.
Both passers are close to promotion.
A pawn stands one step from promotion.
One blocker faces two advanced pawns.
One blocker faces two connected passers.
A blocker stands beside the king near another passer.
The king is far from two connected pawns.
A protected passer has a clear lane.
An advanced pawn stands near the enemy king.
Three weak pawns have little help.
Two connected pawns stand far from their king.
A defender stands in front of another pawn.
A pawn has no second defender.
Two locked pawns stand far from their king.
A fixed pawn chain has no nearby support.
A pawn's next square is already controlled.
An advanced pawn stands unguarded beside the king.
The defending king stands near an enemy passer.
An unsupported passer is blocked beside the king.
The pawns are locked on both wings.
The king is held back from its pawns.
''')
batch('queen-endgame', '''
A thin pawn shield stands beside the king.
A pawn stands on the open line to its king.
The king has very few safe squares.
Two pawns crowd the king beside a clear diagonal.
A heavy piece stands beside its pawn defender.
The king is far from the central pawn chain.
The exposed king has only one escape.
An advanced pawn guards a heavy piece's landing square.
A heavy piece stands near an advanced pawn.
The king is trapped by its own pawns.
A loose pawn stands beside the crowded edge king.
A heavy blocker is pinned in front of its king.
The exposed king has only one safe step.
A heavy piece faces a guarded landing square.
A heavy piece has no second defender.
The king is tied to one wing.
The king's own pawn leaves little room.
''')
batch('queen-rook-endgame', '''
The exposed king has only one escape.
Two pawns crowd the king beside an open file.
A loose heavy blocker shares the king's line.
The king's own pawns leave little room.
An open rank runs beside the boxed king.
The king is crowded by its own pawns.
A heavy piece shares an open line with its king.
A heavy blocker stands beside the king.
Two distant passers have clear lanes.
The enemy passer is closer to promotion.
A passer is close to promotion with distant opposition.
The advanced pawn has support far from the defenders.
An advanced passer faces distant defenders.
A supported pawn has a clear lane.
A heavy piece stands near the exposed king's line.
The king and a heavy target share nearby lines.
A loose heavy piece stands on the other diagonal.
A heavy blocker stands beside the king.
The king is separated from its heavy defenders.
Two heavy defenders cannot cover the exposed king.
''')
batch('advanced-pawn', '''
A heavy defender has another target to watch.
The passer has a protected path near promotion.
A friendly heavy piece blocks the passer.
The passer's last square is empty.
A loose medium piece stands near the passer.
A loose medium piece stands beside a heavy attacker.
A medium blocker stands near the passer's final square.
The passer has a protected path.
The king has little room beside the passer.
The king's nearby escape squares are covered.
An enemy heavy piece blocks the passer.
A heavy blocker stands on the promotion square.
A medium piece watches the passer's next diagonal.
The medium defenders are far from the passer.
A medium defender guards the promotion square.
No piece controls the passer's final square.
A medium blocker stands in front of another target.
A medium piece stands beside the advanced passer.
''')
# Batch 4: endgame activity and tactical alignment.
batch('knight-endgame', '''
An advanced pawn faces distant medium defenders.
A medium defender is far from the passer.
The king stands beside a medium piece.
A medium piece stands beside the active king.
A pawn stands near a medium defender.
Two enemy passers stand near a medium piece.
A loose pawn has no guard.
One blocker faces two connected pawns.
A pawn blocker stands beside another pawn.
A medium defender is far from the passer.
A pawn is close to promotion far from its defender.
Two weak pawns stand beside the king.
The king has a route behind two weak pawns.
An unguarded medium piece stands near the king.
An unguarded medium piece stands beside the active king.
An advanced pawn has a clear lane.
An unsupported medium piece stands beside a passer.
The king stands beside its advanced pawn.
The king stands near an advanced pawn.
The king guards a loose pawn near another passer.
A loose pawn stands beside the attacking king.
''')
batch('pin', '''
A heavy guard depends on a pawn blocker.
A heavy piece stands on an open diagonal.
The king stands near a heavy piece.
A heavy piece has been left exposed.
A heavy piece shares an open rank with its king.
A heavy piece stands between an attacker and its king.
A pawn shield is pinned to the king.
A fixed pawn shield crowds the boxed king.
The king stands near a heavy piece.
A heavy piece has been left exposed.
A heavy defender watches an advanced passer.
A heavy defender has more than one duty.
A heavy defender is far from the passer.
A heavy piece faces a guarded offer.
A loose heavy piece stands on an open file.
A pawn blocker stands beside a heavy piece.
A loose heavy piece stands on an open file.
Nearby defenders crowd the boxed king.
Three pawns crowd the king behind a heavy shield.
A medium pinner stands near two connected pawns.
A medium pinner still stands near an advanced pawn.
''')
batch('fork', '''
A loose pawn stands near two valuable targets.
Two valuable targets stand near a loose pawn.
A loose heavy piece stands on an open diagonal.
The king and a heavy piece share nearby diagonals.
A loose heavy piece stands on another diagonal.
A heavy defender stands near the king.
A loose heavy piece stands beside a heavy defender.
A heavy piece shares a diagonal with a medium piece.
A loose medium piece stands on the same diagonal.
The king stands near a heavy target's line.
A heavy piece stands beside a heavy attacker.
The king stands near a heavy target.
A heavy piece stands on a nearby diagonal.
A heavy blocker is pinned in front of its king.
The king stands near two heavy defenders.
Two heavy pieces stand near the exposed king.
A loose heavy piece stands on an open diagonal.
The king stands near a medium target's line.
A loose medium piece stands near the king's line.
The king stands near a heavy target.
A heavy piece has been left exposed.
''')
batch('discovered-attack', '''
One blocker hides pressure on a heavy piece's file.
A loose heavy piece stands on the cleared file.
A heavy piece stands on a clear file.
One blocker hides pressure along a heavy piece's rank.
A loose heavy piece stands on the cleared rank.
One blocker hides pressure along a heavy piece's diagonal.
A loose heavy piece stands on an open diagonal.
Two blockers shield a heavy piece's file.
A loose heavy piece stands on the cleared file.
One blocker hides pressure on a heavy piece's file.
A heavy piece shares a file with its boxed king.
One blocker hides pressure on a heavy piece's file.
A loose heavy piece stands on an open file.
One blocker hides pressure on a heavy piece's file.
A loose heavy piece stands on the cleared file.
One blocker hides pressure along a heavy piece's rank.
A loose heavy piece stands on an open rank.
One blocker hides a line toward the king.
A heavy piece has been left exposed.
''')
batch('skewer', '''
A heavy piece and medium piece share a diagonal.
A loose medium piece stands on an open diagonal.
The exposed king stands near a loose heavy piece's file.
A heavy piece stands behind its king on a file.
A loose heavy piece stands on a clear file.
A heavy piece stands behind its king on a rank.
A loose heavy piece stands on an open rank.
A heavy piece and medium piece share a diagonal.
A loose medium piece stands on a clear diagonal.
A heavy piece stands behind its king's line.
A loose heavy piece stands on a clear file.
A heavy piece stands behind its king on a file.
A heavy piece stands alone on the open file.
A heavy piece and medium piece share a file.
A loose medium piece stands on a clear file.
Two heavy pieces stand near the exposed king's lines.
A loose heavy piece stands on a clear rank.
A corner heavy piece stands behind the king's line.
A loose heavy piece stands on an open rank.
A heavy piece shares a file near its king.
The king shields a distant heavy piece.
A loose heavy piece stands on an open file.
''')
batch('double-check', '''
One blocker hides a heavy attacker from the king.
One blocker hides a diagonal toward the king.
A heavy piece has been left exposed.
A loose medium defender stands near a hidden line.
The boxed king has few safe squares.
One blocker hides a heavy attacker from the king.
One heavy defender stands beside the boxed king.
The king's own defenders seal its exits.
A loose medium defender stands near the king's file.
A heavy piece and pawn crowd the king.
The king is trapped beside a passer.
An advanced pawn blocks a line near the king.
A loose medium defender stands near the king's file.
The king's own pieces close its escape squares.
A heavy defender stands near the king.
A heavy piece stands beside an advanced pawn.
A pawn blocks the king's file.
One blocker hides a diagonal toward the king.
One heavy defender stands beside the trapped king.
The king's nearby defenders leave little room.
''')
batch('attraction', '''
A heavy piece depends on the king's defense.
The king is exposed on a clear file.
A loose medium defender stands in front of the king.
An open file leads toward the exposed king.
A heavy blocker shields the king on an open file.
Two heavy pieces share a defensive duty near the king.
A heavy piece stands near the exposed king's lines.
A loose heavy piece stands near a waiting attacker.
Two loose pawns stand near the king.
A loose pawn stands beside the king.
A loose pawn shields the king's file.
The exposed king stands on an open file.
A loose pawn stands in front of the king.
A clear file leads toward the exposed king.
A loose pawn shields the king's file.
The king's own pieces seal its exits.
A heavy defender shares a file with the king.
A heavy piece shares a clear file with the king.
The boxed king has few safe squares.
A medium piece stands beside its heavy defender.
A loose pawn stands in front of a heavy piece.
A heavy piece has been left exposed.
''')
batch('x-ray-attack', '''
Two heavy pieces share a file behind a blocker.
A heavy blocker stands beside the boxed king.
Two heavy pieces stand in front of a hidden attacker.
A loose heavy blocker shields the king's rank.
A medium blocker shields a heavy piece's diagonal.
A loose medium blocker stands on a clear diagonal.
Two heavy defenders share duties near the king.
A heavy defender shares the king's rank.
A heavy blocker shares the king's rank.
A heavy blocker stands in front of the boxed king.
Two heavy pieces share a file behind a blocker.
A heavy blocker shields the boxed king's file.
An advanced pawn shields a heavy piece.
A loose heavy piece stands on a clear diagonal.
A pawn blocks a line toward a heavy piece.
Two heavy pieces stand together on one file.
A heavy blocker stands alone on a clear file.
A heavy defender shares the king's rank.
A loose heavy blocker stands beside the boxed king.
Two heavy pieces share a file behind a blocker.
A heavy blocker stands beside the boxed king.
''')
batch('deflection', '''
A medium defender stands beside the king's file.
A loose medium piece stands on an open file.
A medium defender stands beside the king.
A loose medium piece stands beside a heavy attacker.
One heavy defender covers two valuable targets.
A heavy piece has lost its defender.
A medium defender stands near two valuable targets.
A loose heavy piece stands on an open file.
A medium defender stands beside the king.
A loose medium piece stands on a clear rank.
A heavy defender stands near the king's rank.
A heavy piece depends on the king's defense.
A loose heavy piece stands on an open rank.
A heavy piece guards both a pawn and promotion.
A heavy defender is far from the passer.
Two targets stand near the king's lines.
A medium defender has two jobs.
A loose pawn stands on a heavy attacker's file.
A pawn guards a loose heavy piece.
A loose heavy piece has lost its pawn defender.
''')
batch('hanging-piece', '''
An undefended heavy piece stands on a clear file.
An unsupported heavy checker stands beside the king.
A medium piece has no defender.
An unsupported pawn checks beside the king.
A medium piece has no protection nearby.
A heavy piece has no nearby defender.
A medium piece has no guard.
An undefended medium piece stands on a clear rank.
A heavy piece stands on an open rank.
A medium piece has no nearby defender.
A medium piece has no guard nearby.
An undefended medium piece stands on a clear diagonal.
A medium piece stands on a clear diagonal.
An unsupported heavy piece stands beside the king.
A heavy checker stands near a medium piece.
''')
# Batch 5: defender duties, blocked lines, and special moves.
batch('sacrifice', '''
A loose pawn shields the king's file.
A heavy defender covers the exposed king's file.
A heavy blocker stands alone before the boxed king.
One heavy defender stands beside the boxed king.
Two pawns crowd the king far from its guard.
A loose pawn stands in front of the king.
The king's own pieces close its exits.
A heavy defender stands near the crowded king.
Only one heavy defender covers the king's shelter.
A heavy blocker shares the boxed king's rank.
A loose pawn stands in front of the king.
The exposed king has no pawn shield.
A heavy defender has too much to guard.
The boxed king's heavy defender stands one rank away.
A medium blocker stands in front of the king.
A heavy blocker stands beside the boxed king.
A loose pawn shields the king's file.
The exposed king has no shield on its file.
A heavy defender stands near the king's file.
One heavy defender stands beside the trapped king.
A heavy blocker shares the boxed king's rank.
A medium piece has one heavy guard.
A heavy piece stands near a clear diagonal.
A loose heavy piece stands on a clear diagonal.
A loose pawn stands in front of the king.
The exposed king has lost its pawn shield.
A loose pawn stands in front of the king.
The exposed king has few nearby defenders.
''')
batch('interference', '''
A loose heavy piece stands near the king's rank.
The king stands between two heavy pieces.
Two heavy pieces share a rank near the king.
The king separates a heavy target from its defender.
A heavy guard shares a diagonal with a medium target.
A pawn blocks a medium piece's defender.
A heavy piece shares a rank with a medium piece.
A blocker separates a medium target from its guard.
Two heavy pieces share a file near the king.
The king separates two heavy pieces.
A medium target stands beside an open rank.
A heavy guard shares a rank with a medium target.
A loose medium piece stands beside the blocker.
A heavy guard shares a diagonal with a pawn.
A loose pawn has lost its diagonal guard.
A medium piece stands beside a heavy target's diagonal.
A heavy defender guards a distant diagonal target.
A loose heavy piece stands on a clear diagonal.
Two heavy pieces share a rank near the king.
The king separates a heavy target from its defender.
''')
batch('trapped-piece', '''
A heavy attacker stands near a guarded offer.
A loose heavy piece stands on a nearby diagonal.
A heavy piece has few safe exits.
A heavy piece has been left exposed.
A heavy piece is boxed by its own side.
A heavy piece is still exposed.
A heavy piece has cramped exits.
A loose heavy piece stands on a clear diagonal.
A heavy attacker stands near a guarded target.
A heavy piece stands beside a medium defender.
Another attacker waits behind a heavy piece's target.
A loose heavy piece stands on a nearby diagonal.
A pawn shield crowds a heavy piece.
A medium blocker stands beside a pawn shield.
A loose heavy piece stands on an open file.
A heavy attacker stands near a guarded target.
A loose heavy piece stands on a defender's line.
A defender guards a heavy attacker's nearby target.
A heavy piece has been left exposed.
''')
batch('capturing-defender', '''
A heavy guard stands behind a loose pawn.
An unprotected pawn stands on an open file.
A medium piece stands on a clear file.
Two heavy defenders share a duty.
A loose heavy piece stands on an open file.
One medium piece guards another medium piece.
A loose medium piece stands on a nearby diagonal.
One medium piece guards another medium piece.
A loose medium piece has lost its guard.
A medium guard protects a pawn.
A loose pawn stands on an open file.
A loose medium piece stands beside a heavy attacker.
A medium guard has little protection.
A loose medium piece has lost its guard.
A medium guard protects a heavy target.
A loose heavy piece stands on an open file.
A heavy defender shares a rank with a pawn.
A loose pawn has lost its heavy guard.
A medium guard has little protection.
An unprotected medium piece stands on a clear diagonal.
''')
batch('clearance', '''
A blocker stands on a hidden attacker's file.
An open file leads toward the king.
The king guards a heavy piece near an open file.
A loose heavy piece stands on a clear diagonal.
A heavy piece blocks another heavy piece's file.
A heavy piece faces a guarded landing square.
A loose heavy piece stands on a nearby diagonal.
A medium target stands near a heavy piece's rank.
Two medium pieces share a rank.
A loose medium piece stands on an open rank.
One attacker waits behind another on the same rank.
A heavy piece stands near an open rank.
A loose heavy piece stands beside a heavy attacker.
A blocker stands on a diagonal near the king.
The boxed king has few safe exits.
A medium target depends on a heavy guard.
A heavy defender shares a file with a medium target.
A loose medium piece stands on a nearby diagonal.
A pawn shield blocks the king's file.
The boxed king has no pawn shield on its file.
A blocker stands on a heavy piece's route.
The king stands near a heavy piece.
A loose heavy piece stands beside a heavy attacker.
An advanced passer stands on a defender's line.
A medium blocker stands near the promotion square.
''')
batch('intermezzo', '''
Two heavy targets stand on different open lines.
A loose heavy piece still stands on an open file.
A medium target stands near a heavy piece's line.
A loose medium piece is still exposed.
A medium target stands away from the heavy pieces.
A loose medium piece stands on an open file.
A medium target stands near another heavy target.
A heavy target stands on a clear file.
A loose medium piece stands beside a heavy attacker.
Two medium targets stand near different attackers.
A loose medium piece stands beside a heavy attacker.
A heavy defender shares the king's file.
A loose heavy piece is still exposed.
A heavy piece stands near an exposed king.
A loose heavy piece still stands beside a pawn.
A loose medium piece stands near the exposed king.
A loose medium piece still stands beside a pawn.
A heavy target stands on a short diagonal.
A loose heavy piece remains on the original line.
''')
batch('en-passant', '''
Two advanced pawns have just become neighbors.
Two pawns have just become neighbors.
Two opposing pawns stand close together.
Two advanced pawns have just become neighbors.
A pawn stands near the king's diagonal.
A pawn blocks the line to its king.
Two pawns have just become neighbors.
A loose pawn stands near the king.
A loose medium piece stands beside a pawn.
Two advanced pawns have just become neighbors.
Two pawns have just become neighbors.
An advanced pawn stands near a king under pressure.
Two advanced pawns have just become neighbors.
A shield pawn has just gained a neighbor.
A loose heavy checker stands on a diagonal.
''')
batch('under-promotion', '''
A pawn stands one step from promotion.
Two heavy pieces restrict the king's exits.
An advanced pawn stands near the king.
The king stands near the promotion square.
A heavy defender stands near the promotion square.
A loose heavy piece shares the king's line.
A loose medium piece stands near an advanced pawn.
A heavy blocker stands on the promotion square.
Nearby pawns crowd the exposed king.
A heavy piece covers the king's escape.
A blocker stands on a long diagonal.
A heavy target stands beside an advanced pawn.
A heavy blocker stands on the promotion square.
A heavy defender stands near the promotion square.
A heavy piece is exposed on an open file.
Long-range pieces restrict the king's exits.
''')
batch('castling', '''
A loose heavy piece stands on a diagonal.
A medium piece is pinned in front of the king.
The enemy pieces are far from the king's clear route.
An open file leads toward the enemy king.
The enemy king has few safe squares near its file.
A loose heavy piece stands near the king's clear route.
The king still has a clear route to safety.
A medium checker stands near the king.
A medium piece is pinned in front of the king.
A medium piece blocks the king's short route.
A heavy blocker stands on a nearby diagonal.
The king's short route is now clear.
An open file leads toward the enemy king.
An unprotected heavy piece stands beside the king.
A heavy defender shares a file near its king.
A clear file stands beside the king's long route.
''')

PRINCIPLES = {
    'back-rank-mate': 'A back-rank attack grows when the king has no room.',
    'smothered-mate': "A king's own pieces can block its escape.",
    'anastasia-mate': 'An edge king needs safe escape squares.',
    'arabian-mate': 'An attack can trap a king against the corner.',
    'bodens-mate': 'Diagonal pressure can leave a crowded king short of exits.',
    'double-bishop-mate': 'Two attackers can cover different escape routes.',
    'dovetail-mate': "A king's own guards can become obstacles.",
    'hook-mate': 'Coordinated attackers can trap a crowded king.',
    'zugzwang': 'In zugzwang, having to move makes the position worse.',
    'pawn-endgame': 'King activity and pawn timing decide many pawn endgames.',
    'queen-endgame': 'An active heavy piece can exploit a thin king shield.',
    'queen-rook-endgame': 'Open lines matter when heavy pieces face an exposed king.',
    'advanced-pawn': 'An advanced pawn can stretch the defense.',
    'knight-endgame': 'Medium pieces can struggle to stop a distant passer.',
    'discovered-attack': 'A blocker can hide pressure from another attacker.',
    'skewer': 'A skewer puts two targets on one line.',
    'double-check': 'Two attackers can share a hidden line toward the king.',
    'attraction': 'A defender can be drawn away from a safe post.',
    'x-ray-attack': 'Pressure can reach beyond a piece that blocks a line.',
    'deflection': 'A defender may have more duties than it can handle.',
    'hanging-piece': 'A piece without enough protection can become a target.',
    'sacrifice': 'Giving up material can uncover a weakness in the defense.',
    'interference': 'A defender needs a clear line to protect its target.',
    'trapped-piece': 'Even a strong piece needs safe squares.',
    'capturing-defender': 'A target may depend on just one guard.',
    'clearance': 'A blocked line can hide an attack.',
    'intermezzo': 'A forcing threat can matter before an expected reply.',
    'en-passant': 'Pawn timing can change which captures are possible.',
    'under-promotion': 'Promotion is about what the position needs.',
    'castling': 'King safety and open lines can work together.',
}


def principle(category, old):
    """Retain the lesson without naming a moving piece or its exact route."""
    first = old.split('. ')[0].lower()
    if category in {'pawn-endgame', 'knight-endgame', 'queen-endgame', 'queen-rook-endgame'}:
        if 'fork' in first:
            return 'A fork threatens two targets at once.'
        if 'promotion' in first or 'passer' in first or 'passed' in first or 'race' in first:
            return 'An advanced pawn can stretch the defense.'
        if 'loose' in first or 'unguarded' in first or 'capture' in first:
            return 'A piece without enough protection can become a target.'
    if category in PRINCIPLES:
        # The endgame may already be a loose-target collection rather than a race.
        if category in {'knight-endgame', 'pawn-endgame'}:
            if 'loose' in first or 'unguarded' in first:
                return 'An active king can put weakly guarded pieces under pressure.'
        return PRINCIPLES[category]
    # Opening labels are not always the tactic. Keep the actual lesson from
    # the original move's principle rather than giving every opening one slogan.
    if 'fork' in first or 'double attack' in first or 'double-attack' in first or 'two threats' in first:
        return 'A fork threatens two targets at once.'
    if 'skewer' in first:
        return 'A skewer puts two targets on one line.'
    if 'pin' in first:
        return 'A pinned defender has less freedom to help.'
    if 'in-between' in first or 'intermezzo' in first:
        return 'A forcing threat can matter before an expected reply.'
    if 'overload' in first or 'two jobs' in first:
        return 'One defender may have more duties than it can handle.'
    if 'promotion' in first or 'passed pawn' in first:
        return 'An advanced pawn can stretch the defense.'
    if 'bait' in first or 'poison' in first or 'tempt' in first:
        return 'An inviting target may have hidden protection.'
    if 'decoy' in first or 'deflect' in first or 'attraction' in first or 'attract' in first:
        return 'A defender can be drawn away from another duty.'
    if 'clear' in first or 'uncover' in first or 'open a path' in first:
        return 'A blocked line can hide pressure on another target.'
    if 'mate' in first or 'mating' in first or 'king herding' in first or 'boxed' in first or 'cramped king' in first or ('king' in first and ('crowded' in first or 'shield' in first or 'pressure' in first)):
        return 'An attack grows stronger when the king has few exits.'
    if 'pawn tension' in first or 'pawn trade' in first or 'pawn lever' in first or 'pawn break' in first or 'center trade' in first or 'central break' in first:
        return 'Pawn tension can change which pieces have support.'
    if 'exchange' in first or 'trade' in first or 'recapture' in first:
        return 'An exchange can leave another target short of support.'
    if 'guard' in first or 'defender' in first or 'support' in first:
        return 'A piece with too few guards can become a target.'
    if 'loose' in first or 'exposed' in first or 'hanging' in first or 'overextend' in first:
        return 'An active piece can become a target without enough support.'
    if 'development' in first or 'develop' in first:
        return 'Quick development helps keep pieces safe and active.'
    if 'safe squares' in first or 'strand' in first or 'chase' in first:
        return 'Even an active piece needs safe squares.'
    if 'advanced pawn' in first:
        return 'A pawn needs a clear path to make progress.'
    if 'capture' in first or 'pieces face' in first:
        return 'An active piece can become a target without enough support.'
    if 'center' in first or 'central' in first or 'cramped' in first:
        return 'Central tension can leave pieces short of support.'
    if 'check' in first or 'forcing' in first:
        return 'A forcing threat can leave another target unguarded.'
    if 'diagonal' in first or 'file' in first or 'line' in first:
        return 'An open line can expose a poorly guarded target.'
    raise ValueError(f'Unreviewed principle for {category}: {old}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    raw = DATA.read_bytes()
    dataset = json.loads(raw)
    # Source guard: this editorial migration only applies to its reviewed source.
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit('Dataset changed; review puzzle order before applying this migration.')
    assert set(CLUES) == set(dataset), 'Category coverage changed'
    total = 0
    for category, category_data in dataset.items():
        groups = [g for p in category_data['puzzles'].values() for g in p['moveHints']]
        assert len(groups) == len(CLUES[category]), (category, len(groups), len(CLUES[category]))
        offset = 0
        for puzzle in category_data['puzzles'].values():
            for group in puzzle['moveHints']:
                clue = CLUES[category][offset]
                assert len(clue.split()) <= 12, (category, offset, clue)
                group[0] = principle(category, group[0]) + ' ' + clue
                offset += 1
            # Legacy readers see the same reviewed opening hint.
            puzzle['hints'][0] = puzzle['moveHints'][0][0]
        print(f'{category}: {offset} first hints reviewed')
        total += offset
    print(f'Total: {total} move-scoped first hints; {len(dataset)} category batches')
    if args.apply:
        DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
