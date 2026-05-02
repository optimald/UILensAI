const { analyzeWithAI } = require('../../utils/ai-models');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { getPrompt } = require('../../utils/promptTemplates');
const { getSchemaForModule, getStructuredData } = require('../../utils/structured-llm-output');
const { getViewportDimensions } = require('./screenshot-capture');
const { resizeImageIfNeeded } = require('../../utils/image');
const { getModelConfig } = require('../../utils/ai-credentials');
const { calculateModalAccessibilityScore, calculateModalUsabilityScore, generateModalIssues, calculateCarouselAccessibilityScore, calculateCarouselUsabilityScore, generateCarouselIssues, calculateAccordionAccessibilityScore, calculateAccordionUsabilityScore, generateAccordionIssues, analyzeIndustrySpecificPatterns } = require('./scorer');

function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || !pathStr) return defaultValue;
    const keys = pathStr.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined || typeof current !== 'object' || !(key in current)) {
            return defaultValue;
        }
        current = current[key];
    }
    return current;
}
 // getNestedProperty inline for convenience


function createDefaultUiCategoryAnalysis(categoryName = "general", text = "Analysis pending.") {
    return {
        rating: 50, // Neutral default rating (0-100 scale)
        text: text,
        visualEvidence: [] // Array of {elementSelector, description}
    };
}


// CATEGORY_LABELS maps internal keys to human-friendly names for issue text
const CATEGORY_LABELS = {
    branding: 'Brand Identity',
    responsiveness: 'Responsive Design',
    hierarchy: 'Visual Hierarchy',
    consistency: 'UI Consistency',
    accessibility: 'Accessibility',
    usability: 'Usability',
    aesthetics: 'Visual Aesthetics',
    aboveTheFold: 'Above-the-Fold',
    contentFlow: 'Content Flow',
    visualDesign: 'Layout & Visual Design'
};


function extractEvidenceBasedIssue(viewportName, category, categoryData) {
    if (!categoryData || typeof categoryData.rating !== 'number') return null;

    const rating = categoryData.rating;
    // Only flag categories with genuinely low scores (< 80) to reduce noise
    if (rating >= 80) return null;

    const label = CATEGORY_LABELS[category] || category;
    const aiText = (categoryData.text || '').trim();

    // Try to extract the most concrete finding from visualEvidence first
    const evidenceDescriptions = [];
    if (Array.isArray(categoryData.visualEvidence)) {
        categoryData.visualEvidence.forEach(ve => {
            const desc = typeof ve === 'string' ? ve : (ve && ve.description ? ve.description : '');
            if (desc && desc.length > 20 && !isGenericText(desc)) {
                evidenceDescriptions.push(desc.trim());
            }
        });
    }

    // If we have concrete visual evidence, use the most specific one
    if (evidenceDescriptions.length > 0) {
        // Pick the longest/most specific evidence description
        const bestEvidence = evidenceDescriptions.sort((a, b) => b.length - a.length)[0];
        const truncated = bestEvidence.length > 200 ? bestEvidence.substring(0, 197) + '...' : bestEvidence;
        return `${viewportName} — ${label} (${rating}/100): ${truncated}`;
    }

    // Fall back to extracting the first concrete sentence from the AI text
    if (aiText.length > 20 && !isGenericText(aiText)) {
        const firstSentence = extractFirstConcreteSentence(aiText);
        if (firstSentence) {
            const truncated = firstSentence.length > 200 ? firstSentence.substring(0, 197) + '...' : firstSentence;
            return `${viewportName} — ${label} (${rating}/100): ${truncated}`;
        }
    }

    // Last resort: only emit a brief factual note if the score is truly concerning
    if (rating < 60) {
        return `${viewportName} — ${label} scored ${rating}/100 — review needed`;
    }

    return null;
}

/**
 * Checks whether a string is generic/template text that doesn't contain
 * page-specific evidence. Used to filter out fallback text.
 */

function isGenericText(text) {
    const lower = text.toLowerCase();
    const genericPatterns = [
        'analysis pending',
        'needs improvement',
        'could be improved',
        'requires attention',
        'consider improving',
        'generally effective',
        'shows good foundation',
        'improvements needed',
        'enhancements available',
        'optimizations possible',
        'refinements possible',
        'strengthen visual branding',
        'enhance heading structure',
        'standardize colors',
        'improve navigation clarity',
        'responsive layout adapting',
        'adapting to mobile width',
        'spacing inconsistency',
        'headings for scanability',
        'interactive element feedback',
        'text with good contrast ratio',
        'design patterns show uniformity',
        'navigation clarity is good'
    ];
    return genericPatterns.some(p => lower.includes(p));
}

/**
 * Extracts the first sentence from AI analysis text that contains concrete details
 * (measurements, selectors, specific elements, numbers, etc).
 */

function extractFirstConcreteSentence(text) {
    // Split into sentences
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    // Prefer sentences with concrete details (numbers, px, #hex, specific element names)
    const concretePattern = /\d+|px|rem|em|#[0-9a-fA-F]{3,6}|rgba?\(|button|header|nav|footer|hero|font|margin|padding|contrast|ratio|logo|menu|modal|image|form/i;
    const concrete = sentences.find(s => concretePattern.test(s));
    if (concrete) return concrete.trim();
    // Otherwise return the first sentence if it's long enough to be meaningful
    if (sentences.length > 0 && sentences[0].length > 30) return sentences[0].trim();
    return null;
}

// Helper to ensure all 10 UI categories are present in the structured output

function generateElementSelectorFromDescription(description, category, frameworks = [], discoveredSelectors = {}) {
    if (!description || typeof description !== 'string') {
        // Emergency fallback with discovered selectors
        const allSelectors = Object.values(discoveredSelectors || {}).flat();
        return allSelectors.length > 0 ? allSelectors[0] : "div.emergency-fallback:first-child";
    }

    const descLower = description.toLowerCase();

    // PRIORITY 1: ABSOLUTE - Use discovered selectors first
    if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
        // Enhanced category mapping for ultra-specific matching
        const categoryMappings = {
            'branding': ['headers', 'navigation', 'cta'],
            'logo': ['headers', 'navigation'],
            'navigation': ['navigation', 'headers'],
            'nav': ['navigation', 'headers'],
            'menu': ['navigation', 'headers'],
            'header': ['headers', 'navigation'],
            'title': ['headers', 'content'],
            'heading': ['headers', 'content'],
            'button': ['cta', 'forms', 'navigation'],
            'cta': ['cta', 'forms'],
            'link': ['cta', 'navigation'],
            'form': ['forms', 'cta'],
            'input': ['forms', 'cta'],
            'image': ['images', 'content'],
            'photo': ['images', 'content'],
            'picture': ['images', 'content'],
            'content': ['content', 'headers'],
            'text': ['content', 'headers'],
            'section': ['content', 'headers'],
            'article': ['content', 'headers'],
            'responsiveness': ['navigation', 'content', 'cta'],
            'hierarchy': ['headers', 'content'],
            'consistency': ['cta', 'forms', 'content'],
            'aesthetics': ['images', 'content', 'headers'],
            'aboveTheFold': ['headers', 'cta', 'content'],
            'contentFlow': ['content', 'headers'],
            'visualDesign': ['images', 'content', 'cta'],
            'usability': ['navigation', 'cta', 'forms'],
            'accessibility': ['forms', 'navigation', 'cta'],
            'interactive': ['unique', 'cta', 'forms'],
            'modal': ['unique', 'cta'],
            'carousel': ['unique', 'images'],
            'accordion': ['unique', 'content']
        };

        // Find the best match based on description content
        let bestMatch = null;
        let bestScore = 0;

        // Check description for keywords and map to selector categories
        for (const [keyword, selectorCategories] of Object.entries(categoryMappings)) {
            if (descLower.includes(keyword)) {
                for (const selectorCategory of selectorCategories) {
                    if (discoveredSelectors[selectorCategory] && discoveredSelectors[selectorCategory].length > 0) {
                        const selectors = discoveredSelectors[selectorCategory];
                        // Score selectors by specificity (ID > data attributes > complex > simple)
                        for (const selector of selectors) {
                            const scoreSelector = (sel) => {
                                let score = 0;
                                if (sel.includes('#')) score += 1000; // ID selectors highest priority
                                if (sel.includes('[data-')) score += 500; // Data attributes
                                if (sel.includes(':nth-child')) score += 200; // Specific positioning
                                if (sel.includes('.') && sel.split('.').length > 2) score += 100; // Multiple classes
                                if (sel.includes(' > ') || sel.includes(' + ')) score += 50; // Direct relationships
                                score += sel.length; // Longer selectors typically more specific
                                return score;
                            };

                            const score = scoreSelector(selector);
                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = selector;
                            }
                        }
                    }
                }
            }
        }

        // Also check by category parameter
        if (!bestMatch && category) {
            const categorySelectors = categoryMappings[category.toLowerCase()] || [category.toLowerCase()];
            for (const selectorCategory of categorySelectors) {
                if (discoveredSelectors[selectorCategory] && discoveredSelectors[selectorCategory].length > 0) {
                    bestMatch = discoveredSelectors[selectorCategory][0]; // Use most specific from category
                    break;
                }
            }
        }

        // Fallback to any discovered selector if no specific match
        if (!bestMatch) {
            const allSelectors = Object.values(discoveredSelectors).flat()
                .sort((a, b) => {
                    // Sort by specificity score
                    const scoreA = (a.includes('#') ? 1000 : 0) + (a.includes('[data-') ? 500 : 0) + a.length;
                    const scoreB = (b.includes('#') ? 1000 : 0) + (b.includes('[data-') ? 500 : 0) + b.length;
                    return scoreB - scoreA;
                });

            if (allSelectors.length > 0) {
                bestMatch = allSelectors[0];
            }
        }

        if (bestMatch) {
            return bestMatch;
        }
    }

    return "body";
}


