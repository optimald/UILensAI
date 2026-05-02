/**
 * CTA Quality Heuristics Engine
 * 
 * Evidence-based scoring of Call-to-Action effectiveness.
 * Replaces AI-fabricated CTA scores with measurable quality metrics.
 * 
 * Scoring dimensions:
 * 1. Text quality (action verb + value proposition + urgency)
 * 2. Visual prominence (size, contrast, position)
 * 3. Niche relevance (CTA text matches industry conversion patterns)
 * 4. Placement effectiveness (above fold, near content, not buried)
 */

// --- CTA Text Quality Patterns ---

// High-quality CTAs use action verbs + clear value proposition
const EXCELLENT_CTA_PATTERNS = [
    // Service business patterns
    /^(book|schedule|reserve)\s+(your|a|my|an?)\s+.{3,}/i,        // "Book Your Free Consultation"
    /^(get|request|claim)\s+(your|a|my)\s+free\s+.{3,}/i,         // "Get Your Free Quote"
    /^(start|begin)\s+(your|my)\s+.{3,}/i,                         // "Start Your Transformation"
    /^(discover|explore|see)\s+(how|what|why|our)\s+.{3,}/i,       // "Discover How We Can Help"
    // E-commerce patterns
    /^(add to cart|buy now|shop)\s*.*/i,
    /^(order|purchase)\s+(now|today|yours)/i,
    // SaaS / Tech patterns
    /^(try|start)\s+.{2,}\s+(free|today|now)/i,                    // "Try It Free"
    /^(sign up|create)\s+.{2,}\s+(free|account)/i,                 // "Sign Up Free"
    /^(get started|join)\s*(for free|now|today)?/i,                 // "Get Started"
];

const GOOD_CTA_PATTERNS = [
    /^(learn more|find out|read more)\s*(about)?/i,
    /^(contact|call|reach)\s+(us|now|today)/i,
    /^(view|see|browse)\s+(our|all|more)\s+.{3,}/i,
    /^(download|access)\s+(your|our|the|free)\s+.{3,}/i,
    /^(request|get)\s+(a|an?|your)\s+.{3,}/i,
    /^(subscribe|join|enroll)\s*(now|today|free)?/i,
    /^(talk to|speak with|chat with)\s+.{2,}/i,
];

// Generic / weak CTAs
const WEAK_CTA_PATTERNS = [
    /^submit$/i,
    /^click here$/i,
    /^go$/i,
    /^ok$/i,
    /^next$/i,
    /^continue$/i,
    /^enter$/i,
    /^send$/i,
    /^more$/i,
    /^read more$/i,
    /^learn more$/i,   // Without context
    /^details$/i,
    /^info$/i,
];

// Niche-specific ideal CTA patterns
const NICHE_CTA_PATTERNS = {
    medical: [
        /consult/i, /appointment/i, /schedule/i, /book/i, /patient/i,
        /free consultation/i, /meet (the|our|a) doctor/i, /treatment plan/i
    ],
    dental: [
        /appointment/i, /schedule/i, /book/i, /patient/i, /smile/i,
        /dental/i, /cleaning/i, /exam/i, /free consultation/i
    ],
    legal: [
        /consultation/i, /case review/i, /free case/i, /attorney/i,
        /legal help/i, /speak with/i, /free evaluation/i
    ],
    'home services': [
        /estimate/i, /quote/i, /free estimate/i, /schedule/i, /inspection/i,
        /service/i, /repair/i, /installation/i
    ],
    spa: [
        /book/i, /appointment/i, /treatment/i, /session/i, /consultation/i,
        /reserve/i, /pamper/i, /rejuvenate/i, /free consultation/i
    ],
    ecommerce: [
        /add to cart/i, /buy now/i, /shop/i, /order/i, /purchase/i,
        /checkout/i, /add to bag/i
    ],
    saas: [
        /free trial/i, /get started/i, /sign up/i, /demo/i, /try/i,
        /start free/i, /create account/i, /request demo/i
    ]
};

/**
 * Score a single CTA's text quality (0-100)
 */
