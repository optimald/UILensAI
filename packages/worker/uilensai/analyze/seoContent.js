/**
 * SEO & Content Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance
 *
 * Analyzes website SEO elements and content quality, providing AI-powered insights
 * on metadata, keyword usage, E-A-T, technical SEO, schema markup, and more.
 */
const { URL } = require('url'); // For URL parsing if needed for sitemap/robots.txt

const { v4: uuidv4 } = require('uuid'); // For IDs if needed

const { getModelConfig } = require('../utils/ai-credentials');
const { getStructuredData, getSchemaForModule } = require('../utils/structured-llm-output');
const { getPrompt } = require('../utils/promptTemplates');
const { formatIssuesArray } = require('../utils/issue-formatter');
const { calculateModuleSummaryScore, scorePerformanceMetric, getRatingLabelForScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { buildEvidenceRegistry } = require('../utils/evidence-registry');
const { extractContentQuality } = require('../utils/content-quality');
const { extractKeywordEvidence, scoreKeywordOptimization } = require('../utils/keyword-analysis');
const { extractEATSignals } = require('../utils/eat-signals');
const { collectDomSignals } = require('../utils/data-collectors/dom-structure-collector');

// --- Helper Functions ---

function createDefaultPaginatedArray(items = [], totalItems = null, pageSize = null) {
    const actualItems = Array.isArray(items) ? items : [];
    const itemCount = actualItems.length;
    const total = totalItems !== null ? totalItems : itemCount;
    if (itemCount === 0 && total === 0) { return { items: [], totalAvailableItems: 0, pagination: null }; }
    const effectivePageSize = pageSize || (itemCount > 0 ? itemCount : 10);
    if (total <= effectivePageSize && itemCount <= effectivePageSize) { return { items: actualItems, totalAvailableItems: total, pagination: null }; }
    return {
        items: actualItems, totalAvailableItems: total,
        pagination: { pageNumber: 1, pageSize: effectivePageSize, totalPages: Math.ceil(total / effectivePageSize) || 1 }
    };
}

function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || obj === null || !pathStr) { return defaultValue; }
    const path = pathStr.split('.');
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, path[i])) {
            return defaultValue;
        }
        current = current[path[i]];
    }
    return current;
}

/**
 * Extracts comprehensive SEO and content elements from a Playwright page.
 * Aligned with data points needed for schema v3.11.0 seoContentModule.
 */
async function extractSeoAndContentElements(page, url) {
    if (!page || page.isClosed()) {
        console.warn("[SEOContentModule] Page object is closed or invalid in extractSeoAndContentElements.");
        return {}; // Return empty object to avoid breaking callers
    }
    return await page.evaluate((pageUrl) => {
        const elements = {
            url: pageUrl,
            title: document.title || null,
            metaDescription: document.querySelector('meta[name="description"]')?.content || null,
            metaKeywords: document.querySelector('meta[name="keywords"]')?.content || null,
            canonicalUrl: (() => {
                // CRITICAL FIX: Enhanced canonical URL detection with multiple fallback methods
                const canonicalLink = document.querySelector('link[rel="canonical"]');
                if (canonicalLink && canonicalLink.href) {
                    // Ensure the canonical URL is absolute and valid
                    try {
                        const canonicalUrl = new URL(canonicalLink.href, window.location.href);
                        return canonicalUrl.href;
                    } catch (e) {
                        // If URL parsing fails, return null
                        return null;
                    }
                }

                // Check for alternative canonical formats
                const alternativeCanonical = document.querySelector('link[rel="canonical"][href]') ||
                    document.querySelector('meta[property="og:url"]') ||
                    document.querySelector('meta[name="canonical"]');

                if (alternativeCanonical) {
                    const href = alternativeCanonical.href || alternativeCanonical.content;
                    if (href) {
                        try {
                            const canonicalUrl = new URL(href, window.location.href);
                            return canonicalUrl.href;
                        } catch (e) {
                            return null;
                        }
                    }
                }

                return null;
            })(),
            robotsMeta: document.querySelector('meta[name="robots"]')?.content || null,
            viewportTag: { // For $defs/viewportTagAnalysis
                value: document.querySelector('meta[name="viewport"]')?.content || null,
                isMobileFriendly: !!(document.querySelector('meta[name="viewport"]')?.content?.includes('width=device-width')), // Basic check
                // score will be AI assessed or defaulted
            },
            htmlLang: document.documentElement.lang || null,
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
            ogDescription: document.querySelector('meta[property="og:description"]')?.content || null,
            ogImage: document.querySelector('meta[property="og:image"]')?.content || null,
            ogUrl: document.querySelector('meta[property="og:url"]')?.content || null,
            ogType: document.querySelector('meta[property="og:type"]')?.content || null,
            twitterCard: document.querySelector('meta[name="twitter:card"]')?.content || null,
            twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content || null,
            twitterDescription: document.querySelector('meta[name="twitter:description"]')?.content || null,
            twitterImage: document.querySelector('meta[name="twitter:image"]')?.content || null,
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] }, // Counts and text samples
            links: { internal: [], external: [], nofollowCount: 0, brokenPlaceholder: 0 },
            images: [], // Will store {src, alt, hasAlt, width, height, loadingType, isOptimized (placeholder)}
            schemaMarkup: [], // Array of parsed JSON-LD objects
            wordCount: 0,
            textContentSample: "", // For AI context
            hreflangTags: { // For $defs/hreflangAnalysis
                tagsFound: [], // Array of {href, hreflang}
                issues: [],    // e.g., "Missing return tags", "Incorrect language codes"
                // score will be AI assessed or defaulted
            },
            authorInfo: { // For E-A-T
                authors: Array.from(document.querySelectorAll('meta[name="author"], [rel="author"], [itemprop="author"]')).map(el => el.content || el.textContent?.trim()).filter(Boolean),
                publisher: document.querySelector('meta[property="og:site_name"], meta[name="application-name"], [itemprop="publisher"] [itemprop="name"]')?.content || document.querySelector('[itemprop="publisher"]')?.textContent?.trim(),
            },
            lastModifiedDate: document.lastModified || null, // Basic freshness signal
            // COPYRIGHT DATE DETECTION - Extract copyright year from footer for content freshness signals
            copyrightInfo: (() => {
                const currentYear = new Date().getFullYear();
                const result = {
                    found: false,
                    year: null,
                    yearRange: null, // e.g., "2018-2024"
                    fullText: null,  // The complete copyright text found
                    isCurrentYear: false,
                    yearsOutdated: null, // How many years behind current year
                    location: null  // Where it was found (footer, body, etc.)
                };

                // Common footer selectors to search
                const footerSelectors = [
                    'footer', '.footer', '#footer', '[class*="footer"]',
                    '.site-footer', '.page-footer', '.main-footer', '.footer-content',
                    '[role="contentinfo"]', '.copyright', '.legal-info', '.footer-legal',
                    '.footer-copyright', '.site-info', '.colophon'
                ];

                // Regex patterns for copyright detection
                // Matches: © 2024, Copyright 2024, (c) 2024, 2018-2024, etc.
                const copyrightPatterns = [
                    /(?:©|&copy;|\(c\)|copyright)\s*(\d{4})(?:\s*[-–—]\s*(\d{4}))?/gi,
                    /(\d{4})(?:\s*[-–—]\s*(\d{4}))?\s*(?:©|&copy;|\(c\)|copyright)/gi,
                    /all\s*rights\s*reserved\s*[\.\,]?\s*(\d{4})(?:\s*[-–—]\s*(\d{4}))?/gi,
                    /(\d{4})(?:\s*[-–—]\s*(\d{4}))?\s*all\s*rights\s*reserved/gi
                ];

                // First, try to find in footer specifically
                for (const selector of footerSelectors) {
                    const footerElement = document.querySelector(selector);
                    if (footerElement) {
                        const footerText = footerElement.textContent || '';

                        for (const pattern of copyrightPatterns) {
                            pattern.lastIndex = 0; // Reset regex state
                            const match = pattern.exec(footerText);
                            if (match) {
                                const startYear = parseInt(match[1], 10);
                                const endYear = match[2] ? parseInt(match[2], 10) : null;
                                const displayYear = endYear || startYear;

                                // Validate years are reasonable (1990-current year + 1)
                                if (startYear >= 1990 && startYear <= currentYear + 1 &&
                                    (!endYear || (endYear >= startYear && endYear <= currentYear + 1))) {
                                    result.found = true;
                                    result.year = displayYear;
                                    result.yearRange = endYear ? `${startYear}-${endYear}` : `${startYear}`;
                                    result.fullText = match[0].trim().substring(0, 100);
                                    result.isCurrentYear = displayYear === currentYear;
                                    result.yearsOutdated = displayYear < currentYear ? currentYear - displayYear : 0;
                                    result.location = 'footer';
                                    return result;
                                }
                            }
                        }
                    }
                }

                // Fallback: search entire page body (but prioritize footer findings)
                if (!result.found) {
                    const bodyText = document.body?.textContent || '';
                    for (const pattern of copyrightPatterns) {
                        pattern.lastIndex = 0;
                        const match = pattern.exec(bodyText);
                        if (match) {
                            const startYear = parseInt(match[1], 10);
                            const endYear = match[2] ? parseInt(match[2], 10) : null;
                            const displayYear = endYear || startYear;

                            if (startYear >= 1990 && startYear <= currentYear + 1 &&
                                (!endYear || (endYear >= startYear && endYear <= currentYear + 1))) {
                                result.found = true;
                                result.year = displayYear;
                                result.yearRange = endYear ? `${startYear}-${endYear}` : `${startYear}`;
                                result.fullText = match[0].trim().substring(0, 100);
                                result.isCurrentYear = displayYear === currentYear;
                                result.yearsOutdated = displayYear < currentYear ? currentYear - displayYear : 0;
                                result.location = 'body';
                                return result;
                            }
                        }
                    }
                }

                return result;
            })(),
        };

        for (let i = 1; i <= 6; i++) {
            elements.headings[`h${i}`] = Array.from(document.querySelectorAll(`h${i}`)).map(h => h.textContent?.trim() || "").filter(Boolean).slice(0, 5); // Sample first 5 of each
        }

        const body = document.body;
        if (body) {
            elements.wordCount = body.innerText.trim().split(/\s+/).length;
            elements.textContentSample = body.innerText.substring(0, 4000); // Increased sample for AI

            // Extract AEO Citability Blocks
            elements.citabilityBlocks = [];
            const paragraphs = Array.from(document.querySelectorAll('p, li, .content, .prose'));
            for (const el of paragraphs) {
                const text = (el.textContent || '').trim();
                const wordCnt = text.split(/\s+/).length;
                if (wordCnt >= 100 && wordCnt <= 200 && text.length < 2000 && !elements.citabilityBlocks.some(b => b.text === text.substring(0, 500))) {
                    elements.citabilityBlocks.push({
                        text: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
                        wordCount: wordCnt,
                        isOptimalLength: wordCnt >= 134 && wordCnt <= 167
                    });
                }
            }
            elements.citabilityBlocks = elements.citabilityBlocks.slice(0, 5); // Take top 5
        }

        const currentDomain = new URL(pageUrl).hostname;
        document.querySelectorAll('a[href]').forEach(link => {
            try {
                const href = link.href;
                const resolvedUrl = new URL(href, pageUrl);
                const linkData = { url: resolvedUrl.href, text: link.textContent?.trim() || "", nofollow: link.rel?.includes('nofollow') || false, isExternal: resolvedUrl.hostname !== currentDomain };
                if (linkData.isExternal) {
                    elements.links.external.push(linkData);
                } else {
                    elements.links.internal.push(linkData);
                }
                if (linkData.nofollow) { elements.links.nofollowCount++; }
            } catch (e) { /* Skip invalid URLs */ }
        });
        elements.links.internal = elements.links.internal.slice(0, 20); // Sample
        elements.links.external = elements.links.external.slice(0, 20); // Sample

        document.querySelectorAll('img').forEach(img => {
            elements.images.push({
                src: img.currentSrc || img.src, // currentSrc for responsive images
                alt: img.alt || null,
                hasAlt: img.hasAttribute('alt') && (img.alt || "").trim() !== "",
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                loadingType: img.getAttribute('loading') || 'auto',
                isOptimized: null // Placeholder for AI or further analysis
            });
        });
        elements.images = elements.images.slice(0, 20); // Sample

        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
                elements.schemaMarkup.push(JSON.parse(script.textContent || "{}"));
            } catch (e) { elements.schemaMarkup.push({ error: "Invalid JSON-LD", raw: script.textContent?.substring(0, 100) }); }
        });
        elements.schemaMarkup = elements.schemaMarkup.slice(0, 5); // Sample

        elements.hreflangTags.tagsFound = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(tag => ({
            href: tag.href,
            hreflang: tag.getAttribute('hreflang')
        })).slice(0, 10);

        // AI/LLM READINESS DETECTION — Gold-standard AEO (Answer Engine Optimization) signals
        elements.aiReadinessSignals = {
            aiLinks: [],          // Links explicitly targeting AI/LLM consumers
            aiMetaTags: [],       // AI-specific meta tags
            hasSpeakableMarkup: false,  // Schema.org speakable property
            hasAiPluginManifest: false, // .well-known/ai-plugin.json link
        };

        // Detect AI-facing links: "Hey AI", "Learn About Us" (AI variant), /ai, /for-ai, /llms paths
        const aiLinkPatterns = [
            /hey\s*ai/i, /for\s*ai/i, /ai\s*learn/i, /learn.*about.*us.*ai/i,
            /llms?\b/i, /ai-?content/i, /machine-?readable/i, /bot-?info/i,
            /ai-?policy/i, /ai-?disclosure/i
        ];
        const aiPathPatterns = [
            /\/ai\/?$/i, /\/for-ai\/?$/i, /\/llms?\/?$/i, /\/ai-?content\/?$/i,
            /\/\.well-known\/ai-plugin\.json/i, /\/machine-readable/i
        ];

        document.querySelectorAll('a[href]').forEach(link => {
            try {
                const linkText = (link.textContent || '').trim();
                const href = link.href;
                const pathname = new URL(href, pageUrl).pathname;

                const textMatch = aiLinkPatterns.some(p => p.test(linkText));
                const pathMatch = aiPathPatterns.some(p => p.test(pathname));

                if (textMatch || pathMatch) {
                    elements.aiReadinessSignals.aiLinks.push({
                        text: linkText.substring(0, 100),
                        href: href.substring(0, 200),
                        matchType: textMatch ? 'text' : 'path'
                    });
                }

                // Check for .well-known/ai-plugin.json
                if (pathname.includes('.well-known/ai-plugin.json')) {
                    elements.aiReadinessSignals.hasAiPluginManifest = true;
                }
            } catch (e) { /* skip invalid URLs */ }
        });
        elements.aiReadinessSignals.aiLinks = elements.aiReadinessSignals.aiLinks.slice(0, 10);

        // Detect AI-specific meta tags
        const aiMetaNames = ['ai-content-declaration', 'ai-terms', 'ai-policy', 'robots'];
        document.querySelectorAll('meta').forEach(meta => {
            const name = (meta.getAttribute('name') || '').toLowerCase();
            const content = meta.getAttribute('content') || '';
            if (aiMetaNames.includes(name) && content) {
                // For robots, only include if it has AI-specific directives
                if (name === 'robots' && (content.toLowerCase().includes('noai') || content.toLowerCase().includes('noimageai'))) {
                    elements.aiReadinessSignals.aiMetaTags.push({ name, content: content.substring(0, 200) });
                } else if (name !== 'robots') {
                    elements.aiReadinessSignals.aiMetaTags.push({ name, content: content.substring(0, 200) });
                }
            }
        });

        // Detect Schema.org speakable markup
        elements.aiReadinessSignals.hasSpeakableMarkup = !!(
            document.querySelector('[itemprop="speakable"]') ||
            elements.schemaMarkup.some(s => s.speakable || (s['@graph'] && s['@graph'].some(g => g.speakable)))
        );

        return elements;
    }, url);
}

/**
 * Helper: fetch a URL's text content via HTTP (no browser needed).
 */
async function fetchTextContent(fetchUrl, timeout = 15000) {
    const { fetchWithHeaders } = require('../utils/http-fallback');
    const response = await fetchWithHeaders(fetchUrl, { timeout });
    if (!response.body || response.statusCode >= 400) {
        return { ok: false, status: response.statusCode, text: '' };
    }
    return { ok: true, status: response.statusCode, text: response.body };
}

/**
 * Fetches and provides basic analysis of sitemap.xml.
 * Works in both browser and serverless (HTTP-only) modes.
 */