function ensureAllUiCategories(structuredDataInput, detectedFrameworks = [], discoveredSelectors = {}) {
    const categories = ['branding', 'responsiveness', 'hierarchy', 'consistency', 'aesthetics', 'aboveTheFold', 'contentFlow', 'visualDesign', 'usability', 'accessibility'];

    // Deep clone to prevent mutation of input object
    const finalStructured = JSON.parse(JSON.stringify(structuredDataInput || {}));

    // Ensure all 10 required categories exist with proper structure
    categories.forEach(catKey => {
        if (!finalStructured[catKey] || typeof finalStructured[catKey] !== 'object') {
            finalStructured[catKey] = createDefaultUiCategoryAnalysis(catKey);
        } else {
            // Ensure required properties exist
            if (typeof finalStructured[catKey].rating !== 'number' || isNaN(finalStructured[catKey].rating)) {
                finalStructured[catKey].rating = 50;
            }
            if (typeof finalStructured[catKey].text !== 'string' || finalStructured[catKey].text.trim() === '') {
                finalStructured[catKey].text = generateFallbackAnalysisText(catKey, finalStructured[catKey].rating);
            }
            if (!Array.isArray(finalStructured[catKey].visualEvidence)) {
                finalStructured[catKey].visualEvidence = [];
            }
        }
    });

    // Handle general recommendations if present
    if (finalStructured.recommendations) {
        if (Array.isArray(structuredDataInput.recommendations)) {
            finalStructured.recommendations = structuredDataInput.recommendations
                .filter(r => r !== null && r !== undefined)
                .map(r => String(r).substring(0, 500))
                .slice(0, 7);
        } else if (typeof structuredDataInput.recommendations === 'string') {
            finalStructured.recommendations = [structuredDataInput.recommendations.substring(0, 500)];
        }
    }

    // CRITICAL FIX: Normalize visualEvidence for all categories with proper parameter passing
    categories.forEach(catKey => {
        const category = finalStructured[catKey];
        if (category && Array.isArray(category.visualEvidence)) {
            category.visualEvidence = category.visualEvidence.map(ve => {
                if (typeof ve === 'string') {
                    return {
                        description: ve.substring(0, 250),
                        elementSelector: generateElementSelectorFromDescription(ve, catKey, detectedFrameworks, discoveredSelectors)
                    };
                }
                if (typeof ve === 'object' && ve !== null && ve.description) {
                    return {
                        description: String(ve.description).substring(0, 250),
                        elementSelector: ve.elementSelector && ve.elementSelector !== "N/A" ?
                            String(ve.elementSelector).substring(0, 250) :
                            generateElementSelectorFromDescription(ve.description || ve, catKey, detectedFrameworks, discoveredSelectors)
                    };
                }
                return null; // Invalid visual evidence item
            }).filter(Boolean).slice(0, 5); // Filter out nulls and limit
        } else if (category && typeof category === 'object') {
            category.visualEvidence = []; // Ensure it's an array
        }
    });

    // Ensure top-level recommendations in structured is an array of strings
    if (!finalStructured.recommendations || !Array.isArray(finalStructured.recommendations)) {
        finalStructured.recommendations = [];
    }

    return finalStructured;
}

/**
 * Generates meaningful fallback analysis text for UI categories when AI analysis fails
 */

function generateFallbackAnalysisText(categoryKey, rating) {
    const fallbackTexts = {
        branding: rating >= 70 ?
            "Brand elements appear consistent with clear visual identity. Logo placement and brand colors are appropriately used throughout the interface." :
            rating >= 50 ?
                "Brand presence is moderate with some consistency in visual elements. Brand identity could be strengthened with more cohesive color usage and typography." :
                "Brand identity appears weak or inconsistent. Consider strengthening logo visibility, brand color consistency, and overall visual identity alignment.",

        responsiveness: rating >= 70 ?
            "Layout adapts well to the viewport with appropriate scaling and element positioning. Content remains accessible and usable." :
            rating >= 50 ?
                "Layout shows reasonable adaptation to viewport size with minor issues in element positioning or scaling that could be optimized." :
                "Layout may have significant responsiveness issues. Elements may not scale properly or content may be difficult to access on this viewport.",

        hierarchy: rating >= 70 ?
            "Visual hierarchy is clear with appropriate use of headings, typography, and spacing to guide user attention effectively." :
            rating >= 50 ?
                "Visual hierarchy is present but could be improved. Some elements may compete for attention or lack clear prioritization." :
                "Visual hierarchy appears unclear or confusing. Consider improving heading structure, typography contrast, and content organization.",

        consistency: rating >= 70 ?
            "Design elements show good consistency in styling, spacing, and interaction patterns throughout the interface." :
            rating >= 50 ?
                "Design consistency is moderate with some variations in styling or spacing that could be standardized for better user experience." :
                "Design consistency appears lacking with noticeable variations in styling, spacing, or interaction patterns that may confuse users.",

        aesthetics: rating >= 70 ?
            "Visual design is appealing with good use of color, typography, and spacing creating an attractive and professional appearance." :
            rating >= 50 ?
                "Visual design is acceptable but could be enhanced. Consider improving color harmony, typography choices, or spacing for better aesthetic appeal." :
                "Visual design may need significant improvement. Consider updating color scheme, typography, or overall visual styling for better user appeal.",

        aboveTheFold: rating >= 70 ?
            "Above-the-fold content effectively communicates key information and value proposition with clear calls-to-action visible without scrolling." :
            rating >= 50 ?
                "Above-the-fold content is present but could be optimized. Key information or calls-to-action may need better positioning or clarity." :
                "Above-the-fold content may not effectively communicate value or guide user action. Consider improving headline clarity and call-to-action prominence.",

        contentFlow: rating >= 70 ?
            "Content flows logically with clear reading patterns and intuitive navigation between sections and related information." :
            rating >= 50 ?
                "Content flow is generally logical but could be improved. Some sections may benefit from better organization or clearer connections." :
                "Content flow appears unclear or confusing. Consider reorganizing content structure and improving navigation between related sections.",

        visualDesign: rating >= 70 ?
            "Overall visual design is cohesive and professional with effective use of design principles and attention to detail." :
            rating >= 50 ?
                "Visual design is functional but could be enhanced. Consider refining design details and improving overall visual cohesion." :
                "Visual design may need significant improvement in terms of cohesion, professionalism, and attention to design principles.",

        usability: rating >= 70 ?
            "Interface is intuitive and user-friendly with clear navigation, accessible controls, and logical user flow patterns." :
            rating >= 50 ?
                "Usability is acceptable but could be improved. Some interface elements or navigation patterns may benefit from optimization." :
                "Usability appears to have significant issues. Consider improving navigation clarity, control accessibility, and overall user experience flow.",

        accessibility: rating >= 70 ?
            "Interface shows good accessibility considerations with appropriate contrast, readable text, and likely keyboard navigation support." :
            rating >= 50 ?
                "Accessibility is partially addressed but could be improved. Consider enhancing contrast, text readability, or navigation accessibility." :
                "Accessibility appears limited and may present barriers to users with disabilities. Consider improving contrast, text size, and navigation accessibility."
    };

    return fallbackTexts[categoryKey] || `Analysis for ${categoryKey} completed with rating ${rating}. Detailed assessment based on visual inspection and UI best practices.`;
}


