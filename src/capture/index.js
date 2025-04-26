const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { format } = require('date-fns');
const { v4: uuidv4 } = require('uuid');
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
 * Captures screenshots of a URL at various viewport sizes
 * 
 * @param {string} options.url - URL to capture
 * @param {Array} options.viewports - Array of viewport objects with name, width, and height
 * @param {boolean} options.fullPage - Whether to capture the full page height
 * @param {string} options.selector - CSS selector to capture specific UI components
 * @param {string} options.stealthLevel - Stealth mode level ('basic', 'medium', 'advanced')
 * @param {boolean} options.disableAnimations - Whether to disable CSS animations
 * @param {string} options.cacheDir - Directory to cache screenshots
 * @param {boolean} options.useCache - Whether to use cached screenshots
 * @param {boolean} options.filterScreenshots - Whether to filter screenshots
 * @param {boolean} options.verbose - Whether to output verbose logs
 * @param {function} options.onProgress - Progress callback
 * @param {number} options.timeout - Page load timeout in milliseconds
 * @param {object} options.httpCredentials - HTTP credentials object with username and password
 * @param {string} options.runId - Unique identifier for this run
 * @returns {Promise<Array>} - Array of screenshot paths
 */
async function captureScreenshots({ 
  url, 
  viewports, 
  fullPage = true, 
  selector, 
  stealthLevel = null,
  disableAnimations = false,
  cacheDir,
  useCache = true,
  filterScreenshots = true,
  verbose = false,
  onProgress = null,
  timeout = null,
  httpCredentials = null,
  runId = null
}) {
  // Generate a run ID if not provided
  if (!runId) {
    runId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
  
  // Set page load timeout from environment variable or parameter
  const pageLoadTimeout = timeout || parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10);
  
  // Set screenshot directory
  const storagePath = getStoragePath();
  const screenshotDir = path.join(storagePath, 'screenshots');
  
  // Create the screenshots directory if it doesn't exist
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  // Parse URL for filename
  const domain = new URL(url).hostname;
  
  // Set up run-specific directory
  const dateStr = format(new Date(), 'yyyyMMdd-HHmmss');
  const runDir = path.join(screenshotDir, domain, `${dateStr}-${runId.split('-')[0]}`);
  
  // Create the run-specific directory
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
  
  if (verbose) {
    console.log(`Capture Options:`);
    console.log(`- URL: ${url}`);
    console.log(`- Viewports: ${viewports.map(v => v.name).join(', ')}`);
    console.log(`- Full Page: ${fullPage ? 'Yes' : 'No'}`);
    if (selector) console.log(`- Selector: ${selector}`);
    console.log(`- Stealth Level: ${stealthLevel || 'None'}`);
    console.log(`- Disable Animations: ${disableAnimations ? 'Yes' : 'No'}`);
  }
  
  // Launch browser with appropriate options
  const launchOptions = {};
  
  // Apply appropriate stealth options based on level
  if (stealthLevel) {
    // Basic stealth mode arguments - common to all levels
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
    
    // Medium and advanced level adds additional arguments
    if (stealthLevel === 'medium' || stealthLevel === 'advanced') {
      launchOptions.args.push(
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-breakpad',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-domain-reliability',
        '--disable-client-side-phishing-detection'
      );
    }
    
    // Advanced level adds even more protection
    if (stealthLevel === 'advanced') {
      launchOptions.args.push(
        '--disable-features=AudioServiceOutOfProcess,AutomationControlled',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--metrics-recording-only'
      );
    }
    
    if (verbose) {
      console.log(`Initializing browser with stealth mode arguments (${stealthLevel} level)...`);
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
    
    if (stealthLevel) {
      // Apply appropriate stealth options based on level
      
      // Basic stealth options - common to all levels
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
      
      // Medium and advanced levels add additional context options
      if (stealthLevel === 'medium' || stealthLevel === 'advanced') {
        // More sophisticated user agent rotation
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ];
        
        // Select a random user agent
        contextOptions.userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        // Add more varied headers
        contextOptions.extraHTTPHeaders = {
          ...contextOptions.extraHTTPHeaders,
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=0',
          'Sec-Ch-Ua': '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="8"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"'
        };
      }
      
      // Advanced level adds even more protection
      if (stealthLevel === 'advanced') {
        // Random timezone and locale to avoid fingerprinting
        contextOptions.timezoneId = ['America/New_York', 'Europe/London', 'Asia/Tokyo'][Math.floor(Math.random() * 3)];
        contextOptions.locale = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'][Math.floor(Math.random() * 5)];
        
        // Modify additional parameters to avoid detection
        // Device scale factor requires viewport to be set, so we'll set it per page later
        contextOptions.hasTouch = Math.random() > 0.5;
        
        // Further randomize headers
        const randCharset = Math.random() > 0.5 ? ';charset=UTF-8' : '';
        contextOptions.extraHTTPHeaders['Accept'] += randCharset;
      }
      
      if (verbose) {
        console.log(`Applying stealth mode context options (${stealthLevel} level)...`);
      }
    }
    
    const context = await browser.newContext(contextOptions);
    
    // Apply stealth scripts to hide automation
    if (stealthLevel) {
      if (verbose) {
        console.log(`Applying stealth mode scripts (${stealthLevel} level)...`);
      }
      
      // Basic stealth scripts - common to all levels
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
      
      // Medium and advanced levels add additional scripts
      if (stealthLevel === 'medium' || stealthLevel === 'advanced') {
        await context.addInitScript(() => {
          // More sophisticated WebGL masking
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // Additional parameters to mask
            const maskParameters = {
              37445: 'Intel Inc.', // UNMASKED_VENDOR_WEBGL
              37446: 'Intel Iris OpenGL Engine', // UNMASKED_RENDERER_WEBGL
              33902: 'ANGLE (Intel, Intel(R) Iris(TM) Graphics 550, OpenGL 4.1)', // RENDERER
              33901: 'WebKit WebGL', // VENDOR
              35661: 32, // MAX_COMBINED_TEXTURE_IMAGE_UNITS
              34047: 16, // MAX_CUBE_MAP_TEXTURE_SIZE
              34076: 16384, // MAX_RENDERBUFFER_SIZE
              34024: 16384, // MAX_TEXTURE_SIZE
              3379: 16384, // MAX_VIEWPORT_DIMS
              3386: 8, // SUBPIXEL_BITS
              3410: 8192, // MAX_ELEMENTS_VERTICES
              3411: 8192, // MAX_ELEMENTS_INDICES
              3412: 8, // MAX_TEXTURE_LEVEL
              3413: 8 // MAX_3D_TEXTURE_SIZE
            };
            
            if (maskParameters.hasOwnProperty(parameter)) {
              return maskParameters[parameter];
            }
            
            return getParameter.apply(this, arguments);
          };
          
          // Canvas fingerprinting protection
          const toDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function(type) {
            if (this.width > 16 && this.height > 16) {
              // Small unnoticeable noise to make fingerprinting more challenging
              const context = this.getContext('2d');
              const imageData = context.getImageData(0, 0, this.width, this.height);
              const pixels = imageData.data;
              
              for (let i = 0; i < pixels.length; i += 4) {
                // Add tiny random noise to pixel data
                pixels[i] = pixels[i] + (Math.random() > 0.999 ? 1 : 0); // R
                pixels[i+1] = pixels[i+1] + (Math.random() > 0.999 ? 1 : 0); // G
                pixels[i+2] = pixels[i+2] + (Math.random() > 0.999 ? 1 : 0); // B
              }
              
              context.putImageData(imageData, 0, 0);
            }
            return toDataURL.apply(this, arguments);
          };
          
          // Improved chrome object emulation
          window.chrome = {
            app: {
              isInstalled: false,
              getDetails: function() { return null; },
              getIsInstalled: function() { return false; },
              runningState: function() { return 'cannot_run'; }
            },
            runtime: {
              PlatformOs: {
                MAC: 'mac',
                WIN: 'win',
                ANDROID: 'android',
                CROS: 'cros',
                LINUX: 'linux',
                OPENBSD: 'openbsd'
              },
              PlatformArch: {
                ARM: 'arm',
                X86_32: 'x86-32',
                X86_64: 'x86-64'
              },
              PlatformNaclArch: {
                ARM: 'arm',
                X86_32: 'x86-32',
                X86_64: 'x86-64'
              },
              RequestUpdateCheckStatus: {
                THROTTLED: 'throttled',
                NO_UPDATE: 'no_update',
                UPDATE_AVAILABLE: 'update_available'
              },
              OnInstalledReason: {
                INSTALL: 'install',
                UPDATE: 'update',
                CHROME_UPDATE: 'chrome_update',
                SHARED_MODULE_UPDATE: 'shared_module_update'
              },
              OnRestartRequiredReason: {
                APP_UPDATE: 'app_update',
                OS_UPDATE: 'os_update',
                PERIODIC: 'periodic'
              }
            }
          };
          
          // WebRTC fingerprinting protection
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
            navigator.mediaDevices.enumerateDevices = async function() {
              const devices = await originalEnumerateDevices();
              return devices.map(device => {
                const deviceWithNoId = Object.assign({}, device, {
                  deviceId: device.kind + '-' + Math.random().toString(36).slice(2),
                  groupId: Math.random().toString(36).slice(2)
                });
                return deviceWithNoId;
              });
            };
          }
        });
      }
      
      // Advanced level adds even more scripts
      if (stealthLevel === 'advanced') {
        await context.addInitScript(() => {
          // Hardware concurrency and device memory fingerprinting protection
          Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => Math.min(8, Math.max(2, Math.floor(Math.random() * 4) + 2))
          });
          
          if ('deviceMemory' in navigator) {
            Object.defineProperty(navigator, 'deviceMemory', {
              get: () => Math.min(8, Math.max(2, Math.floor(Math.random() * 4) + 2))
            });
          }
          
          // Permission API fingerprinting protection
          if (navigator.permissions) {
            const originalQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = async function(parameters) {
                // Return "prompt" for Notifications and other sensitive APIs
                if (parameters.name === 'notifications' || 
                    parameters.name === 'geolocation' || 
                    parameters.name === 'camera' || 
                    parameters.name === 'microphone') {
                  return {
                    state: "prompt",
                    addEventListener: function() {},
                    removeEventListener: function() {},
                    onchange: null
                  };
                }
                return originalQuery(parameters);
            };
          }
          
          // Connection API fingerprinting protection
          if (navigator.connection) {
            Object.defineProperties(navigator.connection, {
              type: { get: () => ['wifi', 'cellular', 'ethernet'][Math.floor(Math.random() * 3)] },
              downlink: { get: () => Math.floor(Math.random() * 10) + 5 },
              rtt: { get: () => Math.floor(Math.random() * 50) + 50 },
              downlinkMax: { get: () => Math.floor(Math.random() * 20) + 10 },
              effectiveType: { get: () => ['4g', '3g'][Math.floor(Math.random() * 2)] },
              saveData: { get: () => Math.random() > 0.8 }
            });
          }
          
          // Speech API fingerprinting protection
          if (window.speechSynthesis) {
            const originalGetVoices = window.speechSynthesis.getVoices;
            window.speechSynthesis.getVoices = function() {
              // Return a fixed set of voice objects with randomized properties
              return [
                { name: 'English US Female', lang: 'en-US', localService: true, default: true },
                { name: 'English US Male', lang: 'en-US', localService: true, default: false }
              ];
            };
          }
          
          // Timestamp precision reduction to prevent timing attacks
          const originalPerformanceNow = performance.now;
          performance.now = function() {
            return Math.round(originalPerformanceNow.call(performance) * 10) / 10;
          };
          
          const originalDateNow = Date.now;
          Date.now = function() {
            return Math.round(originalDateNow.call(Date) / 10) * 10;
          };
        });
      }
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
        if (stealthLevel === 'advanced') {
          throw new Error(`Timeout navigating to ${url} despite advanced stealth mode. Try increasing PAGE_LOAD_TIMEOUT in .env file.`);
        } else if (stealthLevel === 'medium') {
          throw new Error(`Timeout navigating to ${url} despite medium stealth mode. Try using --stealth advanced or increasing timeout.`);
        } else if (stealthLevel === 'basic') {
          throw new Error(`Timeout navigating to ${url} despite basic stealth mode. Try using --stealth medium or --stealth advanced.`);
        } else {
          throw new Error(`Timeout navigating to ${url}. This may indicate bot protection - try using --stealth basic.`);
        }
      }
      
      // Check for domain resolution errors
      if (
        navError.message.includes('ERR_NAME_NOT_RESOLVED') ||
        navError.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
        navError.message.includes('page.goto:') && (
          navError.message.includes('net::ERR_NAME') ||
          navError.message.includes('ENOTFOUND') ||
          navError.message.includes('Unable to resolve')
        )
      ) {
        throw new Error(`Domain not found: ${url}. Please check that the domain exists and is spelled correctly.`);
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
        if (stealthLevel === 'advanced') {
          throw new Error(`Bot protection detected on ${url} despite advanced stealth mode. This site may have very sophisticated protections.`);
        } else if (stealthLevel === 'medium') {
          throw new Error(`Bot protection detected on ${url} despite medium stealth mode. Try using --stealth advanced.`);
        } else if (stealthLevel === 'basic') {
          throw new Error(`Bot protection detected on ${url} despite basic stealth mode. Try using --stealth medium or --stealth advanced.`);
        } else {
          throw new Error(`Bot protection detected on ${url}. Try using --stealth basic.`);
        }
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
        
        // Set viewport
        await page.setViewportSize(viewportOptions);
        
        // Set filename
        let filename = `${domain}-viewport-${viewport.name}`;
        if (selector) {
          filename += `-${selector.replace(/[^\w-]/g, '-')}`;
        }
        filename += `.png`;
        
        // Set full path
        const fullPath = path.join(runDir, filename);
        
        // Wait for viewport to stabilize
        await waitForStable(page);
        
        // Disable animations if requested
        if (disableAnimations) {
          await page.addStyleTag({
            content: `
            *, *::before, *::after {
              animation-duration: 0s !important;
              transition-duration: 0s !important;
              animation-delay: 0s !important;
              transition-delay: 0s !important;
              animation-iteration-count: 1 !important;
            }
            `
          });
        }
        
        // If selector is provided, capture only that element
        if (selector) {
          try {
            const element = await page.$(selector);
            
            if (!element) {
              console.error(`Element with selector "${selector}" not found`);
              continue;
            }
            
            if (verbose) {
              console.log(`Capturing element with selector: ${selector}`);
            }
            
            await element.screenshot({
              path: fullPath
            });
          } catch (selectorError) {
            console.error(`Error capturing element with selector "${selector}": ${selectorError.message}`);
            continue;
          }
        } else {
          // Capture full page or viewport
          await page.screenshot({
            path: fullPath,
            fullPage: fullPage
          });
        }
        
        if (verbose) {
          console.log(`Screenshot saved to ${fullPath}`);
        }
        
        // Add screenshot result to array
        screenshotResults.push({
          viewport: viewport.name,
          path: fullPath,
          width: viewport.width,
          height: viewport.height
        });
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            viewport: viewport.name,
            path: fullPath,
            current: processingViewport,
            total: viewports.length
          });
        }
      } catch (viewportError) {
        console.error(`Error capturing viewport ${viewport.name}: ${viewportError.message}`);
        
        // Check for bot protection specifically
        if (await detectBotProtection(page, url)) {
          console.error(`\nBot protection detected! The site appears to be blocking automated access.`);
          
          // Suggest stealth mode or higher stealth level
          if (!stealthLevel) {
            console.error('Recommendation: Try again with stealth mode enabled:');
            console.error(`npm run ui -- --url ${url} --stealth basic\n`);
          } else if (stealthLevel === 'basic') {
            console.error('Recommendation: Try again with medium stealth mode:');
            console.error(`npm run ui -- --url ${url} --stealth medium\n`);
          } else if (stealthLevel === 'medium') {
            console.error('Recommendation: Try again with advanced stealth mode:');
            console.error(`npm run ui -- --url ${url} --stealth advanced\n`);
          } else {
            console.error('This site has sophisticated bot protection that even advanced stealth mode cannot bypass.\n');
          }
          
          throw new Error(`Bot protection detected. Try using --stealth ${!stealthLevel ? 'basic' : stealthLevel === 'basic' ? 'medium' : 'advanced'} to bypass protection mechanisms.`);
        }
      }
    }
  } catch (error) {
    console.error(`Error during screenshot capture: ${error.message}`);
    throw error;
  } finally {
    // Always close the browser
    await browser.close();
  }
  
  return {
    results: screenshotResults,
    runId: runId
  };
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

