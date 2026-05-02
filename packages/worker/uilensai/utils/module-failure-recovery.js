/**
 * Module Failure Recovery System
 * Provides standardized failure handling and recovery mechanisms for analysis modules
 */

const { getRatingLabelForScore } = require('./scoring-engine');

class ModuleFailureRecovery {
  /**
   * Create a standardized failure response for a module
   * @param {string} moduleName - Name of the module that failed
   * @param {Error} error - The error that occurred
   * @param {Object} options - Additional options
   * @returns {Object} Standardized failure response
   */
  static createFailureResponse(moduleName, error, options = {}) {
    const { url, tier, customScore = 0, customRating = 'Failed' } = options;
    
    return {
      summary: {
        score: customScore,
        rating: customRating,
        status: 'Failed',
        message: `${moduleName} analysis failed: ${error.message}`,
        timestamp: new Date().toISOString()
      },
      issues: [{
        id: `${moduleName}-failure`,
        category: 'System Error',
        severity: 'critical',
        title: `${moduleName} Analysis Failed`,
        description: error.message,
        impact: 'Analysis could not be completed',
        recommendation: 'Please retry the analysis or contact support if the issue persists'
      }],
      recommendations: [{
        id: `${moduleName}-retry`,
        title: 'Retry Analysis',
        description: `The ${moduleName} analysis failed. Please try again.`,
        priority: 'high',
        effort: 'low',
        impact: 'high'
      }],
      error: error.message,
      failureType: 'module_execution_failed',
      url: url || 'unknown',
      tier: tier || 'unknown'
    };
  }

  /**
   * Apply streaming timeout recovery for modules that fail due to streaming issues
   * @param {string} moduleName - Name of the module
   * @param {Error} error - The error that occurred
   * @param {Object} options - Recovery options
   * @returns {Object} Recovery response
   */
  static applyStreamingTimeoutRecovery(moduleName, error, options = {}) {
    const { url, tier, verbose, customScore = 1, customRating = 'Analysis Failed' } = options;
    
    if (verbose) {
      console.log(`[ModuleFailureRecovery] Applying streaming timeout recovery for ${moduleName}`);
    }
    
    // Create a failure response with appropriate messaging
    const failureResponse = this.createFailureResponse(moduleName, error, {
      url,
      tier,
      customScore,
      customRating
    });

    // Add streaming-specific context
    failureResponse.summary.message = `${moduleName} analysis failed due to streaming timeout or AI processing error`;
    failureResponse.issues[0].description = `Streaming timeout or AI processing error: ${error.message}`;
    failureResponse.issues[0].recommendation = 'This may be due to high AI model load. Please retry the analysis.';
    
    return failureResponse;
  }

  /**
   * Validate and fix module response to prevent score paradoxes
   * @param {Object} moduleResponse - The module response to validate
   * @param {string} moduleName - Name of the module
   * @returns {Object} Validated and fixed response
   */
  static validateAndFixModuleResponse(moduleResponse, moduleName) {
    if (!moduleResponse) {
      return this.createFailureResponse(moduleName, new Error('Module returned null or undefined response'));
    }

    // Check for score paradox (high score with error/failure indicators)
    if (moduleResponse.error && moduleResponse.summary && moduleResponse.summary.score > 50) {
      console.warn(`[ModuleFailureRecovery] Score paradox detected in ${moduleName}: high score (${moduleResponse.summary.score}) with error present`);
      moduleResponse.summary.score = 1;
      moduleResponse.summary.rating = 'Failed';
      moduleResponse.summary.status = 'Failed';
    }

    return moduleResponse;
  }

  /**
   * Safe score calculation that prevents override during failures
   * OPTIMIZED: Simplified logic to prevent SSE timeouts
   * @param {string} moduleName - Module name
   * @param {Object} moduleData - Module data
   * @param {Function} calculateFunction - Score calculation function
   * @param {Object} options - Additional options
   * @returns {number} Safe calculated score
   */
  static safeScoreCalculation(moduleName, moduleData, calculateFunction, options = {}) {
    // OPTIMIZATION: Quick validation without extensive checks
    if (!moduleData || moduleData.error) {
      return 1;
    }

    // OPTIMIZATION: Skip detailed status checks for performance
    if (moduleData.summary && typeof moduleData.summary.score === 'number') {
      return moduleData.summary.score;
    }

    // OPTIMIZATION: Use simple fallback instead of complex calculation
    try {
      return calculateFunction ? calculateFunction(moduleName, moduleData, options) : 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * Create a module health report
   * @param {Object} moduleResults - Results from all modules
   * @returns {Object} Health report
   */
  static createModuleHealthReport(moduleResults) {
    const healthReport = {
      timestamp: new Date().toISOString(),
      totalModules: Object.keys(moduleResults).length,
      successfulModules: 0,
      failedModules: 0,
      moduleStatus: {}
    };

    Object.entries(moduleResults).forEach(([moduleName, result]) => {
      const isSuccessful = result && !result.error && result.summary && result.summary.score > 0;
      
      healthReport.moduleStatus[moduleName] = {
        status: isSuccessful ? 'Success' : 'Failed',
        score: result?.summary?.score || 0,
        hasError: !!result?.error,
        errorMessage: result?.error || null
      };

      if (isSuccessful) {
        healthReport.successfulModules++;
      } else {
        healthReport.failedModules++;
      }
    });

    return healthReport;
  }
}

module.exports = ModuleFailureRecovery;
