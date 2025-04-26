#!/usr/bin/env node

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
 * Create a .env file with user provided Claude API key
 */
async function setup() {
  console.log(chalk.blue.bold('UILensAI - Setup'));
  console.log(chalk.gray('This script will help you set up the necessary environment variables.\n'));
  
  // Check if .env already exists
  const envPath = path.join(process.cwd(), '.env');
  let envExists = false;
  
  try {
    await fs.access(envPath);
    envExists = true;
    console.log(chalk.yellow('A .env file already exists. This will update or add the ANTHROPIC_API_KEY.'));
  } catch (error) {
    // File doesn't exist, which is expected
  }
  
  // Prompt for Claude API key
  console.log(chalk.cyan('\nYou need a Claude 3.7 API key to use this tool.'));
  console.log(chalk.gray('If you don\'t have one, you can get it from https://console.anthropic.com/\n'));
  
  const apiKey = await prompt(chalk.green('Enter your Claude API key: '));
  
  if (!apiKey) {
    console.log(chalk.red('\nNo API key provided. Setup canceled.'));
    rl.close();
    return;
  }
  
  // Create or update .env file
  let envContent = '';
  
  if (envExists) {
    // Read existing .env file
    try {
      const existingContent = await fs.readFile(envPath, 'utf8');
      
      // Check if ANTHROPIC_API_KEY already exists
      const regex = /ANTHROPIC_API_KEY=.*/;
      if (regex.test(existingContent)) {
        // Replace existing key
        envContent = existingContent.replace(regex, `ANTHROPIC_API_KEY=${apiKey}`);
      } else {
        // Add new key
        envContent = existingContent.trim() + `\n\n# Claude API Key\nANTHROPIC_API_KEY=${apiKey}\n`;
      }
    } catch (error) {
      console.error('Error reading existing .env file:', error);
      envExists = false;
    }
  }
  
  if (!envExists) {
    // Create new .env file
    envContent = `# Claude API Key
ANTHROPIC_API_KEY=${apiKey}

# Storage retention (in days)
STORAGE_RETENTION_DAYS=7

# Path to store screenshots and reports
STORAGE_PATH=./storage
`;
  }
  
  // Write to .env file
  try {
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('\n✓ API key saved to .env file.'));
  } catch (error) {
    console.error(chalk.red('\nError saving API key:'), error);
  }
  
  // Additional info
  console.log(chalk.blue('\nSetup complete! You can now use UILensAI.'));
  console.log(chalk.gray('\nTo run the analysis:'));
  console.log(chalk.white('  npm run ui -- --url https://example.com'));
  console.log(chalk.gray('\nFor local development:'));
  console.log(chalk.white('  npm run ui -- --url http://localhost:8080'));
  
  rl.close();
}

// Run setup if file is executed directly
if (require.main === module) {
  setup().catch(err => {
    console.error('Setup error:', err);
    process.exit(1);
  });
}

module.exports = { setup }; 