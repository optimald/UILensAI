/**
 * Industry Detection Utility for UILensAI
 *
 * Uses AI to detect the primary industry of a website based on its content.
 * The AI returns a FREE-TEXT industry description — no static enum constraints.
 * This allows ANY type of website to be accurately classified.
 */

const fs = require('fs');
const path = require('path');
const { getSchemaPath } = require('./paths');

const { getPrompt } = require('../utils/promptTemplates');

const { getStructuredData } = require('./structured-llm-output');
const { getModelConfig } = require('./ai-credentials');

// --- Schema Loading (for regulatory frameworks only) ---
let reportSchemaInstance;
try {
    const schemaPath = getSchemaPath('report-schema.json');
    reportSchemaInstance = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (error) {
    console.error('[IndustryDetection] CRITICAL: Failed to load report schema.', error);
    reportSchemaInstance = { $defs: { industryContext: { properties: { regulatoryFramework: { items: { properties: { name: { enum: ["Other"] } } } } } } } };
}

const SCHEMA_REGULATORY_FRAMEWORKS_NAMES = getNestedProperty(reportSchemaInstance, '$defs.industryContext.properties.regulatoryFramework.items.properties.name.enum', ["Other"]);

const DETAILED_VALID_REGULATORY_FRAMEWORKS = [
    "HIPAA", "PCI DSS", "GDPR", "CCPA", "FERPA", "SOX", "COPPA", "ADA", "WCAG",
    "ISO 27001", "NIST Cybersecurity Framework", "FINRA Rules", "SEC Regulations",
    "Australia Privacy Act", "India DPDP Act",
    "ePrivacy Directive", "LGPD (Brazil)", "PIPEDA (Canada)",
    "Other"
];

const DEFAULT_INDUSTRY = "General Business";
const DEFAULT_CONFIDENCE = 50;

// --- Helper Functions ---
function getNestedProperty(obj, pathStr, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object' || obj === null || !pathStr) { return defaultValue; }
    const path = pathStr.split('.');
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, path[i])) {
            return defaultValue;
        }
        current = current[path[i]];
    }
    return current;
}

async function extractPageTextContent(page, verbose = false) {
    if (!page || page.isClosed()) { return ""; }
    try {
        return await page.evaluate(() => {
            const title = document.title || "";
            const metaDescription = document.querySelector('meta[name="description"]')?.content || "";
            const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent).join(' ');

            // CRITICAL FIX: Also extract navigation menu items — these contain key industry signals
            // (e.g., "Treatments", "Botox", "Laser Hair Removal" for Med Spas)
            const navItems = Array.from(document.querySelectorAll('nav a, header a, [role="navigation"] a, .nav a, .menu a'))
                .map(a => a.textContent?.trim())
                .filter(t => t && t.length > 1 && t.length < 80)
                .slice(0, 30)
                .join(', ');

            let bodyText = "";
            const elements = Array.from(document.body.querySelectorAll('p, span, div, li, a, h2, h3, h4, h5, h6, td, th, article section'));
            let charCount = 0;
            const maxChars = 4500; // Max for AI context

            for (const elem of elements) {
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(elem.tagName)) { continue; }
                // NOTE: We no longer skip NAV/FOOTER/HEADER for industry detection
                // These contain critical service/category signals for service businesses
                if (elem.offsetParent === null && elem.offsetWidth === 0 && elem.offsetHeight === 0) { continue; }
                const text = elem.textContent?.trim();
                if (text && text.length > 20 && !text.toLowerCase().includes("copyright")) {
                    const textToAdd = text.replace(/\s+/g, ' ') + '. ';
                    if (charCount + textToAdd.length > maxChars) {
                        bodyText += textToAdd.substring(0, maxChars - charCount); break;
                    }
                    bodyText += textToAdd; charCount += textToAdd.length;
                }
                if (charCount >= maxChars) { break; }
            }
            return `${title}. ${metaDescription}. Navigation: ${navItems}. ${h1s}. ${bodyText}`.trim().substring(0, 5500);
        });
    } catch (error) {
        if (verbose) { console.error("[IndustryDetection] Error extracting page content:", error.message); }
        return "";
    }
}


/**
 * Detects the industry of a website.
 */