function scoreCTAText(text) {
    if (!text || typeof text !== 'string') return { score: 0, reason: 'No text' };

    const trimmed = text.trim();
    if (trimmed.length < 2) return { score: 0, reason: 'Too short' };
    if (trimmed.length > 60) return { score: 30, reason: 'Too long — CTAs should be concise' };

    // Check for excellent patterns
    for (const pattern of EXCELLENT_CTA_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { score: 95, reason: `Strong action verb + value proposition: "${trimmed}"` };
        }
    }

    // Check for good patterns
    for (const pattern of GOOD_CTA_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { score: 70, reason: `Clear action but could be more specific: "${trimmed}"` };
        }
    }

    // Check for weak patterns
    for (const pattern of WEAK_CTA_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { score: 25, reason: `Generic CTA that lacks action and value: "${trimmed}"` };
        }
    }

    // Heuristic scoring for unmatched CTAs
    let score = 50;
    const reasons = [];

    // Has action verb?
    if (/^(get|start|book|schedule|try|discover|explore|request|download|join|create|claim|reserve|view|see|find|learn|contact|call|speak|talk|order|buy|shop|sign)/i.test(trimmed)) {
        score += 15;
        reasons.push('starts with action verb');
    } else {
        score -= 10;
        reasons.push('missing action verb');
    }

    // Has value proposition?
    if (/free|save|exclusive|instant|today|now|your|custom|personalized/i.test(trimmed)) {
        score += 10;
        reasons.push('includes value/urgency');
    }

    // Appropriate length (3-6 words is ideal)
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 3 && wordCount <= 6) {
        score += 5;
        reasons.push('good length');
    } else if (wordCount === 1 || wordCount === 2) {
        score -= 10;
        reasons.push('too brief to convey value');
    } else if (wordCount > 8) {
        score -= 10;
        reasons.push('too wordy for a CTA');
    }

    return { score: Math.max(0, Math.min(100, score)), reason: reasons.join(', ') || 'Moderate CTA' };
}

/**
 * Score CTA niche relevance (0-100)
 */
function scoreCTANicheRelevance(ctaTexts, industry) {
    if (!ctaTexts || ctaTexts.length === 0) return { score: 0, matchedCount: 0, reason: 'No CTAs found' };

    const industryKey = findNicheKey(industry);
    if (!industryKey || !NICHE_CTA_PATTERNS[industryKey]) {
        return { score: 50, matchedCount: 0, reason: 'Industry not in niche patterns — using generic scoring' };
    }

    const patterns = NICHE_CTA_PATTERNS[industryKey];
    let matchedCount = 0;

    ctaTexts.forEach(text => {
        if (patterns.some(p => p.test(text))) matchedCount++;
    });

    const ratio = matchedCount / Math.min(ctaTexts.length, 5); // Cap at 5 CTAs for ratio
    const score = Math.round(ratio * 80 + (matchedCount > 0 ? 20 : 0)); // 20 base if any match

    return {
        score: Math.min(100, score),
        matchedCount,
        reason: matchedCount > 0
            ? `${matchedCount} CTAs match ${industryKey} best practices`
            : `No CTAs match ${industryKey} best practices — consider niche-specific action language`
    };
}

/**
 * Map industry string to niche key
 */
function findNicheKey(industry) {
    if (!industry) return null;
    const lower = industry.toLowerCase();

    if (/medical|healthcare|medspa|med spa|plastic surgery|dermatology|chiropractic|concierge medicine/.test(lower)) return 'medical';
    if (/dental|dentist|orthodont/.test(lower)) return 'dental';
    if (/law|legal|attorney|lawyer/.test(lower)) return 'legal';
    if (/home service|plumbing|hvac|roofing|electrical|landscap|cleaning|pest/.test(lower)) return 'home services';
    if (/spa|salon|beauty|aesthetics|cosmetic|wellness/.test(lower)) return 'spa';
    if (/e-?commerce|retail|shop|store/.test(lower)) return 'ecommerce';
    if (/saas|software|tech|startup|platform|app/.test(lower)) return 'saas';

    return null;
}

/**
 * Comprehensive CTA quality analysis — call this from conversion module
 * 
 * @param {Object} ctaContext - Output from getCtaContext() page.evaluate
 * @param {string} industry - Primary industry string
 * @returns {Object} Evidence-based CTA quality assessment
 */
