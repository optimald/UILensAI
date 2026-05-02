/**
 * AI Models Abstraction Layer for UILensAI
 *
 * All AI calls route through OpenRouter as the single gateway.
 * Model selection is handled by model-defaults.js, fallbacks are
 * model-level (different models on OpenRouter) not provider-level.
 */
const { withTimeoutAndRetry, getModelSettings, isOverloadError } = require('../timeouts');
const { getModelConfig: getCredentialConfig, MODEL_PROVIDERS } = require('../ai-credentials');
const { getModelDetails, estimateTokenCount, canModelHandleTokens } = require('../modelCatalog');
const { calculateCost } = require('../costEstimator');
const { circuitBreaker } = require('../ai-providers/circuit-breaker');
const { getFallbackModels } = require('../../config/model-defaults');

const openrouterClient = require('./openrouter');

/**
 * Get the AI client — always OpenRouter
 */
function getAIClient(_provider) {
  return openrouterClient;
}

/**
 * Logs model selection for CLI visibility
 */
function logModelSelection(modelConfig, moduleName, analysisType = 'analysis', verbose = false) {
  const moduleDisplay = moduleName ? `[${moduleName.toUpperCase()}]` : '[GENERAL]';

  if (!modelConfig || !modelConfig.valid) {
    console.log(`${moduleDisplay} ❌ AI Model Selection Failed: ${modelConfig?.error || 'Unknown error'}`);
    return;
  }

  const modelName = modelConfig.model || modelConfig.modelId;
  const outputTokens = modelConfig.maxTokens || modelConfig.maxOutputTokens || 'Unknown';

  if (verbose) {
    console.log(`${moduleDisplay} 🤖 AI Model Selection:`);
    console.log(`${moduleDisplay}   Model: ${modelName} (via OpenRouter)`);
    console.log(`${moduleDisplay}   Reason: ${modelConfig.selectionReason || 'Standard selection'}`);
    console.log(`${moduleDisplay}   Context Window: ${(modelConfig.contextWindowTokens || 'Unknown').toLocaleString()} tokens`);
    console.log(`${moduleDisplay}   Vision: ${modelConfig.supportsVision ? 'Yes' : 'No'}`);
    console.log(`${moduleDisplay}   Tier: ${modelConfig.performanceTier}`);
  } else {
    console.log(`${moduleDisplay} 🤖 OpenRouter → ${modelName} (${outputTokens} output tokens) for ${analysisType}`);
  }
}

/**
 * Select the model for a given module and tier
 */
async function selectIntelligentModel(options) {
  const {
    analysisType = 'analysis',
    tier = 'Basic',
    moduleName = null,
    model = null,
    maxTokens = null,
    verbose = false
  } = options;

  const credentialConfig = await getCredentialConfig({
    model: model,
    vision: analysisType === 'ui' || moduleName === 'ui',
    tier: tier === 'Enterprise' ? 'enterprise' : (tier === 'Pro' ? 'pro' : 'basic'),
    moduleName: moduleName,
  });

  if (!credentialConfig.valid) {
    return {
      valid: false,
      error: credentialConfig.error,
      provider: null,
      model: null
    };
  }

  // Get full model details from catalog
  const modelDetails = getModelDetails(credentialConfig.provider, credentialConfig.model);

  const enrichedConfig = {
    valid: true,
    provider: MODEL_PROVIDERS.OPENROUTER,
    model: credentialConfig.model,
    modelId: credentialConfig.model,
    contextWindowTokens: modelDetails?.contextWindowTokens || credentialConfig.contextWindowTokens || 200000,
    maxOutputTokens: modelDetails?.maxOutputTokens || credentialConfig.maxOutputTokens || 16384,
    supportsVision: credentialConfig.supportsVision || credentialConfig.vision,
    performanceTier: credentialConfig.performanceTier || 'basic',
    costInputPerMillion: modelDetails?.costInputPerMillion || credentialConfig.costInputPerMillion || 0,
    costOutputPerMillion: modelDetails?.costOutputPerMillion || credentialConfig.costOutputPerMillion || 0,
    notes: modelDetails?.notes || null,
    selectionReason: credentialConfig.selectionReason || 'OpenRouter selection',
    tier: credentialConfig.tier,
    vision: credentialConfig.vision
  };

  logModelSelection(enrichedConfig, moduleName, analysisType, verbose);
  return enrichedConfig;
}

/**
 * Analyzes data with an AI model via OpenRouter
 */
