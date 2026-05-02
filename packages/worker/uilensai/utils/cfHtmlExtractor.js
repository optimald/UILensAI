/**
 * HTML-Based Signal Extractor (No Browser Required)
 *
 * Produces the same `sharedPageContext` object that `analyze/index.js`
 * extracts via `page.evaluate()`, but from raw HTML using cheerio.
 *
 * Used in --no-browser mode when Cloudflare /crawl provides HTML
 * instead of a live Playwright page.
 */

const cheerio = require('cheerio');

/**
 * Extract sharedPageContext from raw HTML string.
 * Output format mirrors analyze/index.js lines 171-275 exactly.
 *
 * @param {string} html - Full page HTML
 * @param {string} pageUrl - The URL of the page (for resolving relative links)
 * @returns {Object} sharedPageContext compatible with all 9 analysis modules
 */
function extractSharedContextFromHtml(html, pageUrl = '') {
    if (!html || typeof html !== 'string') {
        return null;
    }

    const $ = cheerio.load(html);
    let hostname = '';
    try {
        hostname = new URL(pageUrl).hostname;
    } catch { /* ignore invalid URLs */ }

    // --- Metadata ---
    const title = $('title').first().text() || '';
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
    const htmlLang = $('html').attr('lang') || '';
    const viewportMeta = $('meta[name="viewport"]').attr('content') || '';

    // --- Open Graph ---
    const ogData = {
        title: $('meta[property="og:title"]').attr('content') || '',
        description: $('meta[property="og:description"]').attr('content') || '',
        image: $('meta[property="og:image"]').attr('content') || '',
    };

    // --- Headings ---
    const headings = {
        h1: $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 5),
        h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10),
        h3Count: $('h3').length,
    };

    // --- Links ---
    const allLinks = $('a[href]');
    let internalCount = 0;
    let externalCount = 0;
    allLinks.each((_, el) => {
        const href = $(el).attr('href') || '';
        try {
            const linkHost = new URL(href, pageUrl).hostname;
            if (linkHost === hostname) internalCount++;
            else externalCount++;
        } catch {
            internalCount++; // relative links are internal
        }
    });
    const links = {
        internal: internalCount,
        external: externalCount,
        total: allLinks.length,
    };

    // --- Forms ---
    const forms = $('form').map((_, el) => {
        const $form = $(el);
        return {
            action: $form.attr('action') || '',
            method: ($form.attr('method') || 'get').toLowerCase(),
            inputCount: $form.find('input, textarea, select').length,
            hasPassword: $form.find('input[type="password"]').length > 0,
        };
    }).get().slice(0, 10);

    // --- Resources ---
    const resources = {
        scriptCount: $('script').length,
        stylesheetCount: $('link[rel="stylesheet"]').length,
    };

    // --- Body Text ---
    const bodyText = ($('body').text() || '').replace(/\s+/g, ' ').trim().substring(0, 5000);

    // --- Images ---
    const allImages = $('img');
    const images = {
        total: allImages.length,
        withAlt: $('img[alt]').filter((_, el) => ($(el).attr('alt') || '').trim().length > 0).length,
        withEmptyAlt: $('img[alt=""]').length,
        withoutAlt: allImages.filter((_, el) => !$(el).attr('alt') && $(el).attr('alt') !== '').length,
        samples: allImages.slice(0, 5).map((_, el) => ({
            src: ($(el).attr('src') || '').substring(0, 80),
            alt: $(el).attr('alt') || null,
            hasAlt: $(el).attr('alt') !== undefined,
        })).get(),
    };

    // --- ARIA & Accessibility ---
    const ariaSelector = '[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [aria-expanded], [aria-haspopup], [aria-live]';
    const ariaElementsList = $(ariaSelector);
    const ariaRolesSet = new Set();
    ariaElementsList.each((_, el) => {
        const role = $(el).attr('role');
        if (role) ariaRolesSet.add(role);
    });
    const ariaElements = ariaElementsList.length;
    const ariaRoles = Array.from(ariaRolesSet).slice(0, 10);
    const landmarkCount = $('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"], [role="search"], header, nav, main, footer, aside').length;

    // --- Form Accessibility ---
    const formLabels = {
        totalInputs: $('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), textarea, select').length,
        withExplicitLabel: 0,
        withAriaLabel: 0,
        withoutLabel: 0,
    };
    $('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), textarea, select').each((_, el) => {
        const $el = $(el);
        const id = $el.attr('id');
        const hasExplicitLabel = id && $(`label[for="${id}"]`).length > 0;
        const hasAriaLabel = $el.attr('aria-label') || $el.attr('aria-labelledby');
        const hasWrappingLabel = $el.closest('label').length > 0;
        if (hasExplicitLabel || hasWrappingLabel) formLabels.withExplicitLabel++;
        else if (hasAriaLabel) formLabels.withAriaLabel++;
        else formLabels.withoutLabel++;
    });

    // --- Social Media ---
    const socialPlatforms = new Set();
    const socialLinks = [];
    let sharingButtonsDetected = false;
    const sharingKeywords = ['facebook.com/sharer', 'twitter.com/intent/tweet', 'x.com/intent/', 'linkedin.com/shareArticle', 'pinterest.com/pin/create'];

    allLinks.each((_, el) => {
        const href = ($(el).attr('href') || '').toLowerCase();
        if (!href || href === '#' || href.startsWith('javascript:')) return;

        if ((href.includes('facebook.com/') || href.includes('fb.com/')) && !href.includes('sharer') && !href.includes('/dialog/')) { socialPlatforms.add('Facebook'); socialLinks.push(href); }
        if ((href.includes('twitter.com/') || href.includes('x.com/')) && !href.includes('intent/tweet') && !href.includes('/intent/')) { socialPlatforms.add('Twitter/X'); socialLinks.push(href); }
        if (href.includes('linkedin.com/')) { socialPlatforms.add('LinkedIn'); socialLinks.push(href); }
        if (href.includes('instagram.com/')) { socialPlatforms.add('Instagram'); socialLinks.push(href); }
        if (href.includes('youtube.com/') || href.includes('youtu.be/')) { socialPlatforms.add('YouTube'); socialLinks.push(href); }
        if (href.includes('pinterest.com/') && !href.includes('pin/create')) { socialPlatforms.add('Pinterest'); socialLinks.push(href); }
        if (href.includes('tiktok.com/')) { socialPlatforms.add('TikTok'); socialLinks.push(href); }
        if (href.includes('yelp.com/biz/')) { socialPlatforms.add('Yelp'); socialLinks.push(href); }
        if (href.includes('bbb.org/')) { socialPlatforms.add('BBB'); socialLinks.push(href); }
        if (href.includes('nextdoor.com/')) { socialPlatforms.add('Nextdoor'); socialLinks.push(href); }
        if (href.includes('houzz.com/')) { socialPlatforms.add('Houzz'); socialLinks.push(href); }
        if (href.includes('realself.com/')) { socialPlatforms.add('RealSelf'); socialLinks.push(href); }
        if (href.includes('google.com/maps') || href.includes('maps.google.com') || href.includes('g.page/')) { socialPlatforms.add('Google Business'); socialLinks.push(href); }
        if (!sharingButtonsDetected && sharingKeywords.some(k => href.includes(k))) { sharingButtonsDetected = true; }
    });

    // Fallback: icon classes
    if (socialPlatforms.size === 0) {
        $('a[href], [role="link"]').each((_, el) => {
            const combined = (($(el).attr('class') || '') + ' ' + ($(el).attr('aria-label') || '') + ' ' + ($(el).attr('title') || '')).toLowerCase();
            if (combined.includes('facebook') || combined.includes('fa-facebook')) socialPlatforms.add('Facebook');
            if (combined.includes('twitter') || combined.includes('fa-twitter') || combined.includes('fa-x-twitter')) socialPlatforms.add('Twitter/X');
            if (combined.includes('instagram') || combined.includes('fa-instagram')) socialPlatforms.add('Instagram');
            if (combined.includes('linkedin') || combined.includes('fa-linkedin')) socialPlatforms.add('LinkedIn');
            if (combined.includes('youtube') || combined.includes('fa-youtube')) socialPlatforms.add('YouTube');
            if (combined.includes('tiktok') || combined.includes('fa-tiktok')) socialPlatforms.add('TikTok');
        });
    }

    const ogTagsPresent = $('meta[property^="og:"]').length > 0;
    const twitterCardPresent = $('meta[name^="twitter:"]').length > 0;

    return {
        title, metaDescription, metaKeywords, canonicalUrl, htmlLang, viewportMeta,
        ogData, headings, links, forms, formLabels, resources, bodyText, images,
        ariaElements, ariaRoles, landmarkCount,
        url: pageUrl,
        socialMedia: {
            linkedPlatforms: Array.from(socialPlatforms).slice(0, 15),
            sharingButtonsDetected,
            ogTagsPresent,
            twitterCardPresent,
            socialLinksCount: socialLinks.length,
        },
        // Mark the source so modules know this is from HTML parsing, not a live page
        _source: 'html-extractor',
    };
}

/**
 * Extract E-E-A-T signals from raw HTML.
 * Mirrors eat-signals.js extractEATSignals(page) output format.
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} E-E-A-T evidence (same structure as extractEATSignals)
 */
