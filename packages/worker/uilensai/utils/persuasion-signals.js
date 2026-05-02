/**
 * Persuasion & Conversion Psychology — Evidence-Based Utility
 *
 * Extracts persuasion and conversion psychology signals from live pages.
 * Replaces AI guesswork with measurable persuasion markers.
 *
 * Dimensions:
 * 1. Urgency language ("limited time", "expires", countdown timers)
 * 2. Scarcity indicators ("only X left", "limited spots", "exclusive")
 * 3. Social proof metrics (review count, star ratings, testimonials, customer count)
 * 4. Risk reversal ("money-back", "free trial", "cancel anytime", guarantees)
 * 5. Value proposition clarity (benefit statements in hero)
 * 6. Pricing transparency (visible pricing, comparison tables)
 * 7. Guarantee/seal detection
 *
 * All metrics are deterministic — no AI fabrication.
 */

/**
 * Extract persuasion signals from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} Persuasion evidence
 */
async function extractPersuasionSignals(page, verbose = false, sharedPageContext = null) {
    if ((!page || page.isClosed()) && !sharedPageContext) {
        return createEmptyPersuasion();
    }

    try {
        let rawData;
        if (page && !page.isClosed()) {
            rawData = await page.evaluate(() => {
            const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
            const cloned = mainContent.cloneNode(true);
            cloned.querySelectorAll('nav, footer, script, style, noscript').forEach(el => el.remove());
            const bodyText = cloned.textContent?.replace(/\s+/g, ' ').trim() || '';
            const bodyLower = bodyText.toLowerCase();

            // --- Hero Section (first visible section) ---
            const heroSection = document.querySelector(
                '[class*="hero" i], [id*="hero" i], [class*="banner" i], [class*="jumbotron" i], header + section, main > section:first-child'
            );
            const heroText = heroSection ? heroSection.textContent?.replace(/\s+/g, ' ').trim().substring(0, 500) : '';

            // --- 1. Urgency Language ---
            const urgencyPatterns = [
                /limited\s+time/i, /act\s+now/i, /don'?t\s+miss/i, /hurry/i,
                /expires?\s+(soon|today|tonight|tomorrow)/i, /today\s+only/i,
                /last\s+chance/i, /ending\s+soon/i, /offer\s+ends/i,
                /while\s+supplies?\s+last/i, /for\s+a\s+limited\s+time/i,
                /flash\s+sale/i, /sale\s+ends/i, /deadline/i, /now\s+or\s+never/i,
                /time\s+is\s+running\s+out/i, /before\s+it'?s\s+too\s+late/i,
            ];
            const urgencyMatches = urgencyPatterns.filter(p => p.test(bodyText)).length;

            // Countdown timers
            const countdownElements = document.querySelectorAll(
                '[class*="countdown" i], [class*="timer" i], [id*="countdown" i], [data-countdown]'
            );
            const hasCountdown = countdownElements.length > 0;

            // --- 2. Scarcity Indicators ---
            const scarcityPatterns = [
                /only\s+\d+\s+(left|remaining|available|spots?)/i,
                /limited\s+(spots?|seats?|availability|quantities?|stock)/i,
                /exclusive\s+(offer|deal|access|invitation)/i,
                /selling\s+fast/i, /almost\s+(sold\s+out|gone)/i,
                /few\s+(spots?|seats?|items?)\s+(left|remaining)/i,
                /members?\s+only/i, /invitation\s+only/i, /waitlist/i,
                /sold\s+out/i, /out\s+of\s+stock/i,
            ];
            const scarcityMatches = scarcityPatterns.filter(p => p.test(bodyText)).length;

            // --- 3. Social Proof ---
            // Review/rating widgets
            const starElements = document.querySelectorAll(
                '[class*="star" i], [class*="rating" i], [aria-label*="star" i], [aria-label*="rating" i]'
            );

            // Look for numeric review counts
            const reviewCountPattern = /(\d{1,6})\+?\s*(reviews?|ratings?|testimonials?|happy\s+customers?|clients?\s+served)/i;
            const reviewCountMatch = bodyText.match(reviewCountPattern);
            const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : 0;

            // Star rating text (e.g., "4.8/5", "4.8 stars", "★★★★★")
            const starRatingPattern = /(\d\.\d)\s*(?:\/\s*5|stars?|out\s+of\s+5)/i;
            const starRatingMatch = bodyText.match(starRatingPattern);
            const starRating = starRatingMatch ? parseFloat(starRatingMatch[1]) : 0;

            // Testimonials
            const testimonialElements = document.querySelectorAll(
                '[class*="testimonial" i], [class*="review" i], blockquote, [class*="quote" i], [class*="client-say" i]'
            );

            // Customer count
            const customerCountPattern = /(\d[\d,]*)\+?\s*(customers?|clients?|users?|businesses?|companies|people)\s*(served|helped|trust|use|choose|love)/i;
            const customerCountMatch = bodyText.match(customerCountPattern);
            const customerCount = customerCountMatch ? parseInt(customerCountMatch[1].replace(/,/g, ''), 10) : 0;

            // Logos/brand mentions (trust)
            const logoSections = document.querySelectorAll(
                '[class*="logo" i][class*="section" i], [class*="trusted" i], [class*="partner" i], [class*="client" i][class*="logo" i], [class*="as-seen" i]'
            );

            // --- 4. Risk Reversal ---
            const riskReversalPatterns = [
                /money[\s-]*back\s*(guarantee)?/i, /full\s+refund/i,
                /free\s+trial/i, /try\s+(it\s+)?free/i, /no\s+credit\s+card\s+required/i,
                /cancel\s+(any\s*time|at\s+any\s+time)/i, /no\s+commitment/i, /no\s+obligation/i,
                /risk[\s-]*free/i, /satisfaction\s+guarant/i,
                /\d+[\s-]*day\s+(free\s+)?(trial|guarantee|money[\s-]*back|return)/i,
                /hassle[\s-]*free\s+(return|refund|cancel)/i,
                /no\s+questions?\s+asked/i, /100%\s+(satisfaction|money[\s-]*back)/i,
            ];
            const riskReversalMatches = riskReversalPatterns.filter(p => p.test(bodyText)).length;

            // Guarantee badges/seals
            const guaranteeElements = document.querySelectorAll(
                '[class*="guarantee" i], [class*="badge" i], [class*="seal" i], img[alt*="guarantee" i], img[alt*="money back" i]'
            );

            // --- 5. Value Proposition ---
            const vpPatterns = [
                /save\s+\d+%/i, /save\s+\$\d+/i, /save\s+time/i, /save\s+money/i,
                /increase\s+(your\s+)?(revenue|sales|conversions?|traffic|leads?)/i,
                /reduce\s+(your\s+)?(costs?|time|effort|risk)/i,
                /grow\s+(your\s+)?(business|revenue|audience)/i,
                /boost\s+(your\s+)?(performance|productivity|results)/i,
                /get\s+more\s+(leads?|customers?|sales|traffic)/i,
                /no\.?\s*1|#1|number\s+one|best[\s-]+in[\s-]+class|industry[\s-]+leading/i,
                /trusted\s+by\s+\d+/i, /award[\s-]*winning/i,
            ];
            const vpMatches = vpPatterns.filter(p => p.test(heroText || bodyText.substring(0, 1000))).length;

            // --- 6. Pricing Transparency ---
            const hasPricing = /\$\d+|\€\d+|£\d+|pricing|price|cost|plan|subscription|per\s+month|\/mo/i.test(bodyText);
            const pricingTables = document.querySelectorAll(
                '[class*="pricing" i], [class*="price" i][class*="table" i], [class*="plan" i][class*="card" i]'
            );
            const hasComparisonTable = pricingTables.length >= 2;

            return {
                urgency: { matchCount: urgencyMatches, hasCountdown },
                scarcity: { matchCount: scarcityMatches },
                socialProof: {
                    hasStarRatings: starElements.length > 0,
                    starRating,
                    reviewCount,
                    testimonialCount: testimonialElements.length,
                    customerCount,
                    hasLogoSection: logoSections.length > 0,
                },
                riskReversal: {
                    matchCount: riskReversalMatches,
                    hasGuaranteeBadge: guaranteeElements.length > 0,
                },
                valueProposition: { matchCount: vpMatches, heroText: heroText.substring(0, 300) },
                pricing: { hasPricing, hasComparisonTable, pricingTableCount: pricingTables.length },
            };
        });
        } else if (sharedPageContext) {
            const bodyText = (sharedPageContext.bodyText || '').replace(/\s+/g, ' ').trim() || '';
            const bodyLower = bodyText.toLowerCase();
            const heroText = bodyText.substring(0, 500); // Approximation

            const urgencyPatterns = [
                /limited\s+time/i, /act\s+now/i, /don'?t\s+miss/i, /hurry/i,
                /expires?\s+(soon|today|tonight|tomorrow)/i, /today\s+only/i,
                /last\s+chance/i, /ending\s+soon/i, /offer\s+ends/i,
                /while\s+supplies?\s+last/i, /for\s+a\s+limited\s+time/i,
                /flash\s+sale/i, /sale\s+ends/i, /deadline/i, /now\s+or\s+never/i,
                /time\s+is\s+running\s+out/i, /before\s+it'?s\s+too\s+late/i,
            ];
            const urgencyMatches = urgencyPatterns.filter(p => p.test(bodyText)).length;

            const scarcityPatterns = [
                /only\s+\d+\s+(left|remaining|available|spots?)/i,
                /limited\s+(spots?|seats?|availability|quantities?|stock)/i,
                /exclusive\s+(offer|deal|access|invitation)/i,
                /selling\s+fast/i, /almost\s+(sold\s+out|gone)/i,
                /few\s+(spots?|seats?|items?)\s+(left|remaining)/i,
                /members?\s+only/i, /invitation\s+only/i, /waitlist/i,
                /sold\s+out/i, /out\s+of\s+stock/i,
            ];
            const scarcityMatches = scarcityPatterns.filter(p => p.test(bodyText)).length;

            const reviewCountPattern = /(\d{1,6})\+?\s*(reviews?|ratings?|testimonials?|happy\s+customers?|clients?\s+served)/i;
            const reviewCountMatch = bodyText.match(reviewCountPattern);
            const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : 0;

            const starRatingPattern = /(\d\.\d)\s*(?:\/\s*5|stars?|out\s+of\s+5)/i;
            const starRatingMatch = bodyText.match(starRatingPattern);
            const starRating = starRatingMatch ? parseFloat(starRatingMatch[1]) : 0;

            const customerCountPattern = /(\d[\d,]*)\+?\s*(customers?|clients?|users?|businesses?|companies|people)\s*(served|helped|trust|use|choose|love)/i;
            const customerCountMatch = bodyText.match(customerCountPattern);
            const customerCount = customerCountMatch ? parseInt(customerCountMatch[1].replace(/,/g, ''), 10) : 0;

            const riskReversalPatterns = [
                /money[\s-]*back\s*(guarantee)?/i, /full\s+refund/i,
                /free\s+trial/i, /try\s+(it\s+)?free/i, /no\s+credit\s+card\s+required/i,
                /cancel\s+(any\s*time|at\s+any\s+time)/i, /no\s+commitment/i, /no\s+obligation/i,
                /risk[\s-]*free/i, /satisfaction\s+guarant/i,
                /\d+[\s-]*day\s+(free\s+)?(trial|guarantee|money[\s-]*back|return)/i,
                /hassle[\s-]*free\s+(return|refund|cancel)/i,
                /no\s+questions?\s+asked/i, /100%\s+(satisfaction|money[\s-]*back)/i,
            ];
            const riskReversalMatches = riskReversalPatterns.filter(p => p.test(bodyText)).length;

            const vpPatterns = [
                /save\s+\d+%/i, /save\s+\$\d+/i, /save\s+time/i, /save\s+money/i,
                /increase\s+(your\s+)?(revenue|sales|conversions?|traffic|leads?)/i,
                /reduce\s+(your\s+)?(costs?|time|effort|risk)/i,
                /grow\s+(your\s+)?(business|revenue|audience)/i,
                /boost\s+(your\s+)?(performance|productivity|results)/i,
                /get\s+more\s+(leads?|customers?|sales|traffic)/i,
                /no\.?\s*1|#1|number\s+one|best[\s-]+in[\s-]+class|industry[\s-]+leading/i,
                /trusted\s+by\s+\d+/i, /award[\s-]*winning/i,
            ];
            const vpMatches = vpPatterns.filter(p => p.test(heroText || bodyText.substring(0, 1000))).length;

            const hasPricing = /\$\d+|\€\d+|£\d+|pricing|price|cost|plan|subscription|per\s+month|\/mo/i.test(bodyText);

            rawData = {
                urgency: { matchCount: urgencyMatches, hasCountdown: false },
                scarcity: { matchCount: scarcityMatches },
                socialProof: {
                    hasStarRatings: false,
                    starRating,
                    reviewCount,
                    testimonialCount: 0,
                    customerCount,
                    hasLogoSection: false,
                },
                riskReversal: {
                    matchCount: riskReversalMatches,
                    hasGuaranteeBadge: false,
                },
                valueProposition: { matchCount: vpMatches, heroText: heroText.substring(0, 300) },
                pricing: { hasPricing, hasComparisonTable: false, pricingTableCount: 0 },
            };
        }

        const scored = scorePersuasion(rawData);
        rawData.scores = scored;

        if (verbose) {
            console.log('[PersuasionSignals] Urgency:', rawData.urgency.matchCount, 'Scarcity:', rawData.scarcity.matchCount);
            console.log('[PersuasionSignals] Social proof — reviews:', rawData.socialProof.reviewCount, 'testimonials:', rawData.socialProof.testimonialCount);
            console.log('[PersuasionSignals] Risk reversal:', rawData.riskReversal.matchCount, 'Value prop:', rawData.valueProposition.matchCount);
            console.log('[PersuasionSignals] Overall score:', scored.overall.score);
        }

        return rawData;

    } catch (error) {
        if (verbose) console.error('[PersuasionSignals] Extraction failed:', error.message);
        return createEmptyPersuasion();
    }
}

