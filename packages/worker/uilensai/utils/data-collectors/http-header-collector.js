/**
 * HTTP Header Collector
 * 
 * Extracts observable security and privacy signals directly from HTTP responses.
 * These deterministic signals are used by the scoring engine to calculate base scores.
 */
const { fetchWithHeaders, getSslDetails } = require('../http-fallback');

/**
 * Extracts deterministic security signals from HTTP response headers and SSL context
 * @param {string} url - Target URL
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Collected deterministic signals
 */
async function collectSecuritySignals(url, options = {}) {
    const { verbose = false } = options;
    
    // Default empty signals matching what scoring-engine expects
    const signals = {
        isHttps: url.startsWith('https://'),
        hasHsts: false,
        hasCsp: false,
        hasXFrameOptions: false,
        hasXContentTypeOptions: false,
        hasReferrerPolicy: false,
        hasPermissionsPolicy: false,
        secureCookieRatio: 1.0, // Default 1.0 if no cookies
        rawHeaders: {}
    };

    try {
        // 1. Get SSL Context to verify actual HTTPS
        const sslContext = await getSslDetails(url);
        signals.isHttps = sslContext.isHttps;

        // 2. Fetch headers directly
        const httpResponse = await fetchWithHeaders(url, { timeout: 10000 });
        const headers = httpResponse.headers || {};
        signals.rawHeaders = headers; // Store raw for AI context

        // 3. Extract exact booleans for scoring
        signals.hasCsp = !!(headers['content-security-policy'] || headers['content-security-policy-report-only']);
        signals.hasHsts = !!headers['strict-transport-security'];
        signals.hasXFrameOptions = !!headers['x-frame-options'];
        signals.hasXContentTypeOptions = !!headers['x-content-type-options'];
        signals.hasReferrerPolicy = !!headers['referrer-policy'];
        signals.hasPermissionsPolicy = !!(headers['permissions-policy'] || headers['feature-policy']);

        // 4. Calculate secure cookie ratio
        const setCookieHeaders = headers['set-cookie'];
        if (setCookieHeaders) {
            const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
            let secureCount = 0;
            
            cookies.forEach(cookie => {
                const isSecure = /;\s*secure\b/i.test(cookie);
                if (isSecure) secureCount++;
            });
            
            signals.secureCookieRatio = cookies.length > 0 ? (secureCount / cookies.length) : 1.0;
        }

        if (verbose) {
            console.log(`[HttpHeaderCollector] Collected security signals for ${url}: CSP=${signals.hasCsp}, HSTS=${signals.hasHsts}`);
        }

    } catch (err) {
        if (verbose) console.warn(`[HttpHeaderCollector] Failed to collect signals: ${err.message}`);
        // Return baseline signals (with whatever defaults we had)
    }

    return signals;
}

module.exports = {
    collectSecuritySignals
};