function extractEATSignalsFromHtml(html, verbose = false) {
    if (!html) {
        return createEmptyEAT();
    }

    try {
        const $ = cheerio.load(html);
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // --- 1. Author Detection (Schema.org) ---
        const authorSchemas = [];
        const schemas = [];
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html());
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
                    if (item['@graph'] && Array.isArray(item['@graph'])) {
                        item['@graph'].forEach(sub => {
                            schemas.push(sub['@type'] || 'Unknown');
                            if (sub.author) {
                                const author = Array.isArray(sub.author) ? sub.author[0] : sub.author;
                                authorSchemas.push({
                                    name: typeof author === 'string' ? author : author?.name || 'Unknown',
                                    type: author?.['@type'] || 'Text',
                                    url: author?.url || null,
                                });
                            }
                        });
                    }
                });
            } catch { /* ignore */ }
        });

        // HTML author elements
        const authorNames = $('[rel="author"], [class*="author"], [itemprop="author"], .byline, [class*="byline"]')
            .map((_, el) => $(el).text().trim().substring(0, 100))
            .get()
            .filter(t => t.length > 2 && t.length < 100)
            .slice(0, 5);

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
        const publishedMeta = $('meta[property="article:published_time"]').attr('content') || '';
        const modifiedMeta = $('meta[property="article:modified_time"]').attr('content') || '';
        const timeTags = $('time[datetime]').map((_, el) => $(el).attr('datetime')).get().filter(Boolean).slice(0, 5);

        // --- 4. Authority Links ---
        let eduLinks = 0, govLinks = 0, orgLinks = 0, researchLinks = 0;
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (/\.edu($|\/)/i.test(href)) eduLinks++;
            if (/\.gov($|\/)/i.test(href)) govLinks++;
            if (/\.org($|\/)/i.test(href)) orgLinks++;
            if (/pubmed|scholar\.google|doi\.org|arxiv\.org|researchgate|ncbi\.nlm\.nih|nih\.gov/i.test(href)) researchLinks++;
        });

        // --- 5. Contact Completeness ---
        const hasPhone = /(\+?\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|tel:/i.test(bodyText) ||
            $('a[href^="tel:"]').length > 0;
        const hasEmail = /[\w.-]+@[\w.-]+\.\w{2,}/i.test(bodyText) ||
            $('a[href^="mailto:"]').length > 0;
        const hasAddress = /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)/i.test(bodyText) ||
            $('[itemprop="address"], [itemtype*="PostalAddress"]').length > 0;
        const hasMap = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"], [class*="map"]').length > 0;
        const hasContactPage = $('a[href*="contact"]').length > 0;

        // --- 6. About/Team Page ---
        const hasAboutLink = $('a[href*="about"], a[href*="team"], a[href*="our-story"], a[href*="who-we-are"]').length > 0;
        const hasTeamSection = $('[class*="team"], [id*="team"], [class*="staff"], [class*="providers"], [class*="doctors"]').length > 0;

        // --- 7. Technical SEO ---
        const hasOrgSchema = schemas.some(t => ['Organization', 'LocalBusiness', 'ProfessionalService', 'MedicalOrganization', 'LegalService'].includes(t));

        const rawData = {
            author: {
                schemaAuthors: authorSchemas,
                htmlAuthors: authorNames,
                hasAuthorSchema: authorSchemas.length > 0,
                hasVisibleByline: authorNames.length > 0,
            },
            credentials: { count: foundCredentials, detected: foundCredentials > 0 },
            dates: { publishedTime: publishedMeta, modifiedTime: modifiedMeta, timeTags, hasDates: !!(publishedMeta || modifiedMeta || timeTags.length > 0) },
            authority: { eduLinks, govLinks, orgLinks, researchLinks, totalAuthorityLinks: eduLinks + govLinks + orgLinks + researchLinks },
            contact: { hasPhone, hasEmail, hasAddress, hasMap, hasContactPage, completeness: [hasPhone, hasEmail, hasAddress, hasMap, hasContactPage].filter(Boolean).length },
            about: { hasAboutLink, hasTeamSection },
            technicalSeo: {
                hreflangCount: $('link[rel="alternate"][hreflang]').length,
                hasSitemapLink: $('link[rel="sitemap"]').length > 0,
                hasPagination: $('link[rel="next"], link[rel="prev"]').length > 0,
                hasAmpLink: $('link[rel="amphtml"]').length > 0,
                hasOrgSchema,
            },
            schemas: schemas.slice(0, 20),
        };

        // Import scoring from eat-signals.js
        const { scoreEAT } = require('./eat-signals');
        rawData.scores = scoreEAT(rawData);

        if (verbose) {
            console.log('[EAT-HTML] Authors:', rawData.author.htmlAuthors.length, 'Schema:', rawData.author.schemaAuthors.length);
            console.log('[EAT-HTML] Credentials:', rawData.credentials.count, 'Authority:', rawData.authority.totalAuthorityLinks);
            console.log('[EAT-HTML] Contact:', rawData.contact.completeness, '/5');
            console.log('[EAT-HTML] Score:', rawData.scores.overall.score);
        }

        return rawData;
    } catch (error) {
        if (verbose) console.error('[EAT-HTML] Extraction failed:', error.message);
        return createEmptyEAT();
    }
}

/**
 * Extract lead capture signals from raw HTML.
 * Mirrors lead-capture.js extractLeadCaptureSignals(page) output format.
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} Lead capture evidence
 */
function extractLeadCaptureFromHtml(html, verbose = false) {
    if (!html) {
        return createEmptyLeadCapture();
    }

    try {
        const $ = cheerio.load(html);
        const allScriptText = $('script').map((_, el) => ($(el).attr('src') || '') + ' ' + ($(el).html() || '').substring(0, 500)).get().join(' ').toLowerCase();

        // --- 1. Email Capture Forms ---
        const emailForms = [];
        $('input[type="email"], input[name*="email"], input[placeholder*="email"]').each((_, input) => {
            const $input = $(input);
            const $form = $input.closest('form');
            const isLoginForm = $form.length > 0 && (
                $form.find('input[type="password"]').length > 0 ||
                ($form.attr('action') || '').includes('login') ||
                ($form.attr('action') || '').includes('signin') ||
                ($form.attr('id') || '').toLowerCase().includes('login') ||
                ($form.attr('class') || '').toLowerCase().includes('login')
            );

            if (!isLoginForm) {
                const nearbyText = $form.length > 0 ? $form.text().trim().substring(0, 200) : '';
                emailForms.push({
                    type: /newsletter|subscribe|updates|weekly|digest/i.test(nearbyText) ? 'newsletter' :
                        /download|ebook|guide|whitepaper|checklist|free/i.test(nearbyText) ? 'lead-magnet' :
                            /consult|appointment|quote|estimate|contact/i.test(nearbyText) ? 'consultation' : 'generic-capture',
                    placeholder: ($input.attr('placeholder') || $input.attr('aria-label') || '').substring(0, 80),
                    context: nearbyText.substring(0, 150),
                    hasNameField: $form.find('input[name*="name"], input[placeholder*="name"]').length > 0,
                    hasPhoneField: $form.find('input[type="tel"], input[name*="phone"]').length > 0,
                    fieldCount: $form.find('input:not([type="hidden"]):not([type="submit"]), select, textarea').length || 1,
                });
            }
        });

        // --- 2. ESP Detection ---
        const espPatterns = [
            { name: 'Mailchimp', pattern: /mailchimp\.com|list-manage\.com|chimpstatic\.com|mc\.us\d+\.list-manage/i },
            { name: 'Klaviyo', pattern: /klaviyo\.com/i },
            { name: 'HubSpot', pattern: /hubspot\.com|hs-scripts\.com|hsforms\.com|hbspt\.forms/i },
            { name: 'ActiveCampaign', pattern: /activecampaign\.com|trackcmp\.net/i },
            { name: 'ConvertKit', pattern: /convertkit\.com|ck\.page/i },
            { name: 'Constant Contact', pattern: /constantcontact\.com|ctctcdn\.com/i },
            { name: 'Drip', pattern: /getdrip\.com|drip\.com/i },
            { name: 'Sendinblue/Brevo', pattern: /sendinblue\.com|brevo\.com|sibforms\.com/i },
            { name: 'AWeber', pattern: /aweber\.com/i },
            { name: 'GetResponse', pattern: /getresponse\.com/i },
            { name: 'MailerLite', pattern: /mailerlite\.com/i },
            { name: 'Campaign Monitor', pattern: /campaignmonitor\.com|createsend\.com/i },
            { name: 'Omnisend', pattern: /omnisend\.com/i },
            { name: 'Flodesk', pattern: /flodesk\.com/i },
        ];
        const detectedESPs = espPatterns.filter(esp => esp.pattern.test(allScriptText)).map(esp => esp.name);
        const allHrefs = $('a[href], form[action]').map((_, el) => $(el).attr('href') || $(el).attr('action') || '').get().join(' ');
        espPatterns.forEach(esp => {
            if (esp.pattern.test(allHrefs) && !detectedESPs.includes(esp.name)) detectedESPs.push(esp.name);
        });

        // --- 3. Lead Magnet ---
        const bodyText = $('body').text().toLowerCase();
        const hasLeadMagnet = [
            /download\s+(your\s+)?(free|our)\s+(guide|ebook|whitepaper|checklist|template|toolkit|report|pdf)/i,
            /free\s+(guide|ebook|whitepaper|checklist|template|toolkit|report|pdf|download)/i,
            /get\s+(your\s+)?(free|the)\s+(guide|ebook|report|checklist|template)/i,
        ].some(p => p.test(bodyText));

        // --- 4. Popup/Overlay ---
        const popupCount = $('[class*="popup"]:not([style*="display: none"]), [class*="modal"]:not([style*="display: none"]), [class*="overlay"]:not(nav *), [class*="lightbox"], [class*="slide-in"], [class*="sticky-bar"]').length;
        const hasExitIntent = allScriptText.includes('exit-intent') || allScriptText.includes('exitintent') ||
            allScriptText.includes('mouseleave') || allScriptText.includes('ouibounce') || allScriptText.includes('optinmonster');

        // --- 5. Chat Widgets ---
        const chatPatterns = [
            { name: 'Intercom', pattern: /intercom\.com|intercomcdn\.com/i },
            { name: 'Drift', pattern: /drift\.com|js\.driftt\.com/i },
            { name: 'LiveChat', pattern: /livechatinc\.com/i },
            { name: 'Tidio', pattern: /tidio\.co/i },
            { name: 'Zendesk', pattern: /zendesk\.com|zopim\.com|zdassets\.com/i },
            { name: 'Crisp', pattern: /crisp\.chat/i },
            { name: 'Freshchat', pattern: /freshchat/i },
            { name: 'Tawk.to', pattern: /tawk\.to/i },
            { name: 'Olark', pattern: /olark\.com/i },
            { name: 'HubSpot Chat', pattern: /hubspot\.com.*messages|usemessages\.com/i },
            { name: 'Podium', pattern: /podium\.com|webchat\.podium/i },
            { name: 'Birdeye', pattern: /birdeye\.com/i },
            { name: 'Weave', pattern: /getweave\.com/i },
        ];
        const detectedChat = chatPatterns.filter(c => c.pattern.test(allScriptText)).map(c => c.name);

        // --- 6. CRM ---
        const crmPatterns = [
            { name: 'HubSpot CRM', pattern: /hubspot\.com|hs-scripts\.com|hbspt/i },
            { name: 'Salesforce', pattern: /salesforce\.com|force\.com|pardot\.com/i },
            { name: 'Marketo', pattern: /marketo\.(com|net)|mktoresp\.com|mktoForms/i },
            { name: 'Pipedrive', pattern: /pipedrive\.com|leadbooster/i },
            { name: 'Zoho', pattern: /zoho\.com|zsalesiq/i },
        ];
        const detectedCRM = crmPatterns.filter(c => c.pattern.test(allScriptText)).map(c => c.name);

        const rawData = {
            emailForms,
            emailServiceProviders: detectedESPs,
            leadMagnet: { detected: hasLeadMagnet },
            popups: { count: popupCount, hasExitIntent },
            chatWidgets: detectedChat,
            crmTools: detectedCRM,
        };

        const { scoreLeadCapture } = require('./lead-capture');
        rawData.scores = scoreLeadCapture(rawData);

        if (verbose) {
            console.log('[LeadCapture-HTML] Forms:', rawData.emailForms.length, 'ESPs:', rawData.emailServiceProviders.join(', ') || 'none');
            console.log('[LeadCapture-HTML] Chat:', rawData.chatWidgets.join(', ') || 'none');
            console.log('[LeadCapture-HTML] Score:', rawData.scores.overall.score);
        }

        return rawData;
    } catch (error) {
        if (verbose) console.error('[LeadCapture-HTML] Failed:', error.message);
        return createEmptyLeadCapture();
    }
}

