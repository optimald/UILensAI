# UILensAI Tier Differentiation

This document outlines the functional differences and execution boundaries between the three main tier levels in UILensAI: `Basic`, `Pro`, and `Enterprise`.

`getPresetConfig()` currently returns the enterprise feature set for every tier. The differences below are the intended product boundaries, not what a scan gates today.

## Architectural Enforcement

Tier differentiation is deeply embedded in the execution orchestrator (`analyze/index.js`), the module settings, and the UI Capture configuration.

### 1. Basic Tier
Targeted towards free audits, individual users, and quick high-level assessments.

- **Viewports Analyzed**: Desktop only.
- **AI Analytics Depth**: Uses `basic` depth parameters. The live model is `google/gemini-3.1-flash-lite` on OpenRouter, with `google/gemini-3.6-flash` for security and performance.
- **Module Restrictions**:
  - `Competitive Context` is **disabled**.
  - Cross-module insights and deep narrative generation are heavily restricted.
  - Hard constraint on the number of pages crawled (max 1 or 2).
- **Report Excellence**: Reports provide the standard score, issues, and basic recommendations.

### 2. Pro Tier
Targeted towards professionals, agencies, and small businesses needing comprehensive execution.

- **Viewports Analyzed**: Desktop and Mobile (Cross-viewport analysis enabled).
- **AI Analytics Depth**: Uses `advanced` depth parameters. Reasoning uses `google/gemini-3.6-flash` and `google/gemini-3.8-flash` on OpenRouter.
- **Module Restrictions**:
  - Requires all 9 core analysis modules.
  - Multi-page crawl limits increased (up to 5 pages).
- **Report Excellence**: Narrative generation includes business impact analysis, structured data validation, and evidence-linking.

### 3. Enterprise Tier
Targeted towards large organizations, advanced custom integrations, and deep-dive audits.

- **Viewports Analyzed**: Desktop, Mobile, and Tablet (optional custom viewports).
- **AI Analytics Depth**: Maximum token limits, full deterministic + AI hybrid reasoning with strict reliability flags.
- **Module Restrictions**:
  - Exclusive access to `Marketing` and `Conversion` heuristic mapping.
  - Advanced Security execution (full CSP parsing, full subresource integrity parsing).
- **Report Excellence**: Reports contain full metadata execution logs, raw reasoning traces from the AI, executive summary generation, and full `Business Impact` matrices.

## Code Implementation
Any module creating tier-based constraints should check `options.tier` and configure the depth of analysis accordingly:
\`\`\`javascript
const { tier = 'Basic' } = options;
const isEnterprise = tier.toLowerCase() === 'enterprise';
\`\`\`
