/**
 * E-E-A-T Signals (Experience, Expertise, Authority, Trust) — Evidence-Based Utility
 *
 * Extracts E-E-A-T markers from live pages for SEO quality assessment.
 * Google's quality rater guidelines emphasize E-E-A-T especially for YMYL
 * (Your Money Your Life) content like medical, legal, and financial sites.
 *
 * Dimensions:
 * 1. Author detection (bylines, author schema, author pages)
 * 2. Credentials (MD, JD, CPA, PhD, board certifications)
 * 3. Publication dates (published, modified — both meta and visible)
 * 4. Authority links (citations to .edu, .gov, .org, research domains)
 * 5. Contact completeness (phone, email, address, map)
 * 6. Technical SEO (hreflang, sitemap link, pagination)
 * 7. About/Team page links
 *
 * All metrics are deterministic — no AI fabrication.
 */

// YMYL (Your Money Your Life) industries need stronger E-E-A-T
const YMYL_INDUSTRIES = new Set([
    'medical', 'healthcare', 'dental', 'medspa', 'plastic surgery',
    'legal', 'law', 'attorney', 'financial', 'insurance', 'banking',
    'pharmacy', 'mental health', 'veterinary', 'chiropractic',
]);

/**
 * Extract E-E-A-T signals from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} E-E-A-T evidence
 */
