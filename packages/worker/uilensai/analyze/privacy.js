/**
 * Privacy Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance
 *
 * Analyzes website privacy compliance including cookies, consent mechanisms,
 * data collection practices, and privacy policies, leveraging AI for comprehensive assessment.
 */
const { URL } = require('url');

const { v4: uuidv4 } = require('uuid'); // For IDs if needed

const { getModelConfig } = require('../utils/ai-credentials');
const { getStructuredData, getSchemaForModule } = require('../utils/structured-llm-output');
const { getPrompt } = require('../utils/promptTemplates');
const { formatIssuesArray } = require('../utils/issue-formatter'); // For standardizing raw issues
const { calculateModuleSummaryScore, getRatingLabelForScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { buildEvidenceRegistry } = require('../utils/evidence-registry');
const { detectRegulatoryContext } = require('../utils/privacy-regulatory');
const { collectDomSignals } = require('../utils/data-collectors/dom-structure-collector');

// --- Helper Functions for Preliminary Data Gathering ---

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
 * Gathers detailed cookie information from the page for AI context.
 */
async function getCookieContext(page, verbose = false, sharedPageContext = null) {
    if (verbose) { console.log('[PrivacyModule] Gathering cookie context...'); }
    if (!page || page.isClosed()) {
        if (verbose) { console.warn("[PrivacyModule] Page closed. Cloudflare handles cookies securely via isolated rendering."); }
        return { count: 0, sample: "Assessed via Cloudflare container (browser isolated cookies)", consentManagerDetected: null };
    }
    try {
        // Get cookies from Playwright browser context
        const contextCookies = await page.context().cookies(page.url());

        // ENHANCED: Also detect cookies from document.cookie (catches JS-set cookies)
        const documentCookieNames = await page.evaluate(() => {
            try {
                return document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean);
            } catch { return []; }
        }).catch(() => []);

        // ENHANCED: Detect consent manager platforms
        const consentManager = await page.evaluate(() => {
            const managers = [];
            // Osano
            if (window.Osano || document.querySelector('[data-osano]') || document.querySelector('.osano-cm-window')) managers.push('Osano');
            // OneTrust
            if (window.OneTrust || document.querySelector('#onetrust-banner-sdk') || document.querySelector('.onetrust-pc-dark-filter')) managers.push('OneTrust');
            // CookieBot
            if (window.Cookiebot || document.querySelector('#CookiebotDialog')) managers.push('Cookiebot');
            // CookieYes
            if (window.cky_consent || document.querySelector('.cky-consent-container')) managers.push('CookieYes');
            // Quantcast
            if (window.__tcfapi || document.querySelector('.qc-cmp2-container')) managers.push('Quantcast/TCF');
            // TrustArc
            if (window.truste || document.querySelector('#truste-consent-track')) managers.push('TrustArc');
            // Generic cookie banner detection
            if (managers.length === 0) {
                const bannerSelectors = ['.cookie-banner', '.cookie-consent', '.cookie-notice', '#cookie-law-info-bar',
                    '[class*="cookie"][class*="banner"]', '[class*="cookie"][class*="consent"]',
                    '[id*="cookie"][id*="banner"]', '[id*="cookie"][id*="consent"]'];
                for (const sel of bannerSelectors) {
                    if (document.querySelector(sel)) { managers.push('Generic Cookie Banner'); break; }
                }
            }
            return managers;
        }).catch(() => []);

        // Merge unique cookie names (Playwright context + document.cookie)
        const allCookieNames = new Set([
            ...contextCookies.map(c => c.name),
            ...documentCookieNames
        ]);
        const totalCount = Math.max(contextCookies.length, allCookieNames.size);

        const sample = contextCookies.slice(0, 10).map(c =>
            `Name: ${c.name}, Domain: ${c.domain}, Expires: ${c.expires === -1 ? "Session" : new Date(c.expires * 1000).toLocaleDateString()}, HttpOnly: ${c.httpOnly}, Secure: ${c.secure}, SameSite: ${c.sameSite}`
        ).join('; ');

        const pageHostname = new URL(page.url()).hostname;
        return {
            count: totalCount,
            sample: sample || (totalCount > 0 ? `${totalCount} cookies detected (document.cookie only, HttpOnly cookies may be hidden)` : "No cookies found."),
            thirdPartyCount: contextCookies.filter(c => {
                try {
                    const cookieDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
                    return !pageHostname.endsWith(cookieDomain) && !cookieDomain.endsWith(pageHostname);
                }
                catch { return false; }
            }).length,
            consentManagerDetected: consentManager.length > 0 ? consentManager.join(', ') : null
        };
    } catch (error) {
        if (verbose) { console.error(`[PrivacyModule] Error gathering cookie context: ${error.message}`); }
        return { count: 0, sample: `Error: ${error.message.substring(0, 50)}`, thirdPartyCount: 0, consentManagerDetected: null };
    }
}

/**
 * Gathers basic information about potential trackers for AI context.
 */
async function getTrackerContext(page, verbose = false, sharedPageContext = null) {
    if (verbose) { console.log('[PrivacyModule] Gathering tracker context (simplified)...'); }
    if ((!page || page.isClosed()) && !sharedPageContext) {
        if (verbose) { console.warn("[PrivacyModule] Page object is closed or invalid for getTrackerContext."); }
        return { count: 0, domains: "Page not available.", inlineTrackers: [], externalTrackerDomains: [] };
    }
    try {
        let trackerInfo = { externalDomains: [], inlineTrackers: [] };
        
        if (page && !page.isClosed()) {
            trackerInfo = await page.evaluate(() => {
            const pageDomain = new URL(window.location.href).hostname;
            const externalDomains = new Set();
            const inlineTrackers = [];

            // 1. External script/iframe sources
            document.querySelectorAll('script[src], iframe[src], img[src], link[href]').forEach(el => {
                try {
                    const src = el.src || el.href;
                    if (!src) return;
                    const srcDomain = new URL(src).hostname;
                    if (!srcDomain.endsWith(pageDomain) && !pageDomain.endsWith(srcDomain)) {
                        externalDomains.add(srcDomain);
                    }
                } catch (e) { /* ignore invalid URLs */ }
            });

            // 2. ENHANCED: Detect inline tracking scripts (Meta Pixel, GA, etc.)
            document.querySelectorAll('script:not([src])').forEach(script => {
                const text = script.textContent || '';
                if (text.includes('fbq(') || text.includes('facebook.com/tr')) inlineTrackers.push('Meta Pixel (fbq)');
                if (text.includes('gtag(') || text.includes('GoogleAnalyticsObject')) inlineTrackers.push('Google Analytics (gtag)');
                if (text.includes('_gaq.push') || text.includes('ga.create')) inlineTrackers.push('Google Analytics (legacy)');
                if (text.includes('hj(') || text.includes('hotjar')) inlineTrackers.push('Hotjar');
                if (text.includes('twq(') || text.includes('twitter.com/i/adsct')) inlineTrackers.push('Twitter/X Pixel');
                if (text.includes('lintrk') || text.includes('linkedin.com/px')) inlineTrackers.push('LinkedIn Insight');
                if (text.includes('ttq.load') || text.includes('tiktok.com/i18n')) inlineTrackers.push('TikTok Pixel');
                if (text.includes('snaptr(') || text.includes('sc-static.net')) inlineTrackers.push('Snapchat Pixel');
                if (text.includes('rdt(') || text.includes('redditstatic.com')) inlineTrackers.push('Reddit Pixel');
                if (text.includes('clarity') && text.includes('microsoft')) inlineTrackers.push('Microsoft Clarity');
            });
            return { externalDomains: Array.from(externalDomains), inlineTrackers: [...new Set(inlineTrackers)] };
        });
        } else if (sharedPageContext) {
            // Regex match tracking text from body if no DOM
            const bodyLower = (sharedPageContext.bodyText || '').toLowerCase();
            const inlineTrackers = [];
            if (bodyLower.includes('fbq(') || bodyLower.includes('facebook.com/tr')) inlineTrackers.push('Meta Pixel (fbq)');
            if (bodyLower.includes('gtag(') || bodyLower.includes('googleanalyticsobject')) inlineTrackers.push('Google Analytics (gtag)');
            if (bodyLower.includes('hotjar')) inlineTrackers.push('Hotjar');
            trackerInfo = { externalDomains: [], inlineTrackers };
        }

        const commonTrackerKeywords = [
            "google-analytics", "googletagmanager", "doubleclick", "facebook", "fbq",
            "connect.facebook", "linkedin", "hotjar", "krxd", "scorecardresearch",
            "semasio", "adsrvr", "segment", "mixpanel", "amplitude", "optimizely",
            "crazyegg", "clarity.ms", "tiktok", "snapchat", "twitter", "pinterest",
            "reddit", "bing", "yahoo", "taboola", "outbrain", "hubspot", "marketo",
            "pardot", "intercom", "drift", "zendesk", "freshdesk", "osano",
            "onetrust", "cookiebot"
        ];
        const detectedTrackerDomains = trackerInfo.externalDomains.filter(domain =>
            commonTrackerKeywords.some(keyword => domain.includes(keyword))
        );

        // Merge external and inline tracker detections
        const allTrackers = [...new Set([...detectedTrackerDomains, ...trackerInfo.inlineTrackers])];

        return {
            count: allTrackers.length,
            domains: allTrackers.slice(0, 10).join(', ') || "No common trackers identified by scan.",
            inlineTrackers: trackerInfo.inlineTrackers,
            externalTrackerDomains: detectedTrackerDomains
        };
    } catch (error) {
        if (verbose) { console.error(`[PrivacyModule] Error gathering tracker context: ${error.message}`); }
        return { count: 0, domains: `Error: ${error.message.substring(0, 50)}`, inlineTrackers: [], externalTrackerDomains: [] };
    }
}

/**
 * Gathers basic information about the privacy policy for AI context.
 */
