
// Force module resolution from this package's node_modules to prevent conflicts
const path = require('path');
const originalModulePaths = module.paths.slice();
module.paths.unshift(path.join(__dirname, '..', '..', 'node_modules'));

// Load environment variables: first from worker .env, then cascade to project root .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
// Also load from project root .env (where CF credentials typically live) — dotenv won't overwrite existing vars
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

const fs = require('fs'); // Note: fs.promises is generally preferred for async operations

const chalk = require('chalk');
const { v4: uuidv4 } = require('uuid');
// NOTE: Playwright removed — all scans run serverless via CF screenshots + PSI API + HTTP/cheerio

// CRITICAL FIX: Enforce headless mode globally for Worker CLI
process.env.CHROME_HEADLESS = '1';
process.env.CHROME_NO_SANDBOX = '1';
process.env.CHROME_DISABLE_GPU = '1';
process.env.DISPLAY = ':99';
process.env.LIGHTHOUSE_HEADLESS = '1';
process.env.LIGHTHOUSE_NO_SANDBOX = '1';
process.env.LIGHTHOUSE_DISABLE_GPU = '1';

const packageJson = require('../../package.json');

// Import main orchestrator
const { analyzeWebsite } = require('../analyze/index');

// Import report generation
const { generateReport } = require('../report/index');

// Import storage utilities
const { getStoragePath } = require('../storage/index');

// Utility imports
const { captureScreenshots, VIEWPORT_PRESETS: CAPTURE_VIEWPORT_PRESETS } = require('../capture'); // Renamed to avoid conflict
const { getPresetConfig } = require('../utils/presets');
const { getModelConfig } = require('../utils/ai-credentials'); // For initial validation and model selection hints
const { validateDomainWithConnectivity } = require('../utils/domainValidator'); // Using with connectivity check
const { BotProtectionHandler } = require('../utils/bot-protection-detector'); // Intelligent bot protection
const { crawlWebsite, extractStructuredData, EXTRACTION_SCHEMAS } = require('../services/cfBrowserService'); // Cloudflare deep crawl + /json extraction
const cfScreenshotService = require('../services/cfScreenshotService'); // Cloudflare cloud screenshots

// Simple date formatter implementation (already present, good)
const format = (date, formatStr) => {
  const d = new Date(date);
  const pad = (num, size = 2) => String(num).padStart(size, '0');
  if (formatStr === 'yyyyMMdd-HHmmss-SSS') {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
      `${pad(d.getMilliseconds(), 3)}`;
  }
  if (formatStr === 'yyyy-MM-dd HH:mm:ss') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return d.toISOString();
};

// VIEWPORT_PRESETS from capture module is suitable
const VIEWPORT_PRESETS = CAPTURE_VIEWPORT_PRESETS;


