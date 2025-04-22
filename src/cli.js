#!/usr/bin/env node

require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const ora = require('ora');
const { captureScreenshots } = require('./capture');
const { analyzeScreenshots, analyze } = require('./analyze');
const { generateReport } = require('./report');
const { cleanupOldFiles, getStoragePath } = require('./storage');
const openReport = require('open');
const path = require('path');
const fs = require('fs').promises;
const { runInteractiveFeedbackLoop, runFeedbackLoop } = require('./utils/feedback-loop');
const { exec } = require('child_process');
const axios = require('axios');
const { format } = require('date-fns');
const { generateUIComparisonReport } = require('./utils/compare-ui');
const { generateVisualComparison } = require('./utils/visual-comparison');

// Initialize spinner at the top of the file, before any functions that use it
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

// Main CLI parser
const parser = yargs(hideBin(process.argv));

// Configure the parser
parser
  .usage('Usage: $0 --url [url] [options]')
  .option('url', {
    description: 'URL to analyze',
    type: 'string',
    demandOption: true
  })
  .option('compare-url', {
    description: 'URL to compare with the primary URL (enables comparison mode)',
    type: 'string'
  })
  .option('viewports', {
    description: 'Comma-separated list of viewports to analyze',
    type: 'string',
    default: 'mobile,desktop',
    coerce: arg => arg.split(',')
  });

// Add remaining options
parser
  .option('full-range-viewports', {
    description: 'Test across the full range of viewport sizes from tiny-mobile to super-ultrawide',
    type: 'boolean',
    default: false
  })
  .option('custom-viewport', {
    description: 'Custom viewport dimensions (e.g., "large-mobile:480x854")',
    type: 'string',
    array: true
  })
  .option('stealth', {
    description: 'Use stealth mode to bypass bot detection',
    type: 'boolean',
    default: process.env.STEALTH_MODE === 'true' || false
  })
  .option('focus', {
    description: 'Comma-separated list of analysis areas to focus on',
    type: 'string',
    default: 'accessibility,branding,responsive,hierarchy,consistency,aesthetics,above-the-fold,content-flow,visual-design,usability',
    coerce: arg => arg.split(',')
  })
  .option('output', {
    description: 'Output directory for the report',
    type: 'string',
    default: './storage/reports'
  })
  .option('selector', {
    description: 'CSS selector to capture specific UI components',
    type: 'string'
  })
  .option('full-page', {
    description: 'Capture full page height',
    type: 'boolean',
    default: true
  })
  .option('open', {
    description: 'Open the report after completion',
    type: 'boolean',
    default: true
  })
  .option('verbose', {
    description: 'Display verbose output',
    type: 'boolean',
    alias: 'v',
    default: false
  })
  .option('feedback-loop', {
    description: 'Run in feedback loop mode with multiple iterations',
    type: 'boolean',
    default: false
  })
  .option('non-interactive', {
    description: 'Run in non-interactive mode (for automation)',
    type: 'boolean',
    default: false
  })
  .option('console-output', {
    description: 'Output results directly to console instead of saving to a file',
    type: 'boolean',
    default: false
  })
  .option('iterations', {
    description: 'Number of iterations for feedback loop (enables feedback loop mode)',
    type: 'number',
    default: 0
  })
  .option('description', {
    description: 'Description for the feedback loop',
    type: 'string'
  })
  .option('devices', {
    description: 'Comma-separated list of devices to include in the feedback loop',
    type: 'string',
    coerce: arg => arg.split(',')
  })
  .option('browsers', {
    description: 'Comma-separated list of browsers to include in the feedback loop',
    type: 'string',
    coerce: arg => arg.split(',')
  })
  .option('run-accessibility', {
    description: 'Run accessibility analysis in the feedback loop',
    type: 'boolean',
    default: false
  })
  .option('include-code', {
    description: 'Include code in the feedback loop report',
    type: 'boolean',
    default: false
  })
  .option('model', {
    description: 'Model to use for analysis. Some models have higher output token limits (haiku/opus: 4096 tokens, newer sonnets: 8192 tokens)',
    type: 'string',
    default: 'claude-3-haiku-20240307'
  })
  .option('max-tokens', {
    description: 'Maximum number of tokens for Claude analysis response',
    type: 'number',
    default: process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : 4096
  })
  .option('timeout', {
    description: 'Timeout in milliseconds for page load (overrides PAGE_LOAD_TIMEOUT in .env)',
    type: 'number'
  })
  .option('progress-report', {
    description: 'Internal flag for progress reporting',
    type: 'string',
    hidden: true
  })
  .option('disable-animations', {
    description: 'Disable animations for consistent screenshots',
    type: 'boolean',
    default: true
  })
  .option('username', {
    description: 'Username for HTTP Basic Authentication',
    type: 'string'
  })
  .option('password', {
    description: 'Password for HTTP Basic Authentication',
    type: 'string'
  })
  .help()
  .alias('help', 'h');

