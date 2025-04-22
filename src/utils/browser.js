export async function setupBrowser({ stealth = false, debug = false }) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      ]
    });
    
    if (stealth) {
      const page = await browser.newPage();
      
      // Enhanced stealth settings
      await page.evaluateOnNewDocument(() => {
        // Override the navigator properties to appear more like a standard browser
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        
        // Override the permissions API
        if (window.Notification) {
          window.Notification.permission = 'granted';
        }
        
        // Fake the user interaction
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });
      
      await page.close();
    }
    
    return browser;
  } catch (error) {
    console.error('Error setting up browser:', error);
    throw error;
  }
}

// New helper function to detect unsupported browser warnings
export async function detectCompatibilityIssues(page) {
  const compatibilityIssues = await page.evaluate(() => {
    // Common phrases that indicate browser compatibility issues
    const warningPhrases = [
      'browser is not supported',
      'unsupported browser',
      'update your browser',
      'browser version not supported',
      'outdated browser',
      'please upgrade',
      'incompatible browser'
    ];
    
    // Check page text for compatibility warnings
    const pageText = document.body.innerText.toLowerCase();
    
    for (const phrase of warningPhrases) {
      if (pageText.includes(phrase)) {
        return { detected: true, message: phrase };
      }
    }
    
    // Check for specific elements that might indicate compatibility issues
    const possibleWarningElements = document.querySelectorAll('.browser-warning, .compatibility-notice, .upgrade-browser');
    if (possibleWarningElements.length > 0) {
      return { detected: true, message: 'browser warning element detected' };
    }
    
    return { detected: false };
  });
  
  return compatibilityIssues;
} 