/**
 * Security Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance
 *
 * Analyzes website security including SSL/TLS, security headers,
 * form security, CSP, and other security best practices.
 * Leverages AI for comprehensive assessment and structured output.
 */
const { URL } = require('url');

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
const { gatherSecurityDataViaHttp } = require('../utils/http-fallback');
const { collectSecuritySignals } = require('../utils/data-collectors/http-header-collector');

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
 * Gathers basic SSL/TLS information.
 */
async function getSslTlsContext(response, url, verbose = false) {
    if (verbose) { console.log('[SecurityModule] Gathering SSL/TLS context...'); }
    const context = {
        isHttps: url.startsWith('https://'),
        protocol: null, // e.g., "TLS 1.3"
        hstsDetected: false,
        hstsDetected: false,
        hstsValue: null,
        certificateDetails: { // Matches $defs/sslCertificateDetail
            commonName: null,
            subjectAlternativeNames: [],
            issuer: null,
            validFrom: null,
            validTo: null,
            signatureAlgorithm: null,
            publicKeyAlgorithm: null, // e.g. RSA, ECDSA
            publicKeySize: null, // e.g. 2048, 256
        },
        cipherStrength: "Unknown", // Placeholder, AI or deeper tool would assess
        issuesFound: []
    };
    if (!context.isHttps) {
        context.issuesFound.push("Site is not served over HTTPS, which is a critical security vulnerability.");
        return context;
    }
    try {
        if (!response) {
            if (verbose) { console.warn('[SecurityModule] No response received for SSL analysis'); }
            return context;
        }

        const securityDetails = await response.securityDetails();
        if (!securityDetails) {
            if (verbose) { console.warn('[SecurityModule] No security details available'); }
            return context;
        }

        // Extract comprehensive certificate details
        context.protocol = securityDetails.protocol || "Unknown";

        // Parse certificate details more comprehensively
        context.certificateDetails.issuer = securityDetails.issuer || "Unknown";
        context.certificateDetails.validFrom = securityDetails.validFrom ?
            new Date(securityDetails.validFrom * 1000).toISOString() : null;
        context.certificateDetails.validTo = securityDetails.validTo ?
            new Date(securityDetails.validTo * 1000).toISOString() : null;

        // Extract subject common name - try to parse from subjectName
        if (securityDetails.subjectName) {
            const cnMatch = securityDetails.subjectName.match(/CN=([^,]+)/);
            context.certificateDetails.commonName = cnMatch ? cnMatch[1] : securityDetails.subjectName;
        } else {
            // Fallback to extracting from URL
            const urlParts = new URL(url);
            context.certificateDetails.commonName = urlParts.hostname;
        }

        // Extract Subject Alternative Names (SANs)
        if (securityDetails.subjectAlternativeNames && Array.isArray(securityDetails.subjectAlternativeNames)) {
            context.certificateDetails.subjectAlternativeNames = securityDetails.subjectAlternativeNames;
        } else {
            // Default to at least include the hostname
            const urlParts = new URL(url);
            context.certificateDetails.subjectAlternativeNames = [urlParts.hostname];
        }

        // Determine signature and public key algorithms from available data
        // Playwright doesn't provide these directly, so we'll make educated guesses
        if (context.protocol === "TLS 1.3") {
            context.certificateDetails.signatureAlgorithm = "SHA256withRSA"; // Common default
            context.certificateDetails.publicKeyAlgorithm = "RSA";
            context.certificateDetails.publicKeySize = 2048; // Common default
            context.cipherStrength = "Strong";
        } else if (context.protocol === "TLS 1.2") {
            context.certificateDetails.signatureAlgorithm = "SHA256withRSA";
            context.certificateDetails.publicKeyAlgorithm = "RSA";
            context.certificateDetails.publicKeySize = 2048;
            context.cipherStrength = "Adequate";
        } else {
            context.certificateDetails.signatureAlgorithm = "Unknown";
            context.certificateDetails.publicKeyAlgorithm = "Unknown";
            context.certificateDetails.publicKeySize = null;
            context.cipherStrength = "Weak";
        }

        // Check for HSTS in response headers
        const headers = response.headers();
        if (headers['strict-transport-security']) {
            context.hstsDetected = true;
            context.hstsValue = headers['strict-transport-security'];
        }

        // Calculate score based on protocol and certificate validity
        let score = 30; // Base score
        if (context.protocol === "TLS 1.3") { score += 40; }
        else if (context.protocol === "TLS 1.2") { score += 30; }

        if (context.hstsDetected) { score += 15; }
        if (context.certificateDetails.validTo) {
            const daysToExpiration = Math.floor((new Date(context.certificateDetails.validTo) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysToExpiration > 30) { score += 15; }
            else if (daysToExpiration > 0) { score += 5; }
            else { score -= 20; } // Expired certificate
        }

        context.score = Math.min(100, Math.max(10, score));

        if (verbose) { console.log(`[SecurityModule] SSL analysis complete. Protocol: ${context.protocol}, Score: ${context.score}`); }

    } catch (error) {
        if (verbose) { console.warn(`[SecurityModule] SSL/TLS analysis failed: ${error.message}`); }
        context.issuesFound.push(`SSL analysis failed: ${error.message}`);
        context.score = 10;
    }
    return context;
}

/**
 * Gathers security headers.
 */
async function getSecurityHeadersContext(response, url, verbose = false) {
    if (verbose) { console.log('[SecurityModule] Gathering security headers context...'); }
    const relevantHeaders = [ // Kebab-case for fetching
        'content-security-policy', 'strict-transport-security', 'x-frame-options',
        'x-content-type-options', 'referrer-policy', 'permissions-policy', // Permissions-Policy is the new name for Feature-Policy
        'cross-origin-opener-policy', 'cross-origin-embedder-policy',
        'cross-origin-resource-policy', 'x-xss-protection' // X-XSS-Protection is deprecated but still checked
    ];
    const foundHeaders = {};
    try {
        if (!response) {
            return { headers: {}, score: 10, issues: ["Could not fetch response headers"] };
        }
        const headers = response.headers();
        relevantHeaders.forEach(hKey => {
            foundHeaders[hKey] = headers[hKey] || null; // Store value or null if missing
        });

        // Analyze key security headers
        const securityHeaders = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
        securityHeaders.forEach(header => {
            if (!headers[header]) {
                foundHeaders[header] = `Missing ${header} header`;
            }
        });

        foundHeaders.score = Math.max(10, 100 - (Object.values(foundHeaders).filter(value => typeof value === 'string').length * 15));
        return { headers: foundHeaders, score: foundHeaders.score };
    } catch (error) {
        if (verbose) { console.error(`[SecurityModule] Error gathering security headers for ${url}: ${error.message}`); }
        relevantHeaders.forEach(hKey => { foundHeaders[hKey] = `Error fetching: ${error.message.substring(0, 50)}`; });
        return { headers: foundHeaders, score: 10 };
    }
}

/**
 * Gathers basic information about forms.
 */
async function getFormsContext(page, verbose = false) {
    if (verbose) { console.log('[SecurityModule] Gathering forms context...'); }
    if (!page || page.isClosed()) { return { count: 0, formsDetails: [], error: "Page not available for form analysis." }; }
    try {
        return await page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));
            return {
                count: forms.length,
                formsDetails: forms.slice(0, 5).map((form, index) => ({
                    id: form.id || `form-index-${index}`,
                    action: form.action ? new URL(form.action, document.baseURI).href : document.baseURI,
                    method: form.method ? form.method.toUpperCase() : 'GET',
                    hasPasswordField: !!form.querySelector('input[type="password"]'),
                    inputCount: form.querySelectorAll('input, textarea, select').length,
                    // Basic CSRF check (very naive, AI should verify)
                    hasCsrfTokenLikeField: !!form.querySelector('input[name*="csrf"], input[name*="token"], input[name*="nonce"]'),
                    submitsToHttps: (form.action ? new URL(form.action, document.baseURI).protocol : document.location.protocol) === 'https:',
                }))
            };
        });
    } catch (error) {
        if (verbose) { console.error(`[SecurityModule] Error gathering forms context: ${error.message}`); }
        return { count: 0, formsDetails: [], error: error.message.substring(0, 100) };
    }
}

/**
 * Gathers basic CSP information.
 */
async function getCspContext(response, page, url, verbose = false) {
    if (verbose) { console.log('[SecurityModule] Gathering CSP context...'); }
    let cspValue = null;
    let source = 'none'; // 'header', 'meta-tag', 'header-report-only'
    try {
        if (response) {
            const headers = response.headers();
            if (headers['content-security-policy']) {
                cspValue = headers['content-security-policy'];
                source = 'header';
            } else if (headers['content-security-policy-report-only']) {
                cspValue = headers['content-security-policy-report-only'] + " (Report-Only)";
                source = 'header-report-only';
            }
        }
        // Check meta tag if not found in headers
        if (!cspValue && page && !page.isClosed()) {
            const metaCsp = await page.evaluate(() => {
                const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
                return cspMeta ? cspMeta.getAttribute('content') : null;
            }).catch(() => null);
            if (metaCsp) {
                cspValue = metaCsp;
                source = 'meta-tag';
            }
        }
    } catch (error) {
        if (verbose) { console.error(`[SecurityModule] Error gathering CSP context for ${url}: ${error.message}`); }
        return { present: false, value: `Error fetching: ${error.message.substring(0, 50)}`, source: 'error' };
    }
    return { present: !!cspValue, value: cspValue, source };
}


// --- Main Analyze Function ---

async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

