#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { format } = require('date-fns');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { spawn } = require('child_process');
const { runAnalysis } = require('../index');
const { getStoragePath } = require('../storage');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const spinner = ora();

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('url', {
    description: 'URL to analyze',
    type: 'string'
  })
  .option('description', {
    description: 'Description of the page/UI to guide analysis',
    type: 'string'
  })
  .option('iterations', {
    description: 'Number of iterations to run',
    type: 'number',
    default: 3
  })
  .option('viewports', {
    description: 'Comma-separated list of viewports to analyze',
    type: 'string',
    default: 'mobile,tablet,desktop',
    coerce: arg => arg.split(',')
  })
  .option('focus', {
    description: 'Comma-separated list of analysis areas to focus on',
    type: 'string',
    default: 'accessibility,branding,responsive,hierarchy,consistency',
    coerce: arg => arg.split(',')
  })
  .option('browsers', {
    description: 'Comma-separated list of browser engines to use',
    type: 'string',
    default: 'chromium',
    coerce: arg => arg.split(',')
  })
  .option('run-accessibility', {
    description: 'Run accessibility tests',
    type: 'boolean',
    default: false
  })
  .option('include-code', {
    description: 'Include code suggestions in analysis',
    type: 'boolean',
    default: false
  })
  .option('model', {
    description: 'Claude model to use',
    type: 'string',
    default: 'claude-3-haiku-20240307'
  })
  .option('max-tokens', {
    description: 'Maximum tokens for Claude response',
    type: 'number',
    default: 4000
  })
  .option('stealth', {
    description: 'Use stealth mode for sites with bot protection',
    type: 'boolean',
    default: false
  })
  .option('disable-animations', {
    description: 'Disable animations for consistent screenshots',
    type: 'boolean',
    default: true
  })
  .option('verbose', {
    description: 'Show verbose output',
    type: 'boolean',
    default: false
  })
  .option('non-interactive', {
    description: 'Run in non-interactive mode',
    type: 'boolean',
    default: false
  })
  .help()
  .alias('help', 'h')
  .argv;

/**
 * Runs a feedback loop of multiple UI analysis iterations
 * 
 * @param {Object} options - Options for the feedback loop
 * @param {string} options.url - URL to analyze
 * @param {string} options.description - Description of the page/UI to guide analysis
 * @param {number} options.iterations - Number of iterations to run
 * @param {Array<string>} options.devices - Device presets to use
 * @param {Array<string>} options.browsers - Browser engines to use
 * @param {Array<string>} options.focusAreas - Focus areas for analysis
 * @param {boolean} options.runAccessibility - Whether to run accessibility tests
 * @param {boolean} options.includeCode - Whether to include code extraction
 * @param {string} options.model - Claude model to use
 * @param {number} options.maxTokens - Maximum tokens for Claude response
 * @param {boolean} options.stealth - Whether to run in stealth mode
 * @param {boolean} options.disableAnimations - Whether to disable animations
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @param {boolean} options.nonInteractive - Whether to run in non-interactive mode
 * @returns {Promise<void>}
 */
