/**
 * Marketing Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance
 *
 * Analyzes website marketing effectiveness, including brand consistency, CTAs,
 * social media integration, value proposition, audience alignment, analytics,
 * and content marketing aspects, leveraging AI for comprehensive assessment.
 */
const { URL } = require('url');

const { v4: uuidv4 } = require('uuid'); // For IDs if needed

const { getModelConfig } = require('../utils/ai-credentials');
const { getStructuredData, getSchemaForModule } = require('../utils/structured-llm-output');
const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { buildEvidenceRegistry } = require('../utils/evidence-registry');
const { collectDomSignals } = require('../utils/data-collectors/dom-structure-collector');
const { getPrompt } = require('../utils/promptTemplates');
const { formatIssuesArray } = require('../utils/issue-formatter');
const { calculateModuleSummaryScore, getRatingLabelForScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { extractLeadCaptureSignals } = require('../utils/lead-capture');
const { extractRetargetingPixels } = require('../utils/retargeting-detection');
const { extractBrandSignals } = require('../utils/brand-signals');

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
 * Gathers context about analytics and tag management tools.
 */
async function getAnalyticsAndTagContext(page, verbose = false) {
    if (verbose) { console.log('[MarketingModule] Gathering analytics & tag manager context...'); }
    if (!page || page.isClosed()) { return { detectedAnalytics: [], detectedTagManagers: [], dataLayerType: "Unknown", dataLayerSample: null }; }
    try {
        return await page.evaluate(() => {
            const context = {
                detectedAnalytics: new Set(),
                detectedTagManagers: new Set(),
                dataLayerType: "Unknown",
                dataLayerSample: null,
                commonAnalyticsTools: [
                    { name: "Google Analytics UA", pattern: /google-analytics\.com\/analytics\.js|_gaq\.push|_gat\._getTracker/i },
                    { name: "Google Analytics 4", pattern: /googletagmanager\.com\/gtag\/js|gtag\(|GoogleAnalytics|_next\/static.*gtag/i },
                    { name: "Vercel Analytics", pattern: /_vercel\/insights|va\.ts|vercel\.com\/analytics|vercelAnalytics/i },
                    { name: "Vercel Speed Insights", pattern: /_vercel\/speed-insights|vercel\.com\/speed-insights|SpeedInsights/i },
                    { name: "Adobe Analytics", pattern: /assets\.adobedtm\.com|omtrdc\.net|s_code\.js|AppMeasurement\.js/i },
                    { name: "Mixpanel", pattern: /cdn\.mxpnl\.com\/libs\/mixpanel|mixpanel\.init/i },
                    { name: "Amplitude", pattern: /cdn\.amplitude\.com/i },
                    { name: "Hotjar", pattern: /static\.hotjar\.com/i },
                    { name: "Segment", pattern: /cdn\.segment\.com|analytics\.min\.js/i },
                    { name: "Plausible", pattern: /plausible\.io\/js/i },
                    { name: "Fathom", pattern: /cdn\.usefathom\.com|fathom\.trackPageview/i },
                    { name: "PostHog", pattern: /posthog\.com\/static|posthog\.init/i },
                    { name: "Microsoft Clarity", pattern: /clarity\.ms\/tag/i },
                ],
                commonTagManagers: [
                    { name: "Google Tag Manager", pattern: /googletagmanager\.com\/gtm\.js|window\.dataLayer/i },
                    { name: "Adobe Launch/DTM", pattern: /assets\.adobedtm\.com|_satellite\.track/i },
                    { name: "Tealium", pattern: /tags\.tiqcdn\.com|utag\.js/i },
                    { name: "Ensighten", pattern: /nexus\.ensighten\.com|Bootstrap\.js/i },
                ]
            };

            const scripts = Array.from(document.scripts).map(s => s.src || s.innerHTML);
            const allWindowProps = Object.keys(window);

            context.commonAnalyticsTools.forEach(tool => {
                if (scripts.some(s => tool.pattern.test(s)) || allWindowProps.some(p => tool.pattern.test(p))) {
                    context.detectedAnalytics.add(tool.name);
                }
            });
            context.commonTagManagers.forEach(tool => {
                if (scripts.some(s => tool.pattern.test(s)) || allWindowProps.some(p => tool.pattern.test(p))) {
                    context.detectedTagManagers.add(tool.name);
                }
            });

            if (window.dataLayer) {
                context.dataLayerType = "Google (window.dataLayer)";
                try { context.dataLayerSample = JSON.stringify(window.dataLayer.slice(0, 5)); } catch (e) { context.dataLayerSample = "Could not stringify dataLayer sample."; }
            } else if (window.digitalData) {
                context.dataLayerType = "Adobe (window.digitalData)";
                try { context.dataLayerSample = JSON.stringify(window.digitalData, Object.keys(window.digitalData).slice(0, 5)); } catch (e) { context.dataLayerSample = "Could not stringify digitalData sample."; }
            } else if (window.utag_data) {
                context.dataLayerType = "Tealium (window.utag_data)";
                try { context.dataLayerSample = JSON.stringify(window.utag_data, Object.keys(window.utag_data).slice(0, 5)); } catch (e) { context.dataLayerSample = "Could not stringify utag_data sample."; }
            }

            return {
                detectedAnalytics: Array.from(context.detectedAnalytics),
                detectedTagManagers: Array.from(context.detectedTagManagers),
                dataLayerType: context.dataLayerType,
                dataLayerSample: context.dataLayerSample ? context.dataLayerSample.substring(0, 500) : null
            };
        });
    } catch (error) {
        if (verbose) { console.error(`[MarketingModule] Error gathering analytics/tag context: ${error.message}`); }
        return { detectedAnalytics: [], detectedTagManagers: [], dataLayerType: "Error", dataLayerSample: null };
    }
}

/**
 * Gathers context about social media presence from the page.
 */
async function getSocialMediaContext(page, verbose = false) {
    if (verbose) { console.log('[MarketingModule] Gathering social media context...'); }
    if (!page || page.isClosed()) { return { linkedPlatforms: [], sharingButtonsDetected: false, ogTagsPresent: false, twitterCardPresent: false }; }
    try {
        const result = await page.evaluate(() => {
            const platforms = new Set();
            const sharingKeywords = ['facebook.com/sharer', 'twitter.com/intent/tweet', 'x.com/intent/', 'linkedin.com/shareArticle', 'pinterest.com/pin/create', 'mailto:'];
            let sharingButtonsDetected = false;
            const matchedUrls = []; // For debugging

            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href?.toLowerCase() || "";
                if (!href || href === '#' || href.startsWith('javascript:')) return;

                // Facebook — profile/page links (not share buttons)
                if ((href.includes('facebook.com/') || href.includes('fb.com/')) && !href.includes('sharer') && !href.includes('/dialog/')) {
                    platforms.add('Facebook'); matchedUrls.push('fb:' + href.substring(0, 60));
                }
                // Twitter/X — both old twitter.com and new x.com domains
                if ((href.includes('twitter.com/') || href.includes('x.com/')) && !href.includes('intent/tweet') && !href.includes('/intent/')) {
                    platforms.add('Twitter/X'); matchedUrls.push('tw:' + href.substring(0, 60));
                }
                // LinkedIn — company, personal, or showcase pages
                if (href.includes('linkedin.com/')) { platforms.add('LinkedIn'); matchedUrls.push('li:' + href.substring(0, 60)); }
                // Instagram
                if (href.includes('instagram.com/')) { platforms.add('Instagram'); matchedUrls.push('ig:' + href.substring(0, 60)); }
                // YouTube — channel, user, @handle, /c/ custom URL, or youtu.be
                if (href.includes('youtube.com/') || href.includes('youtu.be/')) {
                    platforms.add('YouTube'); matchedUrls.push('yt:' + href.substring(0, 60));
                }
                // Pinterest
                if (href.includes('pinterest.com/') && !href.includes('pin/create')) { platforms.add('Pinterest'); matchedUrls.push('pin:' + href.substring(0, 60)); }
                // TikTok
                if (href.includes('tiktok.com/')) { platforms.add('TikTok'); matchedUrls.push('tt:' + href.substring(0, 60)); }
                // Yelp (local business)
                if (href.includes('yelp.com/biz/')) { platforms.add('Yelp'); matchedUrls.push('yelp:' + href.substring(0, 60)); }
                // BBB (Better Business Bureau)
                if (href.includes('bbb.org/')) { platforms.add('BBB'); matchedUrls.push('bbb:' + href.substring(0, 60)); }
                // Nextdoor
                if (href.includes('nextdoor.com/')) { platforms.add('Nextdoor'); matchedUrls.push('nd:' + href.substring(0, 60)); }
                // Houzz (home services)
                if (href.includes('houzz.com/')) { platforms.add('Houzz'); matchedUrls.push('houzz:' + href.substring(0, 60)); }
                // Vimeo
                if (href.includes('vimeo.com/')) { platforms.add('Vimeo'); matchedUrls.push('vimeo:' + href.substring(0, 60)); }
                // RealSelf (medical aesthetics)
                if (href.includes('realself.com/')) { platforms.add('RealSelf'); matchedUrls.push('rs:' + href.substring(0, 60)); }
                // Google Business
                if (href.includes('google.com/maps') || href.includes('maps.google.com') || href.includes('g.page/')) {
                    platforms.add('Google Business'); matchedUrls.push('gmb:' + href.substring(0, 60));
                }

                if (!sharingButtonsDetected && sharingKeywords.some(keyword => href.includes(keyword))) {
                    sharingButtonsDetected = true;
                }
            });

            // Fallback: check icon classes and aria-labels for social links hidden behind icon fonts
            if (platforms.size === 0) {
                document.querySelectorAll('a[href], [role="link"]').forEach(el => {
                    const cls = (el.className || '').toLowerCase();
                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                    const title = (el.getAttribute('title') || '').toLowerCase();
                    const combined = cls + ' ' + ariaLabel + ' ' + title;
                    if (combined.includes('facebook') || combined.includes('fa-facebook')) platforms.add('Facebook');
                    if (combined.includes('twitter') || combined.includes('fa-twitter') || combined.includes('fa-x-twitter')) platforms.add('Twitter/X');
                    if (combined.includes('instagram') || combined.includes('fa-instagram')) platforms.add('Instagram');
                    if (combined.includes('linkedin') || combined.includes('fa-linkedin')) platforms.add('LinkedIn');
                    if (combined.includes('youtube') || combined.includes('fa-youtube')) platforms.add('YouTube');
                    if (combined.includes('tiktok') || combined.includes('fa-tiktok')) platforms.add('TikTok');
                    if (combined.includes('pinterest') || combined.includes('fa-pinterest')) platforms.add('Pinterest');
                    if (combined.includes('yelp') || combined.includes('fa-yelp')) platforms.add('Yelp');
                });
            }

            const ogTagsPresent = !!document.querySelector('meta[property^="og:"]');
            const twitterCardPresent = !!document.querySelector('meta[name^="twitter:"]');

            return {
                linkedPlatforms: Array.from(platforms).slice(0, 15),
                sharingButtonsDetected,
                ogTagsPresent,
                twitterCardPresent,
                _debug: matchedUrls.slice(0, 20) // For verbose logging
            };
        });
        if (verbose) {
            console.log(`[MarketingModule] Social media detection: ${result.linkedPlatforms.length} platforms found: ${result.linkedPlatforms.join(', ') || 'NONE'}`);
            if (result._debug?.length > 0) { console.log(`[MarketingModule] Matched URLs: ${result._debug.join(' | ')}`); }
            console.log(`[MarketingModule] OG tags: ${result.ogTagsPresent}, Twitter Card: ${result.twitterCardPresent}`);
        }
        delete result._debug; // Remove debug info from final context
        return result;
    } catch (error) {
        if (verbose) { console.error(`[MarketingModule] Error gathering social media context: ${error.message}`); }
        return { linkedPlatforms: [], sharingButtonsDetected: false, ogTagsPresent: false, twitterCardPresent: false, error: error.message.substring(0, 50) };
    }
}

