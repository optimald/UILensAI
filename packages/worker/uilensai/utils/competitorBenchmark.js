/**
 * Competitor Benchmarking Utility for UILensAI
 *
 * Runs lightweight scans on competitor URLs and produces
 * a side-by-side comparison with the primary site's results.
 * 
 * Uses PSI API for performance and HTTP fetch for basic signals.
 * 
 * @module competitorBenchmark
 */

// ============================================================================
// Lightweight competitor scan
// ============================================================================

/**
 * Run a lightweight scan on a single competitor URL.
 * Extracts performance (PSI), tech stack signals, and basic SEO from HTTP.
 *
 * @param {string} url - Competitor URL
 * @param {boolean} [verbose=false]
 * @returns {Promise<object>} Competitor scan results
 */
async function scanCompetitor(url, verbose = false) {
    const startTime = Date.now();
    const result = {
        url,
        scores: {},
        performanceMetrics: {},
        techStack: {},
        meta: {},
        error: null,
    };

    try {
        if (verbose) console.log(`[CompetitorBenchmark] Scanning ${url}...`);

        // 1. PSI API for performance scores + Core Web Vitals
        const psiData = await fetchPSI(url, verbose);
        if (psiData) {
            const lhr = psiData.lighthouseResult;
            result.scores = {
                performance: Math.round((lhr?.categories?.performance?.score || 0) * 100),
                accessibility: Math.round((lhr?.categories?.accessibility?.score || 0) * 100),
                seo: Math.round((lhr?.categories?.seo?.score || 0) * 100),
                bestPractices: Math.round((lhr?.categories?.['best-practices']?.score || 0) * 100),
            };
            result.performanceMetrics = {
                fcp: lhr?.audits?.['first-contentful-paint']?.numericValue || null,
                lcp: lhr?.audits?.['largest-contentful-paint']?.numericValue || null,
                cls: lhr?.audits?.['cumulative-layout-shift']?.numericValue || null,
                tbt: lhr?.audits?.['total-blocking-time']?.numericValue || null,
                si: lhr?.audits?.['speed-index']?.numericValue || null,
            };

            // CrUX field data
            const crux = psiData.loadingExperience;
            if (crux?.overall_category) {
                result.performanceMetrics.cruxCategory = crux.overall_category;
            }
        }

        // 2. HTTP fetch for tech stack and SEO signals
        const httpData = await fetchHTTPSignals(url, verbose);
        if (httpData) {
            result.techStack = httpData.techStack;
            result.meta = httpData.meta;
        }

        result.scanDurationMs = Date.now() - startTime;
        if (verbose) {
            console.log(`[CompetitorBenchmark] ✅ ${url}: perf=${result.scores.performance}, seo=${result.scores.seo} (${result.scanDurationMs}ms)`);
        }

    } catch (err) {
        result.error = err.message;
        result.scanDurationMs = Date.now() - startTime;
        if (verbose) console.error(`[CompetitorBenchmark] ❌ ${url}: ${err.message}`);
    }

    return result;
}

/**
 * Fetch PSI data for a URL.
 */