async function runFeedbackLoop({
  url,
  description,
  iterations = 3,
  devices = ['mobile', 'tablet', 'desktop'],
  browsers = ['chromium'],
  focusAreas = ['accessibility', 'branding', 'responsive', 'hierarchy', 'consistency'],
  runAccessibility = false,
  includeCode = false,
  model = 'claude-3-haiku-20240307',
  maxTokens = 4000,
  stealth = false,
  disableAnimations = true,
  verbose = false,
  nonInteractive = false
}) {
  console.log(chalk.blue.bold('UILensAI - Feedback Loop Analysis'));
  console.log(chalk.gray(`Running ${iterations} iterations of UI analysis for: ${url}`));
  if (nonInteractive) {
    console.log(chalk.yellow('Running in non-interactive mode. All iterations will execute automatically.'));
  }
  console.log();
  
  if (!description) {
    console.log(chalk.yellow('Warning: No page description provided. Analysis may be less focused.'));
    description = 'A web page';
  } else {
    console.log(chalk.cyan('Page Description:'));
    console.log(description);
    console.log();
  }
  
  // Create a unique session ID for this feedback loop
  const sessionId = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
  const feedbackDir = path.join(getStoragePath(), 'reports', 'feedback-loop', sessionId);
  
  // Create feedback directory
  await fsPromises.mkdir(feedbackDir, { recursive: true });
  
  // Save the description
  await fsPromises.writeFile(path.join(feedbackDir, 'description.txt'), description);
  
  // Create a cleaned URL string for filenames
  const urlForFilename = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9-_.]/g, '-');
  
  // Store results for each iteration
  const iterationResults = [];
  
  // Run each iteration
  for (let i = 0; i < iterations; i++) {
    const iterationNum = i + 1;
    console.log(chalk.cyan(`\n--- Iteration ${iterationNum}/${iterations} ---`));
    
    // Store the start time
    const startTime = Date.now();
    
    try {
      // Run the analysis
      spinner.start(`Running analysis iteration ${iterationNum}...`);
      
      // Build comparative prompt with prior iteration results if available
      let comparativePrompt = '';
      if (i > 0) {
        // Extract key findings from previous iteration
        const prevAnalysis = iterationResults[i - 1];
        comparativePrompt = `Previous Analysis (Iteration ${i}): ${prevAnalysis.summary}\n\n`;
        comparativePrompt += `Focus on these improvements: ${prevAnalysis.improvements.join(', ')}\n\n`;
        comparativePrompt += `Page description: ${description}\n\n`;
      } else {
        comparativePrompt = `Page description: ${description}\n\n`;
        comparativePrompt += 'This is the first analysis iteration. Provide a baseline assessment.';
      }
      
      // Create a subdirectory for this iteration
      const iterationTimestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
      const iterationDir = path.join(feedbackDir, `iteration-${iterationNum}-${iterationTimestamp}`);
      await fsPromises.mkdir(iterationDir, { recursive: true });
      
      // Save the comparative prompt
      await fsPromises.writeFile(path.join(iterationDir, 'prompt.txt'), comparativePrompt);
      
      // Create a progress tracker function
      const updateProgress = (progress) => {
        const { step, percentage } = progress;
        const iterationPercentage = Math.floor(((i + (percentage / 100)) / iterations) * 100);
        spinner.text = `Iteration ${iterationNum}/${iterations}: ${step} - ${percentage}% (Overall: ${iterationPercentage}%)`;
      };
      
      // Execute CLI command
      const reportPath = await executeCliCommand({
        url,
        outputDir: iterationDir,
        devices,
        browsers,
        focusAreas,
        runAccessibility,
        includeCode,
        verbose,
        stealth,
        disableAnimations,
        extraArgs: i > 0 ? ['--description-file', path.join(iterationDir, 'prompt.txt')] : [],
        model,
        maxTokens,
        onProgress: updateProgress
      });
      
      // Record the analysis duration
      const duration = Date.now() - startTime;
      
      // Parse the report to extract key points
      spinner.start('Analyzing report...');
      const reportContent = await fsPromises.readFile(reportPath, 'utf8');
      
      // Extract summary and identified improvements
      const summary = extractSummary(reportContent);
      const improvements = extractImprovements(reportContent);
      
      spinner.succeed(`Completed iteration ${iterationNum} in ${Math.round(duration / 1000)} seconds`);
      
      // Store results
      iterationResults.push({
        iteration: iterationNum,
        timestamp: new Date().toISOString(),
        reportPath,
        duration,
        summary,
        improvements
      });
      
      // Save current iteration results
      await fsPromises.writeFile(
        path.join(iterationDir, 'results.json'),
        JSON.stringify(iterationResults[i], null, 2)
      );
      
      // If not the last iteration and not in non-interactive mode, prompt to continue
      if (i < iterations - 1 && !nonInteractive) {
        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Continue to next iteration? (implement the suggested improvements first)',
            default: true
          }
        ]);
        
        if (!shouldContinue) {
          console.log(chalk.yellow('Feedback loop terminated early.'));
          break;
        }
      } else if (i < iterations - 1 && nonInteractive) {
        // In non-interactive mode, display a message about the next iteration
        console.log(chalk.gray('Proceeding to next iteration automatically (non-interactive mode)...'));
        // Add a slight delay to allow for reading console output
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      spinner.fail(`Error in iteration ${iterationNum}: ${error.message}`);
      
      // Store error result
      iterationResults.push({
        iteration: iterationNum,
        timestamp: new Date().toISOString(),
        error: error.message,
        duration: Date.now() - startTime
      });
      
      // Continue with next iteration or terminate
      if (i < iterations - 1 && !nonInteractive) {
        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Error occurred. Continue to next iteration?',
            default: false
          }
        ]);
        
        if (!shouldContinue) {
          console.log(chalk.yellow('Feedback loop terminated due to error.'));
          break;
        }
      } else if (i < iterations - 1 && nonInteractive) {
        // In non-interactive mode, continue automatically but log the issue
        console.log(chalk.yellow('Error occurred but continuing to next iteration (non-interactive mode)...'));
        // Add a slight delay to allow for reading console output
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }
  
  // Generate final report comparing all iterations
  const comparisonReportPath = await generateComparisonReport(feedbackDir, iterationResults, description);
  
  console.log(chalk.green.bold('\n✓ Feedback loop complete!'));
  console.log(`Completed ${iterationResults.length} iterations of UI analysis.`);
  console.log(`Final comparison report saved at: ${chalk.cyan(comparisonReportPath)}`);
  
  // Return the report path for CLI usage
  return comparisonReportPath;
}

