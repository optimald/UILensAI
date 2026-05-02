/**
 * Performance Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance;
 *
 * Analyzes website performance using PageSpeed Insights API data,
 * providing insights on Core Web Vitals, loading speed, server configuration,
 * third-party impact, and client-side rendering.;
 */
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn, execSync } = require('child_process');

// Fix lighthouse import - it should be a default import
let lighthouse;
try {
    lighthouse = require('lighthouse').default || require('lighthouse');
} catch (error) {
    console.warn('[PerformanceModule] Lighthouse not available:', error.message);
    lighthouse = null
}

const { v4: uuidv4 } = require('uuid');

const { getModelConfig } = require('../utils/ai-credentials');
// getStructuredData and getSchemaForModule are not directly used in this module if AI part is minimal
// const { getStructuredData, getSchemaForModule } = require('../utils/structured-llm-output');
const { getPrompt } = require('../utils/promptTemplates'); // May be used if AI augments Lighthouse;
// NOTE: LighthouseVersionValidator removed — PSI API is the sole performance data source

// Performance module loaded
const { formatIssuesArray } = require('../utils/issue-formatter');
const { calculateModuleSummaryScore, scorePerformanceMetric, getRatingLabelForScore, calculateThresholdScore, calculatePerformanceMetricsScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { detectIndustry } = require('../utils/industry-detection');

// --- Helper Functions ---

function createDefaultPaginatedArray(items = [], totalItems = null, pageSize = null) {
    const actualItems = Array.isArray(items) ? items : [];
    const itemCount = actualItems.length;
    const total = totalItems !== null ? totalItems : itemCount;
    if (itemCount === 0 && total === 0) { return { items: [], totalAvailableItems: 0, pagination: null } }
    const effectivePageSize = pageSize || (itemCount > 0 ? itemCount : 10);
    if (total <= effectivePageSize && itemCount <= effectivePageSize) { return { items: actualItems, totalAvailableItems: total, pagination: null } }
    return {
        items: actualItems, totalAvailableItems: total,
        pagination: { pageNumber: 1, pageSize: effectivePageSize, totalPages: Math.ceil(total / effectivePageSize) || 1 }
    };
}

function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || obj === null || !pathStr) { return defaultValue }
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
 * Converts Lighthouse audit details into schema-compliant recommendation items and basic issues.;
 * @param {Object} lighthouseAudits - Lighthouse LHR audits object.;
 * @param {string} sourcePrefix - Prefix for recommendation source.;
 * @returns {{recommendations: Array<Object>, issues: Array<Object>}}
 */
function formatLighthouseAuditsToRecommendationsAndIssues(lighthouseAudits, sourcePrefix = 'lighthouse-performance') {
    const recommendations = [];
    const issues = []; // Basic issues derived from failed audits;

    if (!lighthouseAudits || typeof lighthouseAudits !== 'object') {
        return { recommendations, issues };
    }

    Object.values(lighthouseAudits).forEach(audit => {
        // Consider audits that are not passing (score < 0.9 for numeric, or score === 0 for binary)
        // and are actual opportunities/diagnostics (not just informational like 'metrics').
        if (audit.scoreDisplayMode !== 'informative' && audit.score !== null && audit.score < 0.9 && audit.details && audit.details.type !== 'debugdata' && audit.details.type !== 'metrics') {
            const impactMapping = { 'critical': 'High', 'serious': 'High', 'moderate': 'Medium', 'minor': 'Low' }; // Map LH internal impact if available;
            const severity = impactMapping[audit.impact?.toLowerCase()] || (audit.score < 0.5 ? "High" : "Medium");

            let issueText = `${audit.title}${audit.description ? `: ${audit.description}` : ''}`;

            // Inject specific DOM/Network evidence
            if (audit.details && audit.details.items && Array.isArray(audit.details.items) && audit.details.items.length > 0) {
                const offenders = audit.details.items
                    .filter(item => item.url || item.node)
                    .slice(0, 3)
                    .map(item => {
                        let evidence = item.url ? item.url : (item.node?.snippet || '');
                        let stats = [];
                        if (item.wastedBytes) stats.push(`wasted: ${(item.wastedBytes/1024).toFixed(1)}KiB`);
                        if (item.wastedMs) stats.push(`wasted: ${item.wastedMs}ms`);
                        return evidence + (stats.length ? ` (${stats.join(', ')})` : '');
                    });
                if (offenders.length > 0) {
                    issueText += `\nSpecific Evidence: ${offenders.join(' | ')}`;
                }
            }
            issueText = issueText.substring(0, 5000);

            issues.push({
                text: issueText,
                severity: severity,
                location: audit.id, // Use audit ID as a location hint;
                details: { lighthouseAuditId: audit.id, score: audit.scoreDisplayMode === 'binary' ? (audit.score * 100) : audit.score }
            });

            // Create a recommendation item for the $defs/lighthouseAuditRecommendationItem structure
            let category = "Best Practices"; // Default category that exists in schema;

            // Map Lighthouse audit groups to schema-compliant categories
            if (audit.group === 'metrics') { category = "Best Practices" }
            else if (audit.group === 'load-opportunities') { category = "Resources" }
            else if (audit.group === 'diagnostics') { category = "Best Practices" }
            else if (audit.id && audit.id.includes('javascript')) { category = "JavaScript" }
            else if (audit.id && audit.id.includes('image')) { category = "Images" }
            else if (audit.id && audit.id.includes('network')) { category = "Network" }
            else if (audit.id && audit.id.includes('server')) { category = "Server" }
            else if (audit.id && audit.id.includes('critical')) { category = "Critical Rendering Path" }

            // Ensure category is always one of the allowed enum values
            const allowedCategories = ["Resources", "Critical Rendering Path", "JavaScript", "Images", "Network", "Best Practices", "Server"];
            if (!allowedCategories.includes(category)) {
                category = "Best Practices"; // Fallback to valid enum value;
            }

            // Build a descriptive recommendation text from the audit title + savings context
            let recText = audit.title;
            const savingsMs = getNestedProperty(audit, 'details.overallSavingsMs');
            const savingsBytes = getNestedProperty(audit, 'details.overallSavingsBytes');
            const numericVal = audit.numericValue;
            const suffixParts = [];
            if (savingsBytes) suffixParts.push(`reduce payload by ${(savingsBytes / 1024).toFixed(0)} KiB`);
            if (savingsMs) suffixParts.push(`save ~${(savingsMs / 1000).toFixed(1)}s`);
            if (!savingsBytes && !savingsMs && numericVal && typeof numericVal === 'number') {
                if (numericVal > 1000) suffixParts.push(`currently ${(numericVal / 1000).toFixed(1)}s`);
                else if (numericVal > 0) suffixParts.push(`value: ${numericVal}`);
            }
            if (suffixParts.length > 0) recText += ` — ${suffixParts.join(', ')}`;
            if (audit.displayValue) recText += ` (${audit.displayValue})`;

            const recItem = {
                id: audit.id,
                text: recText,
                priority: severity,
                impact: audit.description ? audit.description.substring(0, 1000) : "Review PSI audit details for improvement guidance.",
                source: "performance",
                effort: "Moderate",
                category: category, 
                implementation: audit.description || "Review PageSpeed Insights audit documentation.",
                potentialSavings: {
                    timeReduction: getNestedProperty(audit, 'details.overallSavingsMs', getNestedProperty(audit, 'numericValue')) || null, 
                    sizeReduction: getNestedProperty(audit, 'details.overallSavingsBytes') ? parseFloat((getNestedProperty(audit, 'details.overallSavingsBytes') / 1024).toFixed(1)) : null
                }
            };
            // Filter out savings if null
            if (recItem.potentialSavings.timeReduction === null && recItem.potentialSavings.sizeReduction === null) {
                delete recItem.potentialSavings;
            } else {
                if (recItem.potentialSavings.timeReduction === null) { delete recItem.potentialSavings.timeReduction }
                if (recItem.potentialSavings.sizeReduction === null) { delete recItem.potentialSavings.sizeReduction }
            }

            recommendations.push(recItem);
        }
    });
    return { recommendations, issues };
}

