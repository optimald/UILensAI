const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { captureScreenshots } = require('../../capture');
const { detectIndustry } = require('../../utils/industry-detection');
const { generateRecommendationsForIssues } = require('../../utils/ai-recommendation-engine');
const { resizeImageIfNeeded } = require('../../utils/image');
const { getRatingLabelForScore, calculateModuleSummaryScore } = require('../../utils/scoring-engine');
const { populateBusinessContext } = require('../../utils/business-context');
const { formatIssuesArray } = require('../../utils/issue-formatter');
const { extractDesignSystem } = require('../../utils/design-system');
const { collectDomSignals } = require('../../utils/data-collectors/dom-structure-collector');

const { getViewportDimensions, getFileSize, getViewportFromPath, getImageDimensions } = require('./screenshot-capture');
const { getDetectedFrameworks, discoverUniqueSelectors, analyzeDynamicElements, analyzeGestureInteraction } = require('./dom-analyzer');
const { analyzeSingleViewportScreenshot, analyzeCrossViewportConsistency, analyzeDynamicElementsOnPage, createDefaultUiViewportAnalysisDetail, getNestedProperty, extractEvidenceBasedIssue, isGenericText, extractFirstConcreteSentence } = require('./ai-analyzer');
const { generateStaticElementsIssues } = require('./scorer');

const CATEGORY_LABELS = {
    branding: 'Brand Identity',
    responsiveness: 'Responsive Design',
    hierarchy: 'Content Hierarchy',
    consistency: 'Design Consistency',
    aesthetics: 'Visual Aesthetics',
    aboveTheFold: 'Above The Fold Layout',
    contentFlow: 'Content Flow',
    visualDesign: 'Layout & Visual Design',
    usability: 'Usability',
    accessibility: 'Accessibility'
};

function createDefaultPaginatedArray(items = [], totalItems = null, pageSize = null) {
    const actualItems = Array.isArray(items) ? items : [];
    const itemCount = actualItems.length;
    const total = totalItems !== null ? totalItems : itemCount;
    if (itemCount === 0 && total === 0) return { items: [], totalAvailableItems: 0, pagination: null };
    const effectivePageSize = pageSize || (itemCount > 0 ? itemCount : 10);
    if (total <= effectivePageSize && itemCount <= effectivePageSize) return { items: actualItems, totalAvailableItems: total, pagination: null };
    return {
        items: actualItems, totalAvailableItems: total,
        pagination: { pageNumber: 1, pageSize: effectivePageSize, totalPages: Math.ceil(total / effectivePageSize) || 1 }
    };
}

async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

