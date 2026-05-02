/**
 * AI Recommendation Engine for UILensAI - Aligned with Schema v3.11.0
 *
 * This engine uses AI models (Anthropic, OpenAI, Gemini) to generate actionable,
 * prioritized, and context-aware recommendations based on analysis findings.
 * It leverages structured-llm-output.js to ensure schema compliance for recommendations.
 *
 * @module ai-recommendation-engine
 * @exports {Function} generateRecommendationsForIssues - Generate recommendations for a set of module issues
 * @exports {Function} generateTopRecommendations - Generate top-level strategic recommendations for the report summary
 * @exports {Function} normalizeSingleRecommendation - Normalize a raw AI recommendation to schema v3.11.0
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { analyzeWithAI } = require('../ai-models/index.js');
const { getDefaultModelFamily } = require('../../config/model-defaults.js');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RECOMMENDATION_COUNT = 5;
// Target schema version: 3.11.0 (documented in module header)

/** Maximum element identifiers per recommendation */
const MAX_ELEMENT_IDENTIFIERS = 10;
/** Maximum effort breakdown items per recommendation */
const MAX_EFFORT_BREAKDOWN_ITEMS = 10;
/** Maximum implementation steps per recommendation */
const MAX_IMPLEMENTATION_STEPS = 20;
/** Maximum success metrics per recommendation */
const MAX_SUCCESS_METRICS = 5;
/** Maximum quantitative impact entries per recommendation */
const MAX_QUANTITATIVE_IMPACTS = 5;
/** Maximum regulatory entries per recommendation */
const MAX_REGULATIONS = 5;
/** Maximum selectors returned from generateElementIdentifiers */
const MAX_TOP_SELECTORS = 3;
/** Maximum specific element identifiers used during normalization fallback */
const MAX_SPECIFIC_IDENTIFIERS = 5;
/** AI recommendation generation timeout (ms) */
const AI_TIMEOUT_MS = 120000; // 2 minutes string for heavy OpenRouter JSON arrays
/** Valid UUID v4 pattern: 8-4-4-4-12 hex with version/variant bits */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Common invalid AI-generated ID patterns */
const INVALID_ID_PATTERNS = /^(REC\d+|rec\d+|RECOMMENDATION\d+|recommendation\d+|\d+|ID\d+|id\d+)$/i;

/** Generic selector detection patterns */
const GENERIC_TAG_PATTERN = /^[a-z]+$/;
const GENERIC_CLASS_PATTERN = /^\.[a-z-]+$/;
const GENERIC_ID_PATTERN = /^#[a-z-]+$/;

/** Simple/generic CSS selectors that should be replaced with specific ones */
const FORBIDDEN_SELECTORS = [
    'body', 'html', 'nav', 'header', 'footer', 'main', 'div', 'span', 'p',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'input', 'form', 'img', 'a',
    '.container', '.hero-section', '.content-grid', 'h1, h2, h3', '.site-logo',
    '.content', '.text', '.image', '.section', '.wrapper', '.layout', '.grid',
    '.row', '.col', '.column', 'various elements', 'N/A', 'general'
];

/** Industry-specific fabrication pattern: catches .medical-spa-layout, .healthcare-interface, etc. */
const FABRICATED_INDUSTRY_PATTERN = /\.(medical|healthcare|spa|dental|legal|law-firm|ecommerce|restaurant|hotel|salon|clinic|realestate|fitness|yoga|wellness|daycare|automotive|insurance|banking|fintech|saas|agency|nonprofit|chiropractic|veterinary|pharma|accounting|plumbing|hvac|roofing|landscaping|photography|catering|barbershop|tattoo|florist|bakery|brewery|winery|pet-care|childcare|tutoring|coaching)[-_]?/i;

/** Descriptive fallbacks when no real selector is available */
const DESCRIPTIVE_FALLBACKS = [
    "Primary page content area",
    "Main content section above the fold",
    "Key interactive component on the page",
    "Primary layout section",
    "Main content region"
];

// VALID_TIERS: ['Basic', 'Pro', 'Enterprise'] — validated downstream in getMaxRecommendationsForTier()

// ─── Selector Specificity Helper ─────────────────────────────────────────────

/**
 * Calculates a specificity score for a CSS selector string.
 * Higher scores indicate more specific selectors (IDs > data-attrs > nth-child > classes).
 *
 * @param {string} selector - The CSS selector to score
 * @returns {number} A numeric specificity score (higher = more specific)
 */
const { STEP_TEMPLATES, DEFAULT_STEPS, generateImplementationStep, generateDefaultImplementationSteps, generateElementIdentifiers } = require('./normalizer');

// ─── Fallback & Minimal Recommendation Templates ─────────────────────────────

/** Module-specific minimal recommendation templates (used when no issues are provided) */
const MINIMAL_RECOMMENDATION_TEMPLATES = {
    ui: [
        {
            text: "Enhance mobile navigation usability by implementing a collapsible hamburger menu with clear visual indicators and smooth transitions for better user experience on smaller screens",
            priority: "High",
            category: "Usability",
            effort: "Moderate",
            impact: "Improved mobile user engagement and reduced bounce rate",
            elementIdentifiers: [
                { type: "selector", value: ".mobile-navigation-toggle" },
                { type: "selector", value: "#mobile-menu-drawer" },
                { type: "selector", value: ".hamburger-menu-icon" }
            ],
            implementationSteps: [
                { stepNumber: 1, description: "Audit current mobile navigation structure and identify usability pain points", details: "Use mobile usability testing tools and gather user feedback" },
                { stepNumber: 2, description: "Implement responsive navigation patterns with proper ARIA labels and keyboard accessibility", details: "Add role='navigation' and aria-expanded attributes to navigation elements" },
                { stepNumber: 3, description: "Test navigation across different mobile devices and screen sizes", details: "Validate touch targets meet minimum 44px requirement and test on iOS/Android devices" }
            ]
        },
        {
            text: "Optimize visual hierarchy by improving typography consistency, spacing, and color contrast to meet WCAG 2.1 AA standards while enhancing content readability",
            priority: "High",
            category: "Accessibility",
            effort: "Moderate",
            impact: "Better accessibility compliance and improved user experience for all users",
            elementIdentifiers: [
                { type: "selector", value: "h1, h2, h3, h4, h5, h6" },
                { type: "selector", value: ".main-content p" },
                { type: "selector", value: ".content-section .text-content" }
            ],
            implementationSteps: [
                { stepNumber: 1, description: "Conduct color contrast audit using WCAG contrast checking tools", details: "Ensure all text meets 4.5:1 contrast ratio for normal text and 3:1 for large text" },
                { stepNumber: 2, description: "Establish consistent typography scale and spacing system", details: "Define heading hierarchy (h1-h6) with proper font sizes, line heights, and margins" },
                { stepNumber: 3, description: "Implement changes systematically and validate with accessibility testing tools", details: "Use axe-core or WAVE tools to verify improvements" }
            ]
        },
        {
            text: "Improve call-to-action visibility and effectiveness through strategic placement, contrasting colors, and clear action-oriented copy that guides users toward desired actions",
            priority: "Medium",
            category: "Conversion",
            effort: "Low",
            impact: "Increased conversion rates and better user engagement",
            elementIdentifiers: [
                { type: "selector", value: ".cta-button" },
                { type: "selector", value: ".primary-action-button" },
                { type: "selector", value: ".btn-primary" }
            ],
            implementationSteps: [
                { stepNumber: 1, description: "Analyze current CTA performance and placement using heatmap tools", details: "Use tools like Hotjar or Google Analytics to identify optimization opportunities" },
                { stepNumber: 2, description: "A/B test different CTA colors, copy, and positions", details: "Test variations with clear metrics for conversion tracking" },
                { stepNumber: 3, description: "Implement winning CTA variations with proper tracking", details: "Ensure GTM or analytics tracking is properly configured for CTA clicks" }
            ]
        }
    ],
    performance: [
        { text: "Optimize images and enable compression to reduce load times", priority: "High", category: "Performance", effort: "1-2 days", impact: "High" },
        { text: "Implement browser caching strategies", priority: "Medium", category: "Technical", effort: "1-2 days", impact: "Medium" }
    ],
    security: [
        { text: "Review and strengthen security headers configuration", priority: "High", category: "Security", effort: "1-2 hours", impact: "High" },
        { text: "Conduct regular security audits and vulnerability assessments", priority: "Medium", category: "Security", effort: "1-2 weeks", impact: "High" }
    ],
    accessibility: [
        { text: "Add appropriate ARIA labels to interactive elements", priority: "High", category: "Accessibility", effort: "1-2 days", impact: "High" },
        { text: "Ensure sufficient color contrast for all text elements", priority: "High", category: "Accessibility", effort: "1-2 hours", impact: "Medium" }
    ],
    seoContent: [
        { text: "Optimize page titles and meta descriptions for target keywords", priority: "High", category: "Content", effort: "1-2 hours", impact: "High" },
        { text: "Create high-quality, original content that provides user value", priority: "Medium", category: "Content", effort: "1-2 weeks", impact: "High" }
    ]
};
Object.freeze(MINIMAL_RECOMMENDATION_TEMPLATES);