// Empty state helpers (match original module outputs)
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

function createEmptyLeadCapture() {
    return {
        emailForms: [],
        emailServiceProviders: [],
        leadMagnet: { detected: false },
        popups: { count: 0, hasExitIntent: false },
        chatWidgets: [],
        crmTools: [],
        scores: { overall: { score: 0, detail: 'Lead capture extraction failed' } },
    };
}

/**
 * Extract CTA context from raw HTML.
 * Mirrors conversion.js getCtaContext(page) output format.
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} CTA context (same structure as getCtaContext)
 */
function extractCTAContextFromHtml(html, verbose = false) {
    if (!html) {
        return { ctaTexts: [], ctaCount: 0, primaryCtaText: null, aboveFoldCtaCount: 0, ctaElements: [] };
    }

    try {
        const $ = cheerio.load(html);

        // CTA selectors matching conversion.js lines 99-115
        const ctaSelectors = [
            'button', 'a.btn', 'a.button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
            '[class*="cta"]', '[class*="btn-primary"]', '[class*="btn-action"]', '[class*="btn-main"]',
            'a[href^="tel:"]', 'a[href^="sms:"]', 'a[href*="booking"]', 'a[href*="appointment"]',
            'a[href*="schedule"]', 'a[href*="consultation"]', 'a[href*="quote"]', 'a[href*="contact"]',
            'a[href*="get-started"]', 'a[href*="sign-up"]', 'a[href*="register"]', 'a[href*="demo"]',
        ];

        const ctaTexts = [];
        const ctaElements = [];
        const seen = new Set();

        $(ctaSelectors.join(', ')).each((_, el) => {
            const $el = $(el);
            const text = ($el.text() || $el.attr('value') || $el.attr('aria-label') || '').trim();
            if (!text || text.length > 80 || text.length < 2) return;
            if (seen.has(text.toLowerCase())) return;
            seen.add(text.toLowerCase());
            ctaTexts.push(text);
            ctaElements.push({
                text,
                tag: el.tagName?.toLowerCase() || 'unknown',
                href: $el.attr('href') || '',
                classes: ($el.attr('class') || '').substring(0, 100),
            });
        });

        // Identify primary CTA (first prominent CTA with action-oriented text)
        const actionPatterns = /^(get|book|schedule|call|start|buy|order|shop|subscribe|sign|register|request|download|claim|try|join|apply|contact|learn|find|explore|view)/i;
        const primaryCta = ctaElements.find(c => actionPatterns.test(c.text)) || ctaElements[0] || null;

        if (verbose) {
            console.log(`[CTA-HTML] Found ${ctaTexts.length} CTAs, primary: "${primaryCta?.text || 'none'}"`);
        }

        return {
            ctaTexts: ctaTexts.slice(0, 20),
            ctaCount: ctaTexts.length,
            primaryCtaText: primaryCta?.text || null,
            aboveFoldCtaCount: Math.min(ctaTexts.length, 3), // Estimate: first 3 likely above fold
            ctaElements: ctaElements.slice(0, 20),
        };
    } catch (error) {
        if (verbose) console.error('[CTA-HTML] Extraction failed:', error.message);
        return { ctaTexts: [], ctaCount: 0, primaryCtaText: null, aboveFoldCtaCount: 0, ctaElements: [] };
    }
}

/**
 * Extract trust signals from raw HTML.
 * Mirrors conversion.js getTrustSignalContext(page) output format.
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} Trust signal context
 */
function extractTrustSignalsFromHtml(html, verbose = false) {
    if (!html) {
        return { detectedSignals: [], trustSignalCount: 0 };
    }

    try {
        const $ = cheerio.load(html);
        const bodyText = ($('body').text() || '').toLowerCase();
        const allHtml = html.toLowerCase();
        const signals = [];

        // Trust badges / certifications
        if (/ssl|https|secure|encrypted/i.test(allHtml)) signals.push('SSL/Secure');
        if (/bbb|better\s+business/i.test(bodyText)) signals.push('BBB Accredited');
        if (/hipaa/i.test(bodyText)) signals.push('HIPAA Compliant');
        if (/gdpr/i.test(bodyText)) signals.push('GDPR Compliant');
        if (/pci[\s-]?dss|pci\s+compliant/i.test(bodyText)) signals.push('PCI DSS');
        if (/soc\s*2|soc\s*ii/i.test(bodyText)) signals.push('SOC 2');
        if (/iso\s*27001/i.test(bodyText)) signals.push('ISO 27001');

        // Social proof
        if (/testimonial|review|rating|\bstar(s)?\b.*\d/i.test(bodyText)) signals.push('Testimonials/Reviews');
        if (/\d+\+?\s*(customer|client|patient|user|member|happy|satisfied)/i.test(bodyText)) signals.push('Customer Count');
        if (/case\s+stud(y|ies)/i.test(bodyText)) signals.push('Case Studies');
        if (/as\s+seen\s+(on|in)|featured\s+(in|on|by)/i.test(bodyText)) signals.push('Media Mentions');

        // Guarantees
        if (/money[\s-]?back|refund|guarantee/i.test(bodyText)) signals.push('Money-Back Guarantee');
        if (/free\s+(trial|consultation|estimate|quote|assessment)/i.test(bodyText)) signals.push('Free Trial/Consultation');
        if (/warranty|warranted/i.test(bodyText)) signals.push('Warranty');

        // Professional credentials
        if (/licensed|board[\s-]?certified|accredited|certified/i.test(bodyText)) signals.push('Professional Credentials');
        if (/years?\s+(of\s+)?experience|since\s+\d{4}/i.test(bodyText)) signals.push('Years of Experience');
        if (/award|recognized|top\s+rated/i.test(bodyText)) signals.push('Awards/Recognition');

        // Payment trust
        if (/visa|mastercard|amex|paypal|stripe|payment|credit\s+card/i.test(allHtml)) signals.push('Payment Options');
        if (/financing|payment\s+plan|care\s*credit/i.test(bodyText)) signals.push('Financing Available');
        if (/insurance\s+(accepted|welcome|provider)/i.test(bodyText)) signals.push('Insurance Accepted');

        // Privacy
        if ($('a[href*="privacy"]').length > 0) signals.push('Privacy Policy');
        if ($('a[href*="terms"]').length > 0) signals.push('Terms of Service');

        if (verbose) {
            console.log(`[Trust-HTML] Found ${signals.length} trust signals: ${signals.join(', ')}`);
        }

        return {
            detectedSignals: signals,
            trustSignalCount: signals.length,
        };
    } catch (error) {
        if (verbose) console.error('[Trust-HTML] Extraction failed:', error.message);
        return { detectedSignals: [], trustSignalCount: 0 };
    }
}

/**
 * Discover unique CSS selectors from raw HTML using cheerio.
 * Cheerio-based port of dom-analyzer.js discoverUniqueSelectors().
 * 
 * Returns same shape as the Playwright version:
 *   { navigation: [], headers: [], cta: [], forms: [], content: [], images: [], unique: [] }
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} Discovered selectors by category
 */
function discoverSelectorsFromHtml(html, verbose = false) {
    const emptyResult = { navigation: [], headers: [], cta: [], forms: [], content: [], images: [], unique: [] };
    if (!html || typeof html !== 'string') return emptyResult;

    try {
        const $ = cheerio.load(html);

        /**
         * Generate an ultra-specific CSS selector for a cheerio element.
         * Mirrors dom-analyzer.js getUltraSpecificSelector().
         */
        function getUltraSpecificSelector(el) {
            const $el = $(el);
            const tag = (el.tagName || el.name || '').toLowerCase();
            if (!tag || tag === 'html' || tag === 'body') return null;

            // Priority 1: ID
            const id = $el.attr('id');
            if (id && /^[a-zA-Z]/.test(id)) return `#${id}`;

            // Priority 2: data attributes
            const attrs = el.attribs || {};
            const dataAttr = Object.keys(attrs).find(a => a.startsWith('data-') && attrs[a]);
            if (dataAttr) return `${tag}[${dataAttr}="${attrs[dataAttr]}"]`;

            // Priority 3: class combinations (use first 3 classes for specificity)
            const className = $el.attr('class') || '';
            if (className.trim()) {
                const classes = className.trim().split(/\s+/).filter(Boolean);
                if (classes.length > 0) {
                    // Use up to 3 most specific classes
                    const specificClasses = classes.slice(0, 3);
                    const classSelector = specificClasses.map(c => `.${c}`).join('');

                    // Add nth-child if sibling disambiguation needed
                    const parent = $el.parent();
                    const sameTagSiblings = parent.children(tag);
                    if (sameTagSiblings.length > 1) {
                        const index = sameTagSiblings.index(el) + 1;
                        return `${tag}${classSelector}:nth-child(${index})`;
                    }
                    return `${tag}${classSelector}`;
                }
            }

            // Priority 4: structural positioning with parent context
            const parent = $el.parent();
            if (parent.length > 0) {
                const parentTag = (parent[0].tagName || parent[0].name || '').toLowerCase();
                if (parentTag && parentTag !== 'html' && parentTag !== 'body') {
                    const parentId = parent.attr('id');
                    let parentSelector = parentTag;
                    if (parentId) {
                        parentSelector = `#${parentId}`;
                    } else {
                        const parentClass = (parent.attr('class') || '').trim().split(/\s+/)[0];
                        if (parentClass) parentSelector = `${parentTag}.${parentClass}`;
                    }
                    const siblings = parent.children();
                    const index = siblings.index(el) + 1;
                    if (siblings.length === 1) {
                        return `${parentSelector} > ${tag}`;
                    }
                    return `${parentSelector} > ${tag}:nth-child(${index})`;
                }
            }

            return null; // Skip generic tag-only selectors
        }

        const discovered = { navigation: [], headers: [], cta: [], forms: [], content: [], images: [], unique: [] };

        const categoryQueries = {
            navigation: [
                'nav', '[role="navigation"]', '.nav', '.navbar', '.navigation',
                '.header-nav', '.main-nav', '.primary-nav', '.site-nav',
                '.menu', '.main-menu', '#main-menu', '.header-menu',
                'ul.nav', '[aria-label*="nav"]'
            ],
            headers: [
                'h1', 'h2', 'h3', 'header', '.header',
                '.site-header', '.page-header', '.hero-title', '.main-title',
                '.logo', '.site-logo', '#logo', '[class*="logo"]',
                '.brand', '.site-brand', '.hero-heading', '.page-title'
            ],
            cta: [
                'button', '.btn', '.button', 'a[class*="btn"]', '.cta',
                '.call-to-action', '.primary-btn', '.secondary-btn',
                'input[type="submit"]', '[role="button"]', '.action-btn',
                '.contact-btn', '.book-btn', '.schedule-btn', '.get-started',
                '.learn-more', '.download', '.signup', '.register'
            ],
            forms: [
                'form', 'input', 'textarea', 'select', '.form', '.contact-form',
                '.newsletter', '.signup-form', '.login-form', '.search-form',
                '[role="form"]', '.form-group', '.input-group'
            ],
            content: [
                'main', 'article', 'section', '.content', '.main-content',
                '.page-content', '.post-content', '.entry-content',
                '.description', '.summary', '.excerpt', '.intro',
                '.text-content', '.content-block'
            ],
            images: [
                'img', 'picture', '.image', '.photo', '.gallery-item',
                '.hero-image', '.featured-image', '.product-image',
                'figure', '.media', '.visual', '[role="img"]'
            ],
            unique: [
                '.modal', '.popup', '.overlay', '.dropdown', '.accordion',
                '.carousel', '.slider', '.tabs', '.toggle', '.collapse',
                '[data-toggle]', '[data-modal]', '[data-target]',
                '.interactive', '.widget', '.component'
            ]
        };

        for (const [category, selectors] of Object.entries(categoryQueries)) {
            for (const sel of selectors) {
                try {
                    $(sel).each((_, el) => {
                        const specificSelector = getUltraSpecificSelector(el);
                        if (specificSelector && !discovered[category].includes(specificSelector)) {
                            discovered[category].push(specificSelector);
                        }
                    });
                } catch { /* ignore invalid selectors */ }
            }
            // Deduplicate, sort by specificity (longer = more specific), limit
            discovered[category] = [...new Set(discovered[category])]
                .sort((a, b) => b.length - a.length)
                .slice(0, 15);
        }

        if (verbose) {
            const total = Object.values(discovered).reduce((s, arr) => s + arr.length, 0);
            console.log(`[CfHtmlExtractor] 🔍 Discovered ${total} selectors from HTML`);
            for (const [cat, sels] of Object.entries(discovered)) {
                if (sels.length > 0) console.log(`[CfHtmlExtractor]   ${cat}: ${sels.length} (sample: ${sels.slice(0, 2).join(', ')})`);
            }
        }

        return discovered;
    } catch (error) {
        if (verbose) console.error('[CfHtmlExtractor] Selector discovery failed:', error.message);
        return emptyResult;
    }
}