/**
 * Gathers context about Call-to-Actions (CTAs) from the page.
 */
async function getCtaContext(page, verbose = false) {
    if (verbose) { console.log('[MarketingModule] Gathering CTA context...'); }
    if (!page || page.isClosed()) { return { ctaTexts: [], ctaCount: 0, primaryCtaText: null, aboveFoldCtaCount: 0 }; }
    try {
        return await page.evaluate(() => {
            const ctaSelectors = [
                'button', 'a.btn', 'a.button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
                '[class*="cta" i]', '[id*="cta" i]', '[class*="call-to-action" i]'
            ];
            const ctaElements = Array.from(document.querySelectorAll(ctaSelectors.join(',')));
            const ctaTexts = new Set();
            let primaryCtaText = null;
            let primaryCtaFound = false;
            let aboveFoldCtaCount = 0;
            const viewportHeight = window.innerHeight;

            ctaElements.forEach(el => {
                const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || "").trim();
                const rect = el.getBoundingClientRect();
                const isVisible = !!(rect.width || rect.height || el.getClientRects().length); // Basic visibility check

                if (text && text.length > 3 && text.length < 70 && isVisible) {
                    ctaTexts.add(text);
                    if (rect.top < viewportHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0) {
                        aboveFoldCtaCount++;
                        if (!primaryCtaFound && (el.matches('.primary-cta, [class*="primary-button"]') || text.match(/buy now|get started|sign up free|request a demo|learn more|contact us|shop now/i))) {
                            primaryCtaText = text;
                            primaryCtaFound = true;
                        }
                    }
                }
            });
            if (!primaryCtaFound && ctaTexts.size > 0) {
                primaryCtaText = Array.from(ctaTexts)[0]; // Fallback for primary CTA
            }
            return {
                ctaTexts: Array.from(ctaTexts).slice(0, 15),
                ctaCount: ctaElements.filter(el => el.getBoundingClientRect().width > 0).length, // Count visible CTAs
                primaryCtaText: primaryCtaText,
                aboveFoldCtaCount: aboveFoldCtaCount
            };
        });
    } catch (error) {
        if (verbose) { console.error(`[MarketingModule] Error gathering CTA context: ${error.message}`); }
        return { ctaTexts: [], ctaCount: 0, primaryCtaText: null, aboveFoldCtaCount: 0, error: error.message.substring(0, 50) };
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
        seoContentModuleData, // For content marketing synergy
        conversionModuleData, // For CTA effectiveness context
        costAggregator = null, // Add costAggregator parameter
        dependencies = {}, // Add dependencies for crossModuleContext
    } = options;

    const { globalState } = dependencies.crossModuleContext || {};

    const modelConfigOptions = { modelFamily, model, maxTokens, tier, analysisDepth };
    const startTimestamp = Date.now();

    if (verbose) { console.log(`[MarketingModule] Starting marketing analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth})`); }
    if (onProgress) { onProgress('marketing', 'Initializing marketing analysis', 0); }

    // Initialize main output structure adhering to $defs/marketingModule
    let marketingModuleOutput = {
        summary: { score: null, rating: 'Pending', topIssues: [] },
        _skipped: true,
        analytics: {
            analyticsTools: [],
            eventAccuracy: 0,
            goalCompletionRate: 0,
            tagManagerUsage: {
                platform: "None",
                tagsCount: 0,
                triggersCount: 0,
                variablesCount: 0,
                implementationScore: 0
            },
            dataQuality: {
                duplicateEvents: 0,
                missingParameters: 0,
                dataAccuracy: 0
            },
            conversionTracking: {
                setupCorrectness: 0,
                attributionModel: "Unknown"
            }
        },
        tracking: {
            pixelLoadTime: 0,
            pixelOptimization: {
                loadingStrategy: "Sync",
                compressionEnabled: false,
                cdnUsed: false,
                cacheHeadersSet: false
            },
            trackingAccuracy: 0,
            privacyCompliance: {
                ipAnonymization: false,
                dntRespected: false,
                consentManagementIntegration: false
            }
        },
        customerJourney: {},
        technologyStack: {},
        competitiveIntelligence: {},
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        // Enterprise fields
        industryBenchmarks: null, roiProjections: null, businessImpact: null, realTimeDataFeed: null,
        industryBenchmarks: null, roiProjections: null, businessImpact: null, realTimeDataFeed: null,
        error: null,
        analyticsIntegration: { // Added for schema compliance and to prevent runtime errors
            toolsDetected: [],
            score: 0,
            eventTrackingScore: 0,
            goalTrackingScore: 0,
            dataAccuracyScore: 0,
            reportingCapabilitiesScore: 0
        }
    };

    try {
        if (!page || page.isClosed()) {
            if (verbose) console.warn("[MarketingModule] No Playwright page; falling back to CF sharedPageContext extraction.");
        }

        if (onProgress) { onProgress('marketing', 'Gathering page context', 10); }
        const analyticsTagCtx = await getAnalyticsAndTagContext(page, verbose);

        // Use pre-collected social media data from sharedPageContext (collected before parallel execution)
        // This prevents concurrent page.evaluate failures when 9 modules run in parallel
        let socialMediaCtx;
        if (sharedPageContext && sharedPageContext.socialMedia && sharedPageContext.socialMedia.linkedPlatforms && sharedPageContext.socialMedia.linkedPlatforms.length > 0) {
            socialMediaCtx = sharedPageContext.socialMedia;
            if (verbose) { console.log(`[MarketingModule] Using pre-collected social data: ${socialMediaCtx.linkedPlatforms.length} platforms (${socialMediaCtx.linkedPlatforms.join(', ')})`); }
        } else {
            // Fallback to live page.evaluate (used when running marketing module alone)
            socialMediaCtx = await getSocialMediaContext(page, verbose);
            if (verbose) { console.log(`[MarketingModule] Live page.evaluate social data: ${socialMediaCtx.linkedPlatforms.length} platforms`); }
        }
        const ctaCtx = await getCtaContext(page, verbose);
        const pageTitle = (page && !page.isClosed()) ? await page.title().catch(() => "Not specified") : (options.sharedPageContext?.title || "Not specified");
        const metaDescription = (page && !page.isClosed()) ? await page.locator('meta[name="description"]').getAttribute('content').catch(() => "Not specified") : (options.sharedPageContext?.metaDescription || "Not specified");
        const h1Text = (page && !page.isClosed()) ? await page.locator('h1').first().textContent().catch(() => "Not specified") : (options.sharedPageContext?.headings?.h1?.[0] || "Not specified");

        // ENHANCED: Deterministic HTML-based marketing extraction (works without Playwright)
        const rawHtml = sharedPageContext._rawHtml || '';
        if (rawHtml) {
            const { extractMarketingSignalsFromHtml } = require('../utils/cfHtmlExtractor');
            const htmlMktSignals = extractMarketingSignalsFromHtml(rawHtml, url, verbose);
            marketingModuleOutput._htmlMarketingSignals = htmlMktSignals;

            // Enrich analytics if page.evaluate returned nothing
            if (analyticsTagCtx.detectedAnalytics.length === 0 && htmlMktSignals.analytics.tools.length > 0) {
                analyticsTagCtx.detectedAnalytics = htmlMktSignals.analytics.tools;
                analyticsTagCtx.detectedTagManagers = htmlMktSignals.analytics.tagManagers;
                if (verbose) console.log(`[MarketingModule] HTML fallback enriched analytics: ${htmlMktSignals.analytics.tools.join(', ')}`);
            }

            // Enrich social media
            if (socialMediaCtx.linkedPlatforms.length === 0 && htmlMktSignals.social.platforms.length > 0) {
                socialMediaCtx.linkedPlatforms = htmlMktSignals.social.platforms;
                socialMediaCtx.sharingButtonsDetected = htmlMktSignals.social.sharingButtonsDetected;
                socialMediaCtx.ogTagsPresent = htmlMktSignals.social.ogTagsPresent;
                socialMediaCtx.twitterCardPresent = htmlMktSignals.social.twitterCardPresent;
                if (verbose) console.log(`[MarketingModule] HTML fallback enriched social: ${htmlMktSignals.social.platforms.join(', ')}`);
            }

            // Enrich CTA context
            if (ctaCtx.ctaCount === 0 && htmlMktSignals.cta.count > 0) {
                ctaCtx.ctaTexts = htmlMktSignals.cta.texts;
                ctaCtx.ctaCount = htmlMktSignals.cta.count;
                ctaCtx.primaryCtaText = htmlMktSignals.cta.primaryCta;
                if (verbose) console.log(`[MarketingModule] HTML fallback enriched CTAs: ${htmlMktSignals.cta.count} CTAs`);
            }
        }

        // BROWSER AUDIT ENRICHMENT: Detect analytics from real cookies and network requests
        const browserAudit = sharedPageContext?.browserAudit;
        if (browserAudit && analyticsTagCtx.detectedAnalytics.length === 0) {
            const detectedFromBrowser = [];
            const detectedTMFromBrowser = [];

            // Detect analytics from cookies
            if (Array.isArray(browserAudit.cookies)) {
                const cookieNames = browserAudit.cookies.map(c => c.name.toLowerCase());
                if (cookieNames.some(n => n.startsWith('_ga') || n === '_gid' || n === '_gat')) {
                    detectedFromBrowser.push('Google Analytics 4');
                }
                if (cookieNames.some(n => n.startsWith('_fbp') || n.startsWith('_fbc'))) {
                    detectedFromBrowser.push('Facebook Pixel');
                }
                if (cookieNames.some(n => n.includes('hubspot'))) {
                    detectedFromBrowser.push('HubSpot');
                }
            }

            // Detect analytics from third-party network requests
            if (browserAudit.networkRequests?.thirdPartyDomains) {
                const domains = browserAudit.networkRequests.thirdPartyDomains;
                if (domains.some(d => d.includes('google-analytics.com') || d.includes('googletagmanager.com'))) {
                    if (!detectedFromBrowser.includes('Google Analytics 4')) detectedFromBrowser.push('Google Analytics 4');
                    detectedTMFromBrowser.push('Google Tag Manager');
                }
                if (domains.some(d => d.includes('hotjar.com'))) detectedFromBrowser.push('Hotjar');
                if (domains.some(d => d.includes('segment.com') || d.includes('segment.io'))) detectedFromBrowser.push('Segment');
                if (domains.some(d => d.includes('mixpanel.com'))) detectedFromBrowser.push('Mixpanel');
                if (domains.some(d => d.includes('amplitude.com'))) detectedFromBrowser.push('Amplitude');
                if (domains.some(d => d.includes('facebook.net') || d.includes('connect.facebook.com'))) {
                    if (!detectedFromBrowser.includes('Facebook Pixel')) detectedFromBrowser.push('Facebook Pixel');
                }
                if (domains.some(d => d.includes('clarity.ms'))) detectedFromBrowser.push('Microsoft Clarity');
                if (domains.some(d => d.includes('hubspot.com'))) {
                    if (!detectedFromBrowser.includes('HubSpot')) detectedFromBrowser.push('HubSpot');
                }
            }

            if (detectedFromBrowser.length > 0) {
                analyticsTagCtx.detectedAnalytics = detectedFromBrowser;
                if (verbose) console.log(`[MarketingModule] 🔬 Browser audit enriched analytics: ${detectedFromBrowser.join(', ')}`);
            }
            if (detectedTMFromBrowser.length > 0) {
                analyticsTagCtx.detectedTagManagers = detectedTMFromBrowser;
                if (verbose) console.log(`[MarketingModule] 🔬 Browser audit enriched tag managers: ${detectedTMFromBrowser.join(', ')}`);
            }
        }

        // --- Deterministic DOM Signal Collection ---
        if (onProgress) { onProgress('marketing', 'Collecting deterministic DOM structure signals', 20); }
        const collectedSignals = await collectDomSignals(page, verbose);
        marketingModuleOutput._collectedSignals = collectedSignals;
        // ------------------------------------------------

        // BEST-IN-CLASS: Lead capture & email marketing evidence
        let leadCaptureEvidence = null;
        try {
            leadCaptureEvidence = await extractLeadCaptureSignals(page, verbose);
            if (verbose) {
                console.log(`[MarketingModule] Lead Capture Evidence: emailForms=${leadCaptureEvidence.emailForms?.length || 0}, ESPs=${leadCaptureEvidence.emailServiceProviders?.join(', ') || 'none'}, chat=${leadCaptureEvidence.chatWidgets?.join(', ') || 'none'}, overall=${leadCaptureEvidence.scores?.overall?.score || 0}`);
            }
        } catch (lcErr) {
            if (verbose) console.warn('[MarketingModule] Lead capture extraction failed:', lcErr.message);
        }

        // BEST-IN-CLASS: Retargeting & ad pixel evidence
        let retargetingEvidence = null;
        try {
            retargetingEvidence = await extractRetargetingPixels(page, verbose);
            if (verbose) {
                console.log(`[MarketingModule] Retargeting Evidence: pixels=${retargetingEvidence.pixels?.map(p => p.name).join(', ') || 'none'}, total=${retargetingEvidence.totalPixels || 0}, overall=${retargetingEvidence.scores?.overall?.score || 0}`);
            }
        } catch (rtErr) {
            if (verbose) console.warn('[MarketingModule] Retargeting detection failed:', rtErr.message);
        }

        // BEST-IN-CLASS: Brand consistency evidence
        let brandEvidence = null;
        try {
            brandEvidence = await extractBrandSignals(page, verbose);
            if (verbose) {
                console.log(`[MarketingModule] Brand Evidence: logo=${brandEvidence.logo?.detected ? brandEvidence.logo.type : 'none'}, fonts=${brandEvidence.typography?.fontCount || 0}, cssVars=${brandEvidence.colors?.cssVars?.length || 0}, overall=${brandEvidence.scores?.overall?.score || 0}`);
            }
        } catch (brErr) {
            if (verbose) console.warn('[MarketingModule] Brand signal extraction failed:', brErr.message);
        }

        if (onProgress) { onProgress('marketing', 'Preliminary data gathered', 30); }

        const promptVariables = {
            url,
            industryContext: industryContext || { primaryIndustry: "Unknown" },
            analysisDepth, tier, featureSet: JSON.stringify(featureSet),
            currentDate: new Date().toISOString().split('T')[0],

            // Context for AI to analyze
            pageTitle: pageTitle.substring(0, 200),
            metaDescription: metaDescription ? metaDescription.substring(0, 300) : "Not specified",
            h1Text: h1Text ? h1Text.substring(0, 200) : "Not specified",

            ctaCount: ctaCtx.ctaCount,
            primaryCtaText: ctaCtx.primaryCtaText || "None detected",
            aboveFoldCtaCount: ctaCtx.aboveFoldCtaCount,
            exampleCtaTexts: ctaCtx.ctaTexts.join('; ').substring(0, 500),

            socialPlatformsLinked: socialMediaCtx.linkedPlatforms.join(', ') || "None detected",
            sharingButtonsDetected: socialMediaCtx.sharingButtonsDetected,
            ogTagsPresent: socialMediaCtx.ogTagsPresent,
            twitterCardPresent: socialMediaCtx.twitterCardPresent,

            analyticsToolsDetected: analyticsTagCtx.detectedAnalytics.join(', ') || "None detected",
            tagManagersDetected: analyticsTagCtx.detectedTagManagers.join(', ') || "None detected",
            dataLayerType: analyticsTagCtx.dataLayerType,
            dataLayerSample: analyticsTagCtx.dataLayerSample || null,

            // Context from other modules
            seoContentSummary: getNestedProperty(seoContentModuleData, 'summary.topIssues', []).join('; ').substring(0, 500) || "No SEO data available",
            conversionFunnelHighlights: getNestedProperty(conversionModuleData, 'funnelAnalysis.dropOffPoints', []).map(p => p.location).join(', ').substring(0, 300) || "No conversion funnel data available",

            // BEST-IN-CLASS: Lead capture evidence
            leadCaptureSummary: leadCaptureEvidence
                ? `Email forms: ${leadCaptureEvidence.emailForms?.length || 0} (types: ${leadCaptureEvidence.emailForms?.map(f => f.type).join(', ') || 'none'}). ESPs: ${leadCaptureEvidence.emailServiceProviders?.join(', ') || 'none'}. Chat: ${leadCaptureEvidence.chatWidgets?.join(', ') || 'none'}. CRM: ${leadCaptureEvidence.crmTools?.join(', ') || 'none'}. Lead magnet: ${leadCaptureEvidence.leadMagnet?.detected ? 'yes' : 'no'}. Popups: ${leadCaptureEvidence.popups?.count || 0}, exit-intent: ${leadCaptureEvidence.popups?.hasExitIntent ? 'yes' : 'no'}. Overall: ${leadCaptureEvidence.scores?.overall?.score || 0}/100.`
                : 'N/A',

            // BEST-IN-CLASS: Retargeting pixel evidence
            retargetingSummary: retargetingEvidence
                ? `Pixels detected: ${retargetingEvidence.pixels?.map(p => p.name).join(', ') || 'none'} (${retargetingEvidence.totalPixels || 0} total). Categories: social=${retargetingEvidence.categories?.social || 0}, search=${retargetingEvidence.categories?.search || 0}, programmatic=${retargetingEvidence.categories?.programmatic || 0}. Conversion API: ${retargetingEvidence.hasConversionAPI ? 'yes' : 'no'}. Overall: ${retargetingEvidence.scores?.overall?.score || 0}/100.`
                : 'N/A',

            // BEST-IN-CLASS: Brand consistency evidence
            brandConsistencySummary: brandEvidence
                ? `Logo: ${brandEvidence.logo?.detected ? brandEvidence.logo.type + (brandEvidence.logo.alt ? ' (' + brandEvidence.logo.alt + ')' : '') : 'not detected'}. Fonts: ${brandEvidence.typography?.fontCount || 0} families (${brandEvidence.typography?.fontFamilies?.slice(0, 3).join(', ') || 'none'}). CSS color vars: ${brandEvidence.colors?.cssVars?.length || 0}. Favicon: ${brandEvidence.branding?.hasFavicon ? 'yes' : 'no'}. Theme color: ${brandEvidence.branding?.themeColor || 'none'}. Brand name (OG): ${brandEvidence.brandName?.fromOgSiteName || 'none'}. Overall: ${brandEvidence.scores?.overall?.score || 0}/100.`
                : 'N/A',

            // ENRICHMENT: Structured extractions from CF /json (team, services, contact)
            structuredDataSummary: (() => {
                const extractions = options.sharedPageContext?.structuredExtractions;
                if (!extractions || extractions.length === 0) return 'No structured data extracted from crawl.';
                const summary = [];
                const team = extractions.filter(e => e.type === 'team' || e.type === 'staff' || e.type === 'about');
                const services = extractions.filter(e => e.type === 'services' || e.type === 'products');
                const contact = extractions.filter(e => e.type === 'contact' || e.type === 'businessContact');
                if (team.length > 0) summary.push(`Team/staff: ${team.length} entries (E-E-A-T signal for expertise and authoritativeness)`);
                if (services.length > 0) summary.push(`Services/products: ${services.length} entries (content marketing opportunities)`);
                if (contact.length > 0) summary.push(`Contact info: ${contact.length} entries (local SEO signal, trust signal)`);
                return summary.length > 0 ? summary.join('. ') + '.' : 'Structured data extracted but no marketing-relevant types found.';
            })(),

            // MULTI-PAGE CONTEXT: Subpage content from Cloudflare crawler
            subpageContentSummary: options.sharedPageContext?.subpageContentSummary || "Not available"
        };

        if (verbose) { console.log("[MarketingModule] Prompt variables prepared (sample):", JSON.stringify(promptVariables).substring(0, 500) + "..."); }
        if (onProgress) { onProgress('marketing', 'Preparing AI analysis prompt', 35); }

        if (onProgress) { onProgress('marketing', `Calling AI (two-pass pipeline)`, 40); }

        // Set comprehensive analysis timeout (10 minutes for Pro tier)
        const analysisTimeout = analysisDepth === 'comprehensive' ? 600000 : 300000; // 10min vs 5min

        try {
            // Build evidence registry and pre-execute evidence block for prompt injection
            let evidenceBlock;
            if (rawHtml) {
                const registry = buildEvidenceRegistry(rawHtml, url, { verbose, sharedPageContext });
                evidenceBlock = registry.toEvidenceBlock({ categories: ['marketing', 'meta', 'content', 'conversion', 'platform'] });
                if (verbose) {
                    console.log(`[MarketingModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
                }
            }

            const aiResult = await Promise.race([
                twoPassAnalysis({
                    moduleName: 'marketing',
                    evidenceData: promptVariables,
                    industryContext,
                    pass1Template: 'marketing-evidence-extraction',
                    pass2Template: 'marketing-expert-judgment',
                    pass2Schema: await getSchemaForModule('marketingModule', false),
                    tier,
                    analysisDepth,
                    modelFamily: modelFamily,
                    model: model,
                    costAggregator,
                    verbose,
                    evidenceBlock,
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Marketing analysis timeout after ${analysisTimeout / 1000} seconds`)), analysisTimeout)
                )
            ]);

            // Validate AI response structure
            const aiResponse = aiResult.analysis || aiResult.data || aiResult; // Two-pass returns .analysis
            if (!aiResponse || typeof aiResponse !== 'object') {
                throw new Error('AI returned invalid response structure');
            }

            // CRITICAL FIX: Apply tier-specific scoring to prevent tier inversions
            // Pro tier should ALWAYS score higher than Basic tier for the same website
            if (aiResponse.summary && typeof aiResponse.summary.score === 'number') {
                const rawScore = aiResponse.summary.score;

                // TIER COLLAPSE: Always use Pro-tier scoring (highest quality)
                if (rawScore === 0 || rawScore === 1) {
                    const marketingContext = {
                        url: url,
                        hasBranding: true, // Assume branding present
                        hasLogo: true, // Assume logo present
                        ctaCount: ctaCtx.ctaCount || 0,
                        primaryCtas: ctaCtx.aboveFoldCtaCount || 0,
                        socialMediaLinks: socialMediaCtx.linkedPlatforms?.length || 0,
                        hasValueProp: true // Assume value proposition present
                    };
                    const realisticScore = calculateProTierMarketingScore(marketingContext, {}, ctaCtx, tier);
                    aiResponse.summary.score = realisticScore;
                    if (verbose) {
                        console.log(`[MarketingModule] TIER COLLAPSE: Corrected score from ${rawScore} to ${realisticScore}`);
                    }
                }
            }

            // Validate required marketing module fields - but provide defaults if missing
            const requiredFields = ['summary', 'brandConsistency', 'socialMediaPresence', 'contentMarketing'];
            const missingFields = requiredFields.filter(field => !aiResponse[field] || Array.isArray(aiResponse[field]));

            if (missingFields.length > 0) {
                if (verbose) {
                    console.warn(`[MarketingModule] AI response missing fields: ${missingFields.join(', ')}, providing defaults`);
                }

                // Provide default structures for missing fields instead of failing
                if (!aiResponse.summary || Array.isArray(aiResponse.summary)) {
                    aiResponse.summary = {
                        score: 10,
                        rating: "Failing",
                        topIssues: ["Marketing analysis incomplete - some fields missing"]
                    };
                }

                if (!aiResponse.brandConsistency || Array.isArray(aiResponse.brandConsistency)) {
                    aiResponse.brandConsistency = {
                        score: 0,
                        colorSchemeConsistency: 0,
                        typographyConsistency: 0,
                        imageryStyle: 0,
                        voiceAndTone: 0,
                        logoUsage: 0,
                        overallBrandScore: 0
                    };
                }

                if (!aiResponse.socialMediaPresence || Array.isArray(aiResponse.socialMediaPresence)) {
                    aiResponse.socialMediaPresence = {
                        score: 0,
                        platformsLinked: [],
                        sharingButtonsPresent: false,
                        socialProofElements: 0,
                        crossPlatformConsistency: 0,
                        engagementOptimization: 0
                    };
                }

                if (!aiResponse.contentMarketing || Array.isArray(aiResponse.contentMarketing)) {
                    aiResponse.contentMarketing = {
                        score: 0,
                        relevanceToStrategy: "Not assessed — insufficient data",
                        engagementScore: 0,
                        seoSynergyScore: 0,
                        formatVarietyScore: 0,
                        distributionEffectivenessScore: 0
                    };
                }
            }

            // Validate JSON serializability
            try {
                JSON.stringify(aiResponse);
            } catch (jsonError) {
                throw new Error(`AI response contains non-serializable data: ${jsonError.message}`);
            }

            // Sanitize AI response before merging

            // 1. Fix 'summary' if it's a string (common hallucination)
            if (aiResponse.summary && typeof aiResponse.summary === 'string') {
                if (verbose) { console.warn(`[MarketingModule] Fixed 'summary' type (string -> object)`); }
                aiResponse.summary = {
                    score: 10, // Broken AI response — not a real analysis
                    rating: "Failing",
                    topIssues: [],
                    text: aiResponse.summary // Preserve the text
                };
            }

            // 2. Scrub hallucinated keys (e.g., hundreds of "brandConsistency..." variations)
            const allowedKeys = [
                'summary', 'analytics', 'tracking', 'customerJourney', 'technologyStack',
                'competitiveIntelligence', 'recommendations', 'issues',
                'brandConsistency', 'socialMediaPresence', 'contentMarketing',
                'businessImpact', 'industryBenchmarks', 'roiProjections', 'deepDive', 'narrative'
            ];

            Object.keys(aiResponse).forEach(key => {
                if (!allowedKeys.includes(key)) {
                    // Check for clearly hallucinated patterns or just unknown keys
                    if (key.startsWith('brandConsistency') || key.startsWith('socialMedia') || key.startsWith('analytics')) {
                        if (verbose) { console.warn(`[MarketingModule] Scrubbed hallucinated key: ${key}`); }
                        delete aiResponse[key];
                    }
                }
            });

            // Success - merge AI results
            marketingModuleOutput = { ...marketingModuleOutput, ...aiResponse };

            // GOLD-STANDARD: Inject narrative and evidence from two-pass pipeline
            if (aiResult.narrative) {
                marketingModuleOutput.narrative = aiResult.narrative;
            }
            if (aiResult.agentMeta) {
                marketingModuleOutput._agentMeta = aiResult.agentMeta;
            }
            if (aiResult.evidence) {
                marketingModuleOutput.evidenceSummary = aiResult.evidence;
            }

            // ===================================================================
            // EVIDENCE-BASED VALIDATION: Cross-check AI output against scraped data
            // The AI frequently returns empty arrays with inflated scores.
            // Scores may be 0-10 (pre-normalizer, will be ×10'd) or 0-100 (post).
            // We use the scraper's ground-truth to override false AI claims.
            // ===================================================================

            // Helper: detect if a score is suspiciously high relative to the data
            const isInflatedScore = (score) => score >= 10 && (score === 10 || score === 100 || score >= 95);

            // 1. Social Media — fix BOTH keys independently
            for (const smKey of ['socialMediaPresence', 'socialMediaIntegration']) {
                const smField = marketingModuleOutput[smKey];
                if (!smField || typeof smField !== 'object') continue;

                // If scraper found platforms but AI returned empty, restore scraper data
                if (socialMediaCtx.linkedPlatforms.length > 0 && (!smField.platformsLinked || smField.platformsLinked.length === 0)) {
                    smField.platformsLinked = socialMediaCtx.linkedPlatforms;
                    if (verbose) { console.log(`[MarketingModule] EVIDENCE FIX: Restored ${socialMediaCtx.linkedPlatforms.length} social platforms to ${smKey}: ${socialMediaCtx.linkedPlatforms.join(', ')}`); }
                }

                // If high score but no real engagement data, it's inflated
                if (isInflatedScore(smField.score) && smField.socialProofElements === 0) {
                    // Compute evidence-based score: platforms exist but engagement/proof is minimal
                    const platformCount = smField.platformsLinked?.length || 0;
                    if (platformCount === 0) {
                        smField.score = 15;
                    } else {
                        // Has platforms but no social proof elements = moderate score
                        smField.score = Math.min(65, 25 + platformCount * 10);
                    }
                    if (verbose) { console.log(`[MarketingModule] EVIDENCE FIX: Corrected ${smKey}.score to ${smField.score} (platforms:${platformCount}, socialProof:0)`); }
                }

                // Override sharingButtonsPresent with scraper truth
                if (socialMediaCtx.sharingButtonsDetected) {
                    smField.sharingButtonsPresent = true;
                }
            }

            // 2. Value Proposition — detect default/fabricated patterns
            const vp = marketingModuleOutput.valueProposition;
            if (vp && typeof vp === 'object') {
                const subScoreKeys = ['clarity', 'uniqueness', 'relevance', 'credibility', 'urgency'];
                const subScores = subScoreKeys.map(k => vp[k]).filter(v => typeof v === 'number');
                // Detect "all same value" pattern (e.g., all 50 or all 5)
                const allSameValue = subScores.length > 0 && subScores.every(v => v === subScores[0]);
                const dataEmpty = (!vp.keyMessages || vp.keyMessages.length === 0) && (!vp.competitiveDifferentiators || vp.competitiveDifferentiators.length === 0);

                if (isInflatedScore(vp.score) && (allSameValue || dataEmpty)) {
                    // Use overallEffectiveness if available, else compute from sub-scores
                    const avgSubScore = subScores.length > 0 ? Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length) : 40;
                    // Ensure the normalizer won't re-inflate: use explicit 0-100 value
                    const honest = dataEmpty ? Math.min(avgSubScore, 45) : avgSubScore;
                    // If sub-scores are on 0-10 scale (e.g., all 5), also scale them up
                    if (avgSubScore <= 10) {
                        vp.score = honest * 10; // Pre-normalizer, so scale up
                    } else {
                        vp.score = honest;
                    }
                    if (verbose) { console.log(`[MarketingModule] EVIDENCE FIX: Corrected valueProposition.score to ${vp.score} (${allSameValue ? 'all-same defaults' : 'empty data'}, avgSub=${avgSubScore})`); }
                }
            }

            // CRITICAL FIX: Ensure required analytics and tracking objects are present per schema
            // The schema requires both 'analytics' and 'tracking' as top-level properties
            if (!marketingModuleOutput.analytics || typeof marketingModuleOutput.analytics !== 'object') {
                marketingModuleOutput.analytics = {
                    analyticsTools: analyticsTagCtx.detectedAnalytics || [],
                    eventAccuracy: Math.min(90, 60 + (analyticsTagCtx.detectedAnalytics?.length || 0) * 10),
                    goalCompletionRate: Math.min(85, 50 + (analyticsTagCtx.detectedAnalytics?.length || 0) * 15),
                    tagManagerUsage: {
                        platform: analyticsTagCtx.detectedTagManagers?.length > 0 ?
                            (analyticsTagCtx.detectedTagManagers[0].includes('Google') ? "GTM" :
                                analyticsTagCtx.detectedTagManagers[0].includes('Adobe') ? "Adobe Launch" :
                                    analyticsTagCtx.detectedTagManagers[0].includes('Tealium') ? "Tealium" : "Other") : "None",
                        tagsCount: analyticsTagCtx.detectedTagManagers?.length || 0,
                        triggersCount: 0, // Would need deeper analysis
                        variablesCount: 0, // Would need deeper analysis
                        implementationScore: analyticsTagCtx.detectedTagManagers?.length > 0 ? 75 : 20
                    },
                    dataQuality: {
                        duplicateEvents: 5, // Conservative estimate
                        missingParameters: 10, // Conservative estimate  
                        dataAccuracy: Math.min(85, 40 + (analyticsTagCtx.detectedAnalytics?.length || 0) * 20)
                    },
                    conversionTracking: {
                        setupCorrectness: Math.min(80, 30 + (analyticsTagCtx.detectedAnalytics?.length || 0) * 25),
                        attributionModel: "Last-click (inferred)"
                    }
                };
                if (verbose) { console.log("[MarketingModule] Added required analytics object for schema compliance"); }
            }

            if (!marketingModuleOutput.tracking || typeof marketingModuleOutput.tracking !== 'object') {
                marketingModuleOutput.tracking = {
                    pixelLoadTime: 150.0, // Reasonable default estimate (must be number)
                    pixelOptimization: {
                        loadingStrategy: "Async",
                        compressionEnabled: true,
                        cdnUsed: false, // Conservative
                        cacheHeadersSet: false // Conservative
                    },
                    trackingAccuracy: Math.min(85, 50 + (analyticsTagCtx.detectedAnalytics?.length || 0) * 15),
                    privacyCompliance: {
                        ipAnonymization: false, // Conservative - would need verification
                        dntRespected: false, // Conservative - would need verification
                        consentManagementIntegration: false // Conservative - would need verification
                    }
                };
                if (verbose) { console.log("[MarketingModule] Added required tracking object for schema compliance"); }
            }
            // SCHEMA FIX: Normalize loadingStrategy enum value — must be "Async", "Defer", or "Sync" (case-sensitive)
            if (marketingModuleOutput.tracking?.pixelOptimization?.loadingStrategy) {
                const ls = marketingModuleOutput.tracking.pixelOptimization.loadingStrategy.toLowerCase().trim();
                const validMap = { 'async': 'Async', 'defer': 'Defer', 'sync': 'Sync', 'lazy': 'Async', 'deferred': 'Defer', 'synchronous': 'Sync', 'asynchronous': 'Async' };
                marketingModuleOutput.tracking.pixelOptimization.loadingStrategy = validMap[ls] || 'Async';
                if (verbose && !['Async', 'Defer', 'Sync'].includes(marketingModuleOutput.tracking.pixelOptimization.loadingStrategy)) {
                    console.log(`[MarketingModule] SCHEMA FIX: Normalized loadingStrategy "${ls}" to "${marketingModuleOutput.tracking.pixelOptimization.loadingStrategy}"`);
                }
            }

            // Ensure analyticsIntegration has enhanced data from context
            // CRITICAL FIX: Ensure object exists before setting properties (AI response might have nulled it)
            if (!marketingModuleOutput.analyticsIntegration || typeof marketingModuleOutput.analyticsIntegration !== 'object') {
                marketingModuleOutput.analyticsIntegration = {
                    toolsDetected: [],
                    score: 0,
                    eventTrackingScore: 0,
                    goalTrackingScore: 0,
                    dataAccuracyScore: 0,
                    reportingCapabilitiesScore: 0
                };
            }
            if (analyticsTagCtx.detectedAnalytics && analyticsTagCtx.detectedAnalytics.length > 0) {
                marketingModuleOutput.analyticsIntegration.toolsDetected = analyticsTagCtx.detectedAnalytics;
                marketingModuleOutput.analyticsIntegration.score = Math.min(95, 60 + (analyticsTagCtx.detectedAnalytics.length * 10));
                marketingModuleOutput.analyticsIntegration.eventTrackingScore = Math.min(90, 50 + (analyticsTagCtx.detectedAnalytics.length * 15));
                marketingModuleOutput.analyticsIntegration.goalTrackingScore = Math.min(85, 40 + (analyticsTagCtx.detectedAnalytics.length * 20));
            }

            // Enhanced tag manager integration
            if (analyticsTagCtx.detectedTagManagers && analyticsTagCtx.detectedTagManagers.length > 0) {
                marketingModuleOutput.analyticsIntegration.dataAccuracyScore = Math.min(90, 50 + (analyticsTagCtx.detectedTagManagers.length * 15));
                marketingModuleOutput.analyticsIntegration.reportingCapabilitiesScore = Math.min(85, 45 + (analyticsTagCtx.detectedTagManagers.length * 18));
            }

            // TIER COLLAPSE: Always populate enhanced CTA analysis
            {
                if (!marketingModuleOutput.cta || typeof marketingModuleOutput.cta !== 'object') {
                    marketingModuleOutput.cta = {
                        ctaCount: ctaCtx.ctaCount || 0,
                        aboveFoldCtas: ctaCtx.aboveFoldCtaCount || 0,
                        ctaVariety: ctaCtx.ctaTexts?.length || 0,
                        designConsistency: 50,
                        persuasivenessScore: 50,
                        placementOptimization: 50,
                        abTestingSuggestions: []
                    };
                }

                // Enhance CTA scoring based on detected context
                if (ctaCtx.ctaCount > 0) {
                    marketingModuleOutput.cta.designConsistency = Math.min(95, 60 + (ctaCtx.aboveFoldCtaCount * 15));
                    marketingModuleOutput.cta.persuasivenessScore = Math.min(90, 40 + (ctaCtx.ctaTexts?.filter(text =>
                        text.toLowerCase().includes('free') ||
                        text.toLowerCase().includes('save') ||
                        text.toLowerCase().includes('get') ||
                        text.toLowerCase().includes('start') ||
                        text.toLowerCase().includes('learn')
                    ).length * 10));
                    marketingModuleOutput.cta.placementOptimization = ctaCtx.aboveFoldCtaCount > 0 ?
                        Math.min(95, 70 + (ctaCtx.aboveFoldCtaCount * 10)) : 30;

                    // Advanced A/B testing suggestions for Pro tier
                    marketingModuleOutput.cta.abTestingSuggestions = [
                        "Test button color variations (primary brand color vs. contrasting accent color)",
                        "Compare action-oriented text ('Get Started Free') vs. benefit-focused ('Save 50% Today')",
                        "Experiment with button size and padding for improved visibility",
                        "Test CTA placement: above-fold vs. after value proposition",
                        "A/B test urgency indicators ('Limited Time' vs. standard text)"
                    ].slice(0, Math.min(5, ctaCtx.ctaCount + 2));
                }
            }

            // Enhanced brand consistency analysis
            if (!marketingModuleOutput.brandConsistency || typeof marketingModuleOutput.brandConsistency !== 'object') {
                marketingModuleOutput.brandConsistency = {
                    colorSchemeConsistency: 50,
                    typographyConsistency: 50,
                    imageryStyle: 50,
                    voiceAndTone: 50,
                    logoUsage: 50,
                    overallBrandScore: 50
                };
            }

            // Enhanced value proposition analysis with AI-driven insights
            if (!marketingModuleOutput.valueProposition || typeof marketingModuleOutput.valueProposition !== 'object') {
                marketingModuleOutput.valueProposition = {
                    clarity: 50,
                    uniqueness: 50,
                    relevance: 50,
                    credibility: 50,
                    urgency: 50,
                    overallEffectiveness: 50,
                    keyMessages: [],
                    competitiveDifferentiators: []
                };
            }

            // Enhanced social media integration for digital presence analysis
            if (!marketingModuleOutput.socialMediaIntegration || typeof marketingModuleOutput.socialMediaIntegration !== 'object') {
                const platformCount = socialMediaCtx.linkedPlatforms?.length || 0;
                marketingModuleOutput.socialMediaIntegration = {
                    platformsLinked: socialMediaCtx.linkedPlatforms || [],
                    sharingButtonsPresent: socialMediaCtx.sharingButtonsDetected,
                    socialProofElements: 0,
                    crossPlatformConsistency: platformCount > 0 ? Math.min(95, 40 + (platformCount * 15)) : 0,
                    engagementOptimization: socialMediaCtx.sharingButtonsDetected ? Math.min(90, 60) : 0,
                    // Compute realistic score based on platform presence (not engagement proof)
                    score: platformCount > 0 ? Math.min(65, 25 + platformCount * 10) : 0
                };
            }

            // FINAL PASS: Ensure all social media keys have consistent scores relative to platforms
            for (const smKey of ['socialMediaPresence', 'socialMediaIntegration']) {
                const smField = marketingModuleOutput[smKey];
                if (!smField || typeof smField !== 'object') continue;
                const pCount = smField.platformsLinked?.length || 0;
                // Fix unreasonable scores: platforms exist but score is 0 or near-zero
                if (pCount > 0 && (smField.score === 0 || smField.score === undefined)) {
                    smField.score = Math.min(65, 25 + pCount * 10);
                    if (verbose) { console.log(`[MarketingModule] EVIDENCE FIX: Set ${smKey}.score to ${smField.score} (${pCount} platforms detected, was 0/undefined)`); }
                }
            }

        } catch (aiError) {
            console.error(`[MarketingModule] AI analysis failed: ${aiError.message}`);

            // CRITICAL FIX: Return structured failure result instead of throwing
            return {
                summary: {
                    score: 0,
                    rating: "Failing",
                    topIssues: [`Marketing analysis failed: ${aiError.message}`]
                },
                analytics: {
                    analyticsTools: [],
                    eventAccuracy: 0,
                    goalCompletionRate: 0,
                    tagManagerUsage: {
                        platform: "None",
                        tagsCount: 0,
                        triggersCount: 0,
                        variablesCount: 0,
                        implementationScore: 0
                    },
                    dataQuality: {
                        duplicateEvents: 0,
                        missingParameters: 0,
                        dataAccuracy: 0
                    },
                    conversionTracking: {
                        setupCorrectness: 0,
                        attributionModel: "Unknown"
                    }
                },
                tracking: {
                    pixelLoadTime: 0,
                    pixelOptimization: {
                        loadingStrategy: "Sync",
                        compressionEnabled: false,
                        cdnUsed: false,
                        cacheHeadersSet: false
                    },
                    trackingAccuracy: 0,
                    privacyCompliance: {
                        ipAnonymization: false,
                        dntRespected: false,
                        consentManagementIntegration: false
                    }
                },
                brandConsistency: null,
                socialMediaPresence: null,
                contentMarketing: null,
                leadGeneration: null,
                userEngagement: null,
                recommendations: {
                    items: [{
                        id: `marketing-error-${Date.now()}`,
                        text: `Marketing analysis could not be completed due to: ${aiError.message}. Please try again or contact support.`,
                        priority: "Critical",
                        source: "marketing",
                        impact: "High",
                        effort: "N/A",
                        implementationSteps: []
                    }],
                    totalAvailableItems: 1,
                    pagination: null
                },
                issues: {
                    items: [{
                        id: `marketing-failure-${Date.now()}`,
                        severity: "Critical",
                        category: "Analysis Error",
                        title: "Marketing Analysis Failed",
                        description: aiError.message,
                        impact: "Unable to provide marketing insights",
                        recommendation: "Retry analysis or contact support",
                        affected: ["marketing"],
                        source: "marketing"
                    }],
                    totalAvailableItems: 1,
                    pagination: null
                },
                customerJourney: null,
                technologyStack: null,
                competitiveIntelligence: null,
                industryBenchmarks: null,
                roiProjections: null,
                businessImpact: null,
                realTimeDataFeed: null,
                error: aiError.message
            };
        }

        // WORLD-CLASS GAP 3: Override AI hallucinated Brand Consistency score with deterministic evidence
        if (brandEvidence?.scores?.overall?.score && marketingModuleOutput.brandConsistency) {
            const deterministicBrandScore = brandEvidence.scores.overall.score;
            marketingModuleOutput.brandConsistency.score = deterministicBrandScore;
            marketingModuleOutput.brandConsistency.detailedEvidence = brandEvidence;
            if (verbose) console.log(`[MarketingModule] 🔒 Deterministic Brand Consistency score injected: ${deterministicBrandScore}/100`);
        }

        // WORLD-CLASS GAP 4: Override AI hallucinated Lead Capture score with deterministic evidence
        // Note: leadCapture checks chat widgets, generic forms, popups, and email lists. It maps best to emailMarketingIntegration or a combined lead capture metric.
        if (leadCaptureEvidence?.scores?.overall?.score) {
            const deterministicLeadScore = leadCaptureEvidence.scores.overall.score;
            // Initialize if not present so we can override it
            if (!marketingModuleOutput.emailMarketingIntegration) {
                marketingModuleOutput.emailMarketingIntegration = {};
            }
            marketingModuleOutput.emailMarketingIntegration.score = deterministicLeadScore;
            marketingModuleOutput.emailMarketingIntegration.detailedEvidence = leadCaptureEvidence;
            if (verbose) console.log(`[MarketingModule] 🔒 Deterministic Lead Capture score injected: ${deterministicLeadScore}/100`);
        }

        // TIER COLLAPSE: Always populate all features
        {
            marketingModuleOutput.contentMarketingEffectiveness = marketingModuleOutput.contentMarketingEffectiveness || { score: 10, relevanceToStrategy: "To be assessed", engagementScore: 10, seoSynergyScore: 10, formatVarietyScore: 10, distributionEffectivenessScore: 10 };
            marketingModuleOutput.emailMarketingIntegration = marketingModuleOutput.emailMarketingIntegration || { score: 10, signupFormsPresent: false, leadMagnetEffectiveness: "To be assessed", listGrowthPotential: "To be assessed", automationUsageScore: 10, segmentationEffectivenessScore: 10 };
            marketingModuleOutput.competitiveAnalysis = marketingModuleOutput.competitiveAnalysis || { score: 10, competitorsAnalyzed: 0, differentiationFactors: [], swotAnalysis: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, marketPositioningScore: 10 };
        }
        // TIER COLLAPSE: Always populate schema-required objects
        marketingModuleOutput.customerJourney = marketingModuleOutput.customerJourney || {};

        // CRITICAL FIX: Normalize customerJourney stats to numbers (schema validation)
        if (marketingModuleOutput.customerJourney) {
            // Fix heatmapsAnalysis
            if (marketingModuleOutput.customerJourney.heatmapsAnalysis) {
                const heatmaps = marketingModuleOutput.customerJourney.heatmapsAnalysis;
                if (heatmaps.userInteractionPatterns) {
                    const patterns = heatmaps.userInteractionPatterns;
                    // specific fix for hesitationTime
                    if (patterns.hesitationTime !== undefined) {
                        if (typeof patterns.hesitationTime === 'string') {
                            // If it's a date string or non-number, zero it out or parse int
                            patterns.hesitationTime = parseFloat(patterns.hesitationTime) || 0;
                        } else if (typeof patterns.hesitationTime !== 'number') {
                            patterns.hesitationTime = 0;
                        }
                    }
                }
            }

            // General walker to fix other potentially string-as-number fields in customerJourney
            const normalizeNumbers = (obj) => {
                for (const key in obj) {
                    if (obj[key] && typeof obj[key] === 'object') {
                        normalizeNumbers(obj[key]);
                    } else if (key.includes('Score') || key.includes('Rate') || key.includes('Count') || key.includes('Time')) {
                        if (typeof obj[key] === 'string') {
                            obj[key] = parseFloat(obj[key]) || 0;
                        }
                    }
                }
            };
            normalizeNumbers(marketingModuleOutput.customerJourney);
        }

        marketingModuleOutput.technologyStack = marketingModuleOutput.technologyStack || {};
        marketingModuleOutput.competitiveIntelligence = marketingModuleOutput.competitiveIntelligence || {};

        // Ensure nested objects have default scores if AI missed them
        const sectionsToScore = ['brandConsistency', 'ctaAnalysis', 'socialMediaIntegration', 'valueProposition', 'targetAudienceAlignment', 'analyticsIntegration', 'contentMarketingEffectiveness', 'emailMarketingIntegration', 'competitiveAnalysis'];
        sectionsToScore.forEach(sectionKey => {
            if (marketingModuleOutput[sectionKey] && typeof marketingModuleOutput[sectionKey].score !== 'number') {
                marketingModuleOutput[sectionKey].score = 10; // Default low score
            }
        });
        if (marketingModuleOutput.socialMediaIntegration && Array.isArray(marketingModuleOutput.socialMediaIntegration.platforms)) {
            marketingModuleOutput.socialMediaIntegration.platforms.forEach(p => {
                if (typeof p.score !== 'number') { p.score = 10; }
            });
        }


        if (onProgress) { onProgress('marketing', 'Finalizing recommendations & issues', 85); }
        marketingModuleOutput.recommendations = createDefaultPaginatedArray(
            (getNestedProperty(marketingModuleOutput, 'recommendations.items') || []).map(rec =>
                typeof rec === 'string' ? { id: uuidv4(), text: rec, priority: "Medium", source: "marketing", impact: "Marketing improvement", effort: "Moderate" } : rec
            )
        );
        marketingModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(getNestedProperty(marketingModuleOutput, 'issues.items', [])));

        if (onProgress) { onProgress('marketing', 'Calculating final scores', 95); }
        marketingModuleOutput.summary.score = calculateModuleSummaryScore('marketing', marketingModuleOutput, { tier });
        marketingModuleOutput._skipped = false;

        // WORLD-CLASS GAP 5: Blend deterministic Retargeting score into the final score
        // Retargeting doesn't have a 1:1 schema field but is critical for marketing infrastructure
        if (retargetingEvidence?.scores?.overall?.score) {
            const deterministicRetargetingScore = retargetingEvidence.scores.overall.score;
            // 85% base score, 15% retargeting evidence impact
            marketingModuleOutput.summary.score = Math.round(
                (marketingModuleOutput.summary.score * 0.85) + (deterministicRetargetingScore * 0.15)
            );
            // Append the detailed evidence to the summary for frontend use
            marketingModuleOutput.summary.retargetingEvidence = retargetingEvidence;
            if (verbose) console.log(`[MarketingModule] 🔒 Deterministic Retargeting blended into final score: ${deterministicRetargetingScore}/100 -> New Final: ${marketingModuleOutput.summary.score}`);
        }

        marketingModuleOutput.summary.rating = getRatingLabelForScore(marketingModuleOutput.summary.score, false);

        // =====================================================================
        // ROOT FIX: Filter issues.items against ground-truth evidence BEFORE
        // building topIssues. Removes AI hallucinations that contradict
        // extracted CTA, consent, and cross-module conversion evidence.
        // =====================================================================
        {
            const mktCtaCount = ctaCtx?.ctaCount || marketingModuleOutput.cta?.ctaCount || 0;
            const mktAboveFold = ctaCtx?.aboveFoldCtaCount || marketingModuleOutput.cta?.aboveFoldCtas || 0;
            // Cross-module: conversion module may have detected CTAs even if marketing's own scraper didn't
            const convCtaCount = conversionModuleData?.cta?.ctasDetected?.length || 0;
            const effectiveCtaCount = Math.max(mktCtaCount, convCtaCount);
            const effectiveAboveFold = Math.max(mktAboveFold, conversionModuleData?.cta?._evidenceFlags?.aboveFoldCtaCount || 0);

            const contradictedPatterns = [];

            // If CTAs exist (from either marketing scraper or conversion module), suppress "no CTA" claims
            if (effectiveCtaCount > 0) {
                contradictedPatterns.push(/no\s+(primary\s+)?cta/i);
                contradictedPatterns.push(/missing\s+(primary\s+)?cta/i);
                contradictedPatterns.push(/zero\s+(primary\s+)?cta/i);
                contradictedPatterns.push(/cta.*(not found|absent|missing|lacking)/i);
            }

            // If above-fold CTAs exist, suppress fold-related claims
            if (effectiveAboveFold > 0) {
                contradictedPatterns.push(/no\s+(cta|call).*(above|fold)/i);
                contradictedPatterns.push(/(above|fold).*(no|missing|absent|zero)\s*(cta|call)/i);
            }

            // "Missing Consent Management Platform" — this is an AI opinion, not a finding.
            // Many sites legitimately don't need a CMP (e.g., US-only sites without EU traffic).
            // Only flag if privacy module actually requires it. Suppress the generic claim.
            // Note: We don't suppress if the privacy module explicitly flagged it as an issue.

            if (contradictedPatterns.length > 0 && marketingModuleOutput.issues?.items) {
                const beforeCount = marketingModuleOutput.issues.items.length;
                marketingModuleOutput.issues.items = marketingModuleOutput.issues.items.filter(issue => {
                    const text = issue.text || issue.title || issue.description || '';
                    const isContradicted = contradictedPatterns.some(pattern => pattern.test(text));
                    if (isContradicted && verbose) {
                        console.log(`[MarketingModule] GROUND-TRUTH FILTER: Removed hallucinated issue: "${text.substring(0, 80)}..."`);
                    }
                    return !isContradicted;
                });
                if (verbose && beforeCount !== marketingModuleOutput.issues.items.length) {
                    console.log(`[MarketingModule] GROUND-TRUTH FILTER: Removed ${beforeCount - marketingModuleOutput.issues.items.length} contradicted issues`);
                }
            }
        }

        const sortedIssues = (marketingModuleOutput.issues.items || [])
            .sort((a, b) => {
                const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                return (severities[a.severity] || 5) - (severities[b.severity] || 5);
            });
        marketingModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue => issue.text || "Issue description missing");

        // ENHANCEMENT: Populate strengths from high-scoring sub-sections
        const strengths = [];
        if (marketingModuleOutput.analytics?.implementationScore >= 70) strengths.push('Strong analytics implementation with comprehensive tracking');
        if (marketingModuleOutput.seo?.score >= 70) strengths.push('Good SEO foundation with effective keyword targeting');
        if (marketingModuleOutput.socialMedia?.score >= 70) strengths.push('Effective social media integration and engagement signals');
        if (marketingModuleOutput.contentStrategy?.score >= 70) strengths.push('Well-structured content strategy with clear messaging');
        if (marketingModuleOutput.emailMarketing?.score >= 70) strengths.push('Email marketing infrastructure in place');
        if (marketingModuleOutput.branding?.score >= 70) strengths.push('Consistent branding and visual identity');
        if (marketingModuleOutput.competitivePositioning?.score >= 70) strengths.push('Clear competitive positioning and differentiation');
        if (strengths.length === 0 && marketingModuleOutput.summary.score >= 50) strengths.push('Marketing fundamentals are in place');
        marketingModuleOutput.summary.strengths = strengths;

        // Now natively handled via crossViewport or schema

        // Enhanced recommendation generation based on actual marketing analysis
        let enhancedRecommendations = [];

        // Use marketingModuleOutput instead of aiResult (which is out of scope)
        if (marketingModuleOutput && marketingModuleOutput.recommendations && Array.isArray(marketingModuleOutput.recommendations.items)) {
            enhancedRecommendations = marketingModuleOutput.recommendations.items.map(rec => {
                // Check if recommendation is too generic
                if (typeof rec === 'string') {
                    rec = { text: rec, priority: "Medium", source: "marketing" };
                }

                if (!rec.text ||
                    rec.text.includes('Review and improve based on analysis findings') ||
                    rec.text.includes('marketing analysis findings') ||
                    rec.text.length < 30 ||
                    /^(Review|Improve|Enhance|Update)\s+(marketing|analysis|findings).*$/i.test(rec.text)) {

                    // Generate specific recommendation based on marketing analysis data
                    let specificText = "Enhance marketing effectiveness through targeted improvements";

                    // Generate specific recommendations based on analysis results
                    if (marketingModuleOutput.ctaAnalysis && marketingModuleOutput.ctaAnalysis.score < 70) {
                        if (marketingModuleOutput.ctaAnalysis.score < 40) {
                            specificText = "Redesign call-to-action elements with clear, action-oriented language, prominent visual styling, and strategic placement above the fold to improve conversion rates.";
                        } else {
                            specificText = "Optimize call-to-action buttons by enhancing visual contrast, using more compelling action words, and testing different placements to increase click-through rates.";
                        }
                    } else if (marketingModuleOutput.brandConsistency && marketingModuleOutput.brandConsistency.score < 60) {
                        specificText = "Strengthen brand consistency across all marketing touchpoints by standardizing color schemes, typography, messaging tone, and visual elements to build stronger brand recognition.";
                    } else if (marketingModuleOutput.valueProposition && marketingModuleOutput.valueProposition.score < 60) {
                        specificText = "Clarify and strengthen the value proposition by highlighting unique benefits, addressing customer pain points more directly, and making key value statements more prominent on landing pages.";
                    } else if (marketingModuleOutput.socialMediaIntegration && marketingModuleOutput.socialMediaIntegration.score < 50) {
                        specificText = "Enhance social media integration by adding prominent social sharing buttons, displaying social proof through testimonials and reviews, and implementing social login options where appropriate.";
                    } else if (marketingModuleOutput.analyticsIntegration && marketingModuleOutput.analyticsIntegration.score < 60) {
                        specificText = "Improve marketing analytics by implementing comprehensive event tracking, setting up conversion goals, adding UTM parameters for campaign tracking, and ensuring proper tag management.";
                    } else {
                        // Generate recommendation based on overall marketing score
                        if (marketingModuleOutput.summary && marketingModuleOutput.summary.score < 40) {
                            specificText = "Implement comprehensive marketing optimization including CTA improvements, brand consistency enhancements, value proposition clarification, and analytics setup for better performance tracking.";
                        } else if (marketingModuleOutput.summary && marketingModuleOutput.summary.score < 70) {
                            specificText = "Enhance marketing effectiveness by focusing on conversion optimization, brand messaging consistency, and implementing A/B testing for key marketing elements.";
                        } else {
                            specificText = "Fine-tune marketing strategies by conducting regular performance analysis, testing new promotional approaches, and optimizing based on user behavior data.";
                        }
                    }

                    rec.text = specificText;
                }

                // CRITICAL FIX: Remove inappropriate elementIdentifiers for marketing-level recommendations
                const marketingLevelKeywords = [
                    'brand', 'marketing', 'analytics', 'tracking', 'campaign', 'audience', 'strategy',
                    'social media', 'value proposition', 'conversion', 'lead generation', 'email marketing',
                    'content marketing', 'competitive analysis', 'roi', 'attribution', 'segmentation'
                ];

                const isMarketingLevel = marketingLevelKeywords.some(keyword =>
                    rec.text?.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isMarketingLevel && rec.elementIdentifiers) {
                    delete rec.elementIdentifiers;
                    if (verbose) { console.log(`[MarketingModule] Removed inappropriate elementIdentifiers for marketing-level recommendation: ${rec.text?.substring(0, 50)}...`); }
                }

                // Ensure all required fields are present
                return {
                    id: rec.id || uuidv4(),
                    text: rec.text,
                    priority: rec.priority || "Medium",
                    source: rec.source || "marketing",
                    impact: rec.impact || "Marketing performance improvement",
                    effort: rec.effort || "Moderate",
                    effortHours: rec.effortHours || { min: 4, max: 12 },
                    implementationSteps: rec.implementationSteps || [
                        { stepNumber: 1, description: "Analyze current marketing performance and identify specific improvement areas" },
                        { stepNumber: 2, description: "Develop implementation plan with measurable goals and timelines" },
                        { stepNumber: 3, description: "Execute marketing improvements with proper testing and validation" },
                        { stepNumber: 4, description: "Monitor results and iterate based on performance data" }
                    ]
                };
            });
        }

        // Generate fallback recommendations if none exist or all are generic
        if (enhancedRecommendations.length === 0) {
            const fallbackRecs = [];

            // CTA-specific recommendations
            if (marketingModuleOutput.ctaAnalysis && marketingModuleOutput.ctaAnalysis.score < 80) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: "Optimize call-to-action elements by improving button design, using action-oriented language, and testing different placements to increase conversion rates.",
                    priority: "High",
                    source: "marketing",
                    impact: "Increased conversion rates and user engagement",
                    effort: "Low",
                    effortHours: { min: 2, max: 6 }
                });
            }

            // Brand consistency recommendations
            if (marketingModuleOutput.brandConsistency && marketingModuleOutput.brandConsistency.score < 80) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: "Strengthen brand consistency by standardizing visual elements, messaging tone, and design patterns across all marketing touchpoints.",
                    priority: "Medium",
                    source: "marketing",
                    impact: "Enhanced brand recognition and professional appearance",
                    effort: "Moderate",
                    effortHours: { min: 8, max: 16 }
                });
            }

            // Analytics recommendations
            if (marketingModuleOutput.analyticsIntegration && marketingModuleOutput.analyticsIntegration.score < 70) {
                fallbackRecs.push({
                    id: uuidv4(),
                    text: "Implement comprehensive marketing analytics including event tracking, conversion goals, and campaign attribution to enable data-driven marketing decisions.",
                    priority: "High",
                    source: "marketing",
                    impact: "Better marketing ROI through data-driven optimization",
                    effort: "Moderate",
                    effortHours: { min: 6, max: 12 }
                });
            }

            enhancedRecommendations = fallbackRecs;
        }

        // ENHANCEMENT: Always supplement with analysis-driven recs to reach at least 5
        if (enhancedRecommendations.length < 5) {
            const supplementalRecs = [];

            // Value proposition
            if (marketingModuleOutput.valueProposition && marketingModuleOutput.valueProposition.score < 70) {
                supplementalRecs.push({
                    text: 'Clarify the value proposition by highlighting unique benefits, addressing customer pain points directly, and making key differentiators immediately visible to visitors.',
                    priority: 'High', source: 'marketing',
                    impact: 'Clearer value messaging reduces bounce rates and improves conversion',
                    effort: 'Moderate', effortHours: { min: 4, max: 10 }
                });
            }

            // Social media
            if (marketingModuleOutput.socialMediaIntegration && marketingModuleOutput.socialMediaIntegration.score < 60) {
                supplementalRecs.push({
                    text: 'Strengthen social media integration by adding sharing buttons, displaying social proof elements, and linking to active social profiles to build credibility and extend reach.',
                    priority: 'Medium', source: 'marketing',
                    impact: 'Better social presence increases trust signals and drives referral traffic',
                    effort: 'Low', effortHours: { min: 2, max: 6 }
                });
            }

            // Content marketing
            if (marketingModuleOutput.contentMarketing && (marketingModuleOutput.contentMarketing.score || 0) < 60) {
                supplementalRecs.push({
                    text: 'Develop a content marketing strategy with regular blog posts, case studies, or educational resources to establish thought leadership and improve organic search visibility.',
                    priority: 'Medium', source: 'marketing',
                    impact: 'Consistent content marketing builds authority and drives sustainable organic traffic',
                    effort: 'High', effortHours: { min: 10, max: 20 }
                });
            }

            // Analytics/tracking
            if (marketingModuleOutput.tracking && marketingModuleOutput.tracking.trackingAccuracy < 70) {
                supplementalRecs.push({
                    text: 'Improve marketing tracking accuracy by auditing analytics implementation, reducing pixel load times, and ensuring all conversion events are captured correctly.',
                    priority: 'High', source: 'marketing',
                    impact: 'Accurate tracking data enables better marketing decisions and budget allocation',
                    effort: 'Moderate', effortHours: { min: 4, max: 10 }
                });
            }

            // Brand consistency sub-scores
            if (marketingModuleOutput.brandConsistency) {
                const bc = marketingModuleOutput.brandConsistency;
                if ((bc.typographyConsistency || 0) < 60) {
                    supplementalRecs.push({
                        text: 'Standardize typography usage across the website — limit font families to 2-3 and establish a clear type hierarchy for headings, body text, and UI elements.',
                        priority: 'Medium', source: 'marketing',
                        impact: 'Consistent typography improves readability and reinforces brand identity',
                        effort: 'Low', effortHours: { min: 2, max: 6 }
                    });
                }
                if ((bc.colorSchemeConsistency || 0) < 60) {
                    supplementalRecs.push({
                        text: 'Define and enforce a consistent color palette — create a design system with primary, secondary, and accent colors applied uniformly across all pages and components.',
                        priority: 'Medium', source: 'marketing',
                        impact: 'Consistent colors strengthen brand recognition and professional appearance',
                        effort: 'Low', effortHours: { min: 2, max: 6 }
                    });
                }
            }

            for (const rec of supplementalRecs) {
                if (enhancedRecommendations.length >= 5) break;
                const isDup = enhancedRecommendations.some(r =>
                    r.text && rec.text && r.text.toLowerCase() === rec.text.toLowerCase());
                if (!isDup) {
                    enhancedRecommendations.push({
                        id: uuidv4(),
                        ...rec,
                        implementationSteps: rec.implementationSteps || [
                            { stepNumber: 1, description: "Audit current marketing implementation" },
                            { stepNumber: 2, description: "Implement targeted improvements" },
                            { stepNumber: 3, description: "Monitor and measure results" },
                            { stepNumber: 4, description: "Iterate based on performance data" }
                        ]
                    });
                }
            }
        }

        // Assign the enhanced recommendations to the module output
        marketingModuleOutput.recommendations = createDefaultPaginatedArray(enhancedRecommendations);


        if (verbose) { console.log(`[MarketingModule] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${marketingModuleOutput.summary.score}`); }
        if (onProgress) { onProgress('marketing', 'Marketing analysis finalized', 100); }
        return marketingModuleOutput;

    } catch (error) {
        console.error(`[MarketingModule] Critical error in Marketing analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('marketing', `Error: ${error.message}`, 100); }
        marketingModuleOutput.error = `Marketing analysis critically failed: ${error.message}`;
        marketingModuleOutput.summary = { score: null, rating: 'Failed', topIssues: [marketingModuleOutput.error.substring(0, 100)] };
        marketingModuleOutput._skipped = true;
        return marketingModuleOutput;
    }
}

// --- Helper Functions for Tier-Specific Marketing Scoring ---

function calculateProTierMarketingScore(marketingContext, brandingData, ctaData, tier) {
    // GOLD-STANDARD: Pure evidence-based scoring — no URL hash, no artificial variation
    let baseScore = 65; // Pro tier baseline

    // Brand consistency factor
    if (marketingContext.hasBranding) baseScore += 12;
    if (marketingContext.hasLogo) baseScore += 8;

    // CTA effectiveness factor
    if (marketingContext.ctaCount > 0) baseScore += 10;
    if (marketingContext.primaryCtas > 0) baseScore += 6;

    // Social media integration factor
    if (marketingContext.socialMediaLinks > 0) baseScore += 8;
    if (marketingContext.socialMediaLinks >= 3) baseScore += 4;

    // Value proposition factor
    if (marketingContext.hasValueProp) baseScore += 7;

    return Math.max(1, Math.min(Math.round(baseScore), 100));
}

function calculateBasicTierMarketingScore(marketingContext, brandingData, ctaData, tier) {
    // GOLD-STANDARD: Pure evidence-based scoring — no URL hash, no artificial variation
    let baseScore = 50; // Basic tier baseline

    // Brand consistency factor
    if (marketingContext.hasBranding) baseScore += 15;
    if (marketingContext.hasLogo) baseScore += 10;

    // CTA effectiveness factor
    if (marketingContext.ctaCount > 0) baseScore += 12;
    if (marketingContext.primaryCtas > 0) baseScore += 8;

    // Social media integration factor
    if (marketingContext.socialMediaLinks > 0) baseScore += 10;
    if (marketingContext.socialMediaLinks >= 3) baseScore += 6;

    // Value proposition factor
    if (marketingContext.hasValueProp) baseScore += 9;

    return Math.max(1, Math.min(Math.round(baseScore), 100));
}

module.exports = { analyze };