async function analyzeSitemap(siteUrl, page, verbose = false) {
    const sitemapUrl = new URL("/sitemap.xml", siteUrl).href;
    if (verbose) { console.log(`[SEOContentModule] Attempting to fetch sitemap: ${sitemapUrl}`); }
    try {
        let sitemapText = '';
        let fetchOk = false;

        // Try HTTP fetch first (works in all modes)
        try {
            const result = await fetchTextContent(sitemapUrl, 15000);
            fetchOk = result.ok;
            sitemapText = result.text;
            if (!fetchOk) throw new Error(`HTTP fetch failed with status ${result.status}`);
        } catch (httpErr) {
            // If HTTP fails and page is available, try page.goto as fallback
            if (page && !page.isClosed()) {
                if (verbose) { console.log(`[SEOContentModule] HTTP fetch for sitemap failed, falling back to Playwright...`); }
                const response = await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
                if (response && response.ok()) {
                    fetchOk = true;
                    sitemapText = await response.text();
                }
            }
        }

        if (!fetchOk || !sitemapText) {
            return { found: false, valid: false, issues: ['Sitemap not found or HTTP error'], score: 10 };
        }

        const lastModMatch = sitemapText.match(/<lastmod>(.*?)<\/lastmod>/);

        // Detect sitemap type: <urlset> (direct) or <sitemapindex> (index with child sitemaps)
        const isUrlset = sitemapText.includes('<urlset') && sitemapText.includes('</urlset>');
        const isSitemapIndex = sitemapText.includes('<sitemapindex') && sitemapText.includes('</sitemapindex>');
        const isValidXml = sitemapText.startsWith('<?xml') && (isUrlset || isSitemapIndex);

        let entryCount = 0;
        let sitemapType = 'unknown';

        if (isSitemapIndex) {
            entryCount = (sitemapText.match(/<sitemap>/g) || []).length;
            sitemapType = 'index';
            if (verbose) { console.log(`[SEOContentModule] Detected sitemap index with ${entryCount} child sitemaps`); }
        } else if (isUrlset) {
            entryCount = (sitemapText.match(/<url>/g) || []).length;
            sitemapType = 'urlset';
        }

        return {
            found: true,
            valid: isValidXml && entryCount > 0,
            lastUpdated: lastModMatch ? new Date(lastModMatch[1]).toISOString() : null,
            entryCount,
            sitemapType,
            issues: isValidXml && entryCount > 0 ? [] : ["Sitemap structure appears invalid or empty."],
            score: isValidXml && entryCount > 0 ? 80 : 30
        };
    } catch (error) {
        if (verbose) { console.error(`[SEOContentModule] Error fetching/parsing sitemap ${sitemapUrl}: ${error.message}`); }
        return { found: false, valid: false, issues: [error.message.substring(0, 100)], score: 10 };
    }
}

/**
 * Fetches and provides basic analysis of robots.txt.
 * Works in both browser and serverless (HTTP-only) modes.
 */
async function analyzeRobotsTxt(siteUrl, page, verbose = false) {
    const robotsUrl = new URL("/robots.txt", siteUrl).href;
    if (verbose) { console.log(`[SEOContentModule] Attempting to fetch robots.txt: ${robotsUrl}`); }
    try {
        let robotsText = '';
        let fetchOk = false;

        // Try HTTP fetch first (works in all modes)
        try {
            const result = await fetchTextContent(robotsUrl, 15000);
            fetchOk = result.ok;
            robotsText = result.text;
            if (!fetchOk) throw new Error(`HTTP fetch failed with status ${result.status}`);
        } catch (httpErr) {
            if (page && !page.isClosed()) {
                if (verbose) { console.log(`[SEOContentModule] HTTP fetch for robots.txt failed, falling back to Playwright...`); }
                const response = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
                if (response && response.ok()) {
                    fetchOk = true;
                    robotsText = await response.text();
                }
            }
        }

        if (!fetchOk || !robotsText) {
            return { found: false, valid: false, directives: [], issues: ['robots.txt not found or HTTP error'], score: 10 };
        }

        const directives = robotsText.split('\n').filter(line => line.trim() && !line.startsWith('#')).map(line => line.substring(0, 200));
        const hasUserAgent = directives.some(d => d.toLowerCase().startsWith('user-agent:'));
        const hasDisallowOrAllow = directives.some(d => d.toLowerCase().startsWith('disallow:') || d.toLowerCase().startsWith('allow:'));

        // AI Bot Directive Detection
        const AI_BOTS = [
            'GPTBot', 'ChatGPT-User', 'Google-Extended', 'GoogleOther',
            'anthropic-ai', 'ClaudeBot', 'CCBot', 'Bytespider',
            'PerplexityBot', 'Cohere-ai', 'Applebot-Extended', 'Meta-ExternalAgent',
            'FacebookBot', 'Amazonbot', 'YouBot', 'Diffbot', 'OAI-SearchBot'
        ];

        const aiBotDirectives = { detected: [], aiBotsBlocked: [], aiBotsAllowed: [], hasExplicitAiPolicy: false };
        let currentUserAgent = null;

        for (const line of directives) {
            const trimmed = line.trim();
            const uaMatch = trimmed.match(/^user-agent:\s*(.+)/i);
            if (uaMatch) {
                currentUserAgent = uaMatch[1].trim();
                continue;
            }

            if (currentUserAgent) {
                const matchedBot = AI_BOTS.find(bot => currentUserAgent.toLowerCase() === bot.toLowerCase());
                if (matchedBot) {
                    aiBotDirectives.hasExplicitAiPolicy = true;
                    const disallowMatch = trimmed.match(/^disallow:\s*(.*)/i);
                    const allowMatch = trimmed.match(/^allow:\s*(.*)/i);

                    if (disallowMatch) {
                        const path = disallowMatch[1].trim() || '/';
                        aiBotDirectives.detected.push({ botName: matchedBot, directive: 'Disallow', path });
                        if (path === '/' || path === '') {
                            if (!aiBotDirectives.aiBotsBlocked.includes(matchedBot)) aiBotDirectives.aiBotsBlocked.push(matchedBot);
                        }
                    } else if (allowMatch) {
                        const path = allowMatch[1].trim() || '/';
                        aiBotDirectives.detected.push({ botName: matchedBot, directive: 'Allow', path });
                        if (!aiBotDirectives.aiBotsAllowed.includes(matchedBot)) aiBotDirectives.aiBotsAllowed.push(matchedBot);
                    }
                }
            }
        }

        return {
            found: true,
            valid: hasUserAgent && hasDisallowOrAllow,
            directives,
            aiBotDirectives,
            issues: (hasUserAgent && hasDisallowOrAllow) ? [] : ["Robots.txt missing key directives (User-agent or Disallow/Allow)."],
            score: (hasUserAgent && hasDisallowOrAllow) ? 85 : 40
        };
    } catch (error) {
        if (verbose) { console.error(`[SEOContentModule] Error fetching/parsing robots.txt ${robotsUrl}: ${error.message}`); }
        return { found: false, valid: false, directives: [], aiBotDirectives: { detected: [], aiBotsBlocked: [], aiBotsAllowed: [], hasExplicitAiPolicy: false }, issues: [error.message.substring(0, 100)], score: 10 };
    }
}

/**
 * Fetches and analyzes /llms.txt and /llms-full.txt for AI/LLM readiness.
 * Per the llmstxt.org specification.
 * Works in both browser and serverless (HTTP-only) modes.
 */
async function analyzeIsItAgentReady(siteUrl, verbose = false) {
    if (verbose) console.log(`[SEOContentModule] Checking isitagentready.com for ${siteUrl}`);
    const startTime = Date.now();
    try {
        const payload = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "scan_site", arguments: { url: siteUrl } }
        };
        const res = await fetch("https://isitagentready.com/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000) // 30s — endpoint can take 10-20s under load
        });
        
        const rawText = await res.text();
        const elapsed = Date.now() - startTime;
        if (verbose) console.log(`[SEOContentModule] isitagentready.com responded in ${elapsed}ms (${rawText.length} bytes)`);

        const lines = rawText.split('\n');
        let agentReadinessReport = "No data returned";
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const dataObj = JSON.parse(line.substring(6));
                    if (dataObj?.result?.content?.[0]?.text) {
                        agentReadinessReport = dataObj.result.content[0].text;
                        break;
                    }
                } catch (e) {
                    // Ignore parsing error for intermediate SSE lines
                }
            }
        }

        if (verbose && agentReadinessReport !== "No data returned") {
            const level = agentReadinessReport.match(/Level (\d+\/\d+)/)?.[1] || 'unknown';
            console.log(`[SEOContentModule] ✅ Agent readiness report received: Level ${level} (${agentReadinessReport.length} chars)`);
        }
        return agentReadinessReport;
    } catch (e) {
        const elapsed = Date.now() - startTime;
        if (verbose) console.warn(`[SEOContentModule] isitagentready.com check failed after ${elapsed}ms:`, e.message);
        return "Check failed or timed out: " + e.message;
    }
}

async function analyzeLlmsTxt(siteUrl, page, verbose = false) {
    const result = {
        llmsTxt: { found: false, valid: false, contentPreview: null, wordCount: 0, hasSections: false, url: null },
        llmsFullTxt: { found: false, valid: false, wordCount: 0, sizeKb: 0, url: null },
        score: 0
    };

    // Helper to fetch a text file
    async function fetchTxtFile(fileUrl) {
        try {
            const httpResult = await fetchTextContent(fileUrl, 10000);
            if (httpResult.ok && httpResult.text) return httpResult.text;
        } catch {
            // Fallback to page.goto if available
            if (page && !page.isClosed()) {
                const response = await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
                if (response && response.ok()) return await response.text();
            }
        }
        return null;
    }

    // Analyze /llms.txt
    const llmsUrl = new URL("/llms.txt", siteUrl).href;
    result.llmsTxt.url = llmsUrl;
    if (verbose) { console.log(`[SEOContentModule] Checking for llms.txt: ${llmsUrl}`); }
    try {
        const text = await fetchTxtFile(llmsUrl);
        if (text && text.length > 10 && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
            result.llmsTxt.found = true;
            result.llmsTxt.wordCount = text.trim().split(/\s+/).length;
            result.llmsTxt.contentPreview = text.substring(0, 500);
            result.llmsTxt.hasSections = /^#+\s/m.test(text) || /^>\s/m.test(text) || text.includes('---');
            result.llmsTxt.valid = result.llmsTxt.wordCount >= 50;
            result.score += result.llmsTxt.valid ? 50 : 25;
        }
    } catch (error) {
        if (verbose) { console.error(`[SEOContentModule] Error checking llms.txt: ${error.message}`); }
    }

    // Analyze /llms-full.txt
    const llmsFullUrl = new URL("/llms-full.txt", siteUrl).href;
    result.llmsFullTxt.url = llmsFullUrl;
    if (verbose) { console.log(`[SEOContentModule] Checking for llms-full.txt: ${llmsFullUrl}`); }
    try {
        const text = await fetchTxtFile(llmsFullUrl);
        if (text && text.length > 10 && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
            result.llmsFullTxt.found = true;
            result.llmsFullTxt.wordCount = text.trim().split(/\s+/).length;
            result.llmsFullTxt.sizeKb = Math.round(text.length / 1024 * 10) / 10;
            result.llmsFullTxt.valid = result.llmsFullTxt.wordCount >= 200;
            result.score += result.llmsFullTxt.valid ? 50 : 20;
        }
    } catch (error) {
        if (verbose) { console.error(`[SEOContentModule] Error checking llms-full.txt: ${error.message}`); }
    }

    return result;
}

// --- Helper Functions for Evidence-Based Score Calculation ---

function calculateRealisticSeoScore(seoData, extractedElements) {
    // GOLD-STANDARD: Pure evidence-based scoring — no URL hash, no artificial variation
    let baseScore = 45; // Starting point

    // Title factor
    if (extractedElements.title && extractedElements.title.length > 0) {
        if (extractedElements.title.length >= 30 && extractedElements.title.length <= 60) {
            baseScore += 15;
        } else if (extractedElements.title.length > 0) {
            baseScore += 8;
        }
    }

    // Meta description factor
    if (extractedElements.metaDescription && extractedElements.metaDescription.length > 0) {
        if (extractedElements.metaDescription.length >= 120 && extractedElements.metaDescription.length <= 160) {
            baseScore += 12;
        } else if (extractedElements.metaDescription.length > 0) {
            baseScore += 6;
        }
    }

    // Heading structure factor
    if (extractedElements.headings && extractedElements.headings.length > 0) {
        const hasH1 = extractedElements.headings.some(h => h.level === 1);
        const hasHierarchy = extractedElements.headings.length >= 3;
        if (hasH1 && hasHierarchy) {
            baseScore += 10;
        } else if (hasH1) {
            baseScore += 5;
        }
    }

    // Technical SEO factor
    if (extractedElements.canonicalUrl) baseScore += 3;
    if (extractedElements.robotsTag) baseScore += 3;
    if (extractedElements.viewportTag) baseScore += 3;
    if (extractedElements.lang) baseScore += 3;

    // Content factor
    if (extractedElements.wordCount && extractedElements.wordCount >= 300) {
        baseScore += 8;
    } else if (extractedElements.wordCount && extractedElements.wordCount >= 100) {
        baseScore += 4;
    }

    // GOLD-STANDARD: No URL-hash variation — score reflects only evidence
    return Math.max(1, Math.min(Math.round(baseScore), 100));
}

function calculateFieldRealisticMinimum(field, extractedElements) {
    switch (field) {
        case 'titleAnalysis':
            if (extractedElements.title && extractedElements.title.length > 0) {
                return extractedElements.title.length >= 30 && extractedElements.title.length <= 60 ? 75 : 45;
            }
            return 15;

        case 'descriptionAnalysis':
            if (extractedElements.metaDescription && extractedElements.metaDescription.length > 0) {
                return extractedElements.metaDescription.length >= 120 && extractedElements.metaDescription.length <= 160 ? 70 : 40;
            }
            return 20;

        case 'canonicalUrl':
            return extractedElements.canonicalUrl ? 80 : 25;

        case 'robotsDirectives':
            return extractedElements.robotsTag ? 65 : 30;

        default:
            return 25;
    }
}

function calculateTechnicalFieldScore(field, sitemapAnalysis, robotsTxtAnalysis, extractedElements) {
    switch (field) {
        case 'sitemapAnalysis':
            if (sitemapAnalysis && sitemapAnalysis.found) {
                return sitemapAnalysis.valid ? Math.max(70, sitemapAnalysis.score || 70) : 40;
            }
            return 25;

        case 'robotsTxtAnalysis':
            if (robotsTxtAnalysis && robotsTxtAnalysis.found) {
                return robotsTxtAnalysis.valid ? Math.max(65, robotsTxtAnalysis.score || 65) : 35;
            }
            return 30;

        case 'linkAnalysis':
            // Base score on actual link structure
            if (extractedElements.internalLinks && extractedElements.externalLinks) {
                const totalLinks = extractedElements.internalLinks + extractedElements.externalLinks;
                if (totalLinks > 0) {
                    const internalRatio = extractedElements.internalLinks / totalLinks;
                    return Math.max(35, Math.min(85, 40 + (internalRatio * 45)));
                }
            }
            return 35;

        default:
            return 30;
    }
}

function calculateContentFieldScore(field, extractedElements) {
    switch (field) {
        case 'keywordUsage':
            // Base score on content length and structure
            if (extractedElements.wordCount && extractedElements.wordCount > 0) {
                const hasTitle = extractedElements.title && extractedElements.title.length > 0;
                const hasHeadings = extractedElements.headings && extractedElements.headings.length > 0;
                const hasContent = extractedElements.wordCount >= 100;

                let score = 20;
                if (hasTitle) score += 20;
                if (hasHeadings) score += 25;
                if (hasContent) score += 25;

                return Math.max(35, Math.min(score, 85));
            }
            return 35;

        case 'readabilityScore':
            // Base score on content structure
            if (extractedElements.wordCount && extractedElements.wordCount > 0) {
                const hasHeadings = extractedElements.headings && extractedElements.headings.length > 0;
                const hasParagraphs = extractedElements.wordCount >= 100;

                let score = 40;
                if (hasHeadings) score += 20;
                if (hasParagraphs) score += 20;

                return Math.max(40, Math.min(score, 85));
            }
            return 40;

        case 'eatMetrics':
            // Base E-A-T score on actual signals
            let score = 25;
            if (extractedElements.authorInfo && extractedElements.authorInfo.authors && extractedElements.authorInfo.authors.length > 0) {
                score += 20;
            }
            if (extractedElements.authorInfo && extractedElements.authorInfo.publisher) {
                score += 15;
            }
            if (extractedElements.lastModifiedDate) {
                score += 10;
            }

            return Math.max(25, Math.min(score, 80));

        default:
            return 30;
    }
}

// --- Main Analyze Function ---

async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