function showHelp() {
  console.log(`
Usage: uilensai --url <url> [options]

Options:
  --url <url>                    URL to analyze (required)
  --modules <list>               Comma-separated list of modules to run.
                                 Default: ui
                                 Available: ui,performance,seoContent,security,privacy,compatibility,marketing,conversion,accessibility,all
  
  Model Options:
  --model <model_id>             Prefer a specific AI model ID (e.g., claude-3-opus-20240229). Overrides family defaults.
  --model-family <family>        Preferred AI model family if a specific model ID isn't provided.
                                 Options: claude (default), openai, gemini.
  --model-strategy <strategy>    How AI models are selected for tasks.
                                 Options: single, specialized (default), consensus (Pro/Enterprise).
  --max-tokens <number>          Maximum tokens for AI model responses. Defaults vary by model and tier.
  --testing                      TESTING MODE: Override to use cheapest model (claude-3-5-haiku-20241022) regardless of tier to save costs during development/testing.

  Tier Options:
  --tier <name>                  Specify the service tier. Affects features, analysis depth, and model access.
                                 Options: Basic (default), Pro, Enterprise.

  Analysis Options:
  --viewports <list>             Comma-separated list of viewport names for UI capture.
                                 Default: mobile,desktop
                                 Available Presets: tiny-mobile, narrow-mobile, mobile, tablet, desktop, large, ultrawide, super-ultrawide.
  --analysis-depth <level>       Overall depth for analyses. Overrides tier defaults if specified.
                                 Options: basic, comprehensive, deep.
                                 Tier Defaults: basic (Basic), comprehensive (Pro), deep (Enterprise).
  --focus <list>                 (UI Module) Comma-separated list of UI analysis focus areas (e.g., branding,usability,accessibility).
  --selector <css_selector>      (UI Module) CSS selector to capture a specific UI component instead of the full page/viewport.
  --full-page                    Capture full page height for screenshots. Default: true.
  --no-full-page                 Capture only the initially visible part of the page.
  
  Protection & Capture Options:
  --stealth [level]              Enable stealth mode for screenshot capture to help bypass bot detection.
                                 Level Options: basic (default if only --stealth), medium, advanced.
  --disable-animations           Disable CSS animations and transitions during screenshot capture. Default: true.
  --no-disable-animations        Keep CSS animations and transitions enabled.
  --capture-timeout <ms>         Timeout for individual screenshot capture operations (default: 60000ms).
  --skip-domain-validation       Skip domain connectivity validation (useful for sites with bot detection).
  --skip-domain-validation       Skip domain connectivity validation (useful for sites with bot detection).
  --crawl-limit <n>              Max pages to crawl during Cloudflare deep crawl (default: 10).
  --crawl-depth <n>              Max crawl depth during Cloudflare deep crawl (default: 2).
  
  Authentication Options:
  --username <user>              Username for HTTP Basic Authentication for website access during capture.
  --password <pass>              Password for HTTP Basic Authentication during capture.

  Output Options:
  --console-output               Output the primary report content directly to the console. JSON data is still saved if primary format isn't JSON.
  --output-dir <directory>       Custom directory to save reports (default: ./storage/reports/).
  --report-format <format>       Format for the primary report file. A JSON version is always saved.
                                 Options: json (default), html, text.
  --report-description <text>    A custom description to include in the report's metadata.
  
  Transition & MCP Options:
  --use-mcp                      Use MCP mode via WebEvo integration (experimental).
  --direct-api                   Force direct API usage during transition (bypasses MCP).
  --webevo-endpoint <url>        Custom WebEvo MCP endpoint URL (default: wss://mcp.webevo.ai).
  
  Other Options:
  --verbose                      Enable verbose logging for debugging and detailed progress.
  --help, -h                     Display this help message.
  --version, -v                  Display UILensAI version.
`);
}

function showVersion() {
  console.log(`UILensAI v${packageJson.version}`);
  process.exit(0);
}

const commandFlags = {}; // To store all command line flags for the report

// Parse command line arguments
const args = process.argv.slice(2);
let url = null;
let showHelpFlag = false;
let showVersionFlag = false;

// Initialize options with defaults or undefined to be set by presets/args
let cliOptions = {
  modulesToRun: ['ui'],
  model: process.env.UILENS_MODEL || null, // Allow specific model override
  modelFamily: process.env.UILENS_MODEL_FAMILY || require('../config/model-defaults').getDefaultModelFamily('cli'),
  modelStrategy: 'specialized',
  maxTokens: null, // Will be determined by tier/model specifics later
  tier: 'Basic', // Default tier
  viewports: ['mobile', 'desktop'],
  analysisDepth: null, // Will be set by tier preset or arg
  focusAreas: null,
  selector: null,
  captureFullPage: true,
  captureStealthLevel: 'basic',
  captureDisableAnimations: true,
  captureHttpCredentials: null,
  captureTimeout: null, // Default in capture/index.js is 60000ms
  lighthouseFormFactor: null,
  consoleOutput: false,
  outputDir: null,
  reportFormat: 'json', // Default to JSON for schema v3.11.0
  reportDescription: null,
  verbose: false,
  skipDomainValidation: false,
  intelligentBotProtection: true,
  testingMode: false,
  // MCP transition options
  useMcp: false,
  directApi: false,
  webevoEndpoint: null,
  // Deep crawl options
  deepCrawl: false,
  crawlLimit: 10,
  crawlDepth: 2,
  // Cloudflare screenshot options
  cfScreenshots: false
};


