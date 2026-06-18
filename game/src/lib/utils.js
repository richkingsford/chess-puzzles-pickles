
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

export function getPublicAssetUrl(path) {
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPath = String(path || '').replace(/^\/+/, '');

    return `${normalizedBase}${normalizedPath}`;
}

function getCurrentBundleVersion() {
    if (typeof document === 'undefined') {
        return '';
    }

    const bundleScript = document.querySelector('script[type="module"][src*="/assets/index-"]');
    const bundleSrc = bundleScript?.getAttribute('src') || '';
    const bundleHash = bundleSrc.match(/\/assets\/index-([^/?#]+)\.js/)?.[1];

    return bundleHash || '';
}

export function getVersionedPublicAssetUrl(path) {
    const assetUrl = getPublicAssetUrl(path);
    const version = getCurrentBundleVersion() || import.meta.env.MODE || 'dev';
    const separator = assetUrl.includes('?') ? '&' : '?';

    return `${assetUrl}${separator}v=${encodeURIComponent(version)}`;
}

export function formatPGN(moves) {
    // Simple formatter if needed, but we might just use the moves array directly
    return moves;
}
