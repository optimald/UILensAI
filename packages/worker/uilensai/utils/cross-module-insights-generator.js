/**
 * Cross-Module Insights Generator for UILensAI
 * 
 * This module analyzes relationships between different analysis modules
 * and generates holistic insights that span multiple areas of analysis.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate cross-module insights based on completed module data
 * @param {Object} modulesData - Data from all completed modules
 * @param {Object} options - Analysis options
 * @returns {Array} Array of cross-module insights
 */
async function generateCrossModuleInsights(modulesData, options = {}) {
    const { tier = 'Basic', industryContext = {}, verbose = false } = options;
    
    if (verbose) {
        console.log('[CrossModuleInsights] Generating cross-module insights...');
    }
    
    const insights = [];
    
    // Insight 1: Performance-UI-Conversion Correlation
    if (modulesData.performance && modulesData.ui && modulesData.conversion) {
        const performanceScore = modulesData.performance.summary?.score || 0;
        const uiScore = modulesData.ui.summary?.score || 0;
        const conversionScore = modulesData.conversion.summary?.score || 0;
        
        if (performanceScore < 60 && uiScore < 70 && conversionScore < 50) {
            insights.push({
                id: uuidv4(),
                insight: `Poor performance (${performanceScore}/100) combined with suboptimal UI design (${uiScore}/100) is severely impacting conversion potential (${conversionScore}/100). The slow loading times and poor user experience create a negative feedback loop that drives users away before they can convert.`,
                modules: ['performance', 'ui', 'conversion'],
                correlationStrength: 0.85,
                businessImpact: {
                    impact: 'High',
                    description: 'Significant revenue loss due to poor user experience',
                    estimatedLoss: '15-25% of potential conversions',
                    timeToRecovery: '2-4 months'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Implement a coordinated performance and UX optimization initiative focusing on mobile-first design and Core Web Vitals improvement',
                        priority: 'Critical',
                        impact: 'High',
                        effort: 'High',
                        effortHours: { min: 40, max: 80 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'performance',
                        metricA_name: 'lighthouseScore',
                        metricB_module: 'conversion',
                        metricB_name: 'overallConversionRate',
                        correlationType: 'positive',
                        notes: 'Higher performance scores correlate with better conversion rates'
                    }
                ]
            });
        }
    }
    
    // Insight 2: SEO-Performance-Mobile Correlation
    if (modulesData.seoContent && modulesData.performance && modulesData.ui) {
        const seoScore = modulesData.seoContent.summary?.score || 0;
        const performanceScore = modulesData.performance.summary?.score || 0;
        const mobileScore = modulesData.ui.viewportAnalyses?.mobile?.summary?.score || 0;
        
        if (seoScore > 70 && performanceScore < 50 && mobileScore < 60) {
            insights.push({
                id: uuidv4(),
                insight: `Strong SEO foundation (${seoScore}/100) is being undermined by poor mobile performance (${performanceScore}/100) and mobile UX issues (${mobileScore}/100). This creates a disconnect where the site ranks well but fails to convert mobile traffic effectively.`,
                modules: ['seoContent', 'performance', 'ui'],
                correlationStrength: 0.75,
                businessImpact: {
                    impact: 'Medium',
                    description: 'Lost mobile conversion opportunities despite good SEO',
                    estimatedLoss: '10-20% of mobile-driven revenue',
                    timeToRecovery: '1-3 months'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Prioritize mobile performance optimization to capitalize on strong SEO rankings',
                        priority: 'High',
                        impact: 'Medium',
                        effort: 'Moderate',
                        effortHours: { min: 20, max: 40 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'seoContent',
                        metricA_name: 'seoScore',
                        metricB_module: 'performance',
                        metricB_name: 'mobilePerformanceScore',
                        correlationType: 'synergistic',
                        notes: 'SEO and mobile performance work together to drive organic conversions'
                    }
                ]
            });
        }
    }
    
    // Insight 3: Security-Privacy-Compliance Correlation
    if (modulesData.security && modulesData.privacy) {
        const securityScore = modulesData.security.summary?.score || 0;
        const privacyScore = modulesData.privacy.summary?.score || 0;
        
        if (securityScore < 60 && privacyScore < 60) {
            insights.push({
                id: uuidv4(),
                insight: `Critical security (${securityScore}/100) and privacy (${privacyScore}/100) vulnerabilities create significant compliance and trust risks. This combination could lead to regulatory penalties and customer trust erosion.`,
                modules: ['security', 'privacy'],
                correlationStrength: 0.90,
                businessImpact: {
                    impact: 'Critical',
                    description: 'High risk of regulatory penalties and customer trust loss',
                    estimatedLoss: 'Potential fines and reputation damage',
                    timeToRecovery: 'Immediate action required'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Implement comprehensive security and privacy audit with immediate remediation plan',
                        priority: 'Critical',
                        impact: 'Critical',
                        effort: 'High',
                        effortHours: { min: 30, max: 60 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'security',
                        metricA_name: 'securityScore',
                        metricB_module: 'privacy',
                        metricB_name: 'privacyScore',
                        correlationType: 'positive',
                        notes: 'Security and privacy scores are strongly correlated'
                    }
                ]
            });
        }
    }
    
    // Insight 4: Accessibility-UI-Conversion Correlation
    if (modulesData.accessibility && modulesData.ui && modulesData.conversion) {
        const accessibilityScore = modulesData.accessibility.summary?.score || 0;
        const uiScore = modulesData.ui.summary?.score || 0;
        const conversionScore = modulesData.conversion.summary?.score || 0;
        
        if (accessibilityScore < 50 && uiScore < 70 && conversionScore < 60) {
            insights.push({
                id: uuidv4(),
                insight: `Poor accessibility (${accessibilityScore}/100) combined with suboptimal UI design (${uiScore}/100) is limiting conversion potential (${conversionScore}/100) by excluding users with disabilities and creating usability barriers for all users.`,
                modules: ['accessibility', 'ui', 'conversion'],
                correlationStrength: 0.70,
                businessImpact: {
                    impact: 'Medium',
                    description: 'Lost conversions due to accessibility barriers',
                    estimatedLoss: '5-15% of potential conversions',
                    timeToRecovery: '2-4 months'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Implement accessibility-first design approach to improve both usability and conversion rates',
                        priority: 'High',
                        impact: 'Medium',
                        effort: 'Moderate',
                        effortHours: { min: 25, max: 50 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'accessibility',
                        metricA_name: 'accessibilityScore',
                        metricB_module: 'conversion',
                        metricB_name: 'overallConversionRate',
                        correlationType: 'positive',
                        notes: 'Better accessibility correlates with improved conversion rates'
                    }
                ]
            });
        }
    }
    
    // Insight 5: Marketing-Conversion-UI Correlation
    if (modulesData.marketing && modulesData.conversion && modulesData.ui) {
        const marketingScore = modulesData.marketing.summary?.score || 0;
        const conversionScore = modulesData.conversion.summary?.score || 0;
        const uiScore = modulesData.ui.summary?.score || 0;
        
        if (marketingScore > 70 && conversionScore < 50 && uiScore < 60) {
            insights.push({
                id: uuidv4(),
                insight: `Strong marketing foundation (${marketingScore}/100) is being wasted due to poor conversion optimization (${conversionScore}/100) and UI issues (${uiScore}/100). Marketing efforts are driving traffic that fails to convert effectively.`,
                modules: ['marketing', 'conversion', 'ui'],
                correlationStrength: 0.80,
                businessImpact: {
                    impact: 'High',
                    description: 'Wasted marketing budget due to poor conversion funnel',
                    estimatedLoss: '20-30% of marketing ROI',
                    timeToRecovery: '1-3 months'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Optimize conversion funnel and UI design to capitalize on strong marketing performance',
                        priority: 'High',
                        impact: 'High',
                        effort: 'Moderate',
                        effortHours: { min: 30, max: 60 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'marketing',
                        metricA_name: 'marketingScore',
                        metricB_module: 'conversion',
                        metricB_name: 'conversionRate',
                        correlationType: 'synergistic',
                        notes: 'Marketing and conversion optimization work together to maximize ROI'
                    }
                ]
            });
        }
    }
    
    // Insight 6: Performance-Security-Compatibility Correlation
    if (modulesData.performance && modulesData.security && modulesData.compatibility) {
        const performanceScore = modulesData.performance.summary?.score || 0;
        const securityScore = modulesData.security.summary?.score || 0;
        const compatibilityScore = modulesData.compatibility.summary?.score || 0;
        
        if (performanceScore < 50 && securityScore < 60 && compatibilityScore < 70) {
            insights.push({
                id: uuidv4(),
                insight: `Poor performance (${performanceScore}/100), security vulnerabilities (${securityScore}/100), and compatibility issues (${compatibilityScore}/100) create a triple threat that severely impacts user experience and trust across all devices and browsers.`,
                modules: ['performance', 'security', 'compatibility'],
                correlationStrength: 0.75,
                businessImpact: {
                    impact: 'High',
                    description: 'Comprehensive user experience and security issues',
                    estimatedLoss: '15-25% of user engagement and trust',
                    timeToRecovery: '3-6 months'
                },
                crossModuleRecommendations: [
                    {
                        id: uuidv4(),
                        text: 'Implement comprehensive technical audit addressing performance, security, and compatibility issues simultaneously',
                        priority: 'High',
                        impact: 'High',
                        effort: 'High',
                        effortHours: { min: 50, max: 100 }
                    }
                ],
                metricPairs: [
                    {
                        metricA_module: 'performance',
                        metricA_name: 'performanceScore',
                        metricB_module: 'compatibility',
                        metricB_name: 'compatibilityScore',
                        correlationType: 'positive',
                        notes: 'Performance and compatibility issues often occur together'
                    }
                ]
            });
        }
    }
    
    // Enterprise-tier insights
    if (tier === 'Enterprise' || tier === 'Pro') {
        // Add more sophisticated cross-module insights for higher tiers
        insights.push(...generateEnterpriseCrossModuleInsights(modulesData, options));
    }
    
    if (verbose) {
        console.log(`[CrossModuleInsights] Generated ${insights.length} cross-module insights`);
    }
    
    return insights;
}

