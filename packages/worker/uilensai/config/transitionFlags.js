/**
 * UILensAI MCP Transition Configuration
 * 
 * Centralized control over the transition from direct API to MCP protocol.
 * Enables gradual adoption without breaking existing integrations.
 */

const transitionFlags = {
  // Core MCP routing flags
  USE_MCP_FOR_CLI: process.env.UILENSAI_USE_MCP === 'true',
  USE_MCP_FOR_PROGRAMMATIC: process.env.UILENSAI_PROGRAMMATIC_USE_MCP === 'true',
  
  // Backward compatibility preservation
  PRESERVE_DIRECT_API: process.env.UILENSAI_PRESERVE_DIRECT_API !== 'false', // Default true
  
  // WebEvo integration configuration
  MCP_ENDPOINT: process.env.WEBEVO_MCP_ENDPOINT || 'wss://mcp.webevo.ai',
  WEBEVO_API_ENDPOINT: process.env.WEBEVO_API_ENDPOINT || 'https://api.webevo.ai',
  WEBEVO_MASTER_API_KEY: process.env.WEBEVO_MASTER_API_KEY,
  
  // Transition mode control
  TRANSITION_MODE: process.env.UILENSAI_TRANSITION_MODE || 'dual', // 'direct', 'mcp', 'dual'
  
  // Development and testing flags
  ENABLE_MCP_SIMULATION: process.env.UILENSAI_MOCK_MCP === 'true',
  ENABLE_MCP_FALLBACK: process.env.UILENSAI_MCP_FALLBACK !== 'false', // Default true
  
  // Network security flags
  ALLOW_PUBLIC_ACCESS: process.env.UILENSAI_ALLOW_PUBLIC_ACCESS === 'true', // Default false in production
  WEBEVO_ALLOWED_ORIGINS: process.env.WEBEVO_ALLOWED_ORIGINS?.split(',') || [],
  
  // Monitoring and debugging
  LOG_MCP_REQUESTS: process.env.UILENSAI_LOG_MCP_REQUESTS === 'true',
  VERBOSE_TRANSITION_LOGGING: process.env.UILENSAI_VERBOSE_TRANSITION === 'true'
};

/**
 * Validate transition configuration
 * @returns {Object} Validation result with any configuration issues
 */
function validateTransitionConfig() {
  const issues = [];
  const warnings = [];

  // Check for required WebEvo configuration in MCP mode
  if (transitionFlags.USE_MCP_FOR_CLI || transitionFlags.USE_MCP_FOR_PROGRAMMATIC) {
    if (!transitionFlags.WEBEVO_MASTER_API_KEY && !transitionFlags.ENABLE_MCP_SIMULATION) {
      issues.push('WEBEVO_MASTER_API_KEY is required for MCP mode');
    }
    
    if (!transitionFlags.MCP_ENDPOINT) {
      issues.push('WEBEVO_MCP_ENDPOINT is required for MCP mode');
    }
  }

  // Check transition mode validity
  const validModes = ['direct', 'mcp', 'dual'];
  if (!validModes.includes(transitionFlags.TRANSITION_MODE)) {
    issues.push(`Invalid TRANSITION_MODE: ${transitionFlags.TRANSITION_MODE}. Must be one of: ${validModes.join(', ')}`);
  }

  // Production security warnings
  if (process.env.NODE_ENV === 'production') {
    if (transitionFlags.ALLOW_PUBLIC_ACCESS) {
      warnings.push('Public API access is enabled in production - this should be disabled for WebEvo integration');
    }
    
    if (transitionFlags.ENABLE_MCP_SIMULATION) {
      warnings.push('MCP simulation is enabled in production - this should be disabled');
    }
    
    if (!transitionFlags.WEBEVO_ALLOWED_ORIGINS.length) {
      warnings.push('No WebEvo allowed origins configured - consider restricting access');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Get current transition status for monitoring
 * @returns {Object} Current transition configuration status
 */
function getTransitionStatus() {
  const validation = validateTransitionConfig();
  
  return {
    mode: transitionFlags.TRANSITION_MODE,
    mcpEnabled: {
      cli: transitionFlags.USE_MCP_FOR_CLI,
      programmatic: transitionFlags.USE_MCP_FOR_PROGRAMMATIC
    },
    compatibility: {
      preserveDirectApi: transitionFlags.PRESERVE_DIRECT_API,
      allowPublicAccess: transitionFlags.ALLOW_PUBLIC_ACCESS,
      mcpFallbackEnabled: transitionFlags.ENABLE_MCP_FALLBACK
    },
    webevoIntegration: {
      endpoint: transitionFlags.MCP_ENDPOINT,
      apiKeyConfigured: !!transitionFlags.WEBEVO_MASTER_API_KEY,
      allowedOrigins: transitionFlags.WEBEVO_ALLOWED_ORIGINS.length,
      simulationMode: transitionFlags.ENABLE_MCP_SIMULATION
    },
    validation: {
      valid: validation.valid,
      issueCount: validation.issues.length,
      warningCount: validation.warnings.length
    },
    environment: process.env.NODE_ENV || 'development'
  };
}

/**
 * Log transition configuration on startup
 */
function logTransitionStatus() {
  if (!transitionFlags.VERBOSE_TRANSITION_LOGGING && process.env.NODE_ENV === 'production') {
    return; // Skip logging in production unless explicitly enabled
  }

  const status = getTransitionStatus();
  const validation = validateTransitionConfig();

  console.log('\n🔄 UILensAI MCP Transition Status:');
  console.log(`   Mode: ${status.mode}`);
  console.log(`   MCP CLI: ${status.mcpEnabled.cli ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   MCP Programmatic: ${status.mcpEnabled.programmatic ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   Direct API Preserved: ${status.compatibility.preserveDirectApi ? '✅ Yes' : '❌ No'}`);
  console.log(`   Environment: ${status.environment}`);

  if (validation.issues.length > 0) {
    console.log('\n❌ Configuration Issues:');
    validation.issues.forEach(issue => console.log(`   • ${issue}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️ Configuration Warnings:');
    validation.warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  if (status.webevoIntegration.simulationMode) {
    console.log('\n🧪 MCP Simulation Mode Active (Development)');
  }

  console.log(''); // Empty line for spacing
}

module.exports = {
  ...transitionFlags,
  validateTransitionConfig,
  getTransitionStatus,
  logTransitionStatus
}; 