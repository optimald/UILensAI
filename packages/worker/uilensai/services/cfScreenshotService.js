/**
 * Cloudflare Browser Rendering Screenshot Service
 * 
 * Cloud-hosted screenshot capture using Cloudflare's /screenshot REST API.
 * Drop-in alternative to the local Playwright capture pipeline.
 * 
 * Docs: https://developers.cloudflare.com/browser-rendering/rest-api/screenshot-endpoint/
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { getCredentials } = require('./cfBrowserService');

const BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

// Mirror the VIEWPORT_PRESETS from capture/index.js for compatibility
const VIEWPORT_PRESETS = {
    'tiny-mobile': { width: 280, height: 480, isMobile: true, deviceScaleFactor: 2 },
    'narrow-mobile': { width: 320, height: 568, isMobile: true, deviceScaleFactor: 2 },
    mobile: { width: 375, height: 667, isMobile: true, deviceScaleFactor: 3 },
    tablet: { width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2 },
    desktop: { width: 1024, height: 768, isMobile: false, deviceScaleFactor: 1 },
    large: { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
    ultrawide: { width: 2560, height: 1080, isMobile: false, deviceScaleFactor: 1 },
    'super-ultrawide': { width: 5120, height: 1440, isMobile: false, deviceScaleFactor: 1 },
};

/**
 * Capture a single screenshot via the Cloudflare /screenshot endpoint.
 * 
 * @param {string} url - URL to screenshot
 * @param {object} viewport - Viewport configuration { name, width, height, isMobile, deviceScaleFactor }
 * @param {object} [options={}] - Capture options
 * @param {boolean} [options.fullPage=true] - Capture full page height
 * @param {string} [options.selector] - CSS selector to capture a specific element
 * @param {number} [options.timeout=45000] - Page load timeout in ms
 * @param {string} [options.outputDir] - Directory to save screenshot
 * @param {object} [options.httpCredentials] - HTTP auth { username, password }
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<object | null>} Screenshot result matching capture/index.js format
 */
async function captureScreenshot(url, viewport, options = {}) {
    const creds = getCredentials();
    if (!creds) {
        if (options.verbose) {
            console.warn('[CfScreenshot] ⚠️  Skipping: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_BR_API_TOKEN not set');
        }
        return null;
    }

    const { accountId, apiToken } = creds;
    const endpoint = `${BASE_URL}/${accountId}/browser-rendering/screenshot`;
    const verbose = options.verbose ?? false;
    const fullPage = options.fullPage ?? true;
    let timeout = options.timeout ?? 45000;
    
    // Cloudflare Browser Rendering API explicitly caps timeout at 60000ms
    if (timeout > 60000) timeout = 60000;

    // Build API request body
    const body = {
        url,
        viewport: {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor || (viewport.isMobile ? 2 : 1),
        },
        screenshotOptions: {
            fullPage,
            type: 'png',
        },
        gotoOptions: {
            waitUntil: 'networkidle0',
            timeout,
        },
    };

    // Add selector if specified
    if (options.selector) {
        body.selector = options.selector;
    }

    // Add HTTP auth if specified
    if (options.httpCredentials) {
        body.authenticate = {
            username: options.httpCredentials.username,
            password: options.httpCredentials.password,
        };
    }

    if (verbose) {
        console.log(`[CfScreenshot] 📸 Capturing ${viewport.name} (${viewport.width}x${viewport.height}) fullPage=${fullPage}`);
    }

    const captureTimestamp = new Date().toISOString();

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        // The /screenshot endpoint returns the raw image binary on success
        if (!response.ok) {
            // Error responses are JSON
            let errorMsg;
            try {
                const errorData = await response.json();
                errorMsg = errorData.errors?.[0]?.message || `HTTP ${response.status}`;
            } catch {
                errorMsg = `HTTP ${response.status}`;
            }
            console.error(`[CfScreenshot] ❌ Screenshot failed for ${viewport.name}: ${errorMsg}`);
            return {
                viewport: viewport.name,
                filename: null,
                path: null,
                timestamp: captureTimestamp,
                metadata: { width: viewport.width, height: viewport.height, fileSize: 0, format: 'error', coverage: 0 },
                error: errorMsg,
            };
        }

        // Read the binary PNG response
        const arrayBuffer = await response.arrayBuffer();
        const screenshotBuffer = Buffer.from(arrayBuffer);

        if (screenshotBuffer.length === 0) {
            console.error(`[CfScreenshot] ❌ Empty screenshot buffer for ${viewport.name}`);
            return null;
        }

        // Determine output path
        const outputDir = options.outputDir || path.join(process.cwd(), 'storage', 'screenshots', uuidv4().substring(0, 8));
        await fsPromises.mkdir(outputDir, { recursive: true });

        const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
        let filename = `${domain}-viewport-${viewport.name}`;
        if (options.selector) {
            filename += `-${options.selector.replace(/[^\w-]/g, '-')}`;
        }
        filename += '.png';

        const fullPath = path.join(outputDir, filename);
        await fsPromises.writeFile(fullPath, screenshotBuffer);
        const stats = await fsPromises.stat(fullPath);

        if (verbose) {
            console.log(`[CfScreenshot] ✅ ${viewport.name}: exact buffer length = ${screenshotBuffer.length} bytes, file size = ${stats.size} bytes. Saved to ${fullPath}`);
            if (screenshotBuffer.length < 1000) {
                console.log(`[CfScreenshot] ⚠️ Buffer very small. Contents: ${screenshotBuffer.toString('utf8').substring(0, 200)}`);
            }
        }

        // Return result matching existing capture/index.js contract
        return {
            viewport: viewport.name,
            filename,
            path: fullPath,
            // Embed the screenshot as a base64 data URI so API callers get
            // renderable image data without needing to read from the local filesystem
            screenshotDataUri: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
            timestamp: captureTimestamp,
            metadata: {
                width: viewport.width,
                height: viewport.height,
                fileSize: stats.size,
                format: 'png',
                coverage: fullPage ? 100 : undefined,
            },
            selectorUsed: options.selector || null,
            wasFullPage: fullPage && !options.selector,
            captureMethod: 'cloudflare', // Distinguish from local Playwright captures
        };

    } catch (error) {
        console.error(`[CfScreenshot] ❌ Network error capturing ${viewport.name}: ${error.message}`);
        return {
            viewport: viewport.name,
            filename: null,
            path: null,
            timestamp: captureTimestamp,
            metadata: { width: viewport.width, height: viewport.height, fileSize: 0, format: 'error', coverage: 0 },
            error: error.message,
        };
    }
}

