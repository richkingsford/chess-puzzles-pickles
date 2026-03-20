#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const puzzlesPath = path.join(ROOT, 'game', 'public', 'puzzles.json');
const dictionaryPaths = [
  path.join(ROOT, 'dictionary.json'),
  path.join(ROOT, 'game', 'public', 'dictionary.json')
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const normalizeTagKey = (tag) => String(tag || '')
  .toLowerCase()
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-');

const getCategoryPuzzlesMap = (categoryData) => {
  if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) {
    return {};
  }

  if (
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return categoryData.puzzles;
  }

  const { type: _ignoredType, ...legacyPuzzleMap } = categoryData;
  return legacyPuzzleMap;
};

const definitionByTag = {
  'opening-themes': 'Recurring opening motifs such as development lead, king safety timing, and central control targets that guide tactical choices.',
  'endgame-technique': 'Practical endgame method: improve king activity, restrict counterplay, and convert advantages without allowing tricks.',
  'endgame-squeeze': 'A conversion method that gradually tightens piece and pawn restrictions until tactical gain or zugzwang appears.',
  'deflection-and-line-control': 'A tactical theme that deflects key defenders and then exploits newly opened or weakened files, ranks, and diagonals.',
  'alignment-and-double-attacks': 'A tactical pattern where aligned pieces are hit by forks, skewers, or discovered threats to win material or force mate.',
  'promotion-tactic': 'A tactical sequence where promotion threats decide the game by forcing concessions or creating an unstoppable new piece.',
  'piece-winning-tactics': 'Concrete tactical lines that win a piece through forks, pins, skewers, overload, or trapped-piece motifs.',
  'forcing-attacks': 'Attacking sequences driven by checks, captures, and immediate threats that severely limit defensive options.',
  'under-promotion': 'Promoting to a knight, rook, or bishop instead of a queen to force a precise tactical or mating result.',
  'four-knights-defense': 'An opening setup from the Four Knights family where Black prioritizes solid development and central control before tactical operations.',
  'kings-gambit-accepted': 'An opening where Black accepts White\'s gambit pawn and must balance material gain against rapid attacking play.',
  'damiano-defense': 'An early ...f6 response to 1.e4 e5 2.Nf3 that often creates tactical liabilities around king safety and development.',
  'rapport-jobava-system': 'A dynamic opening system with an early Nc3 and Bf4, aiming for initiative, flexible pawn structures, and tactical pressure.',
  'advanced-pawn': 'A far-advanced pawn that creates promotion threats, space gains, or tactical targets for both sides.',
  'attacking-f2-f7': 'A tactical focus on the f2/f7 weak point near the king, often using bishop-queen coordination and forcing checks.',
  'defensive-move': 'A precise defensive resource that neutralizes an immediate threat while preserving tactical or positional balance.',
  'queen-side-attack': 'An attacking plan focused on creating targets and open lines on the queenside through pawn breaks and piece pressure.',
  'calculation-and-tempo': 'Calculation that values move order and tempo, choosing lines where every move carries a direct threat or gain in initiative.',
  'en-passant': 'A special pawn capture that can be a tactical resource, often opening lines or changing key pawn-structure dynamics.',
  'short': 'A concise tactical sequence solved in a small number of forcing moves with limited branching.',
  'one-move': 'A puzzle solved by a single best move that immediately wins material, delivers mate, or secures decisive advantage.',
  'long': 'A multi-move tactical sequence requiring deeper calculation and sustained accuracy to convert the position.',
  'equality': 'A balancing resource that neutralizes disadvantage and reaches an objectively equal position through precise play.',
  'mixed': 'A puzzle combining tactical and positional elements where conversion depends on both concrete calculation and strategic judgement.',
  'knight-promotion': 'A promotion tactic where choosing a knight creates immediate forks, mating nets, or avoids stalemate issues.',
  'minor-piece-mate': 'A mating pattern where a bishop or knight plays a direct role in controlling key escape squares.',
  'short-combo': 'A brief tactical combination with forcing moves that quickly wins decisive material or reaches mate.',
  'rook-promotion': 'A rare promotion choice to a rook used to avoid stalemate or preserve precise checking geometry.',
  'pawn-pin': 'A pin motif where a pawn cannot move without exposing a more valuable piece, king safety weakness, or tactical loss.',
  'block': 'A tactical blocking move that cuts a line, interrupts coordination, or prevents a key defensive resource.',
  'long-combo': 'An extended tactical combination requiring accurate move-by-move calculation across several forcing turns.',
  'greek-gift': 'The classic bishop sacrifice on h7/h2 to drag the king into the open and launch a forcing kingside attack.',
  'stalemate-avoidance': 'A conversion motif where the winning side avoids stalemate traps while preserving a forced win.',
  'mating-attack': 'A coordinated attacking sequence aimed directly at checkmate through open lines and forcing continuations.',
  'pawn-race': 'An endgame theme where both sides push passed pawns and tempo accuracy decides who queens first.',
  'pawn-breakthrough': 'A pawn sacrifice or sequence that creates a passed pawn by breaking the opposing pawn chain.',
  breakthrough: 'A strategic-tactical rupture that breaks through a defensive structure to create decisive threats.',
  'forcing-check-sequence': 'A forcing sequence where consecutive checks constrain replies and drive the position toward a tactical goal.',
  'pawn-capture': 'A pawn capture used to open lines, remove key defenders, or improve the pawn structure for the resulting position.',
  'rook-mate': 'A checkmating pattern where a rook delivers mate by controlling rank or file escape squares, often with support from another piece.'
};

