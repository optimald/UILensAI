/**
 * Two-Pass AI Analysis Pipeline — Gold Standard Architecture
 *
 * Splits AI analysis into two sequential calls:
 *   Pass 1 (Evidence Extraction): Fast model + scraped data → structured observations
 *   Pass 2 (Expert Judgment): Best model + observations + niche context → expert analysis + narrative
 *
 * Falls back to single-pass if Pass 1 fails (backward compatible).
 */
const { analyzeWithAI } = require('./ai-models');
const { getPrompt } = require('./promptTemplates');
const { getPersonaInstructions, getPersona } = require('../agents/personas');
const { getMemoryContext } = require('../agents/procedural-memory');
const { generateWithAgent, isMastraAvailable } = require('../agents/mastra-agents');

/**
 * Execute a two-pass AI analysis for a module.
 *
 * @param {Object} options
 * @param {string} options.moduleName - Module identifier ('conversion', 'ui', 'seo', 'privacy', 'marketing')
 * @param {Object} options.evidenceData - All scraped + utility evidence data
 * @param {Object} options.industryContext - Industry/niche context
 * @param {string} options.pass1Template - promptTemplates key for Pass 1
 * @param {string} options.pass2Template - promptTemplates key for Pass 2
 * @param {Object} [options.pass2Schema] - JSON schema for Pass 2 structured output
 * @param {Object} [options.pass1Options] - Extra options for Pass 1 AI call (e.g. maxTokens)
 * @param {Object} [options.pass2Options] - Extra options for Pass 2 AI call
 * @param {string} [options.singlePassTemplate] - Fallback single-pass template (existing behavior)
 * @param {string} [options.singlePassSystemPrompt] - Fallback single-pass system prompt
 * @param {Array}  [options.images] - Image buffers for vision (UI module)
 * @param {string} [options.imageMediaType] - Media type for images
 * @param {Object} [options.costAggregator] - Cost tracking aggregator
 * @param {string} [options.tier] - User tier
 * @param {string} [options.analysisDepth] - Analysis depth
 * @param {string} [options.modelFamily] - Preferred model family
 * @param {string} [options.model] - Preferred model
 * @param {boolean} [options.verbose] - Verbose logging
 * @returns {Promise<Object>} { evidence, analysis, narrative, usage, fallbackUsed }
 */
