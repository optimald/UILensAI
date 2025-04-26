#!/usr/bin/env node

// Force module resolution from this package's node_modules to prevent conflicts
const path = require('path');
const originalModulePaths = module.paths.slice();
module.paths.unshift(path.join(__dirname, '..', '..', 'node_modules'));

// Load environment variables from .env file
require('dotenv').config();

// Simple script to run UI analysis

const fs = require('fs');
const chalk = require('chalk');
// Use compatibility layer instead of direct dependency
const { getDateFormatter } = require('../utils/compatibility');
const format = getDateFormatter();

// Import modules directly
const { captureScreenshots } = require('../capture');
const { analyzeScreenshots } = require('../analyze');
const { generateReport } = require('../report');
const { getStoragePath } = require('../storage');

// Function to show help and usage information
function showHelp() {
  console.log(`
Usage: npm run ui -- --url <url> [options]

Options:
  --url <url>                    URL to analyze (required)
  --viewports <list>             Comma-separated list of viewports (default: mobile,desktop)
  --focus <list>                 Comma-separated list of analysis areas to focus on
  --model <model>                Claude model to use (default: claude-3-haiku-20240307)
  --max-tokens <number>          Maximum tokens for Claude analysis (default: 4096)
  --selector <selector>          CSS selector to capture specific UI components
  --full-page                    Capture full page height (default: true)
  --no-full-page                 Capture only the visible part of the page
  --stealth [level]              Use stealth mode for bot protection (level: basic, medium, or advanced, default: basic)
  --disable-animations           Disable CSS animations for consistent screenshots (default: true)
  --no-disable-animations        Enable CSS animations
  --username <username>          Username for HTTP Basic Authentication
  --password <password>          Password for HTTP Basic Authentication
  --timeout <ms>                 Page load timeout in milliseconds
  --browser-timeout <ms>         Browser launch timeout in milliseconds
  --console-output               Output results directly to console instead of saving to a file
  --output <directory>           Custom directory for saving reports
  --format <text|json>           Report format: text (default) or json
  --description <text>           Description of the page to provide context for analysis
  --custom-viewport <name:WxH>   Custom viewport dimensions (e.g. "large-mobile:480x854")
  --verbose                      Show verbose output
  --help                         Show this help message
  --full-range-viewports         Use all available viewport presets
  `);
}

// Get URL parameter
const args = process.argv.slice(2);
let url = null;
let model = 'claude-3-haiku-20240307';
let verbose = false;
let viewportNames = ['mobile', 'desktop']; // Default viewports
let disableAnimations = false;
let selector = null;
let focusAreas = null;
let fullPage = true;
let stealthLevel = null;
let username = null;
let password = null;
let maxTokens = null;
let timeout = null;
let browserTimeout = null;
let consoleOutput = false;
let outputDir = null;
let description = null;
let customViewports = null;
let showHelpFlag = false;
let fullRangeViewports = false;
let reportFormat = 'text'; // Default format is text