/**
 * Execute the CLI command for analysis
 * 
 * @param {Object} options - CLI options
 * @param {function} options.onProgress - Optional progress callback
 * @returns {Promise<string>} - Path to the generated report
 */
async function executeCliCommand({ 
  url, 
  outputDir, 
  devices = [], 
  browsers = [], 
  focusAreas = [],
  runAccessibility,
  includeCode,
  verbose,
  stealth,
  disableAnimations,
  extraArgs = [],
  model,
  maxTokens,
  onProgress
}) {
  return new Promise((resolve, reject) => {
    // Ensure outputDir exists
    if (!outputDir) {
      outputDir = path.join(getStoragePath(), 'reports');
    }
    
    // Create output directory if it doesn't exist
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
    }
    
    const args = [
      'src/cli.js',
      '--url', url,
      '--viewports', (devices && devices.length) ? devices.join(',') : 'mobile,desktop',
      '--focus', (focusAreas && focusAreas.length) ? focusAreas.join(',') : 'accessibility,branding,responsive,hierarchy,consistency,aesthetics,above-the-fold,content-flow,visual-design,usability',
      '--output', outputDir
    ];
    
    if (runAccessibility) args.push('--run-accessibility');
    if (includeCode) args.push('--include-code');
    if (verbose) args.push('--verbose');
    if (model) args.push('--model', model);
    if (maxTokens) args.push('--max-tokens', maxTokens.toString());
    if (stealth) args.push('--stealth');
    if (disableAnimations) args.push('--disable-animations');
    
    // Add custom progress handling
    if (onProgress) {
      // We create a custom event system for progress reporting
      const customProgressFlag = `--progress-report=${Date.now()}`;
      args.push(customProgressFlag);
      
      // We'll add our own processing logic for this
      process.env.PROGRESS_CALLBACK_ENABLED = 'true';
    }
    
    // Add any extra arguments
    if (extraArgs && extraArgs.length) {
      args.push(...extraArgs);
    }
    
    if (verbose) {
      console.log('Executing command:', 'node', args.join(' '));
    }
    
    const child = spawn('node', args);
    
    let output = '';
    let reportPath = null;
    
    // Handle progress reporting from child process
    if (onProgress) {
      child.stdout.on('data', (data) => {
        const dataStr = data.toString();
        // Check for progress marker
        if (dataStr.includes('PROGRESS_UPDATE:')) {
          try {
            const progressJson = dataStr.split('PROGRESS_UPDATE:')[1].trim();
            const progressData = JSON.parse(progressJson);
            onProgress(progressData);
          } catch (err) {
            // Ignore parsing errors
          }
        } else {
          output += dataStr;
          
          // Try to extract report path from output
          const match = dataStr.match(/Report generated: (.+\.txt)/);
          if (match && match[1]) {
            reportPath = match[1];
          }
        }
      });
    } else {
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        // Try to extract report path from output
        const match = data.toString().match(/Report generated: (.+\.txt)/);
        if (match && match[1]) {
          reportPath = match[1];
        }
      });
    }
    
    child.on('close', (code) => {
      if (code === 0) {
        // If we didn't find a report path in the output but the command succeeded,
        // create a default report path to avoid null errors
        if (!reportPath) {
          const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
          reportPath = path.join(outputDir, `report-${timestamp}.txt`);
          fs.writeFileSync(reportPath, output); // Create an empty report file
        }
        resolve(reportPath);
      } else {
        reject(new Error(`CLI command failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

/**
 * Extract summary from report content
 * 
 * @param {string} reportContent - Content of the analysis report
 * @returns {string} - Extracted summary
 */
function extractSummary(reportContent) {
  // Handle empty or undefined report content
  if (!reportContent) {
    return "No analysis data available.";
  }
  
  // Look for Summary section
  const summaryMatch = reportContent.match(/##\s*Summary\s*([\s\S]*?)(?=##|$)/i);
  
  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim();
  }
  
  // If no specific Summary section found, get last paragraph of the report
  const paragraphs = reportContent.split('\n\n');
  if (paragraphs.length > 0) {
  return paragraphs[paragraphs.length - 1].trim();
  }
  
  return "No summary found in report.";
}

/**
 * Extract list of improvements from report content
 * 
 * @param {string} reportContent - Content of the analysis report
 * @returns {Array<string>} - List of improvements
 */
function extractImprovements(reportContent) {
  const improvements = [];
  
  // Handle empty or undefined report content
  if (!reportContent) {
    return ["No improvement data available."];
  }
  
  // Look for High/Medium severity issues
  const highSeverityMatches = reportContent.matchAll(/##\s*\[SEVERITY:\s*High\](.*?)\n/g);
  const mediumSeverityMatches = reportContent.matchAll(/##\s*\[SEVERITY:\s*Medium\](.*?)\n/g);
  
  for (const match of highSeverityMatches) {
    if (match[1]) {
      improvements.push(match[1].trim());
    }
  }
  
  for (const match of mediumSeverityMatches) {
    if (match[1]) {
      improvements.push(match[1].trim());
    }
  }
  
  // If not enough issues found, look for any recommendation sections
  if (improvements.length < 3) {
    const recommendationMatches = reportContent.matchAll(/\*\*Recommendation:\*\*(.*?)(?=\n\n|$)/g);
    for (const match of recommendationMatches) {
      if (match[1] && improvements.length < 5) {
        improvements.push(match[1].trim());
      }
    }
  }
  
  // If still no improvements found, add a generic one
  if (improvements.length === 0) {
    improvements.push("Focus on improving the overall user experience.");
  }
  
  return improvements;
}

/**
 * Generate a comparative report of all iterations
 * 
 * @param {string} feedbackDir - Directory containing feedback loop results
 * @param {Array<Object>} iterationResults - Results from each iteration
 * @param {string} description - Page description
 * @returns {Promise<void>}
 */
async function generateComparisonReport(feedbackDir, iterationResults, description) {
  // Create timestamp for the report
  const reportTimestamp = format(new Date(), 'yyyyMMdd-HHmmss-SSS');
  
  // Create markdown report
  let report = `# UI Feedback Loop Analysis Report\n\n`;
  report += `Generated: ${format(new Date(), 'MMMM d, yyyy h:mm:ss.SSS a')}\n\n`;
  report += `## Page Description\n\n${description || "No description provided"}\n\n`;
  report += `## Analysis Overview\n\n`;
  
  // Handle case where no iterations completed
  if (!iterationResults || iterationResults.length === 0) {
    report += `No successful iterations were completed.\n\n`;
    report += `## Error Information\n\n`;
    report += `The feedback loop encountered errors in all iterations. Please check the console output for more details.\n\n`;
    
    // Create the report filename with timestamp
    const reportFilename = `comparison-report-${reportTimestamp}.md`;
    await fsPromises.writeFile(path.join(feedbackDir, reportFilename), report);
    return path.join(feedbackDir, reportFilename);
  }
  
  report += `- Total Iterations: ${iterationResults.length}\n`;
  report += `- First Iteration: ${iterationResults.length > 0 ? format(new Date(iterationResults[0].timestamp), 'MMMM d, yyyy h:mm:ss.SSS a') : 'No successful iterations'}\n`;
  report += `- Last Iteration: ${iterationResults.length > 0 ? format(new Date(iterationResults[iterationResults.length - 1].timestamp), 'MMMM d, yyyy h:mm:ss.SSS a') : 'No successful iterations'}\n\n`;
  
  report += `## Progression of Improvements\n\n`;
  
  for (let i = 0; i < iterationResults.length; i++) {
    const result = iterationResults[i];
    
    report += `### Iteration ${result.iteration}\n\n`;
    
    if (result.error) {
      report += `**Error occurred:** ${result.error}\n\n`;
      continue;
    }
    
    // Add summary
    report += `**Summary:**\n\n${result.summary}\n\n`;
    
    // Add improvements
    if (result.improvements && result.improvements.length) {
      report += `**Key Issues Identified:**\n\n`;
      for (const improvement of result.improvements) {
        report += `- ${improvement}\n`;
      }
      report += '\n';
    }
    
    // Add link to full report
    const relativeReportPath = path.relative(feedbackDir, result.reportPath);
    report += `[View Full Analysis Report for Iteration ${result.iteration}](${relativeReportPath})\n\n`;
    
    // Add separator between iterations
    if (i < iterationResults.length - 1) {
      report += `---\n\n`;
    }
  }
  
  // Add conclusion if there's more than one successful iteration
  const successfulIterations = iterationResults.filter(result => !result.error);
  if (successfulIterations.length > 1) {
    report += `## Conclusion\n\n`;
    report += `This feedback loop analysis ran ${iterationResults.length} iterations, `;
    report += `with each iteration building upon the improvements suggested in the previous analysis. `;
    report += `The progression shows how implementing specific UI improvements can lead to `;
    report += `better usability, accessibility, and overall design consistency.\n\n`;
    
    // Add instructions for next steps
    report += `## Next Steps\n\n`;
    report += `1. Review the identified issues from the final iteration\n`;
    report += `2. Implement the remaining suggested improvements\n`;
    report += `3. Consider running another feedback loop session after major changes\n`;
    report += `4. Focus on any persistent issues that appeared across multiple iterations\n`;
  }
  
  // Comparison report filename with timestamp
  const reportFilename = `comparison-report-${reportTimestamp}.md`;
  
  // Write report to file
  await fsPromises.writeFile(path.join(feedbackDir, reportFilename), report);
  
  // Return the full path to the report
  return path.join(feedbackDir, reportFilename);
}

/**
 * Run the feedback loop with interactive prompts
 */
async function runInteractiveFeedbackLoop() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'URL to analyze:',
      validate: input => input ? true : 'URL is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Describe the page/UI (helps focus the analysis):',
    },
    {
      type: 'input',
      name: 'iterations',
      message: 'Number of iterations to run:',
      default: '3',
      validate: input => /^\d+$/.test(input) && parseInt(input) > 0
        ? true : 'Please enter a positive number'
    },
    {
      type: 'checkbox',
      name: 'devices',
      message: 'Select viewports to test:',
      choices: [
        { name: 'Tiny Mobile (280px)', value: 'tiny-mobile' },
        { name: 'Mobile (375px)', value: 'mobile' },
        { name: 'Tablet (768px)', value: 'tablet' },
        { name: 'Desktop (1024px)', value: 'desktop' },
        { name: 'Large Desktop (1440px)', value: 'large' },
        { name: 'Ultrawide (1920px)', value: 'ultrawide' },
        { name: 'Super Ultrawide (2560px)', value: 'super-ultrawide' }
      ],
      default: ['mobile', 'tablet', 'desktop']
    },
    {
      type: 'checkbox',
      name: 'focus',
      message: 'Select analysis focus areas:',
      choices: [
        { name: 'Accessibility', value: 'accessibility' },
        { name: 'Branding', value: 'branding' },
        { name: 'Responsive Design', value: 'responsive' },
        { name: 'Visual Hierarchy', value: 'hierarchy' },
        { name: 'UI Consistency', value: 'consistency' },
        { name: 'Aesthetics', value: 'aesthetics' },
        { name: 'Above the Fold', value: 'above-the-fold' },
        { name: 'Content Flow', value: 'content-flow' },
        { name: 'Visual Design', value: 'visual-design' },
        { name: 'Usability', value: 'usability' }
      ],
      default: ['accessibility', 'responsive', 'hierarchy', 'consistency']
    },
    {
      type: 'list',
      name: 'model',
      message: 'Select Claude model to use:',
      choices: [
        { name: 'Claude 3 Haiku (Cheapest)', value: 'claude-3-haiku-20240307' },
        { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620' },
        { name: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20240620' },
        { name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' }
      ],
      default: 'claude-3-haiku-20240307'
    },
    {
      type: 'input',
      name: 'maxTokens',
      message: 'Maximum tokens for response:',
      default: '4000',
      validate: input => /^\d+$/.test(input) && parseInt(input) > 0
        ? true : 'Please enter a positive number'
    },
    {
      type: 'confirm',
      name: 'stealth',
      message: 'Use stealth mode for sites with bot protection?',
      default: false
    },
    {
      type: 'confirm',
      name: 'disableAnimations',
      message: 'Disable animations for consistent screenshots?',
      default: true
    },
    {
      type: 'confirm',
      name: 'runAccessibility',
      message: 'Include automated accessibility testing?',
      default: false
    },
    {
      type: 'confirm',
      name: 'includeCode',
      message: 'Include code suggestions in analysis?',
      default: false
    },
    {
      type: 'confirm',
      name: 'verbose',
      message: 'Show detailed progress?',
      default: false
    }
  ]);

  // Parse the answers
  const parsedAnswers = {
    ...answers,
    iterations: parseInt(answers.iterations),
    maxTokens: parseInt(answers.maxTokens),
    // Don't need to set nonInteractive here as it's an interactive session
  };

  // Run the feedback loop
  await runFeedbackLoop(parsedAnswers);
}

// Main function
async function main() {
  try {
    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      if (!argv.nonInteractive) {
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
        
        // Optionally save to .env file
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
              await fsPromises.access(envPath);
              const existingContent = await fsPromises.readFile(envPath, 'utf8');
              
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
            
            await fsPromises.writeFile(envPath, envContent);
            console.log(chalk.green('API key saved to .env file.'));
          } catch (error) {
            console.log(chalk.red(`Error saving API key: ${error.message}`));
          }
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
    
    // Check if we need to run in interactive mode (when no URL is provided or non-interactive is false)
    if (!argv.url && !argv.nonInteractive) {
      await runInteractiveFeedbackLoop();
    } else if (argv.url) {
      // Run non-interactive mode with provided arguments
      await runFeedbackLoop({
        url: argv.url,
        description: argv.description,
        iterations: argv.iterations,
        devices: argv.viewports,
        browsers: argv.browsers,
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
    } else {
      console.error(chalk.red('Error: URL is required in non-interactive mode'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (argv.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

// If this script is run directly
if (require.main === module) {
  main();
}

module.exports = {
  runFeedbackLoop,
  runInteractiveFeedbackLoop
}; 