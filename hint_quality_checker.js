const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || 'puzzles.json';
const resolvedInput = path.resolve(process.cwd(), inputPath);
const dictionaryPath = process.argv[3] || 'dictionary.json';
const resolvedDictionary = path.resolve(process.cwd(), dictionaryPath);
const outputPath = path.resolve(process.cwd(), 'hint_quality_report.json');

const PIECE_WORDS = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const TACTIC_WORDS = [
  'mate', 'check', 'combination', 'tactic', 'line', 'threat',
  'capture', 'promotion', 'defender', 'escape', 'tempo',
  'fork', 'pin', 'skewer', 'sacrifice', 'zugzwang', 'deflection',
  'clearance', 'interference', 'opening', 'endgame', 'center', 'file', 'diagonal'
];

const SPECIFIC_CLUE_WORDS = [
  'defender', 'line', 'escape', 'king', 'guard', 'shield', 'target',
  'promotion', 'pawn', 'check', 'checkmate', 'capture', 'tempo',
  'forcing', 'pressure', 'trap', 'trapped', 'overloaded', 'boxed'
];

const GENERIC_PHRASES = [
  'tactical idea', 'good move', 'find the move', 'look carefully',
  'the position is interesting', 'strong move here'
];

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadDictionary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dictionary not found: ${filePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const entries = Array.isArray(raw.entries) ? raw.entries : [];

  return entries.map((entry) => {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    return {
      name: String(entry.name || '').trim(),
      type: String(entry.type || '').trim(),
      definition: String(entry.definition || '').trim(),
      aliases: aliases.map((alias) => String(alias).trim()).filter(Boolean)
    };
  }).filter((entry) => entry.name);
}