async function detectIndustry({
    url,
    page,
    htmlContent,
    textContent,
    industryHint,
    preferredModelFamily = null,
    tier = "Free",
    costAggregator = null,
    verbose = false
}) {
    if (verbose) { console.log(`[IndustryDetection] Starting industry detection for URL: ${url}`); }

    let pageContentSample = textContent || "";
    if (!pageContentSample && page) {
        pageContentSample = await extractPageTextContent(page, verbose);
    } else if (!pageContentSample && htmlContent) {
        pageContentSample = htmlContent.replace(/<style[^>]*>.*<\/style>/gs, '')
            .replace(/<script[^>]*>.*<\/script>/gs, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ').trim().substring(0, 5000);
    }

    if (!pageContentSample && verbose) { console.warn("[IndustryDetection] No page content available for analysis."); }
    if (pageContentSample.length < 150 && verbose) {
        console.warn(`[IndustryDetection] Page content sample is very short (${pageContentSample.length} chars), detection quality may be affected.`);
    }

    const modelConfig = getModelConfig({
        model: null,
        modelFamily: null, // Ignore external preference (DeepSeek), force module default (Gemini)
        tier: (tier === "Pro" || tier === "Enterprise") ? "pro" : "basic",
        moduleName: 'industry-detection', // Ensure we use the optimized industry detection model (Gemini)
        vision: false
    });

    const fallbackReturn = {
        industryContext: {
            primaryIndustry: industryHint || DEFAULT_INDUSTRY,
            subtype: industryHint || null,
            confidence: industryHint ? 75 : 10,
            detectionMethod: industryHint ? "User-provided" : "Fallback",
            regulatoryFramework: [],
            industryStandards: [],
            competitiveLandscape: null,
            businessIntelligence: null
        },
        usage: null // No AI call made for fallback
    };

    if (!modelConfig.valid) {
        console.error(`[IndustryDetection] No valid AI model configuration: ${modelConfig.error}`);
        return fallbackReturn;
    }
    if (verbose) { console.log(`[IndustryDetection] Using model: ${modelConfig.model} (Provider: ${modelConfig.provider})`); }

    // Extract structured data from pageContentSample for the template
    // pageContentSample format: "Title. MetaDesc. Navigation: nav1, nav2. H1s. BodyText"
    const contentParts = (pageContentSample || '').split('. ');
    const extractedTitle = contentParts[0] || '';
    const extractedMetaDesc = contentParts[1] || '';
    
    // Extract navigation items if present in the content sample
    const navMatch = (pageContentSample || '').match(/Navigation:\s*([^.]+)\./i);
    const navItems = navMatch ? navMatch[1].trim() : '';
    
    // Extract domain name from URL
    let domainName = '';
    try {
        domainName = new URL(url).hostname.replace('www.', '');
    } catch { domainName = url || ''; }

    const promptText = getPrompt('industry-detection', {
        url: url || "N/A",
        pageTitle: extractedTitle,
        metaDescription: extractedMetaDesc,
        contentSnippets: pageContentSample.substring(0, 4500),
        navigationItemsString: navItems,
        contactInfoHints: '',  // Not available from page content sample
        domainName: domainName,
        industryHint: industryHint || "None provided",
        validIndustries: "Healthcare, Dental, Medical Practice, Dermatology, Veterinary, Law Firm, Real Estate, E-commerce, Restaurant, Salon, Spa, HVAC, Plumbing, Electrical, Roofing, Construction, Landscaping, Auto Repair, Financial Services, Insurance, Accounting, Marketing Agency, Software/SaaS, Education, Fitness, Hospitality, Travel, Non-Profit, Government, Manufacturing, Retail, Professional Services, Home Services, Beauty & Wellness, Other",
        validFrameworks: DETAILED_VALID_REGULATORY_FRAMEWORKS.join('", "')
    });

    if (!promptText) {
        console.error("[IndustryDetection] CRITICAL: Industry detection prompt template missing or failed to substitute.");
        return fallbackReturn;
    }

    // AI output schema — free-text industry, no enum constraint
    const aiOutputSchema = {
        type: "object",
        properties: {
            detectedIndustry: { type: "string", maxLength: 100, description: "The primary industry of this website in 2-5 descriptive words (e.g., 'Dermatology Practice', 'Hair Salon', 'SaaS Platform', 'Italian Restaurant', 'Personal Injury Law Firm'). Be specific and accurate." },
            industrySubtype: { type: "string", maxLength: 100, description: "A more specific niche or specialty (e.g., 'Cosmetic Dermatology', 'Wedding Hair & Makeup', 'B2B Sales CRM')." },
            confidenceScore: { type: "number", minimum: 0, maximum: 100, description: "Your confidence in the classification (0-100)." },
            reasoning: { type: "string", maxLength: 1000, description: "Brief reasoning (2-3 sentences) for the classification." },
            relevantRegulatoryFrameworks: {
                type: "array",
                items: { type: "string", enum: DETAILED_VALID_REGULATORY_FRAMEWORKS },
                description: "List 1-3 most relevant regulatory frameworks."
            },
            relevantIndustryStandards: {
                type: "array",
                items: { type: "string", maxLength: 100 },
                maxItems: 5,
                description: "List 1-3 key industry-specific standards or best practices."
            }
        },
        required: ["detectedIndustry", "confidenceScore", "reasoning"]
    };

    try {
        const aiResult = await getStructuredData({
            moduleType: "industryContextDetectionAI",
            prompt: promptText,
            systemPrompt: `You are an expert industry classification AI. Analyze the provided website content and URL to determine its primary industry in your own words. Be specific and descriptive — use 2-5 words that accurately describe what this business does (e.g., "Dermatology Practice", "Hair Salon", "HVAC Contractor", "Italian Restaurant", "Personal Injury Law Firm"). Do NOT default to generic categories like "Other" or "Healthcare" when a more specific description is possible.`,
            modelFamily: modelConfig.provider,
            model: modelConfig.model,
            customSchema: aiOutputSchema,
            enhancedSchema: true,
            maxTokens: 1024,
            verbose: verbose
        });

        // Extract AI response and usage information
        const aiResponse = aiResult.data || aiResult; // Handle both new and legacy response formats
        const usage = aiResult.usage || null;

        // Track cost if costAggregator is provided and usage is available
        if (costAggregator && usage) {
            costAggregator.addFromUsage('IndustryDetection', usage);
            if (verbose) {
                console.log(`[IndustryDetection] AI cost tracked: $${usage.costUSD.toFixed(6)}`);
            }
        }

        if (aiResponse && aiResponse.detectedIndustry) {
            const primaryIndustry = String(aiResponse.detectedIndustry).substring(0, 100);
            const subtype = typeof aiResponse.industrySubtype === 'string' ? aiResponse.industrySubtype.substring(0, 100) : null;

            if (verbose) { console.log(`[IndustryDetection] AI classified: "${primaryIndustry}" (Subtype: ${subtype}, Confidence: ${aiResponse.confidenceScore})`); }

            const regulatoryFrameworks = (Array.isArray(aiResponse.relevantRegulatoryFrameworks) ? aiResponse.relevantRegulatoryFrameworks : [])
                .map(nameFromAI => {
                    if (SCHEMA_REGULATORY_FRAMEWORKS_NAMES.includes(nameFromAI)) {
                        return { name: nameFromAI };
                    }
                    const foundSchemaName = SCHEMA_REGULATORY_FRAMEWORKS_NAMES.find(sn => sn.toLowerCase().replace(/[\s-]/g, "") === nameFromAI.toLowerCase().replace(/[\s-]/g, ""));
                    if (foundSchemaName) { return { name: foundSchemaName }; }
                    if (DETAILED_VALID_REGULATORY_FRAMEWORKS.includes(nameFromAI) && nameFromAI !== "Other") {
                        return { name: "Other", otherDescription: nameFromAI.substring(0, 100) };
                    }
                    return null;
                })
                .filter(Boolean);

            const industryStandards = (Array.isArray(aiResponse.relevantIndustryStandards) ? aiResponse.relevantIndustryStandards : [])
                .map(name => ({ name: String(name).substring(0, 100), relevanceScore: 75 }))
                .slice(0, 5);

            return {
                industryContext: {
                    primaryIndustry: primaryIndustry,
                    subtype: subtype,
                    confidence: Math.round(aiResponse.confidenceScore || DEFAULT_CONFIDENCE),
                    detectionMethod: "ML-based",
                    regulatoryFramework: regulatoryFrameworks.length > 0 ? regulatoryFrameworks : [],
                    industryStandards: industryStandards.length > 0 ? industryStandards : [],
                    competitiveLandscape: null,
                    businessIntelligence: null
                },
                usage: usage
            };
        } else {
            if (verbose) { console.warn("[IndustryDetection] AI response was invalid or empty. Response:", aiResponse); }
            return {
                ...fallbackReturn,
                usage: usage
            };
        }

    } catch (error) {
        if (verbose) { console.error(`[IndustryDetection] AI error: ${error.message}`); }
        return fallbackReturn; // Fallback on error
    }
}

module.exports = {
    detectIndustry,
    DETAILED_VALID_REGULATORY_FRAMEWORKS,
    SCHEMA_REGULATORY_FRAMEWORKS_NAMES
};
