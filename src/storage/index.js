const path = require('path');
const fs = require('fs').promises;
const { subDays, parseISO } = require('date-fns');

/**
 * Gets the configured storage path from environment variables
 * or falls back to default path
 * 
 * @param {string} [type=''] - The type of storage (screenshots, reports)
 * @returns {string} The storage path
 */
function getStoragePath(type = '') {
  const basePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
  
  // If a specific type is requested, append it to the base path
  if (type) {
    const typePath = path.join(basePath, type);
    
    // Ensure the directory exists
    fs.mkdir(typePath, { recursive: true }).catch(err => {
      console.error(`Error creating ${type} directory:`, err);
    });
    
    return typePath;
  }
  
  return basePath;
}

/**
 * Gets the configured retention period in days from environment variables
 * or falls back to default (7 days)
 * 
 * @returns {number} Retention period in days
 */
function getRetentionDays() {
  return parseInt(process.env.STORAGE_RETENTION_DAYS || '7', 10);
}

/**
 * Cleans up old files based on the configured retention period
 * 
 * @param {boolean} verbose - Whether to show verbose logs
 * @returns {Promise<void>}
 */
async function cleanupOldFiles(verbose = false) {
  const storagePath = getStoragePath();
  const retentionDays = getRetentionDays();
  const cutoffDate = subDays(new Date(), retentionDays);
  
  if (verbose) {
    console.log(`Cleaning up files older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);
  }
  
  try {
    // Ensure storage directory exists
    await fs.mkdir(storagePath, { recursive: true });
    
    // Check the screenshots directory
    const screenshotsDir = path.join(storagePath, 'screenshots');
    try {
      await fs.mkdir(screenshotsDir, { recursive: true });
      
      // Get all domain directories
      const domainDirs = await fs.readdir(screenshotsDir);
      
      for (const domain of domainDirs) {
        const domainPath = path.join(screenshotsDir, domain);
        const stats = await fs.stat(domainPath);
        
        if (stats.isDirectory()) {
          // Get all timestamp directories
          const timestampDirs = await fs.readdir(domainPath);
          
          for (const timestamp of timestampDirs) {
            // Parse timestamp from directory name (format: yyyyMMdd-HHmmss)
            try {
              const dirDate = parseISO(`${timestamp.substr(0, 8)}T${timestamp.substr(9, 2)}:${timestamp.substr(11, 2)}:${timestamp.substr(13, 2)}`);
              
              // Delete if older than retention period
              if (dirDate < cutoffDate) {
                const dirToDelete = path.join(domainPath, timestamp);
                if (verbose) {
                  console.log(`Deleting old directory: ${dirToDelete}`);
                }
                await fs.rm(dirToDelete, { recursive: true, force: true });
              }
            } catch (err) {
              if (verbose) {
                console.error(`Error parsing timestamp for directory ${timestamp}:`, err);
              }
            }
          }
          
          // Remove empty domain directories
          const remainingTimestamps = await fs.readdir(domainPath);
          if (remainingTimestamps.length === 0) {
            if (verbose) {
              console.log(`Removing empty domain directory: ${domainPath}`);
            }
            await fs.rmdir(domainPath);
          }
        }
      }
    } catch (err) {
      // Screenshots directory might not exist yet, which is fine
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
    // Do the same for reports directory
    const reportsDir = path.join(storagePath, 'reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
      const reportFiles = await fs.readdir(reportsDir);
      
      for (const file of reportFiles) {
        const filePath = path.join(reportsDir, file);
        const stats = await fs.stat(filePath);
        
        // Check if file is older than retention period
        if (stats.mtime < cutoffDate) {
          if (verbose) {
            console.log(`Deleting old report: ${filePath}`);
          }
          await fs.unlink(filePath);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
  } catch (err) {
    console.error('Error cleaning up old files:', err);
  }
}

module.exports = {
  getStoragePath,
  getRetentionDays,
  cleanupOldFiles
}; 