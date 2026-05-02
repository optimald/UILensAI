const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

function getViewportDimensions(viewportName) {
    const presets = {
        'tiny-mobile': { name: 'tiny-mobile', width: 320, height: 480, isMobile: true },
        'narrow-mobile': { name: 'narrow-mobile', width: 360, height: 640, isMobile: true },
        mobile: { name: 'mobile', width: 375, height: 667, isMobile: true },
        'large-mobile': { name: 'large-mobile', width: 414, height: 896, isMobile: true },
        tablet: { name: 'tablet', width: 768, height: 1024, isMobile: true },
        'large-tablet': { name: 'large-tablet', width: 1024, height: 1366, isMobile: true },
        desktop: { name: 'desktop', width: 1366, height: 768, isMobile: false },
        large: { name: 'large', width: 1920, height: 1080, isMobile: false },
        ultrawide: { name: 'ultrawide', width: 2560, height: 1080, isMobile: false },
        'super-ultrawide': { name: 'super-ultrawide', width: 3840, height: 1080, isMobile: false }
    };
    return presets[viewportName] || { name: viewportName, width: 1366, height: 768, isMobile: false };
}

// --- Core Analysis Functions ---


async function getFileSize(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return stats.size;
    } catch (error) {
        console.warn(`[UI Module] Could not get file size for ${filePath}: ${error.message}`);
        return 0;
    }
}


function getViewportFromPath(screenshotPath) {
    // Extract viewport name from screenshot filename
    // Expected format: domain-viewport-viewportname.png
    const filename = path.basename(screenshotPath, path.extname(screenshotPath));
    const parts = filename.split('-viewport-');
    if (parts.length >= 2) {
        return parts[1].split('-')[0]; // Get the viewport name part
    }

    // Fallback: look for common viewport names in the path
    const commonViewports = ['mobile', 'desktop', 'tablet', 'ultrawide', 'super-ultrawide', 'narrow-mobile', 'tiny-mobile'];
    for (const viewport of commonViewports) {
        if (screenshotPath.includes(viewport)) {
            return viewport;
        }
    }

    return 'unknown';
}

// Helper function to get image dimensions

async function getImageDimensions(imagePath) {
    try {
        const metadata = await sharp(imagePath).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0
        };
    } catch (error) {
        console.warn(`[UI Module] Could not get image dimensions for ${imagePath}: ${error.message}`);
        return { width: 0, height: 0 };
    }
}

/**
 * Generates issues for static interactive elements analysis
 */

module.exports = {
  getViewportDimensions,
  getFileSize,
  getViewportFromPath,
  getImageDimensions
};
