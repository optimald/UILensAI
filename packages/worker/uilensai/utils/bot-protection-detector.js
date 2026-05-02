// Bot protection detection — patterns only, no browser dependency

/**
 * Comprehensive Bot Protection Detection and Mitigation System
 * 
 * This module provides intelligent detection of various bot protection mechanisms
 * and automatically escalates stealth measures to bypass them.
 */

/**
 * Bot protection detection patterns and signatures
 */
const BOT_PROTECTION_SIGNATURES = {
  // URL patterns that indicate bot protection
  urlPatterns: [
    'captcha', 'challenge', 'security_check', '/cdn-cgi/', 'cf-browser-verification',
    '__cf_chl_jschl_tk__', 'ddos-guard', 'incapsula', 'imperva', 'distil',
    'perimeterx', 'datadome', 'kasada', 'akamai-bot-manager', 'bot-protection',
    'human-verification', 'verify-human', 'security-verification'
  ],

  // Page title patterns
  titlePatterns: [
    'just a moment', 'please wait', 'checking your browser', 'security check',
    'access denied', 'forbidden', 'cloudflare', 'ddos protection', 'bot protection',
    'attention required', 'verify you are human', 'browser verification',
    'loading...', 'redirecting...', 'please enable javascript', 'enable cookies',
    'security verification', 'human verification', 'anti-bot verification'
  ],

  // Content patterns in page body
  contentPatterns: [
    'checking your browser before accessing', 'please wait while we check your browser',
    'this process is automatic. your browser will redirect', 'cloudflare ray id:',
    'performance & security by cloudflare', 'attention required! | cloudflare',
    'enable javascript and cookies to continue', 'please complete the security verification',
    'verify you are human by completing the action below', 'solve the challenge below to continue',
    'complete the captcha to proceed', 'you are being rate limited',
    'too many requests from this ip', 'access denied due to suspicious activity',
    'your request has been blocked', 'this request has been blocked by our security system',
    'error 1020: access denied', 'error 1015: you are being rate limited',
    'error 1006: access denied', 'error 1010:', 'imperva incapsula incident id',
    'blocked by website security', 'request blocked by security policy',
    'access to this page has been denied', 'ddos protection by', 'powered by incapsula',
    'blocked by perimeterx', 'datadome protection', 'kasada bot protection',
    'akamai bot manager', 'distil networks', 'please prove you are human'
  ],

  // DOM selectors for bot protection elements
  domSelectors: [
    '.g-recaptcha', '#recaptcha', 'iframe[src*="recaptcha"]', 'iframe[title*="recaptcha"]',
    '#hcaptcha', 'iframe[src*="hcaptcha"]', '#turnstile', '.cf-turnstile',
    '.cf-challenge-form', '.cf-browser-verification', '.ddos-guard',
    '.incapsula-challenge', '.imperva-challenge', '.px-captcha', '.datadome-challenge',
    '.kasada-challenge', '.akamai-challenge', '.distil-challenge',
    '[data-sitekey]', '.captcha-container', '.bot-challenge', '.security-check'
  ],

  // Network response patterns
  responsePatterns: [
    { status: 403, headers: ['cf-ray', 'server: cloudflare'] },
    { status: 503, headers: ['server: cloudflare'] },
    { status: 429, headers: ['retry-after'] },
    { status: 406, headers: ['x-sucuri-id'] },
    { status: 451, headers: ['x-blocked-by'] }
  ]
};

/**
 * Stealth configuration levels
 */
const STEALTH_LEVELS = {
  none: {
    name: 'none',
    browserArgs: [],
    contextOptions: {},
    initScripts: [],
    waitStrategies: ['domcontentloaded']
  },

  basic: {
    name: 'basic',
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ],
    contextOptions: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    },
    initScripts: ['hideWebdriver'],
    waitStrategies: ['domcontentloaded', 'networkidle']
  },

  medium: {
    name: 'medium',
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled'
    ],
    contextOptions: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      },
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false
    },
    initScripts: ['hideWebdriver', 'spoofNavigator', 'addChromeRuntime'],
    waitStrategies: ['domcontentloaded', 'networkidle', 'stabilityCheck']
  },

  advanced: {
    name: 'advanced',
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-javascript-harmony-shipping',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-field-trial-config',
      '--disable-back-forward-cache',
      '--disable-ipc-flooding-protection',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-pings',
      '--password-store=basic',
      '--use-mock-keychain'
    ],
    contextOptions: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,en-GB;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1'
      },
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      permissions: ['geolocation', 'notifications'],
      geolocation: { latitude: 37.7749, longitude: -122.4194 }, // San Francisco
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles'
    },
    initScripts: ['hideWebdriver', 'spoofNavigator', 'addChromeRuntime', 'spoofPermissions', 'spoofWebGL', 'spoofCanvas', 'spoofTimezone', 'spoofScreen'],
    waitStrategies: ['domcontentloaded', 'networkidle', 'stabilityCheck', 'contentLoaded', 'humanDelay']
  }
};

/**
 * JavaScript injection scripts for stealth mode
 */
