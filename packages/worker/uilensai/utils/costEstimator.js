/**
 * Cost Estimation Utilities for AI Model Usage
 * 
 * This module provides cost calculation utilities for AI API calls across different providers.
 * It uses the dynamic model catalog for up-to-date pricing information.
 */

const { getModelDetails } = require('./modelCatalog');

/**
 * Calculate the cost of an AI API call
 * @param {string} provider - The AI provider (anthropic, openai, google)
 * @param {string} model - The specific model used
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost breakdown with total and per-token costs
 */
function calculateCost(provider, model, inputTokens, outputTokens) {
  const modelDetails = getModelDetails(provider, model);
  
  if (!modelDetails) {
    console.warn(`[CostEstimator] Model ${provider}/${model} not found in catalog, using fallback pricing`);
    // Fallback pricing to prevent system failure
    const fallbackPricing = {
      anthropic: { input: 3.00, output: 15.00 },
      openai: { input: 2.50, output: 10.00 },
      google: { input: 1.25, output: 5.00 },
      openrouter: { input: 0.20, output: 0.40 } // Adding openrouter fallback
    };
    
    // Default to a much cheaper fallback if the provider isn't explicitly known to be expensive
    const defaultFallback = { input: 0.15, output: 0.30 };
    const pricing = fallbackPricing[provider] || defaultFallback;
    
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    
    return {
      totalCostUSD: inputCost + outputCost,
      inputCostUSD: inputCost,
      outputCostUSD: outputCost,
      inputTokens,
      outputTokens,
      costInputPerMillion: pricing.input,
      costOutputPerMillion: pricing.output,
      currency: 'USD',
      fallbackPricing: true
    };
  }

  const inputCost = (inputTokens / 1000000) * modelDetails.costInputPerMillion;
  const outputCost = (outputTokens / 1000000) * modelDetails.costOutputPerMillion;

  return {
    totalCostUSD: inputCost + outputCost,
    inputCostUSD: inputCost,
    outputCostUSD: outputCost,
    inputTokens,
    outputTokens,
    costInputPerMillion: modelDetails.costInputPerMillion,
    costOutputPerMillion: modelDetails.costOutputPerMillion,
    currency: 'USD',
    fallbackPricing: false
  };
}

/**
 * Estimate the cost of a potential AI API call based on text length
 * @param {string} provider - The AI provider
 * @param {string} model - The specific model
 * @param {string} inputText - The input text to estimate
 * @param {number} estimatedOutputTokens - Estimated output tokens (default: 1000)
 * @returns {Object} Estimated cost breakdown
 */
function estimateCost(provider, model, inputText, estimatedOutputTokens = 1000) {
  // Rough token estimation: ~4 characters per token for English text
  const estimatedInputTokens = Math.ceil((inputText || '').length / 4);
  
  return calculateCost(provider, model, estimatedInputTokens, estimatedOutputTokens);
}

/**
 * Compare costs across different models for the same input
 * @param {string} inputText - The input text
 * @param {number} estimatedOutputTokens - Estimated output tokens
 * @param {Array} models - Array of {provider, model} objects to compare
 * @returns {Array} Array of cost comparisons sorted by total cost
 */
function compareCosts(inputText, estimatedOutputTokens = 1000, models = []) {
  const estimatedInputTokens = Math.ceil((inputText || '').length / 4);
  
  const comparisons = models.map(({ provider, model }) => {
    const cost = calculateCost(provider, model, estimatedInputTokens, estimatedOutputTokens);
    const modelDetails = getModelDetails(provider, model);
    
    return {
      provider,
      model,
      modelName: modelDetails?.name || model,
      performanceTier: modelDetails?.performanceTier || 'unknown',
      ...cost
    };
  });

  // Sort by total cost (ascending)
  return comparisons.sort((a, b) => a.totalCostUSD - b.totalCostUSD);
}

/**
 * Get the most cost-effective model for a given performance tier
 * @param {string} performanceTier - The desired performance tier (basic, intermediate, advanced)
 * @param {string} inputText - The input text to estimate
 * @param {number} estimatedOutputTokens - Estimated output tokens
 * @param {boolean} requiresVision - Whether vision capabilities are required
 * @returns {Object|null} Most cost-effective model or null if none found
 */
function getMostCostEffectiveModel(performanceTier, inputText = '', estimatedOutputTokens = 1000, requiresVision = false) {
  const { getModelCatalog } = require('./modelCatalog');
  const catalog = getModelCatalog();
  
  const candidates = [];
  
  // Collect all models matching the criteria
  for (const [provider, models] of Object.entries(catalog)) {
    for (const [modelId, modelDetails] of Object.entries(models)) {
      if (modelDetails.performanceTier === performanceTier && 
          (!requiresVision || modelDetails.supportsVision)) {
        candidates.push({ provider, model: modelId });
      }
    }
  }
  
  if (candidates.length === 0) {return null;}
  
  const comparisons = compareCosts(inputText, estimatedOutputTokens, candidates);
  return comparisons[0] || null;
}