/** Module-specific fallback template strings (used when AI generation fails) */
const FALLBACK_TEMPLATES = {
    ui: [
        "Improve user interface design and usability based on identified issues",
        "Enhance responsive design for better cross-device compatibility",
        "Optimize visual hierarchy and layout consistency",
        "Improve accessibility features and compliance",
        "Enhance user interaction patterns and feedback"
    ],
    performance: [
        "Optimize page loading performance and Core Web Vitals",
        "Reduce resource sizes and improve caching strategies",
        "Minimize JavaScript execution time and blocking resources",
        "Optimize images and media assets",
        "Improve server response times and infrastructure"
    ],
    security: [
        "Strengthen security headers and configurations",
        "Review and update authentication mechanisms",
        "Implement additional security monitoring",
        "Address identified vulnerabilities and risks",
        "Enhance data protection and privacy controls"
    ],
    accessibility: [
        "Improve WCAG compliance and accessibility features",
        "Add proper ARIA labels and semantic markup",
        "Enhance keyboard navigation and focus management",
        "Improve color contrast and visual accessibility",
        "Test with assistive technologies and screen readers"
    ],
    seoContent: [
        "Optimize content for search engines and user intent",
        "Improve page titles, meta descriptions, and structured data",
        "Enhance content quality and relevance",
        "Optimize URL structure and internal linking",
        "Improve page loading speed for better SEO"
    ]
};
Object.freeze(FALLBACK_TEMPLATES);

/**
 * Dynamic element template rules for UI module fallback recommendations.
 * Each rule maps issue keywords to specific recommendation template strings.
 * @type {Array<{keywords: string[], templates: string[]}>}
 */
const DYNAMIC_ELEMENT_TEMPLATES = [
    {
        keywords: ['modal'],
        templates: [
            "Implement proper modal accessibility with aria-modal='true', focus management, and ESC key support for better user experience",
            "Add visible close button to modal dialogs with proper ARIA labels and keyboard event handlers",
            "Ensure modal dialogs have accessible labels using aria-label or aria-labelledby attributes"
        ]
    },
    {
        keywords: ['carousel'],
        templates: [
            "Implement accessible carousel navigation with previous/next buttons and proper ARIA labels",
            "Add slide indicators to carousel components with clear current state indication and direct navigation",
            "Optimize carousel performance by implementing lazy loading and limiting slides to 3-7 for optimal user experience"
        ]
    },
    {
        keywords: ['accordion'],
        templates: [
            "Implement proper accordion ARIA states with aria-expanded and aria-controls attributes",
            "Add comprehensive keyboard navigation to accordion with arrow keys, Enter, and Space key support",
            "Optimize accordion usability by grouping content effectively and providing clear panel hierarchy"
        ]
    },
    {
        keywords: ['animation', 'motion'],
        templates: [
            "Implement prefers-reduced-motion CSS media query to respect user motion sensitivity preferences",
            "Optimize animation performance using CSS transforms instead of JavaScript-based animations",
            "Ensure animations include static alternatives and don't interfere with screen reader functionality"
        ]
    }
];
Object.freeze(DYNAMIC_ELEMENT_TEMPLATES);

// ─── System Prompt Generation ────────────────────────────────────────────────

/** Industry-specific context hints for default (non-UI) system prompts */
const INDUSTRY_CONTEXT = {
    Healthcare: 'Focus on patient trust, accessibility compliance, and medical information clarity',
    'E-commerce': 'Focus on conversion optimization, mobile commerce, and product discovery',
    Finance: 'Focus on security, trust signals, and regulatory compliance',
    Education: 'Focus on learning-centered design, accessibility, and multi-user needs'
};
Object.freeze(INDUSTRY_CONTEXT);

/**
 * Generates a system prompt tailored for recommendation generation.
 * Returns a specialized prompt for UI modules or a general prompt for other modules.
 *
 * @param {string} moduleName - The module to generate the prompt for
 * @param {string} [industry='general'] - Detected industry for contextualization
 * @param {string} [analysisDepth='basic'] - Analysis depth level
 * @param {string} [tier='Basic'] - Service tier
 * @returns {string} A complete system prompt string for the AI model
 */
