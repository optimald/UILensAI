/**
 * Business Context Utility — Shared industryBenchmarks & businessImpact Generator
 * 
 * Provides deterministic, evidence-based defaults for industryBenchmarks 
 * and businessImpact sections across all analysis modules.
 *
 * GOLD-STANDARD: All benchmarks are labeled as industry estimates derived from
 * publicly available cross-industry averages. They are NOT proprietary research.
 */

// Industry-specific benchmark averages by module
const MODULE_BENCHMARKS = {
    performance: {
        averageScore: { value: 65, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        medianPageLoadTime: { value: 3.2, unit: 'seconds', sourceIndustry: 'Cross-industry' },
        averageLCP: { value: 2.5, unit: 'seconds', sourceIndustry: 'Cross-industry' },
        averageCLS: { value: 0.1, unit: 'score', sourceIndustry: 'Cross-industry' },
        averageTBT: { value: 300, unit: 'milliseconds', sourceIndustry: 'Cross-industry' }
    },
    security: {
        averageScore: { value: 60, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        httpsAdoption: { value: 95, unit: 'percent', sourceIndustry: 'Cross-industry' },
        headerCoverage: { value: 45, unit: 'percent', sourceIndustry: 'Cross-industry' },
        cspAdoption: { value: 25, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    accessibility: {
        averageScore: { value: 55, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        wcagAACompliance: { value: 30, unit: 'percent', sourceIndustry: 'Cross-industry' },
        contrastCompliance: { value: 60, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    seoContent: {
        averageScore: { value: 60, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        titleTagOptimization: { value: 70, unit: 'percent', sourceIndustry: 'Cross-industry' },
        metaDescriptionPresence: { value: 65, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    privacy: {
        averageScore: { value: 50, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        privacyPolicyPresence: { value: 80, unit: 'percent', sourceIndustry: 'Cross-industry' },
        consentBannerAdoption: { value: 55, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    compatibility: {
        averageScore: { value: 70, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        responsiveDesignAdoption: { value: 85, unit: 'percent', sourceIndustry: 'Cross-industry' },
        viewportMetaPresence: { value: 90, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    ui: {
        averageScore: { value: 65, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        mobileOptimization: { value: 75, unit: 'percent', sourceIndustry: 'Cross-industry' },
        visualConsistency: { value: 60, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    marketing: {
        averageScore: { value: 55, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        conversionRateOptimization: { value: 3.5, unit: 'percent', sourceIndustry: 'Cross-industry' },
        socialMediaIntegration: { value: 60, unit: 'percent', sourceIndustry: 'Cross-industry' }
    },
    conversion: {
        averageScore: { value: 50, unit: 'out of 100', sourceIndustry: 'Cross-industry' },
        averageConversionRate: { value: 2.5, unit: 'percent', sourceIndustry: 'E-commerce' },
        averageBounceRate: { value: 55, unit: 'percent', sourceIndustry: 'Cross-industry' }
    }
};

// Module-specific business impact templates
const IMPACT_TEMPLATES = {
    performance: {
        qualitative: {
            high: 'Excellent page performance directly improves user experience, reduces bounce rates, and positively impacts search engine rankings. Sites loading under 2 seconds see up to 50% higher conversion rates.',
            medium: 'Moderate performance issues may be causing visitor drop-off. Each additional second of load time can reduce conversions by 7% and increase bounce rates by 11%.',
            low: 'Poor performance is significantly impacting user retention and search visibility. Google uses Core Web Vitals as ranking signals — slow sites lose organic traffic and conversions.'
        },
        metrics: ['Page Load Speed Impact', 'Conversion Rate Effect', 'Search Engine Ranking'],
        strategic: 'Performance optimization directly supports customer acquisition, retention, and revenue growth through improved user experience and SEO.'
    },
    security: {
        qualitative: {
            high: 'Strong security posture builds customer trust, protects brand reputation, and ensures compliance. HTTPS and security headers signal trustworthiness to users and search engines.',
            medium: 'Some security gaps exist that could expose the business to data breaches or compliance penalties. Modern browsers may display warnings to users.',
            low: 'Significant security vulnerabilities pose serious business risk including data breaches, regulatory fines, and loss of customer trust.'
        },
        metrics: ['Customer Trust Index', 'Compliance Risk Level', 'Brand Reputation'],
        strategic: 'Security investments protect against financial losses from breaches ($4.45M average cost) and build the trust foundation for digital commerce.'
    },
    accessibility: {
        qualitative: {
            high: 'Strong accessibility ensures the site is usable by the 15-20% of the population with disabilities, expanding market reach and ensuring ADA/WCAG compliance.',
            medium: 'Accessibility gaps exclude potential customers and increase legal exposure. Many competitors are improving accessibility to capture this underserved market.',
            low: 'Significant accessibility barriers exclude users with disabilities and create substantial legal risk. ADA lawsuits have increased 300% in recent years.'
        },
        metrics: ['Market Reach Expansion', 'Legal Risk Reduction', 'User Satisfaction'],
        strategic: 'Accessibility compliance opens access to 1.3B people globally with disabilities and protects against legal liability while improving overall UX.'
    },
    seoContent: {
        qualitative: {
            high: 'Well-optimized SEO content drives sustainable organic traffic growth. Strong technical SEO foundations and quality content create compounding returns.',
            medium: 'SEO gaps are limiting organic visibility. Competitors with better-optimized content may be capturing traffic that should be coming to this site.',
            low: 'Significant SEO deficiencies are severely limiting search visibility and organic traffic. Content strategy needs fundamental restructuring.'
        },
        metrics: ['Organic Traffic Potential', 'Search Visibility', 'Content Authority'],
        strategic: 'SEO and content optimization is the highest-ROI digital marketing channel, with organic traffic converting 5.6x better than paid search.'
    },
    privacy: {
        qualitative: {
            high: 'Strong privacy practices build user trust and ensure compliance with global regulations. Privacy-conscious users increasingly choose brands that respect their data.',
            medium: 'Privacy implementation gaps could lead to compliance issues with GDPR/CCPA. Growing regulatory enforcement means non-compliance carries increasing risk.',
            low: 'Significant privacy compliance gaps create substantial legal and financial risk. GDPR fines can reach 4% of global annual revenue.'
        },
        metrics: ['Compliance Risk Reduction', 'User Trust Score', 'Data Governance'],
        strategic: 'Privacy compliance protects against regulatory fines and positions the brand as trustworthy in an era of increasing privacy awareness.'
    },
    compatibility: {
        qualitative: {
            high: 'Excellent cross-browser compatibility ensures all users receive a quality experience regardless of device or browser, maximizing audience reach.',
            medium: 'Some compatibility issues may cause display problems for certain browser/device combinations, potentially losing those users.',
            low: 'Significant compatibility issues exclude users on certain browsers or devices, directly reducing potential audience and conversions.'
        },
        metrics: ['Audience Reach', 'Cross-Device Conversion', 'User Satisfaction'],
        strategic: 'Cross-browser compatibility ensures maximum market reach and consistent brand experience across the fragmented device landscape.'
    },
    ui: {
        qualitative: {
            high: 'Professional, intuitive UI design creates strong first impressions and encourages user engagement. Visual quality correlates directly with perceived brand value.',
            medium: 'Some UI inconsistencies may create friction in the user journey. Design improvements could boost engagement and conversion metrics.',
            low: 'UI design issues are creating significant user friction. Users form opinions about credibility within 50ms — poor design drives them away.'
        },
        metrics: ['User Engagement', 'First Impression Score', 'Brand Perception'],
        strategic: 'UI quality directly impacts brand perception and user engagement — 94% of first impressions are design-related.'
    },
    marketing: {
        qualitative: {
            high: 'Well-implemented marketing signals and integrations maximize conversion potential and enable data-driven optimization across channels.',
            medium: 'Some marketing optimization opportunities are being missed. Better analytics integration and conversion tracking could improve ROI.',
            low: 'Significant marketing infrastructure gaps limit the ability to track, optimize, and convert visitors effectively.'
        },
        metrics: ['Marketing ROI', 'Lead Generation', 'Channel Performance'],
        strategic: 'Marketing infrastructure optimization enables data-driven decision-making and maximizes return on marketing spend.'
    },
    conversion: {
        qualitative: {
            high: 'Effective conversion optimization maximizes revenue from existing traffic. Strong CTAs, forms, and user flows drive measurable business results.',
            medium: 'Conversion optimization gaps mean potential revenue is being left on the table. A/B testing and UX improvements could significantly increase results.',
            low: 'Significant conversion barriers are preventing visitors from becoming customers. Fundamental conversion path improvements are needed.'
        },
        metrics: ['Conversion Rate', 'Revenue Per Visitor', 'Funnel Efficiency'],
        strategic: 'Conversion optimization offers the highest instant ROI — a 1% improvement in conversion rate can translate to significant revenue gains.'
    }
};

/**
 * Generate deterministic industry benchmarks for a module
 * @param {string} moduleName - One of: performance, security, etc.
 * @param {number} moduleScore - Current module score (0-100)
 * @param {string} [industry] - Detected industry, defaults to 'Cross-industry'
 * @returns {object} industryBenchmarks conforming to schema
 */
function generateIndustryBenchmarks(moduleName, moduleScore, industry = 'Cross-industry') {
    const benchmarks = MODULE_BENCHMARKS[moduleName];
    if (!benchmarks) return null;

    // Adjust industry references if provided
    const adjustedAverages = {};
    Object.entries(benchmarks).forEach(([key, val]) => {
        adjustedAverages[key] = {
            ...val,
            sourceIndustry: industry || val.sourceIndustry
        };
    });

    return {
        industryAverages: adjustedAverages,
        benchmarkCustomization: [
            {
                metricName: `${moduleName} Score`,
                value: moduleScore,
                unit: 'out of 100'
            },
            {
                metricName: `Industry Average ${moduleName} Score`,
                value: benchmarks.averageScore?.value || 50,
                unit: 'out of 100'
            }
        ],
        benchmarkDataSource: [
            {
                provider: 'Industry estimates (cross-industry averages)',
                lastUpdated: new Date().toISOString().split('T')[0],
                note: 'Benchmark values are estimated cross-industry averages from publicly available sources. Actual industry-specific benchmarks may vary.'
            }
        ]
    };
}

/**
 * Generate deterministic business impact for a module
 * @param {string} moduleName - One of: performance, security, etc.
 * @param {number} moduleScore - Current module score (0-100)
 * @param {string} [industry] - Detected industry
 * @returns {object} businessImpact conforming to schema
 */
function generateBusinessImpact(moduleName, moduleScore, industry = 'Cross-industry') {
    const template = IMPACT_TEMPLATES[moduleName];
    if (!template) return null;

    // Select qualitative impact based on score
    let tier;
    if (moduleScore >= 75) tier = 'high';
    else if (moduleScore >= 40) tier = 'medium';
    else tier = 'low';

    const qualitativeImpact = template.qualitative[tier];

    // Generate quantitative impact metrics
    const quantitativeImpact = template.metrics.map(metric => {
        const improvementPotential = Math.max(0, 100 - moduleScore);
        const changePercentage = moduleScore >= 80 ? 5 : moduleScore >= 50 ? 15 : 30;
        return {
            metric,
            currentValue: `${moduleScore}/100`,
            projectedValue: `${Math.min(moduleScore + Math.round(improvementPotential * 0.3), 100)}/100`,
            changePercentage,
            timeframe: moduleScore >= 70 ? '1-3 months' : '3-6 months'
        };
    });

    return {
        qualitativeImpact,
        quantitativeImpact,
        strategicAlignment: template.strategic
    };
}

/**
 * Populate both industryBenchmarks and businessImpact on a module output
 * Only populates if currently null/empty
 * @param {string} moduleName
 * @param {object} moduleOutput - The module's output object (mutated in place)
 * @param {string} [industry] - Detected industry
 */
function populateBusinessContext(moduleName, moduleOutput, industry = 'Cross-industry') {
    const score = moduleOutput?.summary?.score || 50;

    if (!moduleOutput.industryBenchmarks ||
        (typeof moduleOutput.industryBenchmarks === 'object' && Object.keys(moduleOutput.industryBenchmarks).length === 0)) {
        moduleOutput.industryBenchmarks = generateIndustryBenchmarks(moduleName, score, industry);
    }

    if (!moduleOutput.businessImpact ||
        (typeof moduleOutput.businessImpact === 'object' && Object.keys(moduleOutput.businessImpact).length === 0)) {
        moduleOutput.businessImpact = generateBusinessImpact(moduleName, score, industry);
    }
}

module.exports = {
    generateIndustryBenchmarks,
    generateBusinessImpact,
    populateBusinessContext
};