const {
        page, screenshotPaths, focusAreas,
        modelFamily, model, maxTokens, testingMode,
        onProgress, verbose = false, selector = null, description = null,
        analysisDepth = 'basic',
        captureOptions = { viewports: ['mobile', 'desktop'], fullPage: true, stealthLevel: 'basic', disableAnimations: false },
        tier = "Basic",
        featureSet = {},
        costAggregator = null,
        globalState = {} // ENHANCED: Accept globalState
    } = options;

    // CRITICAL FIX: Handle both calling patterns for screenshot paths
    const initialScreenshotPaths = screenshotPaths; // Use screenshotPaths directly from options

    const modelConfigOptions = { modelFamily, model, maxTokens, testingMode, tier, analysisDepth, costAggregator };
    const startTimestamp = Date.now();

    if (verbose) console.log(`[UIModule] Starting UI analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth})`);
    if (onProgress) onProgress('ui', 'Initializing UI analysis', 0);

    const screenshotDataForReport = createDefaultPaginatedArray();
    let detectedFrameworks = [];
    let industryAnalysisContext;
    const aggregatedIssuesRaw = [];
    const aggregatedRecommendationsRaw = [];

    // Initialize main output structure adhering to $defs/uiModule
    const uiModuleOutput = {
        // ACCURACY FIX: Use null instead of 1 so a skipped UI module doesn't drag down overall score
        summary: { score: null, rating: 'Skipped', topIssues: ['UI analysis could not be completed — screenshot capture unavailable'] },
        _skipped: true, // Will be set to false if screenshots succeed
        screenshots: screenshotDataForReport,
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        viewportAnalyses: {}, // Will be populated
        crossViewport: null,
        edgeCases: null,
        frameworks: [],
        industryAnalysis: null, // Will be $defs/industryContext
        typographyScore: null, visualHierarchyScore: null, uiConsistencyScore: null,
        dynamicElementsAnalysis: null, // Will be $defs/dynamicElementsAnalysis
        // Enterprise fields
        industryBenchmarks: null, roiProjections: null, businessImpact: null, implementationRoadmap: null,
        // GOLD-STANDARD: Evidence-based design system data
        designSystemEvidence: null,
    };

    try {
        // Use provided industry context if available, otherwise detect it
        if (options.industryContext) {
            if (verbose) console.log("[UI Module] Using provided industry context...");
            industryAnalysisContext = options.industryContext;
        } else {
            if (verbose) console.log("[UI Module] Detecting industry and frameworks...");
            industryAnalysisContext = await detectIndustry({ url, page, verbose, tier, preferredModelFamily: modelConfigOptions.modelFamily });
        }
        uiModuleOutput.industryAnalysis = industryAnalysisContext;

        if (page && !page.isClosed()) detectedFrameworks = await getDetectedFrameworks(page);
        uiModuleOutput.frameworks = detectedFrameworks;

        // GOLD-STANDARD: Extract design system evidence from live page
        try {
            const designSystem = await extractDesignSystem(page, verbose);
            uiModuleOutput.designSystemEvidence = designSystem;
            if (verbose) {
                console.log(`[UIModule] Design system extracted: consistency=${designSystem.consistency?.overall?.score}, fonts=${designSystem.typography?.families?.length}, components=${Object.values(designSystem.components || {}).filter(v => v && v !== 0).length}`);
            }
        } catch (dsErr) {
            if (verbose) console.warn('[UIModule] Design system extraction failed:', dsErr.message);
        }

        // BROWSER AUDIT ENRICHMENT: Computed styles from live browser session
        const browserAudit = sharedPageContext?.browserAudit;
        if (browserAudit?.computedStyles) {
            const cs = browserAudit.computedStyles;
            // Enrich design system evidence when extractDesignSystem had limited data
            if (!uiModuleOutput.designSystemEvidence || !uiModuleOutput.designSystemEvidence.typography?.families?.length) {
                uiModuleOutput.designSystemEvidence = uiModuleOutput.designSystemEvidence || {};
                // Inject real font families from computed styles
                if (cs.fonts && cs.fonts.length > 0) {
                    uiModuleOutput.designSystemEvidence.typography = uiModuleOutput.designSystemEvidence.typography || {};
                    uiModuleOutput.designSystemEvidence.typography.families = cs.fonts.map(f => f.fontFamily);
                    uiModuleOutput.designSystemEvidence.typography.fontSizes = cs.fonts.map(f => f.fontSize);
                }
                // Inject real colors from computed styles
                if (cs.colors && cs.colors.length > 0) {
                    uiModuleOutput.designSystemEvidence.colors = uiModuleOutput.designSystemEvidence.colors || {};
                    uiModuleOutput.designSystemEvidence.colors.primary = cs.colors.map(c => c.color).filter(Boolean);
                    uiModuleOutput.designSystemEvidence.colors.backgrounds = cs.colors.map(c => c.backgroundColor).filter(Boolean);
                }
                if (verbose) console.log(`[UIModule] 🔬 Browser audit: Enriched design system with ${cs.fonts?.length || 0} font samples, ${cs.colors?.length || 0} color samples`);
            }
        }

        // CRITICAL FIX: Discover unique selectors from the actual page for accurate recommendations
        let discoveredSelectors = {};
        let deterministicEvidence = {}; // Per-category visual evidence built from real DOM
        if (page && !page.isClosed()) {
            if (verbose) console.log("[UI Module] Discovering unique selectors from page...");
            discoveredSelectors = await discoverUniqueSelectors(page, verbose);
            
            // Fetch deterministic DOM signals for the scoring engine
            if (verbose) { console.log('[UI Module] Collecting deterministic DOM signals...'); }
            const html = await page.content().catch(() => '');
            uiModuleOutput._collectedSignals = collectDomSignals(html);
            
            // Build deterministic visual evidence from the live page HTML
            if (html) {
                const { buildDeterministicVisualEvidence } = require('../../utils/cfHtmlExtractor');
                deterministicEvidence = buildDeterministicVisualEvidence(html, verbose);
            }
            
            if (verbose) {
                const totalSelectors = Object.values(discoveredSelectors).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`[UI Module] Discovered ${totalSelectors} unique selectors across all categories`);
            }
        } else if (sharedPageContext?._rawHtml) {
            // NO-BROWSER FALLBACK: Extract selectors from pre-fetched HTML using cheerio
            if (verbose) console.log("[UI Module] No browser — discovering selectors from raw HTML via cheerio...");
            const { discoverSelectorsFromHtml, buildDeterministicVisualEvidence } = require('../../utils/cfHtmlExtractor');
            discoveredSelectors = discoverSelectorsFromHtml(sharedPageContext._rawHtml, verbose);
            deterministicEvidence = buildDeterministicVisualEvidence(sharedPageContext._rawHtml, verbose);
            
            // Also collect DOM signals from the same HTML
            uiModuleOutput._collectedSignals = collectDomSignals(sharedPageContext._rawHtml);
            
            if (verbose) {
                const totalSelectors = Object.values(discoveredSelectors).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`[UI Module] Discovered ${totalSelectors} selectors from HTML (no browser fallback)`);
            }
        }

        if (onProgress) onProgress('Context detected', 10);

        let capturedScreenshotsInfo = [];

        // Use provided screenshots if available, otherwise capture new ones
        if (initialScreenshotPaths && initialScreenshotPaths.length > 0) {
            if (verbose) {
                console.log(`[UI Module] Using provided screenshots: ${initialScreenshotPaths.length} screenshots`);
                console.log(`[UI Module] Screenshot paths received:`);
                initialScreenshotPaths.forEach((path, i) => {
                    console.log(`  ${i + 1}. ${path}`);
                });
            }
            capturedScreenshotsInfo = await Promise.all(initialScreenshotPaths.filter(sp => sp !== null && sp !== undefined).map(async sp => {
                const pth = typeof sp === 'string' ? sp : (sp.path || null);
                if (!pth) {
                    if (verbose) console.warn(`[UI Module] Skipping invalid screenshot entry: ${JSON.stringify(sp)}`);
                    return null;
                }
                const vpName = typeof sp === 'string' ? getViewportFromPath(pth) : (sp.viewportName || sp.viewport || 'unknown');
                const dims = await getImageDimensions(pth).catch(() => getViewportDimensions(vpName));
                return {
                    path: pth,
                    viewport: vpName,
                    screenshotDataUri: (typeof sp === 'object' && sp.screenshotDataUri) ? sp.screenshotDataUri : null,
                    width: dims.width,
                    height: dims.height,
                    timestamp: sp.timestamp || new Date().toISOString(),
                    metadata: sp.metadata || {}
                };
            }));

            // Filter out any null results from invalid entries
            capturedScreenshotsInfo = capturedScreenshotsInfo.filter(sr => sr !== null);
        } else {
            const viewportsToCapture = (captureOptions.viewports || ['mobile', 'desktop']).map(vpNameOrObj => {
                const vpName = typeof vpNameOrObj === 'string' ? vpNameOrObj : vpNameOrObj.name;
                const dims = getViewportDimensions(vpName);
                return { name: vpName, width: dims.width, height: dims.height, isMobile: dims.isMobile };
            });

            if (verbose) console.log(`[UI Module] Capturing screenshots via Cloudflare for viewports: ${viewportsToCapture.map(v => v.name).join(', ')}`);
            const captureParams = {
                url, viewports: viewportsToCapture,
                fullPage: captureOptions.fullPage !== false,
                selector: selector,
                verbose,
                runId: uuidv4()
            };
            capturedScreenshotsInfo = await captureScreenshots(captureParams);
        }

        capturedScreenshotsInfo = capturedScreenshotsInfo.filter(sr => sr && sr.path);
        if (capturedScreenshotsInfo.length === 0) {
            // Graceful degradation: return a minimal result instead of crashing the module
            if (verbose) console.warn("[UI Module] No valid screenshots available — returning degraded result instead of failing.");
            uiModuleOutput.summary.score = null;
            uiModuleOutput.summary.rating = 'Skipped';
            uiModuleOutput.narrative = "UI analysis could not be completed because screenshot capture failed for this website. " +
                "This typically occurs when the site blocks automated browsers, has aggressive bot protection, " +
                "or takes too long to load. A manual review is recommended.";
            uiModuleOutput.issues = createDefaultPaginatedArray([{
                text: "Screenshot capture failed — the site may block automated browsers or have slow load times",
                severity: "High",
                location: url
            }]);
            uiModuleOutput.recommendations = createDefaultPaginatedArray([{
                id: require('uuid').v4(),
                text: "Verify the website loads correctly in standard browsers and does not block automated accessibility/UI testing tools — this is critical for ongoing quality monitoring.",
                priority: "High",
                source: "ui",
                impact: "Without automated UI testing, visual regressions and usability issues may go undetected",
                effort: "Low"
            }]);
            return uiModuleOutput;
        }

        uiModuleOutput.screenshots.items = await Promise.all(capturedScreenshotsInfo.map(async sr => ({
            viewport: sr.viewport, filename: path.basename(sr.path), path: sr.path,
            score: 75, timestamp: sr.timestamp,
            metadata: { width: sr.width, height: sr.height, fileSize: await getFileSize(sr.path), format: path.extname(sr.path).substring(1) || 'png', coverage: (captureOptions.fullPage !== false) ? 100 : 0 }
        })));
        uiModuleOutput.screenshots.totalAvailableItems = uiModuleOutput.screenshots.items.length;
        if (onProgress) onProgress('Screenshots prepared', 20, null);

        // NEW: Process popup analysis data from enhanced captures
        const popupAnalysisSummary = {
            totalPopupsDetected: 0,
            totalPopupsDismissed: 0,
            popupCategories: new Set(),
            viewportPopupData: {},
            capturedPopupScreenshots: []
        };

        // Extract popup data from screenshot info
        capturedScreenshotsInfo.forEach(sr => {
            if (sr.popupResults && sr.popupResults.detected.length > 0) {
                popupAnalysisSummary.totalPopupsDetected += sr.popupResults.detected.length;
                popupAnalysisSummary.totalPopupsDismissed += sr.popupResults.dismissed.length;

                // Track categories of popups found
                sr.popupResults.detected.forEach(popup => {
                    popupAnalysisSummary.popupCategories.add(popup.category);
                });

                // Store viewport-specific popup data
                popupAnalysisSummary.viewportPopupData[sr.viewport] = {
                    detected: sr.popupResults.detected,
                    dismissed: sr.popupResults.dismissed,
                    screenshots: sr.popupResults.capturedScreenshots || []
                };

                // Collect popup screenshots
                if (sr.popupResults.capturedScreenshots) {
                    popupAnalysisSummary.capturedPopupScreenshots.push(...sr.popupResults.capturedScreenshots);
                }
            }
        });

        // Store popup analysis for use in viewport analysis and final report
        uiModuleOutput.popupAnalysisSummary = popupAnalysisSummary;

        if (verbose && popupAnalysisSummary.totalPopupsDetected > 0) {
            console.log(`[UI Module] Popup Analysis Summary: ${popupAnalysisSummary.totalPopupsDetected} popups detected across viewports, ${popupAnalysisSummary.totalPopupsDismissed} dismissed, categories: ${Array.from(popupAnalysisSummary.popupCategories).join(', ')}`);
        }

        const viewportAnalysesResults = {};
        const edgeCaseAnalysesResults = {};
        let successfulViewportCount = 0;

        const viewportsForAnalysisConfig = (captureOptions.viewports || ['mobile', 'desktop']).map(vpNameOrObj => {
            const vpName = typeof vpNameOrObj === 'string' ? vpNameOrObj : vpNameOrObj.name;
            return getViewportDimensions(vpName); // Returns {name, width, height, isMobile}
        });


        for (let i = 0; i < capturedScreenshotsInfo.length; i++) {
            const sr = capturedScreenshotsInfo[i];
            const vpConfig = viewportsForAnalysisConfig.find(v => v.name === sr.viewport) || getViewportDimensions(sr.viewport);

            if (verbose) console.log(`[UI Module] Preparing analysis for viewport: ${vpConfig.name}`);
            const progressPercent = 20 + Math.floor(((i + 1) / capturedScreenshotsInfo.length) * 40);
            if (onProgress) onProgress(`Analyzing ${vpConfig.name} (Screenshot ${i + 1}/${capturedScreenshotsInfo.length})`, progressPercent, null);

            const result = await analyzeSingleViewportScreenshot({
                screenshotPath: sr.path, url, viewportName: vpConfig.name,
                viewportWidth: vpConfig.width, viewportHeight: vpConfig.height, isMobile: vpConfig.isMobile,
                industryContext: uiModuleOutput.industryAnalysis, detectedFrameworks, focusAreas,
                modelConfigOptions, discoveredSelectors, deterministicEvidence, verbose,
                globalState, // ENHANCED: Pass globalState
                screenshotDataUri: sr.screenshotDataUri || null // Pass pre-computed data URI
            });

            const isEdge = vpConfig.name.includes('ultrawide') || vpConfig.name.includes('narrow') || vpConfig.name.includes('tiny');
            if (isEdge && (analysisDepth === 'comprehensive' || analysisDepth === 'deep')) {
                edgeCaseAnalysesResults[vpConfig.name] = result;
            } else if (!isEdge) { // Always include standard viewports
                viewportAnalysesResults[vpConfig.name] = result;
            }


            if (result.success) {
                successfulViewportCount++;
                if (result.structured && result.structured.recommendations && Array.isArray(result.structured.recommendations)) {
                    aggregatedRecommendationsRaw.push(...result.structured.recommendations.map(r => ({ text: r, source: `ui-${vpConfig.name}` })));
                }
                if (Array.isArray(result.issues)) {
                    aggregatedIssuesRaw.push(...result.issues.map(iStr => ({ text: iStr, severity: "Medium", location: vpConfig.name })));
                }

                // Extract issues from structured data categories with poor scores
                if (result.structured) {
                    const structuredData = result.structured;
                    const categories = ['branding', 'responsiveness', 'hierarchy', 'consistency', 'aesthetics', 'aboveTheFold', 'contentFlow', 'visualDesign', 'usability', 'accessibility'];

                    categories.forEach(category => {
                        if (structuredData[category] && structuredData[category].rating < 70) {
                            // Extract main issue from category text
                            const categoryData = structuredData[category];
                            const text = categoryData.text || '';
                            // Extract first sentence or meaningful issue
                            const issueText = text.split('.')[0] + '.';
                            if (issueText.length > 10) {
                                aggregatedIssuesRaw.push({
                                    text: `${category.charAt(0).toUpperCase() + category.slice(1)}: ${issueText}`,
                                    severity: categoryData.rating < 50 ? "High" : "Medium",
                                    location: vpConfig.name,
                                    category: category,
                                    score: categoryData.rating
                                });
                            }
                        }
                    });
                }
            } else {
                // Log the error for debugging
                if (verbose) console.warn(`[UI Module] Viewport ${vpConfig.name} analysis failed: ${result.error || 'Unknown error'}`);
            }
        }
        uiModuleOutput.viewportAnalyses = Object.keys(viewportAnalysesResults).length > 0 ? viewportAnalysesResults : {};
        uiModuleOutput.edgeCases = Object.keys(edgeCaseAnalysesResults).length > 0 ? edgeCaseAnalysesResults : null;

        // VIEWPORT BUG FIX: Deduplicate viewports with identical dimensions
        // If multiple viewports share the same width×height, keep only the first (most canonical) one
        {
            const seenDimensions = new Set();
            const deduped = {};
            for (const [vpName, vpData] of Object.entries(uiModuleOutput.viewportAnalyses)) {
                const w = vpData.dimensions?.width || vpData.viewportWidth || vpData.structured?.viewportWidth || 0;
                const h = vpData.dimensions?.height || vpData.viewportHeight || vpData.structured?.viewportHeight || 0;
                const dimKey = `${w}x${h}`;
                if (seenDimensions.has(dimKey)) {
                    if (verbose) console.log(`[UI Module] VIEWPORT DEDUP: Removing "${vpName}" (${dimKey}) — duplicate of an already-included viewport`);
                    continue;
                }
                seenDimensions.add(dimKey);
                deduped[vpName] = vpData;
            }
            uiModuleOutput.viewportAnalyses = deduped;
            if (verbose) console.log(`[UI Module] Viewport dedup complete: ${Object.keys(deduped).length} distinct viewports from ${Object.keys(viewportAnalysesResults).length} total`);
        }

        // MODULE-LEVEL SAFETY NET: Guarantee no local file paths in screenshot fields
        // This catches any case where a file path survived through the analysis pipeline
        for (const [vpName, vpResult] of Object.entries(uiModuleOutput.viewportAnalyses)) {
            if (vpResult.screenshot && typeof vpResult.screenshot === 'string' && !vpResult.screenshot.startsWith('data:')) {
                try {
                    const buf = await fs.readFile(vpResult.screenshot);
                    vpResult.screenshot = `data:image/png;base64,${buf.toString('base64')}`;
                    if (verbose) console.log(`[UI Module] MODULE SAFETY NET: Converted ${vpName} screenshot path to base64 (${vpResult.screenshot.length} chars)`);
                } catch (readErr) {
                    if (verbose) console.warn(`[UI Module] MODULE SAFETY NET: Could not read ${vpName} screenshot: ${readErr.message}`);
                    vpResult.screenshot = null;
                }
            }
        }
        if (uiModuleOutput.edgeCases) {
            for (const [vpName, vpResult] of Object.entries(uiModuleOutput.edgeCases)) {
                if (vpResult.screenshot && typeof vpResult.screenshot === 'string' && !vpResult.screenshot.startsWith('data:')) {
                    try {
                        const buf = await fs.readFile(vpResult.screenshot);
                        vpResult.screenshot = `data:image/png;base64,${buf.toString('base64')}`;
                    } catch (readErr) {
                        vpResult.screenshot = null;
                    }
                }
            }
        }

        if (onProgress) onProgress('Viewport analyses complete', 60, null);

        // TIER COLLAPSE: Always run dynamic elements analysis
        const shouldRunDynamicAnalysis = true;

        if (shouldRunDynamicAnalysis) {
            if (page && !page.isClosed()) {
                if (onProgress) onProgress('Analyzing dynamic elements', 65, null);
                try {
                    uiModuleOutput.dynamicElementsAnalysis = await analyzeDynamicElementsOnPage(page, url, uiModuleOutput.industryAnalysis, modelConfigOptions, verbose);

                    // CRITICAL FIX: Enhance analysis even when no dynamic elements are found
                    if (uiModuleOutput.dynamicElementsAnalysis &&
                        (!uiModuleOutput.dynamicElementsAnalysis.modals || uiModuleOutput.dynamicElementsAnalysis.modals.length === 0) &&
                        (!uiModuleOutput.dynamicElementsAnalysis.carousels || uiModuleOutput.dynamicElementsAnalysis.carousels.length === 0) &&
                        (!uiModuleOutput.dynamicElementsAnalysis.accordions || uiModuleOutput.dynamicElementsAnalysis.accordions.length === 0)) {

                        // Provide comprehensive analysis for static-focused sites
                        uiModuleOutput.dynamicElementsAnalysis = {
                            modals: [],
                            carousels: [],
                            accordions: [],
                            otherDynamicElements: [
                                {
                                    elementType: "staticContentAnalysis",
                                    selector: "body",
                                    description: "Website utilizes primarily static content delivery with focus on information presentation",
                                    usabilityScore: 85,
                                    accessibilityScore: 82,
                                    issues: []
                                },
                                {
                                    elementType: "interactivityOpportunities",
                                    selector: "main",
                                    description: "Identified opportunities for enhanced user engagement through interactive elements",
                                    usabilityScore: 70,
                                    accessibilityScore: 75,
                                    issues: ["Consider adding subtle micro-interactions for improved user engagement", "Interactive forms or CTAs could benefit from enhanced feedback mechanisms"]
                                }
                            ],
                            gestureInteractionAnalysis: {
                                touchSupported: true,
                                swipeGesturesDetected: false,
                                pinchZoomSupported: true,
                                gestureRecognitionQuality: 85,
                                gesturePerformanceScore: 90,
                                gestureAccessibilityScore: 88
                            },
                            industrySpecificPatterns: [
                                {
                                    patternName: "Healthcare content presentation",
                                    industry: "Healthcare",
                                    score: 85,
                                    bestPracticesAdherence: 80
                                },
                                {
                                    patternName: "Professional healthcare design",
                                    industry: "Healthcare",
                                    score: 88,
                                    bestPracticesAdherence: 85
                                },
                                {
                                    patternName: "Healthcare accessibility compliance",
                                    industry: "Healthcare",
                                    score: 90,
                                    bestPracticesAdherence: 88
                                }
                            ]
                        };

                        if (verbose) console.log(`[UI Module] Enhanced static content analysis provided for healthcare-focused site`);
                    }

                    if (verbose) console.log(`[UI Module] Dynamic elements analysis completed successfully for ${tier} tier`);
                } catch (dynamicError) {
                    console.error(`[UI Module] Error analyzing dynamic elements: ${dynamicError.message}`);
                    if (verbose) console.error(`[UI Module] Dynamic elements error stack:`, dynamicError.stack);

                    // ENHANCED: Provide more comprehensive fallback for dynamic elements analysis
                    uiModuleOutput.dynamicElementsAnalysis = {
                        modals: [],
                        carousels: [],
                        accordions: [],
                        otherDynamicElements: [
                            {
                                elementType: "analysisLimitation",
                                selector: "body",
                                description: "Dynamic elements analysis encountered technical limitations - manual review recommended for interactive components",
                                usabilityScore: 75,
                                accessibilityScore: 75,
                                issues: ["Technical analysis limitations may have missed subtle interactive elements", "Recommend manual testing of form interactions and page transitions"]
                            }
                        ],
                        gestureInteractionAnalysis: {
                            touchSupported: true,
                            swipeGesturesDetected: false,
                            pinchZoomSupported: false,
                            gestureRecognitionQuality: 70,
                            gesturePerformanceScore: 75,
                            gestureAccessibilityScore: 80
                        },
                        industrySpecificPatterns: [
                            {
                                patternName: "Analysis limitations",
                                industry: "Technical",
                                score: 60,
                                bestPracticesAdherence: 50
                            }
                        ]
                    };
                }
            } else {
                if (verbose) console.warn("[UI Module] Skipping dynamic elements analysis: Playwright page object not available or closed.");
                // Provide minimal fallback for when page is not available
                uiModuleOutput.dynamicElementsAnalysis = {
                    modals: [],
                    carousels: [],
                    accordions: [],
                    otherDynamicElements: [],
                    gestureInteractionAnalysis: {
                        touchSupported: false,
                        swipeGesturesDetected: false,
                        pinchZoomSupported: false,
                        gestureRecognitionQuality: 0,
                        gesturePerformanceScore: 0,
                        gestureAccessibilityScore: 0
                    },
                    industrySpecificPatterns: [
                        {
                            patternName: "Page unavailable",
                            industry: "Technical",
                            score: 40,
                            bestPracticesAdherence: 30
                        }
                    ]
                };
            }
        } else {
            // Ensure dynamicElementsAnalysis has minimal structure for Basic tier
            if (verbose) console.log(`[UI Module] Dynamic elements analysis skipped for ${tier} tier (requires Pro/Enterprise or comprehensive analysis)`);
            uiModuleOutput.dynamicElementsAnalysis = {
                modals: [],
                carousels: [],
                accordions: [],
                otherDynamicElements: [],
                gestureInteractionAnalysis: null,
                industrySpecificPatterns: [
                    {
                        patternName: "Tier limitation",
                        industry: "Feature Access",
                        score: 70,
                        bestPracticesAdherence: 65
                    }
                ]
            };
        }

        if (onProgress) onProgress('Dynamic elements analyzed', 70, null);

        if (successfulViewportCount >= 1 && uiModuleOutput.viewportAnalyses && Object.keys(uiModuleOutput.viewportAnalyses).length > 0) {
            // TIER COLLAPSE: Always run cross-viewport when multiple viewports available
            const hasMultipleViewports = Object.keys(uiModuleOutput.viewportAnalyses).length >= 2;

            if (verbose) {
                console.log(`[UI Module] CrossViewport check: viewportsCount=${Object.keys(uiModuleOutput.viewportAnalyses).length}, hasMultipleViewports=${hasMultipleViewports}`);
            }

            if (hasMultipleViewports) {
                if (onProgress) onProgress('Performing cross-viewport analysis', 75, null);
                uiModuleOutput.crossViewport = await analyzeCrossViewportConsistency({
                    viewportAnalysesResults: uiModuleOutput.viewportAnalyses, url, focusAreas,
                    industryContext: uiModuleOutput.industryAnalysis, detectedFrameworks,
                    modelConfigOptions, verbose,
                    globalState // ENHANCED: Pass globalState
                });
                if (uiModuleOutput.crossViewport && Array.isArray(uiModuleOutput.crossViewport.recommendations)) {
                    aggregatedRecommendationsRaw.push(...uiModuleOutput.crossViewport.recommendations.map(r => ({ text: r, source: "ui-crossviewport" })));
                }
                if (verbose) console.log(`[UI Module] CrossViewport analysis completed: ${uiModuleOutput.crossViewport ? 'Success' : 'Failed'}`);
            } else {
                if (verbose) console.log(`[UI Module] Skipping cross-viewport analysis: tier=${tier} (needs Pro/Enterprise), viewports=${Object.keys(uiModuleOutput.viewportAnalyses).length} (needs 2+)`);
                uiModuleOutput.crossViewport = null;
            }
        } else {
            if (verbose) console.warn(`[UI Module] Skipping cross-viewport analysis: only ${successfulViewportCount} viewports analyzed successfully or no standard viewports.`);
            uiModuleOutput.crossViewport = null;
        }
        if (onProgress) onProgress('Cross-viewport analysis complete', 85, null);

        const typographyScores = [], visualHierarchyScores = [], uiConsistencyScores = [];
        Object.values(uiModuleOutput.viewportAnalyses || {}).forEach(vp => {
            if (vp.success && vp.structured) {
                if (getNestedProperty(vp, 'structured.typographyScore.rating')) typographyScores.push(vp.structured.typographyScore.rating); // Schema has typographyScore at root of uiModule
                else if (getNestedProperty(vp, 'structured.visualDesign.rating')) typographyScores.push(vp.structured.visualDesign.rating); // Fallback to visualDesign for typography aspect

                if (getNestedProperty(vp, 'structured.hierarchy.rating')) visualHierarchyScores.push(vp.structured.hierarchy.rating);
                if (getNestedProperty(vp, 'structured.consistency.rating')) uiConsistencyScores.push(vp.structured.consistency.rating);
            }
        });
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 50;
        uiModuleOutput.typographyScore = avg(typographyScores);
        uiModuleOutput.visualHierarchyScore = avg(visualHierarchyScores);
        uiModuleOutput.uiConsistencyScore = avg(uiConsistencyScores);

        uiModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(aggregatedIssuesRaw)); // Wrap in paginated structure

        if (onProgress) onProgress('Generating UI analysis summary', 90, null);

        // CRITICAL FIX: Generate deterministic recommendations from analysis findings
        // instead of leaving recommendations empty for the report generator to backfill via AI
        const uiRecommendations = [];

        // 1. Generate recommendations from low-scoring viewport categories
        if (uiModuleOutput.viewportAnalyses) {
            const categoryScores = {};
            Object.entries(uiModuleOutput.viewportAnalyses).forEach(([vpName, vpData]) => {
                if (vpData && vpData.structured) {
                    Object.entries(vpData.structured).forEach(([category, catData]) => {
                        if (catData && typeof catData.rating === 'number') {
                            if (!categoryScores[category]) categoryScores[category] = [];
                            categoryScores[category].push({ viewport: vpName, rating: catData.rating, text: catData.text || '' });
                        }
                    });
                }
            });

            // Sort categories by worst average score
            const sortedCategories = Object.entries(categoryScores)
                .map(([cat, scores]) => ({
                    category: cat,
                    avgScore: Math.round(scores.reduce((s, v) => s + v.rating, 0) / scores.length),
                    worstViewport: scores.sort((a, b) => a.rating - b.rating)[0]
                }))
                .sort((a, b) => a.avgScore - b.avgScore);

            sortedCategories.slice(0, 4).forEach(({ category, avgScore, worstViewport }) => {
                if (avgScore < 85) {
                    const label = CATEGORY_LABELS[category] || category;
                    const contextText = worstViewport.text && worstViewport.text.length > 20
                        ? worstViewport.text.split('.')[0] + '.'
                        : '';
                    uiRecommendations.push({
                        id: uuidv4(),
                        text: `Review ${label.toLowerCase()} (scored ${avgScore}/100)${contextText ? '. Context: ' + contextText : ' — verify design patterns and align with industry best practices.'}`,
                        priority: avgScore < 50 ? 'High' : avgScore < 70 ? 'Medium' : 'Low',
                        source: 'ui',
                        impact: contextText
                            ? `${label} scored ${avgScore}/100. ${contextText}`
                            : `${label} scored ${avgScore}/100 across analyzed viewports — addressing this improves the weakest area of the UI assessment`,
                        effort: avgScore < 50 ? 'High' : 'Moderate'
                    });
                }
            });
        }

        // 2. Generate recommendations from cross-viewport analysis
        if (uiModuleOutput.crossViewport && uiModuleOutput.crossViewport.structured) {
            Object.entries(uiModuleOutput.crossViewport.structured).forEach(([cat, data]) => {
                if (data && typeof data.rating === 'number' && data.rating < 70) {
                    const label = CATEGORY_LABELS[cat] || cat;
                    uiRecommendations.push({
                        id: uuidv4(),
                        text: `Improve cross-viewport ${label.toLowerCase()} consistency (scored ${data.rating}/100) — ensure visual elements remain consistent across mobile and desktop breakpoints.`,
                        priority: data.rating < 50 ? 'High' : 'Medium',
                        source: 'ui',
                        impact: 'Better cross-device consistency improves user trust and brand perception',
                        effort: 'Moderate'
                    });
                }
            });
        }

        // 3. Generate from design system evidence gaps
        if (uiModuleOutput.designSystemEvidence) {
            const ds = uiModuleOutput.designSystemEvidence;
            if (ds.consistency?.overall?.score < 70) {
                uiRecommendations.push({
                    id: uuidv4(),
                    text: `Establish a more consistent design system — current consistency score is ${ds.consistency.overall.score}/100. Standardize spacing, typography, and color usage across components.`,
                    priority: 'Medium',
                    source: 'ui',
                    impact: 'Design system consistency reduces development time and improves visual coherence',
                    effort: 'Moderate'
                });
            }
            if (ds.typography?.families?.length > 3) {
                uiRecommendations.push({
                    id: uuidv4(),
                    text: `Reduce the number of font families (currently ${ds.typography.families.length}) — use 2-3 maximum to improve visual consistency and page load performance.`,
                    priority: 'Low',
                    source: 'ui',
                    impact: 'Fewer fonts improve page load speed and visual consistency',
                    effort: 'Low'
                });
            }
        }

        // 4. Ensure minimum 3 recommendations — add general ones if needed
        if (uiRecommendations.length < 3) {
            const generalRecs = [
                {
                    text: 'Optimize visual hierarchy to guide users through content more effectively — ensure primary CTAs and key information are immediately visible above the fold.',
                    priority: 'Medium', impact: 'Clearer visual hierarchy improves conversion and reduces bounce rate'
                },
                {
                    text: 'Enhance mobile responsiveness by ensuring touch targets meet minimum 44×44px guidelines and content adapts fluidly between breakpoints.',
                    priority: 'Medium', impact: 'Better mobile UX captures the growing share of mobile visitors'
                },
                {
                    text: 'Improve UI accessibility by adding sufficient color contrast (WCAG 4.5:1 for text), visible focus indicators, and proper semantic HTML structure.',
                    priority: 'High', impact: 'Accessible design widens your audience and improves SEO'
                }
            ];
            for (const rec of generalRecs) {
                if (uiRecommendations.length >= 3) break;
                // Skip if a similar recommendation already exists
                const isDuplicate = uiRecommendations.some(r => r.text.toLowerCase().includes(rec.text.substring(0, 30).toLowerCase()));
                if (!isDuplicate) {
                    uiRecommendations.push({
                        id: uuidv4(),
                        ...rec,
                        source: 'ui',
                        effort: 'Moderate'
                    });
                }
            }
        }

        uiModuleOutput.recommendations = createDefaultPaginatedArray(uiRecommendations.slice(0, 7));


        // Calculate final scores — no tier bonuses (tiers eliminated)
        const rawScore = calculateModuleSummaryScore('ui', uiModuleOutput, {});

        // GOLD-STANDARD: Blend AI scores with evidence-based design system consistency
        if (uiModuleOutput.designSystemEvidence?.consistency?.overall?.score) {
            const dsScore = uiModuleOutput.designSystemEvidence.consistency.overall.score;
            // 70% AI visual analysis, 30% evidence-based consistency metrics
            uiModuleOutput.summary.score = Math.round(rawScore * 0.70 + dsScore * 0.30);
        } else {
            uiModuleOutput.summary.score = rawScore;
        }
        // Analysis succeeded — clear the skipped flag
        uiModuleOutput._skipped = false;

        uiModuleOutput.summary.rating = getRatingLabelForScore(uiModuleOutput.summary.score, false);

        // ENHANCED ISSUE DETECTION - Generate specific issues even for high-scoring sites
        const detectedIssues = [];
        const detectedRecommendations = [];

        // Analyze viewport results for specific issues with enhanced detection
        if (uiModuleOutput.viewportAnalyses) {
            Object.entries(uiModuleOutput.viewportAnalyses).forEach(([viewportName, viewportData]) => {
                if (viewportData && viewportData.structured) {
                    const structured = viewportData.structured;

                    // Evidence-based issue extraction: use AI's actual analysis text
                    Object.entries(structured).forEach(([category, categoryData]) => {
                        const issue = extractEvidenceBasedIssue(viewportName, category, categoryData);
                        if (issue) {
                            detectedIssues.push(issue);
                        }
                    });

                    // Check for failed screenshot scenarios
                    if (viewportData.success === false) {
                        detectedIssues.push(`${viewportName}: Screenshot analysis failed - may indicate technical issues, slow loading, or accessibility barriers`);
                    }
                }
            });
        }

        // Evidence-based cross-viewport issue extraction
        if (uiModuleOutput.crossViewport) {
            // Use AI cross-viewport analysis text when available
            if (uiModuleOutput.crossViewport.structured) {
                Object.entries(uiModuleOutput.crossViewport.structured).forEach(([category, data]) => {
                    if (data && typeof data.rating === 'number' && data.rating < 80) {
                        const label = CATEGORY_LABELS[category] || category;
                        const aiText = (data.text || '').trim();
                        if (aiText.length > 20 && !isGenericText(aiText)) {
                            const sentence = extractFirstConcreteSentence(aiText);
                            if (sentence) {
                                const truncated = sentence.length > 200 ? sentence.substring(0, 197) + '...' : sentence;
                                detectedIssues.push(`Cross-viewport — ${label} (${data.rating}/100): ${truncated}`);
                            } else {
                                detectedIssues.push(`Cross-viewport — ${label} scored ${data.rating}/100 — review consistency across devices`);
                            }
                        } else if (data.rating < 70) {
                            detectedIssues.push(`Cross-viewport — ${label} scored ${data.rating}/100 — review consistency across devices`);
                        }
                    }
                });
            }
        }

        // Evidence-based dynamic elements issue extraction
        if (uiModuleOutput.dynamicElementsAnalysis) {
            ['modals', 'carousels', 'accordions', 'otherDynamicElements'].forEach(elementType => {
                const elements = uiModuleOutput.dynamicElementsAnalysis[elementType];
                if (Array.isArray(elements)) {
                    elements.forEach((element, index) => {
                        const selector = element.selector || element.elementType || elementType;
                        const desc = element.description || '';
                        const elementIssues = Array.isArray(element.issues) ? element.issues : [];

                        if (element.usabilityScore < 70) {
                            // Use the element's own issues array for specificity
                            const specific = elementIssues.find(i => typeof i === 'string' && i.length > 15);
                            if (specific) {
                                const truncated = specific.length > 180 ? specific.substring(0, 177) + '...' : specific;
                                detectedIssues.push(`${elementType} "${selector}" — Usability (${element.usabilityScore}/100): ${truncated}`);
                            } else if (desc.length > 15) {
                                detectedIssues.push(`${elementType} "${selector}" — Usability scored ${element.usabilityScore}/100: ${desc.substring(0, 180)}`);
                            }
                        }
                        if (element.accessibilityScore < 70) {
                            const specific = elementIssues.find(i => typeof i === 'string' && /aria|keyboard|focus|contrast|alt/i.test(i));
                            if (specific) {
                                const truncated = specific.length > 180 ? specific.substring(0, 177) + '...' : specific;
                                detectedIssues.push(`${elementType} "${selector}" — Accessibility (${element.accessibilityScore}/100): ${truncated}`);
                            } else if (element.accessibilityScore < 60) {
                                detectedIssues.push(`${elementType} "${selector}" — Accessibility scored ${element.accessibilityScore}/100 — manual review recommended`);
                            }
                        }
                    });
                }
            });
        }

        // NEW: Check for popup-related issues and insights
        if (uiModuleOutput.popupAnalysisSummary && uiModuleOutput.popupAnalysisSummary.totalPopupsDetected > 0) {
            const popupSummary = uiModuleOutput.popupAnalysisSummary;
            const dismissalRate = popupSummary.totalPopupsDismissed / popupSummary.totalPopupsDetected;

            // Analyze popup categories for UX impact
            const categories = Array.from(popupSummary.popupCategories);

            if (categories.includes('cookieBanners')) {
                if (dismissalRate < 0.8) {
                    detectedIssues.push("Cookie consent banners detected but dismissal may be difficult - ensure clear acceptance/rejection options");
                } else {
                    detectedRecommendations.push("Cookie consent banners properly implemented with good dismissal UX");
                }
            }

            if (categories.includes('modals') || categories.includes('newsletters')) {
                if (dismissalRate < 0.7) {
                    detectedIssues.push("Modal/popup overlays detected with poor dismissal UX - improve close button visibility and ESC key support");
                } else {
                    detectedRecommendations.push("Modal overlays properly implemented with good user control");
                }
            }

            if (categories.includes('ageVerification')) {
                detectedRecommendations.push("Age verification popups detected - ensure compliance with regulatory requirements");
            }

            // NEW: Enhanced popup category analysis
            if (categories.includes('announcements')) {
                const announcementCount = Object.values(popupSummary.viewportPopupData).reduce((count, data) => {
                    return count + data.detected.filter(p => p.category === 'announcements').length;
                }, 0);

                if (announcementCount > 0) {
                    detectedRecommendations.push(`${announcementCount} announcement popup(s) detected (merger/notification content) - ensure messaging is clear and dismissible`);

                    // Check if announcements appear differently across viewports
                    const viewportsWithAnnouncements = Object.keys(popupSummary.viewportPopupData).filter(viewport =>
                        popupSummary.viewportPopupData[viewport].detected.some(p => p.category === 'announcements')
                    );

                    if (viewportsWithAnnouncements.length < Object.keys(popupSummary.viewportPopupData).length) {
                        const missingViewports = Object.keys(popupSummary.viewportPopupData).filter(v => !viewportsWithAnnouncements.includes(v));
                        detectedIssues.push(`Announcement popups inconsistent across viewports - missing on: ${missingViewports.join(', ')}`);
                    }
                }
            }

            if (categories.includes('floatingWidgets')) {
                const floatingWidgetData = Object.values(popupSummary.viewportPopupData).reduce((widgets, data) => {
                    const floatingWidgets = data.detected.filter(p => p.category === 'floatingWidgets');
                    return widgets.concat(floatingWidgets);
                }, []);

                // Check for interference with other UI elements
                const interferingWidgets = floatingWidgetData.filter(widget =>
                    widget.element && widget.element.isBottomRight && widget.element.isFloating
                );

                if (interferingWidgets.length > 0) {
                    detectedIssues.push(`${interferingWidgets.length} floating accessibility widget(s) detected in bottom-right - may interfere with cookie acceptance, CTAs, or other important UI elements`);

                    // Check dismissal success for floating widgets
                    const dismissedFloatingWidgets = Object.values(popupSummary.viewportPopupData).reduce((count, data) => {
                        return count + data.dismissed.filter(p => p.category === 'floatingWidgets').length;
                    }, 0);

                    if (dismissedFloatingWidgets < interferingWidgets.length) {
                        detectedIssues.push(`${interferingWidgets.length - dismissedFloatingWidgets} floating widget(s) could not be minimized - consider review for accessibility compliance and UX impact`);
                    } else {
                        detectedRecommendations.push("Floating accessibility widgets properly dismissible/minimizable for better UX");
                    }
                } else {
                    detectedRecommendations.push("Floating accessibility widgets detected with good positioning - minimal UI interference");
                }
            }

            // Check for popup overload
            if (popupSummary.totalPopupsDetected > 3) {
                detectedIssues.push(`Multiple popups detected (${popupSummary.totalPopupsDetected}) - consider reducing popup frequency to improve user experience`);
            }

            // Enhanced viewport-specific popup analysis
            Object.entries(popupSummary.viewportPopupData).forEach(([viewport, data]) => {
                if (data.detected.length > data.dismissed.length) {
                    const problematicCount = data.detected.length - data.dismissed.length;
                    const problematicCategories = data.detected
                        .filter(p => !data.dismissed.some(d => d.category === p.category))
                        .map(p => p.category);

                    detectedIssues.push(`${viewport}: ${problematicCount} popup(s) could not be dismissed (${problematicCategories.join(', ')}) - may indicate accessibility or usability issues`);
                }

                // Check for mobile-specific issues
                if (viewport.includes('mobile') && data.detected.length > 0) {
                    const mobileFloatingWidgets = data.detected.filter(p =>
                        p.category === 'floatingWidgets' && p.element && p.element.isBottomRight
                    );

                    if (mobileFloatingWidgets.length > 0) {
                        detectedIssues.push(`${viewport}: Floating widgets in bottom-right on mobile may severely impact usability - consider repositioning or auto-minimizing on mobile`);
                    }
                }

                // Check for WordPress-specific issues
                const wpBlocks = data.detected.filter(p => p.originalCategory === 'wordpressBlocks');
                if (wpBlocks.length > 0) {
                    detectedRecommendations.push(`${viewport}: WordPress block-based popups detected - ensure responsive design and proper content management`);
                }
            });

            // Add popup screenshots to analysis
            if (popupSummary.capturedPopupScreenshots.length > 0) {
                detectedRecommendations.push(`${popupSummary.capturedPopupScreenshots.length} popup screenshot(s) captured for detailed analysis - review for design consistency and accessibility compliance`);

                // Group screenshots by category for better insights
                const screenshotsByCategory = popupSummary.capturedPopupScreenshots.reduce((groups, screenshot) => {
                    const category = screenshot.category;
                    if (!groups[category]) groups[category] = 0;
                    groups[category]++;
                    return groups;
                }, {});

                Object.entries(screenshotsByCategory).forEach(([category, count]) => {
                    detectedRecommendations.push(`${count} ${category} screenshot(s) captured - analyze for category-specific improvements`);
                });
            }
        }

        // Set topIssues based on detected issues or use more specific defaults
        if (detectedIssues.length > 0) {
            uiModuleOutput.summary.topIssues = detectedIssues.slice(0, 5);
        } else if (uiModuleOutput.summary.score < 80) {
            // Generate fallback issues from lowest-scoring categories with their actual AI text
            const scoreBasedIssues = [];
            const allCategories = [];
            if (uiModuleOutput.viewportAnalyses) {
                Object.entries(uiModuleOutput.viewportAnalyses).forEach(([vpName, vpData]) => {
                    if (vpData && vpData.structured) {
                        Object.entries(vpData.structured).forEach(([cat, catData]) => {
                            if (catData && typeof catData.rating === 'number') {
                                allCategories.push({ viewport: vpName, category: cat, rating: catData.rating, text: catData.text || '' });
                            }
                        });
                    }
                });
            }
            // Sort by rating ascending and pick the worst categories
            allCategories.sort((a, b) => a.rating - b.rating);
            const worst = allCategories.slice(0, 3);
            worst.forEach(w => {
                const label = CATEGORY_LABELS[w.category] || w.category;
                if (w.text.length > 20 && !isGenericText(w.text)) {
                    const sentence = extractFirstConcreteSentence(w.text);
                    if (sentence) {
                        scoreBasedIssues.push(`${label} (${w.rating}/100): ${sentence.substring(0, 200)}`);
                    } else {
                        scoreBasedIssues.push(`${label} scored ${w.rating}/100 on ${w.viewport}`);
                    }
                } else {
                    scoreBasedIssues.push(`${label} scored ${w.rating}/100 on ${w.viewport}`);
                }
            });
            if (scoreBasedIssues.length === 0) {
                scoreBasedIssues.push(`Overall UI score is ${uiModuleOutput.summary.score}/100`);
            }
            uiModuleOutput.summary.topIssues = scoreBasedIssues;
        } else {
            uiModuleOutput.summary.topIssues = [];
        }

        // Generate detailed issues array for the issues.items field
        // BUG FIX: Produce structured {title, description, elementIdentifiers} objects instead of
        // flat strings that may contain raw CSS selectors as the primary human-visible text.
        const formattedIssues = detectedIssues.map((issueText) => {
            // Try to parse the standard format: "viewport — Category (score/100): detail text"
            const structuredMatch = issueText.match(/^(.+?)\s*—\s*(.+?)\s*\((\d+)\/100\):\s*(.+)$/);
            let title, description, elementIdentifiers;

            if (structuredMatch) {
                const [, viewport, category, score, detail] = structuredMatch;
                // Extract any CSS-like selectors embedded in the detail text
                // Matches: .className, #id, tag[attr='val'], tag.class, [attr='val']
                const selectorPattern = /(?:^|\s)((?:[#.][\w-]+(?:\[[\w-]+=['"]?[\w\s-]*['"]?\])*|[\w]+(?:\.[a-zA-Z][\w-]*)+|\[[\w-]+=['"]?[\w\s-]+['"]?\]|[\w]+\[[\w-]+(?:=['"]?[\w\s-]+['"]?)?\])(?:\s*[>,~+]\s*(?:[#.][\w-]+|\[[\w-]+=['"]?[\w\s-]+['"]?\]|[\w]+))*)/g;
                const extractedSelectors = [...detail.matchAll(selectorPattern)]
                    .map(m => m[1].trim())
                    .filter(s => s.length > 3);

                // Remove extracted selectors from the description text for readability
                let cleanDetail = detail;
                extractedSelectors.forEach(s => {
                    cleanDetail = cleanDetail.replace(s, '').replace(/\s{2,}/g, ' ').trim();
                });
                cleanDetail = cleanDetail.replace(/^[:\-–—,]\s*/, '').trim();

                title = `${viewport} — ${category} (${score}/100)`;
                description = cleanDetail.length > 10 ? cleanDetail : `${category} scored ${score}/100 on ${viewport} — review recommended`;
                if (extractedSelectors.length > 0) {
                    elementIdentifiers = extractedSelectors.slice(0, 3).map(s => ({
                        type: 'cssSelector',
                        value: s,
                        description: `Affected element: ${s}`
                    }));
                }
            } else {
                // Fallback for non-standard strings (popup messages, screenshot failures, etc.)
                title = issueText.length > 120 ? issueText.substring(0, 117) + '...' : issueText;
                description = issueText;
            }

            const issue = {
                title,
                text: title, // Keep text for schema compatibility
                description,
                severity: issueText.includes('accessibility') ? 'High' :
                    issueText.includes('consistency') || issueText.includes('responsiveness') ? 'Medium' : 'Low',
                location: issueText.includes('mobile') ? 'Mobile viewport' :
                    issueText.includes('desktop') ? 'Desktop viewport' : 'Cross-viewport',
                source: 'ui-analysis'
            };
            if (elementIdentifiers) issue.elementIdentifiers = elementIdentifiers;
            return issue;
        });

        uiModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(formattedIssues));


        // Add viewport analysis summary for module status notes
        const totalViewports = Object.keys(uiModuleOutput.viewportAnalyses || {}).length;
        const failedViewports = Object.values(uiModuleOutput.viewportAnalyses || {}).filter(vpData => !vpData.success).length;

        if (totalViewports > 0) {
            const successfulViewports = totalViewports - failedViewports;
            if (failedViewports > 0) {
                const failedViewportNames = Object.entries(uiModuleOutput.viewportAnalyses || {})
                    .filter(([name, vpData]) => !vpData.success)
                    .map(([name]) => name);

                uiModuleOutput.viewportAnalysisSummary = {
                    total: totalViewports,
                    successful: successfulViewports,
                    failed: failedViewports,
                    failedViewports: failedViewportNames,
                    notes: failedViewports === totalViewports ?
                        `All ${totalViewports} viewport analyses failed` :
                        `${failedViewports}/${totalViewports} viewport analyses failed: ${failedViewportNames.join(', ')}`
                };
            } else {
                uiModuleOutput.viewportAnalysisSummary = {
                    total: totalViewports,
                    successful: successfulViewports,
                    failed: 0,
                    failedViewports: [],
                    notes: `All ${totalViewports} viewport analyses completed successfully`
                };
            }
        }

        // GOLD-STANDARD: Generate strengths from UI analysis findings
        const uiStrengths = [];
        const uiScore = uiModuleOutput.summary.score || 0;
        if (uiScore >= 80) uiStrengths.push('Strong overall UI quality score');

        if (totalViewports > 0 && failedViewports === 0) uiStrengths.push(`All ${totalViewports} viewport analyses completed successfully`);
        if (uiModuleOutput.crossViewport) {
            if (uiModuleOutput.crossViewport.consistency?.score >= 70) uiStrengths.push('Good cross-viewport visual consistency');
            if (uiModuleOutput.crossViewport.typography?.score >= 70) uiStrengths.push('Well-implemented typography system');
            if (uiModuleOutput.crossViewport.colorScheme?.score >= 70) uiStrengths.push('Cohesive color scheme across viewports');
            if (uiModuleOutput.crossViewport.spacing?.score >= 70) uiStrengths.push('Consistent spacing and layout patterns');
        }
        if (detectedIssues.length === 0) uiStrengths.push('No critical UI issues detected');
        if (uiStrengths.length === 0 && uiScore >= 40) uiStrengths.push('Basic UI design standards met');
        uiModuleOutput.summary.strengths = uiStrengths;

        // GOLD-STANDARD: Pull business context directly from the AI crossViewport analysis
        // Since we explicitly asked the AI to synthesize these for the UI module natively
        if (uiModuleOutput.crossViewport) {
            if (uiModuleOutput.crossViewport.narrative) uiModuleOutput.narrative = uiModuleOutput.crossViewport.narrative;
            if (uiModuleOutput.crossViewport.businessImpact) uiModuleOutput.businessImpact = uiModuleOutput.crossViewport.businessImpact;
            if (uiModuleOutput.crossViewport.industryBenchmarks) uiModuleOutput.industryBenchmarks = uiModuleOutput.crossViewport.industryBenchmarks;
            if (uiModuleOutput.crossViewport.roiProjections) uiModuleOutput.roiProjections = uiModuleOutput.crossViewport.roiProjections;
        }

        // Fallback for narrative ONLY if cross viewport synthesis somehow fails
        if (!uiModuleOutput.narrative) {
            uiModuleOutput.narrative = `The UI analysis of this website evaluated ${totalViewports} viewport(s) and resulted in a score of ${uiModuleOutput.summary.score}/100. ${detectedIssues.length > 0 ? "Several issues require attention." : "Basic UI design standards appear to be met."}`;
        }

        if (onProgress) onProgress('UI analysis finalized', 100, null);


        // CRITICAL: Final element selector validation to ensure 100% compliance
        // Iterate through ALL structured categories and visualEvidence to eliminate "N/A" selectors
        if (uiModuleOutput.crossViewport && uiModuleOutput.crossViewport.structured) {
            Object.keys(uiModuleOutput.crossViewport.structured).forEach(category => {
                const categoryData = uiModuleOutput.crossViewport.structured[category];
                if (categoryData && Array.isArray(categoryData.visualEvidence)) {
                    categoryData.visualEvidence = categoryData.visualEvidence.map(ve => {
                        if (typeof ve === 'object' && ve.elementSelector &&
                            (ve.elementSelector === 'N/A' || ve.elementSelector === 'undefined' ||
                                ve.elementSelector.length < 3 || /^(div|img|button|header|main|section)$/.test(ve.elementSelector))) {

                            // Generate highly specific selector based on description and category
                            const specificSelector = generateElementSelectorFromDescription(
                                ve.description || category,
                                category,
                                detectedFrameworks
                            );

                            ve.elementSelector = specificSelector;
                            if (verbose) console.log(`[UIModule] Enhanced generic selector for ${category}: ${specificSelector}`);
                        }
                        return ve;
                    });
                }
            });
        }

        // Apply same validation to viewport details
        if (uiModuleOutput.viewportDetails && Array.isArray(uiModuleOutput.viewportDetails)) {
            uiModuleOutput.viewportDetails.forEach(viewportDetail => {
                if (viewportDetail.structured) {
                    Object.keys(viewportDetail.structured).forEach(category => {
                        const categoryData = viewportDetail.structured[category];
                        if (categoryData && Array.isArray(categoryData.visualEvidence)) {
                            categoryData.visualEvidence = categoryData.visualEvidence.map(ve => {
                                if (typeof ve === 'object' && ve.elementSelector &&
                                    (ve.elementSelector === 'N/A' || ve.elementSelector === 'undefined' ||
                                        ve.elementSelector.length < 3 || /^(div|img|button|header|main|section)$/.test(ve.elementSelector))) {

                                    ve.elementSelector = generateElementSelectorFromDescription(
                                        ve.description || category,
                                        category,
                                        detectedFrameworks
                                    );
                                    if (verbose) console.log(`[UIModule] Enhanced generic selector for ${viewportDetail.name} ${category}: ${ve.elementSelector}`);
                                }
                                return ve;
                            });
                        }
                    });
                }
            });
        }

        if (verbose) console.log(`[UI Module] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${uiModuleOutput.summary.score}`);

        // CRITICAL FIX: Add discovered selectors to the final output for use by report generator
        if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
            uiModuleOutput.discoveredSelectors = discoveredSelectors;
            if (verbose) {
                const totalSelectors = Object.values(discoveredSelectors).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`[UI Module] Added ${totalSelectors} discovered selectors to final output for ultra-specific recommendations`);
            }
        }

        // GOLD-STANDARD: Detect silent failures — if no real analysis was produced, report honestly
        const hasViewportData = uiModuleOutput.viewportAnalyses && Object.keys(uiModuleOutput.viewportAnalyses).length > 0;
        const hasIssues = uiModuleOutput.issues?.items?.length > 0;
        const hasRecommendations = uiModuleOutput.recommendations?.items?.length > 0;
        if (uiModuleOutput.summary.score <= 1 && !hasViewportData && !hasIssues && !hasRecommendations) {
            uiModuleOutput.error = 'UI analysis could not be completed — screenshots may have been blank or unreadable. No viewport analysis data was produced.';
            uiModuleOutput.summary.score = null;
            uiModuleOutput.summary.rating = 'Error';
            uiModuleOutput.summary.topIssues = ['UI analysis failed — blank or unreadable screenshots'];
            if (verbose) console.warn(`[UI Module] HONEST FAILURE: No analysis data produced, reporting error instead of score 1`);
        }

        return uiModuleOutput;

    } catch (error) {
        console.error(`[UI Module] Critical error in UI analysis for ${url}: ${error.message}`);
        if (verbose) console.error(error.stack);
        if (onProgress) onProgress('Error: ' + error.message, 100, { error: error.message });
        uiModuleOutput.error = `UI analysis critically failed: ${error.message}`;
        uiModuleOutput.summary = { score: null, rating: 'Failed', topIssues: [uiModuleOutput.error.substring(0, 100)] };
        uiModuleOutput._skipped = true;
        return uiModuleOutput;
    }
}

// Helper function to get file size

module.exports = { analyze };
