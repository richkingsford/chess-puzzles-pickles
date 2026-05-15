const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || inputPath;
const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPuzzleMap(categoryData) {
  if (
    categoryData &&
    typeof categoryData === 'object' &&
    !Array.isArray(categoryData) &&
    categoryData.puzzles &&
    typeof categoryData.puzzles === 'object' &&
    !Array.isArray(categoryData.puzzles)
  ) {
    return categoryData.puzzles;
  }

  if (categoryData && typeof categoryData === 'object' && !Array.isArray(categoryData)) {
    const { type: _ignoredType, ...legacyPuzzleMap } = categoryData;
    return legacyPuzzleMap;
  }

  return {};
}

function firstAnswerMove(answer) {
  return String(answer || '').split(',')[0]?.trim() || '';
}

function firstMovePiece(answer) {
  const move = firstAnswerMove(answer);
  const firstChar = move[0];
  const pieceMap = {
    K: 'king',
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight'
  };

  return pieceMap[firstChar] || 'pawn';
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[_\s]+/g, '-');
}

function titleFromKey(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function includesAny(values, patterns) {
  const keys = values.map(normalizeKey);
  return patterns.some((pattern) => keys.some((key) => key.includes(pattern)));
}

function chooseConcept(category, tags, answer) {
  const keys = [category, ...tags].map(normalizeKey);
  const joined = keys.join(' ');

  const conceptMap = [
    { patterns: ['mate', 'checkmate'], concept: 'mating net' },
    { patterns: ['fork'], concept: 'fork' },
    { patterns: ['pin'], concept: 'pin' },
    { patterns: ['skewer'], concept: 'skewer' },
    { patterns: ['deflection'], concept: 'deflection' },
    { patterns: ['clearance'], concept: 'clearance' },
    { patterns: ['interference'], concept: 'interference' },
    { patterns: ['discovered-attack'], concept: 'discovered attack' },
    { patterns: ['double-check'], concept: 'double check' },
    { patterns: ['x-ray'], concept: 'x-ray pressure' },
    { patterns: ['trapped-piece'], concept: 'trapped piece' },
    { patterns: ['hanging-piece'], concept: 'loose piece' },
    { patterns: ['capturing-defender'], concept: 'removal of defender' },
    { patterns: ['sacrifice'], concept: 'sacrifice' },
    { patterns: ['intermezzo'], concept: 'in-between move' },
    { patterns: ['promotion', 'under-promotion'], concept: 'promotion tactic' },
    { patterns: ['en-passant'], concept: 'en passant resource' },
    { patterns: ['zugzwang'], concept: 'zugzwang' },
    { patterns: ['endgame'], concept: 'endgame resource' },
    { patterns: ['equality'], concept: 'drawing resource' },
    { patterns: ['opening', 'defense', 'gambit', 'game'], concept: 'opening tactic' },
    { patterns: ['attack'], concept: 'attacking pressure' }
  ];

  const match = conceptMap.find(({ patterns }) => patterns.some((pattern) => joined.includes(pattern)));
  if (match) return match.concept;

  if (String(answer || '').includes('#')) return 'mating net';
  if (String(answer || '').includes('+')) return 'forcing check';
  if (String(answer || '').includes('x')) return 'forcing capture';

  return titleFromKey(tags[0] || category || 'forcing tactic');
}

function chooseContext(category, tags, answer) {
  const values = [category, ...tags];
  const answerText = String(answer || '');

  if (includesAny(values, ['mate', 'checkmate']) || answerText.includes('#')) {
    return 'A defensive escape route is weaker than it looks.';
  }

  if (includesAny(values, ['opening', 'defense', 'gambit', 'game'])) {
    return 'A small development imbalance can be punished immediately.';
  }

  if (includesAny(values, ['endgame', 'equality', 'zugzwang'])) {
    return 'A precise resource changes the evaluation quickly.';
  }

  if (includesAny(values, ['promotion', 'advanced-pawn', 'under-promotion'])) {
    return 'A passed resource is close to becoming decisive.';
  }

  if (includesAny(values, ['attack'])) {
    return 'The defending side has one overloaded weakness.';
  }

  return 'A loose tactical detail can be exploited immediately.';
}

function chooseMoveType(answer) {
  const move = firstAnswerMove(answer);

  if (move.includes('#')) return 'mating move';
  if (move.includes('+')) return 'forcing check';
  if (move.includes('=')) return 'promotion move';
  if (move.includes('x')) return 'forcing capture';
  if (/O-O/.test(move)) return 'castling resource';

  return 'quiet forcing move';
}

function buildHints(category, puzzle) {
  const tags = Array.isArray(puzzle?.tags) ? puzzle.tags : [];
  const answer = String(puzzle?.answer || '');
  const move = firstAnswerMove(answer);
  const piece = firstMovePiece(answer);
  const concept = chooseConcept(category, tags, answer);
  const moveType = chooseMoveType(answer);

  return [
    chooseContext(category, tags, answer),
    `The key concept is ${concept}.`,
    `Start with your ${piece} to force the issue.`,
    `Make the ${moveType} with that ${piece}.`,
    move ? `Play ${move} first.` : 'Begin with the forcing move.'
  ];
}

function main() {
  const data = readJson(resolvedInput);
  let puzzleCount = 0;
  let hintCount = 0;

  for (const [category, categoryData] of Object.entries(data)) {
    const puzzles = getPuzzleMap(categoryData);

    for (const puzzle of Object.values(puzzles)) {
      if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
        continue;
      }

      puzzle.hints = buildHints(category, puzzle);
      puzzleCount += 1;
      hintCount += puzzle.hints.length;
    }
  }

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Rewrote ${hintCount} hints across ${puzzleCount} puzzles in ${resolvedOutput}`);
}

main();
