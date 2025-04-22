const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { format } = require('date-fns');
const { getStoragePath } = require('../storage');

// Define standard viewport sizes
const VIEWPORT_PRESETS = {
  'tiny-mobile': { width: 280, height: 480 },
  'narrow-mobile': { width: 320, height: 568 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1024, height: 768 },
  large: { width: 1440, height: 900 },
  ultrawide: { width: 2560, height: 1080 },
  'super-ultrawide': { width: 5120, height: 1440 }
};

/**
 * Captures screenshots of a webpage at different viewport sizes
 * 
 * @param {Object} options - Options for screenshot capture
 * @param {string} options.url - URL to capture
 * @param {Array<Object>} options.viewports - Array of viewport objects with {width, height, name}
 * @param {boolean} options.fullPage - Whether to capture the full page height
 * @param {string} options.selector - CSS selector to capture specific elements
 * @param {boolean} options.stealth - Whether to use stealth mode to bypass bot detection
 * @param {boolean} options.disableAnimations - Whether to disable animations
 * @param {string} options.cacheDir - Directory for caching screenshots
 * @param {boolean} options.useCache - Whether to use cached screenshots
 * @param {boolean} options.filterScreenshots - Whether to filter screenshots (blur faces, etc)
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @param {function} options.onProgress - Callback for progress updates
 * @param {number} options.timeout - Timeout for page load
 * @param {Object} options.httpCredentials - Basic auth credentials with username and password 
 * @returns {Promise<Array<Object>>} - Array of screenshot results with viewport and path
 */
