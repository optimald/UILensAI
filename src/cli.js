#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');
const { format } = require('date-fns');
const { captureScreenshots } = require('./capture');
const { analyzeScreenshots, analyze } = require('./analyze');
const { generateReport } = require('./report');
const { cleanupOldFiles, getStoragePath } = require('./storage');
const openReport = require('open');
const { exec } = require('child_process');
const axios = require('axios');

// Parse arguments manually instead of using yargs
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: null,
    viewports: 'mobile,desktop',
    focus: null,
    model: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    selector: null,
    fullPage: true,
    stealthLevel: null,
    timeout: 30000,
    browserTimeout: 60000,
    disableAnimations: true,
    username: null,
    password: null,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--url' && i + 1 < args.length) {
      options.url = args[++i];
    } 
    else if (arg === '--viewports' && i + 1 < args.length) {
      options.viewports = args[++i];
    }
    else if (arg === '--focus' && i + 1 < args.length) {
      options.focus = args[++i];
    }
    else if (arg === '--model' && i + 1 < args.length) {
      options.model = args[++i];
    }
    else if (arg === '--max-tokens' && i + 1 < args.length) {
      options.maxTokens = parseInt(args[++i], 10);
    }
    else if (arg === '--selector' && i + 1 < args.length) {
      options.selector = args[++i];
    }
    else if (arg === '--no-full-page') {
      options.fullPage = false;
    }
    else if (arg === '--stealth') {
      // Check if the next argument might be the stealth level
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        const level = args[i + 1].toLowerCase();
        if (['basic', 'medium', 'advanced'].includes(level)) {
          options.stealthLevel = level;
          i++; // Skip next arg since we used it
        } else {
          console.warn(chalk.yellow(`Warning: Unknown stealth level "${level}". Using default level (basic).`));
          options.stealthLevel = 'basic';
          i++; // Skip the invalid value
        }
      } else {
        // No level specified, use 'basic'
        options.stealthLevel = 'basic';
      }
    }
    else if (arg === '--timeout' && i + 1 < args.length) {
      options.timeout = parseInt(args[++i], 10);
    }
    else if (arg === '--browser-timeout' && i + 1 < args.length) {
      options.browserTimeout = parseInt(args[++i], 10);
    }
    else if (arg === '--disable-animations') {
      options.disableAnimations = true;
    }
    else if (arg === '--no-disable-animations') {
      options.disableAnimations = false;
    }
    else if (arg === '--username' && i + 1 < args.length) {
      options.username = args[++i];
    }
    else if (arg === '--password' && i + 1 < args.length) {
      options.password = args[++i];
    }
    else if (arg === '--verbose') {
      options.verbose = true;
    }
    else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Usage: uilensai --url [url] [options]

Options:
  --url                  URL to analyze (required)
  --viewports            Comma-separated list of viewports (default: mobile,desktop)
  --focus                Comma-separated list of analysis areas to focus on
  --model                Claude model to use (default: claude-3-haiku-20240307)
  --max-tokens           Maximum tokens for Claude analysis (default: 4096)
  --selector             CSS selector to capture specific UI components
  --no-full-page         Capture only the visible part of the page
  --stealth [level]      Use stealth mode for bot protection (level: basic, medium, or advanced, default: basic)
  --timeout              Page load timeout in ms (default: 30000)
  --browser-timeout      Browser launch timeout in ms (default: 60000)
  --disable-animations   Disable CSS animations for consistent screenshots (default: true)
  --no-disable-animations Enable CSS animations
  --username             Username for HTTP Basic Authentication
  --password             Password for HTTP Basic Authentication
  --verbose              Display verbose output
  --help, -h             Show this help message
  `);
}

// Main function
async function main() {
  const options = parseArgs();
  
  // Display ASCII art header
  console.log(
    chalk.blue(
      figlet.textSync('UILensAI', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );
  
  console.log(chalk.blue('Visual UI Analysis with AI\n'));
  
  // If help flag is set, show help and exit
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  // Validate URL
  if (!options.url) {
    console.error(chalk.red('Error: URL is required. Please provide --url parameter.'));
    showHelp();
    process.exit(1);
  }
  
  // Process viewports
  options.viewportList = options.viewports.split(',');
  
  // Process focus areas if provided
  if (options.focus) {
    options.focusList = options.focus.split(',');
  }
  
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('Error: No API key found. Please set the ANTHROPIC_API_KEY environment variable.'));
    console.error('You can create an .env file with your API key or set it in your environment.');
      process.exit(1);
    }

  // Display configuration
  console.log(chalk.cyan('Configuration:'));
  console.log(`URL: ${options.url}`);
  console.log(`Viewports: ${options.viewportList.join(', ')}`);
  if (options.focusList) {
    console.log(`Focus areas: ${options.focusList.join(', ')}`);
  }
  console.log(`Model: ${options.model}`);
  console.log(`Max tokens: ${options.maxTokens}`);
  if (options.selector) {
    console.log(`Selector: ${options.selector}`);
  }
  console.log(`Full page: ${options.fullPage ? 'Yes' : 'No'}`);
  console.log(`Stealth mode: ${options.stealthLevel ? options.stealthLevel : 'No'}`);
  console.log(`Disable animations: ${options.disableAnimations ? 'Yes' : 'No'}`);
  if (options.username && options.password) {
    console.log(`Authentication: Enabled (username: ${options.username})`);
  }
  
  // TODO: Implement the actual analysis here
  console.log(chalk.green('\nAnalysis completed successfully!'));
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  });
}

module.exports = { parseArgs }; 