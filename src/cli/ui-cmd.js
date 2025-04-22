#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const program = new Command();
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');
const { format } = require('date-fns');
const openReport = require('open');

program
  .name('ui-cmd')
  .description('UILensAI command-line interface')
  .requiredOption('--url <url>', 'URL to analyze')
  .option('--compare-url <url>', 'URL to compare with the primary URL')
  .option('--viewports <list>', 'Comma-separated list of viewports to analyze', 'mobile,desktop')
  .option('--focus <list>', 'Comma-separated list of analysis areas to focus on')
  .option('--model <name>', 'Claude model to use', 'claude-3-haiku-20240307')
  .option('--max-tokens <number>', 'Maximum tokens for Claude analysis response', '4096')
  .option('--output <dir>', 'Output directory for reports')
  .option('--iterations <number>', 'Number of iterations for feedback loop')
  .option('--stealth', 'Use stealth mode for bot protection')
  .option('--verbose', 'Show verbose output');

program.parse();

const options = program.opts();
const spinner = ora();

async function main() {
  try {
    if (options.compareUrl) {
      // For comparison mode, directly call compare-ui.js
      console.log(chalk.blue('Running in comparison mode...'));
      let compareCommand = `node ../utils/compare-ui.js --url ${options.url} --compare-url ${options.compareUrl}`;
      
      // Add additional options
      if (options.viewports) compareCommand += ` --viewports ${options.viewports}`;
      if (options.focus) compareCommand += ` --focus ${options.focus}`;
      if (options.model) compareCommand += ` --model ${options.model}`;
      if (options.output) compareCommand += ` --output ${options.output}`;
      if (options.stealth) compareCommand += ` --stealth`;
      if (options.verbose) compareCommand += ` --verbose`;
      
      console.log(`Executing: ${compareCommand}`);
      
      const compareProcess = spawn('node', compareCommand.split(' ').slice(1), {
        stdio: 'inherit'
      });
      
      return new Promise((resolve, reject) => {
        compareProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Compare process exited with code ${code}`));
          }
        });
      });
    } else if (options.iterations) {
      // For feedback loop mode, run with iterations
      console.log(chalk.blue('Running in feedback loop mode...'));
      let loopCommand = `node ../utils/feedback-loop.js --url ${options.url} --iterations ${options.iterations}`;
      
      // Add additional options
      if (options.viewports) loopCommand += ` --viewports ${options.viewports}`;
      if (options.focus) loopCommand += ` --focus ${options.focus}`;
      if (options.model) loopCommand += ` --model ${options.model}`;
      if (options.stealth) loopCommand += ` --stealth`;
      if (options.verbose) loopCommand += ` --verbose`;
      
      console.log(`Executing: ${loopCommand}`);
      
      const loopProcess = spawn('node', loopCommand.split(' ').slice(1), {
        stdio: 'inherit'
      });
      
      return new Promise((resolve, reject) => {
        loopProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Feedback loop process exited with code ${code}`));
          }
        });
      });
    } else {
      // For single URL mode, use a child process to run analysis directly
      console.log(chalk.blue('Running single URL analysis...'));
      
      // Import the required modules for single URL analysis
      const { captureScreenshots } = require('../capture');
      const { analyze } = require('../analyze');
      const { generateReport } = require('../report');
      const { cleanupOldFiles, getStoragePath } = require('../storage');
      
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
      
      // Display info
      console.log(chalk.cyan.bold('UILensAI - Visual UI Analysis Tool'));
      console.log(`URL: ${options.url}`);
      console.log(`Viewports: ${options.viewports}`);
      console.log(`Claude Model: ${options.model}`);
      console.log('');
      
      // Parse viewports
      const viewports = options.viewports.split(',');
      
      // Clean up old files
      await cleanupOldFiles();
      
      // Prepare viewport sizes
      const viewportSizes = viewports.map(name => ({
        ...VIEWPORT_PRESETS[name],
        name
      }));
      
      // Capture screenshots
      spinner.start('Capturing screenshots...');
      const screenshotResults = await captureScreenshots({
        url: options.url,
        viewports: viewportSizes,
        fullPage: true,
        stealth: options.stealth,
        disableAnimations: true,
        useCache: true,
        verbose: options.verbose
      });
      spinner.succeed(`Captured ${screenshotResults.length} screenshots`);
      
      // Analyze screenshots
      spinner.start('Analyzing screenshots with Claude...');
      const focusAreas = options.focus ? options.focus.split(',') : undefined;
      const analysisResult = await analyze({
        url: options.url,
        screenshotResults,
        focus: focusAreas,
        model: options.model,
        maxTokens: parseInt(options.maxTokens, 10),
        verbose: options.verbose
      });
      spinner.succeed('Analysis complete');
      
      // Generate report
      spinner.start('Generating report...');
      const outputDir = options.output || './storage/reports';
      
      // Transform results for report generation
      const reportResults = analysisResult.analysis.reduce((acc, item) => {
        if (item.result) {
          acc[item.viewport.name] = {
            analysis: item.result.raw,
            screenshot: item.viewport ? `${item.viewport.name}_screenshot.png` : null
          };
        } else if (item.error) {
          acc[item.viewport.name] = {
            error: item.error.message || String(item.error),
            screenshot: item.viewport ? `${item.viewport.name}_screenshot.png` : null
          };
        }
        return acc;
      }, {});
      
      // Handle the case where screenshots might be undefined
      if (!analysisResult.screenshots) {
        analysisResult.screenshots = screenshotResults;
      }
      
      const reportPath = await generateReport({
        url: options.url,
        viewports,
        outputDir,
        analysisResults: reportResults,
        verbose: options.verbose
      });
      spinner.succeed(`Report generated: ${reportPath}`);
      
      // Open report
      try {
        console.log(`Opening report ${reportPath}...`);
        await openReport(reportPath);
      } catch (err) {
        console.error('Could not open report:', err.message);
      }
      
      console.log(chalk.green('\n✓ Analysis complete!'));
      console.log(`Report saved to: ${reportPath}`);
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${error.message}`));
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main(); 