function getRecommendationSystemPrompt(moduleName, industry = "general", analysisDepth = "basic", tier = "Basic") {
    const basePrompt = `You are an expert UILensAI recommendation engine specializing in ${moduleName} analysis. Your task is to provide actionable, specific, and prioritized recommendations.`;

    // Enhanced prompts for UI module with dynamic element expertise
    if (moduleName === 'ui') {
        return `${basePrompt}

SPECIALIZATION: You are a UI/UX expert focusing on ${industry} industry websites, with deep expertise in:
- Visual hierarchy and information architecture
- Cross-device responsive design optimization  
- Accessibility compliance (WCAG 2.1 AA standards)
- Dynamic element implementation (modals, carousels, accordions, animations)
- User experience patterns specific to ${industry} industry
- Conversion-focused design improvements
- Brand consistency and professional presentation

INDUSTRY-SPECIFIC CONTEXT FOR ${industry.toUpperCase()}:
${industry === 'Healthcare' ? `
- **Patient Trust & Credibility**: UI must convey medical professionalism and trustworthiness
- **Accessibility Priority**: Must accommodate diverse patient populations including elderly and disabled users
- **Clear Information Hierarchy**: Medical information must be easily scannable and understandable
- **Appointment Booking Optimization**: CTAs should focus on scheduling and contact actions
- **Regulatory Compliance**: Consider HIPAA implications for form design and data collection
- **Emergency Information Access**: Critical contact information must be prominently accessible
- **Mobile Medical Access**: Ensure functionality for patients accessing on mobile devices` : ''}
${industry === 'E-commerce' || industry === 'Retail' ? `
- **Conversion Optimization**: Focus on product discovery, cart optimization, and checkout flow
- **Trust Signals**: Emphasize security badges, reviews, and return policies in UI
- **Product Presentation**: Optimize image galleries, product information hierarchy, and comparison tools  
- **Mobile Commerce**: Prioritize mobile shopping experience and touch-friendly interactions
- **Search & Filtering**: Enhance product findability and category navigation
- **Personalization**: Consider user-specific recommendations and saved items functionality` : ''}
${industry === 'Finance' || industry === 'Financial Services' ? `
- **Security & Trust**: UI must convey financial security and institutional credibility
- **Data Visualization**: Focus on clear presentation of financial data and account information
- **Compliance UI**: Ensure forms and disclosures meet financial regulatory requirements
- **Mobile Banking**: Optimize for secure mobile financial transactions
- **Accessibility**: Meet ADA requirements for financial service accessibility` : ''}
${industry === 'Education' ? `
- **Learning-Focused UI**: Design to support educational goals and reduce cognitive load
- **Multi-User Types**: Accommodate students, parents, educators, and administrators
- **Content Organization**: Emphasize clear navigation for courses, resources, and schedules
- **Accessibility**: Meet WCAG AA standards for diverse learning needs including disabilities
- **Mobile Learning**: Optimize for students accessing content on various devices` : ''}

ULTRA-SPECIFIC CSS SELECTOR REQUIREMENTS (CRITICAL FOR 100/100 SCORE):
When providing elementIdentifiers, you MUST generate development-ready, ultra-specific CSS selectors that:

1. **USE DISCOVERED SELECTORS**: Prioritize actual selectors discovered from the page analysis
2. **AVOID GENERIC SELECTORS**: Never use: body, html, nav, header, footer, main, div, span, p, h1-h6, button, input, form, img, a, .container, .content, .section
3. **PRIORITIZE SPECIFICITY**: Use this hierarchy:
   - ID selectors: #unique-element-id
   - Data attributes: [data-testid="specific-element"], [data-component="header-nav"]
   - Complex combinations: .site-header .navigation-menu .primary-nav-item:first-child
   - Nth-child selectors: .hero-section .cta-buttons button:nth-child(2)
   - Multi-class combinations: .btn.btn-primary.btn-large.cta-appointment

4. **INDUSTRY-SPECIFIC SELECTORS**: Generate selectors relevant to ${industry}:
${industry === 'Healthcare' ? `
   - .appointment-booking-btn, .patient-portal-link, .emergency-contact-info
   - .doctor-profile-card, .services-grid .medical-service-item
   - .patient-testimonial-slider, .insurance-info-section
   - #appointment-form, .contact-physician-cta, .schedule-consultation-btn` : ''}
${industry === 'E-commerce' ? `
   - .product-card .add-to-cart-btn, .shopping-cart-icon .cart-count
   - .product-gallery .thumbnail:nth-child(3), .price-section .current-price
   - .checkout-progress .step-active, .product-reviews .rating-stars
   - #product-search-form, .category-filter-dropdown, .promo-banner .shop-now-btn` : ''}

5. **DEVELOPMENT-READY FORMAT**: Each selector must be immediately usable by developers for:
   - CSS styling: target specific elements for design changes
   - JavaScript interactions: select elements for event handling
   - Testing automation: unique identifiers for QA testing
   - Analytics tracking: specific elements for user interaction tracking

DYNAMIC ELEMENT EXPERTISE: When issues mention dynamic elements, provide specific implementation guidance:

**MODAL RECOMMENDATIONS** (generate dynamically based on detected issues):
- Use AI to analyze modal context and generate specific implementation steps
- Consider industry-specific modal use cases (${industry} context)
- Provide accessibility guidance appropriate to the specific modal type detected

**CAROUSEL RECOMMENDATIONS** (generate dynamically based on detected issues):
- Analyze carousel content type and purpose for industry-appropriate guidance
- Generate performance optimization suggestions based on detected carousel complexity
- Provide navigation recommendations specific to the carousel's role in ${industry} context

**ACCORDION RECOMMENDATIONS** (generate dynamically based on detected issues):
- Generate organization suggestions based on detected content structure
- Provide keyboard navigation guidance appropriate to content complexity
- Consider ${industry}-specific information hierarchy needs

**ANIMATION RECOMMENDATIONS** (generate dynamically based on detected issues):
- Analyze motion sensitivity in context of ${industry} user demographics
- Generate performance optimization based on detected animation complexity
- Provide accessibility alternatives appropriate to ${industry} standards

ANALYSIS CONTEXT:
- Industry: ${industry} (tailor recommendations to industry-specific user expectations and business goals)
- Analysis Depth: ${analysisDepth}
- Service Tier: ${tier}

CRITICAL REQUIREMENTS FOR 100/100 SCORE:
1. **Element Identifiers**: MUST provide highly specific CSS selectors from discovered selectors
   - Use actual discovered class names, IDs, and complex selectors
   - Example: '#header-navigation .primary-menu-item[data-menu="services"]:nth-child(2)' instead of '.menu-item'
   - Include ${industry}-specific selectors when relevant

2. **Implementation Steps**: MUST be detailed, technical, and actionable
   - Include specific code examples and file references where applicable
   - Provide step-by-step technical implementation guidance with testing criteria
   - Include accessibility testing steps (screen reader, keyboard navigation)
   - Consider ${industry}-specific implementation requirements

3. **Business Impact**: Connect UI improvements to ${industry} business goals
   - ${industry === 'Healthcare' ? 'Patient acquisition, trust building, and medical compliance' : industry === 'E-commerce' ? 'Conversion optimization, user engagement, and sales growth' : 'User engagement, conversion optimization, and brand trust'}
   - Trust and credibility building through professional UI
   - Conversion rate optimization through improved UX
   - Accessibility compliance benefits and risk mitigation

4. **Industry-Specific Considerations**: 
   ${industry === 'Healthcare' ? `
   - Medical content should prioritize clarity and accessibility over complex interactions
   - Patient forms require HIPAA compliance considerations
   - Emergency contact information must be accessible without JavaScript dependencies
   - Consider diverse patient populations including elderly users less comfortable with dynamic interfaces
   ` : industry === 'E-commerce' ? `
   - Product discovery and purchase flow optimization
   - Mobile commerce experience and touch interactions
   - Trust signals and security indicators for online purchasing
   - Inventory and pricing information accessibility
   ` : `
   - Ensure interactive elements enhance rather than complicate user experience
   - Consider user demographics and technical comfort levels
   - Balance engagement with usability and performance
   `}

RESPONSE FORMAT: Each recommendation must include:
- Specific, actionable 'text' description with technical implementation details and ${industry} context
- Appropriate 'priority' (Critical, High, Medium, Low) based on UX impact, accessibility compliance, and ${industry} business importance
- Precise 'elementIdentifiers' with development-ready CSS selectors from discovered selectors
- Detailed 'implementationSteps' with technical guidance, code examples, validation criteria, and ${industry}-specific considerations
- Clear 'impact' statement with measurable outcomes, business benefits, and ${industry} relevance
- Realistic 'effort' assessment and 'effortHours' range aligned with implementation complexity

Generate recommendations that are specifically tailored to ${industry} industry standards, user expectations, and business objectives while addressing the detected UI/UX issues with ultra-specific, development-ready guidance.`;
    }

    // Default prompt for other modules with industry context
    let moduleSpecificPrompt = basePrompt;
    try {
        const modulePrompts = require(`../prompts/${moduleName}`);
        if (modulePrompts && modulePrompts[`recommendation-${moduleName}`]) {
            moduleSpecificPrompt = modulePrompts[`recommendation-${moduleName}`];
        } else if (modulePrompts && modulePrompts[`${moduleName}-recommendations`]) {
            moduleSpecificPrompt = modulePrompts[`${moduleName}-recommendations`];
        } else {
            const sharedPrompts = require('../prompts/shared');
            moduleSpecificPrompt = sharedPrompts['recommendation-generic'] || basePrompt;
        }
    } catch (e) {
        try {
            const sharedPrompts = require('../prompts/shared');
            moduleSpecificPrompt = sharedPrompts['recommendation-generic'] || basePrompt;
        } catch (err) {
            moduleSpecificPrompt = basePrompt;
        }
    }

    return `${moduleSpecificPrompt}

The website is for the '${industry}' industry. The analysis depth was '${analysisDepth}' for a '${tier}' tier user.

INDUSTRY CONTEXT FOR ${industry.toUpperCase()}:
${INDUSTRY_CONTEXT[industry] || ''}

Each recommendation must be highly relevant to the provided issues and ${industry} industry context.
Focus on practical steps that align with ${industry} industry standards and user expectations.
Ensure each recommendation includes a clear 'text' description, a 'priority' (Critical, High, Medium, Low), an estimated 'effort' (Very Low, Low, Moderate, High, Very High), the 'source' module ('${moduleName}' or 'cross-module' or 'ai-general' as appropriate), and a concise 'impact' statement that considers ${industry} business objectives.

For UI-related issues, provide specific 'elementIdentifiers' using discovered selectors rather than generic selectors.
Outline detailed 'implementationSteps' that consider ${industry}-specific requirements and constraints.

If generating for 'Pro' or 'Enterprise' tiers, also provide detailed 'effortBreakdown', 'regulatoryImpact' (especially relevant for ${industry}), 'businessImpact', 'testingGuidance', 'successMetrics', and 'scoreExplanation' including 'biasAssessment'.

Adhere strictly to the provided JSON schema for the recommendation object while ensuring all content is relevant to ${industry} industry needs.`;
}

// ─── Recommendation Normalization ─────────────────────────────────────────

/**
 * Validates, enriches, and sanitizes element identifiers for a recommendation.
 * Replaces generic/fabricated selectors with discovered or descriptive alternatives.
 *
 * @param {Array<{type: string, value: string}>} rawIdentifiers - Raw element identifiers from AI
 * @param {string} recText - The recommendation text (for fallback generation)
 * @param {Object} discoveredSelectors - Discovered selectors from page analysis
 * @param {Object} recommendationDef - Schema definition for validation
 * @returns {Array<{type: string, value: string}>|undefined} Sanitized identifiers or undefined if empty
 */

async function generateRecommendationsForIssues({
    moduleName,
    issues,
    contextData = {},
    url = "N/A",
    tier = "Basic",
    industry = "general",
    analysisDepth = "basic",
    count = DEFAULT_RECOMMENDATION_COUNT,
    preferredModelFamily = null,
    discoveredSelectors = {},
    verbose = false
}) {
    const { normalizeSingleRecommendation } = require('./normalizer');
    if (!Array.isArray(issues) || issues.length === 0) {
        if (verbose) { console.log(`[AI Recommendations] No issues provided for ${moduleName}, returning minimal recommendations.`); }
        return getMinimalRecommendations(moduleName, tier, discoveredSelectors);
    }

    // Validate and constrain count
    const maxRecommendations = getMaxRecommendationsForTier(tier);
    const finalCount = Math.min(count, maxRecommendations);

    if (verbose) {
        console.log(`[AI Recommendations] Generating ${finalCount} recommendations for ${moduleName} module (tier: ${tier})`);
        if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
            console.log(`[AI Recommendations] Using ${Object.keys(discoveredSelectors).length} discovered selector categories for ultra-specific recommendations`);
        }
    }

    // Prepare context
    const issuesText = issues.map(issue =>
        typeof issue === 'string' ? issue : (issue.text || issue.description || String(issue))
    ).join('\n');

    // Enhanced context preparation - increase limit and better formatting
    const contextString = Object.entries(contextData).length > 0
        ? Object.entries(contextData).map(([key, value]) => {
            // Handle arrays and objects specially
            let valueStr;
            if (Array.isArray(value)) {
                valueStr = value.length > 10
                    ? `${value.slice(0, 10).join(', ')}... (${value.length} total)`
                    : value.join(', ');
            } else if (typeof value === 'object' && value !== null) {
                valueStr = JSON.stringify(value).substring(0, 500);
            } else {
                valueStr = String(value).substring(0, 500);
            }
            return `${key}: ${valueStr}`;
        }).join('\n')
        : 'No additional context provided';

    // Create the prompt
    let systemPrompt = getRecommendationSystemPrompt(moduleName, industry, analysisDepth, tier);
    
    // Replace heavily used template variables inside the dynamically loaded system prompt
    systemPrompt = systemPrompt
        .replace(/\{\{\s*moduleName\s*\}\}/g, moduleName)
        .replace(/\{\{\s*url\s*\}\}/g, url || 'N/A')
        .replace(/\{\{\s*industry\s*\}\}/g, industry || 'general')
        .replace(/\{\{\s*tier\s*\}\}/g, tier || 'Basic')
        .replace(/\{\{\s*analysisDepth\s*\}\}/g, analysisDepth || 'basic')
        .replace(/\{\{\s*count\s*\}\}/g, finalCount)
        .replace(/\{\{\s*issuesSummary\s*\}\}/g, issuesText.substring(0, 1000))
        .replace(/\{\{\s*contextSummary\s*\}\}/g, contextString.substring(0, 1000));
        
    // Optionally resolve any un-interpolated variables with empty strings so they don't leak out
    systemPrompt = systemPrompt.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '');

    const userPrompt = `
Module: ${moduleName}
Website: ${url}
Industry: ${industry}
Analysis Depth: ${analysisDepth}
Service Tier: ${tier}

DETECTED CONTEXT & ELEMENTS:
${contextString}

ISSUES IDENTIFIED:
${issuesText}

${contextData.lighthouseMetrics ? `<LIGHTHOUSE_METRICS>\n${contextData.lighthouseMetrics}\n</LIGHTHOUSE_METRICS>\n` : ''}${contextData.networkPayloads ? `<NETWORK_PAYLOADS>\n${contextData.networkPayloads}\n</NETWORK_PAYLOADS>\n` : ''}${contextData.contrastViolations ? `<CONTRAST_VIOLATIONS>\n${contextData.contrastViolations}\n</CONTRAST_VIOLATIONS>\n` : ''}${contextData.domEvidence ? `<DOM_EVIDENCE>\n${contextData.domEvidence}\n</DOM_EVIDENCE>\n` : ''}
CRITICAL REQUIREMENTS FOR ULTRA-SPECIFIC RECOMMENDATIONS:

1. **Do NOT Copy Issue Descriptions**: NEVER copy-paste the textbook description from the "ISSUES IDENTIFIED" into your impact or text fields. You must write custom, business-focused impacts.
2. **Reference Actual Detected Elements**: Use specific domains, URLs, headers, selectors, or values from the XML tags above.
3. **Provide Code Examples**: Include configuration snippets, code samples, or terminal commands.
4. **NO DevTools Tutorials**: Do NOT tell the user how to open Chrome DevTools, Lighthouse, or inspect elements. Assume they already know how to use these tools. Tell them EXACTLY what code, CSS file, or Script is broken.
5. **Include Specific File Paths**: When possible, suggest specific files or locations to modify.
6. **Tie to Revenue**: Explain how fixing the issue prevents drop-off or increases conversions.

EXAMPLE OF GOOD vs BAD RECOMMENDATIONS:

❌ BAD (Too Generic or Textbook):
{
  "text": "Minimize main-thread work",
  "impact": "Consider reducing the time spent parsing, compiling and executing JS.",
  "implementationSteps": [
    {"stepNumber": 1, "description": "Open Chrome DevTools to identify long tasks in the Performance panel"}
  ]
}

✅ GOOD (Ultra-Specific):
{
  "text": "Implement React Server Components (RSC) to remove 80kb of client-side Javascript from the product carousel",
  "impact": "Decreasing TTI by 400ms prevents a known 8% mobile bounce rate directly impacting top-of-funnel conversions.",
  "implementationSteps": [
    {"stepNumber": 1, "description": "Convert components/Carousel.tsx to a Server Component by moving interactive state to child 'use client' components"},
    {"stepNumber": 2, "description": "Migrate data fetching for products down to the server component level using async/await"},
    {"stepNumber": 3, "description": "Verify Webpack/Turbopack bundle size with \`npx next build\` to confirm the 80kb reduction"}
  ]
}

Please generate exactly ${finalCount} actionable recommendations following these ultra-specific requirements.
REMEMBER: Return your response as a JSON OBJECT containing a "recommendations" array, NOT an array at the root level!

{
  "recommendations": [ ... ]
}`;

    try {
        const aiResult = await Promise.race([
            analyzeWithAI({
                prompt: userPrompt,
                systemPrompt: systemPrompt,
                modelFamily: preferredModelFamily || getDefaultModelFamily('recommendations'),
                tier: tier,
                moduleName: 'module-recommendations',  // Use centralized config key, not per-module (Haiku, not Sonnet)
                vision: false,
                maxTokens: tier === 'Basic' ? 8192 : (tier === 'Pro' ? 12288 : 16384),
                isJsonOutput: true,
                expectedJsonStructure: "object",
                verbose
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`AI recommendation generation for ${moduleName} timed out after ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS)
            )
        ]);

        if (aiResult.error) {
            if (verbose) { console.warn(`[AI Recommendations] AI generation failed: ${aiResult.error}`); }
            return getFallbackRecommendations(moduleName, issues, tier, finalCount, discoveredSelectors);
        }

        let recommendations = aiResult.data;
        console.log(`\n\n[!!! RAW AI JSON RESPONSE for ${moduleName} !!!]\n${typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations, null, 2)}\n\n`);

        // Parse response if it's a string
        if (typeof recommendations === 'string') {
            try {
                recommendations = JSON.parse(recommendations);
            } catch (parseError) {
                if (verbose) { console.warn(`[AI Recommendations] JSON parsing failed: ${parseError.message}`); }
                return getFallbackRecommendations(moduleName, issues, tier, finalCount, discoveredSelectors);
            }
        }

        // Handle case where AI returns object with recommendations property
        if (recommendations && typeof recommendations === 'object' && !Array.isArray(recommendations)) {
            if (Array.isArray(recommendations.recommendations)) {
                if (verbose) { console.log(`[AI Recommendations] AI returned object with 'recommendations' array for ${moduleName}, extracting array`); }
                recommendations = recommendations.recommendations;
            } else if (Array.isArray(recommendations.items)) {
                if (verbose) { console.log(`[AI Recommendations] AI returned object with 'items' array for ${moduleName}, extracting array`); }
                recommendations = recommendations.items;
            } else if (Array.isArray(recommendations.data)) {
                if (verbose) { console.log(`[AI Recommendations] AI returned object with 'data' array for ${moduleName}, extracting array`); }
                recommendations = recommendations.data;
            } else {
                const firstArrayValue = Object.values(recommendations).find(val => Array.isArray(val));
                if (firstArrayValue) {
                    if (verbose) { console.log(`[AI Recommendations] AI returned object with a generic array value for ${moduleName}, extracting array`); }
                    recommendations = firstArrayValue;
                } else {
                    if (verbose) { console.warn(`[AI Recommendations] AI returned an object but no array could be extracted: ${JSON.stringify(recommendations).substring(0, 100)}`); }
                    return getFallbackRecommendations(moduleName, issues, tier, finalCount, discoveredSelectors);
                }
            }
        }

        // Validate and normalize the recommendations
        if (!Array.isArray(recommendations)) {
            if (verbose) { console.warn(`[AI Recommendations] AI returned non-array response for ${moduleName}`); }
            return getFallbackRecommendations(moduleName, issues, tier, finalCount, discoveredSelectors);
        }

        // CRITICAL FIX: Process and normalize recommendations with discovered selectors
        const normalizedRecommendations = recommendations
            .slice(0, finalCount) // Ensure we don't exceed the requested count
            .map(rec => normalizeSingleRecommendation(rec, moduleName, tier, discoveredSelectors))
            .filter(rec => rec && rec.text && rec.text.length > 10); // Filter out invalid recommendations

        // POST-PROCESSING DEDUP GUARD: Detect and fix duplicate step arrays within this module
        const seenStepKeys = new Map(); // stepKey → index of first occurrence
        for (let i = 0; i < normalizedRecommendations.length; i++) {
            const rec = normalizedRecommendations[i];
            const steps = rec.implementationSteps || [];
            const stepKey = steps.map(s => (s.description || '').trim()).join('|||');
            if (stepKey.length < 20) continue; // Skip trivially short step sets

            if (seenStepKeys.has(stepKey)) {
                // Duplicate found — regenerate steps using the rec's own text as context
                const { generateContextAwareSteps } = require('../jsonNormalizer');
                if (generateContextAwareSteps) {
                    const freshSteps = generateContextAwareSteps(rec.text, moduleName);
                    if (freshSteps && freshSteps.length > 0) {
                        rec.implementationSteps = freshSteps.map((desc, idx) => ({
                            stepNumber: idx + 1,
                            description: desc
                        }));
                    }
                }
            } else {
                seenStepKeys.set(stepKey, i);
            }
        }

        // Fill with fallbacks if we don't have enough
        while (normalizedRecommendations.length < finalCount) {
            const fallbacks = getFallbackRecommendations(moduleName, issues, tier, finalCount - normalizedRecommendations.length, discoveredSelectors);
            normalizedRecommendations.push(...fallbacks);
            break; // Prevent infinite loop
        }

        if (verbose) {
            console.log(`[AI Recommendations] Generated ${normalizedRecommendations.length} recommendations for ${moduleName}`);
            if (aiResult.usage && aiResult.usage.fallbackUsed) {
                console.log(`[AI Recommendations] AI fallback was used: ${aiResult.usage.provider} provided the recommendations`);
            }
        }

        return normalizedRecommendations.slice(0, finalCount);

    } catch (error) {
        console.error(`[AI Recommendations] Error generating recommendations for ${moduleName}: ${error.message}`);

        // Enhanced error handling with fallback context
        if (error.message.includes('All providers failed') || error.message.includes('overloaded')) {
            if (verbose) {
                console.warn(`[AI Recommendations] All AI providers failed or overloaded for ${moduleName}, using static fallbacks`);
            }
        }

        return getFallbackRecommendations(moduleName, issues, tier, finalCount, discoveredSelectors);
    }
}

