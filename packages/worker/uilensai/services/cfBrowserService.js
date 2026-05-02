/**
 * Cloudflare Browser Rendering Service
 * 
 * Integrates with Cloudflare's Browser Rendering REST API endpoints:
 * - /crawl   — Multi-page website crawling with Markdown extraction
 * - /json    — AI-powered structured data extraction
 * 
 * Docs: https://developers.cloudflare.com/browser-rendering/rest-api/
 */

const BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

// Default crawl configuration — targets high-value subpages
const DEFAULT_CRAWL_OPTIONS = {
    limit: 10,
    depth: 2,
    formats: ['markdown'],
    render: true,
    source: 'all', // Discover from both sitemaps and page links
    options: {
        includePatterns: [
            '**/contact**',
            '**/about**',
            '**/about-us**',
            '**/team**',
            '**/our-team**',
            '**/staff**',
            '**/services**',
            '**/our-services**',
            '**/locations**',
            '**/pricing**',
        ],
        includeExternalLinks: false,
        includeSubdomains: false,
    },
};

// Polling configuration
const POLL_INTERVAL_MS = 5000;  // 5 seconds between polls
const MAX_POLL_ATTEMPTS = 60;   // 5 minutes max wait

/**
 * Get Cloudflare credentials from environment.
 * @returns {{ accountId: string, apiToken: string } | null}
 */
function getCredentials() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_BR_API_TOKEN;

    if (!accountId || !apiToken) {
        return null;
    }

    return { accountId, apiToken };
}

// ============================================================================
// /crawl — Multi-page website crawling
// ============================================================================

/**
 * Initiate a crawl job on Cloudflare Browser Rendering.
 * 
 * @param {string} url - The starting URL to crawl
 * @param {object} [options={}] - Override default crawl options
 * @param {number} [options.limit] - Max pages to crawl
 * @param {number} [options.depth] - Max crawl depth
 * @param {string[]} [options.formats] - Output formats ('html', 'markdown', 'json')
 * @param {boolean} [options.render] - Whether to render JS (true) or static HTML (false)
 * @param {string[]} [options.includePatterns] - URL patterns to include
 * @param {string[]} [options.excludePatterns] - URL patterns to exclude
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @returns {Promise<{ jobId: string } | null>} Job ID or null if credentials missing
 */