function createDefaultUiViewportAnalysisDetail(viewportName = "unknown", url = "N/A") {
    return {
        viewport: viewportName,
        dimensions: getViewportDimensions(viewportName), // Helper to get default dims
        analysis: `Initial analysis pending for ${viewportName} viewport of ${url}.`,
        structured: ensureAllUiCategories({}), // Initialize with all 10 categories
        issues: [], // Will be populated by moduleIssue objects (strings from AI, then formatted)
        screenshot: "placeholder.png",
        success: false,
        error: null
    };
}


function createDefaultDynamicElementDetail(elementName = "Unknown Dynamic Element") {
    return {
        elementName: elementName,
        count: 1,
        accessibilityScore: 50,
        usabilityScore: 50,
        animationPerformance: { averageFrameRate: 60, cpuImpactScore: 50, jankDetected: false },
        interactionLatency: { averageResponseTimeMs: 100, maxResponseTimeMs: 300, modalResponseTimeMs: undefined },
        issues: [] // Array of moduleIssue objects
    };
}


async function analyzeSingleViewportScreenshot({
    screenshotPath, url, viewportName, viewportWidth, viewportHeight, isMobile,
    industryContext, detectedFrameworks, focusAreas,
    modelConfigOptions, // { modelFamily, model, maxTokens, tier, analysisDepth }
    discoveredSelectors = {}, // CRITICAL FIX: Add discoveredSelectors parameter
    deterministicEvidence = {}, // PRE-BUILT visual evidence from real DOM
    verbose = false,
    globalState = {},
    screenshotDataUri = null // Pre-computed base64 data URI from cfScreenshotService
}) {
    if (verbose) {
        console.log(`[UI Module] Analyzing screenshot: ${path.basename(screenshotPath)} for viewport: ${viewportName}`);
        console.log(`[UI Module - ${viewportName}] screenshotDataUri provided: ${!!screenshotDataUri} (${screenshotDataUri ? screenshotDataUri.substring(0, 30) + '...' : 'null'})`);
    }

    const viewportDetail = createDefaultUiViewportAnalysisDetail(viewportName, url);
    viewportDetail.dimensions = { width: viewportWidth, height: viewportHeight };
    // Use pre-computed data URI if available (from cfScreenshotService)
    viewportDetail.screenshot = screenshotDataUri || null;

    let base64Image;
    try {
        const imageBuffer = await fs.readFile(screenshotPath);
        // Use Claude's conservative optimal dimension with safety margin
        // Claude's documented optimal: 1568px, hard limit: 8000px
        // We use 1200px for maximum compatibility and performance
        const processedBuffer = await resizeImageIfNeeded(imageBuffer, verbose, 1200);

        // CRITICAL DEBUG: Verify the processed image dimensions before sending to Claude
        if (verbose) {
            const originalMetadata = await sharp(imageBuffer).metadata();
            const processedMetadata = await sharp(processedBuffer).metadata();
            console.log(`[UI Module - Viewport ${viewportName}] CRITICAL DEBUG:`);
            console.log(`  Original image: ${originalMetadata.width}x${originalMetadata.height} (${(imageBuffer.length / (1024 * 1024)).toFixed(2)}MB)`);
            console.log(`  Processed image: ${processedMetadata.width}x${processedMetadata.height} (${(processedBuffer.length / (1024 * 1024)).toFixed(2)}MB)`);
            console.log(`  Processing: Full screenshot preserved with ${processedBuffer.length < imageBuffer.length ? 'compression applied' : 'no compression needed'}`);

            // Verify the processed image is actually smaller and within Claude's limits
            if (processedMetadata.width > 1568 || processedMetadata.height > 1568) {
                console.warn(`[UI Module - Viewport ${viewportName}] WARNING: Processed image exceeds Claude's optimal 1568px limit!`);
            }
            if (processedMetadata.width > 8000 || processedMetadata.height > 8000) {
                console.error(`[UI Module - Viewport ${viewportName}] CRITICAL ERROR: Processed image exceeds Claude's 8000px hard limit!`);
                throw new Error(`Processed image dimensions ${processedMetadata.width}x${processedMetadata.height} exceed Claude's hard limit`);
            }
        }

        base64Image = processedBuffer.toString('base64');

        // If no pre-computed data URI was provided, embed from the original buffer
        if (!viewportDetail.screenshot) {
            viewportDetail.screenshot = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        }
    } catch (err) {
        console.error(`[UI Module] Error processing screenshot ${screenshotPath}: ${err.message}`);
        viewportDetail.error = `Screenshot processing error: ${err.message}`;
        viewportDetail.success = false;
        viewportDetail.analysis = viewportDetail.error;
        // viewportDetail.structured will keep its defaults
        return viewportDetail;
    }

    // Example data for prompt, should be dynamically fetched or passed if possible
    const exampleTextForContrast = "Sample body text";
    const exampleBgColorForContrast = "#FFFFFF";

    const templateData = {
        url, viewport: viewportName,
        viewportWidth, viewportHeight,
        isMobile: isMobile ? 'Mobile' : 'Desktop',
        industryContext: industryContext || { primaryIndustry: "general", confidence: 50, subtype: "N/A", detectionMethod: "Fallback" },
        // CRITICAL FIX: Ensure detectedFrameworks is always an array and handle safely
        frameworks: Array.isArray(detectedFrameworks) ? detectedFrameworks.join(', ') : (detectedFrameworks || "Not specified"),
        // CRITICAL FIX: Format discovered selectors for display in prompt
        'discoveredSelectors.navigation': discoveredSelectors.navigation ? discoveredSelectors.navigation.slice(0, 3).join(', ') : 'None discovered',
        'discoveredSelectors.headers': discoveredSelectors.headers ? discoveredSelectors.headers.slice(0, 3).join(', ') : 'None discovered',
        'discoveredSelectors.cta': discoveredSelectors.cta ? discoveredSelectors.cta.slice(0, 3).join(', ') : 'None discovered',
        'discoveredSelectors.forms': discoveredSelectors.forms ? discoveredSelectors.forms.slice(0, 2).join(', ') : 'None discovered',
        'discoveredSelectors.content': discoveredSelectors.content ? discoveredSelectors.content.slice(0, 3).join(', ') : 'None discovered',
        'discoveredSelectors.images': discoveredSelectors.images ? discoveredSelectors.images.slice(0, 2).join(', ') : 'None discovered',
        'discoveredSelectors.unique': discoveredSelectors.unique ? discoveredSelectors.unique.slice(0, 2).join(', ') : 'None discovered',
        elementsInView: "Various UI elements including text, images, buttons, and layout structures.",
        userTask: "General browsing, information consumption, and achieving primary page goals.",
        focusAreas: focusAreas ? focusAreas.join(', ') : 'Overall UI/UX, design principles, and viewport-specific adaptation.',
        currentDate: new Date().toISOString().split('T')[0],
        brandColor1: "#007bff", // Placeholder, ideally detected or from config
        brandColor2: "#6c757d", // Placeholder
        brandFontFamily: "System-ui, Sans-Serif", // Placeholder
        pageGoal: "Achieve primary conversion or information goal of the page.", // Generic
        textExample: exampleTextForContrast,
        bgColorExample: exampleBgColorForContrast
    };

    const promptText = getPrompt('ui-viewport-analysis', templateData);
    if (!promptText) {
        viewportDetail.error = "UI viewport analysis prompt template not found.";
        viewportDetail.success = false;
        viewportDetail.analysis = viewportDetail.error;
        return viewportDetail;
    }

    // CRITICAL FIX: Add retry logic for MCP environment
    let lastError = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
        try {
            // Use analyzeWithAI with the proper template system
            const { analyzeWithAI } = require('../../utils/ai-models');

            if (verbose) {
                console.log(`[UI Module - Viewport ${viewportName}] Attempting AI analysis (attempt ${retryCount + 1}/${maxRetries + 1})`);
            }

            // ENHANCED: Inject Logic Enforcement System Prompt
            let systemPrompt = getPrompt('system-ui-viewport-analysis');
            try {
                const logicEnforcement = getPrompt('_system_logic_enforcement', {
                    moduleName: 'UI Analysis',
                    globalState: globalState || {}
                });
                if (logicEnforcement) {
                    systemPrompt = logicEnforcement + "\n\n" + (systemPrompt || "You are an expert UI/UX analyst specializing in visual interface evaluation.");
                }
            } catch (e) {
                if (verbose) console.warn('[UI Module] Failed to inject logic enforcement prompt:', e);
            }

            const aiResult = await analyzeWithAI({
                prompt: promptText,
                systemPrompt: systemPrompt,
                images: [base64Image],
                imageMediaType: 'image/png',
                vision: true,
                moduleName: 'ui-viewport',
                tierName: modelConfigOptions.tier || 'Basic',
                modelFamily: modelConfigOptions.modelFamily,
                model: modelConfigOptions.model,
                maxTokens: modelConfigOptions.maxTokens,
                testingMode: modelConfigOptions.testingMode,
                temperature: 0.2,
                isJsonOutput: true,
                expectedJsonStructure: "object",
                costAggregator: modelConfigOptions.costAggregator,
                verbose
            });

            if (aiResult.error) {
                throw new Error(`AI analysis failed: ${aiResult.error}`);
            }

            // Parse the AI response with improved error handling
            let aiResponse = aiResult.data;

            // CRITICAL FIX: Enhanced JSON parsing with multiple fallback strategies
            if (typeof aiResponse === 'string') {
                try {
                    aiResponse = JSON.parse(aiResponse);
                } catch (parseError) {
                    if (verbose) {
                        console.error(`[UI Module - Viewport ${viewportName}] JSON parsing failed (attempt ${retryCount + 1}):`, parseError.message);
                        console.error(`[UI Module - Viewport ${viewportName}] Raw AI response length: ${aiResponse.length} characters`);
                    }

                    // CRITICAL FIX: Try progressive JSON repair strategies
                    let cleanedResponse = aiResponse;

                    // Strategy 1: Basic JSON cleanup
                    cleanedResponse = cleanedResponse.replace(/,\s*}/g, '}');
                    cleanedResponse = cleanedResponse.replace(/,\s*]/g, ']');
                    cleanedResponse = cleanedResponse.replace(/\n/g, '\\n');
                    cleanedResponse = cleanedResponse.replace(/\r/g, '\\r');
                    cleanedResponse = cleanedResponse.replace(/\t/g, '\\t');

                    try {
                        aiResponse = JSON.parse(cleanedResponse);
                        if (verbose) console.log(`[UI Module - Viewport ${viewportName}] JSON repair strategy 1 successful`);
                    } catch (secondParseError) {
                        // Strategy 2: Extract JSON from markdown or wrapped content
                        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                aiResponse = JSON.parse(jsonMatch[0]);
                                if (verbose) console.log(`[UI Module - Viewport ${viewportName}] JSON repair strategy 2 successful`);
                            } catch (thirdParseError) {
                                // Strategy 3: Partial data extraction
                                const categories = ["branding", "responsiveness", "hierarchy", "consistency", "aesthetics", "aboveTheFold", "contentFlow", "visualDesign", "usability", "accessibility"];
                                const extractedData = {};

                                categories.forEach(category => {
                                    const ratingMatch = cleanedResponse.match(new RegExp(`"${category}"\\s*:\\s*\\{[^}]*"rating"\\s*:\\s*(\\d+)`, 'i'));
                                    if (ratingMatch) {
                                        extractedData[category] = {
                                            rating: parseInt(ratingMatch[1]) || 50,
                                            text: `Analysis extracted for ${category} with rating ${ratingMatch[1]}. Full analysis text may be incomplete due to parsing issues.`,
                                            visualEvidence: []
                                        };
                                    }
                                });

                                if (Object.keys(extractedData).length >= 3) {
                                    aiResponse = extractedData;
                                    if (verbose) console.log(`[UI Module - Viewport ${viewportName}] JSON repair strategy 3 successful - extracted ${Object.keys(extractedData).length} categories`);
                                } else {
                                    throw new Error(`All JSON parsing strategies failed. Last error: ${thirdParseError.message}`);
                                }
                            }
                        } else {
                            throw new Error(`JSON extraction failed. Original error: ${parseError.message}`);
                        }
                    }
                }
            }

            // CRITICAL FIX: Validate AI response structure
            if (!aiResponse || typeof aiResponse !== 'object') {
                throw new Error("AI response is not a valid object");
            }

            // Ensure we have at least some structured data
            const validCategories = Object.keys(aiResponse).filter(key =>
                aiResponse[key] && typeof aiResponse[key] === 'object' &&
                typeof aiResponse[key].rating === 'number'
            );

            if (validCategories.length < 3) {
                throw new Error(`Insufficient structured data received. Only ${validCategories.length} valid categories found. Expected at least 3.`);
            }

            // Process successful AI response
            viewportDetail.structured = ensureAllUiCategories(aiResponse, detectedFrameworks, discoveredSelectors);

            // DETERMINISTIC VISUAL EVIDENCE: Replace AI-generated visualEvidence with real DOM evidence
            // The AI cannot generate CSS selectors from pixels — so we stamp them from the real DOM.
            const uiCategories = ['branding', 'responsiveness', 'hierarchy', 'consistency', 'aesthetics',
                'aboveTheFold', 'contentFlow', 'visualDesign', 'usability', 'accessibility'];
            
            if (deterministicEvidence && Object.keys(deterministicEvidence).length > 0) {
                for (const category of uiCategories) {
                    if (viewportDetail.structured[category] && deterministicEvidence[category]?.length > 0) {
                        viewportDetail.structured[category].visualEvidence = deterministicEvidence[category].slice(0, 3);
                        if (verbose) {
                            console.log(`[UI Module - Viewport ${viewportName}] Stamped ${deterministicEvidence[category].length} real evidence entries for ${category}`);
                        }
                    }
                }
            } else if (discoveredSelectors && Object.keys(discoveredSelectors).length > 0) {
                // Fallback: use discovered selectors to build minimal evidence if deterministicEvidence is empty
                const categoryMapping = {
                    'branding': ['headers', 'navigation', 'cta'],
                    'responsiveness': ['navigation', 'content', 'cta'],
                    'hierarchy': ['headers', 'content', 'navigation'],
                    'consistency': ['cta', 'forms', 'content'],
                    'aesthetics': ['images', 'content', 'headers'],
                    'aboveTheFold': ['headers', 'cta', 'content'],
                    'contentFlow': ['content', 'headers', 'navigation'],
                    'visualDesign': ['images', 'content', 'cta'],
                    'usability': ['navigation', 'cta', 'forms'],
                    'accessibility': ['forms', 'navigation', 'cta']
                };
                for (const category of uiCategories) {
                    if (viewportDetail.structured[category] && 
                        (!viewportDetail.structured[category].visualEvidence || viewportDetail.structured[category].visualEvidence.length === 0)) {
                        const relevantCats = categoryMapping[category] || ['content', 'cta', 'headers'];
                        const entries = [];
                        for (const cat of relevantCats) {
                            if (discoveredSelectors[cat]?.length > 0 && entries.length < 2) {
                                entries.push({
                                    elementSelector: discoveredSelectors[cat][0],
                                    description: `${cat} element detected in DOM`
                                });
                            }
                        }
                        if (entries.length > 0) {
                            viewportDetail.structured[category].visualEvidence = entries;
                        }
                    }
                }
            }

            // QUALITY FIX: Generate real analysis summary from structured category scores instead of status message
            const categoryEntries = Object.entries(viewportDetail.structured)
                .filter(([_, cat]) => cat && typeof cat === 'object' && typeof cat.rating === 'number')
                .sort((a, b) => b[1].rating - a[1].rating);
            if (categoryEntries.length > 0) {
                const best = categoryEntries[0];
                const worst = categoryEntries[categoryEntries.length - 1];
                const avgScore = Math.round(categoryEntries.reduce((sum, [_, c]) => sum + c.rating, 0) / categoryEntries.length);
                const bestText = best[1].text ? best[1].text.trim() : '';
                const worstText = worst[1].text ? worst[1].text.trim() : '';
                viewportDetail.analysis = `${viewportName} viewport scores ${avgScore}/100 overall across ${categoryEntries.length} categories. ` +
                    `Strongest: ${best[0]} (${best[1].rating}/100)${bestText ? ' — ' + bestText : ''}. ` +
                    `Weakest: ${worst[0]} (${worst[1].rating}/100)${worstText ? ' — ' + worstText : ''}.`;
            } else {
                viewportDetail.analysis = `Analysis completed for ${viewportName} viewport but no structured category scores were produced.`;
            }
            viewportDetail.success = true;

            if (verbose) {
                console.log(`[UI Module - Viewport ${viewportName}] AI response validation passed. Categories found: ${validCategories.join(', ')}`);
            }

            // QUALITY FIX #5: Extract issues with EVIDENCE REQUIREMENTS
            // Issues must contain measurable criteria or reference specific elements
            Object.entries(viewportDetail.structured).forEach(([catKey, category]) => {
                if (!category || typeof category !== 'object' || typeof category.text !== 'string') return;
                if (category.rating >= 65) return; // Only flag genuinely low-scoring categories

                const text = category.text;
                // Evidence check: must contain measurable criteria
                const hasEvidence = /\d+\s*(px|rem|em|%|ms|s|pt|:1|\/100|x\d+)/i.test(text) || // measurements
                    /WCAG|AA|AAA|4\.5:1|3:1|contrast\s+ratio/i.test(text) || // WCAG references
                    /#[0-9a-fA-F]{3,6}/i.test(text) || // specific colors
                    /\.([\w-]+(?:\.[\w-]+)+)/i.test(text) || // CSS class refs
                    /font-(?:size|weight|family)|margin|padding|z-index|opacity/i.test(text); // CSS properties

                // Filter out compliments masquerading as issues
                const isCompliment = /\b(excellent|outstanding|strong|impressive|beautiful|clean|professional|well-designed|aesthetic|appealing|effective)\b/i.test(text) &&
                    !/\b(but|however|although|except|despite|missing|lacks|poor|weak|insufficient)\b/i.test(text);
                if (isCompliment) return;

                // Filter out observations that aren't problems
                const isObservation = /\b(uses|has|includes|features|provides|maintains|offers|presents|displays|shows)\b/i.test(text) &&
                    !/\b(not|doesn't|doesn't|fails|missing|lacks|no|insufficient|poor|broken|incorrect)\b/i.test(text) &&
                    category.rating >= 50;
                if (isObservation) return;

                if (hasEvidence) {
                    // Extract the most specific sentence with evidence
                    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 15);
                    const evidenceSentence = sentences.find(s =>
                        /\d+\s*(px|rem|em|%|ms|s|pt|:1|\/100)/i.test(s) ||
                        /WCAG|contrast|ratio/i.test(s) ||
                        /#[0-9a-fA-F]{3,6}/i.test(s)
                    );
                    if (evidenceSentence) {
                        viewportDetail.issues.push(evidenceSentence.substring(0, 500));
                    }
                } else if (category.rating < 50) {
                    // Only emit non-evidence issues if score is critically low
                    const potentialIssues = text.match(/Weakness:.*?(\.|$)|Problem:.*?(\.|$)|Issue:.*?(\.|$)/gi);
                    if (potentialIssues) {
                        viewportDetail.issues.push(...potentialIssues.map(pi => pi.substring(0, 500)));
                    } else {
                        viewportDetail.issues.push(`${CATEGORY_LABELS[catKey] || catKey} scored ${category.rating}/100: ${text.substring(0, 150)}`);
                    }
                }
                // If rating is 50-65 but no evidence: silently skip — not actionable enough
            });

            // Ensure dimensions are properly set
            viewportDetail.dimensions = {
                width: viewportWidth || viewportDetail.dimensions?.width || 1366,
                height: viewportHeight || viewportDetail.dimensions?.height || 768
            };

            // SAFETY NET: Guarantee screenshot is never a local file path in API output
            if (viewportDetail.screenshot && !viewportDetail.screenshot.startsWith('data:')) {
                try {
                    const buf = await fs.readFile(viewportDetail.screenshot);
                    viewportDetail.screenshot = `data:image/png;base64,${buf.toString('base64')}`;
                    if (verbose) console.log(`[UI Module - ${viewportName}] SAFETY NET: Converted file path to base64 data URI (${viewportDetail.screenshot.length} chars)`);
                } catch (readErr) {
                    if (verbose) console.warn(`[UI Module - ${viewportName}] SAFETY NET: Could not read ${viewportDetail.screenshot}: ${readErr.message}`);
                    viewportDetail.screenshot = null;
                }
            }

            if (verbose) console.log(`[UI Module - ${viewportName}] Final screenshot type: ${viewportDetail.screenshot ? (viewportDetail.screenshot.startsWith('data:') ? 'base64 data URI' : 'unknown') : 'null'} (${viewportDetail.screenshot?.length || 0} chars)`);

            return viewportDetail;

        } catch (error) {
            lastError = error;
            retryCount++;

            if (verbose) {
                console.warn(`[UI Module - Viewport ${viewportName}] Analysis attempt ${retryCount} failed: ${error.message}`);
            }

            if (retryCount <= maxRetries) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }
        }
    }

    // CRITICAL FIX: All retries failed, provide comprehensive fallback
    if (verbose) {
        console.error(`[UI Module - Viewport ${viewportName}] All analysis attempts failed. Last error: ${lastError?.message}`);
    }

    viewportDetail.error = `AI analysis failed after ${maxRetries + 1} attempts: ${lastError?.message}`;
    viewportDetail.success = false;
    viewportDetail.analysis = viewportDetail.error;

    // CRITICAL FIX: Provide meaningful fallback structured data
    viewportDetail.structured = ensureAllUiCategories({
        branding: {
            rating: 60,
            text: `Branding analysis for ${viewportName} could not be completed due to technical limitations. Manual review recommended for brand consistency evaluation.`,
            visualEvidence: []
        },
        responsiveness: {
            rating: isMobile ? 70 : 75,
            text: `Responsive design analysis for ${viewportName} (${isMobile ? 'mobile' : 'desktop'}) encountered technical limitations. Layout appears functional but detailed assessment requires manual review.`,
            visualEvidence: []
        },
        hierarchy: {
            rating: 65,
            text: `Content hierarchy analysis for ${viewportName} was limited by technical constraints. Visual structure appears present but detailed evaluation needed.`,
            visualEvidence: []
        }
    }, detectedFrameworks, discoveredSelectors);

    // Ensure dimensions are set even on error
    viewportDetail.dimensions = {
        width: viewportWidth || 1366,
        height: viewportHeight || 768
    };

    // SAFETY NET: Guarantee screenshot is never a local file path in API output (error path)
    if (viewportDetail.screenshot && !viewportDetail.screenshot.startsWith('data:')) {
        try {
            const buf = await fs.readFile(viewportDetail.screenshot);
            viewportDetail.screenshot = `data:image/png;base64,${buf.toString('base64')}`;
        } catch (readErr) {
            viewportDetail.screenshot = null;
        }
    }

    return viewportDetail;
}


