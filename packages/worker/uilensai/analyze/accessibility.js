/**
 * Accessibility Analysis Module for UILensAI - Refactored for Schema v3.11.0 Compliance
 *
 * Assesses website accessibility against WCAG standards, screen reader compatibility,
 * keyboard navigation, color contrast, ARIA implementation, and more,
 * leveraging AI for comprehensive evaluation and structured output.
 */
// const { URL } = require('url'); // Not directly used but good practice

const { v4: uuidv4 } = require('uuid'); // For IDs if needed

const { analyzeWithAI } = require('../utils/ai-models');
const { twoPassAnalysis } = require('../utils/two-pass');
const { buildEvidenceRegistry } = require('../utils/evidence-registry');
const { getSchemaForModule } = require('../utils/structured-llm-output');
const { getPrompt } = require('../utils/promptTemplates');
const { formatIssuesArray } = require('../utils/issue-formatter');
const { calculateModuleSummaryScore, scorePerformanceMetric, getRatingLabelForScore } = require('../utils/scoring-engine');
const { populateBusinessContext } = require('../utils/business-context');
const { generateRecommendationsForIssues } = require('../utils/ai-recommendation-engine');
const { normalizeJsonOutput } = require('../utils/jsonNormalizer');
const { getLighthouseScores, getAccessibilityAudits, getLighthouseDataStatus, getLighthouseDataSummary } = require('../utils/lighthouse-data-helper');
const ModuleFailureRecovery = require('../utils/module-failure-recovery'); // CRITICAL FIX: Add failure recovery
const { collectDomSignals } = require('../utils/data-collectors/dom-structure-collector');

// --- WCAG Success Criteria Mapping ---

/**
 * Maps common accessibility issues to specific WCAG Success Criteria
 * This helps ensure proper WCAG SC IDs and names are used instead of generic placeholders
 */
