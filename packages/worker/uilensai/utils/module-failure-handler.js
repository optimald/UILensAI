/**
 * Module Failure Handler
 * Standardized handling of module failures with sanitization for WebEvo
 */

const { getRatingLabelForScore } = require('./scoring-engine');
const { notifyModuleFailure } = require('./admin-notification');

// All modules are treated equally - we strive for very low failure rates
// All module failures are important and require admin attention

/**
 * Check if a module result indicates a failure
 */
function isModuleFailure(moduleResult) {
  if (!moduleResult) return true;
  
  // Check for explicit error
  if (moduleResult.error) return true;
  
  // Check for failed status
  if (moduleResult.status === 'failed') return true;
  
  // Check for critical failure indicators in summary
  if (moduleResult.summary) {
    const topIssues = moduleResult.summary.topIssues || [];
    const hasFailureIndicator = topIssues.some(issue => 
      typeof issue === 'string' && (
        issue.toLowerCase().includes('critically failed') ||
        issue.toLowerCase().includes('module execution failed') ||
        issue.toLowerCase().includes('analysis failed') ||
        issue.toLowerCase().includes('timed out') ||
        issue.toLowerCase().includes('ai analysis failed')
      )
    );
    if (hasFailureIndicator) return true;
  }
  
  // Check for timeout errors in error message
  if (moduleResult.error && (
    moduleResult.error.includes('timeout') ||
    moduleResult.error.includes('timed out') ||
    moduleResult.error.includes('AI analysis failed')
  )) {
    return true;
  }
  
  return false;
}

/**
 * Create a sanitized failure response for WebEvo
 * Removes all technical details and provides user-friendly failure state
 */
function createSanitizedFailureResponse(moduleName, originalError = null) {
  return {
    status: 'failed',
    summary: {
      score: 0,
      rating: 'Failed',
      status: 'Failed',
      topIssues: [`${moduleName} analysis could not be completed`],
      // No technical error details exposed to users
    },
    issues: {
      items: [],
      totalAvailableItems: 0,
      pagination: null
    },
    recommendations: {
      items: [],
      totalAvailableItems: 0,
      pagination: null
    },
    // Store original error internally (not exposed to WebEvo)
    _internalError: originalError ? {
      message: originalError.message || String(originalError),
      timestamp: new Date().toISOString()
    } : null,
    // Mark as sanitized so report generator knows to hide technical details
    _sanitized: true
  };
}

/**
 * Handle module failure with admin notification and sanitization
 * All modules are treated equally - we strive for very low failure rates
 */
async function handleModuleFailure(moduleName, moduleResult, jobId, url) {
  // All modules are important - treat all failures as requiring attention
  // We strive for very low failure rates across all modules
  
  // Extract error information
  let errorInfo = null;
  if (moduleResult?.error) {
    errorInfo = new Error(moduleResult.error);
  } else if (moduleResult?._internalError) {
    errorInfo = new Error(moduleResult._internalError.message);
  } else {
    errorInfo = new Error(`${moduleName} module failed`);
  }

  // Send admin notification for all module failures
  // All modules are treated equally - we need to know about all failures
  try {
    await notifyModuleFailure(moduleName, jobId, url, errorInfo, false); // All modules treated equally
  } catch (emailError) {
    console.error(`[ModuleFailureHandler] Failed to send admin email for ${moduleName}:`, emailError);
    // Don't throw - email failure shouldn't break the job
  }

  // Return sanitized failure response
  return createSanitizedFailureResponse(moduleName, errorInfo);
}

/**
 * Sanitize module result before sending to WebEvo
 * Removes technical error details and ensures clean failure state
 */
function sanitizeModuleResultForWebEvo(moduleResult, moduleName) {
  if (!moduleResult) {
    return createSanitizedFailureResponse(moduleName);
  }

  // If already sanitized, return as-is
  if (moduleResult._sanitized) {
    return moduleResult;
  }

  // If module failed, sanitize it
  if (isModuleFailure(moduleResult)) {
    return createSanitizedFailureResponse(moduleName, moduleResult.error ? new Error(moduleResult.error) : null);
  }

  // If module succeeded, return as-is (but remove any internal error fields)
  const sanitized = { ...moduleResult };
  delete sanitized._internalError;
  delete sanitized._sanitized;
  
  // Ensure no technical error messages in topIssues
  if (sanitized.summary?.topIssues) {
    sanitized.summary.topIssues = sanitized.summary.topIssues.map(issue => {
      if (typeof issue === 'string') {
        // Remove technical error messages
        if (issue.toLowerCase().includes('ai analysis failed') ||
            issue.toLowerCase().includes('timed out') ||
            issue.toLowerCase().includes('claude-sonnet') ||
            issue.toLowerCase().includes('attempt') ||
            issue.toLowerCase().includes('critically failed')) {
          return `${moduleName} analysis could not be completed`;
        }
      }
      return issue;
    });
  }

  // Remove error field if it contains technical details
  if (sanitized.error) {
    const errorLower = sanitized.error.toLowerCase();
    if (errorLower.includes('timeout') ||
        errorLower.includes('ai analysis failed') ||
        errorLower.includes('claude-sonnet') ||
        errorLower.includes('attempt')) {
      delete sanitized.error;
    }
  }

  return sanitized;
}

module.exports = {
  isModuleFailure,
  createSanitizedFailureResponse,
  handleModuleFailure,
  sanitizeModuleResultForWebEvo
};
