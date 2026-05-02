/**
 * Quality Check Utility - Refactored for Schema v3.11.0 - Iteration 2
 *
 * This utility provides functions to:
 * - Validate analysis results from each module against defined quality criteria.
 * - Retry failed analyses with alternate AI models.
 * - Generate schema-compliant synthetic results if analysis and retries fail.
 * - Ensure minimum quality standards across all modules.
 */

const fs = require('fs');
const path = require('path');
const { getSchemaPath } = require('./paths');

const { v4: uuidv4 } = require('uuid');

// Assuming ai-models/index.js and its dependencies are correctly set up
// const { analyzeWithAI } = require('./ai-models'); 

// --- Schema Loading ---
const TARGET_SCHEMA_VERSION = "3.11.0";
let reportSchemaInstance;
try {
  const schemaPath = getSchemaPath('report-schema.json');
  reportSchemaInstance = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  if (!reportSchemaInstance || !reportSchemaInstance.$id || !reportSchemaInstance.$id.includes(TARGET_SCHEMA_VERSION)) {
    console.warn(`[QualityCheck] Loaded schema (${reportSchemaInstance?.$id}) may not be target ${TARGET_SCHEMA_VERSION}.`);
  }
} catch (error) {
  console.error('[QualityCheck] CRITICAL: Failed to load report schema.', error);
  reportSchemaInstance = null; // Ensure it's null if loading failed
}


