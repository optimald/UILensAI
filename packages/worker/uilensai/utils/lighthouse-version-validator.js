/**
 * Lighthouse Version Validator
 * Ensures consistent Lighthouse versions across CLI and MCP environments
 * 
 * CRITICAL FIX: Part of remediation for Lighthouse version discrepancies
 * CLI was using 12.6.1 while MCP was using 11.7.1, causing performance metric inconsistencies
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Expected Lighthouse version for consistency
const EXPECTED_LIGHTHOUSE_VERSION = '12.6.1';

class LighthouseVersionValidator {
  /**
   * Validate that the current Lighthouse version matches expected version
   * @param {boolean} verbose - Enable verbose logging
   * @returns {Promise<Object>} - Validation result with version info
   */
  static async validateVersion(verbose = false) {
    try {
      // Method 1: Check via CLI
      const cliVersion = await this.getLighthouseVersionFromCLI();
      
      // Method 2: Check via package.json
      const packageVersion = await this.getLighthouseVersionFromPackage();
      
      // Method 3: Check via require (runtime)
      const runtimeVersion = await this.getLighthouseVersionFromRuntime();
      
      const result = {
        expected: EXPECTED_LIGHTHOUSE_VERSION,
        cli: cliVersion,
        package: packageVersion,
        runtime: runtimeVersion,
        isConsistent: this.areVersionsConsistent(cliVersion, packageVersion, runtimeVersion),
        recommendations: []
      };
      
      if (!result.isConsistent) {
        result.recommendations = this.getVersionMismatchRecommendations(result);
      }
      
      if (verbose) {
        console.log('[LighthouseVersionValidator] Version validation result:', result);
      }
      
      return result;
      
    } catch (error) {
      console.error('[LighthouseVersionValidator] Version validation failed:', error.message);
      return {
        expected: EXPECTED_LIGHTHOUSE_VERSION,
        cli: 'error',
        package: 'error',
        runtime: 'error',
        isConsistent: false,
        error: error.message,
        recommendations: ['Check Lighthouse installation and dependencies']
      };
    }
  }
  
  /**
   * Get Lighthouse version from CLI
   * @returns {Promise<string>} - Version string
   */
  static async getLighthouseVersionFromCLI() {
    return new Promise((resolve, reject) => {
      const process = spawn('lighthouse', ['--version'], { stdio: 'pipe' });
      let output = '';
      let error = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          // Extract version number from output
          const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
          resolve(versionMatch ? versionMatch[1] : 'unknown');
        } else {
          reject(new Error(`CLI version check failed: ${error}`));
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error('CLI version check timed out'));
      }, 10000);
    });
  }
  
  /**
   * Get Lighthouse version from package.json
   * @returns {Promise<string>} - Version string
   */
  static async getLighthouseVersionFromPackage() {
    try {
      const packagePath = require.resolve('lighthouse/package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version || 'unknown';
    } catch (error) {
      return 'not-found';
    }
  }
  
  /**
   * Get Lighthouse version from runtime require
   * @returns {Promise<string>} - Version string
   */
  static async getLighthouseVersionFromRuntime() {
    try {
      const lighthouse = require('lighthouse');
      const packageJson = require('lighthouse/package.json');
      return packageJson.version || 'unknown';
    } catch (error) {
      return 'not-available';
    }
  }
  
  /**
   * Check if versions are consistent
   * @param {string} cliVersion - CLI version
   * @param {string} packageVersion - Package version
   * @param {string} runtimeVersion - Runtime version
   * @returns {boolean} - Whether versions are consistent
   */
  static areVersionsConsistent(cliVersion, packageVersion, runtimeVersion) {
    const versions = [cliVersion, packageVersion, runtimeVersion].filter(v => 
      v && v !== 'unknown' && v !== 'error' && v !== 'not-found' && v !== 'not-available'
    );
    
    if (versions.length === 0) {
      return false;
    }
    
    // Check if all versions are the same
    const uniqueVersions = [...new Set(versions)];
    return uniqueVersions.length === 1;
  }
  
  /**
   * Get recommendations for version mismatches
   * @param {Object} result - Validation result
   * @returns {Array<string>} - Recommendations
   */
  static getVersionMismatchRecommendations(result) {
    const recommendations = [];
    
    if (result.cli === 'error') {
      recommendations.push('Install Lighthouse CLI globally: npm install -g lighthouse');
    }
    
    if (result.package === 'not-found') {
      recommendations.push('Install Lighthouse package: npm install lighthouse');
    }
    
    if (result.runtime === 'not-available') {
      recommendations.push('Ensure Lighthouse is properly installed in node_modules');
    }
    
    if (result.cli !== result.package && result.cli !== 'error' && result.package !== 'not-found') {
      recommendations.push('Update CLI and package to same version');
    }
    
    recommendations.push(`Target version: ${EXPECTED_LIGHTHOUSE_VERSION}`);
    
    return recommendations;
  }
}

module.exports = LighthouseVersionValidator;
