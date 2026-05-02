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
const { getSchemaPath } = require('../paths');
const { v4: uuidv4 } = require('uuid');
const { analyzeWithAI } = require('../ai-models');
const { getDefaultModelFamily } = require('../../config/model-defaults');

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
const AI_TIMEOUT_MS = 180000;

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

function calculateSelectorSpecificity(selector) {
    return (selector.includes('#') ? 1000 : 0) +
        (selector.includes('[data-') ? 500 : 0) +
        (selector.includes('.hero') || selector.includes('.featured') ? 300 : 0) +
        (selector.includes('img[') ? 250 : 0) +
        (selector.includes('button') || selector.includes('.btn') ? 200 : 0) +
        (selector.includes('.cta') ? 150 : 0) +
        (selector.includes(':nth-child') ? 100 : 0) +
        (selector.split('.').length - 1) * 10 +
        (selector.includes('[') ? 50 : 0) +
        (selector.includes(':first-') ? 25 : 0) +
        selector.length;
}

// ─── Issue Quality Validator ────────────────────────────────────────────────

/**
 * Detects low-quality / generic issues that are mere category-score labels
 * rather than actionable findings. Returns true if the issue is generic.
 *
 * Examples of generic issues this catches:
 *   - "Responsive Design (70/100)"
 *   - "Security Headers"
 *   - "Mobile — Performance"  (category label, < 50 chars, no detail)
 *
 * @param {string|object} issue - issue text or issue object with .text
 * @returns {boolean}
 */
function isGenericIssue(issue) {
    const text = typeof issue === 'string' ? issue : (issue?.text || issue?.title || '');
    if (!text || typeof text !== 'string') return true;

    const trimmed = text.trim();

    // Too short to be actionable
    if (trimmed.length < 50) return true;

    // Matches "Category (NN/100)" pattern
    if (/^[A-Za-z\s&-]+\s*\(\d{1,3}\/100\)$/i.test(trimmed)) return true;

    // Matches "Category — SubCategory" with no detail
    if (/^[A-Za-z\s]+\s*[—–-]\s*[A-Za-z\s]+$/.test(trimmed) && trimmed.length < 80) return true;

    return false;
}

// ─── Element Identifier Generation ───────────────────────────────────────────

/**
 * Data-driven selector matching rules. Each rule maps recommendation keywords
 * to a discoveredSelectors category, an optional filter, and sorting preferences.
 * No fabricated fallback selectors — if no discovered selector matches, the result is empty.
 * @type {Array<{keywords: string[], category: string, filter?: function(string): boolean, sortBySpecificity?: boolean, sortByLength?: boolean}>}
 */
const SELECTOR_MATCH_RULES = [
    {
        keywords: ['preload', 'resource', 'critical'],
        category: 'headers',
        filter: s => s.includes('head') || s.includes('link') || s.includes('script')
    },
    {
        keywords: ['image', 'lazy', 'loading', 'webp', 'avif', 'srcset'],
        category: 'images',
        filter: s => s.includes('img') || s.includes('.hero') || s.includes('.gallery'),
        sortBySpecificity: true
    },
    {
        keywords: ['javascript', 'css', 'defer', 'minif', 'bundle', 'split'],
        category: 'unique',
        filter: s => s.includes('script') || s.includes('link') || s.includes('style')
    },
    {
        keywords: ['cach', 'server', 'http', 'header', 'control'],
        category: 'content',
        filter: s => s.includes('asset') || s.includes('static') || s.includes('cdn')
    },
    {
        keywords: ['vital', 'monitor', 'metrics', 'rum', 'performance'],
        category: 'unique',
        filter: s => s.includes('[data-') || s.includes('#') || s.includes(':nth-child'),
        sortByLength: true
    },
    {
        keywords: ['navigation', 'nav', 'menu'],
        category: 'navigation',
        sortBySpecificity: true
    },
    {
        keywords: ['button', 'cta', 'call-to-action', 'click', 'book', 'contact',
                   'appointment', 'schedule', 'submit', 'get started', 'learn more'],
        category: 'cta',
        sortBySpecificity: true
    }
];

/**
 * Generates ultra-specific, page-aware CSS selector identifiers for recommendations.
 * Uses discovered selectors from actual page analysis when available.
 *
 * @param {string} text - The recommendation text to match selectors against
 * @param {string[]} [_frameworks=[]] - Detected frameworks on the page (unused, kept for API compat)
 * @param {Object} [discoveredSelectors={}] - Selectors discovered from page analysis, keyed by category
 * @returns {Array<{type: string, value: string}>} Array of element identifiers sorted by specificity
 */