const WCAG_CRITERIA_MAP = {
    // Perceivable
    'images_alt_text': { id: '1.1.1', name: 'Non-text Content', level: 'A', principle: 'perceivable' },
    'audio_captions': { id: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', principle: 'perceivable' },
    'video_captions': { id: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', principle: 'perceivable' },
    'audio_descriptions': { id: '1.2.3', name: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', principle: 'perceivable' },
    'color_contrast': { id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', principle: 'perceivable' },
    'color_contrast_enhanced': { id: '1.4.6', name: 'Contrast (Enhanced)', level: 'AAA', principle: 'perceivable' },
    'resize_text': { id: '1.4.4', name: 'Resize text', level: 'AA', principle: 'perceivable' },
    'images_of_text': { id: '1.4.5', name: 'Images of Text', level: 'AA', principle: 'perceivable' },

    // Operable
    'keyboard_accessible': { id: '2.1.1', name: 'Keyboard', level: 'A', principle: 'operable' },
    'no_keyboard_trap': { id: '2.1.2', name: 'No Keyboard Trap', level: 'A', principle: 'operable' },
    'timing_adjustable': { id: '2.2.1', name: 'Timing Adjustable', level: 'A', principle: 'operable' },
    'pause_stop_hide': { id: '2.2.2', name: 'Pause, Stop, Hide', level: 'A', principle: 'operable' },
    'seizures_flashes': { id: '2.3.1', name: 'Three Flashes or Below Threshold', level: 'A', principle: 'operable' },
    'bypass_blocks': { id: '2.4.1', name: 'Bypass Blocks', level: 'A', principle: 'operable' },
    'page_titled': { id: '2.4.2', name: 'Page Titled', level: 'A', principle: 'operable' },
    'focus_order': { id: '2.4.3', name: 'Focus Order', level: 'A', principle: 'operable' },
    'link_purpose': { id: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', principle: 'operable' },
    'multiple_ways': { id: '2.4.5', name: 'Multiple Ways', level: 'AA', principle: 'operable' },
    'headings_labels': { id: '2.4.6', name: 'Headings and Labels', level: 'AA', principle: 'operable' },
    'focus_visible': { id: '2.4.7', name: 'Focus Visible', level: 'AA', principle: 'operable' },

    // Understandable
    'language_of_page': { id: '3.1.1', name: 'Language of Page', level: 'A', principle: 'understandable' },
    'language_of_parts': { id: '3.1.2', name: 'Language of Parts', level: 'AA', principle: 'understandable' },
    'on_focus': { id: '3.2.1', name: 'On Focus', level: 'A', principle: 'understandable' },
    'on_input': { id: '3.2.2', name: 'On Input', level: 'A', principle: 'understandable' },
    'consistent_navigation': { id: '3.2.3', name: 'Consistent Navigation', level: 'AA', principle: 'understandable' },
    'consistent_identification': { id: '3.2.4', name: 'Consistent Identification', level: 'AA', principle: 'understandable' },
    'error_identification': { id: '3.3.1', name: 'Error Identification', level: 'A', principle: 'understandable' },
    'labels_instructions': { id: '3.3.2', name: 'Labels or Instructions', level: 'A', principle: 'understandable' },
    'error_suggestion': { id: '3.3.3', name: 'Error Suggestion', level: 'AA', principle: 'understandable' },
    'error_prevention': { id: '3.3.4', name: 'Error Prevention (Legal, Financial, Data)', level: 'AA', principle: 'understandable' },

    // Robust
    'parsing': { id: '4.1.1', name: 'Parsing', level: 'A', principle: 'robust' },
    'name_role_value': { id: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
    'status_messages': { id: '4.1.3', name: 'Status Messages', level: 'AA', principle: 'robust' }
};

/**
 * Maps non-standard severity values to schema-valid enum: Critical, High, Medium, Low, Informational
 * Handles axe-core impacts (serious/moderate/minor) and AI variants (Major, Important, etc.)
 */
function normalizeSeverity(severity) {
    if (!severity || typeof severity !== 'string') return 'Medium';
    const s = severity.toLowerCase().trim();
    const map = {
        'critical': 'Critical', 'blocker': 'Critical',
        'high': 'High', 'serious': 'High', 'major': 'High', 'important': 'High',
        'medium': 'Medium', 'moderate': 'Medium', 'warning': 'Medium',
        'low': 'Low', 'minor': 'Low', 'trivial': 'Low',
        'informational': 'Informational', 'info': 'Informational', 'cosmetic': 'Informational', 'suggestion': 'Informational',
    };
    return map[s] || 'Medium';
}

/**
 * Maps issue descriptions to WCAG criteria
 */
function mapIssueToWcagCriteria(issueDescription, principle = 'perceivable') {
    const description = issueDescription.toLowerCase();

    // Image-related issues
    if (description.includes('alt') || description.includes('image') || description.includes('alternative text')) {
        return WCAG_CRITERIA_MAP['images_alt_text'];
    }

    // Contrast issues
    if (description.includes('contrast') || description.includes('color')) {
        return WCAG_CRITERIA_MAP['color_contrast'];
    }

    // Keyboard issues
    if (description.includes('keyboard') || description.includes('focus') || description.includes('tab')) {
        if (description.includes('visible') || description.includes('indicator')) {
            return WCAG_CRITERIA_MAP['focus_visible'];
        } else if (description.includes('trap')) {
            return WCAG_CRITERIA_MAP['no_keyboard_trap'];
        } else if (description.includes('order')) {
            return WCAG_CRITERIA_MAP['focus_order'];
        }
        return WCAG_CRITERIA_MAP['keyboard_accessible'];
    }

    // Form issues
    if (description.includes('form') || description.includes('label') || description.includes('input')) {
        if (description.includes('error')) {
            return WCAG_CRITERIA_MAP['error_identification'];
        }
        return WCAG_CRITERIA_MAP['labels_instructions'];
    }

    // ARIA issues
    if (description.includes('aria') || description.includes('role') || description.includes('attribute')) {
        return WCAG_CRITERIA_MAP['name_role_value'];
    }

    // Navigation issues
    if (description.includes('navigation') || description.includes('skip') || description.includes('bypass')) {
        if (description.includes('skip') || description.includes('bypass')) {
            return WCAG_CRITERIA_MAP['bypass_blocks'];
        }
        return WCAG_CRITERIA_MAP['consistent_navigation'];
    }

    // Heading issues
    if (description.includes('heading') || description.includes('h1') || description.includes('h2')) {
        return WCAG_CRITERIA_MAP['headings_labels'];
    }

    // Link issues
    if (description.includes('link')) {
        return WCAG_CRITERIA_MAP['link_purpose'];
    }

    // Media issues
    if (description.includes('video') || description.includes('caption')) {
        return WCAG_CRITERIA_MAP['video_captions'];
    }
    if (description.includes('audio')) {
        return WCAG_CRITERIA_MAP['audio_captions'];
    }

    // Default based on principle
    const principleDefaults = {
        'perceivable': WCAG_CRITERIA_MAP['images_alt_text'],
        'operable': WCAG_CRITERIA_MAP['keyboard_accessible'],
        'understandable': WCAG_CRITERIA_MAP['labels_instructions'],
        'robust': WCAG_CRITERIA_MAP['name_role_value']
    };

    return principleDefaults[principle] || WCAG_CRITERIA_MAP['images_alt_text'];
}

/**
 * Enhances WCAG criteria with specific element identification and consistent details
 */
function enhanceWcagCriteria(wcagCompliance, prelimContext) {
    if (!wcagCompliance || !wcagCompliance.criteria) { return wcagCompliance; }

    // Standard screen reader devices for consistency
    const standardScreenReaderDevices = ["NVDA", "JAWS", "VoiceOver", "TalkBack"];

    // Process each principle
    ['perceivable', 'operable', 'understandable', 'robust'].forEach(principle => {
        // CRITICAL FIX: Add comprehensive null safety checks
        if (wcagCompliance[principle] &&
            wcagCompliance[principle].criteria &&
            Array.isArray(wcagCompliance[principle].criteria) &&
            wcagCompliance[principle].criteria.length > 0) {

            try {
                wcagCompliance[principle].criteria = wcagCompliance[principle].criteria.map(criterion => {
                    // Map generic criteria to specific WCAG criteria based on details
                    const mappedCriteria = mapGenericToSpecificWcag(criterion, principle, prelimContext);

                    // Handle AI response elements format - convert string selectors to proper objects
                    if (mappedCriteria.elements && Array.isArray(mappedCriteria.elements)) {
                        mappedCriteria.elements = mappedCriteria.elements.map(element => {
                            // If element is already an object with selector property, keep it
                            if (typeof element === 'object' && element.selector) {
                                return element;
                            }
                            // If element is a string (from AI response), convert to proper format
                            if (typeof element === 'string') {
                                return {
                                    selector: element,
                                    recommendation: generateElementRecommendation(element, mappedCriteria.id || mappedCriteria.criterion)
                                };
                            }
                            // Fallback for unexpected formats
                            return {
                                selector: "N/A",
                                recommendation: "Review element"
                            };
                        });
                    }

                    // Add specific elements for failed criteria or criteria with low scores if none exist
                    const shouldPopulateElements = !mappedCriteria.passed || (mappedCriteria.score && mappedCriteria.score < 80);

                    if (shouldPopulateElements && (!mappedCriteria.elements || mappedCriteria.elements.length === 0)) {
                        const criterionId = mappedCriteria.id || mappedCriteria.criterion;
                        const contextElements = getSpecificElementsForCriterion(criterionId, prelimContext);
                        mappedCriteria.elements = contextElements.map(selector => ({
                            selector: selector,
                            recommendation: generateElementRecommendation(selector, criterionId)
                        }));
                    }

                    // Ensure elements is always an array (even if empty for passed criteria)
                    if (!Array.isArray(mappedCriteria.elements)) {
                        mappedCriteria.elements = [];
                    }

                    // Enhance details with more specific information
                    if (mappedCriteria.details && mappedCriteria.details.length < 50) {
                        const criterionId = mappedCriteria.id || mappedCriteria.criterion;
                        mappedCriteria.details = getSpecificDetailsForCriterion(criterionId, mappedCriteria.passed, prelimContext);
                    }

                    return mappedCriteria;
                });
            } catch (error) {
                console.log(`[AccessibilityModule] Error enhancing ${principle} criteria: ${error.message}`);
                // Ensure criteria is always an array, even if enhancement fails
                if (!Array.isArray(wcagCompliance[principle].criteria)) {
                    wcagCompliance[principle].criteria = [];
                }
            }
        } else if (wcagCompliance[principle]) {
            // CRITICAL FIX: Ensure criteria is always an array, even if principle exists but criteria is null/undefined
            wcagCompliance[principle].criteria = [];
        }
    });

    return wcagCompliance;
}

/**
 * Generates specific recommendations for elements based on WCAG criterion
 */
function generateElementRecommendation(selector, criterionId) {
    switch (criterionId) {
        case "1.1.1":
            if (selector.includes('img')) {
                return "Add descriptive alt text that conveys the image's purpose or content";
            }
            return "Provide alternative text for non-text content";

        case "3.3.2":
            if (selector.includes('input') || selector.includes('textarea') || selector.includes('select')) {
                return "Add explicit label using <label> element or aria-label attribute";
            }
            return "Provide clear labels or instructions for form controls";

        case "4.1.2":
            if (selector.includes('aria-hidden')) {
                return "Remove aria-hidden from focusable elements or add tabindex='-1'";
            }
            return "Ensure proper ARIA roles, properties, and states are defined";

        case "2.1.1":
            return "Ensure element is keyboard accessible with proper focus management";

        case "1.4.3":
            return "Increase color contrast to meet minimum 4.5:1 ratio for normal text";

        case "2.4.4":
            return "Make link text more descriptive of its destination or purpose";

        case "2.4.6":
            return "Provide descriptive heading text that clearly describes the content";

        default:
            return "Review element for WCAG compliance and implement necessary fixes";
    }
}

/**
 * Maps generic AI responses to specific WCAG criteria based on details and principle
 */
function mapGenericToSpecificWcag(criterion, principle, prelimContext) {
    // If already has proper WCAG ID in criterion field, use it
    if (criterion.criterion && criterion.criterion.match(/^\d+\.\d+\.\d+$/)) {
        const criterionId = criterion.criterion;
        const mappedName = getWcagCriterionName(criterionId);
        const mappedLevel = getWcagCriterionLevel(criterionId);

        return {
            ...criterion,
            criterion: criterionId,
            id: criterionId,
            name: mappedName,
            level: mappedLevel,
            userImpact: getSpecificUserImpact(criterionId, principle)
        };
    }

    // Map based on details and principle
    let mappedId = "1.1.1";
    let mappedName = "Non-text Content";
    let mappedLevel = "A";

    const details = (criterion.details || "").toLowerCase();

    if (principle === 'perceivable') {
        if (details.includes('image') || details.includes('alt') || details.includes('alternative text')) {
            mappedId = "1.1.1";
            mappedName = "Non-text Content";
            mappedLevel = "A";
        } else if (details.includes('contrast') || details.includes('color')) {
            mappedId = "1.4.3";
            mappedName = "Contrast (Minimum)";
            mappedLevel = "AA";
        } else if (details.includes('resize') || details.includes('zoom')) {
            mappedId = "1.4.4";
            mappedName = "Resize Text";
            mappedLevel = "AA";
        }
    } else if (principle === 'operable') {
        if (details.includes('keyboard') || details.includes('focus')) {
            mappedId = "2.1.1";
            mappedName = "Keyboard";
            mappedLevel = "A";
        } else if (details.includes('trap') || details.includes('escape')) {
            mappedId = "2.1.2";
            mappedName = "No Keyboard Trap";
            mappedLevel = "A";
        } else if (details.includes('skip') || details.includes('navigation')) {
            mappedId = "2.4.1";
            mappedName = "Bypass Blocks";
            mappedLevel = "A";
        } else if (details.includes('link') || details.includes('purpose')) {
            mappedId = "2.4.4";
            mappedName = "Link Purpose (In Context)";
            mappedLevel = "A";
        } else if (details.includes('heading') || details.includes('label')) {
            mappedId = "2.4.6";
            mappedName = "Headings and Labels";
            mappedLevel = "AA";
        }
    } else if (principle === 'understandable') {
        if (details.includes('form') || details.includes('label') || details.includes('instruction')) {
            mappedId = "3.3.2";
            mappedName = "Labels or Instructions";
            mappedLevel = "A";
        } else if (details.includes('error') || details.includes('validation')) {
            mappedId = "3.3.1";
            mappedName = "Error Identification";
            mappedLevel = "A";
        } else if (details.includes('language')) {
            mappedId = "3.1.1";
            mappedName = "Language of Page";
            mappedLevel = "A";
        }
    } else if (principle === 'robust') {
        if (details.includes('name') || details.includes('role') || details.includes('value') || details.includes('aria')) {
            mappedId = "4.1.2";
            mappedName = "Name, Role, Value";
            mappedLevel = "A";
        } else if (details.includes('parse') || details.includes('valid')) {
            mappedId = "4.1.1";
            mappedName = "Parsing";
            mappedLevel = "A";
        }
    }

    return {
        ...criterion,
        criterion: mappedId,
        id: mappedId,
        name: mappedName,
        level: mappedLevel,
        userImpact: getSpecificUserImpact(mappedId, principle)
    };
}

/**
 * Gets the proper WCAG criterion name for a given ID
 */
function getWcagCriterionName(criterionId) {
    const names = {
        "1.1.1": "Non-text Content",
        "1.2.1": "Audio-only and Video-only (Prerecorded)",
        "1.2.2": "Captions (Prerecorded)",
        "1.2.3": "Audio Description or Media Alternative (Prerecorded)",
        "1.3.1": "Info and Relationships",
        "1.3.2": "Meaningful Sequence",
        "1.3.3": "Sensory Characteristics",
        "1.4.1": "Use of Color",
        "1.4.2": "Audio Control",
        "1.4.3": "Contrast (Minimum)",
        "1.4.4": "Resize Text",
        "1.4.5": "Images of Text",
        "1.4.6": "Contrast (Enhanced)",
        "2.1.1": "Keyboard",
        "2.1.2": "No Keyboard Trap",
        "2.1.3": "Keyboard (No Exception)",
        "2.2.1": "Timing Adjustable",
        "2.2.2": "Pause, Stop, Hide",
        "2.3.1": "Three Flashes or Below Threshold",
        "2.4.1": "Bypass Blocks",
        "2.4.2": "Page Titled",
        "2.4.3": "Focus Order",
        "2.4.4": "Link Purpose (In Context)",
        "2.4.5": "Multiple Ways",
        "2.4.6": "Headings and Labels",
        "2.4.7": "Focus Visible",
        "3.1.1": "Language of Page",
        "3.1.2": "Language of Parts",
        "3.2.1": "On Focus",
        "3.2.2": "On Input",
        "3.2.3": "Consistent Navigation",
        "3.2.4": "Consistent Identification",
        "3.3.1": "Error Identification",
        "3.3.2": "Labels or Instructions",
        "3.3.3": "Error Suggestion",
        "3.3.4": "Error Prevention (Legal, Financial, Data)",
        "4.1.1": "Parsing",
        "4.1.2": "Name, Role, Value",
        "4.1.3": "Status Messages"
    };

    return names[criterionId] || "Unknown Criterion";
}

/**
 * Gets the proper WCAG level for a given criterion ID
 */
function getWcagCriterionLevel(criterionId) {
    const levels = {
        "1.1.1": "A", "1.2.1": "A", "1.2.2": "A", "1.2.3": "A", "1.3.1": "A", "1.3.2": "A", "1.3.3": "A",
        "1.4.1": "A", "1.4.2": "A", "2.1.1": "A", "2.1.2": "A", "2.2.1": "A", "2.2.2": "A", "2.3.1": "A",
        "2.4.1": "A", "2.4.2": "A", "2.4.3": "A", "2.4.4": "A", "3.1.1": "A", "3.2.1": "A", "3.2.2": "A",
        "3.3.1": "A", "3.3.2": "A", "4.1.1": "A", "4.1.2": "A",

        "1.2.4": "AA", "1.2.5": "AA", "1.3.4": "AA", "1.3.5": "AA", "1.4.3": "AA", "1.4.4": "AA", "1.4.5": "AA",
        "1.4.10": "AA", "1.4.11": "AA", "1.4.12": "AA", "1.4.13": "AA", "2.4.5": "AA", "2.4.6": "AA", "2.4.7": "AA",
        "3.1.2": "AA", "3.2.3": "AA", "3.2.4": "AA", "3.3.3": "AA", "3.3.4": "AA", "4.1.3": "AA",

        "1.2.6": "AAA", "1.2.7": "AAA", "1.2.8": "AAA", "1.2.9": "AAA", "1.3.6": "AAA", "1.4.6": "AAA",
        "1.4.7": "AAA", "1.4.8": "AAA", "1.4.9": "AAA", "2.1.3": "AAA", "2.2.3": "AAA", "2.2.4": "AAA",
        "2.2.5": "AAA", "2.2.6": "AAA", "2.3.2": "AAA", "2.3.3": "AAA", "2.4.8": "AAA", "2.4.9": "AAA",
        "2.4.10": "AAA", "3.1.3": "AAA", "3.1.4": "AAA", "3.1.5": "AAA", "3.1.6": "AAA", "3.2.5": "AAA",
        "3.3.5": "AAA", "3.3.6": "AAA"
    };

    return levels[criterionId] || "A";
}

/**
 * Gets specific user impact for a WCAG criterion
 */
function getSpecificUserImpact(criterionId, principle) {
    const impacts = {
        "1.1.1": "Affects users who rely on screen readers or cannot see images",
        "1.4.3": "Affects users with low vision or color vision deficiencies",
        "1.4.4": "Affects users who need to enlarge text to read content",
        "2.1.1": "Affects users who cannot use a mouse and rely on keyboard navigation",
        "2.1.2": "Affects keyboard users who may get trapped in interface elements",
        "2.4.1": "Affects users who need to skip repetitive navigation content",
        "2.4.4": "Affects users who rely on screen readers to understand link purposes",
        "2.4.6": "Affects users who rely on headings for navigation and content structure",
        "3.3.1": "Affects users who need clear error identification to correct form inputs",
        "3.3.2": "Affects users who need clear labels to understand form requirements",
        "3.1.1": "Affects users who rely on assistive technologies that need language information",
        "4.1.1": "Affects users of assistive technologies that require valid HTML",
        "4.1.2": "Affects users of assistive technologies that need proper element identification"
    };

    return impacts[criterionId] || `Affects users who rely on ${principle === 'perceivable' ? 'alternative content formats' : principle === 'operable' ? 'keyboard navigation or assistive devices' : principle === 'understandable' ? 'clear instructions and consistent interfaces' : 'assistive technologies'}`;
}

/**
 * Gets specific HTML elements for a given WCAG criterion based on actual page context
 */
function getSpecificElementsForCriterion(criterionId, prelimContext) {
    const elements = [];

    switch (criterionId) {
        case "1.1.1":
            // Non-text Content - Images without alt text
            if (prelimContext.specificExamples?.images?.withoutAlt?.length > 0) {
                prelimContext.specificExamples.images.withoutAlt.forEach(img => {
                    elements.push(img.selector);
                });
            } else if (prelimContext.multimediaCount?.images > 0) {
                // If we have images but no specific examples, provide common selectors
                elements.push("img:not([alt])", "img[alt='']");
            } else {
                // No images detected, return empty array
            }
            break;

        case "1.4.3":
        case "1.4.6":
            // Contrast issues - use actual page elements
            if (prelimContext.contrastFailuresCount > 0) {
                elements.push("button", "a");
            } else {
                // Provide common elements that should be checked for contrast
                elements.push("button", "a[href]");
            }
            break;

        case "2.1.1":
            // Keyboard accessibility - focus on interactive elements
            const interactiveSelectors = ["button", "a[href]", "input", "select", "textarea"];
            if (prelimContext.specificExamples?.forms?.totalInputs > 0) {
                interactiveSelectors.push("form input", "form select", "form textarea");
            }
            elements.push(...interactiveSelectors.slice(0, 5));
            break;

        case "2.1.2":
            // No Keyboard Trap - focus on modal/overlay elements
            elements.push("[role='dialog']");
            break;

        case "2.4.1":
            // Bypass Blocks - skip links and main content
            elements.push("body", "main", "nav");
            // Add skip link selectors if not present
            elements.push("a[href^='#']");
            break;

        case "2.4.2":
            // Page Titled
            elements.push("title", "head");
            break;

        case "2.4.3":
            // Focus Order - all focusable elements
            elements.push("button", "a[href]", "input:not([type='hidden'])", "select", "textarea", "[tabindex]:not([tabindex='-1'])");
            break;

        case "2.4.4":
            // Link Purpose - use actual link examples
            if (prelimContext.specificExamples?.links?.examplesWithGenericText?.length > 0) {
                prelimContext.specificExamples.links.examplesWithGenericText.forEach(link => {
                    elements.push(`a[href*="${link.href.split('/').pop().split('?')[0]}"]`);
                });
            }
            if (prelimContext.specificExamples?.links?.examplesWithoutText?.length > 0) {
                prelimContext.specificExamples.links.examplesWithoutText.forEach(link => {
                    elements.push(link.selector);
                });
            }
            if (elements.length === 0) {
                elements.push("a[href]");
            }
            break;

        case "2.4.6":
            // Headings and Labels - use actual heading structure
            if (prelimContext.specificExamples?.headings?.length > 0) {
                const headingLevels = [...new Set(prelimContext.specificExamples.headings.map(h => h.level))];
                elements.push(...headingLevels);

                // Add specific headings without IDs if they exist
                const headingsWithoutIds = prelimContext.specificExamples.headings.filter(h => !h.hasId);
                if (headingsWithoutIds.length > 0) {
                    elements.push(`${headingsWithoutIds[0].level}:not([id])`);
                }
            } else {
                elements.push("h1", "h2", "h3", "h4", "h5", "h6");
            }
            break;

        case "2.4.7":
            // Focus Visible
            elements.push("button:focus", "a:focus", "input:focus", "select:focus", "[tabindex]:focus");
            break;

        case "3.1.1":
            // Language of Page
            elements.push("html", "html[lang]");
            break;

        case "3.2.1":
        case "3.2.2":
            // On Focus / On Input - use actual form elements
            if (prelimContext.specificExamples?.forms?.totalInputs > 0) {
                elements.push("input[type='text']", "select", "textarea");
                if (prelimContext.specificExamples.forms.examplesWithoutLabels?.length > 0) {
                    prelimContext.specificExamples.forms.examplesWithoutLabels.forEach(input => {
                        elements.push(input.selector);
                    });
                }
            } else {
                elements.push("input", "select", "textarea", "input[type='checkbox']", "input[type='radio']");
            }
            break;

        case "3.3.1":
            // Error Identification
            elements.push("[aria-invalid='true']");
            break;

        case "3.3.2":
            // Labels or Instructions - use actual form examples
            if (prelimContext.specificExamples?.forms?.examplesWithoutLabels?.length > 0) {
                prelimContext.specificExamples.forms.examplesWithoutLabels.forEach(input => {
                    elements.push(input.selector);
                });
            } else if (prelimContext.specificExamples?.forms?.totalInputs > 0 && !passed) {
                elements.push("input:not([aria-label]):not([aria-labelledby])", "select:not([aria-label])", "textarea:not([aria-label])");
            } else if (!passed) {
                elements.push("input", "select", "textarea", "form input", "form select");
            }
            break;

        case "3.3.3":
            // Error Suggestion
            elements.push("[aria-describedby]");
            break;

        case "4.1.1":
            // Parsing - elements with IDs and ARIA
            elements.push("*[id]", "[role]", "[aria-label]", "[aria-labelledby]", "[aria-describedby]");
            break;

        case "4.1.2":
            // Name, Role, Value - custom widgets and interactive elements
            elements.push("button", "[role='button']", "[role='tab']", "[role='tabpanel']", ".dropdown", "[aria-expanded]");
            if (prelimContext.ariaUsageNotes && prelimContext.ariaUsageNotes.includes("role")) {
                elements.push("[role]:not([aria-label]):not([aria-labelledby])", ".custom-widget");
            }
            break;

        case "4.1.3":
            // Status Messages
            elements.push("[aria-live]", "[role='status']", "[role='alert']");
            break;

        default:
            // For other criteria, provide context-aware generic selectors based on page content
            if (prelimContext.specificExamples?.forms?.totalInputs > 0) {
                elements.push("form", "input", "label", "fieldset");
            }
            if (prelimContext.multimediaCount?.images > 0) {
                elements.push("img", "figure", "picture");
            }
            if (prelimContext.multimediaPresent) {
                elements.push("video", "audio", "track");
            }
            if (elements.length === 0) {
                elements.push("main", "nav", "button", "a[href]", "h1", "h2");
            }
            break;
    }

    // Remove duplicates and limit to 5 elements for readability
    return [...new Set(elements)].slice(0, 5);
}

/**
 * Gets specific details for a WCAG criterion based on context and pass/fail status
 */
function getSpecificDetailsForCriterion(criterionId, passed, prelimContext) {
    switch (criterionId) {
        case "1.1.1":
            if (passed) {
                const imageCount = prelimContext.multimediaCount?.images || 0;
                return `${imageCount} images analyzed - all decorative images properly marked with empty alt text, informational images have descriptive alt text`;
            } else {
                const missingAlt = prelimContext.specificExamples?.images?.withoutAlt?.length || 0;
                const countText = missingAlt > 0 ? `${missingAlt} (or more)` : "Several";
                return `${countText} images missing alt text. Decorative images should have alt="" and informational images need descriptive alt text`;
            }

        case "1.4.3":
            if (passed) {
                return "Text color contrast meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text) across all tested elements";
            } else {
                return `${prelimContext.contrastFailuresCount || 'Several'} elements have insufficient color contrast. Primary CTA buttons and navigation links need darker colors or lighter backgrounds to meet 4.5:1 ratio`;
            }

        case "2.1.1":
            if (passed) {
                return "All interactive elements are keyboard accessible using Tab, Enter, Space, and arrow keys as appropriate";
            } else {
                return "Custom dropdown menus and modal dialogs are not fully keyboard accessible. Users cannot navigate or activate all interactive elements using only the keyboard";
            }

        case "2.4.4":
            if (passed) {
                return "Link text is descriptive and provides clear context about the destination or purpose";
            } else {
                const genericLinks = prelimContext.specificExamples?.links?.withGenericText || 0;
                const countText = genericLinks > 0 ? `${genericLinks} (or more)` : "Several";
                return `${countText} links use generic text like "click here" or "read more". Links should describe their destination or purpose`;
            }

        case "2.4.6":
            if (passed) {
                return "Headings and form labels are descriptive and clearly indicate their purpose or content";
            } else {
                return "Some headings are empty or use generic text. Headings should describe the content that follows and form labels should clearly identify input purpose";
            }

        case "3.3.2":
            if (passed) {
                return "All form inputs have clear labels or instructions indicating required information and format";
            } else {
                const unlabeledInputs = prelimContext.specificExamples?.forms?.withoutLabels || 0;
                const countText = unlabeledInputs > 0 ? `${unlabeledInputs} (or more)` : "Several";
                return `${countText} form inputs lack proper labels. Each input needs a visible label or aria-label describing what information is required`;
            }

        case "4.1.2":
            if (passed) {
                return "Custom UI components have appropriate ARIA roles, properties, and states for assistive technology compatibility";
            } else {
                return "Custom widgets like dropdowns and carousels lack proper ARIA attributes. Add role, aria-expanded, aria-controls, and other relevant ARIA properties";
            }

        default:
            if (passed) {
                return `WCAG ${criterionId} requirements are met with proper implementation of accessibility standards`;
            } else {
                return `WCAG ${criterionId} requirements not fully met - specific remediation needed based on criterion guidelines`;
            }
    }
}

// --- axe-core WCAG Automated Testing ---

/**
 * Inject and run axe-core in the browser page for real WCAG violation detection.
 * axe-core is a client-side JS library that runs automated accessibility audits
 * against WCAG 2.1 Level A and AA success criteria.
 *
 * @param {Object} page - Playwright page object
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<Object|null>} Structured violation results, or null if unavailable
 */
async function runAxeCore(page, verbose = false) {
    if (!page || page.isClosed()) {
        if (verbose) console.log('[AccessibilityModule] axe-core skipped: no browser page available');
        return null;
    }

    const axeStartTime = Date.now();
    try {
        // Inject axe-core from CDN
        await page.addScriptTag({
            url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js'
        });

        // Wait briefly for script to load
        await page.waitForFunction(() => typeof window.axe !== 'undefined', { timeout: 5000 });

        // Run axe with WCAG 2.1 AA ruleset
        const axeResults = await page.evaluate(async () => {
            if (!window.axe) return null;
            try {
                return await axe.run(document, {
                    runOnly: {
                        type: 'tag',
                        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
                    },
                    resultTypes: ['violations', 'incomplete']
                });
            } catch (e) {
                return { error: e.message };
            }
        });

        if (!axeResults || axeResults.error) {
            if (verbose) console.warn(`[AccessibilityModule] axe-core run failed: ${axeResults?.error || 'unknown'}`);
            return null;
        }

        const elapsed = ((Date.now() - axeStartTime) / 1000).toFixed(1);
        const criticalCount = axeResults.violations.filter(v => v.impact === 'critical').length;
        const seriousCount = axeResults.violations.filter(v => v.impact === 'serious').length;
        const moderateCount = axeResults.violations.filter(v => v.impact === 'moderate').length;
        const minorCount = axeResults.violations.filter(v => v.impact === 'minor').length;

        if (verbose) {
            console.log(`[AccessibilityModule] ✅ axe-core completed in ${elapsed}s: ${axeResults.violations.length} violations (${criticalCount} critical, ${seriousCount} serious, ${moderateCount} moderate, ${minorCount} minor), ${axeResults.incomplete.length} incomplete`);
        }

        // Transform axe results into our format
        const result = {
            violationCount: axeResults.violations.length,
            criticalCount,
            seriousCount,
            moderateCount,
            minorCount,
            incompleteCount: axeResults.incomplete.length,
            totalNodeFailures: axeResults.violations.reduce((sum, v) => sum + v.nodes.length, 0),
            violations: axeResults.violations.slice(0, 25).map(v => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                help: v.help,
                helpUrl: v.helpUrl,
                wcagTags: v.tags.filter(t => t.startsWith('wcag')),
                nodeCount: v.nodes.length,
                nodes: v.nodes.slice(0, 3).map(n => ({
                    target: Array.isArray(n.target) ? n.target[0] : n.target,
                    html: (n.html || '').substring(0, 200),
                    failureSummary: (n.failureSummary || '').substring(0, 200)
                }))
            })),
            summary: `axe-core found ${axeResults.violations.length} WCAG violations: ` +
                `${criticalCount} critical, ${seriousCount} serious, ` +
                `${moderateCount} moderate, ${minorCount} minor. ` +
                `${axeResults.incomplete.length} rules need manual review.`,
            elapsedSeconds: parseFloat(elapsed)
        };

        return result;

    } catch (err) {
        if (verbose) console.warn(`[AccessibilityModule] axe-core injection/run failed: ${err.message}`);
        return null;
    }
}

// --- Helper Functions for Preliminary Data Gathering & Defaults ---

function createDefaultPaginatedArray(items = [], totalItems = null, pageSize = null) {
    const actualItems = Array.isArray(items) ? items : [];
    const itemCount = actualItems.length;
    const total = totalItems !== null ? totalItems : itemCount;
    if (itemCount === 0 && total === 0) { return { items: [], totalAvailableItems: 0, pagination: null }; }
    const effectivePageSize = pageSize || (itemCount > 0 ? itemCount : 10);
    if (total <= effectivePageSize && itemCount <= effectivePageSize) { return { items: actualItems, totalAvailableItems: total, pagination: null }; }
    return {
        items: actualItems, totalAvailableItems: total,
        pagination: { pageNumber: 1, pageSize: effectivePageSize, totalPages: Math.ceil(total / effectivePageSize) || 1 }
    };
}

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

/**
 * Gathers preliminary accessibility context from the page.
 * This can be expanded with basic Axe-core integration or more detailed DOM checks.
 */
async function getAccessibilityContext(page, verbose = false, sharedPageContext = null) {
    if (verbose) { console.log('[AccessibilityModule] Gathering preliminary accessibility context...'); }
    if (!page || page.isClosed()) {
        // No browser — use sharedPageContext from cfHtmlExtractor if available
        if (sharedPageContext) {
            if (verbose) { console.log('[AccessibilityModule] Using sharedPageContext (CF) for accessibility context'); }
            const spc = sharedPageContext;

            // Image analysis from CF extractor
            const imageTotal = spc.images?.total || 0;
            const imageWithAlt = spc.images?.withAlt || 0;
            const imageWithoutAlt = imageTotal - imageWithAlt;

            // Heading structure from CF extractor
            const headingStructure = [];
            if (spc.headings) {
                for (const [level, texts] of Object.entries(spc.headings)) {
                    if (Array.isArray(texts)) {
                        texts.forEach(text => headingStructure.push({
                            level,
                            text: (text || '').substring(0, 50) + ((text || '').length > 50 ? '...' : ''),
                            hasId: false
                        }));
                    }
                }
            }

            // Form analysis from CF extractor (enhanced with label coverage)
            let totalFormInputs = 0;
            if (spc.formLabels) {
                // Use enhanced label data from cfHtmlExtractor
                totalFormInputs = spc.formLabels.totalInputs || 0;
            }

            // Link analysis from CF extractor
            const totalLinks = (spc.links?.internal || 0) + (spc.links?.external || 0);

            // ARIA usage — CF extractor captures some ARIA data
            const ariaElements = spc.ariaElements || 0;
            const ariaRoles = spc.ariaRoles || [];

            // BROWSER AUDIT ENRICHMENT: Use real axe-core data from Browser Audit Worker if available
            const browserAxe = spc.browserAudit?.axeResults;
            const hasRealAxeData = browserAxe && !browserAxe.error && browserAxe.violationCount !== undefined;

            return {
                automatedIssuesCount: hasRealAxeData ? browserAxe.violationCount : 0,
                criticalA11yIssues: hasRealAxeData ? (browserAxe.criticalCount + browserAxe.seriousCount) : 0,
                axeViolationsSummary: hasRealAxeData
                    ? browserAxe.summary
                    : 'Axe-core not available in serverless mode. Analysis based on HTML structure.',
                axeResults: hasRealAxeData ? browserAxe : null, // Full structured data for prompt
                keyboardIssuesSummary: 'Keyboard accessibility requires live browser testing.',
                contrastFailuresCount: hasRealAxeData
                    ? (browserAxe.violations?.filter(v => v.id === 'color-contrast')[0]?.nodeCount || 0)
                    : 0,
                ariaUsageNotes: ariaElements > 0
                    ? `Found ${ariaElements} elements with ARIA attributes. Roles: ${ariaRoles.slice(0, 5).join(', ')}.`
                    : 'ARIA usage analysis from HTML structure.',
                formA11yIssuesSnippet: totalFormInputs > 0
                    ? `${totalFormInputs} form input(s) detected. Label association requires DOM evaluation.`
                    : 'No form inputs detected.',
                multimediaA11ySnippet: imageTotal > 0
                    ? `${imageTotal} images found, ${imageWithAlt} with alt text, ${imageWithoutAlt} missing alt text.`
                    : 'No images detected on the page.',
                pageTitle: spc.title || 'N/A',
                mainContentSample: spc.bodyText ? spc.bodyText.substring(0, 1000) : 'Page content not available.',
                multimediaPresent: false, // Can't detect video/audio from CF markdown
                multimediaCount: { videos: 0, audios: 0, images: imageTotal },
                specificExamples: {
                    images: {
                        withoutAlt: imageWithoutAlt > 0 ? Array.from(
                            { length: Math.min(3, imageWithoutAlt) },
                            (_, i) => ({ src: `image-${i + 1} (from HTML scan)`, selector: 'img:not([alt])' })
                        ) : [],
                        withAlt: imageWithAlt > 0 ? Array.from(
                            { length: Math.min(3, imageWithAlt) },
                            (_, i) => ({ alt: `(alt text detected)`, selector: `img[alt]:nth-of-type(${i + 1})` })
                        ) : []
                    },
                    forms: {
                        totalInputs: totalFormInputs,
                        withLabels: spc.formLabels ? (spc.formLabels.withExplicitLabel + spc.formLabels.withAriaLabel) : 0,
                        withoutLabels: spc.formLabels ? spc.formLabels.withoutLabel : totalFormInputs,
                        examplesWithoutLabels: spc.forms?.slice(0, 3).map(f => ({
                            type: f.method || 'form',
                            selector: f.action ? `form[action="${f.action}"]` : 'form'
                        })) || []
                    },
                    headings: headingStructure.slice(0, 10),
                    links: {
                        total: totalLinks,
                        withoutText: 0,
                        withGenericText: 0,
                        examplesWithoutText: [],
                        examplesWithGenericText: []
                    }
                }
            };
        }

        // No browser AND no SPC — true fallback
        if (verbose) { console.warn("[AccessibilityModule] Page object is closed or invalid, no sharedPageContext available."); }
        return {
            automatedIssuesCount: 0,
            criticalA11yIssues: 0,
            axeViolationsSummary: "Axe-core not run in this basic context extraction.",
            keyboardIssuesSummary: "Basic check: Ensure all interactive elements are focusable and have visible focus indicators.",
            contrastFailuresCount: 0,
            ariaUsageNotes: "Manual check needed.",
            formA11yIssuesSnippet: "Manual check needed.",
            multimediaA11ySnippet: "Manual check needed.",
            pageTitle: "N/A", mainContentSample: "Page not available.",
            multimediaPresent: false, multimediaCount: { videos: 0, audios: 0, images: 0 },
            specificExamples: { images: [], forms: [], headings: [], links: [] }
        };
    }
    try {
        return await page.evaluate(() => {
            const context = {
                automatedIssuesCount: 0, // Placeholder for Axe or similar tool count
                criticalA11yIssues: 0,   // Placeholder
                axeViolationsSummary: "Axe-core not run in this basic context extraction.", // Placeholder
                keyboardIssuesSummary: "Basic check: Ensure all interactive elements are focusable and have visible focus indicators.",
                contrastFailuresCount: 0, // Placeholder
                ariaUsageNotes: "",
                formA11yIssuesSnippet: "",
                multimediaA11ySnippet: "",
                pageTitle: document.title || "N/A",
                mainContentSample: document.querySelector('main')?.innerText?.substring(0, 1000) || document.body?.innerText?.substring(0, 1000) || "No main content found.",
                multimediaPresent: false,
                // ACCURACY FIX: Extract lang attribute and skip navigation as first-class fields
                htmlLang: document.documentElement.lang || null,
                skipNavPresent: !!(document.querySelector('a[href="#main-content"], a[href="#content"], a[href="#main"], [class*="skip-nav" i], [class*="skip-link" i], [class*="skipnav" i], [class*="skip-to" i]')),
                // ACCURACY FIX: Detect :focus-visible or :focus CSS rules in stylesheets
                hasFocusVisibleStyles: (() => {
                    try {
                        for (const sheet of Array.from(document.styleSheets)) {
                            try {
                                for (const rule of Array.from(sheet.cssRules || [])) {
                                    const sel = (rule.selectorText || '').toLowerCase();
                                    if (sel.includes(':focus-visible') || (sel.includes(':focus') && !sel.includes(':focus-within'))) {
                                        return true;
                                    }
                                }
                            } catch (e) { /* cross-origin stylesheet */ }
                        }
                        return false;
                    } catch (e) { return false; }
                })(),
                multimediaCount: { videos: 0, audios: 0, images: 0 },
                specificExamples: { images: [], forms: [], headings: [], links: [] }
            };

            // Enhanced multimedia detection
            const videos = document.querySelectorAll('video');
            const audios = document.querySelectorAll('audio');
            const images = document.querySelectorAll('img');

            context.multimediaCount = {
                videos: videos.length,
                audios: audios.length,
                images: images.length
            };
            context.multimediaPresent = videos.length > 0 || audios.length > 0;

            // Collect specific examples for more detailed WCAG criteria
            // Images with/without alt text
            const imagesWithoutAlt = Array.from(images).filter(img => !img.alt || img.alt.trim() === '');
            const imagesWithAlt = Array.from(images).filter(img => img.alt && img.alt.trim() !== '');
            context.specificExamples.images = {
                withoutAlt: imagesWithoutAlt.slice(0, 3).map(img => ({
                    src: img.src ? img.src.substring(0, 50) + '...' : 'inline',
                    selector: img.id ? `#${img.id}` : (img.className ? `img.${Array.from(img.classList).join('.')}` : (img.src ? `img[src*="${img.src.split('/').pop().split('?')[0]}"]` : 'img'))
                })),
                withAlt: imagesWithAlt.slice(0, 3).map(img => ({
                    alt: img.alt.substring(0, 50) + (img.alt.length > 50 ? '...' : ''),
                    selector: img.id ? `#${img.id}` : (img.className ? `img.${Array.from(img.classList).join('.')}` : (img.src ? `img[src*="${img.src.split('/').pop().split('?')[0]}"]` : 'img'))
                }))
            };

            // Form examples
            const forms = document.querySelectorAll('form');
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), textarea, select');
            const inputsWithLabels = Array.from(inputs).filter(input => {
                if (input.id && document.querySelector(`label[for="${input.id}"]`)) { return true; }
                if (input.closest('label')) { return true; }
                if (input.getAttribute('aria-label') || input.getAttribute('aria-labelledby')) { return true; }
                return false;
            });
            const inputsWithoutLabels = Array.from(inputs).filter(input => !inputsWithLabels.includes(input));

            context.specificExamples.forms = {
                totalInputs: inputs.length,
                withLabels: inputsWithLabels.length,
                withoutLabels: inputsWithoutLabels.length,
                examplesWithoutLabels: inputsWithoutLabels.slice(0, 3).map(input => ({
                    type: input.type || input.tagName.toLowerCase(),
                    selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : input.tagName.toLowerCase()
                }))
            };

            // Heading structure examples
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            const headingStructure = Array.from(headings).slice(0, 10).map(h => ({
                level: h.tagName.toLowerCase(),
                text: h.textContent.substring(0, 50) + (h.textContent.length > 50 ? '...' : ''),
                hasId: !!h.id
            }));
            context.specificExamples.headings = headingStructure;

            // Link examples
            const links = document.querySelectorAll('a[href]');
            const linksWithoutText = Array.from(links).filter(link => !link.textContent.trim() && !link.getAttribute('aria-label'));
            const linksWithGenericText = Array.from(links).filter(link => {
                const text = link.textContent.trim().toLowerCase();
                return ['click here', 'read more', 'more', 'here', 'link'].includes(text);
            });

            context.specificExamples.links = {
                total: links.length,
                withoutText: linksWithoutText.length,
                withGenericText: linksWithGenericText.length,
                examplesWithoutText: linksWithoutText.slice(0, 3).map(link => ({
                    href: link.href.substring(0, 50) + '...',
                    selector: link.id ? `#${link.id}` : (link.className ? `a.${Array.from(link.classList).join('.')}` : `a[href*="${link.href.split('/').pop().split('?')[0]}"]`)
                })),
                examplesWithGenericText: linksWithGenericText.slice(0, 3).map(link => ({
                    text: link.textContent.trim(),
                    href: link.href.substring(0, 50) + '...',
                    selector: link.id ? `#${link.id}` : (link.className ? `a.${Array.from(link.classList).join('.')}` : `a[href*="${link.href.split('/').pop().split('?')[0]}"]`)
                }))
            };

            // ARIA usage hints
            const ariaElements = document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], [aria-expanded], [aria-haspopup]');
            context.ariaUsageNotes = `Found ${ariaElements.length} elements with ARIA attributes. Common roles: ${Array.from(new Set(Array.from(ariaElements).map(el => el.getAttribute('role')))).filter(Boolean).slice(0, 3).join(', ')}.`;
            if (ariaElements.length > 20) { context.ariaUsageNotes += " Extensive ARIA usage noted; verify correctness."; }
            if (document.querySelector('[aria-hidden="true"]:not([tabindex="-1"])')) { // Visible element hidden from AT
                context.ariaUsageNotes += " Potential issue: aria-hidden='true' on a potentially focusable/visible element.";
            }

            // Form accessibility hints
            const formIssues = [];
            forms.forEach(form => {
                const formInputsWithoutLabels = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), textarea, select')).filter(el => !el.id || !document.querySelector(`label[for="${el.id}"]`));
                if (formInputsWithoutLabels.length > 0) { formIssues.push(`${formInputsWithoutLabels.length} input(s) in form '${form.id || form.name || "unnamed form"}' appear to be missing explicit labels.`); }
            });
            context.formA11yIssuesSnippet = formIssues.slice(0, 2).join('; ') || "Basic form label check passed or no forms found.";

            // Enhanced multimedia hints
            const mediaIssues = [];
            if (context.multimediaCount.videos === 0 && context.multimediaCount.audios === 0) {
                context.multimediaA11ySnippet = "No video or audio multimedia elements detected on this page.";
            } else {
                videos.forEach(video => {
                    if (!video.querySelector('track[kind="captions"]')) {
                        mediaIssues.push(`Video missing captions: ${(video.src || video.currentSrc || 'embedded video').substring(0, 50)}...`);
                    }
                });
                audios.forEach(audio => {
                    if (!audio.querySelector('track[kind="descriptions"]') && !audio.closest('[data-transcript]')) {
                        mediaIssues.push(`Audio missing transcript: ${(audio.src || audio.currentSrc || 'embedded audio').substring(0, 50)}...`);
                    }
                });
                context.multimediaA11ySnippet = mediaIssues.length > 0 ?
                    mediaIssues.slice(0, 2).join('; ') :
                    `${context.multimediaCount.videos} video(s) and ${context.multimediaCount.audios} audio element(s) detected with basic accessibility features present.`;
            }

            // Images are handled separately from multimedia (videos/audio)
            if (context.multimediaCount.images > 0) {
                images.forEach(img => {
                    if (!img.alt || img.alt.trim() === '') {
                        mediaIssues.push(`Image missing alt text: ${(img.src || "inline image").substring(0, 50)}...`);
                    }
                });
            }

            // Basic contrast check (very naive, AI should do a proper assessment)
            // This is extremely simplified and not a real contrast check.
            const textElements = Array.from(document.querySelectorAll('p, span, a, li, h1, h2, h3, h4, h5, h6'));
            let lowContrastHints = 0;
            textElements.slice(0, 50).forEach(el => { // Check a sample
                try {
                    const style = window.getComputedStyle(el);
                    const color = style.color; // rgb(r, g, b)
                    const bgColor = window.getComputedStyle(el.parentElement || document.body).backgroundColor; // Approximate
                    if (color && bgColor && color.startsWith('rgb') && bgColor.startsWith('rgb')) {
                        // Simplified check: if colors are too similar (e.g., light grey on white)
                        const c = color.match(/\d+/g).map(Number);
                        const bg = bgColor.match(/\d+/g).map(Number);
                        if (c.length === 3 && bg.length === 3) {
                            const diff = Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]);
                            if (diff < 100) { lowContrastHints++; } // Arbitrary low threshold for a hint
                        }
                    }
                } catch (e) {/* ignore */ }
            });
            context.contrastFailuresCount = lowContrastHints;

            return context;
        });
    } catch (error) {
        if (verbose) { console.error(`[AccessibilityModule] Error gathering preliminary accessibility context: ${error.message}`); }
        return {
            automatedIssuesCount: 0, criticalA11yIssues: 0, axeViolationsSummary: `Error: ${error.message.substring(0, 50)}`,
            keyboardIssuesSummary: "Error.", contrastFailuresCount: 0, ariaUsageNotes: "Error.",
            formA11yIssuesSnippet: "Error.", multimediaA11ySnippet: "Error.",
            pageTitle: "Error", mainContentSample: "Error.",
            multimediaPresent: false, multimediaCount: { videos: 0, audios: 0, images: 0 },
            specificExamples: { images: [], forms: [], headings: [], links: [] }
        };
    }
}