async function extractEATSignals(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyEAT();
    }

    try {
        const rawData = await page.evaluate(() => {
            const bodyText = document.body.textContent?.replace(/\s+/g, ' ').trim() || '';

            // --- 1. Author Detection ---
            // Schema.org author
            const ldJsonScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            const schemas = [];
            const authorSchemas = [];
            ldJsonScripts.forEach(s => {
                try {
                    const data = JSON.parse(s.textContent);
                    // Handle arrays
                    const items = Array.isArray(data) ? data : [data];
                    items.forEach(item => {
                        schemas.push(item['@type'] || 'Unknown');
                        if (item.author) {
                            const author = Array.isArray(item.author) ? item.author[0] : item.author;
                            authorSchemas.push({
                                name: typeof author === 'string' ? author : author?.name || 'Unknown',
                                type: author?.['@type'] || 'Text',
                                url: author?.url || null,
                            });
                        }
                        // Check for @graph
                        if (item['@graph'] && Array.isArray(item['@graph'])) {
                            item['@graph'].forEach(subItem => {
                                schemas.push(subItem['@type'] || 'Unknown');
                                if (subItem.author) {
                                    const author = Array.isArray(subItem.author) ? subItem.author[0] : subItem.author;
                                    authorSchemas.push({
                                        name: typeof author === 'string' ? author : author?.name || 'Unknown',
                                        type: author?.['@type'] || 'Text',
                                        url: author?.url || null,
                                    });
                                }
                            });
                        }
                    });
                } catch (e) { /* ignore */ }
            });

            // HTML author elements
            const authorElements = document.querySelectorAll(
                '[rel="author"], [class*="author" i], [itemprop="author"], .byline, [class*="byline" i]'
            );
            const authorNames = Array.from(authorElements)
                .map(el => el.textContent?.trim().substring(0, 100) || '')
                .filter(t => t.length > 2 && t.length < 100);

            // --- 2. Credentials ---
            const credentialPatterns = [
                /\bM\.?D\.?\b/, /\bD\.?O\.?\b/, /\bD\.?D\.?S\.?\b/, /\bD\.?M\.?D\.?\b/,
                /\bJ\.?D\.?\b/, /\bEsq\.?\b/, /\bPh\.?D\.?\b/, /\bD\.?Phil\.?\b/,
                /\bC\.?P\.?A\.?\b/, /\bC\.?F\.?A\.?\b/, /\bC\.?F\.?P\.?\b/,
                /\bR\.?N\.?\b/, /\bN\.?P\.?\b/, /\bP\.?A\.?-?C\.?\b/,
                /\bboard[\s-]*certified\b/i, /\bfellow\s+of\b/i,
                /\bLCSW\b/, /\bLPC\b/, /\bPsy\.?D\.?\b/, /\bMSW\b/,
                /\bDVM\b/, /\bOD\b/, /\bDPM\b/,
            ];
            const foundCredentials = credentialPatterns.filter(p => p.test(bodyText)).length;

            // --- 3. Publication Dates ---
            const publishedMeta = document.querySelector('meta[property="article:published_time"]')?.content || '';
            const modifiedMeta = document.querySelector('meta[property="article:modified_time"]')?.content || '';
            const timeTags = Array.from(document.querySelectorAll('time[datetime]'))
                .map(t => t.getAttribute('datetime'))
                .filter(Boolean)
                .slice(0, 5);

            // --- 4. Authority Links ---
            const links = Array.from(document.querySelectorAll('a[href]'));
            let eduLinks = 0, govLinks = 0, orgLinks = 0, researchLinks = 0;
            const currentHost = window.location.hostname;

            links.forEach(a => {
                const href = a.getAttribute('href') || '';
                if (href.includes(currentHost)) return; // Skip internal links
                if (/\.edu($|\/)/i.test(href)) eduLinks++;
                if (/\.gov($|\/)/i.test(href)) govLinks++;
                if (/\.org($|\/)/i.test(href)) orgLinks++;
                if (/pubmed|scholar\.google|doi\.org|arxiv\.org|researchgate|ncbi\.nlm\.nih|nih\.gov/i.test(href)) researchLinks++;
            });

            // --- 5. Contact Completeness ---
            const hasPhone = /(\+?\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|tel:/i.test(bodyText) ||
                !!document.querySelector('a[href^="tel:"]');
            const hasEmail = /[\w.-]+@[\w.-]+\.\w{2,}/i.test(bodyText) ||
                !!document.querySelector('a[href^="mailto:"]');
            const hasAddress = /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)/i.test(bodyText) ||
                !!document.querySelector('[itemprop="address"], [itemtype*="PostalAddress"]');
            const hasMap = !!document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google"], [class*="map" i]');
            const hasContactPage = !!document.querySelector('a[href*="contact" i]');

            // --- 6. About/Team Page ---
            const hasAboutLink = !!document.querySelector('a[href*="about" i], a[href*="team" i], a[href*="our-story" i], a[href*="who-we-are" i]');
            const hasTeamSection = !!document.querySelector('[class*="team" i], [id*="team" i], [class*="staff" i], [class*="providers" i], [class*="doctors" i]');

            // --- 7. Technical SEO Signals ---
            const hreflangTags = document.querySelectorAll('link[rel="alternate"][hreflang]');
            const sitemapLink = document.querySelector('link[rel="sitemap"]');
            const paginationNext = document.querySelector('link[rel="next"]');
            const paginationPrev = document.querySelector('link[rel="prev"]');
            const ampLink = document.querySelector('link[rel="amphtml"]');

            // Organization schema
            const hasOrgSchema = schemas.some(t => ['Organization', 'LocalBusiness', 'ProfessionalService', 'MedicalOrganization', 'LegalService'].includes(t));

            return {
                author: {
                    schemaAuthors: authorSchemas,
                    htmlAuthors: authorNames.slice(0, 5),
                    hasAuthorSchema: authorSchemas.length > 0,
                    hasVisibleByline: authorNames.length > 0,
                },
                credentials: {
                    count: foundCredentials,
                    detected: foundCredentials > 0,
                },
                dates: {
                    publishedTime: publishedMeta,
                    modifiedTime: modifiedMeta,
                    timeTags,
                    hasDates: !!(publishedMeta || modifiedMeta || timeTags.length > 0),
                },
                authority: {
                    eduLinks, govLinks, orgLinks, researchLinks,
                    totalAuthorityLinks: eduLinks + govLinks + orgLinks + researchLinks,
                },
                contact: {
                    hasPhone, hasEmail, hasAddress, hasMap, hasContactPage,
                    completeness: [hasPhone, hasEmail, hasAddress, hasMap, hasContactPage].filter(Boolean).length,
                },
                about: {
                    hasAboutLink,
                    hasTeamSection,
                },
                technicalSeo: {
                    hreflangCount: hreflangTags.length,
                    hasSitemapLink: !!sitemapLink,
                    hasPagination: !!(paginationNext || paginationPrev),
                    hasAmpLink: !!ampLink,
                    hasOrgSchema,
                },
                schemas: schemas.slice(0, 20),
            };
        });

        const scored = scoreEAT(rawData);
        rawData.scores = scored;

        if (verbose) {
            console.log('[EAT] Authors:', rawData.author.htmlAuthors.length, 'Schema authors:', rawData.author.schemaAuthors.length);
            console.log('[EAT] Credentials:', rawData.credentials.count, 'Authority links:', rawData.authority.totalAuthorityLinks);
            console.log('[EAT] Contact completeness:', rawData.contact.completeness, '/5');
            console.log('[EAT] Overall score:', scored.overall.score);
        }

        return rawData;

    } catch (error) {
        if (verbose) console.error('[EAT] Extraction failed:', error.message);
        return createEmptyEAT();
    }
}

