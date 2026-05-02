/**
 * Enterprise Tier Preset Configuration for UILensAI
 * Schema Target: v3.11.0
 *
 * This preset enables the most comprehensive analysis, utilizing top-tier AI models
 * and unlocking all advanced features for enterprise clients.
 */

module.exports = {
  tierName: 'Enterprise', // For clarity
  // Model configuration - Enterprise tier defaults to the most capable models.
  modelStrategy: 'quality', // Prioritize quality over cost
  modelFamily: 'deepseek',
  // Use DeepSeek for all enterprise analysis
  model: 'deepseek-chat',
  maxTokens: 16384,           // DeepSeek-V3 supports large output

  // Analysis configuration
  analysisDepth: 'deep',      // Deepest level of analysis for all modules.

  // UI analysis configuration
  viewports: ['mobile', 'tablet', 'desktop'], // Only viewports with distinct dimensions and actual screenshots.

  // Default modules to run - All modules are enabled for Enterprise.
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

  // Feature flags for Enterprise Tier (all features enabled as per schema v3.11.0)
  featureSet: {
    detailedComplianceReportingEnabled: true,
    advancedInsightsEnabled: true,
    roiProjectionsEnabled: true,
    crossModuleAnalysisEnabled: true,
    visualizationInteractivityEnabled: true,
    multiLevelDrillDownEnabled: true,
    visualizationExportEnabled: true,
    realTimeDataIntegrationEnabled: true,
    advancedIndustryBenchmarkingEnabled: true,
    localizationSupportEnabled: true
  },

  // Specific operational parameters
  maxCrawlLinks: 1000,
  maxHttpRequests: 500,

  // Specific feature toggles - all advanced features enabled
  enableKeywordAnalysis: 'advanced',
  enableContentQualityCheck: true,
  enableCompetitorAnalysis: true,
  backlinkCheck: 'full',
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
  reportDetailLevel: 'deep_dive', // Conceptual, maps to most detailed schema output.
  includeActionableTasks: true,
  includeSummary: true,
  summaryRecommendations: 10, // Schema limits items to 50 for Enterprise.

  // Browser settings
  captureStealthLevel: 'advanced', // Or a custom 'maximum' if defined.

  // Output settings
  reportFormat: 'json',
  consoleOutput: false,

  // Schema version this preset targets
  schemaVersion: '4.0.0',

  // Module-specific model requirements
  moduleModelConfigs: {
    default: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    ui: {
      performanceTier: 'advanced',
      supportsVision: true,
      minContext: 200000
    },
    performance: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    seoContent: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    security: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    accessibility: {
      performanceTier: 'advanced',
      supportsVision: true,
      minContext: 200000
    },
    privacy: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    compatibility: {
      performanceTier: 'advanced',
      supportsVision: false,
      minContext: 200000
    },
    marketing: {
      performanceTier: 'advanced',
      supportsVision: true,
      minContext: 200000
    },
    conversion: {
      performanceTier: 'advanced',
      supportsVision: true,
      minContext: 200000
    },
    siteHealth: {
      performanceTier: 'basic',
      supportsVision: false,
      minContext: 32000
    }
  },

  modelProviderPreferences: ['deepseek', 'google'] // Only providers we use
};
