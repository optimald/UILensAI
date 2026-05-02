/**
 * CEO Orchestrator Agent — "Victoria Sterling"
 * ===============================================
 *
 * The 10th meta-agent that acts as Chief Digital Strategy Officer.
 * Reads all 9 module results + debate verdicts, then produces:
 *   1. Executive Summary (3-5 sentence strategic narrative)
 *   2. Cross-Module Insight Synthesis (replaces deterministic insights)
 *   3. Strategic Priority Ranking (top 3 actions by business ROI)
 *   4. Risk Assessment ("What happens if they do nothing?")
 *
 * Single AI call using gemini-2.5-flash, ~4K tokens.
 */

const { analyzeWithAI } = require('../utils/ai-models');
const { getModuleConfig } = require('../config/model-defaults');

/**
 * Victoria Sterling — Chief Digital Strategy Officer
 */
const CEO_PERSONA = {
  id: 'ceo-victoria-sterling',
  name: 'Victoria Sterling',
  title: 'Chief Digital Strategy Officer',
  instructions: `You are Victoria Sterling, a Chief Digital Strategy Officer with a 20-year track record turning around digital presences for Fortune 500 companies.

BACKGROUND:
- Former McKinsey digital transformation practice lead
- Led digital overhauls for 3 companies during IPO preparation
- Board advisor to 12 SaaS companies
- Published author: "Digital Presence as Competitive Moat" (Harvard Business Review)

THINKING STYLE:
- You think in BUSINESS IMPACT, not technical checklists
- Every finding maps to revenue, risk, or competitive advantage
- You prioritize ruthlessly — a CEO's time is worth $500/hour, which recommendations merit that investment?
- You see patterns across modules that individual specialists miss

COMMUNICATION STYLE:
- Write like you're briefing a Fortune 500 CEO in an elevator: precise, actionable, no jargon
- Lead with the strategic insight, not the technical detail
- Use concrete numbers: "This costs you ~$X/month in lost conversions" not "could be improved"
- Be direct about severity: "This is a board-level risk" vs "This needs attention"

SCORING PHILOSOPHY:
- You validate the overall score against industry reality — a 92 for a site with fundamental security gaps is wrong
- Debate adjustments are advisory; you make the final call
- You look for the "hidden story" — what do the numbers ACTUALLY mean together?`,
};

/**
 * Compress all module results into a compact briefing for the CEO.
 */
function buildCEOBriefing(moduleResults, debateResults, industryContext) {
  const sections = [];

  // Module summary table
  sections.push('=== MODULE SCORES ===');
  for (const [name, data] of Object.entries(moduleResults)) {
    if (!data?.summary) continue;
    const score = data.summary.score;
    const rating = data.summary.rating || 'N/A';
    const preDebate = data.summary._preDebateScore;
    const adjustment = data.summary._debateAdjustment;
    const adjustmentStr = adjustment ? ` (debate: ${adjustment >= 0 ? '+' : ''}${adjustment}, was ${preDebate})` : '';
    const topIssue = data.summary.topIssues?.[0] || '';

    sections.push(`${name}: ${score}/100 [${rating}]${adjustmentStr} — ${topIssue.substring(0, 100)}`);
  }

  // Narratives (compressed)
  sections.push('\n=== EXPERT NARRATIVES ===');
  for (const [name, data] of Object.entries(moduleResults)) {
    if (!data?.narrative) continue;
    const agent = data._agentMeta?.agentName || name;
    sections.push(`${agent} (${name}): ${data.narrative.substring(0, 200)}`);
  }

  // Debate verdicts
  if (debateResults?.verdicts?.length > 0) {
    sections.push('\n=== DEBATE VERDICTS ===');
    for (const v of debateResults.verdicts) {
      if (v.skipped) continue;
      sections.push(`${v.debateId}: ${v.verdict || 'No verdict'}`);
      if (v.contradictions?.length > 0) {
        sections.push(`  Contradictions: ${v.contradictions.slice(0, 2).join('; ')}`);
      }
    }
  }

  // Cross-cutting insights from debates
  if (debateResults?.crossCuttingInsights?.length > 0) {
    sections.push('\n=== CROSS-CUTTING INSIGHTS ===');
    sections.push(debateResults.crossCuttingInsights.slice(0, 5).join('\n'));
  }

  // Industry context
  sections.push(`\n=== INDUSTRY: ${industryContext?.primaryIndustry || 'Unknown'} ===`);
  if (industryContext?.subtype) sections.push(`Subtype: ${industryContext.subtype}`);

  return sections.join('\n');
}

/**
 * Build the CEO orchestrator prompt.
 */