function normalizeStructure(text) {
  let t = normalizeText(text);

  PIECE_WORDS.forEach((word) => {
    t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), '<piece>');
  });

  TACTIC_WORDS.forEach((word) => {
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${escaped}\\b`, 'g'), '<tactic>');
  });

  t = t
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, '<n>')
    .replace(/\b[a-z]{1,2}\b/g, (m) => (['a', 'an', 'to', 'of', 'in', 'on', 'at', 'by'].includes(m) ? m : '<w>'))
    .replace(/\s+/g, ' ')
    .trim();

  return t;
}

function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  const vowels = clean.match(/[aeiouy]+/g);
  let syllables = vowels ? vowels.length : 1;

  if (clean.endsWith('e')) syllables -= 1;
  if (clean.endsWith('le') && clean.length > 2) syllables += 1;

  return Math.max(1, syllables);
}

function fleschReadingEase(text) {
  const sentence = String(text || '').trim();
  if (!sentence) return 0;

  const words = sentence.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;

  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = words.length;
  const syllablesPerWord = syllables / words.length;

  return 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
}

function scoreToGrade(score) {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

function flattenPuzzles(data) {
  const rows = [];
  for (const category of Object.keys(data)) {
    const puzzles = data[category] || {};
    for (const url of Object.keys(puzzles)) {
      const row = puzzles[url] || {};
      rows.push({
        category,
        url,
        answer: row.answer || '',
        tags: Array.isArray(row.tags) ? row.tags : [row.tactic, row.tactic_family].filter(Boolean),
        hints: Array.isArray(row.hints) ? row.hints : []
      });
    }
  }
  return rows;
}

function uniquenessScore(hints) {
  if (!hints.length) return { score: 0, details: {} };

  const literalSet = new Set(hints.map((h) => normalizeText(h)));
  const structural = hints.map((h) => normalizeStructure(h));

  const bucket = new Map();
  for (const s of structural) {
    bucket.set(s, (bucket.get(s) || 0) + 1);
  }

  const maxTemplateCount = Math.max(...bucket.values());
  const maxTemplatePct = (maxTemplateCount / hints.length) * 100;
  const literalUniqPct = (literalSet.size / hints.length) * 100;

  const templateScore = maxTemplatePct <= 5
    ? 100
    : Math.max(0, 100 - ((maxTemplatePct - 5) * (100 / 30)));

  const score = Math.max(0, Math.min(100, (templateScore * 0.7) + (literalUniqPct * 0.3)));

  return {
    score,
    details: {
      totalHints: hints.length,
      literalUniquePercent: Number(literalUniqPct.toFixed(2)),
      maxTemplatePercent: Number(maxTemplatePct.toFixed(2)),
      uniqueTemplateCount: bucket.size
    }
  };
}

function tacticMentionMatchesHint(tacticOrTag, hint) {
  const t = normalizeText(tacticOrTag).replace(/-/g, ' ');
  const h = normalizeText(hint);

  if (!t) return false;
  if (h.includes(t)) return true;

  const aliases = {
    'mating net': ['mate', 'mating net', 'checkmate'],
    'removal of defender': ['defender', 'guard', 'overloaded'],
    'promotion tactic': ['promotion', 'promote', 'pawn'],
    'double check': ['double check', 'two checks'],
    'x ray attack': ['x ray', 'x-ray'],
    'trapped piece': ['trapped', 'trap']
  };

  const words = aliases[t] || [t];
  return words.some((w) => h.includes(w));
}

function specificityScore(rows) {
  if (!rows.length) return { score: 0, details: {} };

  let scoreSum = 0;

  for (const row of rows) {
    const hints12 = [row.hints[0] || '', row.hints[1] || ''];
    const primaryTag = row.tags[0] || '';

    let local = 0;

    const tacticHits = hints12.filter((h) => tacticMentionMatchesHint(primaryTag, h)).length;
    local += (tacticHits / 2) * 45;

    const clueHits = hints12.filter((h) => {
      const nh = normalizeText(h);
      return SPECIFIC_CLUE_WORDS.some((word) => nh.includes(word));
    }).length;
    local += (clueHits / 2) * 25;

    const answer = row.answer || '';
    const answerSignals = {
      mate: answer.includes('#'),
      check: answer.includes('+') || answer.includes('#'),
      promotion: answer.includes('='),
      capture: answer.includes('x')
    };

    let signalPoints = 0;
    const merged = normalizeText(hints12.join(' '));

    if (!answerSignals.mate || merged.includes('mate') || merged.includes('king')) signalPoints += 7.5;
    if (!answerSignals.check || merged.includes('check') || merged.includes('forcing')) signalPoints += 7.5;
    if (!answerSignals.promotion || merged.includes('promotion') || merged.includes('pawn')) signalPoints += 7.5;
    if (!answerSignals.capture || merged.includes('capture') || merged.includes('defender') || merged.includes('trade')) signalPoints += 7.5;

    local += signalPoints;

    const genericPenalty = GENERIC_PHRASES.some((p) => normalizeText(hints12.join(' ')).includes(p)) ? 15 : 0;
    local -= genericPenalty;

    scoreSum += Math.max(0, Math.min(100, local));
  }

  const score = scoreSum / rows.length;

  return {
    score,
    details: {
      evaluatedPuzzles: rows.length,
      method: 'tactic mention + clue words + answer-signal alignment - generic phrasing'
    }
  };
}

function readabilityScore(hints) {
  if (!hints.length) return { score: 0, details: {} };

  const values = hints.map((h) => fleschReadingEase(h));
  const avgFlesch = values.reduce((a, b) => a + b, 0) / values.length;

  const wordCounts = hints.map((h) => String(h).trim().split(/\s+/).filter(Boolean).length);
  const avgWords = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;

  let score = 0;

  if (avgFlesch >= 95) score += 60;
  else if (avgFlesch >= 85) score += 52;
  else if (avgFlesch >= 75) score += 45;
  else if (avgFlesch >= 65) score += 35;
  else score += 20;

  if (avgWords <= 10) score += 40;
  else if (avgWords <= 13) score += 34;
  else if (avgWords <= 16) score += 26;
  else score += 14;

  return {
    score: Math.max(0, Math.min(100, score)),
    details: {
      averageFleschReadingEase: Number(avgFlesch.toFixed(2)),
      averageWordsPerHint: Number(avgWords.toFixed(2)),
      targetAudience: 'Approx. 8-year-old reading level'
    }
  };
}

function coverageScore(rows, hints, dictionaryEntries) {
  const tagPool = normalizeText(rows.flatMap((r) => r.tags || []).join(' '));
  const hintPool = normalizeText(hints.join(' '));
  const combinedPool = normalizeText([
    ...rows.flatMap((r) => r.tags || []),
    ...hints
  ].join(' '));

  const official = dictionaryEntries.map((entry) => ({
    name: entry.name,
    terms: [entry.name, ...entry.aliases]
  }));

  const foundByCombined = [];
  const foundByTags = [];
  const foundByHints = [];
  const missing = [];

  for (const item of official) {
    const inTags = item.terms.some((term) => {
      const t = normalizeText(term);
      return t && tagPool.includes(t);
    });

    const inHints = item.terms.some((term) => {
      const t = normalizeText(term);
      return t && hintPool.includes(t);
    });

    const inCombined = item.terms.some((term) => {
      const t = normalizeText(term);
      return t && combinedPool.includes(t);
    });

    if (inTags) foundByTags.push(item.name);
    if (inHints) foundByHints.push(item.name);

    if (inCombined) foundByCombined.push(item.name);
    else missing.push(item.name);
  }

  const tagRatio = foundByTags.length / official.length;
  const hintRatio = foundByHints.length / official.length;
  const combinedRatio = foundByCombined.length / official.length;

  const score = ((combinedRatio * 0.7) + (tagRatio * 0.2) + (hintRatio * 0.1)) * 100;

  return {
    score,
    details: {
      covered: foundByCombined.length,
      total: official.length,
      percent: Number((combinedRatio * 100).toFixed(2)),
      tagCoverage: {
        covered: foundByTags.length,
        percent: Number((tagRatio * 100).toFixed(2))
      },
      hintCoverage: {
        covered: foundByHints.length,
        percent: Number((hintRatio * 100).toFixed(2))
      },
      weightedScore: Number(score.toFixed(2)),
      missing
    }
  };
}

function main() {
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input not found: ${resolvedInput}`);
    process.exit(1);
  }

  if (!fs.existsSync(resolvedDictionary)) {
    console.error(`Dictionary not found: ${resolvedDictionary}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8'));
  const dictionaryEntries = loadDictionary(resolvedDictionary);
  const rows = flattenPuzzles(raw);
  const allHints = rows.flatMap((r) => r.hints);

  const uniqueness = uniquenessScore(allHints);
  const specificity = specificityScore(rows);
  const readability = readabilityScore(allHints);
  const coverage = coverageScore(rows, allHints, dictionaryEntries);

  const summary = {
    inputFile: resolvedInput,
    dictionaryFile: resolvedDictionary,
    evaluatedAt: new Date().toISOString(),
    puzzleCount: rows.length,
    hintCount: allHints.length,
    grades: {
      uniqueness: {
        score: Number(uniqueness.score.toFixed(2)),
        grade: scoreToGrade(uniqueness.score),
        details: uniqueness.details
      },
      specificity: {
        score: Number(specificity.score.toFixed(2)),
        grade: scoreToGrade(specificity.score),
        details: specificity.details
      },
      readability: {
        score: Number(readability.score.toFixed(2)),
        grade: scoreToGrade(readability.score),
        details: readability.details
      },
      coverage: {
        score: Number(coverage.score.toFixed(2)),
        grade: scoreToGrade(coverage.score),
        details: coverage.details
      }
    }
  };

  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  console.log('Hint Quality Report');
  console.log('===================');
  console.log(`Input: ${resolvedInput}`);
  console.log(`Dictionary: ${resolvedDictionary}`);
  console.log(`Puzzles: ${summary.puzzleCount}`);
  console.log(`Hints: ${summary.hintCount}`);
  console.log('');
  console.log(`Uniqueness: ${summary.grades.uniqueness.score} (${summary.grades.uniqueness.grade})`);
  console.log(`Specificity: ${summary.grades.specificity.score} (${summary.grades.specificity.grade})`);
  console.log(`Readability: ${summary.grades.readability.score} (${summary.grades.readability.grade})`);
  console.log(`Coverage: ${summary.grades.coverage.score} (${summary.grades.coverage.grade})`);
  console.log('');
  console.log(`Report saved to: ${outputPath}`);

  if (summary.grades.coverage.details.missing.length) {
    console.log('');
    console.log('Missing coverage terms:');
    console.log(summary.grades.coverage.details.missing.join(', '));
  }
}

main();