function generateElementIdentifiers(text, _frameworks = [], discoveredSelectors = {}) {
    if (!text || typeof text !== 'string') { return []; }

    const selectors = [];
    const textLower = text.toLowerCase();

    // PRIORITY 1: Use discovered ultra-specific selectors from actual page (most accurate)
    if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
        for (const rule of SELECTOR_MATCH_RULES) {
            if (!rule.keywords.some(kw => textLower.includes(kw))) { continue; }

            const categorySelectors = discoveredSelectors[rule.category];
            if (categorySelectors && categorySelectors.length > 0) {
                const matched = rule.filter ? categorySelectors.filter(rule.filter) : [...categorySelectors];

                if (rule.sortBySpecificity) {
                    matched.sort((a, b) => calculateSelectorSpecificity(b) - calculateSelectorSpecificity(a));
                } else if (rule.sortByLength) {
                    matched.sort((a, b) => b.length - a.length);
                }

                matched.slice(0, 2).forEach(selector => {
                    selectors.push({ type: "selector", value: selector });
                });
            }
        }
    }

    // PRIORITY 2: Generate context-aware selectors when no discovered matches
    if (selectors.length === 0 && discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
        // Intelligent fallback: use the most specific selectors from any category
        const allSelectors = Object.values(discoveredSelectors).flat();
        const ultraSpecific = allSelectors.filter(s =>
            s.includes('#') || s.includes(':nth-child') || s.includes('[data-')
        );

        if (ultraSpecific.length > 0) {
            ultraSpecific.slice(0, 2).forEach(selector => {
                selectors.push({ type: "selector", value: selector });
            });
        } else if (allSelectors.length > 0) {
            // Use the most complex/longest selectors (likely most specific)
            allSelectors.sort((a, b) => b.length - a.length)
                .slice(0, 2).forEach(selector => {
                    selectors.push({ type: "selector", value: selector });
                });
        }
    }

    // NOTE: No fabricated fallback selectors are generated.
    // If no real selector was discovered from PRIORITY 1 (ID selectors from page data)
    // or PRIORITY 2 (DOM selectors from discovered elements), we return an empty array.
    // Shipping fake CSS selectors as "development-ready" destroys credibility when
    // a developer tries to use them in DevTools and finds zero matches.

    // Enhanced deduplication and prioritization
    const uniqueSelectors = selectors.filter((selector, index, self) =>
        index === self.findIndex(s => s.value === selector.value)
    );

    // Sort by specificity using centralized scoring
    uniqueSelectors.sort((a, b) =>
        calculateSelectorSpecificity(b.value) - calculateSelectorSpecificity(a.value)
    );

    return uniqueSelectors.slice(0, MAX_TOP_SELECTORS);
}

// ─── Schema Loading ───────────────────────────────────────────────────────────
let reportSchemaInstance;
try {
    const schemaPath = getSchemaPath('report-schema.json');
    reportSchemaInstance = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (error) {
    console.error('[AIRecoEngine] CRITICAL: Failed to load report schema for enums.', error);
    reportSchemaInstance = { $defs: {} }; // Provide minimal fallback
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Safely retrieves a nested property from an object using dot-notation.
 * Supports array bracket indexing (e.g. 'oneOf[1].enum').
 *
 * @param {Object} obj - The source object
 * @param {string} pathStr - Dot-separated path with optional bracket indexing (e.g. 'a.b[0].c')
 * @param {*} [defaultValue=undefined] - Value returned if path not found
 * @returns {*} The value at the path, or defaultValue
 */
function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || !pathStr) { return defaultValue; }
    // Normalize bracket notation: 'oneOf[1].enum' → 'oneOf.1.enum'
    const normalizedPath = pathStr.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        const key = parts[i];
        // Handle both object properties and array indices
        if (Array.isArray(current)) {
            const index = Number(key);
            if (Number.isNaN(index) || index < 0 || index >= current.length) {
                return defaultValue;
            }
            current = current[index];
        } else if (Object.prototype.hasOwnProperty.call(current, key)) {
            current = current[key];
        } else {
            return defaultValue;
        }
    }
    return current;
}

/**
 * Cleans and truncates text for schema compliance.
 * Removes markdown fences, bullet prefixes, excessive newlines, and trailing periods.
 *
 * @param {string} text - The text to clean
 * @param {number} maxLength - Maximum character length
 * @param {string} [defaultText="N/A"] - Fallback if text is empty/invalid
 * @returns {string} Cleaned, truncated text
 */
function cleanAndTruncateText(text, maxLength, defaultText = "N/A") {
    if (typeof text !== 'string' || text.trim() === "") { return defaultText; }
    let cleaned = text.trim();
    // Basic cleaning: remove excessive newlines, leading/trailing markdown-like formatting
    cleaned = cleaned.replace(/^```json\s*|```\s*$/g, ''); // Remove json markdown
    cleaned = cleaned.replace(/^\s*[\*\-]\s+/gm, ''); // Remove leading bullets
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Reduce multiple newlines
    cleaned = cleaned.replace(/\.$/, ''); // Strip trailing period

    return cleaned.substring(0, maxLength);
}

// ─── Implementation Step Generation ─────────────────────────────────────────