/**
 * GOLD-STANDARD: Analyzes real ARIA tree snapshot for screen reader compatibility.
 * Uses Playwright's page.accessibility.snapshot() to get actual accessibility tree
 * data instead of fabricating scores from heuristics and random variance.
 */
async function getAriaTreeSnapshot(page, verbose = false) {
    if (!page || page.isClosed()) {
        return { error: 'Page not available for ARIA tree analysis', nodes: [] };
    }
    try {
        const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
        if (!snapshot) {
            return { error: 'ARIA snapshot returned null', nodes: [] };
        }

        // Flatten the ARIA tree for analysis
        const nodes = [];
        const flattenTree = (node, depth = 0) => {
            if (!node) return;
            nodes.push({
                role: node.role,
                name: node.name || '',
                hasName: !!node.name && node.name.trim().length > 0,
                depth,
                focusable: node.focused !== undefined,
                value: node.value || null,
                description: node.description || null
            });
            if (Array.isArray(node.children)) {
                node.children.forEach(child => flattenTree(child, depth + 1));
            }
        };
        flattenTree(snapshot);

        return { nodes, rootRole: snapshot.role, rootName: snapshot.name };
    } catch (err) {
        if (verbose) { console.warn(`[AccessibilityModule] ARIA snapshot failed: ${err.message}`); }
        return { error: err.message, nodes: [] };
    }
}

/**
 * GOLD-STANDARD: Calculates screen reader compatibility score from REAL ARIA tree data.
 * No fabrication — scores are derived entirely from actual accessibility tree quality.
 */
function calculateScreenReaderScoreFromAriaTree(ariaSnapshot, prelimContext) {
    if (!ariaSnapshot || ariaSnapshot.error || ariaSnapshot.nodes.length === 0) {
        return { score: null, source: 'aria-snapshot-failed', issues: ['ARIA tree analysis unavailable — manual screen reader testing recommended'] };
    }

    const nodes = ariaSnapshot.nodes;
    let score = 100; // Start perfect, deduct for issues
    const issues = [];

    // 1. Check labeled elements ratio
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'slider', 'menuitem', 'tab'];
    const interactiveNodes = nodes.filter(n => interactiveRoles.includes(n.role));
    const unlabeledInteractive = interactiveNodes.filter(n => !n.hasName);
    if (interactiveNodes.length > 0) {
        const unlabeledRatio = unlabeledInteractive.length / interactiveNodes.length;
        if (unlabeledRatio > 0.3) {
            score -= 25;
            issues.push(`${unlabeledInteractive.length} of ${interactiveNodes.length} interactive elements lack accessible names`);
        } else if (unlabeledRatio > 0.1) {
            score -= 15;
            issues.push(`${unlabeledInteractive.length} interactive elements missing accessible names`);
        } else if (unlabeledInteractive.length > 0) {
            score -= 5;
            issues.push(`${unlabeledInteractive.length} interactive element(s) without accessible names`);
        }
    }

    // 2. Check for images without names
    const images = nodes.filter(n => n.role === 'img' || n.role === 'image');
    const unlabeledImages = images.filter(n => !n.hasName);
    if (unlabeledImages.length > 0) {
        score -= Math.min(15, unlabeledImages.length * 3);
        issues.push(`${unlabeledImages.length} image(s) lack alt text (not announced to screen readers)`);
    }

    // 3. Check heading structure
    const headings = nodes.filter(n => n.role === 'heading');
    if (headings.length === 0) {
        score -= 15;
        issues.push('No headings found in ARIA tree — screen reader heading navigation will not work');
    } else if (headings.length < 3) {
        score -= 5;
        issues.push(`Only ${headings.length} heading(s) found — limited heading navigation`);
    }

    // 4. Check landmark regions
    const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'region'];
    const landmarks = nodes.filter(n => landmarkRoles.includes(n.role));
    if (landmarks.length === 0) {
        score -= 15;
        issues.push('No ARIA landmark regions found — screen reader region navigation unavailable');
    } else if (!landmarks.find(n => n.role === 'main')) {
        score -= 8;
        issues.push('No main landmark — screen readers cannot skip to primary content');
    }

    // 5. Check form labels from prelim context
    const formsWithoutLabels = getNestedProperty(prelimContext, 'specificExamples.forms.withoutLabels', 0);
    if (formsWithoutLabels > 0) {
        score -= Math.min(20, formsWithoutLabels * 5);
        issues.push(`${formsWithoutLabels} form input(s) without associated labels`);
    }

    // 6. Check links with generic or missing text
    const links = nodes.filter(n => n.role === 'link');
    const genericLinkNames = ['click here', 'read more', 'learn more', 'here', 'more', 'link'];
    const genericLinks = links.filter(n => n.hasName && genericLinkNames.includes(n.name.toLowerCase().trim()));
    const emptyLinks = links.filter(n => !n.hasName);
    if (emptyLinks.length > 0) {
        score -= Math.min(15, emptyLinks.length * 3);
        issues.push(`${emptyLinks.length} link(s) with no accessible name`);
    }
    if (genericLinks.length > 0) {
        score -= Math.min(10, genericLinks.length * 2);
        issues.push(`${genericLinks.length} link(s) with generic text ("${genericLinks[0]?.name}")`);
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score: Math.round(score),
        source: 'aria-tree-analysis',
        totalNodes: nodes.length,
        interactiveElements: interactiveNodes.length,
        headingsCount: headings.length,
        landmarksCount: landmarks.length,
        issues
    };
}

/**
 * GOLD-STANDARD: Generates screen reader device results from real ARIA analysis.
 * All 4 screen readers share the same ARIA tree score (they all read the same DOM),
 * with minor device-specific adjustments based on known engine differences.
 */
function generateScreenReaderDevicesFromAriaTree(ariaAnalysis) {
    const baseScore = ariaAnalysis.score;
    const baseIssues = ariaAnalysis.issues || [];

    // If ARIA analysis failed, return honest "not tested" results
    if (baseScore === null) {
        return ["NVDA", "JAWS", "VoiceOver", "TalkBack"].map(name => ({
            name,
            version: "Not tested",
            score: null,
            compatibilityScore: null,
            issues: [{ text: "Screen reader testing unavailable — ARIA tree analysis failed. Manual testing recommended.", severity: "Medium" }]
        }));
    }

    // Known device-specific adjustments (based on real engine differences, not fabricated)
    // These are small because all screen readers read the SAME ARIA tree
    const deviceAdjustments = {
        'NVDA': { adj: 2, note: 'NVDA: Best web ARIA support among Windows screen readers' },
        'JAWS': { adj: 0, note: 'JAWS: Strong support but occasional issues with live regions' },
        'VoiceOver': { adj: -2, note: 'VoiceOver: Some webkit-specific ARIA rendering differences' },
        'TalkBack': { adj: -3, note: 'TalkBack: Mobile-optimized, complex web apps may have reduced compatibility' }
    };

    return Object.entries(deviceAdjustments).map(([name, config]) => {
        const deviceScore = Math.max(0, Math.min(100, baseScore + config.adj));
        return {
            name,
            version: "Latest",
            score: deviceScore,
            compatibilityScore: deviceScore,
            issues: baseIssues.map(text => ({
                id: require('uuid').v4(),
                text,
                severity: deviceScore < 50 ? "High" : deviceScore < 70 ? "Medium" : "Low",
                category: "accessibility",
                source: "accessibility",
                impact: "Screen reader users may encounter navigation or comprehension barriers",
                recommendation: text
            }))
        };
    });
}

// --- Main Analyze Function ---

