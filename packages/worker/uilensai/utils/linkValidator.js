/**
 * Link Validator Utility for UILensAI
 * 
 * Provides:
 * - extractLinksFromHtml()  — Parse all <a href> from HTML
 * - validateLinks()         — Batch HTTP HEAD with concurrency control
 * - followRedirectChain()   — Map 301→302→200 chains
 * - simHash()               — Content fingerprinting for duplicate detection
 * - findDuplicates()        — Near-duplicate page detection via SimHash + Hamming distance
 */

const { URL } = require('url');
const crypto = require('crypto');

// ============================================================================
// Link Extraction
// ============================================================================

/**
 * Extract all links from HTML content.
 * 
 * @param {string} html - Raw HTML
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {{ internal: Array<{href: string, anchor: string}>, external: Array<{href: string, anchor: string}> }}
 */
function extractLinksFromHtml(html, baseUrl) {
    const internal = [];
    const external = [];

    if (!html || !baseUrl) return { internal, external };

    let baseDomain;
    try {
        baseDomain = new URL(baseUrl).hostname.replace(/^www\./, '');
    } catch {
        return { internal, external };
    }

    // Match all <a> tags with href and optional anchor text
    const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    const seen = new Set();

    while ((match = linkRegex.exec(html)) !== null) {
        let href = match[1].trim();
        const anchorHtml = match[2] || '';
        const anchor = anchorHtml.replace(/<[^>]*>/g, '').trim().substring(0, 200);

        // Skip non-HTTP links
        if (/^(mailto:|tel:|javascript:|data:|#)/.test(href)) continue;

        // Resolve relative URLs
        try {
            const resolved = new URL(href, baseUrl);
            href = resolved.href;

            // Deduplicate
            if (seen.has(href)) continue;
            seen.add(href);

            const linkDomain = resolved.hostname.replace(/^www\./, '');
            if (linkDomain === baseDomain) {
                internal.push({ href, anchor });
            } else {
                external.push({ href, anchor });
            }
        } catch {
            // Skip malformed URLs
        }
    }

    return { internal, external };
}

// ============================================================================
// Link Validation (HTTP HEAD with concurrency control)
// ============================================================================

/**
 * Validate a batch of URLs via HTTP HEAD requests.
 * 
 * @param {string[]} urls - URLs to validate
 * @param {object} [options]
 * @param {number} [options.concurrency=10] - Max concurrent requests
 * @param {number} [options.timeoutMs=5000] - Per-request timeout
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<Array<{url: string, statusCode: number, ok: boolean, responseTimeMs: number, error: string|null}>>}
 */
async function validateLinks(urls, options = {}) {
    const { concurrency = 10, timeoutMs = 5000, verbose = false } = options;
    const results = [];
    const queue = [...urls];

    async function processOne(url) {
        const start = Date.now();
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
                headers: {
                    'User-Agent': 'UILensAI-LinkChecker/1.0',
                    'Accept': '*/*',
                },
            });
            const responseTimeMs = Date.now() - start;
            return {
                url,
                statusCode: response.status,
                ok: response.ok,
                responseTimeMs,
                error: null,
            };
        } catch (err) {
            const responseTimeMs = Date.now() - start;
            // Some servers reject HEAD, try GET with abort
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: AbortSignal.timeout(timeoutMs),
                    headers: {
                        'User-Agent': 'UILensAI-LinkChecker/1.0',
                        'Accept': 'text/html',
                    },
                });
                // We don't need the body, just the status
                try { await response.body?.cancel(); } catch { /* ignore */ }
                return {
                    url,
                    statusCode: response.status,
                    ok: response.ok,
                    responseTimeMs: Date.now() - start,
                    error: null,
                };
            } catch (getErr) {
                return {
                    url,
                    statusCode: 0,
                    ok: false,
                    responseTimeMs,
                    error: getErr.message || 'Request failed',
                };
            }
        }
    }

    // Process with concurrency control
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (index < queue.length) {
            const i = index++;
            const result = await processOne(queue[i]);
            results.push(result);
            if (verbose && !result.ok) {
                console.log(`[LinkValidator] ❌ ${result.statusCode} ${result.url} (${result.responseTimeMs}ms)`);
            }
        }
    });

    await Promise.all(workers);
    return results;
}

// ============================================================================
// Redirect Chain Mapping
// ============================================================================

/**
 * Follow a URL's redirect chain without auto-following redirects.
 * 
 * @param {string} url - Starting URL
 * @param {object} [options]
 * @param {number} [options.maxDepth=10] - Max redirect hops
 * @param {number} [options.timeoutMs=5000] - Per-hop timeout
 * @returns {Promise<{startUrl: string, chain: string[], finalUrl: string, statusCodes: number[], depth: number}>}
 */
