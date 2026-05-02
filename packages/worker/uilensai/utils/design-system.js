/**
 * Design System Extraction Scraper
 * 
 * Extracts the actual design system from a live page via Playwright.
 * Provides concrete, measurable design evidence instead of AI-fabricated scores.
 * 
 * Extracts:
 * 1. Color palette (most used colors, background colors, text colors)
 * 2. Typography (fonts used, size hierarchy, line heights)
 * 3. Spacing (padding/margin patterns, consistency)
 * 4. Component inventory (what UI components exist)
 * 5. Visual consistency metrics (how uniform is the design?)
 */

/**
 * Extract the design system from a live Playwright page
 * 
 * @param {import('playwright').Page} page - Playwright page
 * @param {boolean} verbose - Enable debug logging
 * @returns {Object} Extracted design system evidence
 */
async function extractDesignSystem(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyDesignSystem();
    }

    try {
        const designData = await page.evaluate(() => {
            // --- Color Extraction ---
            const colorCounts = {};
            const bgColorCounts = {};
            const textColorCounts = {};

            // --- Typography Extraction ---
            const fontFamilies = {};
            const fontSizes = {};
            const lineHeights = {};
            const fontWeights = {};

            // --- Spacing Extraction ---
            const paddingValues = {};
            const marginValues = {};
            const gapValues = {};
            const borderRadii = {};

            // Sample visible elements (limit to prevent performance issues)
            const allElements = document.querySelectorAll('body *');
            const sampleSize = Math.min(allElements.length, 300);
            const step = Math.max(1, Math.floor(allElements.length / sampleSize));

            let totalElements = 0;
            let elementsWithCustomFont = 0;

            for (let i = 0; i < allElements.length; i += step) {
                const el = allElements[i];
                const rect = el.getBoundingClientRect();

                // Skip invisible elements
                if (rect.width === 0 && rect.height === 0) continue;

                const styles = window.getComputedStyle(el);
                totalElements++;

                // Colors
                const color = styles.color;
                const bgColor = styles.backgroundColor;
                if (color && color !== 'rgba(0, 0, 0, 0)') {
                    textColorCounts[color] = (textColorCounts[color] || 0) + 1;
                }
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
                    bgColorCounts[bgColor] = (bgColorCounts[bgColor] || 0) + 1;
                }

                // Typography
                const fontFamily = styles.fontFamily;
                const fontSize = styles.fontSize;
                const lineHeight = styles.lineHeight;
                const fontWeight = styles.fontWeight;

                if (fontFamily) {
                    // Extract primary font name
                    const primaryFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
                    fontFamilies[primaryFont] = (fontFamilies[primaryFont] || 0) + 1;
                    if (!['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'Helvetica', 'sans-serif', 'serif', 'monospace'].some(f => primaryFont.toLowerCase().includes(f.toLowerCase()))) {
                        elementsWithCustomFont++;
                    }
                }
                if (fontSize) fontSizes[fontSize] = (fontSizes[fontSize] || 0) + 1;
                if (lineHeight && lineHeight !== 'normal') lineHeights[lineHeight] = (lineHeights[lineHeight] || 0) + 1;
                if (fontWeight) fontWeights[fontWeight] = (fontWeights[fontWeight] || 0) + 1;

                // Spacing
                const paddingTop = styles.paddingTop;
                const marginTop = styles.marginTop;
                const gap = styles.gap;
                const borderRadius = styles.borderRadius;

                if (paddingTop && paddingTop !== '0px') paddingValues[paddingTop] = (paddingValues[paddingTop] || 0) + 1;
                if (marginTop && marginTop !== '0px') marginValues[marginTop] = (marginValues[marginTop] || 0) + 1;
                if (gap && gap !== 'normal' && gap !== '0px') gapValues[gap] = (gapValues[gap] || 0) + 1;
                if (borderRadius && borderRadius !== '0px') borderRadii[borderRadius] = (borderRadii[borderRadius] || 0) + 1;
            }

            // --- Component Inventory ---
            const components = {
                navigation: !!document.querySelector('nav, [role="navigation"], header nav, .navbar, .nav-menu'),
                hero: !!document.querySelector('[class*="hero" i], [id*="hero" i], .banner, .jumbotron, [class*="masthead" i]'),
                cards: document.querySelectorAll('[class*="card" i], .tile, .panel:not(.panel-group)').length,
                forms: document.querySelectorAll('form').length,
                modals: document.querySelectorAll('[role="dialog"], .modal, [class*="popup" i]').length,
                carousel: !!document.querySelector('.carousel, .slider, .swiper, [class*="slider" i], [class*="carousel" i]'),
                footer: !!document.querySelector('footer, [role="contentinfo"]'),
                sidebar: !!document.querySelector('aside, [role="complementary"], .sidebar'),
                breadcrumbs: !!document.querySelector('[aria-label*="breadcrumb" i], .breadcrumb, nav.breadcrumb'),
                tabs: !!document.querySelector('[role="tablist"], .tabs, .tab-content'),
                accordion: !!document.querySelector('.accordion, [class*="accordion" i], [class*="collapsible" i]'),
                testimonials: !!document.querySelector('[class*="testimonial" i], [class*="review" i], blockquote'),
                gallery: !!document.querySelector('[class*="gallery" i], [class*="portfolio" i], .lightbox'),
                socialLinks: document.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="youtube.com"], a[href*="tiktok.com"]').length,
                chatWidget: !!document.querySelector('[class*="chat" i], [id*="chat" i], [class*="messenger" i], iframe[src*="chat"], #hubspot-messages-iframe-container'),
                mapEmbed: !!document.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google"], .google-map, [class*="map-container" i]'),
            };

            // --- Heading Hierarchy ---
            const headings = {};
            for (let i = 1; i <= 6; i++) {
                const els = document.querySelectorAll(`h${i}`);
                if (els.length > 0) {
                    headings[`h${i}`] = {
                        count: els.length,
                        examples: Array.from(els).slice(0, 3).map(h => ({
                            text: h.textContent?.trim().substring(0, 80) || '',
                            fontSize: window.getComputedStyle(h).fontSize,
                            fontWeight: window.getComputedStyle(h).fontWeight,
                        }))
                    };
                }
            }

            // Sort and take top entries for each collection
            function topEntries(obj, limit = 8) {
                return Object.entries(obj)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, limit)
                    .map(([value, count]) => ({ value, count }));
            }

            return {
                colors: {
                    text: topEntries(textColorCounts, 6),
                    background: topEntries(bgColorCounts, 6),
                },
                typography: {
                    families: topEntries(fontFamilies, 5),
                    sizes: topEntries(fontSizes, 10),
                    weights: topEntries(fontWeights, 5),
                    lineHeights: topEntries(lineHeights, 5),
                    customFontRatio: totalElements > 0 ? (elementsWithCustomFont / totalElements) : 0,
                },
                spacing: {
                    padding: topEntries(paddingValues, 8),
                    margin: topEntries(marginValues, 8),
                    gap: topEntries(gapValues, 5),
                    borderRadius: topEntries(borderRadii, 5),
                },
                components,
                headings,
                meta: {
                    totalElementsSampled: totalElements,
                }
            };
        });

        if (verbose) {
            console.log('[DesignSystem] Extracted design system:',
                `${designData.typography.families.length} fonts,`,
                `${designData.colors.text.length} text colors,`,
                `${designData.colors.background.length} bg colors,`,
                `${Object.keys(designData.components).filter(k => designData.components[k]).length} components`
            );
        }

        // Post-process: compute consistency metrics
        designData.consistency = computeConsistencyMetrics(designData);

        return designData;

    } catch (error) {
        if (verbose) console.error('[DesignSystem] Extraction failed:', error.message);
        return createEmptyDesignSystem();
    }
}

