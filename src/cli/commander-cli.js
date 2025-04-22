#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');
const { captureScreenshots } = require('../capture');
const { analyzeScreenshots, analyze } = require('../analyze');
const { generateReport } = require('../report');
const { cleanupOldFiles, getStoragePath } = require('../storage');
const { generateComparisonReport } = require('../utils/compare-ui');
const { generateVisualComparison } = require('../utils/visual-comparison');
const { runFeedbackLoop } = require('../utils/feedback-loop');
const openReport = require('open');
const { exec } = require('child_process');
const axios = require('axios');
const { format } = require('date-fns');

// Initialize spinner
const spinner = ora();

// Define standard viewport sizes
const VIEWPORT_PRESETS = {
  'tiny-mobile': { width: 280, height: 480 },
  'narrow-mobile': { width: 320, height: 568 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1024, height: 768 },
  large: { width: 1440, height: 900 },
  ultrawide: { width: 2560, height: 1080 },
  'super-ultrawide': { width: 5120, height: 1440 }
};

// Define analysis focus areas
const FOCUS_AREAS = [
  'accessibility',
  'branding',
  'responsive',
  'hierarchy',
  'consistency',
  'aesthetics',
  'above-the-fold',
  'content-flow',
  'visual-design',
  'usability'
];

// Set up command line options
program
  .requiredOption('--url <url>', 'URL to analyze')
  .option('--compare-url <url>', 'URL to compare with the primary URL (enables comparison mode)')
  .option('--viewports <list>', 'Comma-separated list of viewports to analyze', 'mobile,desktop')
  .option('--full-range-viewports', 'Test across the full range of viewport sizes', false)
  .option('--custom-viewport <list...>', 'Custom viewport dimensions (e.g., "large-mobile:480x854")')
  .option('--stealth', 'Use stealth mode to bypass bot detection', process.env.STEALTH_MODE === 'true' || false)
  .option('--focus <list>', 'Comma-separated list of analysis areas to focus on', 'accessibility,branding,responsive,hierarchy,consistency,aesthetics,above-the-fold,content-flow,visual-design,usability')
  .option('--output <dir>', 'Output directory for the report', './storage/reports')
  .option('--selector <selector>', 'CSS selector to capture specific UI components')
  .option('--full-page', 'Capture full page height', true)
  .option('--open', 'Open the report after completion', true)
  .option('--verbose', 'Display verbose output', false)
  .option('--feedback-loop', 'Run in feedback loop mode with multiple iterations', false)
  .option('--non-interactive', 'Run in non-interactive mode (for automation)', false)
  .option('--console-output', 'Output results directly to console instead of saving to a file', false)
  .option('--iterations <number>', 'Number of iterations for feedback loop', 0)
  .option('--description <text>', 'Description for the feedback loop')
  .option('--model <model>', 'Model to use for analysis', 'claude-3-haiku-20240307')
  .option('--max-tokens <number>', 'Maximum number of tokens for Claude analysis response', process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : 4096)
  .option('--timeout <number>', 'Timeout in milliseconds for page load')
  .option('--disable-animations', 'Disable animations for consistent screenshots', true);

program.parse(process.argv);

const options = program.opts();

// For progress reporting to parent process
const reportProgress = (progressData) => {
  if (process.env.PROGRESS_CALLBACK_ENABLED === 'true') {
    console.log(`PROGRESS_UPDATE:${JSON.stringify(progressData)}`);
  }
};

/**
 * Main function to run the app
 */