/**
 * Generates top-level strategic recommendations for the report summary.
 * Synthesizes findings across all analyzed modules into prioritized cross-cutting guidance.
 *
 * @param {Object} fullReportData - The complete report data with all module results
 * @param {number} [count=5] - Number of top recommendations to generate
 * @param {string|null} [preferredModelFamily=null] - Preferred AI model family
 * @param {Object|null} [costAggregator=null] - Cost tracking aggregator
 * @param {Object} [discoveredSelectors={}] - CSS selectors discovered from page analysis
 * @param {boolean} [verbose=false] - Enable verbose logging
 * @returns {Promise<Array<Object>>} Array of normalized top-level recommendation objects
 */
async function generateTopRecommendations(fullReportData, count = 5, preferredModelFamily = null, costAggregator = null, discoveredSelectors = {}, verbose = false) {
    const { normalizeSingleRecommendation } = require('./normalizer');
    if (verbose) { console.log("[AIRecoEngine] Generating top recommendations for report summary..."); }

    // CRITICAL FIX: Only consider modules that were actually analyzed
    const actuallyAnalyzedModules = fullReportData.testParameters?.modules || [];
    const crossModuleAnalysisEnabled = fullReportData.featureSet?.crossModuleAnalysisEnabled || false;

    if (verbose) {
        console.log(`[AIRecoEngine] Restricting recommendations to analyzed modules: ${actuallyAnalyzedModules.join(', ')}`);
        if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
            console.log(`[AIRecoEngine] Using discovered selectors for ultra-specific top recommendations`);
        }
    }

    const moduleSummaries = [];
    // ENHANCED: Track what's already detected on the site to avoid redundant recommendations
    const existingFeatures = {
        tracking: [],
        forms: [],
        trustSignals: [],
        privacyFeatures: []
    };

    if (fullReportData.modules) {
        actuallyAnalyzedModules.forEach(moduleName => {
            const moduleData = fullReportData.modules[moduleName];

            // CRITICAL: Skip failed modules - don't generate recommendations based on error data
            if (moduleData && (moduleData.status === 'failed' || moduleData.error)) {
                if (verbose) {
                    console.log(`[AIRecoEngine] Skipping failed module ${moduleName} - no recommendations will be generated for it`);
                }
                return; // Skip this module entirely
            }

            if (moduleData && moduleData.summary) {
                moduleSummaries.push({
                    module: moduleName,
                    score: moduleData.summary.score || 0,
                    rating: moduleData.summary.rating || 'Unknown',
                    topIssues: moduleData.summary.topIssues || [],
                    keyFindings: moduleData.summary.keyFindings || []
                });
            }

            // Extract already-detected features to prevent redundant recommendations
            if (moduleName === 'privacy' && moduleData) {
                if (moduleData.dataLayer?.dataLayerPresent) {
                    existingFeatures.tracking.push(moduleData.dataLayer.dataLayerFramework || 'Data Layer');
                }
                if (moduleData.trackers?.items?.length > 0) {
                    moduleData.trackers.items.forEach(t => existingFeatures.tracking.push(t.name || t.domain));
                }
                if (moduleData.privacyPolicy?.policyFound) {
                    existingFeatures.privacyFeatures.push('Privacy Policy');
                }
                if (moduleData.consentManagement?.bannerDetected) {
                    existingFeatures.privacyFeatures.push('Consent Banner');
                }
            }
            if (moduleName === 'conversion' && moduleData) {
                if (moduleData.forms?.detectedForms?.length > 0) {
                    moduleData.forms.detectedForms.forEach(f => existingFeatures.forms.push(f.purpose || f.formId));
                }
                if (moduleData.trustSignalsAnalysis?.signalsPresent?.length > 0) {
                    existingFeatures.trustSignals = moduleData.trustSignalsAnalysis.signalsPresent;
                }
            }
        });
    }

    if (moduleSummaries.length === 0) {
        if (verbose) { console.warn("[AIRecoEngine] No module summaries available for top recommendations"); }
        return getFallbackTopRecommendations(actuallyAnalyzedModules, [], fullReportData.testParameters?.tier || 'Basic', count, discoveredSelectors);
    }

    const tier = fullReportData.testParameters?.tier || 'Basic';
    const url = fullReportData.testParameters?.url || 'N/A';
    const industry = fullReportData.industryContext?.primaryIndustry || 'Other';
    const analysisDepth = fullReportData.testParameters?.analysisDepth || 'basic';

    // Build comprehensive context for AI
    const moduleScores = moduleSummaries.map(m => `${m.module}: ${m.score}/100 (${m.rating})`).join(', ');
    const allTopIssues = moduleSummaries.flatMap(m => m.topIssues).slice(0, 10);
    const overallScore = fullReportData.overallScore || 0;
    const overallRating = fullReportData.overallRating || 'Unknown';

    // Build existing features summary to prevent redundant recommendations
    const existingFeaturesText = [];
    if (existingFeatures.tracking.length > 0) {
        existingFeaturesText.push(`Tracking: ${existingFeatures.tracking.join(', ')}`);
    }
    if (existingFeatures.forms.length > 0) {
        existingFeaturesText.push(`Forms: ${existingFeatures.forms.join(', ')}`);
    }
    if (existingFeatures.trustSignals.length > 0) {
        existingFeaturesText.push(`Trust Signals: ${existingFeatures.trustSignals.join(', ')}`);
    }
    if (existingFeatures.privacyFeatures.length > 0) {
        existingFeaturesText.push(`Privacy: ${existingFeatures.privacyFeatures.join(', ')}`);
    }

    // Enhanced prompt for top-level recommendations with better context
    const promptText = `Generate ${count} strategic, high-level recommendations for improving this website based on the comprehensive analysis results.

WEBSITE CONTEXT:
- URL: ${url}
- Overall Score: ${overallScore}/100 (${overallRating})
- Industry: ${industry}
- Analysis Depth: ${analysisDepth}
- Service Tier: ${tier}

ANALYZED MODULES: ${actuallyAnalyzedModules.join(', ')}

MODULE PERFORMANCE SUMMARY:
${moduleScores}

ALREADY DETECTED ON SITE (DO NOT recommend implementing these - they exist):
${existingFeaturesText.length > 0 ? existingFeaturesText.join('\n') : 'None detected'}

DETAILED ANALYSIS:
${allTopIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

BUSINESS CONTEXT:
${industry} industry context with focus on ${actuallyAnalyzedModules.includes('ui') ? 'user experience optimization' : 'technical improvements'}

CRITICAL REQUIREMENTS FOR SPECIFIC RECOMMENDATIONS:
1. **Technical Specificity**: Each recommendation must include specific implementation details, not generic advice
2. **Effort Alignment**: Use realistic effort estimates that align with module-level recommendations (1-12 hours typical range)
3. **Module Focus**: Prioritize improvements based on the ANALYZED MODULES only: ${actuallyAnalyzedModules.join(', ')}
4. **Industry Context**: Tailor recommendations to ${industry} industry standards and user expectations
5. **Implementation Details**: Include specific techniques, tools, or approaches rather than general statements

EFFORT STANDARDIZATION:
- Very Low: 1-3 hours (quick wins, configuration changes)
- Low: 2-6 hours (simple implementations, minor fixes) 
- Moderate: 4-12 hours (feature improvements, design updates)
- High: 8-20 hours (major restructuring, comprehensive changes)

Generate exactly ${count} strategic recommendations that address the highest impact opportunities. Each recommendation MUST include ALL of these fields:
1. "text": Specific, actionable description with technical details (200-500 chars)
2. "priority": "Critical" | "High" | "Medium" | "Low" based on business impact
3. "source": Module name (ui, performance, etc.) or "ai-general" for cross-cutting
4. "impact": Measurable expected outcomes with specific metrics (e.g., "Improve LCP from 4.2s to <2.5s")
5. "effort": "Very Low" | "Low" | "Moderate" | "High" | "Very High"
6. "effortHours": {"min": X, "max": Y} realistic hour estimates
7. "implementationSteps": REQUIRED array of 3-5 specific steps with stepNumber and description

CRITICAL: implementationSteps must be SPECIFIC and ACTIONABLE, not generic phrases. Include:
- Tool names (Chrome DevTools, Lighthouse, axe-core, Hotjar)
- File paths or CSS selectors when applicable  
- Specific configuration values or code snippets
- Verification methods

FOCUS AREAS:
${actuallyAnalyzedModules.includes('ui') ? '- UI/UX improvements (responsive design, accessibility, visual hierarchy, user interaction patterns)' : ''}
${actuallyAnalyzedModules.includes('performance') ? '- Performance optimization (Core Web Vitals, loading speed, resource optimization)' : ''}
${actuallyAnalyzedModules.includes('security') ? '- Security enhancements (headers, HTTPS, vulnerability fixes)' : ''}
${actuallyAnalyzedModules.includes('accessibility') ? '- Accessibility compliance (WCAG standards, screen reader support, keyboard navigation)' : ''}
${actuallyAnalyzedModules.includes('seoContent') ? '- SEO and content optimization (metadata, content structure, search visibility)' : ''}

Provide specific technical guidance that development teams can execute immediately with measurable success criteria.`;

    try {
        // Define the system prompt for top recommendations
        const systemPrompt = `You are an expert UILensAI chief digital strategist. Based on the provided overall report summary and module highlights, generate the top ${count} most impactful, strategic, and cross-cutting recommendations for the website. 

CRITICAL CONSTRAINTS:
- ONLY base recommendations on the ANALYZED MODULES: ${actuallyAnalyzedModules.join(', ')}
- DO NOT mention or recommend improvements for modules NOT in the analyzed list
- Cross-module analysis is ${crossModuleAnalysisEnabled ? 'ENABLED' : 'DISABLED'}
- Focus on the highest impact improvements within the scope of analyzed modules

RESPONSE FORMAT REQUIREMENTS:
- You MUST return a JSON array containing exactly ${count} recommendation objects
- Each recommendation object must have: id, text, priority, source, impact, effort, effortHours, implementationSteps, businessImpact
- Use 'ai-general' for source unless cross-module analysis is enabled and the recommendation spans multiple modules

CRITICAL - TWO AUDIENCES (Technical + Non-Technical):

1. "impact" field: Write for BUSINESS OWNERS in plain language. Examples:
   ✅ GOOD: "Could increase monthly bookings by 20-30% by making it easier for customers to schedule appointments"
   ✅ GOOD: "May reduce customer frustration and complaints about the website being hard to use on phones"
   ❌ BAD: "Improves LCP to <2.5s and reduces CLS"

2. "businessImpact" object: Include for each recommendation:
   {
     "qualitativeImpact": "Plain-language explanation of what this means for the business and customers",
     "strategicAlignment": "How this helps achieve business goals like more customers, better reputation, or higher revenue"
   }

3. "implementationSteps" array: 3-5 specific steps for DEVELOPERS with tool/method names
   ✅ GOOD: "Run Lighthouse audit in Chrome DevTools (F12 > Lighthouse tab)"
   ❌ BAD: "Assess current state and identify areas for improvement"

PLAIN LANGUAGE EXAMPLES for businessImpact.qualitativeImpact:
- "Right now, visitors on phones have a frustrating experience because buttons are too small to tap and text is hard to read. Fixing this means more customers can easily browse and book services from their phones."
- "Most visitors leave within 3 seconds because the page takes too long to load. Faster loading means more potential customers actually see your services."
- "Without clear 'Book Now' buttons, visitors don't know what to do next. Adding visible booking buttons guides customers toward scheduling."

Prioritize improvements that offer the highest potential return on investment, mitigate the most significant risks, or provide substantial competitive advantages, considering any stated business goals and the industry. Each recommendation must be distinct and actionable.`;

        const aiResult = await Promise.race([
            analyzeWithAI({
                prompt: promptText,
                systemPrompt: systemPrompt,
                modelFamily: preferredModelFamily || getDefaultModelFamily('recommendations'),
                tier: tier,
                moduleName: 'module-recommendations',  // Use Haiku for cost efficiency
                vision: false,
                maxTokens: tier === 'Basic' ? 8192 : (tier === 'Pro' ? 12288 : 16384),
                isJsonOutput: true,
                expectedJsonStructure: "array",
                costAggregator: costAggregator, // Pass cost aggregator for tracking
                verbose
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Top recommendations generation timed out after ${AI_TIMEOUT_MS / 1000}s`)), AI_TIMEOUT_MS)
            )
        ]);

        if (aiResult.error) {
            if (verbose) { console.warn(`[AIRecoEngine] AI generation failed: ${aiResult.error}`); }
            return getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count, discoveredSelectors);
        }

        let processedResponse = aiResult.data;

        // Handle case where AI returns a single object instead of array
        if (processedResponse && typeof processedResponse === 'object' && !Array.isArray(processedResponse)) {
            if (verbose) { console.log("[AIRecoEngine] AI returned single object instead of array for top recommendations, converting to array."); }
            processedResponse = [processedResponse];
        }

        // Validate we have an array
        if (!Array.isArray(processedResponse)) {
            if (verbose) { console.warn("[AIRecoEngine] AI did not return array for top recommendations, using fallback"); }
            return getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count, discoveredSelectors);
        }

        // Ensure we have the right number of recommendations
        if (processedResponse.length < count) {
            if (verbose) { console.warn(`[AIRecoEngine] AI returned ${processedResponse.length} recommendations, expected ${count}. Generating additional fallbacks.`); }
            const additionalRecs = getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count - processedResponse.length, discoveredSelectors);
            processedResponse = [...processedResponse, ...additionalRecs];
        }

        if (verbose) { console.log(`[AIRecoEngine] Received ${processedResponse.length} top recommendations from AI.`); }

        // Normalize each recommendation object and validate they don't mention non-analyzed modules
        const normalizedRecommendations = processedResponse.slice(0, count).map(rec => {
            // Validate recommendation doesn't mention non-analyzed modules
            const recText = (rec.text || '').toLowerCase();
            const forbiddenModules = ['accessibility', 'performance', 'seo', 'privacy', 'compatibility', 'marketing', 'conversion']
                .filter(m => !actuallyAnalyzedModules.includes(m));

            for (const forbiddenModule of forbiddenModules) {
                if (recText.includes(forbiddenModule)) {
                    if (verbose) { console.warn(`[AIRecoEngine] Recommendation mentions non-analyzed module '${forbiddenModule}', filtering out`); }
                    return null; // Filter out contaminated recommendations
                }
            }

            return normalizeSingleRecommendation(rec, "ai-general", tier, discoveredSelectors);
        }).filter(Boolean);

        // If all recommendations were filtered out due to contamination, provide fallback
        if (normalizedRecommendations.length === 0) {
            if (verbose) { console.warn(`[AIRecoEngine] All top recommendations were filtered due to cross-module contamination, providing fallback`); }
            return getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count, discoveredSelectors);
        }

        // Ensure we have exactly the requested count
        if (normalizedRecommendations.length < count) {
            const additionalRecs = getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count - normalizedRecommendations.length, discoveredSelectors);
            return [...normalizedRecommendations, ...additionalRecs];
        }

        return normalizedRecommendations.slice(0, count);

    } catch (error) {
        console.error(`[AIRecoEngine] Error generating top recommendations: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        return getFallbackTopRecommendations(actuallyAnalyzedModules, moduleSummaries, tier, count, discoveredSelectors);
    }
}

/**
 * Generates fallback top recommendations when AI fails or returns insufficient results.
 * Creates module-aware recommendations based on which modules were actually analyzed.
 *
 * @param {string[]} analyzedModules - List of module names that were analyzed
 * @param {Array<Object>} moduleSummaries - Summary data for each analyzed module
 * @param {string} tier - Service tier
 * @param {number} count - Number of recommendations to generate
 * @param {Object} [discoveredSelectors={}] - Discovered CSS selectors from page analysis
 * @returns {Array<Object>} Array of normalized fallback recommendation objects
 */
function getFallbackTopRecommendations(analyzedModules, moduleSummaries, tier, count, discoveredSelectors = {}) {
    const { normalizeSingleRecommendation } = require('./normalizer');
    const fallbackRecs = [];

    // Generate specific recommendations based on analyzed modules with standardized effort estimates
    if (analyzedModules.includes('ui')) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Optimize user interface design and user experience based on viewport analysis findings to improve user engagement and conversion rates",
            priority: "High",
            source: "ai-general",
            impact: "Improved user experience and engagement metrics",
            effort: "Moderate",
            effortHours: { min: 4, max: 8 } // FIXED: Reduced from 8-16 to align with module recommendations
        });
    }

    if (analyzedModules.includes('performance')) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Address Core Web Vitals and performance bottlenecks to improve page load speeds and search engine rankings",
            priority: "High",
            source: "ai-general",
            impact: "Better search rankings and user retention",
            effort: "Moderate",
            effortHours: { min: 6, max: 12 } // FIXED: Reduced from 16-32 to be more realistic
        });
    }

    if (analyzedModules.includes('security')) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Strengthen website security measures and implement recommended security headers to protect against common vulnerabilities",
            priority: "High",
            source: "ai-general",
            impact: "Enhanced security posture and user trust",
            effort: "Low",
            effortHours: { min: 2, max: 6 } // FIXED: Reduced from 6-12 to align with security tasks
        });
    }

    if (analyzedModules.includes('privacy')) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Implement comprehensive privacy compliance measures including proper consent management and data protection practices",
            priority: "High",
            source: "ai-general",
            impact: "Legal compliance and user trust",
            effort: "Moderate",
            effortHours: { min: 4, max: 8 } // FIXED: Reduced from 8-16 to be more realistic
        });
    }

    if (analyzedModules.includes('accessibility')) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Enhance website accessibility to meet WCAG standards and improve usability for all users including those with disabilities",
            priority: "High",
            source: "ai-general",
            impact: "Broader user reach and legal compliance",
            effort: "Moderate",
            effortHours: { min: 6, max: 12 } // FIXED: Reduced from 10-20 to be more achievable
        });
    }

    // Add generic recommendations if we don't have enough specific ones
    if (fallbackRecs.length < count) {
        fallbackRecs.push({
            id: uuidv4(),
            text: `Focus on the highest-priority issues identified in the ${analyzedModules.join(', ')} analysis to achieve maximum impact`,
            priority: "Medium",
            source: "ai-general",
            impact: "Targeted improvements in analyzed areas",
            effort: "Low",
            effortHours: { min: 2, max: 4 } // FIXED: Reduced from 4-8 to align with quick wins
        });
    }

    if (fallbackRecs.length < count) {
        fallbackRecs.push({
            id: uuidv4(),
            text: "Establish a systematic approach to monitoring and maintaining the improvements implemented from this analysis",
            priority: "Medium",
            source: "ai-general",
            impact: "Sustained performance and quality",
            effort: "Very Low",
            effortHours: { min: 1, max: 3 } // FIXED: Reduced from 2-4 to reflect monitoring setup
        });
    }

    return fallbackRecs.slice(0, count).map(rec => normalizeSingleRecommendation(rec, "ai-general", tier, discoveredSelectors));
}

