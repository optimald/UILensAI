/**
 * Dynamic Model Selector
 * ======================
 * 
 * Queries OpenRouter's /api/v1/models endpoint to dynamically select
 * the best model for each task based on:
 * - Cost (prefer cheapest)
 * - Capabilities (vision, tools/function-calling, response_format)
 * - Output capacity (max_completion_tokens)
 * - Context window size
 * - Provider quality (prefer non-preview when available)
 * 
 * Results are cached for 1 hour to avoid excessive API calls.
 * Falls back to hardcoded defaults if the API is unreachable.
 */

const OPENROUTER_MODELS_API = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cached model data
let cachedModels = null;
let cacheTimestamp = 0;

// Providers we trust for production use (prefer these over random providers)
const PREFERRED_PROVIDERS = ['google/', 'anthropic/', 'openai/', 'meta-llama/'];

// Models to exclude (known issues or unsuitable for structured analysis)
const EXCLUDED_MODELS = new Set([
    // DeepSeek truncates JSON output
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-r1',
]);

// Name patterns that indicate a model is NOT suitable for structured analysis
// These are cheap but designed for specific narrow tasks
const EXCLUDED_NAME_PATTERNS = [
    'safeguard',    // Content safety/moderation models
    'guard',        // Content guard models 
    'shield',       // Safety shield models
    'moderator',    // Moderation models
    'embed',        // Embedding models (not generative)
    'tts',          // Text-to-speech
    'whisper',      // Speech-to-text
    'rerank',       // Re-ranking models
    'jamba',        // Experimental architectures with JSON issues
];

/**
 * Fetch all available models from OpenRouter API
 * @returns {Array} Array of model objects
 */