const argv = parser.argv;

// For progress reporting to parent process
const reportProgress = (progressData) => {
  if (argv['progress-report'] && process.env.PROGRESS_CALLBACK_ENABLED === 'true') {
    console.log(`PROGRESS_UPDATE:${JSON.stringify(progressData)}`);
  }
};

/**
 * Analyzes error messages and provides helpful suggestions
 * @param {Error} error - The error object
 * @param {Object} options - Options used for the command
 * @returns {string} Suggestion message
 */
function getErrorSuggestion(error, options) {
  const errorMessage = error.message || String(error);
  const errorStack = error.stack || '';
  
  // Check if the error is related to navigation issues
  if (errorMessage.includes('page.content: Unable to retrieve content because the page is navigating')) {
    return chalk.yellow('\nThe page appears to be having navigation issues.\n') +
      chalk.green('Try the following approaches:\n') +
      '1. Increase the timeout:\n' +
      `   npm run ui -- --url ${options.url} --timeout 60000\n\n` +
      '2. Try with a less strict wait strategy:\n' +
      `   npm run ui -- --url ${options.url} --timeout 60000 --disable-animations\n`;
  }
  
  // Check if the error is related to token limits
  if (
    errorMessage.includes('token limit') || 
    errorMessage.includes('max_tokens') || 
    errorMessage.includes('exceeds the maximum limit') ||
    errorMessage.includes('exceeded the maximum allowed tokens') ||
    errorMessage.includes('output length exceeds')
  ) {
    // Get the current model
    const currentModel = options.model || 'claude-3-haiku-20240307';
    const currentMaxTokens = options.maxTokens || 4096;
    
    // Suggest alternative models based on token needs
    if (currentModel === 'claude-3-haiku-20240307' || currentModel === 'claude-3-5-haiku-20241022') {
      return chalk.yellow('\nThe token limit was exceeded while generating the response.\n') +
        chalk.green('Try increasing the max tokens or using a model with a higher output limit:\n') +
        `  npm run ui -- --url ${options.url} --model claude-3-5-sonnet-20241022 --max-tokens 8192\n` +
        `  npm run ui -- --url ${options.url} --model claude-3-7-sonnet-20250219 --max-tokens 8192\n\n` +
        chalk.yellow('If you still encounter token limit issues, try reducing the number of focus areas or viewports.');
    } else if (currentModel.includes('sonnet')) {
      return chalk.yellow('\nThe token limit was exceeded while generating the response.\n') +
        chalk.green('Try using the Opus model for higher output limit:\n') +
        `  npm run ui -- --url ${options.url} --model claude-3-opus-20240229 --max-tokens 4096\n\n` +
        chalk.yellow('If you still encounter token limit issues, try reducing the number of focus areas or viewports.');
    } else {
      return chalk.yellow('\nThe token limit was exceeded while generating the response.\n') +
        chalk.green('Try increasing max tokens or reducing analysis scope:\n') +
        `  npm run ui -- --url ${options.url} --max-tokens ${Math.min(currentMaxTokens + 2000, 8192)}\n` +
        `  # Or reduce focus areas:\n` +
        `  npm run ui -- --url ${options.url} --focus accessibility,visual-design,usability\n\n` +
        chalk.yellow('You can also try reducing the number of viewports to analyze.');
    }
  }
  
  // Check if the error is a timeout
  if (
    errorMessage.includes('Timeout') || 
    errorMessage.includes('timeout') || 
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('Navigation timeout')
  ) {
    if (options.stealth) {
      return chalk.yellow('\nIt looks like the site took too long to respond, even with stealth mode.\n') +
        chalk.green('Try increasing the timeout in your .env file:\n') +
        '  PAGE_LOAD_TIMEOUT=60000  # 60 seconds\n' +
        'Or use a longer timeout directly:\n' +
        '  npm run ui -- --url ' + options.url + ' --stealth --timeout 60000';
    } else {
      return chalk.yellow('\nIt looks like the site might have bot protection or is taking too long to load.\n') +
        chalk.green('Try using stealth mode:\n') +
        '  npm run ui -- --url ' + options.url + ' --stealth\n' +
        'If still unsuccessful, you can also increase the timeout:\n' +
        '  npm run ui -- --url ' + options.url + ' --stealth --timeout 60000';
    }
  }
  
  // Check for bot protection errors
  if (
    errorMessage.includes('captcha') || 
    errorMessage.includes('Captcha') || 
    errorMessage.includes('bot detection') ||
    errorMessage.includes('Bot Detection') ||
    errorMessage.includes('blocked') ||
    errorMessage.includes('access denied') ||
    errorMessage.includes('Access Denied') ||
    errorMessage.includes('403 Forbidden')
  ) {
    return chalk.yellow('\nThis site appears to have bot protection or captcha measures.\n') +
      chalk.green('Try using stealth mode:\n') +
      '  npm run ui -- --url ' + options.url + ' --stealth';
  }
  
  // Check for network errors
  if (
    errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
    errorMessage.includes('ERR_CONNECTION_REFUSED') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('net::ERR')
  ) {
    return chalk.yellow('\nThere was a network error connecting to the site.\n') +
      chalk.green('Make sure the URL is correct and accessible.');
  }
  
  // Default suggestion
  return chalk.yellow('\nIf you suspect this site has bot protection, try using stealth mode:\n') +
    chalk.green('  npm run ui -- --url ' + options.url + ' --stealth');
}