const STEALTH_SCRIPTS = {
  hideWebdriver: () => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Remove automation indicators
    delete window.__webdriver_evaluate;
    delete window.__webdriver_script_function;
    delete window.__webdriver_script_func;
    delete window.__webdriver_script_fn;
    delete window.__selenium_evaluate;
    delete window.__selenium_unwrapped;
    delete window.__webdriver_unwrapped;
    delete window.__driver_evaluate;
    delete window.__webdriver_script_fn;
    delete window.__fxdriver_evaluate;
    delete window.__driver_unwrapped;
    delete window.__webdriver_evaluate;
    delete window.__selenium_evaluate;
    delete window.__fxdriver_unwrapped;
    delete window._phantom;
    delete window.__nightmare;
    delete window._selenium;
    delete window.callPhantom;
    delete window.callSelenium;
    delete window._Selenium_IDE_Recorder;

    // Remove common automation detection properties
    delete window.domAutomation;
    delete window.domAutomationController;
    delete window.__webdriver_script_func;
    delete window.__webdriver_script_function;
    delete window.__webdriver_evaluate;
    delete window.__selenium_evaluate;
    delete window.__webdriver_unwrapped;
    delete window.__selenium_unwrapped;
    delete window.__fxdriver_evaluate;
    delete window.__fxdriver_unwrapped;
    delete window.__driver_evaluate;
    delete window.__driver_unwrapped;
  },

  spoofNavigator: () => {
    // Generate realistic hardware specs
    const hardwareConcurrency = [4, 8, 12, 16][Math.floor(Math.random() * 4)];
    const deviceMemory = [4, 8, 16, 32][Math.floor(Math.random() * 4)];
    const maxTouchPoints = 0; // Desktop assumption

    // Spoof navigator properties with realistic variations
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format',
          length: 1
        },
        {
          name: 'Chrome PDF Viewer',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          description: 'Portable Document Format',
          length: 1
        },
        {
          name: 'Native Client',
          filename: 'internal-nacl-plugin',
          description: 'Native Client Executable',
          length: 2
        }
      ]
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'en-GB']
    });
    Object.defineProperty(navigator, 'platform', {
      get: () => 'MacIntel'
    });
    Object.defineProperty(navigator, 'productSub', {
      get: () => '20030107'
    });
    Object.defineProperty(navigator, 'vendor', {
      get: () => 'Google Inc.'
    });
    Object.defineProperty(navigator, 'vendorSub', {
      get: () => ''
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => hardwareConcurrency
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => deviceMemory
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => maxTouchPoints
    });
    Object.defineProperty(navigator, 'connection', {
      get: () => ({
        effectiveType: '4g',
        rtt: 50 + Math.floor(Math.random() * 50),
        downlink: 10 + Math.random() * 10,
        saveData: false
      })
    });

    // Spoof media devices
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
      navigator.mediaDevices.enumerateDevices = function () {
        return Promise.resolve([
          { deviceId: 'default', kind: 'audioinput', label: 'Default - MacBook Pro Microphone', groupId: 'group1' },
          { deviceId: 'default', kind: 'audiooutput', label: 'Default - MacBook Pro Speakers', groupId: 'group1' },
          { deviceId: 'camera1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: 'group2' }
        ]);
      };
    }
  },

  addChromeRuntime: () => {
    // Add Chrome runtime object with realistic timing
    const loadTime = Date.now() / 1000;
    const randomOffset = Math.random() * 2;

    window.chrome = {
      runtime: {
        onConnect: null,
        onMessage: null,
        connect: () => ({}),
        sendMessage: () => ({}),
        id: 'mhjfbmdgcfjbbpaeojofohoefgiehjai'
      },
      loadTimes: () => ({
        commitLoadTime: loadTime - randomOffset,
        connectionInfo: 'http/1.1',
        finishDocumentLoadTime: loadTime - randomOffset + 0.1,
        finishLoadTime: loadTime - randomOffset + 0.2,
        firstPaintAfterLoadTime: 0,
        firstPaintTime: loadTime - randomOffset + 0.05,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'unknown',
        requestTime: loadTime - randomOffset - 0.5,
        startLoadTime: loadTime - randomOffset - 0.3,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false
      }),
      csi: () => ({
        onloadT: Date.now(),
        pageT: Date.now() - Math.random() * 1000,
        startE: Date.now() - Math.random() * 2000,
        tran: 15
      }),
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      }
    };
  },

  spoofPermissions: () => {
    // Spoof permissions API with realistic responses
    if (window.Notification) {
      Object.defineProperty(window.Notification, 'permission', {
        get: () => 'default'
      });
    }

    if (navigator.permissions) {
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = function (parameters) {
        const permission = parameters.name;
        let state = 'prompt';

        // Realistic permission states
        switch (permission) {
          case 'notifications':
            state = 'default';
            break;
          case 'geolocation':
            state = 'prompt';
            break;
          case 'camera':
          case 'microphone':
            state = 'prompt';
            break;
          case 'persistent-storage':
            state = 'granted';
            break;
          default:
            state = 'prompt';
        }

        return Promise.resolve({ state, onchange: null });
      };
    }
  },

  spoofWebGL: () => {
    // Spoof WebGL fingerprinting with realistic but randomized values
    const vendors = ['Intel Inc.', 'NVIDIA Corporation', 'AMD'];
    const renderers = [
      'Intel Iris Pro OpenGL Engine',
      'Intel UHD Graphics 630 OpenGL Engine',
      'NVIDIA GeForce GTX 1060 OpenGL Engine',
      'AMD Radeon Pro 560X OpenGL Engine'
    ];

    const vendor = vendors[Math.floor(Math.random() * vendors.length)];
    const renderer = renderers[Math.floor(Math.random() * renderers.length)];

    if (window.WebGLRenderingContext) {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) { return vendor; } // UNMASKED_VENDOR_WEBGL
        if (parameter === 37446) { return renderer; } // UNMASKED_RENDERER_WEBGL
        if (parameter === 7936) { return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'; } // VERSION
        if (parameter === 7937) { return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'; } // SHADING_LANGUAGE_VERSION
        return getParameter.call(this, parameter);
      };
    }

    if (window.WebGL2RenderingContext) {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) { return vendor; }
        if (parameter === 37446) { return renderer; }
        if (parameter === 7936) { return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)'; }
        if (parameter === 7937) { return 'WebGL GLSL ES 3.0 (OpenGL ES GLSL ES 3.0 Chromium)'; }
        return getParameter2.call(this, parameter);
      };
    }
  },

  spoofCanvas: () => {
    // Advanced canvas fingerprinting protection
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    // Add consistent but unique noise based on a seed
    const seed = Math.floor(Math.random() * 1000000);
    const noise = (seed % 10) - 5; // -5 to 4 range

    HTMLCanvasElement.prototype.toDataURL = function () {
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        // Add subtle, consistent noise
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
          imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
          imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, arguments);
    };

    CanvasRenderingContext2D.prototype.getImageData = function () {
      const imageData = originalGetImageData.apply(this, arguments);
      // Add the same consistent noise to getImageData
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
        imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
        imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
      }
      return imageData;
    };
  },

  spoofTimezone: () => {
    // Spoof timezone to match the context options
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function () {
      return 480; // PST/PDT offset (matches America/Los_Angeles)
    };

    // Spoof Intl.DateTimeFormat
    if (window.Intl && window.Intl.DateTimeFormat) {
      const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function () {
        const options = originalResolvedOptions.call(this);
        options.timeZone = 'America/Los_Angeles';
        return options;
      };
    }
  },

  spoofScreen: () => {
    // Spoof screen properties to match common desktop setups
    const screenWidth = 1440;
    const screenHeight = 900;
    const availWidth = screenWidth;
    const availHeight = screenHeight - 25; // Account for dock/taskbar

    Object.defineProperty(screen, 'width', { get: () => screenWidth });
    Object.defineProperty(screen, 'height', { get: () => screenHeight });
    Object.defineProperty(screen, 'availWidth', { get: () => availWidth });
    Object.defineProperty(screen, 'availHeight', { get: () => availHeight });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
  }
};

