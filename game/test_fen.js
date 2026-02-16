
import { Chess } from 'chess.js';

const urls = [
    "https://lichess.org/analysis/8/p5qQ/1p2k1r1/1P3p2/P1P1p3/1K1nP1B1/5P2/3R3R%20b%20-%20-%2010%2040",
    "https://lichess.org/analysis/2r2rk1/pp1q1ppp/2p1n3/4P3/3P4/N1PQn2R/PP4PP/R5K1%20w%20-%20-%200%2021"
];

function parse(url) {
    try {
        const parts = url.split('lichess.org/analysis/');
        if (parts.length < 2) return null;
        return decodeURIComponent(parts[1]);
    } catch (e) {
        console.error("Error parsing", e);
        return null;
    }
}

urls.forEach(url => {
    console.log("\nTesting URL:", url);
    const fen = parse(url);
    console.log("Parsed FEN:", fen);

    try {
        const chess = new Chess();
        chess.load(fen);
        console.log("Success! FEN loaded.");
        console.log(chess.ascii());
    } catch (e) {
        console.error("Failed to load FEN:", e.message);
    }
});