/**
 * Validates an Anthropic API key by making a minimal API call
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
async function validateApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, error: 'API key is empty or not provided' };
  }

  try {
    // Make a minimal API call to verify the key works
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello, this is a test message to verify API key validity.'
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    if (response.status === 200) {
      return { valid: true };
    } else {
      return { 
        valid: false, 
        error: `Unexpected response status: ${response.status}` 
      };
    }
  } catch (error) {
    let errorMessage = 'Invalid API key or network error';
    
    if (error.response) {
      // API responded with error
      if (error.response.status === 401 || error.response.status === 403) {
        errorMessage = 'Invalid API key or insufficient permissions';
      } else if (error.response.status === 400) {
        errorMessage = 'API request format error';
      } else if (error.response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else {
        errorMessage = `API error (${error.response.status}): ${error.response.data?.error?.message || 'Unknown error'}`;
      }
    } else if (error.request) {
      // No response received
      errorMessage = 'No response from Anthropic API. Please check your network connection.';
    }
    
    return { valid: false, error: errorMessage };
  }
}

/**
 * Prompts the user for an API key and validates it
 * @returns {Promise<string|null>} Valid API key or null if process should exit
 */
async function promptAndValidateApiKey() {
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const promptForApiKey = () => {
    return new Promise((resolve) => {
      rl.question(chalk.green('Enter your Anthropic API key: '), (answer) => {
        resolve(answer.trim());
      });
    });
  };
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    const userApiKey = await promptForApiKey();
    
    if (!userApiKey) {
      console.log(chalk.red('No API key provided. Exiting.'));
      rl.close();
      return null;
    }
    
    const validationSpinner = ora('Validating API key...').start();
    const validationResult = await validateApiKey(userApiKey);
    
    if (validationResult.valid) {
      validationSpinner.succeed('API key is valid');
      rl.close();
      return userApiKey;
    } else {
      validationSpinner.fail(`API key validation failed: ${validationResult.error}`);
      attempts++;
      
      if (attempts < maxAttempts) {
        console.log(chalk.yellow(`Please try again (${attempts}/${maxAttempts} attempts)`));
      } else {
        console.log(chalk.red(`Maximum attempts (${maxAttempts}) reached. Exiting.`));
        rl.close();
        return null;
      }
    }
  }
  
  rl.close();
  return null;
}

/**
 * Saves the API key to the .env file
 * @param {string} apiKey - The validated API key to save
 * @returns {Promise<boolean>} Whether the save was successful
 */
