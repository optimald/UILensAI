require('dotenv').config();
const { captureScreenshots } = require('./capture');
const { analyzeScreenshots } = require('./analyze');
const { generateReport } = require('./report');
const { cleanupOldFiles } = require('./storage');

/**
 * Main function to run the full analysis workflow
 * 
 * @param {Object} options - Options for the analysis
 * @param {string} options.url - URL to analyze
 * @param {Array<Object>} options.viewportSizes - Array of viewport sizes {width, height}
 * @param {Array<string>} options.viewportNames - Names of the viewports
 * @param {Array<string>} options.focusAreas - Focus areas for analysis
 * @param {boolean} options.fullPage - Whether to capture full page height
 * @param {string} options.selector - CSS selector to capture specific elements
 * @param {string} options.outputDir - Directory to output the report
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @returns {Promise<string>} - Path to the generated report
 */
async function runAnalysis({
  url,
  viewportSizes,
  viewportNames,
  focusAreas,
  fullPage = true,
  selector,
  outputDir = './reports',
  verbose = false
}) {
  // Cleanup old files first
  await cleanupOldFiles(verbose);
  
  // Capture screenshots
  const screenshotPaths = await captureScreenshots({
    url,
    viewportSizes,
    fullPage,
    selector,
    verbose
  });
  
  // Analyze screenshots
  const analysisResults = await analyzeScreenshots({
    screenshotPaths,
    focusAreas,
    url,
    viewports: viewportNames,
    verbose
  });
  
  // Generate report
  const reportPath = await generateReport({
    analysisResults,
    screenshotPaths,
    url,
    viewports: viewportNames,
    outputDir,
    verbose
  });
  
  return reportPath;
}

module.exports = {
  runAnalysis,
  captureScreenshots,
  analyzeScreenshots,
  generateReport,
  cleanupOldFiles
}; 