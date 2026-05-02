/**
 * Brand Consistency Signals — Evidence-Based Utility
 *
 * Extracts brand identity markers from live pages for marketing assessment.
 * Measures visual brand consistency, typography discipline, and identity completeness.
 *
 * Dimensions:
 * 1. Logo detection (img in header/nav, SVG logos, brand aria-labels)
 * 2. Color palette extraction (CSS custom properties, computed header colors)
 * 3. Typography audit (font family count, web font usage)
 * 4. Favicon & meta branding (favicon, apple-touch-icon, theme-color)
 * 5. Brand name consistency (title, OG, schema vs visible brand)
 *
 * All metrics are deterministic — no AI fabrication.
 */

/**
 * Extract brand consistency signals from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} Brand evidence
 */
async function extractBrandSignals(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyBrand();
    }

    try {
        const rawData = await page.evaluate(() => {
            // --- 1. Logo Detection ---
            const headerArea = document.querySelector('header') || document.querySelector('nav') || document.querySelector('[class*="header" i]');
            let logoDetected = false;
            let logoType = 'none';
            let logoAlt = '';

            if (headerArea) {
                // Check for img logo
                const logoImg = headerArea.querySelector('img[class*="logo" i], img[alt*="logo" i], img[id*="logo" i], a img:first-child');
                if (logoImg) {
                    logoDetected = true;
                    logoType = 'img';
                    logoAlt = logoImg.alt || '';
                }
                // Check for SVG logo
                if (!logoDetected) {
                    const logoSvg = headerArea.querySelector('svg[class*="logo" i], a > svg, [class*="logo" i] svg');
                    if (logoSvg) {
                        logoDetected = true;
                        logoType = 'svg';
                        logoAlt = logoSvg.getAttribute('aria-label') || '';
                    }
                }
                // Check for text logo
                if (!logoDetected) {
                    const logoText = headerArea.querySelector('[class*="logo" i], [id*="logo" i], .brand, .site-name');
                    if (logoText && logoText.textContent?.trim().length > 0 && logoText.textContent.trim().length < 50) {
                        logoDetected = true;
                        logoType = 'text';
                        logoAlt = logoText.textContent.trim();
                    }
                }
            }

            // --- 2. Color Palette ---
            const rootStyles = getComputedStyle(document.documentElement);
            const cssVarColors = [];
            // Try to read common CSS custom property patterns
            const commonColorVars = [
                '--primary', '--secondary', '--accent', '--brand', '--color-primary',
                '--color-secondary', '--color-accent', '--bg-primary', '--text-primary',
                '--primary-color', '--secondary-color', '--accent-color',
            ];
            commonColorVars.forEach(v => {
                const val = rootStyles.getPropertyValue(v).trim();
                if (val && val.length > 0) {
                    cssVarColors.push({ name: v, value: val });
                }
            });

            // Computed colors from key elements
            const keyElements = {
                body: document.body,
                header: document.querySelector('header'),
                nav: document.querySelector('nav'),
                hero: document.querySelector('[class*="hero" i], [id*="hero" i], header + section'),
                footer: document.querySelector('footer'),
            };
            const computedColors = {};
            Object.entries(keyElements).forEach(([name, el]) => {
                if (el) {
                    const styles = getComputedStyle(el);
                    computedColors[name] = {
                        bg: styles.backgroundColor,
                        color: styles.color,
                    };
                }
            });

            // --- 3. Typography ---
            const fontFamilies = new Set();
            const elementsToCheck = document.querySelectorAll('h1, h2, h3, p, a, button, span, li');
            elementsToCheck.forEach(el => {
                const ff = getComputedStyle(el).fontFamily;
                if (ff) {
                    // Extract primary font name
                    const primary = ff.split(',')[0].trim().replace(/['"]/g, '');
                    if (primary && primary.length > 0 && !primary.match(/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit)$/i)) {
                        fontFamilies.add(primary);
                    }
                }
            });

            // Web fonts detection
            const webFontLinks = document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[href*="typekit"]');
            const fontFaceRules = Array.from(document.styleSheets)
                .flatMap(sheet => {
                    try { return Array.from(sheet.cssRules || []); }
                    catch (e) { return []; }
                })
                .filter(rule => rule instanceof CSSFontFaceRule)
                .length;

            // --- 4. Favicon & Meta Branding ---
            const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
            const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
            const themeColor = document.querySelector('meta[name="theme-color"]')?.content || '';
            const manifestLink = document.querySelector('link[rel="manifest"]');

            // --- 5. Brand Name Consistency ---
            const pageTitle = document.title || '';
            const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content || '';
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';

            // Try to extract brand name from structured data
            let schemaName = '';
            document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
                try {
                    const data = JSON.parse(s.textContent);
                    const items = Array.isArray(data) ? data : [data];
                    items.forEach(item => {
                        if (item.name && ['Organization', 'LocalBusiness', 'WebSite'].includes(item['@type'])) {
                            schemaName = item.name;
                        }
                        if (item['@graph']) {
                            item['@graph'].forEach(sub => {
                                if (sub.name && ['Organization', 'LocalBusiness', 'WebSite'].includes(sub['@type'])) {
                                    schemaName = sub.name;
                                }
                            });
                        }
                    });
                } catch (e) { /* ignore */ }
            });

            return {
                logo: { detected: logoDetected, type: logoType, alt: logoAlt.substring(0, 100) },
                colors: { cssVars: cssVarColors, computed: computedColors },
                typography: {
                    fontFamilies: Array.from(fontFamilies).slice(0, 10),
                    fontCount: fontFamilies.size,
                    hasWebFonts: webFontLinks.length > 0 || fontFaceRules > 0,
                    webFontLinks: webFontLinks.length,
                    fontFaceRules,
                },
                branding: {
                    hasFavicon: !!favicon,
                    hasAppleTouchIcon: !!appleTouchIcon,
                    themeColor,
                    hasManifest: !!manifestLink,
                },
                brandName: {
                    fromTitle: pageTitle.substring(0, 100),
                    fromOgSiteName: ogSiteName,
                    fromOgTitle: ogTitle.substring(0, 100),
                    fromSchema: schemaName.substring(0, 100),
                },
            };
        });

        const scored = scoreBrandConsistency(rawData);
        rawData.scores = scored;

        if (verbose) {
            console.log('[BrandSignals] Logo:', rawData.logo.detected ? `${rawData.logo.type} (${rawData.logo.alt})` : 'not detected');
            console.log('[BrandSignals] Fonts:', rawData.typography.fontCount, rawData.typography.fontFamilies.join(', '));
            console.log('[BrandSignals] CSS vars:', rawData.colors.cssVars.length, 'color variables');
            console.log('[BrandSignals] Overall score:', scored.overall.score);
        }

        return rawData;

    } catch (error) {
        if (verbose) console.error('[BrandSignals] Extraction failed:', error.message);
        return createEmptyBrand();
    }
}