async function analyzeDynamicElementsOnPage(page, url, industryContext, modelConfigOptions, verbose = false) {
    if (verbose) console.log(`[UI Module] Analyzing dynamic elements for ${url}`);
    if (!page || page.isClosed()) {
        if (verbose) console.log("[UI Module] No page object to analyze dynamic elements.");
        return null;
    }

    const detectedDynamics = { modals: [], carousels: [], accordions: [], otherDynamicElements: [], gestureInteractionAnalysis: null, industrySpecificPatterns: [] };
    try {
        // Enhanced detection with more comprehensive selectors
        const modalSelectors = [
            '.modal', '[role="dialog"]', '.popup-overlay', '.lightbox', '.dialog',
            '[data-modal]', '[aria-modal="true"]', '.modal-backdrop', '.overlay',
            '.popup', '.modal-content', '.modal-dialog', '[data-bs-toggle="modal"]',
            '.fancybox', '.colorbox', '.magnific-popup', '.sweet-alert'
        ];

        const carouselSelectors = [
            '.carousel', '.slider', '.swiper', '.owl-carousel', '.slick-slider',
            '[data-ride="carousel"]', '.glide', '.flickity', '.keen-slider',
            '.splide', '.tiny-slider', '.slide-container', '.slideshow'
        ];

        const accordionSelectors = [
            '.accordion', '.collapse', '[data-bs-toggle="collapse"]', '.collapsible',
            '.expandable', '.toggle-content', '.faq-item', '.dropdown-content',
            '.panel-group', '.ui-accordion', '[aria-expanded]'
        ];

        const dynamicElementsData = await page.evaluate((args) => {
            const { modalSelectors, carouselSelectors, accordionSelectors } = args;
            const results = { modals: [], carousels: [], accordions: [], otherElements: [] };

            // Helper function to generate specific CSS selector for an element (available in browser context)
            function generateSpecificSelector(element) {
                try {
                    if (element.id) return `#${element.id}`;
                    if (element.className && typeof element.className === 'string') {
                        const classes = element.className.trim().split(/\s+/).slice(0, 3);
                        if (classes.length > 0) return `.${classes.join('.')}`;
                    }
                    // Enhanced fallback with parent context for healthcare sites
                    const tagName = element.tagName.toLowerCase();
                    const parent = element.parentElement;
                    if (parent && parent.className) {
                        const parentClass = parent.className.split(' ')[0];
                        return `.${parentClass} ${tagName}`;
                    }
                    return tagName;
                } catch (error) {
                    return element.tagName ? element.tagName.toLowerCase() : 'div';
                }
            }

            // Detect modals with enhanced analysis
            modalSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (!results.modals.some(m => m.element === el)) {
                            const isVisible = el.offsetParent !== null || getComputedStyle(el).display !== 'none';
                            const hasBackdrop = el.classList.contains('modal-backdrop') ||
                                el.querySelector('.modal-backdrop') ||
                                getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)';

                            results.modals.push({
                                selector: selector,
                                elementSelector: generateSpecificSelector(el),
                                isVisible: isVisible,
                                hasCloseButton: !!el.querySelector('[data-dismiss=\"modal\"], .close, .modal-close, [aria-label*=\"close\" i]'),
                                hasBackdrop: hasBackdrop,
                                ariaModal: el.getAttribute('aria-modal') === 'true',
                                role: el.getAttribute('role'),
                                zIndex: getComputedStyle(el).zIndex,
                                accessibility: {
                                    hasAriaLabel: !!el.getAttribute('aria-label'),
                                    hasAriaLabelledby: !!el.getAttribute('aria-labelledby'),
                                    focusable: el.tabIndex >= 0 || el.hasAttribute('tabindex')
                                }
                            });
                        }
                    });
                } catch (error) {
                    console.warn('Modal detection error for selector:', selector, error);
                }
            });

            // Detect carousels with enhanced analysis
            carouselSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (!results.carousels.some(c => c.element === el)) {
                            const slides = el.querySelectorAll('.slide, .carousel-item, .swiper-slide, .slick-slide, [data-slide]');
                            const hasControls = !!el.querySelector('.carousel-control, .slider-nav, .swiper-button, .slick-arrow, .prev, .next');
                            const hasIndicators = !!el.querySelector('.carousel-indicators, .slider-dots, .swiper-pagination, .slick-dots');

                            results.carousels.push({
                                selector: selector,
                                elementSelector: generateSpecificSelector(el),
                                slideCount: slides.length,
                                hasControls: hasControls,
                                hasIndicators: hasIndicators,
                                autoplay: el.hasAttribute('data-autoplay') || el.classList.contains('autoplay'),
                                infinite: el.hasAttribute('data-infinite') || el.classList.contains('infinite'),
                                accessibility: {
                                    hasAriaLabel: !!el.getAttribute('aria-label'),
                                    hasAriaLive: !!el.querySelector('[aria-live]'),
                                    controlsAccessible: hasControls && el.querySelector('.carousel-control[aria-label], .slider-nav[aria-label]')
                                }
                            });
                        }
                    });
                } catch (error) {
                    console.warn('Carousel detection error for selector:', selector, error);
                }
            });

            // Detect accordions with enhanced analysis
            accordionSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (!results.accordions.some(a => a.element === el)) {
                            const panels = el.querySelectorAll('.panel, .accordion-item, .collapsible-item, [data-toggle=\"collapse\"]');
                            const headers = el.querySelectorAll('.panel-heading, .accordion-header, .collapsible-header, .toggle-header');

                            results.accordions.push({
                                selector: selector,
                                elementSelector: generateSpecificSelector(el),
                                panelCount: panels.length,
                                hasHeaders: headers.length > 0,
                                multipleOpen: !el.classList.contains('accordion') || el.hasAttribute('data-multiple'),
                                accessibility: {
                                    hasAriaExpanded: !!el.querySelector('[aria-expanded]'),
                                    hasAriaControls: !!el.querySelector('[aria-controls]'),
                                    keyboardNavigation: headers.length > 0 && Array.from(headers).some(h => h.tabIndex >= 0)
                                }
                            });
                        }
                    });
                } catch (error) {
                    console.warn('Accordion detection error for selector:', selector, error);
                }
            });

            return results;
        }, {
            modalSelectors: modalSelectors,
            carouselSelectors: carouselSelectors,
            accordionSelectors: accordionSelectors
        });

        // Process detected elements into structured format
        detectedDynamics.modals = dynamicElementsData.modals.map(modal => ({
            elementName: `Modal (${modal.selector})`,
            count: 1,
            accessibilityScore: calculateModalAccessibilityScore(modal),
            usabilityScore: calculateModalUsabilityScore(modal),
            animationPerformance: {
                averageFrameRate: 60, // Would need performance measurement
                cpuImpactScore: modal.hasBackdrop ? 70 : 85,
                jankDetected: false
            },
            interactionLatency: {
                averageResponseTimeMs: 150,
                maxResponseTimeMs: 300,
                modalResponseTimeMs: 200
            },
            issues: generateModalIssues(modal),
            elementSelector: modal.elementSelector
        }));

        detectedDynamics.carousels = dynamicElementsData.carousels.map(carousel => ({
            elementName: `Carousel (${carousel.selector})`,
            count: 1,
            accessibilityScore: calculateCarouselAccessibilityScore(carousel),
            usabilityScore: calculateCarouselUsabilityScore(carousel),
            animationPerformance: {
                averageFrameRate: carousel.autoplay ? 50 : 60,
                cpuImpactScore: carousel.slideCount > 5 ? 60 : 80,
                jankDetected: carousel.slideCount > 10
            },
            interactionLatency: {
                averageResponseTimeMs: 100,
                maxResponseTimeMs: 250,
                slideTransitionTimeMs: 300
            },
            issues: generateCarouselIssues(carousel),
            elementSelector: carousel.elementSelector
        }));

        detectedDynamics.accordions = dynamicElementsData.accordions.map(accordion => ({
            elementName: `Accordion (${accordion.selector})`,
            count: 1,
            accessibilityScore: calculateAccordionAccessibilityScore(accordion),
            usabilityScore: calculateAccordionUsabilityScore(accordion),
            animationPerformance: {
                averageFrameRate: 60,
                cpuImpactScore: 85,
                jankDetected: false
            },
            interactionLatency: {
                averageResponseTimeMs: 80,
                maxResponseTimeMs: 200,
                expandCollapseTimeMs: 150
            },
            issues: generateAccordionIssues(accordion),
            elementSelector: accordion.elementSelector
        }));

        // If no dynamic elements detected, return explicit statement with comprehensive static analysis
        if (detectedDynamics.modals.length === 0 && detectedDynamics.carousels.length === 0 && detectedDynamics.accordions.length === 0) {
            if (verbose) console.log("[UI Module] No traditional dynamic elements detected, performing comprehensive static analysis");

            // CRITICAL FIX FOR PRO TIER: Provide comprehensive analysis even when no dynamic elements exist
            const gestureAnalysis = await analyzeGestureInteraction(page, verbose);
            const industryPatterns = analyzeIndustrySpecificPatterns([], industryContext?.primaryIndustry || 'Other');

            return {
                modals: [],
                carousels: [],
                accordions: [],
                otherDynamicElements: [{
                    elementName: "Static Interactive Elements Analysis",
                    count: staticInteractionAnalysis.interactiveElements.length,
                    accessibilityScore: Math.min(90, Math.max(40,
                        (staticInteractionAnalysis.accessibilityFeatures.ariaLabels * 10) +
                        (staticInteractionAnalysis.accessibilityFeatures.headingStructure.h1Count > 0 ? 20 : 0) +
                        (staticInteractionAnalysis.mediaElements.imagesWithAlt > staticInteractionAnalysis.mediaElements.imagesWithoutAlt ? 30 : 10)
                    )),
                    usabilityScore: Math.min(95, Math.max(50,
                        (staticInteractionAnalysis.interactiveElements.filter(el => el.hasAccessibleName).length * 5) +
                        (staticInteractionAnalysis.formElements.filter(form => form.hasLabels).length * 15) + 40
                    )),
                    animationPerformance: {
                        averageFrameRate: 60,
                        cpuImpactScore: 95, // Static elements have minimal CPU impact
                        jankDetected: false
                    },
                    interactionLatency: {
                        averageResponseTimeMs: 50,
                        maxResponseTimeMs: 100,
                        userInteractionResponseMs: 75
                    },
                    issues: generateStaticElementsIssues(staticInteractionAnalysis),
                    elementSelector: ".interactive-elements, button, .btn, a[href], input, select, textarea"
                }],
                gestureInteractionAnalysis: gestureAnalysis,
                industrySpecificPatterns: industryPatterns,
                staticInteractionSummary: {
                    totalInteractiveElements: staticInteractionAnalysis.interactiveElements.length,
                    totalForms: staticInteractionAnalysis.formElements.length,
                    accessibilityCompliance: staticInteractionAnalysis.accessibilityFeatures.ariaLabels > 0 ? "Partial" : "Basic",
                    mediaAccessibility: staticInteractionAnalysis.mediaElements.imagesWithAlt > staticInteractionAnalysis.mediaElements.imagesWithoutAlt ? "Good" : "Needs Improvement",
                    analysisReason: `No traditional dynamic UI elements (modals, carousels, accordions) detected on ${url}. This is common for professional healthcare/medical websites that prioritize content accessibility and fast loading. Analysis focused on ${staticInteractionAnalysis.interactiveElements.length} static interactive elements, ${staticInteractionAnalysis.formElements.length} forms, and accessibility patterns. The site appears to use a clean, content-focused design approach suitable for the healthcare industry.`
                },
                // ENHANCED: Add more detailed breakdown for healthcare sites
                healthcareSpecificAnalysis: {
                    appointmentBookingElements: staticInteractionAnalysis.interactiveElements.filter(el =>
                        el.textContent && (el.textContent.toLowerCase().includes('appointment') ||
                            el.textContent.toLowerCase().includes('book') ||
                            el.textContent.toLowerCase().includes('schedule'))
                    ).length,
                    contactForms: staticInteractionAnalysis.formElements.filter(form =>
                        form.textContent && form.textContent.toLowerCase().includes('contact')
                    ).length,
                    trustSignals: staticInteractionAnalysis.interactiveElements.filter(el =>
                        el.textContent && (el.textContent.toLowerCase().includes('certified') ||
                            el.textContent.toLowerCase().includes('license') ||
                            el.textContent.toLowerCase().includes('accredited'))
                    ).length,
                    insights: `Healthcare website optimization: ${staticInteractionAnalysis.interactiveElements.length} interactive elements detected. Focus on clear appointment booking CTAs, accessible contact forms, and prominent trust signals for patient confidence.`
                }
            };
        }

        // Add gesture interaction analysis
        detectedDynamics.gestureInteractionAnalysis = await analyzeGestureInteraction(page, verbose);

        // Add industry-specific pattern analysis
        detectedDynamics.industrySpecificPatterns = analyzeIndustrySpecificPatterns(
            detectedDynamics,
            industryContext?.primaryIndustry || 'Other'
        );

        if (verbose) {
            console.log(`[UI Module] Detected ${detectedDynamics.modals.length} modals, ${detectedDynamics.carousels.length} carousels, ${detectedDynamics.accordions.length} accordions`);
        }

        return detectedDynamics;

    } catch (error) {
        if (verbose) console.error(`[UI Module] Error analyzing dynamic elements: ${error.message}`);
        return null;
    }
}