async function getPrivacyPolicyContext(page, verbose = false, url = null, sharedPageContext = null) {
    if (verbose) { console.log('[PrivacyModule] Gathering privacy policy context...'); }
    
    try {
        let policyInfo = { found: false, link: null, text: null };
        
        // 1. Try Playwright
        if (page && !page.isClosed()) {
            policyInfo = await page.evaluate(() => {
                // ENHANCED: More comprehensive privacy policy detection patterns
                const enhancedTextPatterns = [
                // Standard patterns
                /^privacy\s*policy$/i, /^privacy$/i, /^terms$/i, /^terms\s*of\s*service$/i,
                /^legal$/i, /^policy$/i, /^data\s*protection$/i,

                // Medical/healthcare specific patterns
                /^hipaa$/i, /^patient\s*privacy$/i, /^health\s*privacy$/i, /^medical\s*privacy$/i,
                /^privacy\s*notice$/i, /^patient\s*rights$/i, /^health\s*information$/i,

                // Business variations  
                /^privacy\s*statement$/i, /^data\s*policy$/i, /^privacy\s*practices$/i,
                /^information\s*privacy$/i, /^data\s*handling$/i, /^confidentiality$/i,

                // Partial matches (more flexible)
                /privacy\s*policy/i, /data\s*privacy/i, /privacy\s*notice/i,
                /privacy\s*statement/i, /privacy\s*practices/i, /patient\s*privacy/i,
                /medical\s*privacy/i, /health\s*privacy/i, /hipaa/i,

                // Common variations
                /terms\s*of\s*use/i, /terms\s*and\s*conditions/i, /legal\s*information/i,
                /cookie\s*policy/i, /data\s*protection\s*policy/i
            ];

            const getCleanText = (element) => {
                if (!element) return '';
                return element.innerText?.trim() || element.textContent?.trim() || '';
            };

            const checkLinkText = (link) => {
                const text = getCleanText(link);
                return enhancedTextPatterns.some(pattern => pattern.test(text));
            };

            const getAllLinks = () => {
                return Array.from(document.querySelectorAll('a[href]')).filter(link => {
                    const href = link.getAttribute('href');
                    return href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:');
                });
            };

            // DETECTION LEVEL 1: Direct link text matching (most reliable)
            const allLinks = getAllLinks();
            let foundLink = allLinks.find(checkLinkText);

            if (foundLink) {
                return {
                    found: true,
                    link: foundLink.href,
                    text: getCleanText(foundLink),
                    method: 'direct_text_match',
                    location: 'document'
                };
            }

            // DETECTION LEVEL 2: Vue.js / SPA specific detection
            // Check for Vue components, router-link elements, and data attributes
            const vueLinks = document.querySelectorAll('[data-v-], router-link, [v-for], [v-if], [data-router-link]');
            for (const vueElement of vueLinks) {
                const vueText = getCleanText(vueElement);
                if (enhancedTextPatterns.some(pattern => pattern.test(vueText))) {
                    const href = vueElement.getAttribute('href') ||
                        vueElement.getAttribute('to') ||
                        vueElement.getAttribute('data-href') ||
                        vueElement.closest('a')?.href;
                    if (href) {
                        return {
                            found: true,
                            link: href,
                            text: vueText,
                            method: 'vue_component_match',
                            location: 'vue_component'
                        };
                    }
                }
            }

            // DETECTION LEVEL 3: Hash-based and query parameter routes (SPAs)
            const hashLinks = allLinks.filter(link =>
                link.href.includes('#') ||
                link.href.includes('privacy') ||
                link.href.includes('policy') ||
                link.href.includes('terms') ||
                link.href.includes('legal')
            );

            for (const hashLink of hashLinks) {
                const linkText = getCleanText(hashLink);
                if (enhancedTextPatterns.some(pattern => pattern.test(linkText)) ||
                    hashLink.href.toLowerCase().includes('privacy')) {
                    return {
                        found: true,
                        link: hashLink.href,
                        text: linkText,
                        method: 'hash_route_match',
                        location: 'spa_route'
                    };
                }
            }

            // DETECTION LEVEL 4: Footer-specific comprehensive search
            const footerSelectors = [
                'footer', '.footer', '#footer', '[class*="footer"]',
                '.site-footer', '.page-footer', '.main-footer', '.footer-content',
                '[role="contentinfo"]', '.legal-links', '.footer-links',
                '.copyright', '.legal-info', '.footer-legal'
            ];

            for (const selector of footerSelectors) {
                const footerElement = document.querySelector(selector);
                if (footerElement) {
                    const footerLinks = footerElement.querySelectorAll('a[href]');
                    foundLink = Array.from(footerLinks).find(checkLinkText);
                    if (foundLink) {
                        return {
                            found: true,
                            link: foundLink.href,
                            text: getCleanText(foundLink),
                            method: 'footer_search',
                            location: 'footer'
                        };
                    }
                }
            }

            // DETECTION LEVEL 5: Header/Navigation search
            const headerSelectors = [
                'header', '.header', '#header', 'nav', '.nav', '.navigation',
                '.navbar', '.menu', '.main-nav', '.primary-nav', '.site-nav',
                '[role="navigation"]', '.header-menu', '.top-menu'
            ];

            for (const selector of headerSelectors) {
                const headerElement = document.querySelector(selector);
                if (headerElement) {
                    const headerLinks = headerElement.querySelectorAll('a[href]');
                    foundLink = Array.from(headerLinks).find(checkLinkText);
                    if (foundLink) {
                        return {
                            found: true,
                            link: foundLink.href,
                            text: getCleanText(foundLink),
                            method: 'header_search',
                            location: 'header'
                        };
                    }
                }
            }

            // DETECTION LEVEL 6: Sidebar and aside elements
            const sidebarSelectors = [
                'aside', '.sidebar', '.side-nav', '.secondary-nav',
                '.widget-area', '.sidebar-content', '[class*="sidebar"]'
            ];

            for (const selector of sidebarSelectors) {
                const sidebarElement = document.querySelector(selector);
                if (sidebarElement) {
                    const sidebarLinks = sidebarElement.querySelectorAll('a[href]');
                    foundLink = Array.from(sidebarLinks).find(checkLinkText);
                    if (foundLink) {
                        return {
                            found: true,
                            link: foundLink.href,
                            text: getCleanText(foundLink),
                            method: 'sidebar_search',
                            location: 'sidebar'
                        };
                    }
                }
            }

            // DETECTION LEVEL 7: Comprehensive body search as last resort
            const bodyLinks = document.body.querySelectorAll('a[href]');
            foundLink = Array.from(bodyLinks).find(checkLinkText);
            if (foundLink) {
                return {
                    found: true,
                    link: foundLink.href,
                    text: getCleanText(foundLink),
                    method: 'body_search',
                    location: 'body'
                };
            }

            return {
                found: false,
                link: null,
                text: null,
                method: 'not_found',
                location: null,
                totalLinksChecked: allLinks.length
            };
        });
        }
        
        // 2. Try sharedPageContext links if page failed or is null
        if (!policyInfo.found && sharedPageContext && sharedPageContext.links) {
            const allLinks = [
                ...(sharedPageContext.links.internal || []),
                ...(sharedPageContext.links.external || [])
            ];
            
            const privacyPatterns = [/privacy/i, /policy/i, /terms/i, /legal/i];
            for (const link of allLinks) {
                if (privacyPatterns.some(p => p.test(link.text) || p.test(link.url))) {
                    policyInfo = { found: true, link: link.url, text: link.text, method: 'shared_context', location: 'links' };
                    break;
                }
            }
        }

        if (policyInfo.found && policyInfo.link && verbose) {
            console.log(`[PrivacyModule] Privacy policy link found via ${policyInfo.method}: ${policyInfo.link}`);
        } else if (verbose) {
            console.log(`[PrivacyModule] No privacy policy link found via page evaluation. Trying URL-pattern fallback...`);
        }

        // URL-PATTERN FALLBACK: If page.evaluate didn't find a link, probe common privacy policy URLs
        if (!policyInfo.found) {
            const urlPatternResult = await _probePrivacyPolicyUrls(url, verbose);
            if (urlPatternResult.found) {
                return urlPatternResult;
            }
        }

        return policyInfo;
    } catch (error) {
        if (verbose) { console.error(`[PrivacyModule] Error gathering privacy policy context: ${error.message}`); }
        // Even if page.evaluate failed, try URL-pattern detection (doesn't need the page)
        const urlPatternResult = await _probePrivacyPolicyUrls(url, verbose);
        if (urlPatternResult.found) {
            return urlPatternResult;
        }
        return { found: false, link: null, linkText: `Error: ${error.message.substring(0, 50)}`, detectionMethod: "error" };
    }
}

/**
 * Probes common privacy policy URL patterns via HTTP HEAD requests.
 * This is a fallback for when page.evaluate() can't find a link.
 */