/**
 * Score E-E-A-T evidence (0-100)
 * @param {Object} data
 * @param {string} industry
 */
function scoreEAT(data, industry = 'general') {
    const scores = {};
    const isYMYL = YMYL_INDUSTRIES.has(industry?.toLowerCase());

    // Author/Expertise (25 points)
    let authorScore = 0;
    if (data.author.hasAuthorSchema) authorScore += 12;
    if (data.author.hasVisibleByline) authorScore += 8;
    if (data.credentials.detected) authorScore += 5;
    scores.expertise = { score: Math.min(25, authorScore), detail: `Schema authors: ${data.author.schemaAuthors.length}, bylines: ${data.author.htmlAuthors.length}, credentials: ${data.credentials.count}` };

    // Authority (20 points)
    let authScore = 0;
    if (data.authority.totalAuthorityLinks >= 5) authScore += 15;
    else if (data.authority.totalAuthorityLinks >= 2) authScore += 10;
    else if (data.authority.totalAuthorityLinks >= 1) authScore += 5;
    if (data.technicalSeo.hasOrgSchema) authScore += 5;
    scores.authority = { score: Math.min(20, authScore), detail: `${data.authority.eduLinks} .edu, ${data.authority.govLinks} .gov, ${data.authority.researchLinks} research` };

    // Trust (25 points)
    let trustScore = 0;
    trustScore += Math.min(15, data.contact.completeness * 3);
    if (data.about.hasAboutLink) trustScore += 5;
    if (data.about.hasTeamSection) trustScore += 5;
    scores.trust = { score: Math.min(25, trustScore), detail: `Contact: ${data.contact.completeness}/5, About: ${data.about.hasAboutLink}, Team: ${data.about.hasTeamSection}` };

    // Freshness (15 points)
    let freshnessScore = 0;
    if (data.dates.modifiedTime) freshnessScore += 8;
    else if (data.dates.publishedTime) freshnessScore += 5;
    if (data.dates.timeTags.length > 0) freshnessScore += 4;
    if (data.dates.hasDates) freshnessScore += 3;
    scores.freshness = { score: Math.min(15, freshnessScore), detail: `Published: ${data.dates.publishedTime ? 'yes' : 'no'}, Modified: ${data.dates.modifiedTime ? 'yes' : 'no'}` };

    // Technical SEO (15 points)
    let techScore = 0;
    if (data.technicalSeo.hreflangCount > 0) techScore += 5;
    if (data.technicalSeo.hasSitemapLink) techScore += 3;
    if (data.technicalSeo.hasPagination) techScore += 3;
    if (data.technicalSeo.hasOrgSchema) techScore += 4;
    scores.technicalSeo = { score: Math.min(15, techScore), detail: `Hreflang: ${data.technicalSeo.hreflangCount}, Sitemap link: ${data.technicalSeo.hasSitemapLink}` };

    // Overall
    const rawOverall = scores.expertise.score + scores.authority.score + scores.trust.score + scores.freshness.score + scores.technicalSeo.score;

    // YMYL penalty: if this is a YMYL industry and E-E-A-T is weak, score harder
    const ymylMultiplier = isYMYL && rawOverall < 50 ? 0.8 : 1.0;

    scores.overall = {
        score: Math.round(rawOverall * ymylMultiplier),
        detail: `E-E-A-T across 5 dimensions${isYMYL ? ' (YMYL penalty applied)' : ''}`,
        isYMYL,
    };

    return scores;
}

function createEmptyEAT() {
    return {
        author: { schemaAuthors: [], htmlAuthors: [], hasAuthorSchema: false, hasVisibleByline: false },
        credentials: { count: 0, detected: false },
        dates: { publishedTime: '', modifiedTime: '', timeTags: [], hasDates: false },
        authority: { eduLinks: 0, govLinks: 0, orgLinks: 0, researchLinks: 0, totalAuthorityLinks: 0 },
        contact: { hasPhone: false, hasEmail: false, hasAddress: false, hasMap: false, hasContactPage: false, completeness: 0 },
        about: { hasAboutLink: false, hasTeamSection: false },
        technicalSeo: { hreflangCount: 0, hasSitemapLink: false, hasPagination: false, hasAmpLink: false, hasOrgSchema: false },
        schemas: [],
        scores: { overall: { score: 0, detail: 'E-E-A-T extraction failed' } },
    };
}

module.exports = {
    extractEATSignals,
    scoreEAT,
    YMYL_INDUSTRIES,
};