/**
 * Generate enterprise-specific cross-module insights
 * @param {Object} modulesData - Data from all completed modules
 * @param {Object} options - Analysis options
 * @returns {Array} Array of enterprise cross-module insights
 */
function generateEnterpriseCrossModuleInsights(modulesData, options = {}) {
    const insights = [];
    
    // Enterprise Insight: ROI Impact Analysis
    if (modulesData.performance && modulesData.conversion && modulesData.marketing) {
        const performanceScore = modulesData.performance.summary?.score || 0;
        const conversionScore = modulesData.conversion.summary?.score || 0;
        const marketingScore = modulesData.marketing.summary?.score || 0;
        
        insights.push({
            id: uuidv4(),
            insight: `Strategic analysis reveals that improving performance from ${performanceScore}/100 to 80+ would increase conversion rates by an estimated 15-25%, while enhancing marketing optimization from ${marketingScore}/100 could amplify this impact by 30-40%. This represents a potential 3-5x ROI improvement opportunity.`,
            modules: ['performance', 'conversion', 'marketing'],
            correlationStrength: 0.90,
            businessImpact: {
                impact: 'Critical',
                description: 'Major ROI improvement opportunity through coordinated optimization',
                estimatedGain: '3-5x ROI improvement',
                timeToRecovery: '6-12 months'
            },
            crossModuleRecommendations: [
                {
                    id: uuidv4(),
                    text: 'Launch enterprise-wide digital optimization initiative with dedicated cross-functional team',
                    priority: 'Critical',
                    impact: 'Critical',
                    effort: 'High',
                    effortHours: { min: 100, max: 200 }
                }
            ],
            metricPairs: [
                {
                    metricA_module: 'performance',
                    metricA_name: 'lighthouseScore',
                    metricB_module: 'conversion',
                    metricB_name: 'conversionRate',
                    correlationType: 'synergistic',
                    notes: 'Performance improvements directly impact conversion rates'
                }
            ]
        });
    }
    
    return insights;
}

