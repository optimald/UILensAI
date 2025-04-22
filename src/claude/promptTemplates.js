export const getAnalysisPrompt = (imageBase64, viewportType, focusAreas = '') => {
  const prompt = `
You are conducting a detailed UI/UX analysis of the screenshot I'm sharing with you. This analysis is for the ${viewportType} viewport.

Your feedback should be honest, critical, and constructive. Do not be overly positive or generous with ratings. Identify specific issues and be thorough in your critique while maintaining a balanced perspective. Ratings should reflect actual quality - reserve high scores (8-10) only for truly excellent implementations.

Focus areas for your analysis include:
${focusAreas || 'accessibility, branding, responsive design, visual hierarchy, design consistency, aesthetics, above-the-fold content, content flow, visual design, usability'}

For each focus area:
1. Provide specific observations and detailed critiques
2. Rate the implementation on a scale of 1-10 
3. Offer specific, actionable recommendations for improvement

Areas to analyze in detail:

# Accessibility
- Color contrast and readability
- Text size and legibility 
- Interactive element affordances
- Keyboard navigability clues
- Alternative text indicators
- Screen reader compatibility hints

# Branding
- Brand identity clarity and consistency
- Visual tone and personality
- Memorability of brand elements
- Differentiation from competitors
- Trust signals and credibility indicators
- Brand message reinforcement

# Responsive Design
- Content adaptation to viewport
- Readability at this screen size
- Touch target appropriateness
- Layout adjustments
- Content prioritization
- Potential viewport-specific issues

# Visual Hierarchy
- Priority of information presentation
- Visual weight of elements
- Attention guidance through the interface
- Clear differentiation between UI sections
- Use of space to organize content
- Path for user's eye to follow

# Design Consistency
- Consistency of UI components
- Alignment with design systems
- Typography consistency
- Color application consistency
- Spacing and layout patterns
- Interaction patterns

# Aesthetics
- Visual balance and harmony
- Color harmony and appeal
- Typographic beauty and readability
- Quality of visual elements
- Overall visual appeal and memorability
- Modern vs dated appearance
- Compare to well-designed sites like Airbnb or Nike

# Above-the-Fold Content
- Initial impact and clarity of value proposition
- Presence and effectiveness of primary call-to-action
- Visual prioritization of critical information
- First impression quality
- Balance between information density and whitespace
- Content relevance to user needs
- Clarity of next steps for user

# Content Flow and Information Architecture
- Logical progression of information
- Visual cues that guide users through content
- Scannable layout patterns (F-pattern, Z-pattern)
- Content chunking and grouping
- Use of headings, subheadings, and typography to create flow
- Transition between different content sections
- Balance of text, images, and interactive elements

# Visual Design
- Visual hierarchy and emphasis
- Spacing and layout balance
- Typography choices and execution
- Color palette effectiveness
- Consistency of design elements
- Overall visual appeal

# Usability
- Clarity of UI controls and interactions
- Logical layout and information hierarchy
- Ease of accomplishing key tasks
- Potential user confusion points
- Intuitiveness of navigation
- Layout consistency

# Summary
Provide a concise summary of the most critical issues to address first, focusing on the areas that would have the biggest impact on improving the user experience.

Remember to be specifically critical but fair in your assessment. Don't inflate ratings - use the full range of the scale with high scores reserved only for truly excellent implementations.
`;

  return prompt;
};

export const getComparisonPrompt = (beforeImageBase64, afterImageBase64, viewportType, focusAreas = '') => {
  const prompt = `
You are conducting a detailed before/after UI/UX comparison analysis of the two screenshots I'm sharing with you. This analysis is for the ${viewportType} viewport.

Your feedback should be honest, critical, and constructive. Do not be overly positive or generous with ratings. Identify specific issues and be thorough in your critique while maintaining a balanced perspective. Ratings should reflect actual quality - reserve high scores (8-10) only for truly excellent implementations.

Focus areas for your analysis include:
${focusAreas || 'accessibility, branding, responsive design, visual hierarchy, design consistency, aesthetics, above-the-fold content, content flow, visual design, usability'}

For each focus area:
1. Compare the before and after implementations
2. Identify specific improvements or regressions
3. Rate both versions on a scale of 1-10 (be critical and don't inflate ratings)
4. Offer specific, actionable recommendations for further improvement

Areas to compare in detail:

# Accessibility
- Color contrast and readability changes
- Text size and legibility improvements or regressions
- Interactive element affordances differences
- Keyboard navigability clues improvements
- Alternative text changes
- Screen reader compatibility improvements

# Branding
- Brand identity clarity and consistency changes
- Visual tone and personality evolution
- Memorability of brand elements differences
- Differentiation from competitors improvements
- Trust signals and credibility indicators changes
- Brand message reinforcement evolution

# Responsive Design
- Content adaptation improvements
- Readability changes at this screen size
- Touch target appropriateness differences
- Layout adjustment improvements
- Content prioritization changes
- Resolution of viewport-specific issues

# Visual Hierarchy
- Information prioritization improvements
- Visual weight redistribution
- Attention guidance enhancements
- UI section differentiation changes
- Space utilization improvements
- Eye path optimization

# Design Consistency
- UI component consistency improvements
- Design system alignment changes
- Typography consistency enhancements
- Color application consistency improvements
- Spacing and layout pattern standardization
- Interaction pattern harmonization

# Aesthetics
- Visual balance and harmony changes
- Color harmony and appeal improvements
- Typography refinement
- Visual element quality upgrades
- Overall visual appeal and memorability enhancement
- Modernization or style evolution

# Above-the-Fold Content
- Value proposition clarity improvements
- Call-to-action effectiveness changes
- Critical information prioritization adjustments
- First impression quality enhancement
- Information density vs. whitespace balance changes
- User needs relevance improvements
- Next step clarity changes

# Content Flow and Information Architecture
- Information progression logic improvements
- Visual guidance cue enhancements
- Layout pattern optimization
- Content chunking and grouping improvements
- Typography hierarchy refinements
- Section transition smoothing
- Content mix balance improvements

# Visual Design
- Hierarchy and emphasis refinements
- Spacing and layout balance improvements
- Typography choice and execution upgrades
- Color palette effectiveness enhancements
- Design element consistency improvements
- Overall visual appeal advancements

# Usability
- UI control clarity improvements
- Layout and information hierarchy refinements
- Task accomplishment ease enhancements
- User confusion point resolutions
- Navigation intuitiveness improvements
- Layout consistency enhancement

# Summary
Provide a concise summary of the most significant improvements and any remaining critical issues to address. Focus on the most impactful changes observed between versions and key areas that still need attention.

Remember to be specifically critical but fair in your assessment. Don't inflate ratings - use the full range of the scale with high scores reserved only for truly excellent implementations.
`;

  return prompt;
}; 