async function _probePrivacyPolicyUrls(baseUrl, verbose = false) {
    const https = require('https');
    const http = require('http');

    const commonPaths = [
        '/privacy-policy', '/privacy', '/legal/privacy', '/privacy-policy/',
        '/terms-of-service', '/terms', '/legal', '/legal/',
        '/policies/privacy-policy', '/policies/privacy',
        '/about/privacy', '/info/privacy',
        '/hipaa', '/hipaa-privacy', '/patient-privacy',
        '/cookie-policy', '/data-privacy'
    ];

    try {
        const parsedUrl = new URL(baseUrl);
        const origin = parsedUrl.origin;

        for (const path of commonPaths) {
            const testUrl = `${origin}${path}`;
            try {
                const exists = await new Promise((resolve) => {
                    const client = testUrl.startsWith('https') ? https : http;
                    const req = client.request(testUrl, { method: 'HEAD', timeout: 5000 }, (res) => {
                        resolve(res.statusCode >= 200 && res.statusCode < 400);
                    });
                    req.on('error', () => resolve(false));
                    req.on('timeout', () => { req.destroy(); resolve(false); });
                    req.end();
                });

                if (exists) {
                    if (verbose) console.log(`[PrivacyModule] URL-pattern fallback found policy at: ${testUrl}`);
                    return {
                        found: true,
                        link: testUrl,
                        text: path.replace(/^\//, '').replace(/-/g, ' '),
                        method: 'url_pattern_probe',
                        location: 'url_fallback'
                    };
                }
            } catch (e) {
                // Skip this URL and try the next one
            }
        }
    } catch (e) {
        if (verbose) console.warn(`[PrivacyModule] URL-pattern fallback failed: ${e.message}`);
    }

    return { found: false };
}

/**
 * Gathers basic information about consent mechanisms for AI context.
 */
async function getConsentContext(page, verbose = false, sharedPageContext = null) {
    if (verbose) { console.log('[PrivacyModule] Gathering consent context...'); }
    
    try {
        let consentData = { bannerDetected: false, hasAcceptAll: false, hasRejectAll: false, hasGranularOptions: false, defaultStateUnclear: true };
        
        if (page && !page.isClosed()) {
            // ACCURACY FIX: Wait for React/Next.js hydration before scanning for consent banners
            // Cookie banners rendered via React may not be in the DOM immediately after page load
            try {
                await page.waitForTimeout(2000);
            } catch (e) { /* timeout is best-effort */ }

            consentData = await page.evaluate(() => {
                // Use JavaScript-based detection instead of complex CSS selectors
                function findElementsByTextAndAttributes(textPatterns, attributePatterns) {
                const allElements = Array.from(document.querySelectorAll('*'));
                return allElements.filter(el => {
                    const text = (el.textContent || '').toLowerCase();
                    const hasTextMatch = textPatterns.some(pattern => text.includes(pattern.toLowerCase()));

                    if (attributePatterns && attributePatterns.length > 0) {
                        const hasAttrMatch = attributePatterns.some(attr => {
                            const id = (el.id || '').toLowerCase();
                            const className = el.className ?
                                (typeof el.className === 'string' ? el.className : el.className.toString()).toLowerCase() :
                                '';
                            return id.includes(attr.toLowerCase()) || className.includes(attr.toLowerCase());
                        });
                        return hasTextMatch || hasAttrMatch;
                    }

                    return hasTextMatch;
                });
            }

            // Detect consent banners using multiple approaches
            // ACCURACY FIX: Expanded to include React/Next.js component patterns
            const bannerSelectors = [
                '[class*="cookie"]', '[class*="consent"]', '[class*="privacy"]', '[class*="gdpr"]',
                '[id*="cookie"]', '[id*="consent"]', '[id*="privacy"]', '[id*="gdpr"]',
                '#CybotCookiebotDialog', '#onetrust-banner-sdk', '#cookieyes-banner',
                'div[role="dialog"]', 'div[aria-modal="true"]',
                // React/Next.js component patterns
                '[data-testid*="cookie"]', '[data-testid*="consent"]', '[data-testid*="banner"]',
                '[aria-label*="cookie"]', '[aria-label*="consent"]', '[aria-label*="Cookie"]',
                '[data-cookie-consent]', '[data-consent-banner]'
            ];

            let bannerElement = null;
            for (const selector of bannerSelectors) {
                try {
                    bannerElement = document.querySelector(selector);
                    if (bannerElement) { break; }
                } catch (e) {
                    // Skip invalid selectors
                    continue;
                }
            }

            // Also check for elements with banner-related text
            if (!bannerElement) {
                const bannerTextPatterns = ['cookie', 'consent', 'privacy', 'gdpr', 'tracking'];
                const potentialBanners = findElementsByTextAndAttributes(bannerTextPatterns, []);
                bannerElement = potentialBanners.find(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 200 && rect.height > 50; // Reasonable banner size
                });
            }

            const bannerDetected = !!bannerElement;
            let defaultStateUnclear = true;

            if (bannerElement) {
                // Try to infer default state (very basic)
                const checkboxes = bannerElement.querySelectorAll('input[type="checkbox"]');
                const nonEssentialChecked = Array.from(checkboxes).some(cb => {
                    const name = (cb.name || '').toLowerCase();
                    const isEssential = name.includes('essential') || name.includes('necessary') || name.includes('required');
                    return cb.checked && !isEssential;
                });
                if (nonEssentialChecked) { defaultStateUnclear = false; }
            }

            // Check for accept buttons using text-based detection
            const acceptTextPatterns = ['accept', 'agree', 'allow all', 'ok', 'got it', 'continue'];
            const acceptElements = findElementsByTextAndAttributes(acceptTextPatterns, ['accept', 'agree', 'allow']);
            const hasAcceptAll = acceptElements.some(el =>
                el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT'
            );

            // Check for reject buttons
            const rejectTextPatterns = ['reject', 'decline', 'deny', 'refuse', 'no thanks', 'disagree'];
            const rejectElements = findElementsByTextAndAttributes(rejectTextPatterns, ['reject', 'decline', 'deny']);
            const hasRejectAll = rejectElements.some(el =>
                el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT'
            );

            // Check for granular options
            const granularTextPatterns = ['manage', 'settings', 'preferences', 'customize', 'choose', 'options', 'configure'];
            const granularElements = findElementsByTextAndAttributes(granularTextPatterns, ['manage', 'settings', 'preferences']);
            const hasGranularCheckboxes = document.querySelectorAll('input[type="checkbox"][name*="consent"], input[type="checkbox"][name*="cookie"]').length > 1;
            const hasGranularOptions = hasGranularCheckboxes || granularElements.some(el =>
                el.tagName === 'BUTTON' || el.tagName === 'A'
            );

            return {
                bannerDetected,
                hasAcceptAll,
                hasRejectAll,
                hasGranularOptions,
                defaultStateUnclear
            };
        });
        } else if (sharedPageContext) {
            const body = (sharedPageContext.bodyText || '').toLowerCase();
            if (body.includes("accept all cookies") || body.includes("cookie policy") || body.includes("opt-out")) {
                consentData = { bannerDetected: true, hasAcceptAll: true, hasRejectAll: false, hasGranularOptions: body.includes("manage"), defaultStateUnclear: true };
            }
        }
        
        if (consentData.bannerDetected && verbose) { console.log("[PrivacyModule] Consent banner detected."); }
        return consentData;
    } catch (error) {
        if (verbose) { console.error(`[PrivacyModule] Error gathering consent context: ${error.message}`); }
        return { bannerDetected: false, hasAcceptAll: false, hasRejectAll: false, hasGranularOptions: false, defaultStateUnclear: true, error: error.message.substring(0, 50) };
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
        targetRegulations, // Optional array of strings like ["GDPR", "CCPA"]
        costAggregator = null // Add costAggregator parameter
    } = options;

    const modelConfigOptions = { modelFamily, model, maxTokens, tier, analysisDepth };
    const startTimestamp = Date.now();

    if (verbose) { console.log(`[PrivacyModule] Starting privacy analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth})`); }
    if (onProgress) { onProgress('privacy', 'Initializing privacy analysis', 0); }

    let privacyModuleOutput = {
        summary: { score: null, rating: 'Pending', topIssues: [] },
        _skipped: true,
        cookies: createDefaultPaginatedArray(),
        trackers: createDefaultPaginatedArray(),
        consent: {
            bannerPresent: false,
            optOut: false,
            clearLanguage: false,
            granularity: "None",
            score: 10,
            consentMethod: "None",
            withdrawalOption: false,
            consentRecord: false,
            bannerCompliance: {
                positioningScore: 10,
                dismissibilityScore: 10,
                clarityOfChoicesScore: 10
            }
        },
        privacyPolicy: { found: false, score: 10, link: null, clarityScore: 10, comprehensivenessScore: 10, accessibilityScore: 10, lastUpdatedDate: null, issues: [], keyClausesPresent: [] },
        dataLayer: { found: false, score: 10, variables: [], events: [], issues: [] },
        consentManagement: { score: 10, bannerDetected: false, granularConsentAvailable: false, optOutMechanism: false, consentRecord: false, defaultConsentState: "Unknown", lastUpdated: null, userExperienceScore: 10 },
        dataSharingPractices: { score: 10, thirdPartySharingScore: 10, anonymizationTechniquesScore: 10, dataMinimizationScore: 10, crossBorderTransfers: false, dataRetentionPolicyClarityScore: 10 },
        gdprCompliance: null,
        ccpaCompliance: null,
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        industryBenchmarks: {}, roiProjections: null, businessImpact: null, implementationRoadmap: null, financialRisk: null, realTimeDataFeed: null,
        error: null
    };

    try {
        if (!page || page.isClosed()) {
            if (verbose) console.warn("[PrivacyModule] No Playwright page; falling back to CF sharedPageContext extraction.");
        }

        if (onProgress) { onProgress('privacy', 'Gathering preliminary data', 10); }
        const cookieCtx = await getCookieContext(page, verbose, options.sharedPageContext);
        const trackerCtx = await getTrackerContext(page, verbose, options.sharedPageContext);
        const privacyPolicyCtx = await getPrivacyPolicyContext(page, verbose, url, options.sharedPageContext);
        const consentCtx = await getConsentContext(page, verbose, options.sharedPageContext);

        // BROWSER AUDIT ENRICHMENT: Use real browser data from Browser Audit Worker
        const browserAudit = sharedPageContext?.browserAudit;
        if (browserAudit) {
            // Enrich cookies with real page.cookies() data
            if (Array.isArray(browserAudit.cookies) && browserAudit.cookies.length > 0 && cookieCtx.count === 0) {
                const bc = browserAudit.cookies;
                const pageDomain = new URL(url).hostname;
                cookieCtx.count = bc.length;
                cookieCtx.sample = bc.slice(0, 10).map(c =>
                    `Name: ${c.name}, Domain: ${c.domain}, Expires: ${c.expires}, HttpOnly: ${c.httpOnly}, Secure: ${c.secure}, SameSite: ${c.sameSite}, Category: ${c.category}`
                ).join('; ');
                cookieCtx.thirdPartyCount = bc.filter(c => {
                    const d = (c.domain || '').replace(/^\./, '');
                    return !pageDomain.endsWith(d) && !d.endsWith(pageDomain);
                }).length;
                cookieCtx.secureCount = bc.filter(c => c.secure).length;
                cookieCtx._browserAuditCookies = bc; // Preserve full data for later population
                if (verbose) console.log(`[PrivacyModule] 🔬 Browser audit enriched cookies: ${bc.length} total, ${cookieCtx.thirdPartyCount} third-party`);
            }

            // Enrich trackers with real network request data
            if (browserAudit.networkRequests?.thirdPartyDomains && trackerCtx.count === 0) {
                const tpDomains = browserAudit.networkRequests.thirdPartyDomains;
                const commonTrackerKeywords = [
                    'google-analytics', 'googletagmanager', 'doubleclick', 'facebook',
                    'connect.facebook', 'linkedin', 'hotjar', 'clarity.ms', 'segment',
                    'mixpanel', 'amplitude', 'bing', 'tiktok', 'pinterest', 'hubspot'
                ];
                const detectedTrackers = tpDomains.filter(d =>
                    commonTrackerKeywords.some(k => d.includes(k))
                );
                if (detectedTrackers.length > 0) {
                    trackerCtx.count = detectedTrackers.length;
                    trackerCtx.domains = detectedTrackers.join(', ');
                    trackerCtx.externalTrackerDomains = detectedTrackers;
                    if (verbose) console.log(`[PrivacyModule] 🔬 Browser audit enriched trackers: ${detectedTrackers.join(', ')}`);
                }
            }
        }

        // ENHANCED: Deterministic HTML-based privacy signal extraction (works without Playwright)
        let htmlPrivacySignals = null;
        const rawHtml = sharedPageContext._rawHtml || '';
        if (rawHtml) {
            const { extractPrivacySignalsFromHtml } = require('../utils/cfHtmlExtractor');
            htmlPrivacySignals = extractPrivacySignalsFromHtml(rawHtml, url, verbose);
            privacyModuleOutput._htmlPrivacySignals = htmlPrivacySignals;

            // Enrich tracker context with HTML-derived data if page.evaluate was unavailable
            if (trackerCtx.count === 0 && htmlPrivacySignals.trackers.count > 0) {
                trackerCtx.count = htmlPrivacySignals.trackers.count;
                trackerCtx.domains = htmlPrivacySignals.trackers.detected.join(', ');
                trackerCtx.inlineTrackers = htmlPrivacySignals.trackers.detected;
                trackerCtx.externalTrackerDomains = htmlPrivacySignals.trackers.externalDomains;
                if (verbose) console.log(`[PrivacyModule] HTML fallback enriched trackers: ${htmlPrivacySignals.trackers.detected.join(', ')}`);
            }

            // Enrich consent context
            if (!consentCtx.bannerDetected && htmlPrivacySignals.consent.bannerDetected) {
                consentCtx.bannerDetected = true;
                consentCtx.hasAcceptAll = htmlPrivacySignals.consent.hasAcceptAll;
                consentCtx.hasRejectAll = htmlPrivacySignals.consent.hasRejectAll;
                consentCtx.hasGranularOptions = htmlPrivacySignals.consent.hasGranularOptions;
                if (verbose) console.log(`[PrivacyModule] HTML fallback detected consent: ${htmlPrivacySignals.consent.managersDetected.join(', ')}`);
            }

            // Enrich privacy policy context
            if (!privacyPolicyCtx.found && htmlPrivacySignals.privacyPolicy.found) {
                privacyPolicyCtx.found = true;
                privacyPolicyCtx.link = htmlPrivacySignals.privacyPolicy.link;
                privacyPolicyCtx.text = htmlPrivacySignals.privacyPolicy.text;
                privacyPolicyCtx.method = 'html_cheerio_fallback';
                if (verbose) console.log(`[PrivacyModule] HTML fallback found privacy policy: ${htmlPrivacySignals.privacyPolicy.link}`);
            }
        }

        // --- Deterministic DOM Signal Collection ---
        if (onProgress) { onProgress('privacy', 'Collecting deterministic DOM structure signals', 20); }
        const collectedSignals = await collectDomSignals(page, verbose);
        privacyModuleOutput._collectedSignals = collectedSignals;
        // ------------------------------------------------

        // GOLD-STANDARD: Evidence-based regulatory context detection
        let regulatoryEvidence = null;
        try {
            regulatoryEvidence = await detectRegulatoryContext(page, industryContext, verbose, options.sharedPageContext);
        } catch (rErr) { if (verbose) console.warn('[PrivacyModule] Regulatory context detection failed:', rErr.message); }

        if (onProgress) { onProgress('privacy', 'Preliminary data gathered', 30); }

        const promptVariables = {
            url,
            industryContext: industryContext || { primaryIndustry: "Unknown" },
            analysisDepth, tier, featureSet: JSON.stringify(featureSet),
            currentDate: new Date().toISOString().split('T')[0],
            targetRegulations: Array.isArray(targetRegulations) ? targetRegulations.join(', ') : "General Best Practices (GDPR, CCPA if applicable)",

            cookiesCount: cookieCtx.count,
            thirdPartyCookiesCount: cookieCtx.thirdPartyCount,
            cookieSampleText: cookieCtx.sample.substring(0, 1000), // Increased sample length

            trackersCount: trackerCtx.count,
            trackerDomainsSample: trackerCtx.domains.substring(0, 1000), // Increased sample length

            privacyPolicyFound: privacyPolicyCtx.found,
            privacyPolicyLink: privacyPolicyCtx.link,
            privacyPolicyLinkText: privacyPolicyCtx.linkText,
            privacyPolicyLastUpdatedHint: privacyPolicyCtx.lastUpdatedText, // Hint for AI

            consentBannerDetected: consentCtx.bannerDetected,
            consentAcceptAllPresent: consentCtx.hasAcceptAll,
            consentRejectAllPresent: consentCtx.hasRejectAll,
            consentGranularOptionsPresent: consentCtx.hasGranularOptions,
            consentDefaultStateUnclear: consentCtx.defaultStateUnclear, // Hint for AI

            // Placeholders for data AI needs to infer or for which deeper analysis is needed
            dataLayerPiiLeakageRisk: "To be assessed by AI based on content and tracker analysis.",
            formsPiiCount: 0, // This would ideally come from a forms module or deeper scan
            piiTypesCollectedViaForms: "To be assessed by AI if forms are described.",
            dataMinimizationEvidence: "To be assessed by AI from policy and observed practices.",
            anonymizationTechniquesUsed: "To be assessed by AI from policy.",
            crossBorderDataTransferEvidence: "To be assessed by AI from policy and tracker locations."
        };

        if (verbose) { console.log("[PrivacyModule] Prompt variables prepared (sample):", JSON.stringify(promptVariables).substring(0, 500) + "..."); }
        if (onProgress) { onProgress('privacy', 'Preparing AI analysis prompt', 35); }

        // Build regulatory compliance summary for two-pass prompts
        let regulatoryComplianceSummary = 'N/A';
        if (privacyModuleOutput.regulatoryContext) {
            const rc = privacyModuleOutput.regulatoryContext;
            regulatoryComplianceSummary = `frameworks=${(rc.applicableFrameworks || []).join(', ') || 'none'}, riskLevel=${rc.overallRiskLevel || 'unknown'}, score=${rc.complianceScore || 'N/A'}/100`;
        }

        // Merge regulatory summary into prompt variables
        const twoPassVars = { ...promptVariables, regulatoryComplianceSummary };

        if (onProgress) { onProgress('privacy', `Calling AI (two-pass pipeline)`, 40); }

        // Build evidence registry and pre-execute evidence block for prompt injection
        let evidenceBlock;
        const rawHtmlForRegistry = sharedPageContext?._rawHtml || '';
        if (rawHtmlForRegistry) {
            const registry = buildEvidenceRegistry(rawHtmlForRegistry, url, { verbose, sharedPageContext });
            evidenceBlock = registry.toEvidenceBlock({ categories: ['privacy', 'platform', 'content'] });
            if (verbose) {
                console.log(`[PrivacyModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
            }
        }

        // GOLD-STANDARD: Two-pass AI analysis pipeline
        const aiResult = await twoPassAnalysis({
            moduleName: 'privacy',
            evidenceData: twoPassVars,
            industryContext,
            pass1Template: 'privacy-evidence-extraction',
            pass2Template: 'privacy-expert-judgment',
            pass2Schema: await getSchemaForModule('privacyModule', false),
            tier,
            analysisDepth,
            modelFamily: modelFamily,
            model: model,
            costAggregator,
            verbose,
            evidenceBlock,
        });

        if (onProgress) { onProgress('privacy', 'AI analysis received', 80); }

        // CRITICAL FIX: Enhanced data validation and structure correction
        let aiResponse = aiResult.analysis || aiResult.data || aiResult; // Two-pass returns .analysis

        // GOLD-STANDARD: Inject narrative and evidence from two-pass pipeline
        if (aiResponse && typeof aiResponse === 'object') {
            if (aiResult.narrative) { aiResponse.narrative = aiResult.narrative; }
            if (aiResult.agentMeta) { aiResponse._agentMeta = aiResult.agentMeta; }
            if (aiResult.evidence) { aiResponse.evidenceSummary = aiResult.evidence; }
        }

        // Apply tier-specific scoring ONLY for truly broken AI scores (0 or 1)
        // Honest scoring: let real analysis scores stand, don't inflate them
        if (aiResponse && typeof aiResponse === 'object' && aiResponse.summary) {
            const rawScore = aiResponse.summary.score;

            // Only override if AI returned a clearly broken score (0 or 1)
            if (rawScore === 0 || rawScore === 1) {
                const privacyContext = {
                    url: url,
                    hasPrivacyPolicy: privacyPolicyCtx.found,
                    hasConsentBanner: consentCtx.bannerDetected,
                    hasSecureCookies: cookieCtx.secureCount > 0,
                    cookieCount: cookieCtx.count,
                    trackingScripts: trackerCtx.count
                };
                const scoringFn = calculateProTierPrivacyScore; // TIER COLLAPSE: always use highest-quality scoring
                const realisticScore = scoringFn(privacyContext, cookieCtx, trackerCtx, tier);
                aiResponse.summary.score = realisticScore;
                if (verbose) {
                    console.log(`[PrivacyModule] Corrected broken ${tier} tier score from ${rawScore} to ${realisticScore}`);
                }
            }
        }

        // CRITICAL FIX: Validate and fix data structure corruption using existing validation
        if (typeof aiResponse !== 'object' || aiResponse === null || Array.isArray(aiResponse)) {
            if (verbose) {
                console.warn(`[PrivacyModule] Data structure validation failed: Expected object but got ${Array.isArray(aiResponse) ? 'array' : typeof aiResponse}`);
            }

            // If it's an array, try to extract the first object
            if (Array.isArray(aiResponse) && aiResponse.length > 0 && typeof aiResponse[0] === 'object') {
                aiResponse = aiResponse[0];
                if (verbose) {
                    console.log(`[PrivacyModule] Extracted object from array structure`);
                }
            } else {
                // ENHANCED: Create meaningful fallback response when AI fails completely
                if (verbose) {
                    console.warn(`[PrivacyModule] AI response completely invalid, creating fallback analysis based on detected data`);
                }

                aiResponse = {
                    summary: {
                        score: privacyPolicyCtx.found ? 45 : 25, // Higher score if privacy policy found
                        rating: getRatingLabelForScore(privacyPolicyCtx.found ? 45 : 25, false),
                        topIssues: privacyPolicyCtx.found ?
                            ["Privacy policy found but detailed analysis unavailable"] :
                            ["No privacy policy detected", "Limited privacy compliance analysis available"]
                    },
                    privacyPolicy: {
                        found: privacyPolicyCtx.found,
                        score: privacyPolicyCtx.found ? 60 : 15,
                        link: privacyPolicyCtx.link,
                        clarityScore: 50,
                        comprehensivenessScore: 50,
                        accessibilityScore: 50,
                        lastUpdatedDate: privacyPolicyCtx.lastUpdatedText,
                        issues: privacyPolicyCtx.found ? [] : ["Privacy policy not found or not accessible"],
                        keyClausesPresent: []
                    },
                    consent: {
                        bannerPresent: consentCtx.bannerDetected,
                        optOut: consentCtx.hasRejectAll,
                        clearLanguage: consentCtx.bannerDetected,
                        granularity: consentCtx.hasGranularOptions ? "Granular" : "Basic",
                        score: consentCtx.bannerDetected ? 60 : 20,
                        consentMethod: consentCtx.bannerDetected ? "Banner" : "None",
                        withdrawalOption: consentCtx.hasRejectAll,
                        consentRecord: false,
                        bannerCompliance: {
                            positioningScore: consentCtx.bannerDetected ? 70 : 10,
                            dismissibilityScore: consentCtx.hasRejectAll ? 80 : 30,
                            clarityOfChoicesScore: consentCtx.hasGranularOptions ? 75 : 40
                        }
                    },
                    consentManagement: {
                        score: consentCtx.bannerDetected ? 55 : 20,
                        bannerDetected: consentCtx.bannerDetected,
                        granularConsentAvailable: consentCtx.hasGranularOptions,
                        optOutMechanism: consentCtx.hasRejectAll,
                        consentRecord: false,
                        defaultConsentState: consentCtx.defaultStateUnclear ? "Unknown" : "Clear",
                        lastUpdated: null,
                        userExperienceScore: 50
                    },
                    dataSharingPractices: {
                        score: 40, // Neutral score when analysis unavailable
                        thirdPartySharingScore: 40,
                        anonymizationTechniquesScore: 40,
                        dataMinimizationScore: 40,
                        crossBorderTransfers: false,
                        dataRetentionPolicyClarityScore: 40
                    },
                    cookies: createDefaultPaginatedArray([{
                        id: "fallback-cookie-1",
                        name: "Analysis unavailable",
                        domain: "N/A",
                        purpose: "Cookie analysis could not be completed",
                        category: "Unknown",
                        expires: "Unknown",
                        httpOnly: false,
                        secure: false,
                        sameSite: "Unknown"
                    }]),
                    trackers: createDefaultPaginatedArray([{
                        id: "fallback-tracker-1",
                        name: "Analysis unavailable",
                        domain: "N/A",
                        purpose: "Tracker analysis could not be completed",
                        category: "Unknown",
                        dataCollected: ["Unknown"]
                    }]),
                    dataLayer: {
                        found: false,
                        score: 0,
                        variables: [],
                        events: [],
                        issues: ["Data layer analysis unavailable"]
                    },
                    recommendations: createDefaultPaginatedArray([{
                        id: "fallback-rec-1",
                        text: "Complete privacy compliance audit recommended due to analysis limitations",
                        priority: "High",
                        source: "privacy",
                        impact: "Comprehensive privacy review needed",
                        effort: "High",
                        effortHours: { min: 16, max: 40 },
                        implementationSteps: [
                            { stepNumber: 1, description: "Conduct manual privacy policy review" },
                            { stepNumber: 2, description: "Audit cookie and tracker usage" },
                            { stepNumber: 3, description: "Implement proper consent management" }
                        ]
                    }]),
                    issues: createDefaultPaginatedArray([{
                        id: "fallback-issue-1",
                        severity: "High",
                        category: "Analysis Limitation",
                        title: "Privacy Analysis Incomplete",
                        description: "Automated privacy analysis could not be completed",
                        impact: "Privacy compliance status uncertain",
                        recommendation: "Manual privacy audit recommended",
                        affected: ["privacy"],
                        source: "privacy"
                    }]),
                    gdprCompliance: null,
                    ccpaCompliance: null
                };

                if (verbose) {
                    console.log(`[PrivacyModule] Created fallback analysis with score: ${aiResponse.summary.score}`);
                }
            }
        }

        // CRITICAL FIX: Ensure all required object structures are present and valid
        if (aiResponse && typeof aiResponse === 'object') {
            // Validate summary structure
            if (!aiResponse.summary || typeof aiResponse.summary !== 'object' || Array.isArray(aiResponse.summary)) {
                aiResponse.summary = {
                    score: 10,
                    rating: getRatingLabelForScore(50, false),
                    topIssues: ["Privacy analysis completed with limited data"]
                };
                if (verbose) console.log("[PrivacyModule] Fixed corrupted summary structure");
            }

            // CRITICAL FIX: Override privacy policy detection with enhanced ground truth validation
            if (aiResponse.privacyPolicy && typeof aiResponse.privacyPolicy === 'object') {
                // If AI says privacy policy not found but our ground truth detection found it
                if (!aiResponse.privacyPolicy.found && privacyPolicyCtx.found) {
                    if (verbose) console.log("[PrivacyModule] CRITICAL FIX: AI incorrectly reported privacy policy as not found - overriding with ground truth");
                    aiResponse.privacyPolicy.found = true;
                    aiResponse.privacyPolicy.link = privacyPolicyCtx.link;
                    aiResponse.privacyPolicy.score = Math.max(aiResponse.privacyPolicy.score || 0, 60);
                    aiResponse.privacyPolicy.issues = (aiResponse.privacyPolicy.issues || []).filter(issue => {
                        const issueText = typeof issue === 'string' ? issue : (issue?.text || '');
                        return !issueText.toLowerCase().includes('privacy policy not found') &&
                            !issueText.toLowerCase().includes('missing privacy policy');
                    });

                    // Update key clauses to reflect that we found a privacy policy
                    if (!aiResponse.privacyPolicy.keyClausesPresent || aiResponse.privacyPolicy.keyClausesPresent.length === 0) {
                        aiResponse.privacyPolicy.keyClausesPresent = ["DataCollection", "DataUse", "ContactInformation"];
                    }
                }

                // CRITICAL FIX: Always use ground truth for privacy policy detection regardless of AI response
                // This prevents AI hallucination from overriding factual DOM analysis
                aiResponse.privacyPolicy.found = privacyPolicyCtx.found;
                if (privacyPolicyCtx.found) {
                    aiResponse.privacyPolicy.link = privacyPolicyCtx.link;
                    aiResponse.privacyPolicy.score = Math.max(aiResponse.privacyPolicy.score || 20, 75); // Ensure good score for found policy

                    // Remove any AI-generated "not found" issues
                    aiResponse.privacyPolicy.issues = (aiResponse.privacyPolicy.issues || []).filter(issue => {
                        const issueText = typeof issue === 'string' ? issue : (issue?.text || '');
                        return !issueText.toLowerCase().includes('privacy policy not found') &&
                            !issueText.toLowerCase().includes('missing privacy policy') &&
                            !issueText.toLowerCase().includes('privacy policy not accessible');
                    });
                } else {
                    // Policy genuinely not found - ensure score reflects this
                    aiResponse.privacyPolicy.score = Math.min(aiResponse.privacyPolicy.score || 20, 20);
                    // Ensure issues array exists before checking
                    aiResponse.privacyPolicy.issues = Array.isArray(aiResponse.privacyPolicy.issues) ? aiResponse.privacyPolicy.issues : [];
                    if (!aiResponse.privacyPolicy.issues.some(issue => {
                        const issueText = typeof issue === 'string' ? issue : (issue?.text || '');
                        return issueText.toLowerCase().includes('privacy policy not found');
                    })) {
                        aiResponse.privacyPolicy.issues.push("Privacy policy not found or not accessible");
                    }
                }
            }

            // CRITICAL FIX: Override consent banner detection with ground truth validation
            if (aiResponse.consent && typeof aiResponse.consent === 'object') {
                // If AI says consent banner not present but our ground truth detection found it
                if (!aiResponse.consent.bannerPresent && consentCtx.bannerDetected) {
                    if (verbose) console.log("[PrivacyModule] CRITICAL FIX: AI incorrectly reported consent banner as not present - overriding with ground truth");
                    aiResponse.consent.bannerPresent = true;
                    aiResponse.consent.score = Math.max(aiResponse.consent.score || 0, 60);
                    aiResponse.consent.consentMethod = "Banner";

                    // Update banner compliance scores to reflect detected banner
                    if (aiResponse.consent.bannerCompliance) {
                        aiResponse.consent.bannerCompliance.positioningScore = Math.max(aiResponse.consent.bannerCompliance.positioningScore || 0, 70);
                        aiResponse.consent.bannerCompliance.dismissibilityScore = Math.max(aiResponse.consent.bannerCompliance.dismissibilityScore || 0, 70);
                        aiResponse.consent.bannerCompliance.clarityOfChoicesScore = Math.max(aiResponse.consent.bannerCompliance.clarityOfChoicesScore || 0, 70);
                    }
                }
            }

            // CRITICAL FIX: Override consent management detection with ground truth validation
            if (aiResponse.consentManagement && typeof aiResponse.consentManagement === 'object') {
                // If AI says banner not detected but our ground truth detection found it
                if (!aiResponse.consentManagement.bannerDetected && consentCtx.bannerDetected) {
                    if (verbose) console.log("[PrivacyModule] CRITICAL FIX: AI incorrectly reported consent management banner as not detected - overriding with ground truth");
                    aiResponse.consentManagement.bannerDetected = true;
                    aiResponse.consentManagement.score = Math.max(aiResponse.consentManagement.score || 0, 60);
                    aiResponse.consentManagement.userExperienceScore = Math.max(aiResponse.consentManagement.userExperienceScore || 0, 50);
                }
            }

            // CRITICAL FIX: Recalculate summary score based on corrected data
            if (privacyPolicyCtx.found || consentCtx.bannerDetected) {
                const baseScore = 30; // Base score for having some privacy measures
                const privacyPolicyBonus = privacyPolicyCtx.found ? 25 : 0;
                const consentBannerBonus = consentCtx.bannerDetected ? 20 : 0;
                const correctedScore = Math.min(100, baseScore + privacyPolicyBonus + consentBannerBonus);

                if (aiResponse.summary.score < correctedScore) {
                    if (verbose) console.log(`[PrivacyModule] CRITICAL FIX: Correcting summary score from ${aiResponse.summary.score} to ${correctedScore} based on ground truth`);
                    aiResponse.summary.score = correctedScore;
                    aiResponse.summary.rating = getRatingLabelForScore(correctedScore, false);

                    // Update top issues to reflect corrected findings
                    aiResponse.summary.topIssues = (aiResponse.summary.topIssues || []).filter(issue => {
                        const issueText = typeof issue === 'string' ? issue : (issue?.text || '');
                        return !issueText.toLowerCase().includes('no privacy policy found') &&
                            !issueText.toLowerCase().includes('missing privacy policy') &&
                            !issueText.toLowerCase().includes('absence of consent management');
                    });

                    // Add appropriate issues based on what we actually found
                    if (privacyPolicyCtx.found && consentCtx.bannerDetected) {
                        if (aiResponse.summary.topIssues.length === 0) {
                            aiResponse.summary.topIssues.push("Privacy policy and consent management detected - further optimization opportunities available");
                        }
                    } else if (privacyPolicyCtx.found) {
                        aiResponse.summary.topIssues.unshift("Consent management system could be enhanced");
                    } else if (consentCtx.bannerDetected) {
                        aiResponse.summary.topIssues.unshift("Privacy policy documentation could be improved");
                    }
                }
            }

            // Validate privacyPolicy structure with enhanced detection results
            if (!aiResponse.privacyPolicy || typeof aiResponse.privacyPolicy !== 'object' || Array.isArray(aiResponse.privacyPolicy)) {
                aiResponse.privacyPolicy = {
                    found: privacyPolicyCtx.found || false,
                    score: privacyPolicyCtx.found ? 60 : 20,
                    link: privacyPolicyCtx.link || null,
                    clarityScore: 50,
                    comprehensivenessScore: 50,
                    accessibilityScore: 50,
                    lastUpdatedDate: privacyPolicyCtx.lastUpdatedText || null,
                    issues: [],
                    keyClausesPresent: []
                };
                if (verbose) console.log("[PrivacyModule] Fixed corrupted privacyPolicy structure");
            } else {
                // Ensure AI response reflects enhanced detection
                if (privacyPolicyCtx.found && !aiResponse.privacyPolicy.found) {
                    aiResponse.privacyPolicy.found = true;
                    aiResponse.privacyPolicy.link = privacyPolicyCtx.link;
                    aiResponse.privacyPolicy.score = Math.max(aiResponse.privacyPolicy.score || 20, 60);
                    if (verbose) {
                        console.log("[PrivacyModule] Overrode AI privacy policy detection with enhanced ground truth");
                    }
                }
            }

            // Validate dataLayer structure
            if (!aiResponse.dataLayer || typeof aiResponse.dataLayer !== 'object' || Array.isArray(aiResponse.dataLayer)) {
                aiResponse.dataLayer = {
                    found: false,
                    score: 0,
                    variables: [],
                    events: [],
                    issues: ["No data layer detected"]
                };
                if (verbose) console.log("[PrivacyModule] Fixed corrupted dataLayer structure");
            }

            // Validate consentManagement structure
            if (!aiResponse.consentManagement || typeof aiResponse.consentManagement !== 'object' || Array.isArray(aiResponse.consentManagement)) {
                aiResponse.consentManagement = {
                    score: consentCtx.bannerDetected ? 60 : 20,
                    bannerDetected: consentCtx.bannerDetected || false,
                    granularConsentAvailable: consentCtx.hasGranularOptions || false,
                    optOutMechanism: consentCtx.hasRejectAll || false,
                    consentRecord: false,
                    defaultConsentState: consentCtx.defaultStateUnclear ? "Unknown" : "Clear",
                    lastUpdated: null,
                    userExperienceScore: 50
                };
                if (verbose) console.log("[PrivacyModule] Fixed corrupted consentManagement structure");
            }

            // Validate dataSharingPractices structure
            if (!aiResponse.dataSharingPractices || typeof aiResponse.dataSharingPractices !== 'object' || Array.isArray(aiResponse.dataSharingPractices)) {
                aiResponse.dataSharingPractices = {
                    score: 0,
                    thirdPartySharingScore: 0,
                    anonymizationTechniquesScore: 0,
                    dataMinimizationScore: 0,
                    crossBorderTransfers: false,
                    dataRetentionPolicyClarityScore: 0
                };
                if (verbose) console.log("[PrivacyModule] Fixed corrupted dataSharingPractices structure — no data available");
            }

            // Validate GDPR compliance structure if feature is enabled
            if (featureSet.detailedComplianceReportingEnabled && tier !== "Basic") {
                if (!aiResponse.gdprCompliance || typeof aiResponse.gdprCompliance !== 'object' || Array.isArray(aiResponse.gdprCompliance)) {
                    aiResponse.gdprCompliance = {
                        score: 0,
                        lawfulnessOfProcessing: "Unclear",
                        dataMinimization: "Unclear",
                        storageLimitation: "Unclear",
                        integrityAndConfidentiality: "Unclear",
                        accountability: "Unclear",
                        dataSubjectRights: "Unclear",
                        crossBorderDataTransfers: "Unclear",
                        dataProtectionImpactAssessment: "Not Required",
                        issues: []
                    };
                    if (verbose) console.log("[PrivacyModule] Fixed corrupted gdprCompliance structure");
                }
            }

            // Validate CCPA compliance structure if feature is enabled
            if (featureSet.detailedComplianceReportingEnabled && tier !== "Basic") {
                if (!aiResponse.ccpaCompliance || typeof aiResponse.ccpaCompliance !== 'object' || Array.isArray(aiResponse.ccpaCompliance)) {
                    aiResponse.ccpaCompliance = {
                        score: 0,
                        transparency: "Unclear",
                        access: "Unclear",
                        deletion: "Unclear",
                        optOut: "Unclear",
                        nonDiscrimination: "Unclear",
                        dataSecurity: "Unclear",
                        issues: []
                    };
                    if (verbose) console.log("[PrivacyModule] Fixed corrupted ccpaCompliance structure");
                }
            }

            privacyModuleOutput = { ...privacyModuleOutput, ...aiResponse };

            // CRITICAL FIX: Remove ALL forbidden fields from summary that AI might add
            // Schema ONLY allows: score, rating, topIssues (additionalProperties: false)
            // AI hallucinations: overallScore, overallRating, riskLevel, complianceSummary, etc.
            if (privacyModuleOutput.summary) {
                const { score, rating, topIssues } = privacyModuleOutput.summary;
                privacyModuleOutput.summary = { score, rating, topIssues };
            }
        } else {
            throw new Error(`AI returned incomplete or invalid structured data for Privacy module. Response: ${JSON.stringify(aiResponse).substring(0, 300)}`);
        }

        // TIER COLLAPSE: All fields always populated (single world-class tier)

        // Conditional GDPR/CCPA based on featureSet (AI should also respect this via prompt)
        if (!featureSet.detailedComplianceReportingEnabled) {
            privacyModuleOutput.gdprCompliance = null;
            privacyModuleOutput.ccpaCompliance = null;
        } else { // Ensure objects exist if feature is enabled but AI missed them
            privacyModuleOutput.gdprCompliance = privacyModuleOutput.gdprCompliance || { score: 10, issues: [], recommendations: [] };
            privacyModuleOutput.ccpaCompliance = privacyModuleOutput.ccpaCompliance || { score: 10, issues: [], recommendations: [] };
        }

        // Ensure paginated structures are present and correctly typed
        privacyModuleOutput.cookies = createDefaultPaginatedArray(getNestedProperty(privacyModuleOutput, 'cookies.items', []));
        privacyModuleOutput.trackers = createDefaultPaginatedArray(getNestedProperty(privacyModuleOutput, 'trackers.items', []));

        // GOLD-STANDARD: Populate cookies from actual page cookies if AI returned empty
        if ((!privacyModuleOutput.cookies.items || privacyModuleOutput.cookies.items.length === 0) && cookieCtx.count > 0) {
            try {
                const rawCookies = await page.context().cookies(page.url());
                const cookieItems = rawCookies.slice(0, 20).map((c, i) => ({
                    id: `cookie-${i + 1}`,
                    name: c.name,
                    domain: c.domain,
                    purpose: classifyCookiePurpose(c.name),
                    category: classifyCookieCategory(c.name),
                    expires: c.expires === -1 ? "Session" : new Date(c.expires * 1000).toISOString(),
                    httpOnly: c.httpOnly,
                    secure: c.secure,
                    sameSite: c.sameSite || "None"
                }));
                privacyModuleOutput.cookies = createDefaultPaginatedArray(cookieItems);
                if (verbose) console.log(`[PrivacyModule] Populated ${cookieItems.length} cookies from page context`);
            } catch (e) {
                if (verbose) console.warn(`[PrivacyModule] Could not populate cookies from context: ${e.message}`);
            }
        }

        // GOLD-STANDARD: Populate trackers from detected third-party domains if AI returned empty
        if ((!privacyModuleOutput.trackers.items || privacyModuleOutput.trackers.items.length === 0) && trackerCtx.count > 0) {
            const trackerDomains = trackerCtx.domains.split(', ').filter(d => d && d !== "No common trackers identified by basic scan.");
            const trackerItems = trackerDomains.map((domain, i) => ({
                id: `tracker-${i + 1}`,
                name: domain.split('.').slice(-2).join('.'),
                domain: domain,
                purpose: classifyTrackerPurpose(domain),
                category: classifyTrackerCategory(domain),
                dataCollected: ["browsing behavior", "page views"]
            }));
            privacyModuleOutput.trackers = createDefaultPaginatedArray(trackerItems);
            if (verbose) console.log(`[PrivacyModule] Populated ${trackerItems.length} trackers from context`);
        }

        // GOLD-STANDARD: Populate gdprCompliance/ccpaCompliance with deterministic defaults
        if (!privacyModuleOutput.gdprCompliance && tier !== "Basic") {
            let gdprScore = 30;
            if (privacyPolicyCtx.found) gdprScore += 25;
            if (consentCtx.bannerDetected) gdprScore += 20;
            if (consentCtx.hasRejectAll) gdprScore += 10;
            if (consentCtx.hasGranularOptions) gdprScore += 10;
            privacyModuleOutput.gdprCompliance = {
                score: Math.min(gdprScore, 95),
                issues: !privacyPolicyCtx.found ? ["No privacy policy found"] : [],
                recommendations: !consentCtx.bannerDetected ? ["Implement cookie consent banner"] : []
            };
        }
        if (!privacyModuleOutput.ccpaCompliance && tier !== "Basic") {
            let ccpaScore = 35;
            if (privacyPolicyCtx.found) ccpaScore += 25;
            if (consentCtx.hasRejectAll) ccpaScore += 15;
            privacyModuleOutput.ccpaCompliance = {
                score: Math.min(ccpaScore, 95),
                issues: !privacyPolicyCtx.found ? ["Privacy policy not detected"] : [],
                recommendations: !consentCtx.hasRejectAll ? ["Add opt-out mechanism for data selling"] : []
            };
        }

        // CRITICAL FIX: Ensure consistency between consent.bannerPresent and consentManagement.bannerDetected
        // These fields should reflect the same detection result
        if (privacyModuleOutput.consent && privacyModuleOutput.consentManagement) {
            const detectedFromContext = consentCtx.bannerDetected;
            const aiDetectedConsent = privacyModuleOutput.consent.bannerPresent;
            const aiDetectedConsentMgmt = privacyModuleOutput.consentManagement.bannerDetected;

            // Use the most reliable detection result (prioritize context detection, then AI consensus)
            let finalBannerDetected = detectedFromContext;
            if (!detectedFromContext && (aiDetectedConsent || aiDetectedConsentMgmt)) {
                finalBannerDetected = aiDetectedConsent || aiDetectedConsentMgmt;
            }

            // Ensure both fields are consistent
            privacyModuleOutput.consent.bannerPresent = finalBannerDetected;
            privacyModuleOutput.consentManagement.bannerDetected = finalBannerDetected;

            if (verbose && (aiDetectedConsent !== aiDetectedConsentMgmt)) {
                console.log(`[PrivacyModule] Fixed consent banner detection inconsistency: consent.bannerPresent=${aiDetectedConsent}, consentManagement.bannerDetected=${aiDetectedConsentMgmt} -> both set to ${finalBannerDetected}`);
            }
            // SCHEMA FIX: Ensure consentRecord is boolean (not null)
            if (typeof privacyModuleOutput.consent.consentRecord !== 'boolean') {
                privacyModuleOutput.consent.consentRecord = !!privacyModuleOutput.consent.consentRecord;
            }
        }

        // ENHANCED: Fix consent management and granular consent detection
        if (privacyModuleOutput.consentManagement) {
            const consent = privacyModuleOutput.consentManagement;

            // CRITICAL FIX: Enhance granular consent detection from page context
            if (!consent.granularConsentAvailable && consentCtx.hasGranularOptions) {
                consent.granularConsentAvailable = true;
                if (verbose) console.log("[PrivacyModule] Enhanced granular consent detection from page context");
            }

            // ENHANCED: Improve opt-out mechanism validation
            const hasRealOptOut = consentCtx.hasRejectAll || consent.optOutMechanism;
            if (hasRealOptOut && (!consent.optOutMechanism || consent.optOutMechanism === false)) {
                consent.optOutMechanism = consentCtx.hasRejectAll ? "Reject Button" : "Basic";
                if (verbose) console.log("[PrivacyModule] Enhanced opt-out mechanism detection");
            }

            // ENHANCED: Realistic consent scoring with healthcare industry considerations
            let realisticConsentScore = 0;

            if (consent.bannerDetected) {
                realisticConsentScore += 20; // Basic presence

                // Healthcare industry bonus for consent management
                if (/health|medical|clinic|hospital|physician|dental/i.test(industryContext?.primaryIndustry || '')) {
                    realisticConsentScore += 5; // Healthcare compliance bonus
                }

                if (consent.granularConsentAvailable) {
                    realisticConsentScore += 30; // Enhanced weight for granular choices (Healthcare critical)
                }

                if (consent.optOutMechanism && consent.optOutMechanism !== "NONE" && consent.optOutMechanism !== false) {
                    realisticConsentScore += 25; // Enhanced weight for opt-out (compliance critical)
                }

                if (consent.consentRecord) {
                    realisticConsentScore += 15; // Records kept (HIPAA important)
                }

                if (consent.defaultConsentState && consent.defaultConsentState !== "NOT_SET" && consent.defaultConsentState !== "Unknown") {
                    realisticConsentScore += 10; // Clear default state
                }

                // Enhanced UX scoring for Healthcare context
                if (consent.userExperienceScore && consent.userExperienceScore > 70) {
                    realisticConsentScore += 10; // Good UX
                } else if (consent.userExperienceScore && consent.userExperienceScore > 50) {
                    realisticConsentScore += 5; // Moderate UX
                }
            } else {
                // No banner detected - severely penalized for Healthcare
                realisticConsentScore = /health|medical|clinic|hospital|physician|dental/i.test(industryContext?.primaryIndustry || '') ? 0 : 5;
            }

            // Healthcare industry compliance bonus/penalty adjustments
            if (/health|medical|clinic|hospital|physician|dental/i.test(industryContext?.primaryIndustry || '')) {
                // HIPAA compliance requires more stringent consent management
                if (!consent.granularConsentAvailable) {
                    realisticConsentScore = Math.max(0, realisticConsentScore - 15);
                }
                if (!consent.optOutMechanism || consent.optOutMechanism === false) {
                    realisticConsentScore = Math.max(0, realisticConsentScore - 10);
                }
            }

            // Cap the consent score at a realistic level with enhanced ceiling for comprehensive consent
            const maxScore = (consent.granularConsentAvailable && consent.optOutMechanism && consent.consentRecord) ? 95 : 85;
            consent.score = Math.min(realisticConsentScore, maxScore);

            if (verbose) {
                console.log(`[PrivacyModule] Enhanced consent score to ${consent.score} based on: bannerDetected=${consent.bannerDetected}, granular=${consent.granularConsentAvailable}, optOut=${consent.optOutMechanism}, industry=${industryContext?.primaryIndustry}`);
            }
        }

        // SCHEMA SANITIZATION: Fix known schema validation failures
        // Fix tracking.privacyPolicyLink — null fails string type validation, empty string fails URI format
        if (privacyModuleOutput.tracking) {
            if (!privacyModuleOutput.tracking.privacyPolicyLink || privacyModuleOutput.tracking.privacyPolicyLink === 'N/A') {
                // Schema requires string (URI format) — use detected link or remove field entirely
                const detectedLink = privacyPolicyCtx.link || null;
                if (detectedLink && /^https?:\/\//i.test(detectedLink)) {
                    privacyModuleOutput.tracking.privacyPolicyLink = detectedLink;
                } else {
                    delete privacyModuleOutput.tracking.privacyPolicyLink; // Remove rather than invalid value
                }
                if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: tracking.privacyPolicyLink = ${privacyModuleOutput.tracking.privacyPolicyLink || '(removed)'}`);
            }
        }
        // Fix privacyPolicy.lastUpdated — schema requires date format (e.g., "2024-01-15")
        if (privacyModuleOutput.privacyPolicy) {
            const lastUpdated = privacyModuleOutput.privacyPolicy.lastUpdated;
            if (lastUpdated === undefined || lastUpdated === null || lastUpdated === '' || typeof lastUpdated !== 'string') {
                // No valid date — remove the field entirely to avoid schema error
                delete privacyModuleOutput.privacyPolicy.lastUpdated;
                if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: Removed privacyPolicy.lastUpdated (was: ${JSON.stringify(lastUpdated)})`);
            } else if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
                // String but not in date format — try to parse it, otherwise remove
                const parsed = new Date(lastUpdated);
                if (!isNaN(parsed.getTime())) {
                    privacyModuleOutput.privacyPolicy.lastUpdated = parsed.toISOString().slice(0, 10);
                    if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: Parsed lastUpdated "${lastUpdated}" → "${privacyModuleOutput.privacyPolicy.lastUpdated}"`);
                } else {
                    delete privacyModuleOutput.privacyPolicy.lastUpdated;
                    if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: Removed unparseable lastUpdated: "${lastUpdated}"`);
                }
            }
        }
        // Fix consentManagement.lastUpdated — same issue
        if (privacyModuleOutput.consentManagement) {
            if (privacyModuleOutput.consentManagement.lastUpdated === null || privacyModuleOutput.consentManagement.lastUpdated === undefined) {
                privacyModuleOutput.consentManagement.lastUpdated = "Unknown";
                if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: Set consentManagement.lastUpdated to "Unknown"`);
            }
        }
        // Fix privacyPolicy.link — empty string fails URI format validation  
        if (privacyModuleOutput.privacyPolicy && (privacyModuleOutput.privacyPolicy.link === '' || privacyModuleOutput.privacyPolicy.link === 'N/A')) {
            const detectedLink = privacyPolicyCtx.link || null;
            if (detectedLink && /^https?:\/\//i.test(detectedLink)) {
                privacyModuleOutput.privacyPolicy.link = detectedLink;
            } else {
                delete privacyModuleOutput.privacyPolicy.link; // Remove rather than invalid value
            }
            if (verbose) console.log(`[PrivacyModule] SCHEMA FIX: privacyPolicy.link = ${privacyModuleOutput.privacyPolicy.link || '(removed)'}`);
        }

        if (onProgress) { onProgress('privacy', 'Finalizing recommendations & issues', 85); }

        // Enhanced recommendation handling with fallback generation
        let recommendationItems = getNestedProperty(privacyModuleOutput, 'recommendations.items', []);
        if (recommendationItems.length === 0 || recommendationItems.some(rec => !rec.text || rec.text.includes("Recommendation text missing"))) {
            if (verbose) console.log("[PrivacyModule] AI recommendations incomplete, generating fallback recommendations...");

            // Generate fallback recommendations based on analysis results
            const fallbackRecs = [];

            // Based on cookie analysis
            if (getNestedProperty(privacyModuleOutput, 'cookies.items.length', 0) > 5) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: "Implement granular cookie consent management to allow users to choose which cookies they accept, improving privacy compliance and user control.",
                    priority: "High",
                    source: "privacy",
                    impact: "Improved GDPR/CCPA compliance and user trust through better cookie management",
                    effort: "Moderate",
                    effortHours: { min: 8, max: 16 },
                    implementationSteps: [
                        { stepNumber: 1, description: "Audit all cookies currently used on the website" },
                        { stepNumber: 2, description: "Implement cookie consent banner with granular options" },
                        { stepNumber: 3, description: "Set up cookie categorization (essential, analytics, marketing)" },
                        { stepNumber: 4, description: "Test consent management across different user journeys" }
                    ]
                });
            }

            // Based on consent management
            if (!getNestedProperty(privacyModuleOutput, 'consent.bannerPresent', false)) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: "Implement a privacy-compliant consent banner that clearly informs users about data collection and provides meaningful choice.",
                    priority: "High",
                    source: "privacy",
                    impact: "Enhanced privacy compliance and reduced legal risk through proper consent mechanisms",
                    effort: "Moderate",
                    effortHours: { min: 6, max: 12 },
                    implementationSteps: [
                        { stepNumber: 1, description: "Design clear and understandable consent banner" },
                        { stepNumber: 2, description: "Implement accept/reject/manage preferences functionality" },
                        { stepNumber: 3, description: "Ensure banner doesn't impede site functionality" },
                        { stepNumber: 4, description: "Test compliance with local privacy regulations" }
                    ]
                });
            }

            // Enhanced privacy policy recommendations with HIPAA/Healthcare focus
            const privacyPolicyScore = getNestedProperty(privacyModuleOutput, 'privacyPolicy.score', 0);
            const privacyPolicyFound = getNestedProperty(privacyModuleOutput, 'privacyPolicy.found', false);
            const isHealthcareIndustry = /health|medical|clinic|hospital|physician|dental/i.test(industryContext?.primaryIndustry || '');

            if (!privacyPolicyFound) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: isHealthcareIndustry ?
                        "Create and publish a comprehensive HIPAA-compliant privacy policy that addresses protected health information (PHI) handling, patient rights, and healthcare-specific data practices." :
                        "Create and publish a comprehensive privacy policy that clearly explains data collection, usage, and user rights in compliance with applicable regulations.",
                    priority: "Critical",
                    source: "privacy",
                    impact: isHealthcareIndustry ?
                        "HIPAA compliance, reduced legal risk, enhanced patient trust through transparent PHI handling practices" :
                        "Legal compliance and transparency, building user trust through clear privacy practices",
                    effort: "High",
                    effortHours: { min: 16, max: 32 },
                    implementationSteps: isHealthcareIndustry ? [
                        { stepNumber: 1, description: "Conduct data mapping to identify all PHI collection and processing practices" },
                        { stepNumber: 2, description: "Draft HIPAA-compliant privacy policy with PHI handling procedures" },
                        { stepNumber: 3, description: "Include patient rights under HIPAA (access, amendment, restriction, breach notification)" },
                        { stepNumber: 4, description: "Review policy with healthcare compliance counsel" },
                        { stepNumber: 5, description: "Publish policy with clear accessibility and regular compliance reviews" }
                    ] : [
                        { stepNumber: 1, description: "Conduct data mapping to identify all data collection practices" },
                        { stepNumber: 2, description: "Draft comprehensive privacy policy covering all required elements" },
                        { stepNumber: 3, description: "Review policy with legal counsel for compliance" },
                        { stepNumber: 4, description: "Publish policy and ensure it's easily accessible" }
                    ]
                });
            } else if (privacyPolicyScore < 80 || (isHealthcareIndustry && privacyPolicyScore < 90)) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: isHealthcareIndustry ?
                        "Enhance privacy policy with specific HIPAA compliance details including PHI definitions, patient rights, data retention periods, and business associate relationships." :
                        "Improve privacy policy comprehensiveness and clarity to better address user rights, data retention, and third-party sharing practices.",
                    priority: "High",
                    source: "privacy",
                    impact: isHealthcareIndustry ?
                        "Enhanced HIPAA compliance, clearer patient rights communication, reduced regulatory risk" :
                        "Improved user trust and regulatory compliance through comprehensive privacy documentation",
                    effort: "Moderate",
                    effortHours: { min: 8, max: 16 },
                    implementationSteps: isHealthcareIndustry ? [
                        { stepNumber: 1, description: "Add specific HIPAA compliance section with PHI definitions and handling procedures" },
                        { stepNumber: 2, description: "Include detailed patient rights (access, amendment, restriction requests)" },
                        { stepNumber: 3, description: "Specify data retention periods for different types of health information" },
                        { stepNumber: 4, description: "Document business associate agreements and third-party PHI sharing" }
                    ] : [
                        { stepNumber: 1, description: "Add missing privacy policy clauses identified in analysis" },
                        { stepNumber: 2, description: "Clarify data retention periods and deletion procedures" },
                        { stepNumber: 3, description: "Improve language clarity and accessibility" },
                        { stepNumber: 4, description: "Add contact information for privacy inquiries" }
                    ]
                });
            }

            // Use fallback recommendations if original ones are inadequate
            if (fallbackRecs.length > 0) {
                recommendationItems = fallbackRecs;
            }
        }

        // Normalize all recommendations to ensure proper format
        // CRITICAL FIX: Ensure recommendationItems is an array before mapping
        const safeRecommendationItems = Array.isArray(recommendationItems) ? recommendationItems : [];
        let normalizedRecs = safeRecommendationItems.map(rec => {
                if (typeof rec === 'string') {
                    return {
                        id: uuidv4(),
                        text: rec,
                        priority: "Medium",
                        source: "privacy",
                        impact: "Privacy improvement",
                        effort: "Moderate",
                        effortHours: { min: 4, max: 8 }
                    };
                } else if (rec && typeof rec === 'object') {
                    // Ensure critical fields are present
                    return {
                        id: rec.id || uuidv4(),
                        text: rec.text || "Privacy recommendation details pending",
                        priority: rec.priority || "Medium",
                        source: rec.source || "privacy",
                        impact: rec.impact || "Privacy improvement",
                        effort: rec.effort || "Moderate",
                        effortHours: rec.effortHours || { min: 2, max: 6 },
                        implementationSteps: rec.implementationSteps || [
                            { stepNumber: 1, description: "Analyze current privacy implementation" },
                            { stepNumber: 2, description: "Implement privacy improvements" },
                            { stepNumber: 3, description: "Test and validate changes" }
                        ]
                    };
                }
                return null;
            }).filter(Boolean);

        // ENHANCEMENT: Supplement with analysis-driven recs to reach at least 5
        if (normalizedRecs.length < 5) {
            const supplementalRecs = [];
            const trackerCount = getNestedProperty(privacyModuleOutput, 'trackers.items.length', 0);
            const cookieCount = getNestedProperty(privacyModuleOutput, 'cookies.items.length', 0);
            const hasBanner = getNestedProperty(privacyModuleOutput, 'consent.bannerPresent', false) || consentCtx.bannerDetected;
            const hasGranular = getNestedProperty(privacyModuleOutput, 'consentManagement.granularConsentAvailable', false);
            const hasOptOut = getNestedProperty(privacyModuleOutput, 'consentManagement.optOutMechanism', false);

            if (trackerCount > 3) {
                supplementalRecs.push({
                    text: `Reduce third-party tracker exposure — ${trackerCount} trackers detected. Audit each tracker's necessity, remove unused ones, and implement server-side tracking where possible to minimize user data exposure.`,
                    priority: 'High', source: 'privacy',
                    impact: 'Fewer trackers reduces data leakage and improves page performance',
                    effort: 'Moderate', effortHours: { min: 4, max: 10 }
                });
            }

            if (cookieCount > 5) {
                supplementalRecs.push({
                    text: `Optimize cookie usage — ${cookieCount} cookies detected. Categorize all cookies by purpose, remove unnecessary ones, and set appropriate expiration times to minimize data storage.`,
                    priority: 'Medium', source: 'privacy',
                    impact: 'Streamlined cookies improve compliance posture and page load speed',
                    effort: 'Low', effortHours: { min: 2, max: 6 }
                });
            }

            if (hasBanner && !hasGranular) {
                supplementalRecs.push({
                    text: 'Upgrade consent banner to offer granular cookie category controls — let users opt in/out of analytics, marketing, and functional cookies independently.',
                    priority: 'High', source: 'privacy',
                    impact: 'Granular consent is required by GDPR and improves user trust',
                    effort: 'Moderate', effortHours: { min: 6, max: 14 }
                });
            }

            if (!hasOptOut || hasOptOut === false || hasOptOut === 'NONE') {
                supplementalRecs.push({
                    text: 'Implement a clear opt-out mechanism for data collection — provide a visible "Reject All" button on the consent banner and a dedicated privacy preferences page.',
                    priority: 'High', source: 'privacy',
                    impact: 'Opt-out mechanisms are legally required in many jurisdictions and build user trust',
                    effort: 'Moderate', effortHours: { min: 4, max: 10 }
                });
            }

            const dataSharingScore = getNestedProperty(privacyModuleOutput, 'dataSharingPractices.score', 0);
            if (dataSharingScore < 50) {
                supplementalRecs.push({
                    text: 'Document and disclose all third-party data sharing relationships in the privacy policy, including data processors, advertising partners, and analytics providers.',
                    priority: 'Medium', source: 'privacy',
                    impact: 'Transparent data sharing practices reduce legal risk and build user confidence',
                    effort: 'Moderate', effortHours: { min: 4, max: 10 }
                });
            }

            supplementalRecs.push({
                text: 'Implement a data retention policy — define how long different types of user data are stored and establish automated deletion processes for expired data.',
                priority: 'Medium', source: 'privacy',
                impact: 'Clear data retention reduces storage costs and regulatory exposure',
                effort: 'Moderate', effortHours: { min: 6, max: 14 }
            });

            for (const rec of supplementalRecs) {
                if (normalizedRecs.length >= 5) break;
                const isDup = normalizedRecs.some(r =>
                    r.text && rec.text && r.text.toLowerCase() === rec.text.toLowerCase());
                if (!isDup) {
                    normalizedRecs.push({
                        id: uuidv4(),
                        ...rec,
                        implementationSteps: rec.implementationSteps || [
                            { stepNumber: 1, description: "Analyze current privacy practices" },
                            { stepNumber: 2, description: "Implement targeted improvements" },
                            { stepNumber: 3, description: "Validate compliance with regulations" }
                        ]
                    });
                }
            }
        }

        privacyModuleOutput.recommendations = createDefaultPaginatedArray(normalizedRecs);


        privacyModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(getNestedProperty(privacyModuleOutput, 'issues.items', [])));

        // GOLD-STANDARD: Inject regulatory context evidence
        if (regulatoryEvidence) {
            privacyModuleOutput.regulatoryContext = regulatoryEvidence;
            // Use detected regulations if not manually specified
            if (regulatoryEvidence.applicable.length > 0) {
                if (regulatoryEvidence.applicable.includes('GDPR') && !privacyModuleOutput.gdprCompliance) {
                    privacyModuleOutput.gdprCompliance = { score: regulatoryEvidence.score, detected: true, gaps: regulatoryEvidence.gaps.filter(g => g.regulation === 'GDPR') };
                }
                if ((regulatoryEvidence.applicable.includes('CCPA/CPRA') || regulatoryEvidence.applicable.includes('CCPA')) && !privacyModuleOutput.ccpaCompliance) {
                    privacyModuleOutput.ccpaCompliance = { score: regulatoryEvidence.score, detected: true, gaps: regulatoryEvidence.gaps.filter(g => g.regulation === 'CCPA' || g.regulation === 'CCPA/CPRA') };
                }
            }
        }

        if (onProgress) { onProgress('privacy', 'Calculating final scores', 95); }
        privacyModuleOutput.summary.score = calculateModuleSummaryScore('privacy', privacyModuleOutput, { industryContext });
        privacyModuleOutput._skipped = false;
        privacyModuleOutput.summary.rating = getRatingLabelForScore(privacyModuleOutput.summary.score, false);

        const sortedIssues = (privacyModuleOutput.issues.items || [])
            .sort((a, b) => {
                const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                return (severities[a.severity] || 5) - (severities[b.severity] || 5);
            });

        // Enhanced topIssues logic that considers both issues and recommendations
        if (sortedIssues.length > 0) {
            privacyModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue => issue.text || "Issue description missing");
        } else if (privacyModuleOutput.summary.score < 70) {
            // If no specific issues but low score, generate insights from module analysis
            const potentialIssues = [];

            if (!getNestedProperty(privacyModuleOutput, 'consent.bannerPresent', false)) {
                potentialIssues.push("No consent banner detected - may impact privacy compliance");
            }

            if (!getNestedProperty(privacyModuleOutput, 'privacyPolicy.found', false)) {
                potentialIssues.push("Privacy policy not found or not easily accessible");
            }

            if (getNestedProperty(privacyModuleOutput, 'cookies.items.length', 0) > 10) {
                potentialIssues.push("Large number of cookies detected - consider optimization and consent management");
            }

            if (getNestedProperty(privacyModuleOutput, 'trackers.items.length', 0) > 5) {
                potentialIssues.push("Multiple third-party trackers detected - review data sharing practices");
            }

            if (potentialIssues.length === 0) {
                potentialIssues.push("Privacy analysis completed - detailed review may reveal improvement opportunities");
            }

            privacyModuleOutput.summary.topIssues = potentialIssues.slice(0, 5);
        } else {
            console.warn(`[PrivacyModule] AI response invalid/null. Applying fallback scoring based on preliminary data.`);

            // Calculate fallback score
            let calculatedScore = 50; // Start neutral

            // Penalize for missing policy
            if (!privacyPolicyCtx.found) {
                calculatedScore -= 40;
                privacyModuleOutput.summary.topIssues.push("Privacy Policy not detected (critical)");
            }

            // Penalize for missing consent banner
            if (!consentCtx.bannerDetected) {
                calculatedScore -= 30;
                privacyModuleOutput.summary.topIssues.push("Consent banner not detected (critical)");
            }

            // Penalize for high tracking
            if (trackerCtx.count > 5) {
                calculatedScore -= 10;
                privacyModuleOutput.summary.topIssues.push(`High number of trackers detected (${trackerCtx.count})`);
            }

            // Ensure score range
            calculatedScore = Math.max(0, Math.min(100, calculatedScore));

            privacyModuleOutput.summary.score = calculatedScore;
            privacyModuleOutput.summary.rating = getRatingLabelForScore(calculatedScore, false);

            if (privacyModuleOutput.summary.topIssues.length === 0) {
                privacyModuleOutput.summary.topIssues.push("AI Analysis failed but basic checks passed.");
            }
        }

        // GOLD-STANDARD: Generate strengths from privacy analysis findings
        const privStrengths = [];
        if (getNestedProperty(privacyModuleOutput, 'privacyPolicy.found', false)) privStrengths.push('Privacy policy detected and accessible');
        if (getNestedProperty(privacyModuleOutput, 'consent.bannerPresent', false)) privStrengths.push('Cookie consent banner implemented');
        if (getNestedProperty(privacyModuleOutput, 'consent.granularControls', false)) privStrengths.push('Granular consent controls available');
        if (getNestedProperty(privacyModuleOutput, 'gdprCompliance.score', 0) >= 70) privStrengths.push('GDPR compliance measures in place');
        if (getNestedProperty(privacyModuleOutput, 'ccpaCompliance.score', 0) >= 70) privStrengths.push('CCPA compliance measures in place');
        const cookieCount = getNestedProperty(privacyModuleOutput, 'cookies.items.length', 0);
        if (cookieCount <= 5 && cookieCount >= 0) privStrengths.push('Minimal cookie usage for privacy protection');
        const trackerCount = getNestedProperty(privacyModuleOutput, 'trackers.items.length', 0);
        if (trackerCount <= 2) privStrengths.push('Low third-party tracker footprint');
        if (privStrengths.length === 0 && privacyModuleOutput.summary.score >= 40) privStrengths.push('Basic privacy practices observed');
        privacyModuleOutput.summary.strengths = privStrengths;

        // Now natively handled via crossViewport or schema

        if (verbose) { console.log(`[PrivacyModule] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${privacyModuleOutput.summary.score}`); }
        if (onProgress) { onProgress('privacy', 'Privacy analysis finalized', 100); }
        return privacyModuleOutput;

    } catch (error) {
        console.error(`[PrivacyModule] Critical error in Privacy analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('privacy', `Error: ${error.message}`, 100); }
        privacyModuleOutput.error = `Privacy analysis critically failed: ${error.message}`;
        privacyModuleOutput.summary = { score: null, rating: 'Failed', topIssues: [privacyModuleOutput.error.substring(0, 100)] };
        privacyModuleOutput._skipped = true;
        return privacyModuleOutput;
    }
}

// --- Helper Functions for Tier-Specific Privacy Scoring ---

function calculateProTierPrivacyScore(privacyContext, cookiesData, trackingData, tier) {
    // GOLD-STANDARD: Pure evidence-based scoring — no URL hash, no artificial variation
    let baseScore = 70; // Pro tier baseline

    // Privacy policy factor
    if (privacyContext.hasPrivacyPolicy) baseScore += 15;

    // Consent banner factor
    if (privacyContext.hasConsentBanner) baseScore += 12;

    // Cookies factor
    if (privacyContext.hasSecureCookies) baseScore += 8;
    if (privacyContext.cookieCount <= 5) baseScore += 5; // Minimal cookies

    // Tracking factor
    if (privacyContext.trackingScripts <= 3) baseScore += 6; // Minimal tracking

    return Math.max(1, Math.min(Math.round(baseScore), 100));
}

function calculateBasicTierPrivacyScore(privacyContext, cookiesData, trackingData, tier) {
    // GOLD-STANDARD: Pure evidence-based scoring — no URL hash, no artificial variation
    let baseScore = 55; // Basic tier baseline

    // Privacy policy factor
    if (privacyContext.hasPrivacyPolicy) baseScore += 18;

    // Consent banner factor
    if (privacyContext.hasConsentBanner) baseScore += 15;

    // Cookies factor
    if (privacyContext.hasSecureCookies) baseScore += 10;
    if (privacyContext.cookieCount <= 5) baseScore += 8; // Minimal cookies

    // Tracking factor
    if (privacyContext.trackingScripts <= 3) baseScore += 8; // Minimal tracking

    return Math.max(1, Math.min(Math.round(baseScore), 100));
}

// --- Cookie & Tracker Classification Helpers ---

function classifyCookiePurpose(name) {
    const n = name.toLowerCase();
    if (n.includes('ga') || n.includes('_gid') || n.includes('analytics')) return 'Analytics tracking';
    if (n.includes('fbp') || n.includes('fbq') || n.includes('fr')) return 'Advertising/Social media tracking';
    if (n.includes('session') || n.includes('sess') || n.includes('sid')) return 'Session management';
    if (n.includes('csrf') || n.includes('xsrf') || n.includes('token')) return 'Security/CSRF protection';
    if (n.includes('consent') || n.includes('gdpr') || n.includes('cookie')) return 'Consent management';
    if (n.includes('pref') || n.includes('lang') || n.includes('locale')) return 'User preferences';
    if (n.includes('auth') || n.includes('login') || n.includes('user')) return 'Authentication';
    return 'Functional';
}

function classifyCookieCategory(name) {
    const n = name.toLowerCase();
    if (n.includes('ga') || n.includes('_gid') || n.includes('analytics') || n.includes('_utm')) return 'Analytics';
    if (n.includes('fbp') || n.includes('fbq') || n.includes('ads') || n.includes('doubleclick')) return 'Marketing';
    if (n.includes('session') || n.includes('csrf') || n.includes('auth') || n.includes('token')) return 'Necessary';
    if (n.includes('consent') || n.includes('gdpr')) return 'Necessary';
    if (n.includes('pref') || n.includes('lang')) return 'Functional';
    return 'Functional';
}

function classifyTrackerPurpose(domain) {
    const d = domain.toLowerCase();
    if (d.includes('google-analytics') || d.includes('analytics')) return 'Website analytics and traffic measurement';
    if (d.includes('googletagmanager')) return 'Tag management and analytics orchestration';
    if (d.includes('doubleclick') || d.includes('adsrvr')) return 'Advertising and remarketing';
    if (d.includes('facebook') || d.includes('fbq')) return 'Social media tracking and advertising';
    if (d.includes('linkedin')) return 'Professional network advertising';
    if (d.includes('hotjar') || d.includes('crazyegg')) return 'User experience and heatmap analytics';
    if (d.includes('segment') || d.includes('mixpanel') || d.includes('amplitude')) return 'Product analytics and user behavior';
    if (d.includes('optimizely')) return 'A/B testing and experimentation';
    return 'Third-party tracking';
}

function classifyTrackerCategory(domain) {
    const d = domain.toLowerCase();
    if (d.includes('analytics') || d.includes('segment') || d.includes('mixpanel') || d.includes('amplitude')) return 'Analytics';
    if (d.includes('doubleclick') || d.includes('adsrvr') || d.includes('facebook') || d.includes('linkedin')) return 'Advertising';
    if (d.includes('hotjar') || d.includes('crazyegg')) return 'UX Analytics';
    if (d.includes('optimizely')) return 'Experimentation';
    if (d.includes('googletagmanager')) return 'Tag Management';
    return 'Third-party';
}

module.exports = { analyze };
