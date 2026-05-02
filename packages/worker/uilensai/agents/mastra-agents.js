/**
 * Mastra Agent Registry for UILensAI
 * ====================================
 *
 * Wraps the 10 analysis modules as named Mastra agents with expert personas.
 * Each agent uses structured output (JSON Schema) and routes through OpenRouter.
 *
 * Usage:
 *   const { getAgent, generateWithAgent } = require('./mastra-agents');
 *   const result = await generateWithAgent('security', prompt, { schema, industryContext });
 *
 * Graceful degradation: if @mastra/core is not installed, all exports
 * return null / no-op so the pipeline falls back to analyzeWithAI.
 */

let Agent;
try {
  ({ Agent } = require('@mastra/core'));
} catch (err) {
  console.warn('[MastraAgents] @mastra/core not available — agents disabled, pipeline will use analyzeWithAI fallback');
  Agent = null;
}

const { getPersona, getPersonaInstructions, getAllPersonasMeta } = require('./personas');
const { getModuleConfig } = require('../config/model-defaults');

// Cache instantiated agents — they're stateless so safe to reuse
const agentCache = new Map();

/**
 * Module-to-model mapping.
 * Uses model-defaults.js for the canonical model ID, then prefixes
 * with 'openrouter/' for Mastra's model router format.
 *
 * e.g. 'google/gemini-3.1-flash-lite-preview' → 'openrouter/google/gemini-3.1-flash-lite-preview'
 */
function getModelIdForModule(moduleName, tier = 'pro') {
  const config = getModuleConfig(moduleName, tier);
  // Mastra model router expects 'openrouter/provider/model' format
  const rawId = config.model;
  return rawId.startsWith('openrouter/') ? rawId : `openrouter/${rawId}`;
}

/**
 * Creates or retrieves a cached Mastra Agent for a given module.
 *
 * @param {string} moduleName - Module key (e.g., 'security', 'ui', 'conversion')
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.tier] - User tier for model selection
 * @param {Object} [options.industryContext] - Industry context for persona calibration
 * @param {Object} [options.tools] - Tools for agents that need them (Audit Director only)
 * @returns {Agent|null} Mastra Agent instance, or null if no persona exists or Mastra unavailable
 */
function getAgent(moduleName, options = {}) {
  if (!Agent) return null;

  const { tier = 'pro', industryContext, tools } = options;
  // When tools are provided, skip cache (tools are per-scan, not reusable)
  const cacheKey = tools ? null : `${moduleName}:${tier}`;

  if (cacheKey && agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey);
  }

  const persona = getPersona(moduleName);
  if (!persona) {
    console.warn(`[MastraAgents] No persona found for module '${moduleName}'`);
    return null;
  }

  const instructions = getPersonaInstructions(moduleName, { industryContext });
  const modelId = getModelIdForModule(moduleName, tier);

  const agentConfig = {
    id: persona.id,
    name: persona.name,
    instructions,
    model: modelId,
  };

  // Inject evidence tools if provided
  if (tools && Object.keys(tools).length > 0) {
    agentConfig.tools = tools;
  }

  const agent = new Agent(agentConfig);

  if (cacheKey) {
    agentCache.set(cacheKey, agent);
  }
  return agent;
}

/**
 * Run a Mastra agent for a module and return structured output.
 *
 * This is the primary API for the two-pass pipeline. It wraps Mastra's
 * agent.generate() with structured output, cost tracking, and fallback handling.
 *
 * @param {string} moduleName - Module key
 * @param {string} prompt - The analysis prompt (Pass 2 expert judgment prompt)
 * @param {Object} options
 * @param {Object} [options.schema] - JSON Schema for structured output
 * @param {string} [options.tier] - User tier
 * @param {Object} [options.industryContext] - Industry context
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @returns {Promise<Object>} { data, agentMeta, usage, error }
 */
async function generateWithAgent(moduleName, prompt, options = {}) {
  if (!Agent) {
    return { data: null, agentMeta: null, usage: null, error: 'Mastra not available' };
  }

  const { schema, tier = 'pro', industryContext, verbose = false, tools } = options;

  const agent = getAgent(moduleName, { tier, industryContext, tools });
  if (!agent) {
    return { data: null, agentMeta: null, usage: null, error: `No agent found for module '${moduleName}'` };
  }

  const persona = getPersona(moduleName);
  const agentMeta = {
    agentId: persona.id,
    agentName: persona.name,
    agentTitle: persona.title,
    module: moduleName,
    orchestrator: 'mastra',
    hasTools: !!tools && Object.keys(tools).length > 0,
  };

  if (verbose) {
    const toolInfo = tools ? ` with ${Object.keys(tools).length} evidence tools` : '';
    console.log(`[MastraAgents] 🧠 ${persona.name} (${persona.title}) analyzing ${moduleName}${toolInfo}...`);
  }

  try {
    const generateOptions = {};

    if (schema) {
      generateOptions.structuredOutput = { schema };
    }

    const response = await agent.generate(prompt, generateOptions);

    // Extract structured data from the response
    const data = response.object || response.text;

    // Extract usage/cost data if Mastra exposes it
    const usage = response.usage ? {
      inputTokens: response.usage.promptTokens || 0,
      outputTokens: response.usage.completionTokens || 0,
      costUSD: response.usage.totalCost || 0,
      modelUsed: getModelIdForModule(moduleName, tier),
    } : null;

    if (verbose) {
      console.log(`[MastraAgents] ✅ ${persona.name} completed ${moduleName} analysis`);
      if (usage) {
        console.log(`[MastraAgents]    Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out, Cost: $${(usage.costUSD || 0).toFixed(6)}`);
      }
    }

    return { data, agentMeta, usage, error: null };
  } catch (error) {
    if (verbose) {
      console.error(`[MastraAgents] ❌ ${persona.name} failed on ${moduleName}: ${error.message}`);
    }

    return { data: null, agentMeta, usage: null, error: error.message };
  }
}

/**
 * Clear the agent cache (call between scans if needed).
 */
function clearAgentCache() {
  agentCache.clear();
}

/**
 * Get metadata for all agents (for reporting/logging).
 */
function getAgentsMeta() {
  return getAllPersonasMeta();
}

/**
 * Check if Mastra agents are available.
 */
function isMastraAvailable() {
  return Agent !== null;
}

module.exports = {
  getAgent,
  generateWithAgent,
  clearAgentCache,
  getAgentsMeta,
  isMastraAvailable,
};
