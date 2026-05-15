const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'game/public/puzzles.json';
const outputPath = process.argv[3] || inputPath;
const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

const CONCEPT_REPLACEMENTS = new Map([
  ['opening tactic', 'opening'],
  ['endgame resource', 'endgame'],
  ['forcing check', 'Check'],
  ['forcing capture', 'Capture'],
  ['attacking pressure', 'pressure'],
  ['en passant resource', 'en-passant'],
  ['drawing resource', 'equality'],
  ['x-ray pressure', 'X-Ray Attack']
]);

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

function replaceConceptHint(hint) {
  const match = String(hint || '').match(/^The key concept is\s+(.+?)\.$/i);
  if (!match) {
    return { hint, changed: false };
  }

  const currentConcept = match[1].trim();
  const replacement = CONCEPT_REPLACEMENTS.get(currentConcept.toLowerCase());

  if (!replacement) {
    return { hint, changed: false };
  }

  return {
    hint: `The key concept is ${replacement}.`,
    changed: true,
    from: currentConcept,
    to: replacement
  };
}

function main() {
  const data = readJson(resolvedInput);
  const replacements = {};
  let changedHintCount = 0;

  for (const categoryData of Object.values(data)) {
    const puzzles = getPuzzleMap(categoryData);

    for (const puzzle of Object.values(puzzles)) {
      if (!puzzle || typeof puzzle !== 'object' || !Array.isArray(puzzle.hints)) {
        continue;
      }

      puzzle.hints = puzzle.hints.map((hint) => {
        const result = replaceConceptHint(hint);

        if (result.changed) {
          changedHintCount += 1;
          const key = `${result.from} -> ${result.to}`;
          replacements[key] = (replacements[key] || 0) + 1;
        }

        return result.hint;
      });
    }
  }

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(data, null, 2)}\n`);
  console.log(JSON.stringify({
    changedHintCount,
    replacements,
    outputFile: resolvedOutput
  }, null, 2));
}

main();
