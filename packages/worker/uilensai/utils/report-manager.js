/**
 * Report Manager Utility
 * 
 * Utilities for managing UILensAI report files with the new chronological naming convention
 * and centralized storage in storage/reports/
 */

const fs = require('fs').promises;
const path = require('path');

const { getStoragePath } = require('../storage');

/**
 * Generate a chronologically sortable filename
 * Format: YYYY-MM-DD_HH-MM-SS-sssZ_domain_shortId.json
 * 
 * @param {string} url - The analyzed URL
 * @param {string} shortId - Short identifier (first 8 chars of UUID)
 * @param {Date} [timestamp] - Timestamp to use (defaults to now)
 * @returns {string} Generated filename
 */
function generateReportFilename(url, shortId, timestamp = new Date()) {
    // Extract domain from URL and sanitize
    const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9]/g, '-');
    
    // Format timestamp as ISO with replacements for filesystem compatibility
    const isoString = timestamp.toISOString();
    const formattedTimestamp = isoString.replace(/[:.]/g, '-').replace('T', '_');
    
    return `${formattedTimestamp}_${domain}_${shortId}.json`;
}

/**
 * Get the reports directory path
 * 
 * @returns {string} Path to reports directory
 */
function getReportsDirectory() {
    return getStoragePath('reports');
}

/**
 * Save a report to the storage directory with proper naming
 * 
 * @param {Object} reportData - The report data to save
 * @param {string} url - The analyzed URL
 * @param {string} shortId - Short identifier
 * @param {Object} [options] - Options
 * @param {Date} [options.timestamp] - Timestamp to use
 * @param {boolean} [options.verbose] - Verbose logging
 * @returns {Promise<string>} Path to the saved file
 */
async function saveReport(reportData, url, shortId, options = {}) {
    const { timestamp = new Date(), verbose = false } = options;
    
    // Generate filename and path
    const filename = generateReportFilename(url, shortId, timestamp);
    const reportsDir = getReportsDirectory();
    const filePath = path.join(reportsDir, filename);
    
    // Ensure directory exists
    await fs.mkdir(reportsDir, { recursive: true });
    
    // Save the report
    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf8');
    
    if (verbose) {
        console.log(`✅ Report saved: ${filename}`);
    }
    
    return filePath;
}

/**
 * List all reports in chronological order (newest first)
 * 
 * @param {Object} [options] - Options
 * @param {number} [options.limit] - Maximum number of reports to return
 * @param {string} [options.domain] - Filter by domain
 * @returns {Promise<Array>} Array of report info objects
 */
async function listReports(options = {}) {
    const { limit, domain } = options;
    const reportsDir = getReportsDirectory();
    
    try {
        const files = await fs.readdir(reportsDir);
        
        // Filter for JSON files with the new naming pattern
        let reportFiles = files.filter(file => {
            if (!file.endsWith('.json') || file === '.gitkeep') {return false;}
            
            // Match the new naming pattern
            const pattern = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+)_([a-f0-9]{8})\.json$/;
            const match = file.match(pattern);
            
            if (!match) {return false;}
            
            // Filter by domain if specified
            if (domain) {
                const fileDomain = match[2];
                return fileDomain.includes(domain.replace(/[^a-zA-Z0-9]/g, '-'));
            }
            
            return true;
        });
        
        // Sort by filename (which sorts chronologically due to ISO format)
        reportFiles.sort().reverse(); // Newest first
        
        // Apply limit if specified
        if (limit && limit > 0) {
            reportFiles = reportFiles.slice(0, limit);
        }
        
        // Parse file info
        const reports = reportFiles.map(file => {
            const pattern = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+)_([a-f0-9]{8})\.json$/;
            const match = file.match(pattern);
            
            if (!match) {return null;}
            
            const [, timestampStr, domainStr, shortId] = match;
            
            // Parse timestamp - convert from YYYY-MM-DD_HH-MM-SS-sssZ back to ISO
            const isoTimestamp = timestampStr
                .replace('_', 'T')                    // Replace underscore with T
                .replace(/-(\d{2})-(\d{3})Z$/, ':$1.$2Z')  // Replace final -SS-sssZ with :SS.sssZ
                .replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})/, '$1:$2'); // Replace first -MM with :MM
            const timestamp = new Date(isoTimestamp);
            
            return {
                filename: file,
                path: path.join(reportsDir, file),
                timestamp,
                domain: domainStr.replace(/-/g, '.'),
                shortId,
                timestampStr
            };
        }).filter(Boolean);
        
        return reports;
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // Directory doesn't exist yet
        }
        throw error;
    }
}

/**
 * Load a specific report by filename or shortId
 * 
 * @param {string} identifier - Filename or shortId
 * @returns {Promise<Object|null>} Report data or null if not found
 */
async function loadReport(identifier) {
    const reportsDir = getReportsDirectory();
    
    let filePath;
    
    if (identifier.endsWith('.json')) {
        // Full filename provided
        filePath = path.join(reportsDir, identifier);
    } else {
        // Try to find by shortId
        const reports = await listReports();
        const report = reports.find(r => r.shortId === identifier);
        
        if (!report) {
            return null;
        }
        
        filePath = report.path;
    }
    
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

/**
 * Clean up old reports based on retention policy
 * 
 * @param {Object} [options] - Options
 * @param {number} [options.maxDays] - Maximum age in days (default: 30)
 * @param {number} [options.maxCount] - Maximum number of reports to keep
 * @param {boolean} [options.dryRun] - Only show what would be deleted
 * @param {boolean} [options.verbose] - Verbose logging
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupOldReports(options = {}) {
    const { maxDays = 30, maxCount, dryRun = false, verbose = false } = options;
    
    const reports = await listReports();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (maxDays * 24 * 60 * 60 * 1000));
    
    let toDelete = [];
    
    // Filter by age
    if (maxDays > 0) {
        const oldReports = reports.filter(report => report.timestamp < cutoffDate);
        toDelete = toDelete.concat(oldReports);
    }
    
    // Filter by count (keep only newest maxCount reports)
    if (maxCount > 0 && reports.length > maxCount) {
        const excessReports = reports.slice(maxCount);
        toDelete = toDelete.concat(excessReports);
    }
    
    // Remove duplicates
    toDelete = toDelete.filter((report, index, self) => 
        self.findIndex(r => r.filename === report.filename) === index
    );
    
    if (verbose) {
        console.log(`📊 Cleanup Analysis:`);
        console.log(`Total reports: ${reports.length}`);
        console.log(`Reports to delete: ${toDelete.length}`);
        if (maxDays > 0) {console.log(`Age cutoff: ${cutoffDate.toISOString()}`);}
        if (maxCount > 0) {console.log(`Count limit: ${maxCount}`);}
    }
    
    let deletedCount = 0;
    const errors = [];
    
    if (!dryRun && toDelete.length > 0) {
        for (const report of toDelete) {
            try {
                await fs.unlink(report.path);
                deletedCount++;
                
                if (verbose) {
                    console.log(`🗑️ Deleted: ${report.filename}`);
                }
            } catch (error) {
                errors.push({ file: report.filename, error: error.message });
                
                if (verbose) {
                    console.error(`❌ Failed to delete ${report.filename}: ${error.message}`);
                }
            }
        }
    }
    
    return {
        totalReports: reports.length,
        candidatesForDeletion: toDelete.length,
        deleted: deletedCount,
        errors,
        dryRun
    };
}

module.exports = {
    generateReportFilename,
    getReportsDirectory,
    saveReport,
    listReports,
    loadReport,
    cleanupOldReports
}; 