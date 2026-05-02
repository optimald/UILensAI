
function calculateModalAccessibilityScore(modal) {
    let score = 50; // Base score
    if (modal.ariaModal) score += 20;
    if (modal.accessibility.hasAriaLabel || modal.accessibility.hasAriaLabelledby) score += 15;
    if (modal.accessibility.focusable) score += 10;
    if (modal.hasCloseButton) score += 5;
    return Math.min(100, score);
}

function calculateModalUsabilityScore(modal) {
    let score = 60; // Base score
    if (modal.hasCloseButton) score += 20;
    if (modal.hasBackdrop) score += 10;
    if (!modal.isVisible) score += 10; // Hidden by default is good
    return Math.min(100, score);
}

function generateModalIssues(modal) {
    const issues = [];
    if (!modal.hasCloseButton) {
        issues.push({
            text: "Modal lacks a clear close button for proper user interaction",
            severity: "High",
            location: modal.elementSelector || "Modal element",
            category: "Usability"
        });
    }
    if (!modal.ariaModal) {
        issues.push({
            text: "Modal missing aria-modal='true' attribute for screen reader accessibility",
            severity: "High",
            location: modal.elementSelector || "Modal element",
            category: "Accessibility"
        });
    }
    if (!modal.accessibility.hasAriaLabel && !modal.accessibility.hasAriaLabelledby) {
        issues.push({
            text: "Modal lacks accessible label (aria-label or aria-labelledby)",
            severity: "High",
            location: modal.elementSelector || "Modal element",
            category: "Accessibility"
        });
    }
    if (!modal.accessibility.focusable) {
        issues.push({
            text: "Modal not properly focusable for keyboard users",
            severity: "Medium",
            location: modal.elementSelector || "Modal element",
            category: "Accessibility"
        });
    }
    return issues;
}

function calculateCarouselAccessibilityScore(carousel) {
    let score = 40; // Base score
    if (carousel.accessibility.hasAriaLabel) score += 20;
    if (carousel.accessibility.hasAriaLive) score += 15;
    if (carousel.accessibility.controlsAccessible) score += 15;
    if (carousel.hasIndicators) score += 10;
    return Math.min(100, score);
}

function calculateCarouselUsabilityScore(carousel) {
    let score = 50; // Base score
    if (carousel.hasControls) score += 25;
    if (carousel.hasIndicators) score += 15;
    if (carousel.slideCount >= 3 && carousel.slideCount <= 7) score += 10; // Optimal range
    return Math.min(100, score);
}

function generateCarouselIssues(carousel) {
    const issues = [];
    if (!carousel.hasControls) {
        issues.push({
            text: "Carousel lacks navigation controls for user interaction",
            severity: "Medium",
            location: carousel.elementSelector || "Carousel element",
            category: "Usability"
        });
    }
    if (!carousel.hasIndicators) {
        issues.push({
            text: "Carousel lacks slide indicators for navigation feedback",
            severity: "Low",
            location: carousel.elementSelector || "Carousel element",
            category: "Usability"
        });
    }
    if (!carousel.accessibility.hasAriaLabel) {
        issues.push({
            text: "Carousel missing accessible label for screen readers",
            severity: "High",
            location: carousel.elementSelector || "Carousel element",
            category: "Accessibility"
        });
    }
    if (carousel.autoplay && !carousel.accessibility.hasAriaLive) {
        issues.push({
            text: "Auto-playing carousel lacks aria-live region for screen readers",
            severity: "High",
            location: carousel.elementSelector || "Carousel element",
            category: "Accessibility"
        });
    }
    if (carousel.slideCount > 10) {
        issues.push({
            text: "Too many slides may impact performance and usability",
            severity: "Medium",
            location: carousel.elementSelector || "Carousel element",
            category: "Performance"
        });
    }
    return issues;
}

function calculateAccordionAccessibilityScore(accordion) {
    let score = 60; // Base score
    if (accordion.accessibility.hasAriaExpanded) score += 20;
    if (accordion.accessibility.hasAriaControls) score += 15;
    if (accordion.accessibility.keyboardNavigation) score += 5;
    return Math.min(100, score);
}

function calculateAccordionUsabilityScore(accordion) {
    let score = 70; // Base score
    if (accordion.hasHeaders) score += 15;
    if (accordion.panelCount >= 3 && accordion.panelCount <= 8) score += 15; // Optimal range
    return Math.min(100, score);
}

function generateAccordionIssues(accordion) {
    const issues = [];
    if (!accordion.accessibility.hasAriaExpanded) {
        issues.push({
            text: "Accordion headers missing aria-expanded attribute",
            severity: "High",
            location: accordion.elementSelector || "Accordion element",
            category: "Accessibility"
        });
    }
    if (!accordion.accessibility.hasAriaControls) {
        issues.push({
            text: "Accordion headers missing aria-controls attribute",
            severity: "High",
            location: accordion.elementSelector || "Accordion element",
            category: "Accessibility"
        });
    }
    if (!accordion.accessibility.keyboardNavigation) {
        issues.push({
            text: "Accordion not fully keyboard accessible",
            severity: "Medium",
            location: accordion.elementSelector || "Accordion element",
            category: "Accessibility"
        });
    }
    if (accordion.panelCount > 10) {
        issues.push({
            text: "Too many accordion panels may overwhelm users",
            severity: "Low",
            location: accordion.elementSelector || "Accordion element",
            category: "Usability"
        });
    }
    return issues;
}