const {
        page,
        modelFamily, model, maxTokens,
        onProgress, verbose = false,
        analysisDepth = 'basic',
        tier = "Basic",
        featureSet = {},
        industryContext,
        costAggregator = null,
        performanceModuleData, // Optional data from performance module
        uiModuleData, // Optional data from UI/Compatibility module
        globalState = {} // ENHANCED: Accept globalState
    } = options;

    const modelConfigOptions = { modelFamily, model, maxTokens, tier, analysisDepth };
    const startTimestamp = Date.now();

    // CRITICAL FIX: Define industryType early to prevent "industryType is not defined" errors
    const industryType = industryContext?.primaryIndustry || 'General';
    const industrySubtype = industryContext?.subtype || '';

    if (verbose) { console.log(`[SEOContentModule] Starting SEO & Content analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth})`); }
    if (onProgress) { onProgress('seoContent', 'Initializing SEO & Content analysis', 0); }

    let seoContentModuleOutput = {
        summary: { score: null, rating: 'Pending', topIssues: [] },
        _skipped: true,
        metadata: {}, content: {}, technical: {}, schemaMarkup: {},
        localSEO: null, voiceSearchOptimization: null, eatAnalysis: null, socialMedia: null,
        geoAnalysis: null, aeoAnalysis: null, agentReadinessReport: null,
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        industryBenchmarks: null, roiProjections: null, businessImpact: null, implementationRoadmap: null, competitiveContentAnalysis: null,
        error: null
    };

    try {
        // Use CF extracted shared context if page is not available
        let extractedElements = {};
        if (page && !page.isClosed()) {
            if (onProgress) { onProgress('seoContent', 'Extracting on-page elements', 10); }
            extractedElements = await extractSeoAndContentElements(page, url);
            
            // Fetch deterministic DOM signals for the scoring engine
            if (verbose) { console.log('[SEOContentModule] Collecting deterministic DOM signals...'); }
            const html = await page.content().catch(() => '');
            seoContentModuleOutput._collectedSignals = collectDomSignals(html);
        } else if (options.sharedPageContext) {
            if (verbose) { console.log("[SEOContentModule] No Playwright page; falling back to sharedPageContext from CF."); }
            const spc = options.sharedPageContext;
            extractedElements = {
                title: spc.title || "",
                metaDescription: spc.metaDescription || "",
                headings: spc.headings || { h1: [], h2: [], h3: [] },
                links: spc.links || { internal: 0, external: 0 },
                wordCount: spc.bodyText ? spc.bodyText.split(/\s+/).length : 0,
                textContentSample: spc.bodyText ? spc.bodyText.substring(0, 5000) : "",
                schemaMarkup: spc.structuredExtractions?.filter(e => e.type === 'schema') || [],
                images: spc.images ? Array.from({length: spc.images.total}, (_, i) => ({hasAlt: i < spc.images.withAlt})) : [],
                // COPYRIGHT DETECTION from text content (no-browser fallback)
                copyrightInfo: (() => {
                    const bodyText = spc.bodyText || '';
                    if (!bodyText) return { found: false, year: null, yearRange: null, fullText: null, isCurrentYear: false, yearsOutdated: null, location: null };
                    const currentYear = new Date().getFullYear();
                    const patterns = [
                        /(?:©|&copy;|\(c\)|copyright)\s*(\d{4})(?:\s*[-–—]\s*(\d{4}))?/gi,
                        /(\d{4})(?:\s*[-–—]\s*(\d{4}))?(?:\s*(?:©|&copy;|\(c\)|copyright))/gi,
                        /all\s*rights\s*reserved\s*[.,]?\s*(\d{4})(?:\s*[-–—]\s*(\d{4}))?/gi,
                        /(\d{4})(?:\s*[-–—]\s*(\d{4}))?(?:\s*all\s*rights\s*reserved)/gi
                    ];
                    for (const pattern of patterns) {
                        pattern.lastIndex = 0;
                        const match = pattern.exec(bodyText);
                        if (match) {
                            const startYear = parseInt(match[1], 10);
                            const endYear = match[2] ? parseInt(match[2], 10) : null;
                            const displayYear = endYear || startYear;
                            if (startYear >= 1990 && startYear <= currentYear + 1 &&
                                (!endYear || (endYear >= startYear && endYear <= currentYear + 1))) {
                                return {
                                    found: true,
                                    year: displayYear,
                                    yearRange: endYear ? `${startYear}-${endYear}` : `${startYear}`,
                                    fullText: match[0].trim().substring(0, 100),
                                    isCurrentYear: displayYear === currentYear,
                                    yearsOutdated: displayYear < currentYear ? currentYear - displayYear : 0,
                                    location: 'body'
                                };
                            }
                        }
                    }
                    return { found: false, year: null, yearRange: null, fullText: null, isCurrentYear: false, yearsOutdated: null, location: null };
                })(),
            };
        } else {
            console.warn("[SEOContentModule] Neither page nor sharedPageContext available. Using minimum defaults.");
        }
        if (verbose) { console.log("[SEOContentModule] Extracted Elements (sample):", JSON.stringify(extractedElements.title, null, 2)); }

        // GOLD-STANDARD: Evidence-based content quality metrics
        let contentQualityEvidence = null;
        try {
            contentQualityEvidence = await extractContentQuality(page, verbose);
            if (verbose) {
                console.log(`[SEOContentModule] Content Quality Evidence: overall=${contentQualityEvidence.scores?.overall?.score}, readability=${contentQualityEvidence.scores?.readability?.gradeLevel}, depth=${contentQualityEvidence.scores?.depth?.score}`);
            }
        } catch (cqErr) {
            if (verbose) console.warn('[SEOContentModule] Content quality extraction failed:', cqErr.message);
        }

        // BEST-IN-CLASS: Keyword & topic analysis evidence
        let keywordEvidence = null;
        let keywordScore = null;
        try {
            keywordEvidence = await extractKeywordEvidence(page, verbose);
            keywordScore = scoreKeywordOptimization(keywordEvidence);
            if (verbose) {
                console.log(`[SEOContentModule] Keyword Evidence: top="${keywordEvidence.topUnigrams[0]?.term || 'none'}"(${keywordEvidence.topUnigrams[0]?.density || 0}%), alignment=${keywordEvidence.alignment.score}, stuffed=${keywordEvidence.stuffedTerms.length}`);
            }
        } catch (kwErr) {
            if (verbose) console.warn('[SEOContentModule] Keyword analysis failed:', kwErr.message);
        }

        // BEST-IN-CLASS: E-E-A-T signal evidence
        let eatEvidence = null;
        try {
            eatEvidence = await extractEATSignals(page, verbose);
            if (verbose) {
                console.log(`[SEOContentModule] E-E-A-T Evidence: authors=${eatEvidence.author?.htmlAuthors?.length || 0}, credentials=${eatEvidence.credentials?.count || 0}, authorityLinks=${eatEvidence.authority?.totalAuthorityLinks || 0}, contact=${eatEvidence.contact?.completeness || 0}/5, overall=${eatEvidence.scores?.overall?.score || 0}`);
            }
        } catch (eatErr) {
            if (verbose) console.warn('[SEOContentModule] E-E-A-T extraction failed:', eatErr.message);
        }

        if (onProgress) { onProgress('seoContent', 'Analyzing sitemap & robots.txt', 15); }
        const sitemapAnalysis = await analyzeSitemap(url, page, verbose);
        const robotsTxtAnalysis = await analyzeRobotsTxt(url, page, verbose);

        if (onProgress) { onProgress('seoContent', 'Checking AI/LLM readiness (llms.txt, AI bots)', 20); }
        const llmsAnalysis = await analyzeLlmsTxt(url, page, verbose);

        if (onProgress) { onProgress('seoContent', 'Querying isitagentready.com', 25); }
        const agentReadinessRawReport = await analyzeIsItAgentReady(url, verbose);

        // Navigate back to original URL after fetching auxiliary files (only needed when page was used)
        if (page && !page.isClosed()) {
            try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null); } catch (e) { /* ignore */ }
        }

        const isYMYL = industryContext?.primaryIndustry && ["Healthcare", "Finance"].includes(industryContext.primaryIndustry);
        const promptVariables = {
            url,
            industryContext: industryContext || { primaryIndustry: "Unknown" },
            isYMYLStatus: isYMYL ? "Yes, this is a Your Money Your Life (YMYL) site." : "No, this is not strictly a YMYL site.",
            analysisDepth, tier, featureSet: JSON.stringify(featureSet),
            titleText: extractedElements.title,
            titleLength: extractedElements.title?.length || 0,
            metaDescriptionText: extractedElements.metaDescription,
            metaDescriptionLength: extractedElements.metaDescription?.length || 0,
            h1Count: extractedElements.headings?.h1?.length || 0,
            firstH1Text: extractedElements.headings?.h1?.[0] || "",
            headingStructureSummary: `H1:${extractedElements.headings?.h1?.length || 0}(${(extractedElements.headings?.h1 || []).join(',').substring(0, 50)}), H2:${extractedElements.headings?.h2?.length || 0}, H3:${extractedElements.headings?.h3?.length || 0}`,
            wordCount: extractedElements.wordCount,
            textContentSample: extractedElements.textContentSample, // Pass the larger sample
            primaryKeyword: "{{primaryKeywordPlaceholder_AI_to_infer}}",
            secondaryKeywordsString: "{{secondaryKeywordsPlaceholder_AI_to_infer}}",
            schemaTypesSnippet: extractedElements.schemaMarkup?.map(s => s['@type'] || Object.keys(s)[0] || "Unknown").join(', ') || "None detected",
            schemaMarkupSample: JSON.stringify((extractedElements.schemaMarkup || []).slice(0, 1)).substring(0, 500), // Sample of first schema
            linkCountsSnippet: `Internal: ${extractedElements.links?.internal?.length || 0}, External: ${extractedElements.links?.external?.length || 0}, Nofollow: ${extractedElements.links?.nofollowCount || 0}`,
            imageCount: extractedElements.images?.length || 0,
            imagesMissingAltTextCount: (extractedElements.images || []).filter(img => !img.hasAlt).length || 0,
            imagesWithGenericAltTextCount: (extractedElements.images || []).filter(img => img.hasAlt && ((img.alt || '').length < 5 || /image|logo|icon/i.test(img.alt || ''))).length || 0, // Basic generic check
            sitemapStatus: sitemapAnalysis.found && sitemapAnalysis.valid ? `Found, valid, ${sitemapAnalysis.entryCount} entries.` : `Sitemap ${sitemapAnalysis.found ? 'found but invalid/empty' : 'not found'}. Issues: ${(sitemapAnalysis.issues || []).join(', ')}`,
            robotsTxtStatus: robotsTxtAnalysis.found && robotsTxtAnalysis.valid ? `Found, valid, directives: ${(robotsTxtAnalysis.directives || []).slice(0, 3).join('; ')}...` : `Robots.txt ${robotsTxtAnalysis.found ? 'found but invalid' : 'not found'}. Issues: ${(robotsTxtAnalysis.issues || []).join(', ')}`,
            lcpValue: getNestedProperty(performanceModuleData, 'metrics.largestContentfulPaint.value'),
            clsValue: getNestedProperty(performanceModuleData, 'metrics.cumulativeLayoutShift.value'),
            mobileFriendlinessScoreFromUI: getNestedProperty(uiModuleData, 'viewportAnalyses.mobile.structured.responsiveness.rating'), // More specific
            targetAudienceDescription: getNestedProperty(industryContext, 'businessIntelligence.targetAudience', 'General Audience'),
            businessGoalsDescription: getNestedProperty(industryContext, 'businessIntelligence.keyConversionGoals', []).join(', ') || 'Standard business objectives',
            competitorUrlsString: getNestedProperty(industryContext, 'competitiveLandscape.keyCompetitors', []).join(', ') || 'Not specified',
            contentLastUpdateDate: extractedElements.lastModifiedDate,
            contentPublishDate: "Unknown", // Hard to get reliably without CMS access
            // Copyright date detection for content freshness signals
            copyrightYear: extractedElements.copyrightInfo?.year || "Not found",
            copyrightYearRange: extractedElements.copyrightInfo?.yearRange || "N/A",
            copyrightIsCurrent: extractedElements.copyrightInfo?.isCurrentYear ? "Yes" : (extractedElements.copyrightInfo?.found ? "No" : "Unknown"),
            copyrightYearsOutdated: extractedElements.copyrightInfo?.yearsOutdated ?? "N/A",
            copyrightFullText: extractedElements.copyrightInfo?.fullText || "No copyright notice found",
            authorBiosPresent: extractedElements.authorInfo?.authors?.length > 0,
            publisherInfoPresent: !!extractedElements.authorInfo?.publisher,
            hreflangTagsCount: extractedElements.hreflangTags?.tagsFound?.length || 0,
            hreflangIssuesSummary: (extractedElements.hreflangTags?.issues || []).join('; ') || "No issues pre-detected",
            viewportMetaValue: extractedElements.viewportTag?.value || "Not set",
            // AI/LLM Readiness signals for AI analysis
            agentReadinessReport: (agentReadinessRawReport || "").substring(0, 3000),
            llmsTxtStatus: llmsAnalysis.llmsTxt.found ? `Found (${llmsAnalysis.llmsTxt.wordCount} words, ${llmsAnalysis.llmsTxt.valid ? 'valid' : 'too short'})` : 'Not found',
            llmsFullTxtStatus: llmsAnalysis.llmsFullTxt.found ? `Found (${llmsAnalysis.llmsFullTxt.wordCount} words, ${llmsAnalysis.llmsFullTxt.sizeKb}KB)` : 'Not found',
            aiBotPolicy: robotsTxtAnalysis.aiBotDirectives?.hasExplicitAiPolicy
                ? `Explicit AI bot policy detected. Blocked: [${(robotsTxtAnalysis.aiBotDirectives.aiBotsBlocked || []).join(', ')}]. Allowed: [${(robotsTxtAnalysis.aiBotDirectives.aiBotsAllowed || []).join(', ')}].`
                : 'No explicit AI bot policy in robots.txt',
            aiSignalsSummary: `AI-facing links: ${extractedElements.aiReadinessSignals?.aiLinks?.length || 0}, Speakable markup: ${extractedElements.aiReadinessSignals?.hasSpeakableMarkup ? 'Yes' : 'No'}, AI meta tags: ${extractedElements.aiReadinessSignals?.aiMetaTags?.length || 0}`,
            citabilityBlocksSnippet: JSON.stringify(extractedElements.citabilityBlocks || []).substring(0, 800),
            aiBotsBlockedSnippet: (robotsTxtAnalysis.aiBotDirectives?.aiBotsBlocked || []).join(', ') || "None",
            aiBotsAllowedSnippet: (robotsTxtAnalysis.aiBotDirectives?.aiBotsAllowed || []).join(', ') || "None",

            // ACCURACY FIX: Pass ground truth values explicitly so AI prompt templates can anchor on them
            canonicalUrl: extractedElements.canonicalUrl || null,
            htmlLang: extractedElements.htmlLang || null,
        };

        if (onProgress) { onProgress('seoContent', 'Preparing AI analysis prompt', 30); }

        // Build content quality evidence summary for two-pass prompts
        let contentQualitySummary = 'N/A';
        if (seoContentModuleOutput.contentQualityEvidence) {
            const cq = seoContentModuleOutput.contentQualityEvidence;
            contentQualitySummary = `readability=${cq.readability?.score || 'N/A'}, headingQuality=${cq.headingQuality?.score || 'N/A'}, contentDepth=${cq.contentDepth?.score || 'N/A'}, overall=${cq.overallScore || 'N/A'}/100`;
        }

        // BEST-IN-CLASS: Build keyword evidence summary
        let keywordEvidenceSummary = 'N/A';
        if (keywordEvidence) {
            const topKw = keywordEvidence.topUnigrams.slice(0, 5).map(k => `${k.term}(${k.density}%)`).join(', ');
            const topBigrams = keywordEvidence.topBigrams.slice(0, 3).map(k => k.term).join(', ');
            const stuffed = keywordEvidence.stuffedTerms.length > 0 ? `STUFFED: ${keywordEvidence.stuffedTerms.map(k => k.term).join(', ')}` : 'no stuffing';
            const prom = keywordEvidence.prominence.slice(0, 3).map(k => `${k.term}(title:${k.inTitle},h1:${k.inH1},meta:${k.inMetaDesc})`).join(', ');
            keywordEvidenceSummary = `Top terms: [${topKw}]. Bigrams: [${topBigrams}]. Alignment: ${keywordEvidence.alignment.score}/100 (title↔H1 duplicate: ${keywordEvidence.alignment.titleH1Duplicate}). Prominence: [${prom}]. ${stuffed}. Score: ${keywordScore?.score || 'N/A'}/100.`;
        }

        // BEST-IN-CLASS: Build E-E-A-T evidence summary
        let eatEvidenceSummary = 'N/A';
        if (eatEvidence) {
            eatEvidenceSummary = `Authors: ${eatEvidence.author?.htmlAuthors?.length || 0} bylines, ${eatEvidence.author?.schemaAuthors?.length || 0} schema. Credentials: ${eatEvidence.credentials?.count || 0}. Authority links: ${eatEvidence.authority?.eduLinks || 0} .edu, ${eatEvidence.authority?.govLinks || 0} .gov, ${eatEvidence.authority?.researchLinks || 0} research. Contact: ${eatEvidence.contact?.completeness || 0}/5. About page: ${eatEvidence.about?.hasAboutLink ? 'yes' : 'no'}, Team: ${eatEvidence.about?.hasTeamSection ? 'yes' : 'no'}. Dates: published=${eatEvidence.dates?.publishedTime || 'none'}, modified=${eatEvidence.dates?.modifiedTime || 'none'}. Overall E-E-A-T: ${eatEvidence.scores?.overall?.score || 0}/100${eatEvidence.scores?.overall?.isYMYL ? ' (YMYL)' : ''}.`;
        }

        // Merge all evidence summaries into prompt variables
        const twoPassVars = { 
            ...promptVariables, 
            contentQualitySummary, 
            keywordEvidenceSummary, 
            eatEvidenceSummary,
            
            // MULTI-PAGE CONTEXT: Subpage content from Cloudflare crawler
            subpageContentSummary: options.sharedPageContext?.subpageContentSummary || "Not available"
        };

        if (onProgress) { onProgress('seoContent', `Calling AI (two-pass pipeline)`, 40); }

        // Build evidence registry and pre-execute evidence block for prompt injection
        let evidenceBlock;
        const rawHtmlForRegistry = options.sharedPageContext?._rawHtml || '';
        if (rawHtmlForRegistry) {
            const registry = buildEvidenceRegistry(rawHtmlForRegistry, url, { verbose, sharedPageContext: options.sharedPageContext });
            evidenceBlock = registry.toEvidenceBlock({ categories: ['seo', 'meta', 'content', 'platform'] });
            if (verbose) {
                console.log(`[SEOContentModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
            }
        }

        // GOLD-STANDARD: Two-pass AI analysis pipeline
        const aiResult = await twoPassAnalysis({
            moduleName: 'seoContent',
            evidenceData: twoPassVars,
            industryContext,
            pass1Template: 'seo-evidence-extraction',
            pass2Template: 'seo-expert-judgment',
            pass2Schema: await getSchemaForModule('seoContentModule', false),
            tier,
            analysisDepth,
            modelFamily: modelFamily,
            model: model,
            costAggregator,
            verbose,
            evidenceBlock,
        });

        if (onProgress) { onProgress('seoContent', 'AI analysis received', 80); }

        const aiResponse = aiResult.analysis || aiResult.data || aiResult; // Two-pass returns .analysis
        if (aiResponse && typeof aiResponse === 'object') {
            // CRITICAL FIX: Ensure summary is an object before merging to prevent schema violation
            if (aiResponse.summary && typeof aiResponse.summary !== 'object') {
                console.warn('[SEOContentModule] Invalid summary format received from AI (not an object). Discarding summary update.');
                delete aiResponse.summary;
            }

            if (aiResponse.summary || Object.keys(aiResponse).length > 1) {
                seoContentModuleOutput = { ...seoContentModuleOutput, ...aiResponse };

                // CRITICAL FIX: Ensure sub-objects are actually objects, not strings (common AI error)
                ['metadata', 'content', 'technical', 'schemaMarkup'].forEach(field => {
                    if (seoContentModuleOutput[field] && typeof seoContentModuleOutput[field] !== 'object') {
                        if (verbose) console.warn(`[SEOContentModule] AI returned ${field} as ${typeof seoContentModuleOutput[field]}, expected object. Resetting to default.`);
                        // Preserve the string as a 'generalAnalysis' property if it's a string, might be useful
                        const currentValue = seoContentModuleOutput[field];
                        seoContentModuleOutput[field] = typeof currentValue === 'string' ? { generalAnalysis: currentValue } : {};
                    }
                });
            }

            // GOLD-STANDARD: Inject narrative and evidence from two-pass pipeline
            if (aiResult.narrative) {
                seoContentModuleOutput.narrative = aiResult.narrative;
            }
            if (aiResult.agentMeta) {
                seoContentModuleOutput._agentMeta = aiResult.agentMeta;
            }
            if (aiResult.evidence) {
                seoContentModuleOutput.evidenceSummary = aiResult.evidence;
            }

            // CRITICAL FIX: Validate and correct erroneous scores immediately after AI merge
            if (seoContentModuleOutput.summary && typeof seoContentModuleOutput.summary.score === 'number') {
                const rawScore = seoContentModuleOutput.summary.score;

                // CRITICAL FIX: Scores of 0, 1, and 50 are erroneous indicators
                if (rawScore === 0 || rawScore === 1) {
                    // Complete failure scores - likely AI error, set to realistic minimum
                    seoContentModuleOutput.summary.score = 15;
                    if (verbose) {
                        console.log(`[SEOContentModule] CRITICAL FIX: Corrected erroneous score from ${rawScore} to 15 (realistic minimum)`);
                    }
                } else if (rawScore === 50) {
                    // Suspicious neutral score - likely AI uncertainty, calculate realistic score
                    const realisticScore = calculateRealisticSeoScore(seoContentModuleOutput, extractedElements);
                    seoContentModuleOutput.summary.score = realisticScore;
                    if (verbose) {
                        console.log(`[SEOContentModule] CRITICAL FIX: Corrected suspicious neutral score from 50 to ${realisticScore} (evidence-based)`);
                    }
                }
            }

            // CRITICAL FIX: Validate metadata scores to prevent 0/1 errors
            if (seoContentModuleOutput.metadata) {
                ['titleAnalysis', 'descriptionAnalysis', 'canonicalUrl', 'robotsDirectives'].forEach(field => {
                    if (seoContentModuleOutput.metadata[field] && typeof seoContentModuleOutput.metadata[field].score === 'number') {
                        const fieldScore = seoContentModuleOutput.metadata[field].score;
                        if (fieldScore === 0 || fieldScore === 1) {
                            // Apply realistic minimum based on actual data
                            const realisticMinimum = calculateFieldRealisticMinimum(field, extractedElements);
                            seoContentModuleOutput.metadata[field].score = realisticMinimum;
                            if (verbose) {
                                console.log(`[SEOContentModule] CRITICAL FIX: Corrected ${field} score from ${fieldScore} to ${realisticMinimum}`);
                            }
                        }
                    }
                });
            }

            // CRITICAL FIX: Validate technical scores to prevent 0/1 errors
            if (seoContentModuleOutput.technical) {
                ['sitemapAnalysis', 'robotsTxtAnalysis', 'linkAnalysis'].forEach(field => {
                    if (seoContentModuleOutput.technical[field] && typeof seoContentModuleOutput.technical[field].score === 'number') {
                        const fieldScore = seoContentModuleOutput.technical[field].score;
                        if (fieldScore === 0 || fieldScore === 1) {
                            // Use ground truth data to calculate realistic score
                            const groundTruthScore = calculateTechnicalFieldScore(field, sitemapAnalysis, robotsTxtAnalysis, extractedElements);
                            seoContentModuleOutput.technical[field].score = groundTruthScore;
                            if (verbose) {
                                console.log(`[SEOContentModule] CRITICAL FIX: Corrected technical ${field} score from ${fieldScore} to ${groundTruthScore}`);
                            }
                        }
                    }
                });
            }

            // CRITICAL FIX: Validate content scores to prevent 0/1 errors
            if (seoContentModuleOutput.content) {
                ['keywordUsage', 'readabilityScore', 'eatMetrics'].forEach(field => {
                    const fieldData = seoContentModuleOutput.content[field];
                    if (fieldData && typeof fieldData.score === 'number') {
                        const fieldScore = fieldData.score;
                        if (fieldScore === 0 || fieldScore === 1) {
                            const realisticScore = calculateContentFieldScore(field, extractedElements);
                            fieldData.score = realisticScore;
                            if (verbose) {
                                console.log(`[SEOContentModule] CRITICAL FIX: Corrected content ${field} score from ${fieldScore} to ${realisticScore}`);
                            }
                        }
                    } else if (field === 'readabilityScore' && (fieldData === 0 || fieldData === 1)) {
                        // Handle direct numeric readabilityScore
                        const realisticScore = calculateContentFieldScore(field, extractedElements);
                        seoContentModuleOutput.content[field] = realisticScore;
                        if (verbose) {
                            console.log(`[SEOContentModule] CRITICAL FIX: Corrected readabilityScore from ${fieldData} to ${realisticScore}`);
                        }
                    }
                });
            }

            // CRITICAL FIX: Clean up metadata.descriptionAnalysis.value to prevent "-2789" errors
            if (seoContentModuleOutput.metadata && seoContentModuleOutput.metadata.descriptionAnalysis) {
                // Ensure value is the actual meta description text, not a negative number
                if (typeof seoContentModuleOutput.metadata.descriptionAnalysis.value === 'number' ||
                    (typeof seoContentModuleOutput.metadata.descriptionAnalysis.value === 'string' &&
                        seoContentModuleOutput.metadata.descriptionAnalysis.value.match(/^-?\d+$/))) {
                    seoContentModuleOutput.metadata.descriptionAnalysis.value = extractedElements.metaDescription || "No meta description found";
                }
            }

            // CRITICAL FIX: Remove redundant viewportTag to avoid duplication with viewportTagAnalysis
            if (seoContentModuleOutput.metadata && seoContentModuleOutput.metadata.viewportTag && seoContentModuleOutput.metadata.viewportTagAnalysis) {
                delete seoContentModuleOutput.metadata.viewportTag;
            }

            // CRITICAL FIX: Ensure viewportTagAnalysis is properly populated instead of viewportTag
            if (!seoContentModuleOutput.metadata.viewportTagAnalysis && seoContentModuleOutput.metadata.viewportTag) {
                seoContentModuleOutput.metadata.viewportTagAnalysis = seoContentModuleOutput.metadata.viewportTag;
                delete seoContentModuleOutput.metadata.viewportTag;
            }

            // CRITICAL FIX: Set technical.robotsTxt from ground truth robotsTxtAnalysis.found
            if (seoContentModuleOutput.technical && seoContentModuleOutput.technical.robotsTxtAnalysis) {
                seoContentModuleOutput.technical.robotsTxt = seoContentModuleOutput.technical.robotsTxtAnalysis.found === true;
            }

            // CRITICAL FIX: Remove contradictory top-level eatAnalysis that conflicts with content.eatMetrics
            if (seoContentModuleOutput.eatAnalysis && seoContentModuleOutput.content && seoContentModuleOutput.content.eatMetrics) {
                // Keep the more detailed content.eatMetrics and remove the contradictory top-level one
                delete seoContentModuleOutput.eatAnalysis;
            }

            // CRITICAL FIX: Ensure E-A-T metrics have realistic scores instead of defaults
            if (seoContentModuleOutput.content && seoContentModuleOutput.content.eatMetrics) {
                const eatMetrics = seoContentModuleOutput.content.eatMetrics;

                // If overallEatScore is 100 but all boolean sub-fields are false, recalculate
                if (eatMetrics.overallEatScore === 100 &&
                    (!eatMetrics.authorBiosPresent || !eatMetrics.publisherInfoPresent || !eatMetrics.contactInfoPresent)) {

                    // Calculate realistic E-A-T score based on actual signals
                    const eatSignals = [
                        eatMetrics.authorBiosPresent || false,
                        eatMetrics.publisherInfoPresent || false,
                        eatMetrics.contactInfoPresent || false,
                        eatMetrics.expertiseSignals || false,
                        eatMetrics.authoritySignals || false,
                        eatMetrics.trustSignals || false
                    ];

                    const presentSignals = eatSignals.filter(Boolean).length;
                    const realisticScore = Math.round((presentSignals / eatSignals.length) * 100);

                    eatMetrics.overallEatScore = realisticScore;

                    // Provide specific recommendations if score is low
                    if (realisticScore < 70) {
                        eatMetrics.recommendations = [
                            "Add detailed author bios with credentials and expertise information",
                            "Include clear publisher information and contact details",
                            "Display relevant certifications, awards, or recognition",
                            "Add testimonials or reviews from credible sources",
                            "Include citations and references to authoritative sources"
                        ].slice(0, 3);
                    }
                }
            }

            seoContentModuleOutput.technical.sitemapAnalysis = { ...getNestedProperty(seoContentModuleOutput, 'technical.sitemapAnalysis', {}), ...sitemapAnalysis };
            seoContentModuleOutput.technical.robotsTxtAnalysis = { ...getNestedProperty(seoContentModuleOutput, 'technical.robotsTxtAnalysis', {}), ...robotsTxtAnalysis };

            // Set robotsTxt boolean from ground truth
            seoContentModuleOutput.technical.robotsTxt = robotsTxtAnalysis.found === true;

            // GOLD-STANDARD: Integrate AI/LLM Readiness data into technical section
            seoContentModuleOutput.technical.aiReadiness = {
                llmsTxt: llmsAnalysis.llmsTxt,
                llmsFullTxt: llmsAnalysis.llmsFullTxt,
                llmsReadinessScore: llmsAnalysis.score,
                aiBotPolicy: robotsTxtAnalysis.aiBotDirectives || { detected: [], aiBotsBlocked: [], aiBotsAllowed: [], hasExplicitAiPolicy: false },
                aiLinks: extractedElements.aiReadinessSignals?.aiLinks || [],
                hasSpeakableMarkup: extractedElements.aiReadinessSignals?.hasSpeakableMarkup || false,
                hasAiPluginManifest: extractedElements.aiReadinessSignals?.hasAiPluginManifest || false,
                aiMetaTags: extractedElements.aiReadinessSignals?.aiMetaTags || [],
                overallAiReadinessScore: (() => {
                    let score = 0;
                    // llms.txt presence (0-30)
                    if (llmsAnalysis.llmsTxt.found) score += llmsAnalysis.llmsTxt.valid ? 20 : 10;
                    if (llmsAnalysis.llmsFullTxt.found) score += llmsAnalysis.llmsFullTxt.valid ? 10 : 5;
                    // AI bot policy (0-25)
                    if (robotsTxtAnalysis.aiBotDirectives?.hasExplicitAiPolicy) score += 15;
                    if ((robotsTxtAnalysis.aiBotDirectives?.aiBotsAllowed || []).length > 0) score += 10;
                    // AI-facing links (0-20)
                    score += Math.min(20, (extractedElements.aiReadinessSignals?.aiLinks?.length || 0) * 10);
                    // Speakable markup (0-15)
                    if (extractedElements.aiReadinessSignals?.hasSpeakableMarkup) score += 15;
                    // AI meta tags (0-10)
                    if ((extractedElements.aiReadinessSignals?.aiMetaTags || []).length > 0) score += 10;
                    return Math.min(100, score);
                })()
            };

            // Remove any duplicate/redundant simple fields
            if (seoContentModuleOutput.technical.hasOwnProperty('sitemap')) {
                delete seoContentModuleOutput.technical.sitemap;
                if (verbose) { console.log("[SEOContentModule] Removed redundant sitemap field, using sitemapAnalysis only"); }
            }
            // Set robotsTxt boolean from ground truth robotsTxtAnalysis
            if (seoContentModuleOutput.technical.hasOwnProperty('robotsTxtAnalysis')) {
                seoContentModuleOutput.technical.robotsTxt = seoContentModuleOutput.technical.robotsTxtAnalysis.found === true;
                if (verbose) { console.log(`[SEOContentModule] Set robotsTxt=${seoContentModuleOutput.technical.robotsTxt} from robotsTxtAnalysis.found`); }
            }

            // CRITICAL FIX: eatAnalysis removed to prevent duplication with content.eatMetrics
            // The AI provides detailed eatMetrics which is more comprehensive than the simple eatAnalysis

            // Ensure essential metadata sub-objects are present with proper extracted data
            seoContentModuleOutput.metadata = seoContentModuleOutput.metadata || {};
            seoContentModuleOutput.metadata.hreflangTags = seoContentModuleOutput.metadata.hreflangTags || {
                tagsFound: extractedElements.hreflangTags?.tagsFound || [],
                issues: extractedElements.hreflangTags?.issues || [],
                score: 10
            };
            // Note: viewportTagAnalysis should already be properly set by AI, don't override

            // CRITICAL FIX: Ensure keywordUsage distribution values are numbers, not strings
            if (seoContentModuleOutput.content && seoContentModuleOutput.content.keywordUsage && seoContentModuleOutput.content.keywordUsage.distribution) {
                const dist = seoContentModuleOutput.content.keywordUsage.distribution;

                // CRITICAL FIX: Handle inconsistent distribution structure formats
                // Some reports use boolean fields with different names, standardize to correct schema
                if (dist.titlePresence !== undefined || dist.headingsPresence !== undefined || dist.bodyPresence !== undefined) {
                    // Convert from boolean presence format to numeric frequency format
                    if (verbose) {
                        console.log("[SEOContentModule] Converting boolean distribution format to numeric frequency format");
                    }

                    dist.title = dist.titlePresence ? 1 : 0;
                    dist.headings = dist.headingsPresence ? 1 : 0;
                    dist.body = dist.bodyPresence ? 1 : 0;

                    // Calculate score based on presence and distribution
                    const presenceCount = (dist.titlePresence ? 1 : 0) + (dist.headingsPresence ? 1 : 0) + (dist.bodyPresence ? 1 : 0);
                    const isWellDistributed = dist.isWellDistributed !== undefined ? dist.isWellDistributed : presenceCount >= 2;
                    dist.score = isWellDistributed ? Math.min(100, 30 + (presenceCount * 23)) : Math.max(0, presenceCount * 20);

                    // Remove the non-schema fields
                    delete dist.titlePresence;
                    delete dist.headingsPresence;
                    delete dist.bodyPresence;
                    delete dist.isWellDistributed;
                }

                // ADDITIONAL FIX: Handle boolean values in correct field names
                if (typeof dist.title === 'boolean' || typeof dist.headings === 'boolean' || typeof dist.body === 'boolean' || typeof dist.description === 'boolean') {
                    if (verbose) {
                        console.log("[SEOContentModule] Converting boolean field values to numeric frequency format");
                    }

                    // Convert boolean values to numbers
                    if (typeof dist.title === 'boolean') {
                        dist.title = dist.title ? 1 : 0;
                    }
                    if (typeof dist.headings === 'boolean') {
                        dist.headings = dist.headings ? 1 : 0;
                    }
                    if (typeof dist.body === 'boolean') {
                        dist.body = dist.body ? 1 : 0;
                    }
                    if (typeof dist.description === 'boolean') {
                        // Map description to title (meta description appears in search results)
                        if (dist.title === undefined) {
                            dist.title = dist.description ? 1 : 0;
                        }
                        delete dist.description;
                    }
                }

                // ADDITIONAL FIX: Handle variations like descriptionPresence
                if (dist.descriptionPresence !== undefined) {
                    // descriptionPresence should be mapped to title (meta description appears in search title area)
                    if (dist.title === undefined) {
                        dist.title = dist.descriptionPresence ? 1 : 0;
                    }
                    delete dist.descriptionPresence;
                }

                // FINAL STANDARDIZATION: Ensure all required fields are numeric and present
                if (dist.title === undefined || typeof dist.title !== 'number') {
                    dist.title = 0;
                }
                if (dist.headings === undefined || typeof dist.headings !== 'number') {
                    dist.headings = 0;
                }
                if (dist.body === undefined || typeof dist.body !== 'number') {
                    dist.body = 0;
                }

                // Remove any non-schema fields that might have been added by AI
                const allowedFields = ['title', 'headings', 'body', 'score'];
                Object.keys(dist).forEach(key => {
                    if (!allowedFields.includes(key)) {
                        delete dist[key];
                    }
                });
            }

            // CRITICAL FIX: Ensure keyword placement arrays are standardized across all keyword objects
            if (seoContentModuleOutput.content && seoContentModuleOutput.content.keywordUsage && seoContentModuleOutput.content.keywordUsage.primaryKeyword) {
                const primaryKeyword = seoContentModuleOutput.content.keywordUsage.primaryKeyword;

                // Ensure placement is always an array, not an object
                if (primaryKeyword.placement && typeof primaryKeyword.placement === 'object' && !Array.isArray(primaryKeyword.placement)) {
                    // Convert object to array format
                    const placements = [];
                    if (primaryKeyword.placement.title) placements.push('title');
                    if (primaryKeyword.placement.headings) placements.push('headings');
                    if (primaryKeyword.placement.body) placements.push('body');

                    primaryKeyword.placement = placements;
                    if (verbose) {
                        console.log("[SEOContentModule] Standardized primaryKeyword.placement from object to array format");
                    }
                }

                // Ensure placement is always an array
                if (!Array.isArray(primaryKeyword.placement)) {
                    primaryKeyword.placement = [];
                }
            }

            // CRITICAL FIX: ALWAYS override AI canonical URL with ground truth extraction to prevent inconsistency
            const actualCanonicalUrl = extractedElements.canonicalUrl;

            // Ensure metadata object exists
            if (!seoContentModuleOutput.metadata) {
                seoContentModuleOutput.metadata = {};
            }

            // CRITICAL FIX: Standardize metadata field names to ensure consistency between reports
            // AI sometimes returns different field names - this ensures consistent schema compliance
            if (seoContentModuleOutput.metadata.titleTag && !seoContentModuleOutput.metadata.titleAnalysis) {
                seoContentModuleOutput.metadata.titleAnalysis = seoContentModuleOutput.metadata.titleTag;
                delete seoContentModuleOutput.metadata.titleTag;
                if (verbose) {
                    console.log("[SEOContentModule] Standardized titleTag to titleAnalysis for consistency");
                }
            }

            if (seoContentModuleOutput.metadata.metaDescription && !seoContentModuleOutput.metadata.descriptionAnalysis) {
                seoContentModuleOutput.metadata.descriptionAnalysis = seoContentModuleOutput.metadata.metaDescription;
                delete seoContentModuleOutput.metadata.metaDescription;
                if (verbose) {
                    console.log("[SEOContentModule] Standardized metaDescription to descriptionAnalysis for consistency");
                }
            }

            // CRITICAL FIX: Force canonical URL to use ground truth regardless of AI response
            // This completely eliminates inconsistency across runs
            seoContentModuleOutput.metadata.canonicalUrl = {
                value: actualCanonicalUrl,
                isPresent: actualCanonicalUrl !== null,
                score: actualCanonicalUrl !== null ? 85 : 0,
                issues: actualCanonicalUrl !== null ? [] : ["Canonical URL not found"]
            };

            if (verbose) {
                console.log(`[SEOContentModule] CANONICAL URL GROUND TRUTH: ${actualCanonicalUrl || 'NOT FOUND'} - AI response completely overridden for consistency`);
            }

        } else {
            throw new Error(`AI returned incomplete or invalid structured data for SEO Content module. Response: ${JSON.stringify(aiResponse).substring(0, 300)}`);
        }

        // CRITICAL FIX: P0 - STANDARDIZE seoContent DATA MODEL FOR CONSISTENT API CONTRACT
        // Ensure identical JSON structure regardless of website being analyzed

        // 1. STANDARDIZE METADATA FIELD NAMES
        if (seoContentModuleOutput.metadata) {
            const metadata = seoContentModuleOutput.metadata;

            // Normalize title field names
            if (metadata.titleTag && !metadata.title) {
                metadata.title = metadata.titleTag;
                delete metadata.titleTag;
            }
            if (metadata.titleAnalysis && !metadata.title) {
                metadata.title = metadata.titleAnalysis;
                delete metadata.titleAnalysis;
            }

            // Normalize description field names
            if (metadata.metaDescription && !metadata.description) {
                metadata.description = metadata.metaDescription;
                delete metadata.metaDescription;
            }
            if (metadata.descriptionAnalysis && !metadata.description) {
                metadata.description = metadata.descriptionAnalysis;
                delete metadata.descriptionAnalysis;
            }

            // Normalize canonical field names
            if (metadata.canonicalUrlAnalysis && !metadata.canonicalUrl) {
                metadata.canonicalUrl = metadata.canonicalUrlAnalysis;
                delete metadata.canonicalUrlAnalysis;
            }

            // Normalize robots field names
            if (metadata.robotsAnalysis && !metadata.robotsDirectives) {
                metadata.robotsDirectives = metadata.robotsAnalysis;
                delete metadata.robotsAnalysis;
            }

            // Normalize keywords field names
            if (metadata.keywordsAnalysis && !metadata.keywordsTag) {
                metadata.keywordsTag = metadata.keywordsAnalysis;
                delete metadata.keywordsAnalysis;
            }

            // Ensure all required metadata fields exist with consistent structure
            if (!metadata.title || typeof metadata.title !== 'object') {
                metadata.title = { content: "", score: 10, length: 0, issues: [] };
            }
            if (!metadata.description || typeof metadata.description !== 'object') {
                metadata.description = { content: "", score: 10, length: 0, issues: [] };
            }
            if (!metadata.canonicalUrl || typeof metadata.canonicalUrl !== 'object') {
                metadata.canonicalUrl = { url: "", score: 10, issues: [] };
            }
            if (!metadata.robotsDirectives || typeof metadata.robotsDirectives !== 'object') {
                metadata.robotsDirectives = { content: "", score: 10, issues: [] };
            }
            if (!metadata.keywordsTag || typeof metadata.keywordsTag !== 'object') {
                metadata.keywordsTag = { content: "", score: 10, issues: [] };
            }
            if (!metadata.openGraph || typeof metadata.openGraph !== 'object') {
                metadata.openGraph = { title: "", description: "", image: "", score: 10 };
            }
            if (!metadata.twitterCard || typeof metadata.twitterCard !== 'object') {
                metadata.twitterCard = { card: "", title: "", description: "", image: "", score: 10 };
            }
        }

        // 2. STANDARDIZE TECHNICAL FIELD NAMES
        if (seoContentModuleOutput.technical) {
            const technical = seoContentModuleOutput.technical;

            // Normalize link analysis field names
            if (technical.linkSummary && !technical.linkAnalysis) {
                technical.linkAnalysis = technical.linkSummary;
                delete technical.linkSummary;
            }
            if (technical.links && !technical.linkAnalysis) {
                technical.linkAnalysis = technical.links;
                delete technical.links;
            }

            // Ensure consistent linkAnalysis structure
            if (!technical.linkAnalysis || typeof technical.linkAnalysis !== 'object') {
                technical.linkAnalysis = {
                    internalLinks: 0,
                    externalLinks: 0,
                    brokenLinks: 0,
                    score: 10
                };
            }

            // Ensure consistent sitemap and robots structure
            if (!technical.sitemapAnalysis || typeof technical.sitemapAnalysis !== 'object') {
                technical.sitemapAnalysis = { found: false, valid: false, entryCount: 0, issues: [] };
            }
            if (!technical.robotsTxtAnalysis || typeof technical.robotsTxtAnalysis !== 'object') {
                technical.robotsTxtAnalysis = { found: false, valid: false, directives: [], issues: [] };
            }
        }

        // 3. STANDARDIZE CONTENT FIELD NAMES AND STRUCTURES
        if (seoContentModuleOutput.content) {
            const content = seoContentModuleOutput.content;

            // Ensure consistent keywordUsage structure
            if (content.keywordUsage && content.keywordUsage.distribution) {
                const dist = content.keywordUsage.distribution;

                // Normalize all boolean/presence fields to numeric format
                const fieldsToNormalize = [
                    'title', 'headings', 'body', 'description',
                    'titlePresence', 'headingPresence', 'bodyPresence', 'descriptionPresence'
                ];

                fieldsToNormalize.forEach(field => {
                    if (dist[field] !== undefined) {
                        if (typeof dist[field] === 'boolean') {
                            dist[field] = dist[field] ? 1 : 0;
                        } else if (typeof dist[field] !== 'number') {
                            dist[field] = 0;
                        }
                    }
                });

                // Remove presence fields and map to standard fields
                if (dist.titlePresence !== undefined) {
                    if (dist.title === undefined) dist.title = dist.titlePresence ? 1 : 0;
                    delete dist.titlePresence;
                }
                if (dist.headingPresence !== undefined) {
                    if (dist.headings === undefined) dist.headings = dist.headingPresence ? 1 : 0;
                    delete dist.headingPresence;
                }
                if (dist.bodyPresence !== undefined) {
                    if (dist.body === undefined) dist.body = dist.bodyPresence ? 1 : 0;
                    delete dist.bodyPresence;
                }
                if (dist.descriptionPresence !== undefined) {
                    if (dist.title === undefined) dist.title = dist.descriptionPresence ? 1 : 0;
                    delete dist.descriptionPresence;
                }

                // Ensure all required fields are present as numbers
                if (dist.title === undefined) dist.title = 0;
                if (dist.headings === undefined) dist.headings = 0;
                if (dist.body === undefined) dist.body = 0;

                // Remove any non-schema fields
                Object.keys(dist).forEach(key => {
                    if (!['title', 'headings', 'body'].includes(key)) {
                        delete dist[key];
                    }
                });
            }

            // Ensure consistent eatMetrics structure
            if (!content.eatMetrics || typeof content.eatMetrics !== 'object') {
                content.eatMetrics = {
                    expertise: 10,
                    authoritativeness: 10,
                    trustworthiness: 10,
                    overallEatScore: 10
                };
            }
        }

        // 4. STANDARDIZE SCHEMA MARKUP STRUCTURE
        if (!seoContentModuleOutput.schemaMarkup || typeof seoContentModuleOutput.schemaMarkup !== 'object') {
            seoContentModuleOutput.schemaMarkup = {
                present: false,
                types: [],
                score: 10,
                issues: []
            };
        }

        // TIER COLLAPSE: All fields always populated (single world-class tier)
        // CRITICAL FIX: Do not create eatAnalysis since we have detailed content.eatMetrics from AI

        // ===================================================================
        // GOLD-STANDARD: Evidence-based fallback population for SEO sub-sections
        // When AI omits metaTags, headingStructure, contentQuality, or eatAnalysis,
        // populate them from already-extracted page evidence rather than leaving null.
        // ===================================================================

        // Fallback: metaTags — populate from extractedElements when AI didn't return this field
        if (!seoContentModuleOutput.metadata?.metaTags && extractedElements) {
            const metaTagsData = {};
            if (extractedElements.title) {
                const titleLen = (extractedElements.title || '').length;
                metaTagsData.title = {
                    content: extractedElements.title,
                    length: titleLen,
                    score: titleLen >= 30 && titleLen <= 60 ? 85 : (titleLen > 0 ? 55 : 10),
                    issues: titleLen > 60 ? ['Title tag is too long (over 60 characters)'] :
                        titleLen < 30 && titleLen > 0 ? ['Title tag is too short (under 30 characters)'] :
                            titleLen === 0 ? ['Missing title tag'] : []
                };
            }
            if (extractedElements.metaDescription !== undefined) {
                const descLen = (extractedElements.metaDescription || '').length;
                metaTagsData.description = {
                    content: extractedElements.metaDescription || '',
                    length: descLen,
                    score: descLen >= 120 && descLen <= 160 ? 85 : (descLen > 0 ? 55 : 10),
                    issues: descLen > 160 ? ['Meta description is too long (over 160 characters)'] :
                        descLen < 120 && descLen > 0 ? ['Meta description could be longer (under 120 characters)'] :
                            descLen === 0 ? ['Missing meta description'] : []
                };
            }
            if (Object.keys(metaTagsData).length > 0) {
                // Calculate overall score
                const scores = Object.values(metaTagsData).map(v => v.score).filter(s => typeof s === 'number');
                metaTagsData.score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 10;
                seoContentModuleOutput.metadata.metaTags = metaTagsData;
                if (verbose) console.log(`[SEOContentModule] EVIDENCE FALLBACK: Populated metaTags from extracted elements (score=${metaTagsData.score})`);
            }
        }

        // Fallback: headingStructure — populate from extractedElements.headings
        if (!seoContentModuleOutput.content?.headingStructure && extractedElements?.headings) {
            const h = extractedElements.headings;
            const h1Count = h.h1?.length || 0;
            const h2Count = h.h2?.length || 0;
            const h3Count = h.h3?.length || 0;
            // Score: 1 H1 = good, 0 H1 = bad, >1 H1 = poor, H2s improve score
            let hScore = 10;
            if (h1Count === 1) hScore = 70;
            else if (h1Count === 0) hScore = 25;
            else hScore = 40; // Multiple H1s
            if (h2Count >= 2) hScore = Math.min(100, hScore + 15);
            if (h3Count >= 1) hScore = Math.min(100, hScore + 5);

            seoContentModuleOutput.content = seoContentModuleOutput.content || {};
            seoContentModuleOutput.content.headingStructure = {
                h1Count,
                h1Text: h.h1 || [],
                h2Count,
                h3Count,
                score: hScore,
                issues: h1Count === 0 ? ['Missing H1 heading tag'] :
                    h1Count > 1 ? [`Multiple H1 tags found (${h1Count}) — use only one per page`] :
                        h2Count === 0 ? ['No H2 subheadings — add section headings for better structure'] : []
            };
            if (verbose) console.log(`[SEOContentModule] EVIDENCE FALLBACK: Populated headingStructure (H1:${h1Count}, H2:${h2Count}, H3:${h3Count}, score=${hScore})`);
        }

        // Fallback: contentQuality — populate from contentQualityEvidence
        if (!seoContentModuleOutput.content?.contentQuality && contentQualityEvidence) {
            const cq = contentQualityEvidence;
            seoContentModuleOutput.content = seoContentModuleOutput.content || {};
            seoContentModuleOutput.content.contentQuality = {
                readability: cq.scores?.readability?.score || null,
                gradeLevel: cq.scores?.readability?.gradeLevel || null,
                depth: cq.scores?.depth?.score || null,
                overall: cq.scores?.overall?.score || null,
                wordCount: extractedElements?.wordCount || null,
                score: cq.scores?.overall?.score || 50
            };
            if (verbose) console.log(`[SEOContentModule] EVIDENCE FALLBACK: Populated contentQuality from evidence (overall=${cq.scores?.overall?.score})`);
        }

        // Fallback: eatAnalysis — populate from eatEvidence
        if ((!seoContentModuleOutput.eatAnalysis || Object.keys(seoContentModuleOutput.eatAnalysis).length === 0) && eatEvidence) {
            seoContentModuleOutput.eatAnalysis = {
                overallScore: eatEvidence.scores?.overall?.score || 0,
                authorPresence: (eatEvidence.author?.htmlAuthors?.length || 0) > 0,
                credentialsFound: (eatEvidence.credentials?.count || 0) > 0,
                authorityLinks: (eatEvidence.authority?.totalAuthorityLinks || 0),
                contactCompleteness: eatEvidence.contact?.completeness || 0,
                hasAboutPage: eatEvidence.about?.hasAboutLink || false,
                hasTeamPage: eatEvidence.about?.hasTeamSection || false,
                isYMYL: eatEvidence.scores?.overall?.isYMYL || false,
                score: eatEvidence.scores?.overall?.score || 0
            };
            if (verbose) console.log(`[SEOContentModule] EVIDENCE FALLBACK: Populated eatAnalysis from E-A-T evidence (score=${eatEvidence.scores?.overall?.score})`);
        }

        if (!seoContentModuleOutput.socialMedia || (typeof seoContentModuleOutput.socialMedia === 'object' && Object.keys(seoContentModuleOutput.socialMedia).length === 0)) {
            // EVIDENCE-BASED FIX: Use scraped OG/Twitter data instead of hardcoded false
            const hasOgTags = !!(extractedElements.ogTitle || extractedElements.ogDescription || extractedElements.ogImage);
            const hasTwitterTags = !!(extractedElements.twitterCard || extractedElements.twitterTitle || extractedElements.twitterImage);
            seoContentModuleOutput.socialMedia = {
                sharingButtonsPresent: false, // Would need DOM check for share buttons
                openGraphTags: hasOgTags,
                twitterCardTags: hasTwitterTags,
                platformOptimization: {},
                crossPlatformSynergy: {}
            };
            if (verbose && (hasOgTags || hasTwitterTags)) {
                console.log(`[SEOContentModule] EVIDENCE FIX: Set openGraphTags=${hasOgTags}, twitterCardTags=${hasTwitterTags} from scraped data`);
            }
        }

        // EVIDENCE OVERRIDE: Fix metadata.openGraph if AI claims tags are missing but scraper found them
        {
            const hasOgTags = !!(extractedElements.ogTitle || extractedElements.ogDescription || extractedElements.ogImage);
            const hasTwitterTags = !!(extractedElements.twitterCard || extractedElements.twitterTitle || extractedElements.twitterImage);
            const metaOg = seoContentModuleOutput.metadata?.openGraph;
            if (hasOgTags && metaOg && (metaOg.score === 0 || (metaOg.issues && metaOg.issues.some(i => /missing/i.test(i))))) {
                metaOg.text = extractedElements.ogTitle || extractedElements.ogDescription || '';
                metaOg.score = Math.max(metaOg.score || 0, 70);
                metaOg.issues = (metaOg.issues || []).filter(i => !/missing/i.test(i));
                if (!metaOg.issues.length) metaOg.issues = [];
                if (verbose) { console.log(`[SEOContentModule] EVIDENCE FIX: Overrode openGraph — scraper found og:title/description/image, score set to ${metaOg.score}`); }
            }
            const metaTw = seoContentModuleOutput.metadata?.twitterCard;
            if (hasTwitterTags && metaTw && (metaTw.score === 0 || (metaTw.issues && metaTw.issues.some(i => /missing/i.test(i))))) {
                metaTw.text = extractedElements.twitterCard || extractedElements.twitterTitle || '';
                metaTw.score = Math.max(metaTw.score || 0, 70);
                metaTw.issues = (metaTw.issues || []).filter(i => !/missing/i.test(i));
                if (verbose) { console.log(`[SEOContentModule] EVIDENCE FIX: Overrode twitterCard — scraper found twitter:card/title, score set to ${metaTw.score}`); }
            }
        }

        if (onProgress) { onProgress('seoContent', 'Formatting recommendations & issues', 85); }

        // CRITICAL FIX: Generate comprehensive issues array for SEO Content
        const detectedIssues = [];

        // industryType and industrySubtype are now defined at function start

        // E-A-T Issues - Industry-specific assessment
        if (seoContentModuleOutput.content?.eatMetrics?.overallEatScore < 70) {

            // Determine if this is actually a YMYL (Your Money or Your Life) site
            const isYMYL = /health|medical|clinic|hospital|physician|dental/i.test(industryType || '') || /financ|bank|insurance|invest|wealth|lending/i.test(industryType || '') ||
                industrySubtype.toLowerCase().includes('health') ||
                industrySubtype.toLowerCase().includes('medical') ||
                industrySubtype.toLowerCase().includes('financial');

            const contentType = isYMYL ? 'YMYL' : industryType.toLowerCase();
            const specificRecommendation = isYMYL ?
                "Add professional credentials, certifications, author bios, and cite authoritative sources" :
                `Establish expertise signals appropriate for ${industryType} industry, including relevant credentials and authoritative references`;

            detectedIssues.push({
                id: `seo-eat-${Date.now()}`,
                severity: isYMYL ? "Critical" : "High",
                category: "E-A-T",
                title: `Insufficient E-A-T signals for ${contentType} content`,
                description: `E-A-T score of ${seoContentModuleOutput.content.eatMetrics.overallEatScore}/100 is too low for ${industryType} content. ${isYMYL ? 'YMYL sites' : industryType + ' websites'} require strong expertise, authoritativeness, and trustworthiness signals.`,
                impact: `Reduced search rankings and user trust for ${industryType.toLowerCase()} content`,
                recommendation: specificRecommendation,
                affected: ["content.eatMetrics"],
                source: "seoContent"
            });
        }

        // Image Optimization Issues
        if (seoContentModuleOutput.content?.multimediaUsage?.altTextCoverage < 50) {
            detectedIssues.push({
                id: `seo-images-${Date.now()}`,
                severity: "High",
                category: "Accessibility",
                title: "Poor image accessibility and SEO optimization",
                description: `Only ${seoContentModuleOutput.content.multimediaUsage.altTextCoverage}% of images have alt text. This hurts both accessibility and SEO.`,
                impact: "Reduced accessibility compliance and missed SEO opportunities",
                recommendation: "Add descriptive alt text to all images, especially medical procedure images",
                affected: ["content.multimediaUsage"],
                source: "seoContent"
            });
        }

        // Social Media Issues
        if (seoContentModuleOutput.metadata?.twitterCardAnalysis?.score < 50) {
            detectedIssues.push({
                id: `seo-social-${Date.now()}`,
                severity: "Medium",
                category: "Social Media",
                title: "Missing Twitter Card implementation",
                description: "Twitter Card tags are not implemented, reducing social media visibility and engagement.",
                impact: "Poor social media sharing appearance and reduced click-through rates",
                recommendation: `Implement Twitter Card meta tags with ${industryType.toLowerCase()}-appropriate imagery and descriptions`,
                affected: ["metadata.twitterCardAnalysis"],
                source: "seoContent"
            });
        }

        // Open Graph Issues
        if (seoContentModuleOutput.metadata?.openGraphAnalysis?.score < 80) {
            detectedIssues.push({
                id: `seo-og-${Date.now()}`,
                severity: "Medium",
                category: "Social Media",
                title: "Incomplete Open Graph implementation",
                description: `Open Graph implementation is incomplete (${seoContentModuleOutput.metadata.openGraphAnalysis.score}/100). Missing: ${(seoContentModuleOutput.metadata.openGraphAnalysis.missing || []).join(', ')}`,
                impact: `Poor social media sharing appearance for ${industryType.toLowerCase()} content`,
                recommendation: "Complete Open Graph tags including og:image, og:type, and medical-specific properties",
                affected: ["metadata.openGraphAnalysis"],
                source: "seoContent"
            });
        }

        // Technical SEO Issues
        if (seoContentModuleOutput.technical?.sitemapAnalysis?.score < 70) {
            detectedIssues.push({
                id: `seo-sitemap-${Date.now()}`,
                severity: "High",
                category: "Technical SEO",
                title: "Invalid or problematic sitemap",
                description: `Sitemap score is ${seoContentModuleOutput.technical.sitemapAnalysis.score}/100. Issues: ${(seoContentModuleOutput.technical.sitemapAnalysis.issues || []).join(', ')}`,
                impact: `Reduced crawling efficiency and indexing of ${industryType.toLowerCase()} content`,
                recommendation: `Fix sitemap structure and ensure all important ${industryType.toLowerCase()} pages are included`,
                affected: ["technical.sitemapAnalysis"],
                source: "seoContent"
            });
        }

        // Meta Description Issues
        if (seoContentModuleOutput.metadata?.descriptionAnalysis?.score < 75) {
            detectedIssues.push({
                id: `seo-meta-desc-${Date.now()}`,
                severity: "Medium",
                category: "Metadata",
                title: `Suboptimal meta description for ${industryType.toLowerCase()} content`,
                description: `Meta description score is ${seoContentModuleOutput.metadata.descriptionAnalysis.score}/100. ${(seoContentModuleOutput.metadata.descriptionAnalysis.issues || []).join(' ')}`,
                impact: "Reduced click-through rates from search results",
                recommendation: "Optimize meta description with specific medical services and patient benefits",
                affected: ["metadata.descriptionAnalysis"],
                source: "seoContent"
            });
        }

        // Content Readability Issues - Industry-specific
        if (seoContentModuleOutput.content?.readabilityScore < 70) {
            const readabilityRecommendation = isYMYL ?
                "Simplify technical terminology, use shorter sentences, and add definitions for complex terms" :
                `Improve content readability for ${industryType.toLowerCase()} audience with clearer language and better structure`;

            detectedIssues.push({
                id: `seo-readability-${Date.now()}`,
                severity: "Medium",
                category: "Content Quality",
                title: `${industryType} content readability needs improvement`,
                description: `Content readability score is ${seoContentModuleOutput.content.readabilityScore}/100. ${industryType} content should be accessible to your target audience with varying education levels.`,
                impact: `Reduced user understanding and engagement with ${industryType.toLowerCase()} information`,
                recommendation: readabilityRecommendation,
                affected: ["content.readabilityScore"],
                source: "seoContent"
            });
        }

        // Keyword Optimization Issues
        if (seoContentModuleOutput.content?.keywordUsageAnalysis?.score < 75) {
            detectedIssues.push({
                id: `seo-keywords-${Date.now()}`,
                severity: "Medium",
                category: "Content Optimization",
                title: `Keyword strategy needs ${industryType.toLowerCase()}-specific optimization`,
                description: `Keyword usage score is ${seoContentModuleOutput.content.keywordUsageAnalysis.score}/100. ${industryType} sites need precise industry terminology and service-specific keywords.`,
                impact: `Missed opportunities for ${industryType.toLowerCase()} service visibility in search results`,
                recommendation: `Expand keyword strategy with ${industryType.toLowerCase()}-specific terms, services offered, and location-specific keywords`,
                affected: ["content.keywordUsageAnalysis"],
                source: "seoContent"
            });
        }

        // ENHANCED: Improve E-A-T scoring for YMYL sites
        if (seoContentModuleOutput.content?.eatMetrics && isYMYL) {
            const eatMetrics = seoContentModuleOutput.content.eatMetrics;

            // Apply YMYL-specific E-A-T enhancements
            if (extractedElements.authorInfo?.authors?.length > 0) {
                // Boost expertise score if medical authors are present
                eatMetrics.expertiseScore = Math.min(100, eatMetrics.expertiseScore + 20);
                eatMetrics.authorBiosPresent = true;
            }

            if (extractedElements.authorInfo?.publisher) {
                // Boost authoritativeness if clear medical practice info is present
                eatMetrics.authoritativenessScore = Math.min(100, eatMetrics.authoritativenessScore + 15);
                eatMetrics.publisherInfoPresent = true;
            }

            // Check for medical credentials, certifications in content
            const hasCredentials = extractedElements.textContentSample?.toLowerCase().includes('md') ||
                extractedElements.textContentSample?.toLowerCase().includes('doctor') ||
                extractedElements.textContentSample?.toLowerCase().includes('physician') ||
                extractedElements.textContentSample?.toLowerCase().includes('certified') ||
                extractedElements.textContentSample?.toLowerCase().includes('board');

            if (hasCredentials) {
                eatMetrics.expertiseSignals = true;
                eatMetrics.expertiseScore = Math.min(100, eatMetrics.expertiseScore + 15);
            }

            // Check for trust signals like reviews, testimonials, certifications
            const hasTrustSignals = extractedElements.textContentSample?.toLowerCase().includes('review') ||
                extractedElements.textContentSample?.toLowerCase().includes('testimonial') ||
                extractedElements.textContentSample?.toLowerCase().includes('accredited') ||
                extractedElements.textContentSample?.toLowerCase().includes('licensed');

            if (hasTrustSignals) {
                eatMetrics.trustSignals = true;
                eatMetrics.trustworthinessScore = Math.min(100, eatMetrics.trustworthinessScore + 20);
            }

            // Recalculate overall E-A-T score
            const averageEatScore = Math.round((eatMetrics.expertiseScore + eatMetrics.authoritativenessScore + eatMetrics.trustworthinessScore) / 3);
            eatMetrics.overallEatScore = averageEatScore;

            if (verbose) { console.log(`[SEOContentModule] Enhanced E-A-T score for YMYL content: ${averageEatScore}/100`); }
        }

        // WORLD-CLASS GAP 1: Override AI hallucinated E-A-T score with deterministic evidence score
        if (eatEvidence?.scores?.overall?.score && seoContentModuleOutput.content?.eatMetrics) {
            const deterministicEatScore = eatEvidence.scores.overall.score;
            // Overwrite the AI's guess with the actual calculated evidence score from eat-signals.js
            seoContentModuleOutput.content.eatMetrics.overallEatScore = deterministicEatScore;
            // Optional: Also pass the raw JSON evidence into the final output payload for the frontend
            seoContentModuleOutput.content.eatMetrics.detailedEvidence = eatEvidence;
            if (verbose) console.log(`[SEOContentModule] 🔒 Deterministic E-A-T score injected: ${deterministicEatScore}/100 (overriding AI)`);
        }

        // WORLD-CLASS GAP 2: Override AI hallucinated Keyword Usage score with deterministic evidence score
        if (keywordScore !== null && typeof keywordScore?.score === 'number' && seoContentModuleOutput.content?.keywordUsageAnalysis) {
            const deterministicKwScore = keywordScore.score;
            // Overwrite the AI's guess with actual keyword n-gram/density calculation
            seoContentModuleOutput.content.keywordUsageAnalysis.score = deterministicKwScore;
            seoContentModuleOutput.content.keywordUsageAnalysis.detailedEvidence = keywordEvidence;
            if (verbose) console.log(`[SEOContentModule] 🔒 Deterministic Keyword score injected: ${deterministicKwScore}/100 (overriding AI)`);
        }

        seoContentModuleOutput.recommendations = createDefaultPaginatedArray(
            (getNestedProperty(seoContentModuleOutput, 'recommendations.items') || []).map(rec =>
                typeof rec === 'string' ? { id: uuidv4(), text: rec, priority: "Medium", source: "seoContent", impact: "General SEO improvement", effort: "Moderate" } : rec
            )
        );
        // CRITICAL FIX: Merge AI-generated issues with hardcoded detectedIssues before formatting
        // Previously this line overwrote any AI issues: seoContentModuleOutput.issues = formatIssuesArray(detectedIssues);
        const aiReturnedIssues = getNestedProperty(seoContentModuleOutput, 'issues.items', []);

        // ENHANCEMENT: Extract issues from AI sub-objects that have .issues arrays or low .score values
        // The AI returns data under keys like metadata.openGraph, metadata.twitterCard, content.readability
        // which have their own .issues arrays and .score fields
        const metadataSubKeys = ['title', 'description', 'openGraph', 'twitterCard', 'canonicalUrl', 'keywords', 'hreflangTags'];
        for (const key of metadataSubKeys) {
            const subObj = seoContentModuleOutput.metadata?.[key];
            if (subObj && typeof subObj === 'object') {
                // Extract .issues array entries as issues
                if (Array.isArray(subObj.issues) && subObj.issues.length > 0) {
                    for (const issueText of subObj.issues) {
                        if (typeof issueText === 'string' && issueText.trim()) {
                            const severity = (subObj.score !== undefined && subObj.score < 30) ? 'High' :
                                (subObj.score !== undefined && subObj.score < 60) ? 'Medium' : 'Low';
                            detectedIssues.push({
                                severity,
                                text: issueText,
                                category: `Metadata: ${key}`,
                                source: 'seoContent'
                            });
                        }
                    }
                }
                // Generate issue from low score even without explicit issues array
                if (typeof subObj.score === 'number' && subObj.score < 50 && (!Array.isArray(subObj.issues) || subObj.issues.length === 0)) {
                    detectedIssues.push({
                        severity: subObj.score < 20 ? 'High' : 'Medium',
                        text: `${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} implementation is weak (score: ${subObj.score}/100)`,
                        category: 'Metadata',
                        source: 'seoContent'
                    });
                }
            }
        }

        // Extract content-level issues
        const readability = seoContentModuleOutput.content?.readability;
        if (readability && typeof readability === 'object' && readability.fleschReadingEase < 50) {
            detectedIssues.push({
                severity: 'Medium',
                text: `Content readability needs improvement (Flesch Reading Ease: ${readability.fleschReadingEase}/100). ${readability.interpretation || ''}`,
                category: 'Content Quality',
                source: 'seoContent'
            });
        }

        const keywordUsage = seoContentModuleOutput.content?.keywordUsage;
        if (keywordUsage?.primaryKeyword?.distribution?.score < 60) {
            detectedIssues.push({
                severity: 'Medium',
                text: `Primary keyword "${keywordUsage.primaryKeyword.term}" distribution is suboptimal (score: ${keywordUsage.primaryKeyword.distribution.score}/100)`,
                category: 'Content Optimization',
                source: 'seoContent'
            });
        }

        const voiceSearch = seoContentModuleOutput.content?.voiceSearchOptimization;
        if (voiceSearch && typeof voiceSearch === 'object' && voiceSearch.score < 50) {
            detectedIssues.push({
                severity: 'Low',
                text: `Voice search optimization is weak (score: ${voiceSearch.score}/100). ${voiceSearch.isOptimized === false ? 'Content is not optimized for voice queries.' : ''}`,
                category: 'Content Optimization',
                source: 'seoContent'
            });
        }

        // AI/LLM READINESS ISSUES — Gold-standard AEO detection
        const aiReadiness = seoContentModuleOutput.technical?.aiReadiness;
        if (aiReadiness) {
            if (!aiReadiness.llmsTxt?.found) {
                detectedIssues.push({
                    severity: 'Medium',
                    text: 'No /llms.txt file found. This file helps LLMs (ChatGPT, Claude, Perplexity) understand your site. See llmstxt.org for the specification.',
                    category: 'AI/LLM Readiness',
                    source: 'seoContent'
                });
            }
            if (!aiReadiness.llmsFullTxt?.found && aiReadiness.llmsTxt?.found) {
                detectedIssues.push({
                    severity: 'Low',
                    text: 'No /llms-full.txt file found. This extended file provides comprehensive content for AI/LLM consumption alongside your llms.txt.',
                    category: 'AI/LLM Readiness',
                    source: 'seoContent'
                });
            }
            if (!aiReadiness.aiBotPolicy?.hasExplicitAiPolicy) {
                detectedIssues.push({
                    severity: 'Low',
                    text: 'No explicit AI bot policy in robots.txt. Consider adding directives for GPTBot, ClaudeBot, Google-Extended to control how AI crawlers access your content.',
                    category: 'AI/LLM Readiness',
                    source: 'seoContent'
                });
            }
            if ((aiReadiness.aiBotPolicy?.aiBotsBlocked || []).length > 3) {
                detectedIssues.push({
                    severity: 'Medium',
                    text: `Blocking ${aiReadiness.aiBotPolicy.aiBotsBlocked.length} AI crawlers (${aiReadiness.aiBotPolicy.aiBotsBlocked.join(', ')}). This may reduce your visibility in AI-powered search and answer engines.`,
                    category: 'AI/LLM Readiness',
                    source: 'seoContent'
                });
            }
            if ((aiReadiness.aiLinks || []).length === 0) {
                detectedIssues.push({
                    severity: 'Informational',
                    text: 'No AI-facing content links detected. Consider adding an "AI Learn About Us" page or /ai path to provide structured information for AI crawlers and chatbots.',
                    category: 'AI/LLM Readiness',
                    source: 'seoContent'
                });
            }
        }

        const allIssues = [...aiReturnedIssues, ...detectedIssues].slice(0, 15); // Cap at 15 total
        seoContentModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(allIssues));

        // =====================================================================
        // ROOT FIX: Filter issues against evidence BEFORE building topIssues.
        // Suppresses hreflang penalty for single-language sites.
        // =====================================================================
        {
            const siteHtmlLang = extractedElements?.htmlLang || options.sharedPageContext?.htmlLang || '';
            const hreflangCount = extractedElements?.hreflangTags?.tagsFound?.length || 0;
            const isSingleLanguage = siteHtmlLang.length >= 2 && hreflangCount === 0;

            if (isSingleLanguage && seoContentModuleOutput.issues?.items) {
                const beforeCount = seoContentModuleOutput.issues.items.length;
                seoContentModuleOutput.issues.items = seoContentModuleOutput.issues.items.filter(issue => {
                    const text = issue.text || issue.title || issue.description || '';
                    // Suppress "Hreflang Tags implementation is weak" for single-language sites
                    const isHreflangFP = /hreflang.*(weak|missing|absent|implementation|poor|low)/i.test(text);
                    if (isHreflangFP && verbose) {
                        console.log(`[SEOContentModule] GROUND-TRUTH FILTER: Suppressed hreflang issue for single-language site (lang="${siteHtmlLang}"): "${text.substring(0, 60)}"`);
                    }
                    return !isHreflangFP;
                });
                if (verbose && beforeCount !== seoContentModuleOutput.issues.items.length) {
                    console.log(`[SEOContentModule] GROUND-TRUTH FILTER: Removed ${beforeCount - seoContentModuleOutput.issues.items.length} hreflang false positives`);
                }
            }

            // Also fix hreflangTags score — don't penalize single-language sites
            if (isSingleLanguage && seoContentModuleOutput.metadata?.hreflangTags) {
                const ht = seoContentModuleOutput.metadata.hreflangTags;
                if (ht.score !== undefined && ht.score < 50) {
                    ht.score = 70; // Neutral — not applicable, not a failure
                    ht.issues = ['Single-language site — hreflang tags not required'];
                    if (verbose) console.log(`[SEOContentModule] EVIDENCE FIX: Set hreflangTags score to 70 for single-language site (lang="${siteHtmlLang}")`);
                }
            }
        }


        if (onProgress) { onProgress('seoContent', 'Calculating final scores', 95); }

        // GOLD-STANDARD: Inject content quality evidence into output
        if (contentQualityEvidence) {
            seoContentModuleOutput.contentQualityEvidence = contentQualityEvidence;
        }

        // Calculate score — no tier references (tiers eliminated)
        seoContentModuleOutput.summary.score = calculateModuleSummaryScore('seoContent', seoContentModuleOutput, {});
        seoContentModuleOutput._skipped = false;

        // GOLD-STANDARD: Blend AI score with evidence-based content quality
        if (contentQualityEvidence?.scores?.overall?.score) {
            const evidenceScore = contentQualityEvidence.scores.overall.score;
            // 65% AI analysis, 35% evidence-based metrics
            seoContentModuleOutput.summary.score = Math.round(
                seoContentModuleOutput.summary.score * 0.65 + evidenceScore * 0.35
            );
        }

        seoContentModuleOutput.summary.rating = getRatingLabelForScore(seoContentModuleOutput.summary.score, false);

        // CRITICAL FIX: Populate topIssues with the most severe issues
        const sortedIssues = (seoContentModuleOutput.issues.items || [])
            .sort((a, b) => {
                const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                return (severities[a.severity] || 5) - (severities[b.severity] || 5);
            });

        seoContentModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue =>
            issue.description || issue.title || issue.text || "Issue identified"
        );

        // ENHANCEMENT: Populate strengths from high-scoring sub-sections
        const seoStrengths = [];
        if (seoContentModuleOutput.content?.eatMetrics?.overallEatScore >= 70) seoStrengths.push('Strong E-A-T signals demonstrating expertise and trustworthiness');
        // Check actual AI-returned keys (title, description, openGraph are objects with .score)
        const titleScore = seoContentModuleOutput.metadata?.title?.score ?? seoContentModuleOutput.metadata?.titleAnalysis?.score;
        if (titleScore >= 80) seoStrengths.push('Well-optimized title tag for search visibility');
        const descScore = seoContentModuleOutput.metadata?.description?.score ?? seoContentModuleOutput.metadata?.descriptionAnalysis?.score;
        if (descScore >= 75) seoStrengths.push('Effective meta description for click-through rates');
        const ogScore = seoContentModuleOutput.metadata?.openGraph?.score ?? seoContentModuleOutput.metadata?.openGraphAnalysis?.score;
        if (ogScore >= 80) seoStrengths.push('Complete Open Graph implementation for social sharing');
        const readScore = seoContentModuleOutput.content?.readability?.fleschReadingEase ?? seoContentModuleOutput.content?.readabilityScore;
        if (readScore >= 70) seoStrengths.push('Good content readability for target audience');
        const kwScore = seoContentModuleOutput.content?.keywordUsage?.primaryKeyword?.distribution?.score ?? seoContentModuleOutput.content?.keywordUsageAnalysis?.score;
        if (kwScore >= 75) seoStrengths.push('Effective keyword strategy and usage');
        if (seoContentModuleOutput.content?.multimediaUsage?.altTextCoverage >= 80) seoStrengths.push('Strong image accessibility with comprehensive alt text');
        if (seoContentModuleOutput.technical?.sitemapAnalysis?.score >= 80) seoStrengths.push('Well-structured sitemap for crawler efficiency');
        if (seoContentModuleOutput.content?.contentDepthScore >= 70) seoStrengths.push('In-depth content coverage for the topic');
        // AI/LLM Readiness strengths
        if (aiReadiness?.llmsTxt?.found) seoStrengths.push(`AI/LLM-ready: llms.txt present (${aiReadiness.llmsTxt.wordCount} words)`);
        if (aiReadiness?.llmsFullTxt?.found) seoStrengths.push(`Extended AI content: llms-full.txt available (${aiReadiness.llmsFullTxt.sizeKb}KB)`);
        if ((aiReadiness?.aiLinks || []).length > 0) seoStrengths.push('AI-facing content links detected for LLM discoverability');
        if (aiReadiness?.hasSpeakableMarkup) seoStrengths.push('Schema.org speakable markup present for voice/AI assistants');
        if (aiReadiness?.overallAiReadinessScore >= 50) seoStrengths.push(`Strong AI/LLM readiness (score: ${aiReadiness.overallAiReadinessScore}/100)`);
        if (seoStrengths.length === 0 && seoContentModuleOutput.summary.score >= 50) seoStrengths.push('Core SEO fundamentals are in place');
        seoContentModuleOutput.summary.strengths = seoStrengths;

        // Now natively handled via crossViewport or schema

        // CRITICAL FIX: Clean up duplicate fields to achieve 100/100 score
        if (seoContentModuleOutput.eatAnalysis && seoContentModuleOutput.content?.eatMetrics) {
            // Remove eatAnalysis since content.eatMetrics is more detailed and informative
            delete seoContentModuleOutput.eatAnalysis;
        }

        if (seoContentModuleOutput.technical?.robotsTxtAnalysis) {
            // Set robotsTxt from robotsTxtAnalysis ground truth
            seoContentModuleOutput.technical.robotsTxt = seoContentModuleOutput.technical.robotsTxtAnalysis.found === true;
        }

        if (seoContentModuleOutput.metadata?.viewportTag && seoContentModuleOutput.metadata?.viewportTagAnalysis) {
            // Remove simple viewportTag since viewportTagAnalysis is more comprehensive
            delete seoContentModuleOutput.metadata.viewportTag;
        }

        // CROSS-PAGE SEO: Analyze crawled pages for site-wide SEO issues
        const crawledPages = options.sharedPageContext?.crawledPages;
        if (crawledPages && crawledPages.length >= 2) {
            if (onProgress) { onProgress('seoContent', 'Running cross-page SEO analysis', 95); }
            const crossPageFindings = analyzeCrossPageSeo(crawledPages, url, verbose);
            seoContentModuleOutput.crossPageSeo = crossPageFindings;

            // Merge cross-page issues into main issues
            if (crossPageFindings.issues && crossPageFindings.issues.length > 0) {
                const existingIssues = seoContentModuleOutput.issues?.items || [];
                const mergedIssues = [...existingIssues, ...crossPageFindings.issues];
                seoContentModuleOutput.issues = createDefaultPaginatedArray(mergedIssues);

                // Adjust score: penalize for cross-page SEO issues
                const highSeverity = crossPageFindings.issues.filter(i => i.severity === 'High').length;
                const medSeverity = crossPageFindings.issues.filter(i => i.severity === 'Medium').length;
                const penalty = Math.min(15, highSeverity * 3 + medSeverity * 1);
                if (penalty > 0 && seoContentModuleOutput.summary?.score) {
                    seoContentModuleOutput.summary.score = Math.max(1, seoContentModuleOutput.summary.score - penalty);
                    seoContentModuleOutput.summary.rating = getRatingLabelForScore(seoContentModuleOutput.summary.score, false);
                    if (verbose) {
                        console.log(`[SEOContent] Cross-page penalty: -${penalty} points (${highSeverity} high, ${medSeverity} medium issues)`);
                    }
                }
            }
        }

        // =====================================================================
        // ENTERPRISE: Deep GEO (Generative Engine Optimization) Analysis
        // Evidence-based scoring of AI/LLM citability and platform readiness
        // =====================================================================
        {
            if (verbose) console.log('[SEOContentModule] 🌐 Building deep GEO analysis...');
            const aiR = seoContentModuleOutput.technical?.aiReadiness || {};
            const schemaTypes = (seoContentModuleOutput.schemaMarkup?.detectedTypes || seoContentModuleOutput.schemaMarkup?.types || []);
            const wordCount = extractedElements?.wordCount || 0;
            const headings = extractedElements?.headings || {};
            const h2s = headings.h2 || [];
            const citBlocks = extractedElements?.citabilityBlocks || [];

            // --- Citability Score (0-100) ---
            // Measures how likely AI engines are to cite/quote content from this page
            let citabilityScore = 0;
            // Optimal citability blocks (100-200 words, self-contained paragraphs)
            const optimalBlocks = citBlocks.filter(b => b.isOptimalLength);
            citabilityScore += Math.min(25, optimalBlocks.length * 8); // Up to 25 for optimal blocks
            citabilityScore += Math.min(15, citBlocks.length * 5);     // Up to 15 for any citability blocks
            // FAQ/definition structure (question-format headings)
            const questionHeadings = h2s.filter(h => /^(what|how|why|when|where|who|can|does|is|should|which)\s/i.test(h));
            citabilityScore += Math.min(20, questionHeadings.length * 5); // Up to 20 for Q&A structure
            // Content depth — substantial content is more citable
            if (wordCount >= 1500) citabilityScore += 15;
            else if (wordCount >= 800) citabilityScore += 10;
            else if (wordCount >= 300) citabilityScore += 5;
            // Schema markup richness — structured data makes content more parseable by LLMs
            if (schemaTypes.length > 0) citabilityScore += 5;
            if (schemaTypes.some(t => /FAQ|HowTo|QAPage|Article|BlogPosting/i.test(t))) citabilityScore += 10;
            // llms.txt presence
            if (aiR.llmsTxt?.found) citabilityScore += 10;
            citabilityScore = Math.min(100, citabilityScore);

            // --- Platform Readiness Scores (0-100 each) ---
            // ChatGPT: values structured content, llms.txt, FAQ schema, clean HTML
            let chatgptScore = 0;
            if (aiR.llmsTxt?.found) chatgptScore += 25;
            if (aiR.llmsFullTxt?.found) chatgptScore += 15;
            if (schemaTypes.some(t => /FAQ|HowTo/i.test(t))) chatgptScore += 15;
            if (wordCount >= 500) chatgptScore += 10;
            if (questionHeadings.length >= 2) chatgptScore += 10;
            if (optimalBlocks.length >= 1) chatgptScore += 10;
            if (aiR.aiBotPolicy?.hasExplicitAiPolicy && (aiR.aiBotPolicy?.aiBotsAllowed || []).some(b => /GPTBot/i.test(b))) chatgptScore += 15;
            else if (!aiR.aiBotPolicy?.hasExplicitAiPolicy) chatgptScore += 5; // Not blocking = somewhat ready
            chatgptScore = Math.min(100, chatgptScore);

            // Perplexity: values authoritative sources, citations, E-E-A-T, fresh content
            let perplexityScore = 0;
            const eatScore = seoContentModuleOutput.content?.eatMetrics?.overallEatScore || 0;
            if (eatScore >= 70) perplexityScore += 25;
            else if (eatScore >= 40) perplexityScore += 15;
            else if (eatScore > 0) perplexityScore += 5;
            const extLinks = extractedElements?.links?.external?.length || 0;
            if (extLinks >= 3) perplexityScore += 15; // Cites external sources
            else if (extLinks >= 1) perplexityScore += 8;
            if (wordCount >= 1000) perplexityScore += 10;
            if (schemaTypes.some(t => /Article|BlogPosting|NewsArticle/i.test(t))) perplexityScore += 10;
            if (optimalBlocks.length >= 2) perplexityScore += 10;
            if (aiR.llmsTxt?.found) perplexityScore += 15;
            if (!aiR.aiBotPolicy?.hasExplicitAiPolicy || (aiR.aiBotPolicy?.aiBotsAllowed || []).length > 0) perplexityScore += 5;
            perplexityScore = Math.min(100, perplexityScore);

            // Google AI Overview: values relevance, freshness, structured data, author authority
            let googleAIOScore = 0;
            if (seoContentModuleOutput.technical?.robotsTxtAnalysis?.found) googleAIOScore += 10; // Accessible to crawlers
            if (seoContentModuleOutput.technical?.sitemapAnalysis?.found) googleAIOScore += 10;
            if (schemaTypes.length >= 2) googleAIOScore += 15;
            if (eatScore >= 50) googleAIOScore += 15;
            if (wordCount >= 800) googleAIOScore += 10;
            if (questionHeadings.length >= 1) googleAIOScore += 10;
            if (extractedElements?.metaDescription && extractedElements.metaDescription.length >= 50) googleAIOScore += 10;
            if (aiR.hasSpeakableMarkup) googleAIOScore += 10;
            if (optimalBlocks.length >= 1) googleAIOScore += 10;
            googleAIOScore = Math.min(100, googleAIOScore);

            // --- Brand Authority ---
            const hasSchemaOrg = schemaTypes.some(t => /Organization|LocalBusiness|Corporation/i.test(t));
            const hasAuthorSchema = schemaTypes.some(t => /Person|Author/i.test(t));
            const brandPlatforms = [];
            if (hasSchemaOrg) brandPlatforms.push('schema.org');
            if (hasAuthorSchema) brandPlatforms.push('author-schema');
            if (aiR.llmsTxt?.found) brandPlatforms.push('llms.txt');
            const extLinkUrls = (Array.isArray(extractedElements?.links?.external) ? extractedElements.links.external : []).map(l => l?.url || '').filter(Boolean);
            if (extLinkUrls.some(u => /linkedin\.com/i.test(u))) brandPlatforms.push('linkedin');
            if (extLinkUrls.some(u => /twitter\.com|x\.com/i.test(u))) brandPlatforms.push('x/twitter');
            if (extLinkUrls.some(u => /yelp\.com/i.test(u))) brandPlatforms.push('yelp');
            if (extLinkUrls.some(u => /bbb\.org/i.test(u))) brandPlatforms.push('bbb');

            // --- Content Structure Analysis (new) ---
            const hasDefinitionLists = false; // Would need DOM check for <dl> elements
            const hasNumberedSteps = h2s.some(h => /^(step|\d+[\.\)\:])/i.test(h));
            const hasTables = false; // Would need DOM check

            seoContentModuleOutput.geoAnalysis = {
                citabilityScore,
                platformReadiness: {
                    chatgpt: chatgptScore,
                    perplexity: perplexityScore,
                    googleAIO: googleAIOScore
                },
                brandAuthority: {
                    mentionsFound: brandPlatforms.length > 0,
                    platforms: brandPlatforms
                },
                contentStructure: {
                    questionHeadingCount: questionHeadings.length,
                    questionHeadings: questionHeadings.slice(0, 5),
                    optimalCitabilityBlocks: optimalBlocks.length,
                    totalCitabilityBlocks: citBlocks.length,
                    hasNumberedSteps,
                    wordCount
                },
                overallGeoScore: Math.round((citabilityScore + chatgptScore + perplexityScore + googleAIOScore) / 4),
                recommendations: []
            };

            // Generate GEO-specific recommendations
            const geoRecs = seoContentModuleOutput.geoAnalysis.recommendations;
            if (!aiR.llmsTxt?.found) geoRecs.push('Create /llms.txt file following llmstxt.org specification to help AI engines understand your site');
            if (questionHeadings.length < 2) geoRecs.push('Add question-format H2 headings (What, How, Why) to increase AI snippet citability');
            if (optimalBlocks.length < 2) geoRecs.push('Structure content into self-contained paragraphs of 134-167 words for optimal AI citation length');
            if (!schemaTypes.some(t => /FAQ|HowTo/i.test(t))) geoRecs.push('Add FAQ or HowTo schema markup to improve structured data visibility in AI overviews');
            if (eatScore < 50) geoRecs.push('Strengthen E-E-A-T signals (author bios, credentials, citations) to improve AI platform trust scoring');
            if (!aiR.aiBotPolicy?.hasExplicitAiPolicy) geoRecs.push('Add explicit AI bot directives in robots.txt (GPTBot, ClaudeBot, Google-Extended) to control AI crawler access');

            if (verbose) console.log(`[SEOContentModule] ✅ GEO Analysis: citability=${citabilityScore}, chatgpt=${chatgptScore}, perplexity=${perplexityScore}, googleAIO=${googleAIOScore}, overall=${seoContentModuleOutput.geoAnalysis.overallGeoScore}`);
        }

        // =====================================================================
        // ENTERPRISE: AEO (Answer Engine Optimization) Analysis
        // Measures how well content is optimized for answer/featured snippet engines
        // =====================================================================
        {
            if (verbose) console.log('[SEOContentModule] 🎯 Building AEO analysis...');
            const headings = extractedElements?.headings || {};
            const h2s = headings.h2 || [];
            const h3s = headings.h3 || [];
            const allSubHeadings = [...h2s, ...h3s];
            const schemaTypes = (seoContentModuleOutput.schemaMarkup?.detectedTypes || seoContentModuleOutput.schemaMarkup?.types || []);
            const wordCount = extractedElements?.wordCount || 0;
            const citBlocks = extractedElements?.citabilityBlocks || [];

            // FAQ Schema Quality
            const hasFaqSchema = schemaTypes.some(t => /FAQ/i.test(t));
            const hasHowToSchema = schemaTypes.some(t => /HowTo/i.test(t));
            const hasQASchema = schemaTypes.some(t => /QAPage/i.test(t));
            let faqSchemaScore = 0;
            if (hasFaqSchema) faqSchemaScore += 40;
            if (hasHowToSchema) faqSchemaScore += 30;
            if (hasQASchema) faqSchemaScore += 30;
            faqSchemaScore = Math.min(100, faqSchemaScore);

            // Featured Snippet Readiness
            const questionHeadings = allSubHeadings.filter(h => /^(what|how|why|when|where|who|can|does|is|should|which)\s/i.test(h));
            const definitionPatterns = allSubHeadings.filter(h => /definition|meaning|overview|explained/i.test(h));
            let snippetReadiness = 0;
            snippetReadiness += Math.min(30, questionHeadings.length * 10); // Question headings
            snippetReadiness += Math.min(15, definitionPatterns.length * 8); // Definition headings
            if (citBlocks.some(b => b.isOptimalLength)) snippetReadiness += 20; // Optimal-length answer blocks
            if (wordCount >= 500) snippetReadiness += 10; // Minimum content depth
            if (seoContentModuleOutput.content?.headingStructure?.h1Count === 1) snippetReadiness += 10; // Proper H1
            if (extractedElements?.metaDescription && extractedElements.metaDescription.length >= 100) snippetReadiness += 15; // Good meta description
            snippetReadiness = Math.min(100, snippetReadiness);

            // People Also Ask (PAA) Targeting
            const paaPatterns = allSubHeadings.filter(h => /^(what|how|why|when|where|who|can|does|is|should|which|are|do|will)\s/i.test(h));
            let paaScore = 0;
            paaScore += Math.min(40, paaPatterns.length * 10);
            // Content that directly answers in the first 1-2 sentences after a heading scores higher
            if (citBlocks.length >= 1) paaScore += 20;
            if (wordCount >= 300) paaScore += 10;
            if (hasFaqSchema) paaScore += 20;
            if (questionHeadings.length >= 3) paaScore += 10;
            paaScore = Math.min(100, paaScore);

            // Direct Answer Density — how many headings have concise answers directly following them
            const directAnswerDensity = allSubHeadings.length > 0
                ? Math.min(100, Math.round((citBlocks.length / Math.max(1, allSubHeadings.length)) * 100))
                : 0;

            const overallAeoScore = Math.round((faqSchemaScore * 0.2 + snippetReadiness * 0.35 + paaScore * 0.25 + directAnswerDensity * 0.2));

            seoContentModuleOutput.aeoAnalysis = {
                overallScore: overallAeoScore,
                faqSchemaQuality: {
                    score: faqSchemaScore,
                    hasFaqSchema,
                    hasHowToSchema,
                    hasQASchema
                },
                featuredSnippetReadiness: {
                    score: snippetReadiness,
                    questionHeadingCount: questionHeadings.length,
                    definitionPatternCount: definitionPatterns.length,
                    hasOptimalAnswerBlocks: citBlocks.some(b => b.isOptimalLength),
                    questionHeadings: questionHeadings.slice(0, 5)
                },
                paaTargeting: {
                    score: paaScore,
                    targetableQuestions: paaPatterns.slice(0, 10),
                    questionCount: paaPatterns.length
                },
                directAnswerDensity: {
                    score: directAnswerDensity,
                    answerBlocks: citBlocks.length,
                    headingCount: allSubHeadings.length
                },
                recommendations: []
            };

            const aeoRecs = seoContentModuleOutput.aeoAnalysis.recommendations;
            if (!hasFaqSchema) aeoRecs.push('Add FAQ schema markup to eligible question-answer content sections');
            if (questionHeadings.length < 3) aeoRecs.push('Restructure content with question-format headings (Who, What, When, Where, Why, How) to target featured snippets');
            if (!citBlocks.some(b => b.isOptimalLength)) aeoRecs.push('Create concise answer paragraphs (134-167 words) directly below question headings for optimal snippet extraction');
            if (paaPatterns.length < 2) aeoRecs.push('Add People Also Ask-style questions as subheadings to capture PAA featured positions');
            if (!hasHowToSchema && allSubHeadings.some(h => /step|how to|guide|tutorial/i.test(h))) aeoRecs.push('Add HowTo schema markup to step-by-step content sections');

            if (verbose) console.log(`[SEOContentModule] ✅ AEO Analysis: overall=${overallAeoScore}, faq=${faqSchemaScore}, snippet=${snippetReadiness}, paa=${paaScore}, density=${directAnswerDensity}`);
        }

        // =====================================================================
        // ENTERPRISE: Voice Search Optimization (evidence-based population)
        // =====================================================================
        {
            if (verbose) console.log('[SEOContentModule] 🎙️ Building voice search optimization...');
            const headings = extractedElements?.headings || {};
            const h2s = headings.h2 || [];
            const h3s = headings.h3 || [];
            const allSubHeadings = [...h2s, ...h3s];
            const aiR = seoContentModuleOutput.technical?.aiReadiness || {};
            const citBlocks = extractedElements?.citabilityBlocks || [];

            // Conversational/question-format headings
            const conversationalHeadings = allSubHeadings.filter(h => /^(what|how|why|when|where|who|can|does|is|should|which|are|do|will)\s/i.test(h));

            // Generate target voice queries from question headings
            const targetQueries = conversationalHeadings.slice(0, 5).map(h => {
                // Convert heading to a natural voice query
                return h.replace(/[?:]$/g, '').trim();
            });

            // Score components
            let voiceScore = 0;
            if (aiR.hasSpeakableMarkup) voiceScore += 25;
            voiceScore += Math.min(25, conversationalHeadings.length * 8); // Question headings
            if (citBlocks.some(b => b.isOptimalLength)) voiceScore += 15; // Concise answers
            if (extractedElements?.metaDescription && extractedElements.metaDescription.length >= 50) voiceScore += 10;
            const readability = seoContentModuleOutput.content?.contentQuality?.readability;
            if (typeof readability === 'number' && readability >= 60) voiceScore += 15; // Easy to read aloud
            else if (typeof readability === 'number' && readability >= 40) voiceScore += 8;
            if (Array.isArray(extractedElements?.schemaMarkup) && extractedElements.schemaMarkup.some(s => s['@type'] === 'FAQPage')) voiceScore += 10;
            voiceScore = Math.min(100, voiceScore);

            seoContentModuleOutput.voiceSearchOptimization = {
                isOptimized: voiceScore >= 50,
                score: voiceScore,
                targetQueries,
                usesSpeakableSchema: aiR.hasSpeakableMarkup || false,
                conversationalQueryAnalysis: {
                    coverageScore: Math.min(100, conversationalHeadings.length * 15),
                    exampleMatchedQueries: targetQueries,
                    intentAlignmentScore: citBlocks.length > 0 && conversationalHeadings.length > 0
                        ? Math.min(100, Math.round((citBlocks.length / Math.max(1, conversationalHeadings.length)) * 80))
                        : 0
                }
            };

            if (verbose) console.log(`[SEOContentModule] ✅ Voice Search: score=${voiceScore}, queries=${targetQueries.length}, speakable=${aiR.hasSpeakableMarkup}`);
        }

        // =====================================================================
        // ENTERPRISE: Persist isItAgentReady.com raw report
        // =====================================================================
        if (agentReadinessRawReport && agentReadinessRawReport !== 'No data returned') {
            seoContentModuleOutput.agentReadinessReport = {
                source: 'isitagentready.com',
                rawReport: agentReadinessRawReport.substring(0, 5000),
                retrievedAt: new Date().toISOString(),
                status: agentReadinessRawReport.startsWith('Check failed') ? 'error' : 'success'
            };
            if (verbose) console.log(`[SEOContentModule] ✅ Agent readiness report persisted (${agentReadinessRawReport.length} chars)`);
        }

        if (onProgress) { onProgress('seoContent', 'Finalizing report structure', 100); }

        return seoContentModuleOutput;

    } catch (error) {
        console.error(`[SEOContentModule] Critical error in SEO Content analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('seoContent', `Error: ${error.message}`, 100); }
        seoContentModuleOutput.error = `SEO Content analysis critically failed: ${error.message}`;
        seoContentModuleOutput.summary = { score: null, rating: 'Failed', topIssues: [seoContentModuleOutput.error.substring(0, 100)] };
        seoContentModuleOutput._skipped = true;
        return seoContentModuleOutput;
    }
}