/**
 * Build deterministic visual evidence from HTML for each UI category.
 * This replaces AI-generated visualEvidence entirely — selectors and descriptions
 * are built from actual DOM properties, not AI hallucination.
 *
 * Returns: { branding: [{elementSelector, description}], responsiveness: [...], ... }
 * for all 10 UI categories.
 *
 * @param {string} html - Full page HTML
 * @param {boolean} verbose
 * @returns {Object} Per-category visualEvidence arrays
 */
function buildDeterministicVisualEvidence(html, verbose = false) {
    const emptyResult = {};
    const categories = ['branding', 'responsiveness', 'hierarchy', 'consistency',
        'aesthetics', 'aboveTheFold', 'contentFlow', 'visualDesign', 'usability', 'accessibility'];
    categories.forEach(c => emptyResult[c] = []);

    if (!html || typeof html !== 'string') return emptyResult;

    try {
        const $ = cheerio.load(html);

        /** Build a specific CSS selector for a cheerio element (mirrors discoverSelectorsFromHtml logic) */
        function selectorFor(el) {
            const $el = $(el);
            const tag = (el.tagName || el.name || '').toLowerCase();
            if (!tag || tag === 'html' || tag === 'body') return null;

            const id = $el.attr('id');
            if (id && /^[a-zA-Z]/.test(id)) return `#${id}`;

            const attrs = el.attribs || {};
            const dataAttr = Object.keys(attrs).find(a => a.startsWith('data-') && attrs[a]);
            if (dataAttr) return `${tag}[${dataAttr}="${attrs[dataAttr]}"]`;

            const className = ($el.attr('class') || '').trim();
            if (className) {
                const classes = className.split(/\s+/).filter(Boolean).slice(0, 3);
                if (classes.length > 0) {
                    return `${tag}.${classes.join('.')}`;
                }
            }

            // Structural fallback with parent context
            const parent = $el.parent();
            if (parent.length > 0) {
                const parentTag = (parent[0].tagName || parent[0].name || '').toLowerCase();
                if (parentTag && parentTag !== 'html' && parentTag !== 'body') {
                    const parentId = parent.attr('id');
                    const parentClass = (parent.attr('class') || '').trim().split(/\s+/)[0];
                    let ps = parentTag;
                    if (parentId) ps = `#${parentId}`;
                    else if (parentClass) ps = `${parentTag}.${parentClass}`;
                    return `${ps} > ${tag}`;
                }
            }
            return null;
        }

        /** Extract concise text content from an element (max chars) */
        function textOf(el, max = 60) {
            const raw = $(el).text().replace(/\s+/g, ' ').trim();
            return raw.length > max ? raw.substring(0, max - 3) + '...' : raw;
        }

        /** Count direct children of a specific tag type */
        function childCount(el, childTag) {
            return $(el).find(childTag).length;
        }

        /** Build one evidence entry */
        function evidence(el, desc) {
            const sel = selectorFor(el);
            if (!sel) return null;
            return { elementSelector: sel, description: desc };
        }

        const result = {};
        categories.forEach(c => result[c] = []);

        // ====== BRANDING ======
        // Logo
        $('img[class*="logo"], img[alt*="logo"], img[src*="logo"], .logo img, #logo img, [class*="logo"]').each((_, el) => {
            const tag = (el.tagName || el.name || '').toLowerCase();
            const alt = $(el).attr('alt') || '';
            const src = $(el).attr('src') || '';
            if (tag === 'img') {
                result.branding.push(evidence(el, `Logo image${alt ? ` (alt: "${alt}")` : ''} in ${src.includes('svg') ? 'SVG' : 'raster'} format`));
            } else {
                result.branding.push(evidence(el, `Brand/logo container element with ${childCount(el, 'img')} images`));
            }
        });
        // Brand colors from inline styles or color-bearing classes
        $('header, [class*="brand"], [class*="primary"]').slice(0, 2).each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            if (cls) {
                result.branding.push(evidence(el, `Brand element with classes: ${cls.split(/\s+/).slice(0, 4).join(', ')}`));
            }
        });

        // ====== RESPONSIVENESS ======
        $('meta[name="viewport"]').each((_, el) => {
            const content = $(el).attr('content') || '';
            result.responsiveness.push(evidence(el, `Viewport meta tag: "${content}"`));
        });
        // Responsive containers
        $('[class*="container"], [class*="max-w-"], [class*="mx-auto"]').slice(0, 2).each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.responsiveness.push(evidence(el, `Responsive container: ${cls.split(/\s+/).slice(0, 5).join(' ')}`));
        });
        // Media-query-hinted elements (hidden on mobile/desktop)
        $('[class*="hidden"], [class*="md:"], [class*="lg:"], [class*="sm:"]').first().each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.responsiveness.push(evidence(el, `Breakpoint-responsive element: ${cls.split(/\s+/).slice(0, 5).join(' ')}`));
        });

        // ====== HIERARCHY ======
        $('h1').each((_, el) => {
            result.hierarchy.push(evidence(el, `H1 heading: "${textOf(el)}"`));
        });
        $('h2').slice(0, 3).each((_, el) => {
            result.hierarchy.push(evidence(el, `H2 heading: "${textOf(el)}"`));
        });
        // First major section
        $('main, [role="main"], .main-content, #main').first().each((_, el) => {
            const sectionCount = $(el).find('section').length;
            result.hierarchy.push(evidence(el, `Main content area with ${sectionCount} sections`));
        });

        // ====== CONSISTENCY ======
        // Buttons — check for consistent styling
        const buttons = $('button, .btn, [class*="btn"], [role="button"], a[class*="button"]');
        if (buttons.length > 0) {
            const firstBtn = buttons.first()[0];
            const cls = ($(firstBtn).attr('class') || '').trim();
            result.consistency.push(evidence(firstBtn, `Button pattern (${buttons.length} found): classes "${cls.split(/\s+/).slice(0, 4).join(' ')}"`));
            if (buttons.length > 1) {
                const secondBtn = buttons.eq(1)[0];
                const cls2 = ($(secondBtn).attr('class') || '').trim();
                result.consistency.push(evidence(secondBtn, `Secondary button: classes "${cls2.split(/\s+/).slice(0, 4).join(' ')}"`));
            }
        }
        // Links
        const links = $('a[href]');
        if (links.length > 0) {
            result.consistency.push(evidence(links.first()[0], `Link pattern (${links.length} total links on page)`));
        }

        // ====== AESTHETICS ======
        // Hero/banner section
        $('[class*="hero"], [class*="banner"], [class*="jumbotron"]').first().each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.aesthetics.push(evidence(el, `Hero/banner section: ${cls.split(/\s+/).slice(0, 5).join(' ')}`));
        });
        // Images
        const images = $('img[src]');
        if (images.length > 0) {
            result.aesthetics.push(evidence(images.first()[0], `Visual imagery (${images.length} images on page)`));
        }
        // Background/gradient elements
        $('[class*="bg-"], [class*="gradient"], [style*="background"]').slice(0, 2).each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.aesthetics.push(evidence(el, `Styled background: ${cls.split(/\s+/).slice(0, 4).join(' ')}`));
        });

        // ====== ABOVE THE FOLD ======
        // First heading + first CTA are the critical above-fold elements
        $('h1').first().each((_, el) => {
            result.aboveTheFold.push(evidence(el, `Primary headline: "${textOf(el)}"`));
        });
        $('a[class*="btn"], a[class*="cta"], button[class*="primary"], a[class*="primary"]').first().each((_, el) => {
            const text = textOf(el, 40);
            result.aboveTheFold.push(evidence(el, `Primary CTA: "${text}"`));
        });
        $('header, [class*="header"]').first().each((_, el) => {
            result.aboveTheFold.push(evidence(el, `Header section containing navigation and branding`));
        });

        // ====== CONTENT FLOW ======
        const sections = $('section, [class*="section"]');
        if (sections.length > 0) {
            result.contentFlow.push(evidence(sections.first()[0], `Page structure: ${sections.length} content sections`));
            if (sections.length > 1) {
                result.contentFlow.push(evidence(sections.eq(1)[0], `Second content section: "${textOf(sections.eq(1), 50)}"`));
            }
        }
        $('footer, [class*="footer"]').first().each((_, el) => {
            result.contentFlow.push(evidence(el, `Footer section with ${childCount(el, 'a')} links`));
        });

        // ====== VISUAL DESIGN ======
        // Grid/layout elements
        $('[class*="grid"], [class*="flex"], [class*="columns"]').slice(0, 2).each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.visualDesign.push(evidence(el, `Layout pattern: ${cls.split(/\s+/).slice(0, 5).join(' ')}`));
        });
        // Cards
        $('[class*="card"]').slice(0, 2).each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.visualDesign.push(evidence(el, `Card component: ${cls.split(/\s+/).slice(0, 4).join(' ')}`));
        });

        // ====== USABILITY ======
        // Navigation
        $('nav, [role="navigation"]').first().each((_, el) => {
            const linkCount = $(el).find('a').length;
            result.usability.push(evidence(el, `Navigation containing ${linkCount} links`));
        });
        // Search
        $('input[type="search"], [class*="search"], [role="search"]').first().each((_, el) => {
            result.usability.push(evidence(el, `Search functionality`));
        });
        // Interactive elements
        $('[class*="dropdown"], [class*="menu"], [class*="accordion"]').first().each((_, el) => {
            const cls = ($(el).attr('class') || '').trim();
            result.usability.push(evidence(el, `Interactive component: ${cls.split(/\s+/).slice(0, 3).join(' ')}`));
        });

        // ====== ACCESSIBILITY ======
        // Images missing alt text
        const imgsNoAlt = $('img:not([alt]), img[alt=""]');
        if (imgsNoAlt.length > 0) {
            result.accessibility.push(evidence(imgsNoAlt.first()[0], `${imgsNoAlt.length} image(s) missing alt text`));
        } else if (images.length > 0) {
            result.accessibility.push(evidence(images.first()[0], `All ${images.length} images have alt text`));
        }
        // Form labels
        const inputs = $('input:not([type="hidden"]):not([type="submit"]), textarea, select');
        const labelled = $('input[aria-label], input[id], textarea[aria-label], textarea[id], select[aria-label], select[id]');
        if (inputs.length > 0) {
            result.accessibility.push(evidence(inputs.first()[0], `Form inputs: ${labelled.length}/${inputs.length} have labels/ARIA`));
        }
        // ARIA landmarks
        const landmarks = $('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"]');
        if (landmarks.length > 0) {
            result.accessibility.push(evidence(landmarks.first()[0], `${landmarks.length} ARIA landmark roles detected`));
        }
        // Skip link
        $('a[href="#main"], a[href="#content"], .skip-link, .skip-nav').first().each((_, el) => {
            result.accessibility.push(evidence(el, `Skip navigation link present`));
        });

        // Filter nulls and limit per category
        for (const cat of categories) {
            result[cat] = result[cat].filter(Boolean).slice(0, 3);
        }

        if (verbose) {
            const total = Object.values(result).reduce((s, arr) => s + arr.length, 0);
            console.log(`[CfHtmlExtractor] 📦 Built ${total} deterministic visual evidence entries`);
            for (const [cat, entries] of Object.entries(result)) {
                if (entries.length > 0) console.log(`[CfHtmlExtractor]   ${cat}: ${entries.length} entries`);
            }
        }

        return result;
    } catch (error) {
        if (verbose) console.error('[CfHtmlExtractor] Deterministic evidence build failed:', error.message);
        return emptyResult;
    }
}


