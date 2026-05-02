/**
 * DOM Structure Collector
 * 
 * Extracts observable structural signals directly from HTML.
 * These deterministic signals are used by the scoring engine to calculate base scores.
 */
const cheerio = require('cheerio');

/**
 * Parses HTML and extracts structural signals for SEO, Accessibility, Privacy, UI, etc.
 * @param {string} html - Raw HTML of the page
 * @returns {object} Extracted signals
 */
function collectDomSignals(html) {
    const signals = {};
    if (!html) return signals;

    try {
        const $ = cheerio.load(html);

        // --- SEO Signals ---
        const title = $('title').text() || '';
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        signals.titleLength = title.length;
        signals.metaDescriptionLength = metaDesc.length;
        signals.h1Count = $('h1').length;
        signals.hasCanonical = $('link[rel="canonical"]').length > 0;
        signals.hasOgTags = $('meta[property^="og:"]').length > 0;
        signals.wordCount = $('body').text().split(/\s+/).filter(w => w.length > 2).length;

        // --- Accessibility Signals ---
        const imgCount = $('img').length;
        const imgWithAlt = $('img[alt]').filter((_, el) => ($(el).attr('alt') || '').trim().length > 0).length;
        signals.altTextCoverage = imgCount > 0 ? (imgWithAlt / imgCount) : 1.0;
        
        let hHierarchyValid = true;
        let lastLevel = 0;
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const level = parseInt(el.tagName.substring(1));
            // Ensure we don't skip levels (e.g. H1 -> H3 is invalid)
            if (lastLevel > 0 && level > lastLevel + 1) hHierarchyValid = false;
            lastLevel = level;
        });
        signals.headingHierarchyValid = hHierarchyValid && signals.h1Count > 0;
        
        const inputCount = $('input:not([type="hidden"]):not([type="submit"]), textarea, select').length;
        let labeledCount = 0;
        $('input:not([type="hidden"]):not([type="submit"]), textarea, select').each((_, el) => {
            const $el = $(el);
            if ($el.attr('id') && $(`label[for="${$el.attr('id')}"]`).length > 0) labeledCount++;
            else if ($el.closest('label').length > 0) labeledCount++;
            else if ($el.attr('aria-label') || $el.attr('aria-labelledby')) labeledCount++;
        });
        signals.formLabelCoverage = inputCount > 0 ? (labeledCount / inputCount) : 1.0;
        
        signals.hasAriaLandmarks = $('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], header, nav, main, footer').length > 0;
        signals.hasLangAttribute = !!$('html').attr('lang');
        signals.hasSkipLink = $('a[href^="#"]').filter((_, el) => /skip/i.test($(el).text())).length > 0;

        // --- Privacy Signals ---
        const links = $('a').map((_, el) => $(el).attr('href') || '').get();
        signals.hasPrivacyPolicy = links.some(href => /privacy/i.test(href));
        signals.hasConsentBanner = $('[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"]').length > 0;
        // Note: thirdPartyTrackerCount is better done with network collector, but can approximate from scripts:
        signals.thirdPartyTrackerCount = $('script[src*="google-analytics"], script[src*="facebook.net"], script[src*="hotjar"]').length; 
        
        // --- UI / Compatibility Signals ---
        signals.hasViewportMeta = $('meta[name="viewport"]').length > 0;
        // Approximate DOCTYPE check since Cheerio might abstract it, but if raw HTML starts with it:
        signals.hasDoctype = html.trim().toLowerCase().startsWith('<!doctype html');
        signals.hasCharsetMeta = $('meta[charset]').length > 0 || $('meta[http-equiv="Content-Type"]').length > 0;
        signals.hasResponsiveImages = $('picture, img[srcset]').length > 0;
        
        // --- Marketing / Conversion Signals ---
        const pageScripts = $('script').text().toLowerCase();
        signals.hasAnalytics = signals.thirdPartyTrackerCount > 0 || pageScripts.includes('gtag') || pageScripts.includes('analytics');
        
        // Extract hostnames to count unique social platforms
        const socialPlatforms = new Set();
        links.forEach(href => {
            if (/facebook\.com/i.test(href)) socialPlatforms.add('facebook');
            if (/twitter\.com|x\.com/i.test(href)) socialPlatforms.add('twitter');
            if (/linkedin\.com/i.test(href)) socialPlatforms.add('linkedin');
            if (/instagram\.com/i.test(href)) socialPlatforms.add('instagram');
            if (/youtube\.com/i.test(href)) socialPlatforms.add('youtube');
        });
        signals.socialLinksCount = socialPlatforms.size;

        signals.hasSchemaMarkup = $('script[type="application/ld+json"]').length > 0;
        signals.hasTwitterCard = $('meta[name^="twitter:"]').length > 0;
        signals.formCount = $('form').length;
        // Count anything looking like a CTA (buttons, or links styled as buttons)
        signals.ctaCount = $('button, a[class*="btn"], a[class*="button"]').length;
        // Count elements hinting at trust (e.g., reviews, guarantee badges)
        signals.trustSignalCount = $('[class*="trust"], [class*="review"], [class*="testimonial"], img[src*="secure"], img[src*="guarantee"]').length;
        // Check for basic contact traces
        signals.hasContactInfo = links.some(href => /^tel:|^mailto:/i.test(href) || /contact/i.test(href));

    } catch (e) {
        console.error(`[DomStructureCollector] Failed to parse HTML: ${e.message}`);
    }

    return signals;
}

module.exports = { collectDomSignals };