async function initiateCrawl(url, options = {}) {
    const creds = getCredentials();
    if (!creds) {
        if (options.verbose) {
            console.warn('[CfBrowser] ⚠️  Skipping deep crawl: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_BR_API_TOKEN not set');
        }
        return null;
    }

    const { accountId, apiToken } = creds;
    const endpoint = `${BASE_URL}/${accountId}/browser-rendering/crawl`;

    // Merge user options with defaults
    const crawlBody = {
        url,
        limit: options.limit ?? DEFAULT_CRAWL_OPTIONS.limit,
        depth: options.depth ?? DEFAULT_CRAWL_OPTIONS.depth,
        formats: options.formats ?? DEFAULT_CRAWL_OPTIONS.formats,
        render: options.render ?? DEFAULT_CRAWL_OPTIONS.render,
        source: options.source ?? DEFAULT_CRAWL_OPTIONS.source,
        options: {
            ...DEFAULT_CRAWL_OPTIONS.options,
            ...(options.includePatterns ? { includePatterns: options.includePatterns } : {}),
            ...(options.excludePatterns ? { excludePatterns: options.excludePatterns } : {}),
        },
    };

    if (options.verbose) {
        console.log(`[CfBrowser] 🕷️  Initiating crawl for ${url}`);
        console.log(`[CfBrowser]    Limit: ${crawlBody.limit}, Depth: ${crawlBody.depth}, Render: ${crawlBody.render}`);
        console.log(`[CfBrowser]    Include patterns: ${crawlBody.options.includePatterns?.join(', ') || 'all'}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(crawlBody),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            const errorMsg = data.errors?.[0]?.message || `HTTP ${response.status}`;
            console.error(`[CfBrowser] ❌ Failed to initiate crawl: ${errorMsg}`);
            return null;
        }

        const jobId = data.result;
        if (options.verbose) {
            console.log(`[CfBrowser] ✅ Crawl job initiated: ${jobId}`);
        }

        return { jobId };

    } catch (error) {
        console.error(`[CfBrowser] ❌ Network error initiating crawl: ${error.message}`);
        return null;
    }
}

/**
 * Poll for crawl job results until completion or timeout.
 * 
 * @param {string} jobId - The crawl job ID
 * @param {object} [options={}] - Polling options
 * @param {number} [options.pollIntervalMs] - Milliseconds between polls
 * @param {number} [options.maxAttempts] - Max polling attempts
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @returns {Promise<object | null>} Crawl results or null on failure
 */
async function pollForResults(jobId, options = {}) {
    const creds = getCredentials();
    if (!creds) return null;

    const { accountId, apiToken } = creds;
    const pollInterval = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    const maxAttempts = options.maxAttempts ?? MAX_POLL_ATTEMPTS;
    const verbose = options.verbose ?? false;

    const statusEndpoint = `${BASE_URL}/${accountId}/browser-rendering/crawl/${jobId}`;

    // Initial delay: CF needs a moment to register the crawl job before polling
    const initialDelay = options.initialDelayMs ?? 3000;
    if (verbose) {
        console.log(`[CfBrowser] ⏳ Waiting ${initialDelay}ms before first poll...`);
    }
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Use ?limit=1 for lightweight status checks
            const statusResponse = await fetch(`${statusEndpoint}?limit=1`, {
                headers: { 'Authorization': `Bearer ${apiToken}` },
            });

            const statusData = await statusResponse.json();

            if (!statusResponse.ok || !statusData.success) {
                const errorMsg = statusData.errors?.[0]?.message || `HTTP ${statusResponse.status}`;
                // Treat 'not found' and transient errors as retryable for the first 10 attempts
                if (attempt <= 10) {
                    if (verbose) {
                        console.log(`[CfBrowser] ⏳ Poll ${attempt}: ${errorMsg} (retrying...)`);
                    }
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                console.error(`[CfBrowser] ❌ Poll error (attempt ${attempt}): ${errorMsg}`);
                return null;
            }

            const { status, total, finished } = statusData.result;

            if (verbose && attempt % 3 === 0) {
                console.log(`[CfBrowser] ⏳ Poll ${attempt}/${maxAttempts}: status=${status}, ${finished || 0}/${total || '?'} pages`);
            }

            if (status !== 'running') {
                if (verbose) {
                    console.log(`[CfBrowser] 🏁 Crawl ${status}: ${finished || 0}/${total || 0} pages processed`);
                }

                // Job reached terminal state — fetch full results
                if (status === 'completed' || (finished && finished > 0)) {
                    const fullResponse = await fetch(`${statusEndpoint}?status=completed`, {
                        headers: { 'Authorization': `Bearer ${apiToken}` },
                    });
                    const fullData = await fullResponse.json();

                    if (fullData.success && fullData.result) {
                        return fullData.result;
                    }
                }

                // Non-success terminal states
                if (status !== 'completed') {
                    console.warn(`[CfBrowser] ⚠️  Crawl ended with status: ${status}`);
                }
                return statusData.result;
            }

        } catch (error) {
            console.error(`[CfBrowser] ❌ Poll network error (attempt ${attempt}): ${error.message}`);
            // Continue polling on transient network errors
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.error(`[CfBrowser] ❌ Crawl polling timed out after ${maxAttempts} attempts (${(maxAttempts * pollInterval / 1000).toFixed(0)}s)`);
    return null;
}

/**
 * High-level crawl orchestrator: initiate + poll + extract results.
 * 
 * @param {string} url - The URL to crawl
 * @param {object} [options={}] - Crawl and polling options
 * @returns {Promise<{ pages: Array<{ url: string, markdown: string, title: string, status: string }>, metadata: { browserSecondsUsed: number, total: number, finished: number, status: string } } | null>}
 */
async function crawlWebsite(url, options = {}) {
    const verbose = options.verbose ?? false;

    // Step 1: Initiate
    const initResult = await initiateCrawl(url, options);
    if (!initResult) return null;

    const { jobId } = initResult;

    // Step 2: Poll
    const result = await pollForResults(jobId, {
        pollIntervalMs: options.pollIntervalMs,
        maxAttempts: options.maxAttempts,
        verbose,
    });

    if (!result) return null;

    // Step 3: Extract and normalize
    const records = result.records || [];
    const pages = records
        .filter(r => r.status === 'completed' && r.markdown)
        .map(r => ({
            url: r.url || r.metadata?.url || '',
            markdown: r.markdown || '',
            title: r.metadata?.title || '',
            httpStatus: r.metadata?.status || 0,
        }));

    if (verbose) {
        console.log(`[CfBrowser] 📄 Extracted ${pages.length} pages with Markdown content:`);
        pages.forEach(p => console.log(`[CfBrowser]    - ${p.title || p.url} (${p.markdown.length} chars)`));
    }

    return {
        pages,
        metadata: {
            jobId,
            browserSecondsUsed: result.browserSecondsUsed || 0,
            total: result.total || 0,
            finished: result.finished || 0,
            status: result.status || 'unknown',
        },
    };
}

// ============================================================================
// /json — AI-powered structured data extraction
// ============================================================================

/**
 * Extract structured data from a URL using Cloudflare's /json endpoint.
 * Uses Workers AI (or custom model) to parse page content into typed JSON.
 * 
 * @param {string} url - The URL to extract data from
 * @param {object} options - Extraction options
 * @param {string} [options.prompt] - Natural language prompt guiding extraction
 * @param {object} [options.responseFormat] - JSON schema for structured output
 * @param {object} [options.gotoOptions] - Page load options (waitUntil, timeout)
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @returns {Promise<object | null>} Extracted data or null on failure
 * 
 * @example
 * // With prompt + schema
 * const data = await extractStructuredData('https://example.com/contact', {
 *   prompt: 'Extract business contact information',
 *   responseFormat: {
 *     type: 'json_schema',
 *     schema: {
 *       type: 'object',
 *       properties: {
 *         emails: { type: 'array', items: { type: 'string' } },
 *         phones: { type: 'array', items: { type: 'string' } },
 *         address: { type: 'string' },
 *       }
 *     }
 *   }
 * });
 */
async function extractStructuredData(url, options = {}) {
    const creds = getCredentials();
    if (!creds) {
        if (options.verbose) {
            console.warn('[CfBrowser] ⚠️  Skipping /json extraction: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_BR_API_TOKEN not set');
        }
        return null;
    }

    const { accountId, apiToken } = creds;
    const endpoint = `${BASE_URL}/${accountId}/browser-rendering/json`;
    const verbose = options.verbose ?? false;

    // Build request body
    const body = { url };

    if (options.prompt) {
        body.prompt = options.prompt;
    }
    if (options.responseFormat) {
        body.response_format = options.responseFormat;
    }

    // Require at least one of prompt or response_format
    if (!body.prompt && !body.response_format) {
        console.error('[CfBrowser] ❌ extractStructuredData requires at least one of: prompt, responseFormat');
        return null;
    }

    // Default to waiting for JS-heavy sites
    body.gotoOptions = options.gotoOptions || {
        waitUntil: 'networkidle0',
        timeout: 30000,
    };

    if (verbose) {
        console.log(`[CfBrowser] 🧠 Extracting structured data from ${url}`);
        if (body.prompt) console.log(`[CfBrowser]    Prompt: "${body.prompt.substring(0, 80)}${body.prompt.length > 80 ? '...' : ''}"`);
        if (body.response_format) console.log(`[CfBrowser]    Schema: ${JSON.stringify(body.response_format.schema?.properties ? Object.keys(body.response_format.schema.properties) : 'custom')}`);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            const errorMsg = data.errors?.[0]?.message || `HTTP ${response.status}`;
            console.error(`[CfBrowser] ❌ /json extraction failed: ${errorMsg}`);
            return null;
        }

        if (verbose) {
            const resultKeys = data.result ? Object.keys(data.result) : [];
            console.log(`[CfBrowser] ✅ Structured data extracted: ${resultKeys.length} top-level keys [${resultKeys.join(', ')}]`);
        }

        return data.result;

    } catch (error) {
        console.error(`[CfBrowser] ❌ Network error during /json extraction: ${error.message}`);
        return null;
    }
}

// ============================================================================
// Predefined extraction schemas for common business data
// ============================================================================

const EXTRACTION_SCHEMAS = {
    /**
     * Extract business contact information (emails, phones, address, hours)
     */
    businessContact: {
        prompt: 'Extract all business contact information from this page including email addresses, phone numbers, physical address, and business hours.',
        responseFormat: {
            type: 'json_schema',
            schema: {
                type: 'object',
                properties: {
                    businessName: { type: 'string' },
                    emails: { type: 'array', items: { type: 'string' } },
                    phones: { type: 'array', items: { type: 'string' } },
                    address: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    zip: { type: 'string' },
                    hours: { type: 'string' },
                    website: { type: 'string' },
                },
            },
        },
    },

    /**
     * Extract services/products offered
     */
    services: {
        prompt: 'Extract all services or products offered by this business, including names, descriptions, and prices if available.',
        responseFormat: {
            type: 'json_schema',
            schema: {
                type: 'object',
                properties: {
                    services: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                                price: { type: 'string' },
                                category: { type: 'string' },
                            },
                            required: ['name'],
                        },
                    },
                },
            },
        },
    },

    /**
     * Extract team/staff information
     */
    team: {
        prompt: 'Extract information about the team members, staff, or key people at this business including names, titles, and bios.',
        responseFormat: {
            type: 'json_schema',
            schema: {
                type: 'object',
                properties: {
                    team: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                title: { type: 'string' },
                                bio: { type: 'string' },
                                email: { type: 'string' },
                                phone: { type: 'string' },
                            },
                            required: ['name'],
                        },
                    },
                },
            },
        },
    },
};

module.exports = {
    // Crawl functions
    initiateCrawl,
    pollForResults,
    crawlWebsite,
    // JSON extraction functions
    extractStructuredData,
    // Shared utilities
    getCredentials,
    // Constants
    DEFAULT_CRAWL_OPTIONS,
    EXTRACTION_SCHEMAS,
};