// Argument parsing loop
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  const isFlagValue = (val) => val !== undefined && !val.startsWith('--');

  commandFlags[arg.startsWith('--') ? arg.substring(2) : arg] = isFlagValue(nextArg) ? nextArg : true;

  switch (arg) {
    case '--url':
      if (isFlagValue(nextArg)) { cliOptions.url = nextArg; i++; }
      break;
    case '--modules':
      if (isFlagValue(nextArg)) {
        // Map 'seo' to 'seoContent' for backward compatibility
        const modules = nextArg.split(',').map(m => m.trim().toLowerCase());
        const moduleMapping = {
          'seo': 'seoContent'
        };

        const mappedModules = modules.map(module => moduleMapping[module] || module);

        // Filter out unsupported modules to prevent schema validation errors
        const supportedModules = ['ui', 'security', 'accessibility', 'performance', 'seoContent', 'privacy', 'compatibility', 'marketing', 'conversion', 'siteHealth'];
        const supportedModulesLower = supportedModules.map(m => m.toLowerCase());

        let validModules = [];

        // Handle 'all' option
        if (mappedModules.includes('all')) {
          if (mappedModules.length > 1) {
            console.warn(`⚠️  When using 'all', other module specifications are ignored.`);
          }
          validModules = [...supportedModules]; // Use all supported modules
          console.log(`📋 Running analysis with all modules: ${validModules.join(', ')}`);
        } else {
          // Process individual modules
          mappedModules.forEach(module => {
            const moduleIndex = supportedModulesLower.indexOf(module.toLowerCase());
            if (moduleIndex === -1) {
              console.warn(`⚠️  Module '${module}' is not supported and will be skipped.`);
            } else {
              // Use the properly cased module name from supportedModules
              validModules.push(supportedModules[moduleIndex]);
            }
          });

          if (validModules.length === 0) {
            console.error('❌ No valid modules specified. Supported modules: ' + supportedModules.join(', ') + ', all');
            process.exit(1);
          }

          console.log(`📋 Running analysis with modules: ${validModules.join(', ')}`);
        }

        cliOptions.modulesToRun = validModules;
        i++;
      }
      break;
    case '--model':
      if (isFlagValue(nextArg)) { cliOptions.model = nextArg; i++; }
      break;
    case '--model-family':
      if (isFlagValue(nextArg) && ['claude', 'openai', 'gemini'].includes(nextArg.toLowerCase())) {
        cliOptions.modelFamily = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown model family "${nextArg}". Using default '${cliOptions.modelFamily}'.`)); i++;
      }
      break;
    case '--model-strategy':
      if (isFlagValue(nextArg) && ['single', 'specialized', 'consensus'].includes(nextArg.toLowerCase())) {
        cliOptions.modelStrategy = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown model strategy "${nextArg}". Using default '${cliOptions.modelStrategy}'.`)); i++;
      }
      break;
    case '--max-tokens':
      if (isFlagValue(nextArg)) { cliOptions.maxTokens = parseInt(nextArg, 10); i++; }
      break;
    case '--tier':
      if (isFlagValue(nextArg) && ['Basic', 'Pro', 'Enterprise'].includes(nextArg)) {
        cliOptions.tier = nextArg; i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown tier "${nextArg}". Using default '${cliOptions.tier}'.`)); i++;
      }
      break;
    case '--viewports':
      if (isFlagValue(nextArg)) { cliOptions.viewports = nextArg.split(','); i++; }
      break;
    case '--analysis-depth':
      if (isFlagValue(nextArg) && ['basic', 'comprehensive', 'deep'].includes(nextArg.toLowerCase())) {
        cliOptions.analysisDepth = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown analysis depth "${nextArg}". Will use tier default.`)); i++;
      }
      break;
    case '--focus':
      if (isFlagValue(nextArg)) { cliOptions.focusAreas = nextArg.split(','); i++; }
      break;
    case '--selector':
      if (isFlagValue(nextArg)) { cliOptions.selector = nextArg; i++; }
      break;
    case '--full-page': cliOptions.captureFullPage = true; break;
    case '--no-full-page': cliOptions.captureFullPage = false; break;
    case '--stealth':
      cliOptions.captureStealthLevel = 'basic'; // Default if just --stealth
      if (isFlagValue(nextArg) && ['basic', 'medium', 'advanced'].includes(nextArg.toLowerCase())) {
        cliOptions.captureStealthLevel = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown stealth level "${nextArg}". Using default 'basic'.`)); i++;
      }
      break;
    case '--disable-animations': cliOptions.captureDisableAnimations = true; break;
    case '--no-disable-animations': cliOptions.captureDisableAnimations = false; break;
    case '--username':
      if (isFlagValue(nextArg)) {
        cliOptions.captureHttpCredentials = cliOptions.captureHttpCredentials || {};
        cliOptions.captureHttpCredentials.username = nextArg; i++;
      }
      break;
    case '--password':
      if (isFlagValue(nextArg)) {
        cliOptions.captureHttpCredentials = cliOptions.captureHttpCredentials || {};
        cliOptions.captureHttpCredentials.password = nextArg; i++;
      }
      break;
    case '--capture-timeout':
      if (isFlagValue(nextArg)) { cliOptions.captureTimeout = parseInt(nextArg, 10); i++; }
      break;
    case '--lighthouse-form-factor':
      if (isFlagValue(nextArg) && ['mobile', 'desktop'].includes(nextArg.toLowerCase())) {
        cliOptions.lighthouseFormFactor = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Invalid Lighthouse form factor "${nextArg}". Ignoring.`)); i++;
      }
      break;
    case '--console-output': cliOptions.consoleOutput = true; break;
    case '--output-dir':
      if (isFlagValue(nextArg)) { cliOptions.outputDir = nextArg; i++; }
      break;
    case '--report-format':
      if (isFlagValue(nextArg) && ['text', 'json', 'html'].includes(nextArg.toLowerCase())) {
        cliOptions.reportFormat = nextArg.toLowerCase(); i++;
      } else if (isFlagValue(nextArg)) {
        console.warn(chalk.yellow(`Warning: Unknown report format "${nextArg}". Using default '${cliOptions.reportFormat}'.`)); i++;
      }
      break;
    case '--report-description':
      if (isFlagValue(nextArg)) { cliOptions.reportDescription = nextArg; i++; }
      break;
    case '--verbose': cliOptions.verbose = true; break;
    case '--help': case '-h': showHelpFlag = true; break;
    case '--version': case '-v': showVersionFlag = true; break;
    case '--skip-domain-validation': cliOptions.skipDomainValidation = true; break;
    case '--crawl-limit':
      if (isFlagValue(nextArg)) { cliOptions.crawlLimit = parseInt(nextArg, 10); i++; }
      break;
    case '--crawl-depth':
      if (isFlagValue(nextArg)) { cliOptions.crawlDepth = parseInt(nextArg, 10); i++; }
      break;
    case '--competitors':
      if (isFlagValue(nextArg)) {
        cliOptions.competitorUrls = nextArg.split(',').map(u => u.trim());
        console.log(`🏁 Competitor benchmark: ${cliOptions.competitorUrls.length} competitor(s)`);
        i++;
      }
      break;
    // Legacy flags (silently accepted for backward compatibility)
    case '--cf-screenshots': case '--psi': case '--no-browser': case '--deep-crawl':
    case '--intelligent-bot-protection': case '--no-bot-protection':
      break;
    case '--testing':
      // Use centralized default for testing mode, but allow override via env
      const testingModelFamily = process.env.UILENS_MODEL_FAMILY || require('../config/model-defaults').getDefaultModelFamily('cli');
      cliOptions.model = testingModelFamily === 'google' ? 'gemini-1.5-flash' : 'claude-3-5-haiku-20241022';
      cliOptions.modelFamily = testingModelFamily;
      cliOptions.modelStrategy = 'specialized';
      cliOptions.maxTokens = 2500;
      cliOptions.testingMode = true;
      console.log('🧪 TESTING MODE: Using cheapest model (claude-3-5-haiku-20241022) with increased tokens (2500) for complex analysis');
      break;
    case '--use-mcp':
      cliOptions.useMcp = true;
      console.log('🔄 MCP MODE: Will use WebEvo MCP integration');
      break;
    case '--direct-api':
      cliOptions.directApi = true;
      console.log('🚀 DIRECT API MODE: Will bypass MCP and use direct UILensAI API');
      break;
    case '--webevo-endpoint':
      if (isFlagValue(nextArg)) {
        cliOptions.webevoEndpoint = nextArg;
        console.log(`🌐 Custom WebEvo endpoint: ${nextArg}`);
        i++;
      }
      break;
    default:
      // Assign URL if no flag before it and it's not an option itself
      if (!cliOptions.url && !arg.startsWith('--') && (arg.includes('.') || arg.includes('localhost'))) {
        cliOptions.url = arg;
      } else if (!arg.startsWith('--')) {
        console.warn(chalk.yellow(`Warning: Unknown argument "${arg}". Ignoring.`));
      }
      break;
  }
}
url = cliOptions.url; // Set top-level url for checks