// NOTE: runLighthouse() and runLighthouseCLI() removed.
// PSI API (runPSI below) is the sole performance data source.


/**
 * Run performance analysis via Google PageSpeed Insights API with fallback strategy.
 * Returns the exact same LHR JSON structure as runLighthouseCLI().
 * 
 * @param {string} url - URL to analyze
 * @param {boolean} [verbose=false] - Enable verbose logging
 * @returns {Promise<object>} { lhr: LighthouseResult }
 */
async function runPSIWithFallback(url, strategy, verbose) {
    if (verbose) {
        console.log(`[PerformanceModule] 🌐 Using PageSpeed Insights API (${strategy}) for ${url}`);
    }

    const categories = ['performance', 'accessibility', 'seo', 'best-practices'];
    const params = new URLSearchParams({ url, strategy });
    categories.forEach(c => params.append('category', c));

    const apiKey = process.env.GOOGLE_PSI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error(`PSI API error (${strategy}): A GOOGLE_PSI_API_KEY is required to run the performance module. Public unauthenticated access is disabled.`);
    }
    
    params.set('key', apiKey);

    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

    const startTime = Date.now();
    const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    if (!response.ok) {
        let errorMsg;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error?.message || `HTTP ${response.status}`;
        } catch {
            errorMsg = `HTTP ${response.status} ${response.statusText}`;
        }
        throw new Error(`PSI API error (${strategy}): ${errorMsg}`);
    }

    const data = await response.json();
    if (!data.lighthouseResult) throw new Error(`PSI response missing lighthouseResult (${strategy})`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const lhr = data.lighthouseResult;
    const perfScore = Math.round((lhr.categories?.performance?.score || 0) * 100);

    if (verbose) console.log(`[PerformanceModule] ✅ PSI API (${strategy}) success in ${elapsed}s. Score: ${perfScore}/100`);

    let fieldData = null;
    const crux = data.loadingExperience;
    if (crux && crux.metrics && Object.keys(crux.metrics).length > 0) {
        fieldData = { overallCategory: crux.overall_category || null, metrics: {} };
        for (const [name, dat] of Object.entries(crux.metrics)) fieldData.metrics[name] = { percentile: dat.percentile, category: dat.category };
    }

    return { lhr, fieldData };
}

async function runPSI(url, verbose = false) {
    try {
        // Try desktop first
        return await runPSIWithFallback(url, 'desktop', verbose);
    } catch (desktopError) {
        if (verbose) console.log(`[PerformanceModule] ⚠️ Desktop strategy failed (${desktopError.message}), falling back to mobile after 3s...`);
        
        // Wait 3 seconds to avoid rate limiting
        await new Promise(r => setTimeout(r, 3000));
        
        try {
            // Fallback to mobile strategy
            return await runPSIWithFallback(url, 'mobile', verbose);
        } catch (mobileError) {
            console.error(`[PerformanceModule] ❌ Both Desktop and Mobile PSI API failed. Last error: ${mobileError.message}`);
            // Throw the mobile error to trigger the normal Inconclusive handling
            throw mobileError;
        }
    }
}

/**
 * Process real Lighthouse results into our format;
 */
