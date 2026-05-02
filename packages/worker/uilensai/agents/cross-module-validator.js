/**
 * Cross-Module Validator — Audit Director Orchestration
 * =====================================================
 *
 * Uses the Audit Director agent (Dr. Nadia Kovacs) to validate
 * cross-module consistency after all individual module analyses complete.
 *
 * This is the final quality gate before report delivery.
 *
 * Usage:
 *   const { validateCrossModuleResults } = require('./cross-module-validator');
 *   const validation = await validateCrossModuleResults(moduleResults, evidenceRegistry, options);
 */

const { generateWithAgent } = require('./mastra-agents');
const { buildEvidenceTools } = require('./evidence-tools');

/**
 * Run cross-module validation using the Audit Director agent.
 *
 * @param {Object} moduleResults - Results from all module analyses (from analyzeWebsite)
 * @param {import('../utils/evidence-registry').EvidenceRegistry} evidenceRegistry
 * @param {Object} [options]
 * @param {string} [options.tier='pro']
 * @param {boolean} [options.verbose=false]
 * @returns {Object} { contradictions, suppressions, adjustments, confidenceRating, summary }
 */
async function validateCrossModuleResults(moduleResults, evidenceRegistry, options = {}) {
    const { tier = 'pro', verbose = false } = options;
    const startTime = Date.now();

    if (verbose) {
        console.log('[AuditDirector] 🔍 Starting cross-module validation...');
    }

    // Build evidence tools for the Audit Director
    const tools = buildEvidenceTools(evidenceRegistry);

    // Compile a compact summary of each module's key findings for the prompt
    const moduleSummaries = {};
    for (const [moduleName, result] of Object.entries(moduleResults)) {
        if (!result || result._skipped) continue;

        const summary = result.summary || {};
        const topIssues = summary.topIssues || [];
        const score = summary.score;

        moduleSummaries[moduleName] = {
            score: score === null ? 'Inconclusive' : score,
            rating: summary.rating || 'Unknown',
            topIssues: topIssues.slice(0, 5),
            issueCount: result.issues?.items?.length || result.issues?.length || 0,
            hasNarrative: !!result.narrative,
        };
    }

    // Build the validation prompt
    const prompt = buildValidationPrompt(moduleSummaries, evidenceRegistry);

    try {
        const result = await generateWithAgent('auditDirector', prompt, {
            tier,
            verbose,
            tools: Object.keys(tools).length > 0 ? tools : undefined,
        });

        if (result.error) {
            if (verbose) {
                console.warn(`[AuditDirector] ⚠️ Agent failed: ${result.error}. Using deterministic validation.`);
            }
            return runDeterministicValidation(moduleResults, evidenceRegistry, verbose);
        }

        const validation = result.data || parseValidationResponse(result);

        if (verbose) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[AuditDirector] ✅ Validation complete in ${elapsed}s — confidence: ${validation.confidenceRating || 'N/A'}`);
        }

        return validation;

    } catch (error) {
        if (verbose) {
            console.warn(`[AuditDirector] ❌ Validation failed: ${error.message}. Falling back to deterministic.`);
        }
        return runDeterministicValidation(moduleResults, evidenceRegistry, verbose);
    }
}

/**
 * Build the validation prompt from module summaries.
 */
function buildValidationPrompt(moduleSummaries, registry) {
    const moduleLines = Object.entries(moduleSummaries)
        .map(([mod, data]) => {
            const issuesList = data.topIssues.length > 0
                ? data.topIssues.map(i => `    - ${typeof i === 'string' ? i : i.text || JSON.stringify(i)}`).join('\n')
                : '    (none)';
            return `  ${mod}: Score=${data.score}, Rating=${data.rating}, Issues=${data.issueCount}\n${issuesList}`;
        })
        .join('\n\n');

    const platform = registry.get('platform');
    const platformInfo = platform?.value
        ? `\nDETECTED PLATFORM: ${platform.value} (confidence: ${platform.confidence})`
        : '\nDETECTED PLATFORM: Unknown';

    return `CROSS-MODULE VALIDATION REQUEST

Review the following module results for logical consistency, contradictions, and evidence accuracy.
Use your evidence tools to verify key claims from each module.
${platformInfo}

MODULE RESULTS:
${moduleLines}

INSTRUCTIONS:
1. Use getEvidence and listCategoryEvidence tools to verify the top claims from each module
2. Check if platform applicability rules affect any findings (use getPlatform tool)
3. Identify contradictions between modules
4. Propose suppressions for findings that are not applicable due to platform limitations
5. Propose score adjustments where evidence contradicts the module's output
6. Provide your overall confidence rating (0-100) for the report's integrity

Respond with a JSON object containing: contradictions, suppressions, adjustments, confidenceRating, summary`;
}

/**
 * Parse a free-text validation response into structured format.
 */
function parseValidationResponse(result) {
    // Try to extract JSON from the response
    const text = typeof result === 'string' ? result : (result.text || result.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { /* fall through */ }
    }

    return {
        contradictions: [],
        suppressions: [],
        adjustments: [],
        confidenceRating: 70,
        summary: 'Validation completed with limited structured output.',
    };
}

/**
 * Deterministic fallback validation — no AI required.
 * Catches the most common contradiction patterns programmatically.
 */
function runDeterministicValidation(moduleResults, evidenceRegistry, verbose = false) {
    const contradictions = [];
    const suppressions = [];
    const adjustments = [];
    let confidenceRating = 85; // Start optimistic

    const platform = evidenceRegistry.get('platform')?.value;

    // ── 1. Platform-based suppressions ────────────────────────────────
    if (platform === 'Wix') {
        const a11y = moduleResults.accessibility;
        if (a11y?.issues?.items) {
            const formLabelIssues = a11y.issues.items.filter(i =>
                typeof i === 'object' && /form.?label|unlabeled.?input/i.test(i.text || '')
            );
            const skipNavIssues = a11y.issues.items.filter(i =>
                typeof i === 'object' && /skip.?nav|skip.?link/i.test(i.text || '')
            );

            formLabelIssues.forEach(issue => {
                suppressions.push({
                    module: 'accessibility',
                    finding: issue.text,
                    reason: 'Wix uses Shadow DOM for form components — label extraction unreliable from static HTML',
                });
            });
            skipNavIssues.forEach(issue => {
                suppressions.push({
                    module: 'accessibility',
                    finding: issue.text,
                    reason: 'Wix implements skip-nav in Shadow DOM — not detectable via static analysis',
                });
            });
        }
    }

    // ── 2. Consent vs Privacy contradiction ───────────────────────────
    const consentSignal = evidenceRegistry.get('privacy.consentBanner');
    const privacyResult = moduleResults.privacy;
    if (consentSignal?.value === true && privacyResult?.issues?.items) {
        const noConsentIssues = privacyResult.issues.items.filter(i =>
            typeof i === 'object' && /no.?consent|missing.?consent|cookie.?banner.?not/i.test(i.text || '')
        );
        noConsentIssues.forEach(issue => {
            contradictions.push({
                modules: ['privacy'],
                finding: `Privacy module reports "${issue.text}" but evidence registry confirms consent banner detected (${consentSignal.provider || 'via HTML extraction'})`,
                resolution: 'Suppress the missing-consent finding',
            });
            confidenceRating -= 5;
        });
    }

    // ── 3. Security vs other module connectivity ─────────────────────
    const securityResult = moduleResults.security;
    if (securityResult?.summary?.score === 0) {
        const successfulModules = Object.keys(moduleResults).filter(m => {
            const r = moduleResults[m];
            return m !== 'security' && r?.summary?.score > 0 && !r?._skipped;
        });
        if (successfulModules.length > 0) {
            contradictions.push({
                modules: ['security', ...successfulModules.slice(0, 3)],
                finding: `Security reports critical failure (score=0) but ${successfulModules.length} modules produced results`,
                resolution: 'Security module likely had a TLS/connectivity issue specific to its probe — does not invalidate other modules',
            });
            confidenceRating -= 10;
        }
    }

    // ── 4. Hreflang false positives ──────────────────────────────────
    const hreflangApplicable = evidenceRegistry.get('seo.hreflang.applicable');
    const seoResult = moduleResults.seoContent;
    if (hreflangApplicable?.value === false && seoResult?.issues?.items) {
        const hreflangIssues = seoResult.issues.items.filter(i =>
            typeof i === 'object' && /hreflang/i.test(i.text || '')
        );
        hreflangIssues.forEach(issue => {
            suppressions.push({
                module: 'seoContent',
                finding: issue.text,
                reason: 'Single-language site — hreflang tags are not applicable',
            });
        });
    }

    // ── 5. CTA contradictions between conversion + marketing ─────────
    const ctaCount = evidenceRegistry.get('conversion.ctaCount');
    const conversionResult = moduleResults.conversion;
    const marketingResult = moduleResults.marketing;

    if (ctaCount?.value > 0) {
        // Check if conversion claims "no CTAs" despite evidence showing them
        if (conversionResult?.issues?.items) {
            const noCTAIssues = conversionResult.issues.items.filter(i =>
                typeof i === 'object' && /no.?cta|missing.?cta|no.?call.?to.?action/i.test(i.text || '')
            );
            noCTAIssues.forEach(issue => {
                contradictions.push({
                    modules: ['conversion'],
                    finding: `Conversion claims "${issue.text}" but evidence registry shows ${ctaCount.value} CTAs detected`,
                    resolution: 'Suppress the no-CTA finding',
                });
                confidenceRating -= 5;
            });
        }
    }

    const summary = contradictions.length === 0 && suppressions.length === 0
        ? 'All modules are internally consistent. No contradictions or platform-specific suppressions needed.'
        : `Found ${contradictions.length} contradiction(s) and ${suppressions.length} platform suppression(s). Review recommended.`;

    if (verbose) {
        console.log(`[AuditDirector] Deterministic validation: ${contradictions.length} contradictions, ${suppressions.length} suppressions, confidence=${confidenceRating}`);
    }

    return {
        contradictions,
        suppressions,
        adjustments,
        confidenceRating: Math.max(0, Math.min(100, confidenceRating)),
        summary,
    };
}

/**
 * Apply validation results to module outputs (mutates in place).
 *
 * @param {Object} moduleResults - Module results object (from analyzeWebsite)
 * @param {Object} validation - Output from validateCrossModuleResults
 * @param {boolean} [verbose=false]
 */
function applyValidationResults(moduleResults, validation, verbose = false) {
    if (!validation) return;

    // Apply suppressions: remove flagged issues from module outputs
    for (const suppression of (validation.suppressions || [])) {
        const moduleResult = moduleResults[suppression.module];
        if (!moduleResult?.issues?.items) continue;

        const before = moduleResult.issues.items.length;
        moduleResult.issues.items = moduleResult.issues.items.filter(item => {
            if (typeof item !== 'object') return true;
            return !(item.text || '').includes(suppression.finding?.substring(0, 40));
        });

        if (verbose && moduleResult.issues.items.length < before) {
            console.log(`[AuditDirector] Suppressed issue in ${suppression.module}: "${suppression.finding?.substring(0, 60)}" — ${suppression.reason?.substring(0, 80)}`);
        }
    }

    // Apply adjustments: modify module fields
    for (const adjustment of (validation.adjustments || [])) {
        const moduleResult = moduleResults[adjustment.module];
        if (!moduleResult) continue;

        // Simple dot-path setter
        const parts = (adjustment.field || '').split('.');
        let target = moduleResult;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!target[parts[i]]) break;
            target = target[parts[i]];
        }
        const lastKey = parts[parts.length - 1];
        if (target && lastKey && target[lastKey] !== undefined) {
            if (verbose) {
                console.log(`[AuditDirector] Adjusted ${adjustment.module}.${adjustment.field}: ${target[lastKey]} → ${adjustment.to} (${adjustment.reason})`);
            }
            target[lastKey] = adjustment.to;
        }
    }

    // Attach validation metadata to results
    moduleResults._auditDirectorValidation = {
        confidenceRating: validation.confidenceRating,
        contradictionCount: (validation.contradictions || []).length,
        suppressionCount: (validation.suppressions || []).length,
        adjustmentCount: (validation.adjustments || []).length,
        summary: validation.summary,
    };
}

module.exports = {
    validateCrossModuleResults,
    applyValidationResults,
    runDeterministicValidation,
};
