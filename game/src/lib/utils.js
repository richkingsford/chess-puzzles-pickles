
export function parsePuzzleUrl(url) {
    try {
        const analysisPart = 'lichess.org/analysis/';
        const idx = url.indexOf(analysisPart);
        if (idx === -1) return null;

        let fenAndParams = url.substring(idx + analysisPart.length);

        // Remove 'standard/' prefix if present
        if (fenAndParams.startsWith('standard/')) {
            fenAndParams = fenAndParams.substring(9);
        }

        // Remove query parameters
        const queryIdx = fenAndParams.indexOf('?');
        if (queryIdx !== -1) {
            fenAndParams = fenAndParams.substring(0, queryIdx);
        }

        // Decode URL encoding
        let fen = decodeURIComponent(fenAndParams);

        // Replace underscores with spaces (common formatted FEN)
        fen = fen.replace(/_/g, ' ');

        return fen.trim();
    } catch (e) {
        console.error("Failed to parse FEN from URL:", url, e);
        return null;
    }
}

export function formatPGN(moves) {
    // Simple formatter if needed, but we might just use the moves array directly
    return moves;
}