/**
 * Calculate cost savings between two models
 * @param {Object} baseModel - {provider, model} for base comparison
 * @param {Object} compareModel - {provider, model} for comparison
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost savings analysis
 */
function calculateSavings(baseModel, compareModel, inputTokens, outputTokens) {
  const baseCost = calculateCost(baseModel.provider, baseModel.model, inputTokens, outputTokens);
  const compareCost = calculateCost(compareModel.provider, compareModel.model, inputTokens, outputTokens);
  
  const savings = baseCost.totalCostUSD - compareCost.totalCostUSD;
  const savingsPercent = baseCost.totalCostUSD > 0 ? (savings / baseCost.totalCostUSD) * 100 : 0;
  
  return {
    baseCost: baseCost.totalCostUSD,
    compareCost: compareCost.totalCostUSD,
    savingsUSD: savings,
    savingsPercent,
    isMoreExpensive: savings < 0,
    baseModel: `${baseModel.provider}/${baseModel.model}`,
    compareModel: `${compareModel.provider}/${compareModel.model}`
  };
}

/**
 * Estimate monthly costs based on usage patterns
 * @param {Object} usagePattern - Usage pattern with daily/weekly/monthly estimates
 * @param {string} provider - The AI provider
 * @param {string} model - The specific model
 * @returns {Object} Monthly cost projection
 */
function estimateMonthlyCosts(usagePattern, provider, model) {
  const {
    dailyAnalyses = 0,
    avgInputTokensPerAnalysis = 5000,
    avgOutputTokensPerAnalysis = 1000
  } = usagePattern;
  
  const dailyCost = calculateCost(
    provider, 
    model, 
    dailyAnalyses * avgInputTokensPerAnalysis,
    dailyAnalyses * avgOutputTokensPerAnalysis
  );
  
  const monthlyCost = dailyCost.totalCostUSD * 30;
  const yearlyProjection = monthlyCost * 12;
  
  return {
    dailyCostUSD: dailyCost.totalCostUSD,
    monthlyCostUSD: monthlyCost,
    yearlyProjectionUSD: yearlyProjection,
    dailyAnalyses,
    avgTokensPerAnalysis: avgInputTokensPerAnalysis + avgOutputTokensPerAnalysis,
    provider,
    model,
    currency: 'USD'
  };
}

/**
 * Get cost-effective alternatives for a given model
 * @param {string} provider - Current provider
 * @param {string} model - Current model
 * @param {number} inputTokens - Input tokens for comparison
 * @param {number} outputTokens - Output tokens for comparison
 * @returns {Array} Array of alternative models with cost comparisons
 */
function getCostEffectiveAlternatives(provider, model, inputTokens = 5000, outputTokens = 1000) {
  const currentModelDetails = getModelDetails(provider, model);
  if (!currentModelDetails) {return [];}
  
  const { getModelCatalog } = require('./modelCatalog');
  const catalog = getModelCatalog();
  
  const alternatives = [];
  
  // Find models with same or better performance tier
  const tierHierarchy = { basic: 0, intermediate: 1, advanced: 2 };
  const currentTierLevel = tierHierarchy[currentModelDetails.performanceTier] || 0;
  
  for (const [altProvider, models] of Object.entries(catalog)) {
    for (const [altModelId, altModelDetails] of Object.entries(models)) {
      // Skip the current model
      if (altProvider === provider && altModelId === model) {continue;}
      
      const altTierLevel = tierHierarchy[altModelDetails.performanceTier] || 0;
      
      // Only consider models with same or better performance
      if (altTierLevel >= currentTierLevel) {
        const savings = calculateSavings(
          { provider, model },
          { provider: altProvider, model: altModelId },
          inputTokens,
          outputTokens
        );
        
        alternatives.push({
          provider: altProvider,
          model: altModelId,
          modelName: altModelDetails.name || altModelId,
          performanceTier: altModelDetails.performanceTier,
          contextWindow: altModelDetails.contextWindowTokens,
          supportsVision: altModelDetails.supportsVision,
          ...savings
        });
      }
    }
  }
  
  // Sort by savings (highest savings first)
  return alternatives
    .filter(alt => alt.savingsUSD > 0) // Only show actual savings
    .sort((a, b) => b.savingsUSD - a.savingsUSD);
}

module.exports = {
  calculateCost,
  estimateCost,
  compareCosts,
  getMostCostEffectiveModel,
  calculateSavings,
  estimateMonthlyCosts,
  getCostEffectiveAlternatives
}; 