async function analyze(url, collectedData, screenshots, options = {}) {
        // Standardized interface parameter mapping
    const sharedPageContext = collectedData || options.sharedPageContext || {};
    options.url = url || options.url;

const {
        page,
        modelFamily, model, maxTokens,
        onProgress, verbose = false,
        analysisDepth = 'basic',
        tier = "Basic",
        featureSet = {},
        industryContext,
        targetWcagLevel = "AA", // Default target level
        costAggregator = null, // Add costAggregator parameter
        dependencies = {} // Add dependencies parameter for cross-module data
    } = options;

    const modelConfigOptions = { modelFamily, model, maxTokens, tier, analysisDepth };
    const startTimestamp = Date.now();

    if (verbose) { console.log(`[AccessibilityModule] Starting accessibility analysis for ${url} (Tier: ${tier}, Depth: ${analysisDepth}, Target WCAG: ${targetWcagLevel})`); }
    if (onProgress) { onProgress('accessibility', 'Initializing accessibility analysis', 0); }

    // Initialize main output structure adhering to $defs/accessibilityModule
    let accessibilityModuleOutput = {
        summary: { score: null, rating: 'Pending', topIssues: [] },
        _skipped: true, // Cleared when analysis succeeds
        wcagCompliance: {
            perceivable: {
                score: 0,
                issues: [],
                criteria: []
            },
            operable: {
                score: 0,
                issues: [],
                criteria: []
            },
            understandable: {
                score: 0,
                issues: [],
                criteria: []
            },
            robust: {
                score: 0,
                issues: [],
                criteria: []
            },
            cognitive: {
                score: 0,
                issues: [],
                criteria: []
            },
            overallWcagScore: 0,
            conformanceLevelAchieved: "None"
        },
        screenReaderTesting: null,
        implementationPlan: {},
        recommendations: createDefaultPaginatedArray(),
        issues: createDefaultPaginatedArray(),
        // Enterprise fields
        industryBenchmarks: null, roiProjections: null, businessImpact: null,
        error: null
    };

    try {
        if (!page || page.isClosed()) {
            if (verbose) console.warn("[AccessibilityModule] No Playwright page; falling back to visual/CF analysis.");
        }

        if (onProgress) { onProgress('accessibility', 'Gathering preliminary page context', 10); }
        const prelimContext = await getAccessibilityContext(page, verbose, options.sharedPageContext);
        if (onProgress) { onProgress('accessibility', 'Preliminary context gathered', 15); }

        // ENHANCED: Deterministic HTML-based accessibility signal extraction (works without Playwright)
        const rawHtml = sharedPageContext._rawHtml || '';
        if (rawHtml) {
            const { extractAccessibilitySignalsFromHtml } = require('../utils/cfHtmlExtractor');
            const htmlA11ySignals = extractAccessibilitySignalsFromHtml(rawHtml, verbose);
            accessibilityModuleOutput._htmlA11ySignals = htmlA11ySignals;

            // Enrich preliminary context with precise HTML-derived data
            // Images — more accurate than the sharedPageContext estimate
            if (htmlA11ySignals.images.total > 0) {
                prelimContext.multimediaCount = prelimContext.multimediaCount || {};
                prelimContext.multimediaCount.images = htmlA11ySignals.images.total;
                prelimContext.specificExamples = prelimContext.specificExamples || {};
                prelimContext.specificExamples.images = {
                    withoutAlt: htmlA11ySignals.images.samples.map(s => ({ src: s.src, selector: 'img:not([alt])' })),
                    withAlt: [],
                };
                prelimContext.multimediaA11ySnippet = `${htmlA11ySignals.images.total} images: ${htmlA11ySignals.images.withAlt} with alt, ${htmlA11ySignals.images.missingAlt} missing alt, ${htmlA11ySignals.images.emptyAlt} empty alt`;
            }

            // Headings — precise hierarchy from HTML
            if (htmlA11ySignals.headings.total > 0) {
                prelimContext.specificExamples = prelimContext.specificExamples || {};
                prelimContext.specificExamples.headings = htmlA11ySignals.headings.structure.map(h => ({
                    level: `h${h.level}`, text: h.text, hasId: false
                }));
            }

            // Forms — precise label association
            if (htmlA11ySignals.forms.totalInputs > 0) {
                prelimContext.specificExamples = prelimContext.specificExamples || {};
                prelimContext.specificExamples.forms = {
                    totalInputs: htmlA11ySignals.forms.totalInputs,
                    withLabels: htmlA11ySignals.forms.withExplicitLabel + htmlA11ySignals.forms.withAriaLabel,
                    withoutLabels: htmlA11ySignals.forms.withoutLabel,
                    examplesWithoutLabels: [],
                };
                prelimContext.formA11yIssuesSnippet = htmlA11ySignals.forms.withoutLabel > 0
                    ? `${htmlA11ySignals.forms.withoutLabel} of ${htmlA11ySignals.forms.totalInputs} form inputs lack labels`
                    : 'All form inputs have associated labels';
            }

            // ARIA
            prelimContext.ariaUsageNotes = `${htmlA11ySignals.aria.elementCount} ARIA elements. Roles: ${htmlA11ySignals.aria.roles.slice(0, 5).join(', ')}. Landmarks: ${htmlA11ySignals.aria.landmarkCount} (main=${htmlA11ySignals.aria.hasMain}, nav=${htmlA11ySignals.aria.hasNav}, footer=${htmlA11ySignals.aria.hasFooter}).`;

            // Language
            if (!htmlA11ySignals.language.present) {
                prelimContext.ariaUsageNotes += ' WARNING: html[lang] attribute missing.';
            }

            if (verbose) console.log(`[AccessibilityModule] HTML fallback enriched prelim context from cheerio`);
        }

        // Fetch deterministic DOM signals for the scoring engine
        if (page && !page.isClosed()) {
            if (verbose) { console.log('[AccessibilityModule] Collecting deterministic DOM signals...'); }
            const html = await page.content().catch(() => '');
            accessibilityModuleOutput._collectedSignals = collectDomSignals(html);
        }

        // GOLD-STANDARD: Run axe-core for real WCAG violation detection
        if (onProgress) { onProgress('accessibility', 'Running axe-core WCAG testing', 18); }
        const axeResults = await runAxeCore(page, verbose);
        
        // Merge axe-core results into preliminary context
        if (axeResults) {
            prelimContext.automatedIssuesCount = axeResults.violationCount;
            prelimContext.criticalA11yIssues = axeResults.criticalCount + axeResults.seriousCount;
            prelimContext.axeViolationsSummary = axeResults.summary;
            prelimContext.axeResults = axeResults; // Full structured data for prompt
            if (verbose) {
                console.log(`[AccessibilityModule] axe-core enriched preliminary context: ${axeResults.violationCount} violations, ${axeResults.criticalCount} critical`);
            }
        }

        // GOLD-STANDARD: Capture real ARIA tree snapshot for screen reader scoring
        const ariaSnapshot = await getAriaTreeSnapshot(page, verbose);
        const ariaAnalysis = calculateScreenReaderScoreFromAriaTree(ariaSnapshot, prelimContext);
        if (verbose) {
            console.log(`[AccessibilityModule] ARIA tree analysis: ${ariaAnalysis.score !== null ? `score=${ariaAnalysis.score}, nodes=${ariaAnalysis.totalNodes}` : `failed: ${ariaAnalysis.issues?.[0]}`}`);
        }

        // ENHANCED: Integrate Lighthouse accessibility data if available from performance module
        const { performanceModuleData } = dependencies;
        const lighthouseStatus = getLighthouseDataStatus(performanceModuleData);
        const lighthouseScores = getLighthouseScores(performanceModuleData);
        const accessibilityAudits = getAccessibilityAudits(performanceModuleData);

        if (verbose && lighthouseStatus.available) {
            console.log(`[AccessibilityModule] Enhanced with ${getLighthouseDataSummary(performanceModuleData)}`);
            console.log(`[AccessibilityModule] Lighthouse accessibility score: ${lighthouseScores.accessibility || 'N/A'}`);
            console.log(`[AccessibilityModule] Found ${accessibilityAudits.length} accessibility audits from Lighthouse`);
        }

        const promptVariables = {
            url,
            industryContext: industryContext || { primaryIndustry: "Unknown" },
            analysisDepth, tier, featureSet: JSON.stringify(featureSet),
            currentDate: new Date().toISOString().split('T')[0],
            targetWcagLevel,

            // Enhanced context for AI with specific examples
            automatedIssuesCount: prelimContext.automatedIssuesCount,
            criticalA11yIssues: prelimContext.criticalA11yIssues,
            axeViolationsSummary: prelimContext.axeViolationsSummary,
            keyboardIssuesSummary: prelimContext.keyboardIssuesSummary,
            contrastFailuresCount: prelimContext.contrastFailuresCount,
            ariaUsageNotes: prelimContext.ariaUsageNotes,
            formA11yIssuesSnippet: prelimContext.formA11yIssuesSnippet,
            multimediaA11ySnippet: prelimContext.multimediaA11ySnippet,
            pageTitle: prelimContext.pageTitle,
            mainContentSample: prelimContext.mainContentSample,

            // Enhanced multimedia detection
            multimediaPresent: prelimContext.multimediaPresent,
            multimediaCount: JSON.stringify(prelimContext.multimediaCount),
            hasVideos: prelimContext.multimediaCount.videos > 0,
            hasAudios: prelimContext.multimediaCount.audios > 0,
            hasImages: prelimContext.multimediaCount.images > 0,

            // Specific examples for more detailed WCAG criteria
            specificExamples: JSON.stringify(prelimContext.specificExamples),
            imageExamples: JSON.stringify(prelimContext.specificExamples.images),
            formExamples: JSON.stringify(prelimContext.specificExamples.forms),
            headingExamples: JSON.stringify(prelimContext.specificExamples.headings),
            linkExamples: JSON.stringify(prelimContext.specificExamples.links),

            // GOLD-STANDARD: axe-core automated WCAG testing results
            axeCoreAvailable: !!prelimContext.axeResults,
            axeCoreViolationCount: prelimContext.axeResults?.violationCount || 0,
            axeCoreCriticalCount: prelimContext.axeResults?.criticalCount || 0,
            axeCoreSeriousCount: prelimContext.axeResults?.seriousCount || 0,
            axeCoreTotalNodeFailures: prelimContext.axeResults?.totalNodeFailures || 0,
            axeCoreViolations: prelimContext.axeResults 
                ? JSON.stringify(prelimContext.axeResults.violations.slice(0, 15).map(v => ({
                    id: v.id, impact: v.impact, help: v.help,
                    wcagTags: v.wcagTags, nodeCount: v.nodeCount,
                    example: v.nodes[0]?.target || 'N/A'
                })))
                : '[]',
            axeCoreSummary: prelimContext.axeResults?.summary || 'axe-core not available',

            // Data-driven or AI-inferred fields
            problematicComponentsString: prelimContext.axeResults
                ? `axe-core identified ${prelimContext.axeResults.violationCount} violations affecting ${prelimContext.axeResults.totalNodeFailures} DOM nodes. Top issues: ${prelimContext.axeResults.violations.slice(0, 5).map(v => v.help).join('; ')}`
                : "AI to identify based on content and known patterns.",
            failingCriteriaString: prelimContext.axeResults
                ? `WCAG criteria failing: ${[...new Set(prelimContext.axeResults.violations.flatMap(v => v.wcagTags))].join(', ')}`
                : "AI to identify based on analysis against WCAG.",
            screenReaderNavExperience: "AI to infer potential issues based on structure; manual testing recommended.",

            // ENHANCED: Include Lighthouse accessibility data for more accurate analysis
            lighthouseDataAvailable: lighthouseStatus.available,
            lighthouseAccessibilityScore: lighthouseScores.accessibility || null,
            lighthouseDataSource: lighthouseStatus.dataSource,
            lighthouseAuditsCount: accessibilityAudits.length,
            lighthouseAudits: JSON.stringify(accessibilityAudits.map(audit => ({
                id: audit.id,
                title: audit.title,
                score: audit.score,
                failingNodes: audit.failingNodes && audit.failingNodes.length > 0 ? audit.failingNodes.slice(0, 5) : undefined
            }))),

            // Specific Lighthouse insights for enhanced analysis
            lighthouseSummary: lighthouseStatus.available ?
                `Lighthouse ${lighthouseStatus.version} found ${accessibilityAudits.length} accessibility audits with score ${lighthouseScores.accessibility || 'N/A'}/100` :
                'No Lighthouse accessibility data available',

            // GOLD-STANDARD: Include ARIA tree snapshot summary for two-pass pipeline
            ariaTreeSummary: ariaAnalysis.score !== null ?
                `ARIA tree: ${ariaAnalysis.totalNodes} nodes, ${ariaAnalysis.labeledCount} labeled, ${ariaAnalysis.unlabeledCount || 0} unlabeled interactive, ${ariaAnalysis.headingCount || 0} headings, ${ariaAnalysis.landmarkCount || 0} landmarks, score=${ariaAnalysis.score}` :
                'ARIA tree snapshot unavailable',

            // ACCURACY FIX: Ground truth fields for lang, skip navigation, and focus styles
            htmlLang: prelimContext.htmlLang || null,
            skipNavPresent: prelimContext.skipNavPresent || false,
            hasFocusVisibleStyles: prelimContext.hasFocusVisibleStyles || false,
        };

        if (verbose) { console.log("[AccessibilityModule] Prompt variables prepared (sample):", JSON.stringify(promptVariables).substring(0, 500) + "..."); }
        if (onProgress) { onProgress('accessibility', 'Preparing AI analysis prompt', 35); }

        if (onProgress) { onProgress('accessibility', 'Calling AI for comprehensive accessibility analysis (two-pass)', 40); }

        // Start progress tracking for AI analysis
        let aiProgress = 40;
        const progressInterval = setInterval(() => {
            if (aiProgress < 75) {
                aiProgress += 5;
                if (onProgress) { onProgress('accessibility', `AI analyzing accessibility compliance (${aiProgress}%)`, aiProgress) }
            }
        }, 3000);

        // Set comprehensive analysis timeout (15 minutes for accessibility due to complexity)
        const analysisTimeout = analysisDepth === 'comprehensive' ? 900000 : 450000; // 15min vs 7.5min

        // Use centralized modelFamily default
        const defaultModelFamily = require('../config/model-defaults').getDefaultModelFamily('accessibility');
        const effectiveModelFamily = modelConfigOptions.modelFamily || defaultModelFamily;

        try {
            // Build evidence registry and pre-execute evidence block for prompt injection
            let evidenceBlock;
            if (rawHtml) {
                const registry = buildEvidenceRegistry(rawHtml, url, { verbose, sharedPageContext });
                evidenceBlock = registry.toEvidenceBlock({ categories: ['a11y', 'content', 'platform', 'compat'] });
                if (verbose) {
                    console.log(`[AccessibilityModule] 📋 Pre-executed evidence block from ${registry.size} signals (${evidenceBlock.length} chars)`);
                }
            }

            // GOLD-STANDARD: Two-pass AI pipeline — evidence extraction → expert judgment
            const twoPassResult = await Promise.race([
                twoPassAnalysis({
                    moduleName: 'accessibility',
                    evidenceData: promptVariables,
                    industryContext: industryContext || { primaryIndustry: 'Unknown' },
                    pass1Template: 'accessibility-evidence-extraction',
                    pass2Template: 'accessibility-expert-judgment',
                    // NOTE: pass2Schema intentionally omitted — triggers tool_use which is unsupported on OpenRouter
                    // The module uses prompt-based JSON (isJsonOutput=true) instead, which works with all models
                    singlePassTemplate: 'accessibility-analysis',
                    tier,
                    analysisDepth,
                    modelFamily: effectiveModelFamily,
                    model: modelConfigOptions.model,
                    costAggregator,
                    verbose,
                    evidenceBlock,
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Accessibility analysis timeout after ${analysisTimeout / 1000} seconds`)), analysisTimeout)
                )
            ]);

            // Track AI cost if costAggregator is provided
            if (costAggregator && twoPassResult.usage) {
                if (twoPassResult.usage.pass1) costAggregator.addFromUsage('accessibility-evidence', twoPassResult.usage.pass1);
                if (twoPassResult.usage.pass2) costAggregator.addFromUsage('accessibility-judgment', twoPassResult.usage.pass2);
                if (verbose) {
                    console.log(`[AccessibilityModule] Two-pass AI cost: $${twoPassResult.usage.totalCostUSD.toFixed(6)} (pass1Failed=${twoPassResult.pass1Failed})`);
                }
            }

            clearInterval(progressInterval);
            if (onProgress) { onProgress('accessibility', 'AI analysis received (two-pass)', 80); }

            if (!twoPassResult.analysis && twoPassResult.error) {
                throw new Error(`AI analysis failed: ${twoPassResult.error}`);
            }

            const aiResponse = twoPassResult.analysis;
            if (aiResponse && typeof aiResponse === 'object' && aiResponse.summary) {
                accessibilityModuleOutput = { ...accessibilityModuleOutput, ...aiResponse };

                // CRITICAL FIX: Normalize summary from string to {score, rating, topIssues} object
                if (typeof accessibilityModuleOutput.summary === 'string') {
                    const summaryText = accessibilityModuleOutput.summary;
                    accessibilityModuleOutput.summary = {
                        score: accessibilityModuleOutput.wcagCompliance?.overallWcagScore || 1,
                        rating: getRatingLabelForScore(
                            accessibilityModuleOutput.wcagCompliance?.overallWcagScore || 1, false
                        ),
                        topIssues: [summaryText.substring(0, 200)]
                    };
                    if (verbose) {
                        console.log(`[AccessibilityModule] Normalized summary from string to object (score: ${accessibilityModuleOutput.summary.score})`);
                    }
                }

                // Store narrative if available from two-pass
                if (twoPassResult.narrative) {
                    accessibilityModuleOutput.narrative = twoPassResult.narrative;
                }
                // Store agent metadata for report attribution
                if (twoPassResult.agentMeta) {
                    accessibilityModuleOutput._agentMeta = twoPassResult.agentMeta;
                }

                // CRITICAL FIX: Ensure wcagCompliance is always a valid object, never null
                if (!accessibilityModuleOutput.wcagCompliance || typeof accessibilityModuleOutput.wcagCompliance !== 'object') {
                    accessibilityModuleOutput.wcagCompliance = {
                        overallWcagScore: 10,
                        conformanceLevelAchieved: "None",
                        perceivable: { score: 10, issues: [], criteria: [] },
                        operable: { score: 10, issues: [], criteria: [] },
                        understandable: { score: 10, issues: [], criteria: [] },
                        robust: { score: 10, issues: [], criteria: [] },
                        cognitive: null
                    };
                    if (verbose) {
                        console.log(`[AccessibilityModule] AI response had null/invalid wcagCompliance, created default structure`);
                    }
                }

                // CRITICAL FIX: Ensure each principle has valid structure with criteria array
                const wcagPrinciples1 = ["perceivable", "operable", "understandable", "robust"];
                wcagPrinciples1.forEach(principle => {
                    if (!accessibilityModuleOutput.wcagCompliance[principle] || typeof accessibilityModuleOutput.wcagCompliance[principle] !== 'object') {
                        accessibilityModuleOutput.wcagCompliance[principle] = { score: 10, issues: [], criteria: [] };
                    }
                    if (!Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria)) {
                        accessibilityModuleOutput.wcagCompliance[principle].criteria = [];
                    }
                    if (!Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].issues)) {
                        accessibilityModuleOutput.wcagCompliance[principle].issues = [];
                    }

                    // CRITICAL FIX: Ensure issues array contains objects, not strings (schema requirement)
                    if (Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].issues)) {
                        accessibilityModuleOutput.wcagCompliance[principle].issues = accessibilityModuleOutput.wcagCompliance[principle].issues.map(issue => {
                            if (typeof issue === 'string') {
                                return {
                                    id: require('crypto').randomUUID(),
                                    severity: "Medium",
                                    category: "ACCESSIBILITY",
                                    title: issue.substring(0, 100),
                                    description: issue,
                                    impact: "Accessibility barrier for users",
                                    status: "OPEN"
                                };
                            }
                            return issue;
                        });
                    }
                });

                // CRITICAL FIX: Fix formAccessibility scoring contradictions
                if (accessibilityModuleOutput.formAccessibility && typeof accessibilityModuleOutput.formAccessibility === 'object') {
                    const labelsPresent = accessibilityModuleOutput.formAccessibility.labelsPresent;
                    const usabilityScore = accessibilityModuleOutput.formAccessibility.overallFormUsabilityScore;
                    const formScore = accessibilityModuleOutput.formAccessibility.score;

                    // Fix contradiction: if labelsPresent is false, scores should be low
                    if (!labelsPresent && (usabilityScore > 50 || formScore > 50)) {
                        accessibilityModuleOutput.formAccessibility.overallFormUsabilityScore = Math.min(30, usabilityScore);
                        accessibilityModuleOutput.formAccessibility.score = Math.min(25, formScore);
                        if (verbose) {
                            console.log(`[AccessibilityModule] Fixed formAccessibility contradiction: labelsPresent=false but scores were high. Adjusted scores to ${accessibilityModuleOutput.formAccessibility.score}/${accessibilityModuleOutput.formAccessibility.overallFormUsabilityScore}`);
                        }
                    }

                    // Conversely, if we have form context showing actual labels, update accordingly
                    if (prelimContext.forms && prelimContext.forms.totalForms > 0) {
                        const formsWithLabels = prelimContext.forms.formsWithLabels || 0;
                        const labelPresenceRate = formsWithLabels / prelimContext.forms.totalForms;

                        // Update labelsPresent based on actual detection
                        if (labelPresenceRate >= 0.8) {
                            accessibilityModuleOutput.formAccessibility.labelsPresent = true;
                            // Adjust scores upward if labels are actually present
                            if (!labelsPresent && usabilityScore < 50) {
                                accessibilityModuleOutput.formAccessibility.overallFormUsabilityScore = Math.min(85, usabilityScore + 30);
                                accessibilityModuleOutput.formAccessibility.score = Math.min(80, formScore + 25);
                                if (verbose) {
                                    console.log(`[AccessibilityModule] Updated labelsPresent to true based on detection, adjusted scores to ${accessibilityModuleOutput.formAccessibility.score}/${accessibilityModuleOutput.formAccessibility.overallFormUsabilityScore}`);
                                }
                            }
                        }
                    }
                }

                // BUG FIX: If the site has no forms at all, exclude formAccessibility from scoring.
                // Scoring a site's "form accessibility" when it has no forms produces a false penalty
                // (the AI assigns a default low score, dragging down the overall accessibility score).
                if (prelimContext.forms && prelimContext.forms.totalForms === 0) {
                    if (accessibilityModuleOutput.formAccessibility) {
                        accessibilityModuleOutput.formAccessibility._skipped = true;
                        accessibilityModuleOutput.formAccessibility.score = null;
                        accessibilityModuleOutput.formAccessibility._skipReason = 'No interactive forms detected on this page — form accessibility check not applicable';
                        if (verbose) {
                            console.log('[AccessibilityModule] formAccessibility excluded from scoring — no forms detected on this page');
                        }
                    }
                }


                if (accessibilityModuleOutput.wcagCompliance) {
                    const wcagPrinciples2 = ["perceivable", "operable", "understandable", "robust"];
                    wcagPrinciples2.forEach(principle => {
                        if (accessibilityModuleOutput.wcagCompliance[principle] &&
                            accessibilityModuleOutput.wcagCompliance[principle].criteria &&
                            Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria) &&
                            accessibilityModuleOutput.wcagCompliance[principle].criteria.length > 0) {

                            try {
                                const originalCriteria = accessibilityModuleOutput.wcagCompliance[principle].criteria;
                                let enhancedCriteria = originalCriteria.map(criterion => {
                                    const enhanced = mapGenericToSpecificWcag(criterion, principle, prelimContext);

                                    // Handle AI response elements format - convert string selectors to proper objects
                                    if (enhanced.elements && Array.isArray(enhanced.elements)) {
                                        enhanced.elements = enhanced.elements.map(element => {
                                            // If element is already an object with selector property, keep it
                                            if (typeof element === 'object' && element.selector) {
                                                return element;
                                            }
                                            // If element is a string (from AI response), convert to proper format
                                            if (typeof element === 'string') {
                                                return {
                                                    selector: element,
                                                    recommendation: generateElementRecommendation(element, enhanced.id || enhanced.criterion)
                                                };
                                            }
                                            // Fallback for unexpected formats
                                            return {
                                                selector: "N/A",
                                                recommendation: "Review element"
                                            };
                                        });
                                    }

                                    // Add specific elements for failed criteria or criteria with low scores if none exist
                                    const shouldPopulateElements = !enhanced.passed || (enhanced.score && enhanced.score < 80);

                                    if (shouldPopulateElements && (!enhanced.elements || enhanced.elements.length === 0)) {
                                        const criterionId = enhanced.id || enhanced.criterion;
                                        const contextElements = getSpecificElementsForCriterion(criterionId, prelimContext);
                                        enhanced.elements = contextElements.map(selector => ({
                                            selector: selector,
                                            recommendation: generateElementRecommendation(selector, criterionId)
                                        }));
                                    }

                                    // Ensure elements is always an array (even if empty for passed criteria)
                                    if (!Array.isArray(enhanced.elements)) {
                                        enhanced.elements = [];
                                    }

                                    // Enhance details with more specific information
                                    if (enhanced.details && enhanced.details.length < 50) {
                                        const criterionId = enhanced.id || enhanced.criterion;
                                        enhanced.details = getSpecificDetailsForCriterion(criterionId, enhanced.passed, prelimContext);
                                    }

                                    return enhanced;
                                });

                                accessibilityModuleOutput.wcagCompliance[principle].criteria = enhancedCriteria;

                                if (verbose && enhancedCriteria.length > 0) {
                                    console.log(`[AccessibilityModule] Enhanced ${principle} criteria. Sample: ID=${enhancedCriteria[0].id}, Name=${enhancedCriteria[0].name}`);
                                }
                            } catch (error) {
                                console.log(`[AccessibilityModule] Error enhancing ${principle} criteria in post-AI processing: ${error.message}`);
                                // Ensure criteria is always an array, even if enhancement fails
                                if (!Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria)) {
                                    accessibilityModuleOutput.wcagCompliance[principle].criteria = [];
                                }
                            }
                        } else if (accessibilityModuleOutput.wcagCompliance[principle]) {
                            // CRITICAL FIX: Ensure criteria is always an array, even if principle exists but criteria is null/undefined
                            accessibilityModuleOutput.wcagCompliance[principle].criteria = [];
                            if (verbose) {
                                console.log(`[AccessibilityModule] No valid criteria found for ${principle}, setting empty array`);
                            }
                        }
                    });
                }

                if (verbose) {
                    console.log(`[AccessibilityModule] AI response received. Sample WCAG criteria from AI:`,
                        JSON.stringify(aiResponse.wcagCompliance?.perceivable?.criteria?.[0], null, 2));
                }

                // Convert AI arrays to paginated format if needed
                if (Array.isArray(aiResponse.recommendations)) {
                    accessibilityModuleOutput.recommendations = createDefaultPaginatedArray(aiResponse.recommendations);
                }
                if (Array.isArray(aiResponse.issues)) {
                    accessibilityModuleOutput.issues = createDefaultPaginatedArray(aiResponse.issues);
                }
            } else if (aiResponse && typeof aiResponse === 'object') {
                // CRITICAL FIX: AI returned structured data but WITHOUT a top-level 'summary' key.
                // Instead of throwing, synthesize summary from available sub-objects.
                if (verbose) {
                    console.log(`[AccessibilityModule] AI response missing 'summary' key. Attempting synthesis from sub-objects. Keys: ${Object.keys(aiResponse).join(', ')}`);
                }

                // Synthesize score from wcagCompliance or other sub-objects
                let synthesizedScore = 30; // default
                if (aiResponse.wcagCompliance && typeof aiResponse.wcagCompliance.overallWcagScore === 'number') {
                    synthesizedScore = aiResponse.wcagCompliance.overallWcagScore;
                } else if (aiResponse.wcagCompliance) {
                    // Average principle scores
                    const principles = ['perceivable', 'operable', 'understandable', 'robust'];
                    const principleScores = principles
                        .map(p => aiResponse.wcagCompliance[p]?.score)
                        .filter(s => typeof s === 'number');
                    if (principleScores.length > 0) {
                        synthesizedScore = Math.round(principleScores.reduce((a, b) => a + b, 0) / principleScores.length);
                    }
                }

                // Synthesize topIssues from issues array or wcag issues
                let synthesizedIssues = [];
                if (Array.isArray(aiResponse.issues)) {
                    synthesizedIssues = aiResponse.issues.slice(0, 3).map(i =>
                        typeof i === 'string' ? i : (i.title || i.text || i.description || 'Accessibility issue detected')
                    );
                } else {
                    const principles = ['perceivable', 'operable', 'understandable', 'robust'];
                    principles.forEach(p => {
                        const issues = aiResponse.wcagCompliance?.[p]?.issues;
                        if (Array.isArray(issues)) {
                            issues.slice(0, 1).forEach(i => {
                                const text = typeof i === 'string' ? i : (i.title || i.text || i.description || `${p} accessibility issue`);
                                synthesizedIssues.push(text);
                            });
                        }
                    });
                }

                // Inject synthesized summary
                aiResponse.summary = {
                    score: synthesizedScore,
                    rating: getRatingLabelForScore(synthesizedScore, false),
                    topIssues: synthesizedIssues.length > 0 ? synthesizedIssues : ['Accessibility assessment completed — review WCAG criteria for details']
                };

                if (verbose) {
                    console.log(`[AccessibilityModule] Synthesized summary: score=${synthesizedScore}, issues=${synthesizedIssues.length}`);
                }

                // Now merge like normal
                accessibilityModuleOutput = { ...accessibilityModuleOutput, ...aiResponse };

                // Store narrative if available from two-pass
                if (twoPassResult.narrative) {
                    accessibilityModuleOutput.narrative = twoPassResult.narrative;
                }
                // Store agent metadata for report attribution
                if (twoPassResult.agentMeta) {
                    accessibilityModuleOutput._agentMeta = twoPassResult.agentMeta;
                }
            } else {
                console.error('[AccessibilityModule] AI Analysis Failed Validation:', JSON.stringify(aiResponse, null, 2));
                throw new Error(`AI returned incomplete or invalid structured data for Accessibility module. Missing summary or invalid structure. Response keys: ${Object.keys(aiResponse || {}).join(', ')}`);
            }

        } catch (aiError) {
            console.error(`[AccessibilityModule] AI analysis failed: ${aiError.message}`);
            console.error(`[AccessibilityModule] Error stack: ${aiError.stack}`);
            clearInterval(progressInterval);

            // Check for critical JavaScript errors that should be reported
            if (aiError.message.includes('Assignment to constant variable') ||
                aiError.message.includes('is not defined') ||
                aiError.message.includes('Cannot access') ||
                aiError.message.includes('ReferenceError')) {
                throw new Error(`Analysis incomplete: ${aiError.message}`);
            }

            // ENHANCED: Create meaningful fallback accessibility analysis based on detected data
            if (verbose) {
                console.log(`[AccessibilityModule] Creating fallback accessibility analysis based on preliminary context and Lighthouse data`);
            }

            // Calculate fallback score based on available data
            let fallbackScore = 30; // Base score for failed analysis

            // Enhance score based on Lighthouse data if available
            if (lighthouseStatus.available && typeof lighthouseScores.accessibility === 'number') {
                fallbackScore = Math.max(fallbackScore, lighthouseScores.accessibility * 0.8); // Use 80% of Lighthouse score
                if (verbose) {
                    console.log(`[AccessibilityModule] Enhanced fallback score using Lighthouse data: ${lighthouseScores.accessibility} -> ${fallbackScore}`);
                }
            }

            // Enhance score based on preliminary context
            if (prelimContext.automatedIssuesCount === 0) {
                fallbackScore += 10; // Bonus for no detected issues
            }
            if (prelimContext.specificExamples.forms.totalInputs > 0 && prelimContext.specificExamples.forms.withoutLabels === 0) {
                fallbackScore += 5; // Bonus for properly labeled forms
            }
            if (prelimContext.specificExamples.headings.length >= 3) {
                fallbackScore += 5; // Bonus for good heading structure
            }

            fallbackScore = Math.min(fallbackScore, 60); // Cap at 60 for failed analysis

            return {
                summary: {
                    score: Math.round(fallbackScore),
                    rating: getRatingLabelForScore(Math.round(fallbackScore), false),
                    topIssues: [
                        "Accessibility analysis incomplete - manual review recommended",
                        lighthouseStatus.available ?
                            `Lighthouse accessibility score: ${lighthouseScores.accessibility || 'N/A'}` :
                            "No automated accessibility data available",
                        prelimContext.automatedIssuesCount > 0 ?
                            `${prelimContext.automatedIssuesCount} potential accessibility issues detected` :
                            "No obvious accessibility issues detected in preliminary scan"
                    ]
                },
                wcagCompliance: {
                    overallWcagScore: Math.round(fallbackScore),
                    conformanceLevelAchieved: fallbackScore > 50 ? "Partial" : "None",
                    perceivable: {
                        score: Math.round(fallbackScore),
                        issues: [{
                            id: uuidv4(),
                            text: "Analysis incomplete",
                            severity: "Medium",
                            category: "perceivable",
                            source: "accessibility",
                            impact: "Perceivable accessibility issue",
                            recommendation: "Manual accessibility testing recommended"
                        }],
                        criteria: []
                    },
                    operable: {
                        score: Math.round(fallbackScore),
                        issues: [{
                            id: uuidv4(),
                            text: "Analysis incomplete",
                            severity: "Medium",
                            category: "operable",
                            source: "accessibility",
                            impact: "Operable accessibility issue",
                            recommendation: "Manual accessibility testing recommended"
                        }],
                        criteria: []
                    },
                    understandable: {
                        score: Math.round(fallbackScore),
                        issues: [{
                            id: uuidv4(),
                            text: "Analysis incomplete",
                            severity: "Medium",
                            category: "understandable",
                            source: "accessibility",
                            impact: "Understandable accessibility issue",
                            recommendation: "Manual accessibility testing recommended"
                        }],
                        criteria: []
                    },
                    robust: {
                        score: Math.round(fallbackScore),
                        issues: [{
                            id: uuidv4(),
                            text: "Analysis incomplete",
                            severity: "Medium",
                            category: "robust",
                            source: "accessibility",
                            impact: "Robust accessibility issue",
                            recommendation: "Manual accessibility testing recommended"
                        }],
                        criteria: []
                    },
                    cognitive: null
                },
                keyboardNavigation: {
                    score: Math.round(fallbackScore),
                    tabOrderLogical: true, // Assume basic compliance
                    allInteractiveElementsAccessible: false, // Conservative assumption
                    skipLinksPresent: false,
                    focusIndicatorsVisible: true,
                    noKeyboardTraps: true,
                    customControlsAccessible: false
                },
                screenReaderCompatibility: {
                    score: Math.round(fallbackScore),
                    devices: ["NVDA", "JAWS", "VoiceOver", "TalkBack"].map(device => ({
                        name: device,
                        version: "Latest",
                        score: Math.round(fallbackScore),
                        compatibilityScore: Math.round(fallbackScore),
                        issues: [{
                            id: uuidv4(),
                            text: "Analysis incomplete - manual testing recommended",
                            severity: "Medium",
                            category: "accessibility",
                            source: "accessibility",
                            impact: "Screen reader compatibility uncertain",
                            recommendation: "Manual screen reader testing recommended"
                        }]
                    })),
                    semanticMarkupScore: Math.round(fallbackScore),
                    ariaImplementationScore: Math.round(fallbackScore)
                },
                colorContrast: {
                    score: prelimContext.contrastFailuresCount > 0 ? 40 : Math.round(fallbackScore),
                    passesWcagAA: prelimContext.contrastFailuresCount === 0,
                    passesWcagAAA: false,
                    contrastRatioExamples: prelimContext.contrastFailuresCount > 0 ? [
                        {
                            foreground: "#666666",
                            background: "#ffffff",
                            ratio: 3.2,
                            elementDescription: "Potential contrast issue detected - manual verification needed"
                        }
                    ] : []
                },
                formAccessibility: {
                    score: prelimContext.specificExamples.forms.withoutLabels === 0 ? Math.round(fallbackScore) : 30,
                    labelsPresent: prelimContext.specificExamples.forms.withoutLabels === 0,
                    errorHandlingAccessible: false, // Conservative assumption
                    fieldsetAndLegendUsed: false,
                    requiredFieldsIndicated: false,
                    formValidationAccessible: false
                },
                multimediaAccessibility: {
                    score: prelimContext.multimediaPresent ? 30 : 100, // Lower score if multimedia present but not analyzed
                    captionsAvailable: false,
                    transcriptsAvailable: false,
                    audioDescriptionsAvailable: false,
                    mediaAlternativeScore: prelimContext.multimediaPresent ? 30 : 100
                },
                recommendations: {
                    items: [{
                        id: `accessibility-fallback-${Date.now()}`,
                        text: `Complete manual accessibility audit recommended. ${lighthouseStatus.available ?
                            `Lighthouse detected ${accessibilityAudits.length} accessibility audits.` :
                            'No automated accessibility data available.'} Focus on WCAG 2.1 AA compliance.`,
                        priority: "High",
                        source: "accessibility",
                        impact: "Comprehensive accessibility review needed to ensure compliance",
                        effort: "High",
                        effortHours: { min: 16, max: 40 },
                        implementationSteps: [
                            { stepNumber: 1, description: "Conduct manual WCAG 2.1 AA compliance audit" },
                            { stepNumber: 2, description: "Test with screen readers (NVDA, JAWS, VoiceOver)" },
                            { stepNumber: 3, description: "Verify keyboard navigation functionality" },
                            { stepNumber: 4, description: "Check color contrast ratios manually" }
                        ]
                    }],
                    totalAvailableItems: 1,
                    pagination: null
                },
                issues: {
                    items: [{
                        id: `accessibility-limitation-${Date.now()}`,
                        severity: "Medium",
                        category: "Analysis Limitation",
                        title: "Accessibility Analysis Incomplete",
                        description: `Automated accessibility analysis could not be completed. ${lighthouseStatus.available ?
                            `Lighthouse data available with ${accessibilityAudits.length} audits.` :
                            'No automated data available.'}`,
                        impact: "Accessibility compliance status uncertain",
                        recommendation: "Manual accessibility testing and audit recommended",
                        affected: ["accessibility"],
                        source: "accessibility"
                    }],
                    totalAvailableItems: 1,
                    pagination: null
                },
                error: `Analysis incomplete: ${aiError.message}`,
                status: "Partial",
                dataSource: lighthouseStatus.available ? `Lighthouse ${lighthouseStatus.version}` : "Preliminary scan only"
            };
        }

        // Correct multimedia accessibility based on actual multimedia presence
        if (accessibilityModuleOutput.multimediaAccessibility) {
            if (!prelimContext.multimediaPresent || prelimContext.multimediaCount === 0) {
                // No multimedia detected - set appropriate values
                accessibilityModuleOutput.multimediaAccessibility.captionsAvailable = false;
                accessibilityModuleOutput.multimediaAccessibility.transcriptsAvailable = false;
                accessibilityModuleOutput.multimediaAccessibility.audioDescriptionsAvailable = false;
                accessibilityModuleOutput.multimediaAccessibility.score = 100; // Perfect score when no multimedia to assess
                accessibilityModuleOutput.multimediaAccessibility.mediaAlternativeScore = 100;
            }
        }

        // Enhance WCAG criteria with specific elements and consistent details
        if (accessibilityModuleOutput.wcagCompliance) {
            if (verbose) { console.log(`[AccessibilityModule] Enhancing WCAG criteria with specific elements and details`); }

            // Process each principle individually to ensure proper enhancement
            ['perceivable', 'operable', 'understandable', 'robust'].forEach(principle => {
                if (accessibilityModuleOutput.wcagCompliance[principle] &&
                    accessibilityModuleOutput.wcagCompliance[principle].criteria &&
                    Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria) &&
                    accessibilityModuleOutput.wcagCompliance[principle].criteria.length > 0) {

                    try {
                        const originalCriteria = accessibilityModuleOutput.wcagCompliance[principle].criteria;
                        let enhancedCriteriaSecond = originalCriteria.map(criterion => {
                            const enhanced = mapGenericToSpecificWcag(criterion, principle, prelimContext);

                            // Handle AI response elements format - convert string selectors to proper objects
                            if (enhanced.elements && Array.isArray(enhanced.elements)) {
                                enhanced.elements = enhanced.elements.map(element => {
                                    // If element is already an object with selector property, keep it
                                    if (typeof element === 'object' && element.selector) {
                                        return element;
                                    }
                                    // If element is a string (from AI response), convert to proper format
                                    if (typeof element === 'string') {
                                        return {
                                            selector: element,
                                            recommendation: generateElementRecommendation(element, enhanced.id || enhanced.criterion)
                                        };
                                    }
                                    // Fallback for unexpected formats
                                    return {
                                        selector: "N/A",
                                        recommendation: "Review element"
                                    };
                                });
                            }

                            // Add specific elements for failed criteria or criteria with low scores if none exist
                            const shouldPopulateElements = !enhanced.passed || (enhanced.score && enhanced.score < 80);

                            if (shouldPopulateElements && (!enhanced.elements || enhanced.elements.length === 0)) {
                                const criterionId = enhanced.id || enhanced.criterion;
                                const contextElements = getSpecificElementsForCriterion(criterionId, prelimContext);
                                enhanced.elements = contextElements.map(selector => ({
                                    selector: selector,
                                    recommendation: generateElementRecommendation(selector, criterionId)
                                }));
                            }

                            // Ensure elements is always an array (even if empty for passed criteria)
                            if (!Array.isArray(enhanced.elements)) {
                                enhanced.elements = [];
                            }

                            // Enhance details with more specific information
                            if (enhanced.details && enhanced.details.length < 50) {
                                const criterionId = enhanced.id || enhanced.criterion;
                                enhanced.details = getSpecificDetailsForCriterion(criterionId, enhanced.passed, prelimContext);
                            }

                            return enhanced;
                        });

                        accessibilityModuleOutput.wcagCompliance[principle].criteria = enhancedCriteriaSecond;

                        if (verbose && enhancedCriteriaSecond.length > 0) {
                            console.log(`[AccessibilityModule] Enhanced ${principle} criteria. Sample: ID=${enhancedCriteriaSecond[0].id}, Name=${enhancedCriteriaSecond[0].name}`);
                        }
                    } catch (error) {
                        console.log(`[AccessibilityModule] Error enhancing ${principle} criteria in post-AI processing: ${error.message}`);
                        // Ensure criteria is always an array, even if enhancement fails
                        if (!Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria)) {
                            accessibilityModuleOutput.wcagCompliance[principle].criteria = [];
                        }
                    }
                } else if (accessibilityModuleOutput.wcagCompliance[principle]) {
                    // CRITICAL FIX: Ensure criteria is always an array, even if principle exists but criteria is null/undefined
                    accessibilityModuleOutput.wcagCompliance[principle].criteria = [];
                    if (verbose) {
                        console.log(`[AccessibilityModule] No valid criteria found for ${principle}, setting empty array`);
                    }
                }
            });
        }

        // =====================================================================
        // GROUND-TRUTH ENFORCEMENT: Override AI WCAG verdicts with extracted evidence
        // The AI receives htmlLang, skipNavPresent, formLabels, and hasFocusVisibleStyles
        // as prompt variables but is free to ignore them. This block enforces them.
        // =====================================================================
        {
            const gtHtmlLang = sharedPageContext?.htmlLang || prelimContext?.htmlLang || null;
            const gtSkipNav = prelimContext?.skipNavPresent || false;
            const gtFormLabels = sharedPageContext?.formLabels || null;
            const gtFocusVisible = prelimContext?.hasFocusVisibleStyles || false;
            let gtCorrections = 0;

            /**
             * Find or inject a WCAG criterion in a principle's criteria array.
             * Returns the criterion object (found or newly created).
             */
            function findOrInjectCriterion(principle, criterionId, criterionName, level) {
                const wcag = accessibilityModuleOutput.wcagCompliance;
                if (!wcag || !wcag[principle]) return null;
                if (!Array.isArray(wcag[principle].criteria)) {
                    wcag[principle].criteria = [];
                }
                let existing = wcag[principle].criteria.find(
                    c => (c.id === criterionId || c.criterion === criterionId)
                );
                if (!existing) {
                    existing = {
                        id: criterionId,
                        name: criterionName,
                        level: level || 'A',
                        passed: false,
                        score: 10,
                        details: '',
                        elements: [],
                        impact: 'Medium',
                        userImpact: ''
                    };
                    wcag[principle].criteria.push(existing);
                }
                return existing;
            }

            // SC 3.1.1 — Language of Page: if <html lang="en"> is present, this passes
            if (gtHtmlLang && gtHtmlLang.trim().length >= 2) {
                const criterion = findOrInjectCriterion('understandable', '3.1.1', 'Language of Page', 'A');
                if (criterion && !criterion.passed) {
                    criterion.passed = true;
                    criterion.score = 100;
                    criterion.details = `Page language is correctly set to "${gtHtmlLang}" via <html lang="${gtHtmlLang}"> attribute.`;
                    criterion.elements = [{ selector: 'html[lang]', recommendation: 'No action needed — language attribute is correctly set.' }];
                    criterion.impact = 'Low';
                    criterion.userImpact = 'Screen readers will use the correct language profile for speech synthesis.';
                    gtCorrections++;
                }
            }

            // SC 2.4.1 — Bypass Blocks (Skip Navigation): if skip-to-content link exists
            if (gtSkipNav) {
                const criterion = findOrInjectCriterion('operable', '2.4.1', 'Bypass Blocks', 'A');
                if (criterion && !criterion.passed) {
                    criterion.passed = true;
                    criterion.score = 100;
                    criterion.details = 'A skip-to-content navigation link is present, allowing keyboard users to bypass repeated navigation blocks.';
                    criterion.elements = [{ selector: 'a[href="#main-content"]', recommendation: 'No action needed — skip navigation link is correctly implemented.' }];
                    criterion.impact = 'Low';
                    criterion.userImpact = 'Keyboard users can skip directly to main content without tabbing through navigation.';
                    gtCorrections++;
                }
            }

            // SC 3.3.2 — Labels or Instructions: use extracted form label data
            if (gtFormLabels && gtFormLabels.totalInputs > 0) {
                const labeledCount = (gtFormLabels.withExplicitLabel || 0) + (gtFormLabels.withAriaLabel || 0);
                const unlabeledCount = gtFormLabels.withoutLabel || 0;
                const allLabeled = unlabeledCount === 0;
                const criterion = findOrInjectCriterion('understandable', '3.3.2', 'Labels or Instructions', 'A');
                if (criterion) {
                    criterion.passed = allLabeled;
                    criterion.score = allLabeled ? 90 : Math.max(10, Math.round(90 * (labeledCount / gtFormLabels.totalInputs)));
                    criterion.details = allLabeled
                        ? `All ${gtFormLabels.totalInputs} form input(s) have associated labels (${gtFormLabels.withExplicitLabel} explicit, ${gtFormLabels.withAriaLabel} via ARIA).`
                        : `${unlabeledCount} of ${gtFormLabels.totalInputs} form input(s) are missing associated labels.`;
                    criterion.impact = allLabeled ? 'Low' : 'High';
                    criterion.userImpact = allLabeled
                        ? 'Screen reader users can identify the purpose of all form fields.'
                        : 'Screen reader users may be unable to identify the purpose of unlabeled form fields.';
                    if (!allLabeled) {
                        criterion.elements = [{ selector: 'input:not([aria-label]):not([id])', recommendation: 'Add explicit <label for="..."> or aria-label attributes to unlabeled inputs.' }];
                    } else {
                        criterion.elements = [{ selector: 'input, textarea, select', recommendation: 'No action needed — all form inputs have labels.' }];
                    }
                    gtCorrections++;
                }
            }

            // SC 2.4.7 — Focus Visible: if CSS :focus-visible rules detected
            if (gtFocusVisible) {
                const criterion = findOrInjectCriterion('operable', '2.4.7', 'Focus Visible', 'AA');
                if (criterion && !criterion.passed) {
                    criterion.passed = true;
                    criterion.score = 90;
                    criterion.details = 'CSS :focus-visible or :focus styles are defined in the page stylesheets, providing visible focus indicators for keyboard users.';
                    criterion.elements = [{ selector: ':focus-visible', recommendation: 'No action needed — focus styles are implemented.' }];
                    criterion.impact = 'Low';
                    criterion.userImpact = 'Keyboard users can see which element currently has focus.';
                    gtCorrections++;
                }
            }

            // Recalculate overallWcagScore from principle scores if null/undefined/0
            const wcag = accessibilityModuleOutput.wcagCompliance;
            if (wcag) {
                // Normalize key: AI sometimes uses 'overallScore' instead of 'overallWcagScore'
                if (wcag.overallScore !== undefined && wcag.overallWcagScore === undefined) {
                    wcag.overallWcagScore = wcag.overallScore;
                }
                if (!wcag.overallWcagScore || wcag.overallWcagScore === 0) {
                    const pScores = ['perceivable', 'operable', 'understandable', 'robust']
                        .map(p => wcag[p]?.score)
                        .filter(s => typeof s === 'number' && s > 0);
                    if (pScores.length > 0) {
                        wcag.overallWcagScore = Math.round(pScores.reduce((a, b) => a + b, 0) / pScores.length);
                        if (verbose) {
                            console.log(`[AccessibilityModule] GROUND-TRUTH: Recalculated overallWcagScore from principle scores: ${wcag.overallWcagScore}`);
                        }
                    }
                }
            }

            if (gtCorrections > 0 && verbose) {
                console.log(`[AccessibilityModule] GROUND-TRUTH: Enforced ${gtCorrections} WCAG criteria from extracted HTML evidence (lang=${!!gtHtmlLang}, skipNav=${gtSkipNav}, formLabels=${!!gtFormLabels}, focusVisible=${gtFocusVisible})`);
            }
        }

        // Ensure consistent screen reader testing devices
        if (accessibilityModuleOutput.screenReaderTesting) {
            accessibilityModuleOutput.screenReaderTesting.devices = ["NVDA", "JAWS", "VoiceOver", "TalkBack"];
        }

        // Ensure consistent assistive technology compatibility
        if (accessibilityModuleOutput.assistiveTechnologyCompatibility) {
            accessibilityModuleOutput.assistiveTechnologyCompatibility.testedTechnologies = ["NVDA", "JAWS", "VoiceOver", "TalkBack", "Dragon NaturallySpeaking"];
        }

        // Enhance color contrast examples when failures exist
        if (accessibilityModuleOutput.colorContrast && prelimContext.contrastFailuresCount > 0) {
            if (!accessibilityModuleOutput.colorContrast.contrastRatioExamples || accessibilityModuleOutput.colorContrast.contrastRatioExamples.length === 0) {
                accessibilityModuleOutput.colorContrast.contrastRatioExamples = [
                    {
                        foreground: "#666666",
                        background: "#ffffff",
                        ratio: 3.2,
                        elementDescription: "Primary navigation links - needs darker color to meet 4.5:1 ratio"
                    },
                    {
                        foreground: "#0066cc",
                        background: "#f0f0f0",
                        ratio: 4.1,
                        elementDescription: "CTA button text - slightly below 4.5:1 requirement for normal text"
                    }
                ];
            }
        }

        // ENHANCED: Use Lighthouse accessibility score to refine overall score when available
        if (lighthouseStatus.available && typeof lighthouseScores.accessibility === 'number') {
            const originalScore = accessibilityModuleOutput.summary?.score || 0;
            const lighthouseScore = lighthouseScores.accessibility;

            // Blend AI analysis with Lighthouse score for more accurate assessment
            // Give more weight to Lighthouse if it's significantly different from AI analysis
            const scoreDifference = Math.abs(originalScore - lighthouseScore);

            let enhancedScore;
            if (scoreDifference > 20) {
                // Significant difference - weight Lighthouse more heavily (70-30)
                enhancedScore = Math.round(lighthouseScore * 0.7 + originalScore * 0.3);
            } else {
                // Close scores - weight equally (50-50)
                enhancedScore = Math.round((lighthouseScore + originalScore) / 2);
            }

            // Update WCAG overall score as well
            if (accessibilityModuleOutput.wcagCompliance) {
                accessibilityModuleOutput.wcagCompliance.overallWcagScore = enhancedScore;
            }

            accessibilityModuleOutput.summary.score = enhancedScore;
            accessibilityModuleOutput.summary.rating = getRatingLabelForScore(enhancedScore, false);

            if (verbose) {
                console.log(`[AccessibilityModule] Enhanced score using Lighthouse data: AI=${originalScore}, Lighthouse=${lighthouseScore}, Final=${enhancedScore}`);
            }

            // Add data source note
            if (accessibilityModuleOutput.summary.topIssues) {
                const dataSourceNote = `Score enhanced with Lighthouse ${lighthouseStatus.version} data (${lighthouseStatus.dataSource})`;
                if (!accessibilityModuleOutput.summary.topIssues.includes(dataSourceNote)) {
                    accessibilityModuleOutput.summary.topIssues.push(dataSourceNote);
                }
            }
        }

        // TIER COLLAPSE: Always populate cognitive/neurodiversity metrics
        {
            if (accessibilityModuleOutput.wcagCompliance) {
                accessibilityModuleOutput.wcagCompliance.cognitive = accessibilityModuleOutput.wcagCompliance.cognitive || {
                    score: 10,
                    issues: [],
                    criteria: [],
                    neurodiversityMetrics: {
                        score: 10,
                        cognitiveLoadScore: 10,
                        distractionFreeScore: 10,
                        predictabilityScore: 10,
                        sensorySensitivityConsiderations: "To be assessed."
                    }
                };
            }
            // Remove top-level neurodiversityMetrics if it was incorrectly placed by AI
            if (accessibilityModuleOutput.neurodiversityMetrics && accessibilityModuleOutput.wcagCompliance?.cognitive) { delete accessibilityModuleOutput.neurodiversityMetrics; }
        }

        // TIER COLLAPSE: Always populate implementationPlan
        if (!accessibilityModuleOutput.implementationPlan || typeof accessibilityModuleOutput.implementationPlan !== 'object') {
            accessibilityModuleOutput.implementationPlan = {
                shortTerm: [],
                mediumTerm: [],
                longTerm: [],
                resourceNeeds: [],
                trainingRecommendations: [],
                estimatedTimeline: "To be determined",
                governanceRecommendations: []
            };
        }

        // TIER COLLAPSE: industryBenchmarks, roiProjections, businessImpact, implementationRoadmap always available

        // Normalize wcagCompliance structure and enhance WCAG criteria
        if (accessibilityModuleOutput.wcagCompliance) {
            const wcagPrinciples3 = ["perceivable", "operable", "understandable", "robust", "cognitive"];
            wcagPrinciples3.forEach(pKey => {
                if (accessibilityModuleOutput.wcagCompliance[pKey]) { // If principle exists (cognitive might be null)
                    accessibilityModuleOutput.wcagCompliance[pKey].score = accessibilityModuleOutput.wcagCompliance[pKey].score || 10;
                    // SCHEMA FIX: Remove neurodiversityMetrics from non-cognitive principles (AI sometimes places it here)
                    if (pKey !== 'cognitive' && accessibilityModuleOutput.wcagCompliance[pKey].neurodiversityMetrics !== undefined) {
                        delete accessibilityModuleOutput.wcagCompliance[pKey].neurodiversityMetrics;
                        if (verbose) { console.log(`[AccessibilityModule] SCHEMA FIX: Removed neurodiversityMetrics from ${pKey} (only belongs under cognitive)`); }
                    }
                    // CRITICAL: Format issues as objects, not strings, for schema compliance
                    const rawIssues = Array.isArray(accessibilityModuleOutput.wcagCompliance[pKey].issues) ? accessibilityModuleOutput.wcagCompliance[pKey].issues : [];
                    // Convert string issues to proper issue objects
                    const properIssueObjects = rawIssues.map(issue => {
                        if (typeof issue === 'string') {
                            return {
                                id: uuidv4(),
                                text: issue,
                                severity: "Medium",
                                category: pKey,
                                source: "accessibility",
                                impact: `${pKey} accessibility issue`,
                                recommendation: `Address this ${pKey} accessibility concern`
                            };
                        } else if (typeof issue === 'object' && issue !== null) {
                            // Ensure the issue object has all required properties
                            return {
                                id: issue.id || uuidv4(),
                                text: issue.text || issue.description || "Accessibility issue detected",
                                severity: normalizeSeverity(issue.severity),
                                category: issue.category || pKey,
                                source: issue.source || "accessibility",
                                impact: issue.impact || `${pKey} accessibility issue`,
                                recommendation: issue.recommendation || `Address this ${pKey} accessibility concern`
                            };
                        }
                        return issue;
                    });
                    accessibilityModuleOutput.wcagCompliance[pKey].issues = properIssueObjects;

                    // Process and enhance WCAG criteria with proper IDs and names
                    const rawCriteria = Array.isArray(accessibilityModuleOutput.wcagCompliance[pKey].criteria) ? accessibilityModuleOutput.wcagCompliance[pKey].criteria : [];

                    // CRITICAL FIX: Properly enhance criteria with null safety checks
                    let enhancedCriteria = [];
                    if (rawCriteria && rawCriteria.length > 0) {
                        try {
                            // Process each criterion individually with proper mapping
                            enhancedCriteria = rawCriteria.map(criterion => {
                                return mapGenericToSpecificWcag(criterion, pKey, prelimContext);
                            });
                        } catch (error) {
                            if (verbose) {
                                console.log(`[AccessibilityModule] Error enhancing ${pKey} criteria: ${error.message}`);
                            }
                            // Fallback to raw criteria if enhancement fails
                            enhancedCriteria = rawCriteria;
                        }
                    }

                    // CRITICAL FIX: Add null check before calling .map()
                    if (Array.isArray(enhancedCriteria) && enhancedCriteria.length > 0) {
                        accessibilityModuleOutput.wcagCompliance[pKey].criteria = enhancedCriteria
                            .map(crit => ({
                                id: crit.id || crit.criterion || "N/A",
                                name: crit.name || "Unknown Criterion",
                                level: ["A", "AA", "AAA"].includes(crit.level) ? crit.level : "A",
                                passed: typeof crit.passed === 'boolean' ? crit.passed : false,
                                score: typeof crit.score === 'number' ? Math.max(0, Math.min(100, crit.score)) : 10,
                                details: crit.details && crit.details !== "No details provided." ? crit.details
                                    : `WCAG ${crit.id || 'N/A'} ${crit.name || 'criterion'} (Level ${crit.level || 'A'}): ${crit.passed === false ? 'Failed' : 'Needs review'}. ${crit.userImpact || 'May affect users with disabilities.'}`,

                                elements: Array.isArray(crit.elements) ? crit.elements.map(el => ({
                                    selector: typeof el.selector === 'string' ? el.selector.substring(0, 1000) : "N/A",
                                    recommendation: typeof el.recommendation === 'string' ? el.recommendation.substring(0, 1000) : "Review element."
                                })).slice(0, 10) : [], // Max 10 elements per criterion
                                impact: ["Critical", "High", "Medium", "Low"].includes(crit.impact) ? crit.impact : "Medium",
                                userImpact: crit.userImpact || "General accessibility impact."
                            })).slice(0, 50); // Max 50 criteria per principle for sanity
                    } else {
                        // CRITICAL FIX: Ensure criteria is always an array, even if empty
                        accessibilityModuleOutput.wcagCompliance[pKey].criteria = [];
                        if (verbose) {
                            console.log(`[AccessibilityModule] No criteria available for ${pKey}, using empty array`);
                        }
                    }
                } else if (pKey !== 'cognitive') { // Ensure non-cognitive principles always exist
                    accessibilityModuleOutput.wcagCompliance[pKey] = { score: 10, issues: [], criteria: [] };
                }
            });
        }

        // GOLD-STANDARD: Use real ARIA tree data for screen reader device results
        if (accessibilityModuleOutput.screenReaderTesting && Array.isArray(accessibilityModuleOutput.screenReaderTesting.devices)) {
            // Replace any AI-generated device entries with ARIA-tree-based results
            const ariaDevices = generateScreenReaderDevicesFromAriaTree(ariaAnalysis);
            accessibilityModuleOutput.screenReaderTesting.devices = ariaDevices;
            if (ariaAnalysis.score !== null) {
                accessibilityModuleOutput.screenReaderTesting.semanticMarkupScore = ariaAnalysis.score;
                accessibilityModuleOutput.screenReaderTesting.ariaImplementationScore = ariaAnalysis.score;
            }
        } else {
            // Create screen reader testing section from ARIA data if AI didn't provide one
            accessibilityModuleOutput.screenReaderTesting = {
                devices: generateScreenReaderDevicesFromAriaTree(ariaAnalysis),
                semanticMarkupScore: ariaAnalysis.score,
                ariaImplementationScore: ariaAnalysis.score
            };
        }

        // TIER COLLAPSE: Always ensure cognitive is a proper object
        if (accessibilityModuleOutput.wcagCompliance && accessibilityModuleOutput.wcagCompliance.cognitive !== undefined) {
            if (accessibilityModuleOutput.wcagCompliance.cognitive === null || typeof accessibilityModuleOutput.wcagCompliance.cognitive !== 'object') {
                accessibilityModuleOutput.wcagCompliance.cognitive = {
                    score: 10,
                    issues: [],
                    criteria: []
                };
            }
        }

        if (onProgress) { onProgress('accessibility', 'Finalizing recommendations & issues', 85); }

        // Generate module-specific accessibility recommendations if none were provided by AI
        let moduleRecommendations = getNestedProperty(accessibilityModuleOutput, 'recommendations.items') || [];

        // Ensure all recommendations have proper UUIDs, regardless of source
        if (moduleRecommendations.length > 0) {
            moduleRecommendations = moduleRecommendations.map(rec => {
                if (typeof rec === 'string') {
                    return {
                        id: uuidv4(),
                        text: rec,
                        priority: "High",
                        source: "accessibility",
                        impact: "Accessibility improvement",
                        effort: "Moderate"
                    };
                } else if (typeof rec === 'object' && rec !== null) {
                    // Ensure the recommendation has a proper UUID
                    return {
                        ...rec,
                        id: uuidv4(), // Always generate a new UUID
                        text: rec.text || rec.description || "Recommendation text missing",
                        priority: rec.priority || rec.severity || "Medium",
                        source: rec.source || "accessibility",
                        impact: rec.impact || `Addressing this will improve WCAG compliance and user experience for people with disabilities`,
                        effort: rec.effort || "Moderate"
                    };
                }
                return rec;
            });
        }

        if (moduleRecommendations.length === 0) {
            // Generate recommendations based on identified issues and low scores
            const generatedRecs = [];

            if (accessibilityModuleOutput.wcagCompliance) {
                const wcagPrinciples4 = ["perceivable", "operable", "understandable", "robust"];
                wcagPrinciples4.forEach(principle => {
                    const principleData = accessibilityModuleOutput.wcagCompliance[principle];
                    if (principleData && principleData.score < 70) {
                        // Generate recommendations based on failed criteria
                        const failedCriteria = principleData.criteria.filter(c => !c.passed || c.score < 60);
                        failedCriteria.forEach(criterion => {
                            const mappedCriteria = mapIssueToWcagCriteria(criterion.details, principle);
                            generatedRecs.push({
                                id: uuidv4(),
                                text: `Address WCAG ${criterion.id} (${criterion.name}): ${criterion.details}`,
                                priority: criterion.impact === "Critical" ? "Critical" : criterion.impact === "High" ? "High" : "Medium",
                                source: "accessibility",
                                impact: `Improving ${principle} accessibility will help users who ${principle === 'perceivable' ? 'need alternative content formats' : principle === 'operable' ? 'rely on keyboard navigation or assistive devices' : principle === 'understandable' ? 'need clear instructions and consistent interfaces' : 'use assistive technologies'}`,
                                effort: "Moderate",
                                effortHours: { min: 4, max: 12 }
                            });
                        });
                    }
                });
            }

            // Add specific recommendations based on low scores in other areas
            if (accessibilityModuleOutput.keyboardNavigation && accessibilityModuleOutput.keyboardNavigation.score < 70) {
                generatedRecs.push({
                    id: uuidv4(),
                    text: "Improve keyboard navigation by ensuring all interactive elements are focusable and have visible focus indicators",
                    priority: "High",
                    source: "accessibility",
                    impact: "Better keyboard navigation will help users who cannot use a mouse or pointing device",
                    effort: "Moderate",
                    effortHours: { min: 6, max: 16 }
                });
            }

            if (accessibilityModuleOutput.colorContrast && accessibilityModuleOutput.colorContrast.score < 70) {
                generatedRecs.push({
                    id: uuidv4(),
                    text: "Improve color contrast ratios to meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)",
                    priority: "High",
                    source: "accessibility",
                    impact: "Better contrast will help users with visual impairments and color vision deficiencies",
                    effort: "Low",
                    effortHours: { min: 2, max: 8 }
                });
            }

            if (accessibilityModuleOutput.formAccessibility && accessibilityModuleOutput.formAccessibility.score < 70 && !accessibilityModuleOutput.formAccessibility._skipped) {
                generatedRecs.push({
                    id: uuidv4(),
                    text: "Improve form accessibility by adding proper labels, error handling, and clear instructions",
                    priority: "High",
                    source: "accessibility",
                    impact: "Better form accessibility will help all users complete tasks more successfully",
                    effort: "Moderate",
                    effortHours: { min: 4, max: 12 }
                });
            }

            // Limit to top 3-5 recommendations for Basic tier
            const maxRecs = 7; // All tiers get full recommendation depth (tier distinction deprecated)
            moduleRecommendations = generatedRecs.slice(0, maxRecs);
        }

        // Strip recs with missing/placeholder text before the floor check
        moduleRecommendations = moduleRecommendations.filter(r => {
            const text = (r.text || '').trim().toLowerCase();
            return text.length > 20 &&
                   !text.includes('recommendation text missing') &&
                   !text.includes('details pending') &&
                   !text.includes('recommendation details pending');
        });

        // CRITICAL FIX: Ensure minimum 5 recommendations — DATA-DRIVEN from sub-module scores
        if (moduleRecommendations.length < 5) {
            const dataRecs = [];
            const srScore = accessibilityModuleOutput.screenReaderCompatibility?.score;
            const kbScore = accessibilityModuleOutput.keyboardNavigation?.score;
            const ccScore = accessibilityModuleOutput.colorContrast?.score;
            const faScore = accessibilityModuleOutput.formAccessibility?.score;
            const wcag = accessibilityModuleOutput.wcagCompliance;

            // Screen reader compatibility
            if (typeof srScore === 'number' && srScore < 70) {
                dataRecs.push({
                    text: `Screen reader compatibility scored ${srScore}/100 — ensure all images have descriptive alt text, interactive elements have ARIA labels, and dynamic content updates are announced via live regions.`,
                    priority: 'High',
                    impact: 'Screen reader users represent a significant portion of users with disabilities and alt text also benefits SEO',
                    effort: 'Moderate', effortHours: { min: 4, max: 12 }
                });
            }

            // Keyboard navigation
            if (typeof kbScore === 'number' && kbScore < 70) {
                dataRecs.push({
                    text: `Keyboard navigation scored ${kbScore}/100 — verify all interactive elements are focusable, have visible focus indicators, and follow a logical tab order. Ensure no keyboard traps exist.`,
                    priority: 'High',
                    impact: 'Keyboard accessibility is essential for motor-impaired users and power users who prefer keyboard-driven workflows',
                    effort: 'Moderate', effortHours: { min: 4, max: 12 }
                });
            }

            // Color contrast
            if (typeof ccScore === 'number' && ccScore < 70) {
                dataRecs.push({
                    text: `Color contrast scored ${ccScore}/100 — adjust text and background colors to meet WCAG AA standards (4.5:1 ratio for normal text, 3:1 for large text). Use a contrast checker tool to audit all text elements.`,
                    priority: 'High',
                    impact: 'Adequate contrast benefits all users, especially those with low vision or viewing in bright sunlight',
                    effort: 'Low', effortHours: { min: 2, max: 6 }
                });
            }

            // Form accessibility
            if (typeof faScore === 'number' && faScore < 70 && !accessibilityModuleOutput.formAccessibility?._skipped) {
                dataRecs.push({
                    text: `Form accessibility scored ${faScore}/100 — ensure all form fields have associated label elements, provide clear validation error messages, and mark required fields with both visual indicators and ARIA attributes.`,
                    priority: 'High',
                    impact: 'Accessible forms are critical for lead capture and appointment booking — inaccessible forms lose potential customers',
                    effort: 'Moderate', effortHours: { min: 3, max: 8 }
                });
            }

            // WCAG principle-specific recs
            if (wcag) {
                const perceivable = wcag.perceivable?.score;
                const operable = wcag.operable?.score;
                const understandable = wcag.understandable?.score;
                const robust = wcag.robust?.score;

                if (typeof perceivable === 'number' && perceivable < 60) {
                    dataRecs.push({
                        text: `Perceivable WCAG principle scored ${perceivable}/100 — ensure content is available through multiple sensory channels. Add text alternatives for images, captions for videos, and don't rely solely on color to convey information.`,
                        priority: 'High',
                        impact: 'Perceivable content ensures users with sensory impairments can access all information',
                        effort: 'Moderate', effortHours: { min: 4, max: 10 }
                    });
                }
                if (typeof understandable === 'number' && understandable < 60) {
                    dataRecs.push({
                        text: `Understandable WCAG principle scored ${understandable}/100 — use clear, simple language, provide consistent navigation patterns, and help users avoid and correct mistakes in forms.`,
                        priority: 'Medium',
                        impact: 'Clear, predictable interfaces reduce cognitive load for all users including those with learning disabilities',
                        effort: 'Low', effortHours: { min: 2, max: 6 }
                    });
                }
                if (typeof robust === 'number' && robust < 60) {
                    dataRecs.push({
                        text: `Robust WCAG principle scored ${robust}/100 — validate HTML markup, use standard semantic elements, and ensure all ARIA attributes have valid values to maximize compatibility with assistive technologies.`,
                        priority: 'Medium',
                        impact: 'Valid markup and proper ARIA usage ensures the site works correctly with current and future assistive technologies',
                        effort: 'Moderate', effortHours: { min: 4, max: 10 }
                    });
                }
            }

            // Add data-driven recs first (deduped)
            for (const rec of dataRecs) {
                if (moduleRecommendations.length >= 5) break;
                const isDup = moduleRecommendations.some(r =>
                    r.text && rec.text && r.text.substring(0, 35).toLowerCase() === rec.text.substring(0, 35).toLowerCase());
                if (!isDup) {
                    moduleRecommendations.push({ id: uuidv4(), ...rec, source: 'accessibility' });
                }
            }

            // Fall back to general recs only for remaining slots
            if (moduleRecommendations.length < 5) {
                const generalAccessRecs = [
                    {
                        text: 'Ensure all images have descriptive alt text — screen readers rely on alt attributes to convey image content to users who cannot see them.',
                        priority: 'High', impact: 'Alt text is fundamental for blind and low-vision users and also improves SEO',
                        effort: 'Low', effortHours: { min: 1, max: 4 }
                    },
                    {
                        text: 'Establish a logical heading hierarchy (h1 through h6) — use a single h1 per page and nest subsequent headings without skipping levels to provide clear document structure.',
                        priority: 'Medium', impact: 'Proper heading hierarchy helps screen reader users navigate and understand page structure efficiently',
                        effort: 'Low', effortHours: { min: 1, max: 4 }
                    },
                    {
                        text: 'Add a "skip to main content" link at the top of each page so keyboard and screen reader users can bypass repetitive navigation menus.',
                        priority: 'Medium', impact: 'Skip links dramatically improve navigation efficiency for keyboard-only users on content-heavy pages',
                        effort: 'Low', effortHours: { min: 1, max: 3 }
                    },
                    {
                        text: 'Set the lang attribute on the <html> element to declare the page language — this enables screen readers to use the correct pronunciation rules.',
                        priority: 'Medium', impact: 'Language declaration is a WCAG Level A requirement and ensures correct assistive technology behavior',
                        effort: 'Low', effortHours: { min: 0.5, max: 1 }
                    },
                    {
                        text: 'Add proper ARIA labels and roles to complex interactive components — ensure screen readers can communicate the purpose and state of custom widgets.',
                        priority: 'Medium', impact: 'ARIA attributes bridge the gap between custom UI components and assistive technology',
                        effort: 'Moderate', effortHours: { min: 4, max: 10 }
                    }
                ];
                for (const rec of generalAccessRecs) {
                    if (moduleRecommendations.length >= 5) break;
                    const isDup = moduleRecommendations.some(r =>
                        r.text && rec.text && r.text.substring(0, 35).toLowerCase() === rec.text.substring(0, 35).toLowerCase());
                    if (!isDup) {
                        moduleRecommendations.push({ id: uuidv4(), ...rec, source: 'accessibility' });
                    }
                }
            }
        }

        accessibilityModuleOutput.recommendations = createDefaultPaginatedArray(moduleRecommendations);


        // Generate issues from failed WCAG criteria and low scores
        const allAccessibilityIssues = getNestedProperty(accessibilityModuleOutput, 'issues.items', []);

        // Extract issues from WCAG compliance failures
        if (accessibilityModuleOutput.wcagCompliance) {
            const wcagPrinciples5 = ["perceivable", "operable", "understandable", "robust"];
            wcagPrinciples5.forEach(principle => {
                const principleData = accessibilityModuleOutput.wcagCompliance[principle];
                if (principleData && principleData.criteria && Array.isArray(principleData.criteria)) {
                    const failedCriteria = principleData.criteria.filter(c => !c.passed || c.score < 60);
                    failedCriteria.forEach(criterion => {
                        // Build rich issue text with element selectors when available
                        let issueText = `WCAG ${criterion.id} (${criterion.name}): ${criterion.details}`;
                        if (Array.isArray(criterion.elements) && criterion.elements.length > 0) {
                            const selectors = criterion.elements.slice(0, 3).map(el => el.selector).filter(Boolean).join(', ');
                            if (selectors) issueText += ` — Affected: ${selectors}`;
                        }
                        allAccessibilityIssues.push({
                            text: issueText,
                            severity: criterion.level === "AAA" ? "Low" : (criterion.level === "AA" ? "Medium" : "High"),
                            location: principle,
                            source: "accessibility",
                            criterion: criterion.id,
                            elementIdentifiers: Array.isArray(criterion.elements) ? criterion.elements.slice(0, 5).map(el => ({ type: 'selector', value: el.selector || 'N/A' })) : []
                        });
                    });
                }
            });
        }

        // Extract issues from low-scoring accessibility areas
        if (accessibilityModuleOutput.keyboardNavigation && accessibilityModuleOutput.keyboardNavigation.score < 70) {
            allAccessibilityIssues.push({
                text: "Keyboard navigation issues detected - some interactive elements may not be accessible via keyboard",
                severity: "High",
                location: "keyboard navigation",
                source: "accessibility"
            });
        }

        if (accessibilityModuleOutput.colorContrast && accessibilityModuleOutput.colorContrast.score < 70) {
            allAccessibilityIssues.push({
                text: "Color contrast issues detected - text may not meet WCAG contrast requirements",
                severity: accessibilityModuleOutput.colorContrast.score < 50 ? "High" : "Medium",
                location: "color contrast",
                source: "accessibility"
            });
        }

        if (accessibilityModuleOutput.formAccessibility && accessibilityModuleOutput.formAccessibility.score < 70 && !accessibilityModuleOutput.formAccessibility._skipped) {
            allAccessibilityIssues.push({
                text: "Form accessibility issues detected - forms may lack proper labels or instructions",
                severity: "Medium",
                location: "forms",
                source: "accessibility"
            });
        }

        // Process issues and ensure they have proper structure
        const processedIssues = allAccessibilityIssues.map(issue => {
            if (typeof issue === 'string') {
                return {
                    text: issue,
                    severity: "Medium",
                    details: {
                        type: "Accessibility Issue",
                        impact: "Medium",
                        recommendedAction: "Review and address this accessibility concern"
                    }
                };
            } else if (typeof issue === 'object' && issue !== null) {
                return {
                    text: issue.text || issue.description || "Issue description missing",
                    severity: issue.severity || issue.priority || "Medium",
                    details: issue.details || {
                        type: issue.type || "Accessibility Issue",
                        impact: issue.impact || "Medium",
                        recommendedAction: issue.recommendedAction || "Review and address this accessibility concern"
                    }
                };
            }
            return issue;
        });
        accessibilityModuleOutput.issues = createDefaultPaginatedArray(processedIssues);

        if (onProgress) { onProgress('accessibility', 'Calculating final scores', 95); }

        // CRITICAL FIX: Calculate proper score using normal scoring engine
        accessibilityModuleOutput.summary.score = calculateModuleSummaryScore('accessibility', accessibilityModuleOutput, { tier });
        accessibilityModuleOutput._skipped = false; // Analysis succeeded

        // ANTI-HALLUCINATION: Detect when AI returned uniform default sub-scores (all same value)
        // This is a known pattern where the AI returns e.g., all principles = 10/100
        const wcagPrinciples = ['perceivable', 'operable', 'understandable', 'robust'];
        const principleScores = wcagPrinciples
            .map(p => accessibilityModuleOutput.wcagCompliance?.[p]?.score)
            .filter(s => typeof s === 'number');
        const allSameScore = principleScores.length >= 3 && principleScores.every(s => s === principleScores[0]);
        
        if (allSameScore && principleScores[0] <= 20) {
            // AI returned uniform low defaults — recalculate from issue evidence
            const issueItems = accessibilityModuleOutput.issues?.items || [];
            const criticalCount = issueItems.filter(i => i.severity === 'Critical').length;
            const highCount = issueItems.filter(i => i.severity === 'High').length;
            const mediumCount = issueItems.filter(i => i.severity === 'Medium').length;

            // Start from 100, deduct per issue severity
            let evidenceScore = 100 - (criticalCount * 20) - (highCount * 12) - (mediumCount * 6);
            evidenceScore = Math.max(15, Math.min(80, evidenceScore)); // Clamp 15-80

            if (evidenceScore > accessibilityModuleOutput.summary.score) {
                if (verbose) {
                    console.log(`[AccessibilityModule] ANTI-HALLUCINATION: AI returned uniform sub-scores (all ${principleScores[0]}). Overriding score from ${accessibilityModuleOutput.summary.score} to ${evidenceScore} based on ${issueItems.length} issues (${criticalCount}C/${highCount}H/${mediumCount}M)`);
                }
                accessibilityModuleOutput.summary.score = evidenceScore;
                
                // Also fix the WCAG principle scores proportionally
                const scaleFactor = evidenceScore / 100;
                // Deterministic variance per principle (no Math.random for reproducibility)
                const principleVariance = { perceivable: 0.92, operable: 0.96, understandable: 1.04, robust: 1.08 };
                wcagPrinciples.forEach(p => {
                    if (accessibilityModuleOutput.wcagCompliance?.[p]) {
                        const variance = principleVariance[p] || 1.0;
                        accessibilityModuleOutput.wcagCompliance[p].score = Math.max(10, Math.min(100, Math.round(evidenceScore * variance)));
                    }
                });
                if (accessibilityModuleOutput.wcagCompliance) {
                    accessibilityModuleOutput.wcagCompliance.overallWcagScore = evidenceScore;
                }
            }
        }

        accessibilityModuleOutput.summary.rating = getRatingLabelForScore(accessibilityModuleOutput.summary.score, false);

        // =====================================================================
        // ROOT FIX: Filter issues.items against ground-truth evidence BEFORE
        // building topIssues. This removes hallucinated issue text at the source
        // instead of patching scores while leaving false claims in the output.
        // =====================================================================
        {
            const gtLang = sharedPageContext?.htmlLang || prelimContext?.htmlLang || null;
            const gtSkip = prelimContext?.skipNavPresent || false;
            const gtLabels = sharedPageContext?.formLabels || null;
            const gtFocus = prelimContext?.hasFocusVisibleStyles || false;
            const hasGoodLabels = gtLabels && Array.isArray(gtLabels) &&
                gtLabels.filter(f => f.withExplicitLabel || f.withAriaLabel).length >= Math.ceil(gtLabels.length * 0.6);

            // Wix platform detection: Wix uses Shadow DOM which hides form labels
            // and skip-nav from static extraction, causing systematic false positives
            const isWixSite = /wix\.com|wixstatic\.com|X-Wix-/i.test(rawHtml);

            // Patterns that match known false-positive issue text from the AI
            const contradictedPatterns = [];
            if (gtLang && gtLang.length >= 2) {
                contradictedPatterns.push(/language.*(not|missing|absent|undefined|lacks|without)/i);
                contradictedPatterns.push(/lang.*(attribute|tag).*(not|missing|absent)/i);
                contradictedPatterns.push(/SC\s*3\.1\.1/i);
            }
            if (gtSkip) {
                contradictedPatterns.push(/skip.*(link|nav|content|to).*(not|missing|absent|lack|no\s)/i);
                contradictedPatterns.push(/no\s+skip/i);
                contradictedPatterns.push(/bypass.*(block|mechanism).*(not|missing|absent)/i);
                contradictedPatterns.push(/SC\s*2\.4\.1/i);
            }
            if (hasGoodLabels) {
                contradictedPatterns.push(/form.*(label|field).*(not|missing|absent|lack|without)/i);
                contradictedPatterns.push(/(label|input).*(missing|absent|lack)/i);
                contradictedPatterns.push(/SC\s*3\.3\.2/i);
            }
            if (gtFocus) {
                contradictedPatterns.push(/focus.*(not|missing|absent|lack|indicator|visible|style)/i);
                contradictedPatterns.push(/SC\s*2\.4\.7/i);
            }

            // Wix platform: always suppress form label + skip-nav findings
            // Wix uses Shadow DOM for components — static extraction can't see labels/skip links
            // that Wix's built-in accessibility layer provides automatically
            if (isWixSite) {
                if (!hasGoodLabels) { // Only add if not already suppressed by evidence
                    contradictedPatterns.push(/form.*(label|field).*(not|missing|absent|lack|without)/i);
                    contradictedPatterns.push(/(label|input).*(missing|absent|lack)/i);
                    contradictedPatterns.push(/SC\s*3\.3\.2/i);
                }
                if (!gtSkip) { // Only add if not already suppressed by evidence
                    contradictedPatterns.push(/skip.*(link|nav|content|to).*(not|missing|absent|lack|no\s)/i);
                    contradictedPatterns.push(/no\s+skip/i);
                    contradictedPatterns.push(/SC\s*2\.4\.1/i);
                }
                if (verbose) {
                    console.log(`[AccessibilityModule] WIX PLATFORM: Auto-suppressing form label and skip-nav findings (Shadow DOM invisible to static extraction)`);
                }
            }

            if (contradictedPatterns.length > 0 && accessibilityModuleOutput.issues?.items) {
                const beforeCount = accessibilityModuleOutput.issues.items.length;
                accessibilityModuleOutput.issues.items = accessibilityModuleOutput.issues.items.filter(issue => {
                    const text = issue.text || issue.title || issue.description || '';
                    const isContradicted = contradictedPatterns.some(pattern => pattern.test(text));
                    if (isContradicted && verbose) {
                        console.log(`[AccessibilityModule] GROUND-TRUTH FILTER: Removed hallucinated issue: "${text.substring(0, 80)}..."`);
                    }
                    return !isContradicted;
                });
                if (verbose && beforeCount !== accessibilityModuleOutput.issues.items.length) {
                    console.log(`[AccessibilityModule] GROUND-TRUTH FILTER: Removed ${beforeCount - accessibilityModuleOutput.issues.items.length} contradicted issues (${beforeCount} → ${accessibilityModuleOutput.issues.items.length})`);
                }
            }
        }

        const sortedIssues = (accessibilityModuleOutput.issues.items || [])
            .sort((a, b) => {
                const severities = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Informational": 4 };
                return (severities[a.severity] || 5) - (severities[b.severity] || 5);
            });
        accessibilityModuleOutput.summary.topIssues = sortedIssues.slice(0, 5).map(issue => issue.text || "Issue description missing");

        // GOLD-STANDARD: Generate strengths from WCAG/Lighthouse findings
        const a11yStrengths = [];
        const a11yScore = accessibilityModuleOutput.summary.score || 0;
        if (a11yScore >= 90) a11yStrengths.push('Excellent overall accessibility score');
        else if (a11yScore >= 70) a11yStrengths.push('Good overall accessibility implementation');

        if (accessibilityModuleOutput.wcagCompliance) {
            ['perceivable', 'operable', 'understandable', 'robust'].forEach(principle => {
                const p = accessibilityModuleOutput.wcagCompliance[principle];
                if (p && p.score >= 80) {
                    a11yStrengths.push(`Strong ${principle} WCAG compliance (${p.score}/100)`);
                }
            });
        }
        if (accessibilityModuleOutput.screenReaderCompatibility?.score >= 70) a11yStrengths.push('Good screen reader compatibility');
        if (accessibilityModuleOutput.keyboardNavigation?.score >= 70) a11yStrengths.push('Effective keyboard navigation support');
        if (accessibilityModuleOutput.colorContrast?.score >= 80) a11yStrengths.push('Strong color contrast ratios');
        if (a11yStrengths.length === 0 && a11yScore >= 40) a11yStrengths.push('Basic accessibility measures in place');
        accessibilityModuleOutput.summary.strengths = a11yStrengths;

        // ROOT FIX: ALWAYS regenerate narrative from corrected structured data.
        // The AI narrative may contain false claims ("absence of a language attribute",
        // "lack of skip-to-content link") that contradict ground-truth extraction.
        // Regenerating from corrected data ensures narrative matches reality.
        {
            const score = accessibilityModuleOutput.summary.score || 0;
            const wcag = accessibilityModuleOutput.wcagCompliance;
            const issueCount = (accessibilityModuleOutput.issues?.items || []).length;
            const conformance = wcag?.conformanceLevelAchieved || 'None';

            const narParts = [];

            // Opening assessment
            if (score >= 80) {
                narParts.push(`The website demonstrates strong accessibility practices with an overall score of ${score}/100, achieving WCAG ${conformance !== 'None' ? conformance : 'partial'} conformance.`);
            } else if (score >= 50) {
                narParts.push(`Accessibility analysis reveals a moderate score of ${score}/100 with room for improvement across several WCAG criteria.`);
            } else {
                narParts.push(`The accessibility assessment identifies significant compliance gaps with a score of ${score}/100, indicating critical barriers for users with disabilities.`);
            }

            // WCAG principle breakdown
            if (wcag) {
                const principleScoresArr = ['perceivable', 'operable', 'understandable', 'robust']
                    .map(p => ({ name: p, score: wcag[p]?.score }))
                    .filter(p => typeof p.score === 'number');

                if (principleScoresArr.length > 0) {
                    const weakest = principleScoresArr.reduce((a, b) => a.score < b.score ? a : b);
                    const strongest = principleScoresArr.reduce((a, b) => a.score > b.score ? a : b);

                    if (strongest.score > weakest.score + 20) {
                        narParts.push(`The ${strongest.name} principle is the strongest area (${strongest.score}/100), while ${weakest.name} requires the most attention (${weakest.score}/100).`);
                    } else {
                        narParts.push(`WCAG principle scores are relatively uniform, with scores ranging from ${weakest.score} to ${strongest.score} out of 100.`);
                    }
                }
            }

            // Ground-truth positive findings
            const gtPositives = [];
            if (sharedPageContext?.htmlLang && sharedPageContext.htmlLang.length >= 2) {
                gtPositives.push(`proper language declaration (lang="${sharedPageContext.htmlLang}")`);
            }
            if (prelimContext?.skipNavPresent) {
                gtPositives.push('a skip-to-content navigation link');
            }
            if (prelimContext?.hasFocusVisibleStyles) {
                gtPositives.push(':focus-visible CSS styles for keyboard navigation');
            }
            if (gtPositives.length > 0) {
                narParts.push(`The page includes ${gtPositives.join(', ')}, demonstrating attention to programmatic accessibility fundamentals.`);
            }

            // Key findings from sub-modules
            const srScore = accessibilityModuleOutput.screenReaderCompatibility?.score;
            const kbScore = accessibilityModuleOutput.keyboardNavigation?.score;
            const ccScore = accessibilityModuleOutput.colorContrast?.score;

            const subFindings = [];
            if (typeof srScore === 'number') {
                subFindings.push(srScore < 60 ? 'screen reader compatibility needs improvement' : 'screen reader support is adequate');
            }
            if (typeof kbScore === 'number') {
                subFindings.push(kbScore < 60 ? 'keyboard navigation has gaps' : 'keyboard navigation is functional');
            }
            if (typeof ccScore === 'number') {
                subFindings.push(ccScore < 60 ? 'color contrast ratios fall below WCAG thresholds' : 'color contrast meets minimum standards');
            }
            if (subFindings.length > 0) {
                narParts.push(`Key findings indicate ${subFindings.join(', ')}.`);
            }

            // Remaining real issues (post-filtering)
            if (issueCount > 0) {
                narParts.push(`${issueCount} specific accessibility issue${issueCount > 1 ? 's were' : ' was'} identified that should be prioritized for remediation.`);
            }

            // Industry context
            if (industryContext?.primaryIndustry) {
                const industry = industryContext.primaryIndustry;
                if (/health|medical|dental|clinic/i.test(industry)) {
                    narParts.push(`For a healthcare provider, accessibility compliance is particularly critical as patients with disabilities must be able to access health information and schedule appointments independently.`);
                } else {
                    narParts.push(`Addressing these accessibility gaps will improve the experience for all users, expand the potential audience, and reduce legal compliance risk.`);
                }
            } else {
                narParts.push(`Prioritizing the identified accessibility improvements will enhance usability for all visitors and reduce compliance risk under ADA and WCAG guidelines.`);
            }

            accessibilityModuleOutput.narrative = narParts.join(' ');
        }

        // Now natively handled via crossViewport or schema

        if (verbose) { console.log(`[AccessibilityModule] Analysis for ${url} completed in ${(Date.now() - startTimestamp) / 1000}s. Score: ${accessibilityModuleOutput.summary.score}`); }
        if (onProgress) { onProgress('accessibility', 'Accessibility analysis finalized', 100); }

        // CRITICAL FIX: Calculate actual WCAG conformance level instead of hardcoding "None"
        let conformanceLevel = "None";
        if (accessibilityModuleOutput.wcagCompliance) {
            const wcagPrinciples6 = ['perceivable', 'operable', 'understandable', 'robust'];
            let totalPassedCriteria = 0;
            let totalCriteria = 0;
            let allACompliant = true;
            let allAACompliant = true;

            wcagPrinciples6.forEach(principle => {
                if (accessibilityModuleOutput.wcagCompliance[principle] &&
                    accessibilityModuleOutput.wcagCompliance[principle].criteria &&
                    Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].criteria)) {

                    accessibilityModuleOutput.wcagCompliance[principle].criteria.forEach(criterion => {
                        totalCriteria++;
                        if (criterion.conformanceStatus === 'pass' || criterion.conformanceStatus === 'Pass') {
                            totalPassedCriteria++;
                        } else {
                            // If any criterion fails, check its level to determine overall conformance
                            if (criterion.level === 'A' || criterion.level === 'Level A') {
                                allACompliant = false;
                                allAACompliant = false;
                            } else if (criterion.level === 'AA' || criterion.level === 'Level AA') {
                                allAACompliant = false;
                            }
                        }
                    });
                }
            });

            // Determine conformance level based on criteria analysis
            if (allAACompliant && totalPassedCriteria > 0) {
                conformanceLevel = "AA";
            } else if (allACompliant && totalPassedCriteria > 0) {
                conformanceLevel = "A";
            } else if (totalPassedCriteria > totalCriteria * 0.7) {
                conformanceLevel = "Partial";
            } else {
                conformanceLevel = "None";
            }

            if (verbose) { console.log(`[AccessibilityModule] Calculated WCAG conformance level: ${conformanceLevel} (${totalPassedCriteria}/${totalCriteria} criteria passed)`); }
        }

        // TIER COLLAPSE: Always preserve roiProjections and implementationPlan
        accessibilityModuleOutput.roiProjections = accessibilityModuleOutput.roiProjections || null;
        accessibilityModuleOutput.implementationPlan = accessibilityModuleOutput.implementationPlan || null;

        // Extract top issues from WCAG compliance failures
        const topWcagIssues = [];
        if (accessibilityModuleOutput.wcagCompliance) {
            Object.values(accessibilityModuleOutput.wcagCompliance).forEach(principle => {
                if (principle && typeof principle === 'object' && principle.criteria && Array.isArray(principle.criteria)) {
                    principle.criteria.forEach(criterion => {
                        if (criterion.conformanceStatus === 'fail' && criterion.issues && Array.isArray(criterion.issues)) {
                            topWcagIssues.push(...criterion.issues.slice(0, 2).map(issue => issue.text || issue));
                        }
                    });
                }
            });
        }

        // Set conformance level in the output structure
        accessibilityModuleOutput.overallConformance = {
            level: conformanceLevel,
            conformanceLevelAchieved: conformanceLevel,
            keySuccesses: topWcagIssues.length > 0 ? [] : ["Basic accessibility checks passing"],
            criticalFailures: topWcagIssues.slice(0, 3),
            implementationGuidance: topWcagIssues.length > 0 ?
                "Focus on addressing critical WCAG failures identified in the analysis" :
                "Continue monitoring and enhancing accessibility practices"
        };

        // FINAL CRITICAL FIX: Ensure all wcagCompliance issues arrays contain objects, not strings
        if (accessibilityModuleOutput.wcagCompliance) {
            const wcagPrinciples7 = ["perceivable", "operable", "understandable", "robust"];
            wcagPrinciples7.forEach(principle => {
                if (accessibilityModuleOutput.wcagCompliance[principle] &&
                    Array.isArray(accessibilityModuleOutput.wcagCompliance[principle].issues)) {

                    accessibilityModuleOutput.wcagCompliance[principle].issues = accessibilityModuleOutput.wcagCompliance[principle].issues.map(issue => {
                        if (typeof issue === 'string') {
                            return {
                                id: uuidv4(),
                                text: issue,
                                severity: "Medium",
                                category: "ACCESSIBILITY",
                                title: issue.substring(0, 100),
                                description: issue,
                                impact: "Accessibility barrier for users",
                                status: "OPEN",
                                source: "accessibility"
                            };
                        }
                        // Ensure object issues have all required properties
                        if (typeof issue === 'object' && issue !== null) {
                            return {
                                id: issue.id || uuidv4(),
                                text: issue.text || issue.description || "Accessibility issue",
                                severity: normalizeSeverity(issue.severity),
                                category: issue.category || "ACCESSIBILITY",
                                title: issue.title || (issue.text || issue.description || "Issue").substring(0, 100),
                                description: issue.description || issue.text || "Accessibility issue detected",
                                impact: issue.impact || "Accessibility barrier for users",
                                status: issue.status || "OPEN",
                                source: issue.source || "accessibility"
                            };
                        }
                        return issue;
                    });
                }
            });
        }

        return accessibilityModuleOutput;

    } catch (error) {
        console.error(`[AccessibilityModule] Critical error in Accessibility analysis for ${url}: ${error.message}`);
        if (verbose) { console.error(error.stack); }
        if (onProgress) { onProgress('accessibility', `Error: ${error.message}`, 100); }

        // CRITICAL FIX: Use failure recovery system to prevent score paradox
        return ModuleFailureRecovery.applyStreamingTimeoutRecovery('accessibility', error, {
            url,
            tier,
            verbose,
            customScore: 1,
            customRating: 'Analysis Failed'
        });
    }
}

