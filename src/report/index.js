const fs = require('fs').promises;
const path = require('path');
const { format } = require('date-fns');
const { getStoragePath } = require('../storage');
const { v4: uuidv4 } = require('uuid');

/**
 * Generates a report from the analysis results
 * 
 * @param {Object} options - Options for report generation
 * @param {Object} options.analysisResults - Analysis results from analyzeScreenshots
 * @param {string} options.url - URL that was analyzed
 * @param {Array<string>} options.viewports - Viewports used for analysis
 * @param {string} options.outputDir - Directory to save the report
 * @param {boolean} options.consoleOutput - Whether to output to console instead of file
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @param {function} options.onProgress - Callback for progress updates
 * @returns {Promise<string>} - Path to the generated report
 */
async function generateReport({ 
  analysisResults, 
  url, 
  viewports, 
  outputDir,
  consoleOutput = false,
  verbose = false,
  onProgress = null
}) {
  if (verbose) {
    console.log('Generating report from analysis results');
  }
  
  // Generate a unique report ID
  const reportId = uuidv4();
  const shortId = reportId.split('-')[0]; // First segment of the UUID for shorter filenames
  
  // Get the proper storage path for reports
  const reportsDir = outputDir || path.join(getStoragePath(), 'reports');
  
  // Create output directory if it doesn't exist
  await fs.mkdir(reportsDir, { recursive: true });
  
  // Generate timestamp for report filename
  const timestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
  
  // Extract domain for filename
  let domain = new URL(url).hostname.replace(/^www\./, '');
  
  // Handle localhost case for local development
  if (domain === 'localhost' || domain.startsWith('127.0.0.1')) {
    domain = 'localhost';
  }
  
  // Create a descriptive name for the viewports being analyzed
  const viewportsList = viewports.join('-');
  
  // Prepare report content
  let report = '';
  
  // Add header with report ID
  report += `Report ID: ${reportId}\n`;
  report += `URL: ${url}\n`;
  report += `Date: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\n\n`;
  
  // Calculate total viewports for progress reporting
  const totalViewports = viewports.length;
  let processedViewports = 0;
  
  // Process each viewport
  for (const viewport of viewports) {
    const result = analysisResults[viewport];
    
    // Update progress if callback provided
    if (onProgress) {
      processedViewports++;
      const percentage = Math.floor((processedViewports / totalViewports) * 100);
      onProgress({
        step: `Generating report for ${viewport} viewport`,
        current: processedViewports,
        total: totalViewports,
        percentage
      });
    }
    
    // Add section for this viewport
    report += `## ${viewport.toUpperCase()} VIEWPORT ANALYSIS\n\n`;
    
    // Check if result and result.error exist before accessing
    if (result && result.error) {
      report += `Error during analysis: ${result.error}\n\n`;
    } else if (!result) {
      report += `Error: No analysis result available for this viewport\n\n`;
    } else {
      report += `${result.analysis}\n\n`;
    }
    
    // Reference screenshot - also add check for undefined result
    if (result && result.screenshot) {
      let screenshotFilename = "Not available";
      if (typeof result.screenshot === 'string') {
        // If it's a path string
        screenshotFilename = path.basename(result.screenshot);
      } else if (result.screenshot.path) {
        // If it's an object with a path property
        screenshotFilename = path.basename(result.screenshot.path);
      }
      report += `Screenshot: ${screenshotFilename}\n\n`;
    } else {
      report += `Screenshot: Not available\n\n`;
    }
  }
  
  // Add tracing info at the end of the report
  report += `\n---\nReport ID: ${reportId}\n`;
  report += `Generated: ${timestamp}\n`;
  
  // Generate file path with improved naming and including report ID
  const reportFilename = `${domain}-ui-analysis-${viewportsList}-${shortId}-${timestamp}.txt`;
  const reportPath = path.join(reportsDir, reportFilename);
  
  // Output to console if requested
  if (consoleOutput) {
    console.log('\n--- ANALYSIS RESULTS ---\n');
    console.log(report);
    console.log('--- END OF RESULTS ---\n');
  }
  
  // Write report to file
  await fs.writeFile(reportPath, report);
  
  if (verbose) {
    console.log(`Report saved to ${reportPath}`);
    console.log(`Report ID: ${reportId}`);
  }
  
  return reportPath;
}

module.exports = {
  generateReport
}; 