/**
 * Score persuasion evidence (0-100)
 */
function scorePersuasion(data) {
    const scores = {};

    // Urgency (0-100) — 1-2 signals is good, 5+ is aggressive
    const urgencyCount = data.urgency.matchCount + (data.urgency.hasCountdown ? 2 : 0);
    if (urgencyCount >= 1 && urgencyCount <= 3) scores.urgency = { score: 80, detail: `${urgencyCount} urgency signals (good)` };
    else if (urgencyCount >= 4) scores.urgency = { score: 60, detail: `${urgencyCount} urgency signals (aggressive)` };
    else scores.urgency = { score: 30, detail: 'No urgency signals detected' };

    // Scarcity (0-100)
    if (data.scarcity.matchCount >= 1 && data.scarcity.matchCount <= 2) scores.scarcity = { score: 75, detail: `${data.scarcity.matchCount} scarcity signals` };
    else if (data.scarcity.matchCount >= 3) scores.scarcity = { score: 60, detail: `${data.scarcity.matchCount} scarcity signals (may seem pushy)` };
    else scores.scarcity = { score: 40, detail: 'No scarcity signals' };

    // Social Proof (0-100) — weighted heavily
    let spScore = 0;
    if (data.socialProof.reviewCount > 50) spScore += 25;
    else if (data.socialProof.reviewCount > 10) spScore += 20;
    else if (data.socialProof.reviewCount > 0) spScore += 10;

    if (data.socialProof.starRating >= 4.5) spScore += 20;
    else if (data.socialProof.starRating >= 4.0) spScore += 15;
    else if (data.socialProof.starRating > 0) spScore += 8;

    if (data.socialProof.testimonialCount >= 3) spScore += 20;
    else if (data.socialProof.testimonialCount >= 1) spScore += 12;

    if (data.socialProof.hasLogoSection) spScore += 15;
    if (data.socialProof.customerCount > 0) spScore += 10;
    if (data.socialProof.hasStarRatings) spScore += 10;

    scores.socialProof = { score: Math.min(100, spScore), detail: `${data.socialProof.reviewCount} reviews, ${data.socialProof.testimonialCount} testimonials, ${data.socialProof.starRating || 'no'} star rating` };

    // Risk Reversal (0-100)
    if (data.riskReversal.matchCount >= 3) scores.riskReversal = { score: 90, detail: `${data.riskReversal.matchCount} risk reversal signals + ${data.riskReversal.hasGuaranteeBadge ? 'badge' : 'no badge'}` };
    else if (data.riskReversal.matchCount >= 1) scores.riskReversal = { score: 65, detail: `${data.riskReversal.matchCount} risk reversal signals` };
    else scores.riskReversal = { score: 20, detail: 'No risk reversal signals' };

    // Value Proposition (0-100)
    if (data.valueProposition.matchCount >= 3) scores.valueProp = { score: 85, detail: `${data.valueProposition.matchCount} benefit statements` };
    else if (data.valueProposition.matchCount >= 1) scores.valueProp = { score: 60, detail: `${data.valueProposition.matchCount} benefit statement(s)` };
    else scores.valueProp = { score: 25, detail: 'No clear value proposition detected' };

    // Pricing transparency (0-100)
    if (data.pricing.hasComparisonTable) scores.pricing = { score: 90, detail: 'Comparison pricing table found' };
    else if (data.pricing.hasPricing) scores.pricing = { score: 65, detail: 'Pricing mentioned on page' };
    else scores.pricing = { score: 40, detail: 'No pricing information visible' };

    // Overall
    scores.overall = {
        score: Math.round(
            scores.socialProof.score * 0.30 +
            scores.riskReversal.score * 0.20 +
            scores.valueProp.score * 0.20 +
            scores.urgency.score * 0.10 +
            scores.scarcity.score * 0.10 +
            scores.pricing.score * 0.10
        ),
        detail: `Weighted across ${Object.keys(scores).length - 1} persuasion dimensions`,
    };

    return scores;
}

