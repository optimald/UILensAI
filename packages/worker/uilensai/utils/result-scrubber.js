/**
 * Result Scrubber & Logic Reconciliation Utility
 * 
 * Enforces "Gold Standard" report quality by:
 * 1. Logic Reconciliation: Removing contradictions based on global state (e.g., no forms -> no form advice).
 * 2. Meta-Scrubbing: Removing internal AI meta-commentary (e.g., "ai-general").
 * 3. Schema Enforcement: Casting types and ensuring required fields exist.
 */

/**
 * Main scrubbing function to clean the entire analysis result.
 * @param {Object} results - The full analysis results object.
 * @param {Object} globalState - The detected global state (forms, ssl, etc).
 * @param {boolean} verbose - Whether to log debug info.
 * @returns {Object} - The scrubbed results.
 */
function scrubResults(results, globalState, verbose = false) {
    if (!results || !results.modules) return results;

    if (verbose) console.log('[ResultScrubber] Starting Gold Standard scrub...');

    // 0a. TEMPLATE VARIABLE SCRUBBING
    // -------------------------------------------------------------------------
    // AI models sometimes echo template variable syntax ({{...}} or { {...} })
    // from prompts into their structured output. Scrub ALL string fields.
    const templateVarCount = scrubTemplateVariables(results, verbose);
    if (templateVarCount > 0 && verbose) {
        console.log(`[ResultScrubber] Scrubbed ${templateVarCount} unresolved template variables from report`);
    }

    // 0. ANOMALOUS SCORE DETECTION - Module Failure Recognition
    // -------------------------------------------------------------------------
    // Scores of 0, 1, or 100 are almost certainly scan failures, not valid scores.
    // Mark these modules as failed and clear their recommendations to prevent misleading data.
    const ANOMALOUS_LOW_THRESHOLD = 2;  // 0 or 1 = failure
    const ANOMALOUS_HIGH_THRESHOLD = 100;  // Perfect score = likely failure

    Object.keys(results.modules).forEach(moduleName => {
        const mod = results.modules[moduleName];
        if (!mod || !mod.summary) return;

        const score = mod.summary.score;
        if (typeof score !== 'number') return;

        // Check for anomalous low scores (0 or 1)
        if (score < ANOMALOUS_LOW_THRESHOLD) {
            if (verbose) console.log(`[ResultScrubber] ANOMALY DETECTED: ${moduleName} score ${score} is below threshold (likely failure)`);

            // Mark as failed in summary (only modify schema-compliant fields)
            mod.summary.rating = 'Analysis Failed';

            // Clear recommendations to prevent misleading advice
            if (mod.recommendations) {
                if (Array.isArray(mod.recommendations)) {
                    mod.recommendations = [];
                } else if (mod.recommendations.items) {
                    mod.recommendations.items = [];
                    mod.recommendations.totalAvailableItems = 0;
                }
            }

            // Add top issue explaining the failure
            if (!mod.summary.topIssues) mod.summary.topIssues = [];
            mod.summary.topIssues.unshift(`⚠️ Analysis Failed: This module encountered technical issues and the results are not reliable.`);
        }

        // Check for anomalous high scores (100 = suspiciously perfect)
        if (score === ANOMALOUS_HIGH_THRESHOLD) {
            if (verbose) console.log(`[ResultScrubber] ANOMALY DETECTED: ${moduleName} score ${score} is suspiciously perfect (likely failure)`);

            // Mark as potentially failed (only modify schema-compliant fields)
            mod.summary.rating = 'Analysis Incomplete';

            // Clear recommendations
            if (mod.recommendations) {
                if (Array.isArray(mod.recommendations)) {
                    mod.recommendations = [];
                } else if (mod.recommendations.items) {
                    mod.recommendations.items = [];
                    mod.recommendations.totalAvailableItems = 0;
                }
            }

            // Add top issue
            if (!mod.summary.topIssues) mod.summary.topIssues = [];
            mod.summary.topIssues.unshift(`⚠️ Analysis Incomplete: A perfect score is highly improbable. Results may not be reliable.`);
        }
    });

    // 1. GLOBAL LOGIC RECONCILIATION
    // -------------------------------------------------------------------------

    // Scenario: No Forms Detected
    if (globalState.formsDetected === false) {
        if (verbose) console.log('[ResultScrubber] globalState.formsDetected is FALSE. Scrubbing form advice...');

        // Scrub Accessibility form advice
        if (results.modules.accessibility && results.modules.accessibility.issues) {
            let issuesArray = null;
            let updateIssues = null;

            // Handle both direct array and {items: []} structure
            if (Array.isArray(results.modules.accessibility.issues)) {
                issuesArray = results.modules.accessibility.issues;
                updateIssues = (newIssues) => { results.modules.accessibility.issues = newIssues; };
            } else if (results.modules.accessibility.issues.items && Array.isArray(results.modules.accessibility.issues.items)) {
                issuesArray = results.modules.accessibility.issues.items;
                updateIssues = (newIssues) => { results.modules.accessibility.issues.items = newIssues; };
            }

            if (issuesArray && updateIssues) {
                const filteredIssues = issuesArray.filter(issue => {
                    const text = (issue.text || '').toLowerCase();
                    return !(text.includes('form') || text.includes('label') || text.includes('input'));
                });
                // Add explicit note
                filteredIssues.push({
                    text: "No interactive forms detected on page. Form accessibility audit skipped.",
                    severity: "Info",
                    location: "Global"
                });
                updateIssues(filteredIssues);
            }
        }

        // Scrub Marketing form advice
        if (results.modules.marketing && results.modules.marketing.recommendations) {
            results.modules.marketing.recommendations = filterFormRecommendations(results.modules.marketing.recommendations);
        }

        // Scrub Conversion form advice
        if (results.modules.conversion) {
            if (results.modules.conversion.recommendations) {
                // Aggressively filter form-related content
                results.modules.conversion.recommendations = filterFormRecommendations(results.modules.conversion.recommendations, true);

                // POST-SCRUB MIN-5 FLOOR: Ensure at least 5 recs survive after form filtering
                let convRecs = results.modules.conversion.recommendations;
                let convRecsArr = Array.isArray(convRecs) ? convRecs : (convRecs.items || []);
                if (convRecsArr.length < 5) {
                    const postScrubFallbacks = [
                        { text: 'Review and optimize the primary conversion funnel to identify and eliminate friction points that cause visitor drop-off.', priority: 'High', source: 'conversion', impact: 'Improved conversion rates', effort: 'Moderate' },
                        { text: 'Implement urgency and scarcity elements strategically near conversion points to motivate faster decision-making.', priority: 'Medium', source: 'conversion', impact: 'Higher engagement and conversion rates', effort: 'Low' },
                        { text: 'Create dedicated landing pages for key services with focused messaging and a single clear call-to-action.', priority: 'Medium', source: 'conversion', impact: 'Better targeting increases conversion likelihood', effort: 'Moderate' },
                        { text: 'Implement A/B testing on key conversion elements — test headlines, button colors, page layouts, and pricing displays to identify highest-performing variations.', priority: 'High', source: 'conversion', impact: 'Data-driven optimization systematically improves conversion rates over time', effort: 'Moderate' },
                        { text: 'Optimize the mobile conversion experience — ensure CTAs are thumb-friendly, reduce page scroll depth to conversion points, and simplify the mobile checkout or contact process.', priority: 'High', source: 'conversion', impact: 'Mobile users represent the majority of traffic; mobile-optimized conversions capture more revenue', effort: 'Moderate' }
                    ];
                    for (const fb of postScrubFallbacks) {
                        if (convRecsArr.length >= 5) break;
                        const dup = convRecsArr.some(r => (r.text || '').toLowerCase() === fb.text.toLowerCase());
                        if (!dup) convRecsArr.push(fb);
                    }
                    if (Array.isArray(convRecs)) {
                        results.modules.conversion.recommendations = convRecsArr;
                    } else {
                        results.modules.conversion.recommendations.items = convRecsArr;
                        results.modules.conversion.recommendations.totalAvailableItems = convRecsArr.length;
                    }
                }
            }
        }
    }

    // Scenario: SSL Failed (Security Critical)
    const securityResult = results.modules.security;
    if (securityResult && securityResult.summary && securityResult.summary.score === 0) {
        if (verbose) console.log('[ResultScrubber] Security Critical Failure. Suppressing dependent metrics...');
        // Example: Suppress Performance metrics if they might be invalid due to connection issues?
        // For now, we trust the "Logic Contradiction" warning added in index.js, 
        // but we can scrub confusing "Performance is great!" messages if the site didn't load properly.
        if (results.modules.performance && results.modules.performance.summary) {
            // If performance score is 0 or error, keep it. 
            // If performance score > 0 but security failed connectivity, it's the "Ghost Contradiction".
            // We already handle this in index.js with a warning.
        }
    }

    // 2. META-DATA SCRUBBING ("ai-general")
    // -------------------------------------------------------------------------
    // "The AI-General Purge" - Strict filtering of meta-commentary sources
    Object.keys(results.modules).forEach(moduleName => {
        const mod = results.modules[moduleName];
        let recsArray = null;
        let updateRecs = (newRecs) => {
            if (Array.isArray(mod.recommendations)) {
                mod.recommendations = newRecs;
            } else if (mod.recommendations && Array.isArray(mod.recommendations.items)) {
                mod.recommendations.items = newRecs;
            } else if (moduleName === 'topRecommendations' && mod.items) {
                mod.items = newRecs;
            } else if (moduleName === 'top-recommendations' && mod.items) {
                mod.items = newRecs;
            }
        };

        if (Array.isArray(mod.recommendations)) {
            recsArray = mod.recommendations;
        } else if (mod.recommendations && Array.isArray(mod.recommendations.items)) {
            recsArray = mod.recommendations.items;
        } else if ((moduleName === 'topRecommendations' || moduleName === 'top-recommendations') && Array.isArray(mod.items)) {
            recsArray = mod.items;
        }

        if (recsArray) {
            const filteredRecs = recsArray.filter(rec => {
                // Hard Filter 1: Source Check
                if (rec.source === 'ai-general') return false;

                // Text-based fallback
                const text = (rec.text || '').toLowerCase();
                if (text.includes('optimize ai-general') ||
                    (text.includes('review and improve') && text.length < 50) ||
                    (text.includes('based on analysis findings') && text.length < 50)) {
                    if (verbose) console.log(`[ResultScrubber] Removed meta-recommendation in ${moduleName}: "${text.substring(0, 30)}..."`);
                    return false;
                }
                return true;
            });
            updateRecs(filteredRecs);
        }
    });

    // Also scrub global topRecommendations if they exist (root property)
    // NOTE: For topRecommendations, `source: 'ai-general'` is VALID (it indicates cross-module synthesis)
    // We only filter text-based meta-commentary patterns here, NOT by source
    if (results.topRecommendations) {
        let topRecs = null;
        if (Array.isArray(results.topRecommendations)) {
            topRecs = results.topRecommendations;
        } else if (results.topRecommendations.items) {
            topRecs = results.topRecommendations.items;
        }

        if (topRecs) {
            const filtered = topRecs.filter(rec => {
                // DO NOT filter by source === 'ai-general' for topRecommendations!
                // That source is valid for synthesized cross-module recommendations.

                // Only filter text-based meta-commentary patterns
                const text = (rec.text || '').toLowerCase();
                if (text.includes('optimize ai-general') ||
                    text.includes('optimize ai-general configuration') ||
                    (text.includes('review and improve') && text.length < 40) ||
                    (text.includes('based on analysis findings') && text.length < 40)) {
                    if (verbose) console.log(`[ResultScrubber] Removed meta-recommendation from topRecommendations: "${text.substring(0, 30)}..."`);
                    return false;
                }
                return true;
            });

            if (Array.isArray(results.topRecommendations)) {
                results.topRecommendations = filtered;
            } else {
                results.topRecommendations.items = filtered;
            }
        }
    }

    // 3. SCHEMA ENFORCEMENT & TYPE CASTING
    // -------------------------------------------------------------------------
    // Security Headers: "present" must be boolean
    if (results.modules.security && results.modules.security.headers) {
        const headers = results.modules.security.headers;
        const targetHeaders = headers.headersAnalyzed || headers;

        Object.keys(targetHeaders).forEach(headerKey => {
            if (headerKey === 'score' || headerKey === 'issues') return;
            const headerObj = targetHeaders[headerKey];
            if (headerObj && typeof headerObj === 'object') {
                if (!('present' in headerObj)) {
                    headerObj.present = !!headerObj.value;
                }
                if (typeof headerObj.present !== 'boolean') {
                    headerObj.present = Boolean(headerObj.present);
                }
                if (typeof headerObj.value !== 'string') headerObj.value = String(headerObj.value || '');
            }
        });
    }

    // General casting for strict string fields in Recommendations
    Object.keys(results.modules).forEach(modName => {
        const mod = results.modules[modName];
        let recs = null;
        if (mod && mod.recommendations) {
            if (Array.isArray(mod.recommendations)) recs = mod.recommendations;
            else if (Array.isArray(mod.recommendations.items)) recs = mod.recommendations.items;
        }

        if (recs) {
            recs.forEach(rec => {
                if (rec.elementIdentifiers && Array.isArray(rec.elementIdentifiers)) {
                    rec.elementIdentifiers = rec.elementIdentifiers.map(id => {
                        if (typeof id === 'string') return { type: 'selector', value: id };
                        return id;
                    });
                }
                if (typeof rec.source !== 'string') rec.source = modName;
            });
        }
    });

    return results;
}