function processPerformanceResults(lhr) {
    const metrics = extractMetrics(lhr);
    const scores = extractScores(lhr);
    const audits = extractAudits(lhr);
    const opportunities = extractOpportunities(lhr);
    const diagnostics = extractDiagnostics(lhr);

    // Enhanced server configuration extraction from Lighthouse audits
    const serverConfig = {
        responseHeaders: lhr.audits?.['response-headers']?.details?.items || {},
        serverSoftware: lhr.audits?.['server-response-time']?.details?.serverResponseTime?.server || 'Unknown',
        serverTiming: lhr.audits?.['server-response-time']?.numericValue || null,
        dnsLookupTimeMs: lhr.audits?.['network-rtt']?.numericValue || null,
        sslHandshakeTimeMs: lhr.audits?.['network-server-latency']?.numericValue || null,
        cachingScore: lhr.audits?.['uses-long-cache-ttl']?.score ? Math.round(lhr.audits['uses-long-cache-ttl'].score * 100) : 0,
        compressionEnabled: lhr.audits?.['uses-text-compression']?.score > 0.5 || false,
        http2Enabled: lhr.audits?.['uses-http2']?.score > 0.5 || false,
        cdnUsage: lhr.audits?.['uses-rel-preconnect']?.details?.items?.some(item =>
            item.url?.includes('cdn') || item.url?.includes('cloudflare') || item.url?.includes('amazonaws')) ? "Detected" : "Not Detected"
    };

    // ENHANCED THIRD-PARTY IMPACT: Extract comprehensive data from Lighthouse
    const thirdPartyItems = lhr?.audits?.['third-party-summary']?.details?.items || [];
    const thirdPartyImpact = {
        totalRequests: thirdPartyItems.length,
        totalTransferSize: thirdPartyItems.reduce((sum, item) => sum + (item.transferSize || 0), 0),
        totalBlockingTime: thirdPartyItems.reduce((sum, item) => sum + (item.blockingTime || 0), 0),
        performanceImpact: lhr?.audits?.['third-party-summary']?.score !== undefined ?
            (100 - Math.round(lhr.audits['third-party-summary'].score * 100)) : 0,
        topOffenders: thirdPartyItems
            .sort((a, b) => (b.blockingTime || 0) - (a.blockingTime || 0)) // Sort by blocking time
            .slice(0, 4)
            .map(item => {
                const url = item.url || '';
                const hostname = url ? new URL(url).hostname : 'Unknown';

                // Enhanced entity detection
                const detectEntityType = (hostname, entity) => {
                    if (entity?.category) { return entity.category }

                    // Enhanced type detection based on hostname patterns
                    const h = hostname.toLowerCase();
                    if (h.includes('analytics') || h.includes('google-analytics') || h.includes('gtag')) { return 'Analytics' }
                    if (h.includes('facebook') || h.includes('doubleclick') || h.includes('ads')) { return 'Advertising' }
                    if (h.includes('fonts') || h.includes('typekit')) { return 'Font' }
                    if (h.includes('jquery') || h.includes('bootstrap') || h.includes('unpkg')) { return 'Library' }
                    if (h.includes('chat') || h.includes('support')) { return 'Customer Support' }
                    if (h.includes('payment') || h.includes('stripe') || h.includes('paypal')) { return 'Payment' }
                    if (h.includes('social') || h.includes('twitter') || h.includes('instagram')) { return 'Social Media' }
                    return 'Unknown';
                };

                const entityName = item.entity?.name ||
                    (hostname.includes('google') ? 'Google Services' :
                        hostname.includes('facebook') ? 'Facebook' :
                            hostname.includes('cloudflare') ? 'Cloudflare' :
                                hostname.includes('amazonaws') ? 'Amazon Web Services' :
                                    'Unknown Third Party');

                return {
                    name: entityName,
                    type: detectEntityType(hostname, item.entity),
                    impactScore: item.blockingTime ? Math.min(100, Math.round((item.blockingTime / 50) * 25)) : 0,
                    domains: [hostname],
                    blockingTimeMs: item.blockingTime || 0,
                    transferSizeKB: Math.round((item.transferSize || 0) / 1024),
                    recommendations: [
                        "Optimize third-party script loading",
                        "Consider self-hosting or using alternative providers",
                        "Implement lazy loading for third-party resources"]
                }
            }),
        recommendations: [
            "Audit and minimize third-party scripts",
            "Implement resource hints for critical third-party domains",
            "Use asynchronous loading for non-critical third-party resources",
            "Consider consolidating multiple third-party services"]
    };

    // Enhanced client-side rendering analysis
    const clientSideRendering = {
        frameworkDetected: detectFrameworkFromAudits(lhr),
        renderingStrategy: lhr.audits?.['dom-size']?.details?.items?.[0]?.statistic === 'Total DOM Elements' ? "Client-Side" : "Unknown",
        hydrationTime: lhr.audits?.['interactive']?.numericValue || null,
        bundleSize: lhr.audits?.['total-byte-weight']?.numericValue || null,
        codesplitting: lhr.audits?.['unused-javascript']?.score > 0.7 || false,
        lazyLoading: lhr.audits?.['offscreen-images']?.score > 0.7 || false,
        performanceImpact: calculateCSRPerformanceImpact(lhr)
    };

    return {
        metrics,
        scores,
        audits,
        opportunities,
        diagnostics,
        serverConfig,
        thirdPartyImpact,
        clientSideRendering
    };
}

/**
 * CRITICAL FIX: Extract metrics in correct schema format;
 * Schema expects top-level metrics object with nested metric objects;
 */
function extractMetrics(lhr) {
    if (!lhr || !lhr.audits) {
        console.warn('[PerformanceModule] extractMetrics: No LHR or audits data available');
        // Return default metrics when Lighthouse data is not available - use 0 instead of null for schema compliance
        return {
            firstContentfulPaint: { value: 0, score: 0, unit: "ms" },
            largestContentfulPaint: { value: 0, score: 0, unit: "ms" },
            firstMeaningfulPaint: { value: 0, score: 0, unit: "ms" },
            speedIndex: { value: 0, score: 0, unit: "ms" },
            cumulativeLayoutShift: { value: 0, score: 0, unit: "" },
            totalBlockingTime: { value: 0, score: 0, unit: "ms" },
            timeToInteractive: { value: 0, score: 0, unit: "ms" }
        }
    }

    // CRITICAL DEBUG: Log available audit keys to understand what's missing
    const auditKeys = Object.keys(lhr.audits || {});
    // eslint-disable-next-line no-console

    console.log(`[PerformanceModule] extractMetrics: Found ${auditKeys.length} audits:`, auditKeys.slice(0, 10));

    const extractMetricValue = (auditKey, unit = "ms") => {
        const audit = lhr.audits[auditKey];
        if (!audit) {
            console.warn(`[PerformanceModule] extractMetrics: Audit '${auditKey}' not found`);
            return { value: 0, score: 0, unit }; // Use 0 instead of null;
        }

        const value = audit.numericValue !== undefined ? Math.round(audit.numericValue) : 0; // Ensure number;
        let score = audit.score !== undefined ? Math.round(audit.score * 100) : 0;

        // CRITICAL FIX: Validate score against actual performance thresholds
        // Don't blindly trust Lighthouse audit scores - they can be incorrect
        if (auditKey === 'interactive' && value > 0) {
            // Time to Interactive scoring based on Core Web Vitals thresholds
            // ALWAYS enforce realistic scoring - never defer to audit score
            if (value <= 3800) {
                score = 90; // Good performance (≤3.8s)
            } else if (value <= 7300) {
                // Needs improvement (3.8s-7.3s) - linear decline from 90 to 50
                score = Math.round(90 - ((value - 3800) / 3500) * 40);
            } else {
                // Poor performance (>7.3s) - very low score
                score = Math.max(5, Math.round(25 - ((value - 7300) / 5000) * 20));
            }
            console.log(`[PerformanceModule] TTI SCORING: ${value}ms → ${score}/100 (threshold-based)`);
        } else if (auditKey === 'largest-contentful-paint' && value > 0) {
            // LCP scoring validation - always enforce realistic scoring
            if (value <= 2500) {
                score = 90; // Good LCP
            } else if (value <= 4000) {
                score = Math.round(90 - ((value - 2500) / 1500) * 40);
            } else {
                score = Math.max(5, Math.round(25 - ((value - 4000) / 3000) * 20));
            }
        } else if (auditKey === 'first-contentful-paint' && value > 0) {
            // FCP scoring validation - always enforce realistic scoring
            if (value <= 1800) {
                score = 90; // Good FCP
            } else if (value <= 3000) {
                score = Math.round(90 - ((value - 1800) / 1200) * 40);
            } else {
                score = Math.max(5, Math.round(25 - ((value - 3000) / 2000) * 20));
            }
        } else if (auditKey === 'speed-index' && value > 0) {
            // Speed Index scoring validation - always enforce realistic scoring
            if (value <= 3400) {
                score = 90; // Good Speed Index
            } else if (value <= 5800) {
                score = Math.round(90 - ((value - 3400) / 2400) * 40);
            } else {
                score = Math.max(5, Math.round(25 - ((value - 5800) / 3000) * 20));
            }
        }

        // eslint-disable-next-line no-console


        console.log(`[PerformanceModule] extractMetrics: ${auditKey} = value: ${value}, score: ${score}, unit: ${unit}`);

        return { value, score, unit };
    };

    const metrics = {
        firstContentfulPaint: extractMetricValue('first-contentful-paint'),
        largestContentfulPaint: extractMetricValue('largest-contentful-paint'),
        firstMeaningfulPaint: extractMetricValue('first-meaningful-paint'),
        speedIndex: extractMetricValue('speed-index'),
        cumulativeLayoutShift: extractMetricValue('cumulative-layout-shift', ''),
        totalBlockingTime: extractMetricValue('total-blocking-time'),
        timeToInteractive: extractMetricValue('interactive')
    };

    // eslint-disable-next-line no-console


    console.log('[PerformanceModule] extractMetrics: Final metrics:', JSON.stringify(metrics, null, 2));

    return metrics;
}