async function captureScreenshots({ 
  url, 
  viewports, 
  fullPage = true, 
  selector, 
  stealth = false,
  disableAnimations = false,
  cacheDir,
  useCache = true,
  filterScreenshots = true,
  verbose = false,
  onProgress = null,
  timeout = null,
  httpCredentials = null
}) {
  // Create timestamp for this capture session
  const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
  
  // Extract domain for folder naming
  let domain = new URL(url).hostname.replace(/^www\./, '');
  
  // Handle localhost case for local development
  if (domain === 'localhost' || domain.startsWith('127.0.0.1')) {
    domain = 'localhost';
  }
  
  // Create directories if they don't exist
  const baseDir = cacheDir || path.join(getStoragePath(), 'screenshots');
  await fs.mkdir(baseDir, { recursive: true });
  
  if (verbose) {
    console.log(`Capturing screenshots for ${url}`);
    console.log(`Storing in ${baseDir}`);
    if (stealth) {
      console.log('Stealth mode enabled for bot detection bypass');
    }
    if (httpCredentials) {
      console.log(`Using HTTP authentication with username: ${httpCredentials.username}`);
    }
  }
  
  // Report progress
  if (onProgress) {
    onProgress('Initializing browser - 0% complete');
  }
  
  // Get browser options from environment
  const userAgent = process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const pageLoadTimeout = timeout || parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10);
  
  if (verbose) {
    console.log(`Browser options:`);
    console.log(`- User Agent: ${userAgent}`);
    console.log(`- Page Load Timeout: ${pageLoadTimeout}ms`);
    console.log(`- Stealth Mode: ${stealth ? 'Enabled' : 'Disabled'}`);
    console.log(`- Disable Animations: ${disableAnimations ? 'Yes' : 'No'}`);
  }
  
  // Launch browser with appropriate options
  const launchOptions = {};
  
  // Stealth mode browser arguments
  if (stealth) {
    launchOptions.args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list'
    ];
    
    if (verbose) {
      console.log('Initializing browser with stealth mode arguments...');
    }
  }
  
  const browser = await chromium.launch(launchOptions);
  const screenshotResults = [];
  
  try {
    // Configure browser context with stealth options
    const contextOptions = {};
    
    // Add HTTP Basic Authentication if provided
    if (httpCredentials) {
      contextOptions.httpCredentials = {
        username: httpCredentials.username,
        password: httpCredentials.password
      };
      
      if (verbose) {
        console.log('Configuring browser with HTTP authentication...');
      }
    }
    
    if (stealth) {
      // Realistic user agent 
      contextOptions.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      contextOptions.bypassCSP = true;
      contextOptions.javaScriptEnabled = true;
      contextOptions.viewport = null; // Will set separately for each screenshot
      
      // Browser-like headers
      contextOptions.extraHTTPHeaders = {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      };
      
      if (verbose) {
        console.log('Applying stealth mode context options...');
      }
    }
    
    const context = await browser.newContext(contextOptions);
    
    // Apply stealth scripts to hide automation
    if (stealth) {
      if (verbose) {
        console.log('Applying stealth mode scripts...');
      }
      
      await context.addInitScript(() => {
        // Hide automation flags
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        
        // Add fake plugins
        Object.defineProperty(navigator, 'plugins', { 
          get: () => {
            return [
              {
                0: {
                  type: "application/pdf",
                  suffixes: "pdf",
                  description: "Portable Document Format"
                },
                name: "Chrome PDF Plugin",
                filename: "internal-pdf-viewer",
                description: "Portable Document Format",
                length: 1
              }
            ];
          }
        });
        
        // Set consistent languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        
        // Mask WebGL fingerprinting
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments);
        };
        
        // Add chrome object
        if (!window.chrome) {
          window.chrome = {};
          window.chrome.runtime = {};
        }
      });
    }
    
    const page = await context.newPage();
    
    // Navigate to the URL and wait for network idle
    if (verbose) {
      console.log(`Navigating to ${url} with ${pageLoadTimeout}ms timeout...`);
    }
    
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: pageLoadTimeout
      });
    } catch (navError) {
      // Check for bot detection or protection specific errors
      if (
        navError.message.includes('ERR_TIMED_OUT') || 
        navError.message.includes('timeout') ||
        navError.message.includes('Timeout')
      ) {
        if (stealth) {
          throw new Error(`Timeout navigating to ${url} despite stealth mode. Try increasing PAGE_LOAD_TIMEOUT in .env file.`);
        } else {
          throw new Error(`Timeout navigating to ${url}. This may indicate bot protection - try using --stealth flag.`);
        }
      }
      
      // Check for captcha or access denied patterns
      if (
        await page.content().then(content => 
          content.includes('captcha') || 
          content.includes('Captcha') ||
          content.includes('bot detection') ||
          content.includes('Bot Detection') ||
          content.includes('Access Denied') ||
          content.includes('403 Forbidden')
        )
      ) {
        throw new Error(`Bot protection detected on ${url}. Try using --stealth flag.`);
      }
      
      // If it's another type of error, just pass it through
      throw navError;
    }
    
    // Wait for a moment to ensure any animations or lazy-loaded content appears
    await page.waitForTimeout(2000);
    
    // For each viewport
    let processingViewport = 0;
    for (const viewport of viewports) {
      processingViewport++;
      
      try {
        const viewportOptions = {
          width: viewport.width,
          height: viewport.height
        };
        
        if (verbose) {
          console.log(`Setting viewport to ${viewport.width}x${viewport.height} (${viewport.name})`);
        }
        
        // Set the viewport
        await page.setViewportSize(viewportOptions);
        
        // Provide progress update
        if (onProgress) {
          const percentage = (processingViewport / viewports.length) * 100;
          onProgress({ 
            percentage,
            step: `Capturing ${viewport.name} viewport (${viewport.width}x${viewport.height})`,
            viewport: viewport.name
          });
        }
        
        // Navigate to the URL with increased timeout
        if (verbose) {
          console.log(`Navigating to ${url} with timeout of ${pageLoadTimeout}ms`);
        }
        
        // Use a try/catch block specifically for navigation
        try {
          await page.goto(url, { 
            timeout: pageLoadTimeout,
            waitUntil: 'domcontentloaded' // Less strict than 'networkidle', which can time out
          });
          
          // Wait for the page to stabilize
          await waitForStable(page, pageLoadTimeout);
          
          if (disableAnimations) {
            // Disable animations to avoid animation artifacts in screenshots
            await page.addStyleTag({
              content: `
                *, *::before, *::after {
                  animation-duration: 0s !important;
                  transition-duration: 0s !important;
                  animation-delay: 0s !important;
                  transition-delay: 0s !important;
                  animation: none !important;
                  transition: none !important;
                }
              `
            });
            
            // Wait a bit for the style to apply
            await page.waitForTimeout(500);
          }
          
          // Take the screenshot
          const screenshotPath = path.join(
            baseDir,
            `${domain}`,
            `${timestamp}`,
            `${domain}-viewport-${viewport.name}${selector ? `-${selector.replace(/[^a-zA-Z0-9]/g, '-')}` : ''}.png`
          );
          
          // Create directory for the screenshot if it doesn't exist
          await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
          
          let screenshotOptions = { path: screenshotPath };
          let screenshotBuffer;
          
          if (selector) {
            try {
              // Wait for the selector to be visible
              await page.waitForSelector(selector, { timeout: 5000 });
              
              // Take screenshot of specific element
              const element = await page.$(selector);
              if (!element) {
                throw new Error(`Selector "${selector}" not found in page`);
              }
              
              if (verbose) {
                console.log(`Taking screenshot of selector: ${selector}`);
              }
              
              // Capture as buffer first
              screenshotBuffer = await element.screenshot();
              // Then write to file
              await fs.writeFile(screenshotPath, screenshotBuffer);
            } catch (selectorError) {
              console.error(`Error capturing selector "${selector}" for viewport ${viewport.name}: ${selectorError.message}`);
              throw selectorError;
            }
          } else {
            // Full page or viewport screenshot
            if (fullPage) {
              screenshotOptions.fullPage = true;
            }
            
            if (verbose) {
              console.log(`Taking ${fullPage ? 'full page' : 'viewport'} screenshot`);
            }
            
            // Capture as buffer first
            screenshotBuffer = await page.screenshot(screenshotOptions);
            // Ensure it's saved to the path too
            await fs.writeFile(screenshotPath, screenshotBuffer);
          }
          
          // Add the result with both path and buffer
          screenshotResults.push({
            viewport,
            path: screenshotPath,
            screenshot: screenshotBuffer
          });
          
          if (verbose) {
            console.log(`Screenshot saved to ${screenshotPath}`);
          }
        } catch (navigationError) {
          console.error(`Navigation error for viewport ${viewport.name}: ${navigationError.message}`);
          
          // Special handling for navigation errors
          if (navigationError.message.includes('Navigation timeout') || 
              navigationError.message.includes('page.content: Unable to retrieve content because the page is navigating')) {
            console.log('Page navigation issue detected. Trying an alternative approach...');
            
            // Try with a different navigation approach
            await page.goto('about:blank'); // Reset to blank page
            await page.goto(url, { 
              timeout: pageLoadTimeout * 1.5, // Increase timeout
              waitUntil: 'commit' // Less strict wait strategy
            });
            
            // Wait longer
            await page.waitForTimeout(5000);
            
            // Now try to take the screenshot
            const screenshotPath = path.join(
              baseDir,
              `${domain}`,
              `${timestamp}`,
              `${domain}-viewport-${viewport.name}${selector ? `-${selector.replace(/[^a-zA-Z0-9]/g, '-')}` : ''}.png`
            );
            
            await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
            
            // Take a basic screenshot
            screenshotBuffer = await page.screenshot({ path: screenshotPath });
            
            screenshotResults.push({
              viewport,
              path: screenshotPath,
              screenshot: screenshotBuffer
            });
            
            if (verbose) {
              console.log(`Recovered screenshot saved to ${screenshotPath}`);
            }
          } else {
            // For other navigation errors, re-throw
            throw navigationError;
          }
        }
      } catch (error) {
        console.error(`Error capturing viewport ${viewport.name}: ${error.message}`);
        
        // Add a placeholder for failed screenshot but continue with other viewports
        if (onProgress) {
          onProgress({ 
            percentage: (processingViewport / viewports.length) * 100,
            step: `Error capturing ${viewport.name} viewport: ${error.message}`,
            viewport: viewport.name,
            error: error.message
          });
        }
      }
    }
  } finally {
    // Close the browser
    await browser.close();
  }
  
  return screenshotResults;
}

// Add a waitForStable function to ensure the page has fully loaded and stabilized
async function waitForStable(page, timeout = 5000) {
  const startTime = Date.now();
  
  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout });
  
  // Wait for any pending navigations to complete
  await page.waitForLoadState('domcontentloaded', { timeout });
  
  // Additional wait time for any JS-based animations or content changes to settle
  await page.waitForTimeout(1000);
  
  console.log(`Page stabilized after ${Date.now() - startTime}ms`);
}

module.exports = {
  captureScreenshots
}; 