function filterFormRecommendations(recommendations, aggressive = false) {
    let recsArray = Array.isArray(recommendations) ? recommendations : (recommendations.items || []);

    // Safety check
    if (!Array.isArray(recsArray)) return recommendations;

    const filtered = recsArray.filter(rec => {
        const text = (rec.text || '').toLowerCase();

        // Standard filters
        if (text.includes('form field') || text.includes('identifying labels') || text.includes('submit button')) {
            return false;
        }

        // Aggressive filters for "Ghost Form" prevention
        if (aggressive) {
            if (text.includes('form') || text.includes('input') || text.includes('captcha') ||
                text.includes('validation') || text.includes('required field') || text.includes('error message')) {
                return false;
            }
        }

        return true;
    });

    // Return in original structure
    if (Array.isArray(recommendations)) return filtered;
    return { ...recommendations, items: filtered };
}

/**
 * Final Post-Processing Middleware for Top Recommendations
 * This is the "Final Mile" to achieve Gold Standard:
 * 1. Sets pagination = null (schema compliance)
 * 2. Replaces ALL source: ai-general recommendations with Critical/High module-specific ones
 * 3. Ensures client-centric, actionable recommendations
 */
function finalizeTopRecommendations(report, requestedCount = 3, verbose = false) {
    if (!report.topRecommendations) return;

    // 1. SCHEMA FIX: Force pagination to null
    if (report.topRecommendations.pagination !== null) {
        report.topRecommendations.pagination = null;
        if (verbose) console.log('[ResultScrubber] Fixed topRecommendations.pagination = null');
    }

    // 2. Get current items
    let items = report.topRecommendations.items || [];
    if (!Array.isArray(items)) items = [];

    // 3. Keep all items that made it past the initial semantic scrubber.
    // DO NOT filter by source === 'ai-general' here, as that is the valid source for top-level synthesized recs.
    const nonAIGeneralItems = items;

    // 4. If we have enough items, use them
    if (nonAIGeneralItems.length >= requestedCount) {
        report.topRecommendations.items = nonAIGeneralItems.slice(0, requestedCount);
        report.topRecommendations.totalAvailableItems = report.topRecommendations.items.length;
        if (verbose) console.log(`[ResultScrubber] Using ${report.topRecommendations.items.length} topRecommendations`);
        return;
    }

    // 5. Need to pull Critical/High recommendations from modules
    if (verbose) console.log('[ResultScrubber] Pulling Critical/High module recommendations to replace ai-general...');

    const moduleRecommendations = [];
    const priorityOrder = ['Critical', 'High', 'Medium', 'Low'];

    // Module order: Security first (usually has critical HSTS/CSP issues), then Performance (LCP), then others
    const moduleOrder = ['security', 'performance', 'ui', 'accessibility', 'seoContent', 'marketing', 'conversion', 'compatibility', 'privacy'];

    // Extract recommendations from all modules
    moduleOrder.forEach(moduleName => {
        const mod = report.modules?.[moduleName];
        if (!mod) return;

        let modRecs = [];

        // Different modules store recommendations in different places
        if (mod.recommendations?.items) {
            modRecs = mod.recommendations.items;
        } else if (Array.isArray(mod.recommendations)) {
            modRecs = mod.recommendations;
        } else if (mod.opportunities?.items) {
            modRecs = mod.opportunities.items;
        }

        // Also check issues for high-severity items
        let modIssues = [];
        if (mod.issues?.items) {
            modIssues = mod.issues.items;
        } else if (Array.isArray(mod.issues)) {
            modIssues = mod.issues;
        }

        // Add recommendations (filter out ai-general from modules too)
        modRecs.forEach(rec => {
            if (rec.source === 'ai-general') return; // Skip ai-general even in modules
            moduleRecommendations.push({
                ...rec,
                _priority: rec.priority || 'Medium',
                _source: rec.source || moduleName
            });
        });
    });

    // 6. Sort by priority
    const sortedRecs = moduleRecommendations.sort((a, b) => {
        const aPriority = priorityOrder.indexOf(a._priority);
        const bPriority = priorityOrder.indexOf(b._priority);
        return aPriority - bPriority;
    });

    // 7. Take top N unique recommendations (by text similarity)
    const finalRecs = []; // Start fresh
    const seenTexts = new Set();

    // First, add sorted module recommendations (prioritized by Critical > High > Medium)
    for (const rec of sortedRecs) {
        if (finalRecs.length >= requestedCount) break;

        const textKey = (rec.text || '').toLowerCase().substring(0, 50);
        if (seenTexts.has(textKey)) continue;
        seenTexts.add(textKey);

        // Clean up internal properties
        const cleanRec = { ...rec };
        delete cleanRec._priority;
        delete cleanRec._source;

        finalRecs.push(cleanRec);
    }

    // 8. If we still need more, add any non-ai-general items we didn't already include
    for (const rec of nonAIGeneralItems) {
        if (finalRecs.length >= requestedCount) break;

        const textKey = (rec.text || '').toLowerCase().substring(0, 50);
        if (seenTexts.has(textKey)) continue;
        seenTexts.add(textKey);

        finalRecs.push(rec);
    }

    // 8. Update the report
    report.topRecommendations.items = finalRecs.slice(0, requestedCount);
    report.topRecommendations.totalAvailableItems = report.topRecommendations.items.length;

    if (verbose) {
        console.log(`[ResultScrubber] Final topRecommendations: ${report.topRecommendations.items.length} items`);
        report.topRecommendations.items.forEach((rec, i) => {
            console.log(`  [${i + 1}] ${rec.priority} (${rec.source}): "${(rec.text || '').substring(0, 60)}..."`);
        });
    }
}

