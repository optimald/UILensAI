/**
 * Error Handler Utility
 * 
 * Provides standardized error handling, logging, and recovery
 * mechanisms across all modules.
 */

const fs = require('fs').promises;
const path = require('path');

// Define error categories for better organization
const ERROR_CATEGORIES = {
  API_ERROR: 'api_error',         // External API errors
  NETWORK_ERROR: 'network_error', // Network connectivity issues
  TIMEOUT_ERROR: 'timeout_error', // Timeouts
  AUTH_ERROR: 'auth_error',       // Authentication/authorization errors
  PARSE_ERROR: 'parse_error',     // Data parsing errors
  MODULE_ERROR: 'module_error',   // Module-specific errors
  SYSTEM_ERROR: 'system_error'    // System/environment errors
};

// Specific error types within categories
const ERROR_TYPES = {
  // API errors
  API_RATE_LIMIT: 'api_rate_limit',
  API_QUOTA_EXCEEDED: 'api_quota_exceeded',
  API_INVALID_REQUEST: 'api_invalid_request',
  API_SERVICE_UNAVAILABLE: 'api_service_unavailable',
  
  // Network errors
  NETWORK_TIMEOUT: 'network_timeout',
  NETWORK_CONNECTION_FAILED: 'network_connection_failed',
  
  // Auth errors
  AUTH_INVALID_KEY: 'auth_invalid_key',
  AUTH_EXPIRED: 'auth_expired',
  
  // Parse errors
  PARSE_JSON_FAILED: 'parse_json_failed',
  PARSE_RESPONSE_FAILED: 'parse_response_failed',
  
  // Module errors
  MODULE_INITIALIZATION_FAILED: 'module_initialization_failed',
  MODULE_EXECUTION_FAILED: 'module_execution_failed',
  
  // System errors
  SYSTEM_ENVIRONMENT_ERROR: 'system_environment_error',
  SYSTEM_FILE_ERROR: 'system_file_error'
};

/**
 * Create a standardized error object
 * 
 * @param {Object} options - Error options
 * @param {string} options.message - Error message
 * @param {string} options.module - Module where error occurred
 * @param {string} options.category - Error category
 * @param {string} options.type - Specific error type
 * @param {Error} options.originalError - Original error object
 * @param {Object} options.context - Additional context data
 * @returns {Object} - Standardized error object
 */
function createError({
  message,
  module = 'unknown',
  category = ERROR_CATEGORIES.MODULE_ERROR,
  type = ERROR_TYPES.MODULE_EXECUTION_FAILED,
  originalError = null,
  context = {}
}) {
  // Create timestamp
  const timestamp = new Date().toISOString();
  
  // Extract useful properties from original error
  let originalErrorInfo = {};
  if (originalError) {
    originalErrorInfo = {
      name: originalError.name,
      message: originalError.message,
      stack: originalError.stack
    };
    
    // Extract additional properties for specific error types
    if (originalError.code) {originalErrorInfo.code = originalError.code;}
    if (originalError.statusCode) {originalErrorInfo.statusCode = originalError.statusCode;}
    if (originalError.response) {
      originalErrorInfo.response = {
        status: originalError.response.status,
        statusText: originalError.response.statusText,
        data: originalError.response.data
      };
    }
  }
  
  // Create standardized error object
  return {
    message,
    module,
    category,
    type,
    timestamp,
    context,
    originalError: originalErrorInfo,
    // Include user-friendly recovery guidance based on error type
    recovery: getRecoveryGuidance(category, type)
  };
}

/**
 * Get recovery guidance based on error category and type
 * 
 * @param {string} category - Error category
 * @param {string} type - Error type
 * @returns {string} - Recovery guidance
 */
function getRecoveryGuidance(category, type) {
  switch (type) {
    case ERROR_TYPES.API_RATE_LIMIT:
      return 'Please wait a few minutes before trying again';
    
    case ERROR_TYPES.API_QUOTA_EXCEEDED:
      return 'Your API quota has been exceeded. Please check your subscription plan';
    
    case ERROR_TYPES.API_INVALID_REQUEST:
      return 'The request to the external service was invalid. Please check the inputs';
    
    case ERROR_TYPES.NETWORK_TIMEOUT:
    case ERROR_TYPES.NETWORK_CONNECTION_FAILED:
    case ERROR_TYPES.API_SERVICE_UNAVAILABLE:
      return 'Network connection issues detected. Please check your internet connection or try again later';
    
    case ERROR_TYPES.AUTH_INVALID_KEY:
    case ERROR_TYPES.AUTH_EXPIRED:
      return 'Authentication failed. Please check your API credentials';
    
    case ERROR_TYPES.PARSE_JSON_FAILED:
    case ERROR_TYPES.PARSE_RESPONSE_FAILED:
      return 'Failed to process the response data. This may be a temporary issue';
    
    case ERROR_TYPES.SYSTEM_ENVIRONMENT_ERROR:
      return 'System configuration issue detected. Please check your environment variables';
    
    case ERROR_TYPES.SYSTEM_FILE_ERROR:
      return 'File system operation failed. Please check permissions and available disk space';
    
    default:
      return 'An unexpected error occurred. Please try again or contact support';
  }
}

