
/**
 * Model Catalog Update Utility
 * 
 * This utility helps with updating the model catalog configuration file.
 * It provides validation, pricing checks, and automated updates.
 */

const fs = require('fs');
const path = require('path');
const { getConfigPath } = require('./paths');

const { getCatalogMetadata, reloadCatalog, getProviderInfo } = require('./modelCatalog');

const CATALOG_PATH = getConfigPath('model-catalog.json');

/**
 * Validate the model catalog structure
 * @param {Object} catalog - The catalog to validate
 * @returns {Object} Validation result with errors and warnings
 */
function validateCatalog(catalog) {
  const errors = [];
  const warnings = [];

  // Check basic structure
  if (!catalog.providers || typeof catalog.providers !== 'object') {
    errors.push('Missing or invalid providers object');
    return { valid: false, errors, warnings };
  }

  if (!catalog.version) {
    warnings.push('Missing version field');
  }

  if (!catalog.lastUpdated) {
    warnings.push('Missing lastUpdated field');
  }

  // Validate each provider
  for (const [providerId, providerData] of Object.entries(catalog.providers)) {
    if (!providerData.name) {
      warnings.push(`Provider ${providerId} missing name`);
    }

    if (!providerData.models || typeof providerData.models !== 'object') {
      errors.push(`Provider ${providerId} missing or invalid models object`);
      continue;
    }

    // Validate each model
    for (const [modelId, modelData] of Object.entries(providerData.models)) {
      const modelPath = `${providerId}.${modelId}`;

      // Required fields
      const requiredFields = [
        'contextWindowTokens',
        'supportsVision',
        'performanceTier',
        'costInputPerMillion',
        'costOutputPerMillion'
      ];

      for (const field of requiredFields) {
        if (modelData[field] === undefined || modelData[field] === null) {
          errors.push(`Model ${modelPath} missing required field: ${field}`);
        }
      }

      // Type validation
      if (typeof modelData.contextWindowTokens !== 'number' || modelData.contextWindowTokens <= 0) {
        errors.push(`Model ${modelPath} has invalid contextWindowTokens`);
      }

      if (typeof modelData.supportsVision !== 'boolean') {
        errors.push(`Model ${modelPath} has invalid supportsVision (must be boolean)`);
      }

      if (!['basic', 'intermediate', 'advanced'].includes(modelData.performanceTier)) {
        errors.push(`Model ${modelPath} has invalid performanceTier (must be basic, intermediate, or advanced)`);
      }

      if (typeof modelData.costInputPerMillion !== 'number' || modelData.costInputPerMillion < 0) {
        errors.push(`Model ${modelPath} has invalid costInputPerMillion`);
      }

      if (typeof modelData.costOutputPerMillion !== 'number' || modelData.costOutputPerMillion < 0) {
        errors.push(`Model ${modelPath} has invalid costOutputPerMillion`);
      }

      // Warnings for missing optional fields
      if (!modelData.name) {
        warnings.push(`Model ${modelPath} missing name field`);
      }

      if (!modelData.notes) {
        warnings.push(`Model ${modelPath} missing notes field`);
      }

      if (modelData.deprecated === undefined) {
        warnings.push(`Model ${modelPath} missing deprecated field`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Add a new model to the catalog
 * @param {string} provider - Provider ID
 * @param {string} modelId - Model ID
 * @param {Object} modelData - Model configuration
 */
function addModel(provider, modelId, modelData) {
  try {
    const catalogData = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(catalogData);

    if (!catalog.providers[provider]) {
      throw new Error(`Provider ${provider} not found in catalog`);
    }

    if (catalog.providers[provider].models[modelId]) {
      throw new Error(`Model ${modelId} already exists for provider ${provider}`);
    }

    // Add the model
    catalog.providers[provider].models[modelId] = {
      name: modelData.name || modelId,
      contextWindowTokens: modelData.contextWindowTokens,
      supportsVision: modelData.supportsVision,
      performanceTier: modelData.performanceTier,
      costInputPerMillion: modelData.costInputPerMillion,
      costOutputPerMillion: modelData.costOutputPerMillion,
      notes: modelData.notes || '',
      deprecated: false,
      releaseDate: modelData.releaseDate || new Date().toISOString().split('T')[0],
      ...modelData
    };

    // Update metadata
    catalog.lastUpdated = new Date().toISOString().split('T')[0];

    // Validate before saving
    const validation = validateCatalog(catalog);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Save the updated catalog
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`✅ Added model ${provider}/${modelId} to catalog`);

    if (validation.warnings.length > 0) {
      console.log('⚠️  Warnings:', validation.warnings.join(', '));
    }

  } catch (error) {
    console.error(`❌ Failed to add model: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Update pricing for an existing model
 * @param {string} provider - Provider ID
 * @param {string} modelId - Model ID
 * @param {number} inputCost - New input cost per million tokens
 * @param {number} outputCost - New output cost per million tokens
 */
function updatePricing(provider, modelId, inputCost, outputCost) {
  try {
    const catalogData = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(catalogData);

    if (!catalog.providers[provider]?.models[modelId]) {
      throw new Error(`Model ${provider}/${modelId} not found in catalog`);
    }

    const oldInputCost = catalog.providers[provider].models[modelId].costInputPerMillion;
    const oldOutputCost = catalog.providers[provider].models[modelId].costOutputPerMillion;

    // Update pricing
    catalog.providers[provider].models[modelId].costInputPerMillion = inputCost;
    catalog.providers[provider].models[modelId].costOutputPerMillion = outputCost;
    catalog.lastUpdated = new Date().toISOString().split('T')[0];

    // Save the updated catalog
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    
    console.log(`✅ Updated pricing for ${provider}/${modelId}`);
    console.log(`   Input: $${oldInputCost}/M → $${inputCost}/M`);
    console.log(`   Output: $${oldOutputCost}/M → $${outputCost}/M`);

  } catch (error) {
    console.error(`❌ Failed to update pricing: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Mark a model as deprecated
 * @param {string} provider - Provider ID
 * @param {string} modelId - Model ID
 */
function deprecateModel(provider, modelId) {
  try {
    const catalogData = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(catalogData);

    if (!catalog.providers[provider]?.models[modelId]) {
      throw new Error(`Model ${provider}/${modelId} not found in catalog`);
    }

    catalog.providers[provider].models[modelId].deprecated = true;
    catalog.lastUpdated = new Date().toISOString().split('T')[0];

    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(`✅ Marked ${provider}/${modelId} as deprecated`);

  } catch (error) {
    console.error(`❌ Failed to deprecate model: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display catalog statistics
 */
function showStats() {
  try {
    const metadata = getCatalogMetadata();
    console.log('📊 Model Catalog Statistics');
    console.log(`   Version: ${metadata.version}`);
    console.log(`   Last Updated: ${metadata.lastUpdated}`);
    console.log(`   Providers: ${metadata.providersCount}`);
    console.log(`   Total Models: ${metadata.totalModels}`);

    // Show provider breakdown
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    console.log('\n📋 Provider Breakdown:');
    
    for (const [providerId, providerData] of Object.entries(catalog.providers)) {
      const modelCount = Object.keys(providerData.models || {}).length;
      const deprecatedCount = Object.values(providerData.models || {})
        .filter(m => m.deprecated).length;
      
      console.log(`   ${providerData.name}: ${modelCount} models (${deprecatedCount} deprecated)`);
    }

  } catch (error) {
    console.error(`❌ Failed to show stats: ${error.message}`);
  }
}

/**
 * Validate the current catalog
 */
function validateCurrentCatalog() {
  try {
    const catalogData = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(catalogData);
    const validation = validateCatalog(catalog);

    if (validation.valid) {
      console.log('✅ Catalog validation passed');
    } else {
      console.log('❌ Catalog validation failed');
      validation.errors.forEach(error => console.log(`   Error: ${error}`));
    }

    if (validation.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      validation.warnings.forEach(warning => console.log(`   Warning: ${warning}`));
    }

    return validation.valid;

  } catch (error) {
    console.error(`❌ Failed to validate catalog: ${error.message}`);
    return false;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      validateCurrentCatalog();
      break;

    case 'stats':
      showStats();
      break;

    case 'add-model':
      if (args.length < 3) {
        console.log('Usage: node update-model-catalog.js add-model <provider> <modelId> [modelData.json]');
        process.exit(1);
      }
      
      const provider = args[1];
      const modelId = args[2];
      const modelDataFile = args[3];
      
      if (!modelDataFile) {
        console.log('Please provide model data as JSON file');
        process.exit(1);
      }
      
      try {
        const modelData = JSON.parse(fs.readFileSync(modelDataFile, 'utf8'));
        addModel(provider, modelId, modelData);
      } catch (error) {
        console.error(`❌ Failed to read model data: ${error.message}`);
        process.exit(1);
      }
      break;

    case 'update-pricing':
      if (args.length < 5) {
        console.log('Usage: node update-model-catalog.js update-pricing <provider> <modelId> <inputCost> <outputCost>');
        process.exit(1);
      }
      
      updatePricing(args[1], args[2], parseFloat(args[3]), parseFloat(args[4]));
      break;

    case 'deprecate':
      if (args.length < 3) {
        console.log('Usage: node update-model-catalog.js deprecate <provider> <modelId>');
        process.exit(1);
      }
      
      deprecateModel(args[1], args[2]);
      break;

    case 'reload':
      const metadata = reloadCatalog();
      console.log('✅ Catalog reloaded');
      console.log(`   Version: ${metadata.version}, Models: ${metadata.totalModels}`);
      break;

    default:
      console.log('UILensAI Model Catalog Update Utility');
      console.log('');
      console.log('Commands:');
      console.log('  validate                                    - Validate catalog structure');
      console.log('  stats                                       - Show catalog statistics');
      console.log('  add-model <provider> <modelId> <data.json> - Add new model');
      console.log('  update-pricing <provider> <modelId> <in> <out> - Update model pricing');
      console.log('  deprecate <provider> <modelId>             - Mark model as deprecated');
      console.log('  reload                                      - Reload catalog from file');
      console.log('');
      console.log('Examples:');
      console.log('  node update-model-catalog.js validate');
      console.log('  node update-model-catalog.js update-pricing anthropic claude-3-haiku-20240307 0.30 1.50');
      console.log('  node update-model-catalog.js deprecate openai gpt-4');
      break;
  }
}

module.exports = {
  validateCatalog,
  addModel,
  updatePricing,
  deprecateModel,
  showStats,
  validateCurrentCatalog
}; 