/** Module-specific implementation step templates (keyed by module → step number) */
const STEP_TEMPLATES = {
    security: {
        1: "Conduct comprehensive security audit to identify vulnerabilities and assess current security posture",
        2: "Implement security measures including SSL/TLS configuration, security headers, and access controls",
        3: "Deploy security monitoring and incident response procedures with regular vulnerability scanning",
        4: "Test security implementations and establish ongoing security maintenance schedule"
    },
    performance: {
        1: "Review the performance issues identified in this scan, noting which metrics (load time, page speed) need improvement",
        2: "Address the specific issues listed: optimize images, enable compression, or fix slow-loading resources as indicated",
        3: "Deploy performance improvements and verify changes work correctly before going live",
        4: "Run a follow-up WebEvo scan to confirm your performance score has improved"
    },
    accessibility: {
        1: "Review the accessibility issues identified in this scan, noting which elements need fixes",
        2: "Fix the specific issues listed: add missing labels, improve color contrast, or enable keyboard navigation as indicated",
        3: "Test your fixes by navigating your site with keyboard only and verifying all content is accessible",
        4: "Run a follow-up WebEvo scan to verify your accessibility score has improved"
    },
    privacy: {
        1: "Review the privacy issues identified in this scan, noting missing policies or consent mechanisms",
        2: "Address the specific issues listed: add a privacy policy, implement cookie consent, or update data handling as indicated",
        3: "Test that your privacy controls work correctly and users can manage their preferences",
        4: "Run a follow-up WebEvo scan to verify your privacy score has improved"
    },
    ui: {
        1: "Review the UI/UX issues identified in this scan, noting which pages and elements need improvement",
        2: "Fix the specific issues listed: improve mobile layout, fix navigation, or update visual design as indicated",
        3: "Test your changes on different devices (phone, tablet, desktop) to ensure they look good everywhere",
        4: "Run a follow-up WebEvo scan to verify your UI score has improved"
    },
    marketing: {
        1: "Review the marketing issues identified in this scan, noting weak CTAs or missing elements",
        2: "Address the specific issues listed: improve call-to-action buttons, add social proof, or clarify messaging as indicated",
        3: "Test that your marketing changes are visible and compelling to visitors",
        4: "Run a follow-up WebEvo scan to verify your marketing score has improved"
    },
    conversion: {
        1: "Review the conversion issues identified in this scan, noting what's preventing visitors from taking action",
        2: "Fix the specific issues listed: simplify forms, add trust signals, or improve the booking process as indicated",
        3: "Test the customer journey from landing page to conversion to ensure it's smooth",
        4: "Run a follow-up WebEvo scan to verify your conversion score has improved"
    },
    seo: {
        1: "Review the SEO issues identified in this scan, noting missing meta tags or content problems",
        2: "Fix the specific issues listed: add page titles, meta descriptions, or improve content structure as indicated",
        3: "Verify that search engines can properly index your updated pages",
        4: "Run a follow-up WebEvo scan to verify your SEO score has improved"
    },
    compatibility: {
        1: "Review the compatibility issues identified in this scan, noting which browsers or devices have problems",
        2: "Fix the specific issues listed: update CSS for older browsers, fix mobile layouts, or address cross-browser bugs as indicated",
        3: "Test your site on the browsers and devices mentioned in the issues",
        4: "Run a follow-up WebEvo scan to verify your compatibility score has improved"
    }
};
Object.freeze(STEP_TEMPLATES);

/** Default implementation steps for unknown module types */
const DEFAULT_STEPS = {
    1: "Review the issues identified in this scan report, noting the specific elements and pages affected",
    2: "Prioritize fixes based on the severity ratings shown (Critical > High > Medium > Low) and focus on quick wins first",
    3: "Make the recommended changes to your website, testing each fix before moving to the next",
    4: "Run a new WebEvo scan after implementing changes to verify improvements and track your updated score"
};
Object.freeze(DEFAULT_STEPS);

/**
 * Generates a specific implementation step string based on module type and context.
 * Selects from module-specific templates and enriches with severity/industry context.
 *
 * @param {number} stepNum - Step number (1-based)
 * @param {string} _recommendationType - Recommendation text (unused, kept for API compat)
 * @param {Object} [context={}] - Contextual information for step customization
 * @param {string} [context.category] - Issue category
 * @param {string} [context.severity] - Issue severity ('Critical', 'High', 'Medium', 'Low')
 * @param {string} [context.moduleType] - Module type for template selection
 * @param {Object} [context.businessContext] - Business context with industry info
 * @returns {string} A human-readable implementation step description
 */
function generateImplementationStep(stepNum, _recommendationType, context = {}) {
    const { category, severity, moduleType, businessContext } = context;

    const moduleSteps = STEP_TEMPLATES[moduleType] || STEP_TEMPLATES[category] || DEFAULT_STEPS;
    const baseStep = moduleSteps[stepNum] || DEFAULT_STEPS[stepNum] || DEFAULT_STEPS[4];

    // Add context-specific details based on severity and business context
    if (severity === 'Critical' && stepNum === 1) {
        return `URGENT: ${baseStep} with immediate priority due to critical security/compliance requirements`;
    } else if (severity === 'High' && stepNum === 2) {
        return `${baseStep} with accelerated timeline to address high-priority issues`;
    } else if (businessContext && businessContext.industry === 'Healthcare' && moduleType === 'privacy') {
        return `${baseStep} ensuring HIPAA compliance and patient data protection requirements`;
    } else if (businessContext && businessContext.industry === 'E-commerce' && moduleType === 'conversion') {
        return `${baseStep} with focus on checkout optimization and payment security`;
    }

    return baseStep;
}

/**
 * Generates a default set of implementation steps when AI doesn't provide them.
 * Step count is scaled based on priority: Critical=5, High=4, default=3.
 *
 * @param {string} recommendationText - The recommendation text for context
 * @param {string} [priority='Medium'] - Priority level to determine step count
 * @returns {Array<{stepNumber: number, description: string}>} Array of step objects
 */
