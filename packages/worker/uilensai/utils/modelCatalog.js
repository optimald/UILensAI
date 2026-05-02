/**
 * Model Catalog - Dynamic AI Model Configuration Loader
 * 
 * This module loads AI model configurations from a JSON file, making it easy to update
 * model capabilities, pricing, and metadata without code changes.
 */

const fs = require('fs');
const path = require('path');
const { getConfigPath } = require('./paths');

// Cache for loaded catalog to avoid repeated file reads
let _catalogCache = null;
let _catalogLoadTime = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Load the model catalog from JSON configuration file
 * @param {boolean} forceReload - Force reload from file even if cached
 * @returns {Object} The model catalog configuration
 */
function loadModelCatalog(forceReload = false) {
  const now = Date.now();
  
  // Return cached version if still valid
  if (!forceReload && _catalogCache && _catalogLoadTime && (now - _catalogLoadTime) < CACHE_TTL_MS) {
    return _catalogCache;
  }

  try {
    const catalogPath = getConfigPath('model-catalog.json');
    const catalogData = fs.readFileSync(catalogPath, 'utf8');
    const catalog = JSON.parse(catalogData);
    
    // Validate basic structure
    if (!catalog.providers || typeof catalog.providers !== 'object') {
      throw new Error('Invalid catalog structure: missing or invalid providers');
    }

    // Cache the loaded catalog
    _catalogCache = catalog;
    _catalogLoadTime = now;
    
    return catalog;
  } catch (error) {
    console.error('[ModelCatalog] Failed to load model catalog:', error.message);
    
    // Return minimal fallback catalog to prevent system failure
    return {
      version: 'fallback',
      lastUpdated: new Date().toISOString(),
      providers: {
        anthropic: {
          name: 'Anthropic',
          models: {
            'claude-3-haiku-20240307': {
              name: 'Claude 3 Haiku (Fallback)',
              contextWindowTokens: 200000,
              supportsVision: true,
              performanceTier: 'basic',
              costInputPerMillion: 0.25,
              costOutputPerMillion: 1.25,
              notes: 'Fallback model configuration',
              deprecated: false
            }
          }
        }
      }
    };
  }
}

/**
 * Get the flattened model catalog in the legacy format for backward compatibility
 * @returns {Object} Model catalog in the original nested format
 */
function getModelCatalog() {
  const catalog = loadModelCatalog();
  const flatCatalog = {};
  
  for (const [providerId, providerData] of Object.entries(catalog.providers)) {
    if (providerData.models) {
      flatCatalog[providerId] = {};
      
      for (const [modelId, modelData] of Object.entries(providerData.models)) {
        // Skip deprecated models unless explicitly requested
        if (modelData.deprecated) {continue;}
        
        flatCatalog[providerId][modelId] = {
          contextWindowTokens: modelData.contextWindowTokens,
          maxOutputTokens: modelData.maxOutputTokens,
          supportsVision: modelData.supportsVision,
          performanceTier: modelData.performanceTier,
          costInputPerMillion: modelData.costInputPerMillion,
          costOutputPerMillion: modelData.costOutputPerMillion,
          notes: modelData.notes || '',
          name: modelData.name || modelId,
          releaseDate: modelData.releaseDate,
          experimental: modelData.experimental || false
        };
      }
    }
  }
  
  return flatCatalog;
}

// Export the flattened catalog for backward compatibility
const MODEL_CATALOG = getModelCatalog();

/**
 * Get detailed information about a specific model
 * @param {string} provider - The AI provider (anthropic, openai, google, or openrouter)
 * @param {string} modelId - The specific model ID (e.g., 'gpt-4o', 'deepseek/deepseek-chat')
 * @returns {Object|null} Model details or null if not found
 */
function getModelDetails(provider, modelId) {
  const catalog = getModelCatalog();
  
  // Exact match
  if (catalog[provider]?.[modelId]) {
    return catalog[provider][modelId];
  }

  // Handle OpenRouter or prefixed models (e.g. google/gemini-2.5-flash or openrouter/deepseek/deepseek-chat-v3)
  const isPrefixed = modelId.includes('/');
  if (provider === 'openrouter' || isPrefixed) {
    const cleanModelId = modelId.startsWith('openrouter/') ? modelId.substring(11) : modelId;
    const parts = cleanModelId.split('/');
    const inferredProvider = parts[0]; // e.g., 'deepseek' or 'google'
    const shortModelId = parts[parts.length - 1]; // e.g., 'gemini-2.5-flash'
    
    // Try with inferred provider and original model string
    if (inferredProvider && catalog[inferredProvider]?.[cleanModelId]) {
      return catalog[inferredProvider][cleanModelId];
    }
    
    // Try with inferred provider and short model string
    if (inferredProvider && catalog[inferredProvider]?.[shortModelId]) {
      return catalog[inferredProvider][shortModelId];
    }
    
    // Fallback: search all providers for the short model ID
    for (const [prov, models] of Object.entries(catalog)) {
      if (models[shortModelId]) {
        return models[shortModelId];
      }
      if (models[cleanModelId]) {
        return models[cleanModelId];
      }
      if (models[modelId]) {
        return models[modelId];
      }
    }
  }

  return null;
}

/**
 * Find a model in a family matching specific criteria
 * @param {string} provider - The AI provider
 * @param {string} performanceTier - Desired performance tier (basic, intermediate, advanced)
 * @param {boolean} requiresVision - Whether vision capabilities are required
 * @param {number} minContext - Minimum context window size required
 * @returns {Object|null} Best matching model or null if none found
 */