async function twoPassAnalysis(options) {
    const {
        moduleName,
        evidenceData,
        industryContext,
        pass1Template,
        pass2Template,
        pass2Schema,
        pass1Options = {},
        pass2Options = {},
        singlePassTemplate,
        singlePassSystemPrompt,
        images,
        imageMediaType,
        costAggregator,
        tier,
        analysisDepth,
        modelFamily,
        model,
        verbose = false,
        // Pre-executed evidence block (from registry.toEvidenceBlock())
        // Injected directly into Pass 2 prompt — replaces tool-calling
        evidenceBlock,
    } = options;

    const totalUsage = { pass1: null, pass2: null, totalCostUSD: 0 };
    let pass1Evidence = null;
    let pass1Failed = false;

    // ─── Pass 1: Evidence Extraction ─────────────────────────────────
    try {
        if (verbose) console.log(`[TwoPass:${moduleName}] Starting Pass 1 — Evidence Extraction`);

        const pass1Prompt = getPrompt(pass1Template, {
            ...evidenceData,
            industryContext: industryContext || { primaryIndustry: 'General Business' },
            url: evidenceData.url || '',
        });

        if (!pass1Prompt) {
            throw new Error(`Pass 1 template '${pass1Template}' not found`);
        }

        const pass1SystemPrompt = `You are an evidence extraction specialist. Analyze the provided website data and return ONLY structured observations — what you see, not what you think about it. Be precise, factual, and comprehensive. Do not make judgments or recommendations; just report the evidence.`;

        const pass1Result = await analyzeWithAI({
            prompt: pass1Prompt,
            systemPrompt: pass1SystemPrompt,
            moduleName: `${moduleName}-evidence`,
            tierName: tier,
            analysisDepth,
            modelFamily: modelFamily,
            model: model,
            temperature: 0.1, // Low temp for factual extraction
            isJsonOutput: true,
            maxTokens: pass1Options.maxTokens || 8192,
            costAggregator,
            verbose,
            ...pass1Options,
        });

        if (pass1Result.data && !pass1Result.error) {
            pass1Evidence = pass1Result.data;
            totalUsage.pass1 = pass1Result.usage;
            totalUsage.totalCostUSD += pass1Result.usage?.costUSD || 0;

            if (verbose) {
                console.log(`[TwoPass:${moduleName}] Pass 1 complete — ${Object.keys(pass1Evidence).length} evidence fields extracted`);
                console.log(`[TwoPass:${moduleName}] Pass 1 cost: $${(pass1Result.usage?.costUSD || 0).toFixed(6)}`);
            }
        } else {
            throw new Error(pass1Result.error || 'Pass 1 returned empty data');
        }
    } catch (err) {
        pass1Failed = true;
        if (verbose) console.warn(`[TwoPass:${moduleName}] Pass 1 failed: ${err.message} — falling back to single-pass`);
    }

    // ─── Pass 2: Expert Judgment ─────────────────────────────────────
    try {
        if (verbose) console.log(`[TwoPass:${moduleName}] Starting Pass 2 — Expert Judgment`);

        // Build Pass 2 prompt with evidence from Pass 1 + scraped utilities
        const pass2Variables = {
            industryContext: industryContext || { primaryIndustry: 'General Business' },
            url: evidenceData.url || '',
            analysisDepth: analysisDepth || 'standard',
            // Include Pass 1 AI-extracted evidence if available
            aiEvidence: pass1Evidence ? JSON.stringify(pass1Evidence, null, 2) : 'No AI evidence available — analyze from raw data below.',
            aiEvidenceAvailable: !pass1Failed,
            // Pre-executed evidence block from registry (deterministic, ground-truth)
            verifiedEvidence: evidenceBlock || '',
            // Include all scraped/utility evidence
            ...evidenceData,
        };

        const pass2Prompt = getPrompt(pass2Template, pass2Variables);

        if (!pass2Prompt) {
            throw new Error(`Pass 2 template '${pass2Template}' not found`);
        }

        const persona = getPersona(moduleName);

        // ─── MASTRA AGENT PATH ────────────────────────────────────────
        // Try Mastra agent first — it handles persona injection, model routing,
        // and structured output natively via Agent.generate().
        let mastraResult = null;
        if (isMastraAvailable()) {
            try {
                if (verbose) console.log(`[TwoPass:${moduleName}] 🧠 Attempting Mastra agent for Pass 2...`);

                mastraResult = await generateWithAgent(moduleName, pass2Prompt, {
                    schema: pass2Schema,
                    tier,
                    industryContext,
                    verbose,
                });

                if (mastraResult.data && !mastraResult.error) {
                    // Mastra succeeded — use its output
                    const analysisData = mastraResult.data;
                    guardAIScores(analysisData);

                    totalUsage.pass2 = mastraResult.usage;
                    totalUsage.totalCostUSD += mastraResult.usage?.costUSD || 0;

                    if (verbose) {
                        console.log(`[TwoPass:${moduleName}] ✅ Mastra agent completed Pass 2`);
                        console.log(`[TwoPass:${moduleName}] Total two-pass cost: $${totalUsage.totalCostUSD.toFixed(6)}`);
                    }

                    return {
                        evidence: pass1Evidence,
                        analysis: analysisData,
                        narrative: analysisData?.narrative || null,
                        usage: totalUsage,
                        pass1Failed,
                        error: null,
                        agentMeta: mastraResult.agentMeta,
                    };
                } else {
                    if (verbose) console.warn(`[TwoPass:${moduleName}] ⚠️ Mastra agent returned no data: ${mastraResult.error} — falling back to analyzeWithAI`);
                }
            } catch (mastraErr) {
                if (verbose) console.warn(`[TwoPass:${moduleName}] ⚠️ Mastra agent threw: ${mastraErr.message} — falling back to analyzeWithAI`);
            }
        }

        // ─── FALLBACK: analyzeWithAI PATH ─────────────────────────────
        // Used when Mastra is unavailable or fails.
        const personaInstructions = getPersonaInstructions(moduleName, { industryContext });

        let pass2SystemPrompt;
        if (personaInstructions) {
            // MASTRA PERSONA: Use the rich expert persona as the system prompt
            pass2SystemPrompt = `${personaInstructions}

You have been provided with structured evidence extracted from a website analysis. Your job is to:
1. Apply expert judgment to the evidence — what does it MEAN for this specific business?
2. Identify the most impactful opportunities and risks
3. Provide specific, actionable recommendations with expected impact
4. Write a concise narrative analysis (3-5 sentences) summarizing your expert assessment natively in the 'narrative' field
5. Provide 'businessImpact' as a JSON object with these exact keys:
   - "revenueImpact": string — quantified revenue or conversion effect (e.g., "Estimated 15-25% bounce rate increase due to 4.2s LCP")
   - "riskExposure": string — compliance, legal, or security risk (e.g., "GDPR non-compliance risk: potential €20M+ fine")
   - "competitiveGap": string — how this affects market position vs competitors
6. Provide comparison to industry standards natively in the 'industryBenchmarks' field
7. Provide estimated returns on fixing issues natively in the 'roiProjections' field
8. Score each area based on the evidence provided — do NOT fabricate data

SCORE-NARRATIVE ALIGNMENT (CRITICAL): Your narrative MUST be consistent with the scores. If a section scores below 60, the narrative must explain what is WRONG — do NOT praise aspects that scored poorly. If a section scores above 80, briefly acknowledge the strength. Focus the narrative on explaining the gap between current state and ideal state. Never write an entirely positive narrative for a module scoring under 70.

IMPLEMENTATION STEPS (REQUIRED): Every recommendation MUST include an 'implementationSteps' array with 3-5 specific steps. Each step must reference specific tools, CSS selectors, file paths, header names, metric values, or API calls. GENERIC steps like 'Review the current state', 'Audit current implementation', or 'Monitor and measure results' are FORBIDDEN. You MUST NOT omit implementationSteps — every single recommendation object must have this array populated.

IMPLEMENTATION STEPS UNIQUENESS: Each recommendation's implementationSteps MUST be unique and specific to THAT recommendation. Do NOT reuse the same steps across different recommendations. If two recommendations are about different problems, they MUST have different implementation steps.

EFFORT ESTIMATION: For each recommendation, choose effort from these tiers: 'Very Low' (1-2h, config tweaks), 'Low' (2-4h, simple CSS/HTML fixes), 'Moderate' (4-8h, component redesign), 'High' (8-16h, significant refactor), 'Very High' (16-40h, architectural changes). Match effortHours to your chosen tier. Do NOT default everything to 1 hour.

Your response MUST be valid JSON conforming to the provided schema. It MUST contain 'narrative', 'businessImpact' (as object), 'industryBenchmarks', and 'roiProjections' as top-level properties. All scores are 0-100.

CRITICAL: Your narrative should read like a senior consultant's assessment, not a generic checklist. Reference specific evidence and explain WHY it matters for this type of business.`;

            // Inject procedural memory context if available
            const memCtx = getMemoryContext(evidenceData.url || '', industryContext?.primaryIndustry, moduleName);
            if (memCtx) {
                pass2SystemPrompt += `\n\n=== PROCEDURAL MEMORY (patterns from previous scans) ===\n${memCtx}`;
                if (verbose) {
                    console.log(`[TwoPass:${moduleName}] 💾 Injected procedural memory context`);
                }
            }

            if (verbose) {
                console.log(`[TwoPass:${moduleName}] 🧠 Using persona: ${persona.name} (${persona.title})`);
            }
        } else {
            // FALLBACK: Use generic expert roles if no Mastra persona exists
            const expertRoles = {
                conversion: `Conversion Rate Optimization (CRO) Expert with deep expertise in user psychology, funnel optimization, and A/B testing for the ${industryContext?.primaryIndustry || 'Unknown'} industry`,
                ui: `Senior UI/UX Design Expert specializing in ${industryContext?.primaryIndustry || 'Unknown'} websites`,
                seo: `SEO and Content Strategy Expert with deep knowledge of ${industryContext?.primaryIndustry || 'Unknown'} search behavior`,
                privacy: `Privacy and Compliance Expert specializing in data protection regulations`,
                marketing: `Digital Marketing Strategist with expertise in ${industryContext?.primaryIndustry || 'Unknown'} market positioning`,
                security: `Principal Security Architect (CISSP, CISM certified) specializing in web application security for ${industryContext?.primaryIndustry || 'Unknown'} organizations`,
                accessibility: `Senior Accessibility Consultant (IAAP CPAC certified) specializing in WCAG 2.1 compliance for ${industryContext?.primaryIndustry || 'Unknown'} websites`,
                performance: `Senior Web Performance Engineer specializing in Core Web Vitals optimization for ${industryContext?.primaryIndustry || 'Unknown'} websites`,
                compatibility: `Senior Browser Compatibility Engineer specializing in cross-browser testing for ${industryContext?.primaryIndustry || 'Unknown'} web applications`,
            };

            pass2SystemPrompt = `You are a ${expertRoles[moduleName] || 'website analysis expert'}. 

You have been provided with structured evidence extracted from a website analysis. Your job is to:
1. Apply expert judgment to the evidence — what does it MEAN for this specific business?
2. Identify the most impactful opportunities and risks
3. Provide specific, actionable recommendations with expected impact
4. Write a concise narrative analysis (3-5 sentences) summarizing your expert assessment natively in the 'narrative' field
5. Provide 'businessImpact' as a JSON object with these exact keys:
   - "revenueImpact": string — quantified revenue or conversion effect (e.g., "Estimated 15-25% bounce rate increase due to 4.2s LCP")
   - "riskExposure": string — compliance, legal, or security risk (e.g., "GDPR non-compliance risk: potential €20M+ fine")
   - "competitiveGap": string — how this affects market position vs competitors
6. Provide comparison to industry standards natively in the 'industryBenchmarks' field
7. Provide estimated returns on fixing issues natively in the 'roiProjections' field
8. Score each area based on the evidence provided — do NOT fabricate data

SCORE-NARRATIVE ALIGNMENT (CRITICAL): Your narrative MUST be consistent with the scores. If a section scores below 60, the narrative must explain what is WRONG — do NOT praise aspects that scored poorly. If a section scores above 80, briefly acknowledge the strength. Focus the narrative on explaining the gap between current state and ideal state. Never write an entirely positive narrative for a module scoring under 70.

IMPLEMENTATION STEPS (REQUIRED): Every recommendation MUST include an 'implementationSteps' array with 3-5 specific steps. Each step must reference specific tools, CSS selectors, file paths, header names, metric values, or API calls. GENERIC steps like 'Review the current state', 'Audit current implementation', or 'Monitor and measure results' are FORBIDDEN. You MUST NOT omit implementationSteps — every single recommendation object must have this array populated.

IMPLEMENTATION STEPS UNIQUENESS: Each recommendation's implementationSteps MUST be unique and specific to THAT recommendation. Do NOT reuse the same steps across different recommendations. If two recommendations are about different problems, they MUST have different implementation steps.

EFFORT ESTIMATION: For each recommendation, choose effort from these tiers: 'Very Low' (1-2h, config tweaks), 'Low' (2-4h, simple CSS/HTML fixes), 'Moderate' (4-8h, component redesign), 'High' (8-16h, significant refactor), 'Very High' (16-40h, architectural changes). Match effortHours to your chosen tier. Do NOT default everything to 1 hour.

Your response MUST be valid JSON conforming to the provided schema. It MUST contain 'narrative', 'businessImpact' (as object), 'industryBenchmarks', and 'roiProjections' as top-level properties. All scores are 0-100.

CRITICAL: Your narrative should read like a senior consultant's assessment, not a generic checklist. Reference specific evidence and explain WHY it matters for this type of business.`;
        }

        const pass2Result = await analyzeWithAI({
            prompt: pass2Prompt,
            systemPrompt: pass2SystemPrompt,
            moduleName,
            tierName: tier,
            analysisDepth,
            modelFamily: modelFamily,
            model: model,
            temperature: 0.25, // Slightly higher for expert reasoning
            isJsonOutput: true,
            customSchema: pass2Schema,
            images,
            imageMediaType,
            vision: !!images,
            maxTokens: pass2Options.maxTokens || 16384,
            costAggregator,
            verbose,
            ...pass2Options,
        });

        totalUsage.pass2 = pass2Result.usage;
        totalUsage.totalCostUSD += pass2Result.usage?.costUSD || 0;

        if (verbose) {
            console.log(`[TwoPass:${moduleName}] Pass 2 complete (analyzeWithAI fallback) — cost: $${(pass2Result.usage?.costUSD || 0).toFixed(6)}`);
            console.log(`[TwoPass:${moduleName}] Total two-pass cost: $${totalUsage.totalCostUSD.toFixed(6)}`);
        }

        const analysisData = pass2Result.data || pass2Result;

        // GOLD-STANDARD: Apply score guardrails to ALL AI-generated scores
        guardAIScores(analysisData);

        // Build agent metadata for report
        const agentMeta = persona ? {
            agentId: persona.id,
            agentName: persona.name,
            agentTitle: persona.title,
        } : null;

        return {
            evidence: pass1Evidence,
            analysis: analysisData,
            narrative: analysisData?.narrative || null,
            usage: totalUsage,
            pass1Failed,
            error: pass2Result.error || null,
            agentMeta,
        };

    } catch (err) {
        if (verbose) console.error(`[TwoPass:${moduleName}] Pass 2 failed: ${err.message}`);

        // If both passes failed, return error state
        return {
            evidence: pass1Evidence,
            analysis: null,
            narrative: null,
            usage: totalUsage,
            pass1Failed,
            error: err.message,
        };
    }
}

/**
 * GOLD-STANDARD: Walk an AI result object and clamp all numeric score fields
 * to valid 1-100 range. Prevents hallucinated scores (e.g. 150, -20) from
 * leaking into reports. Applied automatically after every Pass 2 completion.
 *
 * Recognized score field patterns:
 * - Fields named exactly 'score'
 * - Fields ending in 'Score' (e.g. overallCtaEffectivenessScore)
 * - Fields ending in 'score' (e.g. mobileFriendlinessScore)
 */
function guardAIScores(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'number' && isScoreField(key)) {
            // Clamp to valid range
            if (val < 0 || val > 100 || !Number.isFinite(val)) {
                obj[key] = Math.max(0, Math.min(Math.round(val), 100));
            }
        } else if (Array.isArray(val)) {
            val.forEach(item => guardAIScores(item));
        } else if (typeof val === 'object' && val !== null) {
            guardAIScores(val);
        }
    }
}

function isScoreField(key) {
    return key === 'score'
        || key.endsWith('Score')
        || key.endsWith('score')
        || key === 'effectiveness'
        || key === 'rating_score';
}

module.exports = { twoPassAnalysis, guardAIScores };
