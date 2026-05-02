/**
 * Pro Tier Preset Configuration for UILensAI
 * Schema Target: v3.11.0
 *
 * This preset defines settings for Pro Tier users, offering a comprehensive
 * suite of analysis features and higher operational limits.
 */

module.exports = {
  tierName: 'Pro', // For clarity
  // Model configuration - Pro tier uses optimal models per module type
  // STRATEGY: Claude for visual analysis (superior), Gemini for text analysis (faster, cheaper), o3 for security reasoning
  modelStrategy: 'specialized', // Specialized models per module type
  modelFamily: 'mixed', // Use different providers per module
  model: null, // Will be determined per module by moduleModelConfigs
  // REMOVED: maxTokens - let intelligent model selection determine token limits based on selected model

  // Analysis configuration
  analysisDepth: 'comprehensive', // Comprehensive analysis for all modules.

  // UI analysis configuration
  viewports: ['narrow-mobile', 'mobile', 'tablet', 'desktop', 'large', 'ultrawide'], // Comprehensive range.
  
  // Default modules to run - All core modules are typically enabled for Pro.
  defaultModules: [
    'ui',
    'performance',
    'seoContent',
    'security',
    'privacy',
    'compatibility',
    'marketing',
    'conversion',
    'accessibility',
    'siteHealth'
  ],

  // Feature flags for Pro Tier (aligned with schema v3.11.0)
  // Pro tier enables most features, except those explicitly Enterprise-only.
  featureSet: {
    detailedComplianceReportingEnabled: true,
    advancedInsightsEnabled: true,
    roiProjectionsEnabled: true,
    crossModuleAnalysisEnabled: true,
    visualizationInteractivityEnabled: true,
    multiLevelDrillDownEnabled: false,        // Typically Enterprise, but schema doesn't restrict Pro. Set to false for differentiation.
    visualizationExportEnabled: true,
    realTimeDataIntegrationEnabled: false,    // Typically Enterprise.
    advancedIndustryBenchmarkingEnabled: true,
    localizationSupportEnabled: true
  },

  // Specific operational parameters
  maxCrawlLinks: 200,
  maxHttpRequests: 200,

  // Specific feature toggles - generally advanced or full for Pro tier
  enableKeywordAnalysis: 'advanced',
  enableContentQualityCheck: true,
  enableCompetitorAnalysis: true,
  backlinkCheck: 'moderate',
  checkVulnerabilities: true,
  checkDataLayer: true,
  checkAdTech: true,
  checkForms: true,
  checkFunnels: true,
  analyzeBrandVoice: true,
  calculateContentRoi: true,
  checkExpertiseSignals: true,
  contentFreshnessCheck: true,
  competitiveContentAnalysis: true,

  // Performance settings
  parallelAnalysis: true,
  reportDetailLevel: 'comprehensive', // More detailed than 'summary'.
  includeActionableTasks: true,
  includeSummary: true,
  summaryRecommendations: 7, // More top recommendations (schema limits items to 30 for Pro).

  // Browser settings
  captureStealthLevel: 'advanced',

  // Output settings
  reportFormat: 'json',
  consoleOutput: false,

  // Schema version this preset targets
  schemaVersion: '4.0.0',

  // Module-specific model requirements
  // OPTIMIZATION: Use Claude for visual modules (superior), Gemini for text (faster/cheaper), o3 for security reasoning
  moduleModelConfigs: {
    default: { 
      performanceTier: 'intermediate', 
      supportsVision: false, 
      minContext: 128000,
      preferredProvider: 'google', // Default to Gemini for speed
      preferredModel: 'gemini-1.5-pro' // Stable pro model
    },
    // VISUAL MODULE - Use Gemini 2.0 Flash for screenshot analysis (vision + cost-effective)
    ui: { 
      performanceTier: 'intermediate', 
      supportsVision: true, 
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-2.0-flash-exp' // Gemini 2.0 Flash has vision capabilities
    },
    // DOM-BASED MODULES - Use Gemini 2.5 (no screenshots, just DOM analysis)
    marketing: { 
      performanceTier: 'intermediate', 
      supportsVision: false, // Marketing analyzes DOM (CTAs, links), not screenshots
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for marketing analysis
    },
    conversion: { 
      performanceTier: 'intermediate', 
      supportsVision: false, // Conversion analyzes DOM (forms, buttons), not screenshots
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for conversion analysis
    },
    accessibility: { 
      performanceTier: 'advanced', 
      supportsVision: false, // Accessibility analyzes DOM (ARIA, alt text), not screenshots
      minContext: 200000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for accessibility analysis
    },
    // TEXT MODULES - Use Gemini 2.5 (faster, cheaper, excellent for structured analysis)
    performance: { 
      performanceTier: 'intermediate', 
      supportsVision: false, 
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-flash' // Fast/cheap for metrics
    },
    seoContent: { 
      performanceTier: 'intermediate', 
      supportsVision: false, 
      minContext: 200000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for complex SEO
    },
    security: { 
      performanceTier: 'advanced', 
      supportsVision: false, 
      minContext: 200000,
      preferredProvider: 'openai',
      preferredModel: 'o3' // Reasoning model for superior vulnerability detection ($2/$8 per M)
    },
    privacy: { 
      performanceTier: 'intermediate', 
      supportsVision: false, 
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for privacy analysis
    },
    compatibility: { 
      performanceTier: 'intermediate', 
      supportsVision: false, 
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-flash' // Fast for browser compat
    },
    siteHealth: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 32000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-flash' // Fast for link validation (no AI needed)
    },
    'top-recommendations': {
      performanceTier: 'intermediate', 
      supportsVision: false,
      minContext: 128000,
      preferredProvider: 'google',
      preferredModel: 'gemini-1.5-pro' // Pro for strategic recommendations
    }
  },

  modelProviderPreferences: ['mixed'] // Signal to use per-module preferences
};