/**
 * Validate cross-module insights against schema requirements
 * @param {Array} insights - Array of cross-module insights
 * @returns {Array} Validated insights
 */
function validateCrossModuleInsights(insights) {
    return insights.map(insight => {
        // Ensure all required fields are present
        if (!insight.id) insight.id = uuidv4();
        if (!insight.modules || !Array.isArray(insight.modules)) {
            insight.modules = ['ui', 'performance']; // Default fallback
        }
        if (typeof insight.correlationStrength !== 'number') {
            insight.correlationStrength = 0.5; // Default fallback
        }
        if (!insight.businessImpact) {
            insight.businessImpact = {
                impact: 'Medium',
                description: 'Cross-module optimization opportunity',
                estimatedLoss: '5-15% improvement potential',
                timeToRecovery: '2-4 months'
            };
        }
        if (!insight.crossModuleRecommendations || !Array.isArray(insight.crossModuleRecommendations)) {
            insight.crossModuleRecommendations = [];
        }
        
        return insight;
    });
}

/**
 * Generate AI-synthesized cross-module insights using LLM analysis.
 * Feeds all module scores + top issues + industry context to the AI for
 * nuanced, contextual cross-module analysis instead of hardcoded conditionals.
 * 
 * @param {Object} modulesData - Data from all completed modules
 * @param {Object} options - Analysis options
 * @returns {Promise<Array>} Array of AI-generated cross-module insights
 */