/**
 * Compute design consistency metrics from extracted data
 */
function computeConsistencyMetrics(designData) {
    const metrics = {};

    // Font consistency: fewer font families = more consistent
    const fontCount = designData.typography.families.length;
    if (fontCount <= 2) metrics.fontConsistency = { score: 95, detail: `${fontCount} font families — excellent consistency` };
    else if (fontCount <= 3) metrics.fontConsistency = { score: 80, detail: `${fontCount} font families — good consistency` };
    else if (fontCount <= 5) metrics.fontConsistency = { score: 55, detail: `${fontCount} font families — consider reducing` };
    else metrics.fontConsistency = { score: 30, detail: `${fontCount} font families — too many, inconsistent` };

    // Color consistency: limited palette = more professional
    const totalUniqueColors = designData.colors.text.length + designData.colors.background.length;
    if (totalUniqueColors <= 6) metrics.colorConsistency = { score: 90, detail: `${totalUniqueColors} unique colors — tight palette` };
    else if (totalUniqueColors <= 9) metrics.colorConsistency = { score: 75, detail: `${totalUniqueColors} unique colors — moderate palette` };
    else if (totalUniqueColors <= 12) metrics.colorConsistency = { score: 55, detail: `${totalUniqueColors} unique colors — consider consolidating` };
    else metrics.colorConsistency = { score: 30, detail: `${totalUniqueColors} unique colors — color palette is inconsistent` };

    // Spacing consistency: how many unique spacing values are used?
    const uniqueSpacing = new Set([
        ...designData.spacing.padding.map(p => p.value),
        ...designData.spacing.margin.map(m => m.value),
    ]);
    if (uniqueSpacing.size <= 6) metrics.spacingConsistency = { score: 90, detail: `${uniqueSpacing.size} unique spacing values — systematic` };
    else if (uniqueSpacing.size <= 10) metrics.spacingConsistency = { score: 70, detail: `${uniqueSpacing.size} unique spacing values — mostly systematic` };
    else if (uniqueSpacing.size <= 15) metrics.spacingConsistency = { score: 45, detail: `${uniqueSpacing.size} unique spacing values — needs systematization` };
    else metrics.spacingConsistency = { score: 25, detail: `${uniqueSpacing.size} unique spacing values — chaotic spacing` };

    // Heading hierarchy: proper H1 > H2 > H3 size progression?
    let hierarchyProper = true;
    const headingSizes = {};
    Object.entries(designData.headings).forEach(([tag, data]) => {
        if (data.examples && data.examples.length > 0) {
            headingSizes[tag] = parseFloat(data.examples[0].fontSize) || 0;
        }
    });

    if (headingSizes.h1 && headingSizes.h2 && headingSizes.h1 <= headingSizes.h2) hierarchyProper = false;
    if (headingSizes.h2 && headingSizes.h3 && headingSizes.h2 <= headingSizes.h3) hierarchyProper = false;

    const h1Count = designData.headings.h1?.count || 0;
    if (h1Count === 1 && hierarchyProper) {
        metrics.headingHierarchy = { score: 95, detail: 'Single H1, proper size progression' };
    } else if (h1Count === 1) {
        metrics.headingHierarchy = { score: 70, detail: 'Single H1 but size progression is inconsistent' };
    } else if (h1Count === 0) {
        metrics.headingHierarchy = { score: 35, detail: 'Missing H1 — every page should have exactly one H1' };
    } else {
        metrics.headingHierarchy = { score: 45, detail: `${h1Count} H1 elements — should have exactly one` };
    }

    // Has custom font (non-system)?
    const hasCustomFont = designData.typography.customFontRatio > 0.3;
    metrics.typographyQuality = {
        score: hasCustomFont ? 85 : 50,
        detail: hasCustomFont ? 'Uses custom webfont — professional typography' : 'Relies on system fonts — consider a custom font for brand identity'
    };

    // Component completeness for a professional site
    const { components } = designData;
    const hasEssentials = components.navigation && components.footer;
    const hasEngagement = components.testimonials || components.gallery || components.chatWidget;
    const hasLocalSignals = components.mapEmbed || components.socialLinks > 0;

    let componentScore = 40;
    if (hasEssentials) componentScore += 25;
    if (components.hero) componentScore += 10;
    if (hasEngagement) componentScore += 15;
    if (hasLocalSignals) componentScore += 10;
    metrics.componentCompleteness = {
        score: Math.min(100, componentScore),
        detail: `${Object.values(components).filter(v => v && v !== 0).length} component types detected`
    };

    // Overall consistency score
    const scores = Object.values(metrics).map(m => m.score);
    metrics.overall = {
        score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
        detail: `Average across ${scores.length} consistency dimensions`
    };

    return metrics;
}

function createEmptyDesignSystem() {
    return {
        colors: { text: [], background: [] },
        typography: { families: [], sizes: [], weights: [], lineHeights: [], customFontRatio: 0 },
        spacing: { padding: [], margin: [], gap: [], borderRadius: [] },
        components: {},
        headings: {},
        consistency: { overall: { score: 50, detail: 'Design system extraction failed' } },
        meta: { totalElementsSampled: 0 }
    };
}

module.exports = {
    extractDesignSystem,
    computeConsistencyMetrics,
};