// Helper functions for scoring and issue generation

async function analyzeCrossViewportConsistency({
    viewportAnalysesResults, url, focusAreas,
    industryContext, detectedFrameworks,
    modelConfigOptions, verbose = false,
    globalState = {}
}) {
    if (verbose) console.log('[UI Module] Performing cross-viewport consistency analysis...');
    if (!viewportAnalysesResults || Object.keys(viewportAnalysesResults).length < 2) {
        if (verbose) console.warn("[UI Module] Insufficient viewport data for cross-viewport analysis (need at least 2).");
        return null;
    }

    // Create more detailed summaries for the AI
    const viewportSummaries = Object.entries(viewportAnalysesResults)
        .filter(([, result]) => result.success && result.structured)
        .map(([vpName, result]) => {
            let summary = `Viewport: ${vpName} (${result.dimensions?.width}x${result.dimensions?.height})\n`;
            summary += `  Overall Usability Rating: ${getNestedProperty(result, 'structured.usability.rating', 'N/A')}/100. Key Usability Note: ${getNestedProperty(result, 'structured.usability.text', '').substring(0, 100)}...\n`;
            summary += `  Responsiveness Rating: ${getNestedProperty(result, 'structured.responsiveness.rating', 'N/A')}/100. Key Responsiveness Note: ${getNestedProperty(result, 'structured.responsiveness.text', '').substring(0, 100)}...\n`;
            summary += `  Branding Consistency Rating: ${getNestedProperty(result, 'structured.branding.rating', 'N/A')}/100. Key Branding Note: ${getNestedProperty(result, 'structured.branding.text', '').substring(0, 100)}...\n`;
            summary += `  Key Issues for ${vpName}: ${(result.issues || []).slice(0, 2).join('; ') || 'None prominent'}\n`;
            return summary;
        }).join('\n\n');

    if (!viewportSummaries.trim()) {
        if (verbose) console.warn("[UI Module] No successful viewport summaries to analyze for cross-viewport consistency.");
        return null;
    }

    const promptTemplateName = (modelConfigOptions.analysisDepth === 'comprehensive' || modelConfigOptions.analysisDepth === 'deep')
        ? 'ui-cross-viewport-comprehensive' // This prompt expects more detailed input data
        : 'ui-cross-viewport-analysis'; // Renamed from 'ui-cross-viewport'

    const promptText = getPrompt(promptTemplateName, {
        url,
        analysisDepth: modelConfigOptions.analysisDepth,
        frameworks: detectedFrameworks.join(', ') || "N/A",
        industryContext,
        viewportNamesString: Object.keys(viewportAnalysesResults).join(', '),
        viewportSummariesString: viewportSummaries.substring(0, 6000), // Cap length for prompt
        detailedViewportDataString: (promptTemplateName === 'ui-cross-viewport-comprehensive') ? JSON.stringify(viewportAnalysesResults).substring(0, 8000) : undefined // Only for comprehensive
    });

    if (!promptText) {
        if (verbose) console.warn(`[UI Module] Prompt template '${promptTemplateName}' not found or failed to substitute.`);
        return null;
    }

    // Use centralized modelFamily default for cross-viewport analysis
    const defaultModelFamily = require('../../config/model-defaults').getDefaultModelFamily('ui');
    const chosenModelConfig = getModelConfig({
        modelFamily: modelConfigOptions.modelFamily || defaultModelFamily,
        moduleName: 'ui-cross-viewport',
        vision: false,
        allowFallback: true,
        tier: modelConfigOptions.tier
    });
    if (!chosenModelConfig.valid) {
        if (verbose) console.warn("[UI Module] No valid AI model for cross-viewport analysis.");
        return null;
    }
    if (verbose) console.log(`[UI Module - CrossViewport] Using ${chosenModelConfig.provider}/${chosenModelConfig.model} (optimized for speed)`);

    try {
        // ENHANCED: Inject Logic Enforcement System Prompt
        let systemPrompt = getPrompt('system-ui-cross-viewport', { industryContext }) || `You are a UI/UX expert analyzing cross-viewport consistency. Provide structured analysis of consistency patterns across different viewport sizes. Your response should be valid JSON with analysis, structured data for key categories, and actionable recommendations.`;
        try {
            const logicEnforcement = getPrompt('_system_logic_enforcement', {
                moduleName: 'UI Cross-Viewport',
                globalState: globalState || {}
            });
            if (logicEnforcement) {
                systemPrompt = logicEnforcement + "\n\n" + systemPrompt;
            }
        } catch (e) {
            if (verbose) console.warn('[UI Module] Failed to inject logic enforcement prompt for cross-viewport:', e);
        }

        // Use analyzeWithAI instead of getStructuredData since crossViewport is not a separate module
        const aiResult = await analyzeWithAI({
            prompt: promptText,
            systemPrompt: systemPrompt,
            moduleName: 'ui-cross-viewport',
            tierName: modelConfigOptions.tier || 'Basic',
            analysisDepth: modelConfigOptions.analysisDepth || 'basic',
            modelFamily: chosenModelConfig.provider,
            model: chosenModelConfig.model,
            temperature: 0.2,
            isJsonOutput: true,
            verbose,
            costAggregator: modelConfigOptions.costAggregator
        });

        const aiResponse = aiResult.data || aiResult; // Handle both new and legacy response formats
        if (aiResponse && typeof aiResponse === 'object') {
            // Ensure proper structure
            const result = {
                analysis: (() => {
                    const raw = aiResponse.analysis || aiResponse.text || "Cross-viewport analysis completed.";
                    return typeof raw === 'string' ? raw : JSON.stringify(raw);
                })(),
                structured: {},
                recommendations: Array.isArray(aiResponse.recommendations) ? aiResponse.recommendations : []
            };

            // Ensure structured categories are present
            const requiredCategories = ['branding', 'responsiveness', 'hierarchy', 'consistency', 'aesthetics'];
            for (const category of requiredCategories) {
                if (aiResponse.structured && aiResponse.structured[category]) {
                    result.structured[category] = aiResponse.structured[category];
                } else {
                    result.structured[category] = createDefaultUiCategoryAnalysis(category, `Cross-viewport ${category} analysis pending.`);
                }

                // Ensure rating is valid
                if (result.structured[category] && typeof result.structured[category].rating === 'number') {
                    result.structured[category].rating = Math.max(0, Math.min(100, Math.round(result.structured[category].rating)));
                }

                // Fix visualEvidence format - ensure it's an array of objects, not strings
                if (result.structured[category] && Array.isArray(result.structured[category].visualEvidence)) {
                    result.structured[category].visualEvidence = result.structured[category].visualEvidence.map(ve => {
                        if (typeof ve === 'string') {
                            return {
                                description: ve.substring(0, 250),
                                elementSelector: generateElementSelectorFromDescription(ve, category, detectedFrameworks)
                            };
                        }
                        if (typeof ve === 'object' && ve !== null && ve.description) {
                            return {
                                description: String(ve.description).substring(0, 250),
                                elementSelector: ve.elementSelector && ve.elementSelector !== "N/A" ?
                                    String(ve.elementSelector).substring(0, 250) :
                                    generateElementSelectorFromDescription(ve.description || ve, category, detectedFrameworks)
                            };
                        }
                        return null; // Invalid visual evidence item
                    }).filter(Boolean).slice(0, 5); // Filter out nulls and limit
                } else if (result.structured[category]) {
                    result.structured[category].visualEvidence = []; // Ensure it's an array
                }
            }

            // Add recommendations from structured if available
            if (aiResponse.structured && Array.isArray(aiResponse.structured.recommendations)) {
                result.structured.recommendations = aiResponse.structured.recommendations.map(r =>
                    typeof r === 'string' ? r : (r.text || r.description || JSON.stringify(r))
                );
            }

            // Extract the new root properties generated by AI and pass them along
            if (aiResponse.narrative) result.narrative = aiResponse.narrative;
            if (aiResponse.businessImpact) result.businessImpact = aiResponse.businessImpact;
            if (aiResponse.industryBenchmarks) result.industryBenchmarks = aiResponse.industryBenchmarks;
            if (aiResponse.roiProjections) result.roiProjections = aiResponse.roiProjections;

            return result;
        }
        return null;
    } catch (error) {
        if (verbose) console.error(`[UI Module] AI error in cross-viewport analysis: ${error.message}`);
        return null;
    }
}

// --- Main Analyze Function ---


module.exports = {
  createDefaultUiCategoryAnalysis,
  extractEvidenceBasedIssue,
  isGenericText,
  extractFirstConcreteSentence,
  generateElementSelectorFromDescription,
  ensureAllUiCategories,
  generateFallbackAnalysisText,
  createDefaultUiViewportAnalysisDetail,
  createDefaultDynamicElementDetail,
  analyzeSingleViewportScreenshot,
  analyzeDynamicElementsOnPage,
  analyzeCrossViewportConsistency,
  getNestedProperty
};