async function saveApiKeyToEnv(apiKey) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      // Check if file exists
      await fs.access(envPath);
      const existingContent = await fs.readFile(envPath, 'utf8');
      
      // Update or add API key
      if (existingContent.includes('ANTHROPIC_API_KEY=')) {
        envContent = existingContent.replace(/ANTHROPIC_API_KEY=.*(\r?\n|$)/g, `ANTHROPIC_API_KEY=${apiKey}$1`);
      } else {
        envContent = existingContent.trim() + `\n\nANTHROPIC_API_KEY=${apiKey}\n`;
      }
    } catch (error) {
      // File doesn't exist, create new
      envContent = `ANTHROPIC_API_KEY=${apiKey}\n`;
    }
    
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('API key saved to .env file.'));
    return true;
  } catch (error) {
    console.log(chalk.red(`Error saving API key: ${error.message}`));
    return false;
  }
}

/**
 * Main function to run the app
 */
async function main() {
  try {
    // Check if API key is available and valid
    let apiKey = process.env.ANTHROPIC_API_KEY;
    let apiKeyValid = false;
    
    if (apiKey) {
      // Validate existing API key
      const validationSpinner = ora('Validating Anthropic API key...').start();
      const validationResult = await validateApiKey(apiKey);
      
      if (validationResult.valid) {
        validationSpinner.succeed('API key is valid');
        apiKeyValid = true;
      } else {
        validationSpinner.fail(`Invalid API key: ${validationResult.error}`);
        if (!argv.nonInteractive) {
          console.log(chalk.yellow('Your Anthropic API key is invalid or expired.'));
        }
      }
    } else if (!argv.nonInteractive) {
      console.log(chalk.yellow('Anthropic API key not found. Please enter your API key.'));
      console.log(chalk.gray('You can get an API key from https://console.anthropic.com/\n'));
    }
    
    // In interactive mode, prompt for API key if needed
    if (!apiKeyValid && !argv.nonInteractive) {
      apiKey = await promptAndValidateApiKey();
      
      if (!apiKey) {
        console.log(chalk.red('Unable to obtain a valid API key. Exiting.'));
        process.exit(1);
      }
      
      // Set API key in environment
      process.env.ANTHROPIC_API_KEY = apiKey;
      apiKeyValid = true;
      
      // Optionally save to .env file
      const inquirer = require('inquirer');
      const { shouldSave } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldSave',
          message: 'Save this API key to .env file for future use?',
          default: true
        }
      ]);
      
      if (shouldSave) {
        await saveApiKeyToEnv(apiKey);
      }
    } else if (!apiKeyValid && argv.nonInteractive) {
      // In non-interactive mode, exit with error
      console.error(chalk.red('Error: Invalid or missing ANTHROPIC_API_KEY environment variable'));
      console.error('Please set your API key by:');
      console.error('1. Creating a .env file with ANTHROPIC_API_KEY=your-key');
      console.error('2. Setting the environment variable: export ANTHROPIC_API_KEY=your-key');
      console.error('3. Running setup: npm run setup');
      process.exit(1);
    }

    // Enable feedback loop mode if iterations > 1
    if (argv.iterations > 1) {
      argv.feedbackLoop = true;
    }
    
    // Run feedback loop if specified
    if (argv.feedbackLoop) {
      console.log(chalk.blue('Running in feedback loop mode with multiple iterations'));
      
      await runFeedbackLoop({
        url: argv.url,
        description: argv.description,
        iterations: argv.iterations || 3,
        devices: argv.viewports,
        browsers: argv.browsers || ['chromium'],
        focusAreas: argv.focus,
        runAccessibility: argv.runAccessibility,
        includeCode: argv.includeCode,
        model: argv.model,
        maxTokens: argv.maxTokens,
        stealth: argv.stealth,
        disableAnimations: argv.disableAnimations,
        verbose: argv.verbose,
        nonInteractive: argv.nonInteractive
      });
      
      return;
    }

    // Check if comparison flag is set (enables compare mode)
    if (argv.compareUrl) {
      console.log(chalk.blue('┌────────────────────────────────────────┐'));
      console.log(chalk.blue('│    UILensAI - UI Comparison Analysis   │'));
      console.log(chalk.blue('└────────────────────────────────────────┘'));
      console.log();

      // Create a timestamped directory for this comparison
      const timestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
      const domain = new URL(argv.url).hostname;
      const compareDomain = new URL(argv.compareUrl).hostname;

      // Create directory for storing comparison results
      const comparisonDir = path.join(
        getStoragePath('comparisons'), 
        `${domain}_vs_${compareDomain}_${timestamp}`
      );

      // Create subdirectories for before and after screenshots and reports
      const beforeDir = path.join(comparisonDir, 'before');
      const afterDir = path.join(comparisonDir, 'after');
      
      fs.mkdirSync(beforeDir, { recursive: true });
      fs.mkdirSync(afterDir, { recursive: true });

      // 1. Capture and analyze "before" screenshots (primary URL)
      console.log(chalk.cyan(`\n[1/4] Capturing and analyzing primary URL: ${argv.url}`));
      if (spinner) spinner.start('Capturing screenshots');
      
      const beforeScreenshots = await captureScreenshots({
        url: argv.url,
        viewports: argv.viewports.map(key => ({ ...VIEWPORT_PRESETS[key], name: key })),
        selector: argv.selector,
        fullPage: argv.fullPage,
        stealth: argv.stealth,
        disableAnimations: argv.disableAnimations,
        cacheDir: path.join(beforeDir, 'screenshots'),
        useCache: false, // Always capture fresh screenshots for comparison
        verbose: argv.verbose,
        onProgress: reportProgress,
        httpCredentials: argv.username && argv.password ? {
          username: argv.username,
          password: argv.password
        } : null
      });
      
      if (spinner) {
        spinner.succeed(`Captured ${beforeScreenshots.length} screenshots for primary URL`);
        spinner.start('Analyzing screenshots');
      }
      
      const beforeAnalysis = await analyzeScreenshots({
        screenshotResults: beforeScreenshots, // Pass the complete screenshot results
        url: argv.url,
        focus: argv.focus ? argv.focus.split(',') : FOCUS_AREAS,
        selector: argv.selector,
        model: argv.model,
        maxTokens: argv.maxTokens,
        verbose: argv.verbose,
        onProgress: reportProgress
      });
      
      if (spinner) {
        spinner.succeed('Analysis complete for primary URL');
        spinner.start('Generating primary report');
      }
      
      const beforeReportPath = await generateReport({
        url: argv.url,
        analysisResults: beforeAnalysis,
        viewports: argv.viewports,
        outputDir: path.join(beforeDir, 'reports'),
        focus: argv.focus ? argv.focus.split(',') : FOCUS_AREAS,
        selector: argv.selector,
        open: false,
        verbose: argv.verbose
      });
      
      if (spinner) spinner.succeed(`Primary report generated: ${beforeReportPath}`);
      
      // 2. Capture and analyze "after" screenshots (comparison URL)
      console.log(chalk.cyan(`\n[2/4] Capturing and analyzing comparison URL: ${argv.compareUrl}`));
      if (spinner) spinner.start('Capturing screenshots');
      
      const afterScreenshots = await captureScreenshots({
        url: argv.compareUrl,
        viewports: argv.viewports.map(key => ({ ...VIEWPORT_PRESETS[key], name: key })),
        selector: argv.selector,
        fullPage: argv.fullPage,
        stealth: argv.stealth,
        disableAnimations: argv.disableAnimations,
        cacheDir: path.join(afterDir, 'screenshots'),
        useCache: false, // Always capture fresh screenshots for comparison
        verbose: argv.verbose,
        onProgress: reportProgress,
        httpCredentials: argv.username && argv.password ? {
          username: argv.username,
          password: argv.password
        } : null
      });
      
      if (spinner) {
        spinner.succeed(`Captured ${afterScreenshots.length} screenshots for comparison URL`);
        spinner.start('Analyzing screenshots');
      }
      
      const afterAnalysis = await analyzeScreenshots({
        screenshotResults: afterScreenshots, // Pass the complete screenshot results
        url: argv.compareUrl,
        focus: argv.focus ? argv.focus.split(',') : FOCUS_AREAS,
        selector: argv.selector,
        model: argv.model,
        maxTokens: argv.maxTokens,
        verbose: argv.verbose,
        onProgress: reportProgress
      });
      
      if (spinner) {
        spinner.succeed('Analysis complete for comparison URL');
        spinner.start('Generating comparison URL report');
      }
      
      const afterReportPath = await generateReport({
        url: argv.compareUrl,
        analysisResults: afterAnalysis,
        viewports: argv.viewports,
        outputDir: path.join(afterDir, 'reports'),
        focus: argv.focus ? argv.focus.split(',') : FOCUS_AREAS,
        selector: argv.selector,
        open: false,
        verbose: argv.verbose
      });
      
      if (spinner) spinner.succeed(`Comparison URL report generated: ${afterReportPath}`);
      
      // 3. Generate comparison report
      console.log(chalk.cyan(`\n[3/4] Generating comparison report between the two URLs`));
      if (spinner) spinner.start('Generating comparison report');
      
      const comparisonReportPath = await generateUIComparisonReport({
        beforeUrl: argv.url,
        afterUrl: argv.compareUrl,
        beforeResults: beforeAnalysis,
        afterResults: afterAnalysis,
        viewports: argv.viewports,
        outputDir: path.join(comparisonDir, 'reports'),
        focus: argv.focus ? argv.focus.split(',') : FOCUS_AREAS,
        selector: argv.selector,
        verbose: argv.verbose
      });
      
      if (spinner) spinner.succeed(`Comparison report generated: ${comparisonReportPath}`);
      
      // 4. Generate side-by-side visual comparison
      console.log(chalk.cyan(`\n[4/4] Generating visual comparison reports`));
      if (spinner) spinner.start('Generating visual comparisons');
      
      const visualComparisonPath = await generateVisualComparison({
        beforeScreenshots: beforeScreenshots.map(s => s.path),
        afterScreenshots: afterScreenshots.map(s => s.path),
        outputDir: path.join(comparisonDir, 'visual'),
        verbose: argv.verbose
      });
      
      if (spinner) spinner.succeed(`Visual comparison reports generated in: ${visualComparisonPath}`);
      
      // 5. Present summary and open reports if requested
      console.log(chalk.green('\n✓ UI Comparison Analysis Complete'));
      console.log(chalk.cyan('Results Summary:'));
      console.log(`- Primary URL: ${argv.url}`);
      console.log(`- Comparison URL: ${argv.compareUrl}`);
      console.log(`- Viewports analyzed: ${argv.viewports}`);
      console.log(`- Primary report: ${path.relative(process.cwd(), beforeReportPath)}`);
      console.log(`- Comparison report: ${path.relative(process.cwd(), afterReportPath)}`);
      console.log(`- Difference report: ${path.relative(process.cwd(), comparisonReportPath)}`);
      console.log(`- All reports saved to: ${path.relative(process.cwd(), comparisonDir)}`);
      
      if (argv.open) {
        console.log(chalk.cyan('\nOpening reports in your browser...'));
        await openReport(beforeReportPath);
        await openReport(afterReportPath);
        await openReport(comparisonReportPath);
      }
      
      return;
    }

    // Validate inputs
    if (!argv.url) {
      throw new Error('URL is required');
    }

    // Handle full range viewport option
    if (argv['full-range-viewports']) {
      argv.viewports = Object.keys(VIEWPORT_PRESETS);
      if (argv.verbose) {
        console.log(`Using full range of viewports: ${argv.viewports.join(', ')}`);
      }
    }

    // Validate viewports
    const invalidViewports = argv.viewports.filter(v => !Object.keys(VIEWPORT_PRESETS).includes(v));
    if (invalidViewports.length > 0) {
      throw new Error(`Invalid viewport(s): ${invalidViewports.join(', ')}. Valid options are: ${Object.keys(VIEWPORT_PRESETS).join(', ')}`);
    }

    // Validate focus areas
    const invalidFocus = argv.focus.filter(f => !FOCUS_AREAS.includes(f));
    if (invalidFocus.length > 0) {
      throw new Error(`Invalid focus area(s): ${invalidFocus.join(', ')}. Valid options are: ${FOCUS_AREAS.join(', ')}`);
    }

    // Clean up old files
    await cleanupOldFiles();

    // Loop through each viewport and create sizes array
    const viewportSizes = [];
    const viewportNames = [];
    
    for (const viewportName of argv.viewports) {
      if (VIEWPORT_PRESETS[viewportName]) {
        viewportSizes.push({
          ...VIEWPORT_PRESETS[viewportName],
          name: viewportName
        });
        viewportNames.push(viewportName);
      }
    }

    // Process any custom viewport sizes
    if (argv['custom-viewport'] && Array.isArray(argv['custom-viewport'])) {
      argv['custom-viewport'].forEach(customViewport => {
        const match = customViewport.match(/^([a-z0-9-]+):(\d+)x(\d+)$/i);
        if (match) {
          const name = match[1];
          const width = parseInt(match[2], 10);
          const height = parseInt(match[3], 10);
          viewportSizes.push({ width, height, name });
          viewportNames.push(name);
        }
      });
    }

    // Display info
    console.log(chalk.blue('┌─────────────────────────────────────┐'));
    console.log(chalk.blue('│     UILensAI - Visual UI Analysis     │'));
    console.log(chalk.blue('└─────────────────────────────────────┘'));
    console.log();
    console.log(`URL: ${argv.url}`);
    console.log(`Viewports: ${viewportNames.join(', ')}`);
    console.log(`Focus Areas: ${argv.focus.join(', ')}`);
    console.log(`Claude Model: ${argv.model || process.env.MODEL || 'claude-3-haiku-20240307'}`);
    console.log(`Max Tokens: ${argv.maxTokens || process.env.MAX_TOKENS || 4000}`);
    if (argv.selector) console.log(`Selector: ${argv.selector}`);
    console.log(`Stealth Mode: ${argv.stealth ? 'Enabled' : 'Disabled'}`);
    console.log(`Disable Animations: ${argv.disableAnimations ? 'Enabled' : 'Disabled'}`);
    if (argv.username && argv.password) {
      console.log(`Authentication: Enabled (username: ${argv.username})`);
    }
    console.log('');

    // Set up the progress callback for CLI output
    let spinner = ora('Initializing browser - 0% complete').start();
    
    // Set up progress callback for updates
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
      
      const captureStartTime = Date.now();
      const screenshotOptions = {
        url: argv.url,
        viewports: viewportSizes,
        selector: argv.selector,
        fullPage: argv.fullPage,
        stealth: argv.stealth,
        disableAnimations: argv.disableAnimations,
        onProgress: updateProgress,
        verbose: argv.verbose,
        timeout: argv.timeout,
        httpCredentials: argv.username && argv.password ? {
          username: argv.username,
          password: argv.password
        } : null
      };
      
      // Update console and spinner
      if (spinner) spinner.text = 'Launching browser and capturing screenshots...';
      
      // Capture screenshots
      const screenshotResults = await captureScreenshots(screenshotOptions);

      // Analyze the screenshots
      const analysisSpinner = ora('Analyzing screenshots with Claude...').start();
      
      // Get model and max tokens
      const modelName = argv.model || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
      const maxTokens = parseInt(argv['max-tokens'] || process.env.MAX_TOKENS || 4000, 10);

      const analysisOptions = {
        url: argv.url,
        viewports: viewportSizes,
        useCache: !argv['no-cache'],
        cacheDir: path.join(getStoragePath(), 'cache'),
        focus: argv.focus,
        selector: argv.selector,
        filterScreenshots: true,
        onProgress: updateProgress,
        verbose: argv.verbose,
        model: modelName,
        maxTokens
      };
      
      // Use the new analyze function
      const analysisResult = await analyze({
        ...analysisOptions,
        screenshotResults // Pass the screenshot results to avoid taking new screenshots
      });
      analysisSpinner.succeed('Analysis complete');

      // Generate report
      const reportSpinner = ora('Generating report...').start();
      const reportPath = await generateReport({
        url: argv.url,
        viewports: viewportNames,
        outputDir: argv.output,
        consoleOutput: argv['console-output'] || false,
        verbose: argv.verbose || false,
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

      // Display report
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      console.log('\n============ ANALYSIS REPORT ============');
      console.log(reportContent);
      console.log('==========================================\n');

      // Open report if requested
      if (argv.open) {
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
      const finalErrorSpinner = ora().fail(chalk.red(`Error: ${error.message}`));
      
      // Get and display helpful suggestion based on the error
      const suggestion = getErrorSuggestion(error, argv);
      console.log(suggestion);
      
      if (argv.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  } catch (error) {
    const finalErrorSpinner = ora().fail(chalk.red(`Error: ${error.message}`));
    
    // Get and display helpful suggestion based on the error
    const suggestion = getErrorSuggestion(error, argv);
    console.log(suggestion);
    
    if (argv.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main(); 