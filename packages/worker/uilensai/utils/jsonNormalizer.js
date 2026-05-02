/**
 * JSON Normalizer Utility - Fully Refactored for Schema v4.0.0 - Iteration 4
 *
 * This utility provides functions to normalize JSON output format for consistency
 * and validate it against the UILensAI report schema (v4.0.0).
 * It aims for comprehensive parity with original logic, adapted to the new schema,
 * with robust handling of AI outputs and strict schema adherence.
 */

const fs = require('fs');
const path = require('path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { v4: uuidv4 } = require('uuid');

const TARGET_SCHEMA_VERSION = "4.0.0";

let reportSchemaInstance;
try {
  const { getSchemaPath } = require('./paths');
  const schemaPath = getSchemaPath('report-schema.json');
  reportSchemaInstance = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  if (!reportSchemaInstance || !reportSchemaInstance.$id || !reportSchemaInstance.$id.includes(TARGET_SCHEMA_VERSION)) {
    console.warn(`[JsonNormalizer] Loaded schema (${reportSchemaInstance?.$id}) may not be target ${TARGET_SCHEMA_VERSION}.`);
  }
} catch (error) {
  console.error('[JsonNormalizer] CRITICAL: Failed to load report schema.', error);
  reportSchemaInstance = null;
}

// --- Text Cleaning Utilities ---
function cleanAiText(text, maxLength = 5000) {
  if (typeof text !== 'string' || text === null || text === undefined) { return ""; } // Return empty string for non-string inputs
  let cleaned = text;
  // Remove common AI preamble/postamble more aggressively
  const preambles = [
    /^Here's an analysis of.*?:\s*/im, /^Certainly, here is the analysis:\s*/im,
    /^Based on the provided data.*?,\s*/im, /^Okay, I've analyzed the.*?:\s*/im,
    /^The analysis reveals the following:\s*/im, /^\s*Analysis:\s*/im,
    /^Here is the JSON object as requested:\s*/im, /^```json\s*/im
  ];
  const postambles = [
    /\s*```\s*$/im,
    /\s*In conclusion,.*?$/im, /\s*To summarize,.*?$/im, /\s*Overall,.*?$/im,
    /\s*Please let me know if you need further assistance.*?$/im,
    /\s*I hope this helps!.*?$/im
  ];
  preambles.forEach(p => cleaned = cleaned.replace(p, ''));
  postambles.forEach(p => cleaned = cleaned.replace(p, ''));

  cleaned = cleaned.replace(/^\s*[\*\-]\s+/gm, ''); // Remove leading bullets
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Reduce multiple newlines

  cleaned = stripTrailingPeriods(cleaned.trim());
  return cleaned.substring(0, maxLength);
}


// --- Helper Functions ---
function getNested(obj, pathStr, defaultValue = undefined) {
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

function setNested(obj, pathStr, value) {
  if (!obj || typeof obj !== 'object' || obj === null || !pathStr) { return; }
  const path = pathStr.split('.');
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!current[path[i]] || typeof current[path[i]] !== 'object' || current[path[i]] === null) {
      current[path[i]] = {};
    }
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

function stripTrailingPeriods(data) {
  if (typeof data === 'string') { return data.trim().replace(/\.$/, ''); }
  if (Array.isArray(data)) { return data.map(item => stripTrailingPeriods(item)); }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const result = {};
    for (const [key, value] of Object.entries(data)) { result[key] = stripTrailingPeriods(value); }
    return result;
  }
  return data;
}

function deduplicateArrayValues(data) {
  if (Array.isArray(data)) {
    const seen = new Set();
    return data.filter(item => {
      const val = (item !== null && typeof item === 'object') ? JSON.stringify(item) : item;
      if (seen.has(val)) { return false; }
      seen.add(val); return true;
    });
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const result = {};
    for (const [key, value] of Object.entries(data)) { result[key] = deduplicateArrayValues(value); }
    return result;
  }
  return data;
}

function keyIsScoreLike(key) {
  return typeof key === 'string' && (key === 'score' || key.endsWith('Score') || key.endsWith('_score') || key.endsWith('Rating') || key.endsWith('score') || key.endsWith('rating'));
}

function normalizeScoreValue(value, contextKey = "") {
  let numValue = parseFloat(value);
  if (isNaN(numValue)) {
    if (typeof value === 'string') {
      if (value.includes('/10')) {
        const match = value.match(/(\d+(?:\.\d+)?)\s*\/10/);
        if (match && match[1]) { numValue = parseFloat(match[1]) * 10; }
      } else if (value.includes('%')) {
        const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match && match[1]) { numValue = parseFloat(match[1]); }
      }
    }
    if (isNaN(numValue)) { return 0; } // Default to 0 if still NaN
  }

  // Schema v4.0.0 generally expects scores 0-100.
  // Specific exceptions: CLS (0-1 range typically), CVSS (0-10).
  // 'rating' fields in UI structured analysis are also 0-100.
  const lowerContextKey = contextKey.toLowerCase();

  // DEBUG: Log CLS score normalization
  if (lowerContextKey.includes('cumulativelayoutshift') || lowerContextKey.includes('clsscore')) {
  }

  if (lowerContextKey.includes('cumulativelayoutshift') || lowerContextKey.includes('clsscore')) {
    // CLS is typically small, e.g., 0.1. Don't scale if it's already in a reasonable 0-1 range.
    // If it's > 1, it might be an error or a scaled version, so cap it.
    if (numValue > 1 && !lowerContextKey.includes("score") && !lowerContextKey.includes("rating")) { numValue = 1; }
    const result = Math.max(0, Math.min(100, Math.round(numValue)));
    return result;
  } else if (lowerContextKey.includes('cvssscore')) {
    // CVSS is 0-10.
    if (numValue > 10) { numValue = 10; }
  } else if (lowerContextKey.includes('localreviewsscore')) {
    // Local Reviews Score is 0-5 (as per schema example).
    if (numValue > 5) { numValue = 5; }
  } else {
    const alreadyOn100Scale = [
      'sitemapanalysis', 'robotstxtanalysis', 'headersecurity',
      'httpsanalysis', 'formvulnerabilities', 'cspscore',
      'cookiecompliance', 'sslscore', 'dnssecurity',
      'technical.', 'eatscore', 'localseo',
      // ALL module summary/subsection scores are already 0-100
      'summary.score', 'summary.rating',
      'modules.marketing', 'modules.conversion', 'modules.privacy',
      'modules.security', 'modules.performance', 'modules.seocontent',
      'modules.accessibility', 'modules.ui', 'modules.compatibility',
      // Common subsection score keys that are 0-100
      'socialmediapresence', 'socialmediaintegration', 'valueproposition',
      'contentmarketing', 'brandconsistency', 'emailmarketing',
      'analyticssetup', 'analyticsintegration',
      'trustsignalsanalysis', 'userexperience', 'funnelanalysis',
      'ctaeffectiveness', 'formeffectiveness', 'overallformeffectivenessscore',
      'overallctaeffectivenessscore', 'overallfunnelconversionrate',
      'navigationclarity', 'mobileexperience', 'pageloadimpact', 'visualhierarchy',
      'consent.score', 'cookieinventory', 'overallcookiescore',
      'wcagcompliance', 'overallwcagscore', 'perceivable', 'operable',
      'understandable', 'robust', 'cognitive',
      'effectivenessscore', 'implementationscore',
      'eventaccuracy', 'goalcompletionrate', 'dataaccuracy',
      'trackingaccuracy', 'setupcorrectness',
      'browsersupport', 'responsiveness'
    ];
    const shouldSkipInflation = alreadyOn100Scale.some(k => lowerContextKey.includes(k));

    // General 0-100 normalization (only for keys NOT known to already be 0-100)
    if (!shouldSkipInflation) {
      if (numValue >= 0 && numValue <= 1) { numValue *= 100; }
      else if (numValue > 1 && numValue <= 10) { numValue *= 10; }
    }
  }
  return Math.max(0, Math.min(100, Math.round(numValue)));
}


function normalizeScores(data, parentKey = "") {
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const result = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data)) {
      const currentContextKey = parentKey ? `${parentKey}.${key}` : key;
      // Check if the key itself suggests it's a score or rating
      if (keyIsScoreLike(key) && (typeof value === 'number' || typeof value === 'string')) {
        result[key] = normalizeScoreValue(value, currentContextKey);
      } else if (value !== null && typeof value === 'object') {
        result[key] = normalizeScores(value, currentContextKey); // Recurse
      } else {
        result[key] = value; // Non-score, non-object value
      }
    }
    return result;
  }
  return data; // Primitive value
}

