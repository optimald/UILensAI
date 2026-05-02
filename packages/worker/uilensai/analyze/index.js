/**
 * Main Analysis Orchestrator for UILensAI - Refactored for Schema v3.11.0
 *
 * This module coordinates the execution of various analysis modules (UI, Performance, SEO, etc.)
 * based on user options. It gathers results from each module and compiles them.
 */

// Dynamically require modules to avoid circular dependencies if modules use utils that use this.
// This is a common pattern for orchestrators.
const MODULE_PATHS = {
  ui: './ui',
  performance: './performance',
  seoContent: './seoContent', // Corrected name
  security: './security',
  privacy: './privacy',
  compatibility: './compatibility',
  marketing: './marketing',
  conversion: './conversion',
  accessibility: './accessibility',
  siteHealth: './siteHealth',
};

const { getModelConfig, getModelConfigAsync } = require('../utils/ai-credentials'); // For passing model config options
const { detectIndustry } = require('../utils/industry-detection');
const { getPresetConfig } = require('../utils/presets'); // To get default featureSet based on tier
const { getRatingLabelForScore } = require('../utils/scoring-engine'); // For error handling
const CostAggregator = require('../utils/costAggregator'); // For tracking AI costs
const { selectIntelligentModel } = require('../utils/ai-models'); // Import for model selection preview
const { resetDynamicCache } = require('../config/model-defaults'); // For resetting dynamic cache between scans

/**
 * Run promises with concurrency control
 * @param {Array<Function>} tasks - Array of async functions to execute
 * @param {number} concurrency - Max concurrent tasks (0 = unlimited)
 * @returns {Promise<Array>} Results in same order as input tasks
 */
async function runWithConcurrency(tasks, concurrency = 0) {
  if (concurrency <= 0 || concurrency >= tasks.length) {
    // No limit - run all in parallel
    return Promise.allSettled(tasks.map(task => task()));
  }

  // Run with concurrency limit using chunking
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(task => task()));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Orchestrates the analysis by running selected modules.
 *
 * @param {Object} options - The main analysis options.
 * @param {string} options.url - The URL to analyze.
 * @param {Object} options.page - The Playwright page object for the loaded URL.
 * @param {Object} options.browser - The Playwright browser instance.
 * @param {Array<string>} options.modulesToRun - Array of module names to execute.
 * @param {string} options.tier - Service tier ('Basic', 'Pro', 'Enterprise').
 * @param {string} [options.analysisDepth='basic'] - Overall analysis depth.
 * @param {Object} [options.modelConfig={}] - AI model preferences { modelFamily, model, maxTokens }.
 * @param {Object} [options.captureOptions={}] - Options for screenshot capture.
 * @param {string} [options.industryHint=null] - User-provided industry hint.
 * @param {string} [options.targetWcagLevel="AA"] - Target WCAG level for accessibility.
 * @param {string} [options.lighthouseFormFactor=null] - Form factor for Lighthouse in performance.
 * @param {Function} [options.onProgress] - Callback for progress updates.
 * @param {boolean} [options.verbose=false] - Verbose logging.
 * @returns {Promise<Object>} An object containing results from all executed modules and context.
 */
