/**
 * Content Quality Analyzer
 * 
 * Evidence-based content quality metrics extracted from live pages.
 * Replaces AI-fabricated content scores with measurable text quality metrics.
 * 
 * Metrics:
 * 1. Reading level (Flesch-Kincaid grade level)
 * 2. Content depth (word count, paragraph structure, list usage)
 * 3. Heading quality (H1 relevance, hierarchy, descriptiveness)
 * 4. Meta quality (title, description length and keyword presence)
 * 5. Content freshness indicators
 * 6. Internal/external link quality
 */

/**
 * Extract content quality metrics from a live page
 * 
 * @param {import('playwright').Page} page - Playwright page
 * @param {boolean} verbose
 * @returns {Object} Content quality evidence
 */
async function extractContentQuality(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyContentQuality();
    }

    try {
        const contentData = await page.evaluate(() => {
            // --- Meta Tags ---
            const title = document.title || '';
            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
            const metaKeywords = document.querySelector('meta[name="keywords"]')?.content || '';
            const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || '';
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
            const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
            const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
            const twitterCard = document.querySelector('meta[name="twitter:card"]')?.content || '';
            const robots = document.querySelector('meta[name="robots"]')?.content || '';

            // --- Heading Structure ---
            const headings = [];
            for (let i = 1; i <= 6; i++) {
                document.querySelectorAll(`h${i}`).forEach(h => {
                    headings.push({
                        level: i,
                        text: h.textContent?.trim().substring(0, 120) || '',
                        wordCount: (h.textContent?.trim().split(/\s+/) || []).length,
                    });
                });
            }

            // --- Body Content ---
            // Get main content area (prefer <main>, <article>, then fall back to body)
            const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
            const paragraphs = mainContent.querySelectorAll('p');
            const lists = mainContent.querySelectorAll('ul, ol');
            const listItems = mainContent.querySelectorAll('li');
            const images = mainContent.querySelectorAll('img');
            const videos = mainContent.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');

            // Get readable text content (strip nav, footer, scripts)
            const clonedContent = mainContent.cloneNode(true);
            clonedContent.querySelectorAll('nav, footer, script, style, noscript, [aria-hidden="true"]').forEach(el => el.remove());
            const bodyText = clonedContent.textContent?.replace(/\s+/g, ' ').trim() || '';

            // --- Text Statistics ---
            const words = bodyText.split(/\s+/).filter(w => w.length > 0);
            const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 5);
            const syllableCount = words.reduce((total, word) => total + countSyllables(word), 0);

            function countSyllables(word) {
                word = word.toLowerCase().replace(/[^a-z]/g, '');
                if (word.length <= 3) return 1;
                word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
                word = word.replace(/^y/, '');
                const vowelGroups = word.match(/[aeiouy]{1,2}/g);
                return vowelGroups ? vowelGroups.length : 1;
            }

            // --- Link Analysis ---
            const links = mainContent.querySelectorAll('a[href]');
            let internalLinks = 0;
            let externalLinks = 0;
            let brokenLinkCandidates = 0; // Links with href="#" or empty href
            const currentHost = window.location.hostname;

            links.forEach(a => {
                const href = a.getAttribute('href') || '';
                if (href === '#' || href === '' || href === 'javascript:void(0)') {
                    brokenLinkCandidates++;
                } else if (href.startsWith('/') || href.includes(currentHost)) {
                    internalLinks++;
                } else if (href.startsWith('http')) {
                    externalLinks++;
                }
            });

            // --- Image Quality ---
            const imageData = Array.from(images).slice(0, 20).map(img => ({
                hasAlt: !!img.getAttribute('alt'),
                altText: (img.getAttribute('alt') || '').substring(0, 80),
                altIsDescriptive: (img.getAttribute('alt') || '').length > 5,
                isLazy: !!img.getAttribute('loading') || !!img.getAttribute('data-src') || !!img.getAttribute('data-lazy'),
                isNextGen: /\.(webp|avif)($|\?)/i.test(img.src || img.getAttribute('data-src') || ''),
                width: img.naturalWidth || 0,
                height: img.naturalHeight || 0,
            }));

            // --- Schema/Structured Data ---
            const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
            const schemas = [];
            schemaScripts.forEach(s => {
                try {
                    const data = JSON.parse(s.textContent);
                    schemas.push(data['@type'] || 'Unknown');
                } catch (e) { /* ignore parse errors */ }
            });

            // --- Freshness Indicators ---
            const datePatterns = document.body.textContent?.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
            const publishedMeta = document.querySelector('meta[property="article:published_time"]')?.content || '';
            const modifiedMeta = document.querySelector('meta[property="article:modified_time"]')?.content || '';

            // --- BEST-IN-CLASS: Content-to-HTML Ratio ---
            const totalHTMLBytes = document.documentElement.outerHTML.length;
            const visibleTextBytes = bodyText.length;
            const contentToHtmlRatio = totalHTMLBytes > 0 ? Math.round((visibleTextBytes / totalHTMLBytes) * 10000) / 100 : 0;

            // --- BEST-IN-CLASS: Title ↔ H1 Duplicate Check ---
            const h1Texts = Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim().toLowerCase() || '');
            const titleLower = title.toLowerCase().trim();
            const titleH1Duplicate = h1Texts.some(h1 => {
                if (!h1 || !titleLower) return false;
                // Exact match or H1 is contained in title or vice versa
                return h1 === titleLower || titleLower.includes(h1) || h1.includes(titleLower);
            });
            // Check if title is just the brand/site name (lazy SEO)
            const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content || '';
            const titleIsBrandOnly = ogSiteName && titleLower === ogSiteName.toLowerCase().trim();

            return {
                meta: {
                    title, titleLength: title.length,
                    metaDesc, metaDescLength: metaDesc.length,
                    metaKeywords, canonicalUrl,
                    ogTitle, ogDesc, ogImage, twitterCard, robots,
                },
                headings,
                content: {
                    wordCount: words.length,
                    sentenceCount: sentences.length,
                    syllableCount,
                    paragraphCount: paragraphs.length,
                    listCount: lists.length,
                    listItemCount: listItems.length,
                    avgWordsPerSentence: sentences.length > 0 ? Math.round(words.length / sentences.length * 10) / 10 : 0,
                    avgSyllablesPerWord: words.length > 0 ? Math.round(syllableCount / words.length * 100) / 100 : 0,
                    // BEST-IN-CLASS: New content efficiency metrics
                    contentToHtmlRatio,
                    totalHTMLBytes,
                    visibleTextBytes,
                    titleH1Duplicate,
                    titleIsBrandOnly,
                },
                links: {
                    internal: internalLinks,
                    external: externalLinks,
                    brokenCandidates: brokenLinkCandidates,
                    total: links.length,
                },
                images: {
                    total: images.length,
                    withAlt: imageData.filter(i => i.hasAlt).length,
                    withDescriptiveAlt: imageData.filter(i => i.altIsDescriptive).length,
                    lazyLoaded: imageData.filter(i => i.isLazy).length,
                    nextGenFormat: imageData.filter(i => i.isNextGen).length,
                    details: imageData,
                },
                videos: { count: videos.length },
                schema: { types: schemas, count: schemas.length },
                freshness: {
                    datesFound: datePatterns.slice(0, 5),
                    publishedTime: publishedMeta,
                    modifiedTime: modifiedMeta,
                }
            };
        });

        // Post-process: compute quality scores
        contentData.scores = computeContentScores(contentData);

        if (verbose) {
            console.log('[ContentQuality] Extracted:',
                `${contentData.content.wordCount} words,`,
                `${contentData.headings.length} headings,`,
                `${contentData.images.total} images,`,
                `${contentData.schema.count} schemas,`,
                `Score: ${contentData.scores.overall.score}`
            );
        }

        return contentData;

    } catch (error) {
        if (verbose) console.error('[ContentQuality] Extraction failed:', error.message);
        return createEmptyContentQuality();
    }
}

