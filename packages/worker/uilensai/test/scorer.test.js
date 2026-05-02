const {
  calculateModalAccessibilityScore,
  calculateModalUsabilityScore,
  generateModalIssues,
  analyzeIndustrySpecificPatterns
} = require('../analyze/ui/scorer');

describe('UI Scorer', () => {
  it('calculates proper modal accessibility score', () => {
    const modal = {
      ariaModal: true,
      accessibility: { hasAriaLabel: true, focusable: true },
      hasCloseButton: true
    };
    const score = calculateModalAccessibilityScore(modal);
    expect(score).toBe(100);
  });

  it('calculates proper modal usability score', () => {
    const modal = {
      hasCloseButton: true,
      hasBackdrop: true,
      isVisible: false
    };
    const score = calculateModalUsabilityScore(modal);
    expect(score).toBe(100);
  });

  it('generates modal issues for missing requirements', () => {
    const modal = {
      hasCloseButton: false,
      ariaModal: false,
      accessibility: { hasAriaLabel: false, hasAriaLabelledby: false, focusable: false },
      elementSelector: '.my-modal'
    };
    const issues = generateModalIssues(modal);
    expect(issues.length).toBe(4);
    expect(issues[0].text).toContain('close button');
  });

  it('analyzes industry specific patterns correctly', () => {
    const dyn = {
      modals: [{}],
      carousels: [{}],
      accordions: [{}]
    };
    const patterns = analyzeIndustrySpecificPatterns(dyn, 'e-commerce');
    expect(patterns.length).toBe(3);
    expect(patterns.find(p => p.patternName === "Product carousel detected")).toBeTruthy();
    expect(patterns.find(p => p.patternName === "Modal dialogs present")).toBeTruthy();
  });
});