// ============================================================================
// Security Signals Extraction (P0: deterministic replacement for page.evaluate)
// ============================================================================

/**
 * Extract security-relevant signals deterministically from raw HTML via cheerio.
 * Replaces Playwright's getFormsContext() and getCspContext() meta-tag fallback.
 *
 * @param {string} html - Raw page HTML
 * @param {boolean} [verbose=false]
 * @returns {{ metaCsp: object, forms: object[], sri: object, mixedContent: object, inlineScripts: object }}
 */
function extractSecuritySignalsFromHtml(html, verbose = false) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html || '');

    // 1. Meta CSP
    const cspMeta = $('meta[http-equiv="Content-Security-Policy"]').attr('content') || null;
    const cspReportMeta = $('meta[http-equiv="Content-Security-Policy-Report-Only"]').attr('content') || null;

    // 2. Forms
    const forms = [];
    $('form').each((i, el) => {
        if (i >= 10) return; // cap at 10 forms
        const $form = $(el);
        const action = $form.attr('action') || '';
        const method = ($form.attr('method') || 'GET').toUpperCase();
        const inputs = $form.find('input, textarea, select');
        const hasPassword = $form.find('input[type="password"]').length > 0;
        const hasCsrf = $form.find(
            'input[name*="csrf"], input[name*="token"], input[name*="nonce"], input[name*="_csrf"]'
        ).length > 0;
        const submitsToHttps = action ? action.startsWith('https://') || action.startsWith('/') || action.startsWith('#') || action === '' : true;

        forms.push({
            id: $form.attr('id') || $form.attr('name') || `form-${i}`,
            action,
            method,
            inputCount: inputs.length,
            hasPasswordField: hasPassword,
            hasCsrfTokenLikeField: hasCsrf,
            submitsToHttps,
            fieldTypes: inputs.map((_, inp) => $(inp).attr('type') || 'text').get().slice(0, 20),
        });
    });

    // 3. Subresource Integrity (SRI)
    const scriptsTotal = $('script[src]').length;
    const scriptsWithSri = $('script[src][integrity]').length;
    const linksTotal = $('link[rel="stylesheet"]').length;
    const linksWithSri = $('link[rel="stylesheet"][integrity]').length;

    // 4. Mixed content (http:// references in what should be https pages)
    const mixedContentSrcs = [];
    $('[src], [href]').each((_, el) => {
        const val = $(el).attr('src') || $(el).attr('href') || '';
        if (val.startsWith('http://') && !val.includes('localhost')) {
            mixedContentSrcs.push({ tag: el.tagName, src: val.substring(0, 120) });
        }
    });

    // 5. Inline scripts (CSP implications)
    const inlineScriptCount = $('script:not([src])').length;
    const inlineStyleCount = $('style').length;
    const onhandlerCount = $('[onclick], [onload], [onerror], [onmouseover], [onsubmit]').length;

    // 6. X-Frame-Options / X-Content-Type-Options from meta (rare but possible)
    const metaXFrame = $('meta[http-equiv="X-Frame-Options"]').attr('content') || null;
    const metaXContentType = $('meta[http-equiv="X-Content-Type-Options"]').attr('content') || null;

    const result = {
        metaCsp: {
            present: !!(cspMeta || cspReportMeta),
            value: cspMeta || cspReportMeta || null,
            source: cspMeta ? 'meta-tag' : cspReportMeta ? 'meta-tag-report-only' : 'none',
        },
        forms: { count: forms.length, details: forms },
        sri: {
            scripts: { total: scriptsTotal, withIntegrity: scriptsWithSri },
            stylesheets: { total: linksTotal, withIntegrity: linksWithSri },
        },
        mixedContent: {
            found: mixedContentSrcs.length > 0,
            count: mixedContentSrcs.length,
            samples: mixedContentSrcs.slice(0, 5),
        },
        inlineScripts: {
            scriptCount: inlineScriptCount,
            styleCount: inlineStyleCount,
            eventHandlerCount: onhandlerCount,
        },
        metaHeaders: {
            xFrameOptions: metaXFrame,
            xContentTypeOptions: metaXContentType,
        },
    };

    if (verbose) {
        console.log(`[CfHtmlExtractor] 🔒 Security signals: ${forms.length} forms, CSP=${result.metaCsp.present}, SRI=${scriptsWithSri}/${scriptsTotal} scripts, mixed=${mixedContentSrcs.length}`);
    }
    return result;
}

// ============================================================================
// Privacy Signals Extraction (P0: deterministic replacement for page.evaluate)
// ============================================================================

/**
 * Extract privacy-relevant signals deterministically from raw HTML via cheerio.
 * Replaces Playwright's getTrackerContext(), getConsentContext(), getPrivacyPolicyContext().
 *
 * @param {string} html - Raw page HTML
 * @param {string} [pageUrl=''] - Page URL for resolving relative links
 * @param {boolean} [verbose=false]
 * @returns {{ trackers: object, consent: object, privacyPolicy: object, dataCollection: object, thirdPartyIframes: object }}
 */
