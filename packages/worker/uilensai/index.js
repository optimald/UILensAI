/**
 * UILensAI Main Entry Point
 *
 * This file exports the primary functionalities of the UILensAI library,
 * allowing for programmatic use of its analysis, capture, and reporting capabilities.
 */

// Core analysis orchestrator
const { analyzeWebsite } = require('./analyze/index');

// Screenshot capture functionality
const { captureScreenshots } = require('./capture/index');

// Report generation functionality
const { generateReport } = require('./report/index');

// Utilities for working with structured LLM output and schemas
const structuredLLMUtils = require('./utils/structured-llm-output');

// Tier preset configurations
const { getPresetConfig, applyPresetToOptions } = require('./utils/presets');

// Domain validation utility
const { validateDomain, validateDomainWithConnectivity } = require('./utils/domainValidator');

// Error handling utilities (if intended for external use)
const { handleError, createError, ERROR_CATEGORIES, ERROR_TYPES } = require('./utils/error-handler');

// Cloudflare Browser Rendering services
const cfBrowserService = require('./services/cfBrowserService');
const cfScreenshotService = require('./services/cfScreenshotService');

// Export the main functionalities
module.exports = {
  // Primary analysis function
  analyzeWebsite,

  // Standalone capabilities
  captureScreenshots,
  generateReport,

  // Cloudflare services
  cfBrowserService,
  cfScreenshotService,

  // Utilities
  structuredLLM: structuredLLMUtils, // Exports getStructuredData, getSchemaForModule, etc.
  presets: {
    getPresetConfig,
    applyPresetToOptions
  },
  domainUtils: {
    validateDomain,
    validateDomainWithConnectivity
  },
  errorUtils: { // Exporting error utilities can be useful for integrators
    handleError,
    createError,
    ERROR_CATEGORIES,
    ERROR_TYPES
  }
  // Add other top-level exports here if they become part of the public API
};