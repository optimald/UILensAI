#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

// Simple script to run UI analysis

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { format } = require('date-fns');

// Import modules directly
const { captureScreenshots } = require('../capture');
const { analyzeScreenshots } = require('../analyze');
const { generateReport } = require('../report');
const { getStoragePath } = require('../storage');

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
let stealth = false;
let username = null;
let password = null;

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
  } else if (args[i] === '--selector' && i + 1 < args.length) {
    selector = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--focus' && i + 1 < args.length) {
    focusAreas = args[i + 1].split(',');
    i++; // Skip next arg
  } else if (args[i] === '--full-page') {
    fullPage = true;
  } else if (args[i] === '--stealth') {
    stealth = true;
  } else if (args[i] === '--username' && i + 1 < args.length) {
    username = args[i + 1];
    i++; // Skip next arg
  } else if (args[i] === '--password' && i + 1 < args.length) {
    password = args[i + 1];
    i++; // Skip next arg
  }
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
console.log(chalk.cyan('UILensAI - Visual UI Analysis'));
console.log(`Analyzing URL: ${url}`);
console.log(`Using model: ${model}`);
console.log(`Viewports: ${viewportNames.join(', ')}`);
if (selector) console.log(`Selector: ${selector}`);
if (focusAreas) console.log(`Focus areas: ${focusAreas.join(', ')}`);
console.log(`Full page: ${fullPage ? 'Yes' : 'No'}`);
console.log(`Stealth mode: ${stealth ? 'Yes' : 'No'}`);
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
      'mobile': {name: 'mobile', width: 375, height: 667},
      'tablet': {name: 'tablet', width: 768, height: 1024},
      'desktop': {name: 'desktop', width: 1024, height: 768},
      'desktop-large': {name: 'desktop-large', width: 1440, height: 900},
      'ultrawide': {name: 'ultrawide', width: 2560, height: 1080}
    };
    
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
      stealth: stealth,
      verbose: verbose
    };
    
    // Add authentication if provided
    if (username && password) {
      captureOptions.httpCredentials = {
        username: username,
        password: password
      };
    }
    
    const screenshots = await captureScreenshots(captureOptions);
    
    // Get screenshot paths
    const screenshotPaths = screenshots.map(s => s.path);
    if (verbose) {
      console.log(`Captured ${screenshotPaths.length} screenshots:`);
      screenshotPaths.forEach(path => console.log(`- ${path}`));
    }
    
    // Step 2: Analyze screenshots
    console.log(chalk.blue('\nAnalyzing screenshots...'));
    const analysisOptions = {
      screenshotPaths,
      url,
      model: model,
      maxTokens: 4096,
      verbose: verbose
    };
    
    // Only add focus if it's specified
    if (focusAreas) {
      analysisOptions.focus = focusAreas;
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
    const reportPath = await generateReport({
      url,
      analysisResults: formattedResults,
      viewports: Object.keys(formattedResults),
      verbose: verbose
    });
    
    console.log(chalk.green(`\nReport generated: ${reportPath}`));
    
    // Optional: Display report summary
    if (verbose) {
      const reportContent = fs.readFileSync(reportPath, 'utf8');
      console.log('\nReport Preview:');
      console.log(reportContent.substring(0, 500) + '...');
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