/**
 * Recursively scrub unresolved template variables from all string fields.
 * Handles patterns like: {{var}}, {{ var }}, { {var } }, { { var } }
 * The AI sometimes echoes these from prompts into its structured output.
 * @param {*} obj - The object to scrub
 * @param {boolean} verbose - Whether to log
 * @param {string} path - Current path for logging
 * @returns {number} - Count of scrubbed variables
 */
function scrubTemplateVariables(obj, verbose = false, path = '') {
    if (!obj || typeof obj !== 'object') return 0;
    let count = 0;

    // Regex patterns for template variables:
    // 1. Standard: {{variableName}} or {{object.property}}
    // 2. Spaced: {{ variableName }} or {{ object.property }}
    // 3. Broken spacing from fallback: { {variableName } } or { { variableName } }
    const TEMPLATE_VAR_PATTERNS = [
        /\{\{\s*[\w.-]+\s*\}\}/g,          // {{var}} or {{ var }}
        /\{ \{[\w.-]+\s*\} \}/g,           // { {var } }
        /\{ \{ [\w.-]+\s*\} \}/g,          // { { var } }
    ];

    for (const key of Object.keys(obj)) {
        const val = obj[key];

        if (typeof val === 'string') {
            let cleaned = val;
            let hadMatch = false;

            for (const pattern of TEMPLATE_VAR_PATTERNS) {
                // Reset lastIndex for global regex
                pattern.lastIndex = 0;
                if (pattern.test(cleaned)) {
                    hadMatch = true;
                    pattern.lastIndex = 0;
                    cleaned = cleaned.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
                }
            }

            if (hadMatch) {
                count++;
                // If the entire value was a template var, set to empty or appropriate default
                if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') {
                    // For known fields, set meaningful defaults
                    if (key === 'internalLinkCount' || key === 'externalLinkCount') {
                        obj[key] = 'N/A';
                    } else {
                        obj[key] = cleaned || 'N/A';
                    }
                } else {
                    obj[key] = cleaned;
                }

                if (verbose) {
                    console.log(`[ResultScrubber] Template var scrubbed at ${path}.${key}: "${val.substring(0, 60)}" → "${obj[key].substring(0, 60)}"`);
                }
            }
        } else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                if (typeof val[i] === 'string') {
                    let cleaned = val[i];
                    let hadMatch = false;
                    for (const pattern of TEMPLATE_VAR_PATTERNS) {
                        pattern.lastIndex = 0;
                        if (pattern.test(cleaned)) {
                            hadMatch = true;
                            pattern.lastIndex = 0;
                            cleaned = cleaned.replace(pattern, '').trim();
                        }
                    }
                    if (hadMatch) {
                        count++;
                        val[i] = cleaned || 'N/A';
                        if (verbose) console.log(`[ResultScrubber] Template var scrubbed at ${path}.${key}[${i}]`);
                    }
                } else if (typeof val[i] === 'object' && val[i] !== null) {
                    count += scrubTemplateVariables(val[i], verbose, `${path}.${key}[${i}]`);
                }
            }
        } else if (typeof val === 'object' && val !== null) {
            count += scrubTemplateVariables(val, verbose, `${path}.${key}`);
        }
    }

    return count;
}

module.exports = { scrubResults, finalizeTopRecommendations };

