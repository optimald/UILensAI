/**
 * Scoring Engine for UILensAI - Aligned with Schema v3.11.0
 *
 * This utility provides functions to calculate scores for various aspects of the
 * analysis report. It aims to provide a consistent and configurable way to
 * derive quantitative evaluations based on raw analysis data.
 */

// --- Helper: Safely get nested properties ---
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

// --- Configuration & Thresholds (Aligned with Schema v3.11.0 fields) ---

const PERFORMANCE_METRIC_THRESHOLDS = {
  // These keys should match the keys in $defs/performanceMetricsCollection
  firstContentfulPaint: { good: 1800, poor: 3000, weight: 0.10, lowerIsBetter: true }, // Adjusted weight
  largestContentfulPaint: { good: 2500, poor: 4000, weight: 0.25, lowerIsBetter: true },
  totalBlockingTime: { good: 200, poor: 600, weight: 0.25, lowerIsBetter: true }, // Adjusted weight
  cumulativeLayoutShift: { good: 0.1, poor: 0.25, weight: 0.15, lowerIsBetter: true },
  speedIndex: { good: 3400, poor: 5800, weight: 0.10, lowerIsBetter: true },
  timeToInteractive: { good: 3800, poor: 7300, weight: 0.10, lowerIsBetter: true },
  // Note: firstInputDelay is often a field metric. INP (Interaction to Next Paint) is the lab equivalent.
  // Assuming 'firstInputDelay' in schema refers to INP or a similar lab metric.
  firstInputDelay: { good: 100, poor: 300, weight: 0.05, lowerIsBetter: true },
  serverResponsiveness: { good: 600, poor: 1200, weight: 0.05, lowerIsBetter: true }, // TTFB
  firstMeaningfulPaint: { good: 2000, poor: 4000, weight: 0.05, lowerIsBetter: true }, // Added missing FMP
  // resourceSummary.score is handled by its own calculation.
};

const SSL_TLS_SCORING_CONFIG = { // Renamed for clarity
  baseScore: 100,
  penalties: {
    noHttps: -100, // Site not using HTTPS at all
    weakProtocol: -30, // e.g., TLS 1.0/1.1 still enabled
    weakCipherSuite: -20, // If overall cipherStrength is 'Weak'
    expiredCertificate: -50,
    mismatchedDomain: -40, // CN or SAN doesn't match URL
    missingHsts: -15, // HSTS header not present or not effective
    selfSignedCertificate: -40,
    incompleteChain: -20,
  },
  weights: { // For scoring individual aspects if detailed data is available
    protocolScore: 0.30, // Based on highest protocol supported (e.g., TLS 1.3 = 100, 1.2 = 80)
    cipherStrengthScore: 0.30, // Based on overall 'cipherStrength' enum
    certificateValidityScore: 0.25, // Includes expiration, SANs, issuer trust
    hstsScore: 0.15, // Based on HSTS presence and strictness
  }
};

const SECURITY_HEADER_WEIGHTS = { // Renamed for clarity
  contentSecurityPolicy: 0.25,
  strictTransportSecurity: 0.20,
  xFrameOptions: 0.10,
  xContentTypeOptions: 0.10,
  referrerPolicy: 0.10,
  permissionsPolicy: 0.10, // New name for Feature-Policy
  crossOriginOpenerPolicy: 0.05,
  crossOriginEmbedderPolicy: 0.05,
  crossOriginResourcePolicy: 0.05,
  // xXssProtection is deprecated and often not scored if CSP is strong.
};

const UI_COMPONENT_WEIGHTS = {
  viewportAnalysisAverage: 0.40,
  typographyScore: 0.10,
  visualHierarchyScore: 0.10,
  uiConsistencyScore: 0.10,
  crossViewportScore: 0.10, // From crossViewport.score (this might need its own calculation or be an average)
  edgeCasesAverageScore: 0.05, // Average score from edgeCases if present
  dynamicElementsAverageScore: 0.05, // Average score from dynamicElementsAnalysis
  // industryAnalysis.score is not directly part of UI score but context
};

const SEO_CONTENT_COMPONENT_WEIGHTS = {
  metadataScore: 0.15, // Average of title.score, description.score etc.
  contentScore: 0.30,  // Aggregate of keywordUsage, readability, eatMetrics, etc.
  technicalScore: 0.20, // Aggregate of links, sitemap, robotsTxt, mobileFriendliness, etc.
  schemaMarkupScore: 0.10,
  localSEOScore: 0.05, // If applicable
  voiceSearchOptimizationScore: 0.05, // If applicable
  eatAnalysisScore: 0.05, // EAT is crucial, can be part of content or separate
  geoAnalysisScore: 0.05, // Generative Engine Optimization (AI citability, platform readiness)
  aeoAnalysisScore: 0.05, // Answer Engine Optimization (featured snippets, PAA, FAQ schema)
};

const ACCESSIBILITY_COMPONENT_WEIGHTS = {
  wcagComplianceOverallScore: 0.50,
  screenReaderTestingScore: 0.10, // Average of device scores
  keyboardNavigationScore: 0.10,
  colorContrastScore: 0.10,
  formAccessibilityScore: 0.05,
  multimediaAccessibilityScore: 0.05,
  assistiveTechnologyCompatibilityScore: 0.05,
  cognitiveAccessibilityScore: 0.05, // From wcagCompliance.cognitive.score if Pro/Enterprise
};

const PRIVACY_COMPONENT_WEIGHTS = {
  privacyPolicyScore: 0.25,
  cookiesOverallScore: 0.20, // From cookies.overallCookieScore
  trackersOverallScore: 0.15, // Derived from trackers analysis
  consentManagementScore: 0.20,
  dataLayerScore: 0.05,
  dataSharingPracticesScore: 0.10,
  gdprComplianceScore: 0.025, // Small direct weight, major impact via penalties/flags
  ccpaComplianceScore: 0.025,
};

const COMPATIBILITY_COMPONENT_WEIGHTS = {
  browserCompatibilityAverage: 0.30, // Average of scores from browserCompatibility object
  deviceCompatibilityAverage: 0.20,  // Average from deviceCompatibility object
  osCompatibilityOverallScore: 0.15, // From osCompatibility.overallOsScore
  featureSupportScore: 0.10,         // From featureSupport.score
  responsiveDesignScore: 0.15,       // From responsiveDesignScore field
  legacyBrowserSupportScore: 0.05,   // If applicable
  progressiveEnhancementScore: 0.05, // If applicable
};

const MARKETING_COMPONENT_WEIGHTS = {
  brandConsistencyScore: 0.15,
  ctaAnalysisScore: 0.15,
  socialMediaIntegrationScore: 0.10,
  valuePropositionScore: 0.15,
  targetAudienceAlignmentScore: 0.10,
  analyticsIntegrationScore: 0.10,
  // Pro/Enterprise features
  competitiveAnalysisScore: 0.10,
  contentMarketingEffectivenessScore: 0.10,
  emailMarketingIntegrationScore: 0.05,
};