const {
        page, browser,
        modelFamily, model, maxTokens,
        onProgress, verbose = false,
        analysisDepth = 'basic',
        tier = "Basic",
        featureSet = {},
        industryContext = {},
        costAggregator = null // Add costAggregator parameter
    } = options;

    const modelConfigOptions = { modelFamily, model, maxTokens, tier, analysisDepth };
    const startTimestamp = Date.now();

    if (verbose) { console.log(`[SecurityModule] Starting security analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth})`); }
    if (onProgress) { onProgress('security', 'Initializing security analysis', 0); }

    let securityModuleOutput = {
        summary: { score: null, rating: 'Pending', topIssues: [] },
        _skipped: true,
        headers: {}, ssl: {}, forms: {}, csp: {}, vulnerabilities: [],
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        dependencyVulnerabilities: [],
        zeroTrustAnalysis: {}, phiHandling: null, hipaaAuditLogging: null,
        industryBenchmarks: {}, roiProjections: null, businessImpact: null, implementationRoadmap: {}, financialRisk: null, realTimeDataFeed: null,
        error: null
    };
    // Initialize headers structure based on schema $defs/securityHeaderDetail keys
    const schemaHeaders = getNestedProperty(await getSchemaForModule("securityModule", false), 'properties.headers.properties', {});
    const headerKeysFromSchema = schemaHeaders && typeof schemaHeaders === 'object' ? Object.keys(schemaHeaders) : [];
    headerKeysFromSchema.forEach(key => {
        securityModuleOutput.headers[key] = { present: false, value: null, strictness: "Missing", score: 10, recommendation: `Consider implementing ${key}.` };
    });

    // Declare outside try block so catch block can access them for fallback scoring
    let sslContext, headersContext, formsContext, cspContext;
    let serverSoftwareFromFallback = null;
    let usedHttpFallback = false;

    try {
        if (onProgress) { onProgress('security', 'Gathering preliminary data', 10); }

        // Fetch deterministic signals for the scoring engine
        if (verbose) { console.log('[SecurityModule] Collecting deterministic security signals...'); }
        securityModuleOutput._collectedSignals = await collectSecuritySignals(url, { verbose });

        // HTTP-ONLY FALLBACK: When page/browser is null (bot protection blocked capture),
        // gather security data via Node.js built-in https/tls modules instead.
        if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
            if (verbose) console.log(`[Security] Page unavailable — using HTTP-only fallback for security data gathering...`);
            usedHttpFallback = true;

            const httpData = await gatherSecurityDataViaHttp(url, verbose);
            sslContext = httpData.sslContext;
            headersContext = httpData.headersContext;
            formsContext = httpData.formsContext;
            cspContext = httpData.cspContext;
            serverSoftwareFromFallback = httpData.serverHeader;

            // ENHANCED: If we have raw HTML, extract additional security signals via cheerio
            // This gives us meta CSP, form details, SRI, mixed content — data HTTP alone can't provide
            if (sharedPageContext._rawHtml) {
                const { extractSecuritySignalsFromHtml } = require('../utils/cfHtmlExtractor');
                const htmlSignals = extractSecuritySignalsFromHtml(sharedPageContext._rawHtml, verbose);
                securityModuleOutput._htmlSecuritySignals = htmlSignals;

                // Merge HTML-derived signals into existing contexts where HTTP didn't have them
                if (!cspContext.present && htmlSignals.metaCsp.present) {
                    cspContext = { present: true, value: htmlSignals.metaCsp.value, source: htmlSignals.metaCsp.source };
                    if (verbose) console.log(`[Security] HTML fallback found meta CSP tag`);
                }
                if (formsContext.count === 0 && htmlSignals.forms.count > 0) {
                    formsContext = { count: htmlSignals.forms.count, formsDetails: htmlSignals.forms.details };
                    if (verbose) console.log(`[Security] HTML fallback found ${htmlSignals.forms.count} forms`);
                }
            }

            if (verbose) console.log(`[Security] HTTP-only fallback data gathered: SSL=${sslContext.score}, Headers=${headersContext.score}, Forms=${formsContext.count}, CSP=${cspContext.present}`);
        } else {
            // NORMAL PATH: Use Playwright browser for data gathering
            // ISOLATION FIX: Use a dedicated page for security analysis
            let securityPage = null;
            let response = null;

            try {
                if (browser && typeof browser.newPage === 'function') {
                    if (verbose) console.log(`[Security] Creating isolated page for analysis...`);
                    securityPage = await browser.newPage();
                    response = await securityPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                } else {
                    if (verbose) console.warn(`[Security] No browser instance for isolation. Using shared page (RISKY).`);
                    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                }

                sslContext = await getSslTlsContext(response, url, verbose);
                headersContext = await getSecurityHeadersContext(response, url, verbose);

                const targetPage = securityPage || page;
                formsContext = await getFormsContext(targetPage, verbose);
                cspContext = await getCspContext(response, targetPage, url, verbose);

            } catch (playwrightError) {
                // Playwright page.goto failed (bot protection, network error, etc.)
                // Fall back to HTTP-only data gathering instead of crashing
                if (verbose) console.warn(`[Security] Playwright path failed: ${playwrightError.message.substring(0, 100)}`);
                if (verbose) console.log(`[Security] Falling back to HTTP-only data gathering...`);
                usedHttpFallback = true;

                const httpData = await gatherSecurityDataViaHttp(url, verbose);
                sslContext = httpData.sslContext;
                headersContext = httpData.headersContext;
                formsContext = httpData.formsContext;
                cspContext = httpData.cspContext;
                serverSoftwareFromFallback = httpData.serverHeader;
            } finally {
                if (securityPage) {
                    try { await securityPage.close(); } catch (e) { /* ignore */ }
                    securityPage = null;
                }
            }
        }

        // Construct module output... (logic continues)


        // Convert kebab-case header keys from headersContext to camelCase for promptVariables
        const camelCaseHeadersContext = {};
        for (const key in headersContext.headers) {
            const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            camelCaseHeadersContext[camelKey] = headersContext.headers[key];
        }

        const serverSoftwareHeader = serverSoftwareFromFallback || headersContext.headers?.server || "Unknown";

        // BROWSER AUDIT ENRICHMENT: Network requests for mixed content + cookie security flags
        const browserAudit = sharedPageContext?.browserAudit;
        let browserMixedContent = [];
        let browserCookieSecurityNote = '';
        if (browserAudit) {
            // Mixed content detection from real network requests
            if (browserAudit.networkRequests?.mixedContent && browserAudit.networkRequests.mixedContent.length > 0) {
                browserMixedContent = browserAudit.networkRequests.mixedContent;
                if (verbose) console.log(`[SecurityModule] 🔬 Browser audit: ${browserMixedContent.length} mixed-content resources detected`);
            }
            // Cookie security assessment from real cookie data
            if (Array.isArray(browserAudit.cookies) && browserAudit.cookies.length > 0) {
                const insecureCookies = browserAudit.cookies.filter(c => !c.secure);
                const noHttpOnly = browserAudit.cookies.filter(c => !c.httpOnly);
                const noSameSite = browserAudit.cookies.filter(c => c.sameSite === 'None' || !c.sameSite);
                browserCookieSecurityNote = `${browserAudit.cookies.length} cookies: ${insecureCookies.length} without Secure flag, ${noHttpOnly.length} without HttpOnly, ${noSameSite.length} with SameSite=None.`;
                if (verbose) console.log(`[SecurityModule] 🔬 Browser audit cookie security: ${browserCookieSecurityNote}`);
            }
            // Console CSP errors
            if (Array.isArray(browserAudit.consoleErrors)) {
                const cspErrors = browserAudit.consoleErrors.filter(e => e.text.includes('Content Security Policy') || e.text.includes('CSP'));
                if (cspErrors.length > 0 && verbose) {
                    console.log(`[SecurityModule] 🔬 Browser audit: ${cspErrors.length} CSP violation(s) in console`);
                }
            }
        }

        if (onProgress) { onProgress('security', 'Preliminary data gathered', 30); }

        const promptVariables = {
            url,
            industryContext: industryContext || { primaryIndustry: "Unknown" },
            industrySpecificThreats: getNestedProperty(industryContext, 'competitiveLandscape.commonThreats', []).join(', ') || "General web vulnerabilities",
            analysisDepth, tier, featureSet: JSON.stringify(featureSet),
            currentDate: new Date().toISOString().split('T')[0],
            sslInfoSnippet: JSON.stringify(sslContext).substring(0, 1000), // Increased length
            headersSnippet: JSON.stringify(camelCaseHeadersContext).substring(0, 1500), // Increased length
            formsCount: formsContext.count,
            formsDetailsSample: JSON.stringify(formsContext.formsDetails).substring(0, 1000),
            cspStatus: cspContext.present ? `Present (Source: ${cspContext.source}, Value: ${(cspContext.value || "").substring(0, 200)}...)` : "Missing",
            knownVulnerabilitiesSnippet: "No pre-scan vulnerability data available for this context.",
            serverSoftware: serverSoftwareHeader,
            thirdPartyServicesSnippet: browserAudit?.networkRequests?.thirdPartyDomains
                ? `Third-party domains observed: ${browserAudit.networkRequests.thirdPartyDomains.slice(0, 15).join(', ')}`
                : "Common analytics and CDN scripts might be present; assess their security implications.",
            authMechanismsSnippet: formsContext.formsDetails?.some(f => f.hasPasswordField) ? "Standard login form observed." : "No obvious login forms pre-detected.",
            sessionManagementSnippet: browserCookieSecurityNote || "Session cookies use HttpOnly (to be verified by AI).",
            sensitiveDataHandlingSnippet: formsContext.formsDetails?.some(f => f.hasPasswordField || f.id?.includes('payment')) ? "PII or payment data potentially collected." : "No obvious sensitive data collection forms pre-detected.",
            mixedContentSnippet: browserMixedContent.length > 0
                ? `MIXED CONTENT DETECTED: ${browserMixedContent.length} HTTP resource(s) loaded on HTTPS page: ${browserMixedContent.slice(0, 5).map(m => `${m.type}: ${m.url}`).join('; ')}`
                : "No mixed content detected."
        };

        if (verbose) { console.log("[SecurityModule] Prompt variables prepared:", JSON.stringify(promptVariables).substring(0, 1000) + "..."); }
        if (onProgress) { onProgress('security', 'Preparing AI analysis prompt', 35); }
        if (onProgress) { onProgress('security', `Calling AI for full analysis (two-pass)`, 40); }

        // Use centralized modelFamily default
        const defaultModelFamily = require('../config/model-defaults').getDefaultModelFamily('security');
        const effectiveModelFamily = modelFamily || defaultModelFamily;

        // Build evidence registry and pre-execute evidence block for prompt injection
        let evidenceBlock;
        const rawHtmlForRegistry = sharedPageContext?._rawHtml || '';
        if (rawHtmlForRegistry) {
            const registry = buildEvidenceRegistry(rawHtmlForRegistry, url, { verbose, sharedPageContext });
            evidenceBlock = registry.toEvidenceBlock({ categories: ['security', 'platform', 'privacy'] });
            if (verbose) {
                console.log(`[SecurityModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
            }
        }

        // GOLD-STANDARD: Two-pass AI pipeline — evidence extraction → expert judgment
        const twoPassResult = await twoPassAnalysis({
            moduleName: 'security',
            evidenceData: promptVariables,
            industryContext: industryContext || { primaryIndustry: 'Unknown' },
            pass1Template: 'security-evidence-extraction',
            pass2Template: 'security-expert-judgment',
            pass2Schema: await getSchemaForModule('securityModule', false),
            singlePassTemplate: 'security-analysis',
            tier,
            analysisDepth,
            modelFamily: effectiveModelFamily,
            model,
            costAggregator,
            verbose,
            evidenceBlock,
        });

        // Track AI cost if costAggregator is provided
        if (costAggregator && twoPassResult.usage) {
            if (twoPassResult.usage.pass1) costAggregator.addFromUsage('security-evidence', twoPassResult.usage.pass1);
            if (twoPassResult.usage.pass2) costAggregator.addFromUsage('security-judgment', twoPassResult.usage.pass2);
            if (verbose) {
                console.log(`[SecurityModule] Two-pass AI cost: $${twoPassResult.usage.totalCostUSD.toFixed(6)} (pass1Failed=${twoPassResult.pass1Failed})`);
            }
        }

        if (onProgress) { onProgress('security', 'AI analysis received (two-pass)', 80); }

        if (!twoPassResult.analysis && twoPassResult.error) {
            throw new Error(`AI analysis failed: ${twoPassResult.error}`);
        }

        const aiResponse = twoPassResult.analysis;

        // Store narrative if available
        if (twoPassResult.narrative) {
            securityModuleOutput.narrative = twoPassResult.narrative;
        }
        // Store agent metadata for report attribution
        if (twoPassResult.agentMeta) {
            securityModuleOutput._agentMeta = twoPassResult.agentMeta;
        }

        if (aiResponse && typeof aiResponse === 'object') {
            // CRITICAL FIX: Only merge valid non-null sections. 
            // If AI returned null for a section (e.g. ssl: null), KEEP the default/preliminary data.

            if (aiResponse.summary) {
                securityModuleOutput.summary = { ...securityModuleOutput.summary, ...aiResponse.summary };
            }

            if (aiResponse.ssl && Object.keys(aiResponse.ssl).length > 0) {
                securityModuleOutput.ssl = { ...securityModuleOutput.ssl, ...aiResponse.ssl };
            }

            if (aiResponse.headers && Object.keys(aiResponse.headers).length > 0) {
                securityModuleOutput.headers = { ...securityModuleOutput.headers, ...aiResponse.headers };
                // Preserve score if AI lost it
                if (headersContext && headersContext.score) {
                    securityModuleOutput.headers.score = headersContext.score;
                }
            }

            if (aiResponse.forms) { securityModuleOutput.forms = { ...securityModuleOutput.forms, ...aiResponse.forms }; }
            if (aiResponse.csp) { securityModuleOutput.csp = { ...securityModuleOutput.csp, ...aiResponse.csp }; }

            if (aiResponse.vulnerabilities) { securityModuleOutput.vulnerabilities = aiResponse.vulnerabilities; }
            if (aiResponse.dependencyVulnerabilities) { securityModuleOutput.dependencyVulnerabilities = aiResponse.dependencyVulnerabilities; }
            if (aiResponse.recommendations) { securityModuleOutput.recommendations = aiResponse.recommendations; }
            if (aiResponse.issues) { securityModuleOutput.issues = aiResponse.issues; }
            if (aiResponse.businessImpact) { securityModuleOutput.businessImpact = aiResponse.businessImpact; }
            if (aiResponse.industryBenchmarks) { securityModuleOutput.industryBenchmarks = aiResponse.industryBenchmarks; }
            if (aiResponse.roiProjections) { securityModuleOutput.roiProjections = aiResponse.roiProjections; }
        } else {
            console.warn(`[SecurityModule] AI response was invalid or null. Using preliminary data.`);
        }

        // CRITICAL FIX: Inject deterministic evidence as fallback when AI returned empty objects.
        // The AI frequently returns empty {} for ssl/headers/csp/forms. We ALWAYS have real
        // deterministic data from getSslTlsContext(), getSecurityHeadersContext(), etc.
        if (sslContext && (!securityModuleOutput.ssl || Object.keys(securityModuleOutput.ssl).length === 0)) {
            securityModuleOutput.ssl = {
                isHttps: sslContext.isHttps,
                protocol: sslContext.protocol || 'Unknown',
                certificateDetails: sslContext.certificateDetails || {},
                cipherStrength: sslContext.cipherStrength || 'Unknown',
                hstsEnabled: sslContext.hstsDetected || false,
                hstsValue: sslContext.hstsValue || null,
                score: sslContext.score || 10,
                issuesFound: sslContext.issuesFound || []
            };
            if (verbose) console.log(`[SecurityModule] EVIDENCE-FIRST: Injected deterministic SSL data (protocol=${sslContext.protocol}, score=${sslContext.score})`);
        }

        if (headersContext && (!securityModuleOutput.headers || Object.keys(securityModuleOutput.headers).length === 0 ||
            Object.values(securityModuleOutput.headers).every(v => v && typeof v === 'object' && v.present === false))) {
            // Build structured header evidence from raw scan
            const headerEvidence = {};
            if (headersContext.headers) {
                Object.entries(headersContext.headers).forEach(([key, value]) => {
                    if (key === 'score') return; // Skip the score key
                    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    const isMissing = !value || (typeof value === 'string' && value.startsWith('Missing'));
                    headerEvidence[camelKey] = {
                        present: !isMissing,
                        value: isMissing ? null : value,
                        strictness: isMissing ? 'Missing' : 'Moderate',
                        score: isMissing ? 10 : 60,
                        recommendation: isMissing ? `Implement ${key} header for improved security.` : `Review ${key} header configuration.`
                    };
                });
            }
            securityModuleOutput.headers = headerEvidence;
            if (verbose) console.log(`[SecurityModule] EVIDENCE-FIRST: Injected deterministic headers data (${Object.keys(headerEvidence).length} headers)`);
        }

        if (cspContext && (!securityModuleOutput.csp || Object.keys(securityModuleOutput.csp).length === 0)) {
            securityModuleOutput.csp = {
                present: cspContext.present,
                source: cspContext.source || 'none',
                rawPolicy: cspContext.value || null,
                score: cspContext.present ? 50 : 10,
                directives: {},
                issues: cspContext.present ? [] : ['No Content Security Policy detected']
            };
            if (verbose) console.log(`[SecurityModule] EVIDENCE-FIRST: Injected deterministic CSP data (present=${cspContext.present})`);
        }

        if (formsContext && (!securityModuleOutput.forms || Object.keys(securityModuleOutput.forms).length === 0)) {
            securityModuleOutput.forms = {
                count: formsContext.count || 0,
                details: (formsContext.formsDetails || []).map(f => ({
                    id: f.id,
                    action: f.action,
                    method: f.method,
                    hasPasswordField: f.hasPasswordField,
                    submitsToHttps: f.submitsToHttps,
                    hasCsrfToken: f.hasCsrfTokenLikeField
                })),
                csrfProtection: {
                    methodUsed: formsContext.formsDetails?.some(f => f.hasCsrfTokenLikeField) ? 'Token' : (formsContext.count === 0 ? 'N/A' : 'None'),
                    tokenScope: formsContext.count === 0 ? 'N/A' : 'Unknown'
                },
                score: formsContext.count === 0 ? 100 : (formsContext.formsDetails?.every(f => f.submitsToHttps) ? 70 : 30),
                issues: []
            };
            if (verbose) console.log(`[SecurityModule] EVIDENCE-FIRST: Injected deterministic forms data (${formsContext.count} forms)`);
        }


        // CRITICAL: Sanity check summary score. If 0, 1, or missing, recalculate based on components.
        let calculatedScore = 0;

        // Base score from SSL (0-100)
        const sslScore = sslContext?.score || 0;

        // Base score from Headers (0-100)
        const headersScore = headersContext?.score || 0;

        // CSV/Forms analysis (simple heuristic)
        let formScore = 100;
        if (formsContext && formsContext.count > 0) {
            // If forms exist but no SSL, severe penalty
            if (!sslContext?.isHttps) formScore = 0;
            else formScore = 80; // Standard forms are okay
        }

        // Weighted average
        // SSL: 40%, Headers: 30%, Forms/Other: 30%
        calculatedScore = Math.round((sslScore * 0.4) + (headersScore * 0.3) + (formScore * 0.3));

        // Fallback validation for summary
        if (!securityModuleOutput.summary ||
            typeof securityModuleOutput.summary.score !== 'number' ||
            securityModuleOutput.summary.score <= 1) { // 0 or 1 usually means error

            securityModuleOutput.summary = {
                score: calculatedScore,
                rating: getRatingLabelForScore(calculatedScore, false),
                topIssues: securityModuleOutput.summary?.topIssues || []
            };
            if (verbose) console.log(`[SecurityModule] Recalculated invalid AI score (was ${aiResponse?.summary?.score}). New Score: ${calculatedScore}`);
        } else {
            // If AI gave a score, ensure it matches reality vaguely (e.g. if HTTP, score must be low)
            if (!sslContext?.isHttps && securityModuleOutput.summary.score > 40) {
                securityModuleOutput.summary.score = 30; // Cap at 30 for non-HTTPS
                securityModuleOutput.summary.rating = "Critical";
                if (verbose) console.log(`[SecurityModule] Capped score at 30 due to missing HTTPS.`);
            }
        }

        // BENCHMARK FIX: Industry-aware severity calibration.
        // A missing CSP header is a different risk level for a medical spa (handles PHI/bookings)
        // vs. a static portfolio site. Severity language must reflect actual business risk exposure.
        {
            const industryStr = (industryContext?.primaryIndustry || '').toLowerCase();
            const HIGH_RISK_KEYWORDS = ['health', 'medical', 'clinic', 'hospital', 'dental', 'pharmacy',
                'fintech', 'finance', 'banking', 'insurance', 'legal', 'law', 'attorney',
                'ecommerce', 'e-commerce', 'payment', 'checkout', 'booking',
                'aesthetic', 'medspa', 'med spa', 'spa', 'dermatolog', 'plastic surg', 'cosmetic surg',
                'beauty', 'wellness', 'weight loss', 'laser', 'botox', 'filler', 'injection'];
            const LOW_RISK_KEYWORDS = ['portfolio', 'artist', 'blog', 'personal', 'hobby',
                'studio', 'gallery', 'photography'];

            const isHighRisk = HIGH_RISK_KEYWORDS.some(k => industryStr.includes(k));
            const isLowRisk = !isHighRisk && LOW_RISK_KEYWORDS.some(k => industryStr.includes(k));
            const riskLabel = isHighRisk ? '[High-Risk Industry] ' : isLowRisk ? '[Low-Risk Industry] ' : '';

            if ((isHighRisk || isLowRisk) && Array.isArray(securityModuleOutput.issues?.items)) {
                securityModuleOutput.issues.items = securityModuleOutput.issues.items.map(issue => {
                    if (typeof issue !== 'object' || !issue.text) return issue;
                    const updatedIssue = { ...issue };
                    if (!updatedIssue.text.startsWith('[High-Risk') && !updatedIssue.text.startsWith('[Low-Risk')) {
                        updatedIssue.text = riskLabel + updatedIssue.text;
                    }
                    // High-risk: escalate Medium → High on header/CSP/HSTS issues
                    if (isHighRisk && updatedIssue.severity === 'Medium' &&
                        (updatedIssue.text.includes('header') || updatedIssue.text.includes('CSP') ||
                            updatedIssue.text.includes('HSTS') || updatedIssue.text.includes('CORS') ||
                            updatedIssue.text.includes('Content-Security') || updatedIssue.text.includes('Referrer'))) {
                        updatedIssue.severity = 'High';
                    }
                    // Low-risk: cap Critical → High for non-HTTPS issues only (don't over-alarm)
                    if (isLowRisk && updatedIssue.severity === 'Critical' &&
                        !updatedIssue.text.includes('HTTPS') && !updatedIssue.text.includes('SSL') &&
                        !updatedIssue.text.includes('certificate')) {
                        updatedIssue.severity = 'High';
                    }
                    return updatedIssue;
                });

                // Prefix topIssues with risk context so reports clearly communicate industry-calibrated risk
                if (Array.isArray(securityModuleOutput.summary?.topIssues) && riskLabel) {
                    securityModuleOutput.summary.topIssues = securityModuleOutput.summary.topIssues.map(t =>
                        (typeof t === 'string' && !t.startsWith('[High-Risk') && !t.startsWith('[Low-Risk'))
                            ? riskLabel + t : t
                    );
                }

                if (verbose) {
                    console.log(`[SecurityModule] Industry severity calibration: ${isHighRisk ? 'HIGH' : 'LOW'} risk (industry="${industryContext?.primaryIndustry}")`);
                }
            }
        }

        // CRITICAL FIX: Unwrap vulnerabilities if AI returns object with items
        if (securityModuleOutput.vulnerabilities && typeof securityModuleOutput.vulnerabilities === 'object' && !Array.isArray(securityModuleOutput.vulnerabilities)) {
            if (Array.isArray(securityModuleOutput.vulnerabilities.items)) {
                securityModuleOutput.vulnerabilities = securityModuleOutput.vulnerabilities.items;
            } else {
                securityModuleOutput.vulnerabilities = [];
            }
        }

        // CRITICAL FIX: Unwrap dependencyVulnerabilities if AI returns object with items
        if (securityModuleOutput.dependencyVulnerabilities && typeof securityModuleOutput.dependencyVulnerabilities === 'object' && !Array.isArray(securityModuleOutput.dependencyVulnerabilities)) {
            if (Array.isArray(securityModuleOutput.dependencyVulnerabilities.items)) {
                securityModuleOutput.dependencyVulnerabilities = securityModuleOutput.dependencyVulnerabilities.items;
            } else {
                securityModuleOutput.dependencyVulnerabilities = [];
            }
        }

        // CRITICAL FIX: Remove ALL forbidden fields from summary that AI might add
        // Schema ONLY allows: score, rating, topIssues (additionalProperties: false)
        // AI keeps hallucinating different field names, so we whitelist instead of blacklist
        if (securityModuleOutput.summary) {
            const { score, rating, topIssues } = securityModuleOutput.summary;
            securityModuleOutput.summary = { score, rating, topIssues };
        }

        // CRITICAL FIX: Ensure all vulnerabilities have required "name" field
        // Schema requires: name, severity, remediation
        if (Array.isArray(securityModuleOutput.vulnerabilities)) {
            securityModuleOutput.vulnerabilities = securityModuleOutput.vulnerabilities.map((vuln, index) => {
                // Handle case where AI returns a string description instead of an object
                if (typeof vuln === 'string') {
                    return {
                        name: vuln.substring(0, 100),
                        severity: "Medium",
                        remediation: "Review and address this security concern",
                        cve: null
                    };
                }
                return {
                    ...vuln,
                    name: vuln.name || vuln.description?.substring(0, 50) || `Security Issue ${index + 1}`,
                    severity: vuln.severity || "Medium",
                    remediation: vuln.remediation || "Review and address this security concern"
                };
            });
        }

        // SCHEMA FIX: ssl.expiration must be null or ISO date-time; never empty string
        if (securityModuleOutput.ssl && securityModuleOutput.ssl.expiration === '') {
            securityModuleOutput.ssl.expiration = null;
        }

        // CRITICAL FIX: Ensure CSP directives is an object (schema expects object, not array)
        if (securityModuleOutput.csp && Array.isArray(securityModuleOutput.csp.directives)) {
            // Convert array to object if AI returned array
            const directivesObj = {};
            securityModuleOutput.csp.directives.forEach(dir => {
                if (typeof dir === 'string') {
                    const [key, ...values] = dir.split(' ');
                    directivesObj[key] = values.join(' ');
                }
            });
            securityModuleOutput.csp.directives = directivesObj;
        }

        // GOLD-STANDARD: Normalize headers strictness to schema enum using keyword matching
        if (securityModuleOutput.headers) {
            const VALID_STRICTNESS = ['Strict', 'Moderate', 'Permissive', 'Missing', 'Misconfigured'];
            const STRICT_KEYWORDS = ['strict', 'strong', 'tight', 'rigorous', 'secure', 'hardened', 'restrictive', 'high'];
            const MODERATE_KEYWORDS = ['moderate', 'standard', 'average', 'normal', 'balanced', 'good', 'fair', 'medium'];
            const PERMISSIVE_KEYWORDS = ['permissive', 'minimal', 'basic', 'weak', 'poor', 'lenient', 'relaxed', 'loose', 'lax', 'low'];
            const MISSING_KEYWORDS = ['missing', 'absent', 'none', 'undefined', 'null', 'empty', 'disabled', 'off', 'false', 'not present', 'notpresent'];
            const MISCONFIGURED_KEYWORDS = ['misconfigured', 'invalid', 'error', 'broken', 'malformed', 'incorrect', 'corrupted', 'faulty', 'damaged'];

            Object.keys(securityModuleOutput.headers).forEach(headerKey => {
                const header = securityModuleOutput.headers[headerKey];
                if (header && header.strictness) {
                    if (VALID_STRICTNESS.includes(header.strictness)) return; // Already valid
                    const lower = header.strictness.toLowerCase().trim();
                    if (STRICT_KEYWORDS.some(k => lower.includes(k))) { header.strictness = 'Strict'; }
                    else if (MISCONFIGURED_KEYWORDS.some(k => lower.includes(k))) { header.strictness = 'Misconfigured'; }
                    else if (MISSING_KEYWORDS.some(k => lower.includes(k))) { header.strictness = 'Missing'; }
                    else if (PERMISSIVE_KEYWORDS.some(k => lower.includes(k))) { header.strictness = 'Permissive'; }
                    else if (MODERATE_KEYWORDS.some(k => lower.includes(k))) { header.strictness = 'Moderate'; }
                    else {
                        if (verbose) { console.warn(`[SecurityModule] Unmapped strictness: "${header.strictness}" for ${headerKey}. Defaulting to 'Missing'.`); }
                        header.strictness = header.present ? 'Moderate' : 'Missing';
                    }
                }
            });
        }

        // Fix SSL cipher strength enum
        if (securityModuleOutput.ssl && securityModuleOutput.ssl.cipherStrength) {
            const cipherMap = {
                'Strong': 'Strong',
                'Acceptable': 'Adequate', // Map to schema enum
                'Adequate': 'Adequate',
                'Weak': 'Weak',
                'High': 'Strong',
                'Medium': 'Adequate',
                'Low': 'Weak',
                'Good': 'Strong',
                'Fair': 'Adequate',
                'Poor': 'Weak'
            };
            const originalValue = securityModuleOutput.ssl.cipherStrength;
            securityModuleOutput.ssl.cipherStrength = cipherMap[originalValue] || 'Adequate';
            if (verbose && !cipherMap[originalValue] && !['Strong', 'Adequate', 'Weak'].includes(originalValue)) {
                console.warn(`[SecurityModule] Unmapped SSL cipher strength: "${originalValue}". Using fallback.`);
            }
        }

        // GOLD-STANDARD: Remove invalid cveLink entries rather than fabricating fake CVEs
        if (Array.isArray(securityModuleOutput.dependencyVulnerabilities)) {
            securityModuleOutput.dependencyVulnerabilities = securityModuleOutput.dependencyVulnerabilities.map(depVuln => {
                // If cveLink is missing/invalid, remove it entirely (schema allows omission)
                if (!depVuln.cveLink || typeof depVuln.cveLink !== 'string' || !depVuln.cveLink.startsWith('http')) {
                    delete depVuln.cveLink;
                    if (verbose) { console.log(`[SecurityModule] Removed invalid cveLink for dependency: ${depVuln.dependencyName}`); }
                }
                return depVuln;
            });
        }

        // CRITICAL FIX: Fix forms scoring logic contradiction 
        if (securityModuleOutput.forms) {
            // If no forms detected, CSRF protection should be "N/A" and score logic should be consistent
            if (securityModuleOutput.forms.count === 0) {
                // No forms = no form security risk, but CSRF status should be N/A not None
                if (securityModuleOutput.forms.csrfProtection) {
                    securityModuleOutput.forms.csrfProtection.methodUsed = "N/A";
                    securityModuleOutput.forms.csrfProtection.tokenScope = "N/A";
                }
                // Score of 100 is appropriate when no forms exist (no risk)
                securityModuleOutput.forms.score = 100;
            } else if (securityModuleOutput.forms.count > 0) {
                // If forms exist but CSRF protection is "None", score should be lower
                if (securityModuleOutput.forms.csrfProtection &&
                    securityModuleOutput.forms.csrfProtection.methodUsed === "None") {
                    // Penalize severely for missing CSRF protection on existing forms
                    securityModuleOutput.forms.score = Math.min(securityModuleOutput.forms.score, 40);

                    // Add to issues if not already present
                    if (!securityModuleOutput.forms.issues.some(issue => issue.includes('CSRF'))) {
                        securityModuleOutput.forms.issues.push("Forms lack CSRF protection, vulnerable to cross-site request forgery attacks");
                    }
                }
            }
        }

        // CRITICAL FIX: Ensure dependencyVulnerabilities have correct field names for schema compliance
        if (Array.isArray(securityModuleOutput.dependencyVulnerabilities)) {
            securityModuleOutput.dependencyVulnerabilities = securityModuleOutput.dependencyVulnerabilities.map(depVuln => {
                // Fix field name mapping: description -> vulnerabilityDescription
                if (depVuln.description && !depVuln.vulnerabilityDescription) {
                    depVuln.vulnerabilityDescription = depVuln.description;
                    delete depVuln.description;
                }

                // CRITICAL FIX: Ensure cveLink is always a string, never null
                if (depVuln.cve && !depVuln.cveLink) {
                    if (depVuln.cve.startsWith('http')) {
                        depVuln.cveLink = depVuln.cve;
                    } else if (depVuln.cve.startsWith('CVE-')) {
                        depVuln.cveLink = `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${depVuln.cve}`;
                    } else {
                        // If cve exists but doesn't match expected format, generate a valid link
                        depVuln.cveLink = `https://cve.mitre.org/cgi-bin/cvename.cgi?name=${depVuln.cve}`;
                    }
                    delete depVuln.cve;
                }

                // GOLD-STANDARD: Remove invalid cveLink rather than fabricating fake CVEs
                if (!depVuln.cveLink || typeof depVuln.cveLink !== 'string' || !depVuln.cveLink.startsWith('http')) {
                    delete depVuln.cveLink;
                }

                // Remove remediation field if present (not part of schema)
                if (depVuln.remediation) {
                    delete depVuln.remediation;
                }

                // Ensure vulnerabilityDescription exists
                if (!depVuln.vulnerabilityDescription) {
                    depVuln.vulnerabilityDescription = "Vulnerability details not available";
                }

                return depVuln;
            });

            if (verbose) { console.log(`[SecurityModule] Fixed ${securityModuleOutput.dependencyVulnerabilities.length} dependency vulnerability field names for schema compliance`); }
        }

        // Ensure CVEs are valid format and exploitability values are correct
        if (Array.isArray(securityModuleOutput.vulnerabilities)) {
            securityModuleOutput.vulnerabilities.forEach(vuln => {
                // GOLD-STANDARD: Remove invalid CVE rather than fabricating fake ones
                if (vuln.cve === null || vuln.cve === undefined || (typeof vuln.cve === 'string' && !/^CVE-\d{4}-\d{4,}$/.test(vuln.cve))) {
                    if (verbose && vuln.cve) { console.warn(`[SecurityModule] Invalid CVE format from AI: ${vuln.cve}. Removing (not fabricating).`); }
                    delete vuln.cve;
                }

                // Fix patchStatus enum
                if (vuln.patchStatus && !['Applied', 'Pending', 'Unavailable', 'Not Applicable', 'Unknown'].includes(vuln.patchStatus)) {
                    const patchStatusMap = {
                        'Required': 'Pending',
                        'Available': 'Pending',
                        'Not Available': 'Unavailable',
                        'N/A': 'Not Applicable',
                        'None': 'Unknown',
                        'NotPatched': 'Pending'
                    };
                    vuln.patchStatus = patchStatusMap[vuln.patchStatus] || 'Unknown'; // Default fallback
                }

                // Fix businessImpact enum
                if (vuln.businessImpact && !['Critical', 'High', 'Medium', 'Low'].includes(vuln.businessImpact)) {
                    const businessImpactMap = {
                        'Moderate': 'Medium',
                        'Very High': 'High',
                        'Very Low': 'Low',
                        'Minimal': 'Low'
                    };
                    vuln.businessImpact = businessImpactMap[vuln.businessImpact] || 'Medium'; // Default fallback
                }

                // Fix exploitability enum
                if (vuln.exploitability && !['Proven', 'Probable', 'Possible', 'Unlikely'].includes(vuln.exploitability)) {
                    const exploitabilityMap = {
                        'High': 'Proven',
                        'Medium': 'Probable',
                        'Moderate': 'Probable',
                        'Low': 'Possible',
                        'Very Low': 'Unlikely',
                        'None': 'Unlikely'
                    };
                    vuln.exploitability = exploitabilityMap[vuln.exploitability] || 'Possible'; // Default fallback
                }
            });
        }


        // Healthcare industry fields should be available for Pro and Enterprise tiers
        const isHealthcareProOrEnterprise = /health|medical|clinic|hospital|physician|dental/i.test(industryContext?.primaryIndustry || '') && featureSet.detailedComplianceReportingEnabled;
        if (!isHealthcareProOrEnterprise) {
            securityModuleOutput.phiHandling = null;
            securityModuleOutput.hipaaAuditLogging = null;
        } else {
            securityModuleOutput.phiHandling = securityModuleOutput.phiHandling || { encryptionAtRest: false, encryptionInTransit: false, accessControlsScore: 10, sensitiveDataIdentified: false, deidentificationMethods: "Unknown", dataFlowMappingAvailable: false };
            securityModuleOutput.hipaaAuditLogging = securityModuleOutput.hipaaAuditLogging || { loggingEnabled: false, logRetentionPolicyDays: 365, logReviewProcessScore: 10, accessToLogsProtected: false, auditTrailIntegrity: false };

            // CRITICAL: Ensure healthcare fields comply with schema data types
            if (securityModuleOutput.phiHandling) {
                // Fix encryptionAtRest - must be boolean, not string
                if (typeof securityModuleOutput.phiHandling.encryptionAtRest !== 'boolean') {
                    securityModuleOutput.phiHandling.encryptionAtRest = securityModuleOutput.phiHandling.encryptionAtRest === 'true' || securityModuleOutput.phiHandling.encryptionAtRest === true;
                }
                // Fix encryptionInTransit - must be boolean, not string
                if (typeof securityModuleOutput.phiHandling.encryptionInTransit !== 'boolean') {
                    securityModuleOutput.phiHandling.encryptionInTransit = securityModuleOutput.phiHandling.encryptionInTransit === 'true' || securityModuleOutput.phiHandling.encryptionInTransit === true;
                }
                // Fix sensitiveDataIdentified - must be boolean, not string
                if (typeof securityModuleOutput.phiHandling.sensitiveDataIdentified !== 'boolean') {
                    securityModuleOutput.phiHandling.sensitiveDataIdentified = securityModuleOutput.phiHandling.sensitiveDataIdentified === 'true' || securityModuleOutput.phiHandling.sensitiveDataIdentified === true;
                }
                // Fix dataFlowMappingAvailable - must be boolean, not string
                if (typeof securityModuleOutput.phiHandling.dataFlowMappingAvailable !== 'boolean') {
                    securityModuleOutput.phiHandling.dataFlowMappingAvailable = securityModuleOutput.phiHandling.dataFlowMappingAvailable === 'true' || securityModuleOutput.phiHandling.dataFlowMappingAvailable === true;
                }
                // Ensure accessControlsScore is a number
                if (typeof securityModuleOutput.phiHandling.accessControlsScore !== 'number') {
                    securityModuleOutput.phiHandling.accessControlsScore = 10;
                }
            }

            if (securityModuleOutput.hipaaAuditLogging) {
                // Fix loggingEnabled - must be boolean, not string
                if (typeof securityModuleOutput.hipaaAuditLogging.loggingEnabled !== 'boolean') {
                    securityModuleOutput.hipaaAuditLogging.loggingEnabled = securityModuleOutput.hipaaAuditLogging.loggingEnabled === 'true' || securityModuleOutput.hipaaAuditLogging.loggingEnabled === true;
                }
                // Fix logRetentionPolicyDays - must be ≥1, not 0 or string
                if (typeof securityModuleOutput.hipaaAuditLogging.logRetentionPolicyDays !== 'number' || securityModuleOutput.hipaaAuditLogging.logRetentionPolicyDays < 1) {
                    securityModuleOutput.hipaaAuditLogging.logRetentionPolicyDays = 365; // Default to 1 year
                }
                // Fix accessToLogsProtected - must be boolean, not string
                if (typeof securityModuleOutput.hipaaAuditLogging.accessToLogsProtected !== 'boolean') {
                    securityModuleOutput.hipaaAuditLogging.accessToLogsProtected = securityModuleOutput.hipaaAuditLogging.accessToLogsProtected === 'true' || securityModuleOutput.hipaaAuditLogging.accessToLogsProtected === true;
                }
                // Fix auditTrailIntegrity - must be boolean, not string
                if (typeof securityModuleOutput.hipaaAuditLogging.auditTrailIntegrity !== 'boolean') {
                    securityModuleOutput.hipaaAuditLogging.auditTrailIntegrity = securityModuleOutput.hipaaAuditLogging.auditTrailIntegrity === 'true' || securityModuleOutput.hipaaAuditLogging.auditTrailIntegrity === true;
                }
                // Ensure logReviewProcessScore is a number
                if (typeof securityModuleOutput.hipaaAuditLogging.logReviewProcessScore !== 'number') {
                    securityModuleOutput.hipaaAuditLogging.logReviewProcessScore = 10;
                }
            }
        }

        // TIER COLLAPSE: Always populate all fields (single world-class tier)
        // Ensure implementationRoadmap is an object
        if (!securityModuleOutput.implementationRoadmap || typeof securityModuleOutput.implementationRoadmap !== 'object') {
            securityModuleOutput.implementationRoadmap = {
                shortTerm: [],
                mediumTerm: [],
                longTerm: [],
                resourceNeeds: [],
                estimatedTimeline: "To be determined",
                dependencies: []
            };
        }

        // Ensure financialRisk is an object
        if (!securityModuleOutput.financialRisk || typeof securityModuleOutput.financialRisk !== 'object') {
            securityModuleOutput.financialRisk = {
                potentialAnnualLoss: 0,
                mitigationCost: 0,
                roiPercentage: 0
            };
        }

        // TIER COLLAPSE: Always populate zeroTrustAnalysis
        {
            if (!securityModuleOutput.zeroTrustAnalysis || Object.keys(securityModuleOutput.zeroTrustAnalysis).length === 0) {
                // Generate comprehensive zero trust analysis based on security findings
                securityModuleOutput.zeroTrustAnalysis = {
                    overallMaturityLevel: calculateZeroTrustMaturity(securityModuleOutput),
                    principleAdherence: {
                        verifyExplicitly: {
                            score: calculateVerifyExplicitlyScore(securityModuleOutput),
                            findings: generateVerifyExplicitlyFindings(securityModuleOutput),
                            recommendations: generateVerifyExplicitlyRecommendations(securityModuleOutput)
                        },
                        leastPrivilegeAccess: {
                            score: calculateLeastPrivilegeScore(securityModuleOutput),
                            findings: generateLeastPrivilegeFindings(securityModuleOutput),
                            recommendations: generateLeastPrivilegeRecommendations(securityModuleOutput)
                        },
                        assumeBreach: {
                            score: calculateAssumeBreachScore(securityModuleOutput),
                            findings: generateAssumeBreachFindings(securityModuleOutput),
                            recommendations: generateAssumeBreachRecommendations(securityModuleOutput)
                        }
                    },
                    implementationGaps: identifyZeroTrustGaps(securityModuleOutput),
                    prioritizedRecommendations: generateZeroTrustPrioritizedRecommendations(securityModuleOutput),
                    complianceAlignment: {
                        nistFramework: assessNistFrameworkAlignment(securityModuleOutput),
                        iso27001: assessIso27001Alignment(securityModuleOutput),
                        cisControls: assessCisControlsAlignment(securityModuleOutput)
                    },
                    riskAssessment: {
                        currentRiskLevel: calculateCurrentRiskLevel(securityModuleOutput),
                        riskFactors: identifyRiskFactors(securityModuleOutput),
                        mitigationStrategies: generateMitigationStrategies(securityModuleOutput)
                    }
                };

                if (verbose) { console.log("[SecurityModule] Generated comprehensive zero trust analysis for Pro/Enterprise tier"); }
            }
        }

        if (onProgress) { onProgress('security', 'Formatting recommendations & issues', 85); }

        // CRITICAL FIX: Extract recommendations from nested security objects
        const allSecurityRecommendations = [];

        // Extract from header objects
        if (securityModuleOutput.headers) {
            Object.values(securityModuleOutput.headers).forEach(header => {
                if (header && header.recommendation && typeof header.recommendation === 'string' && header.recommendation.trim() !== '') {
                    allSecurityRecommendations.push({
                        id: uuidv4(),
                        text: header.recommendation,
                        priority: header.score < 40 ? "High" : (header.score < 70 ? "Medium" : "Low"),
                        source: "security",
                        impact: `Improves ${header.present ? 'existing' : 'missing'} security header implementation`,
                        effort: "Moderate",
                        effortHours: { min: 1, max: 3 }
                    });
                }
                // Extract from header.recommendations array if it exists
                if (header && Array.isArray(header.recommendations)) {
                    header.recommendations.forEach(rec => {
                        if (rec && typeof rec === 'string' && rec.trim() !== '') {
                            allSecurityRecommendations.push({
                                id: uuidv4(),
                                text: rec,
                                priority: header.score < 40 ? "High" : (header.score < 70 ? "Medium" : "Low"),
                                source: "security",
                                impact: `Security header improvement`,
                                effort: "Moderate",
                                effortHours: { min: 1, max: 3 }
                            });
                        }
                    });
                }
            });
        }

        // Extract from CSP object recommendations
        if (securityModuleOutput.csp && Array.isArray(securityModuleOutput.csp.recommendations)) {
            securityModuleOutput.csp.recommendations.forEach(rec => {
                if (rec && typeof rec === 'string' && rec.trim() !== '') {
                    allSecurityRecommendations.push({
                        id: uuidv4(),
                        text: rec,
                        priority: securityModuleOutput.csp.score < 70 ? "High" : "Medium",
                        source: "security",
                        impact: "Improves Content Security Policy implementation",
                        effort: "Moderate",
                        effortHours: { min: 2, max: 6 }
                    });
                }
            });
        }

        // Extract from SSL recommendations if available
        if (securityModuleOutput.ssl && securityModuleOutput.ssl.recommendation &&
            typeof securityModuleOutput.ssl.recommendation === 'string' &&
            securityModuleOutput.ssl.recommendation.trim() !== '') {
            allSecurityRecommendations.push({
                id: uuidv4(),
                text: securityModuleOutput.ssl.recommendation,
                priority: securityModuleOutput.ssl.score < 70 ? "High" : "Medium",
                source: "security",
                impact: "Improves SSL/TLS security configuration",
                effort: "High",
                effortHours: { min: 4, max: 8 }
            });
        }

        // Combine with any AI-generated recommendations
        const aiGeneratedRecs = getNestedProperty(securityModuleOutput, 'recommendations.items') || [];
        const formattedAiRecs = aiGeneratedRecs.map(rec => {
            let formattedRec;
            if (typeof rec === 'string') {
                formattedRec = {
                    id: uuidv4(),
                    text: rec,
                    priority: "Medium",
                    source: "security",
                    impact: "Security improvement",
                    effort: "Moderate",
                    effortHours: { min: 2, max: 4 }
                };
            } else {
                formattedRec = { ...rec };
                // Fix Issue #3: Ensure ID is always a valid UUID with enhanced validation
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                const invalidPatterns = /^(REC\d+|rec\d+|RECOMMENDATION\d+|recommendation\d+|\d+|ID\d+|id\d+)$/i;

                if (!formattedRec.id ||
                    typeof formattedRec.id !== 'string' ||
                    !uuidRegex.test(formattedRec.id) ||
                    invalidPatterns.test(formattedRec.id) ||
                    formattedRec.id.length !== 36) {
                    formattedRec.id = uuidv4();
                }

                // CRITICAL FIX: Ensure text is never missing or empty with enhanced validation
                if (!formattedRec.text ||
                    typeof formattedRec.text !== 'string' ||
                    formattedRec.text.trim() === '' ||
                    formattedRec.text.includes('Security improvement recommendation - review') ||
                    formattedRec.text.includes('Recommendation text missing') ||
                    formattedRec.text.includes('details pending') ||
                    formattedRec.text.includes('review security analysis findings for specific details') ||
                    formattedRec.text.length < 25 ||
                    /^(Security|Improve|Enhance|Review|Update|Fix|Address)\s+(security|improvement|recommendation|analysis).*$/i.test(formattedRec.text)) {

                    // Generate highly specific recommendation based on available security data
                    let specificText = "Strengthen security configuration to protect against vulnerabilities and enhance overall website security posture.";

                    // Generate specific text based on actual security findings
                    if (securityModuleOutput.ssl && securityModuleOutput.ssl.score < 70) {
                        if (securityModuleOutput.ssl.score < 30) {
                            specificText = "Implement comprehensive SSL/TLS security by upgrading to TLS 1.3, enabling HSTS with long max-age (31536000), and ensuring proper certificate chain validation.";
                        } else {
                            specificText = "Enhance SSL/TLS configuration by implementing HTTP Strict Transport Security (HSTS), updating cipher suites to modern standards, and ensuring certificate validity.";
                        }
                    } else if (securityModuleOutput.headers && Object.values(securityModuleOutput.headers).some(h => h && h.score < 50)) {
                        const lowScoringHeaders = Object.entries(securityModuleOutput.headers)
                            .filter(([name, header]) => header && header.score < 50)
                            .map(([name]) => name);

                        if (lowScoringHeaders.includes('contentSecurityPolicy')) {
                            specificText = "Implement a comprehensive Content Security Policy (CSP) header with strict directives to prevent XSS attacks, starting with 'default-src 'self'' and progressively tightening restrictions.";
                        } else if (lowScoringHeaders.includes('strictTransportSecurity')) {
                            specificText = "Configure HTTP Strict Transport Security (HSTS) header with 'max-age=31536000; includeSubDomains; preload' to prevent SSL stripping attacks and enhance connection security.";
                        } else if (lowScoringHeaders.includes('xFrameOptions')) {
                            specificText = "Add X-Frame-Options header set to 'DENY' or 'SAMEORIGIN' to prevent clickjacking attacks and protect users from malicious iframe embedding.";
                        } else {
                            specificText = `Implement missing security headers (${lowScoringHeaders.join(', ')}) to protect against common web vulnerabilities including XSS, clickjacking, and MIME-type confusion attacks.`;
                        }
                    } else if (securityModuleOutput.csp && securityModuleOutput.csp.score < 70) {
                        if (securityModuleOutput.csp.score < 30) {
                            specificText = "Implement a comprehensive Content Security Policy starting with 'default-src 'self'' and progressively adding specific directives for scripts, styles, and resources to prevent code injection attacks.";
                        } else {
                            specificText = "Strengthen existing Content Security Policy by removing 'unsafe-inline' and 'unsafe-eval' directives, implementing nonce-based or hash-based script execution, and adding report-uri for monitoring violations.";
                        }
                    } else if (Array.isArray(securityModuleOutput.vulnerabilities) && securityModuleOutput.vulnerabilities.length > 0) {
                        const criticalVulns = securityModuleOutput.vulnerabilities.filter(v => v.severity === 'Critical').length;
                        const highVulns = securityModuleOutput.vulnerabilities.filter(v => v.severity === 'High').length;

                        if (criticalVulns > 0) {
                            specificText = `Address ${criticalVulns} critical security vulnerabilities immediately through software updates, security patches, and configuration changes to prevent potential data breaches.`;
                        } else if (highVulns > 0) {
                            specificText = `Resolve ${highVulns} high-severity security vulnerabilities through systematic patching, software updates, and security configuration improvements.`;
                        } else {
                            specificText = `Address identified security vulnerabilities through regular security updates, vulnerability scanning, and implementation of security best practices.`;
                        }
                    } else if (securityModuleOutput.forms && securityModuleOutput.forms.score < 60) {
                        specificText = "Enhance form security by implementing CSRF protection tokens, ensuring HTTPS-only form submission, adding proper input validation and sanitization, and implementing rate limiting.";
                    } else {
                        // Generate recommendation based on overall security score
                        if (securityModuleOutput.summary && securityModuleOutput.summary.score < 30) {
                            specificText = "Implement comprehensive security measures including SSL/TLS encryption, security headers (CSP, HSTS, X-Frame-Options), vulnerability management, and regular security assessments.";
                        } else if (securityModuleOutput.summary && securityModuleOutput.summary.score < 60) {
                            specificText = "Strengthen security posture by implementing additional security headers, enhancing SSL/TLS configuration, and establishing regular vulnerability scanning and patch management procedures.";
                        } else {
                            specificText = "Maintain and enhance current security measures through regular security reviews, continuous monitoring, and proactive threat detection mechanisms.";
                        }
                    }

                    formattedRec.text = specificText;
                }

                // CRITICAL FIX: Remove inappropriate elementIdentifiers for server-level security recommendations
                const serverLevelKeywords = [
                    'ssl', 'tls', 'https', 'certificate', 'header', 'csp', 'hsts', 'server', 'configuration',
                    'content security policy', 'strict transport security', 'x-frame-options', 'x-content-type-options',
                    'referrer-policy', 'permissions-policy', 'cross-origin', 'vulnerability', 'patch', 'update',
                    'encryption', 'cipher', 'protocol', 'authentication', 'authorization', 'firewall', 'dns'
                ];

                const isServerLevelRecommendation = serverLevelKeywords.some(keyword =>
                    formattedRec.text.toLowerCase().includes(keyword)
                );

                if (isServerLevelRecommendation) {
                    // Remove elementIdentifiers for server/infrastructure recommendations
                    delete formattedRec.elementIdentifiers;
                } else if (formattedRec.elementIdentifiers && Array.isArray(formattedRec.elementIdentifiers)) {
                    // For non-server recommendations, clean up generic/inappropriate selectors
                    const inappropriateSelectors = [
                        'head link[rel=\'stylesheet\'][href*=\'critical\']:first-of-type',
                        'head', 'html', 'body', 'document', 'window', 'various elements',
                        'general', 'N/A', 'n/a', 'none', 'unknown'
                    ];

                    formattedRec.elementIdentifiers = formattedRec.elementIdentifiers.filter(ei =>
                        ei && ei.value && !inappropriateSelectors.some(inappropriate =>
                            ei.value.toLowerCase().includes(inappropriate.toLowerCase())
                        )
                    );

                    // Remove elementIdentifiers entirely if all were filtered out
                    if (formattedRec.elementIdentifiers.length === 0) {
                        delete formattedRec.elementIdentifiers;
                    }
                }

                // Ensure other required fields are present
                if (!formattedRec.priority) { formattedRec.priority = "Medium"; }
                if (!formattedRec.source) { formattedRec.source = "security"; }
                if (!formattedRec.impact) { formattedRec.impact = null; }
                if (!formattedRec.effort) { formattedRec.effort = "Moderate"; }
                if (!formattedRec.effortHours) { formattedRec.effortHours = { min: 2, max: 4 }; }
            }
            return formattedRec;
        }).filter(rec => rec.text && rec.text.trim() !== ''); // Filter out any recommendations with empty text

        // Combine all recommendations and deduplicate
        const combinedRecommendations = [...allSecurityRecommendations, ...formattedAiRecs];
        const uniqueRecommendations = combinedRecommendations.filter((rec, index, arr) =>
            arr.findIndex(r => r.text === rec.text) === index
        );

        securityModuleOutput.recommendations = createDefaultPaginatedArray(uniqueRecommendations);

        // Extract issues from vulnerabilities and header analysis
        const allSecurityIssues = [];

        // Extract from vulnerabilities
        if (Array.isArray(securityModuleOutput.vulnerabilities)) {
            securityModuleOutput.vulnerabilities.forEach(vuln => {
                allSecurityIssues.push({
                    text: vuln.description || vuln.name || "Security vulnerability detected",
                    severity: vuln.severity || "Medium",
                    location: "Security scan",
                    source: "security"
                });
            });
        }

        // Add deterministic issues if score is low but issues are missing
        if (securityModuleOutput.ssl && !securityModuleOutput.ssl.isHttps) {
            allSecurityIssues.push({ text: "Site is not served over HTTPS (Missing SSL/TLS)", severity: "Critical", location: "Global", source: "security" });
        }
        if (securityModuleOutput.csp && !securityModuleOutput.csp.present) {
            allSecurityIssues.push({ text: "Missing Content Security Policy (CSP)", severity: "High", location: "Headers", source: "security" });
        }
        if (securityModuleOutput.ssl && !securityModuleOutput.ssl.hstsEnabled && securityModuleOutput.ssl.isHttps) {
            allSecurityIssues.push({ text: "Missing HTTP Strict Transport Security (HSTS)", severity: "High", location: "Headers", source: "security" });
        }
        if (securityModuleOutput.forms && securityModuleOutput.forms.score < 50) {
            allSecurityIssues.push({ text: "Forms missing adequate security (e.g. CSRF protection)", severity: "Medium", location: "Forms", source: "security" });
        }

        // Extract structured issues for every missing or low-scoring security header
        // This ensures issues.items is populated even when the AI response is thin.
        const HEADER_META = {
            contentSecurityPolicy: { label: 'Content-Security-Policy (CSP)', severity: 'High', description: 'No CSP header was found. This leaves the site vulnerable to cross-site scripting (XSS) and clickjacking attacks.' },
            strictTransportSecurity: { label: 'Strict-Transport-Security (HSTS)', severity: 'High', description: 'No HSTS header was found. Browsers cannot enforce HTTPS-only connections, leaving users exposed to protocol downgrade attacks.' },
            xFrameOptions: { label: 'X-Frame-Options', severity: 'Medium', description: 'No X-Frame-Options header was found. The page may be embeddable in iframes, enabling clickjacking attacks.' },
            xContentTypeOptions: { label: 'X-Content-Type-Options', severity: 'Medium', description: 'No X-Content-Type-Options header was found. Browsers may MIME-sniff responses, enabling content injection attacks.' },
            referrerPolicy: { label: 'Referrer-Policy', severity: 'Low', description: 'No Referrer-Policy header was found. Full referrer URLs may be leaked to third-party resources.' },
            permissionsPolicy: { label: 'Permissions-Policy', severity: 'Low', description: 'No Permissions-Policy (formerly Feature-Policy) header was found. Browser features like camera/microphone are not restricted.' },
            crossOriginOpenerPolicy: { label: 'Cross-Origin-Opener-Policy (COOP)', severity: 'Low', description: 'No COOP header was found. The page may be vulnerable to cross-origin information leakage.' },
            crossOriginEmbedderPolicy: { label: 'Cross-Origin-Embedder-Policy (COEP)', severity: 'Low', description: 'No COEP header was found. Cross-origin isolation cannot be enabled without this header.' },
            crossOriginResourcePolicy: { label: 'Cross-Origin-Resource-Policy (CORP)', severity: 'Low', description: 'No CORP header was found. Cross-origin resources may be loaded without restriction.' },
        };
        if (securityModuleOutput.headers) {
            Object.entries(securityModuleOutput.headers).forEach(([headerName, header]) => {
                if (!header) return;
                const meta = HEADER_META[headerName];
                const isAbsent = header.present === false || header.score === 0;
                const isLowScore = typeof header.score === 'number' && header.score < 40;

                if (meta && (isAbsent || isLowScore)) {
                    // Emit a structured, human-readable issue for this missing/weak header
                    allSecurityIssues.push({
                        title: `Missing ${meta.label} header`,
                        text: `Missing ${meta.label} header`,
                        description: meta.description,
                        severity: meta.severity,
                        category: 'Security Headers',
                        location: 'HTTP Headers',
                        source: 'deterministic',
                        affectedUrls: [url],
                    });
                } else if (header.score < 60 && Array.isArray(header.issues) && header.issues.length > 0) {
                    // Emit existing AI-provided issue strings for partially-configured headers
                    header.issues.forEach(issue => {
                        allSecurityIssues.push({
                            title: `${meta ? meta.label : headerName} misconfiguration`,
                            text: `${meta ? meta.label : headerName}: ${issue}`,
                            description: issue,
                            severity: header.score < 30 ? 'High' : 'Medium',
                            category: 'Security Headers',
                            location: 'HTTP Headers',
                            source: 'security',
                        });
                    });
                }
            });
        }

        // Combine with any AI-generated issues
        const aiGeneratedIssues = getNestedProperty(securityModuleOutput, 'issues.items', []);
        const combinedIssues = [...allSecurityIssues, ...aiGeneratedIssues];

        // Deduplicate issues by text
        const uniqueIssues = combinedIssues.filter((issue, index, arr) =>
            arr.findIndex(i => i.text === issue.text) === index
        );

        securityModuleOutput.issues = createDefaultPaginatedArray(formatIssuesArray(uniqueIssues));

        if (onProgress) { onProgress('security', 'Calculating final scores', 95); }
        securityModuleOutput.summary.score = calculateModuleSummaryScore('security', securityModuleOutput, { tier });
        securityModuleOutput._skipped = false;
        securityModuleOutput.summary.rating = getRatingLabelForScore(securityModuleOutput.summary.score, false);

        const sortedIssues = (securityModuleOutput.issues.items || [])
            .sort((a, b) => {
                const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                return (severities[a.severity] || 5) - (severities[b.severity] || 5);
            });
        securityModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue => issue.text || "Issue description missing");

        // GOLD-STANDARD: Generate strengths from security sub-sections
        const secStrengths = [];
        if (securityModuleOutput.headers?.score >= 70) secStrengths.push('Security headers properly configured');
        if (securityModuleOutput.headers?.strictTransportSecurity?.present) secStrengths.push('HSTS enabled for transport security');
        if (securityModuleOutput.headers?.xContentTypeOptions?.present) secStrengths.push('X-Content-Type-Options set to prevent MIME sniffing');
        if (securityModuleOutput.ssl?.score >= 80) secStrengths.push(`Strong SSL/TLS configuration (${securityModuleOutput.ssl?.protocol || 'TLS'})`);
        if (securityModuleOutput.ssl?.daysToExpiration > 30) secStrengths.push(`SSL certificate valid for ${securityModuleOutput.ssl.daysToExpiration}+ days`);
        if (securityModuleOutput.csp?.present) secStrengths.push('Content Security Policy implemented');
        if (securityModuleOutput.forms?.csrfProtectionDetails?.present || securityModuleOutput.forms?.score >= 80) secStrengths.push('Form security measures in place');
        if ((securityModuleOutput.vulnerabilities || []).length === 0) secStrengths.push('No critical vulnerabilities detected');
        if (secStrengths.length === 0 && securityModuleOutput.summary.score >= 50) secStrengths.push('Basic security fundamentals in place');
        securityModuleOutput.summary.strengths = secStrengths;

        // Now natively handled via crossViewport or schema

        if (verbose) { console.log(`[SecurityModule] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${securityModuleOutput.summary.score}`); }
        if (onProgress) { onProgress('security', 'Security analysis finalized', 100); }

        // FINAL PASS: Coerce ssl.expiration — schema requires null or ISO date-time string, never empty string
        // This runs last to catch any re-assignment after the earlier coercion at line 707
        if (securityModuleOutput.ssl) {
            const exp = securityModuleOutput.ssl.expiration;
            if (exp === '' || exp === undefined || exp === 'unknown' || exp === 'N/A') {
                securityModuleOutput.ssl.expiration = null;
            }
        }

        return securityModuleOutput;

    } catch (error) {
        console.error(`[SecurityModule] Critical error in Security analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('security', `Error: ${error.message}`, 100); }
        securityModuleOutput.error = `Security analysis critically failed: ${error.message}`;

        // GRACEFUL DEGRADATION: If we already gathered technical data (SSL, headers, forms)
        // before the AI call failed, use those scores instead of returning 0.
        // This prevents DeepSeek API errors from wiping out valid technical analysis.
        const hasTechnicalData = (typeof sslContext !== 'undefined' && sslContext) ||
            (typeof headersContext !== 'undefined' && headersContext) ||
            (typeof formsContext !== 'undefined' && formsContext);

        if (hasTechnicalData) {
            const sslScore = sslContext?.score || 0;
            const headersScore = headersContext?.score || 0;
            let formScore = 100;
            if (formsContext && formsContext.count > 0) {
                formScore = sslContext?.isHttps ? 80 : 0;
            }
            const technicalScore = Math.round((sslScore * 0.4) + (headersScore * 0.3) + (formScore * 0.3));
            const finalScore = Math.max(technicalScore, 10); // Minimum 10 for valid sites

            securityModuleOutput.summary = {
                score: finalScore,
                rating: getRatingLabelForScore(finalScore, false),
                topIssues: [`AI analysis unavailable — score based on technical checks only (SSL: ${sslScore}, Headers: ${headersScore})`]
            };
            if (verbose) console.log(`[SecurityModule] AI failed, using technical-only score: ${finalScore} (SSL: ${sslScore}, Headers: ${headersScore})`);
        } else {
            securityModuleOutput.summary = { score: null, rating: 'Failed', topIssues: [securityModuleOutput.error.substring(0, 100)] };
            securityModuleOutput._skipped = true;
        }
        return securityModuleOutput;
    }
}

// --- Zero Trust Analysis Helper Functions ---

function calculateZeroTrustMaturity(securityData) {
    const scores = [
        calculateVerifyExplicitlyScore(securityData),
        calculateLeastPrivilegeScore(securityData),
        calculateAssumeBreachScore(securityData)
    ];
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    if (avgScore >= 80) { return "Advanced"; }
    if (avgScore >= 60) { return "Intermediate"; }
    if (avgScore >= 40) { return "Basic"; }
    return "Initial";
}

function calculateVerifyExplicitlyScore(securityData) {
    let score = 0;
    // Check for strong authentication headers/mechanisms
    const authHeaders = ['www-authenticate', 'authorization'];
    authHeaders.forEach(header => {
        if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
            securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))) {
            score += 25;
        }
    });

    // Check for secure transport enforcement
    if (securityData.ssl && securityData.ssl.score > 80) { score += 25; }

    // Check for HSTS enforcement
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        !securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('strict-transport-security'))) {
        score -= 20; // Penalty for missing HSTS
    }

    return Math.max(0, Math.min(score, 100));
}

function generateVerifyExplicitlyFindings(securityData) {
    const findings = [];

    const hasStrongAuth = securityData.ssl && securityData.ssl.score > 80;
    if (hasStrongAuth) {
        findings.push("Strong SSL/TLS encryption provides foundation for user identity verification");
    } else {
        findings.push("Weak or missing SSL/TLS encryption compromises user identity verification capabilities");
    }

    // CRITICAL FIX: Add proper null checks before accessing presentHeaders
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        !securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('strict-transport-security'))) {
        findings.push("Missing HSTS (HTTP Strict Transport Security) header reduces transport-level security verification");
    }

    if (securityData.forms && securityData.forms.secureCount === 0) {
        findings.push("Forms lack proper security controls for data submission verification");
    }

    return findings;
}

function generateVerifyExplicitlyRecommendations(securityData) {
    const recommendations = [];

    // Authentication recommendations
    const authHeaders = ['www-authenticate', 'authorization'];
    const hasAuth = authHeaders.some(header =>
        securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))
    );

    if (!hasAuth) {
        recommendations.push("Implement strong authentication mechanisms with proper security headers");
    }

    return recommendations;
}

function calculateLeastPrivilegeScore(securityData) {
    let score = 0;

    // Check for restrictive CSP
    const cspHeaders = ['content-security-policy'];
    cspHeaders.forEach(header => {
        if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
            securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))) {
            score += 30;
        }
    });

    // Check for frame restrictions
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        !securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('x-frame-options'))) {
        score -= 20; // Penalty for missing frame options
    }

    // SSL score contributes to least privilege
    if (securityData.ssl && securityData.ssl.score > 70) { score += 40; }

    return Math.max(0, Math.min(score, 100));
}

function generateLeastPrivilegeFindings(securityData) {
    const findings = [];

    const hasRoleBasedHeaders = securityData.headers &&
        securityData.headers.presentHeaders &&
        Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('authorization'));

    if (!hasRoleBasedHeaders) {
        findings.push("No evidence of role-based access controls in HTTP headers");
    }

    // CRITICAL FIX: Add proper null checks before accessing presentHeaders
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        !securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('x-frame-options'))) {
        findings.push("Missing X-Frame-Options header allows potential privilege escalation through clickjacking");
    }

    if (securityData.csp && !securityData.csp.isPresent) {
        findings.push("Content Security Policy not implemented, missing resource access restrictions");
    }

    return findings;
}

function generateLeastPrivilegeRecommendations(securityData) {
    const recommendations = [];

    const hasCsp = securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('content-security-policy'));

    if (!hasCsp) {
        recommendations.push("Implement restrictive Content Security Policy to follow least privilege principle");
    }

    return recommendations;
}

function calculateAssumeBreachScore(securityData) {
    let score = 0;

    // Check for monitoring and reporting mechanisms
    const monitoringHeaders = ['content-security-policy-report-uri', 'report-uri'];
    const hasMonitoring = monitoringHeaders.some(header =>
        securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))
    );

    if (hasMonitoring) { score += 40; }

    // Check for security-focused transport
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes('strict-transport-security'))) {
        score += 30;
    }

    // SSL configuration contributes to breach assumption
    if (securityData.ssl && securityData.ssl.score > 85) { score += 30; }

    return Math.max(0, Math.min(score, 100));
}

function generateAssumeBreachFindings(securityData) {
    const findings = [];

    // Monitoring findings
    const monitoringHeaders = ['content-security-policy-report-uri', 'report-uri'];
    const hasMonitoring = monitoringHeaders.some(header =>
        securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))
    );

    if (!hasMonitoring) {
        findings.push("No security monitoring or violation reporting mechanisms detected");
    }

    return findings;
}

function generateAssumeBreachRecommendations(securityData) {
    const recommendations = [];

    const monitoringHeaders = ['content-security-policy-report-uri', 'report-uri'];
    const hasMonitoring = monitoringHeaders.some(header =>
        securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.toLowerCase().includes(header))
    );

    if (!hasMonitoring) {
        recommendations.push("Implement security violation reporting to assume breach and detect incidents");
    }

    return recommendations;
}

function identifyZeroTrustGaps(securityData) {
    const gaps = [];

    if (!securityData.ssl || !securityData.ssl.isSecure) {
        gaps.push({
            category: "Identity & Access",
            description: "Inadequate transport security implementation",
            priority: "High",
            effort: "Medium"
        });
    }

    if (!securityData.csp || !securityData.csp.isPresent) {
        gaps.push({
            category: "Device Security",
            description: "Missing Content Security Policy for resource control",
            priority: "High",
            effort: "Low"
        });
    }

    if (securityData.vulnerabilities && securityData.vulnerabilities.length > 0) {
        gaps.push({
            category: "Application Security",
            description: "Unpatched vulnerabilities present",
            priority: "Critical",
            effort: "High"
        });
    }

    gaps.push({
        category: "Data Protection",
        description: "Limited data classification and protection mechanisms",
        priority: "Medium",
        effort: "High"
    });

    return gaps;
}

function generateZeroTrustPrioritizedRecommendations(securityData) {
    const recommendations = [];

    // Critical priority recommendations
    if (!securityData.ssl || !securityData.ssl.isSecure) {
        recommendations.push({
            priority: "Critical",
            category: "Transport Security",
            recommendation: "Implement proper SSL/TLS encryption with strong cipher suites",
            timeframe: "Immediate",
            effort: "Medium"
        });
    }

    // High priority recommendations
    if (!securityData.csp || !securityData.csp.isPresent) {
        recommendations.push({
            priority: "High",
            category: "Content Security",
            recommendation: "Deploy comprehensive Content Security Policy",
            timeframe: "1-2 weeks",
            effort: "Low"
        });
    }

    // Medium priority recommendations
    recommendations.push({
        priority: "Medium",
        category: "Access Control",
        recommendation: "Implement multi-factor authentication for all user accounts",
        timeframe: "1-3 months",
        effort: "High"
    });

    recommendations.push({
        priority: "Medium",
        category: "Monitoring",
        recommendation: "Deploy security information and event management (SIEM) solution",
        timeframe: "3-6 months",
        effort: "High"
    });

    return recommendations;
}

function assessNistFrameworkAlignment(securityData) {
    const functions = {
        identify: calculateIdentifyScore(securityData),
        protect: calculateProtectScore(securityData),
        detect: calculateDetectScore(securityData),
        respond: calculateRespondScore(securityData),
        recover: calculateRecoverScore(securityData)
    };

    const overallScore = Object.values(functions).reduce((sum, score) => sum + score, 0) / 5;

    return {
        overallAlignment: Math.round(overallScore),
        functionScores: functions,
        gaps: identifyNistGaps(functions),
        recommendations: generateNistRecommendations(functions)
    };
}

function calculateIdentifyScore(securityData) {
    let score = 0;
    // Basic security assessment (50 points possible)
    if (securityData.ssl && securityData.ssl.score > 70) { score += 20; }
    if (securityData.headers && securityData.headers.presentHeaders && securityData.headers.presentHeaders.length > 0) { score += 30; }
    return Math.min(score, 100);
}

function calculateProtectScore(securityData) {
    let score = 0;
    // Protection mechanisms (50 points possible)
    if (securityData.ssl && securityData.ssl.score > 80) { score += 20; }
    if (securityData.headers && securityData.headers.presentHeaders && securityData.headers.presentHeaders.length >= 3) { score += 30; }
    return Math.min(score, 100);
}

function calculateDetectScore(securityData) {
    let score = 0;
    // Basic detection capabilities (monitoring headers, CSP reporting)
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('report-uri'))) { score += 40; }
        if (securityData.headers.presentHeaders.some(h => h && h.includes('content-security-policy'))) { score += 30; }
    }
    if (securityData.ssl && securityData.ssl.score > 70) { score += 30; }
    return Math.min(score, 100);
}

function calculateRespondScore(securityData) {
    return 30; // Base score - would need additional data for full assessment
}

function calculateRecoverScore(securityData) {
    return 25; // Base score - would need additional data for full assessment
}

function identifyNistGaps(functionScores) {
    const gaps = [];
    Object.entries(functionScores).forEach(([func, score]) => {
        if (score < 70) {
            gaps.push(`${func.charAt(0).toUpperCase() + func.slice(1)} function needs improvement (${score}/100)`);
        }
    });
    return gaps;
}

function generateNistRecommendations(functionScores) {
    const recommendations = [];
    if (functionScores.identify < 70) { recommendations.push("Enhance asset inventory and risk assessment processes"); }
    if (functionScores.protect < 70) { recommendations.push("Strengthen protective controls and access management"); }
    if (functionScores.detect < 70) { recommendations.push("Improve security monitoring and detection capabilities"); }
    if (functionScores.respond < 70) { recommendations.push("Develop incident response procedures and capabilities"); }
    if (functionScores.recover < 70) { recommendations.push("Establish business continuity and disaster recovery plans"); }
    return recommendations;
}

function assessIso27001Alignment(securityData) {
    const controlCategories = {
        informationSecurityPolicies: 60,
        organizationOfInformationSecurity: 50,
        humanResourceSecurity: 40,
        assetManagement: 55,
        accessControl: calculateAccessControlScore(securityData),
        cryptography: calculateCryptographyScore(securityData),
        physicalAndEnvironmentalSecurity: 45,
        operationsSecurityManagement: 50,
        communicationsSecurityManagement: calculateCommunicationsSecurityScore(securityData),
        systemAcquisitionDevelopmentMaintenance: 55,
        supplierRelationships: 40,
        informationSecurityIncidentManagement: 35,
        informationSecurityInBusinessContinuity: 30,
        compliance: 45
    };

    const overallScore = Object.values(controlCategories).reduce((sum, score) => sum + score, 0) / Object.keys(controlCategories).length;

    return {
        overallAlignment: Math.round(overallScore),
        controlCategoryScores: controlCategories,
        criticalGaps: identifyIso27001Gaps(controlCategories),
        improvementPlan: generateIso27001ImprovementPlan(controlCategories)
    };
}

function calculateAccessControlScore(securityData) {
    let score = 0;
    // Access control headers and mechanisms
    if (securityData.ssl && securityData.ssl.isSecure) { score += 40; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('x-frame-options'))) { score += 35; }
        if (securityData.headers.presentHeaders.some(h => h && h.includes('strict-transport-security'))) { score += 25; }
    }
    return Math.min(score, 100);
}

function calculateCryptographyScore(securityData) {
    let score = 0;
    if (securityData.ssl && securityData.ssl.isSecure) { score += 60; }
    if (securityData.ssl && securityData.ssl.grade && securityData.ssl.grade.startsWith('A')) { score += 40; }
    return Math.min(100, score);
}

function calculateCommunicationsSecurityScore(securityData) {
    let score = 0;
    // Communications security assessment
    if (securityData.ssl && securityData.ssl.score > 80) { score += 70; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('strict-transport-security'))) { score += 30; }
    }
    return Math.min(score, 100);
}

function identifyIso27001Gaps(controlCategories) {
    const gaps = [];
    Object.entries(controlCategories).forEach(([category, score]) => {
        if (score < 60) {
            gaps.push({
                category: category.replace(/([A-Z])/g, ' $1').trim(),
                score: score,
                priority: score < 40 ? "High" : "Medium"
            });
        }
    });
    return gaps;
}

function generateIso27001ImprovementPlan(controlCategories) {
    const plan = [];

    // Prioritize based on scores
    const sortedCategories = Object.entries(controlCategories)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 5); // Top 5 priorities

    sortedCategories.forEach(([category, score], index) => {
        plan.push({
            phase: index + 1,
            category: category.replace(/([A-Z])/g, ' $1').trim(),
            currentScore: score,
            targetScore: Math.min(100, score + 30),
            timeframe: `${(index + 1) * 3}-${(index + 2) * 3} months`,
            keyActions: generateCategoryActions(category)
        });
    });

    return plan;
}

function generateCategoryActions(category) {
    const actions = {
        accessControl: ["Implement role-based access control", "Deploy multi-factor authentication", "Regular access reviews"],
        cryptography: ["Upgrade SSL/TLS configuration", "Implement proper key management", "Deploy encryption at rest"],
        communicationsSecurityManagement: ["Secure all communication channels", "Implement network segmentation", "Deploy secure protocols"],
        default: ["Develop policies and procedures", "Implement technical controls", "Conduct regular assessments"]
    };

    return actions[category] || actions.default;
}

function assessCisControlsAlignment(securityData) {
    const controls = {
        inventoryAndControlOfHardwareAssets: 45,
        inventoryAndControlOfSoftwareAssets: 40,
        continuousVulnerabilityManagement: calculateVulnerabilityManagementScore(securityData),
        controlledUseOfAdministrativePrivileges: 35,
        secureConfigurationForHardwareAndSoftware: calculateSecureConfigurationScore(securityData),
        maintenanceMonitoringAndAnalysisOfAuditLogs: 30,
        emailAndWebBrowserProtections: calculateWebProtectionScore(securityData),
        malwareDefenses: 40,
        limitationAndControlOfNetworkPortsProtocolsAndServices: 45,
        dataRecoveryCapabilities: 25,
        secureConfigurationForNetworkDevicesFirewallsRoutersAndSwitches: 35,
        boundaryDefense: calculateBoundaryDefenseScore(securityData),
        dataProtection: calculateDataProtectionScore(securityData),
        controlledAccess: calculateControlledAccessScore(securityData),
        wirelessAccessControl: 30,
        accountMonitoringAndControl: 25,
        implementASecurityAwarenessAndTrainingProgram: 20,
        applicationSoftwareSecurity: calculateApplicationSecurityScore(securityData),
        incidentResponseAndManagement: 20,
        penetrationTestsAndRedTeamExercises: 15
    };

    const overallScore = Object.values(controls).reduce((sum, score) => sum + score, 0) / Object.keys(controls).length;

    return {
        overallAlignment: Math.round(overallScore),
        controlScores: controls,
        topPriorities: identifyTopCisPriorities(controls),
        implementationRoadmap: generateCisImplementationRoadmap(controls)
    };
}

function calculateVulnerabilityManagementScore(securityData) {
    let score = 30; // Base score
    if (securityData.vulnerabilities && securityData.vulnerabilities.length === 0) { score += 70; }
    else if (securityData.vulnerabilities && securityData.vulnerabilities.length < 3) { score += 40; }
    return Math.min(100, score);
}

function calculateSecureConfigurationScore(securityData) {
    let score = 0;
    // Secure configuration assessment
    if (securityData.ssl && securityData.ssl.score > 70) { score += 40; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('x-content-type-options'))) { score += 30; }
        if (securityData.headers.presentHeaders.some(h => h && h.includes('x-frame-options'))) { score += 30; }
    }
    return Math.min(score, 100);
}

function calculateWebProtectionScore(securityData) {
    let score = 0;
    // Web-specific protection mechanisms
    if (securityData.csp && securityData.csp.isPresent) { score += 40; }
    if (securityData.ssl && securityData.ssl.score > 75) { score += 30; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('x-frame-options'))) { score += 30; }
    }
    return Math.min(score, 100);
}

function calculateBoundaryDefenseScore(securityData) {
    let score = 0;
    // Boundary defense mechanisms
    if (securityData.ssl && securityData.ssl.isSecure) { score += 50; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders)) {
        if (securityData.headers.presentHeaders.some(h => h && h.includes('x-frame-options'))) { score += 35; }
    }
    if (securityData.csp && securityData.csp.isPresent) { score += 15; }
    return Math.min(score, 100);
}

function calculateDataProtectionScore(securityData) {
    let score = 0;

    // Check for data protection headers
    if (securityData.headers &&
        securityData.headers.presentHeaders &&
        Array.isArray(securityData.headers.presentHeaders) &&
        securityData.headers.presentHeaders.some(h => h && h.includes('x-frame-options'))) { score += 35; }

    // Check for form security
    if (securityData.forms && securityData.forms.secureCount > 0) { score += 35; }

    // Check for SSL encryption
    if (securityData.ssl && securityData.ssl.isSecure) { score += 30; }

    return Math.round(Math.min(100, score));
}

function calculateControlledAccessScore(securityData) {
    let score = 0;
    // Controlled access assessment
    if (securityData.ssl && securityData.ssl.score > 80) { score += 65; }
    if (securityData.headers && securityData.headers.presentHeaders && Array.isArray(securityData.headers.presentHeaders) && securityData.headers.presentHeaders.some(h => h.includes('x-frame-options'))) { score += 35; }
    return Math.min(score, 100);
}

function calculateApplicationSecurityScore(securityData) {
    let score = 30; // Base score
    if (securityData.csp && securityData.csp.isPresent) { score += 40; }
    if (securityData.vulnerabilities && securityData.vulnerabilities.length === 0) { score += 30; }
    return Math.min(100, score);
}

function identifyTopCisPriorities(controls) {
    return Object.entries(controls)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 5)
        .map(([control, score]) => ({
            control: control.replace(/([A-Z])/g, ' $1').trim(),
            currentScore: score,
            priority: score < 30 ? "Critical" : score < 50 ? "High" : "Medium"
        }));
}

function generateCisImplementationRoadmap(controls) {
    const roadmap = [];
    const priorities = identifyTopCisPriorities(controls);

    priorities.forEach((priority, index) => {
        roadmap.push({
            quarter: `Q${index + 1}`,
            control: priority.control,
            currentScore: priority.currentScore,
            targetScore: Math.min(100, priority.currentScore + 40),
            keyMilestones: generateControlMilestones(priority.control),
            estimatedEffort: priority.priority === "Critical" ? "High" : "Medium"
        });
    });

    return roadmap;
}

function generateControlMilestones(control) {
    const milestones = {
        "Continuous Vulnerability Management": ["Deploy vulnerability scanner", "Establish patching process", "Implement continuous monitoring"],
        "Secure Configuration For Hardware And Software": ["Baseline security configurations", "Deploy configuration management", "Regular compliance checks"],
        "Email And Web Browser Protections": ["Implement CSP", "Deploy web filtering", "Email security controls"],
        default: ["Assessment and planning", "Implementation", "Testing and validation", "Ongoing monitoring"]
    };

    return milestones[control] || milestones.default;
}

function calculateCurrentRiskLevel(securityData) {
    let riskScore = 0;

    // SSL/TLS risk
    if (!securityData.ssl || !securityData.ssl.isSecure) { riskScore += 30; }

    // Vulnerability risk
    if (securityData.vulnerabilities && securityData.vulnerabilities.length > 0) {
        riskScore += securityData.vulnerabilities.length * 10;
    }

    // Missing security headers risk - FIX: Add proper null checks
    if (!securityData.headers ||
        !securityData.headers.presentHeaders ||
        !Array.isArray(securityData.headers.presentHeaders) ||
        securityData.headers.presentHeaders.length < 3) {
        riskScore += 20;
    }

    // CSP risk
    if (!securityData.csp || !securityData.csp.isPresent) { riskScore += 15; }

    if (riskScore >= 60) { return "High"; }
    if (riskScore >= 30) { return "Medium"; }
    return "Low";
}

function identifyRiskFactors(securityData) {
    const riskFactors = [];

    // Critical infrastructure risks
    if (!securityData.ssl || securityData.ssl.score < 50) {
        riskFactors.push({
            factor: "SSL/TLS Configuration",
            severity: "Critical",
            description: "Weak or missing SSL/TLS encryption exposes data in transit to interception and manipulation attacks.",
            impact: "Data breaches, man-in-the-middle attacks, compliance violations"
        });
    }

    // Header security risks - FIX: Add proper null checks
    if (!securityData.headers ||
        !securityData.headers.presentHeaders ||
        !Array.isArray(securityData.headers.presentHeaders) ||
        securityData.headers.presentHeaders.length < 3) {
        riskFactors.push({
            factor: "Security Headers",
            severity: "High",
            description: "Missing security headers leave the application vulnerable to various client-side attacks including XSS, clickjacking, and MIME-type confusion.",
            impact: "Cross-site scripting attacks, clickjacking, data theft"
        });
    }

    return riskFactors;
}

function generateMitigationStrategies(securityData) {
    const strategies = [];

    if (!securityData.ssl || !securityData.ssl.isSecure) {
        strategies.push({
            strategy: "Implement Strong Transport Security",
            priority: "Critical",
            timeframe: "Immediate",
            actions: ["Deploy proper SSL/TLS", "Configure HSTS", "Use strong cipher suites"],
            expectedRiskReduction: "High"
        });
    }

    if (!securityData.csp || !securityData.csp.isPresent) {
        strategies.push({
            strategy: "Deploy Content Security Policy",
            priority: "High",
            timeframe: "1-2 weeks",
            actions: ["Implement CSP headers", "Configure reporting", "Test and refine policies"],
            expectedRiskReduction: "Medium"
        });
    }

    strategies.push({
        strategy: "Enhance Security Monitoring",
        priority: "Medium",
        timeframe: "1-3 months",
        actions: ["Deploy SIEM solution", "Implement log aggregation", "Set up alerting"],
        expectedRiskReduction: "Medium"
    });

    strategies.push({
        strategy: "Regular Security Assessments",
        priority: "Medium",
        timeframe: "Ongoing",
        actions: ["Quarterly vulnerability scans", "Annual penetration testing", "Continuous monitoring"],
        expectedRiskReduction: "Medium"
    });

    return strategies;
}

module.exports = { analyze };
