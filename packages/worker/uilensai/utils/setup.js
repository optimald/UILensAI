
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const chalk = require('chalk');

// Create readline interface for prompting
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt the user for input with a question
 * 
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The user's answer
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Required environment variables and their descriptions
 */
const REQUIRED_ENV = {
  ANTHROPIC_API_KEY: {
    description: 'Claude API key for AI analysis',
    help: 'Get it from https://console.anthropic.com/'
  },
  STORAGE_RETENTION_DAYS: {
    description: 'Number of days to keep screenshots and reports',
    default: '7'
  },
  STORAGE_PATH: {
    description: 'Path to store screenshots and reports',
    default: './storage'
  }
};

// NOTE: Vercel API_ENV config removed — this is a standalone npm package.

/**
 * Check if a value is valid
 * 
 * @param {string} key - The environment variable key
 * @param {string} value - The value to check
 * @returns {boolean} - Whether the value is valid
 */
function isValidValue(key, value) {
  if (!value) {return false;}
  
  switch (key) {
    case 'ANTHROPIC_API_KEY':
      return value.length > 0;
    case 'STORAGE_RETENTION_DAYS':
      return !isNaN(parseInt(value)) && parseInt(value) > 0;
    case 'STORAGE_PATH':
      return value.length > 0;
    default:
      return true;
  }
}

/**
 * Create or update .env file with environment variables
 * 
 * @param {Object} values - Object containing environment variable values
 * @param {string} envPath - Path to .env file
 * @returns {Promise<void>}
 */
async function updateEnvFile(values, envPath) {
  let envContent = '';
  let existingContent = '';
  
  try {
    existingContent = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    // File doesn't exist, which is expected
  }
  
  // Process each required environment variable
  for (const [key, config] of Object.entries(REQUIRED_ENV)) {
    const value = values[key];
    const regex = new RegExp(`${key}=.*`);
    
    if (existingContent && regex.test(existingContent)) {
      // Replace existing value
      existingContent = existingContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new value
      envContent += `\n# ${config.description}\n${key}=${value}\n`;
    }
  }
  
  // Combine existing and new content
  const finalContent = existingContent + envContent;
  
  // Write to .env file
  await fs.writeFile(envPath, finalContent.trim() + '\n');
}

/**
 * Setup environment variables
 * 
 * @param {boolean} interactive - Whether to run in interactive mode
 * @returns {Promise<void>}
 */
async function setup(interactive = true) {
  console.log(chalk.blue.bold('UILensAI - Setup'));
  console.log(chalk.gray('This script will help you set up the necessary environment variables.\n'));
  
  const envPath = path.join(process.cwd(), '.env');
  const values = {};
  
  // Check existing .env file
  const existingEnv = {};
  try {
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value) {
        existingEnv[key.trim()] = value.trim();
      }
    }
  } catch (error) {
    // File doesn't exist, which is expected
  }
  
  // Process each required environment variable
  for (const [key, config] of Object.entries(REQUIRED_ENV)) {
    const existingValue = existingEnv[key];
    
    if (existingValue && isValidValue(key, existingValue)) {
      values[key] = existingValue;
      console.log(chalk.green(`✓ ${key} is already set`));
    } else if (interactive) {
      console.log(chalk.cyan(`\n${config.description}`));
      if (config.help) {
        console.log(chalk.gray(config.help));
      }
      
      const value = await prompt(chalk.green(`Enter ${key}${config.default ? ` (default: ${config.default})` : ''}: `));
      values[key] = value || config.default;
    } else {
      console.log(chalk.red(`✗ ${key} is not set`));
      process.exit(1);
    }
  }
  
  // Update .env file
  try {
    await updateEnvFile(values, envPath);
    console.log(chalk.green('\n✓ Environment variables saved to .env file.'));
  } catch (error) {
    console.error(chalk.red('\nError saving environment variables:'), error);
    process.exit(1);
  }
  
  if (interactive) {
    // Additional info
    console.log(chalk.blue('\nSetup complete! You can now use UILensAI.'));
    console.log(chalk.gray('\nTo run the analysis:'));
    console.log(chalk.white('  uilensai https://example.com'));
    console.log(chalk.gray('\nFor local development:'));
    console.log(chalk.white('  uilensai http://localhost:8080'));
  }
  
  if (interactive) {
    rl.close();
  }
}

// Run setup if file is executed directly
if (require.main === module) {
  const interactive = process.argv.includes('--interactive');
  setup(interactive).catch(err => {
    console.error('Setup error:', err);
    process.exit(1);
  });
}

// NOTE: setupAPI() removed — Vercel API layer is deprecated.

module.exports = { setup };