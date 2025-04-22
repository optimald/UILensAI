#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const { getStoragePath, cleanupOldFiles } = require('../storage');

const spinner = ora();

/**
 * Kills any process running on port 8080
 * 
 * @returns {Promise<boolean>} True if a process was killed, false otherwise
 */
async function killPort8080() {
  return new Promise((resolve) => {
    spinner.start('Checking for processes on port 8080...');
    
    const kill = spawn('npx', ['kill-port', '8080']);
    
    kill.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('killed')) {
        spinner.succeed('Process on port 8080 killed');
        resolve(true);
      } else if (output.includes('Could not kill process')) {
        spinner.info('No process running on port 8080');
        resolve(false);
      }
    });
    
    kill.stderr.on('data', (data) => {
      spinner.fail(`Error killing process on port 8080: ${data.toString().trim()}`);
      resolve(false);
    });
    
    kill.on('error', (err) => {
      spinner.fail(`Failed to execute kill-port: ${err.message}`);
      resolve(false);
    });
    
    kill.on('close', (code) => {
      if (code !== 0 && code !== null) {
        spinner.fail(`kill-port exited with code ${code}`);
        resolve(false);
      }
    });
  });
}

/**
 * Completely empties the storage directory (screenshots and temp files)
 * 
 * @returns {Promise<void>}
 */
async function clearStorageDirectory() {
  spinner.start('Clearing storage directory...');
  
  try {
    const storagePath = getStoragePath();
    const screenshotsDir = path.join(storagePath, 'screenshots');
    
    try {
      await fs.rm(screenshotsDir, { recursive: true, force: true });
      await fs.mkdir(screenshotsDir, { recursive: true });
      spinner.succeed(`Cleared screenshots directory: ${screenshotsDir}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        spinner.warn(`Error clearing screenshots directory: ${err.message}`);
      } else {
        // Directory doesn't exist, create it
        await fs.mkdir(screenshotsDir, { recursive: true });
        spinner.succeed(`Created screenshots directory: ${screenshotsDir}`);
      }
    }
  } catch (err) {
    spinner.fail(`Failed to clear storage directory: ${err.message}`);
  }
}

/**
 * Clears the reports directory
 * 
 * @returns {Promise<void>}
 */
async function clearReportsDirectory() {
  spinner.start('Clearing reports directory...');
  
  try {
    const reportsDir = './reports';
    
    try {
      // Read all subdirectories in reports
      const reportSubdirs = await fs.readdir(reportsDir);
      
      for (const subdir of reportSubdirs) {
        const subdirPath = path.join(reportsDir, subdir);
        const stats = await fs.stat(subdirPath);
        
        if (stats.isDirectory()) {
          // Remove all files in the subdirectory
          await fs.rm(subdirPath, { recursive: true, force: true });
          // Recreate the subdirectory
          await fs.mkdir(subdirPath, { recursive: true });
        }
      }
      
      spinner.succeed(`Cleared reports directory: ${reportsDir}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        spinner.warn(`Error clearing reports directory: ${err.message}`);
      } else {
        // Directory doesn't exist, create it
        await fs.mkdir(reportsDir, { recursive: true });
        spinner.succeed(`Created reports directory: ${reportsDir}`);
      }
    }
  } catch (err) {
    spinner.fail(`Failed to clear reports directory: ${err.message}`);
  }
}

/**
 * Runs a full cleanup of all UILensAI data
 */
async function fullCleanup() {
  console.log(chalk.blue.bold('UILensAI - Cleanup Utility'));
  console.log(chalk.gray('This utility will clean up all temporary files and previous analysis runs.\n'));
  
  // Kill any process on port 8080
  await killPort8080();
  
  // Clear storage directory
  await clearStorageDirectory();
  
  // Clear reports directory
  await clearReportsDirectory();
  
  console.log(chalk.green.bold('\n✓ Cleanup complete!'));
  console.log('All previous analysis runs have been cleared.');
  console.log('You can now start a fresh analysis with:');
  console.log(chalk.cyan('npm run analyze-ui -- --url <your-url>'));
}

// If this script is run directly
if (require.main === module) {
  fullCleanup().catch(err => {
    console.error(chalk.red(`Error during cleanup: ${err.message}`));
    process.exit(1);
  });
}

module.exports = {
  killPort8080,
  clearStorageDirectory,
  clearReportsDirectory,
  fullCleanup
}; 