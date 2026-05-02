/**
 * Enterprise Data Generator for UILensAI - Aligned with Schema v3.11.0
 *
 * This utility generates advanced data and insights typically found in an
 * Enterprise-tier report. It augments existing analysis data with features
 * like detailed ROI projections, financial risk assessments, implementation roadmaps,
 * and advanced benchmarking, using AI for generation.
 */

const { v4: uuidv4 } = require('uuid');

const { getPrompt } = require('../utils/promptTemplates');

const { getStructuredData, getSchemaForModule } = require('./structured-llm-output');
const { getModelConfig } = require('./ai-credentials');

const ENTERPRISE_MODEL_TIER = "pro"; // Use 'pro' tier models for enterprise data generation
const MAX_TOKENS_ENTERPRISE_GEN = 8192; // Allow more tokens for complex enterprise data

// Helper to get nested properties safely
function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || obj === null || !pathStr) { return defaultValue; }
    const path = pathStr.split('.');
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, path[i])) {
            return defaultValue;
        }
        current = current[path[i]];
    }
    return current;
}

/**
 * Generates overall ROI projections for the report.
 * Schema: $defs/overallRoiProjections
 */
async function generateOverallRoiProjections(reportData, options) {
    if (options.verbose) { console.log("[EnterpriseGen] Generating overall ROI projections..."); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) {
        console.error("[EnterpriseGen] No valid model for Overall ROI.");
        return null;
    }

    const topRecsSummary = (reportData.topRecommendations?.items || [])
        .slice(0, 3)
        .map(rec => `Text: ${rec.text}, Priority: ${rec.priority}, Source: ${rec.source}, Est. Impact: ${rec.impact || 'N/A'}`)
        .join('\n - ');

    const contextSummary = `
        Overall Score: ${reportData.overallScore}, URL: ${reportData.url}, Industry: ${reportData.industryContext?.primaryIndustry}.
        Key Modules Analyzed: ${Object.keys(reportData.modules || {}).join(', ')}.
        Top strategic recommendations summary:
         - ${topRecsSummary || "No specific top recommendations provided in input."}
        Focus on quantifiable benefits from addressing top issues and leveraging opportunities identified across all modules.
        Consider potential revenue uplift, cost savings, and conversion increases over 1-3 years.
    `.substring(0, 6000); // Cap context length

    const promptText = getPrompt('enterprise-overall-roi', {
        contextSummary, // This placeholder is not in the provided template, adapting.
        overallReportScore: reportData.overallScore,
        url: reportData.url,
        tier: reportData.tier,
        industryContext: reportData.industryContext,
        // The template expects individual topRec fields, let's adapt or assume template change
        topRec1Text: reportData.topRecommendations?.items?.[0]?.text || "N/A",
        topRec1Source: reportData.topRecommendations?.items?.[0]?.source || "N/A",
        topRec1Impact: reportData.topRecommendations?.items?.[0]?.impact || "N/A",
        topRec1Effort: reportData.topRecommendations?.items?.[0]?.effort || "N/A",
        // ... (add more for topRec2, topRec3 if template strictly requires them)
        estimatedInvestmentRange: "Not specified", // Placeholder
        baselineBusinessMetric: "Not specified" // Placeholder
    });
    if (!promptText) { console.error("[EnterpriseGen] Missing prompt template: enterprise-overall-roi"); return null; }

    try {
        const schema = getSchemaForModule("overallRoiProjections");
        if (!schema) { throw new Error("overallRoiProjections schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: "overallRoiProjectionsGenerator",
            prompt: promptText,
            systemPrompt: "You are a financial analyst specializing in website ROI. Generate overall ROI projections based on the provided website analysis summary. Provide specific numbers where possible, adhering to the $defs/overallRoiProjections schema.",
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating overall ROI: ${error.message}`);
        return null;
    }
}

/**
 * Generates module-specific ROI projections.
 * Schema: $defs/roiProjection (singular, for one module)
 */
async function generateModuleRoiProjections(moduleName, moduleData, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating ROI for module: ${moduleName}`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for ${moduleName} ROI.`); return null; }

    const issuesSummary = (moduleData.issues?.items || [])
        .slice(0, 5)
        .map(issue => `Severity: ${issue.severity}, Text: ${issue.text.substring(0, 150)}...`)
        .join('\n - ');
    const recommendationsSummary = (moduleData.recommendations?.items || [])
        .slice(0, 3)
        .map(rec => `Priority: ${rec.priority}, Text: ${rec.text.substring(0, 150)}...`)
        .join('\n - ');

    const promptText = getPrompt('enterprise-module-roi', {
        moduleName,
        industryContext,
        moduleSummary: moduleData.summary,
        issuesSummary: issuesSummary || "No specific issues highlighted.",
        recommendationsSummary: recommendationsSummary || "No specific recommendations highlighted.",
        customerValueMetric: "Not specified", // Placeholder
        moduleBaselineMetric: "Not specified" // Placeholder
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-module-roi for ${moduleName}`); return null; }

    try {
        const schema = getSchemaForModule("roiProjection"); // Schema for a single module's ROI
        if (!schema) { throw new Error("roiProjection schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `${moduleName}RoiProjectionGenerator`,
            prompt: promptText,
            systemPrompt: `You are a financial analyst. Generate ROI projections for the '${moduleName}' module based on its analysis. Adhere to the $defs/roiProjection schema. Focus on quantifiable metrics and realistic timeframes.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN / 2 // Smaller for module-specific
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating ROI for ${moduleName}: ${error.message}`);
        return null;
    }
}

/**
 * Generates financial risk assessment for a module.
 * Schema: $defs/financialRisk
 */
async function generateFinancialRiskAssessment(moduleName, moduleData, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Financial Risk for module: ${moduleName}`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for ${moduleName} Financial Risk.`); return null; }

    const issuesSummary = (moduleData.issues?.items || [])
        .filter(issue => issue.severity === "Critical" || issue.severity === "High")
        .slice(0, 5)
        .map(issue => `Severity: ${issue.severity}, Text: ${issue.text.substring(0, 150)}...`)
        .join('\n - ');

    const promptText = getPrompt('enterprise-financial-risk', {
        moduleName,
        industryContext,
        moduleSummary: moduleData.summary,
        issuesSummary: issuesSummary || "No critical/high issues highlighted for direct risk input.",
        relevantRegulations: (industryContext?.regulatoryFramework || []).map(rf => rf.name).join(', ') || "General best practices",
        businessSizeContext: "Enterprise client", // Placeholder
        pastIncidentsInfo: "Not specified", // Placeholder
        avgBreachCost: industryContext?.primaryIndustry === "Healthcare" ? "$9.42M (IBM 2022)" : "$4.35M (IBM 2022 General)" // Example
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-financial-risk for ${moduleName}`); return null; }

    try {
        const schema = getSchemaForModule("financialRisk");
        if (!schema) { throw new Error("financialRisk schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `${moduleName}FinancialRiskGenerator`,
            prompt: promptText,
            systemPrompt: `You are a risk management consultant. Assess financial risks for the '${moduleName}' module based on its findings. Adhere to the $defs/financialRisk schema. Provide justifiable estimates.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN / 2
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Financial Risk for ${moduleName}: ${error.message}`);
        return null;
    }
}

/**
 * Generates advanced business impact analysis for a module.
 * Schema: $defs/businessImpact
 */
async function generateAdvancedBusinessImpact(moduleName, moduleData, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Business Impact for module: ${moduleName}`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for ${moduleName} Business Impact.`); return null; }

    const recommendationsSummary = (moduleData.recommendations?.items || [])
        .slice(0, 5)
        .map(rec => `Priority: ${rec.priority}, Text: ${rec.text.substring(0, 150)}..., Impact: ${rec.impact || 'N/A'}`)
        .join('\n - ');

    const promptText = getPrompt('enterprise-business-impact', {
        moduleName,
        industryContext,
        moduleSummary: moduleData.summary,
        recommendationsSummary: recommendationsSummary || "No specific recommendations highlighted.",
        businessGoals: getNestedProperty(industryContext, 'businessIntelligence.keyConversionGoals', []).join(', ') || "General business improvement",
        businessKPIs: "Not specified" // Placeholder
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-business-impact for ${moduleName}`); return null; }

    try {
        const schema = getSchemaForModule("businessImpact");
        if (!schema) { throw new Error("businessImpact schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `${moduleName}BusinessImpactGenerator`,
            prompt: promptText,
            systemPrompt: `You are a business strategy consultant. Analyze the business impact of implementing recommendations for the '${moduleName}' module. Adhere to the $defs/businessImpact schema. Focus on qualitative and quantitative impacts aligned with strategy.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN / 2
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Business Impact for ${moduleName}: ${error.message}`);
        return null;
    }
}

/**
 * Generates implementation roadmap for a module's recommendations.
 * Schema: $defs/implementationRoadmap
 */
async function generateImplementationRoadmapForModule(moduleName, recommendations, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Implementation Roadmap for module: ${moduleName}`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for ${moduleName} Roadmap.`); return null; }

    const recItems = recommendations?.items || [];
    const recommendationsSummary = recItems
        .slice(0, 15) // More recommendations for roadmap context
        .map(rec => `ID: ${rec.id}, Priority: ${rec.priority}, Effort: ${rec.effort}, Text: ${rec.text.substring(0, 100)}...`)
        .join('\n - ');

    const promptText = getPrompt('enterprise-roadmap', {
        moduleName,
        industryContext,
        recommendationsSummary: recommendationsSummary || "No recommendations to build roadmap from.",
        overallReportScore: getNestedProperty(options, 'reportData.overallScore', 70), // Requires full reportData passed in options
        businessPriorities: "Not specified", // Placeholder
        availableResources: "Standard enterprise development team", // Placeholder
        projectMethodology: "Agile Scrum" // Placeholder
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-roadmap for ${moduleName}`); return null; }

    try {
        const schema = getSchemaForModule("implementationRoadmap");
        if (!schema) { throw new Error("implementationRoadmap schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `${moduleName}RoadmapGenerator`,
            prompt: promptText,
            systemPrompt: `You are a senior program manager. Develop a strategic implementation roadmap for the '${moduleName}' module recommendations. Adhere to the $defs/implementationRoadmap schema. Prioritize effectively.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN
        });
        // Post-process: Ensure recommendationIds in phases actually exist in the module's recommendations
        if (aiResponse && Array.isArray(aiResponse.phases)) {
            const validRecIds = new Set(recItems.map(r => r.id));
            aiResponse.phases.forEach(phase => {
                if (Array.isArray(phase.recommendationIds)) {
                    phase.recommendationIds = phase.recommendationIds.filter(id => validRecIds.has(id));
                }
            });
        }
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Roadmap for ${moduleName}: ${error.message}`);
        return null;
    }
}

/**
 * Generates advanced industry benchmarking data for a module.
 * Schema: $defs/industryBenchmarks
 */
async function generateAdvancedBenchmarkingData(moduleName, moduleData, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Advanced Benchmarking for module: ${moduleName}`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for ${moduleName} Benchmarking.`); return null; }

    const metricsSummary = `Module: ${moduleName}, Current Score: ${moduleData.summary?.score}. Key metrics: ` +
        Object.entries(moduleData.metrics || moduleData.summary || {}) // Adapt to where metrics are
            .filter(([key, value]) => typeof value === 'number' || (typeof value === 'object' && typeof value.value === 'number'))
            .map(([key, value]) => `${key}: ${typeof value === 'object' ? value.value : value}`)
            .slice(0, 5).join(', ');

    const promptText = getPrompt('enterprise-benchmarking', {
        moduleName,
        industryContext,
        moduleSummary: moduleData.summary, // Pass full summary
        metricsSummary: metricsSummary || "Key metrics not available for direct comparison.",
        // The template expects specific metric values, which might need to be passed if available
        // e.g., lcpValue: getNestedProperty(moduleData, 'metrics.largestContentfulPaint.value')
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-benchmarking for ${moduleName}`); return null; }

    try {
        const schema = getSchemaForModule("industryBenchmarks");
        if (!schema) { throw new Error("industryBenchmarks schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `${moduleName}BenchmarkingGenerator`,
            prompt: promptText,
            systemPrompt: `You are an industry analyst. Provide industry benchmark data for the '${moduleName}' module. Adhere to the $defs/industryBenchmarks schema. Use realistic (simulated if necessary) data.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN / 2
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Benchmarking for ${moduleName}: ${error.message}`);
        return null;
    }
}