// Parse arguments to extract URL and options
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && i + 1 < args.length) {
    url = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--model' && i + 1 < args.length) {
    model = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--verbose') {
    verbose = true;
  } else if (args[i] === '--viewports' && i + 1 < args.length) {
    viewportNames = args[i + 1].split(',');
    i++; // Skip next arg
  } else if (args[i] === '--disable-animations') {
    disableAnimations = true;
  } else if (args[i] === '--no-disable-animations') {
    disableAnimations = false;
  } else if (args[i] === '--selector' && i + 1 < args.length) {
    selector = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--focus' && i + 1 < args.length) {
    focusAreas = args[i + 1].split(',');
    i++; // Skip next arg
  } else if (args[i] === '--full-page') {
    fullPage = true;
  } else if (args[i] === '--no-full-page') {
    fullPage = false;
  } else if (args[i] === '--stealth') {
    // Check if the next argument might be the stealth level
    if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const level = args[i + 1].toLowerCase();
      if (['basic', 'medium', 'advanced'].includes(level)) {
        stealthLevel = level;
        i++; // Skip next arg since we used it
      } else {
        console.warn(chalk.yellow(`Warning: Unknown stealth level "${level}". Using default level (basic).`));
        stealthLevel = 'basic';
        i++; // Skip the invalid value
      }
    } else {
      // No level specified, use 'basic'
      stealthLevel = 'basic';
    }
  } else if (args[i] === '--username' && i + 1 < args.length) {
    username = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--password' && i + 1 < args.length) {
    password = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--max-tokens' && i + 1 < args.length) {
    maxTokens = parseInt(args[i + 1], 10);
    i++; // Skip next arg
  } else if (args[i] === '--timeout' && i + 1 < args.length) {
    timeout = parseInt(args[i + 1], 10);
    i++; // Skip next arg
  } else if (args[i] === '--browser-timeout' && i + 1 < args.length) {
    browserTimeout = parseInt(args[i + 1], 10);
    i++; // Skip next arg
  } else if (args[i] === '--console-output') {
    consoleOutput = true;
  } else if (args[i] === '--output' && i + 1 < args.length) {
    outputDir = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--description' && i + 1 < args.length) {
    description = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--format' && i + 1 < args.length) {
    const format = args[i + 1].toLowerCase();
    if (format === 'text' || format === 'json') {
      reportFormat = format;
    } else {
      console.warn(chalk.yellow(`Warning: Unknown format "${format}". Using default format (text).`));
    }
    i++; // Skip next arg
  } else if (args[i] === '--full-range-viewports') {
    fullRangeViewports = true;
  } else if (args[i] === '--custom-viewport' && i + 1 < args.length) {
    const viewportSpec = args[i + 1];
    i++; // Skip next arg
    
    // Add custom viewport if valid format
    if (viewportSpec && viewportSpec.includes(':') && viewportSpec.includes('x')) {
      const [name, dimensions] = viewportSpec.split(':');
      const [width, height] = dimensions.split('x').map(Number);
      
      if (name && !isNaN(width) && !isNaN(height)) {
        customViewports = customViewports || [];
        customViewports.push({ name, width, height });
        
        // Add to viewportNames if not already there
        if (!viewportNames.includes(name)) {
          viewportNames.push(name);
        }
      }
    }
  } else if (args[i] === '--help' || args[i] === '-h') {
    showHelpFlag = true;
  }
}

// Show help and exit if --help flag is present
if (showHelpFlag) {
  showHelp();
  process.exit(0);
}

if (!url) {
  console.error('Error: URL is required. Please provide --url parameter.');
  process.exit(1);
}

// Ensure API key is available
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
  console.error('Please set your API key in the .env file or via environment variables.');
  process.exit(1);
}

// Log key info for analysis
console.log(chalk.cyan(`
uilensai.com 
|   ◕ ◡ ◕   |
 ~~~~~~~~~~~
UILensAI - Visual UI Analysis`));
console.log(`Analyzing URL: ${url}`);
console.log(`Using model: ${model}`);
console.log(`Viewports: ${viewportNames.join(', ')}`);
console.log(`Report format: ${reportFormat}`);
if (selector) console.log(`Selector: ${selector}`);
if (focusAreas) console.log(`Focus areas: ${focusAreas.join(', ')}`);
if (description) console.log(`Description: ${description}`);
console.log(`Full page: ${fullPage ? 'Yes' : 'No'}`);
console.log(`Stealth mode: ${stealthLevel ? stealthLevel : 'No'}`);
console.log(`Disable animations: ${disableAnimations ? 'Yes' : 'No'}`);
console.log(`API key detected: ${apiKey ? 'Yes' : 'No'}`);
if (username && password) {
  console.log(`Authentication: Enabled (username: ${username})`);
}
if (verbose) {
  console.log(`API key length: ${apiKey.length} characters`);
  console.log(`Verbose mode: Enabled`);
}

// Run the analysis
runAnalysis();