async function generateAICrossModuleInsights(modulesData, options = {}) {
    const { industryContext = {}, tier = 'Basic', verbose = false, costAggregator, modelFamily } = options;

    // Build compact summary of all module results for the AI
    const moduleSummary = {};
    for (const [name, data] of Object.entries(modulesData)) {
        if (!data?.summary) continue;
        moduleSummary[name] = {
            score: data.summary.score,
            rating: data.summary.rating,
            topIssues: (data.summary.topIssues || []).slice(0, 3),
            recCount: data.recommendations?.items?.length || 0
        };
    }

    const moduleCount = Object.keys(moduleSummary).length;
    if (moduleCount < 2) {
        if (verbose) console.log('[CrossModuleInsights] Fewer than 2 modules completed, skipping AI synthesis');
        return [];
    }

    const industry = industryContext?.primaryIndustry || industryContext || 'General Business';
    const prompt = `You are an expert digital strategist analyzing a complete website audit for a ${industry} business.

Here are the scores and top issues from each analysis module:

${JSON.stringify(moduleSummary, null, 2)}

Generate 3-5 cross-module insights. For each insight, identify ONE of these patterns:
1. **Reinforcing problems** — where weaknesses in multiple areas compound each other (e.g., slow performance + poor mobile UX = conversion killer)
2. **Contradictions** — where strength in one area is being undermined by weakness in another (e.g., strong SEO but weak content)
3. **Quick wins** — where fixing one issue would lift multiple module scores
4. **Highest-ROI action** — the single most impactful thing this business should do first

IMPORTANT: Be specific to the actual data. Reference actual scores and issues from the modules. Do NOT generate generic advice.

Return a JSON array of objects with this exact schema:
[{
  "insight": "2-3 sentence cross-module observation referencing specific module scores",
  "modules": ["module1", "module2"],
  "patternType": "reinforcing_problem" | "contradiction" | "quick_win" | "highest_roi",
  "priority": "Critical" | "High" | "Medium",
  "estimatedImpact": "Brief business impact description",
  "recommendation": "1-sentence specific, actionable recommendation"
}]

Return ONLY the JSON array, no markdown or explanation.`;

    try {
        const { analyzeWithAI } = require('./ai-models');
        const result = await analyzeWithAI({
            prompt,
            systemPrompt: 'You are a digital strategy consultant. Return only valid JSON arrays. Be specific, never generic.',
            maxTokens: 2000,
            modelFamily: modelFamily,
            costAggregator,
            costLabel: 'CrossModuleInsights',
            verbose
        });

        let aiInsights = result.parsed;
        
        // Handle case where parsed result is nested or stringified
        if (typeof aiInsights === 'string') {
            try { aiInsights = JSON.parse(aiInsights); } catch { aiInsights = []; }
        }
        
        if (!Array.isArray(aiInsights)) {
            if (verbose) console.warn('[CrossModuleInsights] AI returned non-array, falling back');
            return [];
        }

        // Transform AI insights into our schema format
        const formatted = aiInsights.slice(0, 5).map(ai => ({
            id: uuidv4(),
            insight: ai.insight || 'Cross-module optimization opportunity identified.',
            modules: Array.isArray(ai.modules) ? ai.modules : ['performance', 'ui'],
            correlationStrength: ai.priority === 'Critical' ? 0.90 : ai.priority === 'High' ? 0.75 : 0.60,
            businessImpact: {
                impact: ai.priority || 'Medium',
                description: ai.estimatedImpact || 'Cross-module optimization opportunity',
                estimatedLoss: ai.priority === 'Critical' ? '15-30% improvement potential' : '5-15% improvement potential',
                timeToRecovery: ai.priority === 'Critical' ? '1-2 months' : '2-4 months'
            },
            crossModuleRecommendations: [{
                id: uuidv4(),
                text: ai.recommendation || 'Coordinate cross-module optimization initiative.',
                priority: ai.priority || 'Medium',
                impact: ai.priority || 'Medium',
                effort: ai.priority === 'Critical' ? 'High' : 'Moderate',
                effortHours: ai.priority === 'Critical' ? { min: 30, max: 60 } : { min: 15, max: 30 }
            }],
            metricPairs: ai.modules?.length >= 2 ? [{
                metricA_module: ai.modules[0],
                metricA_name: 'score',
                metricB_module: ai.modules[1],
                metricB_name: 'score',
                correlationType: ai.patternType === 'contradiction' ? 'inverse' : 'positive',
                notes: ai.insight?.substring(0, 100) || ''
            }] : [],
            source: 'ai-synthesized',
            patternType: ai.patternType || 'reinforcing_problem'
        }));

        if (verbose) {
            console.log(`[CrossModuleInsights] AI generated ${formatted.length} cross-module insights`);
        }

        return formatted;

    } catch (err) {
        if (verbose) console.warn(`[CrossModuleInsights] AI synthesis failed: ${err.message}`);
        return [];
    }
}

module.exports = {
    generateCrossModuleInsights,
    generateAICrossModuleInsights,
    generateEnterpriseCrossModuleInsights,
    validateCrossModuleInsights
}; 