if (showHelpFlag) { showHelp(); process.exit(0); }
if (showVersionFlag) { showVersion(); process.exit(0); }
if (!url) { console.error(chalk.red ? chalk.red('Error: URL is required. Use --url <url>.') : '\x1b[31mError: URL is required. Use --url <url>.\x1b[0m'); showHelp(); process.exit(1); }

// Apply tier preset configurations
const presetConfig = getPresetConfig(cliOptions.tier);
cliOptions = {
  ...presetConfig, // Apply preset first
  ...cliOptions,   // Then override with any explicit CLI args
  // Ensure nested objects like featureSet from preset are merged if CLI doesn't provide them fully
  featureSet: { ...(presetConfig.featureSet || {}), ...(cliOptions.featureSet || {}) },
  // CLI args for model details should override preset if preset had null/default
  model: cliOptions.model !== null ? cliOptions.model : presetConfig.model,
  modelFamily: cliOptions.modelFamily || presetConfig.modelFamily || require('../config/model-defaults').getDefaultModelFamily('cli'),
  maxTokens: cliOptions.maxTokens !== null ? cliOptions.maxTokens : presetConfig.maxTokens,
  analysisDepth: cliOptions.analysisDepth !== null ? cliOptions.analysisDepth : presetConfig.analysisDepth,
  // Ensure captureTimeout from CLI takes precedence over preset
  captureTimeout: commandFlags['capture-timeout'] !== undefined ? cliOptions.captureTimeout : (presetConfig.captureTimeout || cliOptions.captureTimeout),
};