function extractPrivacySignalsFromHtml(html, pageUrl = '', verbose = false) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html || '');
    let pageHostname = '';
    try { pageHostname = new URL(pageUrl).hostname; } catch { /* ignore */ }

    // 1. Tracker / analytics script detection
    const trackerPatterns = [
        { name: 'Google Analytics (GA4)', patterns: ['googletagmanager.com/gtag', 'gtag(', 'GoogleAnalyticsObject'] },
        { name: 'Google Tag Manager', patterns: ['googletagmanager.com/gtm', 'GTM-'] },
        { name: 'Meta Pixel', patterns: ['connect.facebook.net', 'fbq(', 'facebook.com/tr'] },
        { name: 'Hotjar', patterns: ['hotjar.com', 'hj('] },
        { name: 'Microsoft Clarity', patterns: ['clarity.ms', 'clarity('] },
        { name: 'LinkedIn Insight', patterns: ['snap.licdn.com', 'linkedin.com/px', 'lintrk'] },
        { name: 'Twitter/X Pixel', patterns: ['static.ads-twitter.com', 'twq('] },
        { name: 'TikTok Pixel', patterns: ['analytics.tiktok.com', 'ttq.load'] },
        { name: 'Snapchat Pixel', patterns: ['sc-static.net/scevent', 'snaptr('] },
        { name: 'Reddit Pixel', patterns: ['redditstatic.com', 'rdt('] },
        { name: 'HubSpot', patterns: ['js.hs-scripts.com', 'js.hsforms.net', 'hbspt.'] },
        { name: 'Segment', patterns: ['cdn.segment.com', 'analytics.js'] },
        { name: 'Mixpanel', patterns: ['cdn.mxpnl.com', 'mixpanel.'] },
        { name: 'Amplitude', patterns: ['cdn.amplitude.com', 'amplitude.getInstance'] },
        { name: 'Google Ads', patterns: ['googleads.g.doubleclick.net', 'google_conversion'] },
        { name: 'Pinterest', patterns: ['pintrk', 's.pinimg.com'] },
    ];

    // Scan all script srcs + inline script contents
    const allScriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
    const allInlineScripts = $('script:not([src])').map((_, el) => $(el).html() || '').get().join('\n');
    const fullText = allScriptSrcs.join('\n') + '\n' + allInlineScripts;

    const detectedTrackers = [];
    for (const tracker of trackerPatterns) {
        if (tracker.patterns.some(p => fullText.includes(p))) {
            detectedTrackers.push(tracker.name);
        }
    }

    // External domains from scripts/iframes
    const externalDomains = new Set();
    $('script[src], iframe[src], img[src]').each((_, el) => {
        const src = $(el).attr('src') || '';
        try {
            const srcHost = new URL(src, pageUrl || 'https://example.com').hostname;
            if (pageHostname && srcHost !== pageHostname && !srcHost.endsWith(`.${pageHostname}`) && !pageHostname.endsWith(`.${srcHost}`)) {
                externalDomains.add(srcHost);
            }
        } catch { /* skip invalid URLs */ }
    });

    // 2. Consent manager detection
    // NOTE: Most consent banners are JS-rendered and NOT in static HTML DOM.
    // Script src detection (via fullText) is the primary method since <script> tags
    // ARE present in static HTML even though the rendered banner is not.
    const consentPatterns = [
        // --- Major third-party CMPs ---
        { name: 'OneTrust', selectors: ['#onetrust-banner-sdk', '.onetrust-pc-dark-filter'], scripts: ['cdn.cookielaw.org', 'onetrust'] },
        { name: 'Cookiebot', selectors: ['#CookiebotDialog', '#CybotCookiebotDialog'], scripts: ['cookiebot.com', 'Cookiebot'] },
        { name: 'Osano', selectors: ['.osano-cm-window', '[data-osano]'], scripts: ['cmp.osano.com'] },
        { name: 'CookieYes', selectors: ['.cky-consent-container', '#cky-consent'], scripts: ['cdn-cookieyes.com'] },
        { name: 'Quantcast/TCF', selectors: ['.qc-cmp2-container'], scripts: ['quantcast.mgr.consensu.org', '__tcfapi'] },
        { name: 'TrustArc', selectors: ['#truste-consent-track'], scripts: ['consent.trustarc.com'] },
        { name: 'Termly', selectors: ['[data-termly-embed]'], scripts: ['app.termly.io'] },
        { name: 'Iubenda', selectors: ['.iubenda-cs-container'], scripts: ['cdn.iubenda.com'] },
        // --- Platform-specific consent ---
        { name: 'Shopify Consent', selectors: [], scripts: ['consent-tracking-api', 'shopify-privacy', 'customer-privacy-api', 'Shopify.loadFeatures'] },
        { name: 'CookieFirst', selectors: [], scripts: ['consent.cookiefirst.com', 'cookiefirst.com'] },
        { name: 'Klaro', selectors: ['.klaro', '.cookie-modal'], scripts: ['klaro.js', 'kiprotect.com/klaro'] },
        { name: 'Complianz', selectors: ['#cmplz-cookiebanner-container'], scripts: ['complianz', 'cmplz'] },
        { name: 'Borlabs Cookie', selectors: ['#BorlabsCookieBox'], scripts: ['borlabs'] },
        { name: 'GDPR Cookie Consent (WP)', selectors: ['.cli-modal', '#cookie-law-info-bar'], scripts: ['cookie-law-info', 'cli-'] },
        { name: 'HubSpot Cookie Banner', selectors: ['#hs-eu-cookie-confirmation'], scripts: ['hs-banner.js', 'js.hs-scripts.com'] },
        { name: 'CookieConsent.js', selectors: [], scripts: ['cookieconsent.min.js', 'cookieconsent.js'] },
        { name: 'Civic Cookie Control', selectors: ['#ccc-module', '#ccc'], scripts: ['civiccomputing.com', 'cc.cdn.civiccomputing.com'] },
        { name: 'ConsentManager', selectors: [], scripts: ['consentmanager.net', 'cdn.consentmanager.net'] },
        { name: 'Didomi', selectors: ['#didomi-popup'], scripts: ['sdk.privacy-center.org', 'didomi'] },
        { name: 'Axeptio', selectors: [], scripts: ['axeptio.eu', 'static.axept.io'] },
        { name: 'Usercentrics', selectors: ['#usercentrics-root'], scripts: ['usercentrics.eu', 'app.usercentrics.eu'] },
    ];

    const detectedConsentManagers = [];
    for (const cm of consentPatterns) {
        const hasSelector = cm.selectors.length > 0 && cm.selectors.some(sel => { try { return $(sel).length > 0; } catch { return false; } });
        const hasScript = cm.scripts.some(s => fullText.includes(s));
        if (hasSelector || hasScript) {
            detectedConsentManagers.push(cm.name);
        }
    }

    // Raw HTML scan: some consent scripts are loaded via patterns not in <script src> attributes
    // (e.g., Shopify inline consent, Google Consent Mode, WordPress plugin inline config)
    if (detectedConsentManagers.length === 0) {
        const rawHtmlLower = (html || '').toLowerCase();
        const rawHtmlPatterns = [
            { name: 'Google Consent Mode', pattern: /consent[_-]?mode|gtag\s*\(\s*['"]consent['"]/ },
            { name: 'Shopify Consent', pattern: /consent-tracking-api|customer-privacy-api|shopify\.loadfeatures.*consent/ },
            { name: 'WordPress Cookie Plugin', pattern: /cookie-law-info|gdpr-cookie-consent|cookie-notice-plugin/ },
            { name: 'TCF API', pattern: /__tcfapi|__cmp|__gpp/ },
        ];
        for (const rp of rawHtmlPatterns) {
            if (rp.pattern.test(rawHtmlLower)) {
                detectedConsentManagers.push(rp.name);
            }
        }
    }

    // Generic cookie banner detection (DOM selectors — works when SSR'd)
    if (detectedConsentManagers.length === 0) {
        const genericSelectors = ['.cookie-banner', '.cookie-consent', '.cookie-notice', '#cookie-law-info-bar',
            '[class*="cookie"][class*="banner"]', '[class*="cookie"][class*="consent"]',
            '.sqs-cookie-banner-v2', '[data-cookie-banner]'];
        const hasGeneric = genericSelectors.some(sel => { try { return $(sel).length > 0; } catch { return false; } });
        if (hasGeneric) detectedConsentManagers.push('Generic Cookie Banner');
    }

    // Consent button detection
    const bodyText = $.text().toLowerCase();
    const hasAcceptAll = bodyText.includes('accept all') || bodyText.includes('agree all') || bodyText.includes('allow all');
    const hasRejectAll = bodyText.includes('reject all') || bodyText.includes('decline all') || bodyText.includes('deny all');
    const hasManage = bodyText.includes('manage cookies') || bodyText.includes('cookie settings') || bodyText.includes('cookie preferences');

    // 3. Privacy policy link detection
    let privacyPolicy = { found: false, link: null, text: null };
    const privacyPatterns = [
        /privacy\s*policy/i, /privacy\s*notice/i, /privacy\s*statement/i,
        /data\s*protection/i, /cookie\s*policy/i, /hipaa/i, /patient\s*privacy/i,
    ];
    $('a[href]').each((_, el) => {
        if (privacyPolicy.found) return;
        const $a = $(el);
        const href = $a.attr('href') || '';
        const text = $a.text().trim();
        const hrefLower = href.toLowerCase();
        if (privacyPatterns.some(p => p.test(text)) ||
            hrefLower.includes('privacy') || hrefLower.includes('policy') || hrefLower.includes('hipaa')) {
            let resolvedUrl = href;
            try { resolvedUrl = new URL(href, pageUrl || 'https://example.com').href; } catch { /* keep as-is */ }
            privacyPolicy = { found: true, link: resolvedUrl, text: text || href };
        }
    });

    // 4. Data collection form fields
    const dataCollectionFields = [];
    $('input, textarea, select').each((_, el) => {
        const $el = $(el);
        const type = ($el.attr('type') || 'text').toLowerCase();
        const name = ($el.attr('name') || '').toLowerCase();
        const placeholder = ($el.attr('placeholder') || '').toLowerCase();
        const isPii = type === 'email' || type === 'tel' || type === 'password' ||
            /email|phone|tel|name|address|ssn|dob|birth|credit|card|zip|postal/.test(name) ||
            /email|phone|name|address/.test(placeholder);
        if (isPii) {
            dataCollectionFields.push({ type, name: $el.attr('name') || '', fieldType: type === 'email' ? 'email' : type === 'tel' ? 'phone' : 'pii' });
        }
    });

    // 5. Third-party iframes
    const thirdPartyIframes = [];
    $('iframe[src]').each((_, el) => {
        const src = $(el).attr('src') || '';
        try {
            const host = new URL(src, pageUrl || 'https://example.com').hostname;
            if (pageHostname && host !== pageHostname) {
                thirdPartyIframes.push({ src: src.substring(0, 150), domain: host });
            }
        } catch { /* skip */ }
    });

    // --- Website platform detection ---
    // Used downstream to suppress platform-specific false positives
    // (e.g., Wix Shadow DOM hides form labels/skip-nav from static extraction)
    const rawHtmlForPlatform = html || '';
    let platformDetected = null;
    if (/wix\.com|wixstatic\.com|X-Wix-/i.test(rawHtmlForPlatform)) platformDetected = 'Wix';
    else if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(rawHtmlForPlatform)) platformDetected = 'Shopify';
    else if (/wp-content|wp-includes|wordpress/i.test(rawHtmlForPlatform)) platformDetected = 'WordPress';
    else if (/squarespace\.com|sqsp\.net|sqs-/i.test(rawHtmlForPlatform)) platformDetected = 'Squarespace';
    else if (/webflow\.com|wf-page|w-webflow-badge/i.test(rawHtmlForPlatform)) platformDetected = 'Webflow';
    else if (/ghost\.io|ghost\.org|ghost-portal/i.test(rawHtmlForPlatform)) platformDetected = 'Ghost';
    else if (/hubspot\.com|hs-scripts\.com|hbspt/i.test(rawHtmlForPlatform)) platformDetected = 'HubSpot';
    else if (/framer\.com|framerusercontent\.com/i.test(rawHtmlForPlatform)) platformDetected = 'Framer';
    else if (/bigcommerce\.com|stencil-utils/i.test(rawHtmlForPlatform)) platformDetected = 'BigCommerce';
    else if (/duda\.co|dmcdn\.net/i.test(rawHtmlForPlatform)) platformDetected = 'Duda';

    const result = {
        trackers: {
            detected: detectedTrackers,
            count: detectedTrackers.length,
            externalDomains: Array.from(externalDomains).slice(0, 30),
            externalDomainCount: externalDomains.size,
        },
        consent: {
            managersDetected: detectedConsentManagers,
            bannerDetected: detectedConsentManagers.length > 0,
            hasAcceptAll,
            hasRejectAll,
            hasGranularOptions: hasManage,
        },
        privacyPolicy,
        dataCollection: {
            piiFieldCount: dataCollectionFields.length,
            fields: dataCollectionFields.slice(0, 20),
            hasEmailCapture: dataCollectionFields.some(f => f.fieldType === 'email'),
            hasPhoneCapture: dataCollectionFields.some(f => f.fieldType === 'phone'),
            hasPasswordField: dataCollectionFields.some(f => f.type === 'password'),
        },
        thirdPartyIframes: {
            count: thirdPartyIframes.length,
            iframes: thirdPartyIframes.slice(0, 10),
        },
        platformDetected,
    };

    if (verbose) {
        console.log(`[CfHtmlExtractor] 🔏 Privacy signals: ${detectedTrackers.length} trackers, consent=${detectedConsentManagers.join(',') || 'none'}, policy=${privacyPolicy.found}, PII fields=${dataCollectionFields.length}, 3P iframes=${thirdPartyIframes.length}, platform=${platformDetected || 'unknown'}`);
    }
    return result;
}

// ============================================================================
// Accessibility Signals Extraction (P1: deterministic replacement for page.evaluate)
// ============================================================================

/**
 * Extract WCAG-relevant signals deterministically from raw HTML via cheerio.
 * Replaces Playwright's getAccessibilityContext() when no browser is available.
 *
 * @param {string} html - Raw page HTML
 * @param {boolean} [verbose=false]
 * @returns {object} Comprehensive accessibility signals
 */
function extractAccessibilitySignalsFromHtml(html, verbose = false) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html || '');

    // 1. Image alt text analysis
    const allImages = $('img');
    const imagesWithAlt = $('img[alt]').filter((_, el) => ($(el).attr('alt') || '').trim() !== '');
    const imagesEmptyAlt = $('img[alt=""]');
    const imagesMissingAlt = $('img:not([alt])');
    const imagesSamples = [];
    imagesMissingAlt.slice(0, 5).each((_, el) => {
        imagesSamples.push({ src: ($(el).attr('src') || '').substring(0, 80), issue: 'missing alt' });
    });

    // 2. ARIA roles, labels, landmarks
    const ariaElements = $('[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [aria-expanded]');
    const roles = new Set();
    ariaElements.each((_, el) => { const r = $(el).attr('role'); if (r) roles.add(r); });
    const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'region'];
    const landmarks = $('[role]').filter((_, el) => landmarkRoles.includes($(el).attr('role')));
    const hasMain = $('main, [role="main"]').length > 0;
    const hasNav = $('nav, [role="navigation"]').length > 0;
    const hasFooter = $('footer, [role="contentinfo"]').length > 0;

    // 3. Heading hierarchy
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
        const level = parseInt(el.tagName.replace('h', '').replace('H', ''));
        headings.push({ level, text: $(el).text().trim().substring(0, 60), empty: !$(el).text().trim() });
    });
    const h1Count = headings.filter(h => h.level === 1).length;
    // Check for skipped levels (e.g., h1→h3 without h2)
    const usedLevels = [...new Set(headings.map(h => h.level))].sort();
    const skippedLevels = [];
    for (let i = 1; i < usedLevels.length; i++) {
        if (usedLevels[i] - usedLevels[i - 1] > 1) {
            for (let missed = usedLevels[i - 1] + 1; missed < usedLevels[i]; missed++) {
                skippedLevels.push(missed);
            }
        }
    }

    // 4. Form label association
    const inputs = $('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), textarea, select');
    let withExplicitLabel = 0, withAriaLabel = 0, withoutLabel = 0;
    inputs.each((_, el) => {
        const $el = $(el);
        const id = $el.attr('id');
        const hasLabel = id && $(`label[for="${id}"]`).length > 0;
        const wrappedInLabel = $el.closest('label').length > 0;
        const hasAria = !!$el.attr('aria-label') || !!$el.attr('aria-labelledby');
        if (hasLabel || wrappedInLabel) withExplicitLabel++;
        else if (hasAria) withAriaLabel++;
        else withoutLabel++;
    });

    // 5. Skip navigation
    const skipLinks = $('a[href^="#main"], a[href^="#content"], a[href^="#skip"], a.skip-link, a.skip-nav, .skip-to-content a');

    // 6. Language attribute
    const htmlLang = $('html').attr('lang') || null;
    const htmlDir = $('html').attr('dir') || null;

    // 7. Tabindex
    const tabindexElements = $('[tabindex]');
    const negativeTabindex = $('[tabindex="-1"]').length;
    const positiveTabindex = tabindexElements.filter((_, el) => {
        const val = parseInt($(el).attr('tabindex') || '0');
        return val > 0;
    }).length;

    // 8. Link text quality
    const genericLinkTexts = ['click here', 'read more', 'more', 'here', 'link', 'learn more'];
    let genericLinkCount = 0, emptyLinkCount = 0;
    $('a[href]').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        const ariaLabel = $(el).attr('aria-label');
        if (!text && !ariaLabel) emptyLinkCount++;
        else if (genericLinkTexts.includes(text)) genericLinkCount++;
    });

    // 9. Media accessibility
    const videos = $('video');
    const videosWithCaptions = $('video track[kind="captions"], video track[kind="subtitles"]').closest('video');
    const audios = $('audio');

    const result = {
        images: {
            total: allImages.length,
            withAlt: imagesWithAlt.length,
            emptyAlt: imagesEmptyAlt.length,
            missingAlt: imagesMissingAlt.length,
            samples: imagesSamples,
        },
        aria: {
            elementCount: ariaElements.length,
            roles: Array.from(roles).slice(0, 15),
            landmarkCount: landmarks.length,
            hasMain, hasNav, hasFooter,
        },
        headings: {
            total: headings.length, h1Count, skippedLevels,
            structure: headings.slice(0, 15),
            emptyHeadings: headings.filter(h => h.empty).length,
        },
        forms: {
            totalInputs: inputs.length, withExplicitLabel, withAriaLabel, withoutLabel,
        },
        skipNavigation: { present: skipLinks.length > 0, count: skipLinks.length },
        language: { lang: htmlLang, dir: htmlDir, present: !!htmlLang },
        tabindex: { total: tabindexElements.length, negative: negativeTabindex, positive: positiveTabindex },
        links: {
            total: $('a[href]').length, genericText: genericLinkCount, emptyText: emptyLinkCount,
        },
        media: {
            videos: videos.length, videosWithCaptions: videosWithCaptions.length,
            audios: audios.length,
        },
    };

    if (verbose) {
        console.log(`[CfHtmlExtractor] ♿ A11y signals: ${allImages.length} imgs (${imagesMissingAlt.length} no-alt), ${headings.length} headings (h1=${h1Count}), ${inputs.length} inputs (${withoutLabel} unlabeled), lang=${htmlLang || 'missing'}, landmarks=${landmarks.length}`);
    }
    return result;
}