const puzzles = readJson(puzzlesPath);
let replacedWinMaterial = 0;
let addedTags = 0;

for (const [category, categoryData] of Object.entries(puzzles)) {
  const puzzleMap = getCategoryPuzzlesMap(categoryData);
  for (const puzzleData of Object.values(puzzleMap)) {
    if (!puzzleData || typeof puzzleData !== 'object') {
      continue;
    }

    const rawTags = Array.isArray(puzzleData.tags) ? puzzleData.tags.filter((tag) => typeof tag === 'string') : [];
    const seen = new Set();
    const normalizedCategory = normalizeTagKey(category);
    const normalizedAnswer = String(puzzleData.answer || '').toLowerCase();

    let tags = rawTags.map((tag) => {
      if (normalizeTagKey(tag) === 'win-material') {
        replacedWinMaterial += 1;
        return 'piece-winning-tactics';
      }
      return tag;
    }).filter((tag) => {
      const key = normalizeTagKey(tag);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    const fallbackCandidates = [
      normalizedAnswer.includes('#') ? 'mating-attack' : null,
      normalizedCategory,
      'forcing-sequence',
      'calculation'
    ].filter(Boolean);

    for (const candidate of fallbackCandidates) {
      if (tags.length >= 3) {
        break;
      }

      const key = normalizeTagKey(candidate);
      if (!seen.has(key)) {
        tags.push(candidate);
        seen.add(key);
        addedTags += 1;
      }
    }

    puzzleData.tags = tags;
  }
}

writeJson(puzzlesPath, puzzles);

const collectUsedTags = () => {
  const used = new Set();
  for (const categoryData of Object.values(puzzles)) {
    const puzzleMap = getCategoryPuzzlesMap(categoryData);
    for (const puzzleData of Object.values(puzzleMap)) {
      const tags = Array.isArray(puzzleData?.tags) ? puzzleData.tags : [];
      tags.forEach((tag) => used.add(normalizeTagKey(tag)));
    }
  }
  return used;
};

const usedTagKeys = collectUsedTags();

for (const dictionaryPath of dictionaryPaths) {
  const dictionary = readJson(dictionaryPath);
  if (!Array.isArray(dictionary.entries)) {
    dictionary.entries = [];
  }

  const existing = new Set();
  dictionary.entries.forEach((entry) => {
    existing.add(normalizeTagKey(entry?.name));
    if (Array.isArray(entry?.aliases)) {
      entry.aliases.forEach((alias) => existing.add(normalizeTagKey(alias)));
    }
  });

  for (const tagKey of usedTagKeys) {
    if (existing.has(tagKey)) {
      continue;
    }

    const definition = definitionByTag[tagKey]
      || `A practical tactical or strategic theme centered on ${tagKey.replace(/-/g, ' ')}. Plans should be justified by concrete calculation and resulting position quality.`;

    dictionary.entries.push({
      name: tagKey,
      definition,
      aliases: []
    });

    existing.add(tagKey);
  }

  dictionary.entries.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }));
  writeJson(dictionaryPath, dictionary);
}

console.log(JSON.stringify({ replacedWinMaterial, addedTags, usedTags: usedTagKeys.size }, null, 2));