async function main() {
  try {
    // Check if API key is available and valid
    let apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(chalk.red('Error: ANTHROPIC_API_KEY environment variable not set'));
      console.error('Please set your API key by running: npm run setup');
      process.exit(1);
    }

    // Enable feedback loop mode if iterations > 1
    if (options.iterations > 1) {
      options.feedbackLoop = true;
    }
    
    // Run feedback loop if specified
    if (options.feedbackLoop) {
      console.log(chalk.blue('Running in feedback loop mode with multiple iterations'));
      
      await runFeedbackLoop({
        url: options.url,
        description: options.description,
        iterations: options.iterations || 3,
        devices: options.viewports.split(','),
        browsers: options.browsers ? options.browsers.split(',') : ['chromium'],
        focusAreas: options.focus.split(','),
        runAccessibility: options.runAccessibility,
        includeCode: options.includeCode,
        model: options.model,
        maxTokens: options.maxTokens,
        stealth: options.stealth,
        disableAnimations: options.disableAnimations,
        verbose: options.verbose,
        nonInteractive: options.nonInteractive
      });
      
      return;
    }

    // Check if comparison flag is set (enables compare mode)
    if (options.compareUrl) {
      console.log(chalk.blue('┌────────────────────────────────────────┐'));
      console.log(chalk.blue('│    UILensAI - UI Comparison Analysis   │'));
      console.log(chalk.blue('└────────────────────────────────────────┘'));
      console.log();

      // Create a timestamped directory for this comparison
      const timestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
      const domain = new URL(options.url).hostname;
      const compareDomain = new URL(options.compareUrl).hostname;

      // Create directory for storing comparison results
      const comparisonDir = path.join(
        getStoragePath('comparisons'), 
        `${domain}_vs_${compareDomain}_${timestamp}`
      );

      // Create subdirectories for before and after screenshots and reports
      const beforeDir = path.join(comparisonDir, 'before');
      const afterDir = path.join(comparisonDir, 'after');
      
      await fs.mkdir(beforeDir, { recursive: true });
      await fs.mkdir(afterDir, { recursive: true });

      // 1. Capture and analyze "before" screenshots (primary URL)
      console.log(chalk.cyan(`\n[1/4] Capturing and analyzing primary URL: ${options.url}`));
      if (spinner) spinner.start('Capturing screenshots');
      
      // Parse viewports
      const viewportsArr = options.viewports.split(',').map(key => ({ ...VIEWPORT_PRESETS[key], name: key }));
      
      const beforeScreenshots = await captureScreenshots({
        url: options.url,
        viewports: viewportsArr,
        selector: options.selector,
        fullPage: options.fullPage,
        stealth: options.stealth,
        disableAnimations: options.disableAnimations,
        cacheDir: path.join(beforeDir, 'screenshots'),
        useCache: false, // Always capture fresh screenshots for comparison
        verbose: options.verbose,
        onProgress: reportProgress,
        timeout: options.timeout
      });
      
      if (spinner) {
        spinner.succeed(`Captured ${beforeScreenshots.length} screenshots for primary URL`);
        spinner.start('Analyzing screenshots');
      }
      
      const focusAreas = options.focus.split(',');
      
      const beforeAnalysis = await analyzeScreenshots({
        screenshotResults: beforeScreenshots,
        url: options.url,
        focus: focusAreas,
        selector: options.selector,
        model: options.model,
        maxTokens: options.maxTokens,
        verbose: options.verbose,
        onProgress: reportProgress
      });
      
      if (spinner) {
        spinner.succeed('Analysis complete for primary URL');
        spinner.start('Generating primary report');
      }
      
      const beforeReportPath = await generateReport({
        url: options.url,
        analysisResults: beforeAnalysis,
        viewports: options.viewports.split(','),
        outputDir: path.join(beforeDir, 'reports'),
        focus: focusAreas,
        selector: options.selector,
        open: false,
        verbose: options.verbose
      });
      
      if (spinner) spinner.succeed(`Primary report generated: ${beforeReportPath}`);
      
      // 2. Capture and analyze "after" screenshots (comparison URL)
      console.log(chalk.cyan(`\n[2/4] Capturing and analyzing comparison URL: ${options.compareUrl}`));
      
      // Repeat similar steps for comparison URL
      // ...
      
      return;
    }

    // Handle single URL analysis (default mode)
    
    // Handle full range viewport option
    if (options.fullRangeViewports) {
      options.viewports = Object.keys(VIEWPORT_PRESETS).join(',');
      if (options.verbose) {
        console.log(`Using full range of viewports: ${options.viewports}`);
      }
    }

    // Parse viewports
    const viewportsArr = options.viewports.split(',');
    
    // Validate viewports
    const invalidViewports = viewportsArr.filter(v => !Object.keys(VIEWPORT_PRESETS).includes(v));
    if (invalidViewports.length > 0) {
      throw new Error(`Invalid viewport(s): ${invalidViewports.join(', ')}. Valid options are: ${Object.keys(VIEWPORT_PRESETS).join(', ')}`);
    }

    // Clean up old files
    await cleanupOldFiles();

    // Loop through each viewport and create sizes array
    const viewportSizes = viewportsArr.map(viewportName => ({
      ...VIEWPORT_PRESETS[viewportName],
      name: viewportName
    }));

    // Process any custom viewport sizes
    if (options.customViewport && Array.isArray(options.customViewport)) {
      options.customViewport.forEach(customViewport => {
        const match = customViewport.match(/^([a-z0-9-]+):(\d+)x(\d+)$/i);
        if (match) {
          const name = match[1];
          const width = parseInt(match[2], 10);
          const height = parseInt(match[3], 10);
          viewportSizes.push({ width, height, name });
          viewportsArr.push(name);
        }
      });
    }

    // Display info
    console.log(chalk.cyan.bold('UILensAI - Visual UI Analysis Tool'));
    console.log(`URL: ${options.url}`);
    console.log(`Viewports: ${viewportsArr.join(', ')}`);
    console.log(`Focus Areas: ${options.focus.split(',').join(', ')}`);
    console.log(`Claude Model: ${options.model}`);
    console.log(`Max Tokens: ${options.maxTokens}`);
    console.log('');

    // Set up the progress callback for CLI output
    spinner = ora('Initializing browser - 0% complete').start();
    
    const updateProgress = (progress) => {
      // Update console spinner/progress
      if (typeof progress === 'string') {
        spinner.text = progress;
      } else if (progress.percentage !== undefined) {
        const percentage = Math.floor(progress.percentage);
        if (progress.step) {
          spinner.text = `${progress.step} - ${percentage}% complete`;
        } else {
          spinner.text = `Progress: ${percentage}%`;
        }
      }
      
      // Report progress to parent process if enabled
      reportProgress(progress);
    };
    
    try {
      // Take screenshots first
      const captureSpinner = ora('Capturing screenshots...').start();
      const screenshotOptions = {
        url: options.url,
        viewports: viewportSizes,
        fullPage: options.fullPage,
        selector: options.selector,
        useCache: true,
        cacheDir: path.join(getStoragePath(), 'screenshots'),
        stealth: options.stealth,
        disableAnimations: options.disableAnimations,
        filterScreenshots: true,
        onProgress: updateProgress,
        verbose: options.verbose,
        timeout: options.timeout
      };
      
      // Take screenshots
      const screenshotResults = await captureScreenshots(screenshotOptions);
      captureSpinner.succeed(`Captured ${screenshotResults.length} screenshots`);

      // Analyze the screenshots
      const analysisSpinner = ora('Analyzing screenshots with Claude...').start();
      
      // Get model and max tokens
      const modelName = options.model || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
      const maxTokens = parseInt(options.maxTokens || process.env.MAX_TOKENS || 4000, 10);

      const analysisOptions = {
        url: options.url,
        focus: options.focus.split(','),
        selector: options.selector,
        filterScreenshots: true,
        onProgress: updateProgress,
        verbose: options.verbose,
        model: modelName,
        maxTokens
      };
      
      // Use the analyze function
      const analysisResult = await analyze({
        ...analysisOptions,
        screenshotResults // Pass the screenshot results to avoid taking new screenshots
      });
      analysisSpinner.succeed('Analysis complete');

      // Generate report
      const reportSpinner = ora('Generating report...').start();
      const reportPath = await generateReport({
        url: options.url,
        viewports: viewportsArr,
        outputDir: options.output,
        consoleOutput: options.consoleOutput || false,
        verbose: options.verbose || false,
        onProgress: updateProgress,
        // Transform the results to the format expected by generateReport
        analysisResults: analysisResult.analysis.reduce((acc, item) => {
          if (item.result) {
            acc[item.viewport.name] = {
              analysis: item.result.raw,
              screenshot: analysisResult.screenshots.find(s => s.viewport.name === item.viewport.name)?.path || null
            };
          } else if (item.error) {
            acc[item.viewport.name] = {
              error: item.error.message || String(item.error),
              screenshot: analysisResult.screenshots.find(s => s.viewport.name === item.viewport.name)?.path || null
            };
          }
          return acc;
        }, {})
      });
      reportSpinner.succeed(`Report generated: ${reportPath}`);

      // Open report if requested
      if (options.open) {
        try {
          console.log(`Opening report ${reportPath}...`);
          exec(`open "${reportPath}"`, (error) => {
            if (error) {
              console.error('Could not open report:', error.message);
            }
          });
        } catch (err) {
          console.error('Could not open report:', err.message);
        }
      }

      console.log(chalk.green('\n✓ Analysis complete!'));
      console.log(`Report saved to: ${reportPath}`);
      
      return reportPath;
    } catch (error) {
      ora().fail(chalk.red(`Error: ${error.message}`));
      console.error(error);
      process.exit(1);
    }

  } catch (error) {
    ora().fail(chalk.red(`Error: ${error.message}`));
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main(); 