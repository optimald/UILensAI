/**
 * Cost Aggregator Utility
 * 
 * Tracks and aggregates AI API costs throughout the analysis process.
 * Provides methods to add costs and generate final cost breakdowns for reports.
 */

class CostAggregator {
  constructor() {
    this.costs = [];
    this.totalCostUSD = 0;
  }

  /**
   * Adds a cost entry from an AI call
   * @param {Object} costEntry - Cost information from an AI call
   * @param {string} costEntry.module - Module name (e.g., 'ui', 'security', 'IndustryDetection')
   * @param {string} costEntry.provider - AI provider ('anthropic', 'openai', 'google')
   * @param {string} costEntry.model - Model ID used
   * @param {number} costEntry.inputTokens - Input tokens used
   * @param {number} costEntry.outputTokens - Output tokens generated
   * @param {number} costEntry.costUSD - Cost in USD
   * @param {Object} [costEntry.modelCapabilities] - Model capabilities
   * @param {string} [costEntry.selectionReason] - Why this model was selected
   */
  addCost(costEntry) {
    if (!costEntry || typeof costEntry.costUSD !== 'number' || costEntry.costUSD < 0) {
      console.warn('[CostAggregator] Invalid cost entry provided:', costEntry);
      return;
    }

    const entry = {
      module: costEntry.module || 'unknown',
      provider: costEntry.provider || 'unknown',
      model: costEntry.model || 'unknown',
      inputTokens: costEntry.inputTokens || 0,
      outputTokens: costEntry.outputTokens || 0,
      costUSD: parseFloat(costEntry.costUSD.toFixed(6)),
      modelCapabilities: costEntry.modelCapabilities || {},
      selectionReason: costEntry.selectionReason || 'Unknown'
    };

    this.costs.push(entry);
    this.totalCostUSD += entry.costUSD;
    this.totalCostUSD = parseFloat(this.totalCostUSD.toFixed(6)); // Prevent floating point precision issues
  }

  /**
   * Adds cost information from an AI response usage object
   * @param {string} moduleName - Name of the module making the call
   * @param {Object} usage - Usage object from AI response
   */
  addFromUsage(moduleName, usage) {
    if (!usage || typeof usage.costUSD !== 'number') {
      console.warn('[CostAggregator] Invalid usage object provided:', usage);
      return;
    }

    this.addCost({
      module: moduleName,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUSD: usage.costUSD,
      modelCapabilities: usage.modelCapabilities,
      selectionReason: usage.selectionReason
    });
  }

  /**
   * Gets the current total cost
   * @returns {number} Total cost in USD
   */
  getTotalCost() {
    return this.totalCostUSD;
  }

  /**
   * Gets all cost entries
   * @returns {Array} Array of cost entries
   */
  getAllCosts() {
    return [...this.costs]; // Return a copy to prevent external modification
  }

  /**
   * Gets cost breakdown by module
   * @returns {Object} Object with module names as keys and total costs as values
   */
  getCostByModule() {
    const breakdown = {};
    this.costs.forEach(entry => {
      if (!breakdown[entry.module]) {
        breakdown[entry.module] = 0;
      }
      breakdown[entry.module] += entry.costUSD;
      breakdown[entry.module] = parseFloat(breakdown[entry.module].toFixed(6));
    });
    return breakdown;
  }

  /**
   * Gets cost breakdown by provider
   * @returns {Object} Object with provider names as keys and total costs as values
   */
  getCostByProvider() {
    const breakdown = {};
    this.costs.forEach(entry => {
      if (!breakdown[entry.provider]) {
        breakdown[entry.provider] = 0;
      }
      breakdown[entry.provider] += entry.costUSD;
      breakdown[entry.provider] = parseFloat(breakdown[entry.provider].toFixed(6));
    });
    return breakdown;
  }

  /**
   * Gets total token usage
   * @returns {Object} Object with inputTokens and outputTokens totals
   */
  getTotalTokens() {
    const totals = { inputTokens: 0, outputTokens: 0 };
    this.costs.forEach(entry => {
      totals.inputTokens += entry.inputTokens;
      totals.outputTokens += entry.outputTokens;
    });
    return totals;
  }

  /**
   * Generates the cost estimation object for the report schema
   * @returns {Object} Cost estimation object matching the report schema
   */
  generateReportCostEstimation() {
    // Validate that total matches breakdown sum
    const breakdownSum = this.costs.reduce((sum, entry) => sum + entry.costUSD, 0);
    const roundedBreakdownSum = parseFloat(breakdownSum.toFixed(6));

    if (Math.abs(this.totalCostUSD - roundedBreakdownSum) > 0.000001) {
      console.warn(`[CostAggregator] Total cost mismatch detected! Total: $${this.totalCostUSD}, Breakdown sum: $${roundedBreakdownSum}`);
      console.warn(`[CostAggregator] Breakdown entries:`, this.costs.map(c => `${c.module}: $${c.costUSD}`));

      // Fix the total to match the breakdown sum
      this.totalCostUSD = roundedBreakdownSum;
      console.log(`[CostAggregator] Fixed total cost to match breakdown: $${this.totalCostUSD}`);
    }

    return {
      totalCostUSD: this.totalCostUSD,
      currency: 'USD'
    };
  }

  /**
   * Resets the cost aggregator
   */
  reset() {
    this.costs = [];
    this.totalCostUSD = 0;
  }

  /**
   * Gets a summary of the cost aggregation
   * @returns {Object} Summary object with key statistics
   */
  getSummary() {
    const tokens = this.getTotalTokens();
    const moduleBreakdown = this.getCostByModule();
    const providerBreakdown = this.getCostByProvider();

    return {
      totalCostUSD: this.totalCostUSD,
      totalCalls: this.costs.length,
      totalInputTokens: tokens.inputTokens,
      totalOutputTokens: tokens.outputTokens,
      averageCostPerCall: this.costs.length > 0 ? parseFloat((this.totalCostUSD / this.costs.length).toFixed(6)) : 0,
      costByModule: moduleBreakdown,
      costByProvider: providerBreakdown,
      mostExpensiveCall: this.costs.length > 0 ? this.costs.reduce((max, entry) => entry.costUSD > max.costUSD ? entry : max) : null,
      leastExpensiveCall: this.costs.length > 0 ? this.costs.reduce((min, entry) => entry.costUSD < min.costUSD ? entry : min) : null
    };
  }
}

module.exports = CostAggregator; 