// ============================================================================
// Compatibility Signals Extraction (P1: deterministic replacement for page.evaluate)
// ============================================================================

/**
 * Extract browser compatibility signals deterministically from raw HTML via cheerio.
 * Replaces Playwright's getCssContext(), getJsContext(), getResponsiveContext().
 *
 * @param {string} html - Raw page HTML
 * @param {boolean} [verbose=false]
 * @returns {object} CSS features, JS features, responsive signals, polyfills
 */
function extractCompatibilitySignalsFromHtml(html, verbose = false) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html || '');

    // 1. CSS features from inline styles and <style> tags
    let cssText = '';
    $('style').each((_, el) => { cssText += ($(el).html() || '') + '\n'; });
    // Also check style attributes
    $('[style]').each((_, el) => { cssText += ($(el).attr('style') || '') + '\n'; });
    cssText = cssText.toLowerCase();

    const cssFeatures = new Set();
    const cssIssues = [];
    if (cssText.includes('display: grid') || cssText.includes('display:grid')) cssFeatures.add('CSS Grid Layout');
    if (cssText.includes('display: flex') || cssText.includes('display:flex')) cssFeatures.add('CSS Flexbox');
    if (cssText.includes('var(--')) cssFeatures.add('CSS Custom Properties (Variables)');
    if (cssText.includes('transform:')) cssFeatures.add('CSS Transforms');
    if (cssText.includes('animation:') || cssText.includes('@keyframes')) cssFeatures.add('CSS Animations');
    if (cssText.includes('filter:') && !cssText.includes('ms-filter')) cssFeatures.add('CSS Filters');
    if (cssText.includes('aspect-ratio:')) cssFeatures.add('CSS aspect-ratio');
    if (cssText.includes('position: sticky') || cssText.includes('position:sticky')) cssFeatures.add('CSS position:sticky');
    if (cssText.includes('@container')) cssFeatures.add('CSS Container Queries');
    if (cssText.includes('scroll-snap-type:')) cssFeatures.add('CSS Scroll Snap');
    if (cssText.includes('clip-path:')) cssFeatures.add('CSS clip-path');
    if (cssText.includes('backdrop-filter:')) cssFeatures.add('CSS Backdrop Filter');
    if (cssText.includes('gap:') && (cssFeatures.has('CSS Flexbox') || cssFeatures.has('CSS Grid Layout'))) cssFeatures.add('CSS Gap in Flex/Grid');

    // Vendor prefixes
    const prefixes = (cssText.match(/-webkit-[a-z-]+|-moz-[a-z-]+|-ms-[a-z-]+|-o-[a-z-]+/g) || []);
    const uniquePrefixes = [...new Set(prefixes)];

    // 2. JS features from script content + src
    let jsText = '';
    $('script:not([src])').each((_, el) => { jsText += ($(el).html() || '') + '\n'; });
    const scriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
    jsText += scriptSrcs.join('\n');

    const jsFeatures = new Set();
    const jsIssues = [];
    if (jsText.includes('const ') || jsText.includes('let ')) jsFeatures.add('ES6+ Variables');
    if (jsText.includes('=>')) jsFeatures.add('Arrow Functions');
    if (jsText.includes('.then(') || jsText.includes('async ') || jsText.includes('await ')) jsFeatures.add('Promises/Async');
    if (jsText.includes('fetch(')) jsFeatures.add('Fetch API');
    if (jsText.includes('IntersectionObserver')) jsFeatures.add('Intersection Observer');
    if (jsText.includes('ResizeObserver')) jsFeatures.add('Resize Observer');
    if (jsText.includes('customElements') || jsText.includes('shadowRoot')) jsFeatures.add('Web Components');
    if (jsText.includes('serviceWorker')) jsFeatures.add('Service Workers');
    if (jsText.includes('structuredClone')) jsFeatures.add('structuredClone');
    if (jsText.includes('Array.at') || jsText.includes('.at(')) jsFeatures.add('Array.at()');
    if (jsText.includes('import.meta')) jsFeatures.add('import.meta');
    if (/jquery|jquery\.min\.js/i.test(jsText) || scriptSrcs.some(s => /jquery/i.test(s))) jsFeatures.add('jQuery');

    // Polyfill detection
    const hasPolyfills = scriptSrcs.some(s => /polyfill|core-js|babel/i.test(s)) || jsText.includes('polyfill');
    const hasBabel = jsText.includes('_babel') || jsText.includes('babel') || scriptSrcs.some(s => /babel/i.test(s));

    // IE-specific concerns
    if (jsText.includes('document.all')) jsIssues.push('document.all usage (IE-specific)');
    if (jsText.includes('attachEvent(')) jsIssues.push('attachEvent() usage (IE-specific)');

    // 3. Responsive design signals
    const viewportMeta = $('meta[name="viewport"]');
    const hasViewportMeta = viewportMeta.length > 0;
    const viewportContent = viewportMeta.attr('content') || null;
    const hasUserScalableNo = viewportContent ? viewportContent.includes('user-scalable=no') : false;

    // Media queries in inline styles
    const mediaQueryMatches = cssText.match(/@media\s*\([^)]+\)/g) || [];
    const mediaQueryCount = new Set(mediaQueryMatches).size;

    // 4. Document features
    const hasDoctype = (html || '').trimStart().toLowerCase().startsWith('<!doctype');
    const charset = $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || null;
    const scriptModules = $('script[type="module"]').length;
    const scriptNomodule = $('script[nomodule]').length;
    const pictureElements = $('picture').length;
    const sourceElements = $('picture source').length;
    const preloadLinks = $('link[rel="preload"]').length;
    const prefetchLinks = $('link[rel="prefetch"]').length;
    const preconnectLinks = $('link[rel="preconnect"]').length;

    const result = {
        css: {
            features: Array.from(cssFeatures),
            issues: cssIssues,
            vendorPrefixes: uniquePrefixes.slice(0, 20),
            vendorPrefixCount: uniquePrefixes.length,
        },
        js: {
            features: Array.from(jsFeatures),
            issues: jsIssues,
            hasPolyfills, hasBabel,
        },
        responsive: {
            hasViewportMeta, viewportContent, hasUserScalableNo,
            mediaQueryCount,
            flexboxUsed: cssFeatures.has('CSS Flexbox'),
            gridUsed: cssFeatures.has('CSS Grid Layout'),
        },
        document: {
            hasDoctype, charset,
            scriptModules, scriptNomodule,
            pictureElements, sourceElements,
            preloadLinks, prefetchLinks, preconnectLinks,
        },
    };

    if (verbose) {
        console.log(`[CfHtmlExtractor] 🔧 Compat signals: CSS=${cssFeatures.size} features, JS=${jsFeatures.size} features, viewport=${hasViewportMeta}, mediaQ=${mediaQueryCount}, prefixes=${uniquePrefixes.length}, polyfills=${hasPolyfills}`);
    }
    return result;
}

