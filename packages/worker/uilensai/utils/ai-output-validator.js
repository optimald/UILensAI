/**
 * AI Output Validator — validates individual AI module responses against
 * the schema *before* the normalizer fills in defaults. This catches bad
 * AI output at the trust boundary rather than silently patching it.
 *
 * Also provides hallucination detection by cross-referencing AI claims
 * against deterministic collected data.
 */

const fs = require('fs');
const path = require('path');
const { getSchemaPath } = require('./paths');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// ─── Schema Singleton ────────────────────────────────────────────────────────

let _schemaCache = null;

function loadReportSchema() {
  if (_schemaCache) return _schemaCache;
  const schemaPath = getSchemaPath('report-schema.json');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  _schemaCache = JSON.parse(raw);
  return _schemaCache;
}

/**
 * Get the $defs fragment for a specific module.
 * Maps module names to their schema definition keys.
 */
function getModuleSchemaFragment(moduleName) {
  const schema = loadReportSchema();
  if (!schema.$defs) return null;

  const moduleDefMap = {
    security:      'securityModule',
    seoContent:    'seoContentModule',
    performance:   'performanceModule',
    accessibility: 'accessibilityModule',
    privacy:       'privacyModule',
    compatibility: 'compatibilityModule',
    marketing:     'marketingModule',
    conversion:    'conversionModule',
    ui:            'uiModule',
  };

  const defKey = moduleDefMap[moduleName];
  if (!defKey || !schema.$defs[defKey]) return null;

  // Return a self-contained schema with $defs for resolution
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema.$defs[defKey],
    $defs: schema.$defs,
  };
}

// ─── Module Response Validator ───────────────────────────────────────────────

/**
 * Validate an AI module response against its schema fragment.
 * Unlike the final-report validator, this runs BEFORE normalization,
 * so it catches what the AI actually returned.
 *
 * @param {string} moduleName - e.g. "security", "seoContent"
 * @param {object} aiResponse - the raw parsed JSON from the AI
 * @returns {{ valid: boolean, errors: object[], confidence: 'high'|'medium'|'low', fieldsMissing: string[], fieldsWrongType: string[] }}
 */
function validateModuleAiResponse(moduleName, aiResponse) {
  const result = {
    valid: true,
    errors: [],
    confidence: 'high',
    fieldsMissing: [],
    fieldsWrongType: [],
    fieldsValidated: 0,
    fieldsFlagged: 0,
  };

  if (!aiResponse || typeof aiResponse !== 'object') {
    return { ...result, valid: false, confidence: 'low', errors: [{ message: 'AI response is null or not an object' }] };
  }

  // --- Structural checks (schema-independent, always run) ---
  const requiredTopLevel = {
    security:      ['summary', 'headers', 'ssl', 'recommendations', 'issues'],
    seoContent:    ['summary', 'metadata', 'content', 'recommendations', 'issues'],
    performance:   ['summary', 'metrics', 'recommendations', 'issues'],
    accessibility: ['summary', 'wcagCompliance', 'recommendations', 'issues'],
    privacy:       ['summary', 'recommendations', 'issues'],
    compatibility: ['summary', 'browserCompatibility', 'recommendations', 'issues'],
    marketing:     ['summary', 'recommendations', 'issues'],
    conversion:    ['summary', 'recommendations', 'issues'],
    ui:            ['summary'],
  };

  const expected = requiredTopLevel[moduleName] || ['summary'];
  for (const field of expected) {
    result.fieldsValidated++;
    if (aiResponse[field] === undefined || aiResponse[field] === null) {
      result.fieldsMissing.push(field);
      result.fieldsFlagged++;
    }
  }

  // --- Summary validation (all modules) ---
  if (aiResponse.summary) {
    result.fieldsValidated++;
    if (typeof aiResponse.summary.score !== 'number' || aiResponse.summary.score < 0 || aiResponse.summary.score > 100) {
      result.fieldsWrongType.push('summary.score');
      result.fieldsFlagged++;
    }
    result.fieldsValidated++;
    if (!Array.isArray(aiResponse.summary.topIssues) || aiResponse.summary.topIssues.length === 0) {
      result.fieldsMissing.push('summary.topIssues');
      result.fieldsFlagged++;
    }
  }

  // --- Recommendations validation ---
  const recs = aiResponse.recommendations;
  if (recs) {
    const items = Array.isArray(recs) ? recs : (Array.isArray(recs.items) ? recs.items : null);
    result.fieldsValidated++;
    if (!items || items.length === 0) {
      result.fieldsMissing.push('recommendations.items');
      result.fieldsFlagged++;
    } else {
      // Spot-check first recommendation
      const first = items[0];
      result.fieldsValidated++;
      if (!first.text || typeof first.text !== 'string' || first.text.length < 10) {
        result.fieldsWrongType.push('recommendations.items[0].text');
        result.fieldsFlagged++;
      }
    }
  }

  // --- Issues validation ---
  const issues = aiResponse.issues;
  if (issues) {
    const items = Array.isArray(issues) ? issues : (Array.isArray(issues.items) ? issues.items : null);
    result.fieldsValidated++;
    if (!items || items.length === 0) {
      result.fieldsMissing.push('issues.items');
      result.fieldsFlagged++;
    }
  }

  // --- AJV schema validation (best-effort, non-blocking) ---
  try {
    const fragment = getModuleSchemaFragment(moduleName);
    if (fragment) {
      const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
      addFormats(ajv);
      const validate = ajv.compile(fragment);
      const schemaValid = validate(aiResponse);
      if (!schemaValid && validate.errors) {
        // Only count unique field paths as flagged (AJV can be noisy)
        const uniquePaths = new Set(validate.errors.map(e => e.instancePath || e.schemaPath));
        result.fieldsFlagged += Math.min(uniquePaths.size, 10); // Cap noise
        result.errors.push(...validate.errors.slice(0, 20)); // Keep first 20 errors
      }
    }
  } catch (e) {
    // Schema compilation can fail for complex modules — don't block
    console.warn(`[AIOutputValidator] Schema validation skipped for ${moduleName}: ${e.message}`);
  }

  // --- Confidence scoring ---
  const flagRate = result.fieldsValidated > 0 ? result.fieldsFlagged / result.fieldsValidated : 0;
  if (result.fieldsMissing.length >= 3 || flagRate > 0.4) {
    result.confidence = 'low';
    result.valid = false;
  } else if (result.fieldsMissing.length >= 1 || flagRate > 0.15) {
    result.confidence = 'medium';
  } else {
    result.confidence = 'high';
  }

  return result;
}