// Resolve effective captureTimeout including environment variable fallback
if (cliOptions.captureTimeout === null || cliOptions.captureTimeout === undefined) {
  cliOptions.captureTimeout = parseInt(process.env.PAGE_LOAD_TIMEOUT || '60000', 10);
}

// Apply preset defaultModules if no explicit --modules flag was provided
if (commandFlags['modules'] === undefined && presetConfig.defaultModules && Array.isArray(presetConfig.defaultModules)) {
  cliOptions.modulesToRun = [...presetConfig.defaultModules];
  if (cliOptions.verbose) {
    console.log(`📋 Using tier default modules for ${cliOptions.tier}: ${cliOptions.modulesToRun.join(', ')}`);
  }
}

// If preset specifies null for model/family, it means dynamic selection, so CLI's specific args take precedence.
// If CLI also doesn't specify, then the underlying getModelConfig will use its defaults.
if (presetConfig.model === null && commandFlags['model'] === undefined) { cliOptions.model = null; }
if ((presetConfig.modelFamily === null || presetConfig.modelFamily === undefined) && commandFlags['model-family'] === undefined) { cliOptions.modelFamily = null; }


// Validate AI credentials based on final model strategy and family
console.log(chalk.blue('Validating AI credentials...'));
const modelValidationConfig = {
  model: cliOptions.model, // Specific model ID if provided
  vision: cliOptions.modulesToRun.includes('ui'),
  allowFallback: true,
  tier: cliOptions.tier === 'Enterprise' ? 'enterprise' : (cliOptions.tier === 'Pro' ? 'pro' : 'basic') // Map service tier to model tier
};
if (cliOptions.modelStrategy === 'specialized' || cliOptions.modelStrategy === 'consensus' || !cliOptions.model) {
  // If strategy isn't single or no specific model chosen, validation should check based on preferred family or general availability
  modelValidationConfig.model = cliOptions.modelFamily || require('../config/model-defaults').getDefaultModelFamily('cli'); // Validate against preferred family
}

const modelValidation = getModelConfig(modelValidationConfig);

if (!modelValidation.valid) {
  console.error(chalk.red(`AI Credential Error: ${modelValidation.error}`));
  console.error('Please check your API keys in the .env file or environment for the required model provider(s).');
  process.exit(1);
}
if (modelValidation.fallback && cliOptions.verbose) {
  console.log(chalk.yellow(`Warning: AI model selection fell back from preferred to ${modelValidation.model} (Provider: ${modelValidation.provider})`));
}
if (cliOptions.verbose) {
  console.log(chalk.green(`✓ AI credentials validated. Effective provider: ${modelValidation.provider}, Model hint: ${modelValidation.model || 'Provider Default'}`));
  console.log(chalk.blue(`Analysis Configuration:`));
  console.log(`  • URL: ${url}`);
  console.log(`  • Modules: ${cliOptions.modulesToRun.join(', ')}`);
  console.log(`  • Tier: ${cliOptions.tier}`);
  console.log(`  • Analysis Depth: ${cliOptions.analysisDepth}`);
  console.log(`  • Model Strategy: ${cliOptions.modelStrategy}`);
  console.log(`  • Model Family: ${cliOptions.modelFamily || 'Auto-select'}`);
  console.log(`  • Specific Model: ${cliOptions.model || 'Auto-select'}`);
  console.log(`  • Max Tokens: ${cliOptions.maxTokens || 'Auto-select'}`);
  console.log(`  • Viewports: ${cliOptions.viewports.join(', ')}`);
  console.log(`  • Capture Timeout: ${cliOptions.captureTimeout || 60000}ms`);
  console.log(`  • Report Format: ${cliOptions.reportFormat}`);
  console.log(`  • Output Directory: ${cliOptions.outputDir || './storage/reports/'}`);
}