/**
 * Capture screenshots for multiple viewports using Cloudflare's /screenshot API.
 * Drop-in replacement for capture/index.js captureScreenshots().
 * 
 * @param {object} options - Capture options
 * @param {string} options.url - URL to capture
 * @param {Array<{ name: string, width: number, height: number, isMobile: boolean }>} [options.viewports] - Viewports to capture
 * @param {boolean} [options.fullPage=true] - Capture full page height
 * @param {string} [options.selector] - CSS selector for element capture
 * @param {number} [options.timeout=45000] - Page load timeout
 * @param {string} [options.outputDir] - Output directory
 * @param {object} [options.httpCredentials] - HTTP auth credentials
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @returns {Promise<Array<object>>} Array of screenshot results
 */
async function captureScreenshots(options = {}) {
    const {
        url,
        viewports: viewportNames = ['mobile', 'desktop'],
        fullPage = true,
        selector,
        timeout = 45000,
        outputDir,
        httpCredentials,
        verbose = false,
    } = options;

    if (!url) {
        console.error('[CfScreenshot] ❌ URL is required');
        return [];
    }

    // Check credentials upfront
    const creds = getCredentials();
    if (!creds) {
        console.warn('[CfScreenshot] ⚠️  Cloudflare credentials not configured — cannot capture screenshots');
        return [];
    }

    // Resolve viewport configurations
    const resolvedViewports = viewportNames.map(v => {
        if (typeof v === 'string') {
            return { name: v, ...(VIEWPORT_PRESETS[v] || { width: 1024, height: 768, isMobile: false }) };
        }
        return v; // Already resolved viewport object
    });

    if (verbose) {
        console.log(`[CfScreenshot] 🌐 Capturing ${resolvedViewports.length} viewport(s) via Cloudflare for ${url}`);
    }

    // Generate shared output directory for this run
    const runOutputDir = outputDir || path.join(process.cwd(), 'storage', 'screenshots', `cf-${Date.now()}`);

    // Capture viewports sequentially with delay to respect Cloudflare concurrency limit (~1-2 active sessions)
    const results = [];
    for (const viewport of resolvedViewports) {
        let result = null;
        for (let attempt = 0; attempt <= 3; attempt++) {
            result = await captureScreenshot(url, viewport, {
                fullPage,
                selector,
                timeout,
                outputDir: runOutputDir,
                httpCredentials,
                verbose,
            });
            if (result && result.path) break;
            
            const isRateLimit = result?.error?.includes?.('Rate limit') || result?.error?.includes?.('2001') || result?.error?.includes?.('429');
            if (isRateLimit) {
                const delay = 3000 * (attempt + 1); // 3s, 6s, 9s backoff
                if (verbose) console.log(`[CfScreenshot] Rate limited on ${viewport.name}, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            break; // Non-rate-limit error, don't retry
        }
        
        results.push(result);
        
        // Delay between requests to avoid rate limit edge cases
        if (resolvedViewports.indexOf(viewport) < resolvedViewports.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Filter out failed captures (where path is null or error was returned)
    const successfulResults = results.filter(r => r && r.path);

    if (verbose) {
        const successCount = successfulResults.length;
        const failCount = results.length - successCount;
        console.log(`[CfScreenshot] 📊 Results: ${successCount} succeeded, ${failCount} failed out of ${resolvedViewports.length}`);
    }

    return successfulResults;
}

module.exports = {
    captureScreenshot,
    captureScreenshots,
    VIEWPORT_PRESETS,
};