// ─── Hallucination Detector ──────────────────────────────────────────────────

/**
 * Cross-reference AI claims against deterministic collected data.
 * Returns flagged fields where AI output contradicts observed reality.
 *
 * @param {string} moduleName
 * @param {object} aiResponse - the parsed AI module response
 * @param {object} collectedData - deterministic data from the analyze module
 * @returns {{ flaggedFields: Array<{field: string, aiClaim: *, observed: *, reason: string}>, confidence: 'high'|'medium'|'low' }}
 */
function detectHallucinations(moduleName, aiResponse, collectedData) {
  const flaggedFields = [];

  if (!aiResponse || !collectedData || typeof collectedData !== 'object') {
    return { flaggedFields, confidence: 'high' };
  }

  switch (moduleName.toLowerCase()) {
    case 'security': {
      // Cross-check header presence claims
      if (collectedData.headers && aiResponse.headers) {
        const headerChecks = [
          { key: 'strictTransportSecurity', httpKey: 'strict-transport-security' },
          { key: 'contentSecurityPolicy', httpKey: 'content-security-policy' },
          { key: 'xFrameOptions', httpKey: 'x-frame-options' },
          { key: 'xContentTypeOptions', httpKey: 'x-content-type-options' },
          { key: 'referrerPolicy', httpKey: 'referrer-policy' },
        ];

        for (const { key, httpKey } of headerChecks) {
          const aiHeader = aiResponse.headers[key];
          const actualPresent = !!collectedData.headers[httpKey];

          if (aiHeader && aiHeader.present === true && !actualPresent) {
            flaggedFields.push({
              field: `headers.${key}.present`,
              aiClaim: true,
              observed: false,
              reason: `AI claims ${httpKey} is present, but it was not found in HTTP response headers`
            });
          } else if (aiHeader && aiHeader.present === false && actualPresent) {
            flaggedFields.push({
              field: `headers.${key}.present`,
              aiClaim: false,
              observed: true,
              reason: `AI claims ${httpKey} is missing, but it was found in HTTP response headers`
            });
          }
        }
      }

      // Cross-check HTTPS
      if (collectedData.isHttps !== undefined && aiResponse.ssl) {
        if (aiResponse.ssl.isHttps !== collectedData.isHttps) {
          flaggedFields.push({
            field: 'ssl.isHttps',
            aiClaim: aiResponse.ssl.isHttps,
            observed: collectedData.isHttps,
            reason: `AI HTTPS claim contradicts observed protocol`
          });
        }
      }
      break;
    }

    case 'seocontent': {
      // Cross-check title length
      if (collectedData.titleLength !== undefined && aiResponse.metadata?.title) {
        const aiTitleLen = aiResponse.metadata.title.length;
        if (typeof aiTitleLen === 'number' && Math.abs(aiTitleLen - collectedData.titleLength) > 10) {
          flaggedFields.push({
            field: 'metadata.title.length',
            aiClaim: aiTitleLen,
            observed: collectedData.titleLength,
            reason: `AI title length differs significantly from measured length`
          });
        }
      }

      // Cross-check H1 count
      if (collectedData.h1Count !== undefined && aiResponse.content?.headingStructure?.h1Count !== undefined) {
        if (aiResponse.content.headingStructure.h1Count !== collectedData.h1Count) {
          flaggedFields.push({
            field: 'content.headingStructure.h1Count',
            aiClaim: aiResponse.content.headingStructure.h1Count,
            observed: collectedData.h1Count,
            reason: `AI H1 count contradicts DOM analysis`
          });
        }
      }
      break;
    }

    case 'ui': {
      // Cross-check selectors against discovered selectors
      if (collectedData.discoveredSelectors && aiResponse.viewportAnalyses) {
        const allDiscovered = new Set();
        if (typeof collectedData.discoveredSelectors === 'object') {
          Object.values(collectedData.discoveredSelectors).forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(s => allDiscovered.add(s));
          });
        }

        // Spot-check first viewport's visual evidence selectors
        const firstVp = Object.values(aiResponse.viewportAnalyses || {})[0];
        if (firstVp?.structured) {
          let fabricatedCount = 0;
          const categoriesToCheck = ['branding', 'responsiveness', 'hierarchy'];
          for (const cat of categoriesToCheck) {
            const evidence = firstVp.structured[cat]?.visualEvidence;
            if (Array.isArray(evidence)) {
              for (const ve of evidence) {
                if (ve.elementSelector && allDiscovered.size > 0 && !allDiscovered.has(ve.elementSelector)) {
                  fabricatedCount++;
                }
              }
            }
          }
          if (fabricatedCount > 0) {
            flaggedFields.push({
              field: 'viewportAnalyses.*.structured.*.visualEvidence',
              aiClaim: `${fabricatedCount} selectors not in discovered set`,
              observed: `${allDiscovered.size} discovered selectors available`,
              reason: `AI used ${fabricatedCount} CSS selector(s) not found during DOM discovery`
            });
          }
        }
      }
      break;
    }

    case 'privacy': {
      // Cross-check cookie count
      if (collectedData.totalCookieCount !== undefined && aiResponse.cookies) {
        const aiCookieItems = Array.isArray(aiResponse.cookies) ? aiResponse.cookies :
          (Array.isArray(aiResponse.cookies?.items) ? aiResponse.cookies.items : []);
        const aiCount = aiCookieItems.length;
        if (Math.abs(aiCount - collectedData.totalCookieCount) > 5) {
          flaggedFields.push({
            field: 'cookies.length',
            aiClaim: aiCount,
            observed: collectedData.totalCookieCount,
            reason: `AI cookie count differs significantly from observed count`
          });
        }
      }
      break;
    }

    // Performance, accessibility, compatibility, marketing, conversion:
    // These have fewer direct hallucination vectors since scores are derived
    // from sub-objects rather than direct claims about page state.
    default:
      break;
  }

  // Determine confidence based on flagged count
  let confidence = 'high';
  if (flaggedFields.length >= 3) confidence = 'low';
  else if (flaggedFields.length >= 1) confidence = 'medium';

  return { flaggedFields, confidence };
}