function generateDefaultImplementationSteps(recommendationText, priority = "Medium", moduleName) {
    const text = (recommendationText || '').trim();

    // 1. Try the domain-specific keyword matcher (28+ branches for security, perf, a11y, design, SEO, etc.)
    // Lazy-require to avoid circular dependency at module load time
    try {
        const { generateContextAwareSteps } = require('../jsonNormalizer');
        if (generateContextAwareSteps) {
            const specific = generateContextAwareSteps(text, moduleName);
            if (specific && specific.length > 0) {
                return specific.map((desc, i) => ({ stepNumber: i + 1, description: desc }));
            }
        }
    } catch (e) {
        // jsonNormalizer not available — fall through to STEP_TEMPLATES
    }

    // 2. Try module-specific step templates (accessibility, performance, security, etc.)
    const lowerText = text.toLowerCase();
    let matchedTemplates = null;
    if (/\b(wcag|aria|screen reader|alt text|contrast|keyboard|focus|perceivable|operable)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.accessibility;
    } else if (/\b(csp|hsts|header|ssl|certificate|xss|injection|vulnerability)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.security;
    } else if (/\b(legacy javascript|unused.?javascript|unused.?js|bundle|treeshak|code.?split|minif)/i.test(lowerText)) {
        // Performance: JS optimization
        matchedTemplates = {
            1: "Run 'Coverage' tab in Chrome DevTools on the affected page — identify the exact unused JS bytes per script",
            2: "Configure tree-shaking in your bundler (Webpack/Vite) and remove dead code from the flagged modules",
            3: "Defer non-critical scripts with 'defer' or 'async' attributes — move render-blocking JS below the fold",
            4: "Re-run Lighthouse and verify the 'Unused JavaScript' audit shows < 5 KiB of waste"
        };
    } else if (/\b(image delivery|image.*sav|webp|avif|compress|image optim|responsive image|srcset)/i.test(lowerText)) {
        // Performance: Image optimization
        matchedTemplates = {
            1: "Audit all images with Lighthouse 'Serve images in next-gen formats' — list each image and its current format/size",
            2: "Convert to WebP/AVIF using Squoosh or imagemin — target 80% quality for photos, lossless for UI icons",
            3: "Add width/height attributes and 'loading=lazy' to all below-fold images to prevent CLS",
            4: "Implement responsive images with <picture> + srcset for mobile/desktop breakpoints"
        };
    } else if (/\b(main.?thread|blocking time|tbt|long task|forced reflow|layout thrash)/i.test(lowerText)) {
        // Performance: Main thread / TBT
        matchedTemplates = {
            1: "Profile the page with Chrome DevTools Performance tab — identify the top 3 Long Tasks (> 50ms) by call stack",
            2: "Break up the identified Long Tasks using requestIdleCallback() or setTimeout(fn, 0) to yield to the main thread",
            3: "Move heavy computations to a Web Worker or defer them until after First Contentful Paint",
            4: "Verify TBT dropped below 200ms by re-running Lighthouse in the Performance panel"
        };
    } else if (/\b(contrast|foreground.*color|background.*color|color ratio|wcag.*contrast)/i.test(lowerText)) {
        // Performance/Accessibility: Contrast issues
        matchedTemplates = {
            1: "Run axe DevTools or WebAIM Contrast Checker on the flagged elements — record current contrast ratios",
            2: "Update the CSS color values to meet WCAG AA (4.5:1 for body text, 3:1 for large text/UI components)",
            3: "Verify fixes across all viewport sizes — contrast may differ on dark/light theme variants",
            4: "Add an automated axe-core assertion in CI to prevent contrast regressions on future deploys"
        };
    } else if (/\b(browser error|console.*error|devtools|issues panel|deprecat)/i.test(lowerText)) {
        // Performance: Console errors / DevTools issues
        matchedTemplates = {
            1: "Open Chrome DevTools Console and Issues panel — list each unique error, warning, and deprecation with frequency",
            2: "Fix critical JS errors first (TypeError, ReferenceError) — these typically indicate broken functionality",
            3: "Address deprecation warnings (e.g., obsolete APIs, third-party cookie access) before browsers remove support",
            4: "Add window.onerror + Sentry/LogRocket error tracking to catch runtime errors in production"
        };
    } else if (/\b(lcp|fcp|cls|load time|lighthouse|pagespeed|performance|speed index|tti|time to interactive)/i.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.performance;
    } else if (/\b(cookie|consent|gdpr|ccpa|privacy|data retention)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.privacy;
    } else if (/\b(meta|title tag|heading|sitemap|canonical|structured data|seo)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.seo;
    } else if (/\b(responsive|breakpoint|browser compat|cross-browser|mobile)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.compatibility;
    } else if (/\b(cta|call.?to.?action|button.*click|click.*rate|landing page)\b/i.test(lowerText)) {
        // Conversion: CTA-specific
        matchedTemplates = {
            1: "Identify all CTAs on the page — map their position, color, text, and click-through rate from analytics",
            2: "A/B test CTA copy and color: e.g., 'Start Free Trial' (green) vs 'Get Started Now' (orange) for 2 weeks",
            3: "Ensure primary CTA is above the fold and uses a contrasting color from the background (min 3:1 ratio)",
            4: "Add micro-interactions (hover scale, ripple) and urgency cues ('Limited spots') to boost engagement"
        };
    } else if (/\b(form|checkout|cart|signup|registration)\b/i.test(lowerText)) {
        // Conversion: Form/checkout-specific
        matchedTemplates = {
            1: "Audit the form with Hotjar/FullStory session recordings — identify the exact field where users abandon",
            2: "Reduce form fields to essentials only (name + email for signups) — each extra field reduces conversion ~7%",
            3: "Add inline validation, autofill support, and clear error messages with specific fix instructions",
            4: "Implement progress indicators for multi-step forms and test a single-page vs multi-step variant"
        };
    } else if (/\b(conversion|bounce rate|exit rate|funnel|retention)\b/i.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.conversion;
    } else if (/\b(analytics|tracking|tag manager|marketing|email|campaign)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.marketing;
    } else if (/\b(consistency|consistent|design system|inconsist)\b/.test(lowerText)) {
        // UI Consistency — distinct from hierarchy
        matchedTemplates = {
            1: "Audit all pages for inconsistent spacing, font sizes, and color usage — document the variations with screenshots",
            2: "Define a design token system: pick 3-4 font sizes, a spacing scale (4/8/16/24/32px), and max 5 brand colors",
            3: "Apply the design tokens globally via CSS custom properties and verify each page matches the system",
            4: "Run a visual regression diff between pages to confirm consistency"
        };
    } else if (/\b(visual hierarchy|hierarchy|typographic|heading structure|font weight)\b/.test(lowerText)) {
        // UI Hierarchy — distinct from consistency
        matchedTemplates = {
            1: "Map the current heading levels (H1-H6) and font sizes on the page — identify where hierarchy breaks down",
            2: "Set a clear type scale: H1 at 32-40px, H2 at 24-28px, body at 16px — enforce via CSS variables",
            3: "Add visual weight cues (bold, color contrast, whitespace) to primary CTAs and section headers to guide scanning",
            4: "Test hierarchy by blurring the page at 50% — most important elements should still stand out"
        };
    } else if (/\b(spacing|typography|ui|ux|design|layout|whitespace)\b/.test(lowerText)) {
        matchedTemplates = STEP_TEMPLATES.ui;
    }

    if (matchedTemplates) {
        const stepCount = priority === "Critical" ? 4 : priority === "High" ? 4 : 3;
        const steps = [];
        for (let i = 1; i <= stepCount; i++) {
            if (matchedTemplates[i]) {
                steps.push({ stepNumber: i, description: matchedTemplates[i] });
            }
        }
        if (steps.length > 0) return steps;
    }

    // 3. Last resort: use DEFAULT_STEPS (these are at least scan-specific, not "Mad Libs")
    const stepCount = priority === "Critical" ? 4 : priority === "High" ? 4 : 3;
    const steps = [];
    for (let i = 1; i <= stepCount; i++) {
        steps.push({ stepNumber: i, description: DEFAULT_STEPS[i] || DEFAULT_STEPS[4] });
    }
    return steps;
}