// Log key info
console.log(chalk.cyan(`
uilensai.com
|   ◕ ◡ ◕   |
 ~~~~~~~~~~~
UILensAI - Visual UI Analysis v${packageJson.version}`));
console.log(`Analyzing URL: ${cliOptions.url}`);
console.log(`Tier: ${cliOptions.tier}`);
console.log(`Modules: ${cliOptions.modulesToRun.join(', ')}`);
console.log(`Effective Model Family: ${cliOptions.modelFamily || modelValidation.provider || 'Default'}`);
if (cliOptions.model) { console.log(`Preferred Model ID: ${cliOptions.model}`); }
console.log(`Model Strategy: ${cliOptions.modelStrategy}`);
console.log(`Report Format: ${cliOptions.reportFormat}`);
if (cliOptions.verbose) {
  console.log("Full CLI Options:", JSON.stringify(cliOptions, null, 2));
}

runAnalysis();

async function runAnalysis() {
  const runId = uuidv4();

  try {
    // SERVERLESS-FIRST: No browser launch — all data from CF APIs + PSI + HTTP
    if (!cliOptions.skipDomainValidation) {
      if (cliOptions.verbose) { console.log(`🔍 Validating domain for ${cliOptions.url}...`); }
      const { validateDomain } = require('../utils/domainValidator');
      const domainValidation = await validateDomain(cliOptions.url, cliOptions.verbose);
      if (!domainValidation.valid) {
        console.error(chalk.red(`❌ Domain validation failed: ${domainValidation.error}`));
        process.exit(1);
      }
      if (domainValidation.warning) { console.warn(chalk.yellow(`⚠️ Domain warning: ${domainValidation.warning}`)); }
      if (cliOptions.verbose) { console.log(chalk.green(`✅ Domain validation passed.`)); }
    } else {
      if (cliOptions.verbose) { console.log(chalk.yellow(`⚠️ Skipping domain validation as requested.`)); }
    }

    // OPTIMIZATION: Only capture screenshots for modules that need visual analysis
    // Performance, Security, SEO, Privacy, Compatibility modules don't need screenshots
    const visualAnalysisModules = ['ui', 'marketing', 'conversion', 'accessibility'];
    const needsScreenshots = cliOptions.modulesToRun.some(module => visualAnalysisModules.includes(module));

    let screenshotResults = [];
    let processedViewportsForCapture = [];
    let crawlData = null;

    // Start deep crawl concurrently (always-on, runs in parallel with screenshots)
    console.log(chalk.cyan('🕷️  Starting Cloudflare deep crawl in background...'));
    const crawlPromise = crawlWebsite(cliOptions.url, {
      limit: cliOptions.crawlLimit,
      depth: cliOptions.crawlDepth,
      verbose: cliOptions.verbose,
    }).catch(err => {
      console.warn(chalk.yellow(`⚠️  Deep crawl failed (non-fatal): ${err.message}`));
      return null;
    });

    // Capture screenshots via Cloudflare (serverless)
    processedViewportsForCapture = cliOptions.viewports.map(name => ({
      name,
      ...(VIEWPORT_PRESETS[name] || { width: 1024, height: 768, isMobile: false })
    }));

    if (needsScreenshots) {
      const modulesRequiringScreenshots = cliOptions.modulesToRun.filter(module => visualAnalysisModules.includes(module));
      if (cliOptions.verbose) { console.log(`📸 Capturing screenshots for visual analysis modules: ${modulesRequiringScreenshots.join(', ')}...`); }

      console.log(chalk.cyan('☁️  Capturing screenshots via Cloudflare...'));
      screenshotResults = await cfScreenshotService.captureScreenshots({
        url: cliOptions.url,
        viewports: processedViewportsForCapture,
        fullPage: cliOptions.captureFullPage,
        selector: cliOptions.selector,
        timeout: cliOptions.captureTimeout || 45000,
        httpCredentials: cliOptions.captureHttpCredentials,
        verbose: cliOptions.verbose,
      });

      if (screenshotResults.length === 0) {
        console.warn(chalk.yellow('⚠️  Cloudflare screenshots returned no results — UI module will run without screenshots'));
      }
    } else {
      if (cliOptions.verbose) { console.log(`⏭️  Skipping screenshot capture (no visual analysis modules requested)`); }
    }

    // Await deep crawl results (runs concurrently with screenshots above)
    {
      crawlData = await crawlPromise;
      if (crawlData) {
        console.log(chalk.green(`✅ Deep crawl complete: ${crawlData.pages.length} pages extracted (${crawlData.metadata.browserSecondsUsed.toFixed(1)}s browser time)`));

        // AUTO-EXTRACT structured data from key pages via Cloudflare /json endpoint
        // This enriches the raw Markdown with typed JSON (emails, phones, services, team)
        const extractionTargets = [
          { pattern: /\/(contact|reach-us|get-in-touch)/i, schema: 'businessContact' },
          { pattern: /\/(about|about-us|who-we-are)/i, schema: 'businessContact' },
          { pattern: /\/(services|our-services|what-we-do|treatments|procedures)/i, schema: 'services' },
          { pattern: /\/(team|our-team|staff|providers|doctors|professionals)/i, schema: 'team' },
        ];

        const extractionPromises = [];
        for (const page of crawlData.pages) {
          for (const target of extractionTargets) {
            if (target.pattern.test(page.url)) {
              if (cliOptions.verbose) {
                console.log(chalk.cyan(`🧠 /json extraction: ${target.schema} from ${page.url}`));
              }
              extractionPromises.push(
                extractStructuredData(page.url, {
                  ...EXTRACTION_SCHEMAS[target.schema],
                  verbose: cliOptions.verbose,
                }).then(result => ({
                  url: page.url,
                  schema: target.schema,
                  data: result,
                })).catch(err => {
                  if (cliOptions.verbose) {
                    console.warn(chalk.yellow(`⚠️  /json extraction failed for ${page.url}: ${err.message}`));
                  }
                  return null;
                })
              );
              break; // Only match first pattern per page
            }
          }
        }

        if (extractionPromises.length > 0) {
          const extractions = (await Promise.all(extractionPromises)).filter(Boolean).filter(e => e.data);
          if (extractions.length > 0) {
            crawlData.structuredExtractions = extractions;
            console.log(chalk.green(`✅ Structured data extracted from ${extractions.length} page(s): ${extractions.map(e => e.schema).join(', ')}`));
          }
        }
      } else {
        console.log(chalk.yellow('⚠️  Deep crawl returned no results (credentials may be missing)'));
      }
    }

    const analysisOrchestratorOptions = {
      url: cliOptions.url,
      page: null, // Serverless: no Playwright page
      browser: null, // Serverless: no Playwright browser
      modulesToRun: cliOptions.modulesToRun,
      tier: cliOptions.tier,
      featureSet: cliOptions.featureSet,
      analysisDepth: cliOptions.analysisDepth,
      modelConfig: {
        modelFamily: cliOptions.modelFamily,
        model: cliOptions.model,
        maxTokens: cliOptions.maxTokens,
        strategy: cliOptions.modelStrategy,
        testingMode: cliOptions.testingMode
      },
      captureOptions: {
        viewports: cliOptions.viewports,
        fullPage: cliOptions.captureFullPage,
      },
      screenshotPaths: screenshotResults,
      uiOptions: {
        focusAreas: cliOptions.focusAreas,
        selector: cliOptions.selector,
        description: cliOptions.reportDescription,
      },
      // Deep crawl data from Cloudflare Browser Rendering
      crawlData: crawlData,
      // PSI API is always used (serverless-first)
      usePSI: true,
      // Add other module-specific options if parsed from CLI
      verbose: cliOptions.verbose,
      onProgress: (module, status, percent, details) => {
        if (cliOptions.verbose || status === 'Starting' || status === 'Completed' || status === 'Failed') {
          // Ensure percent is a valid number
          const validPercent = (typeof percent === 'number' && !isNaN(percent)) ? Math.round(percent) : 0;
          // Use the status as provided, don't try to filter it
          const progressMessage = `[Progress] ${module || 'Overall'}: ${status} (${validPercent}%)`;
          console.log(details && typeof details === 'object' ? `${progressMessage} - ${JSON.stringify(details)}` : progressMessage);
        }
      }
    };

    if (cliOptions.verbose) { console.log("\n🚀 Starting orchestrated analysis..."); }

    // Execute analysis directly (MCP mode is optional and requires mcpBridge module)
    let analysisReportData;
    if (cliOptions.useMcp) {
      // MCP mode - requires mcpBridge module
      try {
        const { McpBridge } = require('./mcpBridge');
        const mcpBridge = new McpBridge();
        if (cliOptions.verbose) {
          const executionMode = mcpBridge.getExecutionMode();
          console.log("🔧 Execution Mode Configuration:", JSON.stringify(executionMode, null, 2));
        }
        analysisReportData = await mcpBridge.executeAnalysis(cliOptions, analysisOrchestratorOptions);
      } catch (error) {
        console.error("❌ MCP mode failed, falling back to direct analysis:", error.message);
        analysisReportData = await analyzeWebsite(analysisOrchestratorOptions);
      }
    } else {
      // Direct analysis mode (default)
      analysisReportData = await analyzeWebsite(analysisOrchestratorOptions);
    }

    if (cliOptions.verbose) { console.log("🏁 Analysis execution finished."); }

    // Run competitor benchmark if --competitors was specified
    let competitorBenchmarkData = null;
    if (cliOptions.competitorUrls && cliOptions.competitorUrls.length > 0) {
      console.log(`\n🏁 Running competitor benchmark against ${cliOptions.competitorUrls.length} competitor(s)...`);
      try {
        const { runBenchmark } = require('../utils/competitorBenchmark');
        competitorBenchmarkData = await runBenchmark(analysisReportData, cliOptions.competitorUrls, { verbose: cliOptions.verbose });
        // Attach to analysis results so report generator can include it
        analysisReportData.competitorBenchmark = competitorBenchmarkData;
        console.log(`✅ Competitor benchmark complete`);
      } catch (err) {
        console.error(`❌ Competitor benchmark failed: ${err.message}`);
      }
    }

    if (cliOptions.verbose) { console.log("\nGenerating final report..."); }
    const report = await generateReport(
      analysisReportData, // analysisResults
      {
        url: cliOptions.url,
        tier: cliOptions.tier,
        outputDir: cliOptions.outputDir || getStoragePath('reports'), // Use storage module for output directory
        consoleOutput: cliOptions.consoleOutput,
        outputFormat: cliOptions.reportFormat,
        reportDescription: cliOptions.reportDescription,
        testParameters: {
          modules: cliOptions.modulesToRun,
          device: cliOptions.viewports.includes('mobile') && cliOptions.viewports.includes('desktop') ? 'all' :
            cliOptions.viewports.includes('mobile') ? 'mobile' : 'desktop',
          analysisDepth: cliOptions.analysisDepth,
          industryHint: null,
          targetRegion: null
        },
        modelConfig: {
          modelFamily: cliOptions.modelFamily,
          model: cliOptions.model,
          maxTokens: cliOptions.maxTokens,
          strategy: cliOptions.modelStrategy,
          testingMode: cliOptions.testingMode
        },
        captureViewports: processedViewportsForCapture,
        runId: runId,
        commandLineFlags: commandFlags
      }, // options
      cliOptions.verbose // verbose
    );

    // Handle file output using storage module
    let outputPath = null;
    let jsonOutputPath = null;

    if (!cliOptions.consoleOutput) {
      const fs = require('fs').promises;
      const outputDir = cliOptions.outputDir || getStoragePath('reports');

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate filename based on URL and timestamp
      const urlForFilename = new URL(cliOptions.url).hostname.replace(/[^a-zA-Z0-9]/g, '-');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
      const baseFilename = `${timestamp}_${urlForFilename}_${runId.substring(0, 8)}`;

      // Save JSON report
      jsonOutputPath = path.join(outputDir, `${baseFilename}.json`);
      await fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2), 'utf8');

      if (cliOptions.reportFormat === 'json') {
        outputPath = jsonOutputPath;
      } else {
        // For other formats, we'd generate them here
        // For now, default to JSON
        outputPath = jsonOutputPath;
      }
    }

    if (cliOptions.consoleOutput) {
      console.log('\n✅ Analysis complete! (Output to console)');
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\n✅ Analysis complete! Report saved to: ${outputPath}`);
      if (jsonOutputPath && outputPath !== jsonOutputPath) {
        console.log(`JSON data saved to: ${jsonOutputPath}`);
      }
    }

  } catch (error) {
    console.error(chalk.red('\n❌ An error occurred during the analysis process:'));
    console.error(chalk.red(error.message));
    if (cliOptions.verbose && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1; // Indicate an error exit
  } finally {
    if (cliOptions.verbose) { console.log("Cleanup finished."); }
    process.exit();
  }
}