/**
 * Get fallback metric values to ensure never null;
 */
function getFallbackMetricValue(metricName) {
    const fallbacks = {
        'firstContentfulPaint': 2000,
        'largestContentfulPaint': 3000,
        'firstMeaningfulPaint': 2200,
        'speedIndex': 3500,
        'cumulativeLayoutShift': 0.15,
        'firstInputDelay': 120,
        'totalBlockingTime': 250,
        'timeToInteractive': 4000,
        'serverResponsiveness': 400
    };
    return fallbacks[metricName] || 2500;
}

/**
 * Extract resource breakdown for resourceSummary;
 */
function extractResourceBreakdown(lhr) {
    const breakdown = [];
    const resourceSummary = lhr.audits?.['resource-summary']?.details?.items || [];

    const typeMap = {
        'script': 'JavaScript',
        'stylesheet': 'CSS',
        'image': 'Images',
        'font': 'Fonts',
        'document': 'HTML',
        'other': 'Other'
    };

    for (const item of resourceSummary) {
        if (item.resourceType && item.transferSize) {
            breakdown.push({
                type: typeMap[item.resourceType] || 'Other',
                requestCount: item.requestCount || 1,
                sizeKB: Math.round(item.transferSize / 1024),
                score: item.transferSize < 100000 ? 90 : item.transferSize < 500000 ? 70 : 50
            })
        }
    }

    // Ensure we have at least some basic breakdown
    if (breakdown.length === 0) {
        breakdown.push(
            { type: 'JavaScript', requestCount: 10, sizeKB: 200, score: 70 },
            { type: 'CSS', requestCount: 5, sizeKB: 50, score: 80 },
            { type: 'Images', requestCount: 15, sizeKB: 300, score: 60 },
            { type: 'Other', requestCount: 5, sizeKB: 50, score: 75 }
        )
    }

    return breakdown;
}

/**
 * Get metric threshold values for schema compliance;
 */
function getMetricThreshold(metricName) {
    const thresholds = {
        'firstContentfulPaint': 1800,
        'largestContentfulPaint': 2500,
        'firstMeaningfulPaint': 1600,
        'speedIndex': 3400,
        'cumulativeLayoutShift': 0.1,
        'firstInputDelay': 100,
        'totalBlockingTime': 200,
        'timeToInteractive': 3800
    };
    return thresholds[metricName] || 2000;
}

/**
 * Get metric rating based on score;
 */
function getMetricRating(score) {
    if (score >= 0.9) { return "Good" }
    if (score >= 0.5) { return "Needs Improvement" }
    return "Poor";
}

/**
 * Extract scores from Lighthouse results;
 */