/**
 * Intelligent bot protection detector
 */
class BotProtectionDetector {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.maxRetries = options.maxRetries || 4;
    this.retryDelay = options.retryDelay || 2000;
    this.detectionHistory = new Map();
    this.networkIndicators = [];
  }

  /**
   * Setup network monitoring for bot protection detection
   */
  setupNetworkMonitoring(page) {
    this.networkIndicators = [];

    // Monitor responses for bot protection patterns
    page.on('response', response => {
      try {
        const status = response.status();
        const headers = response.headers();
        const url = response.url();

        BOT_PROTECTION_SIGNATURES.responsePatterns.forEach(pattern => {
          if (pattern.status === status) {
            let headersMatch = true;
            if (pattern.headers) {
              headersMatch = pattern.headers.every(headerName =>
                !!headers[headerName.toLowerCase()]
              );
            }
            if (headersMatch) {
              this.networkIndicators.push({
                type: 'response_pattern_match',
                status,
                url,
                headers: pattern.headers,
                details: `Status ${status} with headers ${pattern.headers?.join(', ')} on URL ${url}`
              });

              if (this.verbose) {
                console.log(`🚨 Bot protection response detected: ${status} on ${url}`);
              }
            }
          }
        });

        // Check for specific bot protection services in response headers
        const serverHeader = headers['server'] || '';
        const cfRay = headers['cf-ray'];
        const xBlockedBy = headers['x-blocked-by'];

        if (cfRay && (status === 403 || status === 503)) {
          this.networkIndicators.push({
            type: 'cloudflare_protection',
            status,
            url,
            details: `Cloudflare protection detected (CF-Ray: ${cfRay})`
          });
        }

        if (xBlockedBy) {
          this.networkIndicators.push({
            type: 'security_block',
            status,
            url,
            details: `Request blocked by: ${xBlockedBy}`
          });
        }

        if (serverHeader.toLowerCase().includes('cloudflare') && status >= 400) {
          this.networkIndicators.push({
            type: 'cloudflare_error',
            status,
            url,
            details: `Cloudflare server error: ${status}`
          });
        }

      } catch (error) {
        // Ignore response monitoring errors
        if (this.verbose) {
          console.log(`⚠️ Response monitoring error: ${error.message}`);
        }
      }
    });

    // Monitor failed requests
    page.on('requestfailed', request => {
      const failure = request.failure();
      if (failure && failure.errorText) {
        const errorText = failure.errorText.toLowerCase();
        if (errorText.includes('blocked') || errorText.includes('denied') || errorText.includes('forbidden')) {
          this.networkIndicators.push({
            type: 'request_blocked',
            url: request.url(),
            details: `Request failed: ${failure.errorText}`
          });
        }
      }
    });
  }

  /**
   * Detect bot protection on a page
   */
  async detectProtection(page, url, options = {}) {
    const detection = {
      detected: false,
      type: null,
      confidence: 'none',
      indicators: [],
      recommendations: []
    };

    try {
      if (!page || page.isClosed()) {
        detection.detected = true;
        detection.type = 'page_inaccessible';
        detection.confidence = 'high';
        return detection;
      }

      // Check network indicators first (from monitoring)
      if (this.networkIndicators.length > 0) {
        detection.detected = true;
        detection.type = 'network_protection_detected';
        detection.confidence = 'high';
        detection.indicators.push(...this.networkIndicators.map(indicator => ({
          ...indicator,
          source: 'network_monitoring'
        })));
      }

      // Check URL patterns
      const urlCheck = this.checkUrlPatterns(page.url(), url);
      if (urlCheck.detected) {
        detection.detected = true;
        detection.type = detection.type || urlCheck.type;
        detection.confidence = this.combineConfidence(detection.confidence, urlCheck.confidence);
        detection.indicators.push({ ...urlCheck, source: 'url_analysis' });
      }

      // Check page title
      const titleCheck = await this.checkPageTitle(page);
      if (titleCheck.detected) {
        detection.detected = true;
        detection.type = detection.type || titleCheck.type;
        detection.confidence = this.combineConfidence(detection.confidence, titleCheck.confidence);
        detection.indicators.push({ ...titleCheck, source: 'title_analysis' });
      }

      // Check page content
      const contentCheck = await this.checkPageContent(page);
      if (contentCheck.detected) {
        detection.detected = true;
        detection.type = detection.type || contentCheck.type;
        detection.confidence = this.combineConfidence(detection.confidence, contentCheck.confidence);
        detection.indicators.push({ ...contentCheck, source: 'content_analysis' });
      }

      // Check DOM elements
      const domCheck = await this.checkDOMElements(page);
      if (domCheck.detected) {
        detection.detected = true;
        detection.type = detection.type || domCheck.type;
        detection.confidence = this.combineConfidence(detection.confidence, domCheck.confidence);
        detection.indicators.push({ ...domCheck, source: 'dom_analysis' });
      }

      // Check network behavior (domain-based)
      const networkCheck = await this.checkNetworkBehavior(page);
      if (networkCheck.detected) {
        detection.detected = true;
        detection.type = detection.type || networkCheck.type;
        detection.confidence = this.combineConfidence(detection.confidence, networkCheck.confidence);
        detection.indicators.push({ ...networkCheck, source: 'network_behavior' });
      }

      // Generate recommendations
      if (detection.detected) {
        detection.recommendations = this.generateRecommendations(detection);
      }

      // Store detection history
      this.detectionHistory.set(url, detection);

      return detection;

    } catch (error) {
      if (this.verbose) { console.error(`Error in bot protection detection: ${error.message}`); }
      return {
        detected: true,
        type: 'detection_error',
        confidence: 'low',
        error: error.message,
        indicators: [{ type: 'detection_error', details: error.message, source: 'error_handler' }],
        recommendations: ['retry_with_higher_stealth']
      };
    }
  }

  /**
   * Check URL patterns for bot protection indicators
   */
  checkUrlPatterns(currentUrl, originalUrl) {
    const result = { detected: false, type: null, confidence: 'none' };

    // Check for suspicious redirects - IMPROVED LOGIC
    if (originalUrl && currentUrl !== originalUrl) {
      const originalParsed = new URL(originalUrl);
      const currentParsed = new URL(currentUrl);

      const originalHost = originalParsed.hostname;
      const currentHost = currentParsed.hostname;

      // Only flag as suspicious if hosts are different AND it's not a legitimate redirect
      if (originalHost !== currentHost) {
        // Check for common legitimate redirect patterns
        const isLegitimateRedirect = this.isLegitimateRedirect(currentHost) ||
          this.isCommonDomainRedirect(originalHost, currentHost);

        if (!isLegitimateRedirect) {
          // Additional checks for truly suspicious redirects
          const isSuspiciousRedirect = this.isSuspiciousRedirect(originalParsed, currentParsed);

          if (isSuspiciousRedirect) {
            result.detected = true;
            result.type = 'suspicious_redirect';
            result.confidence = 'low';
            result.details = `Potentially suspicious redirect from ${originalHost} to ${currentHost}`;
            return result;
          }
        }
      }
    }

    // Check for bot protection URL patterns
    const suspiciousPattern = BOT_PROTECTION_SIGNATURES.urlPatterns.find(pattern =>
      currentUrl.toLowerCase().includes(pattern)
    );

    if (suspiciousPattern) {
      result.detected = true;
      result.type = 'url_pattern_match';
      result.confidence = 'high';
      result.details = `Matched pattern: ${suspiciousPattern}`;
    }

    return result;
  }

  /**
   * Check page title for bot protection indicators
   */
  async checkPageTitle(page) {
    const result = { detected: false, type: null, confidence: 'none' };

    try {
      const title = await page.title();
      const suspiciousTitle = BOT_PROTECTION_SIGNATURES.titlePatterns.find(pattern =>
        title.toLowerCase().includes(pattern)
      );

      if (suspiciousTitle) {
        result.detected = true;
        result.type = 'title_match';
        result.confidence = 'high';
        result.details = `Title: "${title}" matched pattern: "${suspiciousTitle}"`;
      }
    } catch (error) {
      // Title check failed, might indicate protection
      result.detected = true;
      result.type = 'title_check_failed';
      result.confidence = 'low';
      result.details = error.message;
    }

    return result;
  }

  /**
   * Check page content for bot protection indicators
   */
  async checkPageContent(page) {
    const result = { detected: false, type: null, confidence: 'none' };

    try {
      const content = await page.evaluate(() => {
        return document.body ? document.body.innerText.toLowerCase() : '';
      });

      const suspiciousContent = BOT_PROTECTION_SIGNATURES.contentPatterns.find(pattern =>
        content.includes(pattern.toLowerCase())
      );

      if (suspiciousContent) {
        result.detected = true;
        result.type = 'content_match';
        result.confidence = 'high';
        result.details = `Matched content pattern: "${suspiciousContent}"`;
      }
    } catch (error) {
      result.detected = true;
      result.type = 'content_check_failed';
      result.confidence = 'low';
      result.details = error.message;
    }

    return result;
  }

  /**
   * Check DOM elements for bot protection indicators
   */
  async checkDOMElements(page) {
    const result = { detected: false, type: null, confidence: 'none' };

    try {
      const elements = await page.evaluate((selectors) => {
        const found = [];
        selectors.forEach(selector => {
          const element = document.querySelector(selector);
          if (element) {
            found.push({
              selector,
              tagName: element.tagName,
              className: element.className,
              id: element.id
            });
          }
        });
        return found;
      }, BOT_PROTECTION_SIGNATURES.domSelectors);

      if (elements.length > 0) {
        result.detected = true;
        result.type = 'dom_element_match';
        result.confidence = 'high';
        result.details = `Found protection elements: ${elements.map(e => e.selector).join(', ')}`;
        result.elements = elements;
      }
    } catch (error) {
      result.detected = true;
      result.type = 'dom_check_failed';
      result.confidence = 'low';
      result.details = error.message;
    }

    return result;
  }

  /**
   * Check network behavior for bot protection indicators
   */
  async checkNetworkBehavior(page) {
    const result = { detected: false, type: null, confidence: 'none' };

    try {
      // This would be enhanced with actual network monitoring
      // For now, we check response status and headers if available
      const response = page.mainFrame().url();

      // Check if we're on a known bot protection service domain
      const protectionServices = [
        'cloudflare.com', 'incapsula.com', 'imperva.com', 'distilnetworks.com',
        'perimeterx.com', 'datadome.co', 'kasada.io', 'akamai.com'
      ];

      const currentHost = new URL(response).hostname;
      const isProtectionService = protectionServices.some(service =>
        currentHost.includes(service)
      );

      if (isProtectionService) {
        result.detected = true;
        result.type = 'protection_service_domain';
        result.confidence = 'high';
        result.details = `On protection service domain: ${currentHost}`;
      }
    } catch (error) {
      // Network check failed
      result.detected = true;
      result.type = 'network_check_failed';
      result.confidence = 'low';
      result.details = error.message;
    }

    return result;
  }

  /**
   * Check if a redirect is legitimate (SSO, CDN, etc.)
   */
  isLegitimateRedirect(hostname) {
    const legitimatePatterns = [
      /accounts\.google\.com/, /login\.microsoftonline\.com/, /okta\.com/, /auth0\.com/,
      /sso\./, /login\./, /auth\./, /signin\./, /oauth\./, /saml\./,
      /cdn\./, /assets\./, /static\./, /media\./
    ];

    return legitimatePatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Check if redirect is a common legitimate domain redirect (www, subdomain, etc.)
   */
  isCommonDomainRedirect(originalHost, currentHost) {
    // Remove www prefix for comparison
    const normalizeHost = (host) => host.replace(/^www\./, '');
    const originalNormalized = normalizeHost(originalHost);
    const currentNormalized = normalizeHost(currentHost);

    // Same domain with/without www
    if (originalNormalized === currentNormalized) {
      return true;
    }

    // Brand domain alias detection: one domain name contains the other
    // e.g., hausofaestheticsslc.com → hausofaesthetics.com (same business, location suffix removed)
    const getBaseName = (host) => host.split('.').slice(0, -1).join('.'); // Remove TLD
    const originalBase = getBaseName(originalNormalized);
    const currentBase = getBaseName(currentNormalized);

    if (originalBase && currentBase) {
      // Same TLD and one base name contains the other (min 6 chars to avoid false positives)
      const originalTld = originalNormalized.split('.').slice(-1)[0];
      const currentTld = currentNormalized.split('.').slice(-1)[0];
      const longerBase = originalBase.length >= currentBase.length ? originalBase : currentBase;
      const shorterBase = originalBase.length < currentBase.length ? originalBase : currentBase;

      if (originalTld === currentTld && shorterBase.length >= 6 && longerBase.includes(shorterBase)) {
        return true;
      }
    }

    // Check if one is a subdomain of the other
    if (originalNormalized.endsWith(`.${currentNormalized}`) ||
      currentNormalized.endsWith(`.${originalNormalized}`)) {
      return true;
    }

    // Check for common legitimate subdomain patterns
    const legitimateSubdomains = ['www', 'secure', 'shop', 'store', 'app', 'portal', 'admin', 'dashboard'];
    for (const subdomain of legitimateSubdomains) {
      if ((originalHost === `${subdomain}.${currentNormalized}`) ||
        (currentHost === `${subdomain}.${originalNormalized}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a redirect is truly suspicious based on URL analysis
   */
  isSuspiciousRedirect(originalUrl, currentUrl) {
    // Check for suspicious domain patterns
    const suspiciousDomainPatterns = [
      /\.tk$/, /\.ml$/, /\.ga$/, /\.cf$/, // Free TLD domains often used maliciously
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // IP addresses
      /[a-z0-9]{20,}\./, // Very long random subdomains
      /bit\.ly/, /tinyurl/, /t\.co/, /goo\.gl/, /ow\.ly/ // URL shorteners (could be suspicious in some contexts)
    ];

    const currentHost = currentUrl.hostname;
    if (suspiciousDomainPatterns.some(pattern => pattern.test(currentHost))) {
      return true;
    }

    // Check for suspicious path patterns in the redirect
    const suspiciousPathPatterns = [
      /\/redirect\?.*url=/, /\/go\?.*url=/, /\/link\?.*url=/,
      /\/click\?.*url=/, /\/track\?.*url=/, /\/proxy\?.*url=/
    ];

    const currentPath = currentUrl.pathname + currentUrl.search;
    if (suspiciousPathPatterns.some(pattern => pattern.test(currentPath))) {
      return true;
    }

    // Check for protocol downgrade (HTTPS to HTTP) which is suspicious
    if (originalUrl.protocol === 'https:' && currentUrl.protocol === 'http:') {
      return true;
    }

    // Check for excessive redirect chain indicators
    const redirectChainIndicators = ['redirect', 'forward', 'proxy', 'gateway', 'bounce'];
    if (redirectChainIndicators.some(indicator =>
      currentHost.includes(indicator) || currentPath.includes(indicator))) {
      return true;
    }

    return false;
  }

  /**
   * Combine confidence levels
   */
  combineConfidence(current, additional) {
    const levels = ['none', 'low', 'medium', 'high'];
    const currentIndex = levels.indexOf(current);
    const additionalIndex = levels.indexOf(additional);
    return levels[Math.max(currentIndex, additionalIndex)];
  }

  /**
   * Generate recommendations based on detection results
   */
  generateRecommendations(detection) {
    const recommendations = [];

    if (detection.confidence === 'high') {
      recommendations.push('escalate_stealth_level');
      recommendations.push('add_human_delays');
      recommendations.push('randomize_user_agent');
    }

    if (detection.type === 'suspicious_redirect') {
      recommendations.push('follow_redirect_chain');
      recommendations.push('check_redirect_legitimacy');
    }

    if (detection.type === 'dom_element_match') {
      recommendations.push('wait_for_challenge_completion');
      recommendations.push('simulate_human_interaction');
    }

    if (detection.indicators.length > 2) {
      recommendations.push('use_residential_proxy');
      recommendations.push('implement_session_rotation');
    }

    return recommendations;
  }
}

/**
 * Stealth mode manager
 */
class StealthManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.currentLevel = 'none';
  }

  /**
   * Get stealth configuration for a given level
   */
  getStealthConfig(level) {
    return STEALTH_LEVELS[level] || STEALTH_LEVELS.none;
  }

  /**
   * Apply stealth configuration to browser launch options
   */
  applyStealthToBrowserOptions(level, baseOptions = {}) {
    const config = this.getStealthConfig(level);

    return {
      ...baseOptions,
      args: [...(baseOptions.args || []), ...config.browserArgs]
    };
  }

  /**
   * Apply stealth configuration to browser context options with dynamic overrides
   */
  applyStealthToContextOptions(level, baseOptions = {}, dynamicOptions = {}) {
    const config = this.getStealthConfig(level);

    return {
      ...baseOptions,
      ...config.contextOptions,
      ...dynamicOptions, // Dynamic options like viewport can override config
      extraHTTPHeaders: {
        ...(baseOptions.extraHTTPHeaders || {}),
        ...(config.contextOptions.extraHTTPHeaders || {}),
        ...(dynamicOptions.extraHTTPHeaders || {})
      }
    };
  }

  /**
   * Apply stealth scripts to a page
   */
  async applyStealthScripts(page, level) {
    const config = this.getStealthConfig(level);

    for (const scriptName of config.initScripts) {
      if (STEALTH_SCRIPTS[scriptName]) {
        await page.addInitScript(STEALTH_SCRIPTS[scriptName]);
      }
    }
  }

  /**
   * Apply stealth wait strategies
   */
  async applyStealthWaitStrategies(page, level, timeout = 30000) {
    const config = this.getStealthConfig(level);

    for (const strategy of config.waitStrategies) {
      try {
        switch (strategy) {
          case 'domcontentloaded':
            await page.waitForLoadState('domcontentloaded', { timeout: timeout * 0.3 });
            break;
          case 'networkidle':
            await page.waitForLoadState('networkidle', { timeout: timeout * 0.7 });
            break;
          case 'stabilityCheck':
            await this.waitForStability(page, timeout * 0.2);
            break;
          case 'contentLoaded':
            await this.waitForContentLoaded(page, timeout * 0.3);
            break;
          case 'humanDelay':
            await this.addHumanDelay();
            break;
        }
      } catch (error) {
        if (this.verbose) {
          console.log(`⚠️ Wait strategy '${strategy}' failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * Wait for page stability
   */
  async waitForStability(page, timeout = 10000) {
    const startTime = Date.now();
    let lastHeight = 0;
    let stableCount = 0;
    const requiredStableChecks = 3;

    while (Date.now() - startTime < timeout && stableCount < requiredStableChecks) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === lastHeight) {
        stableCount++;
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }

      await page.waitForTimeout(1000);
    }
  }

  /**
   * Wait for content to be loaded
   */
  async waitForContentLoaded(page, timeout = 10000) {
    try {
      await page.waitForFunction(
        () => {
          const images = document.querySelectorAll('img');
          const loadedImages = Array.from(images).filter(img => img.complete);
          return loadedImages.length === images.length;
        },
        { timeout }
      );
    } catch (error) {
      // Content loading timeout is acceptable
      if (this.verbose) {
        console.log('⚠️ Content loading timeout, proceeding...');
      }
    }
  }

  /**
   * Add human-like delays
   */
  async addHumanDelay() {
    const delay = 1000 + Math.random() * 3000; // 1-4 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Main bot protection handler
 */
class BotProtectionHandler {
  constructor(options = {}) {
    this.detector = new BotProtectionDetector(options);
    this.stealthManager = new StealthManager(options);
    this.verbose = options.verbose || false;
    this.maxRetries = options.maxRetries || 4;
  }

  /**
   * Attempt to access a URL with automatic bot protection mitigation
   */
  async accessWithProtection(url, options = {}) {
    const stealthLevels = ['none', 'basic', 'medium', 'advanced'];
    let currentLevelIndex = 0;
    let lastError = null;
    let lastDetection = null;

    // Start with specified stealth level if provided
    if (options.stealthLevel) {
      const specifiedIndex = stealthLevels.indexOf(options.stealthLevel);
      if (specifiedIndex !== -1) {
        currentLevelIndex = specifiedIndex;
      }
    }

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const currentLevel = stealthLevels[currentLevelIndex];

      try {
        if (this.verbose && attempt > 0) {
          console.log(`🔄 Attempt ${attempt + 1}/${this.maxRetries} with stealth level: ${currentLevel}`);
        }

        const result = await this.attemptAccess(url, currentLevel, options);

        // Setup network monitoring for bot protection detection
        this.detector.setupNetworkMonitoring(result.page);

        // Wait a moment for any immediate redirects or challenges
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check for bot protection
        const detection = await this.detector.detectProtection(result.page, url);
        lastDetection = detection;

        // Only escalate for medium or high confidence detections
        const shouldEscalate = detection.detected &&
          (detection.confidence === 'medium' || detection.confidence === 'high');

        if (!detection.detected || !shouldEscalate) {
          // Success or low confidence detection (proceed anyway)
          if (this.verbose) {
            if (detection.detected && detection.confidence === 'low') {
              console.log(`⚠️ Low confidence bot protection detected (${detection.type}), proceeding anyway`);
            }
            console.log(`✅ Successfully accessed ${url} with stealth level: ${currentLevel}`);
            if (attempt > 0) {
              console.log(`🔄 Required ${attempt + 1} attempts to access`);
            }
          }

          return {
            success: true,
            page: result.page,
            browser: result.browser,
            context: result.context,
            stealthLevel: currentLevel,
            attempts: attempt + 1,
            detection
          };
        }

        // Bot protection detected with medium/high confidence, escalate if possible
        if (currentLevelIndex < stealthLevels.length - 1) {
          currentLevelIndex++;

          if (this.verbose) {
            console.log(`🛡️ Bot protection detected (${detection.type}, confidence: ${detection.confidence}). Escalating to: ${stealthLevels[currentLevelIndex]}`);
            if (detection.indicators.length > 0) {
              console.log(`📊 Detection indicators: ${detection.indicators.map(i => i.type).join(', ')}`);
            }
          }

          // Clean up current attempt
          await result.browser.close();

          // Add progressive delay before retry
          const delay = 2000 + (attempt * 1000) + (Math.random() * 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // Max stealth level reached, but still detected
          const errorMessage = `Bot protection persists at maximum stealth level (${currentLevel}): ${detection.type}`;
          lastError = new Error(errorMessage);
          lastError.detection = detection;
          lastError.stealthLevel = currentLevel;
          lastError.attempts = attempt + 1;

          await result.browser.close();
          break;
        }

      } catch (error) {
        lastError = error;

        // Enhance error with context
        error.attempt = attempt + 1;
        error.stealthLevel = currentLevel;
        error.url = url;

        // Check if this is a bot protection related error
        const isBotError = this.isBotProtectionError(error);

        if (isBotError && currentLevelIndex < stealthLevels.length - 1) {
          currentLevelIndex++;

          if (this.verbose) {
            console.log(`🛡️ Bot protection error detected: ${error.message}`);
            console.log(`🔄 Escalating to stealth level: ${stealthLevels[currentLevelIndex]}`);
          }

          // Add progressive delay before retry
          const delay = 2000 + (attempt * 1000) + (Math.random() * 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-bot error or max stealth reached
        if (this.verbose) {
          console.log(`❌ Non-retryable error at stealth level ${currentLevel}: ${error.message}`);
        }
        break;
      }
    }

    // Enhance the final error with comprehensive information
    if (lastError) {
      lastError.finalAttempts = this.maxRetries;
      lastError.finalStealthLevel = stealthLevels[Math.min(currentLevelIndex, stealthLevels.length - 1)];
      lastError.lastDetection = lastDetection;

      if (this.verbose) {
        console.log(`❌ Failed to access ${url} after ${this.maxRetries} attempts`);
        console.log(`🔧 Final stealth level: ${lastError.finalStealthLevel}`);
        if (lastDetection) {
          console.log(`🛡️ Last detection: ${lastDetection.type} (confidence: ${lastDetection.confidence})`);
        }
      }
    }

    throw lastError || new Error(`Failed to access URL after ${this.maxRetries} retries (unknown error state)`);
  }

  /**
   * Attempt to access URL with specific stealth level
   */
  async attemptAccess(url, stealthLevel, options = {}) {
    const browserOptions = this.stealthManager.applyStealthToBrowserOptions(stealthLevel, {
      headless: options.headless !== false
    });

    const browser = await chromium.launch(browserOptions);

    // Prepare dynamic context options (like viewport)
    const dynamicOptions = {};
    if (options.viewport) {
      dynamicOptions.viewport = options.viewport;
    }

    const contextOptions = this.stealthManager.applyStealthToContextOptions(stealthLevel, {}, dynamicOptions);

    // Only add httpCredentials if they exist
    if (options.httpCredentials) {
      contextOptions.httpCredentials = options.httpCredentials;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Apply stealth scripts
    await this.stealthManager.applyStealthScripts(page, stealthLevel);

    // Navigate to URL with enhanced error handling
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeout || 30000
      });
    } catch (navigationError) {
      // Enhance navigation errors with context
      navigationError.phase = 'navigation';
      navigationError.stealthLevel = stealthLevel;
      navigationError.url = url;
      throw navigationError;
    }

    // Apply stealth wait strategies
    try {
      await this.stealthManager.applyStealthWaitStrategies(page, stealthLevel, options.timeout);
    } catch (waitError) {
      // Wait strategy failures are often acceptable, log but don't fail
      if (this.verbose) {
        console.log(`⚠️ Wait strategy partially failed: ${waitError.message}`);
      }
    }

    return { page, browser, context };
  }

  /**
   * Check if an error is related to bot protection (enhanced patterns)
   */
  isBotProtectionError(error) {
    const botErrorPatterns = [
      // Direct bot protection messages
      'bot protection', 'cloudflare', 'captcha', 'challenge', 'access denied',
      'forbidden', 'ddos protection', 'security check', 'verify you are human',
      'browser verification', 'human verification', 'anti-bot',

      // HTTP status codes
      '403', '429', '503', '406', '451',

      // Network errors that might indicate blocking
      'timeout', 'connection refused', 'connection reset', 'connection closed',
      'network changed', 'failed', 'blocked', 'denied',

      // Specific service indicators
      'incapsula', 'imperva', 'perimeterx', 'datadome', 'kasada', 'akamai',
      'distil', 'sucuri', 'wordfence',

      // Navigation specific errors
      'navigation timeout', 'page.goto: timeout', 'net::err_failed',
      'net::err_connection_refused', 'net::err_timed_out'
    ];

    const errorMessage = error.message.toLowerCase();
    return botErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Get detailed error information for debugging
   */
  getErrorDetails(error) {
    return {
      message: error.message,
      type: error.constructor.name,
      stealthLevel: error.stealthLevel || 'unknown',
      attempt: error.attempt || 'unknown',
      url: error.url || 'unknown',
      phase: error.phase || 'unknown',
      detection: error.detection || null,
      isBotRelated: this.isBotProtectionError(error)
    };
  }
}

module.exports = {
  BotProtectionDetector,
  StealthManager,
  BotProtectionHandler,
  STEALTH_LEVELS,
  BOT_PROTECTION_SIGNATURES
}; 