// Execute the analysis
async function runAnalysis() {
  try {
    // Define viewports
    const viewportMap = {
      'tiny-mobile': {name: 'tiny-mobile', width: 280, height: 480},
      'narrow-mobile': {name: 'narrow-mobile', width: 320, height: 568},
      'mobile': {name: 'mobile', width: 375, height: 667},
      'tablet': {name: 'tablet', width: 768, height: 1024},
      'desktop': {name: 'desktop', width: 1024, height: 768},
      'desktop-large': {name: 'desktop-large', width: 1440, height: 900},
      'ultrawide': {name: 'ultrawide', width: 2560, height: 1080},
      'super-ultrawide': {name: 'super-ultrawide', width: 5120, height: 1440}
    };
    
    // If full range viewports is enabled, use all viewport presets
    if (fullRangeViewports) {
      viewportNames = Object.keys(viewportMap);
      console.log(chalk.blue(`Using full range of viewports: ${viewportNames.join(', ')}`));
    }
    
    // Add any custom viewports
    if (customViewports) {
      for (const viewport of customViewports) {
        viewportMap[viewport.name] = viewport;
      }
    }
    
    // Create viewports array from the names
    const viewports = viewportNames.map(name => {
      if (!viewportMap[name]) {
        console.warn(chalk.yellow(`Warning: Unknown viewport "${name}". Using default mobile viewport.`));
        return viewportMap['mobile'];
      }
      return viewportMap[name];
    });
    
    // Step 1: Capture screenshots
    console.log(chalk.blue('\nCapturing screenshots...'));
    const captureOptions = {
        url, 
        viewports, 
        fullPage: fullPage,
        disableAnimations: disableAnimations,
        selector: selector,
        stealthLevel: stealthLevel,
        verbose: verbose
      };
      
    // Add authentication if provided
    if (username && password) {
      captureOptions.httpCredentials = {
        username: username,
        password: password
      };
    }
    
    const captureResult = await captureScreenshots(captureOptions);
    
    // Extract the screenshot paths and runId from the result
    const screenshots = captureResult.results || captureResult;
    const runId = captureResult.runId;
    
    // Get screenshot paths
    const screenshotPaths = screenshots.map(s => s.path);
    if (verbose) {
      console.log(`Captured ${screenshotPaths.length} screenshots:`);
      if (runId) console.log(`Run ID: ${runId.split('-')[0].substring(0, 8)}`);
      screenshotPaths.forEach(path => console.log(`- ${path}`));
    }
    
    // Step 2: Analyze screenshots
    console.log(chalk.blue('\nAnalyzing screenshots...'));
    const analysisOptions = {
      screenshotPaths,
      url,
      model: model,
      maxTokens: maxTokens || 4096,
      verbose: verbose
    };
    
    // Only add focus if it's specified
    if (focusAreas) {
      analysisOptions.focus = focusAreas;
    }
    
    // Add description if specified
    if (description) {
      analysisOptions.description = description;
    }
    
    const analysisResults = await analyzeScreenshots(analysisOptions);
    
    // Format the results properly for the report
    const formattedResults = {};
    
    if (analysisResults && analysisResults.results) {
      // Map file names to viewport names
      const viewportFileMap = {};
      viewportNames.forEach(name => {
        viewportFileMap[`${name}.png`] = name;
      });
      
      // Create proper format for the report generator
      Object.keys(analysisResults.results).forEach(key => {
        // Skip cross-viewport results
        if (key === 'cross-viewport') return;
        
        const viewport = viewportFileMap[key] || key.replace('.png', '');
        
        if (analysisResults.results[key] && analysisResults.results[key].analysis) {
          formattedResults[viewport] = {
            analysis: analysisResults.results[key].analysis,
            screenshot: screenshotPaths.find(p => p.includes(`viewport-${viewport}`))
          };
        }
      });
    }
    
    // Step 3: Generate report
    console.log(chalk.blue('\nGenerating report...'));
    
    const reportOptions = {
      url,
      analysisResults: formattedResults,
      viewports: Object.keys(formattedResults),
      verbose: verbose,
      consoleOutput: consoleOutput,
      outputFormat: reportFormat
    };
    
    // Add outputDir if specified
    if (outputDir) {
      reportOptions.outputDir = outputDir;
    }
    
    // Add runId if available
    if (runId) {
      reportOptions.runId = runId;
    }
    
    const reportPath = await generateReport(reportOptions);
    
    if (reportPath) {
      console.log(chalk.green(`\nReport generated: ${reportPath}`));
      
      // Optional: Display report summary
      if (verbose) {
        const reportContent = fs.readFileSync(reportPath, 'utf8');
        console.log('\nReport Preview:');
        console.log(reportContent.substring(0, 500) + '...');
      }
    } else if (consoleOutput) {
      console.log(chalk.green(`\nAnalysis results displayed in console output`));
    }
    
    return reportPath;
  } catch (error) {
    console.error(chalk.red(`\nError during analysis: ${error.message}`));
    if (verbose && error.stack) {
      console.error('\nError stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}