/**
 * Multi-Agent Debate Protocol (Adversarial Alignment)
 * =====================================================
 *
 * After all 9 module agents complete their analysis, 5 strategic debate pairs
 * cross-examine each other's findings to catch inflated scores, contradictions,
 * and missed cross-cutting concerns.
 *
 * Each debate is a SINGLE AI call where one agent challenges another's findings.
 * Cost: ~$0.004 per scan (5 calls × ~2K tokens × flash-lite pricing).
 */

const { analyzeWithAI } = require('../utils/ai-models');
const { getPersona } = require('./personas');
const { getModuleConfig } = require('../config/model-defaults');

/**
 * The 5 strategic debate pairs with adversarial tensions.
 */
const DEBATE_PAIRS = [
  {
    id: 'security-vs-privacy',
    challenger: 'security',
    defender: 'privacy',
    tension: 'Security hardening (strict headers, logging, monitoring) can conflict with privacy minimization (data collection, consent). Does the security score account for privacy exposure? Does the privacy score ignore security gaps that expose user data?',
  },
  {
    id: 'performance-vs-compatibility',
    challenger: 'performance',
    defender: 'compatibility',
    tension: 'Performance optimization (modern formats, code splitting, lazy loading) can break compatibility with older browsers. Does the performance score reward techniques that alienate 10%+ of users? Does compatibility score penalize modern optimizations unfairly?',
  },
  {
    id: 'conversion-vs-marketing',
    challenger: 'conversion',
    defender: 'marketing',
    tension: 'Aggressive conversion tactics (popups, urgency timers, dark patterns) boost CRO metrics but damage brand trust and long-term marketing effectiveness. Are conversion scores rewarding tactics that marketing would flag as brand-damaging?',
  },
  {
    id: 'ui-vs-accessibility',
    challenger: 'ui',
    defender: 'accessibility',
    tension: 'Beautiful visual design (low contrast text, decorative animations, complex layouts) often comes at the cost of accessibility. Is the UI score rewarding designs that exclude 15%+ of users? Is accessibility penalizing designs that actually work well for most users?',
  },
  {
    id: 'seo-vs-conversion',
    challenger: 'seoContent',
    defender: 'conversion',
    tension: 'SEO-optimized content (keyword density, long-form, informational) can dilute conversion focus (clear CTAs, concise value props, action-oriented). Are both modules scoring the same page with contradictory expectations?',
  },
];

/**
 * Build the debate prompt for a single pair.
 */
function buildDebatePrompt(pair, challengerData, defenderData, industryContext) {
  const challengerPersona = getPersona(pair.challenger);
  const defenderPersona = getPersona(pair.defender);

  const challengerName = challengerPersona?.name || pair.challenger;
  const defenderName = defenderPersona?.name || pair.defender;
  const challengerTitle = challengerPersona?.title || pair.challenger;
  const defenderTitle = defenderPersona?.title || pair.defender;

  const challengerScore = challengerData?.summary?.score ?? 'N/A';
  const defenderScore = defenderData?.summary?.score ?? 'N/A';

  // Compress module data to essential findings only
  const compressModuleData = (data, moduleName) => {
    if (!data) return 'No data available';
    const parts = [];
    parts.push(`Score: ${data.summary?.score ?? 'N/A'}/100`);
    parts.push(`Rating: ${data.summary?.rating || 'N/A'}`);
    if (data.summary?.topIssues?.length > 0) {
      parts.push(`Top Issues: ${data.summary.topIssues.slice(0, 3).join('; ')}`);
    }
    if (data.narrative) {
      parts.push(`Narrative: ${data.narrative.substring(0, 300)}`);
    }
    if (data.summary?.strengths?.length > 0) {
      parts.push(`Strengths: ${data.summary.strengths.slice(0, 3).join('; ')}`);
    }
    return parts.join('\n');
  };

  return `You are mediating an adversarial review between two expert analysts.

CHALLENGER: ${challengerName} (${challengerTitle}) — analyzing "${pair.challenger}" module
DEFENDER: ${defenderName} (${defenderTitle}) — analyzing "${pair.defender}" module

ADVERSARIAL TENSION:
${pair.tension}

INDUSTRY: ${industryContext?.primaryIndustry || 'Unknown'}

--- CHALLENGER'S FINDINGS (${pair.challenger}, Score: ${challengerScore}/100) ---
${compressModuleData(challengerData, pair.challenger)}

--- DEFENDER'S FINDINGS (${pair.defender}, Score: ${defenderScore}/100) ---
${compressModuleData(defenderData, pair.defender)}

YOUR TASK: As an impartial arbiter, identify:
1. CONTRADICTIONS: Where do these two analyses contradict each other?
2. SCORE VALIDITY: Are either score inflated or deflated given the evidence?
3. CROSS-CUTTING INSIGHTS: What important observations emerge ONLY when comparing both analyses?
4. ADJUSTMENTS: Recommend score adjustments (max ±5 points) with specific evidence.

Respond in valid JSON:
{
  "debateId": "${pair.id}",
  "contradictions": ["string - specific contradiction with evidence"],
  "challengerScoreAdjustment": { "delta": 0, "reason": "string" },
  "defenderScoreAdjustment": { "delta": 0, "reason": "string" },
  "crossCuttingInsights": ["string - insight only visible through cross-examination"],
  "verdict": "string - 2-3 sentence summary of the debate outcome",
  "confidence": 0.0
}

CRITICAL RULES:
- Score adjustments MUST be between -5 and +5 (inclusive)
- Do NOT fabricate evidence. Only reference data from the findings above.
- If both analyses are consistent, say so — not every debate needs adjustments.
- Confidence: 0.0 (no cross-cutting issues) to 1.0 (critical contradiction found)`;
}