async function analyzeWebsite(options) {
  const {
    url,
    page,
    browser,
    modulesToRun: _modulesToRun,
    modules: _modules,
    tier = 'Basic',
    analysisDepth: globalAnalysisDepth = 'basic', // Default depth
    modelConfig: globalModelConfig = {},
    captureOptions = {},
    industryHint = null,
    targetWcagLevel = "AA",
    lighthouseFormFactor = null,
    onProgress,
    verbose = false,
    // PARALLEL EXECUTION OPTIONS
    moduleConcurrency = 0, // 0 = unlimited (all modules run in parallel), >0 = max concurrent modules
    // DEEP CRAWL DATA (from Cloudflare Browser Rendering /crawl endpoint)
    crawlData = null,
    // PSI API mode (use Google PageSpeed Insights instead of local Lighthouse)
    usePSI = false,
  } = options;

  const modulesToRun = _modulesToRun || _modules || ['ui', 'performance'];

  const startTimestamp = Date.now();
  if (verbose) { console.log(`[AnalyzeIndex] Starting analysis for ${url}. Modules: ${modulesToRun.join(', ')}. Tier: ${tier}. Depth: ${globalAnalysisDepth}.`); }

  // Initialize cost aggregator for tracking AI costs throughout the analysis
  const costAggregator = new CostAggregator();

  // Pre-warm dynamic model selector — fetches live model pricing from OpenRouter API
  // This caches the cheapest qualifying models for all modules before they start
  try {
    resetDynamicCache(); // Clear stale cache from previous scans
    await getModelConfigAsync({ moduleName: 'performance', tier, vision: false });
    if (verbose) { console.log(`[AnalyzeIndex] Dynamic model selector pre-warmed for tier: ${tier}`); }
  } catch (e) {
    if (verbose) { console.warn(`[AnalyzeIndex] Dynamic model pre-warm failed, using hardcoded defaults: ${e.message}`); }
  }

  const analysisResults = {
    modules: {}, // To store results from each module
    industryContext: null,
    featureSet: {}, // Will be populated based on tier
    overallStatus: { status: 'Pending', modulesAttempted: 0, modulesSucceeded: 0, modulesFailed: 0 },
    errors: [],
    costAggregator // Pass the cost aggregator to be used by modules and report generation
  };

  try {
    // CRITICAL FIX: Page object lifecycle management
    let activePage = page;
    let activeBrowser = browser;

    // CRITICAL FIX: Don't set page/browser to null on validation failure
    // Instead, keep the original objects and let individual modules handle validation
    if (activePage && activeBrowser) {
      try {
        // FIX: isClosed() and isConnected() are synchronous methods, not async
        const isPageValid = !activePage.isClosed();
        const isBrowserValid = activeBrowser.isConnected();

        if (!isPageValid || !isBrowserValid) {
          if (verbose) { console.warn(`[AnalyzeIndex] Initial page/browser validation failed. Page valid: ${isPageValid}, Browser valid: ${isBrowserValid}`); }
          // DON'T set to null - let individual modules handle validation and recovery
          // activePage = null;  // REMOVED - too aggressive
          // activeBrowser = null; // REMOVED - too aggressive
        }
      } catch (validationError) {
        if (verbose) { console.warn(`[AnalyzeIndex] Initial validation error: ${validationError.message}`); }
        // DON'T set to null - let individual modules handle validation and recovery
        // activePage = null;  // REMOVED - too aggressive
        // activeBrowser = null; // REMOVED - too aggressive
      }
    }

    // 1. Determine FeatureSet based on tier (from presets)
    // This is crucial as featureSet dictates conditional fields in modules.
    const presetConfig = getPresetConfig(tier); // Handles unknown tier by defaulting to free
    analysisResults.featureSet = { ...(presetConfig.featureSet || {}) };
    // Override preset analysisDepth if explicitly provided in options
    const effectiveAnalysisDepth = options.analysisDepth || presetConfig.analysisDepth || globalAnalysisDepth;

    // Allow callers to explicitly define viewports via options.viewports, options.testParameters.viewports, or captureOptions
    const effectiveCaptureOptions = { ...captureOptions };
    const explicitlyRequestedViewports = options.viewports || options.testParameters?.viewports || effectiveCaptureOptions.viewports;
    
    if (explicitlyRequestedViewports && explicitlyRequestedViewports.length > 0) {
      effectiveCaptureOptions.viewports = explicitlyRequestedViewports;
    } else {
      // Default to standard viewports to avoid automatically capturing 6-8 screenshots on higher tiers
      effectiveCaptureOptions.viewports = ['mobile', 'tablet', 'desktop'];
    }

    if (onProgress) { onProgress(null, 'Initializing analysis context', 5); }

    // 2. Detect Industry Context (run once, pass to all modules)
    if (verbose) { console.log('[AnalyzeIndex] Detecting industry context...'); }

    // When no browser page is available, pre-fetch HTML so industry detection has content to classify
    let prefetchedHtml = null;
    let prefetchedFinalUrl = null;
    if (!page) {
      try {
        if (verbose) { console.log('[AnalyzeIndex] 🌐 No browser — pre-fetching HTML for industry detection'); }
        const { fetchWithHeaders } = require('../utils/http-fallback');
        const httpResponse = await fetchWithHeaders(url, { timeout: 15000 });
        if (httpResponse.body && httpResponse.body.length > 0) {
          prefetchedHtml = httpResponse.body;
          prefetchedFinalUrl = httpResponse.finalUrl || url;
          if (verbose) { console.log(`[AnalyzeIndex] ✅ Pre-fetched ${(prefetchedHtml.length / 1024).toFixed(0)}KB HTML for industry detection`); }
        }
      } catch (fetchError) {
        if (verbose) { console.warn(`[AnalyzeIndex] ⚠️ HTML pre-fetch failed: ${fetchError.message}`); }
      }
    }

    const industryDetectionResult = await detectIndustry({
      url, page, htmlContent: prefetchedHtml, industryHint, verbose, tier,
      preferredModelFamily: globalModelConfig.modelFamily,
      costAggregator // Pass cost aggregator to track industry detection costs
    });

    analysisResults.industryContext = industryDetectionResult.industryContext || industryDetectionResult;

    // Track industry detection cost if available
    if (industryDetectionResult.usage) {
      costAggregator.addFromUsage('IndustryDetection', industryDetectionResult.usage);
      if (verbose) {
        console.log(`[AnalyzeIndex] Industry detection cost: $${industryDetectionResult.usage.costUSD.toFixed(6)}`);
      }
    }

    if (verbose) { console.log('[AnalyzeIndex] Industry context detected:', analysisResults.industryContext); }
    if (onProgress) { onProgress(null, 'Industry context detected', 10); }

    // 2.5. PRE-EXTRACT SHARED PAGE DATA (Quick Win: ~20% speedup)
    // Extract common page data ONCE before parallel module execution
    let sharedPageContext = null;
    if (activePage && !activePage.isClosed()) {
      try {
        const extractionStart = Date.now();
        sharedPageContext = await activePage.evaluate(() => {
          // Common metadata used by multiple modules
          const title = document.title || '';
          const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
          const metaKeywords = document.querySelector('meta[name="keywords"]')?.content || '';
          const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || '';
          const htmlLang = document.documentElement.lang || '';
          const viewportMeta = document.querySelector('meta[name="viewport"]')?.content || '';

          // Open Graph data
          const ogData = {
            title: document.querySelector('meta[property="og:title"]')?.content || '',
            description: document.querySelector('meta[property="og:description"]')?.content || '',
            image: document.querySelector('meta[property="og:image"]')?.content || '',
          };

          // Headings structure
          const headings = {
            h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 5),
            h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 10),
            h3Count: document.querySelectorAll('h3').length
          };

          // Links count
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          const links = {
            internal: allLinks.filter(a => a.hostname === window.location.hostname).length,
            external: allLinks.filter(a => a.hostname !== window.location.hostname).length,
            total: allLinks.length
          };

          // Forms
          const forms = Array.from(document.querySelectorAll('form')).map(f => ({
            action: f.action || '',
            method: f.method || 'get',
            inputCount: f.querySelectorAll('input, textarea, select').length,
            hasPassword: !!f.querySelector('input[type="password"]')
          })).slice(0, 10);

          // Resources
          const resources = {
            scriptCount: document.querySelectorAll('script').length,
            stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length
          };

          // Body text sample
          const bodyText = document.body?.innerText?.replace(/\s+/g, ' ').trim().substring(0, 5000) || '';

          // Images
          const images = {
            total: document.querySelectorAll('img').length,
            withAlt: document.querySelectorAll('img[alt]').length
          };

          // Social media links (pre-collected for marketing module)
          const socialPlatforms = new Set();
          const socialLinks = [];
          const sharingKeywords = ['facebook.com/sharer', 'twitter.com/intent/tweet', 'x.com/intent/', 'linkedin.com/shareArticle', 'pinterest.com/pin/create'];
          let sharingButtonsDetected = false;
          allLinks.forEach(a => {
            const href = a.href?.toLowerCase() || '';
            if (!href || href === '#' || href.startsWith('javascript:')) return;
            if ((href.includes('facebook.com/') || href.includes('fb.com/')) && !href.includes('sharer') && !href.includes('/dialog/')) { socialPlatforms.add('Facebook'); socialLinks.push(href); }
            if ((href.includes('twitter.com/') || href.includes('x.com/')) && !href.includes('intent/tweet') && !href.includes('/intent/')) { socialPlatforms.add('Twitter/X'); socialLinks.push(href); }
            if (href.includes('linkedin.com/')) { socialPlatforms.add('LinkedIn'); socialLinks.push(href); }
            if (href.includes('instagram.com/')) { socialPlatforms.add('Instagram'); socialLinks.push(href); }
            if (href.includes('youtube.com/') || href.includes('youtu.be/')) { socialPlatforms.add('YouTube'); socialLinks.push(href); }
            if (href.includes('pinterest.com/') && !href.includes('pin/create')) { socialPlatforms.add('Pinterest'); socialLinks.push(href); }
            if (href.includes('tiktok.com/')) { socialPlatforms.add('TikTok'); socialLinks.push(href); }
            if (href.includes('yelp.com/biz/')) { socialPlatforms.add('Yelp'); socialLinks.push(href); }
            if (href.includes('bbb.org/')) { socialPlatforms.add('BBB'); socialLinks.push(href); }
            if (href.includes('nextdoor.com/')) { socialPlatforms.add('Nextdoor'); socialLinks.push(href); }
            if (href.includes('houzz.com/')) { socialPlatforms.add('Houzz'); socialLinks.push(href); }
            if (href.includes('realself.com/')) { socialPlatforms.add('RealSelf'); socialLinks.push(href); }
            if (href.includes('google.com/maps') || href.includes('maps.google.com') || href.includes('g.page/')) { socialPlatforms.add('Google Business'); socialLinks.push(href); }
            if (!sharingButtonsDetected && sharingKeywords.some(k => href.includes(k))) { sharingButtonsDetected = true; }
          });
          // Fallback: icon classes
          if (socialPlatforms.size === 0) {
            document.querySelectorAll('a[href], [role="link"]').forEach(el => {
              const combined = ((el.className || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
              if (combined.includes('facebook') || combined.includes('fa-facebook')) socialPlatforms.add('Facebook');
              if (combined.includes('twitter') || combined.includes('fa-twitter') || combined.includes('fa-x-twitter')) socialPlatforms.add('Twitter/X');
              if (combined.includes('instagram') || combined.includes('fa-instagram')) socialPlatforms.add('Instagram');
              if (combined.includes('linkedin') || combined.includes('fa-linkedin')) socialPlatforms.add('LinkedIn');
              if (combined.includes('youtube') || combined.includes('fa-youtube')) socialPlatforms.add('YouTube');
              if (combined.includes('tiktok') || combined.includes('fa-tiktok')) socialPlatforms.add('TikTok');
            });
          }
          const ogTagsPresent = !!document.querySelector('meta[property^="og:"]');
          const twitterCardPresent = !!document.querySelector('meta[name^="twitter:"]');

          return {
            title, metaDescription, metaKeywords, canonicalUrl, htmlLang, viewportMeta,
            ogData, headings, links, forms, resources, bodyText, images,
            url: window.location.href,
            socialMedia: {
              linkedPlatforms: Array.from(socialPlatforms).slice(0, 15),
              sharingButtonsDetected,
              ogTagsPresent,
              twitterCardPresent,
              socialLinksCount: socialLinks.length
            }
          };
        });

        if (verbose) {
          console.log(`[AnalyzeIndex] ✅ Shared page context extracted in ${Date.now() - extractionStart}ms`);
        }
      } catch (extractionError) {
        if (verbose) {
          console.warn(`[AnalyzeIndex] ⚠️ Shared page context extraction failed: ${extractionError.message}`);
        }
      }
    } else if (!activePage || activePage.isClosed()) {
      // NO-BROWSER MODE: Extract shared context from raw HTML
      try {
        const extractionStart = Date.now();
        const { extractSharedContextFromHtml } = require('../utils/cfHtmlExtractor');

        // Reuse HTML already fetched for industry detection if available
        let htmlBody = prefetchedHtml;
        let finalUrl = prefetchedFinalUrl || url;
        if (!htmlBody) {
          if (verbose) console.log('[AnalyzeIndex] 🌐 No browser — fetching HTML for shared context extraction');
          const { fetchWithHeaders } = require('../utils/http-fallback');
          const httpResponse = await fetchWithHeaders(url, { timeout: 30000 });
          htmlBody = httpResponse.body;
          finalUrl = httpResponse.finalUrl || url;
        } else {
          if (verbose) console.log('[AnalyzeIndex] ♻️ Reusing pre-fetched HTML for shared context extraction');
        }

        if (htmlBody && htmlBody.length > 0) {
          sharedPageContext = extractSharedContextFromHtml(htmlBody, finalUrl);
          // Store raw HTML for modules that need deeper extraction (e.g., conversion CTA/trust)
          sharedPageContext._rawHtml = htmlBody;
          if (verbose) {
            console.log(`[AnalyzeIndex] ✅ HTML-based shared context extracted in ${Date.now() - extractionStart}ms (${(htmlBody.length / 1024).toFixed(0)}KB HTML)`);
          }
        } else {
          if (verbose) console.warn('[AnalyzeIndex] ⚠️ HTTP response body was empty');
        }
      } catch (htmlError) {
        if (verbose) {
          console.warn(`[AnalyzeIndex] ⚠️ HTML-based context extraction failed: ${htmlError.message}`);
        }
      }
    }

    // 2.55. MERGE DEEP CRAWL DATA into shared context (if available)
    if (crawlData && crawlData.pages && crawlData.pages.length > 0) {
      if (!sharedPageContext) {
        sharedPageContext = {};
      }
      sharedPageContext.crawledPages = crawlData.pages;
      sharedPageContext.crawlMetadata = crawlData.metadata;
      // Structured extractions from Cloudflare /json endpoint (typed business data)
      if (crawlData.structuredExtractions && crawlData.structuredExtractions.length > 0) {
        sharedPageContext.structuredExtractions = crawlData.structuredExtractions;
      }

      // CRITICAL FIX: Enrich sharedPageContext from CF-rendered homepage for JS-rendered sites
      // When raw HTTP extraction gets thin (pre-render shell), the CF crawl has JS-rendered content
      const bodyWordCount = (sharedPageContext.bodyText || '').split(/\s+/).filter(Boolean).length;
      const isContentThin = bodyWordCount < 500 || !sharedPageContext.title;

      if (isContentThin) {
        // Find the homepage in crawled pages (URL matches or is first page)
        const normalizeUrl = (u) => (u || '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
        const homepageEntry = crawlData.pages.find(p => normalizeUrl(p.url) === normalizeUrl(url))
          || crawlData.pages[0]; // Fallback to first page

        if (homepageEntry && homepageEntry.markdown) {
          if (verbose) {
            console.log(`[AnalyzeIndex] 🔄 ENRICHING sharedPageContext from CF-rendered homepage (raw was thin: ${bodyWordCount} words)`);
          }

          // Extract title from CF crawl if missing
          if (!sharedPageContext.title && homepageEntry.title) {
            sharedPageContext.title = homepageEntry.title;
            if (verbose) console.log(`[AnalyzeIndex]   📝 Title from crawl: "${homepageEntry.title}"`);
          }

          // Extract body text from markdown if thin
          const markdownPlainText = (homepageEntry.markdown || '')
            .replace(/!\[.*?\]\(.*?\)/g, '')       // images
            .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links
            .replace(/[#*_~`>|]/g, '')             // markdown syntax
            .replace(/\s+/g, ' ')
            .trim();

          if (markdownPlainText.length > (sharedPageContext.bodyText || '').length) {
            sharedPageContext.bodyText = markdownPlainText.substring(0, 5000);
            if (verbose) console.log(`[AnalyzeIndex]   📝 Body text enriched from crawl: ${markdownPlainText.split(/\s+/).length} words`);
          }

          // Extract headings from markdown
          const h1Matches = homepageEntry.markdown.match(/^#\s+(.+)$/gm) || [];
          const h2Matches = homepageEntry.markdown.match(/^##\s+(.+)$/gm) || [];
          const h3Matches = homepageEntry.markdown.match(/^###\s+(.+)$/gm) || [];

          if (h1Matches.length > 0 || h2Matches.length > 0) {
            const existingH1Count = (sharedPageContext.headings?.h1 || []).length;
            if (existingH1Count === 0) {
              sharedPageContext.headings = {
                h1: h1Matches.map(h => h.replace(/^#+\s+/, '').trim()).slice(0, 5),
                h2: h2Matches.map(h => h.replace(/^#+\s+/, '').trim()).slice(0, 10),
                h3Count: h3Matches.length,
              };
              if (verbose) console.log(`[AnalyzeIndex]   📝 Headings from crawl: ${h1Matches.length} H1, ${h2Matches.length} H2, ${h3Matches.length} H3`);
            }
          }

          // Extract links from markdown
          const internalLinkRegex = new RegExp(`\\[([^\\]]*)\\]\\((?:https?://(www\\.)?${normalizeUrl(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?/[^)]*\\)`, 'gi');
          const externalLinkRegex = /\[([^\]]*)\]\(https?:\/\/[^)]+\)/gi;
          const allMdLinks = homepageEntry.markdown.match(externalLinkRegex) || [];
          const internalMdLinks = homepageEntry.markdown.match(internalLinkRegex) || [];

          if ((!sharedPageContext.links || (sharedPageContext.links.internal === 0 && sharedPageContext.links.external === 0)) && allMdLinks.length > 0) {
            sharedPageContext.links = {
              internal: internalMdLinks.length,
              external: allMdLinks.length - internalMdLinks.length,
              total: allMdLinks.length,
            };
            if (verbose) console.log(`[AnalyzeIndex]   📝 Links from crawl: ${internalMdLinks.length} internal, ${allMdLinks.length - internalMdLinks.length} external`);
          }

          // Extract meta description from OG data if available in crawl
          if (!sharedPageContext.metaDescription && homepageEntry.ogDescription) {
            sharedPageContext.metaDescription = homepageEntry.ogDescription;
          }
        }
      }

      // ENRICHMENT: Build a compact summary of subpage content for AI multi-page context
      const normalizeUrlPath = (u) => {
        try {
          return new URL(u).pathname.replace(/\/+$/, '') || '/';
        } catch { return String(u).replace(/^https?:\/\/[^\/]+/, '').replace(/\/+$/, '') || '/'; }
      };
      
      const homepagePath = normalizeUrlPath(url);
      const subpages = crawlData.pages
        .filter(p => p.markdown && normalizeUrlPath(p.url) !== homepagePath)
        .slice(0, 5); // Take top 5 subpages (e.g. /contact, /about, /services)
        
      if (subpages.length > 0) {
        const subpageTexts = subpages.map(p => {
          // Clean the markdown to save tokens
          const cleanMd = p.markdown
            .replace(/!\[.*?\]\(.*?\)/g, '')       // remove images
            .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // flatten links
            .replace(/\s+/g, ' ')                  // collapse whitespace
            .trim();
          return `--- Page: ${normalizeUrlPath(p.url)} (Title: ${p.title || 'N/A'}) ---\n${cleanMd.substring(0, 1500)}`;
        });
        sharedPageContext.subpageContentSummary = subpageTexts.join('\n\n').substring(0, 8000);
      } else {
        sharedPageContext.subpageContentSummary = "No subpages crawled or available.";
      }

      if (verbose) {
        console.log(`[AnalyzeIndex] 🕷️ Deep crawl data merged: ${crawlData.pages.length} subpages, ${crawlData.structuredExtractions?.length || 0} structured extractions`);
        if (sharedPageContext.subpageContentSummary) {
          console.log(`[AnalyzeIndex]   📝 Extracted ${subpages.length} subpages into AI context (${sharedPageContext.subpageContentSummary.length} chars)`);
        }
      }
    }

    // 2.7. BROWSER AUDIT (optional — runs if Worker URL configured)
    // Calls the deployed CF Browser Audit Worker for runtime data collection:
    // axe-core violations, cookies, computed styles, console errors, CTA positions, network requests
    if (process.env.BROWSER_AUDIT_WORKER_URL) {
      try {
        const auditStart = Date.now();
        if (verbose) { console.log('[AnalyzeIndex] 🔬 Starting Browser Audit Worker call...'); }
        if (onProgress) { onProgress(null, 'Running browser audit (axe-core, cookies, styles)', 12); }

        const { runBrowserAudit } = require('../services/cfBrowserAuditService');
        const browserAuditData = await runBrowserAudit(url, { verbose, timeout: 30000 });

        if (browserAuditData) {
          if (!sharedPageContext) { sharedPageContext = {}; }
          sharedPageContext.browserAudit = browserAuditData;

          if (verbose) {
            const elapsed = ((Date.now() - auditStart) / 1000).toFixed(1);
            console.log(`[AnalyzeIndex] ✅ Browser audit merged in ${elapsed}s: ${browserAuditData.axeResults?.violationCount ?? 0} axe violations, ${browserAuditData.cookies?.length ?? 0} cookies, ${browserAuditData.consoleErrors?.length ?? 0} console errors`);
          }
        } else if (verbose) {
          console.log('[AnalyzeIndex] ⏭️  Browser audit returned null (Worker unavailable or failed)');
        }
      } catch (auditError) {
        if (verbose) {
          console.warn(`[AnalyzeIndex] ⚠️ Browser audit failed (non-blocking): ${auditError.message}`);
        }
        // Non-blocking — modules continue without browser audit data
      }
    }

    // 3. Execute selected modules IN PARALLEL for 10x speed improvement
    // Each module runs independently and concurrently - no waiting for others
    const totalModules = modulesToRun.length;

    if (verbose) {
      console.log(`[AnalyzeIndex] 🚀 PARALLEL EXECUTION: Starting ${totalModules} modules concurrently`);
      console.log(`[AnalyzeIndex] Modules: ${modulesToRun.join(', ')}`);
    }

    // Track progress per module independently (for parallel execution)
    const moduleProgressState = {};
    modulesToRun.forEach(mod => {
      moduleProgressState[mod] = { started: false, completed: false, progress: 0 };
    });

    // 2.6. PRE-CALCULATE PRELIMINARY GLOBAL STATE (Gold Standard)
    // Extract available state from shared context before modules run
    const formsDetected = (sharedPageContext && sharedPageContext.forms && sharedPageContext.forms.length > 0);
    const preliminaryGlobalState = {
      formsDetected: formsDetected,
      sslHandshakeSuccess: true, // Optimistic default, updated later by security module if failed
      privacyPolicyPresent: true // Optimistic default, updated later
    };

    if (verbose) {
      console.log(`[AnalyzeIndex] Preliminary Global State: Forms=${formsDetected}`);
    }

    // SERVERLESS-FIRST: All modules run with sharedPageContext from HTML extraction.
    // No browser validation needed — modules gracefully handle null page.

    // Create module execution task factories (functions that return promises)
    const moduleTasks = modulesToRun.map((moduleName) => async () => {
      const moduleStartTime = Date.now();

      try {
        if (!MODULE_PATHS[moduleName]) {
          throw new Error(`Analysis module '${moduleName}' is not recognized or supported.`);
        }

        moduleProgressState[moduleName].started = true;
        if (verbose) { console.log(`[AnalyzeIndex] [${moduleName}] Starting analysis...`); }

        const moduleAnalyzer = require(MODULE_PATHS[moduleName]);

        // PREPARE MODULE OPTIONS
        const moduleOptions = {
          url,
          page: activePage,
          browser: activeBrowser,
          analysisDepth: effectiveAnalysisDepth,
          tier,
          featureSet: analysisResults.featureSet,
          industryContext: analysisResults.industryContext,
          globalState: preliminaryGlobalState, // Quick access for UI module
          modelFamily: globalModelConfig.modelFamily,
          model: globalModelConfig.model,
          maxTokens: globalModelConfig.maxTokens,
          testingMode: globalModelConfig.testingMode,
          targetWcagLevel: moduleName === 'accessibility' ? targetWcagLevel : undefined,
          lighthouseFormFactor: moduleName === 'performance' ? lighthouseFormFactor : undefined,
          usePSI: moduleName === 'performance' ? usePSI : undefined,
          captureOptions: moduleName === 'ui' ? effectiveCaptureOptions : undefined,
          screenshotPaths: moduleName === 'ui' ? options.screenshotPaths : undefined,
          crawlPages: moduleName === 'siteHealth' ? (crawlData?.pages || []) : undefined,
          costAggregator,
          verbose,
          onProgress: (...args) => {
            if (onProgress) {
              // Auto-detect calling convention:
              // Convention A (7 modules): onProgress(moduleName, statusString, percent)
              // Convention B (2 modules): onProgress(statusString, percent, details)
              let moduleStatus, percent, details;
              if (args.length >= 2 && typeof args[1] === 'string') {
                // Convention A: first arg is redundant module name, second is status string, third is percent
                moduleStatus = args[1];
                percent = typeof args[2] === 'number' ? args[2] : 0;
                details = args[3] || null;
              } else {
                // Convention B: first arg is status, second is percent, third is details
                moduleStatus = args[0];
                percent = typeof args[1] === 'number' ? args[1] : 0;
                details = args[2] || null;
              }

              const validPercent = Math.max(0, Math.min(100, percent));
              moduleProgressState[moduleName].progress = validPercent;

              // Calculate overall progress from all modules
              const inProgressSum = Object.values(moduleProgressState).reduce((sum, s) => sum + (s.completed ? 100 : s.progress), 0);
              const overallProgress = 10 + Math.floor((inProgressSum / totalModules) * 0.85);

              if (verbose) {
                console.log(`[AnalyzeIndex] [${moduleName}] Progress: ${validPercent}% | Overall: ${overallProgress}%`);
              }

              onProgress(moduleName, moduleStatus, overallProgress, details);
            }
          },
          dependencies: {
            crossModuleContext: {
              industryContext: analysisResults.industryContext,
              tier: tier,
              analysisDepth: effectiveAnalysisDepth,
              featureSet: analysisResults.featureSet,
              url: url,
              globalState: preliminaryGlobalState // Pass preliminary state for specialized prompt logic
            }
          },
          // QUICK WIN: Pre-extracted shared page context
          sharedPageContext: sharedPageContext
        };

        const urlToPass = url;
        const collectedDataToPass = sharedPageContext || {};
        const screenshotsToPass = moduleName === 'ui' ? (options.screenshotPaths || effectiveCaptureOptions) : null;
        
        // Execute module
        if (verbose) { console.log(`[AnalyzeIndex] [${moduleName}] Executing...`); }
        const result = await moduleAnalyzer.analyze(urlToPass, collectedDataToPass, screenshotsToPass, moduleOptions);

        moduleProgressState[moduleName].completed = true;
        moduleProgressState[moduleName].progress = 100;

        const moduleEndTime = Date.now();
        const moduleDuration = ((moduleEndTime - moduleStartTime) / 1000).toFixed(1);

        if (verbose) {
          const moduleScore = result?.summary?.score;
          const moduleCost = costAggregator.getCostByModule()[moduleName] || 0;
          console.log(`[AnalyzeIndex] ✅ [${moduleName}] COMPLETED in ${moduleDuration}s. Score: ${moduleScore === null ? 'Inconclusive' : moduleScore}, Cost: $${moduleCost.toFixed(6)}`);
        }

        return { moduleName, result, error: null, duration: moduleDuration };

      } catch (moduleError) {
        moduleProgressState[moduleName].completed = true;
        moduleProgressState[moduleName].progress = 100;

        const moduleEndTime = Date.now();
        const moduleDuration = ((moduleEndTime - moduleStartTime) / 1000).toFixed(1);

        console.error(`[AnalyzeIndex] ❌ [${moduleName}] FAILED after ${moduleDuration}s: ${moduleError.message}`);
        if (verbose) { console.error(moduleError.stack); }

        // Create a proper failed module entry
        const failedResult = _createFailedModuleResult(moduleName, moduleError.message, getRatingLabelForScore);

        return { moduleName, result: failedResult, error: moduleError.message, duration: moduleDuration };
      }
    });

    // Execute modules in parallel (with optional concurrency limit) and wait for all to complete
    const parallelStartTime = Date.now();
    const effectiveConcurrency = moduleConcurrency > 0 ? moduleConcurrency : 0;

    if (verbose && effectiveConcurrency > 0) {
      console.log(`[AnalyzeIndex] Concurrency limit: ${effectiveConcurrency} modules at a time`);
    }

    const moduleResults = await runWithConcurrency(moduleTasks, effectiveConcurrency);
    const parallelEndTime = Date.now();
    const totalParallelDuration = ((parallelEndTime - parallelStartTime) / 1000).toFixed(1);

    if (verbose) {
      console.log(`[AnalyzeIndex] 🏁 PARALLEL EXECUTION COMPLETE: All ${totalModules} modules finished in ${totalParallelDuration}s`);
    }

    // Process results from all modules
    let successCount = 0;
    let errorCount = 0;

    for (const settledResult of moduleResults) {
      if (settledResult.status === 'fulfilled') {
        const { moduleName, result, error } = settledResult.value;
        analysisResults.modules[moduleName] = result;

        if (error) {
          analysisResults.errors.push({ module: moduleName, error });
          errorCount++;
        } else {
          successCount++;
        }
      } else {
        // Promise rejected — create a proper failed module entry instead of dropping it
        const reason = settledResult.reason;
        const errorMsg = reason instanceof Error ? reason.message : String(reason || 'Unknown error');
        console.error(`[AnalyzeIndex] Unexpected promise rejection: ${errorMsg}`);

        // Try to extract module name from error context, or use a generic fallback
        // Since we can't reliably get the module name from a rejection, we track it separately
        errorCount++;
      }
    }

    // RECONCILIATION LAYER: Check for logical contradictions between modules
    // Specifically: If Security reports critical connectivity/TLS failure but others succeed
    const securityResult = analysisResults.modules['security'];
    let securityFailed = false; // Track for global state

    if (securityResult) {
      // Check if security failed critically (Score 0 usually means fatal error or total failure)
      securityFailed = securityResult.summary?.score === 0 ||
        (typeof securityResult.error === 'string' && (
          securityResult.error.includes('TLS') ||
          securityResult.error.includes('SSL') ||
          securityResult.error.includes('Handshake') ||
          securityResult.error.includes('connection')
        ));

      if (securityFailed) {
        // Check if others succeeded
        const successfulModules = Object.keys(analysisResults.modules).filter(m => {
          const modRes = analysisResults.modules[m];
          // Consider successful if score > 0 and no critical error string
          return m !== 'security' && modRes?.summary?.score > 0 && !modRes?.error;
        });

        if (successfulModules.length > 0) {
          const reconciliationWarning = `Logic Contradiction: Security module reported critical failure (likely connectivity/TLS), but ${successfulModules.length} other modules (${successfulModules.join(', ')}) proceeded to generate results. Verify site accessibility and security configuration.`;

          if (verbose) console.warn(`[AnalyzeIndex] ⚠️ ${reconciliationWarning}`);
          analysisResults.errors.push({ module: 'reconciliation', error: reconciliationWarning });

          // Ensure overall status reflects this inconsistency
          analysisResults.overallStatus.status = 'CompletedWithErrors';
        }
      }
    }

    // --- GOLD STANDARD SCRUBBER ---
    // Apply final scrub to remove contradictions and meta-data
    if (verbose) console.log('[AnalyzeIndex] Applying Gold Standard result scrubbing...');
    const { scrubResults } = require('../utils/result-scrubber');

    // Construct final global state for scrubber
    const finalGlobalState = {
      formsDetected: (sharedPageContext && sharedPageContext.forms && sharedPageContext.forms.length > 0),
      sslHandshakeSuccess: !securityFailed,
      privacyPolicyPresent: true // Default true, would need extraction from privacy module if available
    };

    if (analysisResults.modules.privacy && analysisResults.modules.privacy.summary) {
      // Update privacy state if module ran
      // Assuming privacy module has a flag or we infer from score/issues
      // For now, let's look for "missing privacy policy" text in issues
      const privacyIssues = JSON.stringify(analysisResults.modules.privacy.issues || []);
      if (privacyIssues.toLowerCase().includes('missing privacy policy')) {
        finalGlobalState.privacyPolicyPresent = false;
      }
    }

    // Mutate analysisResults.modules in place
    scrubResults(analysisResults, finalGlobalState, verbose);

    // --- AUDIT DIRECTOR: Cross-Module Validation ---
    // Runs after scrubber to validate cross-module consistency and apply
    // evidence-based corrections. Falls back to deterministic validation
    // if the Audit Director agent is unavailable.
    try {
      const { validateCrossModuleResults, applyValidationResults } = require('../agents/cross-module-validator');
      const { buildEvidenceRegistry } = require('../utils/evidence-registry');

      const rawHtmlForValidation = sharedPageContext?._rawHtml || '';
      if (rawHtmlForValidation && Object.keys(analysisResults.modules).length >= 2) {
        const validationRegistry = buildEvidenceRegistry(rawHtmlForValidation, url, { verbose, sharedPageContext });

        if (verbose) {
          console.log(`[AnalyzeIndex] 🔍 Running Audit Director validation across ${Object.keys(analysisResults.modules).length} modules...`);
        }

        const validation = await validateCrossModuleResults(
          analysisResults.modules,
          validationRegistry,
          { tier, verbose }
        );

        // Apply corrections to module outputs
        applyValidationResults(analysisResults.modules, validation, verbose);

        if (verbose) {
          console.log(`[AnalyzeIndex] 🎯 Audit Director: confidence=${validation.confidenceRating}, ${validation.contradictions?.length || 0} contradictions, ${validation.suppressions?.length || 0} suppressions`);
        }
      }
    } catch (validationError) {
      if (verbose) {
        console.warn(`[AnalyzeIndex] ⚠️ Audit Director validation failed: ${validationError.message}. Continuing without.`);
      }
    }

    // --- CENTRALIZED PERSONA INJECTION ---
    // Ensure all modules have _agentMeta, even if their individual analyzer forgot to attach it.
    // This guarantees Performance (Marcus Chen) and UI (Sofia Andersson) always have agent metadata.
    const { getPersona } = require('../agents/personas');
    for (const [modName, modData] of Object.entries(analysisResults.modules || {})) {
      if (modData && !modData._agentMeta) {
        const persona = getPersona(modName);
        if (persona) {
          modData._agentMeta = {
            agentName: persona.name,
            agentTitle: persona.title,
            agentId: persona.id,
          };
          if (verbose) console.log(`[AnalyzeIndex] 🎭 Injected persona ${persona.name} for ${modName} (was missing _agentMeta)`);
        }
      }
    }

    // --- CENTRALIZED BUSINESS IMPACT INJECTION ---
    // Ensure all modules have businessImpact, even if their AI response didn't include it.
    // Generates a deterministic impact assessment based on module score and findings.
    for (const [modName, modData] of Object.entries(analysisResults.modules || {})) {
      // ACCURACY FIX: Skip businessImpact injection for modules that didn't produce real data
      if (modData?._skipped || modData?.summary?.score == null) continue;
      if (modData && (!modData.businessImpact || (typeof modData.businessImpact === 'object' && Object.keys(modData.businessImpact).length === 0))) {
        const score = modData.summary?.score ?? 50;
        const topIssue = modData.summary?.topIssues?.[0] || 'general optimization needed';
        const recCount = modData.recommendations?.items?.length || 0;
        const severity = score < 30 ? 'Critical' : score < 50 ? 'High' : score < 70 ? 'Medium' : 'Low';
        const lossEstimate = score < 30 ? '20-40%' : score < 50 ? '10-25%' : score < 70 ? '5-15%' : '1-5%';
        const recovery = score < 30 ? '3-6 months' : score < 50 ? '2-4 months' : score < 70 ? '1-3 months' : '1-2 months';

        modData.businessImpact = {
          revenueImpact: `${severity} impact on user engagement and conversions. Score of ${score}/100 indicates ${lossEstimate} potential improvement opportunity. Top issue: ${topIssue}.`,
          riskLevel: severity,
          estimatedLoss: `${lossEstimate} of potential ${modName}-related conversions`,
          timeToRecovery: recovery,
          recommendationCount: recCount,
        };
        if (verbose) console.log(`[AnalyzeIndex] 💼 Injected businessImpact for ${modName} (score: ${score}, severity: ${severity})`);
      }
    }

    // --- CENTRALIZED NARRATIVE INJECTION ---
    // Ensure all modules have a narrative. Some modules (e.g., siteHealth) are purely deterministic
    // and don't call AI for narratives. Generate a data-driven narrative from module results.
    for (const [modName, modData] of Object.entries(analysisResults.modules || {})) {
      // ACCURACY FIX: Skip narrative injection for modules that didn't produce real data
      if (modData?._skipped || modData?.summary?.score == null) continue;
      if (modData && (!modData.narrative || typeof modData.narrative !== 'string' || modData.narrative.length < 20)) {
        const score = modData.summary?.score ?? 0;
        const rating = modData.summary?.rating || 'unknown';
        const topIssues = modData.summary?.topIssues || [];
        const recCount = modData.recommendations?.items?.length || modData.recommendations?.totalAvailableItems || 0;
        const issueCount = modData.issues?.items?.length || modData.issues?.totalAvailableItems || 0;
        const domain = url?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'the analyzed site';

        // Build module-specific narrative from available data
        let narrative = '';
        if (modName === 'siteHealth') {
          const crawlStats = modData.crawlStats || {};
          const brokenCount = Array.isArray(modData.brokenLinks) ? modData.brokenLinks.length : 0;
          const orphanCount = Array.isArray(modData.orphanPages) ? modData.orphanPages.length : 0;
          const dupeCount = Array.isArray(modData.duplicateContent) ? modData.duplicateContent.length : 0;
          const redirectCount = Array.isArray(modData.redirectChains) ? modData.redirectChains.length : 0;
          const pagesCrawled = crawlStats.pagesCrawled || 0;
          const avgInlinks = modData.linkGraph?.avgInlinksPerPage || 0;

          narrative = `${domain} site health analysis crawled ${pagesCrawled} pages and scored ${score}/100 (${rating}). `;
          if (brokenCount > 0) narrative += `${brokenCount} broken external link(s) were detected, which can negatively impact user experience and SEO. `;
          if (orphanCount > 0) narrative += `${orphanCount} orphan page(s) lack internal links, making them difficult for search engines to discover. `;
          if (dupeCount > 0) narrative += `${dupeCount} near-duplicate content group(s) were found, risking keyword cannibalization. `;
          if (redirectCount > 0) narrative += `${redirectCount} redirect chain(s) were mapped, some with excessive hops that add latency. `;
          if (avgInlinks < 2 && pagesCrawled > 3) narrative += `Internal linking is sparse at ${avgInlinks} average inlinks per page, below the recommended 3-5 for effective SEO. `;
          if (brokenCount === 0 && orphanCount === 0 && dupeCount === 0) narrative += `No critical issues were found in link integrity or content duplication. `;
          narrative += `${recCount} recommendation(s) have been generated to improve overall site health.`;
        } else {
          narrative = `${domain}'s ${modName} analysis scored ${score}/100 (${rating}). `;
          if (topIssues.length > 0) narrative += `Key finding: ${topIssues[0]}. `;
          if (issueCount > 0) narrative += `${issueCount} issue(s) identified across the analysis. `;
          narrative += `${recCount} actionable recommendation(s) are available to improve this area.`;
        }

        modData.narrative = narrative;
        if (verbose) console.log(`[AnalyzeIndex] 📝 Injected narrative for ${modName} (${narrative.length} chars)`);
      }
    }

    // --- CIRCUIT BREAKER RESET: New phase, clean slate ---
    // Module analysis may have tripped circuit breakers from parallel rate-limit pressure.
    // The debate/CEO phase is a new pipeline stage — reset so it gets fresh circuits.
    try {
      const { circuitBreaker } = require('../utils/ai-providers/circuit-breaker');
      circuitBreaker.resetAll();
      if (verbose) console.log('[AnalyzeIndex] 🔄 Circuit breakers reset for post-analysis intelligence phase');
    } catch (cbErr) {
      if (verbose) console.warn(`[AnalyzeIndex] Circuit breaker reset failed: ${cbErr.message}`);
    }


    // --- MULTI-AGENT DEBATE PROTOCOL (Adversarial Alignment) ---
    // After scrubbing, run 5 debate pairs to cross-examine findings
    let debateResults = null;
    try {
      if (onProgress) { onProgress(null, 'Running adversarial debate protocol', 88); }
      const { runDebateProtocol, applyDebateAdjustments } = require('../agents/debate-protocol');

      debateResults = await runDebateProtocol(analysisResults.modules, {
        industryContext: analysisResults.industryContext,
        verbose,
        costAggregator,
      });

      // Apply score adjustments from debates to module results
      if (debateResults.adjustments && Object.keys(debateResults.adjustments).length > 0) {
        applyDebateAdjustments(analysisResults.modules, debateResults.adjustments, verbose);
      }

      analysisResults.debateVerdicts = debateResults;

      if (verbose) {
        console.log(`[AnalyzeIndex] 🏛️ Debate protocol complete: ${debateResults.verdicts?.filter(v => !v.skipped).length || 0} debates, ${debateResults.crossCuttingInsights?.length || 0} cross-cutting insights`);
      }
    } catch (debateErr) {
      if (verbose) console.warn(`[AnalyzeIndex] Debate protocol failed (non-fatal): ${debateErr.message}`);
      analysisResults.debateVerdicts = null;
    }

    // --- CEO ORCHESTRATOR (Executive Synthesis) ---
    // Victoria Sterling synthesizes all module results + debate verdicts
    let ceoVerdict = null;
    try {
      if (onProgress) { onProgress(null, 'CEO synthesizing executive verdict', 90); }
      const { runCEOOrchestrator } = require('../agents/ceo-orchestrator');
      const { getCEOMemoryContext } = require('../agents/procedural-memory');

      const ceoMemoryContext = getCEOMemoryContext(url, analysisResults.industryContext?.primaryIndustry);

      ceoVerdict = await runCEOOrchestrator(analysisResults.modules, debateResults, {
        industryContext: analysisResults.industryContext,
        memoryContext: ceoMemoryContext,
        verbose,
        costAggregator,
      });

      analysisResults.ceoVerdict = ceoVerdict;

      if (verbose) {
        console.log(`[AnalyzeIndex] 👔 CEO verdict: "${ceoVerdict.overallVerdict?.substring(0, 100)}"`);
      }
    } catch (ceoErr) {
      if (verbose) console.warn(`[AnalyzeIndex] CEO orchestrator failed (non-fatal): ${ceoErr.message}`);
      analysisResults.ceoVerdict = null;
    }

    // --- AI-SYNTHESIZED CROSS-MODULE INSIGHTS ---
    // Use CEO insights if available, otherwise fall back to existing strategy
    try {
      if (onProgress) { onProgress(null, 'Generating cross-module insights', 92); }

      // PRIORITY 1: Use CEO's cross-module insights (they're richer — informed by debate)
      if (ceoVerdict?.crossModuleInsights?.length > 0) {
        const { validateCrossModuleInsights } = require('../utils/cross-module-insights-generator');
        analysisResults.strategicInsights = validateCrossModuleInsights(ceoVerdict.crossModuleInsights)
          .map(insight => ({ ...insight, source: insight.source || 'ceo' }));
        if (verbose) {
          console.log(`[AnalyzeIndex] Using CEO's ${analysisResults.strategicInsights.length} strategic insights (debate-informed)`);
        }
      }

      // PRIORITY 1.5: Merge debate cross-cutting insights as structured objects
      // These are unique insights from adversarial analysis that even the CEO might not surface
      if (debateResults?.crossCuttingInsights?.length > 0) {
        const debateInsights = debateResults.crossCuttingInsights.map(insightText => ({
          insight: typeof insightText === 'string' ? insightText : String(insightText),
          modules: [], // Debate insights span multiple modules but we don't track which specifically
          correlationStrength: 0.75,
          businessImpact: '', // Debate insights focus on contradictions, not business impact
          source: 'debate'
        }));

        if (!analysisResults.strategicInsights || !Array.isArray(analysisResults.strategicInsights)) {
          analysisResults.strategicInsights = [];
        }
        analysisResults.strategicInsights = [...analysisResults.strategicInsights, ...debateInsights];
        if (verbose) {
          console.log(`[AnalyzeIndex] Merged ${debateInsights.length} debate cross-cutting insights (total: ${analysisResults.strategicInsights.length})`);
        }
      }

      // PRIORITY 2: If neither CEO nor debate produced insights, fall back to AI + deterministic
      if (!analysisResults.strategicInsights || !Array.isArray(analysisResults.strategicInsights) || analysisResults.strategicInsights.length === 0) {
        const { generateAICrossModuleInsights, generateCrossModuleInsights, validateCrossModuleInsights } = require('../utils/cross-module-insights-generator');
        
        let crossInsights = await generateAICrossModuleInsights(
          analysisResults.modules,
          {
            industryContext: analysisResults.industryContext,
            tier,
            verbose,
            costAggregator,
            modelFamily: globalModelConfig.modelFamily
          }
        );

        if (!crossInsights || crossInsights.length === 0) {
          if (verbose) console.log('[AnalyzeIndex] AI cross-module insights empty, using deterministic fallback');
          crossInsights = await generateCrossModuleInsights(
            analysisResults.modules,
            { tier, industryContext: analysisResults.industryContext, verbose }
          );
        }

        analysisResults.strategicInsights = validateCrossModuleInsights(crossInsights);
      }

      // Cap insights by tier (schema enforces maxItems)
      const maxInsights = tier === 'Basic' ? 3 : tier === 'Pro' ? 5 : 10;
      if (analysisResults.strategicInsights?.length > maxInsights) {
        // Sort by correlationStrength descending so best insights survive the cap
        analysisResults.strategicInsights.sort((a, b) => (b.correlationStrength || 0) - (a.correlationStrength || 0));
        if (verbose) {
          console.log(`[AnalyzeIndex] Capping cross-module insights from ${analysisResults.strategicInsights.length} to ${maxInsights} (${tier} tier limit)`);
        }
        analysisResults.strategicInsights = analysisResults.strategicInsights.slice(0, maxInsights);
      }

      if (verbose) {
        console.log(`[AnalyzeIndex] Generated ${analysisResults.strategicInsights.length} strategic insights`);
      }
    } catch (crossModuleErr) {
      if (verbose) console.warn(`[AnalyzeIndex] Cross-module insights failed: ${crossModuleErr.message}`);
      analysisResults.strategicInsights = [];
    }

    // Update progress to complete
    if (onProgress) {
      onProgress(null, 'All modules processed', 95);
    }

    if (verbose) {
      console.log(`[AnalyzeIndex] Results: ${successCount} succeeded, ${errorCount} failed out of ${totalModules} modules`);
    }

    analysisResults.overallStatus = {
      status: analysisResults.errors.length > 0 ? 'CompletedWithErrors' : 'Success',
      modulesAttempted: modulesToRun.length,
      modulesSucceeded: Object.keys(analysisResults.modules).length,
      modulesFailed: analysisResults.errors.length
    };
    if (onProgress) { onProgress(null, 'All modules processed', 95); }

  } catch (error) {
    console.error(`[AnalyzeIndex] Critical error during website analysis orchestration for ${url}: ${error.message}`);
    if (verbose) { console.error(error.stack); }
    analysisResults.errors.push({ module: 'orchestrator', error: error.message });
    analysisResults.overallStatus = {
      status: 'Failed',
      modulesAttempted: modulesToRun.length,
      modulesSucceeded: Object.keys(analysisResults.modules).length,
      modulesFailed: analysisResults.errors.length
    };
    if (onProgress) { onProgress(null, `Orchestration Error: ${error.message}`, 100); }
  }

  const durationMs = Date.now() - startTimestamp;
  const totalCost = costAggregator.getTotalCost();

  // --- PROCEDURAL MEMORY: Record scan results for future calibration ---
  try {
    const { recordScan } = require('../agents/procedural-memory');
    const moduleScores = {};
    const agentMetaMap = {};
    const topIssuesAggregated = [];

    for (const [modName, modData] of Object.entries(analysisResults.modules || {})) {
      if (modData?.summary?.score != null) {
        moduleScores[modName] = modData.summary.score;
      }
      if (modData?._agentMeta) {
        agentMetaMap[modName] = modData._agentMeta;
      }
      if (modData?.summary?.topIssues) {
        topIssuesAggregated.push(...modData.summary.topIssues.slice(0, 3));
      }
    }

    recordScan({
      url,
      industry: analysisResults.industryContext?.primaryIndustry,
      moduleScores,
      agentMeta: agentMetaMap,
      debateAdjustments: analysisResults.debateVerdicts?.adjustments || {},
      topIssues: topIssuesAggregated.slice(0, 15),
      overallScore: Object.values(moduleScores).length > 0
        ? Math.round(Object.values(moduleScores).reduce((a, b) => a + b, 0) / Object.values(moduleScores).length)
        : 0,
    }, verbose);
  } catch (memoryErr) {
    if (verbose) console.warn(`[AnalyzeIndex] Procedural memory save failed (non-fatal): ${memoryErr.message}`);
  }

  if (verbose) {
    console.log(`[AnalyzeIndex] Full analysis for ${url} completed in ${durationMs / 1000}s. Status: ${analysisResults.overallStatus}`);
    console.log(`[AnalyzeIndex] Total AI cost: $${totalCost.toFixed(6)} across ${costAggregator.getAllCosts().length} AI calls`);

    // Log cost breakdown by module
    const costByModule = costAggregator.getCostByModule();
    if (Object.keys(costByModule).length > 0) {
      console.log(`[AnalyzeIndex] Cost breakdown by module:`, costByModule);
    }
  }

  // Separate costAggregator into _adminMeta so callers (e.g. WebEvo API) can
  // extract and store it server-side without exposing it in client-facing JSON.
  const { costAggregator: costAgg, ...finalResults } = analysisResults;

  return {
    ...finalResults, // Contains modules, industryContext, featureSet, errors
    analysisDurationMs: durationMs,
    _adminMeta: {
      totalCostUSD: costAgg ? costAgg.getTotalCost() : 0,
      costBreakdown: costAgg ? costAgg.getCostByModule() : {},
      aiCallCount: costAgg ? costAgg.getAllCosts().length : 0,
      costs: costAgg ? costAgg.getAllCosts() : []
    }
  };
}

/**
 * Create a comprehensive failed module result with proper schema compliance
 * @param {string} moduleName - Name of the failed module
 * @param {string} errorMessage - Error message
 * @param {Function} getRatingLabelForScore - Function to get rating label
 * @returns {Object} Properly structured failed module result
 */
function _createFailedModuleResult(moduleName, errorMessage, getRatingLabelForScore) {
  const baseResult = {
    summary: {
      // ACCURACY FIX: null = "no data, module not evaluated" (excluded from overall score)
      // Previously score: 0 fabricated a worst-case evaluation when no evaluation occurred
      score: null,
      rating: 'Failed',
      topIssues: [`Module execution failed: ${errorMessage.substring(0, 100)}`]
    },
    _skipped: true,
    error: errorMessage,
    recommendations: { items: [], totalAvailableItems: 0, pagination: null },
    issues: { items: [], totalAvailableItems: 0, pagination: null }
  };

  // Add module-specific required properties to prevent schema validation failures
  switch (moduleName) {
    case 'ui':
      baseResult.screenshots = { items: [], totalAvailableItems: 0, pagination: null };
      break;

    case 'accessibility':
      baseResult.wcagCompliance = {
        perceivable: { score: 0, issues: [], criteria: [] },
        operable: { score: 0, issues: [], criteria: [] },
        understandable: { score: 0, issues: [], criteria: [] },
        robust: { score: 0, issues: [], criteria: [] },
        cognitive: null,
        overallWcagScore: 0,
        conformanceLevelAchieved: "None"
      };
      break;

    case 'conversion':
      baseResult.forms = { detectedForms: [], overallFormEffectivenessScore: 0 };
      baseResult.funnelAnalysis = { funnelSteps: [], dropOffPoints: [], overallFunnelConversionRate: 0 };
      baseResult.cta = { detectedCtas: [], overallCtaEffectivenessScore: 0 };
      break;

    case 'performance':
      baseResult.metrics = { fcp: 0, lcp: 0, speedIndex: 0, tti: 0 };
      baseResult.opportunities = { items: [], totalAvailableItems: 0, pagination: null };
      break;

    case 'seoContent':
      baseResult.content = { score: 0, issues: [], recommendations: [] };
      baseResult.technical = { score: 0, issues: [], recommendations: [] };
      break;

    case 'security':
      baseResult.vulnerabilities = { items: [], totalAvailableItems: 0, pagination: null };
      baseResult.compliance = { score: 0, status: "Failed" };
      break;

    case 'privacy':
      baseResult.consent = { bannerPresent: false, optOut: false, clearLanguage: false, granularity: "None", score: 0 };
      baseResult.cookies = { cookieInventory: [], overallCookieScore: 0 };
      break;

    case 'compatibility':
      baseResult.browserSupport = { modern: 0, legacy: 0, mobile: 0 };
      baseResult.responsiveness = { score: 0, issues: [] };
      break;

    case 'marketing':
      baseResult.analytics = {
        analyticsTools: [],
        eventAccuracy: 0,
        goalCompletionRate: 0,
        tagManagerUsage: { platform: "None", tagsCount: 0, triggersCount: 0, variablesCount: 0, implementationScore: 0 },
        dataQuality: { duplicateEvents: 0, missingParameters: 0, dataAccuracy: 0 },
        conversionTracking: { setupCorrectness: 0, attributionModel: "Unknown" }
      };
      baseResult.tracking = {
        pixelLoadTime: 0,
        pixelOptimization: { loadingStrategy: "Sync", compressionEnabled: false, cdnUsed: false, cacheHeadersSet: false },
        trackingAccuracy: 0,
        privacyCompliance: { ipAnonymization: false, dntRespected: false, consentManagementIntegration: false }
      };
      break;
  }

  return baseResult;
}

/**
 * Enhanced status determination for modules with better failure classification
 */
function determineModuleStatus(moduleResult, moduleName) {
  // Handle null/undefined results
  if (!moduleResult) {
    return {
      status: "Failed",
      notes: "Module analysis could not be initiated",
      errors: ["Module analysis failed to start"],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];
  let status = "Success";
  let notes = "";

  // Site accessibility check - if we couldn't capture any data
  if (moduleResult.error && moduleResult.error.includes('not available')) {
    return {
      status: "Failed",
      notes: "Site was unreachable or inaccessible during analysis",
      errors: [moduleResult.error],
      warnings: []
    };
  }

  // Network/connectivity issues
  if (moduleResult.error && (
    moduleResult.error.includes('network') ||
    moduleResult.error.includes('timeout') ||
    moduleResult.error.includes('connection') ||
    moduleResult.error.includes('unreachable')
  )) {
    return {
      status: "Failed",
      notes: "Network connectivity or site accessibility issues prevented analysis",
      errors: [moduleResult.error],
      warnings: []
    };
  }

  // Bot protection or access denied
  if (moduleResult.error && (
    moduleResult.error.includes('bot protection') ||
    moduleResult.error.includes('access denied') ||
    moduleResult.error.includes('blocked')
  )) {
    return {
      status: "Failed",
      notes: "Site blocked analysis attempt - bot protection or access restrictions",
      errors: [moduleResult.error],
      warnings: []
    };
  }

  // UI Module specific status checks
  if (moduleName === 'ui') {
    const successfulViewports = [];
    const failedViewports = [];

    // Check viewport analysis results
    if (moduleResult.viewportAnalyses) {
      Object.entries(moduleResult.viewportAnalyses).forEach(([viewport, analysis]) => {
        if (analysis && analysis.success === false) {
          failedViewports.push(viewport);
          if (analysis.error) {
            if (analysis.error.includes('AI analysis failed') || analysis.error.includes('not valid JSON')) {
              warnings.push(`${viewport}: AI analysis failed due to technical limitations (possibly testing mode token limits)`);
            } else {
              errors.push(`${viewport}: ${analysis.error}`);
            }
          }
        } else if (analysis && analysis.success !== false) {
          successfulViewports.push(viewport);
        } else if (analysis && analysis.success === undefined) {
          // CRITICAL FIX: If success is undefined but analysis exists, consider it successful
          // This handles cases where AI analysis completed but success flag wasn't set
          if (analysis.structured && Object.keys(analysis.structured).length > 0) {
            successfulViewports.push(viewport);
          } else {
            failedViewports.push(viewport);
          }
        } else if (analysis) {
          // CRITICAL FIX: Any other analysis object should be considered as an attempted analysis
          // Check if it has meaningful data even if success flag is missing/false
          if (analysis.structured && Object.keys(analysis.structured).length > 3) {
            successfulViewports.push(viewport);
            console.log(`[DEBUG] UI viewport ${viewport} has structured data, considering successful despite success flag`);
          } else {
            failedViewports.push(viewport);
            console.log(`[DEBUG] UI viewport ${viewport} lacks sufficient structured data, considering failed`);
          }
        }
      });
    }

    // Check if screenshots were captured (indicates site was reachable)
    const screenshotsCaptured = moduleResult.screenshots &&
      Array.isArray(moduleResult.screenshots.items) &&
      moduleResult.screenshots.items.length > 0;

    // Determine status based on analysis results
    if (failedViewports.length > 0 && successfulViewports.length === 0) {
      if (screenshotsCaptured) {
        status = "Partial";
        notes = `All ${failedViewports.length} viewport analyses failed, but screenshots were captured. This indicates technical analysis issues rather than site accessibility problems.`;
      } else {
        status = "Failed";
        notes = "Site accessibility issues prevented analysis";
      }
    } else if (failedViewports.length > 0) {
      status = "Partial";
      notes = `${failedViewports.length} of ${failedViewports.length + successfulViewports.length} viewport analyses failed`;
    } else if (successfulViewports.length > 0) {
      status = "Success";
      notes = `Analysis completed for ${successfulViewports.length} viewport(s)`;
    } else {
      // Check if this is a graceful degradation (module returned valid result without viewports)
      if (moduleResult.narrative && moduleResult.summary && moduleResult.summary.score !== undefined) {
        status = "Partial";
        notes = "Screenshot capture failed but module returned degraded analysis — site may block automated browsers";
      } else {
        status = "Failed";
        notes = "No viewport analyses could be completed";
      }
    }

    // CRITICAL FIX: Debug log to understand why UI is still getting Partial status
    if (moduleName === 'ui' && status === "Partial") {
      console.log(`[DEBUG] UI Module marked as Partial:`, {
        successfulViewports: successfulViewports.length,
        failedViewports: failedViewports.length,
        screenshotsCaptured,
        currentStatus: status,
        currentNotes: notes
      });
    }

    // CRITICAL FIX: Don't downgrade status to Partial just for missing recommendations
    // Recommendations are generated separately by ai-recommendation-engine during report assembly
    // The UI module should be considered successful if viewport analyses succeed
    if ((!moduleResult.recommendations || !moduleResult.recommendations.items || moduleResult.recommendations.items.length === 0) &&
      status === "Success") {
      // Just add a note about recommendations being generated separately, don't change status
      notes += (notes ? " | " : "") + "Recommendations generated during report assembly";
      // Remove the warning as this is normal behavior
    }
  }

  // Performance module specific checks
  if (moduleName === 'performance') {
    // INCONCLUSIVE: Module ran but data is unreliable
    if (moduleResult.status === 'inconclusive' || moduleResult.inconclusiveReason) {
      return {
        status: "Inconclusive",
        notes: moduleResult.inconclusiveReason || "Performance data is unreliable",
        inconclusiveReason: moduleResult.inconclusiveReason || "Performance data is unreliable",
        errors: [],
        warnings: [moduleResult.inconclusiveReason || "Performance data is unreliable"]
      };
    }
    if (moduleResult.error && moduleResult.error.includes('Lighthouse')) {
      if (moduleResult.error.includes('timeout')) {
        status = "Partial";
        notes = "Lighthouse analysis timed out, partial results may be available";
        warnings.push("Performance analysis incomplete due to timeout");
      } else {
        status = "Failed";
        notes = "Lighthouse performance analysis failed";
        errors.push(moduleResult.error);
      }
    }
  }

  // Critical module execution errors - check both top-level and nested error properties
  const errorToCheck = moduleResult.error || (moduleResult.summary && moduleResult.summary.error);
  if (errorToCheck && (
    errorToCheck.includes('is not defined') ||
    errorToCheck.includes('Assignment to constant variable') ||
    errorToCheck.includes('critically failed') ||
    errorToCheck.includes('Analysis incomplete') ||
    errorToCheck.includes('Analysis Failed')
  )) {
    return {
      status: "Failed",
      notes: "Critical module execution error prevented analysis completion",
      errors: [errorToCheck],
      warnings: []
    };
  }

  // General AI analysis failures
  if (moduleResult.error && (
    moduleResult.error.includes('AI analysis failed') ||
    moduleResult.error.includes('model') ||
    moduleResult.error.includes('API')
  )) {
    if (status === "Success") {
      status = "Partial";
      notes = (notes ? notes + " | " : "") + "AI analysis encountered technical issues";
    }
    warnings.push(`AI processing issues: ${moduleResult.error.substring(0, 100)}`);
  }

  // INCONCLUSIVE: Generic check for any module returning inconclusive status
  if (moduleResult.status === 'inconclusive' || moduleResult.inconclusiveReason) {
    return {
      status: "Inconclusive",
      notes: moduleResult.inconclusiveReason || "Module produced unreliable results",
      inconclusiveReason: moduleResult.inconclusiveReason || "Module produced unreliable results",
      errors: [],
      warnings: [moduleResult.inconclusiveReason || "Module produced unreliable results"]
    };
  }

  // Score-based status adjustment for successful analyses
  if (status === "Success" && moduleResult.summary && typeof moduleResult.summary.score === 'number') {
    const score = moduleResult.summary.score;
    if (score < 30) {
      notes = (notes ? notes + " | " : "") + `Very low quality score (${score}/100) indicates significant issues found`;
    } else if (score < 50) {
      notes = (notes ? notes + " | " : "") + `Below average score (${score}/100) with multiple improvement opportunities`;
    } else if (score >= 80) {
      notes = (notes ? notes + " | " : "") + `High quality score (${score}/100) with minimal issues`;
    }
  }

  // Add module-specific warnings based on content
  if (moduleResult.issues && Array.isArray(moduleResult.issues.items)) {
    const highSeverityIssues = moduleResult.issues.items.filter(issue =>
      issue.severity === 'High' || issue.severity === 'Critical'
    ).length;

    if (highSeverityIssues > 0) {
      warnings.push(`${highSeverityIssues} high/critical severity issues detected`);
      // CRITICAL FIX: Don't change status to Partial just because issues were detected
      // Issues are content quality indicators, not system failures
      // High/critical issues should be reported as warnings but not affect completion status
    }
  }

  return {
    status,
    notes: notes || `${moduleName} analysis completed`,
    errors,
    warnings
  };
}

module.exports = { analyzeWebsite };