/**
 * Gets the maximum number of recommendations allowed for a given tier.
 *
 * @param {string} tier - Service tier ('Basic', 'Pro', 'Enterprise')
 * @returns {number} Maximum recommendations allowed
 */
function getMaxRecommendationsForTier(tier) {
    switch (tier.toLowerCase()) {
        case 'basic': return 5;
        case 'pro': return 10;
        case 'enterprise': return 15;
        default:
            console.warn(`[AIRecoEngine] Unknown tier '${tier}', defaulting to 5 recommendations`);
            return 5;
    }
}

/**
 * Generates minimal static recommendations when no issues are provided for a module.
 * Returns module-specific default recommendations with hardcoded selectors and steps.
 *
 * @param {string} moduleName - Module name to generate defaults for
 * @param {string} tier - Service tier (determines count: Basic=2, otherwise=3)
 * @param {Object} [discoveredSelectors={}] - Discovered CSS selectors from page analysis
 * @returns {Array<Object>} Array of normalized minimal recommendation objects
 */
function getMinimalRecommendations(moduleName, tier, discoveredSelectors = {}) {
    const { normalizeSingleRecommendation } = require('./normalizer');
    const moduleRecs = MINIMAL_RECOMMENDATION_TEMPLATES[moduleName] || [
        { text: `Review and improve ${moduleName} module implementation`, priority: "Medium", category: "Technical", effort: "1-2 days", impact: "Medium" },
        { text: `Follow best practices for ${moduleName} optimization`, priority: "Medium", category: "Technical", effort: "1-2 days", impact: "Medium" }
    ];

    const count = tier === 'Basic' ? 2 : 3;
    return moduleRecs.slice(0, count).map(rec => normalizeSingleRecommendation(rec, moduleName, tier, discoveredSelectors));
}