async function fetchAvailableModels() {
    // Return cache if fresh
    if (cachedModels && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedModels;
    }

    try {
        const response = await fetch(OPENROUTER_MODELS_API, {
            headers: {
                'Accept': 'application/json',
                ...(process.env.OPENROUTER_API_KEY && {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
                })
            },
            signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (!response.ok) {
            throw new Error(`OpenRouter models API returned ${response.status}`);
        }

        const json = await response.json();
        cachedModels = json.data || [];
        cacheTimestamp = Date.now();

        console.log(`[DynamicModelSelector] Fetched ${cachedModels.length} models from OpenRouter`);
        return cachedModels;
    } catch (error) {
        console.warn(`[DynamicModelSelector] Failed to fetch models: ${error.message}. Using cache or defaults.`);
        return cachedModels || [];
    }
}

/**
 * Select the best model for a given task based on requirements
 * 
 * @param {Object} requirements - What the task needs
 * @param {boolean} [requirements.vision=false] - Needs image input support
 * @param {boolean} [requirements.tools=true] - Needs function calling / tool use
 * @param {boolean} [requirements.responseFormat=true] - Needs structured output (response_format)
 * @param {number} [requirements.minOutputTokens=8192] - Minimum output tokens needed
 * @param {number} [requirements.minContextLength=100000] - Minimum context window
 * @param {number} [requirements.maxCostPerMillionOutput=5] - Max acceptable output cost per 1M tokens
 * @param {string[]} [requirements.preferProviders] - Prefer models from these providers (e.g. ['google/'])
 * @param {string[]} [requirements.excludeModels] - Model IDs to exclude
 * @param {boolean} [requirements.allowPreview=true] - Allow preview/experimental models
 * @returns {Object|null} Selected model { id, pricing, maxOutput, contextLength }
 */
async function selectBestModel(requirements = {}) {
    const {
        vision = false,
        tools = true,
        responseFormat = true,
        minOutputTokens = 8192,
        minContextLength = 100000,
        maxCostPerMillionOutput = 5,
        preferProviders = PREFERRED_PROVIDERS,
        excludeModels = [],
        allowPreview = true,
    } = requirements;

    const allModels = await fetchAvailableModels();
    if (!allModels.length) return null;

    const excludeSet = new Set([...EXCLUDED_MODELS, ...excludeModels]);

    // Filter models that meet all requirements
    const candidates = allModels.filter(m => {
        // Skip excluded models
        if (excludeSet.has(m.id)) return false;

        // Skip free-tier models (unreliable for production)
        if (m.id.endsWith(':free')) return false;

        // Skip image-generation models (output includes image)
        if (m.id.includes('-image')) return false;

        // Skip models with excluded name patterns (safety, embedding, etc.)
        const modelIdLower = m.id.toLowerCase();
        const modelNameLower = (m.name || '').toLowerCase();
        if (EXCLUDED_NAME_PATTERNS.some(p => modelIdLower.includes(p) || modelNameLower.includes(p))) return false;

        // Skip nano/micro models — too small for complex structured JSON output
        if (modelIdLower.includes('nano') || modelIdLower.includes('micro')) return false;

        // Check provider preference (if specified, at least one must match)
        if (preferProviders.length > 0) {
            const matchesProvider = preferProviders.some(p => m.id.startsWith(p));
            if (!matchesProvider) return false;
        }

        // Check preview status
        if (!allowPreview && (m.id.includes('preview') || m.id.includes('experimental'))) {
            return false;
        }

        // Check pricing exists and is within budget
        const outputCostPerMillion = parseFloat(m.pricing?.completion || '0') * 1e6;
        if (outputCostPerMillion > maxCostPerMillionOutput) return false;
        if (outputCostPerMillion === 0) return false; // Skip free models

        // Check capabilities
        const modalities = m.architecture?.input_modalities || [];
        if (vision && !modalities.includes('image')) return false;

        const supportedParams = m.supported_parameters || [];
        if (tools && !supportedParams.includes('tools')) return false;
        if (responseFormat && !supportedParams.includes('response_format')) return false;

        // Check output capacity
        const maxOutput = m.top_provider?.max_completion_tokens || 0;
        if (maxOutput < minOutputTokens) return false;

        // Check context length
        if ((m.context_length || 0) < minContextLength) return false;

        // Must support text output
        const outputModalities = m.architecture?.output_modalities || [];
        if (!outputModalities.includes('text')) return false;

        return true;
    });

    if (candidates.length === 0) return null;

    // Score and sort candidates: prefer cheapest with highest capability
    const scored = candidates.map(m => {
        const inputCost = parseFloat(m.pricing?.prompt || '0') * 1e6;
        const outputCost = parseFloat(m.pricing?.completion || '0') * 1e6;
        const maxOutput = m.top_provider?.max_completion_tokens || 0;
        const modelIdLower = m.id.toLowerCase();
        
        // Composite score: lower is better
        // Primary factor: cost (output cost matters more than input)
        const costScore = (inputCost * 0.3 + outputCost * 0.7);
        
        // Bonuses (negative = better)
        let bonus = 0;
        
        // Reward high output capacity (important for large JSON responses)
        if (maxOutput >= 65000) bonus -= 0.05;
        
        // Penalize preview models (prefer stable releases)
        if (modelIdLower.includes('preview')) bonus += 0.02;
        
        // Reward Google Gemini models (proven for structured JSON output)
        if (m.id.startsWith('google/gemini')) bonus -= 0.03;
        
        // Penalize mini models (lower quality structured output)
        if (modelIdLower.includes('mini') && !modelIdLower.includes('minimax')) bonus += 0.05;
        
        const score = costScore + bonus;

        return { model: m, score, inputCost, outputCost, maxOutput };
    });

    scored.sort((a, b) => a.score - b.score);

    const best = scored[0];
    return {
        id: best.model.id,
        name: best.model.name,
        pricing: {
            inputPerMillion: best.inputCost,
            outputPerMillion: best.outputCost,
        },
        maxOutput: best.maxOutput,
        contextLength: best.model.context_length,
        hasVision: (best.model.architecture?.input_modalities || []).includes('image'),
        hasTools: (best.model.supported_parameters || []).includes('tools'),
        candidates: scored.length,
    };
}

/**
 * Select models for all UILensAI task categories at once
 * Returns a complete model configuration matching model-defaults.js module structure
 * 
 * @param {string} tier - 'basic', 'pro', or 'enterprise'
 * @returns {Object} { primary, fallback, enterprise, modules: {...} }
 */
async function selectModelsForScan(tier = 'pro') {
    const allModels = await fetchAvailableModels();
    if (!allModels.length) {
        console.warn('[DynamicModelSelector] No models available, returning null (use hardcoded defaults)');
        return null;
    }

    // Define requirements for each task category
    const taskProfiles = {
        // Industry detection: simple classification, minimal output
        'industry-detection': {
            vision: false, tools: true, responseFormat: true,
            minOutputTokens: 1024, maxCostPerMillionOutput: 1,
        },
        // Standard analysis modules (SEO, Performance, Privacy, Compatibility, Marketing)
        'standard-analysis': {
            vision: false, tools: true, responseFormat: true,
            minOutputTokens: 16384, maxCostPerMillionOutput: 3,
        },
        // Complex analysis modules (UI, Security, Accessibility, Conversion)
        'complex-analysis': {
            vision: false, tools: true, responseFormat: true,
            minOutputTokens: 16384, maxCostPerMillionOutput: tier === 'enterprise' ? 15 : 3,
        },
        // Vision-requiring modules (UI)
        'vision-analysis': {
            vision: true, tools: true, responseFormat: true,
            minOutputTokens: 16384, maxCostPerMillionOutput: tier === 'enterprise' ? 15 : 3,
        },
        // Recommendation generation
        'recommendations': {
            vision: false, tools: true, responseFormat: true,
            minOutputTokens: 8192, maxCostPerMillionOutput: 3,
        },
    };

    const selections = {};
    for (const [taskName, reqs] of Object.entries(taskProfiles)) {
        selections[taskName] = await selectBestModel(reqs);
    }

    // Map task profiles to module names
    const moduleMap = {
        'industry-detection': selections['industry-detection'],
        'ui': selections['vision-analysis'],
        'security': selections['complex-analysis'],
        'accessibility': selections['complex-analysis'],
        'conversion': selections['complex-analysis'],
        'performance': selections['standard-analysis'],
        'seoContent': selections['standard-analysis'],
        'compatibility': selections['standard-analysis'],
        'marketing': selections['standard-analysis'],
        'privacy': selections['standard-analysis'],
        'top-recommendations': selections['recommendations'],
        'module-recommendations': selections['recommendations'],
    };

    // Calculate estimated cost
    const primary = selections['standard-analysis'];
    const estInputTokens = 36000;
    const estOutputTokens = 48000;
    const estCost = primary ? (
        (estInputTokens / 1e6) * primary.pricing.inputPerMillion +
        (estOutputTokens / 1e6) * primary.pricing.outputPerMillion
    ) : 0;

    console.log(`[DynamicModelSelector] Selected models for ${tier} tier:`);
    for (const [task, sel] of Object.entries(selections)) {
        if (sel) {
            console.log(`  ${task}: ${sel.id} ($${sel.pricing.inputPerMillion.toFixed(2)}/$${sel.pricing.outputPerMillion.toFixed(2)} per 1M)`);
        } else {
            console.log(`  ${task}: NO MODEL FOUND (will use hardcoded default)`);
        }
    }
    console.log(`  Estimated cost per scan: $${estCost.toFixed(4)}`);

    return {
        selections,
        moduleMap,
        estimatedCostPerScan: estCost,
        fetchedAt: new Date().toISOString(),
        totalModelsAvailable: allModels.length,
    };
}

/**
 * Get the model ID for a specific module, with dynamic selection
 * Falls back to the hardcoded default if dynamic selection fails
 * 
 * @param {string} moduleName - Module name (e.g., 'ui', 'security')
 * @param {string} tier - 'basic', 'pro', or 'enterprise'
 * @param {Object} hardcodedDefaults - The MODELS object from model-defaults.js
 * @returns {Promise<string>} Model ID to use
 */
async function getModelForModule(moduleName, tier = 'pro', hardcodedDefaults = {}) {
    try {
        const scanConfig = await selectModelsForScan(tier);
        if (scanConfig && scanConfig.moduleMap[moduleName]) {
            return scanConfig.moduleMap[moduleName].id;
        }
    } catch (error) {
        console.warn(`[DynamicModelSelector] Dynamic selection failed for ${moduleName}: ${error.message}`);
    }
    // Fallback to hardcoded default
    return hardcodedDefaults.GEMINI_FLASH_LITE || 'google/gemini-2.5-flash-lite';
}

/**
 * Clear the model cache (useful for testing or after config changes)
 */
function clearCache() {
    cachedModels = null;
    cacheTimestamp = 0;
}

module.exports = {
    fetchAvailableModels,
    selectBestModel,
    selectModelsForScan,
    getModelForModule,
    clearCache,
    EXCLUDED_MODELS,
    PREFERRED_PROVIDERS,
};