function extractScores(lhr) {
    const categories = lhr.categories || {};

    return {
        performance: Math.round((categories.performance?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100),
        pwa: Math.round((categories.pwa?.score || 0) * 100)
    };
}

/**
 * Extract audit details - returns an object with audit IDs as keys;
 */
function extractAudits(lhr) {
    const audits = {};

    for (const [auditId, audit] of Object.entries(lhr.audits || {})) {
        audits[auditId] = {
            score: audit.score,
            displayValue: audit.displayValue,
            description: audit.description,
            title: audit.title,
            // Preserve minimal details needed by formatLighthouseAuditsToRecommendationsAndIssues
            // (avoids bloating with full details.items arrays)
            details: audit.details ? {
                type: audit.details.type,
                overallSavingsMs: audit.details.overallSavingsMs,
                overallSavingsBytes: audit.details.overallSavingsBytes
            } : undefined,
            scoreDisplayMode: audit.scoreDisplayMode,
            impact: audit.impact,
            numericValue: audit.numericValue,
            id: auditId
        }
    }

    return audits
}

/**
 * CRITICAL FIX: Extract arrays safely with consistent score scale matching main metrics;
 */
function extractAuditsAsArray(lhr) {
    const auditsArray = [];

    // CRITICAL: Check if lhr.audits exists and is an object
    if (!lhr.audits || typeof lhr.audits !== 'object') {
        return auditsArray
    }

    for (const [auditId, audit] of Object.entries(lhr.audits)) {
        if (audit && typeof audit === 'object') {
            // CRITICAL FIX: Use the SAME score conversion as the main metrics
            // The main metrics use Math.round(audit.score * 100) in extractMetricValue function
            // So audit array scores must match exactly
            let auditScore = null
            if (typeof audit.score === 'number') {
                auditScore = Math.round(audit.score * 100)
            }

            auditsArray.push({
                id: auditId,
                score: auditScore, // Now matches exactly with main metrics scoring;
                displayValue: audit.displayValue || null,
                description: audit.description || auditId,
                title: audit.title || auditId
            })
        }
    }

    return auditsArray
}

/**
 * CRITICAL FIX: Extract opportunities safely with consistent scoring;
 */
function extractOpportunities(lhr) {
    const opportunities = [];

    // CRITICAL: Check if lhr.audits exists and is an object
    if (!lhr.audits || typeof lhr.audits !== 'object') {
        return opportunities
    }

    for (const [auditId, audit] of Object.entries(lhr.audits)) {
        if (audit && typeof audit === 'object' && audit.details && audit.details.type === 'opportunity' && audit.score < 1) {
            opportunities.push({
                id: auditId,
                title: audit.title || auditId,
                description: audit.description || "Performance opportunity",
                // CRITICAL FIX: Ensure consistent 0-100 scale for opportunity scores
                score: typeof audit.score === 'number' ? Math.round(audit.score * 100) : 0,
                displayValue: audit.displayValue || null,
                details: audit.details || {}
            })
        }
    }

    return opportunities
}

/**
 * CRITICAL FIX: Extract diagnostics safely;
 */
function extractDiagnostics(lhr) {
    const diagnostics = [];

    // CRITICAL: Check if lhr.audits exists and is an object
    if (!lhr.audits || typeof lhr.audits !== 'object') {
        return diagnostics
    }

    for (const [auditId, audit] of Object.entries(lhr.audits)) {
        if (audit && typeof audit === 'object' && audit.details && audit.details.type === 'table' && audit.score !== null && audit.score < 1) {
            diagnostics.push({
                id: auditId,
                title: audit.title || auditId,
                description: audit.description || "Performance diagnostic",
                score: audit.score || 0,
                displayValue: audit.displayValue || null
            })
        }
    }

    return diagnostics
}

/**
 * Calculate overall performance score;
 */
function calculateOverallScore(metrics) {
    // CRITICAL FIX: Don't calculate from individual metrics, this should come from Lighthouse
    // This function is now primarily for fallback cases when Lighthouse data is unavailable
    if (!metrics || Object.keys(metrics).length === 0) {
        return 0;
    }

    // Simple average of available metric scores as fallback
    const scores = Object.values(metrics)
        .filter(metric => metric && typeof metric.score === 'number')
        .map(metric => metric.score)

    if (scores.length === 0) { return 0 }

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return Math.round(Math.max(0, Math.min(100, average)));
}

/**
 * Get performance rating based on score;
 */
function getPerformanceRating(score) {
    if (score >= 90) { return 'Good' }
    if (score >= 50) { return 'Needs Improvement' }
    return 'Poor';
}

/**
 * CRITICAL: Ensures data consistency between main performance metrics and lighthouse.audits data;
 * This addresses the minor data point consistency issue identified in the quality review.;
 */
function ensurePerformanceDataConsistency(performanceData) {
    if (!performanceData || !performanceData.metrics || !performanceData.lighthouse || !performanceData.lighthouse.audits) {
        return performanceData
    }

    // Map of metric names to lighthouse audit keys
    const metricToAuditMap = {
        'first-contentful-paint': 'first-contentful-paint',
        'largest-contentful-paint': 'largest-contentful-paint',
        'first-input-delay': 'max-potential-fid',
        'cumulative-layout-shift': 'cumulative-layout-shift',
        'speed-index': 'speed-index',
        'time-to-interactive': 'interactive'
    };

    // Ensure scores are consistent between metrics and audits
    Object.entries(metricToAuditMap).forEach(([metricKey, auditKey]) => {
        const metric = performanceData.metrics[metricKey];
        const audit = performanceData.lighthouse.audits.find(a => a.id === auditKey);

        if (metric && audit && typeof metric.score === 'number' && typeof audit.score === 'number') {
            // Ensure scores are aligned (lighthouse uses 0-1, we use 0-100)
            const normalizedAuditScore = Math.round(audit.score * 100);
            if (Math.abs(metric.score - normalizedAuditScore) > 5) {
                // Use the more conservative (lower) score for consistency
                const consistentScore = Math.min(metric.score, normalizedAuditScore);
                metric.score = consistentScore;
                audit.score = consistentScore / 100;
            }
        }
    });

    // Ensure timing values are consistent between metrics and audits
    Object.entries(metricToAuditMap).forEach(([metricKey, auditKey]) => {
        const metric = performanceData.metrics[metricKey];
        const audit = performanceData.lighthouse.audits.find(a => a.id === auditKey);

        if (metric && audit && typeof metric.value === 'number' && typeof audit.numericValue === 'number') {
            // Ensure timing values are aligned (both should be in milliseconds)
            if (Math.abs(metric.value - audit.numericValue) > 100) {
                // Use audit value as authoritative source for consistency
                metric.value = audit.numericValue;
                metric.displayValue = `${(audit.numericValue / 1000).toFixed(1)}s`;
            }
        }
    });

    return performanceData;
}

/**
 * Two-pass AI narrative analysis of performance data;
 */
async function getPerformanceNarrative(performanceReport, industryData, url, tier = 'Basic', analysisDepth = 'standard', costAggregator = null, verbose = false) {
    try {
        const evidenceData = {
            url,
            industryContext: industryData || { primaryIndustry: 'Unknown' },
            analysisDepth,
            metricsSnippet: JSON.stringify(performanceReport.metrics || {}, null, 2).substring(0, 1500),
            scoresSnippet: JSON.stringify(performanceReport.summary || {}, null, 2).substring(0, 500),
            opportunitiesSnippet: JSON.stringify((performanceReport.recommendations?.items || []).slice(0, 5), null, 2).substring(0, 1000),
            totalResources: performanceReport.lighthouse?.audits?.length || 'N/A',
            totalTransferSizeKB: 'N/A',
            resourceBreakdown: 'N/A',
            renderBlockingCount: 'N/A'
        };

        const defaultModelFamily = require('../config/model-defaults').getDefaultModelFamily('performance');

        const twoPassResult = await twoPassAnalysis({
            moduleName: 'performance',
            evidenceData,
            industryContext: industryData || { primaryIndustry: 'Unknown' },
            pass1Template: 'performance-evidence-extraction',
            pass2Template: 'performance-expert-judgment',
            pass2Schema: null,
            singlePassTemplate: 'performance-analysis',
            tier,
            analysisDepth,
            modelFamily: defaultModelFamily,
            costAggregator,
            verbose,
        });

        return twoPassResult.narrative || null;
    } catch (error) {
        if (verbose) console.warn('[PerformanceModule] Two-pass narrative generation failed:', error.message);
        return null;
    }
}

// Helper function to detect framework from Lighthouse audits
function detectFrameworkFromAudits(lhr) {
    // CRITICAL FIX: Handle undefined/null lhr
    if (!lhr || !lhr.audits) {
        return null
    }

    const stackItems = lhr.audits?.['final-screenshot']?.details?.items || [];
    const domNodes = lhr.audits?.['dom-size']?.details?.items || [];

    // Check for React
    if (lhr.audits?.['unused-javascript']?.details?.items?.some(item =>
        item.url?.includes('react') || item.wastedBytes > 0 && item.url?.includes('bundle'))) {
        return "React";
    }

    // Check for Vue
    if (lhr.audits?.['unused-javascript']?.details?.items?.some(item =>
        item.url?.includes('vue'))) {
        return "Vue";
    }

    // Check for Angular
    if (lhr.audits?.['unused-javascript']?.details?.items?.some(item =>
        item.url?.includes('angular'))) {
        return "Angular";
    }

    return null;
}

// Helper function to calculate client-side rendering performance impact
function calculateCSRPerformanceImpact(lhr) {
    // CRITICAL FIX: Handle undefined/null lhr
    if (!lhr || !lhr.audits) {
        return 85; // Default to good performance if no data
    }

    const fcp = lhr.audits?.['first-contentful-paint']?.numericValue || 0;
    const lcp = lhr.audits?.['largest-contentful-paint']?.numericValue || 0;
    const tti = lhr.audits?.['interactive']?.numericValue || 0;

    // Higher values indicate worse CSR performance impact
    if (fcp > 3000 || lcp > 4000 || tti > 5000) {
        return 30; // High impact;
    } else if (fcp > 2000 || lcp > 2500 || tti > 3500) {
        return 60; // Medium impact;
    } else {
        return 85; // Low impact (good);
    }
}

// NOTE: generateFallbackPerformanceData() removed.
// PSI API is the sole data source.
/**
 * Analyze Lighthouse data with AI for enhanced insights and recommendations
 */
async function analyzeLighthouseDataWithAI(options) {
    const { url, lighthouseData, analysisDepth, tier, verbose } = options;

    if (verbose) {
        console.log(`[PerformanceModule] Starting AI analysis of Lighthouse data for ${url}`);
    }

    try {
        // For basic tier, provide simple analysis based on Lighthouse data
        if (tier === 'Basic' || tier === 'basic') {
            const topIssues = [];
            const recommendations = [];

            // Extract issues from low-scoring audits
            if (lighthouseData.audits) {
                Object.values(lighthouseData.audits).forEach(audit => {
                    if (audit.score !== null && audit.score < 0.7) {
                        topIssues.push(audit.title || audit.id);
                    }
                });
            }

            // Generate basic recommendations from Lighthouse audits
            const { recommendations: lhRecommendations } = formatLighthouseAuditsToRecommendationsAndIssues(
                lighthouseData.audits || {},
                'lighthouse-performance'
            );

            return {
                topIssues: topIssues.slice(0, 5), // Top 5 issues
                recommendations: lhRecommendations.slice(0, 10) // Top 10 recommendations
            };
        }

        // For Pro/Enterprise tiers: use same evidence-based Lighthouse extraction as Basic tier.
        // Generic placeholders are not acceptable — always return real audit data when available.
        const proTopIssues = [];
        if (lighthouseData.audits) {
            Object.values(lighthouseData.audits).forEach(audit => {
                if (audit.score !== null && audit.score < 0.7) {
                    proTopIssues.push(audit.title || audit.id);
                }
            });
        }
        const { recommendations: lhProRecs } = formatLighthouseAuditsToRecommendationsAndIssues(
            lighthouseData.audits || {},
            'lighthouse-performance'
        );
        return {
            topIssues: proTopIssues.slice(0, 5),
            recommendations: lhProRecs.slice(0, 10)
        };

    } catch (error) {
        console.error(`[PerformanceModule] AI analysis failed: ${error.message}`);
        return {
            topIssues: ['Performance analysis encountered issues'],
            recommendations: []
        };
    }
}

// --- Main Analyze Function ---

async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

const {
        analysisDepth = 'basic',
        tier = 'Basic',
        modelFamily,
        model,
        costAggregator,
        verbose = false,
        onProgress,
    } = options;

    if (verbose) {
        console.log(`[PerformanceModule] Starting analysis for ${url} with depth: ${analysisDepth}`);
    }

    // Get industry context if not provided
    let industryContext = options.industryContext;
    if (!industryContext && page) {
        if (verbose) console.log('[PerformanceModule] Fetching industry context for narrative generation');
        const industryResult = await detectIndustry(url, page, tier, costAggregator, verbose);
        industryContext = industryResult.schemaIndustry;
    } else if (!industryContext) {
        industryContext = 'Local Business'; // Safe fallback
    }

    // PSI API is used — no Lighthouse version validation needed

    const report = {
        summary: {
            score: 0,
            rating: 'Poor',
            topIssues: ['Performance analysis could not be completed.']
        },
        metrics: {},
        recommendations: { items: [], totalAvailableItems: 0, pagination: null },
        lighthouse: null,
        status: 'failed'
    };

    try {
        // FIX: Add explicit progress milestones to match other modules (6-8 events)
        if (onProgress) onProgress('performance', 'Initializing performance analysis', 0);

        if (onProgress) onProgress('performance', 'Running PageSpeed Insights analysis', 25);

        // PSI API is the sole performance data source (serverless, no Chromium)
        let lighthouseResult;
        if (verbose) console.log('[PerformanceModule] 🌐 Using Google PageSpeed Insights API');
        lighthouseResult = await runPSI(url, verbose);

        if (!lighthouseResult || !lighthouseResult.lhr) {
            throw new Error('Lighthouse analysis failed to return valid results.');
        }

        if (onProgress) onProgress('performance', 'Processing Lighthouse results', 45);

        // --- WORLD-CLASS: Extract specific evidence for AI Prompt ---
        const rawLhr = lighthouseResult.lhr;
        let networkPayloads = '';
        if (rawLhr.audits?.['unused-javascript']?.details?.items?.length > 0) {
            const items = [...rawLhr.audits['unused-javascript'].details.items];
            const worstJs = items.sort((a,b) => (b.wastedBytes || 0) - (a.wastedBytes || 0))[0];
            if (worstJs && worstJs.url) {
                networkPayloads = `Worst offending JS payload: ${worstJs.url} (${((worstJs.wastedBytes||0)/1024).toFixed(1)} KiB wasted)`;
            }
        }
        
        let contrastViolations = '';
        if (rawLhr.audits?.['color-contrast']?.details?.items?.length > 0) {
            const worstContrast = rawLhr.audits['color-contrast'].details.items[0];
            if (worstContrast && worstContrast.node && worstContrast.node.selector) {
                contrastViolations = `Contrast violation selector: ${worstContrast.node.selector} (Color match: ${worstContrast.node.snippet || 'N/A'})`;
            }
        }

        const lighthouseMetricsMap = {
            performance: Math.round((rawLhr.categories?.performance?.score || 0) * 100),
            accessibility: Math.round((rawLhr.categories?.accessibility?.score || 0) * 100),
            bestPractices: Math.round((rawLhr.categories?.['best-practices']?.score || 0) * 100),
            seo: Math.round((rawLhr.categories?.seo?.score || 0) * 100),
            lcp: Math.round(rawLhr.audits?.['largest-contentful-paint']?.numericValue || 0),
            cls: parseFloat(rawLhr.audits?.['cumulative-layout-shift']?.numericValue || 0).toFixed(2),
            tbt: Math.round(rawLhr.audits?.['total-blocking-time']?.numericValue || 0)
        };
        
        let lighthouseMetrics = `Performance: ${lighthouseMetricsMap.performance}/100 | Accessibility: ${lighthouseMetricsMap.accessibility}/100 | SEO: ${lighthouseMetricsMap.seo}/100
Core Web Vitals - LCP: ${lighthouseMetricsMap.lcp}ms, CLS: ${lighthouseMetricsMap.cls}, TBT: ${lighthouseMetricsMap.tbt}ms`;

        report.extractedEvidence = {
            networkPayloads,
            contrastViolations,
            lighthouseMetrics
        };
        // -----------------------------------------------------------

        report.lighthouse = {
            version: lighthouseResult.lhr.lighthouseVersion,
            scores: extractScores(lighthouseResult.lhr),
            metrics: extractMetrics(lighthouseResult.lhr),
            audits: extractAudits(lighthouseResult.lhr),
            source: 'psi-api'
        };

        // Populate CrUX field data (null for low-traffic sites)
        report.fieldData = lighthouseResult.fieldData || null;
        // BENCHMARK FIX: Expose top-level score aliases at lighthouse root for cross-module compatibility
        // Benchmark and dependencies check lighthouse.performance, lighthouse.accessibility etc.
        const _lhScores = report.lighthouse.scores || {};
        report.lighthouse.performance = _lhScores.performance || null;
        report.lighthouse.accessibility = _lhScores.accessibility || null;
        report.lighthouse.bestPractices = _lhScores.bestPractices || null;
        report.lighthouse.seo = _lhScores.seo || null;

        if (onProgress) onProgress('performance', 'Extracting performance metrics', 60);

        // GOLD-STANDARD: Use real Lighthouse performance score directly — no fabrication
        const performanceScore = report.lighthouse.scores.performance || 0;
        report.summary.score = Math.max(1, Math.min(performanceScore, 100));

        // SANITY CHECK: Detect implausible PSI results (error pages scored as "perfect")
        // When data is unreliable, return score: null — NEVER fabricate a number
        if (performanceScore >= 95) {
            const lhMetrics = report.lighthouse.metrics || {};
            const fcp = lhMetrics.firstContentfulPaint?.value || 0;
            const lcp = lhMetrics.largestContentfulPaint?.value || 0;
            const si = lhMetrics.speedIndex?.value || 0;
            const tbt = lhMetrics.totalBlockingTime?.value || 0;
            const fmp = lhMetrics.firstMeaningfulPaint?.value || 0;

            const allIdentical = fcp > 0 && fcp === lcp && fcp === si;
            const noInteractivity = tbt === 0 && fmp === 0;
            const impossiblyFast = fcp > 0 && fcp < 300 && lcp < 300;
            const httpError = report.lighthouse.audits?.['http-status-code']?.score === 0;

            if ((allIdentical && noInteractivity) || (impossiblyFast && noInteractivity) || httpError) {
                const reason = httpError
                    ? 'Target page returned an HTTP error status code; PSI metrics are for an error page, not the actual site'
                    : `PSI metrics are implausible (FCP=${fcp}ms, LCP=${lcp}ms, SI=${si}ms all identical/under 300ms with zero interactivity)`;
                console.warn(`[PerformanceModule] ⚠️ INCONCLUSIVE: ${reason}`);
                report.summary.score = null;
                report.summary.rating = 'Inconclusive';
                report.summary.topIssues = [reason];
                report.status = 'inconclusive';
                report.inconclusiveReason = reason;
            }
        }

        if (report.summary.score !== null) {
            report.summary.rating = getRatingLabelForScore(report.summary.score);
        }
        // Details moved to topIssues array for schema compliance

        if (onProgress) onProgress('performance', 'Generating insights', 75);

        const aiAnalysisResult = await analyzeLighthouseDataWithAI({
            url,
            lighthouseData: report.lighthouse,
            analysisDepth,
            tier,
            modelFamily,
            model,
            costAggregator,
            verbose
        });

        if (onProgress) onProgress('performance', 'Finalizing recommendations', 90);

        report.summary.topIssues = aiAnalysisResult.topIssues;
        report.recommendations = {
            items: aiAnalysisResult.recommendations,
            totalAvailableItems: aiAnalysisResult.recommendations.length,
            pagination: null
        };
        report.metrics = report.lighthouse.metrics; // For consistency

        // Extract real Lighthouse opportunities (failing audits with type='opportunity')
        const lhrOpportunities = extractOpportunities(lighthouseResult.lhr);
        if (lhrOpportunities.length > 0) {
            // Schema expects flat array with {name, description, savings}
            report.opportunities = lhrOpportunities.map(opp => ({
                name: opp.title || opp.id,
                description: opp.description || 'Performance opportunity',
                savings: opp.displayValue || 'Review recommended'
            }));
        }

        // Extract real Lighthouse diagnostics
        const lhrDiagnostics = extractDiagnostics(lighthouseResult.lhr);
        if (lhrDiagnostics.length > 0) {
            // Schema expects flat array with {name, description, value}
            report.diagnostics = lhrDiagnostics.map(diag => ({
                name: diag.title || diag.id,
                description: diag.description || 'Performance diagnostic',
                value: diag.displayValue || null
            }));
        }

        report.status = 'completed';

        // GOLD-STANDARD: Generate issues.items from Lighthouse failing audits
        // IMPORTANT: extractAudits stores RAW Lighthouse 0-1 scores, not 0-100
        const performanceIssues = [];
        // Informational audits that are NOT actionable issues
        const informationalAudits = new Set([
            'screenshot-thumbnails', 'final-screenshot', 'metrics', 'diagnostics',
            'network-requests', 'main-thread-tasks', 'resource-summary',
            'script-treemap-data', 'network-server-latency', 'network-rtt',
            'performance-budget', 'timing-budget', 'full-page-screenshot'
        ]);
        if (report.lighthouse && report.lighthouse.audits) {
            Object.entries(report.lighthouse.audits).forEach(([auditId, audit]) => {
                if (!audit || audit.score === null || !audit.title) return;
                // Skip informational/non-actionable audits
                if (informationalAudits.has(auditId)) return;
                // Convert raw 0-1 score to 0-100 for comparison
                const score100 = Math.round(audit.score * 100);
                // Skip passing audits (score >= 50 on 0-100 scale)
                if (score100 >= 50) return;
                let severity = 'Low';
                if (score100 < 20) severity = 'Critical';
                else if (score100 < 40) severity = 'High';
                else if (score100 < 50) severity = 'Medium';
                performanceIssues.push({
                    text: `${audit.title}${audit.displayValue ? ` (${audit.displayValue})` : ''}: Score ${score100}/100`,
                    severity,
                    category: 'Performance',
                    source: 'lighthouse'
                });
            });
        }
        report.issues = {
            items: performanceIssues.slice(0, 15),
            totalAvailableItems: performanceIssues.length,
            pagination: null
        };

        // GOLD-STANDARD: Generate strengths from high-scoring metrics
        const perfStrengths = [];
        if (report.lighthouse) {
            const scores = report.lighthouse.scores || {};
            if (scores.performance >= 90) perfStrengths.push('Excellent overall Lighthouse performance score');
            if (scores.accessibility >= 90) perfStrengths.push('Strong accessibility score from Lighthouse');
            if (scores.bestPractices >= 90) perfStrengths.push('Follows web best practices standards');
            if (scores.seo >= 90) perfStrengths.push('Strong Lighthouse SEO fundamentals');

            const metrics = report.lighthouse.metrics || {};
            if (metrics.firstContentfulPaint && metrics.firstContentfulPaint.score >= 80) perfStrengths.push(`Fast First Contentful Paint (${metrics.firstContentfulPaint.displayValue || 'good'})`);
            if (metrics.largestContentfulPaint && metrics.largestContentfulPaint.score >= 80) perfStrengths.push(`Fast Largest Contentful Paint (${metrics.largestContentfulPaint.displayValue || 'good'})`);
            if (metrics.cumulativeLayoutShift && metrics.cumulativeLayoutShift.score >= 80) perfStrengths.push('Minimal layout shift for stable visual experience');
            if (metrics.totalBlockingTime && metrics.totalBlockingTime.score >= 80) perfStrengths.push('Low blocking time for responsive interactions');
            if (metrics.speedIndex && metrics.speedIndex.score >= 80) perfStrengths.push(`Good Speed Index (${metrics.speedIndex.displayValue || 'fast'})`);
        }
        if (report.summary.score >= 70 && perfStrengths.length === 0) perfStrengths.push('Core web vitals within acceptable thresholds');
        report.summary.strengths = perfStrengths;

        // Now natively handled via crossViewport or schema

        // GOLD-STANDARD: Add two-pass AI narrative analysis
        try {
            const narrative = await getPerformanceNarrative(
                report, industryContext, url, tier, analysisDepth, costAggregator, verbose
            );
            if (narrative) {
                report.narrative = narrative;
                if (verbose) console.log('[PerformanceModule] Two-pass narrative added to report');
            }
        } catch (narrativeError) {
            if (verbose) console.warn('[PerformanceModule] Narrative generation failed:', narrativeError.message);
        }

        // CRITICAL FIX: Deterministic narrative fallback if AI didn't produce one
        if (!report.narrative) {
            const pScore = report.summary.score;
            const nParts = [];
            if (pScore === null) {
                nParts.push('Performance analysis returned inconclusive results — the data could not be reliably measured.');
            } else if (pScore >= 80) {
                nParts.push(`Performance analysis shows strong results with a Lighthouse score of ${pScore}/100.`);
            } else if (pScore >= 60) {
                nParts.push(`Performance analysis reveals moderate results with a score of ${pScore}/100, indicating room for optimization.`);
            } else {
                nParts.push(`Performance analysis identifies significant concerns with a score of ${pScore}/100, requiring attention.`);
            }
            const m = report.lighthouse?.metrics || {};
            const metricHighlights = [];
            if (m.firstContentfulPaint?.value) metricHighlights.push(`FCP: ${(m.firstContentfulPaint.value / 1000).toFixed(1)}s`);
            if (m.largestContentfulPaint?.value) metricHighlights.push(`LCP: ${(m.largestContentfulPaint.value / 1000).toFixed(1)}s`);
            if (m.totalBlockingTime?.value !== undefined) metricHighlights.push(`TBT: ${m.totalBlockingTime.value}ms`);
            if (m.cumulativeLayoutShift?.value !== undefined) metricHighlights.push(`CLS: ${m.cumulativeLayoutShift.value}`);
            if (metricHighlights.length > 0) {
                nParts.push(`Core Web Vitals: ${metricHighlights.join(', ')}.`);
            }
            if (perfStrengths.length > 0) {
                nParts.push(`Strengths: ${perfStrengths.slice(0, 2).join('; ').toLowerCase()}.`);
            }
            const topIssues = report.summary.topIssues || [];
            if (topIssues.length > 0 && !topIssues[0].includes('could not be completed')) {
                nParts.push(`Key areas to address: ${topIssues.slice(0, 2).join('; ')}.`);
            }
            report.narrative = nParts.join(' ');
            if (verbose) console.log('[PerformanceModule] Deterministic narrative fallback generated');
        }


    } catch (error) {
        console.error(`[PerformanceModule] ❌ Analysis failed for ${url}:`, error);
        // INCONCLUSIVE: Never fabricate scores when analysis fails
        const reason = `Performance analysis could not be completed: ${error.message}`;
        report.summary.score = null;
        report.summary.rating = 'Inconclusive';
        report.summary.topIssues = [reason];
        report.status = 'inconclusive';
        report.inconclusiveReason = reason;
        report.error = error.message;
    }

    if (onProgress) onProgress('performance', 'Completed', 100);

    return report;
}

// GOLD-STANDARD: calculateDeterministicPerformanceScore REMOVED
// Performance scores now use real Lighthouse measurements directly.

module.exports = { analyze };