async function analyzeWithAI(options) {
  const {
    prompt,
    analysisType,
    model: userPreferredModel,
    modelFamily: _userPreferredFamily,
    strategy = 'specialized',
    tier = 'Free',
    tierName = tier,
    moduleName,
    vision = false,
    systemPrompt,
    messages,
    images,
    imageMediaType,
    maxTokens: _maxTokens,
    temperature,
    tools,
    toolChoice,
    isJsonOutput = false,
    customSchema,
    expectedJsonStructure = "object",
    costAggregator,
    verbose = false,
    maxRetries: customMaxRetries
  } = options;

  let maxTokens = _maxTokens;
  let modelConfigToUse;
  let aiUsage = { inputTokens: 0, outputTokens: 0, modelUsed: null };
  let aiResponseData = null;
  let aiError = null;
  let fallbackAttempted = false;

  const effectiveTier = tierName || tier;

  // Default maxTokens from module config if not explicitly provided
  if (!maxTokens && moduleName) {
    const { getMaxTokensForModule } = require('../../config/model-defaults');
    maxTokens = getMaxTokensForModule(moduleName);
  }

  try {
    modelConfigToUse = await selectIntelligentModel({
      analysisType,
      tier: effectiveTier,
      model: userPreferredModel,
      analysisDepth: options.analysisDepth,
      moduleName,
      verbose
    });

    if (!modelConfigToUse || !modelConfigToUse.provider || !modelConfigToUse.model) {
      throw new Error(`No valid AI model configuration for module '${moduleName}', tier '${effectiveTier}'.`);
    }

    // Validate context window
    if (prompt && typeof prompt === 'string') {
      const estimatedInputTokens = estimateTokenCount(prompt + (systemPrompt || ''));
      if (!canModelHandleTokens(modelConfigToUse.provider, modelConfigToUse.model, estimatedInputTokens, maxTokens || 4096)) {
        console.warn(`[AIModelsIndex] Model ${modelConfigToUse.model} may not handle estimated token count.`);
      }
    }

    // Attempt analysis with model-level fallback
    const result = await attemptAnalysisWithFallback({
      modelConfig: modelConfigToUse,
      prompt,
      systemPrompt,
      messages,
      images,
      imageMediaType,
      maxTokens,
      temperature,
      tools,
      toolChoice,
      isJsonOutput,
      customSchema,
      expectedJsonStructure,
      vision,
      tier: effectiveTier,
      moduleName,
      verbose,
      customMaxRetries
    });

    aiResponseData = result.data;
    aiError = result.error;
    aiUsage = result.usage || aiUsage;
    fallbackAttempted = result.fallbackAttempted || false;

    if (result.finalModelConfig) {
      modelConfigToUse = result.finalModelConfig;
    }

    aiUsage.modelUsed = aiUsage.modelUsed || modelConfigToUse.model;
    aiUsage.provider = MODEL_PROVIDERS.OPENROUTER;

    // Calculate cost
    const cost = calculateCost(
      MODEL_PROVIDERS.OPENROUTER,
      aiUsage.modelUsed,
      aiUsage.inputTokens || 0,
      aiUsage.outputTokens || 0
    );

    if (verbose) {
      console.log(`[AIModelsIndex] AI call completed. Tokens: ${aiUsage.inputTokens}/${aiUsage.outputTokens}, Cost: $${cost.totalCostUSD.toFixed(6)}`);
      if (fallbackAttempted) {
        console.log(`[AIModelsIndex] Fallback was used for ${moduleName}`);
      }
    }

    const usageResponse = {
      provider: MODEL_PROVIDERS.OPENROUTER,
      model: aiUsage.modelUsed,
      inputTokens: aiUsage.inputTokens || 0,
      outputTokens: aiUsage.outputTokens || 0,
      costUSD: parseFloat(cost.totalCostUSD.toFixed(6)),
      modelCapabilities: {
        contextWindowTokens: modelConfigToUse.contextWindowTokens,
        supportsVision: modelConfigToUse.supportsVision,
        performanceTier: modelConfigToUse.performanceTier
      },
      selectionReason: modelConfigToUse.selectionReason,
      fallbackUsed: fallbackAttempted
    };

    // Track cost
    if (costAggregator && usageResponse.costUSD > 0) {
      costAggregator.addFromUsage(moduleName || 'ui-viewport', usageResponse);
    }

    return {
      data: aiResponseData,
      error: aiError,
      usage: usageResponse
    };

  } catch (error) {
    console.error(`[AIModelsIndex] Critical error in analyzeWithAI: ${error.message}`);
    return {
      data: null,
      error: error.message,
      usage: {
        provider: MODEL_PROVIDERS.OPENROUTER,
        model: modelConfigToUse?.model || 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUSD: 0,
        modelCapabilities: {},
        selectionReason: 'Error',
        fallbackUsed: fallbackAttempted
      }
    };
  }
}

