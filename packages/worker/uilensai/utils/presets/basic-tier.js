/**
 * Basic Tier Preset Configuration for UILensAI
 * Schema Target: v3.11.0
 *
 * This preset defines the default settings for the basic tier, offering
 * a limited but useful set of analysis capabilities.
 * All featureSet flags align with the schema's 'if.properties.tier.const == "Basic"' block.
 */

module.exports = {
  tierName: 'Basic', // For clarity
  // Model configuration - Basic tier uses intelligent selection for lowest cost + fastest models
  // System automatically selects fastest, most cost-effective model from AVAILABLE_MODELS
  // Prioritizes speed and cost over cutting-edge features
  modelStrategy: 'cost-effective', // Optimize for cost and speed
  modelFamily: 'deepseek',          // Preferred family - system selects best from tier list
  model: null,                      // null = use intelligent selection (automatically picks fastest/c cheapest)
  maxTokens: null,                  // null = auto-determined based on selected model's capabilities

  // Analysis configuration
  analysisDepth: 'basic',     // Basic level of analysis for all modules.
  // Module-specific depths inherit from analysisDepth if not set here.
  // e.g., seoDepth: 'basic', securityDepth: 'basic', etc.

  // Module-specific model requirements
  moduleModelConfigs: {
    default: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 32000
    },
    ui: {
      performanceTier: 'basic',
      supportsVision: true,
      minContext: 64000
    },
    performance: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 32000
    },
    seoContent: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 64000
    },
    security: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 128000 // Security schemas are complex
    },
    accessibility: {
      performanceTier: 'basic',
      supportsVision: true,
      minContext: 128000 // WCAG schemas are complex
    },
    privacy: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 64000
    },
    compatibility: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 32000
    },
    marketing: {
      performanceTier: 'basic',
      supportsVision: true,
      minContext: 64000
    },
    conversion: {
      performanceTier: 'basic',
      supportsVision: true,
      minContext: 64000
    }
  },

  // UI analysis configuration
  viewports: ['mobile', 'desktop'], // Limited to standard mobile and desktop.

  // Default modules to run for Basic tier.
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

  // Feature flags for Basic Tier - ALL FALSE as per schema v3.11.0 `if/then` for "Basic" tier.
  featureSet: {
    detailedComplianceReportingEnabled: false,
    advancedInsightsEnabled: false,
    roiProjectionsEnabled: false,
    crossModuleAnalysisEnabled: false,
    visualizationInteractivityEnabled: false,
    multiLevelDrillDownEnabled: false,
    visualizationExportEnabled: false,
    realTimeDataIntegrationEnabled: false,
    advancedIndustryBenchmarkingEnabled: false,
    localizationSupportEnabled: false
  },

  // Specific operational parameters reflecting Basic tier limitations
  maxCrawlLinks: 10,
  maxHttpRequests: 25,

  // Specific feature toggles (often reflecting what's possible with 'basic' depth and disabled featureSet flags)
  enableKeywordAnalysis: 'basic',    // Schema allows string, 'basic' is a conceptual level.
  enableContentQualityCheck: false,
  enableCompetitorAnalysis: false,
  backlinkCheck: 'none',             // Schema allows string.
  checkVulnerabilities: false,       // Usually a Pro/Enterprise feature.
  checkDataLayer: false,
  checkAdTech: false,
  checkForms: true,                  // Basic form checking can be part of 'basic' UI/Conversion.
  checkFunnels: false,
  analyzeBrandVoice: false,
  calculateContentRoi: false,
  checkExpertiseSignals: false,      // E-A-T checks might be limited in basic.
  contentFreshnessCheck: true,       // Basic check.
  competitiveContentAnalysis: false,

  // Performance settings
  parallelAnalysis: false,
  reportDetailLevel: 'summary',     // Corresponds to schema's intent for Basic tier.
  includeActionableTasks: false,    // Actionable tasks are more for Pro/Enterprise.
  includeSummary: true,             // Overall summary is good for all tiers.
  summaryRecommendations: 3,        // Fewer top recommendations (schema limits items to 10 for Basic).

  // Browser settings
  captureStealthLevel: 'basic',     // Default stealth for capture.

  // Output settings
  reportFormat: 'json',             // Default to JSON.
  consoleOutput: false,

  // Schema version this preset targets
  schemaVersion: '4.0.0',

  // Model provider preferences
  modelProviderPreferences: ['deepseek', 'google'] // Only providers we use
}; 