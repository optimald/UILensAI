#!/usr/bin/env node

require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs').promises;
const { format } = require('date-fns');
const open = require('open');
const { captureScreenshots } = require('../capture');
const { analyzeScreenshots } = require('../analyze');
const { generateReport } = require('../report');
const { cleanupOldFiles, getStoragePath } = require('../storage');

const spinner = ora();

// Define viewport presets
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

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --url [url] --compare-url [url] [options]')
  .option('url', {
    description: 'Primary URL to analyze',
    type: 'string',
    demandOption: true
  })
  .option('compare-url', {
    description: 'URL to compare with the primary URL',
    type: 'string',
    demandOption: true
  })
  .option('viewports', {
    description: 'Comma-separated list of viewports to analyze',
    type: 'string',
    default: 'mobile,desktop',
    coerce: arg => arg.split(',')
  })
  .option('focus', {
    description: 'Comma-separated list of analysis areas to focus on',
    type: 'string',
    default: 'accessibility,branding,responsive,hierarchy,consistency,aesthetics,above-the-fold,content-flow,visual-design,usability',
    coerce: arg => arg.split(',')
  })
  .option('selector', {
    description: 'CSS selector to capture specific UI components',
    type: 'string'
  })
  .option('model', {
    description: 'Model to use for analysis',
    type: 'string',
    default: 'claude-3-haiku-20240307'
  })
  .option('verbose', {
    description: 'Display verbose output',
    type: 'boolean',
    alias: 'v',
    default: false
  })
  .option('output', {
    description: 'Output directory for the comparison report',
    type: 'string',
    default: './storage/comparisons'
  })
  .option('open', {
    description: 'Open the report after completion',
    type: 'boolean',
    default: true
  })
  .option('nonInteractive', {
    description: 'Run in non-interactive mode',
    type: 'boolean',
    default: false
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
  .alias('help', 'h')
  .argv;

/**
 * Main function to run the UI comparison
 */
async function main() {
  try {
    // Validate inputs
    if (!argv.url || !argv.compareUrl) {
      throw new Error('Both url and compare-url are required');
    }
    
    // Check if API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Check if we should run in interactive mode
      const nonInteractive = argv.nonInteractive;
      
      if (!nonInteractive) {
        // In interactive mode, prompt for API key
        console.log(chalk.yellow('API key not found. Please enter your Claude API key.'));
        console.log(chalk.gray('You can get an API key from https://console.anthropic.com/\n'));
        
        const rl = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const getApiKey = () => {
          return new Promise((resolve) => {
            rl.question(chalk.green('Enter your Claude API key: '), (answer) => {
              resolve(answer.trim());
              rl.close();
            });
          });
        };
        
        const userApiKey = await getApiKey();
        
        if (!userApiKey) {
          console.log(chalk.red('No API key provided. Exiting.'));
      process.exit(1);
        }
        
        // Set API key in environment
        process.env.ANTHROPIC_API_KEY = userApiKey;
        
        // If inquirer is available, optionally save to .env file
        try {
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
            try {
              const envPath = path.join(process.cwd(), '.env');
              let envContent = '';
              
              try {
                // Check if file exists
                await fs.access(envPath);
                const existingContent = await fs.readFile(envPath, 'utf8');
                
                // Update or add API key
                if (existingContent.includes('ANTHROPIC_API_KEY=')) {
                  envContent = existingContent.replace(/ANTHROPIC_API_KEY=.*(\r?\n|$)/g, `ANTHROPIC_API_KEY=${userApiKey}$1`);
                } else {
                  envContent = existingContent.trim() + `\n\nANTHROPIC_API_KEY=${userApiKey}\n`;
                }
              } catch (error) {
                // File doesn't exist, create new
                envContent = `ANTHROPIC_API_KEY=${userApiKey}\n`;
              }
              
              await fs.writeFile(envPath, envContent);
              console.log(chalk.green('API key saved to .env file.'));
            } catch (error) {
              console.log(chalk.red(`Error saving API key: ${error.message}`));
            }
          }
        } catch (error) {
          // Inquirer not available, just continue
        }
      } else {
        // In non-interactive mode, exit with error
        console.error(chalk.red('Error: ANTHROPIC_API_KEY environment variable not set'));
        console.error('Please set your API key by:');
        console.error('1. Creating a .env file with ANTHROPIC_API_KEY=your-key');
        console.error('2. Setting the environment variable: export ANTHROPIC_API_KEY=your-key');
        console.error('3. Running setup: npm run setup');
        process.exit(1);
      }
    }

    // Validate viewports
    const invalidViewports = argv.viewports.filter(v => !Object.keys(VIEWPORT_PRESETS).includes(v));
    if (invalidViewports.length > 0) {
      throw new Error(`Invalid viewport(s): ${invalidViewports.join(', ')}. Valid options are: ${Object.keys(VIEWPORT_PRESETS).join(', ')}`);
    }

    console.log(chalk.blue('┌────────────────────────────────────────┐'));
    console.log(chalk.blue('│      UILensAI - UI Comparison Tool     │'));
    console.log(chalk.blue('└────────────────────────────────────────┘'));
    console.log();
    
    // Create a timestamped directory for this comparison
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
    const beforeDomain = new URL(argv.url).hostname;
    const afterDomain = new URL(argv.compareUrl).hostname;
    const comparisonDir = path.join(
      getStoragePath('comparisons'), 
      `${beforeDomain}-vs-${afterDomain}-${timestamp}`
    );
    
    await fs.mkdir(comparisonDir, { recursive: true });
    
    if (argv.verbose) {
      console.log(`Created comparison directory: ${comparisonDir}`);
    }
    
    // Capture and analyze before screenshots
    console.log(chalk.cyan(`\n[1/4] Capturing and analyzing "before" URL: ${argv.url}`));
    spinner.start('Capturing screenshots');
    
    const beforeScreenshots = await captureScreenshots({
      url: argv.url,
      viewports: argv.viewports.map(key => ({ ...VIEWPORT_PRESETS[key], name: key })),
      selector: argv.selector,
      fullPage: true,
      outputDir: path.join(comparisonDir, 'before', 'screenshots'),
      verbose: argv.verbose,
      httpCredentials: argv.username && argv.password ? {
        username: argv.username,
        password: argv.password
      } : null
    });
    
    spinner.succeed('Screenshots captured successfully');
    
    // Analyze before screenshots
    spinner.start('Analyzing before screenshots');
    const beforeScreenshotPaths = beforeScreenshots.map(s => s.path);
    const beforeAnalysis = await analyzeScreenshots({
      screenshotPaths: beforeScreenshotPaths,
      url: argv.url,
      focus: argv.focus,
      selector: argv.selector,
      verbose: argv.verbose,
      model: argv.model
    });
    
    spinner.succeed('Before screenshots analyzed');
    
    // Generate before report
    spinner.start('Generating before report');
    const beforeReportPath = await generateReport({
      url: argv.url,
      analysisResults: beforeAnalysis,
      viewports: argv.viewports,
      outputDir: path.join(comparisonDir, 'before', 'reports'),
      selector: argv.selector,
      verbose: argv.verbose
    });
    
    spinner.succeed(`Before report generated at: ${beforeReportPath}`);
    
    // Capture and analyze after screenshots
    console.log(chalk.cyan(`\n[2/4] Capturing and analyzing "after" URL: ${argv.compareUrl}`));
    spinner.start('Capturing screenshots');
    
    const afterScreenshots = await captureScreenshots({
      url: argv.compareUrl,
      viewports: argv.viewports.map(key => ({ ...VIEWPORT_PRESETS[key], name: key })),
      selector: argv.selector,
      fullPage: true,
      outputDir: path.join(comparisonDir, 'after', 'screenshots'),
      verbose: argv.verbose,
      httpCredentials: argv.username && argv.password ? {
        username: argv.username,
        password: argv.password
      } : null
    });
    
    spinner.succeed('Screenshots captured successfully');
    
    // Analyze after screenshots
    spinner.start('Analyzing after screenshots');
    const afterScreenshotPaths = afterScreenshots.map(s => s.path);
    const afterAnalysis = await analyzeScreenshots({
      screenshotPaths: afterScreenshotPaths,
      url: argv.compareUrl,
      focus: argv.focus,
      selector: argv.selector,
      verbose: argv.verbose,
      model: argv.model
    });
    
    spinner.succeed('After screenshots analyzed');
    
    // Generate after report
    spinner.start('Generating after report');
    const afterReportPath = await generateReport({
      url: argv.compareUrl,
      analysisResults: afterAnalysis,
      viewports: argv.viewports,
      outputDir: path.join(comparisonDir, 'after', 'reports'),
      selector: argv.selector,
      verbose: argv.verbose
    });
    
    spinner.succeed(`After report generated at: ${afterReportPath}`);
    
    // Generate comparison report
    console.log(chalk.cyan('\n[3/4] Generating comparison report'));
    spinner.start('Creating comparison');
    
    const comparisonReportPath = await generateComparisonReport({
      beforeUrl: argv.url,
      afterUrl: argv.compareUrl,
      beforeResults: beforeAnalysis,
      afterResults: afterAnalysis,
      beforeReportPath,
      afterReportPath,
      comparisonDir,
      viewports: argv.viewports,
      selector: argv.selector
    });
    
    spinner.succeed(`Comparison report generated at: ${comparisonReportPath}`);
    
    // Open the report if requested
    if (argv.open) {
      console.log(chalk.cyan('\n[4/4] Opening comparison report'));
      try {
        // Use the exec function instead of open, which seems to be causing issues
        const { exec } = require('child_process');
        exec(`open "${comparisonReportPath}"`, (error) => {
          if (error) {
            console.log(chalk.yellow(`Could not open report: ${error.message}`));
            console.log(`You can manually open the report at: ${comparisonReportPath}`);
          } else {
            console.log(chalk.green(`Report opened in your default browser`));
          }
        });
      } catch (err) {
        console.log(chalk.yellow(`Could not open report: ${err.message}`));
        console.log(`You can manually open the report at: ${comparisonReportPath}`);
      }
    }
    
    console.log(chalk.green('\nUI comparison completed successfully!'));
    console.log(`Comparison report: ${chalk.cyan(comparisonReportPath)}`);
    
  } catch (error) {
    spinner.fail(`Error: ${error.message}`);
    console.error(chalk.red(`\nAn error occurred: ${error.message}`));
    if (argv.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Generate a comparison report between before and after analysis
 */
async function generateComparisonReport({
  beforeUrl,
  afterUrl,
  beforeResults,
  afterResults,
  beforeReportPath,
  afterReportPath,
  comparisonDir,
  viewports,
  selector
}) {
  // Create timestamp for the report
  const reportTimestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
  
  // Get relative paths for links
  const relativeBeforePath = path.relative(comparisonDir, beforeReportPath);
  const relativeAfterPath = path.relative(comparisonDir, afterReportPath);
  
  // Create markdown report
  let report = `# UI Comparison Analysis\n\n`;
  report += `Generated: ${format(new Date(), 'MMMM d, yyyy h:mm:ss a')}\n\n`;
  
  report += `## Overview\n\n`;
  report += `This report compares the UI between two versions:\n\n`;
  report += `- **Before URL**: [${beforeUrl}](${beforeUrl})\n`;
  report += `- **After URL**: [${afterUrl}](${afterUrl})\n\n`;
  
  if (selector) {
    report += `**Selected Element**: \`${selector}\`\n\n`;
  }
  
  report += `**Viewports Analyzed**: ${viewports.join(', ')}\n\n`;
  
  report += `## Links to Individual Reports\n\n`;
  report += `- [Before Analysis](${relativeBeforePath})\n`;
  report += `- [After Analysis](${relativeAfterPath})\n\n`;
  
  report += `## Side-by-Side Comparison\n\n`;
  
  // Add viewport-specific comparisons
  for (const viewport of viewports) {
    report += `### ${viewport.charAt(0).toUpperCase() + viewport.slice(1)} Viewport\n\n`;
    
    // Find before and after results for this viewport
    const beforeViewportResult = beforeResults[viewport.toLowerCase()];
    const afterViewportResult = afterResults[viewport.toLowerCase()];
    
    if (!beforeViewportResult || !afterViewportResult) {
      report += `*Results for one or both versions are missing for this viewport.*\n\n`;
      continue;
    }
    
    // Add screenshot comparison
    report += `#### Visual Comparison\n\n`;
    report += `<table>\n`;
    report += `  <tr>\n`;
    report += `    <th>Before</th>\n`;
    report += `    <th>After</th>\n`;
    report += `  </tr>\n`;
    report += `  <tr>\n`;
    
    // Find screenshot paths from the analysis results
    const beforeScreenshots = beforeResults[viewport.toLowerCase()]?.screenshot || '';
    const afterScreenshots = afterResults[viewport.toLowerCase()]?.screenshot || '';
    
    // Get relative paths to screenshots
    const beforeScreenshotPath = path.relative(
      comparisonDir,
      beforeScreenshots
    );
    
    const afterScreenshotPath = path.relative(
      comparisonDir,
      afterScreenshots
    );
    
    report += `    <td><img src="${beforeScreenshotPath}" width="400" /></td>\n`;
    report += `    <td><img src="${afterScreenshotPath}" width="400" /></td>\n`;
    report += `  </tr>\n`;
    report += `</table>\n\n`;
    
    // Add analysis comparison
    report += `#### Analysis Comparison\n\n`;
    report += `<table>\n`;
    report += `  <tr>\n`;
    report += `    <th>Before</th>\n`;
    report += `    <th>After</th>\n`;
    report += `  </tr>\n`;
    report += `  <tr>\n`;
    report += `    <td>\n\n${beforeViewportResult.analysis || '*No analysis available*'}\n\n</td>\n`;
    report += `    <td>\n\n${afterViewportResult.analysis || '*No analysis available*'}\n\n</td>\n`;
    report += `  </tr>\n`;
    report += `</table>\n\n`;
    
    // Add improvement summary if available
    if (beforeViewportResult.analysis && afterViewportResult.analysis) {
      report += `#### Key Differences and Improvements\n\n`;
      
      // We would ideally analyze the differences here with an AI model
      // But for now, we'll create a placeholder for manual analysis
      report += `*An AI-powered analysis of the differences between the before and after versions would be shown here.*\n\n`;
      report += `--- \n\n`;
    }
  }
  
  report += `## Conclusion\n\n`;
  report += `This report presents a side-by-side comparison of two UI versions. `;
  report += `Review the differences to determine if the changes have resulted in improvements `;
  report += `to usability, accessibility, visual design, or other areas of focus.\n\n`;
  
  // Comparison report filename with timestamp
  const reportFilename = `comparison-report-${reportTimestamp}.md`;
  const reportPath = path.join(comparisonDir, reportFilename);
  
  // Write report to file
  await fs.writeFile(reportPath, report);
  
  // Return the full path to the report
  return reportPath;
}

// Run the main function
if (require.main === module) {
  main().catch(err => {
    console.error(chalk.red(`Fatal error: ${err.message}`));
    process.exit(1);
  });
}

// Export the generateComparisonReport function with a more specific name
// to avoid collision with CLI configuration
module.exports = { generateUIComparisonReport: generateComparisonReport }; 