// Detect if the page contains bot protection mechanisms
async function detectBotProtection(page, url) {
  try {
    // Check page content for common protection patterns
    const content = await page.content();
    const botDetectionPatterns = [
      'captcha',
      'robot',
      'automated',
      'bot detection',
      'security check',
      'verify you are human',
      'prove you are human',
      'detection',
      'Access Denied',
      'Forbidden',
      'CloudFlare',
      'DDoS protection',
      'Imperva',
      'Akamai',
      'Bot Management',
      'PerimeterX',
      'Distil',
      'hCaptcha',
      'reCAPTCHA'
    ];
    
    const lowerContent = content.toLowerCase();
    for (const pattern of botDetectionPatterns) {
      if (lowerContent.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    
    // Check for common bot protection headers
    const pageUrl = page.url();
    if (
      pageUrl.includes('captcha') ||
      pageUrl.includes('challenge') ||
      pageUrl.includes('security_check') ||
      pageUrl.includes('https://www.cloudflare.com/') ||
      pageUrl.includes('/cdn-cgi/')
    ) {
      return true;
    }
    
    // No protection detected
    return false;
  } catch (error) {
    console.error(`Error detecting bot protection: ${error.message}`);
    return false;
  }
}

// Export module
module.exports = {
  captureScreenshots
}; 