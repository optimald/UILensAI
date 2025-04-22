import { setupBrowser, detectCompatibilityIssues } from './browser.js';

export async function captureScreenshot({ url, viewportType, selector, options = {} }) {
  const delay = options.delay || 0;
  const disableAnimations = options.disableAnimations || false;
  const stealth = options.stealth || false;
  const debug = options.debug || false;
  const timeout = options.timeout || PAGE_LOAD_TIMEOUT;

  console.log(`Capturing screenshot for ${url} at ${viewportType} viewport${selector ? ' with selector ' + selector : ''}`);
  
  if (debug) {
    console.log(`Using options: ${JSON.stringify(options)}`);
  }
  
  let browser = null;
  let page = null;
  
  try {
    // Enhanced stealth setup for problematic sites
    const enhancedStealth = stealth || url.includes('github.com') || url.includes('twitter.com') || url.includes('x.com');
    
    browser = await setupBrowser({ stealth: enhancedStealth, debug });
    page = await browser.newPage();
    
    // Set viewport
    const viewport = VIEWPORTS[viewportType];
    await page.setViewport(viewport);
    
    // Enhanced site-specific handling
    if (url.includes('github.com')) {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      });
    }
    
    // Disable animations if requested
    if (disableAnimations) {
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            transition-duration: 0s !important;
            animation-delay: 0s !important;
            transition-delay: 0s !important;
          }
        `
      });
    }
    
    // Navigate to the URL with timeout
    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    
    // Check for browser compatibility issues
    const compatibilityIssues = await detectCompatibilityIssues(page);
    if (compatibilityIssues.detected) {
      console.warn(`⚠️ Browser compatibility issue detected: ${compatibilityIssues.message}`);
      console.warn('Attempting to bypass with enhanced stealth settings...');
      
      // Close current page and try again with enhanced settings
      await page.close();
      page = await browser.newPage();
      await page.setViewport(viewport);
      
      // Apply more aggressive stealth techniques
      await page.evaluateOnNewDocument(() => {
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {
            isInstalled: false,
          },
        };
        Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
        Object.defineProperty(navigator, 'productSub', { get: () => '20030107' });
        Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      });
      
      // Try navigation again
      await page.goto(url, { waitUntil: 'networkidle2', timeout });
    }
    
    // Add delay if needed
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }
    
    // Take screenshot
    let element = null;
    if (selector) {
      try {
        element = await page.$(selector);
        if (!element) {
          console.error(`Selector '${selector}' not found`);
          element = await page.$('body');
        }
      } catch (error) {
        console.error(`Error finding selector: ${error.message}`);
        element = await page.$('body');
      }
    } else {
      element = await page.$('body');
    }
    
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      throw new Error('Failed to get element bounding box');
    }
    
    // Capture full page if no specific element is requested
    const screenshot = selector
      ? await element.screenshot({ type: 'png' })
      : await page.screenshot({ 
          type: 'png', 
          fullPage: true 
        });
    
    // Generate the file name
    const domain = new URL(url).hostname;
    const date = new Date();
    const timestamp = date.toISOString().replace(/:/g, '').split('.')[0];
    const fileName = `${domain}-viewport-${viewportType}-${timestamp.slice(0, 8)}${timestamp.slice(8)}.png`;
    const filePath = `storage/screenshots/${fileName}`;
    
    // Create directory if it doesn't exist
    await createDirectoryIfNotExists('storage/screenshots');
    
    // Save the screenshot
    await fs.promises.writeFile(filePath, screenshot);
    
    if (debug) {
      console.log(`Screenshot saved to ${filePath}`);
    }
    
    return {
      path: filePath,
      width: boundingBox.width || viewport.width,
      height: boundingBox.height || viewport.height,
      viewportType,
      fileName
    };
  } catch (error) {
    console.error(`Error capturing screenshot: ${error.message}`);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
} 