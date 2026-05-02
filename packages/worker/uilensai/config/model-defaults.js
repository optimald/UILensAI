/**
 * Central Model Configuration - Single Source of Truth
 * =====================================================
 *
 * ALL AI calls route through OpenRouter as the single gateway.
 * Models are selected from model-catalog.json for pricing/specs.
 *
 * COST TARGET: < $0.06 per full 9-module scan
 *
 * MODEL STRATEGY (updated 2026-03-19):
 * - Primary: google/gemini-3.1-flash-lite-preview — latest, optimized for cost & speed
 * - Fallback: google/gemini-2.5-flash ($0.30/$2.50 per 1M) — stable, strong reasoning
 * - Enterprise: google/gemini-3.1-pro-preview ($2/$12 per 1M) — frontier reasoning
 * - Vision: google/gemini-3.1-flash-lite-preview (supports vision natively)
 *
 * COST MATH (9 modules + industry + recs ≈ 12 calls):
 *   Security + Performance use Flash ($0.30/$2.50) ≈ 2 calls
 *   Other 7 modules use Flash Lite ($0.10/$0.40) ≈ 10 calls
 *   ~36K input tokens × ~$0.14 avg/1M = $0.005
 *   ~48K output tokens × ~$0.70 avg/1M = $0.034
 *   Total ≈ $0.039 per scan (Basic/Pro) — within budget
 *
 * HIERARCHY (highest to lowest priority):
 * 1. GLOBAL_OVERRIDE - Forces one model for EVERYTHING (emergency use)
 * 2. tierModuleOverrides - Per-tier per-module specific overrides
 * 3. modules - Per-module defaults
 * 4. tiers - Per-tier defaults
 * 5. globalDefault - Fallback when nothing else specified
 */

const MODEL_PROVIDERS = {
  OPENROUTER: 'openrouter',
};

// =============================================================================
// MODELS - All accessed via OpenRouter
// To change the model used, just change the ID here. No hardcoding elsewhere.
// Pricing verified on https://openrouter.ai/models 2026-03-19
// =============================================================================
const MODELS = {
  // Primary — latest Gemini 3.1 Flash Lite, optimized for high-volume cost-efficient tasks
  GEMINI_FLASH_LITE: 'google/gemini-3.1-flash-lite-preview',
  // Fallback — stable Gemini 2.5 Flash, strong reasoning, separate rate-limit pool
  GEMINI_FLASH: 'google/gemini-2.5-flash',
  // Enterprise — frontier model, best reasoning, 1M context
  GEMINI_PRO: 'google/gemini-3.1-pro-preview',
};

// =============================================================================
// GLOBAL OVERRIDE - Use this to force a single model for everything
// =============================================================================
const GLOBAL_OVERRIDE = {
  enabled: false,
  provider: MODEL_PROVIDERS.OPENROUTER,
  model: MODELS.GEMINI_FLASH
};

// =============================================================================
// GLOBAL DEFAULT
// =============================================================================
const globalDefault = {
  provider: MODEL_PROVIDERS.OPENROUTER,
  model: MODELS.GEMINI_FLASH_LITE
};

const MAX_TOKENS = {
  industry: 1024,        // Simple classification — keep tight to save cost
  simple: 8192,          // Standard modules
  standard: 16384,       // Modules needing more detail
  complex: 16384,        // Deep analysis modules (Gemini Flash max 65K, but we cap for cost)
  recommendations: 8192  // Recommendation generation
};

// =============================================================================
// TIER DEFAULTS (DEPRECATED — single tier, all features enabled)
// Kept for backward compatibility; all tiers resolve to the same config.
// =============================================================================
const tiers = {
  basic: { provider: MODEL_PROVIDERS.OPENROUTER, model: MODELS.GEMINI_FLASH_LITE },
  pro: { provider: MODEL_PROVIDERS.OPENROUTER, model: MODELS.GEMINI_FLASH_LITE },
  enterprise: { provider: MODEL_PROVIDERS.OPENROUTER, model: MODELS.GEMINI_FLASH_LITE },
};