function buildCEOPrompt(briefing, memoryContext) {
  let prompt = `${CEO_PERSONA.instructions}

You have received the complete analysis from your team of 9 expert analysts, plus the results of adversarial cross-examination debates.

${briefing}`;

  if (memoryContext) {
    prompt += `\n\n=== PROCEDURAL MEMORY (patterns from previous scans) ===\n${memoryContext}`;
  }

  prompt += `

YOUR TASK: Synthesize everything above into an executive verdict.

Respond in valid JSON:
{
  "executiveSummary": "3-5 sentences. Strategic narrative a CEO would read. Lead with the most important finding.",
  "overallVerdict": "One-liner: the single most important thing about this site's digital presence",
  "crossModuleInsights": [
    {
      "insight": "string — pattern only visible by comparing multiple modules",
      "modules": ["module1", "module2"],
      "correlationStrength": 0.8,
      "businessImpact": "string — concrete business consequence",
      "crossModuleRecommendations": ["string — actions that address the cross-cutting issue"]
    }
  ],
  "strategicPriorities": [
    {
      "rank": 1,
      "action": "string — specific action",
      "expectedImpact": "string — quantified where possible",
      "effort": "Low|Medium|High",
      "modules": ["affected modules"]
    }
  ],
  "riskAssessment": {
    "inactionRisk": "string — what happens if they do nothing for 6 months",
    "severity": "Low|Medium|High|Critical",
    "competitiveImplication": "string — how this affects their market position"
  },
  "scoreValidation": {
    "overallScoreAssessment": "string — is the calculated overall score accurate?",
    "suggestedAdjustment": 0,
    "adjustmentReason": "string — only if adjustment needed"
  },
  "confidence": 0.85
}

CRITICAL RULES:
- Maximum 5 cross-module insights (quality over quantity)
- Maximum 3 strategic priorities (if everything is urgent, nothing is)
- suggestedAdjustment must be between -10 and +10
- Do NOT fabricate evidence. Only reference data from the briefing.
- BE SPECIFIC: "$12K/month in lost conversions" not "significant revenue loss"`;

  return prompt;
}

/**
 * Run the CEO orchestrator.
 *
 * @param {Object} moduleResults - All module analysis results
 * @param {Object} debateResults - Results from the debate protocol
 * @param {Object} options
 * @param {Object} options.industryContext
 * @param {string} options.memoryContext - Stringified procedural memory for calibration
 * @param {boolean} options.verbose
 * @param {Object} options.costAggregator
 * @returns {Promise<Object>} CEO verdict
 */
async function runCEOOrchestrator(moduleResults, debateResults, options = {}) {
  const { industryContext, memoryContext, verbose = false, costAggregator } = options;

  if (verbose) {
    console.log('[CEO] 👔 Victoria Sterling reviewing all findings...');
  }

  const startTime = Date.now();

  const briefing = buildCEOBriefing(moduleResults, debateResults, industryContext);
  const prompt = buildCEOPrompt(briefing, memoryContext);

  try {
    const config = getModuleConfig('ceo', 'pro');
    const result = await analyzeWithAI({
      prompt,
      systemPrompt: 'You are Victoria Sterling, Chief Digital Strategy Officer. Respond with valid JSON only.',
      model: config?.model || 'google/gemini-2.5-flash',
      maxTokens: 2500,
      isJsonOutput: true,
      costAggregator,
      costLabel: 'ceo-orchestrator',
      verbose,
    });

    const verdict = result.data || result;

    // Check for API errors (analyzeWithAI doesn't throw, returns { data: null, error: '...' })
    if (result.error || !result.data) {
      throw new Error(result.error || 'AI returned empty data');
    }

    const validVerdict = result.data;

    // Enforce score adjustment bounds
    if (validVerdict.scoreValidation) {
      validVerdict.scoreValidation.suggestedAdjustment = Math.max(
        -10, Math.min(10, validVerdict.scoreValidation.suggestedAdjustment || 0)
      );
    }

    const durationMs = Date.now() - startTime;

    if (verbose) {
      console.log(`[CEO] ✅ Victoria Sterling verdict delivered in ${(durationMs / 1000).toFixed(1)}s`);
      console.log(`[CEO] Overall verdict: ${validVerdict.overallVerdict?.substring(0, 100)}`);
      console.log(`[CEO] Score validation adjustment: ${validVerdict.scoreValidation?.suggestedAdjustment || 0}`);
    }

    return {
      ...validVerdict,
      _meta: {
        agentId: CEO_PERSONA.id,
        agentName: CEO_PERSONA.name,
        agentTitle: CEO_PERSONA.title,
        durationMs,
      },
    };
  } catch (error) {
    if (verbose) {
      console.error(`[CEO] ❌ Orchestrator failed: ${error.message}`);
    }
    return {
      executiveSummary: 'CEO analysis could not be completed due to a technical issue.',
      overallVerdict: 'Analysis incomplete — manual review recommended.',
      crossModuleInsights: [],
      strategicPriorities: [],
      riskAssessment: null,
      scoreValidation: { suggestedAdjustment: 0, adjustmentReason: 'CEO analysis failed' },
      confidence: 0,
      _meta: {
        agentId: CEO_PERSONA.id,
        agentName: CEO_PERSONA.name,
        agentTitle: CEO_PERSONA.title,
        error: error.message,
      },
    };
  }
}

module.exports = {
  CEO_PERSONA,
  runCEOOrchestrator,
  buildCEOBriefing, // Exported for testing
  buildCEOPrompt, // Exported for testing
};
