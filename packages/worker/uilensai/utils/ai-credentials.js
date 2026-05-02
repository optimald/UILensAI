/**
 * AI Credentials and Model Configuration for UILensAI
 * 
 * All AI calls route through OpenRouter as the single gateway.
 * Model selection is controlled by ../config/model-defaults.js
 * Dynamic selection queries OpenRouter API for the cheapest qualifying model.
 */

require('dotenv').config();

const {
  MODEL_PROVIDERS,
  MODELS,
  getModuleConfig,
  getModuleConfigDynamic,
  isGlobalOverrideActive,
  getConfigSummary
} = require('../config/model-defaults');

// Vision capability is now determined dynamically from OpenRouter API
// This static list is only used as a fallback when the API is unreachable
const VISION_MODELS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-3.1-pro-preview',
  'google/gemini-2.5-pro',
  'google/gemini-3.1-flash-lite-preview',
];

/**
 * Get available providers — always OpenRouter
 */
function getAvailableProviders() {
  if (process.env.OPENROUTER_API_KEY) {
    return [MODEL_PROVIDERS.OPENROUTER];
  }
  return [];
}

/**
 * Validate that OpenRouter credentials are available
 */
function validateCredentials(_provider) {
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * Build a model config response object from a central config result
 */
function _buildModelConfigResponse(centralConfig, selectedModel, normalizedTier, vision) {
  const performanceTierMap = {
    'basic': 'basic',
    'pro': 'intermediate',
    'enterprise': 'advanced'
  };

  let modelDetails = null;
  try {
    const { getModelDetails } = require('./modelCatalog');
    modelDetails = getModelDetails(MODEL_PROVIDERS.OPENROUTER, selectedModel);
  } catch (_error) {}

  return {
    valid: true,
    model: selectedModel,
    provider: MODEL_PROVIDERS.OPENROUTER,
    modelFamily: 'openrouter',
    tier: normalizedTier,
    vision: vision && (centralConfig.requiresVision || VISION_MODELS.includes(selectedModel)),
    contextWindowTokens: modelDetails?.contextWindowTokens || 1048576,
    supportsVision: vision && (centralConfig.requiresVision || VISION_MODELS.includes(selectedModel)),
    performanceTier: performanceTierMap[normalizedTier] || 'basic',
    costInputPerMillion: modelDetails?.costInputPerMillion || 0,
    costOutputPerMillion: modelDetails?.costOutputPerMillion || 0,
    maxOutputTokens: modelDetails?.maxOutputTokens || 65536,
    selectionReason: `OpenRouter: ${centralConfig.source}`
  };
}

/**
 * Validate common config options, returns error object or null
 */
function _validateConfig(tier) {
  // Tier system is collapsed — we no longer strictly validate tier strings.
  // Any tier passed in (Free, Pro, Basic, Enterprise, etc.) will resolve to the same enterprise config.
  
  if (!process.env.OPENROUTER_API_KEY) {
    return {
      valid: false,
      error: 'OPENROUTER_API_KEY not set. All AI calls require OpenRouter.',
      model: null, provider: null
    };
  }
  return null;
}

/**
 * Get model configuration (SYNC — uses hardcoded defaults)
 * Use getModelConfigAsync() for dynamic selection from OpenRouter API.
 */
function getModelConfig(options = {}) {
  const { moduleName = null, vision = false, tier = 'basic' } = options;
  const normalizedTier = tier.toLowerCase();

  const error = _validateConfig(tier);
  if (error) return error;

  const centralConfig = getModuleConfig(moduleName, normalizedTier);
  const selectedModel = centralConfig.model;

  console.log(`[getModelConfig] ${moduleName || 'default'} (${normalizedTier}) → ${selectedModel} via OpenRouter [${centralConfig.source}]`);

  return _buildModelConfigResponse(centralConfig, selectedModel, normalizedTier, vision);
}

/**
 * Get model configuration (ASYNC — uses dynamic selection from OpenRouter API)
 * Queries /api/v1/models to find the cheapest model meeting requirements.
 * Falls back to hardcoded defaults if the API is unreachable.
 */
async function getModelConfigAsync(options = {}) {
  const { moduleName = null, vision = false, tier = 'basic' } = options;
  const normalizedTier = tier.toLowerCase();

  const error = _validateConfig(tier);
  if (error) return error;

  // Try dynamic selection first
  const centralConfig = await getModuleConfigDynamic(moduleName, normalizedTier);
  const selectedModel = centralConfig.model;

  console.log(`[getModelConfigAsync] ${moduleName || 'default'} (${normalizedTier}) → ${selectedModel} via OpenRouter [${centralConfig.source}]`);

  return _buildModelConfigResponse(centralConfig, selectedModel, normalizedTier, vision);
}

/**
 * Get API key for OpenRouter
 */
function getApiKey(_provider) {
  return process.env.OPENROUTER_API_KEY;
}

module.exports = {
  MODEL_PROVIDERS,
  VISION_MODELS,
  getAvailableProviders,
  validateCredentials,
  getModelConfig,
  getModelConfigAsync,
  getApiKey
};