/**
 * Run a single debate between two module agents.
 *
 * @param {Object} pair - Debate pair definition
 * @param {Object} moduleResults - All module results from analysis
 * @param {Object} options - { industryContext, verbose, costAggregator }
 * @returns {Promise<Object>} Debate verdict
 */
async function runDebate(pair, moduleResults, options = {}) {
  const { industryContext, verbose = false, costAggregator } = options;

  const challengerData = moduleResults[pair.challenger];
  const defenderData = moduleResults[pair.defender];

  // Skip debate if either module didn't produce results
  if (!challengerData?.summary || !defenderData?.summary) {
    if (verbose) {
      console.log(`[Debate] ⏭️ Skipping ${pair.id}: missing module data`);
    }
    return {
      debateId: pair.id,
      skipped: true,
      reason: `Missing data for ${!challengerData?.summary ? pair.challenger : pair.defender}`,
    };
  }

  const prompt = buildDebatePrompt(pair, challengerData, defenderData, industryContext);

  if (verbose) {
    console.log(`[Debate] ⚔️ ${pair.id}: ${getPersona(pair.challenger)?.name || pair.challenger} vs ${getPersona(pair.defender)?.name || pair.defender}`);
  }

  try {
    const config = getModuleConfig('debate', 'pro');
    const result = await analyzeWithAI({
      prompt,
      systemPrompt: 'You are an impartial arbiter in a multi-agent adversarial review. You must respond with valid JSON only.',
      model: config?.model || 'google/gemini-2.5-flash-lite',
      maxTokens: 1500,
      isJsonOutput: true,
      costAggregator,
      costLabel: `debate-${pair.id}`,
      verbose,
    });

    let verdict = result.data || result;

    // Check for API errors (analyzeWithAI doesn't throw, returns { data: null, error: '...' })
    if (result.error || !result.data) {
      if (verbose) {
        console.error(`[Debate] ❌ ${pair.id} API error: ${result.error || 'Empty data'}`);
      }
      return {
        debateId: pair.id,
        skipped: true,
        reason: result.error || 'AI returned empty data',
      };
    }

    verdict = result.data;

    // Enforce score adjustment bounds
    if (verdict.challengerScoreAdjustment) {
      verdict.challengerScoreAdjustment.delta = Math.max(-5, Math.min(5, verdict.challengerScoreAdjustment.delta || 0));
    }
    if (verdict.defenderScoreAdjustment) {
      verdict.defenderScoreAdjustment.delta = Math.max(-5, Math.min(5, verdict.defenderScoreAdjustment.delta || 0));
    }

    if (verbose) {
      const cAdj = verdict.challengerScoreAdjustment?.delta || 0;
      const dAdj = verdict.defenderScoreAdjustment?.delta || 0;
      console.log(`[Debate] ✅ ${pair.id}: challenger ${cAdj >= 0 ? '+' : ''}${cAdj}, defender ${dAdj >= 0 ? '+' : ''}${dAdj} | confidence: ${verdict.confidence}`);
    }

    return { ...verdict, skipped: false, debateId: pair.id };
  } catch (error) {
    if (verbose) {
      console.error(`[Debate] ❌ ${pair.id} failed: ${error.message}`);
    }
    return {
      debateId: pair.id,
      skipped: true,
      reason: `Debate failed: ${error.message}`,
    };
  }
}

