
import { Chess } from 'chess.js';

// Mock the parsePuzzleUrl logic from utils.js since we can't import local files easily in node without setup
function parsePuzzleUrl(url) {
    try {
        const analysisPart = 'lichess.org/analysis/';
        const idx = url.indexOf(analysisPart);
        if (idx === -1) return null;

        let fenAndParams = url.substring(idx + analysisPart.length);

        if (fenAndParams.startsWith('standard/')) {
            fenAndParams = fenAndParams.substring(9);
        }

        const queryIdx = fenAndParams.indexOf('?');
        if (queryIdx !== -1) {
            fenAndParams = fenAndParams.substring(0, queryIdx);
        }

        let fen = decodeURIComponent(fenAndParams);
        fen = fen.replace(/_/g, ' ');
        return fen.trim();
    } catch (e) {
        console.error("Failed to parse FEN from URL:", url, e);
        return null;
    }
}

// Actual data from puzzles_with_hints.json
const puzzles = {
    "test_1": "https://lichess.org/analysis/8/p5qQ/1p2k1r1/1P3p2/P1P1p3/1K1nP1B1/5P2/3R3R%20b%20-%20-%2010%2040",
    "test_2": "https://lichess.org/analysis/2r2rk1/pp1q1ppp/2p1n3/4P3/3P4/N1PQn2R/PP4PP/R5K1%20w%20-%20-%200%2021"
};

console.log("Starting FEN verification...");

Object.entries(puzzles).forEach(([name, url]) => {
    console.log(`\nTesting ${name}:`);
    const fen = parsePuzzleUrl(url);
    console.log(`Parsed FEN: '${fen}'`);

    try {
        const chess = new Chess();
        chess.load(fen);
        console.log("Success: chess.js loaded FEN.");
        console.log("Board FEN:", chess.fen());
        console.log("Turn:", chess.turn());
    } catch (e) {
        console.error("FAIL: chess.js rejected FEN.", e.message);
    }
});
