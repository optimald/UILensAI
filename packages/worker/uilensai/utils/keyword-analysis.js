/**
 * Keyword & Topic Analysis — Evidence-Based Utility
 *
 * Extracts keyword evidence from live pages for SEO scoring.
 * Replaces reliance on AI guesswork with measurable keyword metrics.
 *
 * Metrics:
 * 1. Top N-grams (1-gram, 2-gram) by frequency (excluding stop words)
 * 2. Keyword prominence (in title, H1, meta desc, first 100 words, bold/strong)
 * 3. Title ↔ H1 ↔ Meta description keyword alignment
 * 4. Keyword density per term (flags stuffing > 3%)
 * 5. Keyword-in-URL detection
 *
 * All metrics are deterministic — no AI fabrication.
 */

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'because', 'if', 'while', 'about', 'up',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
    'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which',
    'who', 'whom', 'this', 'that', 'am', 'also', 'get', 'got', 'us', 'much', 'many',
    'like', 'well', 'back', 'even', 'still', 'way', 'take', 'come', 'make', 'know',
    'see', 'look', 'find', 'give', 'go', 'tell', 'say',
]);

/**
 * Extract keyword evidence from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} Keyword evidence
 */
async function extractKeywordEvidence(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyKeywordEvidence();
    }

    try {
        const rawData = await page.evaluate(() => {
            const title = document.title || '';
            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
            const metaKeywords = document.querySelector('meta[name="keywords"]')?.content || '';

            // H1 text
            const h1Elements = document.querySelectorAll('h1');
            const h1Text = Array.from(h1Elements).map(h => h.textContent?.trim() || '').join(' ');

            // All headings text
            const allHeadings = [];
            for (let i = 1; i <= 6; i++) {
                document.querySelectorAll(`h${i}`).forEach(h => {
                    allHeadings.push(h.textContent?.trim() || '');
                });
            }

            // Main content body text
            const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
            const cloned = mainContent.cloneNode(true);
            cloned.querySelectorAll('nav, footer, script, style, noscript, [aria-hidden="true"]').forEach(el => el.remove());
            const bodyText = cloned.textContent?.replace(/\s+/g, ' ').trim() || '';

            // First 100 words
            const words = bodyText.split(/\s+/).filter(w => w.length > 0);
            const first100Words = words.slice(0, 100).join(' ');

            // Bold/strong text
            const boldElements = mainContent.querySelectorAll('strong, b, em');
            const boldText = Array.from(boldElements).map(el => el.textContent?.trim() || '').join(' ');

            // URL path
            const urlPath = window.location.pathname;

            return {
                title,
                metaDesc,
                metaKeywords,
                h1Text,
                allHeadings,
                bodyText: bodyText.substring(0, 10000), // Cap to avoid huge payloads
                first100Words,
                boldText: boldText.substring(0, 2000),
                urlPath,
                totalWordCount: words.length,
            };
        });

        // Process in Node.js (not in browser)
        const result = processKeywordData(rawData);

        if (verbose) {
            console.log('[KeywordAnalysis] Top unigrams:', result.topUnigrams.slice(0, 5).map(k => `${k.term}(${k.count})`).join(', '));
            console.log('[KeywordAnalysis] Top bigrams:', result.topBigrams.slice(0, 3).map(k => `${k.term}(${k.count})`).join(', '));
            console.log('[KeywordAnalysis] Alignment score:', result.alignment.score);
        }

        return result;

    } catch (error) {
        if (verbose) console.error('[KeywordAnalysis] Extraction failed:', error.message);
        return createEmptyKeywordEvidence();
    }
}

/**
 * Process raw page data into keyword metrics
 */