// ============================================================================
// Marketing Signals Extraction (P2: deterministic replacement for page.evaluate)
// ============================================================================

/**
 * Extract marketing signals deterministically from raw HTML via cheerio.
 * Replaces Playwright's getAnalyticsAndTagContext(), getSocialMediaContext(),
 * and getCtaContext() when no browser is available.
 *
 * @param {string} html - Raw page HTML
 * @param {string} [url=''] - Page URL for context
 * @param {boolean} [verbose=false]
 * @returns {object} Analytics, social, CTA, OG, structured data signals
 */
function extractMarketingSignalsFromHtml(html, url = '', verbose = false) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html || '');

    // 1. Analytics & Tag Manager detection from script src and inline content
    const scriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get();
    let inlineJs = '';
    $('script:not([src])').each((_, el) => { inlineJs += ($(el).html() || '') + '\n'; });
    const allScriptText = scriptSrcs.join('\n') + '\n' + inlineJs;

    const analyticsTools = [];
    const tagManagers = [];
    const analyticsPatterns = [
        { name: 'Google Analytics 4', pattern: /googletagmanager\.com\/gtag\/js|gtag\(|GoogleAnalytics|_next\/static.*gtag/i },
        { name: 'Google Analytics UA', pattern: /google-analytics\.com\/analytics\.js|_gaq\.push/i },
        { name: 'Vercel Analytics', pattern: /_vercel\/insights|va\.ts|vercel\.com\/analytics|vercelAnalytics|@vercel\/analytics/i },
        { name: 'Vercel Speed Insights', pattern: /_vercel\/speed-insights|vercel\.com\/speed-insights|SpeedInsights|@vercel\/speed-insights/i },
        { name: 'Adobe Analytics', pattern: /assets\.adobedtm\.com|omtrdc\.net|AppMeasurement/i },
        { name: 'Mixpanel', pattern: /cdn\.mxpnl\.com|mixpanel\.init/i },
        { name: 'Amplitude', pattern: /cdn\.amplitude\.com|amplitude/i },
        { name: 'Hotjar', pattern: /static\.hotjar\.com|hotjar/i },
        { name: 'Segment', pattern: /cdn\.segment\.com|analytics\.min\.js/i },
        { name: 'Heap', pattern: /heap-analytics|heapanalytics/i },
        { name: 'Plausible', pattern: /plausible\.io\/js/i },
        { name: 'Fathom', pattern: /cdn\.usefathom\.com|fathom\.trackPageview/i },
        { name: 'Clarity', pattern: /clarity\.ms\/tag/i },
        { name: 'PostHog', pattern: /posthog\.com\/static|posthog\.init/i },
    ];
    const tagManagerPatterns = [
        { name: 'Google Tag Manager', pattern: /googletagmanager\.com\/gtm\.js|window\.dataLayer/i },
        { name: 'Adobe Launch', pattern: /assets\.adobedtm\.com.*launch/i },
        { name: 'Tealium', pattern: /tags\.tiqcdn\.com|utag\.js/i },
    ];

    analyticsPatterns.forEach(({ name, pattern }) => {
        if (pattern.test(allScriptText)) analyticsTools.push(name);
    });
    tagManagerPatterns.forEach(({ name, pattern }) => {
        if (pattern.test(allScriptText)) tagManagers.push(name);
    });

    // 2. Social media platforms from links
    const socialPlatforms = new Set();
    const platformPatterns = [
        { name: 'Facebook', pattern: /facebook\.com\/|fb\.com\//i, exclude: /sharer|dialog/i },
        { name: 'Twitter/X', pattern: /twitter\.com\/|x\.com\//i, exclude: /intent\/tweet/i },
        { name: 'LinkedIn', pattern: /linkedin\.com\//i },
        { name: 'Instagram', pattern: /instagram\.com\//i },
        { name: 'YouTube', pattern: /youtube\.com\/|youtu\.be\//i },
        { name: 'TikTok', pattern: /tiktok\.com\//i },
        { name: 'Pinterest', pattern: /pinterest\.com\//i, exclude: /pin\/create/i },
        { name: 'Yelp', pattern: /yelp\.com\/biz\//i },
        { name: 'Google Business', pattern: /google\.com\/maps|maps\.google|g\.page\//i },
        { name: 'Vimeo', pattern: /vimeo\.com\//i },
        { name: 'BBB', pattern: /bbb\.org\//i },
        { name: 'Nextdoor', pattern: /nextdoor\.com\//i },
        { name: 'Houzz', pattern: /houzz\.com\//i },
        { name: 'RealSelf', pattern: /realself\.com\//i },
    ];

    let sharingButtonsDetected = false;
    const sharePatterns = /facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent|linkedin\.com\/shareArticle|pinterest\.com\/pin\/create/i;

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        platformPatterns.forEach(({ name, pattern, exclude }) => {
            if (pattern.test(href) && (!exclude || !exclude.test(href))) {
                socialPlatforms.add(name);
            }
        });
        if (sharePatterns.test(href)) sharingButtonsDetected = true;
    });

    // Fallback: check classes/aria-labels for icon-based social links
    if (socialPlatforms.size === 0) {
        $('a[href], [role="link"]').each((_, el) => {
            const combined = (($(el).attr('class') || '') + ' ' + ($(el).attr('aria-label') || '') + ' ' + ($(el).attr('title') || '')).toLowerCase();
            if (/facebook|fa-facebook/i.test(combined)) socialPlatforms.add('Facebook');
            if (/twitter|fa-twitter|fa-x-twitter/i.test(combined)) socialPlatforms.add('Twitter/X');
            if (/instagram|fa-instagram/i.test(combined)) socialPlatforms.add('Instagram');
            if (/linkedin|fa-linkedin/i.test(combined)) socialPlatforms.add('LinkedIn');
            if (/youtube|fa-youtube/i.test(combined)) socialPlatforms.add('YouTube');
            if (/tiktok|fa-tiktok/i.test(combined)) socialPlatforms.add('TikTok');
            if (/pinterest|fa-pinterest/i.test(combined)) socialPlatforms.add('Pinterest');
            if (/yelp|fa-yelp/i.test(combined)) socialPlatforms.add('Yelp');
        });
    }

    // 3. CTA analysis
    const ctaSelectors = 'button, a.btn, a.button, [role="button"], input[type="submit"], input[type="button"], [class*="cta" i], [class*="call-to-action" i]';
    const ctaTexts = new Set();
    $(ctaSelectors).each((_, el) => {
        const text = ($(el).text() || $(el).attr('value') || $(el).attr('aria-label') || '').trim();
        if (text && text.length > 3 && text.length < 70) ctaTexts.add(text);
    });
    const primaryCtaPatterns = /buy now|get started|sign up|request|demo|learn more|contact us|shop now|book|schedule|call now|free quote|free consultation/i;
    const primaryCta = Array.from(ctaTexts).find(t => primaryCtaPatterns.test(t)) || Array.from(ctaTexts)[0] || null;

    // 4. OG / Twitter meta tags
    const ogTags = {};
    $('meta[property^="og:"]').each((_, el) => {
        ogTags[$(el).attr('property')] = ($(el).attr('content') || '').substring(0, 200);
    });
    const twitterTags = {};
    $('meta[name^="twitter:"]').each((_, el) => {
        twitterTags[$(el).attr('name')] = ($(el).attr('content') || '').substring(0, 200);
    });

    // 5. JSON-LD structured data
    const jsonLd = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            jsonLd.push({ type: data['@type'] || 'Unknown', keys: Object.keys(data).slice(0, 10) });
        } catch (e) { /* skip invalid JSON-LD */ }
    });

    // 6. Value proposition signals
    const h1Text = $('h1').first().text().trim().substring(0, 200) || null;
    const metaDesc = $('meta[name="description"]').attr('content') || null;
    const title = $('title').text().trim() || null;

    const result = {
        analytics: {
            tools: analyticsTools,
            tagManagers: tagManagers,
            hasDataLayer: /window\.dataLayer|dataLayer\.push/i.test(inlineJs),
        },
        social: {
            platforms: Array.from(socialPlatforms),
            sharingButtonsDetected,
            ogTagsPresent: Object.keys(ogTags).length > 0,
            twitterCardPresent: Object.keys(twitterTags).length > 0,
            ogTags, twitterTags,
        },
        cta: {
            texts: Array.from(ctaTexts).slice(0, 15),
            count: ctaTexts.size,
            primaryCta,
        },
        structuredData: { jsonLd },
        valueProposition: { h1: h1Text, metaDescription: metaDesc, title },
    };

    if (verbose) {
        console.log(`[CfHtmlExtractor] 📣 Marketing signals: analytics=${analyticsTools.join(',')||'none'}, social=${socialPlatforms.size} platforms, CTAs=${ctaTexts.size}, OG=${Object.keys(ogTags).length}, JSON-LD=${jsonLd.length}`);
    }
    return result;
}

module.exports = {
    extractSharedContextFromHtml,
    extractEATSignalsFromHtml,
    extractLeadCaptureFromHtml,
    extractCTAContextFromHtml,
    extractTrustSignalsFromHtml,
    discoverSelectorsFromHtml,
    buildDeterministicVisualEvidence,
    extractSecuritySignalsFromHtml,
    extractPrivacySignalsFromHtml,
    extractAccessibilitySignalsFromHtml,
    extractCompatibilitySignalsFromHtml,
    extractMarketingSignalsFromHtml,
};