function analyzeCTAQuality(ctaContext, industry) {
    const { ctaTexts = [], ctaCount = 0, primaryCtaText = null, aboveFoldCtaCount = 0 } = ctaContext;

    // Score each CTA's text quality
    const ctaScores = ctaTexts.map(text => ({
        text,
        ...scoreCTAText(text)
    }));

    // Overall text quality = weighted average (primary CTA counts double)
    let textQualityScore = 0;
    if (ctaScores.length > 0) {
        const primaryScore = primaryCtaText ? scoreCTAText(primaryCtaText).score : 0;
        const avgScore = ctaScores.reduce((sum, c) => sum + c.score, 0) / ctaScores.length;
        textQualityScore = primaryCtaText
            ? Math.round((primaryScore * 0.6) + (avgScore * 0.4))
            : Math.round(avgScore);
    }

    // Placement score
    let placementScore = 0;
    if (aboveFoldCtaCount >= 2) placementScore = 90;
    else if (aboveFoldCtaCount === 1) placementScore = 70;
    else if (ctaCount > 0) placementScore = 40; // CTAs exist but not above fold
    else placementScore = 5; // No CTAs at all

    // Variety score (having different CTAs for different actions is good)
    const uniqueTexts = new Set(ctaTexts.map(t => t.toLowerCase().trim()));
    let varietyScore = 50;
    if (uniqueTexts.size >= 3 && uniqueTexts.size <= 6) varietyScore = 85;
    else if (uniqueTexts.size >= 2) varietyScore = 70;
    else if (uniqueTexts.size === 1 && ctaCount > 1) varietyScore = 55; // Same CTA repeated = ok but not great
    else if (uniqueTexts.size === 0) varietyScore = 0;

    // Niche relevance
    const nicheRelevance = scoreCTANicheRelevance(ctaTexts, industry);

    // BEST-IN-CLASS: Visual quality scoring (contrast, size, whitespace)
    const ctaElements = ctaContext.ctaElements || []; // Element data if available
    let visualScore = 50; // Base: neutral if no element data available
    if (ctaElements.length > 0) {
        let vScore = 0;
        let scored = 0;
        ctaElements.forEach(el => {
            let elemScore = 0;
            // Button size (large enough to be tappable and prominent)
            const width = el.width || 0;
            const height = el.height || 0;
            if (height >= 44 && width >= 120) elemScore += 25; // Good size
            else if (height >= 36 && width >= 80) elemScore += 15; // Acceptable
            else if (height > 0) elemScore += 5; // Too small

            // Has distinct background (not transparent)
            if (el.hasBgColor || el.hasContrastColor) elemScore += 20;

            // Font size (14px+ for readability)
            if (el.fontSize >= 16) elemScore += 15;
            else if (el.fontSize >= 14) elemScore += 10;
            else elemScore += 5;

            // Padding/whitespace (buttons with good padding)
            if (el.paddingX >= 20 && el.paddingY >= 10) elemScore += 20;
            else if (el.paddingX >= 12 || el.paddingY >= 8) elemScore += 10;
            else elemScore += 5;

            // Full-width CTAs on small screens or centered = good
            if (el.isFullWidth) elemScore += 10;
            else elemScore += 5;

            // Border-radius (rounded = modern)
            if (el.borderRadius && el.borderRadius > 0) elemScore += 10;
            else elemScore += 5;

            vScore += Math.min(100, elemScore);
            scored++;
        });
        visualScore = scored > 0 ? Math.round(vScore / scored) : 50;
    } else if (ctaCount > 0) {
        // No element data but CTAs exist — give partial credit for existence
        visualScore = 45;
    } else {
        visualScore = 0;
    }

    // Overall CTA effectiveness score (redistributed weights to include visual)
    const overallScore = Math.round(
        textQualityScore * 0.30 +
        placementScore * 0.20 +
        nicheRelevance.score * 0.15 +
        varietyScore * 0.10 +
        visualScore * 0.25
    );

    return {
        overallScore,
        breakdown: {
            textQuality: { score: textQualityScore, details: ctaScores },
            placement: { score: placementScore, aboveFoldCount: aboveFoldCtaCount, totalCount: ctaCount },
            nicheRelevance,
            variety: { score: varietyScore, uniqueCount: uniqueTexts.size },
            visualQuality: { score: visualScore, elementsScored: ctaElements.length },
        },
        primaryCTA: primaryCtaText ? {
            text: primaryCtaText,
            ...scoreCTAText(primaryCtaText)
        } : null,
        recommendations: generateCTARecommendations(ctaScores, placementScore, nicheRelevance, industry)
    };
}

/**
 * Generate specific, actionable CTA recommendations
 */
function generateCTARecommendations(ctaScores, placementScore, nicheRelevance, industry) {
    const recs = [];

    // Weak primary CTA
    const weakCTAs = ctaScores.filter(c => c.score < 40);
    if (weakCTAs.length > 0) {
        const worst = weakCTAs[0];
        const nicheKey = findNicheKey(industry);
        const suggestion = nicheKey === 'medical' ? '"Book Your Free Consultation"'
            : nicheKey === 'dental' ? '"Schedule Your Appointment"'
                : nicheKey === 'legal' ? '"Get Your Free Case Review"'
                    : nicheKey === 'home services' ? '"Get Your Free Estimate"'
                        : nicheKey === 'spa' ? '"Book Your Treatment"'
                            : '"Get Started Today"';
        recs.push(`Replace weak CTA "${worst.text}" with something like ${suggestion} — use action verb + value proposition`);
    }

    // No above-fold CTAs
    if (placementScore < 50) {
        recs.push('Add a prominent CTA above the fold — users should see a clear action within the first viewport');
    }

    // Low niche relevance
    if (nicheRelevance.score < 40 && nicheRelevance.matchedCount === 0) {
        recs.push(`CTAs don't use industry-specific language — consider tailoring to your ${industry || 'business'} audience`);
    }

    // All same CTA text
    if (ctaScores.length > 2) {
        const unique = new Set(ctaScores.map(c => c.text.toLowerCase()));
        if (unique.size === 1) {
            recs.push('Diversify CTA text — use different actions for different stages (learn, explore, book, contact)');
        }
    }

    return recs.slice(0, 4);
}

module.exports = {
    analyzeCTAQuality,
    scoreCTAText,
    scoreCTANicheRelevance,
    findNicheKey,
    NICHE_CTA_PATTERNS
};
