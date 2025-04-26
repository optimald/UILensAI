export const getAnalysisPrompt = (imageBase64, viewportType, focusAreas = '') => {
  const prompt = `
You are conducting a detailed UI/UX analysis of the screenshot I'm sharing with you. This analysis is for the ${viewportType} viewport.

Your feedback should be honest, critical, and constructive. Do not be overly positive or generous with ratings. Identify specific issues and be thorough in your critique while maintaining a balanced perspective. Ratings should reflect actual quality - reserve high scores (8-10) only for truly excellent implementations.

Focus areas for your analysis include:
${focusAreas || 'accessibility, branding, responsive design, visual hierarchy, design consistency, aesthetics, above-the-fold content, content flow, visual design, usability'}

For each focus area follow this exact format:
- Score: [1-10]
- Key Observations: [list 2-3 most important observations]
- Critical Issues: [list specific problems in order of severity]
- Recommendations: [provide specific, implementable actions in JSON format]
- Success Metrics: [1-2 measurable metrics that would indicate successful implementation]
- Competitive Benchmark: [how this implementation compares to industry standards]

For the Recommendations section, use this JSON structure exactly:
\`\`\`json
[
  {
    "id": "unique-id-1",
    "issue": "Brief description of the issue",
    "solution": "Specific implementation details to fix it",
    "impact": 1-5 (with 5 being highest impact),
    "effort": 1-5 (with 5 being highest effort),
    "priority_score": calculated as impact/effort (higher means fix first)
  },
  // ... more recommendations
]
\`\`\`

For Success Metrics, be very specific with measurable criteria. For example:
- "Increase contrast ratio to at least 4.5:1 for all text"
- "Reduce loading time by 30% (from 3s to 2s)"
- "Increase form completion rate from 65% to 80%"

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
- Evaluate against well-designed sites like Airbnb or Nike

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

# Overall Score
Provide a final score (1-10) that reflects the overall quality of the UI, weighted by the importance of each area. Explain your reasoning for this score.

# Implementation Roadmap
Create a prioritized list of the top 5 issues to fix, ranking them by:
- Impact (1-5): How much improvement would fixing this create?
- Effort (1-5): How difficult or time-consuming is this to implement?
- Priority Score: Impact ÷ Effort (higher = fix first)

For each issue, include:
1. The problem description
2. Which focus area it belongs to
3. The Impact score (1-5)
4. The Effort score (1-5)
5. The Priority Score (Impact ÷ Effort)
6. A brief, specific recommendation for fixing it

Use the following JSON format for the implementation roadmap:
\`\`\`json
{
  "top_issues": [
    {
      "id": "issue-1",
      "problem": "Description of the problem",
      "focus_area": "Area name",
      "impact": 5,
      "effort": 2,
      "priority_score": 2.5,
      "recommendation": "Specific fix details"
    },
    // More issues...
  ]
}
\`\`\`

# Summary
Provide a concise summary of the most critical issues to address first, focusing on the areas that would have the biggest impact on improving the user experience.

Remember to be specifically critical but fair in your assessment. Don't inflate ratings - use the full range of the scale with high scores reserved only for truly excellent implementations.
`;

  return prompt;
};