/**
 * Run all 5 debate pairs in parallel.
 *
 * @param {Object} moduleResults - All module results { security: {...}, privacy: {...}, ... }
 * @param {Object} options - { industryContext, verbose, costAggregator }
 * @returns {Promise<Object>} { verdicts: [...], adjustments: { module: delta }, insights: [...] }
 */
async function runDebateProtocol(moduleResults, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    console.log(`[Debate] 🏛️ Starting adversarial debate protocol (${DEBATE_PAIRS.length} pairs)...`);
  }

  const startTime = Date.now();

  // Run all debates in parallel — they're independent
  const verdictPromises = DEBATE_PAIRS.map(pair => runDebate(pair, moduleResults, options));
  const verdicts = await Promise.allSettled(verdictPromises);

  const resolvedVerdicts = verdicts.map(v =>
    v.status === 'fulfilled' ? v.value : { skipped: true, reason: v.reason?.message || 'Promise rejected' }
  );

  // Aggregate score adjustments per module
  const adjustments = {};
  const allInsights = [];

  for (const verdict of resolvedVerdicts) {
    if (verdict.skipped) continue;

    // Find the pair definition for this verdict
    const pair = DEBATE_PAIRS.find(p => p.id === verdict.debateId);
    if (!pair) continue;

    // Accumulate adjustments
    if (verdict.challengerScoreAdjustment?.delta) {
      adjustments[pair.challenger] = (adjustments[pair.challenger] || 0) + verdict.challengerScoreAdjustment.delta;
    }
    if (verdict.defenderScoreAdjustment?.delta) {
      adjustments[pair.defender] = (adjustments[pair.defender] || 0) + verdict.defenderScoreAdjustment.delta;
    }

    // Collect cross-cutting insights
    if (Array.isArray(verdict.crossCuttingInsights)) {
      allInsights.push(...verdict.crossCuttingInsights);
    }
  }

  // Clamp accumulated adjustments to ±10 (a module can be in at most 2 debates)
  for (const mod of Object.keys(adjustments)) {
    adjustments[mod] = Math.max(-10, Math.min(10, adjustments[mod]));
  }

  const durationMs = Date.now() - startTime;

  if (verbose) {
    console.log(`[Debate] 🏛️ Protocol complete in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[Debate] Adjustments:`, JSON.stringify(adjustments));
    console.log(`[Debate] Cross-cutting insights: ${allInsights.length}`);
  }

  return {
    verdicts: resolvedVerdicts,
    adjustments,
    crossCuttingInsights: allInsights,
    durationMs,
  };
}

/**
 * Apply debate score adjustments to module results (mutates in place).
 *
 * @param {Object} moduleResults - Module results to adjust
 * @param {Object} adjustments - { moduleName: delta }
 * @param {boolean} verbose
 */
function applyDebateAdjustments(moduleResults, adjustments, verbose = false) {
  for (const [moduleName, delta] of Object.entries(adjustments)) {
    if (delta === 0) continue;
    const mod = moduleResults[moduleName];
    if (!mod?.summary || typeof mod.summary.score !== 'number') continue;

    const originalScore = mod.summary.score;
    const newScore = Math.max(0, Math.min(100, originalScore + delta));
    mod.summary.score = newScore;
    mod.summary._preDebateScore = originalScore;
    mod.summary._debateAdjustment = delta;

    if (verbose) {
      console.log(`[Debate] 📊 ${moduleName}: ${originalScore} → ${newScore} (${delta >= 0 ? '+' : ''}${delta})`);
    }
  }
}

module.exports = {
  DEBATE_PAIRS,
  runDebateProtocol,
  applyDebateAdjustments,
  runDebate, // Exported for testing
  buildDebatePrompt, // Exported for testing
};