/**
 * Generates Zero Trust Analysis (specific to Security module).
 * Schema: $defs/zeroTrustAnalysis
 */
async function generateZeroTrustAnalysis(securityModuleData, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Zero Trust Analysis for Security module...`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for Zero Trust Analysis.`); return null; }

    const securitySummary = `Security Score: ${securityModuleData.summary?.score}. Key Issues: ${(securityModuleData.issues?.items || []).slice(0, 3).map(i => i.text).join('; ')}. SSL Score: ${securityModuleData.ssl?.score}, Headers Score: ${calculateSecurityHeadersScore(securityModuleData.headers)}.`; // calculateSecurityHeadersScore needs to be defined or imported

    const promptText = getPrompt('enterprise-zerotrust', {
        url: options.url, // Assuming url is in options
        tier: "Enterprise",
        industryContext,
        securityModuleSummary: securitySummary,
        authMethods: "Username/Password, SAML (Okta)", // Example, ideally from security module data
        accessControlSummary: "RBAC via AD groups, some permissive roles noted.", // Example
        dataEncryptionSummary: "TLS 1.2+ in transit, AES-256 at rest for sensitive DBs.", // Example
        loggingMonitoringSummary: "Basic web server logs, no central SIEM.", // Example
        incidentResponsePlanStatus: "Documented, tested annually." // Example
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-zerotrust`); return null; }

    try {
        const schema = getSchemaForModule("zeroTrustAnalysis");
        if (!schema) { throw new Error("zeroTrustAnalysis schema not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `zeroTrustAnalysisGenerator`,
            prompt: promptText,
            systemPrompt: `You are a cybersecurity architect specializing in Zero Trust. Provide a Zero Trust Analysis. Adhere to the $defs/zeroTrustAnalysis schema.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN / 2
        });
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Zero Trust Analysis: ${error.message}`);
        return null;
    }
}
// Dummy calculateSecurityHeadersScore for placeholder
function calculateSecurityHeadersScore(headers) { return 60; }


/**
 * Generates Accessibility Implementation Plan (specific to Accessibility module).
 * Schema: $defs/implementationPlan
 */
async function generateAccessibilityImplementationPlan(recommendations, industryContext, options) {
    if (options.verbose) { console.log(`[EnterpriseGen] Generating Accessibility Implementation Plan...`); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for A11y Plan.`); return null; }

    const recItems = recommendations?.items || [];
    const recommendationsSummary = recItems
        .slice(0, 15)
        .map(rec => `ID: ${rec.id}, Priority: ${rec.priority}, WCAG (if any): ${rec.regulatoryReference || 'N/A'}, Text: ${rec.text.substring(0, 100)}...`)
        .join('\n - ');

    const promptText = getPrompt('enterprise-a11y-plan', {
        url: options.url, // Assuming url is in options
        tier: "Enterprise",
        industryContext,
        recommendationsSummary,
        overallA11yScore: getNestedProperty(options, 'moduleData.accessibility.summary.score', 60), // Requires moduleData in options
        currentWcagConformance: getNestedProperty(options, 'moduleData.accessibility.wcagCompliance.conformanceLevelAchieved', "Partial AA"),
        targetWcagLevel: "WCAG 2.1 Level AA", // Example
        a11yBusinessDrivers: "Legal compliance, brand reputation, expanded market reach.", // Example
        existingA11yResources: "One part-time accessibility champion.", // Example
        devLifecycle: "Agile with 2-week sprints." // Example
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-a11y-plan`); return null; }

    try {
        const schema = getSchemaForModule("implementationPlan"); // This is from accessibilityModule $defs
        if (!schema) { throw new Error("implementationPlan schema for accessibility not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `a11yImplementationPlanGenerator`,
            prompt: promptText,
            systemPrompt: `You are an Accessibility Program Manager. Develop an Accessibility Implementation Plan. Adhere to the $defs/implementationPlan schema.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN
        });
        // Post-process: Ensure recommendationIds in phases actually exist
        if (aiResponse && Array.isArray(aiResponse.shortTerm)) {
            const validRecIds = new Set(recItems.map(r => r.id));
            ['shortTerm', 'mediumTerm', 'longTerm'].forEach(term => {
                if (Array.isArray(aiResponse[term])) {
                    aiResponse[term] = aiResponse[term].filter(id => validRecIds.has(id));
                }
            });
        }
        return aiResponse || null;
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating A11y Plan: ${error.message}`);
        return null;
    }
}


/**
 * Generates more sophisticated cross-module insights for Enterprise tier.
 * Schema: Array of $defs/crossModuleInsight
 */
async function generateAdvancedCrossModuleInsights(reportData, options) {
    if (options.verbose) { console.log("[EnterpriseGen] Generating Advanced Cross-Module Insights..."); }
    const { preferredModelFamily, verbose } = options;
    const modelConfig = getModelConfig({ model: preferredModelFamily, tier: ENTERPRISE_MODEL_TIER });
    if (!modelConfig.valid) { console.error(`[EnterpriseGen] No valid model for Adv. Cross-Module Insights.`); return []; }

    const moduleHighlights = Object.entries(reportData.modules || {})
        .map(([name, data]) => `Module: ${name}, Score: ${data.summary?.score}, Top Issue Hint: ${(data.summary?.topIssues || [])[0] || 'N/A'}`)
        .join('\n');

    const promptText = getPrompt('enterprise-cross-module-insights', {
        count: 3, // Request a few advanced insights
        reportSummary: `Overall Score: ${reportData.overallScore}, Tier: ${reportData.tier}`,
        industryContext: reportData.industryContext,
        moduleHighlightsString: moduleHighlights.substring(0, 4000),
        businessObjectivesString: getNestedProperty(reportData, 'industryContext.businessIntelligence.keyConversionGoals', []).join(', ') || "General digital excellence"
    });
    if (!promptText) { console.error(`[EnterpriseGen] Missing prompt template: enterprise-cross-module-insights`); return []; }

    try {
        const fullSchema = await getSchemaForModule("strategicInsights");
        const schema = { type: "array", items: fullSchema.items, minItems: 1, maxItems: 3 };
        if (!schema.items) { throw new Error("strategicInsights schema items not found."); }

        const aiResponse = await getStructuredData({
            moduleType: `advancedCrossModuleInsightsGenerator`,
            prompt: promptText,
            systemPrompt: `You are a Chief Digital Strategist. Identify and articulate advanced, strategic cross-module insights. Adhere to the array of $defs/crossModuleInsight schema.`,
            modelFamily: modelConfig.provider, model: modelConfig.model,
            customSchema: schema, enhancedSchema: true, verbose, maxTokens: MAX_TOKENS_ENTERPRISE_GEN
        });
        return (Array.isArray(aiResponse) ? aiResponse : []).map(insight => { // Basic normalization
            insight.crossModuleRecommendations = insight.crossModuleRecommendations || { items: [], totalAvailableItems: 0, pagination: null };
            return insight;
        });
    } catch (error) {
        console.error(`[EnterpriseGen] Error generating Adv. Cross-Module Insights: ${error.message}`);
        return [];
    }
}

/**
 * Enhances or generates data for advanced visualizations.
 * Schema: Array of $defs/visualizationData
 */
async function enhanceVisualizationData(reportData, options) {
    if (options.verbose) { console.log("[EnterpriseGen] Enhancing Visualization Data..."); }
    // This would be highly dependent on the actual data and desired visualizations.
    // For now, it returns existing data or a placeholder.
    // AI could be used to suggest chart types or summarize data for charts.
    const vizData = reportData.visualizationData || [];
    if (vizData.length === 0) { // Add a placeholder if none exist
        vizData.push({
            chartId: uuidv4(),
            chartType: "summaryCard",
            title: "Overall Report Health (Enterprise Placeholder)",
            data: {
                labels: ["Overall Score"],
                datasets: [{ label: "Score", data: [reportData.overallScore || 75] }]
            },
            options: { responsive: true },
            metricSource: "/overallScore",
            interactivityOptions: { tooltipsEnabled: true, drillDownSupported: false },
            exportOptions: { formats: ["Png"], defaultFormat: "Png" }
        });
    }
    return vizData.slice(0, 5); // Limit to 5 for enterprise
}

/**
 * Orchestrates the generation of all enterprise-specific data sections.
 */
async function generateAllEnterpriseData(reportData, options = {}) {
    const { verbose } = options;

    // Only enable enterprise features for Enterprise tier
    if (reportData.tier !== "Enterprise") {
        if (verbose) { console.log(`[EnterpriseGen] Skipping enterprise data generation, tier is ${reportData.tier} (requires Enterprise).`); }
        return reportData;
    }

    if (verbose) { console.log(`[EnterpriseGen] Starting generation of enterprise-level data sections for ${reportData.tier} tier...`); }

    reportData.featureSet = { // Ensure enterprise features are marked true
        ...getNestedProperty(reportData, 'featureSet', {}),
        detailedComplianceReportingEnabled: true,
        advancedInsightsEnabled: true,
        roiProjectionsEnabled: true,
        crossModuleAnalysisEnabled: true,
        visualizationInteractivityEnabled: true,
        multiLevelDrillDownEnabled: true, // Enterprise only
        visualizationExportEnabled: true,
        realTimeDataIntegrationEnabled: true, // Enterprise only
        advancedIndustryBenchmarkingEnabled: true,
        localizationSupportEnabled: true
    };

    const enterpriseDataPromises = [];

    if (reportData.featureSet.roiProjectionsEnabled && !reportData.overallRoiProjections) {
        enterpriseDataPromises.push(
            generateOverallRoiProjections(reportData, options).then(data => ({ key: 'overallRoiProjections', data }))
        );
    }

    if (reportData.modules) {
        for (const moduleName in reportData.modules) {
            const moduleData = reportData.modules[moduleName];
            if (moduleData) {
                if (verbose) { console.log(`[EnterpriseGen] Queuing enterprise enhancements for module: ${moduleName}`); }
                const moduleOptions = { ...options, url: reportData.url, moduleData }; // Pass moduleData for context

                if (reportData.featureSet.roiProjectionsEnabled && !moduleData.roiProjections) {
                    enterpriseDataPromises.push(
                        generateModuleRoiProjections(moduleName, moduleData, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'roiProjections', data }))
                    );
                }
                if (reportData.featureSet.advancedInsightsEnabled && !moduleData.financialRisk && (moduleName === 'security' || moduleName === 'privacy')) { // Financial risk more relevant here
                    enterpriseDataPromises.push(
                        generateFinancialRiskAssessment(moduleName, moduleData, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'financialRisk', data }))
                    );
                }
                if (reportData.featureSet.advancedInsightsEnabled && !moduleData.businessImpact) {
                    enterpriseDataPromises.push(
                        generateAdvancedBusinessImpact(moduleName, moduleData, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'businessImpact', data }))
                    );
                }
                if (reportData.featureSet.advancedInsightsEnabled && !moduleData.implementationRoadmap) {
                    enterpriseDataPromises.push(
                        generateImplementationRoadmapForModule(moduleName, moduleData.recommendations, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'implementationRoadmap', data }))
                    );
                }
                if (reportData.featureSet.advancedIndustryBenchmarkingEnabled && !moduleData.industryBenchmarks) {
                    enterpriseDataPromises.push(
                        generateAdvancedBenchmarkingData(moduleName, moduleData, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'industryBenchmarks', data }))
                    );
                }
                if (moduleName === "security" && reportData.featureSet.detailedComplianceReportingEnabled && !moduleData.zeroTrustAnalysis) {
                    enterpriseDataPromises.push(
                        generateZeroTrustAnalysis(moduleData, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'zeroTrustAnalysis', data }))
                    );
                }
                if (moduleName === "accessibility" && reportData.featureSet.advancedInsightsEnabled && !moduleData.implementationPlan) {
                    enterpriseDataPromises.push(
                        generateAccessibilityImplementationPlan(moduleData.recommendations, reportData.industryContext, moduleOptions).then(data => ({ moduleName, key: 'implementationPlan', data }))
                    );
                }
            }
        }
    }

    if (reportData.featureSet.crossModuleAnalysisEnabled) {
        enterpriseDataPromises.push(
            generateAdvancedCrossModuleInsights(reportData, options).then(data => ({ key: 'strategicInsights', data, mergeArray: true }))
        );
    }

    if (reportData.featureSet.visualizationInteractivityEnabled || reportData.featureSet.multiLevelDrillDownEnabled) {
        enterpriseDataPromises.push(
            enhanceVisualizationData(reportData, options).then(data => ({ key: 'visualizationData', data, mergeArray: true }))
        );
    }

    const results = await Promise.allSettled(enterpriseDataPromises);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value && result.value.data) {
            const { moduleName, key, data, mergeArray } = result.value;
            if (moduleName) { // Module-specific data
                if (reportData.modules[moduleName]) {
                    reportData.modules[moduleName][key] = data;
                }
            } else { // Root-level data
                if (mergeArray && Array.isArray(reportData[key]) && Array.isArray(data)) {
                    reportData[key] = reportData[key].concat(data); // Simple concat, could be smarter merge
                } else {
                    reportData[key] = data;
                }
            }
        } else if (result.status === 'rejected') {
            console.error(`[EnterpriseGen] Error generating data for ${result.value?.key || 'unknown key'}: ${result.reason}`);
        }
    });

    if (verbose) { console.log(`[EnterpriseGen] Enterprise data generation complete for ${reportData.tier} tier.`); }
    return reportData;
}


module.exports = {
    generateAllEnterpriseData,
    // Export individual generators if needed for more granular control or testing
    generateOverallRoiProjections,
    generateModuleRoiProjections,
    generateFinancialRiskAssessment,
    generateAdvancedBusinessImpact,
    generateImplementationRoadmapForModule,
    generateAdvancedBenchmarkingData,
    generateZeroTrustAnalysis,
    generateAccessibilityImplementationPlan,
    generateAdvancedCrossModuleInsights,
    enhanceVisualizationData
};