const CONVERSION_COMPONENT_WEIGHTS = {
  funnelAnalysisScore: 0.25,
  formAnalysisOverallScore: 0.20, // from forms.overallFormEffectivenessScore
  trustSignalsScore: 0.15,        // from trustSignalsAnalysis.effectivenessScore
  userExperienceScore: 0.15,      // from userExperience.score (conversion-focused UX)
  // Pro/Enterprise features
  checkoutProcessScore: 0.10,     // if applicable
  landingPageEffectivenessScore: 0.10, // average of landingPageEffectiveness items
  personalizationOpportunitiesScore: 0.05, // A qualitative assessment might be converted to a score
};

// Service business niches have simple learn→contact→convert paths, not e-commerce funnels
const SERVICE_BUSINESS_CONVERSION_WEIGHTS = {
  funnelAnalysisScore: 0.05,            // Simple funnel, rarely applicable
  formAnalysisOverallScore: 0.30,       // Contact/booking forms are primary conversion mechanism
  trustSignalsScore: 0.25,              // Reviews, certifications, trust badges are critical
  userExperienceScore: 0.20,            // UX drives form completion and phone calls
  checkoutProcessScore: 0.00,           // No checkout for service businesses
  landingPageEffectivenessScore: 0.10,  // Landing page quality still matters
  personalizationOpportunitiesScore: 0.10, // Personalized CTAs matter
};

const SERVICE_BUSINESS_INDUSTRIES = [
  'healthcare', 'medical', 'dental', 'medspa', 'med spa', 'plastic surgery', 'dermatology',
  'law', 'legal', 'attorney', 'lawyer', 'home services', 'plumbing', 'hvac', 'roofing',
  'real estate', 'luxury real estate', 'concierge medicine', 'chiropractic', 'veterinary',
  'spa', 'salon', 'beauty', 'aesthetics', 'cosmetic', 'wellness'
];

// --- Helper Functions ---

function calculateThresholdScore(value, goodThreshold, poorThreshold, lowerIsBetter = true) {
  if (typeof value !== 'number' || isNaN(value)) { return 0; }

  // Ensure good and poor thresholds are correctly ordered based on lowerIsBetter
  let effectiveGood = goodThreshold;
  let effectivePoor = poorThreshold;

  if (lowerIsBetter && goodThreshold > poorThreshold) {
    [effectiveGood, effectivePoor] = [poorThreshold, goodThreshold];
  } else if (!lowerIsBetter && goodThreshold < poorThreshold) {
    [effectiveGood, effectivePoor] = [poorThreshold, goodThreshold];
  }

  let score;
  if (lowerIsBetter) {
    // For metrics like FCP, LCP, TTI: lower values = better scores
    if (value <= effectiveGood) {
      // Excellent zone: linear scaling from 90-100
      score = 90 + (10 * (1 - (value / effectiveGood)));
    } else if (value >= effectivePoor) {
      // Poor zone: exponential decay from 40 down to 0
      const excessRatio = Math.min(3, (value - effectivePoor) / effectivePoor);
      score = Math.max(0, 40 * Math.exp(-excessRatio));
    } else {
      // Medium zone between good and poor: linear scaling from 90 down to 40
      const range = effectivePoor - effectiveGood;
      const position = (value - effectiveGood) / range;
      score = 90 - (position * 50); // Scale from 90 down to 40
    }
  } else {
    // For metrics where higher is better
    if (value >= effectiveGood) {
      score = 90 + (10 * Math.min(1, (value - effectiveGood) / effectiveGood));
    } else if (value <= effectivePoor) {
      score = Math.max(0, (value / effectivePoor) * 40);
    } else {
      const range = effectiveGood - effectivePoor;
      const position = (value - effectivePoor) / range;
      score = 40 + (position * 50); // Scale from 40 up to 90
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateWeightedAverage(scoredItems) {
  if (!Array.isArray(scoredItems) || scoredItems.length === 0) { return 0; }
  let totalScore = 0;
  let totalWeight = 0;
  scoredItems.forEach(item => {
    if (item && typeof item.score === 'number' && !isNaN(item.score) && typeof item.weight === 'number' && item.weight > 0) {
      totalScore += item.score * item.weight;
      totalWeight += item.weight;
    }
  });
  if (totalWeight === 0) { return 0; } // Avoid division by zero
  return Math.max(0, Math.min(100, Math.round(totalScore / totalWeight)));
}

function applyPenalties(baseScore, penalties) {
  if (typeof baseScore !== 'number') { baseScore = 100; } // Default to perfect if no base
  if (!Array.isArray(penalties)) { return Math.max(0, Math.min(100, Math.round(baseScore))); }
  let finalScore = baseScore;
  penalties.forEach(penalty => {
    if (typeof penalty === 'number') { finalScore += penalty; } // Penalties are negative numbers
  });
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

function getRatingLabelForScore(score, isNullable = false) {
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

// --- Module-Specific Scoring Functions ---

function scorePerformanceMetric(metricName, value) {
  const config = PERFORMANCE_METRIC_THRESHOLDS[metricName];
  if (!config || value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return { score: 0, weight: config?.weight || 0.01 }; // Return 0 score for invalid values
  }
  const score = calculateThresholdScore(value, config.good, config.poor, config.lowerIsBetter === true);
  return { score, weight: config.weight };
}

function calculatePerformanceMetricsScore(metricsData) {
  if (!metricsData || typeof metricsData !== 'object') { return 65; } // Improved default for simple sites

  const scoredMetrics = [];
  const metricNames = ['firstContentfulPaint', 'largestContentfulPaint', 'totalBlockingTime', 'cumulativeLayoutShift', 'speedIndex', 'timeToInteractive', 'firstInputDelay', 'serverResponsiveness'];

  for (const metricName of metricNames) {
    const metricDetail = metricsData[metricName];

    // Ensure metricDetail and its value exist and are numbers
    if (metricDetail && typeof metricDetail.value === 'number' && !isNaN(metricDetail.value)) {
      const { score, weight } = scorePerformanceMetric(metricName, metricDetail.value);
      scoredMetrics.push({ score, weight });
    } else {
      // If a key metric is missing, apply a penalty or low score with its weight
      const config = PERFORMANCE_METRIC_THRESHOLDS[metricName];
      if (config) { scoredMetrics.push({ score: 10, weight: config.weight }); } // Low score for missing critical metric
    }
  }

  // Add resourceSummary score if available
  if (metricsData.resourceSummary && typeof metricsData.resourceSummary.score === 'number') {
    scoredMetrics.push({ score: metricsData.resourceSummary.score, weight: 0.1 }); // Example weight for resource summary
  }

  return calculateWeightedAverage(scoredMetrics);
}

function calculateSslTlsScore(sslData) {
  if (!sslData || typeof sslData !== 'object') { return 0; }
  const score = SSL_TLS_SCORING_CONFIG.baseScore;
  const penaltiesList = [];

  if (!sslData.isHttps) { // isHttps is from schema $defs/sslTlsAnalysis now
    penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.noHttps);
    return applyPenalties(score, penaltiesList); // No further checks if not HTTPS
  }

  // Protocol check (from ssl.protocol)
  if (sslData.protocol && (sslData.protocol.includes("TLS 1.0") || sslData.protocol.includes("TLS 1.1") || sslData.protocol.toLowerCase().includes("ssl"))) {
    penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.weakProtocol);
  }
  // Cipher strength (from ssl.cipherStrength)
  if (sslData.cipherStrength === "Weak") {
    penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.weakCipherSuite);
  }
  // Certificate validity (from ssl.certificateDetails)
  if (sslData.certificateDetails) {
    if (sslData.certificateDetails.validTo && new Date(sslData.certificateDetails.validTo) < new Date()) {
      penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.expiredCertificate);
    }
    // Add more specific checks for commonName, issuer, san if needed.
    // For simplicity, schema assumes AI populates ssl.issues for these.
  }
  // HSTS (from ssl.hstsAnalysis)
  if (sslData.hstsAnalysis && !sslData.hstsAnalysis.enabled) {
    penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.missingHsts);
  }
  // Generic issues from ssl.issues array
  (sslData.issues || []).forEach(issueText => {
    if (typeof issueText === 'string') {
      if (issueText.toLowerCase().includes("self-signed")) { penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.selfSignedCertificate); }
      if (issueText.toLowerCase().includes("incomplete chain")) { penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.incompleteChain); }
      if (issueText.toLowerCase().includes("mismatched domain")) { penaltiesList.push(SSL_TLS_SCORING_CONFIG.penalties.mismatchedDomain); }
    }
  });
  return applyPenalties(score, penaltiesList);
}