function findModelInFamily(provider, performanceTier = 'basic', requiresVision = false, minContext = 0) {
  const catalog = getModelCatalog();
  if (!catalog[provider]) {return null;}
  
  const models = Object.entries(catalog[provider])
    .map(([id, details]) => ({ id, ...details }))
    .filter(m => 
      m.performanceTier === performanceTier && 
      (!requiresVision || m.supportsVision) && 
      m.contextWindowTokens >= minContext &&
      !m.experimental // Exclude experimental models by default
    );

  if (models.length > 0) {
    // Prefer models with larger context windows, then lower cost
    return models.sort((a, b) => {
      if (a.contextWindowTokens !== b.contextWindowTokens) {
        return b.contextWindowTokens - a.contextWindowTokens;
      }
      return a.costInputPerMillion - b.costInputPerMillion;
    })[0];
  }
  return null;
}

/**
 * Get all available providers
 * @returns {string[]} Array of provider names
 */
function getAvailableProviders() {
  const catalog = getModelCatalog();
  return Object.keys(catalog);
}

/**
 * Get all models for a specific provider
 * @param {string} provider - The AI provider
 * @param {boolean} includeDeprecated - Whether to include deprecated models
 * @returns {Object[]} Array of model objects with id and details
 */
function getModelsForProvider(provider, includeDeprecated = false) {
  const catalog = loadModelCatalog();
  const providerData = catalog.providers[provider];
  
  if (!providerData || !providerData.models) {return [];}
  
  return Object.entries(providerData.models)
    .filter(([_, modelData]) => includeDeprecated || !modelData.deprecated)
    .map(([id, details]) => ({ id, ...details }));
}

/**
 * Get replacement model for a deprecated model
 * @param {string} provider - The AI provider
 * @param {string} deprecatedModelId - The deprecated model ID
 * @returns {Object|null} Replacement model details or null if not found
 */
function getReplacementModel(provider, deprecatedModelId) {
  const catalog = loadModelCatalog();
  const providerData = catalog.providers[provider];
  
  if (!providerData || !providerData.models || !providerData.models[deprecatedModelId]) {
    return null;
  }
  
  const deprecatedModel = providerData.models[deprecatedModelId];
  if (!deprecatedModel.deprecated || !deprecatedModel.replacementModel) {
    return null;
  }
  
  const replacementModel = providerData.models[deprecatedModel.replacementModel];
  if (!replacementModel) {return null;}
  
  return {
    id: deprecatedModel.replacementModel,
    ...replacementModel
  };
}

/**
 * Check if a model is deprecated and get deprecation info
 * @param {string} provider - The AI provider
 * @param {string} modelId - The model ID to check
 * @returns {Object|null} Deprecation info or null if not deprecated
 */
function getModelDeprecationInfo(provider, modelId) {
  const catalog = loadModelCatalog();
  const providerData = catalog.providers[provider];
  
  if (!providerData || !providerData.models || !providerData.models[modelId]) {
    return null;
  }
  
  const model = providerData.models[modelId];
  if (!model.deprecated) {return null;}
  
  return {
    deprecated: true,
    deprecationDate: model.deprecationDate,
    endOfLifeDate: model.endOfLifeDate,
    replacementModel: model.replacementModel,
    reason: model.notes || 'Model has been deprecated'
  };
}

/**
 * Estimate token count for a given text (rough approximation)
 * @param {string} text - The text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
  if (!text || typeof text !== 'string') {return 0;}
  
  // Rough approximation: 1 token ≈ 4 characters for English text
  // This is a simplified estimate; actual tokenization varies by model
  return Math.ceil(text.length / 4);
}

/**
 * Check if a model can handle the estimated token requirements
 * @param {string} provider - The AI provider
 * @param {string} modelId - The model ID
 * @param {number} estimatedInputTokens - Estimated input tokens
 * @param {number} estimatedOutputTokens - Estimated output tokens
 * @returns {boolean} Whether the model can handle the token requirements
 */
function canModelHandleTokens(provider, modelId, estimatedInputTokens, estimatedOutputTokens = 4096) {
  const modelDetails = getModelDetails(provider, modelId);
  if (!modelDetails) {return false;}
  
  const totalTokens = estimatedInputTokens + estimatedOutputTokens;
  return totalTokens <= modelDetails.contextWindowTokens;
}

/**
 * Get catalog metadata (version, last updated, etc.)
 * @returns {Object} Catalog metadata
 */
function getCatalogMetadata() {
  const catalog = loadModelCatalog();
  return {
    version: catalog.version,
    lastUpdated: catalog.lastUpdated,
    providersCount: Object.keys(catalog.providers).length,
    totalModels: Object.values(catalog.providers).reduce((sum, provider) => 
      sum + (provider.models ? Object.keys(provider.models).length : 0), 0
    )
  };
}

/**
 * Reload the model catalog from file (useful for updates)
 * @returns {Object} Reloaded catalog metadata
 */
function reloadCatalog() {
  const catalog = loadModelCatalog(true);
  console.log('[ModelCatalog] Catalog reloaded from file');
  return getCatalogMetadata();
}

/**
 * Get provider information including pricing URLs
 * @param {string} provider - The AI provider
 * @returns {Object|null} Provider information or null if not found
 */
function getProviderInfo(provider) {
  const catalog = loadModelCatalog();
  return catalog.providers[provider] || null;
}

module.exports = {
  MODEL_CATALOG, // For backward compatibility
  getModelCatalog, // Get the full flattened catalog
  getModelDetails,
  findModelInFamily,
  getAvailableProviders,
  getModelsForProvider,
  estimateTokenCount,
  canModelHandleTokens,
  getCatalogMetadata,
  reloadCatalog,
  getProviderInfo,
  loadModelCatalog, // For direct access to raw catalog
  getReplacementModel,
  getModelDeprecationInfo
}; 