// =============================================================================
// PER-MODULE DEFAULTS
// All modules use Gemini 2.5 Flash — best quality/cost ratio at $0.15/$0.60
// =============================================================================
const modules = {
  // --- PRE-PROCESSING ---
  'industry-detection': {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    maxTokens: MAX_TOKENS.industry,
    description: 'Simple classification — Flash Lite is fast and cheap'
  },

  // --- 9 SCAN MODULES ---
  ui: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: true,
    maxTokens: MAX_TOKENS.complex,
    description: 'UI/UX analysis with vision — Flash Lite has native vision support'
  },

  security: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH,  // CIRCUIT BREAKER FIX: Use Flash (separate rate limit pool)
    requiresVision: false,
    maxTokens: MAX_TOKENS.complex,
    description: 'Security analysis — uses Flash for dedicated rate limit pool'
  },

  accessibility: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.standard,
    description: 'WCAG compliance analysis'
  },

  conversion: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.complex,
    description: 'Conversion rate optimization analysis'
  },

  performance: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH,  // CIRCUIT BREAKER FIX: Use Flash (separate rate limit pool)
    requiresVision: false,
    maxTokens: MAX_TOKENS.simple,
    description: 'Metrics-based performance analysis — uses Flash for dedicated rate limit pool'
  },

  seoContent: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.standard,
    description: 'SEO and content quality analysis'
  },

  compatibility: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.simple,
    description: 'Cross-browser compatibility analysis'
  },

  marketing: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.standard,
    description: 'Marketing effectiveness analysis'
  },

  privacy: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.standard,
    description: 'Privacy compliance analysis'
  },

  // --- POST-PROCESSING ---
  'top-recommendations': {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.recommendations,
    description: 'Cross-module recommendation synthesis'
  },

  'module-recommendations': {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: MAX_TOKENS.recommendations,
    description: 'Per-module recommendation generation'
  },

  // --- MULTI-AGENT SYSTEM ---
  debate: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH_LITE,
    requiresVision: false,
    maxTokens: 1500,
    description: 'Adversarial debate protocol — cross-examination between module agents'
  },

  ceo: {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: MODELS.GEMINI_FLASH,
    requiresVision: false,
    maxTokens: 2500,
    description: 'CEO orchestrator — executive synthesis and strategic priorities'
  }
};

// =============================================================================
// TIER-SPECIFIC MODULE OVERRIDES (DEPRECATED — no tier differentiation)
// =============================================================================
const tierModuleOverrides = {
  basic: {},
  pro: {},
  enterprise: {},
};