/**
 * Generates fallback recommendations from static templates when AI fails.
 * Includes dynamic-element-specific templates for UI module (modals, carousels, etc.).
 *
 * @param {string} moduleName - Module name to generate fallbacks for
 * @param {Array} issues - Original issues for topic detection
 * @param {string} tier - Service tier
 * @param {number} count - Number of recommendations needed
 * @param {Object} [discoveredSelectors={}] - Discovered CSS selectors from page analysis
 * @returns {Array<Object>} Array of normalized fallback recommendation objects
 */
function getFallbackRecommendations(moduleName, issues, tier, count, discoveredSelectors = {}) {
    const { normalizeSingleRecommendation } = require('./normalizer');
    // Convert issues to text for analysis
    const issuesText = issues.map(issue =>
        typeof issue === 'string' ? issue : (issue.text || issue.description || String(issue))
    ).join(' ').toLowerCase();

    // Start with a copy of the base templates
    const templates = FALLBACK_TEMPLATES[moduleName]
        ? [...FALLBACK_TEMPLATES[moduleName]]
        : [
            `Investigate and resolve identified ${moduleName} issues`,
            `Follow best practices for ${moduleName} optimization`,
            `Conduct regular ${moduleName} audits and improvements`,
            `Implement monitoring for ${moduleName} performance`,
            `Stay updated with latest ${moduleName} standards`
        ];

    // Prepend dynamic element templates for UI module
    if (moduleName === 'ui') {
        const dynamicTemplates = [];
        for (const rule of DYNAMIC_ELEMENT_TEMPLATES) {
            if (rule.keywords.some(kw => issuesText.includes(kw))) {
                dynamicTemplates.push(...rule.templates);
            }
        }
        if (dynamicTemplates.length > 0) {
            templates.unshift(...dynamicTemplates);
        }
    }

    const recommendations = [];
    const priorities = ['High', 'Medium', 'Low'];
    const categories = ['Technical', 'Content', 'Design', 'Performance', 'Security', 'Accessibility'];
    const efforts = ['1-2 hours', '1-2 days', '1-2 weeks'];
    const impacts = ['High', 'Medium', 'Low'];

    for (let i = 0; i < count && i < templates.length; i++) {
        const template = templates[i];
        const priority = priorities[i % priorities.length];
        const category = categories[i % categories.length];
        const effort = efforts[i % efforts.length];
        const impact = impacts[i % impacts.length];

        recommendations.push(normalizeSingleRecommendation({
            text: template,
            priority,
            category,
            effort,
            impact
        }, moduleName, tier, discoveredSelectors));
    }

    return recommendations;
}


module.exports = {
  generateImplementationStep,
  generateDefaultImplementationSteps,
  getRecommendationSystemPrompt,
  generateRecommendationsForIssues,
  generateTopRecommendations,
  getFallbackTopRecommendations,
  getMaxRecommendationsForTier,
  getMinimalRecommendations,
  getFallbackRecommendations
};
