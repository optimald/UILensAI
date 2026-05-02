/**
 * UILensAI Tier Presets Index - Aligned with Schema v3.11.0
 * * Provides predefined configuration presets for different tiers.
 * Now includes 'enterprise' tier.
 */

const basicTierConfig = require('./basic-tier');
const proTierConfig = require('./pro-tier');
const enterpriseTierConfig = require('./enterprise-tier'); // Import enterprise config

/**
 * Get configuration based on tier.
 * @param {'basic'|'pro'|'enterprise'|string} tier - The tier to get configuration for.
 * @returns {Object} The configuration object for the specified tier.
 */
function getPresetConfig(tier) {
  // QUALITY FIX: Collapsed tier system — always return enterprise (all features enabled).
  // Every scan gets world-class output. No artificial feature gating.
  return { ...enterpriseTierConfig };
}

/**
 * Apply tier-specific overrides to configuration.
 * @param {Object} baseConfig - The base configuration object.
 * @param {'basic'|'pro'|'enterprise'|string} tier - The tier to apply.
 * @returns {Object} The configuration with tier-specific overrides applied.
 */
function applyTierOverrides(baseConfig, tier) {
  const tierConfig = getPresetConfig(tier);
  
  // Merge baseConfig with tier-specific settings
  return {
    ...baseConfig,
    ...tierConfig,
    featureSet: {
      ...(baseConfig.featureSet || {}),
      ...(tierConfig.featureSet || {})
    }
  };
}

module.exports = {
  getPresetConfig,
  applyTierOverrides,
  basicTierConfig,
  proTierConfig,
  enterpriseTierConfig
};