/**
 * Log an error to the configured destination
 * 
 * @param {Object} error - Standardized error object
 * @param {Object} options - Logging options
 * @param {boolean} options.console - Whether to log to console
 * @param {boolean} options.file - Whether to log to file
 * @param {string} options.logDir - Directory for log files
 * @returns {Promise<void>}
 */
async function logError(error, { 
  console: logToConsole = true,
  file: logToFile = true,
  logDir = './storage/logs'
} = {}) {
  // Always stringify the error for consistent format
  const errorJson = JSON.stringify(error, null, 2);
  
  // Log to console if enabled
  if (logToConsole) {
    console.error(`[ERROR][${error.module}][${error.category}] ${error.message}`);
    
    // In verbose mode, show more details
    if (process.env.VERBOSE === 'true' || process.env.DEBUG === 'true') {
      console.error(errorJson);
    }
  }
  
  // Log to file if enabled
  if (logToFile) {
    try {
      // Create logs directory if it doesn't exist
      await fs.mkdir(logDir, { recursive: true });
      
      // Create log file name based on date
      const date = new Date();
      const logFile = path.join(
        logDir, 
        `error_${date.toISOString().split('T')[0]}.log`
      );
      
      // Append to log file
      await fs.appendFile(
        logFile,
        `${date.toISOString()} - ${errorJson}\n`,
        'utf8'
      );
    } catch (fileError) {
      // Don't throw here to avoid cascading errors
      console.error(`Failed to write error log: ${fileError.message}`);
    }
  }
}

/**
 * Handle an error with standard procedure
 * 
 * @param {Error|Object} error - Original error or standardized error object
 * @param {Object} options - Error handling options
 * @param {string} options.module - Module name
 * @param {Object} options.context - Additional context
 * @param {boolean} options.rethrow - Whether to rethrow the error
 * @returns {Object} - Standardized error object
 */
async function handleError(error, {
  module = 'unknown',
  context = {},
  rethrow = false
} = {}) {
  // Convert to standardized error if needed
  const standardError = error.category ? error : createError({
    message: error.message || 'Unknown error',
    module,
    originalError: error instanceof Error ? error : null,
    context
  });
  
  // Log the error
  await logError(standardError);
  
  // Rethrow if requested
  if (rethrow) {
    throw standardError;
  }
  
  return standardError;
}

/**
 * Detect error type from an error object
 * 
 * @param {Error} error - Error to analyze
 * @returns {Object} - Detected category and type
 */
function detectErrorType(error) {
  // Check for axios/request errors
  if (error.response) {
    const status = error.response.status;
    
    // Handle different HTTP status codes
    if (status === 429) {
      return { 
        category: ERROR_CATEGORIES.API_ERROR, 
        type: ERROR_TYPES.API_RATE_LIMIT 
      };
    }
    
    if (status === 401 || status === 403) {
      return { 
        category: ERROR_CATEGORIES.AUTH_ERROR, 
        type: ERROR_TYPES.AUTH_INVALID_KEY 
      };
    }
    
    if (status >= 500) {
      return { 
        category: ERROR_CATEGORIES.API_ERROR, 
        type: ERROR_TYPES.API_SERVICE_UNAVAILABLE 
      };
    }
    
    if (status >= 400) {
      return { 
        category: ERROR_CATEGORIES.API_ERROR, 
        type: ERROR_TYPES.API_INVALID_REQUEST 
      };
    }
  }
  
  // Check for timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT' || 
      error.message?.includes('timeout')) {
    return { 
      category: ERROR_CATEGORIES.NETWORK_ERROR, 
      type: ERROR_TYPES.NETWORK_TIMEOUT 
    };
  }
  
  // Check for network errors
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || 
      error.code === 'ECONNRESET') {
    return { 
      category: ERROR_CATEGORIES.NETWORK_ERROR, 
      type: ERROR_TYPES.NETWORK_CONNECTION_FAILED 
    };
  }
  
  // Check for JSON parse errors
  if (error instanceof SyntaxError && error.message?.includes('JSON')) {
    return { 
      category: ERROR_CATEGORIES.PARSE_ERROR, 
      type: ERROR_TYPES.PARSE_JSON_FAILED 
    };
  }
  
  // Check for file system errors
  if (error.code === 'ENOENT' || error.code === 'EACCES' || 
      error.code === 'EPERM') {
    return { 
      category: ERROR_CATEGORIES.SYSTEM_ERROR, 
      type: ERROR_TYPES.SYSTEM_FILE_ERROR 
    };
  }
  
  // Default to module error
  return { 
    category: ERROR_CATEGORIES.MODULE_ERROR, 
    type: ERROR_TYPES.MODULE_EXECUTION_FAILED 
  };
}

/**
 * Wrap a function with error handling
 * 
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Error handling options
 * @param {string} options.module - Module name
 * @param {Object} options.context - Additional context
 * @param {boolean} options.rethrow - Whether to rethrow errors
 * @returns {Function} - Wrapped function
 */
function withErrorHandling(fn, {
  module = 'unknown',
  context = {},
  rethrow = false
} = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error, { module, context, rethrow });
    }
  };
}

module.exports = {
  createError,
  handleError,
  logError,
  detectErrorType,
  withErrorHandling,
  ERROR_CATEGORIES,
  ERROR_TYPES
}; 