function processKeywordData(raw) {
    const { title, metaDesc, metaKeywords, h1Text, allHeadings, bodyText, first100Words, boldText, urlPath, totalWordCount } = raw;

    // Tokenize
    const bodyWords = tokenize(bodyText);

    // --- 1. Frequency Analysis ---
    const unigramCounts = {};
    const bigramCounts = {};

    for (let i = 0; i < bodyWords.length; i++) {
        const w = bodyWords[i];
        if (!STOP_WORDS.has(w) && w.length > 2) {
            unigramCounts[w] = (unigramCounts[w] || 0) + 1;
        }
        if (i < bodyWords.length - 1) {
            const w2 = bodyWords[i + 1];
            if (!STOP_WORDS.has(w) && !STOP_WORDS.has(w2) && w.length > 2 && w2.length > 2) {
                const bigram = `${w} ${w2}`;
                bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
            }
        }
    }

    const topUnigrams = Object.entries(unigramCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([term, count]) => ({
            term,
            count,
            density: totalWordCount > 0 ? Math.round((count / totalWordCount) * 10000) / 100 : 0, // percentage
        }));

    const topBigrams = Object.entries(bigramCounts)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([term, count]) => ({
            term,
            count,
            density: totalWordCount > 0 ? Math.round((count / totalWordCount) * 10000) / 100 : 0,
        }));

    // --- 2. Keyword Stuffing Detection ---
    const stuffedTerms = topUnigrams.filter(k => k.density > 3.0);

    // --- 3. Keyword Prominence ---
    const titleWords = new Set(tokenize(title).filter(w => !STOP_WORDS.has(w) && w.length > 2));
    const h1Words = new Set(tokenize(h1Text).filter(w => !STOP_WORDS.has(w) && w.length > 2));
    const metaDescWords = new Set(tokenize(metaDesc).filter(w => !STOP_WORDS.has(w) && w.length > 2));
    const first100Set = new Set(tokenize(first100Words).filter(w => !STOP_WORDS.has(w) && w.length > 2));
    const boldWords = new Set(tokenize(boldText).filter(w => !STOP_WORDS.has(w) && w.length > 2));
    const urlWords = new Set(urlPath.toLowerCase().split(/[-_/.]/).filter(w => w.length > 2));

    const prominence = topUnigrams.slice(0, 10).map(k => ({
        term: k.term,
        inTitle: titleWords.has(k.term),
        inH1: h1Words.has(k.term),
        inMetaDesc: metaDescWords.has(k.term),
        inFirst100Words: first100Set.has(k.term),
        inBold: boldWords.has(k.term),
        inUrl: urlWords.has(k.term),
        prominenceScore: (
            (titleWords.has(k.term) ? 25 : 0) +
            (h1Words.has(k.term) ? 25 : 0) +
            (metaDescWords.has(k.term) ? 20 : 0) +
            (first100Set.has(k.term) ? 15 : 0) +
            (boldWords.has(k.term) ? 10 : 0) +
            (urlWords.has(k.term) ? 5 : 0)
        ),
    }));

    // --- 4. Title ↔ H1 ↔ Meta Description Alignment ---
    const titleSet = titleWords;
    const h1Set = h1Words;
    const metaSet = metaDescWords;

    const titleH1Overlap = intersectionSize(titleSet, h1Set);
    const titleMetaOverlap = intersectionSize(titleSet, metaSet);
    const h1MetaOverlap = intersectionSize(h1Set, metaSet);

    const maxPossible = Math.max(titleSet.size, h1Set.size, metaSet.size, 1);
    const alignmentScore = Math.min(100, Math.round(
        ((titleH1Overlap / Math.max(Math.min(titleSet.size, h1Set.size), 1)) * 40 +
            (titleMetaOverlap / Math.max(Math.min(titleSet.size, metaSet.size), 1)) * 30 +
            (h1MetaOverlap / Math.max(Math.min(h1Set.size, metaSet.size), 1)) * 30) * 100
    ));

    // --- 5. Title/H1 duplication check ---
    const titleH1Duplicate = title.toLowerCase().trim() === h1Text.toLowerCase().trim() && title.length > 0;

    // --- 6. Meta keywords analysis ---
    const declaredKeywords = metaKeywords
        ? metaKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
        : [];
    const declaredInBody = declaredKeywords.filter(k => bodyText.toLowerCase().includes(k));

    return {
        topUnigrams,
        topBigrams,
        stuffedTerms,
        prominence,
        alignment: {
            score: alignmentScore,
            titleH1Overlap,
            titleMetaOverlap,
            h1MetaOverlap,
            titleH1Duplicate,
        },
        declaredKeywords: {
            total: declaredKeywords.length,
            foundInBody: declaredInBody.length,
            keywords: declaredKeywords.slice(0, 10),
        },
        urlKeywords: Array.from(urlWords),
        totalWordCount,
    };
}

/**
 * Score keyword optimization from evidence (0-100)
 */
function scoreKeywordOptimization(keywordData) {
    let score = 0;

    // --- Top keyword prominence (30 points) ---
    if (keywordData.prominence.length > 0) {
        const avgProminence = keywordData.prominence.slice(0, 5)
            .reduce((sum, k) => sum + k.prominenceScore, 0) / Math.min(keywordData.prominence.length, 5);
        score += Math.min(30, Math.round(avgProminence * 0.3));
    }

    // --- Title/H1/Meta alignment (25 points) ---
    score += Math.min(25, Math.round(keywordData.alignment.score * 0.25));

    // --- No keyword stuffing (15 points) ---
    if (keywordData.stuffedTerms.length === 0) {
        score += 15;
    } else if (keywordData.stuffedTerms.length <= 2) {
        score += 5;
    }
    // else 0

    // --- Keyword diversity (10 points) ---
    if (keywordData.topUnigrams.length >= 10) score += 10;
    else if (keywordData.topUnigrams.length >= 5) score += 7;
    else if (keywordData.topUnigrams.length >= 3) score += 4;

    // --- Bigram presence (10 points) — shows topical depth ---
    if (keywordData.topBigrams.length >= 5) score += 10;
    else if (keywordData.topBigrams.length >= 2) score += 7;
    else if (keywordData.topBigrams.length >= 1) score += 4;

    // --- Title/H1 not duplicated (5 points) ---
    if (!keywordData.alignment.titleH1Duplicate) score += 5;

    // --- URL contains keywords (5 points) ---
    if (keywordData.urlKeywords.length > 0 && keywordData.prominence.some(k => k.inUrl)) {
        score += 5;
    }

    return {
        score: Math.min(100, score),
        detail: `Top keyword: "${keywordData.topUnigrams[0]?.term || 'none'}" (${keywordData.topUnigrams[0]?.density || 0}%), Alignment: ${keywordData.alignment.score}%, Stuffing: ${keywordData.stuffedTerms.length} terms`,
    };
}

// --- Helpers ---

function tokenize(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''));
}

function intersectionSize(setA, setB) {
    let count = 0;
    for (const item of setA) {
        if (setB.has(item)) count++;
    }
    return count;
}

function createEmptyKeywordEvidence() {
    return {
        topUnigrams: [],
        topBigrams: [],
        stuffedTerms: [],
        prominence: [],
        alignment: { score: 0, titleH1Overlap: 0, titleMetaOverlap: 0, h1MetaOverlap: 0, titleH1Duplicate: false },
        declaredKeywords: { total: 0, foundInBody: 0, keywords: [] },
        urlKeywords: [],
        totalWordCount: 0,
    };
}

module.exports = {
    extractKeywordEvidence,
    scoreKeywordOptimization,
    processKeywordData,
};
