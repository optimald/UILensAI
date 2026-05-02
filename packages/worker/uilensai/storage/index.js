const path = require('path');
const fs = require('fs').promises;

// Helper function to subtract days from a date (equivalent to date-fns subDays)
function subDaysJS(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() - amount);
  return result;
}

/**
 * Gets the configured storage path from environment variables
 * or falls back to default path
 * * @param {string} [type=''] - The type of storage (screenshots, reports)
 * @returns {string} The storage path
 */
function getStoragePath(type = '') {
  // In Fly.io worker environment, use /tmp for temporary storage
  const basePath = process.env.STORAGE_PATH || '/tmp/uilensai-storage';
  
  // If a specific type is requested, append it to the base path
  if (type) {
    const typePath = path.join(basePath, type);
    
    // Ensure the directory exists
    // fs.mkdir is async, and we don't strictly need to wait for it here
    // as subsequent operations will likely handle it or fail gracefully.
    // For critical paths, one might await this.
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
 * * @returns {number} Retention period in days
 */
function getRetentionDays() {
  return parseInt(process.env.STORAGE_RETENTION_DAYS || '7', 10);
}

/**
 * Cleans up old files based on the configured retention period
 * * @param {boolean} verbose - Whether to show verbose logs
 * @returns {Promise<void>}
 */
async function cleanupOldFiles(verbose = false) {
  const storagePath = getStoragePath();
  const retentionDays = getRetentionDays();
  const cutoffDate = subDaysJS(new Date(), retentionDays); // Use subDaysJS
  
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
            // timestamp is expected to be in 'yyyyMMdd-HHmmss' format
            // Construct an ISO-like string "YYYYMMDDTHH:MM:SS" for robust parsing
            const isoLikeTimestamp = `${timestamp.substring(0, 8)}T${timestamp.substring(9, 11)}:${timestamp.substring(11, 13)}:${timestamp.substring(13, 15)}`;
            try {
              const dirDate = new Date(isoLikeTimestamp); // Use new Date()
              
              // Delete if older than retention period
              if (!isNaN(dirDate.getTime()) && dirDate < cutoffDate) {
                const dirToDelete = path.join(domainPath, timestamp);
                if (verbose) {
                  console.log(`Deleting old directory: ${dirToDelete}`);
                }
                await fs.rm(dirToDelete, { recursive: true, force: true });
              } else if (isNaN(dirDate.getTime()) && verbose) {
                 console.warn(`Could not parse date from directory name: ${timestamp} (Formatted as: ${isoLikeTimestamp})`);
              }
            } catch (err) {
              if (verbose) {
                console.error(`Error processing directory ${timestamp}:`, err);
              }
            }
          }
          
          // Remove empty domain directories
          try {
            const remainingTimestamps = await fs.readdir(domainPath);
            if (remainingTimestamps.length === 0) {
              if (verbose) {
                console.log(`Removing empty domain directory: ${domainPath}`);
              }
              await fs.rmdir(domainPath);
            }
          } catch (emptyDirError) {
            // If readdir fails, the directory might have been deleted by a parallel process, or other issue.
            if (verbose) {console.warn(`Could not check/remove empty domain directory ${domainPath}: ${emptyDirError.message}`);}
          }
        }
      }
    } catch (err) {
      // Screenshots directory might not exist yet, which is fine
      if (err.code !== 'ENOENT' && verbose) {
        console.warn(`Warning processing screenshots directory: ${err.message}`);
      }
    }
    
    // Do the same for reports directory
    const reportsDir = path.join(storagePath, 'reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
      const reportFiles = await fs.readdir(reportsDir);
      
      for (const file of reportFiles) {
        const filePath = path.join(reportsDir, file);
        try {
          const stats = await fs.stat(filePath);
          
          // Check if file is older than retention period
          if (stats.mtime < cutoffDate) {
            if (verbose) {
              console.log(`Deleting old report: ${filePath}`);
            }
            await fs.unlink(filePath);
          }
        } catch (statError) {
          if (verbose) {console.warn(`Could not stat file ${filePath} for cleanup: ${statError.message}`);}
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && verbose) {
         console.warn(`Warning processing reports directory: ${err.message}`);
      }
    }
    
  } catch (err) {
    // This catch is for errors like fs.mkdir(storagePath) failing or other top-level issues.
    console.error('Error cleaning up old files:', err);
  }
}

/**
 * Starts a scheduled cleanup task that runs daily
 * * @param {boolean} verbose - Whether to show verbose logs
 * @returns {NodeJS.Timeout} The interval ID
 */
function startScheduledCleanup(verbose = false) {
  // Run cleanup immediately
  cleanupOldFiles(verbose);
  
  // Then run daily
  return setInterval(() => {
    cleanupOldFiles(verbose);
  }, 24 * 60 * 60 * 1000); // 24 hours
}

/**
 * Stops the scheduled cleanup task
 * * @param {NodeJS.Timeout} intervalId - The interval ID from startScheduledCleanup
 */
function stopScheduledCleanup(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

module.exports = {
  getStoragePath,
  getRetentionDays,
  cleanupOldFiles,
  startScheduledCleanup,
  stopScheduledCleanup
};