/**
 * Compute evidence-based content quality scores
 */
function computeContentScores(data) {
    const scores = {};

    // --- Meta Quality ---
    let metaScore = 0;
    const { title, titleLength, metaDesc, metaDescLength, ogTitle, ogImage, canonicalUrl } = data.meta;

    // Title: 30-60 chars is ideal
    if (titleLength >= 30 && titleLength <= 60) metaScore += 25;
    else if (titleLength >= 15 && titleLength <= 70) metaScore += 15;
    else if (titleLength > 0) metaScore += 5;

    // Meta description: 120-160 chars is ideal
    if (metaDescLength >= 120 && metaDescLength <= 160) metaScore += 25;
    else if (metaDescLength >= 50 && metaDescLength <= 200) metaScore += 15;
    else if (metaDescLength > 0) metaScore += 5;

    // Open Graph
    if (ogTitle) metaScore += 15;
    if (ogImage) metaScore += 15;

    // Canonical URL
    if (canonicalUrl) metaScore += 10;

    // Unique title (not generic)
    if (title && !/(home|homepage|welcome|untitled)/i.test(title)) metaScore += 10;

    scores.meta = { score: Math.min(100, metaScore), detail: `Title ${titleLength}ch, Desc ${metaDescLength}ch, OG:${ogTitle ? '✓' : '✗'}, Canonical:${canonicalUrl ? '✓' : '✗'}` };

    // --- Reading Level (Flesch-Kincaid) ---
    const { wordCount, sentenceCount, avgWordsPerSentence, avgSyllablesPerWord } = data.content;
    let fleschKincaid = 0;
    if (sentenceCount > 0 && wordCount > 0) {
        fleschKincaid = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
        fleschKincaid = Math.max(0, Math.min(18, fleschKincaid));
    }

    // Grade 6-9 is ideal for web content
    let readabilityScore = 50;
    if (fleschKincaid >= 6 && fleschKincaid <= 9) readabilityScore = 90;
    else if (fleschKincaid >= 4 && fleschKincaid <= 11) readabilityScore = 75;
    else if (fleschKincaid >= 2 && fleschKincaid <= 13) readabilityScore = 60;
    else if (fleschKincaid > 13) readabilityScore = 40; // Too complex
    else readabilityScore = 55; // Too simple

    // WORLD-CLASS GAP 6: Floor for very short content (<300 words) where FK is statistically unreliable
    // Heading-heavy marketing pages have inflated words-per-sentence due to few periods
    if (wordCount < 300 && readabilityScore < 55) {
        readabilityScore = 55; // Short content gets benefit of the doubt
    }

    scores.readability = { score: readabilityScore, gradeLevel: Math.round(fleschKincaid * 10) / 10, detail: `Flesch-Kincaid grade ${Math.round(fleschKincaid * 10) / 10}, ${avgWordsPerSentence} words/sentence${wordCount < 300 ? ' (short content floor applied)' : ''}` };

    // --- Content Depth ---
    let depthScore = 0;
    if (wordCount >= 800) depthScore += 30;
    else if (wordCount >= 400) depthScore += 20;
    else if (wordCount >= 150) depthScore += 10;
    else depthScore += 5; // Very thin content

    if (data.content.paragraphCount >= 4) depthScore += 15;
    else if (data.content.paragraphCount >= 2) depthScore += 10;

    if (data.content.listCount >= 1) depthScore += 10; // Uses lists for scannability
    if (data.images.total >= 2) depthScore += 10; // Visual content
    if (data.videos.count >= 1) depthScore += 10; // Video content
    if (data.schema.count >= 1) depthScore += 10; // Structured data

    // Heading usage adds depth
    const h2Count = data.headings.filter(h => h.level === 2).length;
    if (h2Count >= 3) depthScore += 15;
    else if (h2Count >= 1) depthScore += 10;

    scores.depth = { score: Math.min(100, depthScore), detail: `${wordCount} words, ${data.content.paragraphCount} paragraphs, ${h2Count} H2s, ${data.images.total} images` };

    // --- Heading Quality ---
    let headingScore = 0;
    const h1s = data.headings.filter(h => h.level === 1);

    if (h1s.length === 1) headingScore += 30; // Exactly one H1
    else if (h1s.length > 1) headingScore += 10; // Multiple H1s
    else headingScore += 0; // No H1

    // H1 is descriptive (not just company name, not too short)
    if (h1s.length > 0 && h1s[0].wordCount >= 3) headingScore += 20;
    else if (h1s.length > 0 && h1s[0].wordCount >= 2) headingScore += 10;

    // Proper heading hierarchy (H2s exist, they're descriptive)
    if (h2Count >= 2) headingScore += 25;
    else if (h2Count >= 1) headingScore += 15;

    // No heading level skips (e.g., H1 → H3 without H2)
    const levels = [...new Set(data.headings.map(h => h.level))].sort();
    let hasSkip = false;
    for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) hasSkip = true;
    }
    if (!hasSkip && levels.length >= 2) headingScore += 15;
    else if (hasSkip) headingScore += 5;

    scores.headings = { score: Math.min(100, headingScore), detail: `${h1s.length} H1, ${h2Count} H2, hierarchy ${hasSkip ? 'has gaps' : 'proper'}` };

    // --- Image SEO ---
    let imageScore = 50;
    if (data.images.total === 0) {
        imageScore = 40; // No images isn't necessarily bad but not ideal
        scores.images = { score: imageScore, detail: 'No images found' };
    } else {
        const altRatio = data.images.withDescriptiveAlt / data.images.total;
        const lazyRatio = data.images.lazyLoaded / data.images.total;
        const nextGenRatio = data.images.nextGenFormat / data.images.total;

        imageScore = Math.round(
            altRatio * 40 +      // Alt text quality
            lazyRatio * 25 +     // Lazy loading
            nextGenRatio * 20 +  // Modern formats
            (data.images.total >= 2 ? 15 : 5) // Has enough images
        );

        scores.images = { score: Math.min(100, imageScore), detail: `${data.images.withDescriptiveAlt}/${data.images.total} have descriptive alt, ${data.images.lazyLoaded} lazy, ${data.images.nextGenFormat} next-gen` };
    }

    // --- Link Quality ---
    let linkScore = 50;
    if (data.links.internal >= 3) linkScore += 20;
    else if (data.links.internal >= 1) linkScore += 10;

    if (data.links.external >= 1 && data.links.external <= 5) linkScore += 15; // Some external = good
    if (data.links.brokenCandidates === 0) linkScore += 15;
    else linkScore -= data.links.brokenCandidates * 5;

    scores.links = { score: Math.max(0, Math.min(100, linkScore)), detail: `${data.links.internal} internal, ${data.links.external} external, ${data.links.brokenCandidates} potential broken` };

    // --- Schema Quality ---
    let schemaScore = 0;
    if (data.schema.count >= 2) schemaScore = 90;
    else if (data.schema.count === 1) schemaScore = 65;
    else schemaScore = 20;

    scores.schema = { score: schemaScore, detail: data.schema.count > 0 ? `${data.schema.types.join(', ')}` : 'No structured data found' };

    // --- BEST-IN-CLASS: Content Efficiency ---
    let efficiencyScore = 50;
    const ratio = data.content.contentToHtmlRatio || 0;
    // Ideal content-to-HTML ratio is 25-70% (content-rich but styled)
    if (ratio >= 25 && ratio <= 70) efficiencyScore = 90;
    else if (ratio >= 15 && ratio < 25) efficiencyScore = 70; // Heavy on markup
    else if (ratio > 70) efficiencyScore = 75; // Very text-heavy (minimal styling)
    else if (ratio >= 5 && ratio < 15) efficiencyScore = 45; // Template-heavy
    else efficiencyScore = 25; // Very low content

    // Penalty for title↔H1 duplication
    if (data.content.titleH1Duplicate) efficiencyScore -= 10;
    // Penalty for brand-only title
    if (data.content.titleIsBrandOnly) efficiencyScore -= 15;

    scores.efficiency = {
        score: Math.max(0, Math.min(100, efficiencyScore)),
        detail: `Content:HTML ratio ${ratio}%, title↔H1 duplicate: ${data.content.titleH1Duplicate ? 'yes' : 'no'}, brand-only title: ${data.content.titleIsBrandOnly ? 'yes' : 'no'}`
    };

    // --- Overall Content Quality (updated weights to include efficiency) ---
    scores.overall = {
        score: Math.round(
            scores.meta.score * 0.18 +
            scores.readability.score * 0.14 +
            scores.depth.score * 0.18 +
            scores.headings.score * 0.14 +
            scores.images.score * 0.09 +
            scores.links.score * 0.09 +
            scores.schema.score * 0.08 +
            scores.efficiency.score * 0.10
        ),
        detail: `Weighted average across ${Object.keys(scores).length} dimensions`
    };

    return scores;
}

function createEmptyContentQuality() {
    return {
        meta: { title: '', titleLength: 0, metaDesc: '', metaDescLength: 0 },
        headings: [],
        content: { wordCount: 0, sentenceCount: 0, paragraphCount: 0 },
        links: { internal: 0, external: 0, brokenCandidates: 0, total: 0 },
        images: { total: 0, withAlt: 0, details: [] },
        videos: { count: 0 },
        schema: { types: [], count: 0 },
        freshness: { datesFound: [] },
        scores: { overall: { score: 0, detail: 'Content quality extraction failed' } }
    };
}

module.exports = {
    extractContentQuality,
    computeContentScores,
};