function calculateSecurityHeadersScore(headersData) {
  if (!headersData || typeof headersData !== 'object') { return 0; }
  const componentScores = [];
  for (const headerKey in SECURITY_HEADER_WEIGHTS) {
    const headerDetail = headersData[headerKey]; // headerKey is camelCase from schema
    if (headerDetail && typeof headerDetail.score === 'number') {
      componentScores.push({ score: headerDetail.score, weight: SECURITY_HEADER_WEIGHTS[headerKey] });
    } else {
      // If a header is missing entirely or its score is not a number, assign a low score for its weight
      componentScores.push({ score: 10, weight: SECURITY_HEADER_WEIGHTS[headerKey] });
    }
  }
  return calculateWeightedAverage(componentScores);
}

function calculateUiCategoryScore(categoryData) {
  // Assumes categoryData is an object like { rating: XX, text: "...", visualEvidence: [] }
  // The 'rating' field is the direct score from AI, already 0-100.
  if (!categoryData || typeof categoryData.rating !== 'number') { return 50; } // Default if malformed
  return Math.max(0, Math.min(100, Math.round(categoryData.rating)));
}

function calculateUiViewportScore(viewportAnalysisData) {
  if (!viewportAnalysisData || !viewportAnalysisData.structured || typeof viewportAnalysisData.structured !== 'object') { return 30; }
  const structuredData = viewportAnalysisData.structured;
  const categoryScores = [];
  // Weights for each of the 10 UI categories in $defs/uiViewportAnalysisDetail.structured
  const categoryWeights = {
    branding: 0.10, responsiveness: 0.15, hierarchy: 0.10, consistency: 0.10,
    aesthetics: 0.10, aboveTheFold: 0.10, contentFlow: 0.10, visualDesign: 0.10,
    usability: 0.10, accessibility: 0.05 // Preliminary accessibility check
  };
  let foundCategories = 0;
  for (const categoryKey in categoryWeights) {
    if (Object.prototype.hasOwnProperty.call(structuredData, categoryKey)) {
      const categoryRating = getNestedProperty(structuredData, `${categoryKey}.rating`);
      if (typeof categoryRating === 'number') {
        categoryScores.push({ score: categoryRating, weight: categoryWeights[categoryKey] });
        foundCategories++;
      }
    }
  }
  // If no categories were scored, return a reasonable default for simple sites.
  return foundCategories > 0 ? calculateWeightedAverage(categoryScores) : 60;
}

// --- Deterministic Base Score Weights ---
// These define how much of the final score comes from deterministic (observable) signals
// vs AI-derived sub-scores. Higher det. weight = more reproducible between runs.
const DETERMINISTIC_WEIGHTS = {
  security:      0.60,
  performance:   0.80,
  seocontent:     0.50,
  accessibility: 0.40,
  privacy:       0.40,
  ui:            0.30,
  compatibility: 0.30,
  marketing:     0.30,
  conversion:    0.30,
};

/**
 * Calculate a deterministic base score for a module using only observable,
 * non-AI data. These signals are collected by each analyze module and
 * attached as `_collectedSignals` on the module output.
 *
 * @param {string} moduleName
 * @param {object} collectedSignals - the `_collectedSignals` object from the module
 * @returns {number|null} 0-100 score, or null if no deterministic signals available
 */