/**
 * Score brand consistency (0-100)
 */
function scoreBrandConsistency(data) {
    const scores = {};

    // Logo (20 points)
    let logoScore = 0;
    if (data.logo.detected) {
        logoScore = 15;
        if (data.logo.alt && data.logo.alt.length > 3) logoScore += 5; // Has descriptive alt
    }
    scores.logo = { score: logoScore, detail: data.logo.detected ? `${data.logo.type} logo${data.logo.alt ? ': ' + data.logo.alt : ''}` : 'No logo detected' };

    // Typography discipline (20 points)
    let typoScore = 0;
    if (data.typography.fontCount <= 3 && data.typography.fontCount >= 1) {
        typoScore = 15; // Good — disciplined font usage
    } else if (data.typography.fontCount <= 5) {
        typoScore = 10; // OK
    } else if (data.typography.fontCount > 5) {
        typoScore = 5; // Too many fonts — inconsistent
    }
    if (data.typography.hasWebFonts) typoScore += 5; // Uses custom fonts
    scores.typography = { score: Math.min(20, typoScore), detail: `${data.typography.fontCount} font families, web fonts: ${data.typography.hasWebFonts}` };

    // Color system (20 points)
    let colorScore = 0;
    if (data.colors.cssVars.length >= 3) colorScore = 15; // Has a design system
    else if (data.colors.cssVars.length >= 1) colorScore = 10;
    else colorScore = 5; // No CSS vars = no design system
    // Theme color in meta
    if (data.branding.themeColor) colorScore += 5;
    scores.colorSystem = { score: Math.min(20, colorScore), detail: `${data.colors.cssVars.length} CSS color vars, theme-color: ${data.branding.themeColor || 'none'}` };

    // Meta branding (20 points)
    let metaScore = 0;
    if (data.branding.hasFavicon) metaScore += 7;
    if (data.branding.hasAppleTouchIcon) metaScore += 5;
    if (data.branding.hasManifest) metaScore += 5;
    if (data.brandName.fromOgSiteName) metaScore += 3;
    scores.metaBranding = { score: Math.min(20, metaScore), detail: `Favicon: ${data.branding.hasFavicon}, Apple: ${data.branding.hasAppleTouchIcon}, Manifest: ${data.branding.hasManifest}` };

    // Brand name consistency (20 points)
    let nameScore = 0;
    const names = [data.brandName.fromTitle, data.brandName.fromOgSiteName, data.brandName.fromSchema].filter(Boolean);
    if (names.length >= 2) {
        // Check if brand names are consistent
        const normalized = names.map(n => n.toLowerCase().trim());
        const allMatch = normalized.every((n, i, arr) => i === 0 || n.includes(arr[0]) || arr[0].includes(n));
        if (allMatch) nameScore = 20;
        else nameScore = 10; // Partial consistency
    } else if (names.length === 1) {
        nameScore = 12;
    }
    scores.nameConsistency = { score: nameScore, detail: names.length > 0 ? names.join(' | ') : 'No brand name detected' };

    // Overall
    scores.overall = {
        score: scores.logo.score + scores.typography.score + scores.colorSystem.score + scores.metaBranding.score + scores.nameConsistency.score,
        detail: `Brand consistency across 5 dimensions`,
    };

    return scores;
}

function createEmptyBrand() {
    return {
        logo: { detected: false, type: 'none', alt: '' },
        colors: { cssVars: [], computed: {} },
        typography: { fontFamilies: [], fontCount: 0, hasWebFonts: false },
        branding: { hasFavicon: false, hasAppleTouchIcon: false, themeColor: '', hasManifest: false },
        brandName: { fromTitle: '', fromOgSiteName: '', fromOgTitle: '', fromSchema: '' },
        scores: { overall: { score: 0, detail: 'Brand signal extraction failed' } },
    };
}

module.exports = {
    extractBrandSignals,
    scoreBrandConsistency,
};
