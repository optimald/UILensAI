/**
 * Cloudflare Browser Audit Service — Client
 * 
 * Calls the deployed browser-audit Worker to collect runtime browser data
 * (axe-core, cookies, computed styles, console errors, CTA positions, network requests).
 * 
 * Graceful fallback: returns null if Worker URL is not configured or request fails.
 * All modules should treat null browserAudit as "not available" and fall back to existing logic.
 */

const BROWSER_AUDIT_TIMEOUT_MS = 50000; // Worker has 55s max, give 50s for HTTP

/**
 * Run a browser audit on a URL using the deployed CF Browser Audit Worker.
 * 
 * @param {string} url - The URL to audit
 * @param {object} [options={}] - Options
 * @param {number} [options.timeout] - Page load timeout in ms (default: 30000)
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @returns {Promise<object|null>} Audit results or null if unavailable
 * 
 * @example
 * const audit = await runBrowserAudit('https://example.com', { verbose: true });
 * if (audit) {
 *   console.log('axe violations:', audit.axeResults.violationCount);
 *   console.log('cookies:', audit.cookies.length);
 * }
 */
async function runBrowserAudit(url, options = {}) {
    const workerUrl = process.env.BROWSER_AUDIT_WORKER_URL;
    const authToken = process.env.BROWSER_AUDIT_AUTH_TOKEN;
    const verbose = options.verbose ?? false;

    if (!workerUrl) {
        if (verbose) {
            console.log('[BrowserAudit] ⏭️  Skipped: BROWSER_AUDIT_WORKER_URL not configured');
        }
        return null;
    }

    const startTime = Date.now();

    try {
        if (verbose) {
            console.log(`[BrowserAudit] 🚀 Requesting browser audit for ${url}`);
        }

        const headers = {
            'Content-Type': 'application/json',
        };
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BROWSER_AUDIT_TIMEOUT_MS);

        const response = await fetch(workerUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                url,
                options: {
                    timeout: options.timeout || 30000,
                },
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => `HTTP ${response.status}`);
            console.warn(`[BrowserAudit] ⚠️  Worker returned ${response.status}: ${errorText.substring(0, 200)}`);
            return null;
        }

        const data = await response.json();

        if (!data.success) {
            console.warn(`[BrowserAudit] ⚠️  Worker reported failure: ${data.error || 'unknown'}`);
            return null;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (verbose) {
            const axeViolations = data.axeResults?.violationCount ?? '?';
            const cookieCount = Array.isArray(data.cookies) ? data.cookies.length : '?';
            const consoleErrorCount = Array.isArray(data.consoleErrors) ? data.consoleErrors.length : '?';
            const ctaCount = Array.isArray(data.ctaPositions) ? data.ctaPositions.length : '?';
            const thirdPartyCount = data.networkRequests?.thirdPartyDomains?.length ?? '?';

            console.log(`[BrowserAudit] ✅ Browser audit completed in ${elapsed}s:`);
            console.log(`[BrowserAudit]    axe-core: ${axeViolations} violations`);
            console.log(`[BrowserAudit]    cookies: ${cookieCount}`);
            console.log(`[BrowserAudit]    console errors: ${consoleErrorCount}`);
            console.log(`[BrowserAudit]    CTAs measured: ${ctaCount}`);
            console.log(`[BrowserAudit]    3rd-party domains: ${thirdPartyCount}`);
        }

        return {
            axeResults: data.axeResults || null,
            cookies: data.cookies || [],
            computedStyles: data.computedStyles || [],
            consoleErrors: data.consoleErrors || [],
            ctaPositions: data.ctaPositions || [],
            networkRequests: data.networkRequests || {},
            timing: data.timing || {},
            auditUrl: data.url || url,
        };

    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (err.name === 'AbortError') {
            console.warn(`[BrowserAudit] ⏱️  Request timed out after ${elapsed}s`);
        } else {
            console.warn(`[BrowserAudit] ⚠️  Request failed after ${elapsed}s: ${err.message}`);
        }
        return null;
    }
}

module.exports = {
    runBrowserAudit,
};