/**
 * Validates and fixes JSON response from AI
 */
function validateAndFixJsonResponse(response, moduleName, verbose = false) {
  if (!response) {
    return { isValid: false, data: null, error: 'No response received' };
  }

  if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
    return { isValid: true, data: response, error: null };
  }

  if (typeof response === 'string') {
    try {
      return { isValid: true, data: JSON.parse(response), error: null };
    } catch (_e) {
      // Try cleanup
      let fixed = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      try {
        return { isValid: true, data: JSON.parse(fixed), error: null };
      } catch (e2) {
        if (verbose) console.log(`[AI Models] ${moduleName}: JSON parse failed: ${e2.message}`);
        return { isValid: false, data: null, error: `JSON parsing failed: ${e2.message}` };
      }
    }
  }

  if (Array.isArray(response)) {
    return { isValid: true, data: { items: response }, error: null };
  }

  return { isValid: true, data: { value: response }, error: null };
}

/**
 * Attempts AI analysis with model-level fallback on OpenRouter
 * If the primary model fails, tries fallback models (still on OpenRouter)
 */
async function attemptAnalysisWithFallback(options) {
  const {
    modelConfig,
    prompt, systemPrompt, messages, images, imageMediaType,
    maxTokens, temperature, tools, toolChoice, isJsonOutput,
    customSchema, expectedJsonStructure, vision, tier,
    moduleName, verbose, customMaxRetries
  } = options;

  let finalResult = null;
  let finalUsage = { inputTokens: 0, outputTokens: 0, modelUsed: null };
  let finalError = null;
  let fallbackAttempted = false;
  let finalModelConfig = modelConfig;

  try {
    // Check circuit breaker for primary model
    if (circuitBreaker.isBlocked(modelConfig.model)) {
      if (verbose) console.warn(`[AIModelsIndex] Circuit breaker OPEN for model ${modelConfig.model}. Skipping to fallback.`);
      throw new Error(`Circuit breaker OPEN for model '${modelConfig.model}'`);
    }

    // Attempt primary model
    const result = await executeAnalysisWithProvider(finalModelConfig, {
      prompt, systemPrompt, messages, images, imageMediaType,
      maxTokens, temperature, tools, toolChoice, isJsonOutput,
      customSchema, vision, tier, verbose, customMaxRetries
    });

    if (result.data !== null && result.error === null) {
      const validated = validateAndFixJsonResponse(result.data, moduleName, verbose);
      if (validated.isValid) {
        finalResult = validated.data;
        finalUsage = result.usage || finalUsage;
        circuitBreaker.recordSuccess(modelConfig.model);
        return { data: finalResult, error: null, usage: finalUsage, fallbackAttempted: false, finalModelConfig };
      }
      throw new Error(`Validation failed: ${validated.error}`);
    }

    finalError = result.error || 'Analysis failed';

  } catch (error) {
    circuitBreaker.recordFailure(modelConfig.model);
    console.error(`[AIModelsIndex] Primary model ${modelConfig.model} failed for ${moduleName}: ${error.message}`);
    finalError = error.message;
  }

  // Model-level fallback: try different models on OpenRouter
  const fallbackModels = getFallbackModels(modelConfig.model);
  
  for (const fallbackModel of fallbackModels) {
    if (finalError === null) break;

    if (circuitBreaker.isBlocked(fallbackModel)) {
      console.log(`[AIModelsIndex] Skipping fallback model ${fallbackModel} — circuit breaker OPEN`);
      continue;
    }

    try {
      console.log(`[AIModelsIndex] Fallback: ${modelConfig.model} → ${fallbackModel} for ${moduleName}`);
      fallbackAttempted = true;

      const fbConfig = {
        ...modelConfig,
        model: fallbackModel,
        modelId: fallbackModel,
        selectionReason: `Fallback from ${modelConfig.model}`
      };

      const result = await executeAnalysisWithProvider(fbConfig, {
        prompt, systemPrompt, messages, images, imageMediaType,
        maxTokens, temperature, tools, toolChoice, isJsonOutput,
        customSchema, vision, tier, verbose, customMaxRetries
      });

      if (result.data !== null && result.error === null) {
        const validated = validateAndFixJsonResponse(result.data, moduleName, verbose);
        if (validated.isValid) {
          finalResult = validated.data;
          finalUsage = result.usage || finalUsage;
          finalModelConfig = fbConfig;
          finalError = null;
          circuitBreaker.recordSuccess(fallbackModel);
          console.log(`[AIModelsIndex] Fallback to ${fallbackModel} succeeded for ${moduleName}`);
          break;
        }
      }
    } catch (fbError) {
      circuitBreaker.recordFailure(fallbackModel);
      console.warn(`[AIModelsIndex] Fallback ${fallbackModel} failed for ${moduleName}: ${fbError.message}`);
    }
  }

  return {
    data: finalResult,
    error: finalError,
    usage: finalUsage,
    fallbackAttempted,
    finalModelConfig
  };
}