// --- Helper Functions (Replicated or adapted from jsonNormalizer if not directly importable) ---
function getRatingLabel(score, isNullable = false) {
  if (score === null || score === undefined) { return isNullable ? null : "N/A"; }
  const s = Math.round(score);
  if (s === 100) { return "Perfect"; }
  if (s >= 90) { return "Excellent"; }
  if (s >= 80) { return "Good"; }
  if (s >= 70) { return "Fair"; }
  if (s >= 60) { return "Needs Improvement"; }
  if (s >= 45) { return "Poor"; }
  if (s >= 25) { return "Critical"; }
  if (s >= 0) { return "Failing"; }
  return isNullable ? null : "N/A";
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

function createDefaultPaginatedArray(items = [], totalItems = null, pageSize = null) {
  const actualItems = Array.isArray(items) ? items : [];
  const itemCount = actualItems.length;
  const total = totalItems !== null ? totalItems : itemCount;

  if (itemCount === 0 && total === 0) {
    return { items: [], totalAvailableItems: 0, pagination: null };
  }

  const effectivePageSize = pageSize || (itemCount > 0 ? itemCount : 10); // Default page size if not specified

  if (total <= effectivePageSize && itemCount <= effectivePageSize) {
    return { items: actualItems, totalAvailableItems: total, pagination: null };
  }

  return {
    items: actualItems,
    totalAvailableItems: total,
    pagination: {
      pageNumber: 1,
      pageSize: effectivePageSize,
      totalPages: Math.ceil(total / effectivePageSize) || 1
    }
  };
}

// --- Quality Criteria ---
const QUALITY_CRITERIA = {
  global: {
    requiredProperties: ['reportId', 'url', 'generatedAt', 'schemaVersion', 'tier', 'testParameters', 'modules', 'moduleStatus', 'overallScore', 'topRecommendations.items'],
    minOverallScore: 10, // Slightly higher min for a global report to be considered "not entirely failed"
    validationFn: (results, context) => {
      if (!results || typeof results !== 'object') { return false; }
      if (!results.topRecommendations || !Array.isArray(results.topRecommendations.items)) { return false; }

      const tier = context?.tier || results.tier || "Basic";
      const successfulModules = results.moduleStatus?.filter(ms => ms.status === "Success").length || 0;

      let minRecs = 0;
      if (successfulModules > 0) {
        minRecs = tier === "Basic" ? 1 : (tier === "Pro" ? 2 : 3);
      }

      if (results.topRecommendations.items.length < minRecs) {
        // console.warn(`[QualityCheck-Global] Insufficient top recommendations (${results.topRecommendations.items.length}) for tier ${tier} with ${successfulModules} successful modules.`);
        // Allow empty if no modules succeeded or it's Basic tier with few successes
        if (tier !== "Basic" && successfulModules > 1) { return false; }
      }
      for (const rec of results.topRecommendations.items) {
        if (!rec.text || typeof rec.text !== 'string' || rec.text.length < 10) { return false; }
        if (!rec.priority || !["Critical", "High", "Medium", "Low"].includes(rec.priority)) { return false; }
      }
      if (getNestedProperty(results, 'featureSet.advancedInsightsEnabled') && tier === "Basic") { return false; }
      if (!getNestedProperty(results, 'featureSet.advancedInsightsEnabled', false) && (tier === "Pro" || tier === "Enterprise")) { return false; }
      return true;
    }
  },
  ui: {
    requiredProperties: ['summary.score', 'viewportAnalyses', 'screenshots.items', 'viewportAnalyses.desktop.structured.usability.rating'],
    minOverallScore: 20,
    fallbackScore: 65,
    validationFn: (results, context) => {
      if (!results.viewportAnalyses || typeof results.viewportAnalyses !== 'object' || Object.keys(results.viewportAnalyses).length === 0) { return false; }
      const firstViewportName = Object.keys(results.viewportAnalyses)[0];
      if (!getNestedProperty(results, `viewportAnalyses.${firstViewportName}.structured.usability.rating`)) { return false; }
      if (!Array.isArray(results.screenshots?.items) || results.screenshots.items.length === 0) { return false; }
      if (results.screenshots.totalAvailableItems === undefined) { return false; }
      return true;
    }
  },
  performance: {
    requiredProperties: ['summary.score', 'metrics.firstContentfulPaint.value', 'metrics.largestContentfulPaint.value', 'metrics.totalBlockingTime.value', 'metrics.cumulativeLayoutShift.value'],
    minOverallScore: 15,
    fallbackScore: 60,
    validationFn: (results, context) => {
      if (getNestedProperty(results, 'metrics.largestContentfulPaint.value') === null || getNestedProperty(results, 'metrics.largestContentfulPaint.value') === undefined) { return false; }
      if (getNestedProperty(results, 'metrics.resourceSummary.totalRequests') === undefined) { return false; }
      return true;
    }
  },
  seoContent: {
    requiredProperties: ['summary.score', 'metadata.title.score', 'content.readabilityScore', 'technical.links.score'],
    minOverallScore: 20,
    fallbackScore: 68,
    validationFn: (results, context) => {
      if (!getNestedProperty(results, 'metadata.description.text') || getNestedProperty(results, 'metadata.description.text', '').length < 5) { return false; }
      if (!getNestedProperty(results, 'content.keywordUsage.primaryKeyword') && !getNestedProperty(results, 'content.eatMetrics.overallEatScore')) { return false; } // Either keyword or EAT should be present
      if (!getNestedProperty(results, 'schemaMarkup.score')) { return false; }
      return true;
    }
  },
  security: {
    requiredProperties: ['summary.score', 'ssl.score', 'headers.contentSecurityPolicy.score', 'vulnerabilities'],
    minOverallScore: 15,
    fallbackScore: 70,
    validationFn: (results, context) => {
      if (!results.ssl || typeof results.ssl.isHttps !== 'boolean') { return false; }
      if (!results.headers || !results.headers.strictTransportSecurity) { return false; }
      if (!Array.isArray(results.vulnerabilities)) { return false; }
      if (context?.industryContext?.primaryIndustry === "Healthcare" && context?.tier !== "Basic" && context?.featureSet?.detailedComplianceReportingEnabled) {
        if (!results.phiHandling || typeof results.phiHandling.encryptionAtRest !== 'boolean') { return false; }
        if (!results.hipaaAuditLogging || typeof results.hipaaAuditLogging.loggingEnabled !== 'boolean') { return false; }
      }
      return true;
    }
  },
  privacy: {
    requiredProperties: ['summary.score', 'privacyPolicy.score', 'cookies.totalAvailableItems', 'trackers.totalAvailableItems', 'consentManagement.score'],
    minOverallScore: 15,
    fallbackScore: 62,
    validationFn: (results, context) => {
      if (results.cookies?.totalAvailableItems === undefined) { return false; }
      if (results.trackers?.totalAvailableItems === undefined) { return false; }
      if (!getNestedProperty(results, 'privacyPolicy.found') && getNestedProperty(results, 'privacyPolicy.score', 0) > 30) { return false; } // Score should be low if not found
      if (context?.tier !== "Basic" && context?.featureSet?.detailedComplianceReportingEnabled) {
        if (!results.gdprCompliance && !results.ccpaCompliance) { return false; } // Expect at least one if feature enabled
      }
      return true;
    }
  },
  compatibility: {
    requiredProperties: ['summary.score', 'browserCompatibility.chrome.score', 'deviceCompatibility.mobile.score', 'responsiveDesignScore'],
    minOverallScore: 20,
    fallbackScore: 78,
    validationFn: (results, context) => {
      if (!getNestedProperty(results, 'featureSupport.overallSupportPercentage')) { return false; }
      if (!getNestedProperty(results, 'osCompatibility.windows.score')) { return false; }
      return true;
    }
  },
  marketing: {
    requiredProperties: ['summary.score', 'brandConsistency.score', 'ctaAnalysis.score', 'valueProposition.score'],
    minOverallScore: 15,
    fallbackScore: 58,
    validationFn: (results, context) => {
      if (!getNestedProperty(results, 'socialMediaIntegration.score')) { return false; }
      if (!getNestedProperty(results, 'analyticsIntegration.score')) { return false; }
      if (context?.tier !== "Basic" && context?.featureSet?.advancedInsightsEnabled && !results.competitiveAnalysis) { return false; }
      return true;
    }
  },
  conversion: {
    requiredProperties: ['summary.score', 'funnelAnalysis.score', 'forms.overallFormEffectivenessScore', 'trustSignalsAnalysis.effectivenessScore'],
    minOverallScore: 15,
    fallbackScore: 53,
    validationFn: (results, context) => {
      if (!getNestedProperty(results, 'userExperience.clarityScore')) { return false; }
      if (context?.tier !== "Basic" && getNestedProperty(context, 'industryContext.primaryIndustry') === 'Retail' && !results.checkoutProcess) { return false; }
      return true;
    }
  },
  accessibility: {
    requiredProperties: ['summary.score', 'wcagCompliance.overallWcagScore', 'wcagCompliance.perceivable.score', 'keyboardNavigation.score'],
    minOverallScore: 15,
    fallbackScore: 58,
    validationFn: (results, context) => {
      if (!getNestedProperty(results, 'wcagCompliance.operable.criteria') || !Array.isArray(getNestedProperty(results, 'wcagCompliance.operable.criteria'))) { return false; }
      if (!getNestedProperty(results, 'screenReaderTesting.summary')) { return false; }
      if (!getNestedProperty(results, 'colorContrast.score')) { return false; }
      if (context?.tier === "Enterprise" && context?.featureSet?.advancedInsightsEnabled && !results.implementationPlan) { return false; }
      return true;
    }
  }
};

const FALLBACK_MODELS = {
  // DeepSeek models fallback to Gemini
  'deepseek-chat': ['gemini-2.5-flash', 'gemini-2.0-flash'],
  'deepseek-reasoner': ['gemini-2.5-pro-preview-05-06', 'deepseek-chat'],

  // Gemini models fallback to DeepSeek
  'gemini-2.0-flash': ['deepseek-chat', 'gemini-2.5-flash'],
  'gemini-2.5-flash': ['deepseek-chat', 'gemini-2.0-flash'],
  'gemini-2.5-pro-preview-05-06': ['deepseek-chat', 'gemini-2.5-flash'],
  'gemini-3.0-flash-preview': ['deepseek-chat', 'gemini-2.5-flash'],

  // Generic family fallbacks
  'deepseek': ['gemini-2.5-flash', 'gemini-2.0-flash'],
  'google': ['deepseek-chat', 'deepseek-reasoner'],
};

// --- Core Functions ---
function meetsQualityCriteria(results, moduleType, verbose = false, context = {}) {
  const criteria = QUALITY_CRITERIA[moduleType] || QUALITY_CRITERIA.global;
  if (verbose) { console.log(`[QualityCheck] Checking quality for ${moduleType} with criteria:`, criteria ? Object.keys(criteria) : 'N/A'); }

  if (!results || typeof results !== 'object' || results.error) {
    if (verbose) { console.log(`[QualityCheck] Failed: Results object invalid or contains error for ${moduleType}. Error: ${results?.error}`); }
    return false;
  }

  for (const propPath of (criteria.requiredProperties || [])) {
    if (getNestedProperty(results, propPath) === undefined) {
      if (verbose) { console.log(`[QualityCheck] Failed: Missing required property '${propPath}' for ${moduleType}.`); }
      return false;
    }
  }

  const overallScore = getNestedProperty(results, 'summary.score', getNestedProperty(results, 'score'));
  if (moduleType !== 'global' && criteria.minOverallScore !== undefined) {
    if (overallScore === undefined || overallScore === null || overallScore < criteria.minOverallScore) {
      if (verbose) { console.log(`[QualityCheck] Failed: Module score ${overallScore} for ${moduleType} is below minimum ${criteria.minOverallScore}.`); }
      return false;
    }
  } else if (moduleType === 'global' && criteria.minOverallScore !== undefined) {
    if (results.overallScore === undefined || results.overallScore === null || results.overallScore < criteria.minOverallScore) {
      if (verbose) { console.log(`[QualityCheck] Failed: Report overallScore ${results.overallScore} is below minimum ${criteria.minOverallScore}.`); }
      return false;
    }
  }

  if (criteria.validationFn && !criteria.validationFn(results, context)) {
    if (verbose) { console.log(`[QualityCheck] Failed: Custom validation function returned false for ${moduleType}.`); }
    return false;
  }

  if (verbose) { console.log(`[QualityCheck] ${moduleType} module meets quality criteria.`); }
  return true;
}

async function ensureQualityResults(results, moduleType, analysisOptions, analysisFunction, verbose = false) {
  const qualityContext = {
    tier: analysisOptions.tier,
    industryContext: analysisOptions.industryContext,
    featureSet: analysisOptions.featureSet
  };

  if (meetsQualityCriteria(results, moduleType, verbose, qualityContext)) {
    if (verbose) { console.log(`[QualityCheck] ${moduleType} analysis passed initial quality check.`); }
    return results;
  }

  if (verbose) { console.warn(`[QualityCheck] ${moduleType.toUpperCase()} module failed quality check, attempting retry...`); }

  const currentModel = analysisOptions.model || analysisOptions.modelFamily || 'deepseek';
  const modelFallbacksForCurrent = FALLBACK_MODELS[currentModel] || FALLBACK_MODELS['deepseek'];

  for (const fallbackModelName of modelFallbacksForCurrent) {
    if (verbose) { console.log(`[QualityCheck] Attempting retry with ${fallbackModelName} for ${moduleType}`); }
    try {
      const fallbackOptions = { ...analysisOptions, model: fallbackModelName, modelFamily: null }; // Override model, let ai-models resolve family

      const fallbackResults = await analysisFunction(fallbackOptions);
      if (meetsQualityCriteria(fallbackResults, moduleType, verbose, qualityContext)) {
        if (verbose) { console.log(`[QualityCheck] ${moduleType} retry with ${fallbackModelName} SUCCEEDED.`); }
        return fallbackResults;
      }
      if (verbose) { console.warn(`[QualityCheck] ${moduleType} retry with ${fallbackModelName} also FAILED quality check.`); }
    } catch (error) {
      if (verbose) { console.error(`[QualityCheck] Error during ${moduleType} retry with ${fallbackModelName}: ${error.message}`); }
    }
  }

  // CRITICAL: Don't generate synthetic/fake results - return a proper failure
  // Users deserve accurate information, not fake data masking real failures
  if (verbose) { console.warn(`[QualityCheck] All retries failed for ${moduleType}. Returning failure result (no synthetic data).`); }

  return {
    status: 'failed',
    summary: {
      score: 0,
      rating: 'Failed',
      topIssues: [`${moduleType} analysis failed after all retry attempts`]
    },
    error: `${moduleType} analysis could not be completed - all retry attempts failed`,
    recommendations: { items: [], totalAvailableItems: 0, pagination: null },
    issues: { items: [], totalAvailableItems: 0, pagination: null }
  };
}

// --- Synthetic Results Generation (Schema v3.11.0 Compliant) ---

function createDefaultRecommendation(sourceModule = "unknown") {
  return {
    id: uuidv4(),
    text: "Review this section manually due to analysis failure or missing data.",
    priority: "High",
    source: sourceModule,
    impact: "Accurate analysis needed for informed decisions.",
    effort: "Moderate",
    elementIdentifiers: [],
    effortHours: { min: 1, max: 2 },
    effortBreakdown: [{ task: "Manual Review", role: "Developer", estimatedHours: 2 }],
    // Optional fields for enterprise are typically null in synthetic free/pro
    regulatoryImpact: null,
    businessImpact: null,
    implementationSteps: [],
    score_impact: 0,
    testingGuidance: null,
    successMetrics: [],
    scoreExplanation: null
  };
}

function createDefaultIssue(sourceModule = "unknown") {
  return {
    text: `Analysis for ${sourceModule} failed or data is incomplete. Manual review required.`,
    severity: "Critical",
    location: "Module Level",
    selector: null,
    regulatoryReference: null,
    details: { synthetic: true, reason: "Primary analysis failure." }
  };
}


function generateSyntheticResults(moduleType, url, tier, industryContext, featureSet) {
  const criteria = QUALITY_CRITERIA[moduleType] || {};
  const fallbackScore = criteria.fallbackScore || 25; // Lowered default for synthetic
  const syntheticRating = getRatingLabel(fallbackScore, false);
  const timestamp = new Date().toISOString();
  const syntheticText = `Synthetic data: Analysis for ${moduleType} could not be fully completed. Please review manually.`;

  const syntheticRec = createDefaultRecommendation(moduleType);
  const syntheticIssue = createDefaultIssue(moduleType);

  const baseModuleOutput = {
    summary: { score: fallbackScore, rating: syntheticRating, topIssues: [syntheticText.substring(0, 100)] },
    recommendations: createDefaultPaginatedArray([syntheticRec]),
    issues: createDefaultPaginatedArray([syntheticIssue]),
    industryBenchmarks: (tier === "Enterprise" && featureSet?.advancedIndustryBenchmarkingEnabled) ? { industryAverages: {}, percentileRank: 10, topPerformerComparison: [], benchmarkDataSource: [{ provider: "Synthetic Data" }], notes: syntheticText } : null,
    roiProjections: (tier === "Enterprise" && featureSet?.roiProjectionsEnabled) ? { notes: syntheticText, projections: [] } : null,
    businessImpact: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled) ? { qualitativeImpact: syntheticText, quantitativeImpact: [], strategicAlignment: syntheticText } : null,
    financialRisk: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled && moduleType === 'security') ? { potentialFines: 0, lostRevenuePotential: 0, riskScore: 10, riskRating: "Low", methodology: syntheticText } : null,
    implementationRoadmap: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled) ? { overallStrategy: syntheticText, phases: [], resourceSummary: { totalEstimatedHours: 0, requiredRoles: [] }, riskAssessment: { potentialRisks: [], mitigationStrategies: [] } } : null,
    implementationPlan: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled && moduleType === 'accessibility') ? { shortTerm: [], mediumTerm: [], longTerm: [], resourceNeeds: [], trainingRecommendations: [], estimatedTimeline: syntheticText, governanceRecommendations: [] } : null,
    realTimeDataFeed: null,
    warning: `This is a synthetic ${moduleType} report generated at ${timestamp} for ${url} due to prior analysis failures. Data is illustrative.`,
    error: null // Explicitly null unless a specific error caused this generation
  };

  let specificModuleData = {};
  const isHealthcareEnterprise = industryContext?.primaryIndustry === "Healthcare" && tier === "Enterprise" && featureSet?.detailedComplianceReportingEnabled;

  switch (moduleType.toLowerCase()) {
    case 'ui':
      specificModuleData = {
        screenshots: createDefaultPaginatedArray([{ viewport: "desktop", filename: "synthetic.png", path: "synthetic/path", score: 50, timestamp, metadata: { width: 1920, height: 1080, fileSize: 1000, format: "png", coverage: 100 } }]),
        viewportAnalyses: {
          "desktop": {
            viewport: "desktop", dimensions: { width: 1920, height: 1080 }, analysis: syntheticText,
            structured: { branding: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, responsiveness: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, hierarchy: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, consistency: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, aesthetics: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, aboveTheFold: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, contentFlow: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, visualDesign: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, usability: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, accessibility: { rating: fallbackScore, text: syntheticText, visualEvidence: [] }, recommendations: [syntheticText.substring(0, 100)] },
            screenshot: "synthetic.png", success: false, error: "Primary analysis failed."
          }
        },
        crossViewport: null, edgeCases: null, frameworks: ["Unknown"],
        typographyScore: fallbackScore, visualHierarchyScore: fallbackScore, uiConsistencyScore: fallbackScore,
        industryAnalysis: industryContext || { primaryIndustry: "Other", confidence: 10, detectionMethod: "Fallback" },
        dynamicElementsAnalysis: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { modals: [], carousels: [], accordions: [] } : null,
      };
      break;
    case 'performance':
      specificModuleData = {
        metrics: {
          firstContentfulPaint: { value: 5000, score: fallbackScore, unit: "ms" },
          largestContentfulPaint: { value: 7000, score: fallbackScore, unit: "ms", contributors: [] },
          totalBlockingTime: { value: 1000, score: fallbackScore, unit: "ms" },
          cumulativeLayoutShift: { value: 0.5, score: fallbackScore, unit: "", contributors: [] },
          speedIndex: { value: 6000, score: fallbackScore, unit: "ms" },
          timeToInteractive: { value: 8000, score: fallbackScore, unit: "ms" },
          firstInputDelay: { value: 200, score: fallbackScore, unit: "ms" }, // Or INP
          serverResponsiveness: { value: 1000, score: fallbackScore, unit: "ms" },
          resourceSummary: { totalRequests: 50, totalSizeKB: 1000, score: fallbackScore, breakdownByType: [{ type: "script", requestCount: 10, sizeKB: 300, score: fallbackScore }] }
        },
        audits: { lighthouse: { performance: fallbackScore, accessibility: fallbackScore, bestPractices: fallbackScore, seo: fallbackScore, pwa: fallbackScore, recommendations: createDefaultPaginatedArray() } },
        serverConfiguration: { serverSoftware: "Unknown", cachingScore: fallbackScore, compressionScore: fallbackScore, httpVersion: "Unknown", cdnUsageScore: fallbackScore, dnsLookupTimeMs: null, sslHandshakeTimeMs: null },
        thirdPartyImpact: createDefaultPaginatedArray(),
        clientSideRenderingImpact: (tier !== "Basic") ? { framework: "Unknown", hydrationTimeMs: 500, bundleSizeImpactKB: 200, renderingPathScore: fallbackScore, treeShakingEffectivenessScore: fallbackScore, codeSplittingEffectivenessScore: fallbackScore } : null,
      };
      break;
    case 'seocontent':
      specificModuleData = {
        metadata: {
          title: { text: "Synthetic Title", length: 15, isOptimal: false, score: fallbackScore, issues: [syntheticText] },
          description: { text: "Synthetic meta description.", length: 25, isOptimal: false, score: fallbackScore, issues: [syntheticText] },
          keywords: { text: "keyword1, keyword2", length: 18, isOptimal: false, score: fallbackScore, issues: [] },
          canonicalUrl: { text: url, length: url.length, isOptimal: true, score: fallbackScore, issues: [] },
          robots: { text: "index, follow", length: 12, isOptimal: true, score: fallbackScore, issues: [] },
          openGraph: { text: "OG Title", length: 8, isOptimal: false, score: fallbackScore, issues: [] },
          twitterCard: { text: "Twitter Title", length: 13, isOptimal: false, score: fallbackScore, issues: [] },
          hreflangTags: { tagsFound: [], issues: [syntheticText], score: fallbackScore },
          viewportTag: { value: "width=device-width, initial-scale=1", isMobileFriendly: true, score: fallbackScore }
        },
        content: {
          keywordUsage: { primaryKeyword: "N/A", primaryKeywordInTitle: false, primaryKeywordInMetaDescription: false, primaryKeywordInH1: false, semanticKeywords: [], keywordDensity: 0, keywordStuffingDetected: false, score: fallbackScore, intentAlignment: "Unknown", semanticCoverageScore: fallbackScore },
          readabilityScore: fallbackScore,
          eatMetrics: { overallEatScore: fallbackScore, expertiseScore: fallbackScore, authoritativenessScore: fallbackScore, trustworthinessScore: fallbackScore, analysisText: syntheticText, supportingEvidence: [] },
          contentFreshnessScore: fallbackScore,
          duplicateContentScore: fallbackScore, // Higher is better
          multimediaUsage: { imagesScore: fallbackScore, videoScore: fallbackScore, altTextCoverage: 0, transcriptionAvailability: false },
          textualContentAnalysis: { wordCount: 100, sentiment: "Neutral", qualityScore: fallbackScore, originalityScore: fallbackScore, engagementPotential: "Low", callToActionPresence: false }
        },
        technical: {
          links: { internalLinkCount: 0, externalLinkCount: 0, brokenLinkCount: 1, nofollowLinkCount: 0, anchorTextDiversityScore: fallbackScore, score: fallbackScore, toxicBacklinksFound: false },
          sitemap: { found: false, valid: false, lastUpdated: null, entryCount: 0, issues: [syntheticText], score: fallbackScore },
          robotsTxt: { found: false, valid: false, directives: [], issues: [syntheticText], score: fallbackScore },
          mobileFriendlinessScore: fallbackScore,
          siteSpeedScore: fallbackScore,
          structuredDataScore: fallbackScore,
          urlStructureScore: fallbackScore,
          crawlabilityScore: fallbackScore,
          internationalizationScore: fallbackScore
        },
        localSEO: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { napConsistencyScore: fallbackScore, localRankingsScore: fallbackScore, googleMyBusinessScore: fallbackScore, localReviewsScore: 1, localLinkBuildingScore: fallbackScore, geoTargetingEffectiveness: fallbackScore } : null,
        schemaMarkup: { detectedTypes: [], isValid: false, errors: [syntheticText], recommendations: [], score: fallbackScore, implementationMethod: "Unknown" },
        voiceSearchOptimization: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, faqMarkup: false, conversationalTone: false, featuredSnippetPotential: false, speakableSchemaUsed: false } : null,
        competitiveContentAnalysis: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled) ? { /* default structure */ } : null,
      };
      break;
    case 'security':
      specificModuleData = {
        headers: {
          contentSecurityPolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement CSP" },
          strictTransportSecurity: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement HSTS" },
          xFrameOptions: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement X-Frame-Options" },
          xContentTypeOptions: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement X-Content-Type-Options" },
          referrerPolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement Referrer-Policy" },
          permissionsPolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement Permissions-Policy" },
          crossOriginOpenerPolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement COOP" },
          crossOriginEmbedderPolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement COEP" },
          crossOriginResourcePolicy: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement CORP" },
          xXssProtection: { present: false, value: null, strictness: "Missing", score: fallbackScore, recommendation: "Implement X-XSS-Protection (though CSP is preferred)" }
        },
        ssl: { isHttps: url.startsWith('https'), protocol: url.startsWith('https') ? "TLS 1.2" : "HTTP", certificateDetails: null, hstsAnalysis: { enabled: false }, cipherStrength: "Unknown", issues: [syntheticText], recommendations: [], score: fallbackScore },
        forms: { count: 0, secureCount: 0, insecureCount: 0, issues: [syntheticText], score: fallbackScore, csrfProtectionDetails: { methodUsed: "Unknown", tokenScope: "Unknown" }, inputValidationScore: fallbackScore, dataEncryptionInTransit: false, sensitiveDataHandlingScore: fallbackScore, rateLimitingPresent: false },
        csp: { present: false, value: null, score: fallbackScore, directives: {}, issues: [syntheticText], recommendations: [] },
        vulnerabilities: [{ name: "Synthetic Vulnerability Check", severity: "Medium", remediation: syntheticText, description: syntheticText }],
        dependencyVulnerabilities: [],
        zeroTrustAnalysis: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, principlesAdherence: { verifyExplicitly: fallbackScore, useLeastPrivilegedAccess: fallbackScore, assumeBreach: fallbackScore }, recommendations: [], assessmentDetails: syntheticText } : null,
        phiHandling: isHealthcareEnterprise ? { encryptionAtRest: false, encryptionInTransit: false, accessControlsScore: fallbackScore, sensitiveDataIdentified: false, deidentificationMethods: "Unknown", dataFlowMappingAvailable: false } : null,
        hipaaAuditLogging: isHealthcareEnterprise ? { loggingEnabled: false, logRetentionPolicyDays: 0, logReviewProcessScore: fallbackScore, accessToLogsProtected: false, auditTrailIntegrity: false } : null,
      };
      break;
    case 'privacy':
      specificModuleData = {
        cookies: createDefaultPaginatedArray([{ name: "synthetic_cookie", domain: new URL(url).hostname, expires: "Session", httpOnly: false, secure: false, sameSite: "Lax", purpose: "Unknown", category: "Unknown", thirdParty: false, essential: false, sourceScript: "unknown.js" }]),
        trackers: createDefaultPaginatedArray([{ name: "synthetic_tracker", category: "Unknown", domain: "tracker.example.com", purpose: "Unknown", dataCollected: [], thirdParty: true, sourceScript: "tracker.js", optOutLink: null }]),
        privacyPolicy: { found: false, link: null, score: fallbackScore, clarityScore: fallbackScore, comprehensivenessScore: fallbackScore, accessibilityScore: fallbackScore, lastUpdatedDate: null, issues: [syntheticText], keyClausesPresent: [] },
        dataLayer: { found: false, score: fallbackScore, variables: [], events: [], issues: [syntheticText] },
        consentManagement: { score: fallbackScore, bannerDetected: false, granularConsentAvailable: false, optOutMechanism: false, consentRecord: false, defaultConsentState: "Unknown", lastUpdated: null, userExperienceScore: fallbackScore },
        dataSharingPractices: { score: fallbackScore, thirdPartySharingScore: fallbackScore, anonymizationTechniquesScore: fallbackScore, dataMinimizationScore: fallbackScore, crossBorderTransfers: false, dataRetentionPolicyClarityScore: fallbackScore },
        gdprCompliance: (tier !== "Basic" && featureSet?.detailedComplianceReportingEnabled) ? { score: fallbackScore, dataProcessingAgreementAvailable: false, dpoContactAvailable: false, lawfulBasisIdentified: false, recordsOfProcessingActivitiesDocumented: false, issues: [], recommendations: [] } : null,
        ccpaCompliance: (tier !== "Basic" && featureSet?.detailedComplianceReportingEnabled) ? { score: fallbackScore, doNotSellMyInfoLinkPresent: false, consumerRightsProcessClear: false, optOutMechanismAvailable: false, issues: [], recommendations: [] } : null,
      };
      break;
    case 'compatibility':
      specificModuleData = {
        browserCompatibility: {
          chrome: { score: fallbackScore, issues: [syntheticText], versionTested: "latest", renderingAccuracyScore: fallbackScore, jsFunctionalityScore: fallbackScore, cssSupportScore: fallbackScore },
          firefox: { score: fallbackScore, issues: [syntheticText], versionTested: "latest", renderingAccuracyScore: fallbackScore, jsFunctionalityScore: fallbackScore, cssSupportScore: fallbackScore },
          safari: { score: fallbackScore, issues: [syntheticText], versionTested: "latest", renderingAccuracyScore: fallbackScore, jsFunctionalityScore: fallbackScore, cssSupportScore: fallbackScore },
          edge: { score: fallbackScore, issues: [syntheticText], versionTested: "latest", renderingAccuracyScore: fallbackScore, jsFunctionalityScore: fallbackScore, cssSupportScore: fallbackScore }
        },
        deviceCompatibility: {
          desktop: { score: fallbackScore, issues: [syntheticText], orientationSupportScore: fallbackScore, touchInteractionScore: fallbackScore, viewportAdaptationScore: fallbackScore },
          mobile: { score: fallbackScore, issues: [syntheticText], orientationSupportScore: fallbackScore, touchInteractionScore: fallbackScore, viewportAdaptationScore: fallbackScore },
          tablet: { score: fallbackScore, issues: [syntheticText], orientationSupportScore: fallbackScore, touchInteractionScore: fallbackScore, viewportAdaptationScore: fallbackScore }
        },
        osCompatibility: { overallOsScore: fallbackScore, windows: { score: fallbackScore }, macos: { score: fallbackScore }, linux: { score: fallbackScore }, android: { score: fallbackScore }, ios: { score: fallbackScore } },
        featureSupport: { score: fallbackScore, unsupportedFeatures: [{ featureName: "Advanced Feature X", browsersAffected: ["IE11"], impact: "High" }], polyfillUsageScore: fallbackScore, gracefulDegradationScore: fallbackScore },
        responsiveDesignScore: fallbackScore,
        legacyBrowserSupport: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, strategy: "Not Assessed", specificIssuesForLegacy: [syntheticText] } : null,
        progressiveEnhancement: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, baselineExperience: syntheticText, enhancedFeatures: [], degradationStrategy: syntheticText } : null,
      };
      break;
    case 'marketing':
      specificModuleData = {
        brandConsistency: { score: fallbackScore, voiceScore: fallbackScore, visualScore: fallbackScore, toneAnalysis: { primaryTone: "Neutral", secondaryTones: [], consistencyScore: fallbackScore }, logoUsageScore: fallbackScore, messagingAlignmentScore: fallbackScore },
        ctaAnalysis: { score: fallbackScore, ctaCount: 0, effectiveCtas: 0, clarityScore: fallbackScore, placementScore: fallbackScore, designScore: fallbackScore, urgencyScore: fallbackScore, benefitOrientationScore: fallbackScore },
        socialMediaIntegration: { score: fallbackScore, platforms: [], sharingButtonsScore: fallbackScore, profileLinksScore: fallbackScore, engagementMetricsScore: fallbackScore, contentSyndicationScore: fallbackScore },
        valueProposition: { score: fallbackScore, clarity: syntheticText, uniqueness: syntheticText, resonanceWithTargetAudience: syntheticText, evidenceSupportScore: fallbackScore, prominenceScore: fallbackScore },
        targetAudienceAlignment: { score: fallbackScore, relevance: syntheticText, messagingEffectiveness: syntheticText, channelAlignment: syntheticText, personaDevelopmentEvidence: false, painPointAddressingScore: fallbackScore },
        competitiveAnalysis: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, competitorsAnalyzed: 0, differentiationFactors: [], swotAnalysis: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, marketPositioningScore: fallbackScore } : null,
        analyticsIntegration: { score: fallbackScore, toolsDetected: [], eventTrackingScore: fallbackScore, goalTrackingScore: fallbackScore, dataAccuracyScore: fallbackScore, reportingCapabilitiesScore: fallbackScore, attributionModelClarity: syntheticText },
        contentMarketingEffectiveness: (tier !== "Basic") ? { score: fallbackScore, relevanceToStrategy: syntheticText, engagementScore: fallbackScore, seoSynergyScore: fallbackScore, formatVarietyScore: fallbackScore, distributionEffectivenessScore: fallbackScore } : null,
        emailMarketingIntegration: (tier !== "Basic") ? { score: fallbackScore, signupFormsPresent: false, leadMagnetEffectiveness: syntheticText, listGrowthPotential: syntheticText, automationUsageScore: fallbackScore, segmentationEffectivenessScore: fallbackScore } : null,
      };
      break;
    case 'conversion':
      specificModuleData = {
        formAnalysis: { overallFormScore: fallbackScore, forms: [{ name: "Contact Form", purpose: "Contact", fieldCount: 1, usabilityScore: fallbackScore, completionRateEstimate: 0, errorRateEstimate: 1, ctaButtonText: "Submit", securityMeasuresNotes: syntheticText, multiStepProgressIndication: false, mobileFriendlinessScore: fallbackScore }] },
        trustSignals: { score: fallbackScore, signalsFound: [], effectivenessScore: fallbackScore, placementScore: fallbackScore, authenticityScore: fallbackScore, sufficiencyScore: fallbackScore },
        userExperience: { score: fallbackScore, navigationScore: fallbackScore, clarityScore: fallbackScore, loadTimeImpactScore: fallbackScore, mobileResponsivenessScore: fallbackScore, cognitiveLoadScore: fallbackScore, errorHandlingScore: fallbackScore, feedbackMechanismScore: fallbackScore },
        checkoutProcess: (getNestedProperty(industryContext, 'primaryIndustry') === "Retail" && tier !== "Basic") ? { score: fallbackScore, steps: 0, guestCheckoutAvailable: false, paymentOptionsCount: 0, shippingOptionsClarityScore: fallbackScore, progressIndicationScore: fallbackScore, errorRecoveryScore: fallbackScore } : null,
        landingPageEffectiveness: (tier !== "Basic") ? createDefaultPaginatedArray() : null,
        personalizationOpportunities: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? [] : null,
        abTestingSuggestions: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? [] : null,
      };
      break;
    case 'accessibility':
      specificModuleData = {
        wcagCompliance: {
          overallWcagScore: fallbackScore, conformanceLevelAchieved: "None",
          perceivable: { score: fallbackScore, issues: [createDefaultIssue('accessibility')], criteria: [] },
          operable: { score: fallbackScore, issues: [createDefaultIssue('accessibility')], criteria: [] },
          understandable: { score: fallbackScore, issues: [createDefaultIssue('accessibility')], criteria: [] },
          robust: { score: fallbackScore, issues: [createDefaultIssue('accessibility')], criteria: [] },
          cognitive: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, issues: [createDefaultIssue('accessibility')], criteria: [] } : null,
        },
        screenReaderTesting: { devices: [], summary: syntheticText, navigationScore: fallbackScore, contentAccessibilityScore: fallbackScore, formInteractionScore: fallbackScore },
        keyboardNavigation: { score: fallbackScore, focusVisible: false, trapFocus: false, tabOrderLogical: false, skipLinksPresent: false, issues: [syntheticText] },
        colorContrast: { score: fallbackScore, failedElements: 1, contrastRatioExamples: [] },
        formAccessibility: { score: fallbackScore, labelsPresent: false, errorHandlingAccessible: false, fieldsetLegendUsage: false, instructionsClear: false, overallFormUsabilityScore: fallbackScore },
        multimediaAccessibility: { score: fallbackScore, captionsAvailable: false, transcriptsAvailable: false, audioDescriptionsAvailable: false, mediaAlternativeScore: fallbackScore },
        assistiveTechnologyCompatibility: { score: fallbackScore, testedTechnologies: [], compatibilityIssues: [syntheticText] },
        neurodiversityMetrics: (tier !== "Basic" && featureSet?.advancedInsightsEnabled) ? { score: fallbackScore, cognitiveLoadScore: fallbackScore, distractionFreeScore: fallbackScore, predictabilityScore: fallbackScore, sensorySensitivityConsiderations: syntheticText } : null,
        implementationPlan: (tier === "Enterprise" && featureSet?.advancedInsightsEnabled) ? { shortTerm: [], mediumTerm: [], longTerm: [], resourceNeeds: [syntheticText], trainingRecommendations: [syntheticText], estimatedTimeline: syntheticText, governanceRecommendations: [syntheticText] } : null,
      };
      break;
    default:
      specificModuleData = { message: `Synthetic data for unknown module type: ${moduleType}. Review required.` };
  }
  return { ...baseModuleOutput, ...specificModuleData };
}


module.exports = {
  meetsQualityCriteria,
  ensureQualityResults,
  generateSyntheticResults,
  QUALITY_CRITERIA,
  FALLBACK_MODELS
};