function calculateDeterministicBaseScore(moduleName, collectedSignals) {
  if (!collectedSignals || typeof collectedSignals !== 'object') return null;
  const checks = [];

  switch (moduleName.toLowerCase()) {
    case 'security': {
      const s = collectedSignals;
      // Binary checks scored 0 or 100
      if (s.isHttps !== undefined)                checks.push({ score: s.isHttps ? 100 : 0, weight: 0.25 });
      if (s.hasHsts !== undefined)                checks.push({ score: s.hasHsts ? 100 : 0, weight: 0.15 });
      if (s.hasCsp !== undefined)                 checks.push({ score: s.hasCsp ? 100 : 0, weight: 0.20 });
      if (s.hasXFrameOptions !== undefined)        checks.push({ score: s.hasXFrameOptions ? 100 : 0, weight: 0.10 });
      if (s.hasXContentTypeOptions !== undefined)  checks.push({ score: s.hasXContentTypeOptions ? 100 : 0, weight: 0.10 });
      if (s.hasReferrerPolicy !== undefined)       checks.push({ score: s.hasReferrerPolicy ? 100 : 0, weight: 0.05 });
      if (s.hasPermissionsPolicy !== undefined)    checks.push({ score: s.hasPermissionsPolicy ? 100 : 0, weight: 0.05 });
      // Continuous: cookie security ratio
      if (typeof s.secureCookieRatio === 'number') checks.push({ score: Math.round(s.secureCookieRatio * 100), weight: 0.10 });
      break;
    }

    case 'seocontent': {
      const s = collectedSignals;
      // Title tag: exists and length between 30-60 chars
      if (s.titleLength !== undefined) {
        const tLen = s.titleLength;
        let titleScore = 0;
        if (tLen === 0) titleScore = 0;
        else if (tLen >= 30 && tLen <= 60) titleScore = 100;
        else if (tLen > 0 && tLen < 30) titleScore = 50;
        else if (tLen > 60) titleScore = 70;
        checks.push({ score: titleScore, weight: 0.15 });
      }
      // Meta description: exists and 120-160 chars
      if (s.metaDescriptionLength !== undefined) {
        const mLen = s.metaDescriptionLength;
        let metaScore = 0;
        if (mLen === 0) metaScore = 0;
        else if (mLen >= 120 && mLen <= 160) metaScore = 100;
        else if (mLen > 0 && mLen < 120) metaScore = 60;
        else if (mLen > 160) metaScore = 70;
        checks.push({ score: metaScore, weight: 0.15 });
      }
      if (s.h1Count !== undefined) {
        checks.push({ score: s.h1Count === 1 ? 100 : (s.h1Count === 0 ? 0 : 50), weight: 0.15 });
      }
      if (s.hasCanonical !== undefined)   checks.push({ score: s.hasCanonical ? 100 : 0, weight: 0.15 });
      if (s.hasRobotsTxt !== undefined)   checks.push({ score: s.hasRobotsTxt ? 100 : 0, weight: 0.10 });
      if (s.hasSitemap !== undefined)     checks.push({ score: s.hasSitemap ? 100 : 0, weight: 0.10 });
      if (s.hasOgTags !== undefined)      checks.push({ score: s.hasOgTags ? 100 : 0, weight: 0.10 });
      if (typeof s.wordCount === 'number') {
        let wordScore = 0;
        if (s.wordCount >= 300) wordScore = 100;
        else if (s.wordCount >= 100) wordScore = 70;
        else wordScore = 30;
        checks.push({ score: wordScore, weight: 0.10 });
      }
      break;
    }

    case 'performance': {
      // Performance is ALREADY largely deterministic via calculatePerformanceMetricsScore().
      // Use the collectedSignals only if direct metric values are available.
      const s = collectedSignals;
      if (typeof s.lcpMs === 'number') checks.push({ score: calculateThresholdScore(s.lcpMs, 2500, 4000, true), weight: 0.25 });
      if (typeof s.fcpMs === 'number') checks.push({ score: calculateThresholdScore(s.fcpMs, 1800, 3000, true), weight: 0.10 });
      if (typeof s.tbtMs === 'number') checks.push({ score: calculateThresholdScore(s.tbtMs, 200, 600, true), weight: 0.25 });
      if (typeof s.cls === 'number')   checks.push({ score: calculateThresholdScore(s.cls, 0.1, 0.25, true), weight: 0.15 });
      if (typeof s.siMs === 'number')  checks.push({ score: calculateThresholdScore(s.siMs, 3400, 5800, true), weight: 0.10 });
      if (typeof s.ttiMs === 'number') checks.push({ score: calculateThresholdScore(s.ttiMs, 3800, 7300, true), weight: 0.10 });
      if (typeof s.ttfbMs === 'number') checks.push({ score: calculateThresholdScore(s.ttfbMs, 600, 1200, true), weight: 0.05 });
      break;
    }

    case 'accessibility': {
      const s = collectedSignals;
      // Alt text coverage: ratio of images with alt text
      if (typeof s.altTextCoverage === 'number')  checks.push({ score: Math.round(s.altTextCoverage * 100), weight: 0.25 });
      // Heading hierarchy: valid sequential structure
      if (s.headingHierarchyValid !== undefined)   checks.push({ score: s.headingHierarchyValid ? 100 : 30, weight: 0.20 });
      // Form labels: ratio of inputs with labels
      if (typeof s.formLabelCoverage === 'number') checks.push({ score: Math.round(s.formLabelCoverage * 100), weight: 0.20 });
      // ARIA landmarks present
      if (s.hasAriaLandmarks !== undefined)         checks.push({ score: s.hasAriaLandmarks ? 100 : 30, weight: 0.15 });
      // Lang attribute
      if (s.hasLangAttribute !== undefined)         checks.push({ score: s.hasLangAttribute ? 100 : 0, weight: 0.10 });
      // Skip navigation link
      if (s.hasSkipLink !== undefined)              checks.push({ score: s.hasSkipLink ? 100 : 30, weight: 0.10 });
      break;
    }

    case 'privacy': {
      const s = collectedSignals;
      if (s.hasPrivacyPolicy !== undefined)     checks.push({ score: s.hasPrivacyPolicy ? 100 : 0, weight: 0.30 });
      if (s.hasConsentBanner !== undefined)      checks.push({ score: s.hasConsentBanner ? 100 : 30, weight: 0.25 });
      if (typeof s.thirdPartyTrackerCount === 'number') {
        // Fewer trackers = better. 0 trackers = 100, 10+ = 20
        const trackerScore = Math.max(20, 100 - (s.thirdPartyTrackerCount * 8));
        checks.push({ score: trackerScore, weight: 0.20 });
      }
      if (typeof s.totalCookieCount === 'number') {
        // Fewer cookies = better. 0 = 100, 20+ = 30
        const cookieScore = Math.max(30, 100 - (s.totalCookieCount * 3.5));
        checks.push({ score: Math.round(cookieScore), weight: 0.15 });
      }
      if (s.cookiesSecureFlag !== undefined) checks.push({ score: s.cookiesSecureFlag ? 100 : 30, weight: 0.10 });
      break;
    }

    case 'ui': {
      const s = collectedSignals;
      if (s.hasViewportMeta !== undefined)           checks.push({ score: s.hasViewportMeta ? 100 : 0, weight: 0.30 });
      if (typeof s.discoveredSelectorsCount === 'number') {
        // More discovered selectors = richer page structure
        const selScore = Math.min(100, s.discoveredSelectorsCount * 5);
        checks.push({ score: selScore, weight: 0.30 });
      }
      if (typeof s.screenshotsCaptured === 'number') {
        checks.push({ score: s.screenshotsCaptured > 0 ? 100 : 0, weight: 0.20 });
      }
      if (s.hasResponsiveImages !== undefined) checks.push({ score: s.hasResponsiveImages ? 100 : 40, weight: 0.20 });
      break;
    }

    case 'compatibility': {
      const s = collectedSignals;
      if (s.hasDoctype !== undefined)      checks.push({ score: s.hasDoctype ? 100 : 0, weight: 0.25 });
      if (s.hasViewportMeta !== undefined)  checks.push({ score: s.hasViewportMeta ? 100 : 0, weight: 0.25 });
      if (s.hasCharsetMeta !== undefined)   checks.push({ score: s.hasCharsetMeta ? 100 : 0, weight: 0.20 });
      if (s.usesModernCss !== undefined)    checks.push({ score: s.usesModernCss ? 100 : 50, weight: 0.15 });
      if (s.noJsErrors !== undefined)       checks.push({ score: s.noJsErrors ? 100 : 30, weight: 0.15 });
      break;
    }

    case 'marketing': {
      const s = collectedSignals;
      if (s.hasOgTags !== undefined)             checks.push({ score: s.hasOgTags ? 100 : 0, weight: 0.20 });
      if (s.hasAnalytics !== undefined)           checks.push({ score: s.hasAnalytics ? 100 : 0, weight: 0.20 });
      if (typeof s.socialLinksCount === 'number') {
        const socialScore = Math.min(100, s.socialLinksCount * 25);
        checks.push({ score: socialScore, weight: 0.20 });
      }
      if (s.hasSchemaMarkup !== undefined)         checks.push({ score: s.hasSchemaMarkup ? 100 : 0, weight: 0.15 });
      if (s.hasTwitterCard !== undefined)           checks.push({ score: s.hasTwitterCard ? 100 : 0, weight: 0.10 });
      if (typeof s.ctaCount === 'number') {
        const ctaScore = Math.min(100, s.ctaCount * 30);
        checks.push({ score: ctaScore, weight: 0.15 });
      }
      break;
    }

    case 'conversion': {
      const s = collectedSignals;
      if (typeof s.formCount === 'number') {
        checks.push({ score: s.formCount > 0 ? 100 : 20, weight: 0.30 });
      }
      if (typeof s.ctaCount === 'number') {
        const ctaScore = Math.min(100, s.ctaCount * 25);
        checks.push({ score: ctaScore, weight: 0.30 });
      }
      if (typeof s.trustSignalCount === 'number') {
        const trustScore = Math.min(100, s.trustSignalCount * 20);
        checks.push({ score: trustScore, weight: 0.20 });
      }
      if (s.hasContactInfo !== undefined) checks.push({ score: s.hasContactInfo ? 100 : 20, weight: 0.20 });
      break;
    }

    default:
      return null;
  }

  if (checks.length === 0) return null;
  return calculateWeightedAverage(checks);
}