async function fetchPSI(url, verbose) {
    try {
        const categories = ['performance', 'accessibility', 'seo', 'best-practices'];
        const params = new URLSearchParams({ url, strategy: 'desktop' });
        categories.forEach(c => params.append('category', c));

        const apiKey = process.env.GOOGLE_PSI_API_KEY || process.env.GOOGLE_API_KEY;
        if (apiKey) params.set('key', apiKey);

        const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;
        const response = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        if (verbose) console.warn(`[CompetitorBenchmark] PSI fetch failed for ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Fetch basic HTTP signals (headers, meta tags) from a URL.
 */
async function fetchHTTPSignals(url, verbose) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
            headers: {
                'User-Agent': 'UILensAI-Benchmark/1.0',
                'Accept': 'text/html',
            },
        });

        if (!response.ok) return null;

        const html = await response.text();
        const headers = Object.fromEntries(response.headers.entries());

        // Extract tech stack from HTML
        const techStack = {
            server: headers['server'] || null,
            poweredBy: headers['x-powered-by'] || null,
            cms: detectCMS(html),
            hasGA4: /gtag|G-[A-Z0-9]+|googletagmanager/i.test(html),
            hasGoogleAds: /googlesyndication|gads|gclid/i.test(html),
            hasMetaPixel: /fbq\(|facebook\.net\/en_US\/fbevents/i.test(html),
        };

        // Extract meta
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
        const viewportMatch = html.match(/<meta[^>]*name=["']viewport["']/i);

        const meta = {
            title: titleMatch ? titleMatch[1].trim() : null,
            description: descMatch ? descMatch[1].trim() : null,
            hasMobileViewport: !!viewportMatch,
            httpsRedirect: response.url.startsWith('https://'),
        };

        return { techStack, meta };
    } catch (err) {
        if (verbose) console.warn(`[CompetitorBenchmark] HTTP fetch failed for ${url}: ${err.message}`);
        return null;
    }
}

function detectCMS(html) {
    if (/wp-content|wordpress/i.test(html)) return 'WordPress';
    if (/squarespace/i.test(html)) return 'Squarespace';
    if (/shopify/i.test(html)) return 'Shopify';
    if (/wix\.com/i.test(html)) return 'Wix';
    if (/webflow/i.test(html)) return 'Webflow';
    if (/weebly/i.test(html)) return 'Weebly';
    if (/godaddy/i.test(html)) return 'GoDaddy';
    if (/duda/i.test(html)) return 'Duda';
    if (/hubspot/i.test(html)) return 'HubSpot';
    return null;
}

// ============================================================================
// Benchmark comparison
// ============================================================================

/**
 * Run competitor benchmark: scan competitors and compare against primary site.
 *
 * @param {object} primaryResults - Primary site's analysis results (from analyzeWebsite)
 * @param {string[]} competitorUrls - URLs to benchmark against
 * @param {object} [options]
 * @param {boolean} [options.verbose=false]
 * @returns {Promise<object>} Benchmark comparison object
 */
async function runBenchmark(primaryResults, competitorUrls, options = {}) {
    const { verbose = false } = options;

    if (!competitorUrls || competitorUrls.length === 0) {
        return null;
    }

    if (verbose) {
        console.log(`[CompetitorBenchmark] 🏁 Benchmarking against ${competitorUrls.length} competitor(s)`);
    }

    // Scan all competitors concurrently
    const competitorScans = await Promise.all(
        competitorUrls.map(url => scanCompetitor(url, verbose))
    );

    // Build primary scores from existing results
    const primaryScores = {};
    if (primaryResults.modules?.performance?.lighthouse?.scores) {
        Object.assign(primaryScores, primaryResults.modules.performance.lighthouse.scores);
    }

    // Build comparison
    const comparison = {
        primary: {
            url: primaryResults.url || 'primary',
            scores: primaryScores,
        },
        competitors: competitorScans,
        advantages: [],
        disadvantages: [],
    };

    // Calculate advantages/disadvantages per metric
    for (const comp of competitorScans) {
        if (comp.error) continue;

        for (const [metric, primaryScore] of Object.entries(primaryScores)) {
            const compScore = comp.scores[metric];
            if (typeof primaryScore === 'number' && typeof compScore === 'number') {
                const diff = primaryScore - compScore;
                if (diff > 10) {
                    comparison.advantages.push({
                        metric,
                        competitor: comp.url,
                        primaryScore,
                        competitorScore: compScore,
                        advantage: diff,
                    });
                } else if (diff < -10) {
                    comparison.disadvantages.push({
                        metric,
                        competitor: comp.url,
                        primaryScore,
                        competitorScore: compScore,
                        deficit: Math.abs(diff),
                    });
                }
            }
        }
    }

    if (verbose) {
        console.log(`[CompetitorBenchmark] ✅ Benchmark complete: ${comparison.advantages.length} advantages, ${comparison.disadvantages.length} disadvantages`);
    }

    return {
        competitors: competitorScans,
        comparison,
        aiNarrative: null, // Populated by AI in report generation
    };
}

module.exports = {
    scanCompetitor,
    runBenchmark,
};