function analyzeIndustrySpecificPatterns(dynamicElements, industry) {
    const patterns = [];

    switch (industry.toLowerCase()) {
        case 'e-commerce':
        case 'retail':
            if (dynamicElements.carousels.length > 0) {
                patterns.push({
                    patternName: "Product carousel detected",
                    industry: "E-commerce",
                    score: 75,
                    bestPracticesAdherence: 70
                });
            }
            if (dynamicElements.modals.length > 0) {
                patterns.push({
                    patternName: "Modal dialogs present",
                    industry: "E-commerce",
                    score: 80,
                    bestPracticesAdherence: 75
                });
            }
            if (dynamicElements.accordions.length > 0) {
                patterns.push({
                    patternName: "Accordion components detected",
                    industry: "E-commerce",
                    score: 85,
                    bestPracticesAdherence: 80
                });
            }
            break;

        case 'healthcare':
        case 'medical':
            if (dynamicElements.accordions.length > 0) {
                patterns.push({
                    patternName: "FAQ accordion detected",
                    industry: "Healthcare",
                    score: 90,
                    bestPracticesAdherence: 85
                });
            }
            if (dynamicElements.modals.length > 0) {
                patterns.push({
                    patternName: "Information modals detected",
                    industry: "Healthcare",
                    score: 85,
                    bestPracticesAdherence: 80
                });
            }
            break;

        case 'finance':
        case 'banking':
            if (dynamicElements.modals.length > 0) {
                patterns.push({
                    patternName: "Security modal dialogs",
                    industry: "Finance",
                    score: 80,
                    bestPracticesAdherence: 90
                });
            }
            break;

        case 'education':
            if (dynamicElements.accordions.length > 0) {
                patterns.push({
                    patternName: "Course content accordions",
                    industry: "Education",
                    score: 85,
                    bestPracticesAdherence: 80
                });
            }
            break;

        default:
            // General patterns for unknown industries
            if (dynamicElements.modals.length > 0) {
                patterns.push({
                    patternName: "Interactive modal elements",
                    industry: "General",
                    score: 75,
                    bestPracticesAdherence: 70
                });
            }
            if (dynamicElements.carousels.length > 0) {
                patterns.push({
                    patternName: "Content carousel components",
                    industry: "General",
                    score: 80,
                    bestPracticesAdherence: 75
                });
            }
            if (dynamicElements.accordions.length > 0) {
                patterns.push({
                    patternName: "Collapsible content sections",
                    industry: "General",
                    score: 85,
                    bestPracticesAdherence: 80
                });
            }
    }

    return patterns;
}

/**
 * Generates meaningful CSS selectors based on the visual evidence description, category, and detected frameworks
 * @param {string} description - The description of the visual evidence
 * @param {string} category - The UI analysis category (e.g., 'hierarchy', 'consistency', etc.)
 * @param {Array} frameworks - Array of detected frameworks
 * @returns {string} A meaningful CSS selector
 */
// Removed unused legacy selector generators


function generateStaticElementsIssues(staticAnalysis) {
    const issues = [];

    // Analyze accessibility issues
    if (staticAnalysis.accessibilityFeatures.ariaLabels < 3) {
        issues.push("Limited ARIA labels detected - improve accessibility labeling for interactive elements");
    }

    if (staticAnalysis.mediaElements.imagesWithoutAlt > 0) {
        issues.push(`${staticAnalysis.mediaElements.imagesWithoutAlt} images missing alt text`);
    }

    if (staticAnalysis.accessibilityFeatures.headingStructure.h1Count === 0) {
        issues.push("No H1 heading detected - heading hierarchy needs improvement");
    }

    // Analyze form accessibility
    const formsWithoutLabels = staticAnalysis.formElements.filter(form => !form.hasLabels).length;
    if (formsWithoutLabels > 0) {
        issues.push(`${formsWithoutLabels} form(s) missing proper label association`);
    }

    // Analyze interactive elements
    const elementsWithoutAccessibleNames = staticAnalysis.interactiveElements.filter(el => !el.hasAccessibleName).length;
    if (elementsWithoutAccessibleNames > 0) {
        issues.push(`${elementsWithoutAccessibleNames} interactive elements lack accessible names`);
    }

    // Analyze navigation
    if (staticAnalysis.navigationElements.length === 0) {
        issues.push("No navigation structure detected");
    }

    // If no issues found, provide positive feedback
    if (issues.length === 0) {
        issues.push("Static interactive elements show good accessibility and usability patterns");
    }

    return issues;
}

/**
 * ENHANCED DYNAMIC SELECTOR DISCOVERY SYSTEM - Ultra-Specific Selectors for 95+ Score
 * This system scrapes the page for unique, actionable selectors and adapts to any website structure
 */

module.exports = {
  calculateModalAccessibilityScore,
  calculateModalUsabilityScore,
  generateModalIssues,
  calculateCarouselAccessibilityScore,
  calculateCarouselUsabilityScore,
  generateCarouselIssues,
  calculateAccordionAccessibilityScore,
  calculateAccordionUsabilityScore,
  generateAccordionIssues,
  analyzeIndustrySpecificPatterns,
  generateStaticElementsIssues
};