/**
 * Compose a deterministic base score with an AI-derived score.
 * Returns the blended score and metadata for transparency.
 *
 * @param {string} moduleName
 * @param {number|null} deterministicBase - 0-100, or null if unavailable
 * @param {number} aiScore - 0-100 AI-derived score
 * @returns {{ score: number, deterministicBase: number|null, aiScore: number, deterministicWeight: number }}
 */
function composeDeterministicAndAiScore(moduleName, deterministicBase, aiScore) {
  const detWeight = DETERMINISTIC_WEIGHTS[moduleName.toLowerCase()] || 0;

  if (deterministicBase === null || deterministicBase === undefined) {
    // No deterministic data available — fall back to pure AI score
    return {
      score: Math.max(0, Math.min(100, Math.round(aiScore))),
      deterministicBase: null,
      aiScore: Math.round(aiScore),
      deterministicWeight: 0
    };
  }

  const blended = (deterministicBase * detWeight) + (aiScore * (1 - detWeight));
  return {
    score: Math.max(0, Math.min(100, Math.round(blended))),
    deterministicBase: Math.round(deterministicBase),
    aiScore: Math.round(aiScore),
    deterministicWeight: detWeight
  };
}

// --- Main Score Calculation Orchestration ---

function calculateModuleSummaryScore(moduleName, moduleData, context = {}) {
  if (!moduleData || typeof moduleData !== 'object') { return 65; } // Improved score for simple sites
  let score = 65; // Improved default score for simple, functional sites
  const componentScores = [];
  const tier = context.tier || "Basic";
  const featureSet = context.featureSet || {};

  switch (moduleName.toLowerCase()) {
    case 'ui':
      const viewportScores = [];
      let totalViewports = 0;
      let failedViewports = 0;

      if (moduleData.viewportAnalyses && typeof moduleData.viewportAnalyses === 'object') {
        Object.values(moduleData.viewportAnalyses).forEach(vpData => {
          totalViewports++;
          if (vpData && vpData.success !== false && vpData.structured) { // Check for success and structured data
            viewportScores.push({ score: calculateUiViewportScore(vpData), weight: getNestedProperty(vpData, 'dimensions.isMobile', false) ? 0.6 : 0.4 });
          } else {
            failedViewports++;
            // Add a penalty score for failed viewports
            const isMobile = getNestedProperty(vpData, 'dimensions.isMobile', false);
            viewportScores.push({ score: 20, weight: isMobile ? 0.6 : 0.4 }); // Low score for failed viewport
          }
        });
      }

      // Apply additional penalty if any viewports failed
      let viewportAnalysisScore = viewportScores.length > 0 ? calculateWeightedAverage(viewportScores) : 60;
      if (failedViewports > 0 && totalViewports > 0) {
        const failureRate = failedViewports / totalViewports;
        const failurePenalty = Math.round(failureRate * 30); // Up to 30 point penalty for complete failure
        viewportAnalysisScore = Math.max(10, viewportAnalysisScore - failurePenalty);
      }

      if (viewportScores.length > 0) { componentScores.push({ score: viewportAnalysisScore, weight: UI_COMPONENT_WEIGHTS.viewportAnalysisAverage }); }

      if (typeof moduleData.typographyScore === 'number') { componentScores.push({ score: moduleData.typographyScore, weight: UI_COMPONENT_WEIGHTS.typographyScore }); }
      if (typeof moduleData.visualHierarchyScore === 'number') { componentScores.push({ score: moduleData.visualHierarchyScore, weight: UI_COMPONENT_WEIGHTS.visualHierarchyScore }); }
      if (typeof moduleData.uiConsistencyScore === 'number') { componentScores.push({ score: moduleData.uiConsistencyScore, weight: UI_COMPONENT_WEIGHTS.uiConsistencyScore }); }

      if (getNestedProperty(moduleData, 'crossViewport.score')) { componentScores.push({ score: moduleData.crossViewport.score, weight: UI_COMPONENT_WEIGHTS.crossViewportScore }); }

      // Edge Cases Average Score
      if (moduleData.edgeCases && typeof moduleData.edgeCases === 'object' && Object.keys(moduleData.edgeCases).length > 0) {
        const edgeCaseScores = Object.values(moduleData.edgeCases)
          .filter(ec => ec && typeof getNestedProperty(ec, 'structured.score') === 'number')
          .map(ec => ({ score: getNestedProperty(ec, 'structured.score'), weight: 1 }));
        if (edgeCaseScores.length > 0) {
          componentScores.push({ score: calculateWeightedAverage(edgeCaseScores), weight: UI_COMPONENT_WEIGHTS.edgeCasesAverageScore });
        }
      }
      // Dynamic Elements Average Score
      if (moduleData.dynamicElementsAnalysis && typeof moduleData.dynamicElementsAnalysis === 'object') {
        const dynamicScores = [];
        ['modals', 'carousels', 'accordions', 'otherDynamicElements'].forEach(key => {
          if (Array.isArray(moduleData.dynamicElementsAnalysis[key])) {
            moduleData.dynamicElementsAnalysis[key].forEach(el => {
              if (el && typeof el.usabilityScore === 'number') { dynamicScores.push({ score: el.usabilityScore, weight: 0.5 }); }
              if (el && typeof el.accessibilityScore === 'number') { dynamicScores.push({ score: el.accessibilityScore, weight: 0.5 }); }
            });
          }
        });
        if (dynamicScores.length > 0) {
          componentScores.push({ score: calculateWeightedAverage(dynamicScores), weight: UI_COMPONENT_WEIGHTS.dynamicElementsAverageScore });
        }
      }
      // GOLD-STANDARD: Add evidence-based design system consistency score
      if (moduleData.designSystemEvidence?.consistency?.overall?.score) {
        componentScores.push({ score: moduleData.designSystemEvidence.consistency.overall.score, weight: 0.10 });
      }
      score = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 30;
      break;

    case 'performance':
      const perfMetricsOverallScore = calculatePerformanceMetricsScore(moduleData.metrics);
      componentScores.push({ score: perfMetricsOverallScore, weight: 0.6 }); // Increased weight for core metrics
      if (getNestedProperty(moduleData, 'audits.lighthouse.score')) { // Using overall LH score now
        componentScores.push({ score: moduleData.audits.lighthouse.score, weight: 0.2 });
      }
      if (getNestedProperty(moduleData, 'serverConfiguration.score')) {
        componentScores.push({ score: moduleData.serverConfiguration.score, weight: 0.1 });
      }
      if (getNestedProperty(moduleData, 'thirdPartyImpact.items') && moduleData.thirdPartyImpact.items.length > 0) {
        const thirdPartyAvgScore = calculateWeightedAverage(
          moduleData.thirdPartyImpact.items.map(item => ({ score: item.impactScore, weight: 1 }))
        );
        componentScores.push({ score: thirdPartyAvgScore, weight: 0.05 });
      }
      if (getNestedProperty(moduleData, 'clientSideRenderingImpact.renderingPathScore')) {
        componentScores.push({ score: moduleData.clientSideRenderingImpact.renderingPathScore, weight: 0.05 });
      }
      score = calculateWeightedAverage(componentScores);
      break;

    case 'security':
      if (moduleData.ssl && typeof moduleData.ssl.score === 'number') { componentScores.push({ score: moduleData.ssl.score, weight: 0.3 }); }
      else if (moduleData.ssl) { componentScores.push({ score: calculateSslTlsScore(moduleData.ssl), weight: 0.3 }); }

      if (moduleData.headers) { componentScores.push({ score: calculateSecurityHeadersScore(moduleData.headers), weight: 0.25 }); }

      if (moduleData.forms && typeof moduleData.forms.score === 'number') { componentScores.push({ score: moduleData.forms.score, weight: 0.10 }); }
      if (moduleData.csp && typeof moduleData.csp.score === 'number') { componentScores.push({ score: moduleData.csp.score, weight: 0.10 }); }

      let vulnerabilityImpactScore = 100;
      if (Array.isArray(moduleData.vulnerabilities)) {
        moduleData.vulnerabilities.forEach(vuln => {
          if (vuln.severity === "Critical") { vulnerabilityImpactScore -= 20; }
          else if (vuln.severity === "High") { vulnerabilityImpactScore -= 10; }
          else if (vuln.severity === "Medium") { vulnerabilityImpactScore -= 5; }
        });
      }
      componentScores.push({ score: Math.max(0, vulnerabilityImpactScore), weight: 0.15 });

      if (getNestedProperty(moduleData, 'dependencyVulnerabilities') && moduleData.dependencyVulnerabilities.length > 0) {
        // Simple penalty for having dependency vulnerabilities
        componentScores.push({ score: 70, weight: 0.05 });
      }
      if (getNestedProperty(moduleData, 'zeroTrustAnalysis.score')) {
        componentScores.push({ score: moduleData.zeroTrustAnalysis.score, weight: 0.05 });
      }
      score = calculateWeightedAverage(componentScores);
      break;

    case 'seocontent':
      // Weighted average of all SEO/AEO/GEO sub-components
      const seoSubScores = [
        { score: getNestedProperty(moduleData, 'metadata.title.score', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.metadataScore * 0.2 },
        { score: getNestedProperty(moduleData, 'metadata.description.score', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.metadataScore * 0.2 },
        { score: getNestedProperty(moduleData, 'content.readabilityScore', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.contentScore * 0.3 },
        { score: getNestedProperty(moduleData, 'content.eatMetrics.overallEatScore', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.contentScore * 0.4 },
        { score: getNestedProperty(moduleData, 'content.keywordUsage.score', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.contentScore * 0.3 },
        { score: getNestedProperty(moduleData, 'technical.links.score', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.technicalScore * 0.3 },
        { score: getNestedProperty(moduleData, 'technical.mobileFriendlinessScore', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.technicalScore * 0.2 },
        { score: getNestedProperty(moduleData, 'technical.structuredDataScore', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.technicalScore * 0.2 },
        { score: getNestedProperty(moduleData, 'schemaMarkup.score', 50), weight: SEO_CONTENT_COMPONENT_WEIGHTS.schemaMarkupScore },
      ];
      if (getNestedProperty(moduleData, 'localSEO.score')) { seoSubScores.push({ score: moduleData.localSEO.score, weight: SEO_CONTENT_COMPONENT_WEIGHTS.localSEOScore }); }
      if (getNestedProperty(moduleData, 'voiceSearchOptimization.score')) { seoSubScores.push({ score: moduleData.voiceSearchOptimization.score, weight: SEO_CONTENT_COMPONENT_WEIGHTS.voiceSearchOptimizationScore }); }

      // GEO: Generative Engine Optimization (AI citability, platform readiness)
      if (getNestedProperty(moduleData, 'geoAnalysis.overallGeoScore') !== undefined) {
        seoSubScores.push({ score: moduleData.geoAnalysis.overallGeoScore, weight: SEO_CONTENT_COMPONENT_WEIGHTS.geoAnalysisScore });
      }
      // AEO: Answer Engine Optimization (featured snippets, PAA, FAQ schema)
      if (getNestedProperty(moduleData, 'aeoAnalysis.overallScore') !== undefined) {
        seoSubScores.push({ score: moduleData.aeoAnalysis.overallScore, weight: SEO_CONTENT_COMPONENT_WEIGHTS.aeoAnalysisScore });
      }

      // GOLD-STANDARD: Add evidence-based content quality score
      if (moduleData.contentQualityEvidence?.scores?.overall?.score) {
        seoSubScores.push({ score: moduleData.contentQualityEvidence.scores.overall.score, weight: 0.10 });
      }

      score = calculateWeightedAverage(seoSubScores);
      break;

    case 'accessibility':
      if (getNestedProperty(moduleData, 'wcagCompliance.overallWcagScore')) {
        componentScores.push({ score: moduleData.wcagCompliance.overallWcagScore, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.wcagComplianceOverallScore });
      }
      if (getNestedProperty(moduleData, 'screenReaderTesting.score')) { // Assuming an overall score for screenReaderTesting
        componentScores.push({ score: moduleData.screenReaderTesting.score, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.screenReaderTestingScore });
      }
      if (getNestedProperty(moduleData, 'keyboardNavigation.score')) { componentScores.push({ score: moduleData.keyboardNavigation.score, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.keyboardNavigationScore }); }
      if (getNestedProperty(moduleData, 'colorContrast.score')) { componentScores.push({ score: moduleData.colorContrast.score, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.colorContrastScore }); }
      if (getNestedProperty(moduleData, 'formAccessibility.score') && !getNestedProperty(moduleData, 'formAccessibility._skipped')) { componentScores.push({ score: moduleData.formAccessibility.score, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.formAccessibilityScore }); }
      if (getNestedProperty(moduleData, 'wcagCompliance.cognitive.score')) {
        componentScores.push({ score: moduleData.wcagCompliance.cognitive.score, weight: ACCESSIBILITY_COMPONENT_WEIGHTS.cognitiveAccessibilityScore });
      }
      score = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 30;
      break;

    case 'privacy':
      // Critical privacy features that should heavily impact the score
      let criticalPrivacyPenalties = 0;

      // Privacy Policy - Critical requirement
      const privacyPolicyFound = getNestedProperty(moduleData, 'privacyPolicy.found', false);
      const privacyPolicyScore = getNestedProperty(moduleData, 'privacyPolicy.score', 0);
      if (!privacyPolicyFound || privacyPolicyScore === 0) {
        criticalPrivacyPenalties += 40; // Major penalty for missing privacy policy
      } else {
        componentScores.push({ score: privacyPolicyScore, weight: PRIVACY_COMPONENT_WEIGHTS.privacyPolicyScore });
      }

      // Consent Management - only count positively if detected, no penalty for absence
      // Many US small businesses legitimately don't need consent banners (GDPR/CCPA may not apply)
      const consentBannerDetected = getNestedProperty(moduleData, 'consentManagement.bannerDetected', false);
      const consentScore = getNestedProperty(moduleData, 'consentManagement.score', 0);
      if (consentBannerDetected && consentScore > 0) {
        componentScores.push({ score: consentScore, weight: PRIVACY_COMPONENT_WEIGHTS.consentManagementScore });
      }

      // Other privacy components (only add if they exist and have valid scores)
      if (getNestedProperty(moduleData, 'cookies.overallCookieScore')) {
        componentScores.push({ score: moduleData.cookies.overallCookieScore, weight: PRIVACY_COMPONENT_WEIGHTS.cookiesOverallScore });
      }

      if (getNestedProperty(moduleData, 'dataLayer.score')) {
        componentScores.push({ score: moduleData.dataLayer.score, weight: PRIVACY_COMPONENT_WEIGHTS.dataLayerScore });
      }

      if (getNestedProperty(moduleData, 'dataSharingPractices.score')) {
        componentScores.push({ score: moduleData.dataSharingPractices.score, weight: PRIVACY_COMPONENT_WEIGHTS.dataSharingPracticesScore });
      }

      if (getNestedProperty(moduleData, 'gdprCompliance.score')) { componentScores.push({ score: moduleData.gdprCompliance.score, weight: PRIVACY_COMPONENT_WEIGHTS.gdprComplianceScore }); }
      if (getNestedProperty(moduleData, 'ccpaCompliance.score')) { componentScores.push({ score: moduleData.ccpaCompliance.score, weight: PRIVACY_COMPONENT_WEIGHTS.ccpaComplianceScore }); }

      // Calculate base score from available components
      const baseScore = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 50;

      // Apply critical privacy penalties
      // CRITICAL FIX: Ensure minimum score of 5 if analysis ran, to distinguish from system failure (0/1)
      score = Math.max(5, baseScore - criticalPrivacyPenalties);

      // If both critical features are missing, cap the score very low
      if (!privacyPolicyFound && !consentBannerDetected) {
        score = Math.min(score, 25); // Maximum 25 points if both critical features missing
      }

      break;

    case 'compatibility':
      const browserScores = [];
      if (moduleData.browserCompatibility && typeof moduleData.browserCompatibility === 'object') {
        Object.values(moduleData.browserCompatibility).forEach(bs => {
          if (bs && typeof bs.score === 'number') { browserScores.push({ score: bs.score, weight: 1 }); }
        });
      }
      if (browserScores.length > 0) { componentScores.push({ score: calculateWeightedAverage(browserScores), weight: COMPATIBILITY_COMPONENT_WEIGHTS.browserCompatibilityAverage }); }

      const deviceScores = [];
      if (moduleData.deviceCompatibility && typeof moduleData.deviceCompatibility === 'object') {
        Object.values(moduleData.deviceCompatibility).forEach(ds => {
          if (ds && typeof ds.score === 'number') { deviceScores.push({ score: ds.score, weight: 1 }); }
        });
      }
      if (deviceScores.length > 0) { componentScores.push({ score: calculateWeightedAverage(deviceScores), weight: COMPATIBILITY_COMPONENT_WEIGHTS.deviceCompatibilityAverage }); }

      if (getNestedProperty(moduleData, 'osCompatibility.overallOsScore')) { componentScores.push({ score: moduleData.osCompatibility.overallOsScore, weight: COMPATIBILITY_COMPONENT_WEIGHTS.osCompatibilityOverallScore }); }
      if (getNestedProperty(moduleData, 'featureSupport.score')) { componentScores.push({ score: moduleData.featureSupport.score, weight: COMPATIBILITY_COMPONENT_WEIGHTS.featureSupportScore }); }
      if (getNestedProperty(moduleData, 'responsiveDesignScore')) { componentScores.push({ score: moduleData.responsiveDesignScore, weight: COMPATIBILITY_COMPONENT_WEIGHTS.responsiveDesignScore }); }
      score = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 40;
      break;

    case 'marketing':
      if (getNestedProperty(moduleData, 'brandConsistency.score')) { componentScores.push({ score: moduleData.brandConsistency.score, weight: MARKETING_COMPONENT_WEIGHTS.brandConsistencyScore }); }
      if (getNestedProperty(moduleData, 'ctaAnalysis.score')) { componentScores.push({ score: moduleData.ctaAnalysis.score, weight: MARKETING_COMPONENT_WEIGHTS.ctaAnalysisScore }); }
      if (getNestedProperty(moduleData, 'socialMediaIntegration.score')) { componentScores.push({ score: moduleData.socialMediaIntegration.score, weight: MARKETING_COMPONENT_WEIGHTS.socialMediaIntegrationScore }); }
      if (getNestedProperty(moduleData, 'valueProposition.score')) { componentScores.push({ score: moduleData.valueProposition.score, weight: MARKETING_COMPONENT_WEIGHTS.valuePropositionScore }); }
      if (getNestedProperty(moduleData, 'targetAudienceAlignment.score')) { componentScores.push({ score: moduleData.targetAudienceAlignment.score, weight: MARKETING_COMPONENT_WEIGHTS.targetAudienceAlignmentScore }); }
      if (getNestedProperty(moduleData, 'analyticsIntegration.score')) { componentScores.push({ score: moduleData.analyticsIntegration.score, weight: MARKETING_COMPONENT_WEIGHTS.analyticsIntegrationScore }); }
      if (getNestedProperty(moduleData, 'competitiveAnalysis.score')) { componentScores.push({ score: moduleData.competitiveAnalysis.score, weight: MARKETING_COMPONENT_WEIGHTS.competitiveAnalysisScore }); }
      if (getNestedProperty(moduleData, 'contentMarketingEffectiveness.score')) { componentScores.push({ score: moduleData.contentMarketingEffectiveness.score, weight: MARKETING_COMPONENT_WEIGHTS.contentMarketingEffectivenessScore }); }
      if (getNestedProperty(moduleData, 'emailMarketingIntegration.score')) { componentScores.push({ score: moduleData.emailMarketingIntegration.score, weight: MARKETING_COMPONENT_WEIGHTS.emailMarketingIntegrationScore }); }
      score = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 40;
      break;

    case 'conversion':
      // Select weights based on industry context
      const industryContext = context.industryContext || {};
      const primaryIndustry = (industryContext.primaryIndustry || '').toLowerCase();
      const isServiceBusiness = SERVICE_BUSINESS_INDUSTRIES.some(ind => primaryIndustry.includes(ind));
      const convWeights = isServiceBusiness ? SERVICE_BUSINESS_CONVERSION_WEIGHTS : CONVERSION_COMPONENT_WEIGHTS;

      if (getNestedProperty(moduleData, 'funnelAnalysis.score')) { componentScores.push({ score: moduleData.funnelAnalysis.score, weight: convWeights.funnelAnalysisScore }); }
      if (getNestedProperty(moduleData, 'forms.overallFormEffectivenessScore')) { componentScores.push({ score: moduleData.forms.overallFormEffectivenessScore, weight: convWeights.formAnalysisOverallScore }); }
      if (getNestedProperty(moduleData, 'trustSignalsAnalysis.effectivenessScore')) { componentScores.push({ score: moduleData.trustSignalsAnalysis.effectivenessScore, weight: convWeights.trustSignalsScore }); }
      if (getNestedProperty(moduleData, 'userExperience.score')) { componentScores.push({ score: moduleData.userExperience.score, weight: convWeights.userExperienceScore }); }
      // All conversion components (no tier gates)
      if (getNestedProperty(moduleData, 'checkoutProcess.score')) { componentScores.push({ score: moduleData.checkoutProcess.score, weight: convWeights.checkoutProcessScore }); }
      const lpScores = (getNestedProperty(moduleData, 'landingPageEffectiveness.items') || [])
        .map(lp => lp.overallScore)
        .filter(s => typeof s === 'number');
      if (lpScores.length > 0) {
        const avgLpScore = lpScores.reduce((a, b) => a + b, 0) / lpScores.length;
        componentScores.push({ score: avgLpScore, weight: convWeights.landingPageEffectivenessScore });
      }

      // GOLD-STANDARD: Add evidence-based CTA quality score
      if (moduleData.ctaQualityEvidence?.overallScore) {
        componentScores.push({ score: moduleData.ctaQualityEvidence.overallScore, weight: 0.10 });
      }

      score = componentScores.length > 0 ? calculateWeightedAverage(componentScores) : 40;
      break;

    default:
      // Fallback for unknown or very simple modules: just use their direct .score if present
      if (typeof moduleData.score === 'number') { score = moduleData.score; }
      else { // Attempt to average any sub-scores found
        const subScores = Object.values(moduleData)
          .filter(val => typeof val === 'object' && val !== null && typeof val.score === 'number')
          .map(val => ({ score: val.score, weight: 1 })); // Equal weight for unknown structure
        score = subScores.length > 0 ? calculateWeightedAverage(subScores) : 65; // Reasonable default for simple sites
      }
      break;
  }

  // --- Compose deterministic base with AI-derived score ---
  const aiScore = Math.max(0, Math.min(100, Math.round(score)));
  const detBase = calculateDeterministicBaseScore(moduleName, moduleData._collectedSignals);
  const composed = composeDeterministicAndAiScore(moduleName, detBase, aiScore);

  // Attach scoring transparency metadata to moduleData (non-enumerable to avoid schema conflicts)
  try {
    Object.defineProperty(moduleData, '_scoreMetrics', {
      value: composed,
      writable: true,
      enumerable: false,
      configurable: true
    });
  } catch (e) { /* readonly object, skip */ }

  return composed.score;
}

function calculateOverallReportScore(moduleStatusArray, moduleWeights = {}) {
  if (!Array.isArray(moduleStatusArray) || moduleStatusArray.length === 0) { return 0; }

  // CRITICAL FIX: Include both "Success" and "Partial" status modules in overall score calculation
  // "Partial" means analysis ran but had some technical issues - the score is still valid
  const validModuleScores = moduleStatusArray
    .filter(ms => (ms.status === "Success" || ms.status === "Partial") && typeof ms.score === 'number' && !isNaN(ms.score))
    .map(ms => ({ score: ms.score, weight: moduleWeights[ms.moduleName] || getModuleWeight(ms.moduleName) }));

  // If no valid module scores, return very low score to indicate analysis problems
  if (validModuleScores.length === 0) {
    // Check if there are any modules that ran at all
    const anyModulesRan = moduleStatusArray.some(ms =>
      ms.status === "Success" || ms.status === "Partial" || ms.status === "Failed"
    );
    return anyModulesRan ? 5 : 0; // 5 if modules attempted but failed, 0 if no modules ran
  }

  return calculateWeightedAverage(validModuleScores);
}

function getModuleWeight(moduleName) {
  // Default weights if not provided externally
  const weights = {
    ui: 0.17, performance: 0.14, security: 0.11, accessibility: 0.11,
    seoContent: 0.14, privacy: 0.07, conversion: 0.09, marketing: 0.05,
    compatibility: 0.04, siteHealth: 0.08,
  };
  return weights[moduleName.toLowerCase()] || 0.03; // Default small weight for unknown/other modules
}

module.exports = {
  calculateThresholdScore, calculateWeightedAverage, applyPenalties, getRatingLabelForScore,
  scorePerformanceMetric, calculatePerformanceMetricsScore, calculateSslTlsScore,
  calculateSecurityHeadersScore, calculateUiCategoryScore, calculateUiViewportScore,
  calculateModuleSummaryScore, calculateOverallReportScore,
  calculateDeterministicBaseScore, composeDeterministicAndAiScore,
  DETERMINISTIC_WEIGHTS,
};