// ============================================================================
// Cross-Page SEO Analysis (leverages CF crawl data)
// ============================================================================

/**
 * Analyze SEO signals across all crawled pages.
 * Detects: duplicate titles, thin content, mixed HTTP/HTTPS, status code issues.
 *
 * @param {Array<{url: string, markdown: string, title: string, httpStatus: number}>} crawledPages
 * @param {string} baseUrl
 * @param {boolean} verbose
 * @returns {object} Cross-page SEO findings
 */
function analyzeCrossPageSeo(crawledPages, baseUrl, verbose = false) {
    if (!crawledPages || crawledPages.length < 2) {
        return { enabled: false, reason: 'Insufficient crawl data (need 2+ pages)' };
    }

    if (verbose) {
        console.log(`[SEOContent] 🔍 Cross-page SEO analysis on ${crawledPages.length} pages`);
    }

    const issues = [];
    const findings = {
        enabled: true,
        pageCount: crawledPages.length,
        duplicateTitles: [],
        missingTitles: [],
        thinContentPages: [],
        statusCodeIssues: [],
        mixedProtocolLinks: [],
        titleLengthIssues: [],
    };

    // --- 1. Duplicate Title Detection ---
    const titleMap = new Map(); // title → [urls]
    for (const page of crawledPages) {
        const title = (page.title || '').trim().toLowerCase();
        if (!title) {
            findings.missingTitles.push(page.url);
            issues.push({
                text: `Missing page title: ${page.url}`,
                severity: 'High',
                category: 'cross-page-seo',
            });
            continue;
        }
        if (!titleMap.has(title)) titleMap.set(title, []);
        titleMap.get(title).push(page.url);
    }

    for (const [title, urls] of titleMap.entries()) {
        if (urls.length > 1) {
            findings.duplicateTitles.push({ title, urls, count: urls.length });
            issues.push({
                text: `Duplicate title "${title.substring(0, 60)}..." shared by ${urls.length} pages`,
                severity: 'High',
                category: 'cross-page-seo',
            });
        }
    }

    // --- 2. Title Length Issues ---
    for (const page of crawledPages) {
        const title = (page.title || '').trim();
        if (title.length > 0 && title.length < 20) {
            findings.titleLengthIssues.push({ url: page.url, title, issue: 'too-short', length: title.length });
            issues.push({
                text: `Title too short (${title.length} chars) on ${page.url}: "${title}"`,
                severity: 'Medium',
                category: 'cross-page-seo',
            });
        } else if (title.length > 60) {
            findings.titleLengthIssues.push({ url: page.url, title: title.substring(0, 60) + '...', issue: 'too-long', length: title.length });
            issues.push({
                text: `Title too long (${title.length} chars, max 60) on ${page.url}`,
                severity: 'Low',
                category: 'cross-page-seo',
            });
        }
    }

    // --- 3. Thin Content Detection ---
    const THIN_CONTENT_THRESHOLD = 300; // words
    for (const page of crawledPages) {
        if (!page.markdown) continue;
        // Convert markdown to plain text for word count
        const plainText = (page.markdown || '')
            .replace(/!\[.*?\]\(.*?\)/g, '')     // images
            .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links
            .replace(/[#*_~`>|]/g, '')             // markdown syntax
            .replace(/\s+/g, ' ')
            .trim();
        const wordCount = plainText.split(/\s+/).filter(Boolean).length;

        if (wordCount < THIN_CONTENT_THRESHOLD) {
            findings.thinContentPages.push({ url: page.url, wordCount });
            issues.push({
                text: `Thin content (${wordCount} words, min ${THIN_CONTENT_THRESHOLD}) on ${page.url}`,
                severity: wordCount < 100 ? 'High' : 'Medium',
                category: 'cross-page-seo',
            });
        }
    }

    // --- 4. HTTP Status Code Audit ---
    for (const page of crawledPages) {
        const status = page.httpStatus || 200;
        if (status >= 400) {
            findings.statusCodeIssues.push({ url: page.url, statusCode: status, type: 'error' });
            issues.push({
                text: `HTTP ${status} error on crawled page: ${page.url}`,
                severity: status >= 500 ? 'High' : 'Medium',
                category: 'cross-page-seo',
            });
        } else if (status >= 300 && status < 400) {
            findings.statusCodeIssues.push({ url: page.url, statusCode: status, type: 'redirect' });
            issues.push({
                text: `HTTP ${status} redirect on crawled page: ${page.url}`,
                severity: 'Low',
                category: 'cross-page-seo',
            });
        }
    }

    // --- 5. Mixed HTTP/HTTPS Internal Links ---
    let baseProtocol;
    try {
        baseProtocol = new URL(baseUrl).protocol;
    } catch { baseProtocol = 'https:'; }

    if (baseProtocol === 'https:') {
        for (const page of crawledPages) {
            if (!page.markdown) continue;
            // Check for http:// links to the same domain
            let baseDomain;
            try { baseDomain = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { continue; }

            const httpLinksRegex = new RegExp(`http://(www\\.)?${baseDomain.replace(/\./g, '\\.')}`, 'gi');
            const matches = page.markdown.match(httpLinksRegex);
            if (matches && matches.length > 0) {
                findings.mixedProtocolLinks.push({ url: page.url, httpLinkCount: matches.length });
                issues.push({
                    text: `${matches.length} HTTP (non-HTTPS) internal link(s) found on ${page.url}`,
                    severity: 'Medium',
                    category: 'cross-page-seo',
                });
            }
        }
    }

    // Summary stats
    findings.issueCount = issues.length;
    findings.issues = issues;

    if (verbose) {
        console.log(`[SEOContent]   📊 Cross-page results: ${findings.duplicateTitles.length} dupe titles, ${findings.thinContentPages.length} thin pages, ${findings.statusCodeIssues.length} status issues, ${findings.mixedProtocolLinks.length} mixed protocol`);
    }

    return findings;
}

module.exports = { analyze };
