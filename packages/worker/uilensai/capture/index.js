/**
 * UILensAI Screenshot Capture — Cloudflare Browser Rendering
 *
 * v1.0.0: All screenshot capture uses the Cloudflare Browser Rendering REST API.
 * This file wraps cfScreenshotService to maintain the API contract expected by
 * analyze/ui.js and other internal consumers.
 */

const cfScreenshotService = require('../services/cfScreenshotService');
const { getStoragePath } = require('../storage');

// Re-export viewport presets from cfScreenshotService
const VIEWPORT_PRESETS = cfScreenshotService.VIEWPORT_PRESETS;

/**
 * Captures screenshots of a URL at various viewport sizes using Cloudflare Browser Rendering.
 *
 * @param {object} options - Options for capturing screenshots
 * @param {string} options.url - URL to capture
 * @param {Array<object>} options.viewports - Array of viewport objects with name, width, height
 * @param {boolean} [options.fullPage=true] - Whether to capture full page height
 * @param {string} [options.selector=null] - CSS selector to capture specific component
 * @param {boolean} [options.verbose=false] - Whether to output verbose logs
 * @param {number} [options.timeout=null] - Page load timeout in milliseconds
 * @param {object} [options.httpCredentials=null] - HTTP credentials {username, password}
 * @returns {Promise<Array<object>>} - Array of screenshot result objects
 */
async function captureScreenshots({
  url,
  viewports,
  fullPage = true,
  selector,
  verbose = false,
  timeout = null,
  httpCredentials = null,
  // Legacy params accepted but ignored in CF mode:
  stealthLevel,
  disableAnimations,
  browser,
  page,
  runId,
  captureTimeoutMs,
  filterScreenshots,
  onProgress,
  useCache,
  cacheDir,
}) {
  if (verbose) {
    console.log(`[Capture] Using Cloudflare Browser Rendering for ${url}`);
    console.log(`[Capture] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  }

  const outputDir = getStoragePath('screenshots');

  const results = await cfScreenshotService.captureScreenshots({
    url,
    viewports, // Already resolved objects from analyze/ui.js
    fullPage,
    selector,
    timeout: timeout || 45000,
    outputDir,
    httpCredentials,
    verbose,
  });

  return results;
}

module.exports = {
  captureScreenshots,
  VIEWPORT_PRESETS,
};
