/**
 * Error Classification and User-Friendly Messaging for UILensAI
 * 
 * This module provides standardized error classification and messaging
 * for integration with external systems like WebEvo.
 */

/**
 * Error types recognized by UILensAI
 */
const ERROR_TYPES = {
  TIMEOUT: 'timeout',
  BROWSER_LAUNCH: 'browser_launch',
  BROWSER_NAVIGATION: 'browser_navigation',
  ZOMBIE_JOB: 'zombie_job',
  ACCESSIBILITY: 'accessibility',
  AI_API: 'ai_api',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown'
};

/**
 * Classify an error message into a structured error type
 * 
 * @param {string|Error} error - The error message or Error object
 * @returns {Object} - Structured error information
 */
function classifyError(error) {
  const errorMessage = typeof error === 'string' ? error : error.message || String(error);
  const errorLower = errorMessage.toLowerCase();
  
  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out') || errorLower.includes('exceeded')) {
    return {
      errorType: ERROR_TYPES.TIMEOUT,
      isRetryable: true,
      userFriendlyError: 'The analysis took too long to complete. This may happen with very large or complex websites. Please try again, or contact support if the issue persists.',
      technicalDetails: errorMessage
    };
  }
  
  // Browser launch/navigation errors
  if (errorLower.includes('browser') && (errorLower.includes('launch') || errorLower.includes('start'))) {
    return {
      errorType: ERROR_TYPES.BROWSER_LAUNCH,
      isRetryable: true,
      userFriendlyError: 'Unable to start the browser for analysis. Our system is experiencing temporary issues. Please try again in a few minutes.',
      technicalDetails: errorMessage
    };
  }
  
  if (errorLower.includes('navigation') || errorLower.includes('nav failed') || errorLower.includes('page.goto')) {
    return {
      errorType: ERROR_TYPES.BROWSER_NAVIGATION,
      isRetryable: true,
      userFriendlyError: 'Unable to access the website. The site may be down, blocking automated access, or behind a firewall. Please verify the URL is correct and accessible.',
      technicalDetails: errorMessage
    };
  }
  
  // Zombie job cleanup
  if (errorLower.includes('stale') || errorLower.includes('zombie') || errorLower.includes('watchdog')) {
    return {
      errorType: ERROR_TYPES.ZOMBIE_JOB,
      isRetryable: true,
      userFriendlyError: 'The analysis job became unresponsive and was automatically terminated. Please try again.',
      technicalDetails: errorMessage
    };
  }
  
  // AI API errors
  if (errorLower.includes('anthropic') || errorLower.includes('openai') || errorLower.includes('ai api') || errorLower.includes('model')) {
    return {
      errorType: ERROR_TYPES.AI_API,
      isRetryable: true,
      userFriendlyError: 'Our AI analysis service is temporarily unavailable. Please try again in a few minutes.',
      technicalDetails: errorMessage
    };
  }
  
  // Rate limiting
  if (errorLower.includes('rate limit') || errorLower.includes('too many requests') || errorLower.includes('429')) {
    return {
      errorType: ERROR_TYPES.RATE_LIMIT,
      isRetryable: true,
      userFriendlyError: 'Our system is currently experiencing high demand. Please wait a few minutes and try again.',
      technicalDetails: errorMessage
    };
  }
  
  // Network errors
  if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('econnrefused') || errorLower.includes('enotfound')) {
    return {
      errorType: ERROR_TYPES.NETWORK,
      isRetryable: true,
      userFriendlyError: 'A network connection error occurred. Please check that the website is accessible and try again.',
      technicalDetails: errorMessage
    };
  }
  
  // Validation errors
  if (errorLower.includes('invalid') || errorLower.includes('validation') || errorLower.includes('malformed')) {
    return {
      errorType: ERROR_TYPES.VALIDATION,
      isRetryable: false,
      userFriendlyError: 'The provided URL or configuration is invalid. Please check your input and try again.',
      technicalDetails: errorMessage
    };
  }
  
  // Accessibility module specific
  if (errorLower.includes('accessibility') || errorLower.includes('axe-core')) {
    return {
      errorType: ERROR_TYPES.ACCESSIBILITY,
      isRetryable: true,
      userFriendlyError: 'The accessibility analysis encountered an error. This may be due to unusual page structure. Please try again or skip the accessibility module.',
      technicalDetails: errorMessage
    };
  }
  
  // Unknown error
  return {
    errorType: ERROR_TYPES.UNKNOWN,
    isRetryable: true,
    userFriendlyError: 'An unexpected error occurred during analysis. Our team has been notified. Please try again, or contact support if the issue persists.',
    technicalDetails: errorMessage
  };
}

/**
 * Create a structured error response for webhooks and API responses
 * 
 * @param {string|Error} error - The error message or Error object
 * @param {Object} context - Additional context (jobId, url, module, etc.)
 * @returns {Object} - Complete structured error for external systems
 */
function createStructuredError(error, context = {}) {
  const classification = classifyError(error);
  
  return {
    error: typeof error === 'string' ? error : error.message || String(error),
    errorType: classification.errorType,
    isRetryable: classification.isRetryable,
    userFriendlyError: classification.userFriendlyError,
    technicalDetails: classification.technicalDetails,
    failedAt: new Date().toISOString(),
    context: {
      jobId: context.jobId || null,
      url: context.url || null,
      module: context.module || null,
      ...context
    }
  };
}

module.exports = {
  ERROR_TYPES,
  classifyError,
  createStructuredError
};