/**
 * Generate persuasion recommendations
 */
function generatePersuasionRecommendations(scores, industry) {
    const recs = [];

    if (scores.socialProof.score < 50) {
        recs.push({
            priority: 'high',
            category: 'social-proof',
            text: 'Add visible social proof: customer reviews, star ratings, testimonial quotes, or client logos. Social proof is the single strongest conversion driver.',
        });
    }
    if (scores.riskReversal.score < 50) {
        recs.push({
            priority: 'high',
            category: 'risk-reversal',
            text: 'Add risk reversal language: free trial, money-back guarantee, no-commitment offers, or satisfaction guarantees to reduce purchase anxiety.',
        });
    }
    if (scores.valueProp.score < 50) {
        recs.push({
            priority: 'high',
            category: 'value-proposition',
            text: 'Strengthen your value proposition: use benefit-focused headlines that quantify outcomes (e.g., "Save 40% on..." or "Get 3x more leads").',
        });
    }
    if (scores.urgency.score < 50) {
        recs.push({
            priority: 'medium',
            category: 'urgency',
            text: 'Consider adding tasteful urgency cues: seasonal promotions, limited-time offers, or availability indicators.',
        });
    }
    if (scores.pricing.score < 50) {
        recs.push({
            priority: 'medium',
            category: 'pricing',
            text: 'Consider adding pricing transparency: visible pricing or a "starting at" range reduces friction for price-sensitive visitors.',
        });
    }

    return recs;
}

function createEmptyPersuasion() {
    return {
        urgency: { matchCount: 0, hasCountdown: false },
        scarcity: { matchCount: 0 },
        socialProof: { hasStarRatings: false, starRating: 0, reviewCount: 0, testimonialCount: 0, customerCount: 0, hasLogoSection: false },
        riskReversal: { matchCount: 0, hasGuaranteeBadge: false },
        valueProposition: { matchCount: 0, heroText: '' },
        pricing: { hasPricing: false, hasComparisonTable: false, pricingTableCount: 0 },
        scores: { overall: { score: 0, detail: 'Persuasion signal extraction failed' } },
    };
}

module.exports = {
    extractPersuasionSignals,
    scorePersuasion,
    generatePersuasionRecommendations,
};
