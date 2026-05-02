# UILensAI

[![npm version](https://img.shields.io/npm/v/@optimald/uilensai.svg)](https://www.npmjs.com/package/@optimald/uilensai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

UILensAI is an AI-powered website analysis engine providing comprehensive insights across ten specialized modules, including enterprise-grade SEO, AEO (Answer Engine Optimization), and GEO (Generative Engine Optimization) diagnostics.

> **📦 Pure npm package**: Install via npm and use directly — no server, no database required. Clients bring their own Cloudflare credentials for screenshot capture.

## Overview

UILensAI captures website data across various viewport dimensions using Cloudflare Browser Rendering, analyzes it using advanced AI models from six providers, and generates detailed reports with actionable recommendations. The SEO module now includes deep AEO/GEO analysis measuring AI citability, answer engine readiness, and platform-specific scores for ChatGPT, Perplexity, and Google AI Overview.

### Key Features
- **Context-Aware Visual Analysis:** Analyzes rendered desktop/mobile/tablet viewports alongside the DOM.
- **Deep Industry Specialization:** Automatically maps domains to 1 of 9 master verticals (Healthcare, SaaS, E-commerce, etc.) and evaluates against industry-specific KPIs and compliance frameworks (HIPAA, PCI-DSS, SOC 2).
- **SEO / AEO / GEO Intelligence:** Evidence-based scoring for traditional SEO, Answer Engine Optimization (featured snippets, PAA, FAQ schema), and Generative Engine Optimization (AI citability, platform readiness, brand authority).
- **Agent Readiness Assessment:** Integrates with isitagentready.com MCP endpoint to evaluate site readiness for AI agents (llms.txt, speakable schema, content signals).
- **Cross-Page SEO Analysis:** Leverages Cloudflare crawl data to detect site-wide SEO issues (duplicate titles, thin content, mixed protocols) across multiple pages.
- **Strategic Insights:** AI-synthesized cross-module intelligence correlating security, privacy, accessibility, and performance findings into executive-level recommendations.
- **Actionable Advice:** Provides step-by-step implementation directives linked to specific conversion funnel improvements.
- **Cloud-Native Screenshots:** Uses Cloudflare Browser Rendering REST API — no local browser binaries required.
- **Crawler Resilience:** Automatic Playwright fallback when HTTP fetch is blocked by Cloudflare/bot protection (403 responses).

## Installation

```bash
npm install @optimald/uilensai
```

> **Note**: Requires Node.js >= 20.0.0.

## Configuration

### AI Provider (required — at least one)

```bash
OPENROUTER_API_KEY=your_key    # OpenRouter (primary — routes to Gemini, Qwen, etc.)
ANTHROPIC_API_KEY=your_key     # Anthropic Claude
OPENAI_API_KEY=your_key        # OpenAI GPT
GEMINI_API_KEY=your_key        # Google Gemini
DEEPSEEK_API_KEY=your_key      # DeepSeek
XAI_API_KEY=your_key           # xAI Grok
```

### Cloudflare Browser Rendering (required for screenshots)

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_BR_API_TOKEN=your_api_token
```

### Google PageSpeed Insights (required for Performance module)

> **Important**: Public/unauthenticated access is disabled to ensure reliability and prevent IP bans. A dedicated API key is strictly required.

```bash
GOOGLE_PSI_API_KEY=your_google_api_key
```

## Usage

### Programmatic (npm package)

```javascript
const { analyzeWebsite, captureScreenshots, cfBrowserService } = require('@optimald/uilensai');

// Run a full website analysis
const results = await analyzeWebsite({
  url: 'https://example.com',
  modulesToRun: ['ui', 'performance', 'seoContent'],
  verbose: true,
  usePSI: true
});

// Access SEO/AEO/GEO intelligence
const seo = results.modules.seoContent;
console.log('GEO Score:', seo.geoAnalysis.overallGeoScore);
console.log('AEO Score:', seo.aeoAnalysis.overallScore);
console.log('Voice Search:', seo.voiceSearchOptimization.score);
console.log('Agent Ready:', seo.agentReadinessReport?.status);

// Capture screenshots only
const screenshots = await captureScreenshots({
  url: 'https://example.com',
  viewports: ['mobile', 'desktop'],
  fullPage: true
});

// Crawl a website via CF Browser Rendering
const crawlResults = await cfBrowserService.crawlWebsite('https://example.com', {
  limit: 10,
  depth: 2,
  verbose: true
});
```

### CLI

```bash
# Basic UI analysis
uilensai --url https://example.com --modules ui --testing

# Multi-module analysis
uilensai --url https://example.com --modules ui,performance,seoContent --analysis-depth comprehensive

# Full analysis with custom viewports
uilensai --url https://example.com --modules all --viewports mobile,tablet,desktop,ultrawide --analysis-depth deep
```

### CLI Options

```
  --url <url>                    URL to analyze (required)
  --modules <list>               Comma-separated modules to run (default: ui)
                                 Available: ui, performance, seoContent, security, privacy,
                                 compatibility, marketing, conversion, accessibility,
                                 siteHealth, all

  Model Options:
  --model <model_id>             Specific AI model ID to use
  --model-family <family>        Preferred AI provider: claude, openai, gemini, deepseek, xai, openrouter
  --model-strategy <strategy>    Model selection: single, specialized (default), consensus
  --max-tokens <number>          Max tokens for AI responses
  --testing                      Use cheapest model to save costs during development

  Analysis Options:
  --analysis-depth <level>       Depth: basic, comprehensive, deep
  --viewports <list>             Viewport presets: tiny-mobile, narrow-mobile, mobile, tablet,
                                 desktop, large, ultrawide, super-ultrawide
  --focus <list>                 (UI) Focus areas: branding, usability, accessibility, etc.
  --selector <css_selector>      (UI) Target specific component via CSS selector
  --full-page / --no-full-page   Full page capture (default: true)

  Protection & Capture:
  --stealth [level]              Bot detection bypass: basic, medium, advanced
  --disable-animations           Disable CSS animations (default: true)
  --capture-timeout <ms>         Capture timeout (default: 60000ms)
  --skip-domain-validation       Skip domain connectivity check
  --intelligent-bot-protection   Auto stealth escalation (default: true)
  --no-bot-protection            Disable bot protection system

  Output:
  --console-output               Print report to console
  --output-dir <directory>       Report output directory (default: ./storage/reports/)
  --report-format <format>       Report format: json (default), html, text
  --report-description <text>    Custom report description
  --verbose                      Enable verbose logging
```

## Available Modules

| Module | Key | Description |
|--------|-----|-------------|
| UI Analysis | `ui` | Visual hierarchy, consistency, usability, branding, aesthetics |
| Performance | `performance` | Core Web Vitals, resource loading, server configuration |
| SEO / AEO / GEO | `seoContent` | On-page SEO, content quality, technical SEO, schema markup, GEO citability, AEO snippet readiness, voice search, agent readiness |
| Security | `security` | SSL/TLS, security headers, CSP, form security, OWASP context |
| Privacy | `privacy` | Cookies, trackers, consent mechanisms, GDPR/CCPA compliance |
| Compatibility | `compatibility` | Cross-browser CSS/JS, responsive design, rendering consistency |
| Marketing | `marketing` | Brand consistency, CTAs, social media, analytics setup |
| Conversion | `conversion` | Funnel analysis, form usability, trust signals |
| Accessibility | `accessibility` | WCAG compliance, screen readers, keyboard nav, color contrast |
| Site Health | `siteHealth` | Link graph, broken links, redirect chains, duplicate content, orphan pages, crawl stats |

### SEO / AEO / GEO Output Fields

The `seoContent` module now includes the following enterprise intelligence fields:

| Field | Description |
|-------|-------------|
| `geoAnalysis.overallGeoScore` | Composite GEO score (0-100) averaging citability, ChatGPT, Perplexity, and Google AIO readiness |
| `geoAnalysis.platformReadiness` | Per-platform scores: `chatgpt`, `perplexity`, `googleAIO` |
| `geoAnalysis.citabilityScore` | How likely AI engines are to cite/quote this content |
| `geoAnalysis.brandAuthority` | Brand mention detection across LinkedIn, X, Yelp, BBB, schema.org |
| `geoAnalysis.contentStructure` | Question headings, citability blocks, word count analysis |
| `aeoAnalysis.overallScore` | Composite AEO score (0-100) for answer engine readiness |
| `aeoAnalysis.faqSchemaQuality` | FAQ, HowTo, QAPage schema detection and scoring |
| `aeoAnalysis.featuredSnippetReadiness` | Question heading analysis, definition patterns, optimal answer blocks |
| `aeoAnalysis.paaTargeting` | People Also Ask targeting: targetable questions and coverage |
| `aeoAnalysis.directAnswerDensity` | Ratio of concise answer blocks to headings |
| `voiceSearchOptimization` | Voice readiness score, speakable schema, conversational query analysis |
| `agentReadinessReport` | Raw isitagentready.com diagnostic (Level 1-5 assessment) |

### Module Status: Inconclusive

When a module runs but cannot produce trustworthy results, it returns `status: "Inconclusive"` with `score: null` and an `inconclusiveReason` explaining why. **UILensAI never fabricates scores.**

Common causes:
- **Performance:** PSI scored an HTTP error page as "perfect" (metrics are for the error response, not the site)
- **UI:** Screenshots captured a bot protection page instead of the actual site
- **Any module:** AI analysis returned implausible or contradictory data

Inconclusive modules are excluded from the overall report score. Consumers should display the `inconclusiveReason` to users instead of a numeric score.

## AI Providers

UILensAI supports six AI providers. Only one is required:

| Provider | Env Variable | Models |
|----------|-------------|--------|
| OpenRouter | `OPENROUTER_API_KEY` | Gemini 3.1 Flash Lite, Gemini 2.5 Flash, Qwen 2.5 VL 72B |
| Anthropic | `ANTHROPIC_API_KEY` | Claude 4.5/4 Opus, Sonnet, Haiku |
| OpenAI | `OPENAI_API_KEY` | GPT-5 series, o3, GPT-4o |
| Google | `GEMINI_API_KEY` | Gemini 2.5/2.0 Pro & Flash |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek-Reasoner, DeepSeek-Chat |
| xAI | `XAI_API_KEY` | Grok 4, Grok 2 |

## Project Structure

```
uilensai/
├── packages/
│   ├── cli/              # CLI entry point
│   └── worker/           # Analysis engine + CF API wrappers
│       └── uilensai/
│           ├── analyze/      # Analysis modules (ui.js, performance.js, seoContent.js, etc.)
│           ├── capture/      # Screenshot and data capture
│           ├── cli/          # Worker CLI
│           ├── config/       # Model defaults, presets
│           ├── report/       # Report generation + strategic insights
│           ├── schemas/      # JSON report schema (report-schema.json)
│           ├── services/     # CF Browser Rendering + Screenshot services
│           └── utils/        # AI model clients, scoring engine, credentials
└── package.json          # Root package (@optimald/uilensai)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API key errors | Verify `.env` file has correct keys with available quota |
| Timeouts on large sites | Increase `--capture-timeout` value |
| Bot detection blocking | Use `--stealth advanced` |
| CF screenshot failures | Check `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN` are set |
| 403 on crawled sites | Crawler auto-falls back to Playwright; verify CF Browser Rendering quota |
| Circuit breaker open | AI provider rate limited — system will retry with fallback models |

## License

[MIT](LICENSE) © [OptimalD](https://github.com/optimald)