/**
 * Executes AI analysis via OpenRouter
 */
async function executeAnalysisWithProvider(modelConfig, analysisOptions) {
  const {
    prompt, systemPrompt, messages, images, imageMediaType,
    maxTokens, temperature, tools, toolChoice, isJsonOutput,
    customSchema, verbose, customMaxRetries
  } = analysisOptions;

  const client = openrouterClient;
  if (!client || typeof client.analyze !== 'function') {
    throw new Error(`OpenRouter client is invalid or missing 'analyze' method.`);
  }

  // Get timeout settings
  let timeoutSettings;
  try {
    timeoutSettings = getModelSettings(modelConfig.model, images && images.length > 0);
  } catch (_e) {
    timeoutSettings = {
      timeoutMs: 180000,
      defaultMaxTokens: 8192,
      maxRetries: 2,
      initialDelay: 1000,
      shouldRetry: (error) => error.message.includes('timeout') || error.message.includes('rate limit') || isOverloadError(error)
    };
  }

  const finalMaxRetries = typeof customMaxRetries === 'number' ? customMaxRetries : timeoutSettings.maxRetries;

  const clientOptions = {
    model: modelConfig.model,
    systemPrompt,
    messages,
    images,
    imageMediaType,
    maxTokens: maxTokens,
    temperature: typeof temperature === 'number' ? temperature : 0.2,
    tools,
    toolChoice,
    isJsonOutput,
    customSchema,
    verbose
  };

  const result = await withTimeoutAndRetry(
    () => client.analyze(prompt, clientOptions),
    {
      timeoutMs: timeoutSettings.timeoutMs,
      timeoutMessage: `AI analysis with ${modelConfig.model} timed out after ${timeoutSettings.timeoutMs}ms.`,
      maxRetries: finalMaxRetries,
      initialDelay: timeoutSettings.initialDelay,
      shouldRetry: (error) => {
        if (timeoutSettings.shouldRetry(error)) return true;
        if (isOverloadError(error)) return true;
        return false;
      },
      onRetry: (error, attempt, delay) => {
        if (verbose) {
          console.warn(`[AIModelsIndex] Retry ${attempt + 1}/${finalMaxRetries + 1} for ${modelConfig.model} after ${delay}ms: ${error.message}`);
        }
      }
    }
  );

  // Process result
  let aiResponseData = null;
  let aiUsage = { inputTokens: 0, outputTokens: 0, modelUsed: null };
  let aiError = null;

  if (result && typeof result === 'object') {
    if (result.responseContent !== undefined) {
      aiResponseData = result.responseContent;
      aiUsage = result.usage || aiUsage;
    } else if (result.usage) {
      aiResponseData = result.data || result.content || result.response;
      aiUsage = result.usage;
    } else {
      aiResponseData = result;
    }
    if (result.error) aiError = result.error;
  } else {
    aiResponseData = result;
  }

  aiUsage.modelUsed = aiUsage.modelUsed || modelConfig.model;

  return { data: aiResponseData, error: aiError, usage: aiUsage };
}

/**
 * Get preferred provider — always OpenRouter
 */
function getPreferredProviderForAnalysisType() {
  return { provider: MODEL_PROVIDERS.OPENROUTER };
}

module.exports = {
  analyzeWithAI,
  selectIntelligentModel,
  logModelSelection,
  getAIClient,
  getPreferredProviderForAnalysisType,
  executeAnalysisWithProvider,
};
