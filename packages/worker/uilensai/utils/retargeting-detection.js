/**
 * Retargeting & Advertising Pixel Detection — Evidence-Based Utility
 *
 * Detects advertising and retargeting pixels from live pages.
 * Covers major ad platforms: Meta, Google, LinkedIn, Twitter/X,
 * Pinterest, TikTok, Microsoft/Bing, Snapchat, and more.
 *
 * All detection is deterministic via script/network pattern matching.
 */

/**
 * Extract retargeting pixel evidence from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} Retargeting evidence
 */
async function extractRetargetingPixels(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyRetargeting();
    }

    try {
        const rawData = await page.evaluate(() => {
            const scripts = Array.from(document.scripts);
            const scriptSrcs = scripts.map(s => s.src || '').filter(Boolean);
            const scriptContent = scripts.map(s => s.innerHTML?.substring(0, 2000) || '').join(' ');
            const allScriptText = scriptSrcs.join(' ') + ' ' + scriptContent;

            // Also check for img pixels (1x1 tracking pixels)
            const trackingImages = Array.from(document.querySelectorAll('img[width="1"], img[height="1"], img[src*="pixel"], img[src*="tr?"]'));
            const imgSrcs = trackingImages.map(img => img.src || '').join(' ');

            const combined = (allScriptText + ' ' + imgSrcs).toLowerCase();

            const pixelDefinitions = [
                {
                    name: 'Meta Pixel (Facebook)',
                    patterns: [/fbq\s*\(/i, /connect\.facebook\.net/i, /facebook\.com\/tr/i, /fb-pixel/i],
                    category: 'social',
                },
                {
                    name: 'Google Ads',
                    patterns: [/googleads\.g\.doubleclick\.net/i, /google_conversion_id/i, /gtag.*config.*'aw-/i, /googlesyndication\.com/i, /google_remarketing_only/i],
                    category: 'search',
                },
                {
                    name: 'Google Remarketing',
                    patterns: [/google_remarketing/i, /googleadservices\.com\/pagead/i, /google_tag_params/i],
                    category: 'search',
                },
                {
                    name: 'LinkedIn Insight Tag',
                    patterns: [/snap\.licdn\.com/i, /_linkedin_partner_id/i, /linkedin\.com\/px/i],
                    category: 'social',
                },
                {
                    name: 'Twitter/X Pixel',
                    patterns: [/static\.ads-twitter\.com/i, /twq\s*\(/i, /t\.co\/i\?/i],
                    category: 'social',
                },
                {
                    name: 'Pinterest Tag',
                    patterns: [/pintrk\s*\(/i, /ct\.pinterest\.com/i, /s\.pinimg\.com\/ct/i],
                    category: 'social',
                },
                {
                    name: 'TikTok Pixel',
                    patterns: [/analytics\.tiktok\.com/i, /ttq\.load/i, /ttq\.track/i],
                    category: 'social',
                },
                {
                    name: 'Microsoft Advertising (Bing UET)',
                    patterns: [/bat\.bing\.com/i, /uetq/i, /bing\.com\/action\/0/i],
                    category: 'search',
                },
                {
                    name: 'Snapchat Pixel',
                    patterns: [/sc-static\.net\/scevent\.min\.js/i, /snaptr\s*\(/i],
                    category: 'social',
                },
                {
                    name: 'Quora Pixel',
                    patterns: [/quora\.com\/_\/ad/i, /qp\s*\(/i],
                    category: 'other',
                },
                {
                    name: 'Reddit Pixel',
                    patterns: [/rdt\s*\(/i, /alb\.reddit\.com/i],
                    category: 'social',
                },
                {
                    name: 'Criteo',
                    patterns: [/static\.criteo\.net/i, /criteo\.com\/js/i],
                    category: 'programmatic',
                },
                {
                    name: 'AdRoll',
                    patterns: [/d\.adroll\.com/i, /adroll\.com\/pixel/i],
                    category: 'programmatic',
                },
                {
                    name: 'Taboola',
                    patterns: [/cdn\.taboola\.com/i, /trc\.taboola\.com/i],
                    category: 'native',
                },
                {
                    name: 'Outbrain',
                    patterns: [/outbrain\.com\/outbrain\.js/i, /outbraintrk/i],
                    category: 'native',
                },
            ];

            const detected = [];
            pixelDefinitions.forEach(pixel => {
                const found = pixel.patterns.some(p => p.test(combined));
                if (found) {
                    detected.push({
                        name: pixel.name,
                        category: pixel.category,
                    });
                }
            });

            // Conversion API / Server-side tracking indicators
            const hasConversionAPI = /capi|conversion.api|server.side.tracking|s2s/i.test(scriptContent);

            return {
                pixels: detected,
                totalPixels: detected.length,
                categories: {
                    social: detected.filter(p => p.category === 'social').length,
                    search: detected.filter(p => p.category === 'search').length,
                    programmatic: detected.filter(p => p.category === 'programmatic').length,
                    native: detected.filter(p => p.category === 'native').length,
                    other: detected.filter(p => p.category === 'other').length,
                },
                trackingImages: trackingImages.length,
                hasConversionAPI,
            };
        });

        const scored = scoreRetargetingSetup(rawData);
        rawData.scores = scored;

        if (verbose) {
            console.log('[RetargetingDetection] Detected:', rawData.pixels.map(p => p.name).join(', ') || 'none');
            console.log('[RetargetingDetection] Categories - Social:', rawData.categories.social, 'Search:', rawData.categories.search);
            console.log('[RetargetingDetection] Score:', scored.overall.score);
        }

        return rawData;

    } catch (error) {
        if (verbose) console.error('[RetargetingDetection] Extraction failed:', error.message);
        return createEmptyRetargeting();
    }
}

/**
 * Score retargeting setup (0-100)
 */
function scoreRetargetingSetup(data, industry = 'general') {
    const scores = {};

    // Pixel presence (40 points)
    let pixelScore = 0;
    if (data.totalPixels >= 3) pixelScore = 40;
    else if (data.totalPixels >= 2) pixelScore = 30;
    else if (data.totalPixels >= 1) pixelScore = 20;
    scores.pixelPresence = { score: pixelScore, detail: `${data.totalPixels} advertising pixel(s) detected` };

    // Platform diversity (30 points)
    const categoriesUsed = Object.values(data.categories).filter(n => n > 0).length;
    let diversityScore = 0;
    if (categoriesUsed >= 3) diversityScore = 30;
    else if (categoriesUsed >= 2) diversityScore = 20;
    else if (categoriesUsed >= 1) diversityScore = 10;
    scores.diversity = { score: diversityScore, detail: `${categoriesUsed} platform categories` };

    // Key platforms (20 points)
    let keyScore = 0;
    const pixelNames = data.pixels.map(p => p.name);
    if (pixelNames.some(n => n.includes('Meta') || n.includes('Facebook'))) keyScore += 7;
    if (pixelNames.some(n => n.includes('Google'))) keyScore += 7;
    if (pixelNames.some(n => n.includes('LinkedIn') || n.includes('Twitter') || n.includes('TikTok'))) keyScore += 6;
    scores.keyPlatforms = { score: Math.min(20, keyScore), detail: pixelNames.slice(0, 5).join(', ') || 'None' };

    // Advanced tracking (10 points)
    let advancedScore = 0;
    if (data.hasConversionAPI) advancedScore += 10;
    scores.advanced = { score: advancedScore, detail: data.hasConversionAPI ? 'Conversion API detected' : 'No server-side tracking' };

    // Overall
    scores.overall = {
        score: scores.pixelPresence.score + scores.diversity.score + scores.keyPlatforms.score + scores.advanced.score,
        detail: `Retargeting setup across ${data.totalPixels} pixels, ${categoriesUsed} categories`,
    };

    return scores;
}

function createEmptyRetargeting() {
    return {
        pixels: [],
        totalPixels: 0,
        categories: { social: 0, search: 0, programmatic: 0, native: 0, other: 0 },
        trackingImages: 0,
        hasConversionAPI: false,
        scores: { overall: { score: 0, detail: 'Retargeting detection failed' } },
    };
}

module.exports = {
    extractRetargetingPixels,
    scoreRetargetingSetup,
};
