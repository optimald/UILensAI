/**
 * Cross-Browser and Device Compatibility Analysis Module for UILensAI
 * Refactored for Schema v3.11.0 Compliance.
 *
 * Analyzes website compatibility by identifying potential issues with CSS, JavaScript,
 * rendering across different browsers/devices, and responsive design.
 * Leverages AI for comprehensive assessment and structured output.
 */
// const { URL } = require('url'); // Not directly used here but good for URL ops if needed

const { v4: uuidv4 } = require('uuid'); // For IDs if needed

const { getModelConfig } = require('../utils/ai-credentials');
const { getStructuredData, getSchemaForModule } = require('../utils/structured-llm-output');
const { getPrompt } = require('../utils/promptTemplates');
const { formatIssuesArray } = require('../utils/issue-formatter');
const { calculateModuleSummaryScore, getRatingLabelForScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { buildEvidenceRegistry } = require('../utils/evidence-registry');
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
 * Extracts CSS features and potential issues from the page.
 */
async function getCssContext(page, verbose = false) {
    if (verbose) { console.log('[CompatibilityModule] Gathering CSS context...'); }
    if (!page || page.isClosed()) { return { modernFeaturesUsed: [], potentialIssues: ["Page not available for CSS analysis."] }; }
    try {
        return await page.evaluate(() => {
            const results = { modernFeaturesUsed: new Set(), potentialIssues: new Set() };
            const cssText = Array.from(document.styleSheets)
                .map(sheet => {
                    try { return Array.from(sheet.cssRules || []).map(rule => rule.cssText).join('\n'); }
                    catch (e) { return ""; }
                }).join('\n').toLowerCase(); // Convert to lowercase for easier matching

            if (cssText.includes('display: grid')) { results.modernFeaturesUsed.add('CSS Grid Layout'); }
            if (cssText.includes('display: flex')) { results.modernFeaturesUsed.add('CSS Flexbox'); }
            if (cssText.includes('var(--')) { results.modernFeaturesUsed.add('CSS Custom Properties (Variables)'); }
            if (cssText.includes('transform:')) { results.modernFeaturesUsed.add('CSS Transforms'); }
            if (cssText.includes('animation:') || cssText.includes('@keyframes')) { results.modernFeaturesUsed.add('CSS Animations/Transitions'); }
            if (cssText.includes('filter:')) { results.modernFeaturesUsed.add('CSS Filters'); }
            if (cssText.includes('aspect-ratio:')) { results.modernFeaturesUsed.add('CSS aspect-ratio Property'); }
            if (cssText.includes('position: sticky')) { results.modernFeaturesUsed.add('CSS position:sticky'); }
            if (cssText.includes('@container')) { results.modernFeaturesUsed.add('CSS Container Queries'); }
            if (cssText.includes('scroll-snap-type:')) { results.modernFeaturesUsed.add('CSS Scroll Snap'); }
            if (cssText.includes('clip-path:')) { results.modernFeaturesUsed.add('CSS clip-path'); }
            if (cssText.includes('mask-image:') || cssText.includes('-webkit-mask-image:')) { results.modernFeaturesUsed.add('CSS Masks'); }

            // Potential Issues
            if (cssText.match(/-webkit-(?!mask-image)[a-z-]+:/) && !cssText.match(/-moz-[a-z-]+:/) && !cssText.match(/-ms-[a-z-]+:/) && !cssText.match(/ (?!-webkit-)[a-z-]+:/)) {
                results.potentialIssues.add('Exclusive use of -webkit- prefixes without standard or other vendor prefixes.');
            }
            if ((cssText.match(/float\s*:\s*(left|right)/g) || []).length > 10) { // More than 10 floats
                results.potentialIssues.add('Significant use of float-based layouts, which can be complex for responsive design and modern layouts.');
            }
            if ((cssText.match(/position\s*:\s*absolute/g) || []).length > 20) { // More than 20 absolute positions
                results.potentialIssues.add('Extensive use of absolute positioning, potentially leading to layout issues in different contexts.');
            }
            if (cssText.includes('behavior: url(.htc);')) {
                results.potentialIssues.add('Use of HTC behaviors, specific to older IE versions and not standard.');
            }
            if (cssText.includes('expression(')) {
                results.potentialIssues.add('Use of CSS expressions, deprecated and IE-specific.');
            }

            return {
                modernFeaturesUsed: Array.from(results.modernFeaturesUsed).slice(0, 15), // Limit for prompt
                potentialIssues: Array.from(results.potentialIssues).slice(0, 10) // Limit for prompt
            };
        });
    } catch (error) {
        if (verbose) { console.error(`[CompatibilityModule] Error gathering CSS context: ${error.message}`); }
        return { modernFeaturesUsed: [], potentialIssues: [`Error analyzing CSS: ${error.message.substring(0, 50)}`] };
    }
}

/**
 * Extracts JavaScript features and potential issues.
 */
async function getJsContext(page, verbose = false) {
    if (verbose) { console.log('[CompatibilityModule] Gathering JavaScript context...'); }
    if (!page || page.isClosed()) { return { modernFeaturesUsed: [], potentialIssues: ["Page not available for JS analysis."] }; }
    try {
        return await page.evaluate(() => {
            const results = { modernFeaturesUsed: new Set(), potentialIssues: new Set() };
            let jsText = "";
            // Try to get inline and external script content (very simplified, won't fetch external)
            document.querySelectorAll('script').forEach(s => jsText += (s.textContent || s.src || ""));
            jsText = jsText.toLowerCase();

            if (jsText.includes('const ') || jsText.includes('let ')) { results.modernFeaturesUsed.add('ES6+ Variables (let/const)'); }
            if (jsText.includes('=>')) { results.modernFeaturesUsed.add('Arrow Functions'); }
            if (jsText.includes('promise.') || jsText.includes('.then(') || jsText.includes('.catch(') || jsText.includes('async function') || jsText.includes('await ')) { results.modernFeaturesUsed.add('Promises & Async/Await'); }
            if ((jsText.includes('import ') || jsText.includes('export ')) && document.querySelector('script[type="module"]')) { results.modernFeaturesUsed.add('ES Modules'); }
            if (jsText.includes('fetch(')) { results.modernFeaturesUsed.add('Fetch API'); }
            if (jsText.includes('customElements.define') || jsText.includes('shadowRoot')) { results.modernFeaturesUsed.add('Web Components (Custom Elements/Shadow DOM)'); }
            if (jsText.includes('navigator.serviceWorker')) { results.modernFeaturesUsed.add('Service Workers'); }
            if (jsText.includes('new IntersectionObserver')) { results.modernFeaturesUsed.add('Intersection Observer API'); }
            if (jsText.includes('new ResizeObserver')) { results.modernFeaturesUsed.add('Resize Observer API'); }
            if (jsText.includes('Proxy(')) { results.modernFeaturesUsed.add('Proxy Objects'); }
            if (jsText.includes('Symbol(')) { results.modernFeaturesUsed.add('Symbols'); }
            if (jsText.includes('...spread')) { results.modernFeaturesUsed.add('Spread Syntax'); } // Heuristic

            if (window.jQuery || window.$ || jsText.includes('jquery') || jsText.includes('$(document)')) { results.modernFeaturesUsed.add('jQuery (Potentially for legacy compatibility or specific plugins)'); }

            if (results.modernFeaturesUsed.size > 3 && !jsText.includes("babel") && !jsText.includes("polyfill")) { // Basic check
                results.potentialIssues.add('Multiple ES6+ features detected without clear signs of transpilation (Babel) or polyfills, which may cause issues in older browsers like IE11.');
            }
            if (jsText.includes('document.all')) { results.potentialIssues.add('Usage of "document.all", which is non-standard and IE-specific.'); }
            if (jsText.includes('navigator.userAgent.indexOf("MSIE")') || jsText.includes('navigator.appVersion.indexOf("MSIE")')) { results.potentialIssues.add('Browser sniffing for IE detected, which is error-prone; feature detection is preferred.'); }
            if (jsText.includes('attachEvent(')) { results.potentialIssues.add('Usage of "attachEvent", an older IE-specific event handling method.'); }


            return {
                modernFeaturesUsed: Array.from(results.modernFeaturesUsed).slice(0, 15),
                potentialIssues: Array.from(results.potentialIssues).slice(0, 10)
            };
        });
    } catch (error) {
        if (verbose) { console.error(`[CompatibilityModule] Error gathering JS context: ${error.message}`); }
        return { modernFeaturesUsed: [], potentialIssues: [`Error analyzing JS: ${error.message.substring(0, 50)}`] };
    }
}

/**
 * Gathers basic responsive design information.
 */
async function getResponsiveContext(page, verbose = false) {
    if (verbose) { console.log('[CompatibilityModule] Gathering responsive context...'); }
    if (!page || page.isClosed()) { return { hasViewportMeta: false, viewportMetaContent: null, mediaQueriesCount: 0, tailwindDetected: false, responsiveClassCount: 0, cssFramework: null, issues: ["Page not available"] }; }
    try {
        return await page.evaluate(() => {
            const results = {
                hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
                viewportMetaContent: document.querySelector('meta[name="viewport"]')?.content || null,
                mediaQueriesCount: 0,
                // ACCURACY FIX: Detect CSS framework utility-class responsive design
                tailwindDetected: false,
                responsiveClassCount: 0,
                cssFramework: null,
                flexboxUsed: false,
                gridUsed: false,
                issues: []
            };

            // 1. Count traditional @media rules from stylesheets
            const mediaQueries = new Set();
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    Array.from(sheet.cssRules || []).forEach(rule => {
                        if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText) { mediaQueries.add(rule.conditionText); }
                    });
                } catch (e) { /* cross-origin issues or invalid rules */ }
            });
            results.mediaQueriesCount = mediaQueries.size;

            // 2. ACCURACY FIX: Detect Tailwind/utility-class responsive patterns
            // Tailwind v4 compiles responsive utilities as atomic CSS — they don't appear
            // as @media rules in the CSSOM. Instead, scan DOM for breakpoint class prefixes.
            const tailwindBreakpointPrefixes = ['sm:', 'md:', 'lg:', 'xl:', '2xl:'];
            const bootstrapBreakpointClasses = ['col-sm-', 'col-md-', 'col-lg-', 'col-xl-', 'd-sm-', 'd-md-', 'd-lg-', 'd-xl-'];
            let tailwindClassCount = 0;
            let bootstrapClassCount = 0;

            // Sample up to 500 elements for performance
            const allElements = document.querySelectorAll('*');
            const sampleSize = Math.min(allElements.length, 500);
            for (let i = 0; i < sampleSize; i++) {
                const el = allElements[i];
                const classList = el.className;
                if (!classList || typeof classList !== 'string') continue;
                const classes = classList.split(/\s+/);
                for (const cls of classes) {
                    if (tailwindBreakpointPrefixes.some(prefix => cls.startsWith(prefix))) {
                        tailwindClassCount++;
                    }
                    if (bootstrapBreakpointClasses.some(prefix => cls.startsWith(prefix))) {
                        bootstrapClassCount++;
                    }
                    if (cls.includes('flex') || cls.includes('inline-flex')) results.flexboxUsed = true;
                    if (cls.includes('grid') && !cls.includes('col-')) results.gridUsed = true;
                }
            }

            if (tailwindClassCount > 0) {
                results.tailwindDetected = true;
                results.responsiveClassCount = tailwindClassCount;
                results.cssFramework = 'Tailwind CSS';
            } else if (bootstrapClassCount > 0) {
                results.responsiveClassCount = bootstrapClassCount;
                results.cssFramework = 'Bootstrap';
            }

            // 3. Also detect Tailwind via stylesheet link or import
            if (!results.tailwindDetected) {
                const links = document.querySelectorAll('link[rel="stylesheet"]');
                for (const link of links) {
                    if ((link.href || '').includes('tailwind')) {
                        results.tailwindDetected = true;
                        results.cssFramework = 'Tailwind CSS';
                        break;
                    }
                }
                // Check for Tailwind's characteristic utility classes even without breakpoint prefixes
                if (!results.tailwindDetected) {
                    const body = document.body?.className || '';
                    const html = document.documentElement?.outerHTML?.substring(0, 5000) || '';
                    const tailwindSignals = ['antialiased', 'min-h-screen', 'bg-background', 'text-foreground'];
                    if (tailwindSignals.some(sig => body.includes(sig) || html.includes(sig))) {
                        results.tailwindDetected = true;
                        results.cssFramework = 'Tailwind CSS';
                    }
                }
            }

            // Generate issues
            if (!results.hasViewportMeta) {
                results.issues.push('Viewport meta tag (<meta name="viewport">) is missing, crucial for responsiveness on mobile devices.');
            } else if (results.viewportMetaContent && results.viewportMetaContent.includes('user-scalable=no')) {
                results.issues.push('Viewport meta tag includes "user-scalable=no", which restricts zooming and can be an accessibility issue.');
            }

            // ACCURACY FIX: Only flag "no media queries" if ALSO no utility-class responsive design
            if (results.mediaQueriesCount === 0 && !results.tailwindDetected && results.responsiveClassCount === 0 && results.hasViewportMeta) {
                results.issues.push('No CSS media queries or responsive utility classes detected despite viewport meta tag; site may not be fully responsive.');
            }

            return results;
        });
    } catch (error) {
        if (verbose) { console.error(`[CompatibilityModule] Error gathering responsive context: ${error.message}`); }
        return { hasViewportMeta: false, viewportMetaContent: null, mediaQueriesCount: 0, tailwindDetected: false, responsiveClassCount: 0, cssFramework: null, issues: [`Error: ${error.message.substring(0, 50)}`] };
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
        industryContext = {},
        costAggregator = null
    } = options;

    const startTimestamp = Date.now();
    if (verbose) { console.log(`[CompatibilityModule] Starting compatibility analysis for ${url}`); }
    if (onProgress) { onProgress('compatibility', 'Starting compatibility analysis', 0); }

    // CRITICAL FIX: Initialize module output with proper structure from the start
    let compatibilityModuleOutput = {
        summary: {
            score: 0,
            rating: "Failing",
            topIssues: []
        },
        browserSupport: {
            featureSupport: {
                css: { overallSupportPercentage: 95, problematicFeatures: [] },
                javascript: { overallSupportPercentage: 95, problematicFeatures: [] },
                html5: { overallSupportPercentage: 95, problematicFeatures: [] },
                polyfillUsage: "Minimal"
            }
        },
        responsiveDesign: {
            breakpoints: [],
            viewportCoverage: 85,
            mediaQueries: { count: 0, effectivenessScore: 75, usesContainerQueries: false, usesViewportUnits: false },
            cssSupport: { flexboxUsage: false, gridUsage: false, relativeUnitsPercentage: 50 },
            imageResponsiveness: 70,
            overallScore: 75
        },
        browserCompatibility: ["chrome", "firefox", "safari", "edge", "opera", "ie"],
        deviceCompatibility: ["desktop", "mobile", "tablet"],
        osCompatibility: ["windows", "macos", "linux", "android", "ios", "overallOsScore"],
        responsiveDesignScore: 85,
        legacyBrowserSupport: {
            score: 75,
            strategy: "Modern browsers prioritized with graceful degradation",
            specificIssuesForLegacy: []
        },
        progressiveEnhancement: {
            score: 75,
            baselineExperience: "Basic functionality accessible to all users",
            enhancedFeatures: ["Modern CSS features", "Advanced JavaScript functionality"],
            degradationStrategy: "Graceful fallback for older browsers"
        },
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        url: url
    };

    try {
        // Validate page availability
        if (!page || page.isClosed()) { 
            if (verbose) console.warn("[CompatibilityModule] No Playwright page; falling back to CF sharedPageContext extraction.");
        }

        if (onProgress) { onProgress('compatibility', 'Gathering context data', 10); }

        // Gather context data
        const cssCtx = await getCssContext(page, verbose);
        const jsCtx = await getJsContext(page, verbose);
        const responsiveCtx = await getResponsiveContext(page, verbose);

        // ENHANCED: Deterministic HTML-based compatibility extraction (works without Playwright)
        const rawHtml = sharedPageContext._rawHtml || '';
        if (rawHtml) {
            const { extractCompatibilitySignalsFromHtml } = require('../utils/cfHtmlExtractor');
            const htmlCompatSignals = extractCompatibilitySignalsFromHtml(rawHtml, verbose);
            compatibilityModuleOutput._htmlCompatSignals = htmlCompatSignals;

            // Enrich CSS context if page.evaluate returned nothing
            if (cssCtx.modernFeaturesUsed.length === 0 && htmlCompatSignals.css.features.length > 0) {
                cssCtx.modernFeaturesUsed = htmlCompatSignals.css.features;
                cssCtx.potentialIssues = htmlCompatSignals.css.issues;
                cssCtx.prefixedProperties = htmlCompatSignals.css.vendorPrefixes;
                if (verbose) console.log(`[CompatibilityModule] HTML fallback enriched CSS: ${htmlCompatSignals.css.features.join(', ')}`);
            }

            // Enrich JS context
            if (jsCtx.modernFeaturesUsed.length === 0 && htmlCompatSignals.js.features.length > 0) {
                jsCtx.modernFeaturesUsed = htmlCompatSignals.js.features;
                jsCtx.potentialIssues = htmlCompatSignals.js.issues;
                if (verbose) console.log(`[CompatibilityModule] HTML fallback enriched JS: ${htmlCompatSignals.js.features.join(', ')}`);
            }

            // Enrich responsive context
            if (!responsiveCtx.hasViewportMeta && htmlCompatSignals.responsive.hasViewportMeta) {
                responsiveCtx.hasViewportMeta = true;
                responsiveCtx.viewportMetaContent = htmlCompatSignals.responsive.viewportContent;
                if (verbose) console.log(`[CompatibilityModule] HTML fallback found viewport meta`);
            }
            if (responsiveCtx.mediaQueriesCount === 0 && htmlCompatSignals.responsive.mediaQueryCount > 0) {
                responsiveCtx.mediaQueriesCount = htmlCompatSignals.responsive.mediaQueryCount;
            }
            responsiveCtx.flexboxUsed = responsiveCtx.flexboxUsed || htmlCompatSignals.responsive.flexboxUsed;
            responsiveCtx.gridUsed = responsiveCtx.gridUsed || htmlCompatSignals.responsive.gridUsed;
        }

        // BROWSER AUDIT ENRICHMENT: Console errors and JS failures from live browser session
        const browserAudit = sharedPageContext?.browserAudit;
        let browserConsoleErrors = [];
        if (browserAudit?.consoleErrors && Array.isArray(browserAudit.consoleErrors)) {
            browserConsoleErrors = browserAudit.consoleErrors;
            // Inject JS errors as compatibility issues
            const jsErrors = browserConsoleErrors.filter(e => e.type === 'pageerror' || e.type === 'error');
            if (jsErrors.length > 0) {
                jsCtx.potentialIssues = jsCtx.potentialIssues || [];
                jsCtx.potentialIssues.push(
                    `${jsErrors.length} JavaScript runtime error(s) detected in browser console: ${jsErrors.slice(0, 3).map(e => e.text.substring(0, 80)).join('; ')}`
                );
                if (verbose) console.log(`[CompatibilityModule] 🔬 Browser audit: ${jsErrors.length} JS runtime errors detected`);
            }
        }

        // --- Deterministic DOM Signal Collection ---
        if (onProgress) { onProgress('compatibility', 'Collecting deterministic DOM structure signals', 20); }
        const collectedSignals = await collectDomSignals(page, verbose);
        compatibilityModuleOutput._collectedSignals = collectedSignals;
        // ------------------------------------------------

        if (onProgress) { onProgress('compatibility', 'Analyzing browser compatibility', 30); }

        // Build comprehensive compatibility analysis
        const compatibilityContext = {
            cssFeatures: cssCtx.modernFeaturesUsed,
            cssIssues: cssCtx.potentialIssues,
            jsFeatures: jsCtx.modernFeaturesUsed,
            jsIssues: jsCtx.potentialIssues,
            hasViewportMeta: responsiveCtx.hasViewportMeta,
            mediaQueriesCount: responsiveCtx.mediaQueriesCount,
            tailwindDetected: responsiveCtx.tailwindDetected || false,
            responsiveClassCount: responsiveCtx.responsiveClassCount || 0,
            cssFramework: responsiveCtx.cssFramework || null,
            responsiveIssues: responsiveCtx.issues
        };

        if (verbose) { console.log('[CompatibilityModule] Context gathered:', compatibilityContext); }

        // Use centralized modelFamily default
        const defaultModelFamily = require('../config/model-defaults').getDefaultModelFamily('compatibility');
        const effectiveModelFamily = modelFamily || defaultModelFamily;

        // Get model configuration for AI analysis
        const modelConfig = getModelConfig({
            model: model,
            modelFamily: effectiveModelFamily,
            maxTokens: maxTokens,
            tier: tier,
            module: 'compatibility',
            analysisDepth: analysisDepth
        });

        if (onProgress) { onProgress('compatibility', 'Performing AI analysis (two-pass)', 50); }

        let aiAnalysisSuccessful = false;

        // CRITICAL FIX: Robust AI analysis with comprehensive fallback
        if (modelConfig.valid) {
            try {
                // Prepare evidence data for two-pass pipeline
                const evidenceData = {
                    url: url,
                    cssFeatures: compatibilityContext.cssFeatures.join(', ') || 'None detected',
                    cssIssues: compatibilityContext.cssIssues.join(', ') || 'None detected',
                    jsFeatures: compatibilityContext.jsFeatures.join(', ') || 'None detected',
                    jsIssues: compatibilityContext.jsIssues.join(', ') || 'None detected',
                    hasViewportMeta: compatibilityContext.hasViewportMeta,
                    mediaQueriesCount: compatibilityContext.mediaQueriesCount,
                    tailwindDetected: compatibilityContext.tailwindDetected,
                    responsiveClassCount: compatibilityContext.responsiveClassCount,
                    cssFramework: compatibilityContext.cssFramework || 'None detected',
                    responsiveIssues: compatibilityContext.responsiveIssues.join(', ') || 'None detected',
                    tier: tier,
                    analysisDepth: analysisDepth,
                    industryContext: industryContext
                };

                // Build evidence registry and pre-execute evidence block for prompt injection
                let evidenceBlock;
                const rawHtmlForRegistry = sharedPageContext?._rawHtml || '';
                if (rawHtmlForRegistry) {
                    const registry = buildEvidenceRegistry(rawHtmlForRegistry, url, { verbose, sharedPageContext });
                    evidenceBlock = registry.toEvidenceBlock({ categories: ['compat', 'content', 'platform'] });
                    if (verbose) {
                        console.log(`[CompatibilityModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
                    }
                }

                // GOLD-STANDARD: Two-pass AI pipeline — evidence extraction → expert judgment
                const twoPassResult = await twoPassAnalysis({
                    moduleName: 'compatibility',
                    evidenceData: evidenceData,
                    industryContext: industryContext || { primaryIndustry: 'Unknown' },
                    pass1Template: 'compatibility-evidence-extraction',
                    pass2Template: 'compatibility-expert-judgment',
                    pass2Schema: null, // Uses existing schema validation
                    singlePassTemplate: 'compatibility-analysis',
                    tier,
                    analysisDepth,
                    modelFamily: modelConfig.provider,
                    model: modelConfig.model,
                    costAggregator,
                    verbose,
                    evidenceBlock,
                });

                if (twoPassResult.analysis) {
                    const aiAnalysis = twoPassResult.analysis;

                    if (aiAnalysis.summary && typeof aiAnalysis.summary === 'object' &&
                        typeof aiAnalysis.summary.score === 'number') {

                        // Merge AI results with base structure
                        compatibilityModuleOutput = {
                            ...compatibilityModuleOutput,
                            ...aiAnalysis,
                            summary: {
                                score: aiAnalysis.summary.score,
                                rating: aiAnalysis.summary.rating || getRatingLabelForScore(aiAnalysis.summary.score, false),
                                topIssues: Array.isArray(aiAnalysis.summary.topIssues) ? aiAnalysis.summary.topIssues : []
                            }
                        };

                        aiAnalysisSuccessful = true;
                        if (verbose) { console.log('[CompatibilityModule] Two-pass AI analysis successful, score:', aiAnalysis.summary.score); }
                    } else {
                        if (verbose) { console.warn('[CompatibilityModule] AI response missing valid summary structure'); }
                    }

                    // Store narrative if available
                    if (twoPassResult.narrative) {
                        // Sanitize: AI sometimes starts narrative with bare URL ("www.dispatchnode.com ...")
                        let narrative = twoPassResult.narrative;
                        if (/^(https?:\/\/)?[a-zA-Z0-9][\w.-]+\.[a-z]{2,}\s/.test(narrative)) {
                            // Strip leading URL-like text up to first space, capitalize next word
                            narrative = narrative.replace(/^(https?:\/\/)?[a-zA-Z0-9][\w.-]+\.[a-z]{2,}\s+/, '');
                            narrative = narrative.charAt(0).toUpperCase() + narrative.slice(1);
                        }
                        compatibilityModuleOutput.narrative = narrative;
                    }
                    // Store agent metadata for report attribution
                    if (twoPassResult.agentMeta) {
                        compatibilityModuleOutput._agentMeta = twoPassResult.agentMeta;
                    }
                } else {
                    if (verbose) { console.warn('[CompatibilityModule] Two-pass AI analysis failed or returned no data'); }
                }
            } catch (aiError) {
                if (verbose) { console.error(`[CompatibilityModule] AI analysis error: ${aiError.message}`); }

                // Check for quota limit errors specifically
                if (aiError.message && (
                    aiError.message.includes('429') ||
                    aiError.message.includes('Too Many Requests') ||
                    aiError.message.includes('quota') ||
                    aiError.message.includes('rate limit')
                )) {
                    if (verbose) { console.log('[CompatibilityModule] AI quota limit detected, using deterministic fallback'); }
                }
            }
        } else {
            if (verbose) { console.warn('[CompatibilityModule] No valid model configuration available'); }
        }

        if (onProgress) { onProgress('compatibility', 'Calculating compatibility scores', 70); }

        // CRITICAL FIX: Always use deterministic scoring with proper tier-specific logic
        if (!aiAnalysisSuccessful || compatibilityModuleOutput.summary.score === 0 || compatibilityModuleOutput.summary.score === 1) {
            // Use deterministic scoring as fallback
            const deterministicScore = calculateProTierCompatibilityScore(compatibilityModuleOutput, cssCtx, jsCtx, responsiveCtx);

            // CRITICAL FIX: Ensure summary object is always properly structured
            // Generate REAL topIssues from detected compatibility concerns, not informational summaries
            const realTopIssues = [];
            if (!responsiveCtx.hasViewportMeta) {
                realTopIssues.push('Missing viewport meta tag — page may not render correctly on mobile devices');
            }
            if (responsiveCtx.mediaQueriesCount === 0 && !responsiveCtx.tailwindDetected && responsiveCtx.responsiveClassCount === 0) {
                realTopIssues.push('No CSS media queries or responsive utility classes detected — site may lack responsive breakpoints for different screen sizes');
            }
            const unsupportedCssFeatures = (cssCtx.modernFeaturesUsed || []).filter(f =>
                /container-quer|subgrid|:has\(|@layer|color-mix|anchor-position/i.test(f));
            if (unsupportedCssFeatures.length > 0) {
                realTopIssues.push(`${unsupportedCssFeatures.length} cutting-edge CSS features used (${unsupportedCssFeatures.slice(0, 3).join(', ')}) — may not work in older browsers`);
            }
            const unsupportedJsFeatures = (jsCtx.modernFeaturesUsed || []).filter(f =>
                /structuredClone|Array\.at|Object\.hasOwn|import\.meta|top-level await/i.test(f));
            if (unsupportedJsFeatures.length > 0) {
                realTopIssues.push(`${unsupportedJsFeatures.length} modern JavaScript API(s) used (${unsupportedJsFeatures.slice(0, 3).join(', ')}) — may fail in older browsers`);
            }
            if ((cssCtx.prefixedProperties || []).length > 5) {
                realTopIssues.push(`${cssCtx.prefixedProperties.length} vendor-prefixed CSS properties detected — consider using standard un-prefixed alternatives`);
            }
            if (realTopIssues.length === 0) {
                realTopIssues.push('No major cross-browser compatibility issues detected');
            }

            compatibilityModuleOutput.summary = {
                score: deterministicScore,
                rating: getRatingLabelForScore(deterministicScore, false),
                topIssues: realTopIssues.slice(0, 5)
            };

            if (verbose) {
                console.log(`[CompatibilityModule] Using deterministic score: ${deterministicScore} for tier: ${tier}`);
            }
        } else {
            // Use AI analysis results with deterministic scoring override
            compatibilityModuleOutput.summary.score = calculateProTierCompatibilityScore(compatibilityModuleOutput, cssCtx, jsCtx, responsiveCtx);
            compatibilityModuleOutput.summary.rating = getRatingLabelForScore(compatibilityModuleOutput.summary.score, false);
        }

        // CRITICAL FIX: Enhanced topIssues logic - prioritize AI response but ensure quality
        const aiProvidedTopIssues = compatibilityModuleOutput.summary.topIssues || [];
        const hasValidAiTopIssues = Array.isArray(aiProvidedTopIssues) && aiProvidedTopIssues.length > 0 &&
            aiProvidedTopIssues.some(issue => issue && typeof issue === 'string' && issue.trim().length > 0);

        if (!hasValidAiTopIssues) {
            // Fallback: Generate topIssues from sorted issues if AI didn't provide good ones
            const sortedIssues = (compatibilityModuleOutput.issues.items || [])
                .sort((a, b) => {
                    const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                    return (severities[a.severity] || 5) - (severities[b.severity] || 5);
                });
            compatibilityModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue => issue.text || "Issue description missing");
        }
        // If AI provided valid topIssues, keep them as-is

        // CRITICAL FIX: Final validation of summary structure
        if (!compatibilityModuleOutput.summary || typeof compatibilityModuleOutput.summary !== 'object') {
            compatibilityModuleOutput.summary = {
                score: 10,
                rating: getRatingLabelForScore(10, false),
                topIssues: ["Compatibility analysis completed with limited data"]
            };
        }

        // Ensure score is a valid number
        if (typeof compatibilityModuleOutput.summary.score !== 'number' ||
            isNaN(compatibilityModuleOutput.summary.score) ||
            compatibilityModuleOutput.summary.score < 0 ||
            compatibilityModuleOutput.summary.score > 100) {
            compatibilityModuleOutput.summary.score = 10;
        }

        // Ensure rating is a valid string
        if (typeof compatibilityModuleOutput.summary.rating !== 'string') {
            compatibilityModuleOutput.summary.rating = getRatingLabelForScore(compatibilityModuleOutput.summary.score, false);
        }

        // Ensure topIssues is a valid array
        if (!Array.isArray(compatibilityModuleOutput.summary.topIssues)) {
            compatibilityModuleOutput.summary.topIssues = ["Compatibility analysis completed"];
        }

        // GOLD-STANDARD: Generate strengths from compatibility findings
        const compatStrengths = [];
        if (getNestedProperty(compatibilityModuleOutput, 'cssCompatibility.score', 0) >= 70) compatStrengths.push('Strong CSS cross-browser compatibility');
        if (getNestedProperty(compatibilityModuleOutput, 'jsCompatibility.score', 0) >= 70) compatStrengths.push('JavaScript compatibility well-managed');
        if (getNestedProperty(compatibilityModuleOutput, 'responsiveDesign.score', 0) >= 70) compatStrengths.push('Good responsive design implementation');
        if (getNestedProperty(compatibilityModuleOutput, 'responsiveDesign.hasViewportMeta', false)) compatStrengths.push('Viewport meta tag properly configured');
        if (getNestedProperty(compatibilityModuleOutput, 'responsiveDesign.hasMediaQueries', false)) compatStrengths.push('Media queries used for responsive layouts');
        const modernCSS = getNestedProperty(compatibilityModuleOutput, 'cssCompatibility.modernFeaturesUsed', []);
        if (Array.isArray(modernCSS) && modernCSS.length > 0) compatStrengths.push(`Uses modern CSS features (${modernCSS.slice(0, 3).join(', ')})`);
        if (compatStrengths.length === 0 && compatibilityModuleOutput.summary.score >= 50) compatStrengths.push('Basic cross-browser compatibility maintained');
        compatibilityModuleOutput.summary.strengths = compatStrengths;

        // CRITICAL FIX: Generate deterministic issues from analysis context
        const compatIssues = [];
        if (!responsiveCtx.hasViewportMeta) {
            compatIssues.push({
                text: 'Missing viewport meta tag — page may not render correctly on mobile devices',
                severity: 'High', category: 'Responsive Design', source: 'compatibility'
            });
        }
        if (responsiveCtx.mediaQueriesCount === 0 && !responsiveCtx.tailwindDetected && responsiveCtx.responsiveClassCount === 0) {
            compatIssues.push({
                text: 'No CSS media queries or responsive utility classes detected — site may lack responsive breakpoints for different screen sizes',
                severity: 'High', category: 'Responsive Design', source: 'compatibility'
            });
        }
        const unsafeCssFeatures = (cssCtx.modernFeaturesUsed || []).filter(f =>
            /container-quer|subgrid|:has\(|@layer|color-mix|anchor-position/i.test(f));
        if (unsafeCssFeatures.length > 0) {
            compatIssues.push({
                text: `${unsafeCssFeatures.length} cutting-edge CSS feature(s) used (${unsafeCssFeatures.slice(0, 3).join(', ')}) — limited support in older browsers`,
                severity: 'Medium', category: 'CSS Compatibility', source: 'compatibility'
            });
        }
        const unsafeJsFeatures = (jsCtx.modernFeaturesUsed || []).filter(f =>
            /structuredClone|Array\.at|Object\.hasOwn|import\.meta|top-level await/i.test(f));
        if (unsafeJsFeatures.length > 0) {
            compatIssues.push({
                text: `${unsafeJsFeatures.length} modern JavaScript API(s) used (${unsafeJsFeatures.slice(0, 3).join(', ')}) — may fail in older browsers`,
                severity: 'Medium', category: 'JavaScript Compatibility', source: 'compatibility'
            });
        }
        if ((cssCtx.prefixedProperties || []).length > 3) {
            compatIssues.push({
                text: `${cssCtx.prefixedProperties.length} vendor-prefixed CSS properties detected — consider using standard unprefixed alternatives or adding autoprefixer`,
                severity: 'Low', category: 'CSS Compatibility', source: 'compatibility'
            });
        }
        if ((cssCtx.potentialIssues || []).length > 0) {
            cssCtx.potentialIssues.slice(0, 3).forEach(issue => {
                compatIssues.push({
                    text: typeof issue === 'string' ? issue : (issue.text || issue.description || 'CSS compatibility issue'),
                    severity: 'Medium', category: 'CSS Compatibility', source: 'compatibility'
                });
            });
        }
        if ((jsCtx.potentialIssues || []).length > 0) {
            jsCtx.potentialIssues.slice(0, 3).forEach(issue => {
                compatIssues.push({
                    text: typeof issue === 'string' ? issue : (issue.text || issue.description || 'JavaScript compatibility issue'),
                    severity: 'Medium', category: 'JavaScript Compatibility', source: 'compatibility'
                });
            });
        }
        if ((responsiveCtx.issues || []).length > 0) {
            responsiveCtx.issues.slice(0, 3).forEach(issue => {
                compatIssues.push({
                    text: typeof issue === 'string' ? issue : (issue.text || issue.description || 'Responsive design issue'),
                    severity: 'Medium', category: 'Responsive Design', source: 'compatibility'
                });
            });
        }
        // Only overwrite issues if no AI-generated issues exist
        if (!compatibilityModuleOutput.issues.items || compatibilityModuleOutput.issues.items.length === 0) {
            compatibilityModuleOutput.issues = createDefaultPaginatedArray(compatIssues);
        }

        // CRITICAL FIX: Generate deterministic recommendations from issues and context
        const compatRecommendations = [];
        if (!responsiveCtx.hasViewportMeta) {
            compatRecommendations.push({
                id: uuidv4(),
                text: 'Add a viewport meta tag (<meta name="viewport" content="width=device-width, initial-scale=1">) to ensure proper rendering on mobile devices.',
                priority: 'High', source: 'compatibility',
                impact: 'Critical for mobile compatibility — without it, mobile browsers render the page at desktop width',
                effort: 'Low'
            });
        }
        if (responsiveCtx.mediaQueriesCount === 0 && !responsiveCtx.tailwindDetected && responsiveCtx.responsiveClassCount === 0) {
            compatRecommendations.push({
                id: uuidv4(),
                text: 'Implement CSS media queries or a utility-class framework to create responsive breakpoints for different screen sizes.',
                priority: 'High', source: 'compatibility',
                impact: 'Responsive layouts ensure content is usable across all device sizes',
                effort: 'High'
            });
        }
        if (unsafeCssFeatures.length > 0) {
            compatRecommendations.push({
                id: uuidv4(),
                text: `Add fallbacks for cutting-edge CSS features (${unsafeCssFeatures.slice(0, 3).join(', ')}) using @supports queries to ensure graceful degradation in older browsers.`,
                priority: 'Medium', source: 'compatibility',
                impact: 'Feature detection with fallbacks ensures a baseline experience for all users',
                effort: 'Moderate'
            });
        }
        if (unsafeJsFeatures.length > 0) {
            compatRecommendations.push({
                id: uuidv4(),
                text: `Add polyfills or transpilation for modern JavaScript APIs (${unsafeJsFeatures.slice(0, 3).join(', ')}) to support older browser versions.`,
                priority: 'Medium', source: 'compatibility',
                impact: 'Polyfills extend browser support without sacrificing modern developer ergonomics',
                effort: 'Low'
            });
        }
        if ((cssCtx.prefixedProperties || []).length > 3) {
            compatRecommendations.push({
                id: uuidv4(),
                text: `Integrate an autoprefixer in your build pipeline to automatically handle vendor-prefixed CSS properties — ${cssCtx.prefixedProperties.length} prefixed properties were detected.`,
                priority: 'Low', source: 'compatibility',
                impact: 'Autoprefixer eliminates manual prefix maintenance and ensures correct vendor prefix usage',
                effort: 'Low'
            });
        }
        // Ensure minimum 5 recommendations
        if (compatRecommendations.length < 5) {
            const generalCompatRecs = [
                {
                    text: 'Test the website across Chrome, Firefox, Safari, and Edge to identify and fix cross-browser rendering differences.',
                    priority: 'Medium', impact: 'Regular cross-browser testing catches compatibility regressions early'
                },
                {
                    text: 'Use progressive enhancement to deliver a core experience to all browsers while adding advanced features for modern ones.',
                    priority: 'Medium', impact: 'Progressive enhancement ensures the site remains functional even when advanced features are unavailable'
                },
                {
                    text: 'Run the site through tools like Can I Use and BrowserStack to identify potential compatibility gaps with your target audience\'s browsers.',
                    priority: 'Low', impact: 'Proactive compatibility auditing reduces the risk of post-launch browser-specific bugs'
                },
                {
                    text: 'Implement preconnect and prefetch resource hints for critical third-party domains to improve cross-browser loading performance.',
                    priority: 'Medium', impact: 'Resource hints reduce connection overhead and improve perceived performance across all browsers'
                },
                {
                    text: 'Use the HTML5 <picture> element with multiple source formats (WebP, AVIF, fallback JPEG) to serve optimized images across browsers with varying format support.',
                    priority: 'Medium', impact: 'Multi-format images reduce page weight while maintaining visual quality across all browsers'
                },
                {
                    text: 'Add font-display: swap to all @font-face declarations to prevent invisible text during web font loading in slower connections.',
                    priority: 'Low', impact: 'Font display swap ensures text remains readable during font loading, improving perceived performance'
                },
                {
                    text: 'Ensure touch targets (buttons, links) are at least 44×44px to meet mobile accessibility guidelines across all touch-enabled browsers.',
                    priority: 'Medium', impact: 'Proper touch targets reduce mis-taps and improve usability on mobile devices'
                }
            ];
            for (const rec of generalCompatRecs) {
                if (compatRecommendations.length >= 5) break;
                const isDup = compatRecommendations.some(r => r.text.substring(0, 30).toLowerCase() === rec.text.substring(0, 30).toLowerCase());
                if (!isDup) {
                    compatRecommendations.push({ id: uuidv4(), ...rec, source: 'compatibility', effort: rec.effort || 'Moderate' });
                }
            }
        }
        // Use deterministic recs if they're richer than AI-generated ones
        const existingAIRecs = compatibilityModuleOutput.recommendations.items || [];
        if (compatRecommendations.length > existingAIRecs.length) {
            compatibilityModuleOutput.recommendations = createDefaultPaginatedArray(compatRecommendations.slice(0, 7));
        }

        // Now natively handled via crossViewport or schema

        // CRITICAL FIX: Generate deterministic narrative if AI didn't produce one
        if (!compatibilityModuleOutput.narrative) {
            const cScore = compatibilityModuleOutput.summary.score || 0;
            const nParts = [];

            // Opening assessment with score context
            if (cScore >= 80) {
                nParts.push(`Cross-browser compatibility analysis shows strong results with an overall score of ${cScore}/100, indicating the site functions well across modern browsers.`);
            } else if (cScore >= 60) {
                nParts.push(`The compatibility analysis reveals adequate cross-browser support with a score of ${cScore}/100, though several areas need attention to ensure consistent experience across all browsers.`);
            } else {
                nParts.push(`The compatibility analysis identifies significant cross-browser concerns with a score of ${cScore}/100, which may prevent a substantial portion of visitors from having a usable experience.`);
            }

            // Responsive design assessment
            const hasResponsiveClasses = responsiveCtx.tailwindDetected || responsiveCtx.responsiveClassCount > 0;
            if (!responsiveCtx.hasViewportMeta && responsiveCtx.mediaQueriesCount === 0 && !hasResponsiveClasses) {
                nParts.push('Critical responsive design gaps exist — both the viewport meta tag and CSS media queries are absent, meaning the site likely renders at desktop dimensions on mobile devices, creating significant usability barriers.');
            } else if (!responsiveCtx.hasViewportMeta) {
                nParts.push('The viewport meta tag is missing, which can cause mobile browsers to render the page at desktop width and scale it down, making text unreadable and buttons hard to tap.');
            } else if (responsiveCtx.mediaQueriesCount === 0 && !hasResponsiveClasses) {
                nParts.push('While the viewport meta tag is present, no CSS media queries or responsive utility classes were detected, meaning the layout may not adapt to different screen sizes.');
            } else if (hasResponsiveClasses) {
                nParts.push(`Responsive design is implemented via ${responsiveCtx.cssFramework || 'utility-class framework'} with ${responsiveCtx.responsiveClassCount} responsive breakpoint classes across the page, providing comprehensive device-width adaptation.`);
            } else {
                nParts.push(`Responsive design fundamentals are in place with viewport meta tag and ${responsiveCtx.mediaQueriesCount} media quer${responsiveCtx.mediaQueriesCount === 1 ? 'y' : 'ies'} for different breakpoints.`);
            }

            // Feature compatibility
            const cssFeatCount = (cssCtx.modernFeaturesUsed || []).length;
            const jsFeatCount = (jsCtx.modernFeaturesUsed || []).length;
            const unsafeCssCount = unsafeCssFeatures.length;
            const unsafeJsCount = unsafeJsFeatures.length;

            if (unsafeCssCount > 0 || unsafeJsCount > 0) {
                nParts.push(`The site relies on ${unsafeCssCount + unsafeJsCount} modern web feature${(unsafeCssCount + unsafeJsCount) > 1 ? 's' : ''} that may not be supported in older browsers — ${unsafeCssCount > 0 ? `${unsafeCssCount} CSS feature${unsafeCssCount > 1 ? 's' : ''}` : ''}${unsafeCssCount > 0 && unsafeJsCount > 0 ? ' and ' : ''}${unsafeJsCount > 0 ? `${unsafeJsCount} JavaScript API${unsafeJsCount > 1 ? 's' : ''}` : ''} require fallbacks or polyfills for full browser coverage.`);
            } else if (cssFeatCount > 0 || jsFeatCount > 0) {
                nParts.push(`The site uses ${cssFeatCount + jsFeatCount} modern web features, all with broad browser support.`);
            }

            // Vendor prefix status
            const prefixCount = (cssCtx.prefixedProperties || []).length;
            if (prefixCount > 3) {
                nParts.push(`${prefixCount} vendor-prefixed CSS properties were detected — integrating an autoprefixer into the build pipeline would simplify maintenance.`);
            }

            // Top issues
            const compatIssueItems = compatibilityModuleOutput.issues?.items || [];
            if (compatIssueItems.length > 0) {
                nParts.push(`${compatIssueItems.length} compatibility issue${compatIssueItems.length > 1 ? 's were' : ' was'} identified that should be addressed to improve cross-browser reliability.`);
            }

            // Key strengths
            if (compatStrengths.length > 0) {
                nParts.push(`Key strengths include ${compatStrengths.slice(0, 2).join(' and ').toLowerCase()}.`);
            }

            // Industry-specific context
            if (industryContext?.primaryIndustry && /health|medical|dental|clinic/i.test(industryContext.primaryIndustry)) {
                nParts.push(`For a healthcare provider, cross-browser and mobile compatibility is essential — patients increasingly use mobile devices to find providers, book appointments, and access health information.`);
            }

            compatibilityModuleOutput.narrative = nParts.join(' ');
        }

        if (verbose) { console.log(`[CompatibilityModule] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${compatibilityModuleOutput.summary.score}`); }
        if (onProgress) { onProgress('compatibility', 'Compatibility analysis finalized', 100); }

        return compatibilityModuleOutput;

    } catch (error) {
        console.error(`[CompatibilityModule] Critical error in Compatibility analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('compatibility', `Error: ${error.message}`, 100); }

        // CRITICAL FIX: Ensure error response has proper summary structure
        compatibilityModuleOutput.error = `Compatibility analysis critically failed: ${error.message}`;
        compatibilityModuleOutput.summary = {
            score: 0,
            rating: getRatingLabelForScore(0, false),
            topIssues: [compatibilityModuleOutput.error.substring(0, 100)]
        };
        return compatibilityModuleOutput;
    }
}

// --- Helper Functions for Realistic Pro Tier Scoring ---

function calculateProTierCompatibilityScore(compatibilityModuleOutput, cssCtx, jsCtx, responsiveCtx) {
    // GOLD-STANDARD: Purely evidence-based scoring — no hash seeding or pseudo-random variation
    let score = 70; // Pro tier baseline

    // CSS compatibility evidence
    const cssModernCount = (cssCtx.modernFeaturesUsed || []).length;
    const cssIssueCount = (cssCtx.potentialIssues || []).length;
    if (cssModernCount > 0) score += Math.min(12, cssModernCount * 2); // Up to 12 for modern CSS usage
    if (cssIssueCount === 0) score += 8; // Clean CSS = bonus
    else score -= Math.min(15, cssIssueCount * 3); // Deduct for each issue found

    // JavaScript compatibility evidence
    const jsModernCount = (jsCtx.modernFeaturesUsed || []).length;
    const jsIssueCount = (jsCtx.potentialIssues || []).length;
    if (jsModernCount > 0) score += Math.min(10, jsModernCount * 2); // Up to 10 for modern JS
    if (jsIssueCount === 0) score += 6;
    else score -= Math.min(12, jsIssueCount * 3);

    // Responsive design evidence
    if (responsiveCtx.hasViewportMeta) score += 8;
    if (responsiveCtx.mediaQueriesCount > 3 || responsiveCtx.responsiveClassCount > 20) score += 5;
    else if (responsiveCtx.mediaQueriesCount > 0 || responsiveCtx.responsiveClassCount > 0) score += 3;
    if (responsiveCtx.tailwindDetected) score += 3; // Modern CSS framework bonus
    if (responsiveCtx.flexboxUsed) score += 3;
    if (responsiveCtx.gridUsed) score += 2;

    // Pro tier range: 40-95
    return Math.max(40, Math.min(Math.round(score), 95));
}

function calculateBasicTierCompatibilityScore(compatibilityModuleOutput, cssCtx, jsCtx, responsiveCtx) {
    // GOLD-STANDARD: Purely evidence-based scoring — no hash seeding or pseudo-random variation
    let score = 55; // Basic tier baseline (lower depth of analysis)

    // CSS compatibility evidence (reduced weighting for basic tier)
    const cssModernCount = (cssCtx.modernFeaturesUsed || []).length;
    const cssIssueCount = (cssCtx.potentialIssues || []).length;
    if (cssModernCount > 0) score += Math.min(8, cssModernCount * 2);
    if (cssIssueCount === 0) score += 6;
    else score -= Math.min(10, cssIssueCount * 2);

    // JavaScript compatibility evidence (reduced weighting)
    const jsModernCount = (jsCtx.modernFeaturesUsed || []).length;
    const jsIssueCount = (jsCtx.potentialIssues || []).length;
    if (jsModernCount > 0) score += Math.min(6, jsModernCount * 2);
    if (jsIssueCount === 0) score += 4;
    else score -= Math.min(8, jsIssueCount * 2);

    // Responsive design evidence (reduced weighting)
    if (responsiveCtx.hasViewportMeta) score += 4;
    if (responsiveCtx.mediaQueriesCount > 0 || responsiveCtx.responsiveClassCount > 0 || responsiveCtx.tailwindDetected) score += 2;

    // Basic tier range: 25-80
    return Math.max(25, Math.min(Math.round(score), 80));
}

function calculateBrowserScore(browser, cssCtx, jsCtx) {
    let baseScore = 70; // Start with good score for Pro tier

    // Apply browser-specific adjustments
    switch (browser) {
        case 'ie':
            // IE has significant limitations
            baseScore = 45;
            if (jsCtx.modernFeaturesUsed.length > 3) baseScore -= 10;
            if (cssCtx.modernFeaturesUsed.includes('CSS Grid Layout')) baseScore -= 5;
            break;

        case 'safari':
            // Safari has some quirks but generally good
            baseScore = 78;
            if (cssCtx.modernFeaturesUsed.includes('CSS Container Queries')) baseScore -= 5;
            break;

        case 'firefox':
            // Firefox has excellent standards support
            baseScore = 85;
            break;

        case 'chrome':
            // Chrome has best feature support
            baseScore = 88;
            break;

        case 'edge':
            // Modern Edge is Chromium-based
            baseScore = 86;
            break;

        case 'opera':
            // Opera is Chromium-based but smaller market
            baseScore = 82;
            break;

        default:
            baseScore = 75;
    }

    // Adjust for potential issues
    if (cssCtx.potentialIssues.length > 0) baseScore -= (cssCtx.potentialIssues.length * 3);
    if (jsCtx.potentialIssues.length > 0) baseScore -= (jsCtx.potentialIssues.length * 4);

    return Math.max(25, Math.min(baseScore, 95));
}

function calculateJsCompatibilityScore(browser, jsCtx) {
    let score = 70;

    // Browser-specific JS support
    switch (browser) {
        case 'ie':
            score = 35; // IE has poor modern JS support
            if (jsCtx.modernFeaturesUsed.includes('Arrow Functions')) score -= 5;
            if (jsCtx.modernFeaturesUsed.includes('Promises & Async/Await')) score -= 5;
            break;
        case 'safari':
            score = 80;
            break;
        case 'firefox':
        case 'chrome':
        case 'edge':
            score = 85;
            break;
        default:
            score = 75;
    }

    // Adjust for modern features and issues
    if (jsCtx.potentialIssues.length > 0) score -= (jsCtx.potentialIssues.length * 5);

    return Math.max(20, Math.min(score, 95));
}

function calculateCssCompatibilityScore(browser, cssCtx) {
    let score = 75;

    // Browser-specific CSS support
    switch (browser) {
        case 'ie':
            score = 40; // IE has poor modern CSS support
            if (cssCtx.modernFeaturesUsed.includes('CSS Grid Layout')) score -= 10;
            if (cssCtx.modernFeaturesUsed.includes('CSS Flexbox')) score -= 5;
            break;
        case 'safari':
            score = 82;
            if (cssCtx.modernFeaturesUsed.includes('CSS Container Queries')) score -= 8;
            break;
        case 'firefox':
        case 'chrome':
        case 'edge':
            score = 88;
            break;
        default:
            score = 80;
    }

    // Adjust for potential issues
    if (cssCtx.potentialIssues.length > 0) score -= (cssCtx.potentialIssues.length * 4);

    return Math.max(25, Math.min(score, 95));
}

function calculateDeviceScore(device, responsiveCtx) {
    let score = 60;

    // Device-specific scoring
    switch (device) {
        case 'desktop':
            score = 80; // Desktop generally has fewer issues
            break;
        case 'mobile':
            score = 65; // Mobile requires more optimization
            if (responsiveCtx.hasViewportMeta) score += 10;
            if (responsiveCtx.mediaQueriesCount >= 2 || responsiveCtx.responsiveClassCount > 10) score += 8;
            break;
        case 'tablet':
            score = 70; // Tablet is between desktop and mobile
            if (responsiveCtx.hasViewportMeta) score += 8;
            if (responsiveCtx.mediaQueriesCount >= 1 || responsiveCtx.responsiveClassCount > 5) score += 5;
            break;
    }

    // Adjust for responsive design quality
    if (responsiveCtx.issues.length > 0) score -= (responsiveCtx.issues.length * 5);

    return Math.max(30, Math.min(score, 90));
}

function calculateResponsiveScore(responsiveCtx) {
    let score = 40;

    // Viewport meta tag
    if (responsiveCtx.hasViewportMeta) score += 20;

    // Media queries
    if (responsiveCtx.mediaQueriesCount > 0 || responsiveCtx.responsiveClassCount > 0 || responsiveCtx.tailwindDetected) score += 15;
    if (responsiveCtx.mediaQueriesCount >= 3 || responsiveCtx.responsiveClassCount > 15) score += 10;
    if (responsiveCtx.mediaQueriesCount >= 5 || responsiveCtx.responsiveClassCount > 30) score += 5;

    // Responsive issues penalty
    if (responsiveCtx.issues.length > 0) score -= (responsiveCtx.issues.length * 8);

    return Math.max(25, Math.min(score, 85));
}

module.exports = { analyze };