function normalizeElementIdentifiers(rawIdentifiers, recText, discoveredSelectors, recommendationDef) {
    const validElementIdTypes = getNestedProperty(recommendationDef, 'elementIdentifiers.items.properties.type.enum', ["selector"]);
    let identifiers = Array.isArray(rawIdentifiers) ? rawIdentifiers.map(ei => {
        if (typeof ei === 'string') {
            return {
                type: "selector",
                value: cleanAndTruncateText(ei, getNestedProperty(recommendationDef, 'elementIdentifiers.items.properties.value.maxLength', 1000), "")
            };
        }
        return {
            type: validElementIdTypes.includes(ei?.type) ? ei.type : "selector",
            value: cleanAndTruncateText(ei?.value, getNestedProperty(recommendationDef, 'elementIdentifiers.items.properties.value.maxLength', 1000), "")
        };
    }).filter(ei => ei.value !== "").slice(0, MAX_ELEMENT_IDENTIFIERS) : [];

    // Generate specific identifiers if none provided or all are generic
    if (identifiers.length === 0 ||
        identifiers.every(ei => ei.value === "N/A" || ei.value === "various elements" || ei.value === "general")) {
        const specificIdentifiers = generateElementIdentifiers(recText || "", [], discoveredSelectors);
        if (specificIdentifiers.length > 0) {
            identifiers = specificIdentifiers.slice(0, MAX_SPECIFIC_IDENTIFIERS);
        }
    }

    // Replace remaining generic or fabricated selectors
    if (identifiers.length > 0) {
        const allDiscovered = Object.values(discoveredSelectors || {}).flat();
        const ALLOWED_SEMANTIC_TAGS = ['html', 'body', 'main', 'nav', 'header', 'footer', 'aside', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        
        identifiers = identifiers.map((ei, index) => {
            const trimmed = ei.value.trim();
            const isAllowedSemantic = ALLOWED_SEMANTIC_TAGS.includes(trimmed.toLowerCase());
            const isValidId = trimmed.startsWith('#');
            
            const isGeneric = !isAllowedSemantic && !isValidId && (
                FORBIDDEN_SELECTORS.includes(trimmed) ||
                GENERIC_TAG_PATTERN.test(trimmed) ||
                GENERIC_CLASS_PATTERN.test(trimmed) ||
                GENERIC_ID_PATTERN.test(trimmed) ||
                trimmed.length < 4
            );

            if (FABRICATED_INDUSTRY_PATTERN.test(ei.value)) {
                const cleaned = ei.value
                    .replace(FABRICATED_INDUSTRY_PATTERN, '')
                    .replace(/[.#\[\]>:]/g, ' ')
                    .replace(/[-_]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                return { type: "description", value: cleaned || "Page element referenced by recommendation" };
            }

            if (isGeneric) {
                if (allDiscovered.length > 0) {
                    return { ...ei, value: allDiscovered[index % allDiscovered.length] };
                }
                return { type: "description", value: DESCRIPTIVE_FALLBACKS[index % DESCRIPTIVE_FALLBACKS.length] };
            }
            return ei;
        });
    }

    return identifiers.length > 0 ? identifiers : undefined;
}

/**
 * Normalizes tier-dependent fields (Pro/Enterprise only).
 *
 * @param {Object} rec - The raw recommendation object
 * @param {boolean} isProOrEnterprise - Whether the tier is Pro or Enterprise
 * @param {Object} recommendationDef - Schema definition for validation
 * @returns {Object} Object with regulatoryImpact, businessImpact, and scoreExplanation
 */
function normalizeTierFields(rec, isProOrEnterprise, recommendationDef) {
    if (!isProOrEnterprise) {
        return { regulatoryImpact: undefined, businessImpact: undefined, scoreExplanation: undefined };
    }

    const regulatoryImpact = (rec.regulatoryImpact && typeof rec.regulatoryImpact === 'object') ? {
        affectsCompliance: typeof rec.regulatoryImpact.affectsCompliance === 'boolean' ? rec.regulatoryImpact.affectsCompliance : false,
        regulations: Array.isArray(rec.regulatoryImpact.regulations) ? rec.regulatoryImpact.regulations.map(String).slice(0, MAX_REGULATIONS) : [],
        complianceBenefit: cleanAndTruncateText(rec.regulatoryImpact.complianceBenefit, getNestedProperty(recommendationDef, 'regulatoryImpact.properties.complianceBenefit.maxLength', 1000))
    } : undefined;

    const businessImpact = (rec.businessImpact && typeof rec.businessImpact === 'object') ? {
        qualitativeImpact: cleanAndTruncateText(rec.businessImpact.qualitativeImpact, getNestedProperty(recommendationDef, 'businessImpact.properties.qualitativeImpact.maxLength', 5000)),
        quantitativeImpact: Array.isArray(rec.businessImpact.quantitativeImpact) ? rec.businessImpact.quantitativeImpact.map(qi => ({
            metric: qi.metric || "Key Metric", currentValue: qi.currentValue, projectedValue: qi.projectedValue,
            changePercentage: typeof qi.changePercentage === 'number' ? qi.changePercentage : null, timeframe: qi.timeframe
        })).slice(0, MAX_QUANTITATIVE_IMPACTS) : [],
        strategicAlignment: cleanAndTruncateText(rec.businessImpact.strategicAlignment, getNestedProperty(recommendationDef, 'businessImpact.properties.strategicAlignment.maxLength', 2000))
    } : undefined;

    const biasAssessmentDef = getNestedProperty(recommendationDef, 'scoreExplanation.properties.biasAssessment.properties.biasType.enum', ["None Identified"]);
    const scoreExplanation = (rec.scoreExplanation && typeof rec.scoreExplanation === 'object') ? {
        reasoning: typeof rec.scoreExplanation.reasoning === 'string' ? cleanAndTruncateText(rec.scoreExplanation.reasoning, getNestedProperty(recommendationDef, 'scoreExplanation.properties.reasoning.maxLength', 2000)) : undefined,
        confidence: typeof rec.scoreExplanation.confidence === 'number' ? Math.max(0, Math.min(1, rec.scoreExplanation.confidence)) : undefined,
        biasAssessment: (rec.scoreExplanation.biasAssessment && typeof rec.scoreExplanation.biasAssessment === 'object') ? {
            biasType: biasAssessmentDef.includes(rec.scoreExplanation.biasAssessment.biasType) ? rec.scoreExplanation.biasAssessment.biasType : "None Identified",
            mitigationSteps: cleanAndTruncateText(rec.scoreExplanation.biasAssessment.mitigationSteps, getNestedProperty(recommendationDef, 'scoreExplanation.properties.biasAssessment.properties.mitigationSteps.maxLength', 1000), "Bias considered and addressed.")
        } : { biasType: "None Identified", mitigationSteps: "Bias considered and addressed." }
    } : undefined;

    return { regulatoryImpact, businessImpact, scoreExplanation };
}

/**
 * Normalizes a single recommendation object to ensure schema v3.11.0 compliance.
 * @param {Object} rec - The raw recommendation object from AI.
 * @param {string} defaultSource - The module name to use as default source.
 * @param {string} tier - The service tier ("Basic", "Pro", "Enterprise").
 * @param {Object} discoveredSelectors - Discovered selectors from page analysis.
 * @returns {Object} A normalized recommendation object.
 */
function normalizeSingleRecommendation(rec, defaultSource, tier = "Basic", discoveredSelectors = {}) {
    if (!rec || typeof rec !== 'object') {
        return {
            id: uuidv4(),
            text: "AI failed to provide valid recommendation text.",
            priority: "Medium",
            source: defaultSource,
            impact: "Review manually.",
            effort: "Moderate",
            elementIdentifiers: [], implementationSteps: [], effortHours: { min: 1, max: 2 },
            priorityRationale: undefined, effortDescription: undefined, effortBreakdown: [],
            regulatoryImpact: undefined, businessImpact: undefined,
            score_impact: undefined, testingGuidance: undefined, successMetrics: [], scoreExplanation: undefined
        };
    }

    const recommendationDef = getNestedProperty(reportSchemaInstance, '$defs.recommendation.properties', {});

    // Validate UUID format
    let recommendationId = rec.id;
    if (!recommendationId || typeof recommendationId !== 'string' ||
        !UUID_REGEX.test(recommendationId) || INVALID_ID_PATTERNS.test(recommendationId) ||
        recommendationId.length !== 36) {
        recommendationId = uuidv4();
    }

    const normalized = { id: recommendationId };

    // Core fields
    normalized.text = cleanAndTruncateText(rec.text, getNestedProperty(recommendationDef, 'text.maxLength', 5000),
        `Review and improve ${defaultSource} module based on analysis findings. Consider best practices and user experience guidelines.`);

    const validPriorities = getNestedProperty(recommendationDef, 'priority.enum', ["Critical", "High", "Medium", "Low"]);
    normalized.priority = validPriorities.includes(rec.priority) ? rec.priority : "Medium";
    normalized.priorityRationale = typeof rec.priorityRationale === 'string' ? cleanAndTruncateText(rec.priorityRationale, getNestedProperty(recommendationDef, 'priorityRationale.maxLength', 1000)) : undefined;

    // Source validation
    const validModuleSources = getNestedProperty(reportSchemaInstance, '$defs.moduleNameEnum.enum', []);
    const validGeneralSources = getNestedProperty(recommendationDef, 'source.oneOf[1].enum', ["cross-module", "ai-general"]);
    let source = (rec.source || defaultSource).toLowerCase();
    if (!validModuleSources.includes(source) && !validGeneralSources.includes(source)) {
        source = defaultSource;
    }
    normalized.source = source;

    const rawImpact = cleanAndTruncateText(rec.impact, getNestedProperty(recommendationDef, 'impact.maxLength', 1000), "");
    normalized.impact = rawImpact || null;

    // Element identifiers (delegated to sub-function)
    normalized.elementIdentifiers = normalizeElementIdentifiers(rec.elementIdentifiers, rec.text, discoveredSelectors, recommendationDef);

    // selectorSource — transparent provenance for every recommendation
    if (normalized.elementIdentifiers && normalized.elementIdentifiers.length > 0) {
        // Check if identifiers came from discovered page selectors vs AI-generated
        const allDiscovered = Object.values(discoveredSelectors || {}).flat();
        const hasDiscovered = normalized.elementIdentifiers.some(ei =>
            (ei.type === 'selector' && allDiscovered.includes(ei.value)) ||
            (ei.type === 'header' && allDiscovered.includes(ei.value.toLowerCase()))
        );
        normalized.selectorSource = hasDiscovered ? 'discovered' : 'ai-generated';
        
        // If it generated specific selectors but none were discovered, it's technically unverified
        normalized.isVerified = hasDiscovered || normalized.elementIdentifiers.every(ei => ei.type === 'description');
    } else {
        normalized.selectorSource = 'none';
        normalized.isVerified = true; // Recommendations without specific element targets are assumed verified by default
    }

    // Effort fields
    const validEfforts = getNestedProperty(recommendationDef, 'effort.enum', ["Very Low", "Low", "Moderate", "High", "Very High"]);
    normalized.effort = validEfforts.includes(rec.effort) ? rec.effort : "Moderate";
    normalized.effortDescription = typeof rec.effortDescription === 'string' ? cleanAndTruncateText(rec.effortDescription, getNestedProperty(recommendationDef, 'effortDescription.maxLength', 1000)) : undefined;

    // ALWAYS enforce effortHours from effort tier — AI consistently returns wrong values ({min:1,max:4} for everything)
    const EFFORT_HOURS_MAP = {
        'Very Low':  { min: 1, max: 2 },
        'Low':       { min: 2, max: 4 },
        'Moderate':  { min: 4, max: 8 },
        'High':      { min: 8, max: 16 },
        'Very High': { min: 16, max: 40 }
    };
    const tierHours = EFFORT_HOURS_MAP[normalized.effort] || { min: 4, max: 8 };
    // Only use AI-provided effortHours if they fall within the tier's range (±50% tolerance)
    if (rec.effortHours && typeof rec.effortHours.min === 'number' && typeof rec.effortHours.max === 'number') {
        const aiMin = Math.max(0, rec.effortHours.min);
        const aiMax = Math.max(0, rec.effortHours.max);
        const withinRange = aiMin >= tierHours.min * 0.5 && aiMax <= tierHours.max * 1.5;
        normalized.effortHours = withinRange ? { min: aiMin, max: aiMax } : tierHours;
    } else {
        normalized.effortHours = tierHours;
    }
    if (normalized.effortHours.min > normalized.effortHours.max) { normalized.effortHours.max = normalized.effortHours.min; }

    const validRoles = getNestedProperty(recommendationDef, 'effortBreakdown.items.properties.role.enum', ["Developer"]);
    normalized.effortBreakdown = Array.isArray(rec.effortBreakdown) ? rec.effortBreakdown.map(eb => ({
        task: cleanAndTruncateText(eb?.task, getNestedProperty(recommendationDef, 'effortBreakdown.items.properties.task.maxLength', 500), "Unnamed Task"),
        role: validRoles.includes(eb?.role) ? eb.role : "Developer",
        estimatedHours: typeof eb?.estimatedHours === 'number' ? Math.max(0, eb.estimatedHours) :
            (EFFORT_HOURS_MAP[normalized.effort]?.min || 4)
    })).slice(0, MAX_EFFORT_BREAKDOWN_ITEMS) : [];
    if (normalized.effortBreakdown.length === 0) { normalized.effortBreakdown = undefined; }

    // Tier-dependent fields (delegated to sub-function)
    const isProOrEnterprise = tier === "Pro" || tier === "Enterprise";
    const tierFields = normalizeTierFields(rec, isProOrEnterprise, recommendationDef);
    normalized.regulatoryImpact = tierFields.regulatoryImpact;
    normalized.businessImpact = tierFields.businessImpact;
    normalized.scoreExplanation = tierFields.scoreExplanation;

    // Implementation steps — ALWAYS required, generate defaults if AI omitted them
    let rawSteps;
    const aiStepsRaw = rec.implementationSteps || rec.implementation_steps || rec.steps;
    console.log(`[Normalizer DEBUG] Validating implementationSteps for rec: ${normalized.text.substring(0, 50)}... Array length: ${Array.isArray(aiStepsRaw) ? aiStepsRaw.length : 'NOT ARRAY'}`);
    if (Array.isArray(aiStepsRaw) && aiStepsRaw.length > 0) {
        // AI provided steps — keep descriptions, skip empty ones
        const aiSteps = aiStepsRaw
            .filter(is => is?.description && is.description.trim().length > 0)
            .map((is, idx) => ({
                stepNumber: typeof is?.stepNumber === 'number' ? is.stepNumber : idx + 1,
                description: cleanAndTruncateText(is.description, getNestedProperty(recommendationDef, 'implementationSteps.items.properties.description.maxLength', 2000)),
                details: typeof is?.details === 'string' ? cleanAndTruncateText(is.details, getNestedProperty(recommendationDef, 'implementationSteps.items.properties.details.maxLength', 5000)) : undefined
            }))
            .slice(0, MAX_IMPLEMENTATION_STEPS);
        console.log(`[Normalizer DEBUG] aiSteps filtered length: ${aiSteps.length} | First step: ${aiSteps[0]?.description?.substring(0, 30)}`);
        // If all AI steps had empty descriptions, generate domain-specific steps instead
        rawSteps = aiSteps.length > 0 ? aiSteps : generateDefaultImplementationSteps(rec.text, rec.priority, defaultSource);
    } else {
        console.log(`[Normalizer DEBUG] Falling back to generateDefaultImplementationSteps`);
        rawSteps = generateDefaultImplementationSteps(rec.text, rec.priority, defaultSource);
    }
    normalized.implementationSteps = rawSteps;

    // Remaining scalar fields
    normalized.score_impact = typeof rec.score_impact === 'number' ? Math.max(0, Math.min(100, Math.round(rec.score_impact))) : undefined;
    normalized.testingGuidance = typeof rec.testingGuidance === 'string' ? cleanAndTruncateText(rec.testingGuidance, getNestedProperty(recommendationDef, 'testingGuidance.maxLength', 2000)) : undefined;
    normalized.successMetrics = Array.isArray(rec.successMetrics) && rec.successMetrics.length > 0 ? rec.successMetrics.map(String).slice(0, MAX_SUCCESS_METRICS) : undefined;

    // Remove undefined optional fields for cleaner JSON
    Object.keys(normalized).forEach(key => {
        if (normalized[key] === undefined) {
            delete normalized[key];
        }
    });

    return normalized;
}

/**
 * Generates AI-powered recommendations for a specific set of module issues.
 * Falls back to static templates if AI generation fails.
 *
 * @param {Object} options
 * @param {string} options.moduleName - Module identifier (e.g. 'ui', 'security', 'performance')
 * @param {Array} options.issues - Array of issue objects or strings to generate recommendations for
 * @param {Object} [options.contextData={}] - Additional context data from the analysis
 * @param {string} [options.url='N/A'] - The analyzed website URL
 * @param {string} [options.tier='Basic'] - Service tier ('Basic', 'Pro', 'Enterprise')
 * @param {string} [options.industry='general'] - Detected industry category
 * @param {string} [options.analysisDepth='basic'] - Analysis depth level
 * @param {number} [options.count=5] - Number of recommendations to generate
 * @param {string|null} [options.preferredModelFamily=null] - Preferred AI model family
 * @param {Object} [options.discoveredSelectors={}] - CSS selectors discovered from page analysis
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Promise<Array<Object>>} Array of normalized recommendation objects
 */

module.exports = {
  calculateSelectorSpecificity,
  isGenericIssue,
  generateElementIdentifiers,
  getNestedProperty,
  cleanAndTruncateText,
  normalizeElementIdentifiers,
  normalizeTierFields,
  normalizeSingleRecommendation,
  STEP_TEMPLATES,
  DEFAULT_STEPS,
  generateImplementationStep,
  generateDefaultImplementationSteps,
  generateElementIdentifiers
};
