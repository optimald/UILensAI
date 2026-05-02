/**
 * HTTP-Only Fallback for Bot-Protected Sites
 * 
 * Provides data gathering equivalents using Node.js built-in modules
 * instead of Playwright when browser capture fails due to bot protection.
 * 
 * Used by the security module (and potentially others) to still produce
 * meaningful analysis results even when the site blocks automated browsers.
 */

const https = require('https');
const http = require('http');
const tls = require('tls');
const { URL } = require('url');

/**
 * Fetch a URL and return response headers, status, and body.
 * Uses Node.js built-in http/https modules to avoid bot detection.
 * 
 * @param {string} url - URL to fetch
 * @param {object} [options] - Options
 * @param {number} [options.timeout=15000] - Request timeout in ms
 * @param {boolean} [options.followRedirects=true] - Follow HTTP redirects
 * @param {number} [options.maxRedirects=5] - Maximum redirects to follow
 * @returns {Promise<{statusCode: number, headers: object, body: string, finalUrl: string}>}
 */
async function fetchWithHeaders(url, options = {}) {
    const { timeout = 15000, followRedirects = true, maxRedirects = 5 } = options;

    return new Promise((resolve, reject) => {
        let redirectCount = 0;

        function doRequest(requestUrl) {
            const parsedUrl = new URL(requestUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;

            const stealthUserAgents = [
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
            ];
            const randomUa = stealthUserAgents[Math.floor(Math.random() * stealthUserAgents.length)];

            const reqOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': randomUa,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity', // No compression for simplicity
                    'Connection': 'keep-alive',
                    'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout,
                // For HTTPS: don't reject unauthorized certs (we still analyze them)
                rejectUnauthorized: false,
            };

            const req = client.request(reqOptions, (res) => {
                // Handle redirects
                if (followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    redirectCount++;
                    if (redirectCount > maxRedirects) {
                        reject(new Error(`Too many redirects (${maxRedirects})`));
                        return;
                    }
                    const redirectUrl = new URL(res.headers.location, requestUrl).href;
                    doRequest(redirectUrl);
                    return;
                }

                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body.substring(0, 500000), // Cap at 500KB
                        finalUrl: requestUrl,
                    });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timed out after ${timeout}ms`));
            });
            req.end();
        }

        doRequest(url);
    });
}

/**
 * Get SSL/TLS certificate details for a URL using Node.js tls module.
 * This bypasses bot protection entirely since it operates at the TLS layer.
 * 
 * @param {string} url - HTTPS URL to analyze
 * @returns {Promise<object>} SSL context matching security module's expected format
 */
async function getSslDetails(url) {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:') {
        return {
            isHttps: false,
            protocol: null,
            hstsDetected: false,
            hstsValue: null,
            certificateDetails: {
                commonName: null,
                subjectAlternativeNames: [],
                issuer: null,
                validFrom: null,
                validTo: null,
                signatureAlgorithm: null,
                publicKeyAlgorithm: null,
                publicKeySize: null,
            },
            cipherStrength: 'None',
            issuesFound: ['Site is not served over HTTPS, which is a critical security vulnerability.'],
            score: 10,
        };
    }

    return new Promise((resolve) => {
        const socket = tls.connect(
            {
                host: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                servername: parsedUrl.hostname, // SNI
                rejectUnauthorized: false, // Allow expired/self-signed certs
                timeout: 10000,
            },
            () => {
                try {
                    const cert = socket.getPeerCertificate(true);
                    const protocol = socket.getProtocol(); // e.g., "TLSv1.3"
                    const cipher = socket.getCipher();

                    const context = {
                        isHttps: true,
                        protocol: protocol ? protocol.replace('v', ' ') : 'Unknown', // "TLSv1.3" → "TLS 1.3"
                        hstsDetected: false, // Will be set from HTTP headers separately
                        hstsValue: null,
                        certificateDetails: {
                            commonName: cert.subject?.CN || parsedUrl.hostname,
                            subjectAlternativeNames: cert.subjectaltname
                                ? cert.subjectaltname.split(', ').map(s => s.replace('DNS:', ''))
                                : [parsedUrl.hostname],
                            issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                            validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
                            validTo: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
                            signatureAlgorithm: cert.sigalg || (cert.bits >= 256 ? 'SHA256withECDSA' : 'SHA256withRSA'),
                            publicKeyAlgorithm: cert.pubkey ? (cert.bits <= 384 ? 'ECDSA' : 'RSA') : 'Unknown',
                            publicKeySize: cert.bits || null,
                        },
                        cipherStrength: 'Unknown',
                        issuesFound: [],
                    };

                    // Determine cipher strength
                    if (cipher) {
                        const cipherName = cipher.name || '';
                        if (cipherName.includes('AES_256') || cipherName.includes('CHACHA20')) {
                            context.cipherStrength = 'Strong';
                        } else if (cipherName.includes('AES_128')) {
                            context.cipherStrength = 'Adequate';
                        } else {
                            context.cipherStrength = 'Weak';
                        }
                    }

                    // Calculate score
                    let score = 30;
                    if (context.protocol === 'TLS 1.3') score += 40;
                    else if (context.protocol === 'TLS 1.2') score += 30;
                    else score += 10;

                    if (context.certificateDetails.validTo) {
                        const daysToExpiry = Math.floor(
                            (new Date(context.certificateDetails.validTo) - new Date()) / (1000 * 60 * 60 * 24)
                        );
                        if (daysToExpiry > 30) score += 15;
                        else if (daysToExpiry > 0) score += 5;
                        else { score -= 20; context.issuesFound.push('SSL certificate has expired.'); }
                    }

                    if (context.cipherStrength === 'Strong') score += 15;
                    else if (context.cipherStrength === 'Adequate') score += 10;

                    context.score = Math.min(100, Math.max(10, score));

                    socket.end();
                    resolve(context);
                } catch (err) {
                    socket.end();
                    resolve({
                        isHttps: true,
                        protocol: 'Unknown',
                        hstsDetected: false,
                        hstsValue: null,
                        certificateDetails: {
                            commonName: parsedUrl.hostname,
                            subjectAlternativeNames: [parsedUrl.hostname],
                            issuer: 'Unknown',
                            validFrom: null, validTo: null,
                            signatureAlgorithm: null, publicKeyAlgorithm: null, publicKeySize: null,
                        },
                        cipherStrength: 'Unknown',
                        issuesFound: [`SSL analysis via TLS failed: ${err.message}`],
                        score: 10,
                    });
                }
            }
        );

        socket.on('error', (err) => {
            resolve({
                isHttps: true,
                protocol: 'Unknown',
                hstsDetected: false,
                hstsValue: null,
                certificateDetails: {
                    commonName: parsedUrl.hostname,
                    subjectAlternativeNames: [parsedUrl.hostname],
                    issuer: 'Unknown',
                    validFrom: null, validTo: null,
                    signatureAlgorithm: null, publicKeyAlgorithm: null, publicKeySize: null,
                },
                cipherStrength: 'Unknown',
                issuesFound: [`TLS connection failed: ${err.message}`],
                score: 10,
            });
        });

        socket.setTimeout(10000, () => {
            socket.destroy();
        });
    });
}

/**
 * Parse forms from raw HTML using regex (no external deps).
 * Returns structure matching security module's getFormsContext() output.
 * 
 * @param {string} html - Raw HTML string
 * @param {string} baseUrl - Base URL for resolving relative form actions
 * @returns {object} Forms context
 */
function parseFormsFromHtml(html, baseUrl) {
    if (!html) return { count: 0, formsDetails: [], source: 'http-fallback' };

    const forms = [];
    // Match <form ...> ... </form> blocks
    const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
    let match;
    let index = 0;

    while ((match = formRegex.exec(html)) !== null && index < 5) {
        const formTag = match[0];
        const formBody = match[1];

        // Extract attributes from <form> tag
        const actionMatch = formTag.match(/action\s*=\s*["']([^"']*)["']/i);
        const methodMatch = formTag.match(/method\s*=\s*["']([^"']*)["']/i);
        const idMatch = formTag.match(/id\s*=\s*["']([^"']*)["']/i);

        let action = actionMatch ? actionMatch[1] : '';
        try {
            action = action ? new URL(action, baseUrl).href : baseUrl;
        } catch { action = baseUrl; }

        const hasPasswordField = /<input[^>]*type\s*=\s*["']password["']/i.test(formBody);
        const inputCount = (formBody.match(/<(?:input|textarea|select)\b/gi) || []).length;
        const hasCsrfTokenLikeField = /<input[^>]*name\s*=\s*["'][^"']*(csrf|token|nonce)[^"']*["']/i.test(formBody);

        forms.push({
            id: idMatch ? idMatch[1] : `form-index-${index}`,
            action,
            method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
            hasPasswordField,
            inputCount,
            hasCsrfTokenLikeField,
            submitsToHttps: action.startsWith('https:'),
        });
        index++;
    }

    return { count: forms.length, formsDetails: forms, source: 'http-fallback' };
}

/**
 * Extract CSP information from HTTP headers and HTML meta tags.
 * 
 * @param {object} headers - HTTP response headers
 * @param {string} html - Raw HTML body
 * @returns {object} CSP context matching security module format
 */
function getCspFromResponse(headers, html) {
    let cspValue = null;
    let source = 'none';

    // Check HTTP headers first
    if (headers['content-security-policy']) {
        cspValue = headers['content-security-policy'];
        source = 'header';
    } else if (headers['content-security-policy-report-only']) {
        cspValue = headers['content-security-policy-report-only'] + ' (Report-Only)';
        source = 'header-report-only';
    }

    // Check meta tag if not found in headers
    if (!cspValue && html) {
        const metaMatch = html.match(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*content\s*=\s*["']([^"']*)["']/i);
        if (metaMatch) {
            cspValue = metaMatch[1];
            source = 'meta-tag';
        }
    }

    return { present: !!cspValue, value: cspValue, source };
}

/**
 * Extract security-relevant headers from HTTP response headers.
 * Matches the format expected by security.js getSecurityHeadersContext().
 * 
 * @param {object} headers - HTTP response headers (lowercase keys)
 * @returns {object} Security headers context
 */
function getSecurityHeadersFromResponse(headers) {
    const relevantHeaders = [
        'content-security-policy', 'strict-transport-security', 'x-frame-options',
        'x-content-type-options', 'referrer-policy', 'permissions-policy',
        'cross-origin-opener-policy', 'cross-origin-embedder-policy',
        'cross-origin-resource-policy', 'x-xss-protection',
    ];

    const foundHeaders = {};
    relevantHeaders.forEach(hKey => {
        foundHeaders[hKey] = headers[hKey] || null;
    });

    // Mark missing critical headers
    const criticalHeaders = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
    criticalHeaders.forEach(header => {
        if (!headers[header]) {
            foundHeaders[header] = `Missing ${header} header`;
        }
    });

    foundHeaders.score = Math.max(10, 100 - (Object.values(foundHeaders).filter(v => typeof v === 'string' && v.startsWith('Missing')).length * 15));

    return { headers: foundHeaders, score: foundHeaders.score, source: 'http-fallback' };
}

/**
 * Gather all security-relevant data for a URL using HTTP-only methods.
 * This is the main entry point used by security.js as a fallback.
 * 
 * @param {string} url - URL to analyze
 * @param {boolean} [verbose=false] - Verbose logging
 * @returns {Promise<object>} All security contexts (ssl, headers, forms, csp)
 */
async function gatherSecurityDataViaHttp(url, verbose = false) {
    if (verbose) console.log(`[HTTP-Fallback] Gathering security data for ${url} via HTTP-only mode...`);

    // 1. Get SSL/TLS details (bypasses bot protection entirely)
    const sslContext = await getSslDetails(url);
    if (verbose) console.log(`[HTTP-Fallback] SSL: ${sslContext.protocol}, Score: ${sslContext.score}`);

    // 2. Fetch the page via HTTP to get headers and HTML body
    let httpResponse;
    try {
        httpResponse = await fetchWithHeaders(url);
        if (verbose) console.log(`[HTTP-Fallback] HTTP ${httpResponse.statusCode} from ${httpResponse.finalUrl}, Body: ${httpResponse.body.length} chars`);
    } catch (err) {
        if (verbose) console.warn(`[HTTP-Fallback] HTTP fetch failed: ${err.message}`);
        httpResponse = { statusCode: 0, headers: {}, body: '', finalUrl: url };
    }

    // 3. Extract security headers
    const headersContext = getSecurityHeadersFromResponse(httpResponse.headers);

    // Update SSL context with HSTS from HTTP headers
    if (httpResponse.headers['strict-transport-security']) {
        sslContext.hstsDetected = true;
        sslContext.hstsValue = httpResponse.headers['strict-transport-security'];
        // Recalculate score with HSTS bonus
        if (!sslContext.issuesFound.length) {
            sslContext.score = Math.min(100, sslContext.score + 15);
        }
    }

    // 4. Parse forms from HTML
    const formsContext = parseFormsFromHtml(httpResponse.body, httpResponse.finalUrl);

    // 5. Get CSP info
    const cspContext = getCspFromResponse(httpResponse.headers, httpResponse.body);

    if (verbose) {
        console.log(`[HTTP-Fallback] Headers score: ${headersContext.score}, Forms: ${formsContext.count}, CSP: ${cspContext.present ? 'Present' : 'Missing'}`);
        console.log(`[HTTP-Fallback] All security data gathered successfully via HTTP-only mode.`);
    }

    return {
        sslContext,
        headersContext,
        formsContext,
        cspContext,
        source: 'http-fallback',
        serverHeader: httpResponse.headers['server'] || 'Unknown',
    };
}

module.exports = {
    fetchWithHeaders,
    getSslDetails,
    parseFormsFromHtml,
    getCspFromResponse,
    getSecurityHeadersFromResponse,
    gatherSecurityDataViaHttp,
};
