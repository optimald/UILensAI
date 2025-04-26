const fs = require('fs').promises;
const path = require('path');
const { getDateFormatter } = require('../utils/compatibility');
const { v4: uuidv4 } = require('uuid');
const { getStoragePath } = require('../storage');

// Initialize the formatter
const format = getDateFormatter();

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
 * @param {string} options.runId - Unique ID for this analysis run (if already generated)
 * @param {string} options.outputFormat - Output format: 'text' (default) or 'json'
 * @returns {Promise<string>} - Path to the generated report
 */
async function generateReport({ 
  analysisResults, 
  url, 
  viewports, 
  outputDir,
  consoleOutput = false,
  verbose = false,
  onProgress = null,
  runId = null,
  outputFormat = 'text'
}) {
  try {
    if (verbose) {
      console.log('Generating report from analysis results');
      console.log(`Report format: ${outputFormat}`);
    }
    
    // Generate a unique run ID (or use the one provided)
    const fullReportId = runId || uuidv4();
    // Use only first 8 characters of the UUID for shorter filenames
    const shortId = fullReportId.split('-')[0].substring(0, 8);
    
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
    
    let report = '';
    let jsonReport = null;
    
    // Generate report based on format
    if (outputFormat === 'json') {
      // Create structured JSON report
      jsonReport = {
        meta: {
          reportId: shortId,
          fullReportId: fullReportId,
          url: url,
          date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
          timestamp: format(new Date(), 'yyyyMMdd-HHmmss-SSS'),
          viewports: viewports
        },
        viewports: {}
      };
      
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
        
        // Add viewport data to JSON structure
        if (result && !result.error) {
          jsonReport.viewports[viewport] = {
            analysis: result.analysis,
            screenshot: result.screenshot ? (
              typeof result.screenshot === 'string' 
                ? path.basename(result.screenshot)
                : result.screenshot.path 
                  ? path.basename(result.screenshot.path) 
                  : "Not available"
            ) : "Not available"
          };
        } else {
          jsonReport.viewports[viewport] = {
            error: result && result.error ? result.error : "No analysis result available for this viewport",
            screenshot: "Not available"
          };
        }
      }
      
      // Convert to JSON string
      report = JSON.stringify(jsonReport, null, 2);
    } else {
      // Default text format (original implementation)
      // Add header with report ID (full and short version)
      report += `Report ID: ${shortId}\n`;
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
      report += `\n---\nReport ID: ${shortId}\n`;
      report += `Generated: ${timestamp}\n`;
    }
    
    // File extension based on format
    const fileExtension = outputFormat === 'json' ? 'json' : 'txt';
    
    // Generate file path with improved naming and including report ID
    const reportFilename = `${domain}-ui-analysis-${viewportsList}-${shortId}-${timestamp}.${fileExtension}`;
    const reportPath = path.join(reportsDir, reportFilename);
    
    // Output to console if requested
    if (consoleOutput) {
      console.log('\n--- ANALYSIS RESULTS ---\n');
      console.log(report);
      console.log('--- END OF RESULTS ---\n');
      return null; // Don't return a file path in console mode
    }
    
    // Write report to file
    await fs.writeFile(reportPath, report);
    
    if (verbose) {
      console.log(`Report saved to ${reportPath}`);
      console.log(`Report ID: ${shortId}`);
      console.log(`Report format: ${outputFormat}`);
    }
    
    return reportPath;
  } catch (error) {
    console.error(`Error generating report: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    throw new Error(`Failed to generate report: ${error.message}`);
  }
}

module.exports = {
  generateReport
}; 