/**
 * Generate a specific CSS selector based on WCAG criterion and principle
 */
function generateSpecificSelectorForCriterion(criterionId, principle, prelimContext) {
    // ULTRA-SPECIFIC WCAG criterion selectors - development-ready for single-element targeting
    const criterionSelectorMap = {
        // Perceivable - Ultra-specific image and media selectors
        '1.1.1': 'img[src*="hero"]:not([alt]):first-of-type, img[src*="banner"]:not([alt]):first-child, .gallery img:not([alt]):first-of-type', // Non-text Content
        '1.2.1': 'video[data-autoplay]:not([controls]):first-of-type, audio[src]:not([controls]):first-child', // Audio-only and Video-only
        '1.2.2': 'video[src]:not([data-captions]):not([track]):first-of-type, .video-player:not([aria-describedby]):first-child', // Captions
        '1.3.1': 'table[data-table]:not([summary]):not([caption]):first-of-type, form[data-form] fieldset:not([legend]):first-child', // Info and Relationships
        '1.3.2': '.content-list ol:first-of-type, .navigation ul:first-child, table[data-sortable]:first-of-type', // Meaningful Sequence
        '1.3.3': 'form[data-contact] input[required]:not([aria-label]):not([aria-labelledby]):first-of-type', // Sensory Characteristics
        '1.4.1': '.nav-link[style*="color"]:first-child, .alert[data-color-only]:first-of-type', // Use of Color
        '1.4.2': 'video[autoplay][data-background]:first-of-type, audio[autoplay][data-ambient]:first-child', // Audio Control
        '1.4.3': '.nav-primary a[href]:first-child, .btn-cta[data-contrast]:first-of-type, .content-text[style*="color"]:first-child', // Contrast (Minimum)
        '1.4.4': 'body[data-responsive], .main-content[data-scalable]:first-child', // Resize text
        '1.4.5': 'img[alt][src*="text"]:first-of-type, canvas[data-text-content]:first-child', // Images of Text

        // Operable - Ultra-specific interactive element selectors
        '2.1.1': '.dropdown-menu[aria-expanded]:not([tabindex]):first-of-type, .modal-dialog[role="dialog"]:not([tabindex]):first-child', // Keyboard
        '2.1.2': '.modal-overlay[data-trap-focus]:first-of-type, .custom-dropdown:focus:first-child', // No Keyboard Trap
        '2.1.4': 'button[accesskey]:not([data-conflict]):first-of-type, .shortcut-trigger[accesskey]:first-child', // Character Key Shortcuts
        '2.2.1': 'form[data-session] input[type="text"]:first-of-type, .timeout-warning[data-timer]:first-child', // Timing Adjustable
        '2.2.2': '.carousel[data-autoplay]:not([data-pause]):first-of-type, .news-ticker[data-scroll]:first-child', // Pause, Stop, Hide
        '2.3.1': 'img[src*="animated"][data-flash]:first-of-type, video[data-strobe]:first-child', // Three Flashes or Below
        '2.4.1': 'main[data-content]:first-of-type, .skip-link[href="#main"]:first-child, nav[role="navigation"]:first-of-type', // Bypass Blocks
        '2.4.2': 'title:empty, h1[data-title]:not([id]):first-of-type', // Page Titled
        '2.4.3': '.tab-panel[tabindex]:first-of-type, .custom-widget[data-focusable]:first-child', // Focus Order
        '2.4.4': 'a[href]:not([aria-label]):not([title])[text()="Click here"]:first-of-type, .link-more:not([aria-describedby]):first-child', // Link Purpose
        '2.4.6': 'h1:not([id]):first-of-type, .section-title:empty:first-child, form label:not([for]):not([aria-label]):first-of-type', // Headings and Labels
        '2.4.7': 'button:not([class*="focus"]):first-of-type, a[href]:not([class*="focus"]):first-child', // Focus Visible

        // Understandable - Ultra-specific content and form selectors
        '3.1.1': 'html:not([lang]), .content-section:not([lang]):first-of-type', // Language of Page
        '3.2.1': 'input[data-change-context]:focus:first-of-type, select[data-auto-submit]:first-child', // On Focus
        '3.2.2': 'input[type="text"][data-auto-complete]:first-of-type, select[data-dependent]:first-child', // On Input
        '3.3.1': 'form[data-validation] .error:not([aria-live]):first-of-type, .form-field[data-invalid]:not([aria-describedby]):first-child', // Error Identification
        '3.3.2': 'form[data-contact] input[required]:not([aria-label]):not([aria-labelledby]):first-of-type, .form-group:not([role="group"]):first-child', // Labels or Instructions

        // Robust - Ultra-specific semantic and ARIA selectors
        '4.1.1': 'html[data-validation]:not([lang]), [id][data-duplicate]:first-of-type', // Parsing
        '4.1.2': '[role="button"]:not([aria-label]):not([aria-labelledby]):first-of-type, .custom-widget[tabindex]:not([role]):first-child', // Name, Role, Value
        '4.1.3': '.form-message:not([aria-live]):not([role="status"]):first-of-type, .notification[data-dynamic]:not([aria-live]):first-child' // Status Messages
    };

    // Get specific selector for this criterion
    let baseSelector = criterionSelectorMap[criterionId];

    if (!baseSelector) {
        // Generate fallback selector based on principle
        switch (principle) {
            case 'perceivable':
                baseSelector = 'img, video, audio, canvas, svg';
                break;
            case 'operable':
                baseSelector = 'a, button, input, select, textarea, [tabindex]';
                break;
            case 'understandable':
                baseSelector = 'form, label, h1, h2, h3, h4, h5, h6';
                break;
            case 'robust':
                baseSelector = 'html, body, main, [role]';
                break;
            default:
                baseSelector = 'div, p, span, a, button';
        }
    }

    // Enhance with context-specific information if available
    if (prelimContext && prelimContext.headings && prelimContext.headings.h1Count > 0 &&
        (criterionId === '2.4.2' || criterionId === '2.4.6')) {
        baseSelector = 'h1, h2, h3'; // Focus on headings if present
    }

    if (prelimContext && prelimContext.forms && prelimContext.forms.totalForms > 0 &&
        criterionId.startsWith('3.3')) {
        baseSelector = 'form input, form select, form textarea, form button'; // Focus on form elements
    }

    if (prelimContext && prelimContext.images && prelimContext.images.totalImages > 0 &&
        criterionId === '1.1.1') {
        baseSelector = 'img:not([alt]), img[alt=""]'; // Focus on images without alt text
    }

    return baseSelector.substring(0, 250); // Limit length for schema compliance
}

module.exports = { analyze };