/**
 * Evidence Tools — Mastra Agent Tool Wrappers
 * ============================================
 *
 * Wraps EvidenceRegistry lookups as Mastra createTool instances.
 * Agents call these tools to retrieve verified evidence signals.
 *
 * This ensures agents can ONLY cite evidence that exists in the registry.
 * No tool call = no claim. Hallucinations are structurally impossible.
 *
 * Usage:
 *   const { buildEvidenceTools } = require('./evidence-tools');
 *   const tools = buildEvidenceTools(evidenceRegistry);
 *   const agent = new Agent({ ..., tools });
 */

let createTool;
try {
    ({ createTool } = require('@mastra/core'));
} catch {
    // Fallback: createTool not available
    createTool = null;
}

const z = require('zod');

/**
 * Build Mastra tools from an EvidenceRegistry instance.
 *
 * @param {import('../utils/evidence-registry').EvidenceRegistry} registry
 * @returns {Object<string, Tool>} Map of tool instances
 */
function buildEvidenceTools(registry) {
    if (!createTool) {
        console.warn('[EvidenceTools] @mastra/core not available — returning empty tools');
        return {};
    }

    return {
        // ─── Core Evidence Retrieval ──────────────────────────────────
        getEvidence: createTool({
            id: 'get-evidence',
            description: 'Get a single verified evidence signal by its key. Returns the signal value, confidence, source, and whether it is applicable for this site. Returns null if the key does not exist. Example keys: "a11y.htmlLang", "privacy.consentBanner", "conversion.ctaCount", "platform".',
            inputSchema: z.object({
                key: z.string().describe('The evidence signal key, e.g. "a11y.htmlLang" or "privacy.consentBanner"'),
            }),
            execute: async ({ key }) => {
                const signal = registry.get(key);
                if (!signal) {
                    return { found: false, key, value: null, message: `No evidence signal found for key "${key}". Use listEvidenceCategories to see available categories.` };
                }
                return { found: true, key, ...signal };
            },
        }),

        // ─── Category Listing ────────────────────────────────────────
        listCategoryEvidence: createTool({
            id: 'list-category-evidence',
            description: 'List all verified evidence signals for a category prefix. Available categories: "meta", "content", "a11y", "privacy", "compat", "security", "marketing", "conversion", "seo", "platform". Returns an array of {key, value, confidence, source, applicable}.',
            inputSchema: z.object({
                category: z.string().describe('Category prefix, e.g. "a11y", "privacy", "conversion"'),
            }),
            execute: async ({ category }) => {
                const signals = registry.listCategory(category);
                if (signals.length === 0) {
                    return { category, signals: [], message: `No signals found for category "${category}". Available: meta, content, a11y, privacy, compat, security, marketing, conversion, seo, platform.` };
                }
                return { category, count: signals.length, signals };
            },
        }),

        // ─── Platform Detection ──────────────────────────────────────
        getPlatform: createTool({
            id: 'get-platform',
            description: 'Get the detected website platform (e.g., Wix, Shopify, WordPress, Squarespace) and platform-specific applicability rules. Rules indicate which evidence signals are unreliable due to platform limitations (e.g., Wix Shadow DOM hiding form labels).',
            inputSchema: z.object({}),
            execute: async () => {
                const platform = registry.get('platform');
                const rules = registry.get('platform.rules');
                return {
                    platform: platform?.value || null,
                    confidence: platform?.confidence || 0,
                    applicabilityRules: rules?.value || {},
                };
            },
        }),

        // ─── Available Categories ────────────────────────────────────
        listEvidenceCategories: createTool({
            id: 'list-evidence-categories',
            description: 'List all available evidence categories and the number of signals in each. Use this to discover what evidence is available before querying specific signals.',
            inputSchema: z.object({}),
            execute: async () => {
                const keys = registry.keys();
                const categories = {};
                for (const key of keys) {
                    const cat = key.split('.')[0];
                    categories[cat] = (categories[cat] || 0) + 1;
                }
                return {
                    totalSignals: keys.length,
                    categories,
                };
            },
        }),

        // ─── Bulk Evidence Retrieval ─────────────────────────────────
        getMultipleEvidence: createTool({
            id: 'get-multiple-evidence',
            description: 'Get multiple evidence signals at once by their keys. More efficient than calling getEvidence multiple times. Returns a map of key → signal.',
            inputSchema: z.object({
                keys: z.array(z.string()).describe('Array of evidence signal keys to retrieve'),
            }),
            execute: async ({ keys }) => {
                const results = {};
                for (const key of keys) {
                    const signal = registry.get(key);
                    results[key] = signal ? { found: true, ...signal } : { found: false, value: null };
                }
                return { requested: keys.length, results };
            },
        }),

        // ─── Applicability Check ─────────────────────────────────────
        checkApplicability: createTool({
            id: 'check-applicability',
            description: 'Check if a specific evidence signal is applicable for this site. Some signals are marked not-applicable due to platform limitations (e.g., Wix Shadow DOM). If not applicable, the reason is provided. You MUST NOT report issues for non-applicable signals.',
            inputSchema: z.object({
                key: z.string().describe('The evidence signal key to check applicability for'),
            }),
            execute: async ({ key }) => {
                const signal = registry.get(key);
                if (!signal) {
                    return { key, exists: false, applicable: true, message: 'Signal not found — assume applicable' };
                }
                return {
                    key,
                    exists: true,
                    applicable: signal.applicable !== false,
                    reason: signal.reason || null,
                    value: signal.value,
                };
            },
        }),
    };
}

/**
 * Get the evidence context as a compact string for prompt injection.
 * This is used as a fallback when Mastra tool-calling is unavailable.
 *
 * @param {import('../utils/evidence-registry').EvidenceRegistry} registry
 * @param {string} category - Category to extract (e.g., 'a11y', 'privacy')
 * @returns {string} Formatted evidence context for prompt injection
 */
function getEvidenceContextString(registry, category) {
    const signals = registry.listCategory(category);
    if (signals.length === 0) return `No ${category} evidence available.`;

    const lines = signals.map(s => {
        const applicability = s.applicable === false ? ` [NOT APPLICABLE: ${s.reason || 'platform limitation'}]` : '';
        return `  ${s.key}: ${JSON.stringify(s.value)}${applicability}`;
    });

    return `=== VERIFIED ${category.toUpperCase()} EVIDENCE ===\n${lines.join('\n')}`;
}

module.exports = {
    buildEvidenceTools,
    getEvidenceContextString,
};