// =============================================================================
// FALLBACK MODELS (when primary model fails)
// =============================================================================
const FALLBACK_CHAIN = [
  MODELS.GEMINI_FLASH_LITE,         // google/gemini-3.1-flash-lite-preview
  MODELS.GEMINI_FLASH,              // google/gemini-2.5-flash (stable fallback)
  'google/gemini-2.5-flash-lite',   // Legacy stable model as last resort
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function findModuleKey(moduleName) {
  if (!moduleName) return null;
  const lowerName = moduleName.toLowerCase();
  if (modules[moduleName]) return moduleName;
  // Try exact match first
  const exactMatch = Object.keys(modules).find(key => key.toLowerCase() === lowerName);
  if (exactMatch) return exactMatch;
  // Try stripping suffixes like -viewport, -analysis, -pass2, -evidence (e.g., 'ui-viewport' → 'ui')
  const baseModule = lowerName.replace(/-(viewport|analysis|pass2|pass1|detail|summary|evidence)$/i, '');
  if (baseModule !== lowerName) {
    return Object.keys(modules).find(key => key.toLowerCase() === baseModule) || null;
  }
  return null;
}

function getModuleConfig(moduleName, tier = 'pro') {
  // Tier param accepted for backward compat but ignored — single tier
  const normalizedTier = 'pro';
  const actualModuleKey = findModuleKey(moduleName);

  // Priority 1: Global override
  if (GLOBAL_OVERRIDE.enabled) {
    return {
      provider: MODEL_PROVIDERS.OPENROUTER,
      model: GLOBAL_OVERRIDE.model,
      requiresVision: actualModuleKey ? modules[actualModuleKey]?.requiresVision : false,
      source: 'GLOBAL_OVERRIDE'
    };
  }

  // Priority 2: Tier-specific module override
  const tierOverrides = tierModuleOverrides[normalizedTier];
  if (tierOverrides && actualModuleKey) {
    const overrideKey = Object.keys(tierOverrides).find(k => k.toLowerCase() === actualModuleKey.toLowerCase());
    if (overrideKey) {
      const override = tierOverrides[overrideKey];
      return {
        provider: MODEL_PROVIDERS.OPENROUTER,
        model: override.model,
        requiresVision: modules[actualModuleKey]?.requiresVision || false,
        source: `tierModuleOverrides.${normalizedTier}.${overrideKey}`
      };
    }
  }

  // Priority 3: Module-specific config
  if (actualModuleKey && modules[actualModuleKey]) {
    return {
      provider: MODEL_PROVIDERS.OPENROUTER,
      model: modules[actualModuleKey].model,
      requiresVision: modules[actualModuleKey].requiresVision || false,
      source: `modules.${actualModuleKey}`
    };
  }

  // Priority 4: Tier default
  if (tiers[normalizedTier]) {
    return {
      provider: MODEL_PROVIDERS.OPENROUTER,
      model: tiers[normalizedTier].model,
      requiresVision: false,
      source: `tiers.${normalizedTier}`
    };
  }

  // Priority 5: Global default
  return {
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: globalDefault.model,
    requiresVision: false,
    source: 'globalDefault'
  };
}

function getDefaultModelFamily(_useCase = 'default') {
  return MODEL_PROVIDERS.OPENROUTER;
}

function isGlobalOverrideActive() {
  return GLOBAL_OVERRIDE.enabled;
}

function getConfigSummary() {
  return {
    globalOverride: GLOBAL_OVERRIDE.enabled ? GLOBAL_OVERRIDE.model : 'disabled',
    globalDefault: globalDefault.model,
    gateway: 'OpenRouter (all models)',
    dynamicSelection: 'enabled (queries /api/v1/models, 1hr cache)',
    tiers: Object.keys(tiers).map(t => `${t}:${tiers[t].model}`),
    moduleCount: Object.keys(modules).length
  };
}

function getMaxTokensForModule(moduleName) {
  const normalizedName = findModuleKey(moduleName);
  const moduleConfig = modules[normalizedName];
  if (moduleConfig && moduleConfig.maxTokens) {
    return moduleConfig.maxTokens;
  }
  return MAX_TOKENS.standard;
}

function getFallbackModels(primaryModel) {
  return FALLBACK_CHAIN.filter(m => m !== primaryModel);
}

// =============================================================================
// DYNAMIC MODEL SELECTION
// Uses OpenRouter API to find the cheapest model meeting requirements.
// Falls back to hardcoded defaults if the API is unreachable.
// =============================================================================
let dynamicSelector = null;
try {
  dynamicSelector = require('../utils/dynamic-model-selector');
} catch (e) {
  console.warn('[ModelDefaults] Dynamic model selector not available, using hardcoded defaults only');
}

// Cache for the current scan's dynamic selections
let dynamicScanConfig = null;
let dynamicScanConfigTier = null;

/**
 * Get module config with dynamic model selection (async version)
 * Tries dynamic selection first, falls back to hardcoded config
 * 
 * @param {string} moduleName - Module name
 * @param {string} tier - 'basic', 'pro', or 'enterprise'
 * @returns {Promise<Object>} Module config with model ID
 */
async function getModuleConfigDynamic(moduleName, tier = 'pro') {
  // Global override always wins
  if (GLOBAL_OVERRIDE.enabled) {
    return getModuleConfig(moduleName, tier);
  }

  // Try dynamic selection
  if (dynamicSelector) {
    try {
      // Cache across modules within the same scan
      if (!dynamicScanConfig || dynamicScanConfigTier !== tier) {
        dynamicScanConfig = await dynamicSelector.selectModelsForScan(tier);
        dynamicScanConfigTier = tier;
      }

      if (dynamicScanConfig && dynamicScanConfig.moduleMap[moduleName]) {
        const selected = dynamicScanConfig.moduleMap[moduleName];
        return {
          provider: MODEL_PROVIDERS.OPENROUTER,
          model: selected.id,
          requiresVision: selected.hasVision || false,
          source: `dynamic:${selected.id} ($${selected.pricing.inputPerMillion.toFixed(2)}/$${selected.pricing.outputPerMillion.toFixed(2)} per 1M)`
        };
      }
    } catch (error) {
      console.warn(`[ModelDefaults] Dynamic selection failed for ${moduleName}: ${error.message}`);
    }
  }

  // Fallback to hardcoded config
  return getModuleConfig(moduleName, tier);
}

/**
 * Reset dynamic selection cache (call between scans if needed)
 */
function resetDynamicCache() {
  dynamicScanConfig = null;
  dynamicScanConfigTier = null;
  if (dynamicSelector) dynamicSelector.clearCache();
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = {
  MODEL_PROVIDERS,
  MODELS,
  GLOBAL_OVERRIDE,
  MAX_TOKENS,
  FALLBACK_CHAIN,
  globalDefault,
  tiers,
  modules,
  tierModuleOverrides,
  getModuleConfig,
  getModuleConfigDynamic,
  getDefaultModelFamily,
  getMaxTokensForModule,
  getFallbackModels,
  isGlobalOverrideActive,
  getConfigSummary,
  resetDynamicCache,
  dynamicSelector,
  DEFAULT_MODEL_FAMILY: MODEL_PROVIDERS.OPENROUTER,
  DEFAULT_MODEL_FAMILIES: Object.fromEntries(
    Object.keys(modules).map(m => [m, MODEL_PROVIDERS.OPENROUTER])
  )
};
