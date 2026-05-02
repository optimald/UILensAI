/**
 * Site Health Analysis Module for UILensAI
 * 
 * The 10th analysis module — extends UILensAI from single-page to full-site analysis.
 * Consumes CF crawl results and produces:
 * - Link graph (internal link adjacency, inlink/outlink counts, depth)
 * - Broken links (HTTP HEAD validation of outlinks)
 * - Redirect chains (301→302→200 mapping)
 * - Duplicate content (SimHash near-duplicate detection)
 * - Orphan pages (pages with zero inlinks)
 * - Crawl stats (status distribution, avg response time)
 * 
 * @module siteHealth
 */

const {
    validateLinks,
    followRedirectChain,
    findDuplicates,
} = require('../utils/linkValidator');

// ============================================================================
// Helpers
// ============================================================================

function createDefaultPaginatedArray(items = [], totalItems = null) {
    const actualItems = Array.isArray(items) ? items : [];
    const total = totalItems !== null ? totalItems : actualItems.length;
    return { items: actualItems, totalAvailableItems: total, pagination: null };
}

/**
 * Convert markdown to plain text (for CF crawl results that return markdown).
 * @param {string} markdown 
 * @returns {string}
 */
function markdownToText(markdown) {
    if (!markdown) return '';
    return markdown
        .replace(/!\[.*?\]\(.*?\)/g, '')     // images
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links
        .replace(/[#*_~`>]/g, '')             // markdown syntax
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze site health from CF crawl results.
 * 
 * @param {object} options
 * @param {Array<{url: string, markdown: string, title: string, httpStatus: number}>} options.crawlPages - Pages from CF crawl
 * @param {string} options.url - Primary URL (used as base for link resolution)
 * @param {boolean} [options.verbose=false]
 * @param {Function} [options.onProgress]
 * @returns {Promise<object>} Site health analysis report
 */
async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

let {
        crawlPages = [],
        verbose = false,
        onProgress,
    } = options;

    const startTime = Date.now();

    // ── HTML Fallback: If no crawl pages, synthesize from homepage HTML ──
    if ((!crawlPages || crawlPages.length === 0) && sharedPageContext) {
        const fallbackHtml = sharedPageContext._rawHtml || sharedPageContext.html || sharedPageContext.rawHtml || '';
        if (fallbackHtml.length > 200) {
            if (verbose) {
                console.log('[SiteHealth] No crawl pages — synthesizing from homepage HTML (' + (fallbackHtml.length / 1024).toFixed(0) + 'KB)');
            }
            // Extract links from HTML for link graph analysis
            const title = (fallbackHtml.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
            // Convert HTML to basic markdown-like content for the extraction pipeline
            const textContent = fallbackHtml
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            // Extract links from HTML and convert to markdown-style links
            const linkRegex = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([^<]*)<\/a>/gi;
            let match;
            let markdownLinks = '';
            while ((match = linkRegex.exec(fallbackHtml)) !== null) {
                markdownLinks += `[${match[2].trim()}](${match[1].trim()})\n`;
            }
            crawlPages = [{
                url: url || options.url,
                markdown: markdownLinks + '\n\n' + textContent.substring(0, 5000),
                title: title,
                httpStatus: 200,
            }];
        }
    }

    if (!crawlPages || crawlPages.length === 0) {
        console.warn('[SiteHealth] No crawl pages or HTML available, returning empty results');
        return buildEmptyResult('No pages available for site health analysis');
    }

    if (verbose) {
        console.log(`[SiteHealth] 🕷️ Analyzing site health from ${crawlPages.length} crawled pages`);
    }

    if (onProgress) onProgress('siteHealth', 'Building link graph', 10);

    // ──────────────────────────────────────────────────────────────────
    // Step 1: Extract all links from every crawled page
    // ──────────────────────────────────────────────────────────────────
    const allInternalLinks = [];  // { from, to, anchor }
    const allExternalLinks = [];  // { from, to, anchor }
    const pageData = new Map();   // url → { title, inlinks: Set, outInternalLinks: Set, outExternalLinks: Set }

    // Initialize page data for every crawled page
    for (const page of crawlPages) {
        pageData.set(page.url, {
            title: page.title || '',
            inlinks: new Set(),
            outInternalLinks: new Set(),
            outExternalLinks: new Set(),
            httpStatus: page.httpStatus || 200,
        });
    }

    // Parse links from each page (use markdown as content — CF crawl returns markdown)
    for (const page of crawlPages) {
        // CF crawl returns markdown, but we need HTML-like link extraction
        // Extract links from markdown: [text](url) pattern
        const links = extractLinksFromMarkdown(page.markdown || '', url);

        for (const link of links.internal) {
            allInternalLinks.push({ from: page.url, to: link.href, anchor: link.anchor });

            // Update outlinks for source page
            const sourceData = pageData.get(page.url);
            if (sourceData) sourceData.outInternalLinks.add(link.href);

            // Update inlinks for target page (only if it was crawled)
            const targetData = pageData.get(link.href);
            if (targetData) targetData.inlinks.add(page.url);
        }

        for (const link of links.external) {
            allExternalLinks.push({ from: page.url, to: link.href, anchor: link.anchor });

            const sourceData = pageData.get(page.url);
            if (sourceData) sourceData.outExternalLinks.add(link.href);
        }
    }

    if (verbose) {
        console.log(`[SiteHealth]   📊 ${allInternalLinks.length} internal links, ${allExternalLinks.length} external links`);
    }

    if (onProgress) onProgress('siteHealth', 'Detecting orphan pages', 25);

    // ──────────────────────────────────────────────────────────────────
    // Step 2: Build link graph + find orphan pages
    // ──────────────────────────────────────────────────────────────────
    const linkGraphPages = [];
    const orphanPages = [];

    for (const [pageUrl, data] of pageData.entries()) {
        const pageInfo = {
            url: pageUrl,
            title: data.title,
            inlinks: data.inlinks.size,
            outlinks: data.outInternalLinks.size + data.outExternalLinks.size,
            depth: calculateDepth(pageUrl, url),
        };
        linkGraphPages.push(pageInfo);

        // Orphan = no inlinks from other crawled pages (excluding the homepage itself)
        if (data.inlinks.size === 0 && pageUrl !== url) {
            orphanPages.push(pageUrl);
        }
    }

    // Sort by inlinks descending (most linked pages first)
    linkGraphPages.sort((a, b) => b.inlinks - a.inlinks);

    const linkGraph = {
        totalInternalLinks: allInternalLinks.length,
        totalExternalLinks: allExternalLinks.length,
        avgInlinksPerPage: crawlPages.length > 0
            ? Math.round((allInternalLinks.length / crawlPages.length) * 10) / 10
            : 0,
        maxDepth: Math.max(...linkGraphPages.map(p => p.depth), 0),
        pages: linkGraphPages,
    };

    if (verbose) {
        console.log(`[SiteHealth]   🔗 Link graph: avg ${linkGraph.avgInlinksPerPage} inlinks/page, max depth ${linkGraph.maxDepth}`);
        console.log(`[SiteHealth]   👻 ${orphanPages.length} orphan pages found`);
    }

    if (onProgress) onProgress('siteHealth', 'Validating external links', 40);

    // ──────────────────────────────────────────────────────────────────
    // Step 3: Validate external links (find broken links)
    // ──────────────────────────────────────────────────────────────────
    const uniqueExternalUrls = [...new Set(allExternalLinks.map(l => l.to))];

    // Limit external link validation to avoid overwhelming the scan
    const maxExternalChecks = 100;
    const urlsToCheck = uniqueExternalUrls.slice(0, maxExternalChecks);

    if (verbose) {
        console.log(`[SiteHealth]   🔍 Validating ${urlsToCheck.length} external links (of ${uniqueExternalUrls.length} total)`);
    }

    const validationResults = await validateLinks(urlsToCheck, {
        concurrency: 10,
        timeoutMs: 5000,
        verbose,
    });

    const brokenLinks = validationResults
        .filter(r => !r.ok)
        .map(r => {
            // Find which pages link to this broken URL
            const foundOnPages = allExternalLinks
                .filter(l => l.to === r.url)
                .map(l => l.from);
            const anchorText = allExternalLinks
                .find(l => l.to === r.url)?.anchor || '';

            return {
                url: r.url,
                statusCode: r.statusCode,
                foundOnPages: [...new Set(foundOnPages)],
                anchorText,
                error: r.error,
            };
        });

    if (verbose) {
        console.log(`[SiteHealth]   ❌ ${brokenLinks.length} broken external links found`);
    }

    if (onProgress) onProgress('siteHealth', 'Mapping redirect chains', 60);

    // ──────────────────────────────────────────────────────────────────
    // Step 4: Map redirect chains for internal links
    // ──────────────────────────────────────────────────────────────────
    // Check crawled pages that might be redirects
    const potentialRedirects = crawlPages.filter(p =>
        p.httpStatus >= 300 && p.httpStatus < 400
    );

    const redirectChains = [];
    for (const page of potentialRedirects) {
        try {
            const chain = await followRedirectChain(page.url, { maxDepth: 10, timeoutMs: 5000 });
            if (chain.depth > 0) {
                redirectChains.push(chain);
                if (verbose) {
                    console.log(`[SiteHealth]   ↪️ Redirect: ${chain.startUrl} → ${chain.finalUrl} (${chain.depth} hops)`);
                }
            }
        } catch {
            // Skip failed chain resolution
        }
    }

    // Also check internal links that might redirect
    const internalUrlsSample = [...new Set(allInternalLinks.map(l => l.to))]
        .filter(u => !pageData.has(u)) // Only check URLs not already crawled
        .slice(0, 50); // Limit to 50

    for (const linkUrl of internalUrlsSample) {
        try {
            const chain = await followRedirectChain(linkUrl, { maxDepth: 5, timeoutMs: 3000 });
            if (chain.depth > 0) {
                redirectChains.push(chain);
            }
        } catch {
            // Skip
        }
    }

    if (verbose) {
        console.log(`[SiteHealth]   ↪️ ${redirectChains.length} redirect chains mapped`);
    }

    if (onProgress) onProgress('siteHealth', 'Detecting duplicate content', 75);

    // ──────────────────────────────────────────────────────────────────
    // Step 5: Near-duplicate content detection
    // ──────────────────────────────────────────────────────────────────
    const pagesWithText = crawlPages
        .filter(p => p.markdown && p.markdown.length > 100) // Need minimum content
        .map(p => ({
            url: p.url,
            text: markdownToText(p.markdown),
        }));

    const duplicateContent = findDuplicates(pagesWithText, {
        threshold: 6, // Allow ~91% similarity 
        verbose,
    });

    if (verbose) {
        console.log(`[SiteHealth]   🔄 ${duplicateContent.length} duplicate content groups found`);
    }

    if (onProgress) onProgress('siteHealth', 'Calculating site health score', 90);

    // ──────────────────────────────────────────────────────────────────
    // Step 6: Aggregate crawl stats
    // ──────────────────────────────────────────────────────────────────
    const statusDistribution = {};
    for (const page of crawlPages) {
        const status = String(page.httpStatus || 200);
        statusDistribution[status] = (statusDistribution[status] || 0) + 1;
    }

    const crawlStats = {
        pagesCrawled: crawlPages.length,
        avgResponseTimeMs: 0, // CF crawl doesn't expose per-page timing
        statusDistribution,
        crawlDurationMs: Date.now() - startTime,
        browserSecondsUsed: 0, // Populated by caller from CF metadata
    };

    // ──────────────────────────────────────────────────────────────────
    // Step 7: Calculate overall site health score
    // ──────────────────────────────────────────────────────────────────
    const score = calculateSiteHealthScore({
        brokenLinks,
        redirectChains,
        duplicateContent,
        orphanPages,
        linkGraph,
        crawlPages,
    });

    const issues = generateIssues({ brokenLinks, redirectChains, duplicateContent, orphanPages, linkGraph });
    const recommendations = generateRecommendations({ brokenLinks, redirectChains, duplicateContent, orphanPages, linkGraph });

    const durationMs = Date.now() - startTime;

    if (verbose) {
        console.log(`[SiteHealth] ✅ Site health analysis complete in ${(durationMs / 1000).toFixed(1)}s. Score: ${score}/100`);
    }

    if (onProgress) onProgress('siteHealth', 'Complete', 100);

    return {
        summary: {
            score,
            rating: getSiteHealthRating(score),
            topIssues: issues.slice(0, 5).map(i => i.text),
        },
        crawlStats,
        linkGraph,
        brokenLinks,
        redirectChains,
        orphanPages,
        duplicateContent,
        recommendations: createDefaultPaginatedArray(recommendations),
        issues: createDefaultPaginatedArray(issues),
        analysisDurationMs: durationMs,
    };
}

// ============================================================================
// Scoring
// ============================================================================

function calculateSiteHealthScore({ brokenLinks, redirectChains, duplicateContent, orphanPages, linkGraph, crawlPages }) {
    let score = 100;
    const pageCount = crawlPages.length || 1;

    // Broken links: -5 per broken link, max -30
    score -= Math.min(brokenLinks.length * 5, 30);

    // Redirect chains depth > 2: -3 per deep chain, max -15
    const deepChains = redirectChains.filter(c => c.depth > 2);
    score -= Math.min(deepChains.length * 3, 15);

    // Duplicate content: -5 per group, max -20
    score -= Math.min(duplicateContent.length * 5, 20);

    // Orphan pages: -3 per orphan (as % of total), max -15
    const orphanRate = orphanPages.length / pageCount;
    score -= Math.min(Math.round(orphanRate * 30), 15);

    // Low avg inlinks: penalty if most pages have < 2 inlinks
    if (linkGraph.avgInlinksPerPage < 2 && pageCount > 3) {
        score -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
}

function getSiteHealthRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Needs Improvement';
    if (score >= 30) return 'Poor';
    return 'Critical';
}

// ============================================================================
// Issues & Recommendations Generator
// ============================================================================

function generateIssues({ brokenLinks, redirectChains, duplicateContent, orphanPages, linkGraph }) {
    const issues = [];

    for (const bl of brokenLinks.slice(0, 20)) {
        issues.push({
            text: `Broken link: ${bl.url} (HTTP ${bl.statusCode || 'timeout'}) found on ${bl.foundOnPages.length} page(s)`,
            severity: bl.statusCode === 404 ? 'High' : 'Medium',
            category: 'broken-links',
        });
    }

    for (const rc of redirectChains.filter(c => c.depth > 2).slice(0, 10)) {
        issues.push({
            text: `Redirect chain with ${rc.depth} hops: ${rc.startUrl} → ${rc.finalUrl}`,
            severity: rc.depth > 4 ? 'High' : 'Medium',
            category: 'redirect-chains',
        });
    }

    for (const dc of duplicateContent.slice(0, 10)) {
        issues.push({
            text: `Near-duplicate content (${Math.round(dc.similarity * 100)}% similar): ${dc.urls.join(', ')}`,
            severity: dc.similarity > 0.95 ? 'High' : 'Medium',
            category: 'duplicate-content',
        });
    }

    if (orphanPages.length > 0) {
        issues.push({
            text: `${orphanPages.length} orphan page(s) with no internal links pointing to them`,
            severity: orphanPages.length > 5 ? 'High' : 'Medium',
            category: 'orphan-pages',
        });
    }

    if (linkGraph.avgInlinksPerPage < 2 && linkGraph.pages.length > 3) {
        issues.push({
            text: `Low internal linking: average ${linkGraph.avgInlinksPerPage} inlinks per page`,
            severity: 'Medium',
            category: 'internal-linking',
        });
    }

    return issues;
}

function generateRecommendations({ brokenLinks, redirectChains, duplicateContent, orphanPages, linkGraph }) {
    const recs = [];

    if (brokenLinks.length > 0) {
        recs.push({
            text: `Fix ${brokenLinks.length} broken external link(s). Update or remove dead URLs to improve user experience and SEO.`,
            priority: 'High',
            category: 'broken-links',
            effort: brokenLinks.length > 10 ? 'Medium' : 'Low',
        });
    }

    const deepChains = redirectChains.filter(c => c.depth > 2);
    if (deepChains.length > 0) {
        recs.push({
            text: `Shorten ${deepChains.length} redirect chain(s) with more than 2 hops. Update links to point directly to the final destination.`,
            priority: 'Medium',
            category: 'redirect-chains',
            effort: 'Low',
        });
    }

    if (duplicateContent.length > 0) {
        recs.push({
            text: `Address ${duplicateContent.length} near-duplicate content group(s). Add canonical tags, differentiate content, or consolidate pages.`,
            priority: 'High',
            category: 'duplicate-content',
            effort: 'Medium',
        });
    }

    if (orphanPages.length > 0) {
        recs.push({
            text: `Add internal links to ${orphanPages.length} orphan page(s). Pages without inlinks are difficult for search engines to discover and crawl.`,
            priority: 'Medium',
            category: 'orphan-pages',
            effort: 'Low',
        });
    }

    if (linkGraph.avgInlinksPerPage < 2 && linkGraph.pages.length > 3) {
        recs.push({
            text: `Strengthen internal linking structure. Average of ${linkGraph.avgInlinksPerPage} inlinks per page is below the recommended 3-5 for good SEO.`,
            priority: 'Medium',
            category: 'internal-linking',
            effort: 'Medium',
        });
    }

    return recs;
}

// ============================================================================
// Link extraction from Markdown (CF crawl returns markdown, not HTML)
// ============================================================================

/**
 * Extract links from markdown content.
 * Parses [text](url) patterns.
 */
function extractLinksFromMarkdown(markdown, baseUrl) {
    const internal = [];
    const external = [];

    if (!markdown || !baseUrl) return { internal, external };

    let baseDomain;
    try {
        baseDomain = new URL(baseUrl).hostname.replace(/^www\./, '');
    } catch {
        return { internal, external };
    }

    // Match markdown links: [text](url)
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    const seen = new Set();

    while ((match = linkRegex.exec(markdown)) !== null) {
        const anchor = match[1].trim().substring(0, 200);
        let href = match[2].trim();

        // Skip non-HTTP links and anchors
        if (/^(mailto:|tel:|javascript:|data:|#)/.test(href)) continue;
        if (href.startsWith('#')) continue;

        try {
            const resolved = new URL(href, baseUrl);
            href = resolved.href;

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

    // Also extract bare URLs (common in markdown crawl output)
    const bareUrlRegex = /(?<!\()(https?:\/\/[^\s<>")\]]+)/g;
    while ((match = bareUrlRegex.exec(markdown)) !== null) {
        let href = match[1].trim();
        if (seen.has(href)) continue;

        try {
            const resolved = new URL(href);
            seen.add(resolved.href);

            const linkDomain = resolved.hostname.replace(/^www\./, '');
            if (linkDomain === baseDomain) {
                internal.push({ href: resolved.href, anchor: '' });
            } else {
                external.push({ href: resolved.href, anchor: '' });
            }
        } catch {
            // Skip
        }
    }

    return { internal, external };
}

// ============================================================================
// Depth Calculation
// ============================================================================

function calculateDepth(pageUrl, rootUrl) {
    try {
        const pagePath = new URL(pageUrl).pathname;
        const rootPath = new URL(rootUrl).pathname;

        // Depth = number of path segments relative to root
        const pageSegments = pagePath.split('/').filter(Boolean);
        const rootSegments = rootPath.split('/').filter(Boolean);

        return Math.max(0, pageSegments.length - rootSegments.length);
    } catch {
        return 0;
    }
}

// ============================================================================
// Empty Result Builder
// ============================================================================

function buildEmptyResult(reason) {
    return {
        summary: {
            score: 0,
            rating: 'Not Available',
            topIssues: [reason],
        },
        crawlStats: {
            pagesCrawled: 0,
            avgResponseTimeMs: 0,
            statusDistribution: {},
            crawlDurationMs: 0,
            browserSecondsUsed: 0,
        },
        linkGraph: {
            totalInternalLinks: 0,
            totalExternalLinks: 0,
            avgInlinksPerPage: 0,
            maxDepth: 0,
            pages: [],
        },
        brokenLinks: [],
        redirectChains: [],
        orphanPages: [],
        duplicateContent: [],
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        analysisDurationMs: 0,
    };
}

module.exports = { analyze };