async function followRedirectChain(url, options = {}) {
    const { maxDepth = 10, timeoutMs = 5000 } = options;
    const chain = [];
    const statusCodes = [];
    let currentUrl = url;

    for (let i = 0; i < maxDepth; i++) {
        try {
            const response = await fetch(currentUrl, {
                method: 'HEAD',
                redirect: 'manual', // Don't auto-follow
                signal: AbortSignal.timeout(timeoutMs),
                headers: { 'User-Agent': 'UILensAI-LinkChecker/1.0' },
            });

            statusCodes.push(response.status);

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) break;

                // Resolve relative redirects
                const nextUrl = new URL(location, currentUrl).href;
                chain.push(nextUrl);
                currentUrl = nextUrl;
            } else {
                break; // Not a redirect, we're done
            }
        } catch {
            break;
        }
    }

    return {
        startUrl: url,
        chain,
        finalUrl: currentUrl,
        statusCodes,
        depth: chain.length,
    };
}

// ============================================================================
// SimHash — Content Fingerprinting for Duplicate Detection
// ============================================================================

/**
 * Generate a 64-bit SimHash fingerprint for text content.
 * Used for near-duplicate detection.
 * 
 * @param {string} text - Text to fingerprint
 * @returns {BigInt} 64-bit SimHash value
 */
function simHash(text) {
    if (!text || text.length === 0) return 0n;

    // Normalize: lowercase, strip extra whitespace
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // Tokenize into shingles (3-word sliding window)
    const words = normalized.split(' ');
    if (words.length < 3) {
        // For very short text, hash the whole thing
        const hash = crypto.createHash('md5').update(normalized).digest();
        return hash.readBigUInt64BE(0);
    }

    const BITS = 64;
    const v = new Array(BITS).fill(0);

    for (let i = 0; i <= words.length - 3; i++) {
        const shingle = words.slice(i, i + 3).join(' ');
        const hash = crypto.createHash('md5').update(shingle).digest();
        const hashBits = hash.readBigUInt64BE(0);

        for (let bit = 0; bit < BITS; bit++) {
            if ((hashBits >> BigInt(bit)) & 1n) {
                v[bit]++;
            } else {
                v[bit]--;
            }
        }
    }

    let fingerprint = 0n;
    for (let bit = 0; bit < BITS; bit++) {
        if (v[bit] > 0) {
            fingerprint |= (1n << BigInt(bit));
        }
    }

    return fingerprint;
}

/**
 * Calculate Hamming distance between two SimHash values.
 * Lower = more similar. 0 = identical fingerprint.
 * 
 * @param {BigInt} a 
 * @param {BigInt} b 
 * @returns {number} Number of differing bits (0-64)
 */
function hammingDistance(a, b) {
    let xor = a ^ b;
    let count = 0;
    while (xor > 0n) {
        count += Number(xor & 1n);
        xor >>= 1n;
    }
    return count;
}

/**
 * Find near-duplicate pages from an array of page objects.
 * 
 * @param {Array<{url: string, text: string}>} pages - Pages with extracted text
 * @param {object} [options]
 * @param {number} [options.threshold=6] - Max Hamming distance to consider duplicate (lower = stricter)
 * @param {boolean} [options.verbose=false]
 * @returns {Array<{urls: string[], similarity: number}>} Groups of near-duplicate URLs
 */
function findDuplicates(pages, options = {}) {
    const { threshold = 6, verbose = false } = options;

    // Compute fingerprints
    const fingerprints = pages.map(p => ({
        url: p.url,
        hash: simHash(p.text),
    }));

    // Find pairs within threshold
    const duplicateGroups = [];
    const grouped = new Set();

    for (let i = 0; i < fingerprints.length; i++) {
        if (grouped.has(i)) continue;

        const group = [fingerprints[i].url];
        let bestSimilarity = 0;

        for (let j = i + 1; j < fingerprints.length; j++) {
            if (grouped.has(j)) continue;

            const dist = hammingDistance(fingerprints[i].hash, fingerprints[j].hash);
            if (dist <= threshold) {
                group.push(fingerprints[j].url);
                grouped.add(j);
                // Convert Hamming distance to similarity (0-1)
                const similarity = 1 - (dist / 64);
                bestSimilarity = Math.max(bestSimilarity, similarity);
            }
        }

        if (group.length > 1) {
            grouped.add(i);
            duplicateGroups.push({
                urls: group,
                similarity: Math.round(bestSimilarity * 1000) / 1000,
            });
            if (verbose) {
                console.log(`[LinkValidator] 🔄 Duplicate group (similarity: ${bestSimilarity.toFixed(3)}): ${group.join(', ')}`);
            }
        }
    }

    return duplicateGroups;
}

module.exports = {
    extractLinksFromHtml,
    validateLinks,
    followRedirectChain,
    simHash,
    hammingDistance,
    findDuplicates,
};
