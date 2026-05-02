/**
 * Timeout Utility
 * 
 * Provides utilities for handling timeouts, retries, and 
 * safely canceling operations across all modules.
 */

const { createError, ERROR_CATEGORIES, ERROR_TYPES } = require('./error-handler');

/**
 * Default timeout settings for different operations (in milliseconds)
 */
const DEFAULT_TIMEOUTS = {
  AI_API_CALL: 120000,       // 2 minutes for AI API calls
  BROWSER_NAVIGATION: 30000, // 30 seconds for browser navigation
  SCRAPING: 60000,           // 1 minute for web scraping
  FILE_IO: 10000,            // 10 seconds for file operations
  DATABASE: 15000,           // 15 seconds for database operations
  GENERAL: 30000,            // 30 seconds default
  EXTENDED: 360000           // 6 minutes for long-running operations
};

/**
 * Execute a function with a timeout
 * 
 * @param {Function} fn - Function to execute (should return a Promise)
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Error message if timeout occurs
 * @param {Object} errorContext - Additional context for error
 * @returns {Promise<any>} - Result of the function or error
 */
async function withTimeout(fn, timeoutMs = DEFAULT_TIMEOUTS.GENERAL, errorMessage = 'Operation timed out', errorContext = {}) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    let hasTimedOut = false;

    // Create a timeout error
    const timeoutError = createError({
      message: errorMessage,
      category: ERROR_CATEGORIES.TIMEOUT_ERROR,
      type: ERROR_TYPES.NETWORK_TIMEOUT,
      context: {
        timeoutMs,
        ...errorContext
      }
    });

    // Create timeout handler
    const handleTimeout = () => {
      hasTimedOut = true;
      reject(timeoutError);
    };

    // Start the timeout timer
    timeoutId = setTimeout(handleTimeout, timeoutMs);

    // Execute the function
    fn()
      .then(result => {
        if (!hasTimedOut) {
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch(error => {
        if (!hasTimedOut) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * Execute a function with retries
 * 
 * @param {Function} fn - Function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelay - Initial delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {Function} options.shouldRetry - Function to determine if retry should be attempted
 * @param {Function} options.onRetry - Function to call before each retry
 * @returns {Promise<any>} - Result of the function or error
 */
async function withRetry(fn, {
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
  shouldRetry = () => true,
  onRetry = () => { }
} = {}) {
  let lastError;
  let attemptCount = 0;

  while (attemptCount <= maxRetries) {
    try {
      return await fn(attemptCount);
    } catch (error) {
      lastError = error;
      attemptCount++;

      // Check if we should retry
      if (attemptCount > maxRetries || !shouldRetry(error, attemptCount)) {
        throw error;
      }

      // Calculate exponential backoff delay with jitter
      const backoffDelay = Math.min(
        maxDelay,
        initialDelay * Math.pow(2, attemptCount - 1) * (0.5 + Math.random() * 0.5)
      );

      // Call onRetry hook
      onRetry(error, attemptCount, backoffDelay);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  // This should never be reached due to the throw inside the catch block,
  // but TypeScript might complain without it
  throw lastError;
}

/**
 * Execute a function with both timeout and retry
 * 
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options object
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @param {string} options.timeoutMessage - Error message if timeout occurs
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelay - Initial delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {Function} options.shouldRetry - Function to determine if retry should be attempted
 * @param {Function} options.onRetry - Function to call before each retry
 * @returns {Promise<any>} - Result of the function or error
 */
async function withTimeoutAndRetry(fn, {
  timeoutMs = DEFAULT_TIMEOUTS.GENERAL,
  timeoutMessage = 'Operation timed out',
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
  shouldRetry = () => true,
  onRetry = () => { }
} = {}) {
  return withRetry(
    (attempt) => withTimeout(
      () => fn(attempt),
      timeoutMs,
      `${timeoutMessage} (attempt ${attempt + 1}/${maxRetries + 1})`,
      { attempt }
    ),
    {
      maxRetries,
      initialDelay,
      maxDelay,
      shouldRetry,
      onRetry
    }
  );
}

/**
 * Creates an AbortController with an automatic timeout
 * 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {AbortController} - AbortController instance with timeout
 */
function createTimeoutController(timeoutMs = DEFAULT_TIMEOUTS.GENERAL) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Operation aborted after ${timeoutMs}ms timeout`));
  }, timeoutMs);

  // Add a clear method to allow manual cancellation of the timeout
  controller.clearTimeout = () => clearTimeout(timeoutId);

  return controller;
}

/**
 * Create optimization settings for different AI models
 * 
 * @param {string} modelType - Type of model (claude, gpt, gemini, etc.)
 * @param {boolean} vision - Whether the model processes images
 * @returns {Object} - Optimized timeout and retry settings
 */
function getModelSettings(modelType = 'claude', vision = false) {
  // Base settings
  const settings = {
    timeoutMs: DEFAULT_TIMEOUTS.AI_API_CALL,
    maxRetries: 2,
    initialDelay: 2000,
    shouldRetry: (error) => {
      // Enhanced retry logic with overload error detection
      return shouldRetryError(error);
    }
  };

  // Check if input is a specific model rather than a provider
  const isSpecificModel = modelType.includes('-');

  // For specific model names, determine timeout based on model
  if (isSpecificModel) {
    // Claude models
    // Claude 4.x models (Nov 2025+)
    if (modelType.includes('claude-opus-4')) {
      settings.timeoutMs = vision ? 390000 : 360000; // Opus 4.x needs even more time (6.5 min / 6 min)
    } else if (modelType.includes('claude-sonnet-4')) {
      settings.timeoutMs = vision ? 390000 : 360000; // Sonnet 4.x matches Opus for complex analysis (6.5 min / 6 min)
    } else if (modelType.includes('claude-haiku-4')) {
      settings.timeoutMs = vision ? 240000 : 210000; // Haiku 4.x is faster (4 min / 3.5 min)
    }
    // Claude 3.x models
    else if (modelType.startsWith('claude-3-opus')) {
      settings.timeoutMs = vision ? 360000 : 300000; // Opus needs more time
    } else if (modelType.startsWith('claude-3-7-sonnet')) {
      settings.timeoutMs = vision ? 300000 : 240000; // 3.7 Sonnet needs more time
    } else if (modelType.includes('claude-3-5-sonnet')) {
      settings.timeoutMs = vision ? 360000 : 300000; // Increased from 180000/150000 - 3.5 Sonnet models need more time for complex analysis
    } else if (modelType.includes('claude-3')) {
      settings.timeoutMs = vision ? 180000 : 150000; // Other Claude 3 models
    }
    // GPT models
    else if (modelType.includes('gpt-4-vision')) {
      settings.timeoutMs = 240000; // Vision models need more time
    } else if (modelType.includes('gpt-4')) {
      settings.timeoutMs = vision ? 210000 : 180000; // GPT-4 family
    } else if (modelType.includes('gpt-3')) {
      settings.timeoutMs = 120000; // GPT-3.5 is faster
    }
    // Gemini models
    else if (modelType.includes('gemini-1.5-pro')) {
      settings.timeoutMs = vision ? 120000 : 100000;
    } else if (modelType.includes('gemini')) {
      settings.timeoutMs = vision ? 100000 : 80000; // Gemini tends to be faster
    }
    // DeepSeek models
    else if (modelType.includes('deepseek')) {
      settings.timeoutMs = 420000; // WORLD-CLASS FIX: 7 min for accessibility on Cloud Run (was 300s, 2/10 sites still timing out)
      settings.maxRetries = 2;
    }
    // OpenRouter models (Qwen VL, DeepSeek via OpenRouter, etc.)
    else if (modelType.includes('qwen') || modelType.includes('openrouter')) {
      settings.timeoutMs = modelType.includes('vl') ? 300000 : 180000; // 5 min for vision, 3 min for text
      settings.maxRetries = 3; // More retries — openrouter.js handles 429 backoff internally
      settings.initialDelay = 5000; // Start with 5s delay
    }

    return settings;
  }

  // Adjust based on model type for generic providers
  switch (modelType.toLowerCase()) {
    case 'claude':
    case 'anthropic':
      settings.timeoutMs = vision ? 180000 : 150000; // Claude with vision needs more time
      break;

    case 'gpt':
    case 'openai':
      settings.timeoutMs = vision ? 150000 : 120000; // GPT with vision needs more time
      settings.maxRetries = 3; // OpenAI sometimes needs more retries
      break;

    case 'gemini':
    case 'google':
      settings.timeoutMs = 90000; // Gemini tends to be faster
      settings.initialDelay = 1000; // Start with shorter delays
      break;

    case 'azure':
      settings.timeoutMs = 120000;
      settings.initialDelay = 3000; // Azure can have longer cold starts
      break;

    case 'deepseek':
      settings.timeoutMs = 420000; // WORLD-CLASS FIX: Match specific model timeout (7 min)
      settings.maxRetries = 2;
      break;

    default:
    // Use defaults
  }

  return settings;
}

/**
 * Determines if an error is retryable based on error type and content
 * 
 * @param {Error} error - The error to analyze
 * @returns {boolean} - Whether the error should be retried
 */
function shouldRetryError(error) {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorCode = error?.code;
  const statusCode = error?.response?.status || error?.status;

  // Don't retry on client authentication or validation errors
  if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
    return false;
  }

  // Don't retry on content policy violations
  if (statusCode === 422 || errorMessage.includes('content policy') || errorMessage.includes('safety')) {
    return false;
  }

  // Don't retry on malformed requests
  if (errorMessage.includes('invalid request') || errorMessage.includes('malformed')) {
    return false;
  }

  // Retry on network and server errors
  if (statusCode >= 500 || statusCode === 429) {
    return true;
  }

  // Retry on timeout and network errors
  if (errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('econnrefused')) {
    return true;
  }

  // Retry on overload and capacity errors
  if (isOverloadError(error)) {
    return true;
  }

  return false;
}

/**
 * Detects if an error is related to service overload or capacity issues
 * 
 * @param {Error} error - The error to analyze
 * @returns {boolean} - Whether the error indicates service overload
 */
function isOverloadError(error) {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorCode = error?.code;
  const statusCode = error?.response?.status || error?.status;

  // HTTP status codes indicating overload (or insufficient balance/credit to force fallback)
  if (statusCode === 429 || statusCode === 503 || statusCode === 502 || statusCode === 504 || statusCode === 402) {
    return true;
  }

  // Common overload error messages from different AI providers
  const overloadPatterns = [
    // Rate limiting
    'rate limit', 'rate_limit', 'too many requests', 'quota exceeded',
    // Service overload
    'overload', 'overloaded', 'capacity', 'unavailable', 'service unavailable',
    // Temporary issues
    'temporary', 'temporarily', 'try again', 'retry', 'busy',
    // Billing/Credits (Treat as overload to trigger fallback)
    'insufficient balance', 'no credit', 'out of credit', 'payment required', 'balance',
    // Provider-specific messages
    'anthropic is experiencing high demand', 'model is overloaded',
    'openai is at capacity', 'service degraded', 'high traffic',
    'google api quota', 'gemini capacity', 'model busy',
    // Infrastructure issues
    'internal server error', 'bad gateway', 'gateway timeout',
    'server error', 'service error', 'system overload'
  ];

  return overloadPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Gets the provider from a model ID or provider name
 * 
 * @param {string} modelOrProvider - Model ID or provider name
 * @returns {string} - Normalized provider name
 */
function getProviderFromModel(modelOrProvider) {
  if (!modelOrProvider) { return 'unknown'; }

  const input = modelOrProvider.toLowerCase();

  if (input.includes('claude') || input === 'anthropic') { return 'anthropic'; }
  if (input.includes('gpt') || input === 'openai') { return 'openai'; }
  if (input.includes('gemini') || input === 'google') { return 'google'; }
  if (input.includes('deepseek') || input === 'deepseek') { return 'deepseek'; } // Added DeepSeek recognition

  return input;
}

/**
 * Gets alternative AI providers for fallback when primary provider is overloaded
 * 
 * @param {string} primaryProvider - The primary provider that failed
 * @param {boolean} requiresVision - Whether vision capability is required
 * @param {string} tier - Service tier (Free, Pro, Enterprise)
 * @param {string} modelFamily - Optional: restrict fallback to providers within this family (google, anthropic, openai)
 * @returns {Array<string>} - Array of alternative provider names (primary, secondary, tertiary order)
 */
function getAlternativeProviders(primaryProvider, requiresVision = false, tier = 'Basic', modelFamily = null) {
  const primary = getProviderFromModel(primaryProvider);
  const alternatives = [];

  // Map modelFamily to provider name
  const familyToProvider = {
    'google': 'google',
    'anthropic': 'anthropic',
    'claude': 'anthropic',
    'openai': 'openai',
    'deepseek': 'deepseek'
  };
  const restrictedProvider = modelFamily ? familyToProvider[modelFamily.toLowerCase()] : null;

  // Define provider priorities based on capabilities and tier
  const allProviders = ['anthropic', 'openai', 'google', 'deepseek'];
  const tierLimitations = {
    'basic': ['anthropic', 'google', 'deepseek'], // Basic tier may have limited OpenAI access
    'pro': ['anthropic', 'openai', 'google', 'deepseek'],
    'enterprise': ['anthropic', 'openai', 'google', 'deepseek']
  };

  const availableProviders = tierLimitations[tier.toLowerCase()] || allProviders;

  // If modelFamily is restricted, only use providers within that family
  let candidateProviders = availableProviders;
  if (restrictedProvider) {
    candidateProviders = availableProviders.filter(p => p === restrictedProvider);
    if (candidateProviders.length === 0) {
      // If restricted family not available, return empty (no cross-provider fallback)
      // Same-provider model fallback will be handled in attemptAnalysisWithFallback
      return [];
    }
  }

  // Remove the primary provider
  const otherProviders = candidateProviders.filter(p => p !== primary);

  // PRIMARY/SECONDARY/TERTIARY fallback order
  if (restrictedProvider) {
    // When restricted to a family, only try other models within that provider
    // Cross-provider fallback is disabled - return empty
    // Same-provider model fallback will be handled in attemptAnalysisWithFallback
    return [];
  }

  // Standard cross-provider fallback (when modelFamily not restricted)
  if (requiresVision) {
    // For vision tasks, prioritize providers with strong vision capabilities
    // Order: Anthropic (best vision) -> OpenAI -> Google
    if (otherProviders.includes('anthropic')) { alternatives.push('anthropic'); }
    if (otherProviders.includes('openai')) { alternatives.push('openai'); }
    if (otherProviders.includes('google')) { alternatives.push('google'); }
  } else {
    // For text tasks, use primary/secondary/tertiary order
    if (primary === 'anthropic') {
      // Primary: Anthropic failed
      // Secondary: OpenAI (fast, good quality)
      // Tertiary: Google (fast, cost-effective)
      if (otherProviders.includes('openai')) { alternatives.push('openai'); }
      if (otherProviders.includes('google')) { alternatives.push('google'); }
    } else if (primary === 'openai') {
      // Primary: OpenAI failed
      // Secondary: Anthropic (best quality)
      // Tertiary: Google (cost-effective)
      if (otherProviders.includes('anthropic')) { alternatives.push('anthropic'); }
      if (otherProviders.includes('google')) { alternatives.push('google'); }
    } else if (primary === 'google') {
      // Primary: Google failed
      // Secondary: OpenAI (stable)
      // Tertiary: Anthropic (high quality)
      if (otherProviders.includes('openai')) { alternatives.push('openai'); }
      if (otherProviders.includes('anthropic')) { alternatives.push('anthropic'); }
    } else if (primary === 'deepseek') {
      // Primary: DeepSeek failed
      // Secondary: Anthropic (Claude) - Specific User Request
      // Tertiary: OpenAI
      if (otherProviders.includes('anthropic')) { alternatives.push('anthropic'); }
      if (otherProviders.includes('openai')) { alternatives.push('openai'); }
    } else {
      // Catch-all
      if (otherProviders.includes('anthropic')) { alternatives.push('anthropic'); }
    }
  }

  return alternatives;
}

module.exports = {
  DEFAULT_TIMEOUTS,
  withTimeout,
  withRetry,
  withTimeoutAndRetry,
  createTimeoutController,
  getModelSettings,
  shouldRetryError,
  isOverloadError,
  getProviderFromModel,
  getAlternativeProviders
}; 