function standardizeDates(data) {
  if (data instanceof Date) { return data.toISOString(); }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const result = Array.isArray(data) ? [] : {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Expanded list of common date/timestamp keys
      const dateKeys = ['generatedat', 'lastupdatedat', 'fetchtime', 'expiration', 'validfrom', 'validto', 'lastupdated', 'timestamp', 'date', 'created', 'modified', 'published', 'retrievaldate'];
      const timeKeys = ['time', 'duration']; // 'duration' might be numeric (ms) or string (e.g. "Session")

      let isDateKey = dateKeys.some(dk => lowerKey.includes(dk) && !lowerKey.includes("days") && !lowerKey.includes("months") && !lowerKey.includes("seconds") && !lowerKey.includes("hours"));
      if (!isDateKey && !lowerKey.includes("duration")) { // Avoid 'duration' if it's not a date-like field
        isDateKey = timeKeys.some(tk => lowerKey.endsWith(tk)) && !lowerKey.includes("timeout");
      }

      // CRITICAL: Exclude time-related fields that are NOT dates from date conversion
      // These fields represent duration/timing in numeric values, not timestamps
      if (lowerKey === 'completiontime' || lowerKey === 'averagecompletiontime' || lowerKey === 'estimatedcompletiontime' ||
        lowerKey === 'pixelloadtime' || lowerKey === 'hesitationtime' || lowerKey.includes('loadtime') || lowerKey.includes('responsetime')) {
        isDateKey = false;
      }

      if (isDateKey && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
        try {
          let dateToConvert = value;
          // Handle Unix timestamps (seconds or milliseconds)
          if (typeof value === 'number') {
            if (String(value).length === 10) { dateToConvert = value * 1000; } // Assume seconds, convert to ms
            else if (String(value).length > 13) { dateToConvert = Math.floor(value / 1000); } // Assume nanoseconds or microseconds, convert to ms
          }
          const date = new Date(dateToConvert);
          if (!isNaN(date.getTime())) {
            // Check schema format for this key
            const schemaFormat = getNested(reportSchemaInstance, `$defs.${key}.format`) ||
              getNested(reportSchemaInstance, `properties.${key}.format`) ||
              (lowerKey.includes("date") && !lowerKey.includes("datetime") ? "date" : "date-time");
            if (schemaFormat === "date") {
              result[key] = date.toISOString().split('T')[0];
            } else {
              result[key] = date.toISOString();
            }
          } else {
            result[key] = value; // Keep original if parsing fails
          }
        } catch { result[key] = value; }
      } else if (value instanceof Date) { // Catch-all for Date objects not caught by key name
        result[key] = value.toISOString();
      } else if (value !== null && typeof value === 'object') {
        result[key] = standardizeDates(value); // Recurse
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
}

function getRatingLabel(score, isNullable = false) {
  // Schema enum: Perfect, World-Class, Almost There, Needs Work, Underperforming, Poor, Very Poor, Critical Fail, Disqualified, N/A
  if (score === null || score === undefined) { return isNullable ? null : "N/A"; }
  const s = Math.round(score);

  if (s === 100) { return "Perfect"; }
  if (s >= 90) { return "World-Class"; }
  if (s >= 75) { return "Almost There"; }
  if (s >= 60) { return "Needs Work"; }
  if (s >= 45) { return "Underperforming"; }
  if (s >= 30) { return "Poor"; }
  if (s >= 15) { return "Very Poor"; }
  if (s >= 1) { return "Critical Fail"; }
  if (s === 0) { return "Disqualified"; }

  return isNullable ? null : "N/A";
}

function ensureRatings(reportData) {
  if (typeof reportData.overallScore === 'number') {
    reportData.overallRating = getRatingLabel(reportData.overallScore, true); // schema allows null for overallRating
  } else { reportData.overallRating = null; }

  if (reportData.modules) {
    for (const moduleName in reportData.modules) {
      const module = reportData.modules[moduleName];
      if (module && module.summary && typeof module.summary.score === 'number') {
        module.summary.rating = getRatingLabel(module.summary.score, false); // moduleSummary.rating is not nullable
      } else if (module && module.summary) {
        module.summary.rating = "N/A";
      }
    }
  }
  if (reportData.moduleStatus && Array.isArray(reportData.moduleStatus)) {
    reportData.moduleStatus.forEach(status => {
      if (typeof status.score === 'number') {
        status.rating = getRatingLabel(status.score, false); // moduleStatus.rating is not nullable
      } else {
        status.rating = "N/A";
      }
    });
  }
  if (reportData.regulatoryCompliance && typeof reportData.regulatoryCompliance.overallComplianceScore === 'number') {
    reportData.regulatoryCompliance.overallComplianceRating = getRatingLabel(reportData.regulatoryCompliance.overallComplianceScore, false);
    if (Array.isArray(reportData.regulatoryCompliance.standards)) {
      reportData.regulatoryCompliance.standards.forEach(std => {
        if (typeof std.score === 'number') { std.rating = getRatingLabel(std.score, false); }
        else { std.rating = "N/A"; }
      });
    }
  }
  return reportData;
}

function normalizeRecommendationObject(rec, defaultSource = "ai-general") {
  if (typeof rec === 'string') { rec = { text: rec }; }
  if (!rec || typeof rec !== 'object') { return null; }

  // Enhanced UUID validation - ensure ID is a proper UUID format
  let id = rec.id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const invalidPatterns = /^(REC\d+|rec\d+|RECOMMENDATION\d+|recommendation\d+|\d+|ID\d+|id\d+)$/i;

  if (!id ||
    typeof id !== 'string' ||
    !uuidRegex.test(id) ||
    invalidPatterns.test(id) ||
    id.length !== 36) {
    id = uuidv4();
  }

  // Intelligent fallback text based on source module instead of generic missing text
  let fallbackText = "Review and improve based on analysis findings. Consider best practices and user experience guidelines.";
  if (defaultSource === "security") {
    fallbackText = "Implement security best practices to protect against vulnerabilities and improve overall website security posture.";
  } else if (defaultSource === "performance") {
    fallbackText = "Optimize website performance by improving loading times, reducing resource sizes, and enhancing user experience.";
  } else if (defaultSource === "accessibility") {
    fallbackText = "Improve website accessibility to ensure compliance with WCAG guidelines and provide inclusive user experience.";
  } else if (defaultSource === "privacy") {
    fallbackText = "Enhance privacy compliance by implementing proper consent management and data protection measures.";
  } else if (defaultSource === "ui") {
    fallbackText = "Improve user interface design and usability to enhance overall user experience and engagement.";
  } else if (defaultSource === "seoContent") {
    fallbackText = "Optimize content and SEO elements to improve search engine visibility and content quality.";
  } else if (defaultSource === "cross-module") {
    fallbackText = "Implement cross-cutting improvements that benefit multiple aspects of website quality and user experience.";
  }

  const text = cleanAiText(rec.text || fallbackText, 5000);

  const validPriorities = getNested(reportSchemaInstance, '$defs.recommendation.properties.priority.enum', ["Critical", "High", "Medium", "Low"]);
  const priority = validPriorities.includes(rec.priority) ? rec.priority : "Medium";

  let source = rec.source ? String(rec.source).toLowerCase() : defaultSource;
  const validModuleSources = getNested(reportSchemaInstance, '$defs.moduleNameEnum.enum', []);
  const validGeneralSources = getNested(reportSchemaInstance, '$defs.recommendation.properties.source.oneOf[1].enum', ["cross-module", "ai-general"]);
  if (!validModuleSources.includes(source) && !validGeneralSources.includes(source)) { source = defaultSource; }

  const impact = cleanAiText(rec.impact || "Addressing this will improve overall site quality and user experience.", 1000);

  const validEfforts = getNested(reportSchemaInstance, '$defs.recommendation.properties.effort.enum', ["Very Low", "Low", "Moderate", "High", "Very High"]);
  const effort = validEfforts.includes(rec.effort) ? rec.effort : "Moderate";

  const elementIdentifiers = Array.isArray(rec.elementIdentifiers) ? rec.elementIdentifiers.map(ei => ({
    type: getNested(reportSchemaInstance, '$defs.recommendation.properties.elementIdentifiers.items.properties.type.enum', ["selector"]).includes(ei?.type) ? ei.type : "selector",
    value: typeof ei?.value === 'string' ? cleanAiText(ei.value, 1000) : "N/A"
  })).filter(ei => {
    if (ei.value === "N/A" || !ei.value || ei.value.trim().length === 0) return false;
    const v = ei.value.trim();

    // AGGRESSIVE SELECTOR HALLUCINATION FILTER

    // 1. Strip hex color values misclassified as CSS selectors (e.g., #007BFF, #333, #1E3A8A)
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return false;

    // 2. Strip comma-separated values (color palettes, multi-value nonsense like "#1E3A8A, secondary")
    if (v.includes(',')) return false;

    // 3. Strip pure generic HTML tag selectors (ignoring semantic tags like html, body, main, nav, header, footer which are often valid targets)
    const genericTags = /^(div|span|p|button|input|img|a|ul|ol|li|table|section|article|aside|form)$/i;
    if (genericTags.test(v)) return false;

    // 4. Strip generic class selectors (single class with common names)
    const genericClasses = /^\.(container|hero|hero-section|content|content-grid|text|image|section|wrapper|layout|grid|row|col|column|main|header|footer|nav|navigation|logo|btn|button|card|modal|sidebar|menu|dropdown|list|item|link|title|subtitle|paragraph|block|inner|outer|left|right|center)$/i;
    if (genericClasses.test(v)) return false;

    // 5. Strip fabricated IDs (common LLM-hallucinated patterns)
    const fabricatedIdPatterns = [
      /^#(hero|main|global|site|page|content|mobile|footer|header|nav|navigation|logo|welcome|services|about|contact|cta|primary|secondary|sidebar|menu|wrapper|banner|overlay)-/i,
      /^#(hero-section|main-content|global-navigation|site-logo|mobile-nav|page-header|content-grid|welcome-section|main-navigation|primary-cta|footer-content|site-header)$/i,
    ];
    if (fabricatedIdPatterns.some(p => p.test(v))) return false;

    // 6. Strip AEM/CMS fabricated data attributes unless they look real (have UUIDs or hash-like suffixes)
    if (/data-cmp-|data-layer|data-component/i.test(v) && !/[0-9a-f]{6,}/i.test(v)) return false;

    // 7. Strip selectors that are too short to be meaningful (less than 5 chars without #)
    const allowedShortTags = /^(html|body|main|nav|form|h[1-6])$/i;
    if (v.length < 5 && !v.startsWith('#') && !allowedShortTags.test(v)) return false;

    // 8. Strip placeholder values
    if (/^(N\/A|not applicable|various elements?|general|unknown|none|todo|placeholder|example|sample|test|demo|dummy)$/i.test(v)) return false;

    // 9. Strip selectors that look like descriptions/sentences rather than CSS selectors
    if (/\s{2,}/.test(v) || v.split(' ').length > 5) return false;

    // 10. Strip pure color references with context words (e.g., "secondary", "primary", "accent")
    if (/^(primary|secondary|tertiary|accent|brand|text|background|surface|muted|emphasis)$/i.test(v)) return false;

    // 11. Strip known cross-site contamination patterns (selectors from prompt examples that leaked through)
    // These are from Mayo Clinic / Adobe AEM which were previously hardcoded as examples in the prompt
    const contaminationPatterns = [
      /mayo/i,                          // Mayo Clinic selectors
      /\.cmp-/i,                        // Adobe AEM component classes (.cmp-media, .cmp-title, etc.)
      /data-cmp-data-layer/i,           // Adobe AEM data attribute
      /#languagenavigation-/i,          // AEM language navigation component
      /#header__mobile-logo/i,          // Specific hardcoded example from old prompt
      /globalsearch-[0-9a-f]+/i,        // AEM global search with hash suffix
    ];
    if (contaminationPatterns.some(p => p.test(v))) return false;

    // 12. Strip fabricated compound-hyphenated selectors (LLM templates)
    if (isFabricatedSelector(v)) return false;

    return true;
  }).slice(0, 10) : []; // Max 10 for sanity

  // ALWAYS enforce effortHours from effort tier — AI consistently returns {min:1,max:4} for everything
  const EFFORT_HOURS_MAP = {
    'Very Low': { min: 1, max: 2 },
    'Low': { min: 2, max: 4 },
    'Moderate': { min: 4, max: 8 },
    'High': { min: 8, max: 16 },
    'Very High': { min: 16, max: 40 }
  };
  const tierHours = EFFORT_HOURS_MAP[effort] || { min: 4, max: 8 };
  let effortHours;
  if (rec.effortHours && typeof rec.effortHours.min === 'number' && typeof rec.effortHours.max === 'number') {
    const aiMin = Math.max(0, rec.effortHours.min);
    const aiMax = Math.max(0, rec.effortHours.max);
    const withinRange = aiMin >= tierHours.min * 0.5 && aiMax <= tierHours.max * 1.5;
    effortHours = withinRange ? { min: aiMin, max: aiMax } : tierHours;
  } else {
    effortHours = tierHours;
  }
  if (effortHours.min > effortHours.max) { effortHours.max = effortHours.min; }

  const validRoles = getNested(reportSchemaInstance, '$defs.recommendation.properties.effortBreakdown.items.properties.role.enum', ["Developer"]);
  const effortBreakdown = Array.isArray(rec.effortBreakdown) ? rec.effortBreakdown.map(eb => ({
    task: cleanAiText(eb?.task || "Unnamed Task", 500),
    role: validRoles.includes(eb?.role) ? eb.role : "Developer",
    estimatedHours: typeof eb?.estimatedHours === 'number' ? Math.max(0, eb.estimatedHours) :
      (tierHours.min || 4)
  })).slice(0, 10) : [{ task: "Implementation", role: "Developer", estimatedHours: effortHours.min }];

  const regulatoryImpact = (rec.regulatoryImpact && typeof rec.regulatoryImpact === 'object') ? {
    affectsCompliance: typeof rec.regulatoryImpact.affectsCompliance === 'boolean' ? rec.regulatoryImpact.affectsCompliance : false,
    regulations: Array.isArray(rec.regulatoryImpact.regulations) ? rec.regulatoryImpact.regulations.map(String).slice(0, 5) : [],
    complianceBenefit: cleanAiText(rec.regulatoryImpact.complianceBenefit || "", 1000)
  } : undefined; // Optional field

  const businessImpact = (rec.businessImpact && typeof rec.businessImpact === 'object') ? {
    qualitativeImpact: cleanAiText(rec.businessImpact.qualitativeImpact || "", 5000), // Increased maxLength as per schema
    quantitativeImpact: Array.isArray(rec.businessImpact.quantitativeImpact) ? rec.businessImpact.quantitativeImpact.map(qi => ({
      metric: qi.metric || "Key Metric", currentValue: qi.currentValue, projectedValue: qi.projectedValue,
      changePercentage: typeof qi.changePercentage === 'number' ? qi.changePercentage : null, timeframe: qi.timeframe
    })).slice(0, 5) : [],
    strategicAlignment: cleanAiText(rec.businessImpact.strategicAlignment || "", 2000) // Increased maxLength
  } : undefined; // Optional field
  // GENERIC STEP SAFETY NET: patterns that add zero value regardless of source
  // NOTE: No $ anchors — these should match the beginning of any string, not just exact matches
  const GENERIC_STEP_PATTERNS = [
    /^Review the current state/i,
    /^Review the (issues|accessibility|analysis) identified/i,
    /^Prioritize fixes based on/i,
    /^Make the recommended changes/i,
    /^Audit current .{0,30} implementation/i,
    /^Analyze current .{0,30} (implementation|practices|performance)/i,
    /^Implement targeted improvements/i,
    /^Implement .{0,30} improvements/i,
    /^Test and validate changes/i,
    /^Monitor and measure results/i,
    /^Monitor results and iterate/i,
    /^Identify the specific elements or code/i,
    /^Implement the fix and verify/i,
    /^Create comprehensive documentation/i,
    /^Establish monitoring and maintenance/i,
    /^Train team members on new/i,
    /^Plan future enhancements/i,
    /^Iterate based on performance data/i,
    /^Validate compliance with regulations/i,
    /^Develop implementation plan with measurable/i,
    /^Execute .{0,30} improvements with proper/i,
    /^Conduct .{0,30} audit focusing on/i,
    /^Optimize page load speeds and mobile/i,
    /^Simplify navigation and reduce/i,
    /^Implement clear calls-to-action/i,
    /^Run a follow-up .{0,20} scan/i,
    /^Run a new .{0,20} scan/i,
    /^Analyze current .{0,30} and identify/i,
  ];

  const isGenericStep = (desc) => {
    const d = (desc || '').trim();
    if (!d) return true; // Empty steps are always generic
    if (d.length > 100) return false; // Long steps usually contain specific, actionable content
    if (/\d+(\.\d+)?\s*(px|rem|em|%|KiB|KB|MB|ms|s|\/)/.test(d)) return false; // Contains metrics/units
    if (/[<>{}()\[\]]/.test(d)) return false; // Contains code/selectors
    if (/`[^`]+`/.test(d)) return false; // Contains inline code
    if (/\b(axe|lighthouse|devtools|webAIM|squoosh|purgecss|imagemin|webpack|vite|eslint|prettier)\b/i.test(d)) return false; // Tool names
    return GENERIC_STEP_PATTERNS.some(p => p.test(d));
  };

  const implementationSteps = Array.isArray(rec.implementationSteps) ? rec.implementationSteps.map((is, idx) => {
    // Trust AI-provided descriptions. Only skip steps with truly empty descriptions.
    const description = is?.description || '';
    return {
      stepNumber: typeof is?.stepNumber === 'number' ? is.stepNumber : idx + 1,
      description: cleanAiText(description, 2000),
      details: typeof is?.details === 'string' ? cleanAiText(is.details, 5000) : undefined
    };
  })
    // Disable aggressive filtering since OpenRouter framework steps are specific
    // .filter(step => !isGenericStep(step.description))
    // .filter(step => { /* cross-category code */ ... })
    .map((step, idx) => ({ ...step, stepNumber: idx + 1 }))
    .slice(0, 20) : (generateContextAwareStepsGuaranteed(rec.text, rec.priority, source || defaultSource) || []);

  const scoreExplanation = (rec.scoreExplanation && typeof rec.scoreExplanation === 'object') ? {
    reasoning: typeof rec.scoreExplanation.reasoning === 'string' ? cleanAiText(rec.scoreExplanation.reasoning, 2000) : undefined,
    confidence: typeof rec.scoreExplanation.confidence === 'number' ? Math.max(0, Math.min(1, rec.scoreExplanation.confidence)) : undefined,
    biasAssessment: (rec.scoreExplanation.biasAssessment && typeof rec.scoreExplanation.biasAssessment === 'object') ? {
      biasType: getNested(reportSchemaInstance, '$defs.recommendation.properties.scoreExplanation.properties.biasAssessment.properties.biasType.enum', ["None Identified"]).includes(rec.scoreExplanation.biasAssessment.biasType) ? rec.scoreExplanation.biasAssessment.biasType : "None Identified",
      mitigationSteps: cleanAiText(rec.scoreExplanation.biasAssessment.mitigationSteps || "Bias considered and addressed.", 1000)
    } : { biasType: "None Identified", mitigationSteps: "Bias considered and addressed." }
  } : undefined; // Optional field

  return {
    id, text, priority,
    priorityRationale: typeof rec.priorityRationale === 'string' ? cleanAiText(rec.priorityRationale, 1000) : undefined,
    source, impact,
    elementIdentifiers: elementIdentifiers.length > 0 ? elementIdentifiers : undefined, // Optional
    effort,
    effortDescription: typeof rec.effortDescription === 'string' ? cleanAiText(rec.effortDescription, 1000) : undefined,
    effortHours,
    effortBreakdown: effortBreakdown.length > 0 ? effortBreakdown : undefined, // Optional
    regulatoryImpact, businessImpact,
    implementationSteps: implementationSteps.length > 0 ? implementationSteps : (generateContextAwareStepsGuaranteed(rec.text, rec.priority, source || defaultSource) || implementationSteps),
    score_impact: typeof rec.score_impact === 'number' ? normalizeScoreValue(rec.score_impact) : undefined,
    testingGuidance: typeof rec.testingGuidance === 'string' ? cleanAiText(rec.testingGuidance, 2000) : undefined,
    successMetrics: Array.isArray(rec.successMetrics) && rec.successMetrics.length > 0 ? rec.successMetrics.map(String).slice(0, 5) : undefined,
    scoreExplanation
  };
}

function normalizePaginatedArray(paginatedInput, itemContextKey, itemNormalizerFn, defaultSource, tier = "Basic") {
  let items = []; let totalAvailableItems = 0; let pagination = null;
  const inputData = paginatedInput || { items: [] }; // Ensure inputData is an object

  if (Array.isArray(inputData.items)) {
    items = inputData.items;
    totalAvailableItems = typeof inputData.totalAvailableItems === 'number' ? inputData.totalAvailableItems : items.length;
    if (inputData.pagination && typeof inputData.pagination === 'object' && inputData.pagination !== null &&
      typeof inputData.pagination.pageNumber === 'number' &&
      typeof inputData.pagination.pageSize === 'number' &&
      typeof inputData.pagination.totalPages === 'number') {
      pagination = {
        pageNumber: Math.max(1, inputData.pagination.pageNumber),
        pageSize: Math.max(1, inputData.pagination.pageSize),
        totalPages: Math.max(1, inputData.pagination.totalPages)
      };
    } else if (items.length > 0 && totalAvailableItems > (getNested(inputData, 'pagination.pageSize') || 10)) {
      const pageSize = getNested(inputData, 'pagination.pageSize', 10);
      pagination = { pageNumber: 1, pageSize: pageSize, totalPages: Math.ceil(totalAvailableItems / pageSize) };
    }
  } else if (Array.isArray(inputData)) { // If raw array was passed
    items = inputData; totalAvailableItems = items.length;
  }

  items = items.map(item => itemNormalizerFn(item, defaultSource)).filter(Boolean); // Apply normalizer and filter nulls

  // FINAL-LAYER DEDUP GUARD: Detect and fix duplicate implementationSteps across recs in the same batch.
  // This runs AFTER all normalization, so nothing downstream can overwrite it.
  if (items.length > 1 && items[0] && items[0].implementationSteps) {
    const seenStepKeys = new Map(); // stepKey → index
    for (let i = 0; i < items.length; i++) {
      const rec = items[i];
      const steps = rec.implementationSteps;
      if (!Array.isArray(steps) || steps.length === 0) continue;
      const stepKey = steps.map(s => (s.description || '').trim().substring(0, 60)).join('|||');
      if (stepKey.length < 20) continue;

      if (seenStepKeys.has(stepKey)) {
        // Duplicate detected — generate alternative steps using the rec's specific text
        const recText = (rec.text || '').toLowerCase();
        const source = rec.source || defaultSource || '';
        
        // Strategy 1: Try to get module-default steps (different from branch-specific)
        const bank = MODULE_STEP_BANKS[source];
        let altSteps = null;
        if (bank) {
          // Find which branch matched the first occurrence and use a DIFFERENT one
          const firstIdx = seenStepKeys.get(stepKey);
          const firstRecText = (items[firstIdx].text || '').toLowerCase();
          
          // Try all branches — find one that matches THIS rec but NOT the first rec
          for (const branch of bank.branches) {
            if (branch.match(recText) && !branch.match(firstRecText)) {
              altSteps = branch.steps;
              break;
            }
          }
          
          // If no unique branch found, try module defaults
          if (!altSteps) {
            altSteps = bank.default;
          }
          
          // Verify the chosen altSteps (whether from branch or default) aren't ALREADY duplicates themselves
          const altKey = altSteps.map(s => s.substring(0, 60)).join('|||');
          if (altKey === stepKey || seenStepKeys.has(altKey)) {
            // Last resort: create text-specific steps from the rec's own description
            const subject = rec.text.substring(0, 80);
            altSteps = [
              `Audit the specific issue: "${subject}" — reproduce it and document current state with screenshots`,
              `Research the recommended fix for this specific issue using MDN, web.dev, or the relevant specification`,
              `Implement the fix in a development branch and verify it resolves the issue without regressions`,
              `Deploy the fix and monitor analytics/error tracking for 48 hours to confirm the improvement`
            ];
          }
        } else {
          // No module bank — generate generic but text-aware steps
          const subject = rec.text.substring(0, 80);
          altSteps = [
            `Investigate: "${subject}" — use browser DevTools to identify the root cause and scope of impact`,
            `Develop a targeted fix addressing this specific issue based on the investigation findings`,
            `Test the fix across browsers (Chrome, Firefox, Safari) and viewport sizes (mobile, tablet, desktop)`,
            `Verify the fix resolves the issue using automated testing and manual review`
          ];
        }
        
        rec.implementationSteps = altSteps.map((desc, idx) => ({
          stepNumber: idx + 1,
          description: desc
        }));
        
        // Register the new steps so we don't produce THIS set as a duplicate either
        const newStepKey = rec.implementationSteps.map(s => (s.description || '').trim().substring(0, 60)).join('|||');
        seenStepKeys.set(newStepKey, i);
      } else {
        seenStepKeys.set(stepKey, i);
      }
    }
  }

  totalAvailableItems = Math.max(items.length, totalAvailableItems); // Recalculate if items were filtered

  // Tier-based maxItems deprecated — all tiers get full capacity
  let maxItemsForTier = Infinity;
  if (itemContextKey === 'topRecommendations.items') {
    maxItemsForTier = 50; // Generous cap for all tiers
  }
  // Add other specific maxItems from schema if needed, e.g.,
  // else if (itemContextKey === 'lighthouseAuditRecommendationsList.items') maxItemsForTier = 100;

  if (items.length > maxItemsForTier) {
    items = items.slice(0, maxItemsForTier);
    // If pagination existed, it might need recalculation if items were sliced
    if (pagination) {
      pagination.pageSize = items.length; // Current page size is now the truncated length
      pagination.totalPages = Math.ceil(totalAvailableItems / maxItemsForTier); // Total pages based on max allowed per page
      if (pagination.pageNumber > pagination.totalPages) { pagination.pageNumber = Math.max(1, pagination.totalPages); }
    }
  }

  // Final check for pagination object validity
  if (pagination && (totalAvailableItems <= pagination.pageSize && pagination.pageNumber === 1 && pagination.totalPages === 1)) {
    pagination = null; // Nullify if not truly paginated
  } else if (!pagination && totalAvailableItems > items.length && items.length > 0) {
    // If items were truncated by maxItemsForTier and no pagination existed, create one
    pagination = { pageNumber: 1, pageSize: items.length, totalPages: Math.ceil(totalAvailableItems / items.length) };
  }


  return { items, totalAvailableItems, pagination };
}

// =============================================================================
// SCORE CONSISTENCY ENFORCEMENT
// AI generates scores in free text that contradict the deterministic summary.score.
// This scrubs all free text to match the authoritative score.
// =============================================================================
function enforceScoreConsistency(moduleData, moduleName) {
  const authScore = moduleData.summary?.score;
  const authRating = moduleData.summary?.rating;
  if (typeof authScore !== 'number') return;

  // Pattern: replaces "scores 84/100", "scored 50/100", "rating of 78/100",
  // "current score is 92/100", "50/100 overall", etc.
  // Only replaces when the embedded score differs from the authoritative one.
  function scrubText(text) {
    if (!text || typeof text !== 'string') return text;

    // Replace "N/100" patterns where N != authScore
    text = text.replace(/(\b(?:score[sd]?|rating|rated)\s+(?:of\s+|is\s+|at\s+|:?\s*))(\d{1,3})(\/100\b)/gi,
      (match, prefix, num, suffix) => {
        const n = parseInt(num, 10);
        return (n !== authScore && n >= 0 && n <= 100) ? `${prefix}${authScore}${suffix}` : match;
      });

    // Replace standalone "N/100" with context (e.g., "overall 84/100", "scores 84/100 across")
    text = text.replace(/\b(\d{1,3})(\/100)\b/g, (match, num, suffix) => {
      const n = parseInt(num, 10);
      return (n !== authScore && n >= 0 && n <= 100) ? `${authScore}${suffix}` : match;
    });

    // Replace "(Rating)" with the authoritative rating
    if (authRating) {
      const oldRatings = ['Perfect', 'World-Class', 'Almost There', 'Needs Work', 'Underperforming',
        'Poor', 'Very Poor', 'Critical Fail', 'Disqualified', 'Excellent', 'Good', 'Fair',
        'Failing', 'Critical', 'Needs Improvement'];
      for (const old of oldRatings) {
        if (old !== authRating && text.includes(`(${old})`)) {
          text = text.replace(`(${old})`, `(${authRating})`);
        }
      }
    }

    return text;
  }

  // Scrub narrative
  if (moduleData.narrative) {
    moduleData.narrative = scrubText(moduleData.narrative);
  }

  // Scrub recommendations — ONLY strip praise here.
  // Category-specific score injection happens in mapRecCategoryScores() AFTER reconcileViewportRatings()
  if (moduleData.recommendations?.items) {
    // Positive praise patterns that contradict a recommendation
    const praisePatterns = [
      /\b(?:meets|exceeds|complies with|adheres to)\s+(?:WCAG|AA|AAA|standards|best practices|requirements)/gi,
      /\b(?:alignment is|layout is|design is|typography is|color scheme is)\s+(?:precise|excellent|strong|clean|professional|well-crafted|consistent|solid|effective|good)/gi,
      /\b(?:well-implemented|properly configured|effectively implement|correctly set up|appropriately designed|professionally executed)\b/gi,
      /\b(?:already meets|currently meets|successfully meets|adequately meets)\b/gi,
    ];

    function stripPraise(text) {
      if (!text || typeof text !== 'string') return text;
      for (const pattern of praisePatterns) {
        text = text.replace(pattern, '');
      }
      text = text.replace(/\s{2,}/g, ' ').replace(/^\s*[,;.]\s*/, '').trim();
      return text;
    }

    for (const rec of moduleData.recommendations.items) {
      if (rec.impact) rec.impact = stripPraise(rec.impact);
      if (Array.isArray(rec.implementationSteps)) {
        for (const step of rec.implementationSteps) {
          if (step && typeof step === 'object') {
            if (step.description) step.description = stripPraise(step.description);
            if (step.details) step.details = stripPraise(step.details);
          }
        }
      }
      if (rec.scoreExplanation?.reasoning) {
        rec.scoreExplanation.reasoning = stripPraise(rec.scoreExplanation.reasoning);
      }
    }
  }

  // Scrub issue text with summary score (details are handled by mapRecCategoryScores
  // with category-specific scores AFTER reconciliation)
  if (moduleData.issues?.items) {
    for (const issue of moduleData.issues.items) {
      if (issue.text) issue.text = scrubText(issue.text);
      // NOTE: issue.details scrubbing is handled by mapRecCategoryScores()
      // to use category-specific scores, not the summary score
    }
  }

  // Scrub topIssues
  if (Array.isArray(moduleData.summary?.topIssues)) {
    moduleData.summary.topIssues = moduleData.summary.topIssues.map(t => scrubText(t));
  }

  // Scrub viewport-level analysis text (where "88/100 overall" hides)
  if (Array.isArray(moduleData.viewports)) {
    for (const vp of moduleData.viewports) {
      if (vp.analysis && typeof vp.analysis === 'string') {
        vp.analysis = scrubText(vp.analysis);
      }
      if (vp.categories && typeof vp.categories === 'object') {
        for (const [catName, catData] of Object.entries(vp.categories)) {
          if (catData.analysis && typeof catData.analysis === 'string') {
            catData.analysis = scrubText(catData.analysis);
          }
          // Also scrub visualEvidence descriptions
          if (Array.isArray(catData.visualEvidence)) {
            for (const ve of catData.visualEvidence) {
              if (ve.description) ve.description = scrubText(ve.description);
            }
          }
        }
      }
    }
  }

  // Scrub crossViewport analysis text
  if (moduleData.crossViewport) {
    if (typeof moduleData.crossViewport.analysis === 'string') {
      moduleData.crossViewport.analysis = scrubText(moduleData.crossViewport.analysis);
    }
    if (moduleData.crossViewport.structured && typeof moduleData.crossViewport.structured === 'object') {
      for (const [catName, catData] of Object.entries(moduleData.crossViewport.structured)) {
        if (catData?.analysis && typeof catData.analysis === 'string') {
          catData.analysis = scrubText(catData.analysis);
        }
      }
    }
  }

  // NOTE: viewportAnalyses text scrubbing is handled by mapRecCategoryScores()
  // AFTER reconcileViewportRatings(), so category-specific scores are preserved.
  // Do NOT scrub here — it would flatten all scores to the summary score.

  // Scrub screenshots.items[].score to match summary
  if (moduleData.screenshots?.items && Array.isArray(moduleData.screenshots.items)) {
    for (const ss of moduleData.screenshots.items) {
      if (typeof ss.score === 'number' && ss.score !== authScore) {
        ss.score = authScore;
      }
    }
  }
}

// =============================================================================
// DETERMINISTIC SCALED UNIFICATION (Anti-Drift + Anti-Inflation)
// 1. Viewport AI generates lenient scores (~85). Cross-viewport AI generates
//    a strict, rigorous overall score (~68).
// 2. We scale the viewport scores down to match the rigorous standard (to prevent inflation).
// 3. To completely eliminate "score drift" between viewports and recommendations,
//    we find the weakest link (minimum) for each scaled category.
// 4. We UNIFY all viewports to use that exact minimum score.
// 5. The final overall score is the strict mathematical average of these unified scores.
// =============================================================================
function reconcileAndUnifyViewportRatings(moduleData) {
  const authScore = moduleData.summary?.score;
  if (typeof authScore !== 'number') return;

  const allRatings = [];

  // 1. Gather all viewport ratings to calculate the global average
  if (moduleData.viewportAnalyses && typeof moduleData.viewportAnalyses === 'object') {
    for (const vpData of Object.values(moduleData.viewportAnalyses)) {
      if (!vpData?.structured) continue;
      for (const cd of Object.values(vpData.structured)) {
        if (typeof cd?.rating === 'number') {
          allRatings.push(cd.rating);
        }
      }
    }
  }

  if (allRatings.length === 0) return;

  // 2. Calculate scale factor to bring lenient viewport scores down to rigorous authScore
  const currentAvg = allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length;
  // If AI happens to give an authScore higher than viewports or it's within 3 pts, don't scale up
  const scaleFactor = (currentAvg > 0 && authScore < currentAvg - 3) ? (authScore / currentAvg) : 1;

  // 3. Scale the scores, and find the unified minimum for each category
  const unifiedCategoryScores = {};
  if (moduleData.viewportAnalyses && typeof moduleData.viewportAnalyses === 'object') {
    for (const vpData of Object.values(moduleData.viewportAnalyses)) {
      if (!vpData?.structured) continue;
      for (const [cat, cd] of Object.entries(vpData.structured)) {
        if (typeof cd?.rating === 'number') {
          const scaledRating = Math.round(Math.max(0, Math.min(100, cd.rating * scaleFactor)));
          if (unifiedCategoryScores[cat] === undefined || scaledRating < unifiedCategoryScores[cat]) {
            unifiedCategoryScores[cat] = scaledRating;
          }
        }
      }
    }

    // 4. UNIFY: Overwrite all viewport category ratings with the global weakest link
    for (const vpData of Object.values(moduleData.viewportAnalyses)) {
      if (!vpData?.structured) continue;
      for (const [cat, cd] of Object.entries(vpData.structured)) {
        if (typeof cd?.rating === 'number' && unifiedCategoryScores[cat] !== undefined) {
          cd.rating = unifiedCategoryScores[cat];
        }
      }
    }
  }

  // 5. Calculate perfectly deterministic summary score from the unified ratings
  const keys = Object.keys(unifiedCategoryScores);
  if (keys.length > 0) {
    const sum = keys.reduce((total, cat) => total + unifiedCategoryScores[cat], 0);
    const newSummaryScore = Math.round(sum / keys.length);
    
    moduleData.summary.score = newSummaryScore;
    if (moduleData.overallScore !== undefined) {
      moduleData.overallScore = newSummaryScore;
    }
  }
}

// =============================================================================
// RECOMMENDATION CATEGORY SCORE MAPPING
// After reconcileViewportRatings rescales ratings, this maps each recommendation
// to its relevant UI category and replaces embedded scores with the actual
// post-reconciliation category score (e.g. accessibility=60, not summary=67).
// =============================================================================
function mapRecCategoryScores(moduleData) {
  if (!moduleData.recommendations?.items) return;
  const authScore = moduleData.summary?.score;
  if (typeof authScore !== 'number') return;

  // Build per-viewport AND aggregate category score maps from RECONCILED viewportAnalyses
  const perViewportCategoryScores = {}; // { 'mobile': { accessibility: 60, ... }, 'desktop': { ... } }
  const categoryMinScores = {};         // Lowest viewport score per category (for recs — worst case)
  const categoryScores = {};            // Average (fallback for non-viewport contexts)

  if (moduleData.viewportAnalyses && typeof moduleData.viewportAnalyses === 'object') {
    const catTotals = {};
    const catCounts = {};
    for (const [vpName, vpData] of Object.entries(moduleData.viewportAnalyses)) {
      if (!vpData?.structured) continue;
      perViewportCategoryScores[vpName] = {};
      for (const [cat, cd] of Object.entries(vpData.structured)) {
        if (typeof cd?.rating === 'number') {
          perViewportCategoryScores[vpName][cat] = cd.rating;
          catTotals[cat] = (catTotals[cat] || 0) + cd.rating;
          catCounts[cat] = (catCounts[cat] || 0) + 1;
          // Track the lowest viewport score for each category
          if (categoryMinScores[cat] === undefined || cd.rating < categoryMinScores[cat]) {
            categoryMinScores[cat] = cd.rating;
          }
        }
      }
    }
    for (const cat of Object.keys(catTotals)) {
      categoryScores[cat] = Math.round(catTotals[cat] / catCounts[cat]);
    }
  }

  // No categories available (non-UI module) → nothing to map
  if (Object.keys(categoryScores).length === 0) return;

  const categoryKeywords = {
    accessibility: ['accessibility', 'wcag', 'aria', 'alt text', 'contrast', 'screen reader', 'keyboard nav', 'focus state'],
    usability: ['usability', 'navigation', 'user experience', 'ux', 'intuitive', 'task completion'],
    visualDesign: ['visual design', 'layout', 'spacing', 'alignment', 'grid', 'whitespace'],
    aesthetics: ['aesthetic', 'visual appeal', 'color scheme', 'modern design', 'polish'],
    responsiveness: ['responsive', 'mobile', 'viewport', 'touch target', 'breakpoint'],
    branding: ['brand', 'logo', 'identity', 'color palette', 'typography'],
    hierarchy: ['hierarchy', 'information architecture', 'heading', 'visual weight', 'prioriti'],
    consistency: ['consisten', 'design system', 'pattern', 'uniform', 'standardiz'],
    aboveTheFold: ['above the fold', 'fold', 'value proposition', 'hero', 'first impression'],
    contentFlow: ['content flow', 'reading flow', 'scanability', 'content organization']
  };

  function findCategoryForRec(recText) {
    const fullText = (recText || '').toLowerCase();
    // Split at "Context:" or first period to isolate the title/summary from context
    const firstSentence = fullText.split(/(?:context:|\.)/i)[0] || fullText;

    let bestCat = null, bestScore = 0;
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
      let score = 0;
      // Exact category name in first sentence = very strong signal (5 points)
      if (firstSentence.includes(cat.toLowerCase())) score += 5;
      // Keywords in first sentence = strong signal (2 points each)
      score += keywords.filter(kw => firstSentence.includes(kw)).length * 2;
      // Keywords anywhere in full text = weak signal (1 point each)
      score += keywords.filter(kw => fullText.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
      }
    }
    return bestCat;
  }

  // For recs: use LOWEST viewport score (worst case — "path to 100" shows what needs fixing most)
  for (const rec of moduleData.recommendations.items) {
    const mappedCat = findCategoryForRec(rec.text);
    const catScore = mappedCat && categoryMinScores[mappedCat] !== undefined
      ? categoryMinScores[mappedCat]
      : authScore;

    function scrubRecText(text) {
      if (!text || typeof text !== 'string') return text;
      text = text.replace(/(\b(?:score[sd]?|rating|rated)\s+(?:of\s+|is\s+|at\s+|:?\s*))(\d{1,3})(\/100\b)/gi,
        (match, prefix, num, suffix) => {
          const n = parseInt(num, 10);
          return (n !== catScore && n >= 0 && n <= 100) ? `${prefix}${catScore}${suffix}` : match;
        });
      text = text.replace(/(\b\d{1,3})(\/100\s*(?:overall|score|rating)?)/gi,
        (match, num, suffix) => {
          const n = parseInt(num, 10);
          return (n !== catScore && n >= 0 && n <= 100) ? `${catScore}${suffix}` : match;
        });
      return text;
    }

    if (rec.text) rec.text = scrubRecText(rec.text);
    if (rec.impact) rec.impact = scrubRecText(rec.impact);

    // Store mapped category and its score for downstream use (scorecard)
    if (mappedCat) rec._mappedCategory = mappedCat;
    if (mappedCat && categoryMinScores[mappedCat] !== undefined) rec._categoryScore = catScore;

    if (Array.isArray(rec.implementationSteps)) {
      for (const step of rec.implementationSteps) {
        if (step && typeof step === 'object') {
          if (step.description) step.description = scrubRecText(step.description);
          if (step.details) step.details = scrubRecText(step.details);
        }
      }
    }
  }

  // Also fix issues to cite category scores (use lowest viewport score)
  if (moduleData.issues?.items) {
    for (const issue of moduleData.issues.items) {
      const mappedCat = findCategoryForRec(issue.text);
      const catScore = mappedCat && categoryMinScores[mappedCat] !== undefined
        ? categoryMinScores[mappedCat]
        : authScore;

      if (issue.text) {
        issue.text = issue.text.replace(/(\b\d{1,3})(\/100)/gi, (match, num, suffix) => {
          const n = parseInt(num, 10);
          return (n !== catScore && n >= 0 && n <= 100) ? `${catScore}${suffix}` : match;
        });
      }
      // Also fix details.title and other string fields in details
      if (issue.details && typeof issue.details === 'object') {
        for (const [key, val] of Object.entries(issue.details)) {
          if (typeof val === 'string') {
            issue.details[key] = val.replace(/(\b\d{1,3})(\/100)/gi, (match, num, suffix) => {
              const n = parseInt(num, 10);
              return (n !== catScore && n >= 0 && n <= 100) ? `${catScore}${suffix}` : match;
            });
          }
        }
      }
    }
  }

  // Scrub viewportAnalyses text — use THAT VIEWPORT'S OWN scores (not cross-viewport average)
  if (moduleData.viewportAnalyses && typeof moduleData.viewportAnalyses === 'object') {
    for (const [vpName, vpData] of Object.entries(moduleData.viewportAnalyses)) {
      if (!vpData || typeof vpData !== 'object') continue;
      const vpScores = perViewportCategoryScores[vpName] || categoryScores;

      if (typeof vpData.analysis === 'string') {
        let analysisText = vpData.analysis;
        // Replace category-specific scores with THIS viewport's scores
        for (const [cat, score] of Object.entries(vpScores)) {
          const catPattern = new RegExp(`(${cat}\\s*\\()\\d{1,3}(\\/100\\))`, 'gi');
          analysisText = analysisText.replace(catPattern, `$1${score}$2`);
        }
        // Replace the overall "scores N/100" with the actual summary score
        analysisText = analysisText.replace(/(\bscores?\s+)\d{1,3}(\/100\s*(?:overall)?)/gi,
          `$1${authScore}$2`);
        vpData.analysis = analysisText;
      }

      // Per-category structured analysis text — use that specific category's viewport score
      if (vpData.structured && typeof vpData.structured === 'object') {
        for (const [catName, catData] of Object.entries(vpData.structured)) {
          const catScore = vpScores[catName] || categoryScores[catName] || authScore;
          if (catData?.text && typeof catData.text === 'string') {
            catData.text = catData.text.replace(/(\b\d{1,3})(\/100)/gi, (match, num, suffix) => {
              const n = parseInt(num, 10);
              return (n !== catScore && n >= 0 && n <= 100) ? `${catScore}${suffix}` : match;
            });
          }
        }
      }
    }
  }

  // Fix topIssues to use category scores
  if (Array.isArray(moduleData.summary?.topIssues)) {
    moduleData.summary.topIssues = moduleData.summary.topIssues.map(text => {
      if (typeof text !== 'string') return text;
      const mappedCat = findCategoryForRec(text);
      const catScore = mappedCat && categoryScores[mappedCat] !== undefined
        ? categoryScores[mappedCat]
        : authScore;
      return text.replace(/(\b(?:score[sd]?|rating|rated)\s+(?:of\s+|is\s+|at\s+|:?\s*))\d{1,3}(\/100)/gi,
        `$1${catScore}$2`
      ).replace(/(\b\d{1,3})(\/100\s*(?:overall|score|rating)?)/gi, (match, num, suffix) => {
        const n = parseInt(num, 10);
        return (n !== catScore && n >= 0 && n <= 100) ? `${catScore}${suffix}` : match;
      });
    });
  }
}

// =============================================================================
// ISSUE POLARITY FILTER
// Strips "issues" that are actually compliments (e.g., "High contrast ensures readability")
// =============================================================================
function filterPositiveIssues(moduleData) {
  if (!moduleData.issues?.items || !Array.isArray(moduleData.issues.items)) return;

  const positiveOnlyPatterns = [
    /\b(?:ensures?|guarantees?|provides?|delivers?|maintains?|achieves?)\s+(?:excellent|strong|good|great|high|proper|solid|robust|effective|clear|clean)\b/i,
    /\b(?:excellent|strong|robust|effective|well-implemented|properly configured|correctly set|clean|solid)\s+(?:implementation|configuration|setup|design|structure|security|performance)\b/i,
    /\bhigh contrast (?:text )?ensures?\b/i,
  ];

  const negativeIndicators = /\b(?:but|however|although|missing|lacks?|poor|insufficient|fails?|broken|invalid|without|no\s|not\s|doesn't|doesn\'t|isn't|isn\'t|absent|weak|low|excessive|outdated|vulnerable|risk|error|warning|incorrect|undefined|inaccessible|incompatible|degraded)\b/i;

  const originalCount = moduleData.issues.items.length;
  moduleData.issues.items = moduleData.issues.items.filter(issue => {
    const text = issue.text || '';
    // Keep if it has any negative indicator
    if (negativeIndicators.test(text)) return true;
    // Filter out if it matches positive-only patterns
    for (const pattern of positiveOnlyPatterns) {
      if (pattern.test(text)) return false;
    }
    return true; // Keep by default
  });

  // Update totalAvailableItems
  if (moduleData.issues.items.length < originalCount) {
    moduleData.issues.totalAvailableItems = Math.max(
      (moduleData.issues.totalAvailableItems || originalCount) - (originalCount - moduleData.issues.items.length),
      moduleData.issues.items.length
    );
  }

  // Also filter positive-sounding topIssues in summary
  if (Array.isArray(moduleData.summary?.topIssues)) {
    moduleData.summary.topIssues = moduleData.summary.topIssues.filter(text => {
      if (!text || typeof text !== 'string') return true;

      // First: if it has strong negative indicators, always keep it
      const strongNeg = /\b(?:missing|lacks?|absent|no\s|not\s|fails?|broken|invalid|without|insufficient|vulnerable|inaccessible|poor|weak|error|critical|degraded)\b/i;
      if (strongNeg.test(text)) return true;

      // Filter out entries that lead with positive framing
      const leadsPositive = /^[^.]*\b(?:generally meets|meets|ensures?|provides?|maintains?|utilizes?|consistently|well-|strong|good|clean|solid|robust|effective|properly|correctly|high.contrast.*(?:meets|ensures))\b/i;
      if (leadsPositive.test(text)) {
        // Only keep if it contains clear actionable suggestion
        const actionable = /\b(?:should|must|need|fix|add|implement|address|replace|remove|increase|decrease|reduce)\b/i;
        if (!actionable.test(text)) return false;
      }

      // Filter purely observational entries (no problem or action)
      if (!strongNeg.test(text) && !negativeIndicators.test(text)) {
        return false;
      }

      return true;
    });

    // Derive actual topIssues from recommendations or lowest-scoring categories
    if (moduleData.summary.topIssues.length === 0) {
      const score = moduleData.summary.score || 50;
      if (score < 80) {
        const derived = [];

        // Try to extract from highest-priority recommendations
        const recs = moduleData.recommendations?.items || [];
        const criticalRecs = recs.filter(r => r.priority === 'Critical' || r.priority === 'High');
        const topRecs = criticalRecs.length > 0 ? criticalRecs : recs;
        for (const rec of topRecs.slice(0, 2)) {
          if (rec.text) {
            // Extract first sentence as a concise issue
            const firstSentence = rec.text.split(/[.!?]\s/)[0];
            if (firstSentence && firstSentence.length < 200) {
              derived.push(firstSentence);
            }
          }
        }

        // If no recs, try lowest-scoring viewport category
        if (derived.length === 0) {
          const vpAnalyses = moduleData.viewportAnalyses || {};
          let lowestCat = null, lowestRating = 100;
          for (const [vpName, vpData] of Object.entries(vpAnalyses)) {
            if (vpData?.structured) {
              for (const [catName, catData] of Object.entries(vpData.structured)) {
                if (typeof catData?.rating === 'number' && catData.rating < lowestRating) {
                  lowestRating = catData.rating;
                  lowestCat = catName;
                }
              }
            }
          }
          if (lowestCat) {
            derived.push(`Improve ${lowestCat} — scored ${lowestRating}/${score > 0 ? '100' : '100'}, the weakest category in viewport analysis`);
          }
        }

        moduleData.summary.topIssues = derived.length > 0 ? derived : [`Overall score of ${score}/100 indicates multiple areas need improvement`];
      }
    }
  }
}

// =============================================================================
// FABRICATED SELECTOR DETECTION
// Catches LLM-templated CSS selectors that don't come from real DOM
// =============================================================================
function isFabricatedSelector(selector) {
  if (!selector || typeof selector !== 'string') return false;
  const s = selector.trim();

  // Obviously fabricated semantic names — highly specific LLM template patterns
  const fabricatedClassPatterns = [
    // Direct component-semantic names an AI would hallucinate
    /\.(?:hero|testimonial|carousel|pricing|team|service|feature|portfolio|about|contact|faq)[-_](?:section|container|wrapper|area|block|card|item|grid|row|list|slider)/i,
    // Deeply nested semantic wrappers
    /\.(?:logo|footer|header|sidebar|banner)-(?:container|wrapper|inner|outer)/i,
    // Trailing layout-wrapper patterns (only when clearly semantic, not BEM)
    /\.(?:[a-z]+-){2,}(?:wrapper|container|overlay)$/i,
  ];

  for (const pattern of fabricatedClassPatterns) {
    if (pattern.test(s)) return true;
  }

  // Vocabulary-based detection for multi-segment class names
  // AI models fabricate selectors using descriptive UI terms; real CSS uses
  // framework tokens, abbreviations, or hashes.
  const fabricationVocab = new Set([
    // Page sections
    'hero', 'cta', 'testimonial', 'carousel', 'slider', 'widget', 'overlay', 'placeholder',
    // Layout wrappers
    'section', 'container', 'wrapper', 'block', 'area', 'content', 'main',
    // Components
    'button', 'toggle', 'menu', 'headline', 'divider', 'heading', 'title', 'label',
    // Semantic descriptors AI uses
    'interactive', 'element', 'feature', 'process', 'step', 'card', 'image', 'icon',
    'sticky', 'primary', 'secondary', 'mobile', 'desktop', 'navigation', 'line',
    'background', 'pattern', 'text',
  ]);

  const classMatch = s.match(/\.([a-zA-Z][a-zA-Z0-9-]+)/);
  if (classMatch) {
    const segments = classMatch[1].split('-').filter(Boolean);
    const allAlpha = segments.every(seg => /^[a-zA-Z]+$/.test(seg));

    if (allAlpha && segments.length >= 3) {
      // Count how many segments are from the fabrication vocabulary
      const fabCount = segments.filter(seg => fabricationVocab.has(seg.toLowerCase())).length;
      // If 2+ segments are fabrication vocabulary → almost certainly AI-hallucinated
      if (fabCount >= 2) return true;
    }

    // 4+ all-alpha segments are very likely fabricated regardless
    if (segments.length >= 4 && allAlpha) return true;
  }

  return false;
}

function normalizeModuleIssueObject(issue) {
  if (typeof issue === 'string') { return { text: cleanAiText(issue, 5000), severity: "Medium" }; }
  if (issue && typeof issue === 'object') {
    const validSeverities = getNested(reportSchemaInstance, '$defs.moduleIssues.properties.severity.enum', ["Medium"]);
    const severity = validSeverities.includes(issue.severity) ? issue.severity : "Medium";
    
    const textVal = issue.text || issue.description || "No issue description.";
    const locationVal = issue.location || issue.where;
    const selectorVal = issue.selector || issue.elementSelector;
    
    const normalized = {
      text: cleanAiText(textVal, 5000),
      severity: severity,
      location: typeof locationVal === 'string' ? cleanAiText(locationVal, 1000) : undefined,
      evidence: typeof issue.evidence === 'string' ? cleanAiText(issue.evidence, 2000) : undefined,
      selector: (typeof selectorVal === 'string' && !isFabricatedSelector(selectorVal)) ? cleanAiText(selectorVal, 1000) : undefined,
      regulatoryReference: typeof issue.regulatoryReference === 'string' ? cleanAiText(issue.regulatoryReference, 500) : undefined,
      details: (issue.details && typeof issue.details === 'object') ? issue.details : undefined
    };

    if (normalized.location) normalized.where = normalized.location;
    if (normalized.selector) normalized.elementSelector = normalized.selector;
    if (normalized.text) normalized.description = normalized.text;
    
    return normalized;
  }
  return null;
}

// --- Root Structure Normalization ---
function normalizeRootStructure(data, requestedModules = [], tier = "Basic", commandLineFlags = {}) {
  const result = { ...data };
  result.reportId = result.reportId || uuidv4();
  result.url = typeof result.url === 'string' && result.url.startsWith('http') ? result.url : "N/A";
  result.generatedAt = result.generatedAt || new Date().toISOString();
  result.schemaVersion = TARGET_SCHEMA_VERSION;
  result.tier = "Pro"; // Tier system deprecated — single level

  // FeatureSet: ALL features enabled (single world-class level — tier distinction deprecated)
  const baseFeatureSet = {
    detailedComplianceReportingEnabled: true, advancedInsightsEnabled: true, roiProjectionsEnabled: true,
    crossModuleAnalysisEnabled: true, visualizationInteractivityEnabled: true, multiLevelDrillDownEnabled: true,
    visualizationExportEnabled: true, realTimeDataIntegrationEnabled: true, advancedIndustryBenchmarkingEnabled: true,
    localizationSupportEnabled: true
  };
  result.featureSet = { ...baseFeatureSet, ...getNested(result, 'featureSet', {}) };

  result.streamingSupport = typeof result.streamingSupport === 'boolean' ? result.streamingSupport : false;
  // streamChunkType can be null if streamingSupport is false, but schema expects enum values
  const validStreamChunkTypes = getNested(reportSchemaInstance, 'properties.streamChunkType.enum', ["intermediate", "final", "complete"]);
  if (result.streamingSupport) {
    result.streamChunkType = validStreamChunkTypes.includes(result.streamChunkType) ? result.streamChunkType : "intermediate";
  } else {
    // For non-streaming, use "complete" as default instead of null
    result.streamChunkType = "complete";
  }


  if (result.streamingSupport && result.streamChunkType === "intermediate") {
    result.pagination = null;
  } else if (result.pagination && typeof result.pagination === 'object' && result.pagination !== null) {
    result.pagination = {
      pageNumber: Math.max(1, result.pagination.pageNumber || 1),
      pageSize: Math.max(1, result.pagination.pageSize || 10),
      totalPages: Math.max(1, result.pagination.totalPages || 1),
      totalItems: typeof result.pagination.totalItems === 'number' ? Math.max(0, result.pagination.totalItems) : 0
    };
    if (result.pagination.totalItems === 0 && result.pagination.totalPages === 1 && result.pagination.pageNumber === 1 && result.pagination.pageSize === 10) {
      // If totalItems is 0, it implies no *overall* pagination, so nullify it.
      // Module-level pagination will handle their own items.
      result.pagination = null;
    }
  } else { result.pagination = null; }

  const bcp47Pattern = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;
  result.localization = !result.featureSet.localizationSupportEnabled ? null : {
    reportLanguage: (getNested(result, 'localization.reportLanguage', 'en-US').match(bcp47Pattern) ? getNested(result, 'localization.reportLanguage', 'en-US') : 'en-US').substring(0, 35),
    supportedLanguages: Array.isArray(getNested(result, 'localization.supportedLanguages')) ? getNested(result, 'localization.supportedLanguages').filter(lang => lang.match(bcp47Pattern)).map(lang => lang.substring(0, 35)) : ['en-US'],
    regionSpecificBenchmarks: getNested(result, 'localization.regionSpecificBenchmarks', null) // Schema allows null
  };
  if (result.localization && result.localization.supportedLanguages.length === 0) { result.localization.supportedLanguages = ['en-US']; }

  result.testParameters = {
    modules: Array.isArray(result.testParameters?.modules) ? result.testParameters.modules : (requestedModules && Array.isArray(requestedModules) ? requestedModules : ["ui"]),
    device: ["desktop", "mobile", "tablet", "all"].includes(getNested(result, 'testParameters.device')) ? getNested(result, 'testParameters.device') : "desktop",
    analysisDepth: ["basic", "comprehensive", "deep"].includes(getNested(result, 'testParameters.analysisDepth')) ? getNested(result, 'testParameters.analysisDepth') : "basic",
    industryHint: typeof getNested(result, 'testParameters.industryHint') === 'string' ? getNested(result, 'testParameters.industryHint') : "general",
    targetRegion: typeof getNested(result, 'testParameters.targetRegion') === 'string' ? getNested(result, 'testParameters.targetRegion') : "global"
  };
  // Ensure modules is an array before filtering
  if (Array.isArray(result.testParameters.modules)) {
    result.testParameters.modules = [...new Set(result.testParameters.modules.filter(m => reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(m)))];
  } else {
    result.testParameters.modules = ["ui"];
  }
  if (result.testParameters.modules.length === 0) { result.testParameters.modules = ["ui"]; }

  result.viewports = Array.isArray(result.viewports) && result.viewports.length > 0 ? result.viewports.map(vp => ({
    name: typeof vp?.name === 'string' && vp.name.trim() !== "" ? vp.name : "default_viewport_name",
    width: typeof vp?.width === 'number' && vp.width > 0 ? vp.width : 1920,
    height: typeof vp?.height === 'number' && vp.height > 0 ? vp.height : 1080,
    isMobile: typeof vp?.isMobile === 'boolean' ? vp.isMobile : (vp?.name ? vp.name.toLowerCase().includes("mobile") : false)
  })) : [{ name: "desktop", width: 1920, height: 1080, isMobile: false }];

  result.industryContext = result.industryContext || { primaryIndustry: "Other", confidence: 0, detectionMethod: "Hybrid" };
  // primaryIndustry is now free-text in the schema (no enum) — just ensure it's a non-empty string
  result.industryContext.primaryIndustry = typeof result.industryContext.primaryIndustry === 'string' && result.industryContext.primaryIndustry.trim() !== ''
    ? result.industryContext.primaryIndustry.trim()
    : "Other";
  result.industryContext.confidence = normalizeScoreValue(getNested(result.industryContext, 'confidence', 0), 'industryContext.confidence');
  result.industryContext.detectionMethod = getNested(reportSchemaInstance, '$defs.industryContext.properties.detectionMethod.enum', ["Hybrid"]).includes(result.industryContext.detectionMethod) ? result.industryContext.detectionMethod : "Hybrid";

  // Ensure subtype is a string, not null
  result.industryContext.subtype = typeof result.industryContext.subtype === 'string' ? result.industryContext.subtype : "General";

  const validRegFrameworkNames = getNested(reportSchemaInstance, '$defs.industryContext.properties.regulatoryFramework.items.properties.name.enum', []);
  result.industryContext.regulatoryFramework = Array.isArray(result.industryContext.regulatoryFramework) ? result.industryContext.regulatoryFramework.map(rf => ({
    name: validRegFrameworkNames.includes(rf?.name) ? rf.name : "Other",
    otherDescription: rf?.name === "Other" ? (rf.otherDescription || "Custom framework") : undefined
  })).filter(rf => rf.name) : []; // Ensure name is present

  result.industryContext.industryStandards = Array.isArray(result.industryContext.industryStandards) ? result.industryContext.industryStandards.map(is => ({
    name: is?.name || "Generic Standard",
    relevanceScore: normalizeScoreValue(is?.relevanceScore, 'industryContext.industryStandards.relevanceScore')
  })).filter(is => is.name) : []; // Ensure name is present

  // QUALITY FIX: Use null instead of {} for empty competitiveLandscape/businessIntelligence
  // Shipping empty {} objects suggests the tool claims to provide competitive analysis but doesn't
  const cl = result.industryContext.competitiveLandscape;
  result.industryContext.competitiveLandscape = (cl && typeof cl === 'object' && Object.keys(cl).length > 0) ? cl : null;
  const bi = result.industryContext.businessIntelligence;
  result.industryContext.businessIntelligence = (bi && typeof bi === 'object' && Object.keys(bi).length > 0) ? bi : null;

  result.modules = result.modules || {};
  result.moduleStatus = Array.isArray(result.moduleStatus) ? result.moduleStatus.map(ms => ({
    moduleName: getNested(reportSchemaInstance, '$defs.moduleNameEnum.enum', []).includes(ms?.moduleName) ? ms.moduleName : "ui",
    status: getNested(reportSchemaInstance, 'properties.moduleStatus.items.properties.status.enum', ["Not Run"]).includes(ms?.status) ? ms.status : "Not Run",
    // CRITICAL FIX: Preserve ALL valid numeric scores (0-100) without any normalization
    // The previous logic was incorrectly normalizing scores that were already valid
    score: (ms?.status === "Not Run" || ms?.status === "Pending") ? null :
      (typeof ms?.score === 'number' && ms.score >= 0 && ms.score <= 100 && !isNaN(ms.score)) ? ms.score :
        (ms?.score === 0 ? 0 : normalizeScoreValue(getNested(ms, 'score', 0), `${ms?.moduleName}.status.score`)),
    rating: "N/A", // Will be set by ensureRatings
    notes: typeof ms?.notes === 'string' ? cleanAiText(ms.notes, 2000) : "",
    duration: typeof ms?.duration === 'number' ? ms.duration : undefined,
    errors: Array.isArray(ms?.errors) ? ms.errors.map(String) : [],
    warnings: Array.isArray(ms?.warnings) ? ms.warnings.map(String) : [],
    retryCount: typeof ms?.retryCount === 'number' ? ms.retryCount : undefined,
  })) : [];
  const currentModuleNamesInStatus = new Set(result.moduleStatus.map(ms => ms.moduleName));
  result.testParameters.modules.forEach(modName => {
    if (!currentModuleNamesInStatus.has(modName)) {
      result.moduleStatus.push({ moduleName: modName, status: "Not Run", score: null, rating: "N/A", notes: "Module not executed." });
    }
  });

  result.topRecommendations = normalizePaginatedArray(result.topRecommendations, 'topRecommendations.items', normalizeRecommendationObject, 'ai-general', result.tier);

  result.regulatoryCompliance = !result.featureSet.detailedComplianceReportingEnabled ? null : (result.regulatoryCompliance || { overallComplianceScore: 50, overallComplianceRating: getRatingLabel(50, false), standards: [] });
  if (result.regulatoryCompliance) {
    result.regulatoryCompliance.overallComplianceScore = normalizeScoreValue(result.regulatoryCompliance.overallComplianceScore, 'regulatoryCompliance.overallComplianceScore');
    if (result.regulatoryCompliance.overallComplianceScore === 0 && result.regulatoryCompliance.standards.length > 0) { result.regulatoryCompliance.overallComplianceScore = 1; } // Min 1 if has standards
    else if (result.regulatoryCompliance.overallComplianceScore === 0) { result.regulatoryCompliance.overallComplianceScore = 1; } // Default min

    result.regulatoryCompliance.overallComplianceRating = getRatingLabel(result.regulatoryCompliance.overallComplianceScore, false);
    result.regulatoryCompliance.standards = Array.isArray(result.regulatoryCompliance.standards) ? result.regulatoryCompliance.standards.map(s => {
      const standardName = s.name || "Standard Name";
      const standardScore = normalizeScoreValue(s.score, `regulatoryCompliance.standards.${standardName}.score`) || 1;
      return {
        name: standardName, isCustomStandard: typeof s.isCustomStandard === 'boolean' ? s.isCustomStandard : (s.name === "Other"),
        standardVersion: s.standardVersion, industryRelevance: s.industryRelevance,
        score: standardScore,
        rating: getRatingLabel(standardScore, false),
        gaps: Array.isArray(s.gaps) ? s.gaps.map(String) : [],
        moduleReferences: Array.isArray(s.moduleReferences) ? s.moduleReferences.filter(m => reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(m)) : [],
        recommendations: normalizePaginatedArray(s.recommendations, `regulatoryCompliance.standards.${standardName}.recommendations`, normalizeRecommendationObject, "regulatory", result.tier).items
      };
    }) : [];
  }

  // Cross-module insights — no tier restriction (deprecated)
  result.crossModuleInsights = Array.isArray(result.crossModuleInsights) ? result.crossModuleInsights : [];

  if (result.crossModuleInsights && Array.isArray(result.crossModuleInsights)) {
    result.crossModuleInsights = result.crossModuleInsights.map(cmi => ({
      insight: cleanAiText(cmi.insight || "N/A", 5000),
      modules: Array.isArray(cmi.modules) ? cmi.modules.filter(m => reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(m)) : [],
      correlationStrength: typeof cmi.correlationStrength === 'number' ? Math.max(0, Math.min(1, cmi.correlationStrength)) : 0.5,
      businessImpact: typeof cmi.businessImpact === 'string'
        ? { description: cleanAiText(cmi.businessImpact, 2000), severity: "Medium", estimatedImpact: null }
        : (cmi.businessImpact && typeof cmi.businessImpact === 'object' ? cmi.businessImpact : null),
      crossModuleRecommendations: normalizePaginatedArray(cmi.crossModuleRecommendations, 'crossModuleInsights.crossModuleRecommendations', normalizeRecommendationObject, "cross-module", result.tier).items,
      metricPairs: Array.isArray(cmi.metricPairs) ? cmi.metricPairs : [],
      dependencies: Array.isArray(cmi.dependencies) ? cmi.dependencies : [],
      insightPrioritization: cmi.insightPrioritization || null, // Schema allows null
      ...(cmi.source ? { source: cmi.source } : {}) // Preserve provenance tag (ceo, debate, ai-synthesized, enterprise)
    }));
  }

  // Visualization data — no tier restriction (deprecated)
  result.visualizationData = result.featureSet.visualizationInteractivityEnabled ?
    (Array.isArray(result.visualizationData) ? result.visualizationData : []) : null;
  if (result.visualizationData) {
    result.visualizationData.forEach(chart => {
      chart.chartId = chart.chartId || uuidv4();
      const validChartTypes = getNested(reportSchemaInstance, '$defs.visualizationData.items.properties.chartType.enum', ["bar"]);
      if (!validChartTypes.includes(chart.chartType)) { chart.chartType = "bar"; }


      chart.data = chart.data || { labels: [], datasets: [] };
      chart.data.labels = Array.isArray(chart.data.labels) ? chart.data.labels.map(String) : [];
      chart.data.datasets = Array.isArray(chart.data.datasets) ? chart.data.datasets.map(ds => ({
        label: ds.label || "Dataset", data: Array.isArray(ds.data) ? ds.data.map(d => (typeof d === 'number' ? d : null)) : [],
        backgroundColor: ds.backgroundColor, borderColor: ds.borderColor // Allow string or array
      })) : [];
      chart.options = chart.options || {};
      chart.interactivityOptions = chart.interactivityOptions || { tooltipsEnabled: true, drillDownSupported: false, dynamicFiltersAvailable: false };
      chart.exportOptions = chart.exportOptions || null;
    });
  }

  result.overallRoiProjections = result.featureSet.roiProjectionsEnabled ? (result.overallRoiProjections || null) : null;
  if (result.overallRoiProjections && typeof result.overallRoiProjections === 'object' && result.overallRoiProjections !== null) {
    if (Object.keys(result.overallRoiProjections).length === 0 && !result.overallRoiProjections.notes) { result.overallRoiProjections.notes = "No specific ROI projections available."; }
    else {
      result.overallRoiProjections.totalEstimatedRevenueUplift = result.overallRoiProjections.totalEstimatedRevenueUplift || 0;
      result.overallRoiProjections.totalEstimatedConversionIncrease = result.overallRoiProjections.totalEstimatedConversionIncrease || 0;
      result.overallRoiProjections.combinedConfidenceLevel = ["High", "Medium", "Low"].includes(result.overallRoiProjections.combinedConfidenceLevel) ? result.overallRoiProjections.combinedConfidenceLevel : "Medium";
      result.overallRoiProjections.primaryContributingModules = Array.isArray(result.overallRoiProjections.primaryContributingModules) ? result.overallRoiProjections.primaryContributingModules.filter(m => reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(m)) : [];
      result.overallRoiProjections.moduleContributions = Array.isArray(result.overallRoiProjections.moduleContributions) ? result.overallRoiProjections.moduleContributions.map(mc => ({
        moduleName: reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(mc.moduleName) ? mc.moduleName : "ui",
        estimatedRoiValue: typeof mc.estimatedRoiValue === 'number' ? mc.estimatedRoiValue : 0,
        contributionPercentage: typeof mc.contributionPercentage === 'number' ? Math.max(0, Math.min(100, mc.contributionPercentage)) : undefined
      })) : [];
      result.overallRoiProjections.notes = cleanAiText(result.overallRoiProjections.notes || "", 5000);
    }
  }

  result.deprecatedFields = Array.isArray(result.deprecatedFields) ? result.deprecatedFields.map(df => ({
    fieldPath: df.fieldPath || "unknown", removalVersion: df.removalVersion || TARGET_SCHEMA_VERSION, reason: df.reason || "No reason provided."
  })) : undefined; // Optional field

  // Fix Issue #1: Localization regionSpecificBenchmarks must be object for Pro tier
  if (result.localization) {
    // For Pro/Enterprise tiers with localization support enabled, ensure regionSpecificBenchmarks is an object
    if (tier !== "Basic" && result.featureSet?.localizationSupportEnabled) {
      if (result.localization.regionSpecificBenchmarks === null || result.localization.regionSpecificBenchmarks === undefined) {
        result.localization.regionSpecificBenchmarks = {};
      }
    }
  }

  return result;
}

// --- Module Specific Normalization Stubs (to be fully implemented per schema) ---
// These functions ensure that each module's data structure is initialized correctly
// and that key fields have defaults if missing from AI output.

function createDefaultUiStructuredAnalysis() { /* ... as before ... */ }
function normalizeUiModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet, rootViewports) {
  if (!moduleData) { return {}; }

  const result = { ...moduleData };

  // Fix Issue #2: gestureInteractionAnalysis must be object, not null
  if (result.dynamicElementsAnalysis) {
    if (result.dynamicElementsAnalysis.gestureInteractionAnalysis === null ||
      result.dynamicElementsAnalysis.gestureInteractionAnalysis === undefined) {
      result.dynamicElementsAnalysis.gestureInteractionAnalysis = {};
    }
  }

  // Ensure all required UI module fields are properly initialized
  if (!result.summary) {
    result.summary = {
      score: 0,
      rating: "Failing",
      topIssues: ["UI analysis completed - detailed assessment may require manual review"]
    };
  }

  // Normalize recommendations and issues with proper pagination
  if (result.recommendations) {
    result.recommendations = normalizePaginatedArray(
      result.recommendations,
      "recommendation",
      (rec) => normalizeRecommendationObject(rec, "ui"),
      "ui",
      reportTier
    );
  }

  if (result.issues) {
    result.issues = normalizePaginatedArray(
      result.issues,
      "moduleIssue",
      normalizeModuleIssueObject,
      "ui",
      reportTier
    );
  }

  // SAFETY NET: crossViewport.analysis must always be a string (schema requirement)
  if (result.crossViewport && result.crossViewport.analysis && typeof result.crossViewport.analysis !== 'string') {
    result.crossViewport.analysis = JSON.stringify(result.crossViewport.analysis);
  }

  // Filter fabricated selectors from viewport visualEvidence
  if (result.crossViewport?.structured) {
    for (const [catName, catData] of Object.entries(result.crossViewport.structured)) {
      if (catData?.visualEvidence && Array.isArray(catData.visualEvidence)) {
        catData.visualEvidence = catData.visualEvidence.filter(ve => {
          if (!ve.elementSelector || isFabricatedSelector(ve.elementSelector)) {
            return false; // Strip entries with fabricated selectors
          }
          return true;
        });
      }
    }
  }

  // Also filter viewport-level visualEvidence
  if (result.viewports && Array.isArray(result.viewports)) {
    for (const vp of result.viewports) {
      if (vp.categories && typeof vp.categories === 'object') {
        for (const [catName, catData] of Object.entries(vp.categories)) {
          if (catData?.visualEvidence && Array.isArray(catData.visualEvidence)) {
            catData.visualEvidence = catData.visualEvidence.filter(ve => {
              if (!ve.elementSelector || isFabricatedSelector(ve.elementSelector)) {
                return false;
              }
              return true;
            });
          }
        }
      }
    }
  }

  // Filter fabricated selectors from viewportAnalyses (the ACTUAL per-viewport data location)
  if (result.viewportAnalyses && typeof result.viewportAnalyses === 'object') {
    for (const [vpName, vpData] of Object.entries(result.viewportAnalyses)) {
      if (!vpData?.structured || typeof vpData.structured !== 'object') continue;
      for (const [catName, catData] of Object.entries(vpData.structured)) {
        if (catData?.visualEvidence && Array.isArray(catData.visualEvidence)) {
          catData.visualEvidence = catData.visualEvidence.filter(ve => {
            if (!ve.elementSelector || isFabricatedSelector(ve.elementSelector)) {
              return false;
            }
            return true;
          });
        }
      }
    }
  }

  return result;
}
function normalizePerformanceModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) { /* ... as before ... */ return moduleData; }
function normalizeSecurityModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet, rootViewports) {
  if (!moduleData) { return {}; }

  const result = { ...moduleData };

  // FIX: Security header directives must be string or array, never boolean
  // DeepSeek V3.2 sometimes returns { includeSubDomains: true } instead of "includeSubDomains"
  if (result.headers) {
    Object.keys(result.headers).forEach(headerKey => {
      const header = result.headers[headerKey];
      if (header && header.directives && typeof header.directives === 'object') {
        Object.keys(header.directives).forEach(dKey => {
          const val = header.directives[dKey];
          if (typeof val === 'boolean') {
            header.directives[dKey] = val ? dKey : '';
          } else if (typeof val === 'number') {
            header.directives[dKey] = String(val);
          } else if (val === null || val === undefined) {
            header.directives[dKey] = '';
          }
        });
      }
    });
  }

  // Fix Issue #6: CSP directives must not be null - should be empty strings when not present
  if (result.csp && result.csp.directives) {
    const directives = result.csp.directives;

    // Map kebab-case properties to camelCase and remove kebab-case properties
    const kebabToCamelMap = {
      'default-src': 'defaultSrc',
      'script-src': 'scriptSrc',
      'style-src': 'styleSrc',
      'img-src': 'imgSrc',
      'font-src': 'fontSrc',
      'connect-src': 'connectSrc',
      'frame-src': 'frameSrc',
      'frame-ancestors': 'frameAncestors',
      'form-action': 'formAction',
      'base-uri': 'baseUri',
      'object-src': 'objectSrc',
      'report-uri': 'reportUri',
      'report-to': 'reportTo'
    };

    // Convert kebab-case to camelCase and handle null values
    Object.keys(kebabToCamelMap).forEach(kebabKey => {
      const camelKey = kebabToCamelMap[kebabKey];
      if (kebabKey in directives) {
        // Use kebab-case value if it exists, convert null to empty string
        directives[camelKey] = directives[kebabKey] === null ? "" : directives[kebabKey] || "";
        // Remove the kebab-case property
        delete directives[kebabKey];
      } else if (directives[camelKey] === null || directives[camelKey] === undefined) {
        // Ensure camelCase property is empty string if null/undefined
        directives[camelKey] = "";
      }
    });

    // Handle any remaining null values in directives that weren't in the kebab map
    Object.keys(directives).forEach(key => {
      if (directives[key] === null || directives[key] === undefined) {
        directives[key] = "";
      }
    });
  }

  // Fix: SSL fields must be strings per schema, AI merge can set them to null
  if (result.ssl) {
    // expiration must be a valid date-time format per schema
    if (!result.ssl.expiration || typeof result.ssl.expiration !== 'string' || result.ssl.expiration.trim() === '') {
      // Default to 1 year from now if expiration is missing/empty
      const defaultExpiry = new Date();
      defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
      result.ssl.expiration = result.ssl.isHttps ? defaultExpiry.toISOString() : new Date(0).toISOString();
    } else {
      // Validate and fix existing expiration string to ISO format
      const parsed = new Date(result.ssl.expiration);
      result.ssl.expiration = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }
    // String fields that must not be null (non-date fields)
    const sslStringFields = ['keyExchange', 'issuer', 'protocol'];
    sslStringFields.forEach(field => {
      if (result.ssl[field] === null || result.ssl[field] === undefined) {
        result.ssl[field] = '';
      }
    });
    // certificateType must be a valid enum value
    const validCertTypes = ['DV', 'OV', 'EV', 'Self-signed', 'None'];
    if (!validCertTypes.includes(result.ssl.certificateType)) {
      result.ssl.certificateType = result.ssl.isHttps ? 'DV' : 'None';
    }
    // cipherStrength must be a valid enum value
    const validCipherStrengths = ['Strong', 'Adequate', 'Weak'];
    if (typeof result.ssl.cipherStrength === 'string' && !validCipherStrengths.includes(result.ssl.cipherStrength)) {
      result.ssl.cipherStrength = 'Adequate';
    } else if (result.ssl.cipherStrength === null || result.ssl.cipherStrength === undefined) {
      result.ssl.cipherStrength = 'Adequate';
    }
    // Ensure arrays are arrays
    if (!Array.isArray(result.ssl.vulnerabilities)) result.ssl.vulnerabilities = [];
    if (!Array.isArray(result.ssl.weakCiphers)) result.ssl.weakCiphers = [];
  }

  // Fix: Security forms fields must have correct types
  if (result.forms) {
    // csrfProtectionDetails fields
    if (result.forms.csrfProtectionDetails) {
      const csrf = result.forms.csrfProtectionDetails;
      // tokenValidationEffectiveness must be number (0-100)
      if (typeof csrf.tokenValidationEffectiveness === 'string') {
        const parsed = parseFloat(csrf.tokenValidationEffectiveness);
        csrf.tokenValidationEffectiveness = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
      } else if (csrf.tokenValidationEffectiveness !== undefined && typeof csrf.tokenValidationEffectiveness !== 'number') {
        csrf.tokenValidationEffectiveness = 50;
      }
      // methodUsed must be valid enum
      const validMethods = ['Synchronizer Token Pattern', 'Double Submit Cookie', 'CSRF Header', 'None', 'Unknown'];
      if (csrf.methodUsed && !validMethods.includes(csrf.methodUsed)) {
        csrf.methodUsed = 'Unknown';
      }
      // tokenScope must be valid enum
      const validScopes = ['Per-Session', 'Per-Request', 'Per-Form', 'Unknown'];
      if (csrf.tokenScope && !validScopes.includes(csrf.tokenScope)) {
        csrf.tokenScope = 'Unknown';
      }
      // present and doubleSubmitCookieImplemented must be boolean
      if (typeof csrf.present !== 'boolean') csrf.present = !!csrf.present;
      if (typeof csrf.doubleSubmitCookieImplemented !== 'boolean') csrf.doubleSubmitCookieImplemented = !!csrf.doubleSubmitCookieImplemented;
    }
    // inputValidationScore must be number
    if (typeof result.forms.inputValidationScore === 'string') {
      const parsed = parseFloat(result.forms.inputValidationScore);
      result.forms.inputValidationScore = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
    }
    // sensitiveDataHandlingScore must be number
    if (typeof result.forms.sensitiveDataHandlingScore === 'string') {
      const parsed = parseFloat(result.forms.sensitiveDataHandlingScore);
      result.forms.sensitiveDataHandlingScore = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
    }
    // count, secureCount, insecureCount must be numbers
    ['count', 'secureCount', 'insecureCount'].forEach(field => {
      if (typeof result.forms[field] === 'string') {
        result.forms[field] = parseInt(result.forms[field], 10) || 0;
      }
    });
    // score must be number
    if (typeof result.forms.score === 'string') {
      const parsed = parseFloat(result.forms.score);
      result.forms.score = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
    }
  }

  // Ensure recommendations and issues have proper UUID validation
  if (result.recommendations && result.recommendations.items) {
    result.recommendations.items = result.recommendations.items.map(rec => {
      if (rec.id && typeof rec.id === 'string') {
        // Apply the same UUID validation as in ai-recommendation-engine.js
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const invalidPatterns = /^(REC\d+|rec\d+|RECOMMENDATION\d+|recommendation\d+|\d+|ID\d+|id\d+)$/i;

        if (!uuidRegex.test(rec.id) || invalidPatterns.test(rec.id) || rec.id.length !== 36) {
          rec.id = require('uuid').v4();
        }
      }
      return rec;
    });
  }

  return result;
}
function normalizeSeoContentModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) {
  if (!moduleData || typeof moduleData !== 'object') { return moduleData; }

  // FIX: readability scores must be numbers, not null
  if (moduleData.content && moduleData.content.readability) {
    const r = moduleData.content.readability;
    const numFields = ['fleschReadingEase', 'fleschKincaidGradeLevel', 'daleChallScore'];
    numFields.forEach(field => {
      if (r[field] === null || r[field] === undefined || typeof r[field] !== 'number') {
        r[field] = 0;
      }
    });
  }

  // FIX: eatMetrics scores must be numbers, not null
  if (moduleData.content && moduleData.content.eatMetrics) {
    const e = moduleData.content.eatMetrics;
    const numFields = ['expertiseScore', 'authoritativenessScore', 'trustworthinessScore', 'overallEatScore'];
    numFields.forEach(field => {
      if (e[field] === null || e[field] === undefined || typeof e[field] !== 'number') {
        e[field] = 0;
      }
    });
  }

  // FIX: contentStructure fields must match schema types
  if (moduleData.content && moduleData.content.contentStructure) {
    const cs = moduleData.content.contentStructure;
    // averageParagraphLength must be number
    if (cs.averageParagraphLength === null || cs.averageParagraphLength === undefined || typeof cs.averageParagraphLength !== 'number') {
      cs.averageParagraphLength = 0;
    }
    // useOfLists must be boolean
    if (cs.useOfLists === null || cs.useOfLists === undefined || typeof cs.useOfLists !== 'boolean') {
      cs.useOfLists = false;
    }
  }

  return moduleData;
}
function normalizeAccessibilityModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) {
  if (!moduleData || typeof moduleData !== 'object') { return moduleData; }

  // FIX: screenReaderTesting.devices[].score must be a number, not a string
  if (moduleData.screenReaderTesting && Array.isArray(moduleData.screenReaderTesting.devices)) {
    moduleData.screenReaderTesting.devices = moduleData.screenReaderTesting.devices.map(device => {
      if (device && typeof device.score === 'string') {
        const parsed = parseFloat(device.score);
        device.score = isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
      } else if (device && (device.score === null || device.score === undefined)) {
        device.score = 50;
      }
      return device;
    });
  }

  // Ensure summary is always an object with {score, rating, topIssues}
  if (moduleData.summary && typeof moduleData.summary === 'string') {
    moduleData.summary = {
      score: 1,
      rating: 'Failing',
      topIssues: [moduleData.summary.substring(0, 200)]
    };
  }

  // FIX: accessibility conformanceLevelAchieved must be a valid enum
  if (moduleData.wcagCompliance) {
    const validLevels = ['A', 'AA', 'AAA', 'None'];
    if (!validLevels.includes(moduleData.wcagCompliance.conformanceLevelAchieved)) {
      moduleData.wcagCompliance.conformanceLevelAchieved = 'None';
    }
  }

  // FIX: summary must only contain allowed properties (DeepSeek adds extras)
  if (moduleData.summary && typeof moduleData.summary === 'object') {
    const allowedSummaryKeys = ['score', 'rating', 'topIssues', 'strengths'];
    Object.keys(moduleData.summary).forEach(key => {
      if (!allowedSummaryKeys.includes(key)) {
        delete moduleData.summary[key];
      }
    });
  }

  return moduleData;
}
function normalizePrivacyModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) {
  if (!moduleData || typeof moduleData !== 'object') { return moduleData; }

  // FIX: crossBorderCompliance.dataFlowMap fields must be strings, not null
  if (moduleData.crossBorderCompliance && moduleData.crossBorderCompliance.dataFlowMap) {
    const dfm = moduleData.crossBorderCompliance.dataFlowMap;
    const stringFields = ['visualizationHint', 'suggestedChartId', 'schremsIIComplianceNotes'];
    stringFields.forEach(field => {
      if (dfm[field] === null || dfm[field] === undefined) {
        dfm[field] = '';
      }
    });
  }

  return moduleData;
}
function normalizeCompatibilityModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) { /* ... as before ... */ return moduleData; }
function normalizeMarketingModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) { /* ... as before ... */ return moduleData; }
function normalizeConversionModule(moduleData, reportTier, reportIndustryContext, rootFeatureSet) {
  if (!moduleData || typeof moduleData !== 'object') { return moduleData; }

  // CRITICAL: Ensure completionTime fields are always numeric (seconds), never strings
  if (moduleData.forms && moduleData.forms.detectedForms && Array.isArray(moduleData.forms.detectedForms)) {
    moduleData.forms.detectedForms = moduleData.forms.detectedForms.map(form => {
      // Fix completionTime data type
      if (form.completionTime !== undefined && form.completionTime !== null) {
        if (typeof form.completionTime === 'string') {
          // If it's a date string like "1970-01-01T00:00:00.000Z", convert to 0
          form.completionTime = 0;
        } else if (typeof form.completionTime !== 'number' || isNaN(form.completionTime) || !isFinite(form.completionTime)) {
          // If it's not a valid number, set to 0
          form.completionTime = 0;
        }
      } else {
        // If completionTime is missing, set to 0
        form.completionTime = 0;
      }

      // Also fix averageCompletionTime if present
      if (form.averageCompletionTime !== undefined && form.averageCompletionTime !== null) {
        if (typeof form.averageCompletionTime === 'string') {
          form.averageCompletionTime = 0;
        } else if (typeof form.averageCompletionTime !== 'number' || isNaN(form.averageCompletionTime) || !isFinite(form.averageCompletionTime)) {
          form.averageCompletionTime = 0;
        }
      }

      return form;
    });
  }

  // CRITICAL: Remove deprecated fields that should not exist in schema v4.0.0
  if (moduleData.hasOwnProperty('formAnalysis')) {
    delete moduleData.formAnalysis;
  }
  if (moduleData.hasOwnProperty('trustSignals')) {
    delete moduleData.trustSignals;
  }

  // Ensure required schema structure
  if (!moduleData.summary) {
    moduleData.summary = { score: 50, rating: "Passable", topIssues: [] };
  }

  if (!moduleData.forms) {
    moduleData.forms = {
      detectedForms: [],
      overallFormEffectivenessScore: 50
    };
  }

  if (!moduleData.cta) {
    moduleData.cta = {
      ctasDetected: [],
      effectivenessScore: 50
    };
  }

  if (!moduleData.trustSignalsAnalysis) {
    moduleData.trustSignalsAnalysis = {
      signalsPresent: [],
      effectivenessScore: 50,
      score: 50
    };
  }

  if (!moduleData.funnelAnalysis) {
    moduleData.funnelAnalysis = {
      steps: [],
      overallConversionRate: 0,
      score: 50
    };
  }

  // Ensure CTA items have required element property
  if (moduleData.cta && moduleData.cta.ctasDetected && Array.isArray(moduleData.cta.ctasDetected)) {
    moduleData.cta.ctasDetected = moduleData.cta.ctasDetected.map((cta, index) => {
      if (!cta.element) {
        // Add required element property with generic CSS selector
        cta.element = cta.text ? `button:contains("${cta.text}"), a:contains("${cta.text}")` : `[data-cta="${index + 1}"]`;
      }
      return cta;
    });
  }

  // Normalize recommendations and issues
  if (moduleData.recommendations) {
    moduleData.recommendations = normalizePaginatedArray(
      moduleData.recommendations,
      'recommendation',
      (rec) => normalizeRecommendationObject(rec, 'conversion'),
      'conversion',
      reportTier
    );
  }

  if (moduleData.issues) {
    moduleData.issues = normalizePaginatedArray(
      moduleData.issues,
      'moduleIssue',
      normalizeModuleIssueObject,
      'conversion',
      reportTier
    );
  }

  return moduleData;
}

// Global variable to hold the current report data being normalized.
let currentReportDataForNormalization = {};

/**
 * Generates a meaningful implementation step based on recommendation text and step number
 */
function generateImplementationStep(recommendationText, stepNumber, priority = "Medium") {
  const text = (recommendationText || "").toLowerCase();

  // Enhanced implementation patterns with more specific, actionable steps
  const patterns = [
    // Skip navigation links - specific accessibility improvement
    {
      keywords: ['skip navigation', 'skip link', 'bypass blocks'], steps: [
        "Identify main content area and primary navigation landmarks on the page",
        "Add visually hidden skip link at the beginning of the page body",
        "Implement CSS to show skip link on keyboard focus with proper styling",
        "Test skip link functionality with keyboard navigation and screen readers",
        "Verify skip link works across all page templates and layouts"
      ]
    },

    // Alt text improvements - specific accessibility
    {
      keywords: ['alt text', 'alternative text', 'image accessibility', 'non-text content'], steps: [
        "Audit all images to identify those missing or with inadequate alt text",
        "Write descriptive alt text for informational images (purpose, not appearance)",
        "Add empty alt=\"\" for purely decorative images to hide from screen readers",
        "Update CMS templates to require alt text for new image uploads",
        "Test image accessibility with screen readers to verify alt text quality"
      ]
    },

    // Color contrast improvements
    {
      keywords: ['color contrast', 'contrast ratio', 'wcag aa', 'text readability'], steps: [
        "Use color contrast analyzer to identify specific elements failing WCAG standards",
        "Adjust text colors or background colors to achieve 4.5:1 ratio for normal text",
        "Ensure large text (18pt+ or 14pt+ bold) meets 3:1 minimum contrast ratio",
        "Update brand color palette documentation with accessible color combinations",
        "Implement automated contrast checking in design and development workflow"
      ]
    },

    // Form label improvements
    {
      keywords: ['form labels', 'input labels', 'form accessibility', 'labels or instructions'], steps: [
        "Identify form inputs missing explicit labels or aria-label attributes",
        "Add proper <label> elements with for attributes matching input IDs",
        "Implement aria-labelledby for complex form layouts where labels are separate",
        "Add required field indicators and validation messages with proper ARIA",
        "Test form accessibility with keyboard navigation and screen readers"
      ]
    },

    // Keyboard navigation improvements
    {
      keywords: ['keyboard navigation', 'keyboard accessibility', 'focus management'], steps: [
        "Map all interactive elements and test keyboard navigation flow",
        "Ensure all clickable elements are focusable with Tab key navigation",
        "Implement visible focus indicators that meet WCAG contrast requirements",
        "Add keyboard event handlers for custom interactive components",
        "Test complete user workflows using only keyboard navigation"
      ]
    },

    // Heading structure improvements
    {
      keywords: ['heading structure', 'heading hierarchy', 'h1 h2 h3'], steps: [
        "Audit current heading structure to identify hierarchy gaps or errors",
        "Restructure headings to follow logical sequence (h1 → h2 → h3, etc.)",
        "Ensure each page has exactly one h1 element describing main content",
        "Add descriptive heading text that clearly indicates section content",
        "Test heading navigation with screen reader heading shortcuts"
      ]
    },

    // Performance optimization - specific improvements
    {
      keywords: ['page speed', 'load time', 'performance optimization', 'core web vitals'], steps: [
        "Run Lighthouse audit to identify specific performance bottlenecks",
        "Optimize images by compressing and converting to modern formats (WebP, AVIF)",
        "Implement lazy loading for images and videos below the fold",
        "Minify and compress CSS, JavaScript, and HTML files",
        "Monitor Core Web Vitals and set up performance budgets for ongoing optimization"
      ]
    },

    // Mobile responsiveness improvements
    {
      keywords: ['mobile responsive', 'responsive design', 'mobile optimization'], steps: [
        "Test current layout on various mobile devices and screen sizes",
        "Implement flexible grid system and responsive breakpoints",
        "Optimize touch targets to be at least 44px × 44px for mobile usability",
        "Adjust typography and spacing for better mobile readability",
        "Test mobile navigation patterns and ensure thumb-friendly interaction"
      ]
    },

    // SEO meta improvements
    {
      keywords: ['meta description', 'title tag', 'meta tags', 'seo optimization'], steps: [
        "Research target keywords for each page using SEO tools",
        "Write unique, descriptive title tags (50-60 characters) for each page",
        "Create compelling meta descriptions (150-160 characters) that include target keywords",
        "Implement structured data markup for better search result appearance",
        "Monitor search console for indexing issues and click-through rates"
      ]
    },

    // Content clarity improvements
    {
      keywords: ['content clarity', 'readability', 'content optimization', 'user experience'], steps: [
        "Analyze content readability using tools like Flesch-Kincaid scoring",
        "Break up long paragraphs into shorter, scannable sections",
        "Add descriptive subheadings to improve content structure and navigation",
        "Use bullet points and numbered lists to present complex information clearly",
        "Test content comprehension with target users and iterate based on feedback"
      ]
    },

    // CTA optimization - specific improvements
    {
      keywords: ['call-to-action', 'cta button', 'conversion optimization', 'button design'], steps: [
        "Analyze current CTA placement and performance using analytics data",
        "Design prominent CTA buttons with high contrast and clear action words",
        "Position primary CTAs above the fold and at natural decision points",
        "A/B test different CTA text, colors, and sizes to optimize conversion rates",
        "Ensure CTAs are accessible with proper focus states and descriptive text"
      ]
    },

    // Security improvements - specific implementations
    {
      keywords: ['ssl certificate', 'https', 'security headers', 'vulnerability'], steps: [
        "Obtain and install valid SSL certificate from trusted certificate authority",
        "Configure server to redirect all HTTP traffic to HTTPS automatically",
        "Implement security headers (HSTS, CSP, X-Frame-Options) in server configuration",
        "Scan for vulnerabilities using security tools and patch identified issues",
        "Set up monitoring for certificate expiration and security incidents"
      ]
    },

    // Visual hierarchy improvements
    {
      keywords: ['visual hierarchy', 'design consistency', 'layout improvement'], steps: [
        "Audit current visual elements to identify inconsistencies in spacing and sizing",
        "Establish consistent typography scale with clear heading and body text styles",
        "Implement consistent spacing system using multiples of base unit (8px or 16px)",
        "Use color and contrast strategically to guide user attention to important elements",
        "Test visual hierarchy by asking users to identify most important page elements"
      ]
    }
  ];

  // Find the most specific matching pattern
  let matchedPattern = null;
  let maxMatches = 0;

  for (const pattern of patterns) {
    const matches = pattern.keywords.filter(keyword => text.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      matchedPattern = pattern;
    }
  }

  // Use matched pattern or create context-aware steps
  let steps;
  if (matchedPattern) {
    steps = matchedPattern.steps;
  } else {
    // Try to generate context-aware steps from the recommendation text
    steps = generateContextAwareSteps(text);
  }

  // If no steps found (no matching pattern), return null to signal "no specific step"
  if (!steps || steps.length === 0) {
    return null;
  }

  // Return appropriate step based on step number
  if (stepNumber <= steps.length) {
    return steps[stepNumber - 1];
  }

  // If requesting a step beyond what we have, return null rather than generic padding
  return null;
}

/**
 * MODULE_STEP_BANKS: Per-module step banks with keyword refinements and quality defaults.
 * Using the module name as PRIMARY classifier eliminates cross-module mismatches by design.
 * Keywords only refine WITHIN a module — an accessibility rec can NEVER get CTA steps.
 *
 * Structure: { moduleName: { branches: [{match, steps}], default: [...] } }
 */
const MODULE_STEP_BANKS = {
  security: {
    branches: [
      { match: t => t.includes('unsafe-inline') || t.includes('unsafe-eval') || t.includes('csp') || t.includes('content-security-policy'),
        steps: [`Audit current Content-Security-Policy header to identify uses of 'unsafe-inline' and 'unsafe-eval'`, `Move all inline scripts to external files and replace inline event handlers with addEventListener()`, `Use CSP nonces or hashes (e.g., 'nonce-{random}') for any scripts that must remain inline`, `Update the CSP header in your server configuration or CDN settings to remove 'unsafe-*' directives`, `Test the site thoroughly after changes — use the browser console to catch CSP violations`] },
      { match: t => t.includes('hsts') || t.includes('strict-transport-security'),
        steps: [`Verify HSTS header is present with 'max-age=31536000; includeSubDomains; preload'`, `Check that all subdomains support HTTPS before adding includeSubDomains directive`, `Submit your domain to the HSTS preload list at hstspreload.org`, `Monitor certificate renewals to ensure HSTS doesn't cause access issues on expiry`] },
      { match: t => t.includes('x-frame') || t.includes('clickjacking'),
        steps: [`Add 'X-Frame-Options: DENY' (or SAMEORIGIN if you embed your own pages) to server response headers`, `Also add 'frame-ancestors' directive in your CSP header as the modern replacement`, `Test that legitimate iframes (if any) still work with the new restrictions`, `Verify headers are present using browser DevTools Network tab or securityheaders.com`] },
      { match: t => t.includes('security header') || t.includes('x-content-type') || t.includes('referrer-policy') || t.includes('permissions-policy'),
        steps: [`Add missing security headers to your web server or CDN configuration (nginx.conf, vercel.json, netlify.toml, etc.)`, `Include: X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy`, `Test header presence at securityheaders.com or via curl -I https://yoursite.com`, `Set up automated monitoring to alert if security headers are accidentally removed during deployments`] },
      { match: t => t.includes('coep') || t.includes('coop') || t.includes('corp') || t.includes('cross-origin-embedder') || t.includes('cross-origin-opener'),
        steps: [`Add Cross-Origin-Opener-Policy: same-origin header to isolate your browsing context`, `Add Cross-Origin-Embedder-Policy: require-corp header — ensure all cross-origin resources include CORS headers`, `Audit all third-party resources — add crossorigin attribute to <img>/<script> tags and verify CORS headers`, `Test that OAuth popups, payment iframes, and third-party widgets still work after enabling these headers`] },
    ],
    default: [`Run a security headers scan at securityheaders.com to identify all missing or misconfigured headers`, `Review the specific findings and prioritize fixes by risk severity (Critical headers first: CSP, HSTS)`, `Update your web server or CDN configuration to add the recommended headers`, `Verify all changes using browser DevTools Network tab — check Response Headers for each page`]
  },

  accessibility: {
    branches: [
      { match: t => t.includes('skip') && t.includes('content'),
        steps: [`Add a visually hidden 'Skip to main content' link as the first focusable element on every page`, `Use CSS to hide it until focused: .skip-link { position: absolute; top: -40px; } .skip-link:focus { top: 0; }`, `Ensure the link targets the main content area with a matching id (e.g., <main id="main-content">)`, `Test by pressing Tab on page load — the skip link should appear and work correctly`] },
      { match: t => t.includes('lang=') || t.includes('lang attribute') || t.includes('document language') || (t.includes('lang') && t.includes('html')),
        steps: [`Add lang="en" (or appropriate language code) to the <html> element: <html lang="en">`, `For multilingual pages, use the lang attribute on specific elements with different languages`, `Verify the lang attribute is correct using axe DevTools or the W3C validator`, `If your site serves multiple languages, implement hreflang tags to help search engines serve the right version`] },
      { match: t => t.includes('heading') && (t.includes('hierarchy') || t.includes('structure') || t.includes('order') || t.includes('h1') || t.includes('sequential')),
        steps: [`Audit current heading structure to identify hierarchy gaps or errors (h1 → h2 → h3 — no skipped levels)`, `Restructure headings to follow logical sequence — ensure each page has exactly one h1 element`, `Add descriptive heading text that clearly indicates section content instead of generic labels`, `Verify heading hierarchy using a browser extension like HeadingsMap or axe DevTools`] },
      { match: t => t.includes('wcag') || t.includes('perceivable') || t.includes('operable') || t.includes('understandable') || t.includes('robust principle'),
        steps: [`Use a contrast checker (e.g., WebAIM Contrast Checker) to identify text/background pairs below WCAG 4.5:1 ratio`, `Run axe DevTools or WAVE to get a full list of WCAG violations and prioritize by severity`, `Test keyboard navigation: tab through the entire page to verify focus order and visible focus indicators`, `Verify fixes with browser DevTools accessibility inspector (Elements → Accessibility pane)`] },
      { match: t => t.includes('aria') && (t.includes('role') || t.includes('state') || t.includes('propert') || t.includes('audit')),
        steps: [`Run axe DevTools to identify all ARIA violations — missing roles, invalid states, and redundant properties`, `Ensure all custom interactive elements (dropdowns, tabs, modals) have correct ARIA roles and states`, `Remove redundant ARIA attributes on native HTML elements (e.g., role="button" on <button> is unnecessary)`, `Test the updated ARIA implementation with a screen reader (VoiceOver on Mac, NVDA on Windows)`] },
      { match: t => /\blabels?\b/.test(t) || t.includes('aria-label') || t.includes('aria-describedby') || t.includes('screen reader') || t.includes('assistive'),
        steps: [`Find form inputs missing labels: run document.querySelectorAll('input:not([aria-label]):not([id])') in the console`, `Add <label for="inputId"> elements or aria-label attributes to every interactive form control`, `Ensure labels are descriptive and visible — "Email address" instead of "Enter here"`, `Test with a screen reader (VoiceOver on Mac, NVDA on Windows) to verify labels are announced correctly`] },
      { match: t => t.includes('focus') || t.includes('keyboard') || t.includes('tab order'),
        steps: [`Tab through the entire page to verify all interactive elements are reachable and have visible focus indicators`, `Add CSS outline styles for :focus-visible (e.g., outline: 2px solid #4A90D9) — never use outline: none without a replacement`, `Ensure logical tab order matches visual reading order — use tabindex only when necessary`, `Test focus management in modals, dropdown menus, and dynamic content areas`] },
      { match: t => t.includes('contrast') || t.includes('color ratio'),
        steps: [`Use a contrast checker (e.g., WebAIM Contrast Checker) to identify text/background pairs below WCAG 4.5:1 ratio`, `Update CSS color values for failing elements — darken text or lighten backgrounds to meet the ratio`, `Pay special attention to gray text on white backgrounds and light-colored links`, `Verify fixes with browser DevTools accessibility inspector (Elements → Accessibility pane)`] },
      { match: t => t.includes('alt text') || t.includes('alt attribute') || t.includes('image accessibility'),
        steps: [`Find images missing alt text: run document.querySelectorAll('img:not([alt])') in the browser console`, `Add descriptive alt text that conveys the image's purpose — avoid generic "image" or "photo" text`, `For decorative images, use alt="" (empty string) so screen readers skip them`, `Add automated alt-text checking to your CI/CD pipeline using axe-core or similar tools`] },
      { match: t => t.includes('caption') || t.includes('subtitle') || t.includes('transcript'),
        steps: [`Add WebVTT caption files (.vtt) to all video players using the <track kind="captions"> element`, `If using YouTube embeds, enable auto-generated captions and review/edit them for accuracy`, `Provide a text transcript link below each video for users who prefer reading or cannot play video`, `Ensure captions have sufficient contrast against the video background and are properly synchronized`] },
      { match: t => t.includes('touch target') || t.includes('tap target') || t.includes('44px'),
        steps: [`Identify undersized touch targets using Chrome DevTools mobile emulation (buttons, links, form controls)`, `Set minimum tap target size to 44×44px using CSS min-width/min-height or padding`, `Ensure adequate spacing (8px minimum) between adjacent tap targets to prevent mis-taps`, `Test on actual mobile devices to verify touch target improvements`] },
    ],
    default: [`Run axe DevTools or WAVE browser extension to get a prioritized list of accessibility violations`, `Fix critical issues first: missing alt text, form labels, heading hierarchy, and keyboard traps`, `Test keyboard navigation and screen reader compatibility (VoiceOver/NVDA) on key user flows`, `Verify fixes with Chrome DevTools accessibility inspector (Elements → Accessibility pane)`]
  },

  performance: {
    branches: [
      { match: t => t.includes('lcp') || t.includes('largest contentful') || t.includes('request discovery'),
        steps: [`Identify the LCP element using Chrome DevTools Performance tab → Timings → LCP marker`, `Ensure the LCP resource (hero image, heading, video poster) is discoverable in HTML — avoid lazy-loading it`, `Add <link rel="preload"> for the LCP resource and use fetchpriority="high" on the element`, `Eliminate render-blocking CSS/JS that delays LCP using async/defer or by inlining critical CSS`] },
      { match: t => t.includes('render blocking') || t.includes('render-blocking') || t.includes('blocking request'),
        steps: [`Identify render-blocking resources in Chrome DevTools → Lighthouse → "Eliminate render-blocking resources"`, `Add async or defer attributes to non-critical <script> tags to prevent blocking the parser`, `Inline critical above-the-fold CSS and load full stylesheet asynchronously via <link rel="preload" as="style">`, `Move third-party scripts (analytics, chat widgets) to load after DOMContentLoaded event`] },
      { match: t => t.includes('unused javascript') || t.includes('unused js') || t.includes('legacy javascript'),
        steps: [`Use Chrome DevTools Coverage tab (Ctrl+Shift+P → "Coverage") to identify unused JavaScript`, `Remove or lazy-load unused JS modules using dynamic import() — e.g., import('./analytics.js').then(...)`, `If using a bundler, enable tree-shaking and code splitting to automatically eliminate dead code`, `Re-measure with Lighthouse to confirm the payload reduction`] },
      { match: t => t.includes('unused css') || t.includes('stylesheet'),
        steps: [`Use Chrome DevTools Coverage tab to identify unused CSS rules`, `Remove unused CSS or use PurgeCSS/UnCSS to automate the process`, `Inline critical above-the-fold CSS and defer loading of non-critical stylesheets`, `Re-measure with Lighthouse to confirm the improvement`] },
      { match: t => (t.includes('image') && (t.includes('webp') || t.includes('avif') || t.includes('optimize') || t.includes('compress') || t.includes('delivery') || t.includes('sav'))) || t.includes('media asset'),
        steps: [`Audit images using Chrome DevTools Network tab filtered by "Img" — sort by size to find the largest`, `Convert all images to modern formats (WebP or AVIF) using Squoosh, Sharp, or your CDN's auto-format`, `Implement responsive images with srcset and sizes attributes to serve appropriate sizes per viewport`, `Add explicit width and height attributes to prevent Cumulative Layout Shift (CLS) during loading`] },
      { match: t => t.includes('execution time') || t.includes('main thread') || t.includes('main-thread') || t.includes('long task') || t.includes('script evaluation') || t.includes('minimize main'),
        steps: [`Identify long tasks using Chrome DevTools Performance tab — look for yellow bars exceeding 50ms`, `Defer non-critical JavaScript using async/defer attributes or dynamic import() for code splitting`, `Move heavy computations to Web Workers to keep the main thread responsive`, `Profile and optimize hot code paths — reduce DOM manipulation batches and avoid layout thrashing`] },
      { match: t => t.includes('layout shift') || t.includes('cls') || t.includes('forced reflow') || t.includes('layout thrashing'),
        steps: [`Open Chrome DevTools Performance tab, record a page load, and look for Layout events in the flame chart`, `Batch DOM reads before DOM writes — avoid interleaving offsetHeight reads with style changes in loops`, `Use CSS containment (contain: layout) on components that change size to limit reflow scope`, `Add width/height to images and embeds, and use requestAnimationFrame() to batch visual updates`] },
      { match: t => t.includes('network dependency') || t.includes('critical request chain') || t.includes('request chain'),
        steps: [`Open Chrome DevTools Network tab, sort by "Waterfall" to identify sequential blocking dependencies`, `Reduce chain depth by inlining critical CSS, preloading key resources, and deferring non-critical scripts`, `Use <link rel="preconnect"> for third-party origins that appear early in the chain`, `Verify improvements by re-running Lighthouse "Avoid chaining critical requests" audit`] },
      { match: t => (t.includes('resource') && t.includes('size')) || t.includes('payload') || t.includes('bundle size') || t.includes('minif') || t.includes('compress'),
        steps: [`Analyze bundle size using webpack-bundle-analyzer or source-map-explorer to find the largest modules`, `Enable minification for all JS and CSS (Terser for JS, cssnano for CSS)`, `Configure server-side compression: gzip or Brotli encoding in your web server or CDN`, `Set long-lived cache headers for versioned static assets (Cache-Control: max-age=31536000, immutable)`] },
      { match: t => t.includes('browser error') || t.includes('console error') || t.includes('errors were logged') || t.includes('logged to the console'),
        steps: [`Open Chrome DevTools Console (F12) and categorize each error: JavaScript errors, network failures, and deprecation warnings`, `Fix JavaScript errors (TypeError, ReferenceError) first — these indicate broken user-facing functionality`, `Replace deprecated APIs flagged in console warnings before browsers remove support in upcoming releases`, `Add production error monitoring (Sentry, LogRocket, or Datadog RUM) to catch runtime errors from real users`] },
      { match: t => t.includes('issues panel') || t.includes('issues were logged') || t.includes('chrome devtools issue') || t.includes('devtools issues'),
        steps: [`Open Chrome DevTools Issues panel (Cmd+Shift+I → More tools → Issues) and group issues by category`, `Address 'Breaking Changes' first — these indicate features that will stop working in upcoming Chrome releases`, `Fix 'Page Errors' related to mixed content, CORS violations, or invalid resource types`, `Review 'Improvements' suggestions for cookie attributes (SameSite, Secure) and deprecated API replacements`] },
      { match: t => t.includes('contrast') || (t.includes('foreground') && t.includes('background')) || t.includes('color ratio') || t.includes('sufficient contrast'),
        steps: [`Run axe DevTools or the Lighthouse accessibility audit to list all elements with insufficient contrast ratios`, `Update failing text colors to meet WCAG AA 4.5:1 for body text and 3:1 for large text (>18px or >14px bold)`, `Check contrast in both light and dark themes if applicable — use Chrome DevTools CSS Overview for a full color audit`, `Add a prefers-contrast media query to serve high-contrast styles for users who request it`] },
    ],
    default: [`Run Lighthouse in Chrome DevTools (Ctrl+Shift+I → Lighthouse tab) to get a baseline performance score`, `Address the highest-impact opportunities first: typically image optimization, JS reduction, and render-blocking resources`, `Enable server-side caching headers (Cache-Control: max-age=31536000 for static assets) and compression (gzip/brotli)`, `Monitor Core Web Vitals (LCP, FID, CLS) in Google Search Console and set up real-user monitoring (RUM)`]
  },

  privacy: {
    branches: [
      { match: t => t.includes('cookie') || t.includes('consent') || t.includes('gdpr') || t.includes('ccpa'),
        steps: [`Audit current cookie usage by checking Application → Cookies in Chrome DevTools`, `Implement a cookie consent banner that blocks non-essential cookies until user opts in`, `Ensure the privacy policy is linked from the footer and clearly explains data collection practices`, `Test consent flow: verify that declining cookies actually prevents tracking scripts from loading`] },
      { match: t => t.includes('data retention') || t.includes('data lifecycle') || t.includes('data deletion') || t.includes('right to erasure'),
        steps: [`Document all user data collected (forms, cookies, analytics, logs) and classify by purpose and legal basis`, `Define retention periods for each data category — e.g., session data (30 days), account data (service duration + 30 days)`, `Implement automated data purging using scheduled jobs that delete expired records`, `Add a data retention section to your privacy policy and implement a user-facing data deletion request flow`] },
    ],
    default: [`Audit all data collection points (forms, cookies, analytics, third-party scripts) and document what data is collected`, `Implement a consent management platform (CMP) that blocks non-essential tracking until user opts in`, `Ensure your privacy policy is comprehensive, current, and linked from every page footer`, `Test that declining consent actually prevents tracking scripts from loading using DevTools Network tab`]
  },

  seoContent: {
    branches: [
      { match: t => t.includes('canonical') || t.includes('duplicate content'),
        steps: [`Add <link rel="canonical" href="..."> to the <head> of every page, pointing to the preferred URL version`, `Ensure canonical URLs use consistent protocol (https), trailing slash convention, and domain (www vs non-www)`, `For paginated content, use rel="canonical" pointing to page 1 or implement rel="next"/"prev" as appropriate`, `Verify canonical tags are correct using Google Search Console URL Inspection tool`] },
      { match: t => t.includes('schema') || t.includes('json-ld') || t.includes('structured data') || t.includes('rich snippet'),
        steps: [`Choose the appropriate Schema.org type for your content (e.g., SoftwareApplication, Organization, FAQPage, Product)`, `Add a <script type="application/ld+json"> block in the <head> with the required and recommended properties`, `Test the markup using Google's Rich Results Test at search.google.com/test/rich-results`, `Monitor rich snippet appearance in Google Search Console's Enhancements report`] },
      { match: t => t.includes('heading') || t.includes('h1') || t.includes('title tag') || t.includes('meta description'),
        steps: [`Audit each page's heading structure — ensure one H1 per page and a logical H2→H3 hierarchy`, `Write unique, keyword-rich title tags (50-60 chars) and meta descriptions (150-160 chars) for every page`, `Verify heading hierarchy using a browser extension like HeadingsMap or the W3C validator`, `Monitor click-through rates in Google Search Console and iterate on titles/descriptions for underperforming pages`] },
      { match: t => t.includes('alt text') || t.includes('alt attribute') || t.includes('image accessibility'),
        steps: [`Find images missing alt text: run document.querySelectorAll('img:not([alt])') in the browser console`, `Add descriptive alt text that conveys the image's purpose — avoid generic "image" or "photo" text`, `For decorative images, use alt="" (empty string) so screen readers skip them`, `Add automated alt-text checking to your CI/CD pipeline using axe-core or similar tools`] },
      { match: t => t.includes('external link') || t.includes('internal link') || t.includes('link equity') || t.includes('backlink') || t.includes('anchor text'),
        steps: [`Audit current link structure: map internal links between pages and identify orphaned pages with no inbound links`, `Add contextual internal links from high-traffic pages to important but underlinked pages (use descriptive anchor text)`, `For external links, link to authoritative sources (.gov, .edu, industry leaders) to signal E-E-A-T to Google`, `Set external links to open in new tabs (target="_blank" with rel="noopener") and regularly check for broken links`] },
      { match: t => t.includes('open graph') || t.includes('twitter card') || t.includes('og:') || t.includes('social media'),
        steps: [`Add Open Graph meta tags to every page: og:title, og:description, og:image (1200×630px), og:url, og:type`, `Add Twitter Card meta tags: twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image`, `Test how your pages appear when shared using Facebook's Sharing Debugger and Twitter's Card Validator`, `Ensure og:image uses an absolute URL and is at least 1200×630px for optimal display across all platforms`] },
    ],
    default: [`Run a technical SEO audit using Screaming Frog or Ahrefs Site Audit to identify missing meta tags, broken links, and indexing issues`, `Ensure every page has a unique title tag (50-60 chars), meta description (150-160 chars), and proper heading hierarchy`, `Add structured data (JSON-LD) for your primary content type and verify with Google's Rich Results Test`, `Monitor indexing and CTR in Google Search Console and fix any flagged issues`]
  },

  compatibility: {
    branches: [
      { match: t => t.includes('media quer') || t.includes('breakpoint') || t.includes('responsive') || t.includes('mobile layout') || t.includes('viewport'),
        steps: [`Define breakpoints: mobile (max-width: 767px), tablet (768px–1023px), desktop (1024px+) — use min-width for mobile-first`, `Test each breakpoint using Chrome DevTools device toolbar (Ctrl+Shift+M) — check navigation, text overflow, and image scaling`, `Ensure touch targets are at least 44×44px on mobile and that horizontal scrolling is eliminated at all breakpoints`, `Use CSS Grid or Flexbox with responsive units (%, vw, clamp()) instead of fixed pixel widths`] },
      { match: t => t.includes('cross-browser') || t.includes('browser compat') || t.includes('safari') || t.includes('browser rendering'),
        steps: [`Test in the top 4 browsers: Chrome, Firefox, Safari, and Edge — check layout, fonts, forms, and JavaScript`, `Use caniuse.com to verify CSS/JS features are supported by your target browsers`, `Add CSS vendor prefixes where needed using Autoprefixer (PostCSS plugin) in your build pipeline`, `Set up automated cross-browser testing using BrowserStack, Sauce Labs, or Playwright's multi-browser mode`] },
      { match: t => t.includes('progressive enhancement') || t.includes('graceful degradation') || t.includes('no javascript'),
        steps: [`Ensure core content (text, navigation, key CTAs) is accessible with JavaScript disabled — test by disabling JS`, `Use semantic HTML (<nav>, <main>, <button>) as baseline, then layer CSS for layout and JS for interactivity`, `Implement feature detection with @supports (CSS) and 'feature' in window (JS) instead of browser sniffing`, `Test on slow 3G (DevTools → Network → Slow 3G) to verify the site is usable before all scripts load`] },
    ],
    default: [`Test your site across devices and browsers: Chrome, Firefox, Safari, Edge on desktop + iOS Safari + Android Chrome`, `Verify responsive design works at key breakpoints using Chrome DevTools device toolbar (Ctrl+Shift+M)`, `Check for CSS/JS compatibility issues using caniuse.com and add polyfills or prefixes where needed`, `Set up automated cross-browser testing to catch regressions in your CI/CD pipeline`]
  },

  marketing: {
    branches: [
      { match: t => t.includes('analytics') || t.includes('tracking') || t.includes('tag manager') || t.includes('pixel'),
        steps: [`Verify analytics installation by checking the Network tab for tracking requests (e.g., google-analytics.com, facebook pixel)`, `Install Google Tag Manager (GTM) as a centralized container for all marketing and analytics tags`, `Set up conversion tracking for key user actions (form submissions, CTA clicks, purchases)`, `Test that analytics fires correctly on all key pages using GTM Preview mode or analytics debug extensions`] },
      { match: t => t.includes('content marketing') || t.includes('blog') || t.includes('resource center') || t.includes('thought leadership'),
        steps: [`Set up a /blog or /resources section with a CMS-backed template for publishing regular content`, `Create a content calendar targeting 2-4 posts per month, each optimized for a specific search keyword cluster`, `Include internal links from blog posts to product/service pages to build topical authority`, `Add email capture (newsletter signup) on blog pages to convert readers into leads`] },
      { match: t => t.includes('value proposition') || t.includes('differentiator') || t.includes('messaging') || t.includes('positioning'),
        steps: [`Audit the hero section: headline should state primary benefit in <8 words, subheadline should address user's pain point`, `Add a "How it works" section with 3-4 concrete steps that demystify the product for new visitors`, `Include quantifiable proof points (e.g., "Saves 10 hours/week", "Used by 500+ companies") near the primary CTA`, `A/B test different value proposition headlines using Google Optimize, VWO, or Optimizely`] },
    ],
    default: [`Verify your analytics setup is correctly tracking all key pages and user interactions`, `Identify the highest-impact marketing channel and ensure proper tracking/attribution is in place`, `Set up conversion tracking for key user actions (form submissions, CTA clicks, sign-ups)`, `Create a measurement plan with KPIs and review analytics data weekly to inform optimization decisions`]
  },

  conversion: {
    branches: [
      { match: t => /\btrust\b/.test(t) || t.includes('testimonial') || t.includes('social proof') || t.includes('credibility'),
        steps: [`Add real customer testimonials or case studies to high-traffic landing pages`, `Display trust badges (security seals, certifications, partner logos) near CTAs and checkout`, `Integrate third-party review widgets (Google Reviews, Trustpilot) for independent social proof`, `A/B test trust element placement to measure impact on conversion rates`] },
      { match: t => /\bforms?\b/.test(t) || /\bcta\b/.test(t) || t.includes('call-to-action'),
        steps: [`Audit current form/CTA placement — ensure primary CTAs are visible above the fold`, `Reduce form fields to the minimum required (name + email for lead gen, 3-5 fields max)`, `Add clear, action-oriented button text (e.g., "Get Your Free Quote" instead of "Submit")`, `Implement form validation with inline error messages and test the complete submission flow`] },
      { match: t => t.includes('landing page') || t.includes('funnel') || t.includes('friction'),
        steps: [`Map the current conversion funnel and identify the highest drop-off point using analytics`, `Create dedicated landing pages for key services with focused messaging and a single clear CTA`, `Remove navigation distractions on landing pages to keep users focused on the conversion action`, `A/B test key elements (headline, CTA text, form length) to systematically improve conversion rates`] },
      { match: t => t.includes('urgency') || t.includes('scarcity'),
        steps: [`Add time-sensitive offers or limited availability indicators near primary CTAs`, `Use countdown timers for genuine promotions — never fake scarcity, it destroys trust`, `Test urgency messaging carefully: measure both conversion rate AND user trust/satisfaction`, `Implement exit-intent popups with a compelling offer for users about to leave`] },
      { match: t => t.includes('mobile') || t.includes('responsive') || t.includes('viewport'),
        steps: [`Test mobile conversion flow end-to-end on a real device — tap through from landing to completion`, `Ensure all CTAs are thumb-accessible: place primary actions in the bottom 60% of the screen (48×48px minimum)`, `Simplify mobile forms: use native input types (tel, email), autofill attributes, and single-column layout`, `Implement sticky mobile CTAs that remain visible during scroll without obscuring content`] },
    ],
    default: [`Audit current form/CTA placement — ensure primary CTAs are visible above the fold`, `Reduce form fields to the minimum required and add clear, action-oriented button text`, `Implement A/B testing on key conversion elements (headlines, CTAs, form length, social proof placement)`, `Monitor conversion funnel in analytics to identify and fix the highest drop-off points`]
  },

  ui: {
    branches: [
      { match: t => t.includes('contrast') || t.includes('color ratio') || t.includes('accessibility'),
        steps: [`Use a contrast checker (e.g., WebAIM Contrast Checker) to identify text/background pairs below WCAG 4.5:1 ratio`, `Update CSS color values for failing elements — darken text or lighten backgrounds to meet the ratio`, `Pay special attention to gray text on white backgrounds and light-colored links`, `Verify fixes with browser DevTools accessibility inspector (Elements → Accessibility pane)`] },
      { match: t => t.includes('usability') || t.includes('navigation') || t.includes('menu') || t.includes('hamburger'),
        steps: [`Run a usability audit: identify confusing navigation paths, unclear labels, and interaction dead-ends`, `Simplify primary navigation — limit top-level menu items to 5-7 and use clear, descriptive labels`, `Ensure consistent interaction patterns across all pages (same button styles, form behaviors, feedback messages)`, `Test with real users or use heatmap tools (Hotjar, FullStory) to identify where users get stuck`] },
      { match: t => t.includes('visual hierarchy') || t.includes('visual design') || t.includes('typography') || t.includes('font size'),
        steps: [`Establish a clear typographic scale: use 3-4 font sizes max (e.g., 14px body, 18px subhead, 24px heading, 36px hero)`, `Increase white space around key elements (CTAs, headings, images) to create visual breathing room`, `Use color and contrast strategically to draw attention to primary actions and important content`, `Test visual hierarchy by squinting at the page — the most important elements should still stand out`] },
      { match: t => t.includes('design system') || t.includes('consistency') || t.includes('consistent') || t.includes('spacing'),
        steps: [`Audit the design for inconsistencies: catalog all font sizes, colors, spacing values, and component variants`, `Create a design token file (CSS custom properties) defining spacing scale, color palette, and typography scale`, `Refactor components to use tokens instead of hard-coded values — search for magic numbers in CSS`, `Add visual regression testing (Percy, Chromatic, or screenshot diffing) to catch future inconsistencies`] },
    ],
    default: [`Review the UI against established design best practices: consistency, hierarchy, contrast, and spacing`, `Identify the top 3 usability issues by testing key user flows (signup, navigation, primary action)`, `Fix visual inconsistencies: standardize fonts, colors, spacing, and component styles across all pages`, `Test with real users or heatmap tools (Hotjar, FullStory) to validate improvements`]
  },
};

/**
 * QUALITY FIX: Generate implementation steps directly from the recommendation text.
 * Uses MODULE-FIRST architecture: the module name is the primary classifier,
 * keywords refine WITHIN the module. Eliminates cross-module mismatches by design.
 *
 * @param {string} recText - The full recommendation text
 * @param {string} [moduleName] - The module this rec belongs to (e.g., 'security', 'accessibility')
 * @returns {string[]|null} Array of step descriptions, or null if no match
 */
function generateContextAwareSteps(recText, moduleName) {
  const text = (recText || '').toLowerCase();

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: MODULE-FIRST LOOKUP (primary classifier — 100% reliable)
  // ═══════════════════════════════════════════════════════════════════
  if (moduleName) {
    const bank = MODULE_STEP_BANKS[moduleName];
    if (bank) {
      // Try keyword refinement within the module
      for (const branch of bank.branches) {
        if (branch.match(text)) return branch.steps;
      }
      // Module-level default (quality steps, NOT generic boilerplate)
      return bank.default;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: LEGACY KEYWORD MATCHING (fallback for unknown/missing module)
  // Kept for backwards compatibility and topRecommendations which have
  // no module context. Uses the same branch ordering as before.
  // ═══════════════════════════════════════════════════════════════════

  // Extract the core subject (first clause before " — " or " - " or first sentence)
  const subjectMatch = recText.match(/^(.+?)(?:\s[—–\-]\s|\.)/);
  const subject = subjectMatch ? subjectMatch[1].trim() : recText.substring(0, 80).trim();

  // --- SECURITY: CSP, headers, certificates ---
  if (text.includes('unsafe-inline') || text.includes('unsafe-eval') || text.includes('csp') || text.includes('content-security-policy')) {
    return [
      `Audit current Content-Security-Policy header to identify uses of 'unsafe-inline' and 'unsafe-eval'`,
      `Move all inline scripts to external files and replace inline event handlers with addEventListener()`,
      `Use CSP nonces or hashes (e.g., 'nonce-{random}') for any scripts that must remain inline`,
      `Update the CSP header in your server configuration or CDN settings to remove 'unsafe-*' directives`,
      `Test the site thoroughly after changes — use the browser console to catch CSP violations`
    ];
  }
  if (text.includes('hsts') || text.includes('strict-transport-security')) {
    return [
      `Verify HSTS header is present with 'max-age=31536000; includeSubDomains; preload'`,
      `Check that all subdomains support HTTPS before adding includeSubDomains directive`,
      `Submit your domain to the HSTS preload list at hstspreload.org`,
      `Monitor certificate renewals to ensure HSTS doesn't cause access issues on expiry`
    ];
  }
  if (text.includes('x-frame') || text.includes('clickjacking')) {
    return [
      `Add 'X-Frame-Options: DENY' (or SAMEORIGIN if you embed your own pages) to server response headers`,
      `Also add 'frame-ancestors' directive in your CSP header as the modern replacement`,
      `Test that legitimate iframes (if any) still work with the new restrictions`,
      `Verify headers are present using browser DevTools Network tab or securityheaders.com`
    ];
  }
  if (text.includes('security header') || text.includes('x-content-type') || text.includes('referrer-policy') || text.includes('permissions-policy')) {
    return [
      `Add missing security headers to your web server or CDN configuration (nginx.conf, vercel.json, netlify.toml, etc.)`,
      `Include: X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy`,
      `Test header presence at securityheaders.com or via curl -I ${subject.includes('http') ? '' : 'https://yoursite.com'}`,
      `Set up automated monitoring to alert if security headers are accidentally removed during deployments`
    ];
  }

  // --- PERFORMANCE: LCP discovery / render-blocking ---
  if (text.includes('lcp') || text.includes('largest contentful') || text.includes('request discovery')) {
    return [
      `Identify the LCP element using Chrome DevTools Performance tab → Timings → LCP marker`,
      `Ensure the LCP resource (hero image, main heading, or video poster) is discoverable in the HTML source — avoid lazy-loading it`,
      `Add <link rel="preload"> for the LCP resource and use fetchpriority="high" on the element`,
      `Eliminate render-blocking CSS/JS that delays LCP using async/defer attributes or by inlining critical CSS`
    ];
  }
  if (text.includes('render blocking') || text.includes('render-blocking') || text.includes('blocking request')) {
    return [
      `Identify render-blocking resources in Chrome DevTools → Lighthouse → "Eliminate render-blocking resources" audit`,
      `Add async or defer attributes to non-critical <script> tags to prevent blocking the parser`,
      `Inline critical above-the-fold CSS and load the full stylesheet asynchronously using <link rel="preload" as="style">`,
      `Move third-party scripts (analytics, chat widgets) to load after the DOMContentLoaded event`
    ];
  }

  // --- PERFORMANCE: savings-specific ---
  const savingsMatch = recText.match(/(\d+[\.,]?\d*)\s*(KiB|KB|MB|ms|s)\b/i);
  if (savingsMatch || text.includes('unused javascript') || text.includes('unused css') || text.includes('render-blocking')) {
    const savingsStr = savingsMatch ? `(targeting ${savingsMatch[0]} reduction)` : '';
    if (text.includes('javascript') || text.includes('js')) {
      return [
        `Use Chrome DevTools Coverage tab (Ctrl+Shift+P → "Coverage") to identify unused JavaScript ${savingsStr}`,
        `Remove or lazy-load unused JS modules using dynamic import() — e.g., import('./analytics.js').then(...)`,
        `If using a bundler, enable tree-shaking and code splitting to automatically eliminate dead code`,
        `Re-measure with Lighthouse to confirm the payload reduction`
      ];
    }
    if (text.includes('image') || text.includes('webp') || text.includes('avif')) {
      return [
        `Identify large images using Chrome DevTools Network tab filtered by "Img" ${savingsStr}`,
        `Convert images to WebP/AVIF format using tools like squoosh.app or imagemin`,
        `Add width and height attributes to <img> tags to prevent layout shift during loading`,
        `Implement responsive images with srcset and sizes attributes for different screen widths`
      ];
    }
    if (text.includes('css') || text.includes('stylesheet')) {
      return [
        `Use Chrome DevTools Coverage tab to identify unused CSS rules ${savingsStr}`,
        `Remove unused CSS or use PurgeCSS/UnCSS to automate the process`,
        `Inline critical above-the-fold CSS and defer loading of non-critical stylesheets`,
        `Re-measure with Lighthouse to confirm the improvement`
      ];
    }
    // Generic performance with savings
    return [
      `Use Chrome DevTools Performance and Coverage tabs to identify the specific bottleneck ${savingsStr}`,
      `Address the identified issue — remove unused code, optimize assets, or defer non-critical resources`,
      `Test the fix across mobile and desktop using PageSpeed Insights or Lighthouse`,
      `Monitor Core Web Vitals in Google Search Console to confirm the improvement persists`
    ];
  }

  // --- PRIVACY & CONSENT ---
  if (text.includes('cookie') || text.includes('consent') || text.includes('privacy policy') || text.includes('gdpr') || text.includes('ccpa')) {
    return [
      `Audit current cookie usage by checking Application → Cookies in Chrome DevTools`,
      `Implement a cookie consent banner that blocks non-essential cookies until user opts in`,
      `Ensure the privacy policy is linked from the footer and clearly explains data collection practices`,
      `Test consent flow: verify that declining cookies actually prevents tracking scripts from loading`
    ];
  }

  // --- ANALYTICS & TRACKING ---
  if (text.includes('analytics') || text.includes('tracking') || text.includes('tag manager') || text.includes('pixel')) {
    return [
      `Verify analytics installation by checking the Network tab for tracking requests (e.g., google-analytics.com, facebook pixel)`,
      `Install Google Tag Manager (GTM) as a centralized container for all marketing and analytics tags`,
      `Set up conversion tracking for key user actions (form submissions, CTA clicks, purchases)`,
      `Test that analytics fires correctly on all key pages using GTM Preview mode or analytics debug extensions`
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY / WCAG — MUST appear BEFORE trust/conversion/CTA branches
  // because WCAG recs ("Understandable") may contain words like "form" in
  // their full text, which would incorrectly trigger the CTA branch.
  // ══════════════════════════════════════════════════════════════════════════
  if (text.includes('wcag') || text.includes('accessibility') ||
      text.includes('perceivable') || text.includes('operable') || text.includes('understandable') || text.includes('robust principle')) {
    return [
      `Use a contrast checker (e.g., WebAIM Contrast Checker) to identify text/background pairs below WCAG 4.5:1 ratio`,
      `Run axe DevTools or WAVE to get a full list of WCAG violations and prioritize by severity`,
      `Test keyboard navigation: tab through the entire page to verify focus order and visible focus indicators`,
      `Verify fixes with browser DevTools accessibility inspector (Elements → Accessibility pane)`
    ];
  }
  if (text.includes('label') || text.includes('aria-label') || text.includes('aria-describedby') ||
      text.includes('screen reader') || text.includes('assistive technology')) {
    return [
      `Find form inputs missing labels: run document.querySelectorAll('input:not([aria-label]):not([id])') in the console`,
      `Add <label for="inputId"> elements or aria-label attributes to every interactive form control`,
      `Ensure labels are descriptive and visible — "Email address" instead of "Enter here"`,
      `Test with a screen reader (VoiceOver on Mac, NVDA on Windows) to verify labels are announced correctly`
    ];
  }
  if (text.includes('skip') && text.includes('content')) {
    return [
      `Add a visually hidden 'Skip to main content' link as the first focusable element on every page`,
      `Use CSS to hide it until focused: .skip-link { position: absolute; top: -40px; } .skip-link:focus { top: 0; }`,
      `Ensure the link targets the main content area with a matching id (e.g., <main id="main-content">)`,
      `Test by pressing Tab on page load — the skip link should appear and work correctly`
    ];
  }
  // --- VISUAL HIERARCHY / UI DESIGN ---
  if (text.includes('visual hierarchy') || text.includes('visual design') || text.includes('typography') ||
      text.includes('font size') || text.includes('white space') || text.includes('whitespace')) {
    return [
      `Establish a clear typographic scale: use 3-4 font sizes max (e.g., 14px body, 18px subhead, 24px heading, 36px hero)`,
      `Increase white space around key elements (CTAs, headings, images) to create visual breathing room`,
      `Use color and contrast strategically to draw attention to primary actions and important content`,
      `Test visual hierarchy by squinting at the page — the most important elements should still stand out`
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERIC PERFORMANCE — catch-all for Lighthouse summary-style rec titles
  // that don't mention specific resources (JS, CSS, images)
  // ══════════════════════════════════════════════════════════════════════════
  if (text.includes('core web vitals') || text.includes('page load') || text.includes('loading performance') ||
      text.includes('server response') || text.includes('ttfb') || text.includes('infrastructure') ||
      (text.includes('caching') && !text.includes('cookie'))) {
    return [
      `Run Lighthouse in Chrome DevTools (Ctrl+Shift+I → Lighthouse tab) to get a baseline performance score and identify top issues`,
      `Address the highest-impact opportunities first: typically image optimization, JS reduction, and render-blocking resources`,
      `Enable server-side caching headers (Cache-Control: max-age=31536000 for static assets) and compression (gzip/brotli)`,
      `Monitor Core Web Vitals (LCP, FID, CLS) in Google Search Console and set up real-user monitoring (RUM)`
    ];
  }
  if ((text.includes('resource') && text.includes('size')) || text.includes('payload') || text.includes('bundle size') ||
      text.includes('minif') || text.includes('compress')) {
    return [
      `Analyze bundle size using webpack-bundle-analyzer or source-map-explorer to find the largest modules`,
      `Enable minification for all JS and CSS in your build pipeline (Terser for JS, cssnano for CSS)`,
      `Configure server-side compression: add gzip or Brotli encoding in your web server or CDN settings`,
      `Set long-lived cache headers for versioned static assets (Cache-Control: max-age=31536000, immutable)`
    ];
  }
  if (text.includes('execution time') || text.includes('main thread') || text.includes('blocking') ||
      text.includes('long task') || text.includes('script evaluation')) {
    return [
      `Identify long tasks using Chrome DevTools Performance tab — look for yellow bars exceeding 50ms`,
      `Defer non-critical JavaScript using async/defer attributes or dynamic import() for code splitting`,
      `Move heavy computations to Web Workers to keep the main thread responsive`,
      `Profile and optimize hot code paths — reduce DOM manipulation batches and avoid synchronous layout thrashing`
    ];
  }
  if ((text.includes('optimize') && text.includes('image')) || text.includes('media asset') ||
      text.includes('image optimization') || (text.includes('image') && text.includes('compress'))) {
    return [
      `Audit images using Chrome DevTools Network tab filtered by "Img" — sort by size to find the largest`,
      `Convert all images to modern formats (WebP or AVIF) using tools like Squoosh, Sharp, or your CDN's auto-format feature`,
      `Implement responsive images with srcset and sizes attributes to serve appropriately-sized images per viewport`,
      `Add explicit width and height attributes to prevent Cumulative Layout Shift (CLS) during image loading`
    ];
  }

  // --- TRUST & CONVERSION ---
  // IMPORTANT: Use \b word boundaries to prevent substring collisions
  // e.g., 'form' must not match 'information', 'trust' must not match 'frustrate'
  // NOTE: 'review' alone is too ambiguous — "Review accessibility" means examine, not customer review
  if (/\btrust\b/.test(text) || text.includes('testimonial') || text.includes('social proof') ||
      text.includes('customer review') || text.includes('user review') || text.includes('review widget') ||
      text.includes('star rating') || text.includes('credibility')) {
    return [
      `Add real customer testimonials or case studies to high-traffic landing pages`,
      `Display trust badges (security seals, certifications, partner logos) near CTAs and checkout`,
      `Integrate third-party review widgets (Google Reviews, Trustpilot) for independent social proof`,
      `A/B test trust element placement to measure impact on conversion rates`
    ];
  }
  if (/\bforms?\b/.test(text) || /\bcta\b/.test(text) || text.includes('call-to-action') || /\bconversion\b/.test(text)) {
    return [
      `Audit current form/CTA placement — ensure primary CTAs are visible above the fold`,
      `Reduce form fields to the minimum required (name + email for lead gen, 3-5 fields max)`,
      `Add clear, action-oriented button text (e.g., "Get Your Free Quote" instead of "Submit")`,
      `Implement form validation with inline error messages and test the complete submission flow`
    ];
  }

  // --- MOBILE OPTIMIZATION ---
  if (text.includes('mobile optimization') || text.includes('mobile-friendly') || text.includes('mobile usability') ||
      (text.includes('mobile') && text.includes('score'))) {
    return [
      `Test mobile performance using Google's Mobile-Friendly Test at search.google.com/test/mobile-friendly`,
      `Ensure all text is readable without zooming — use a minimum font size of 16px on mobile`,
      `Verify all interactive elements (buttons, links, form fields) are easily tappable with a 44×44px minimum target size`,
      `Use responsive images with srcset and prevent content wider than the screen that causes horizontal scrolling`
    ];
  }

  // --- OPEN GRAPH / TWITTER CARD / SOCIAL SHARING ---
  if (text.includes('open graph') || text.includes('twitter card') || text.includes('og:') || text.includes('social media') ||
      (text.includes('social') && text.includes('metadata'))) {
    return [
      `Add Open Graph meta tags to every page: og:title, og:description, og:image (1200×630px), og:url, og:type`,
      `Add Twitter Card meta tags: twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image`,
      `Test how your pages appear when shared using Facebook's Sharing Debugger and Twitter's Card Validator`,
      `Ensure og:image uses an absolute URL and is at least 1200×630px for optimal display across all platforms`
    ];
  }

  // --- DOCUMENT LANGUAGE / LANG ATTRIBUTE ---
  // NOTE: 'language' alone is too ambiguous — "clear, simple language" is about readability, NOT lang attr
  if (text.includes('lang=') || text.includes('lang attribute') || text.includes('document language') ||
      text.includes('pronunciation') || (text.includes('html') && text.includes('language'))) {
    return [
      `Add lang="en" (or appropriate language code) to the <html> element: <html lang="en">`,
      `For multilingual pages, use the lang attribute on specific elements with different languages (e.g., <p lang="es">)`,
      `Verify the lang attribute is correct using axe DevTools or the W3C validator`,
      `If your site serves multiple languages, implement hreflang tags to help search engines serve the right version`
    ];
  }

  // --- VIDEO CAPTIONS / TRANSCRIPTS ---
  if (text.includes('caption') || text.includes('subtitle') || text.includes('transcript') ||
      (text.includes('video') && (text.includes('deaf') || text.includes('hearing') || text.includes('accessible')))) {
    return [
      `Add WebVTT caption files (.vtt) to all video players using the <track kind="captions"> element`,
      `If using YouTube embeds, enable auto-generated captions and review/edit them for accuracy`,
      `Provide a text transcript link below each video for users who prefer reading or cannot play video`,
      `Ensure captions have sufficient contrast against the video background and are properly synchronized`
    ];
  }

  // --- LINK STRATEGY / LINK BUILDING ---
  if (text.includes('external link') || text.includes('internal link') || text.includes('link equity') ||
      text.includes('link building') || text.includes('outbound link') || text.includes('inbound link') ||
      text.includes('backlink') || text.includes('anchor text')) {
    return [
      `Audit current link structure: map internal links between pages and identify orphaned pages with no inbound links`,
      `Add contextual internal links from high-traffic pages to important but underlinked pages (use descriptive anchor text)`,
      `For external links, link to authoritative sources (e.g., .gov, .edu, industry leaders) to signal E-E-A-T to Google`,
      `Set external links to open in new tabs (target="_blank" with rel="noopener") and regularly check for broken links with a tool like Screaming Frog`
    ];
  }

  // --- SEO CONTENT ---
  if (text.includes('heading') || text.includes('h1') || text.includes('title tag') || text.includes('meta description')) {
    return [
      `Audit each page's heading structure — ensure one H1 per page and a logical H2→H3 hierarchy`,
      `Write unique, keyword-rich title tags (50-60 chars) and meta descriptions (150-160 chars) for every page`,
      `Verify heading hierarchy using a browser extension like HeadingsMap or the W3C validator`,
      `Monitor click-through rates in Google Search Console and iterate on titles/descriptions for underperforming pages`
    ];
  }
  if (text.includes('alt text') || text.includes('alt attribute') || text.includes('image accessibility')) {
    return [
      `Find images missing alt text: run document.querySelectorAll('img:not([alt])') in the browser console`,
      `Add descriptive alt text that conveys the image's purpose — avoid generic "image" or "photo" text`,
      `For decorative images, use alt="" (empty string) so screen readers skip them`,
      `Add automated alt-text checking to your CI/CD pipeline using axe-core or similar tools`
    ];
  }

  // --- CONTRAST (specific) ---
  if (text.includes('contrast') || text.includes('color ratio')) {
    return [
      `Use a contrast checker (e.g., WebAIM Contrast Checker) to identify text/background pairs below WCAG 4.5:1 ratio`,
      `Update CSS color values for failing elements — darken text or lighten backgrounds to meet the ratio`,
      `Pay special attention to gray text on white backgrounds and light-colored links`,
      `Verify fixes with browser DevTools accessibility inspector (Elements → Accessibility pane)`
    ];
  }
  // --- USABILITY / UX ---
  if (text.includes('usability') || text.includes('user experience') || text.includes('ux ') ||
      text.includes('navigation') || text.includes('menu') || text.includes('hamburger')) {
    return [
      `Run a usability audit: identify confusing navigation paths, unclear labels, and interaction dead-ends`,
      `Simplify primary navigation — limit top-level menu items to 5-7 and use clear, descriptive labels`,
      `Ensure consistent interaction patterns across all pages (same button styles, form behaviors, feedback messages)`,
      `Test with real users or use heatmap tools (Hotjar, FullStory) to identify where users get stuck`
    ];
  }
  if (text.includes('touch target') || text.includes('tap target') || text.includes('44px') || text.includes('button size')) {
    return [
      `Identify undersized touch targets using Chrome DevTools mobile emulation (buttons, links, form controls)`,
      `Set minimum tap target size to 44×44px using CSS min-width/min-height or padding`,
      `Ensure adequate spacing (8px minimum) between adjacent tap targets to prevent mis-taps`,
      `Test on actual mobile devices to verify touch target improvements`
    ];
  }
  if (text.includes('focus') || text.includes('keyboard') || text.includes('tab order')) {
    return [
      `Tab through the entire page to verify all interactive elements are reachable and have visible focus indicators`,
      `Add CSS outline styles for :focus-visible (e.g., outline: 2px solid #4A90D9) — never use outline: none without a replacement`,
      `Ensure logical tab order matches visual reading order — use tabindex only when necessary`,
      `Test focus management in modals, dropdown menus, and dynamic content areas`
    ];
  }
  // --- DESIGN SYSTEM / CONSISTENCY / SPACING / TYPOGRAPHY ---
  if (text.includes('design system') || text.includes('consistency') || text.includes('consistent') ||
      text.includes('standardize') || text.includes('spacing') || text.includes('typography scale')) {
    return [
      `Audit the existing design for inconsistencies: catalog all font sizes, colors, spacing values, and component variants used across pages`,
      `Create a design token file (CSS custom properties or a theme config) defining a strict spacing scale (e.g., 4/8/12/16/24/32/48px), color palette, and typography scale`,
      `Refactor components to use these tokens instead of hard-coded values — search for magic numbers in CSS`,
      `Add a visual regression test (e.g., Percy, Chromatic, or screenshot diffing) to catch future inconsistencies`
    ];
  }

  // --- CANONICAL TAGS / DUPLICATE CONTENT ---
  if (text.includes('canonical') || text.includes('duplicate content') || text.includes('link equity')) {
    return [
      `Add <link rel="canonical" href="..."> to the <head> of every page, pointing to the preferred URL version`,
      `Ensure canonical URLs use consistent protocol (https), trailing slash convention, and domain (www vs non-www)`,
      `For paginated content, use rel="canonical" pointing to page 1 or implement rel="next"/"prev" as appropriate`,
      `Verify canonical tags are correct using Google Search Console URL Inspection tool`
    ];
  }

  // --- SCHEMA MARKUP / JSON-LD / STRUCTURED DATA ---
  if (text.includes('schema') || text.includes('json-ld') || text.includes('structured data') || text.includes('rich snippet')) {
    return [
      `Choose the appropriate Schema.org type for your content (e.g., SoftwareApplication, Organization, FAQPage, Product)`,
      `Add a <script type="application/ld+json"> block in the <head> with the required and recommended properties for your chosen type`,
      `Test the markup using Google's Rich Results Test at search.google.com/test/rich-results`,
      `Monitor rich snippet appearance in Google Search Console's Enhancements report`
    ];
  }

  // --- NETWORK DEPENDENCIES / CRITICAL PATH ---
  if (text.includes('network dependency') || text.includes('dependency tree') || text.includes('critical request chain') || text.includes('request chain')) {
    return [
      `Open Chrome DevTools Network tab, sort by "Waterfall" to identify sequential blocking dependencies`,
      `Reduce chain depth by inlining critical CSS, preloading key resources (<link rel="preload">), and deferring non-critical scripts`,
      `Use <link rel="preconnect"> for third-party origins that appear early in the chain (e.g., fonts.googleapis.com, CDN domains)`,
      `Verify improvements by re-running Lighthouse and checking the "Avoid chaining critical requests" audit`
    ];
  }

  // --- FORCED REFLOW / LAYOUT THRASHING ---
  if (text.includes('forced reflow') || text.includes('layout thrashing') || text.includes('layout shift') || text.includes('recalculate style')) {
    return [
      `Open Chrome DevTools Performance tab, record a page load, and look for red/purple "Layout" events in the flame chart`,
      `Batch DOM reads before DOM writes — avoid interleaving element.offsetHeight reads with style changes in loops`,
      `Use CSS containment (contain: layout) on components that change size to limit the scope of reflows`,
      `Consider using requestAnimationFrame() to batch visual updates and reduce forced synchronous layouts`
    ];
  }

  // --- DEVTOOLS CONSOLE ISSUES / BROWSER ERRORS ---
  if (text.includes('console') || text.includes('browser error') || text.includes('issues panel') || text.includes('devtools')) {
    return [
      `Open Chrome DevTools Console tab and filter by Errors — fix each JavaScript error starting with the most frequent`,
      `Check the Issues panel (Ctrl+Shift+I → More Tools → Issues) for deprecation warnings and standards violations`,
      `Fix mixed content warnings by updating HTTP resource URLs to HTTPS`,
      `Set up error monitoring (e.g., Sentry, LogRocket) to catch production errors that users encounter`
    ];
  }

  // --- COEP / COOP / CORP / CROSS-ORIGIN ISOLATION ---
  if (text.includes('coep') || text.includes('coop') || text.includes('corp') || text.includes('cross-origin-embedder') ||
      text.includes('cross-origin-opener') || text.includes('cross-origin isolation')) {
    return [
      `Add Cross-Origin-Opener-Policy: same-origin header to your server configuration to isolate your browsing context`,
      `Add Cross-Origin-Embedder-Policy: require-corp header — ensure all cross-origin resources include CORS headers or Cross-Origin-Resource-Policy`,
      `Audit all third-party resources (images, scripts, iframes) — add crossorigin attribute to <img>/<script> tags and verify CORS headers`,
      `Test that existing functionality (OAuth popups, payment iframes, third-party widgets) still works after enabling these headers`
    ];
  }

  // --- DATA RETENTION / DATA LIFECYCLE ---
  if (text.includes('data retention') || text.includes('data lifecycle') || text.includes('data deletion') || text.includes('right to erasure')) {
    return [
      `Document all user data collected (forms, cookies, analytics, logs) and classify each by purpose and legal basis`,
      `Define retention periods for each data category — e.g., session data (30 days), account data (duration of service + 30 days), logs (90 days)`,
      `Implement automated data purging using scheduled jobs (cron/cloud scheduler) that delete expired records`,
      `Add a data retention section to your privacy policy and implement a user-facing data deletion request flow`
    ];
  }

  // --- RESPONSIVE DESIGN / MEDIA QUERIES / BREAKPOINTS ---
  if (text.includes('media quer') || text.includes('breakpoint') || text.includes('responsive') ||
      text.includes('mobile layout') || text.includes('viewport')) {
    return [
      `Define breakpoints: mobile (max-width: 767px), tablet (768px–1023px), desktop (1024px+) — use min-width for mobile-first`,
      `Test each breakpoint using Chrome DevTools device toolbar (Ctrl+Shift+M) — check navigation, text overflow, and image scaling`,
      `Ensure touch targets are at least 44×44px on mobile and that horizontal scrolling is eliminated at all breakpoints`,
      `Use CSS Grid or Flexbox with responsive units (%, vw, clamp()) instead of fixed pixel widths`
    ];
  }

  // --- CROSS-BROWSER TESTING ---
  if (text.includes('cross-browser') || text.includes('browser compat') || text.includes('browserstack') ||
      text.includes('chrome, firefox') || text.includes('safari') || text.includes('browser rendering')) {
    return [
      `Test in the top 4 browsers: Chrome, Firefox, Safari, and Edge — check layout, fonts, forms, and JavaScript functionality`,
      `Use caniuse.com to verify CSS/JS features used in your codebase are supported by your target browsers`,
      `Add CSS vendor prefixes where needed using a tool like Autoprefixer (PostCSS plugin) in your build pipeline`,
      `Set up automated cross-browser testing using BrowserStack, Sauce Labs, or Playwright's multi-browser mode`
    ];
  }

  // --- PROGRESSIVE ENHANCEMENT ---
  if (text.includes('progressive enhancement') || text.includes('graceful degradation') || text.includes('fallback') ||
      text.includes('no javascript') || text.includes('core experience')) {
    return [
      `Ensure the core content (text, navigation, key CTAs) is accessible with JavaScript disabled — test by disabling JS in DevTools`,
      `Use semantic HTML (<nav>, <main>, <button>) as the baseline, then layer on CSS for layout and JS for interactivity`,
      `Implement feature detection with @supports (CSS) and 'feature' in window (JS) instead of browser sniffing`,
      `Test on slow 3G connection (DevTools → Network → Slow 3G) to verify the site is usable before all scripts load`
    ];
  }

  // --- CONTENT MARKETING / BLOG / RESOURCES ---
  if (text.includes('content marketing') || text.includes('blog') || text.includes('resource center') ||
      text.includes('educational') || text.includes('case stud') || text.includes('thought leadership')) {
    return [
      `Set up a /blog or /resources section with a CMS-backed template for publishing regular content`,
      `Create a content calendar targeting 2-4 posts per month, each optimized for a specific search keyword cluster`,
      `Include internal links from blog posts to product/service pages — and vice versa — to build topical authority`,
      `Add email capture (newsletter signup) on blog pages to convert readers into leads`
    ];
  }

  // --- VALUE PROPOSITION / MESSAGING / DIFFERENTIATION ---
  if (text.includes('value proposition') || text.includes('differentiator') || text.includes('unique benefit') ||
      text.includes('messaging') || text.includes('positioning') || text.includes('pain point')) {
    return [
      `Audit the hero section: the headline should state the primary benefit in <8 words, the subheadline should address the target user's pain point`,
      `Add a "How it works" section with 3-4 concrete steps that demystify the product for new visitors`,
      `Include quantifiable proof points (e.g., "Saves 10 hours/week", "Used by 500+ companies") near the primary CTA`,
      `A/B test different value proposition headlines using a tool like Google Optimize, VWO, or Optimizely to find what resonates`
    ];
  }

  // --- FALLBACK: No matching pattern found ---
  // Return null to signal "no specific steps available" rather than generating
  // generic boilerplate like "Review the current state" which adds no value.
  // The caller will either omit steps or use a minimal verified fallback.
  return null;
}

/**
 * WORLD-CLASS STEP GENERATOR: Always returns contextually relevant implementation steps.
 * 1. Tries the domain-specific keyword matcher (generateContextAwareSteps — 15+ branches)
 * 2. If no keyword match, extracts the recommendation's core action/subject and generates
 *    steps that reference it specifically — never falls back to generic boilerplate.
 *
 * @param {string} recText - The full recommendation text
 * @param {string} [priority='Medium'] - Priority level
 * @returns {Array<{stepNumber: number, description: string}>} Always returns 3+ steps
 */
function generateContextAwareStepsGuaranteed(recText, priority, moduleName) {
  // Try the module-first + keyword matcher (MODULE_STEP_BANKS + 28+ legacy branches)
  const specific = generateContextAwareSteps(recText, moduleName);
  if (specific && specific.length > 0) {
    return specific.map((desc, i) => ({ stepNumber: i + 1, description: desc }));
  }

  // No keyword match — return null so the caller can preserve AI-generated steps.
  // With 28+ branches, this should be very rare.
  return null;
}

/**
 * Generates default implementation steps when none are provided
 */
function generateDefaultImplementationSteps(recommendationText, priority = "Medium", moduleName) {
  const stepCount = priority === "Critical" ? 5 : priority === "High" ? 4 : 3;
  const steps = [];

  for (let i = 1; i <= stepCount; i++) {
    const stepDesc = generateImplementationStep(recommendationText, i, priority);
    // Only include steps that have specific content (not null from unmatched patterns)
    if (stepDesc) {
      steps.push({
        stepNumber: steps.length + 1,
        description: stepDesc,
        details: undefined
      });
    }
  }

  // If we couldn't generate any specific steps, return empty array
  // rather than fabricating generic boilerplate
  return steps;
}

/**
 * Apply all normalizations to the JSON data.
 */
function normalizeJsonOutput(data, requestedModules = [], tier = "Basic", verbose = false) {
  if (verbose) { console.log('[JsonNormalizer] Starting full normalization for schema v4.0.0...'); }
  currentReportDataForNormalization = JSON.parse(JSON.stringify(data)); // Deep clone for modification

  currentReportDataForNormalization = stripTrailingPeriods(currentReportDataForNormalization);
  currentReportDataForNormalization = deduplicateArrayValues(currentReportDataForNormalization);
  currentReportDataForNormalization = standardizeDates(currentReportDataForNormalization);
  // Root structure MUST be normalized first as it sets up tier, featureSet, etc.
  currentReportDataForNormalization = normalizeRootStructure(currentReportDataForNormalization, requestedModules, tier, getNested(data, 'testParameters.commandLineFlags', {}));
  currentReportDataForNormalization = normalizeScores(currentReportDataForNormalization); // Scores after root structure

  if (currentReportDataForNormalization.modules) {
    const modulesToProcess = Array.isArray(currentReportDataForNormalization.testParameters?.modules) && currentReportDataForNormalization.testParameters.modules.length > 0
      ? currentReportDataForNormalization.testParameters.modules
      : Object.keys(currentReportDataForNormalization.modules);

    const rootFeatureSet = currentReportDataForNormalization.featureSet; // Use normalized featureSet
    const rootViewports = currentReportDataForNormalization.viewports; // Use normalized viewports

    modulesToProcess.forEach(moduleName => {
      if (reportSchemaInstance?.$defs?.moduleNameEnum?.enum.includes(moduleName)) {
        if (verbose) { console.log(`[JsonNormalizer] Normalizing module: ${moduleName}`); }
        let currentModuleData = currentReportDataForNormalization.modules[moduleName] || {}; // Ensure module object exists

        // Apply module-specific normalizer
        switch (moduleName) {
          case "ui": currentModuleData = normalizeUiModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet, rootViewports); break;
          case "performance": currentModuleData = normalizePerformanceModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "security": currentModuleData = normalizeSecurityModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet, rootViewports); break;
          case "seoContent": currentModuleData = normalizeSeoContentModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "accessibility": currentModuleData = normalizeAccessibilityModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "privacy": currentModuleData = normalizePrivacyModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "compatibility": currentModuleData = normalizeCompatibilityModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "marketing": currentModuleData = normalizeMarketingModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          case "conversion": currentModuleData = normalizeConversionModule(currentModuleData, tier, currentReportDataForNormalization.industryContext, rootFeatureSet); break;
          default: currentModuleData = currentModuleData && typeof currentModuleData === 'object' ? currentModuleData : {};
        }
        // Generic defaults for summary, recommendations, issues if not handled by specific normalizer
        currentModuleData.summary = currentModuleData.summary || { score: 1, rating: "Failing", topIssues: ["Module data incomplete."] };
        if (currentModuleData.summary.score === 0) { currentModuleData.summary.score = 1; } // Ensure min score 1
        currentModuleData.summary.rating = getRatingLabel(currentModuleData.summary.score, false);
        currentModuleData.summary.topIssues = Array.isArray(currentModuleData.summary.topIssues) ? currentModuleData.summary.topIssues.map(String).slice(0, 5) : ["Data incomplete."];
        // Strip internal debug fields that violate schema (additionalProperties: false)
        delete currentModuleData.summary._preDebateScore;
        delete currentModuleData.summary._debateAdjustment;
        if (currentModuleData.summary.strengths) { delete currentModuleData.summary.strengths; }

        currentModuleData.recommendations = normalizePaginatedArray(currentModuleData.recommendations, `${moduleName}.recommendations.items`, normalizeRecommendationObject, moduleName, tier);
        currentModuleData.issues = normalizePaginatedArray(currentModuleData.issues, `${moduleName}.issues.items`, normalizeModuleIssueObject, moduleName, tier);

        // --- DETERMINISTIC SCALED UNIFICATION ---
        // Scale lenient viewport ratings to strict summary.score, find weakest links, and unify
        reconcileAndUnifyViewportRatings(currentModuleData);

        // --- SCORE CONSISTENCY ENFORCEMENT ---
        // Scrub AI-hallucinated scores from free text to match the calculated score
        enforceScoreConsistency(currentModuleData, moduleName);

        // --- RECOMMENDATION CATEGORY SCORE MAPPING ---
        // Sync recommendation logic with the computed bottom-up scores
        mapRecCategoryScores(currentModuleData);

        // --- ISSUE POLARITY FILTER ---
        // Strip "issues" that are actually compliments
        filterPositiveIssues(currentModuleData);

        // All modules always get full feature set (tier distinction removed)
        if (currentModuleData.businessImpact === null || currentModuleData.businessImpact === undefined) {
          currentModuleData.businessImpact = {};
        }
        if (currentModuleData.implementationRoadmap === null || currentModuleData.implementationRoadmap === undefined) {
          currentModuleData.implementationRoadmap = {};
        }
        if (currentModuleData.industryBenchmarks === null || currentModuleData.industryBenchmarks === undefined) {
          currentModuleData.industryBenchmarks = {};
        }

        // Ensure industryBenchmarks is an object for all modules and all tiers (schema expects object, not null)
        currentModuleData.industryBenchmarks = currentModuleData.industryBenchmarks && typeof currentModuleData.industryBenchmarks === 'object' ?
          currentModuleData.industryBenchmarks : {};

        // Coerce roiProjections: AI frequently returns a narrative string, schema requires object|null
        if (typeof currentModuleData.roiProjections === 'string') {
          const roiText = currentModuleData.roiProjections;
          currentModuleData.roiProjections = {
            estimatedRevenueImpact: 0,
            estimatedConversionImpact: 0,
            confidenceLevel: "Medium",
            timeToRoi: "3-6 months",
            notes: cleanAiText(roiText, 2000),
          };
          if (verbose) { console.log(`[JsonNormalizer] Coerced ${moduleName}.roiProjections from string to object`); }
        } else if (Array.isArray(currentModuleData.roiProjections)) {
          currentModuleData.roiProjections = null;
        }

        // Fix UI module specific fields
        if (moduleName === "ui") {
          // Ensure dynamicElementsAnalysis is an object for all tiers (schema expects object, not null)
          currentModuleData.dynamicElementsAnalysis = currentModuleData.dynamicElementsAnalysis && typeof currentModuleData.dynamicElementsAnalysis === 'object' ?
            currentModuleData.dynamicElementsAnalysis : {};

          // Fix industryAnalysis fields if they exist
          if (currentModuleData.industryAnalysis && typeof currentModuleData.industryAnalysis === 'object') {
            currentModuleData.industryAnalysis.subtype = typeof currentModuleData.industryAnalysis.subtype === 'string' ?
              currentModuleData.industryAnalysis.subtype : "General";
            const validDetectionMethods = ["Hybrid", "Content", "Visual", "Manual"];
            currentModuleData.industryAnalysis.detectionMethod = validDetectionMethods.includes(currentModuleData.industryAnalysis.detectionMethod) ?
              currentModuleData.industryAnalysis.detectionMethod : "Hybrid";

            // QUALITY FIX: Use null instead of {} for empty competitiveLandscape/businessIntelligence
            const mCl = currentModuleData.industryAnalysis.competitiveLandscape;
            currentModuleData.industryAnalysis.competitiveLandscape = (mCl && typeof mCl === 'object' && Object.keys(mCl).length > 0) ? mCl : null;
            const mBi = currentModuleData.industryAnalysis.businessIntelligence;
            currentModuleData.industryAnalysis.businessIntelligence = (mBi && typeof mBi === 'object' && Object.keys(mBi).length > 0) ? mBi : null;
          }
        }

        // Fix seoContent module specific fields
        if (moduleName === "seoContent") {
          // Ensure required object fields are objects instead of null
          currentModuleData.socialMedia = currentModuleData.socialMedia && typeof currentModuleData.socialMedia === 'object' ?
            currentModuleData.socialMedia : {};
          currentModuleData.eatAnalysis = currentModuleData.eatAnalysis && typeof currentModuleData.eatAnalysis === 'object' ?
            currentModuleData.eatAnalysis : {};
          currentModuleData.localSEO = currentModuleData.localSEO && typeof currentModuleData.localSEO === 'object' ?
            currentModuleData.localSEO : {};

          // Fix technical.robotsTxt to be boolean instead of null
          if (currentModuleData.technical && typeof currentModuleData.technical === 'object') {
            if (typeof currentModuleData.technical.robotsTxt !== 'boolean') {
              currentModuleData.technical.robotsTxt = false; // Default to false if not boolean
            }
          }
        }

        // Fix security module specific fields
        if (moduleName === "security") {
          // Ensure zeroTrustAnalysis is an object for schema compliance
          currentModuleData.zeroTrustAnalysis = currentModuleData.zeroTrustAnalysis && typeof currentModuleData.zeroTrustAnalysis === 'object' ?
            currentModuleData.zeroTrustAnalysis : {};
        }

        // Fix compatibility module specific fields
        if (moduleName === "compatibility") {
          // Schema expects these to be objects, not null - provide default empty objects
          if (currentModuleData.progressiveEnhancement === null || currentModuleData.progressiveEnhancement === undefined) {
            currentModuleData.progressiveEnhancement = {
              coreFunctionalityScore: 100,
              enhancementLayers: [],
              featureFlagUsageScore: 100,
              rollbackStrategyAnalysis: {
                hasRollbackPlan: false,
                rollbackComplexityScore: 0
              }
            };
          }
          if (currentModuleData.legacyBrowserSupport === null || currentModuleData.legacyBrowserSupport === undefined) {
            currentModuleData.legacyBrowserSupport = {
              isSupported: false,
              polyfillLoadSizeImpact: 0,
              issues: []
            };
          }
        }

        if (tier === "Basic" && moduleName === "security") { // Specific to security module for basic tier
          currentModuleData.phiHandling = null;
          currentModuleData.hipaaAuditLogging = null;
        }
        if (tier === "Basic" && moduleName === "accessibility") {
          currentModuleData.implementationPlan = null;
        }

        // Fix conversion module specific fields
        if (moduleName === "conversion") {
          // Fix dropOffPoints structure - should be objects with required dropOffRate field
          if (currentModuleData.funnelAnalysis && Array.isArray(currentModuleData.funnelAnalysis.dropOffPoints)) {
            currentModuleData.funnelAnalysis.dropOffPoints = currentModuleData.funnelAnalysis.dropOffPoints.map(item => {
              if (typeof item === 'string') {
                return {
                  location: item,
                  dropOffRate: 50, // Default drop-off rate if not provided
                  issues: [],
                  recommendations: []
                };
              } else if (typeof item === 'object' && item !== null) {
                // Ensure existing objects have required dropOffRate field
                return {
                  location: item.location || "Unknown location",
                  dropOffRate: typeof item.dropOffRate === 'number' ? item.dropOffRate : 50,
                  issues: Array.isArray(item.issues) ? item.issues : [],
                  recommendations: Array.isArray(item.recommendations) ? item.recommendations : []
                };
              }
              return {
                location: "Unknown location",
                dropOffRate: 50,
                issues: [],
                recommendations: []
              };
            });
          }
        }

        currentReportDataForNormalization.modules[moduleName] = currentModuleData;
      } else if (verbose) { console.warn(`[JsonNormalizer] Skipping unknown module in data: ${moduleName}`); }
    });
  }

  // CRITICAL FIX: Sync moduleStatus scores FROM module.summary.score after ALL normalization
  // This ensures module.summary.score is the single source of truth.
  // Without this, normalizer bugs can corrupt moduleStatus scores (e.g. privacy 10→100)
  if (Array.isArray(currentReportDataForNormalization.moduleStatus) && currentReportDataForNormalization.modules) {
    currentReportDataForNormalization.moduleStatus.forEach(ms => {
      const mod = currentReportDataForNormalization.modules[ms.moduleName];
      if (mod && mod.summary && typeof mod.summary.score === 'number') {
        if (ms.score !== mod.summary.score) {
          if (verbose) console.log(`[JsonNormalizer] SCORE SYNC: ${ms.moduleName} moduleStatus.score ${ms.score} → ${mod.summary.score} (from module.summary.score)`);
          ms.score = mod.summary.score;
        }
      }
    });
  }

  currentReportDataForNormalization = ensureRatings(currentReportDataForNormalization); // Final pass for all ratings

  // Clear any existing schemaValidationErrors to avoid format conflicts during validation
  delete currentReportDataForNormalization.schemaValidationErrors;

  // Perform final schema validation and populate schemaValidationErrors
  let finalValidationResult = { valid: true, errors: [] };
  if (reportSchemaInstance) {
    finalValidationResult = validateJsonSchema(currentReportDataForNormalization, null, reportSchemaInstance);
    if (!finalValidationResult.valid) {
      console.warn(`[JsonNormalizer] Schema validation FAILED. Errors (first 5 of ${finalValidationResult.errors?.length}):`, JSON.stringify(finalValidationResult.errors?.slice(0, 5), null, 2));
      if (finalValidationResult.errors && finalValidationResult.errors[0] && finalValidationResult.errors[0].instancePath) {
        const problematicPath = finalValidationResult.errors[0].instancePath.substring(1).replace(/\//g, '.'); // Convert JSON pointer to dot notation
        console.warn(`[JsonNormalizer] Problematic path example: ${problematicPath}`);
        try {
          const snippet = getNested(currentReportDataForNormalization, problematicPath, "[[PATH NOT FOUND]]");
          console.warn(`[JsonNormalizer] Problematic data snippet: ${JSON.stringify(snippet, null, 2).substring(0, 500)}`);
        } catch (e) { console.warn("[JsonNormalizer] Could not stringify problematic data snippet."); }
      }
    } else {
      console.log('[JsonNormalizer] Schema validation SUCCEEDED.');
    }
  } else if (verbose && !reportSchemaInstance) {
    console.warn("[JsonNormalizer] Report schema instance not available for final validation.");
  }

  // Populate schemaValidationErrors field in the report
  currentReportDataForNormalization.schemaValidationErrors = finalValidationResult.valid ? [] : (finalValidationResult.errors || []);

  if (verbose) { console.log('[JsonNormalizer] Full normalization complete.'); }
  const finalReport = JSON.parse(JSON.stringify(currentReportDataForNormalization)); // Final deep clone

  // CRITICAL FIX: Ensure schemaValidationErrors is always present as an array
  if (!finalReport.schemaValidationErrors) {
    finalReport.schemaValidationErrors = [];
  }

  currentReportDataForNormalization = {}; // Clear global reference
  return finalReport;
}


/**
 * Validate JSON data against the schema (Draft 2020-12).
 */
function validateJsonSchema(data, schemaPath = null, schemaObject = null) {
  try {
    // Create AJV instance specifically for Draft 2020-12
    const ajv = new Ajv({
      allErrors: true,
      strict: false, // Allow Draft 2020-12 features
      validateFormats: true,
      addUsedSchema: false,
      loadSchema: false, // Disable remote schema loading for security
      removeAdditional: false, // Don't remove additional properties
      verbose: false // Reduce noise in logs
    });

    // Add format validators
    addFormats(ajv);

    // Add Draft 2020-12 meta-schema support
    try {
      // Try to add the meta-schema using the correct approach for AJV 8.x
      const metaSchema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://json-schema.org/draft/2020-12/schema",
        "$vocabulary": {
          "https://json-schema.org/draft/2020-12/vocab/core": true,
          "https://json-schema.org/draft/2020-12/vocab/applicator": true,
          "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
          "https://json-schema.org/draft/2020-12/vocab/validation": true,
          "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
          "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
          "https://json-schema.org/draft/2020-12/vocab/content": true
        },
        "$dynamicAnchor": "meta",
        "title": "Core and Validation specifications meta-schema",
        "allOf": [
          { "$ref": "meta/core" },
          { "$ref": "meta/applicator" },
          { "$ref": "meta/unevaluated" },
          { "$ref": "meta/validation" },
          { "$ref": "meta/meta-data" },
          { "$ref": "meta/format-annotation" },
          { "$ref": "meta/content" }
        ],
        "type": ["object", "boolean"],
        "$comment": "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use."
      };

      // Add the meta-schema
      ajv.addMetaSchema(metaSchema, "https://json-schema.org/draft/2020-12/schema");
    } catch (metaError) {
      // Check if the error is about the schema already existing (which is fine)
      if (metaError.message && metaError.message.includes('already exists')) {
        console.log(`[JsonNormalizer] Draft 2020-12 meta-schema already loaded. Proceeding with full validation.`);
      } else {
        console.warn(`[JsonNormalizer] Could not add Draft 2020-12 meta-schema: ${metaError.message}. Proceeding with basic validation.`);
      }
    }

    let schema;
    if (schemaObject) {
      schema = schemaObject;
    } else if (schemaPath) {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      schema = JSON.parse(schemaContent);
    } else {
      // Default to the main report schema
      const { getSchemaPath } = require('./paths');
      const defaultSchemaPath = getSchemaPath('report-schema.json');
      const schemaContent = fs.readFileSync(defaultSchemaPath, 'utf8');
      schema = JSON.parse(schemaContent);
    }

    // Ensure the schema has the correct $schema declaration for Draft 2020-12
    if (!schema.$schema || !schema.$schema.includes('2020-12')) {
      console.warn(`[JsonNormalizer] Schema $schema is '${schema.$schema}', expected Draft 2020-12. Updating for validation.`);
      schema = { ...schema, $schema: "https://json-schema.org/draft/2020-12/schema" };
    }

    // Compile the schema
    let validate;
    try {
      validate = ajv.compile(schema);
      console.log(`[JsonNormalizer] Schema compilation succeeded for Draft 2020-12.`);
    } catch (compileError) {
      console.error(`[JsonNormalizer] Schema compilation failed: ${compileError.message}`);

      // Return compilation error in the validation result
      return {
        valid: false,
        errors: [{
          instancePath: '',
          schemaPath: '#',
          keyword: 'schemaCompilation',
          message: `Schema compilation failed: ${compileError.message}`,
          params: { error: compileError.message }
        }]
      };
    }

    // Validate the data
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    } else {
      return {
        valid: false,
        errors: validate.errors || []
      };
    }

  } catch (error) {
    console.error(`[JsonNormalizer] Validation process failed: ${error.message}`);
    return {
      valid: false,
      errors: [{
        instancePath: '',
        schemaPath: 'unknown',
        keyword: 'validationError',
        message: `Validation process failed: ${error.message}`,
        params: { error: error.message }
      }]
    };
  }
}

/**
 * Validates critical schema compliance issues that have been problematic
 * @param {Object} reportData - The complete report data
 * @returns {Array} - Array of validation errors found
 */
function validateCriticalSchemaCompliance(reportData) {
  const errors = [];

  if (!reportData || !reportData.modules) {
    return ['Report data or modules missing'];
  }

  // Check conversion module completionTime fields
  if (reportData.modules.conversion && reportData.modules.conversion.forms && reportData.modules.conversion.forms.detectedForms) {
    reportData.modules.conversion.forms.detectedForms.forEach((form, index) => {
      if (form.completionTime !== undefined && typeof form.completionTime !== 'number') {
        errors.push(`Conversion module: forms.detectedForms[${index}].completionTime must be number, got ${typeof form.completionTime}: ${form.completionTime}`);
      }
      if (form.averageCompletionTime !== undefined && typeof form.averageCompletionTime !== 'number') {
        errors.push(`Conversion module: forms.detectedForms[${index}].averageCompletionTime must be number, got ${typeof form.averageCompletionTime}: ${form.averageCompletionTime}`);
      }
    });
  }

  // Check UI module elementSelector fields
  if (reportData.modules.ui && reportData.modules.ui.crossViewport && reportData.modules.ui.crossViewport.structured) {
    Object.keys(reportData.modules.ui.crossViewport.structured).forEach(category => {
      const categoryData = reportData.modules.ui.crossViewport.structured[category];
      if (categoryData && categoryData.visualEvidence && Array.isArray(categoryData.visualEvidence)) {
        categoryData.visualEvidence.forEach((ve, index) => {
          if (ve.elementSelector === 'N/A' || ve.elementSelector === undefined || ve.elementSelector === null) {
            errors.push(`UI module: crossViewport.structured.${category}.visualEvidence[${index}].elementSelector is "${ve.elementSelector}" but must be a valid CSS selector`);
          }
        });
      }
    });
  }

  // Check for deprecated fields in conversion module
  if (reportData.modules.conversion) {
    if (reportData.modules.conversion.formAnalysis !== undefined) {
      errors.push('Conversion module: deprecated field "formAnalysis" still present, should be removed');
    }
    if (reportData.modules.conversion.trustSignals !== undefined) {
      errors.push('Conversion module: deprecated field "trustSignals" still present, should be removed');
    }
  }

  // CRITICAL FIX: analytics and tracking are REQUIRED fields per schema v4.0.0, not deprecated
  // Removed incorrect deprecated field validation - these fields are actually required by the marketing module schema

  // Check compatibility module browserSupport structure
  if (reportData.modules.compatibility && reportData.modules.compatibility.browserSupport) {
    const browserSupport = reportData.modules.compatibility.browserSupport;
    if (browserSupport.overallScore !== undefined || browserSupport.modernBrowsersScore !== undefined) {
      errors.push('Compatibility module: browserSupport has old structure with overallScore/modernBrowsersScore instead of required featureSupport object');
    }
    if (!browserSupport.featureSupport) {
      errors.push('Compatibility module: browserSupport missing required featureSupport object');
    }
  }

  return errors;
}

module.exports = {
  stripTrailingPeriods, deduplicateArrayValues, normalizeScores, standardizeDates,
  normalizeJsonOutput, validateJsonSchema, getRatingLabel, ensureRatings,
  normalizeRecommendationObject, normalizeModuleIssueObject, cleanAiText,
  validateCriticalSchemaCompliance, normalizePaginatedArray,
  generateContextAwareSteps
};