// ─── Aggregate Trust Metrics ─────────────────────────────────────────────────

/**
 * Aggregate validation and hallucination results across all modules
 * to produce report-level AI trust metrics.
 *
 * @param {Object<string, { validation: object, hallucination: object }>} moduleResults
 * @returns {{ fieldsValidated: number, fieldsFlagged: number, overallConfidence: string, hallucinationsDetected: number }}
 */
function aggregateAiTrustMetrics(moduleResults) {
  let totalValidated = 0;
  let totalFlagged = 0;
  let totalHallucinations = 0;
  const confidences = [];

  for (const [, result] of Object.entries(moduleResults)) {
    if (result.validation) {
      totalValidated += result.validation.fieldsValidated || 0;
      totalFlagged += result.validation.fieldsFlagged || 0;
      confidences.push(result.validation.confidence);
    }
    if (result.hallucination) {
      totalHallucinations += (result.hallucination.flaggedFields || []).length;
      confidences.push(result.hallucination.confidence);
    }
  }

  // Overall confidence = lowest confidence across all modules
  let overallConfidence = 'high';
  if (confidences.includes('low')) overallConfidence = 'low';
  else if (confidences.includes('medium')) overallConfidence = 'medium';

  return {
    fieldsValidated: totalValidated,
    fieldsFlagged: totalFlagged,
    overallConfidence,
    hallucinationsDetected: totalHallucinations,
  };
}

module.exports = {
  validateModuleAiResponse,
  detectHallucinations,
  aggregateAiTrustMetrics,
  getModuleSchemaFragment,
};
