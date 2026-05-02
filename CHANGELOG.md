# Changelog

All notable changes to this project will be documented in this file.

## [1.3.29] - 2026-05-02

### Added
- **Open Source Release:** Published UILensAI under AGPL-3.0 license with full GitHub community infrastructure.
- **Site Health Module (10th Module):** New `siteHealth` analysis module extending UILensAI from single-page to full-site analysis. Consumes Cloudflare crawl results and produces link graph analysis (internal link adjacency, inlink/outlink counts, depth mapping), broken link detection via HTTP HEAD validation, redirect chain mapping (301→302→200), duplicate content detection using SimHash near-duplicate algorithm, orphan page identification (zero-inlink pages), and comprehensive crawl stats (status distribution, average response time).
- **GitHub Community Files:** Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE` (AGPL-3.0), and issue templates (`bug_report.md`, `feature_request.md`).

### Changed
- **README:** Updated module count from nine to ten, added `siteHealth` to CLI `--modules` documentation and available modules table.
- **Security Audit:** Removed test files containing hardcoded API keys from public repository. Cleaned release scripts, smoke tests, and sample report data from published package.

### Removed
- **Test/Debug Files:** Removed `run-medspa-scan.js`, `scripts/cf-smoke-test.js`, `scripts/client-integration-test.js`, `scripts/verify-release.js`, and `.agents/workflows/pre-release-audit.md` from public release.
- **Sample Data:** Removed embedded sample report JSON (`webevo-report-morganandmorgan-com-2026-03-17.json`) from repository.

## [1.3.28] - 2026-04-25

### Added
- **GEO Analysis (Generative Engine Optimization):** Full implementation with evidence-based scoring for AI/LLM citability, per-platform readiness (ChatGPT, Perplexity, Google AI Overview), brand authority detection, content structure analysis, and actionable GEO recommendations.
- **AEO Analysis (Answer Engine Optimization):** FAQ schema quality scoring, featured snippet readiness, People Also Ask (PAA) targeting analysis, direct answer density measurement, and AEO-specific recommendations.
- **Voice Search Optimization:** Populated with evidence-based scoring including speakable schema detection, conversational query coverage, and intent alignment analysis. Previously always returned `null`.
- **Agent Readiness Persistence:** `agentReadinessReport` field persists the raw isitagentready.com MCP diagnostic as a first-class output field (source, rawReport, timestamp, status).
- **GEO/AEO Score Integration:** GEO and AEO scores now factor into the `seoContent` module score at 5% weight each (metadata reduced from 20%→15%, content from 35%→30%).

### Changed
- **README:** Rewritten for v1.3.28 with AEO/GEO documentation, output field reference table, and updated module descriptions.
- **Module Display Name:** `seoContent` module described as "SEO / AEO / GEO" in documentation and reporting.
- **Scoring Engine:** Updated `seoContent` score composition to incorporate GEO and AEO sub-scores with weighted blending.

### Fixed
- **isItAgentReady Timeout:** Increased MCP endpoint timeout from 15s→30s. The scan takes 7-20 seconds depending on load; previous timeout caused false failures.
- **GEO Brand Authority Crash:** Fixed `.some() is not a function` crash when `extractedElements.links.external` was not an array. Added `Array.isArray` guard.
- **Voice Search Schema Crash:** Fixed potential crash when `extractedElements.schemaMarkup` was not an array.
- **Crawler Resilience (403 Fix):** `seoContent.js` now triggers Playwright-based browser fallback when HTTP fetch returns 403 Forbidden (Cloudflare challenge pages).
- **robots.txt False Negative:** Fixed detection logic to correctly identify robots.txt on Cloudflare-protected sites by using browser fallback.
- **HTTP Fallback Headers:** Implemented rotating User-Agents and modern browser headers to improve crawler stealth.

### Schema
- Added `aeoAnalysis` schema definition (overallScore, faqSchemaQuality, featuredSnippetReadiness, paaTargeting, directAnswerDensity, recommendations).
- Added `agentReadinessReport` schema definition (source, rawReport, retrievedAt, status).
- Expanded `geoAnalysis` with `contentStructure`, `overallGeoScore`, and `recommendations` sub-schemas.

## [1.3.27] - 2026-04-25

### Added
- **Audit Director Persona:** New cross-module validation agent (Audit Director) runs after all modules complete, detecting logical contradictions between module outputs and applying evidence-based corrections.
- **Evidence Registry Expansion:** `buildEvidenceRegistry()` now collects 100+ deterministic signals from raw HTML for injection into AI prompts and cross-module validation.
- **Cross-Module Validator:** `agents/cross-module-validator.js` validates consistency across module scores, detects contradictions (e.g., Security reports failure while other modules succeed), and applies suppressions for false-positive issues.

### Changed
- **Gold Standard Scrubber:** `result-scrubber.js` now runs before the Audit Director to clean meta-data and obvious contradictions before cross-module validation.
- **Module Reconciliation:** Post-execution reconciliation layer detects when Security reports critical TLS/connectivity failure but other modules succeed, flagging the logical contradiction.

## [1.3.26] - 2026-04-25

### Added
- **Strategic Insights Architecture:** Migrated all enterprise-grade intelligence to root-level `strategicInsights` array, replacing the legacy `crossModuleInsights` key.
- **Cross-Page SEO Analysis:** New `crossPageSeo` field analyzing crawled pages for site-wide SEO issues (duplicate titles, thin content, mixed HTTP/HTTPS, status code errors).
- **isItAgentReady.com Integration:** MCP endpoint query injected as AI prompt context for agent-readiness-aware analysis.
- **GEO Analysis Stub:** Initial `geoAnalysis` schema and stub implementation (citability, platform readiness, brand authority).

### Changed
- **CEO Verdict & Debate Protocol:** AI orchestration now writes directly to `strategicInsights` instead of deprecated `crossModuleInsights`.
- **Enterprise Data Generator:** Updated to resolve schemas and push results to the new `strategicInsights` key.

### Fixed
- **Crawler Resilience (403 Fix):** `seoContent.js` now triggers Playwright-based browser fallback when HTTP fetch returns 403 Forbidden (Cloudflare challenge pages).
- **robots.txt False Negative:** Fixed detection logic to correctly identify robots.txt on Cloudflare-protected sites by using browser fallback.
- **HTTP Fallback Headers:** Implemented rotating User-Agents and modern browser headers to improve crawler stealth.

## [1.3.25] - 2026-04-24

### Improved
- **Two-Pass AI Pipeline:** All modules now use a two-pass analysis model (evidence extraction → expert judgment) which significantly reduces generic output.
- **Mastra Agent Integration:** Expert persona agents (Victoria Sterling CEO, Lukas Braun Privacy, Marcus Chen Performance) provide domain-specific judgment in Pass 2.
- **Evidence Registry:** Centralized signal collection (`EvidenceRegistry`) now builds 100+ deterministic signals per scan for prompt injection.

### Fixed
- **Hreflang False Positives:** Ground-truth filter suppresses hreflang issues for single-language sites.
- **Canonical URL Override:** AI canonical detection overridden by ground truth when canonical tag is not found in DOM.

## [1.3.24] - 2026-04-22

### Added
- **Deterministic Scoring Composition:** New `composeDeterministicAndAiScore()` function blends observable signals with AI-derived scores for reproducible results between runs.
- **Collected Signals (`_collectedSignals`):** Each module now attaches deterministic signals used for base score calculation.
- **Scoring Transparency:** `_scoreMetrics` metadata attached to each module output showing deterministic base, AI score, and blending weight.

### Changed
- **Deterministic Weights:** Security 60%, Performance 80%, SEO 50%, Accessibility 40%, Privacy 40%, UI/Compat/Marketing/Conversion 30%.

## [1.3.23] - 2026-04-21

### Added
- **CF HTML Extractor Expansion:** Comprehensive browser-free analysis extracting privacy, accessibility, compatibility, security, and marketing signals directly from HTML.
- **CTA/Trust/EAT Evidence:** Deterministic extraction of CTAs, trust signals, and E-A-T indicators from DOM structure.
- **Persuasion Signals:** Urgency, scarcity, social proof, and risk reversal detection from page content.

### Improved
- **Evidence-Based Prompts:** AI prompts now include pre-executed evidence blocks from 100+ deterministic signals, dramatically reducing hallucination.

## [1.3.22] - 2026-04-18

### Added
- **Citability Blocks:** Content analysis now identifies self-contained paragraphs optimal for AI citation (134-167 words).
- **AI Readiness Analysis:** Detects llms.txt, llms-full.txt, AI bot policies, speakable markup, and AI-facing content links.
- **AI Bot Policy Detection:** Identifies explicit rules for GPTBot, ClaudeBot, Google-Extended, and other AI crawlers in robots.txt.

## [1.3.21] - 2026-04-15

### Improved
- **Circuit Breaker Enhancements:** Model-level circuit breakers with automatic fallback chains prevent cascade failures during AI provider outages.
- **Cost Estimator:** Fallback pricing for unrecognized OpenRouter models prevents cost tracking gaps.

## [1.3.20] - 2026-04-10

### Changed
- **Model Configuration:** `getModelConfig()` now supports per-module model overrides via `modules.*` config keys, enabling specialized model selection per analysis type.
- **OpenRouter Model Routing:** Primary routing through `google/gemini-3.1-flash-lite-preview` with automatic fallback to `google/gemini-2.5-flash` and `google/gemini-2.5-flash-lite`.

## [1.3.19] - 2026-03-21

### Changed
- **OpenRouter-Only AI Pipeline**: Consolidated all AI model calls to route exclusively through OpenRouter. Deleted individual provider files (`claude.js`, `deepseek.js`, `gemini.js`, `openai.js`, `xai.js`). Removed `model-availability-checker.js`.
- **Dynamic Model Selection**: New `dynamic-model-selector.js` queries OpenRouter's live `/api/v1/models` API to automatically select the cheapest qualifying model per task category (industry detection, standard analysis, complex analysis, vision, recommendations). Results cached for 1 hour with hardcoded fallbacks.
- **AI Credentials Simplified**: `ai-credentials.js` streamlined to work with OpenRouter-only pipeline and dynamic model selection.
- **Model Defaults Refactored**: `model-defaults.js` rewritten to support dynamic model resolution with `getModelConfigAsync()` and automatic cache reset between scans.

### Improved
- **JSON Normalizer Overhaul**: `jsonNormalizer.js` massively expanded (+1,800 lines) with robust AI output parsing, repair, and validation for all analysis modules.
- **Report Generator Overhaul**: `report/index.js` expanded (+1,000 lines) for richer report assembly with enhanced cross-module insights.
- **HTML Extractor Expansion**: `cfHtmlExtractor.js` expanded (+1,200 lines) for comprehensive browser-free analysis supporting serverless execution.
- **Module Updates**: All 10 analysis modules (accessibility, compatibility, conversion, marketing, performance, privacy, security, seoContent, siteHealth, UI) updated for the new AI pipeline with improved prompt engineering and error handling.
- **Recommendation Engine**: `generator.js` and `normalizer.js` improved for more reliable DOM-mapped recommendations.
- **JSON Repair**: Enhanced `json-repair.js` for better recovery of malformed AI responses.

### Fixed
- **Circuit Breaker**: Extended with additional tracking fields for improved reliability monitoring.
- **Prompt Templates**: Updated `promptTemplates.js` and shared prompts for stricter AI output formatting.

## [1.3.18] - 2026-03-21

### Fixed
- **NPM Package Completeness**: Added missing `ai-providers/`, `prompts/`, `recommendations/`, `data-collectors/`, and `presets/` directories to `package.json` files array, fixing `MODULE_NOT_FOUND` errors in consuming applications.

## [1.3.17] - 2026-03-21

### Fixed
- **JSON Schema Validation**: Updated `report-schema.json` to properly declare `Draft 2020-12` as the spec, resolving runtime validation warnings.
- **Robust DOM Matching**: Fixed bugs where legitimate semantic tags (`html`, `body`, `nav`, `h1`-`h6`, etc.) were stripped from AI recommendations.
  - Corrected `normalizer.js` to gracefully parse array-of-strings fallback structures from AI.
  - Adjusted `jsonNormalizer.js` rules to exempt valid HTML structural tags from aggressive hallucination length-filters.
  - Resolved `substring` `TypeError` crashes during recommendation generation when the AI failed to provide a description text.

## [1.3.16] - 2026-03-17

### Changed
- **Admin-Only Cost Tracking (`_adminMeta`)**: AI cost data is no longer included in the client-facing report payload. Instead, `analyzeWebsite()` returns cost data under a separate `_adminMeta` field containing `totalCostUSD`, `costBreakdown`, `aiCallCount`, and per-call `costs`. API callers (e.g. WebEvo) should extract `_adminMeta`, store it server-side for admin dashboards, and **strip it** before sending the report to clients. This prevents savvy users from seeing cost data in network requests.

### Removed
- **`estimatedAnalysisCost`**: Removed from report schema and report generation (v1.3.14).
- **`costAggregator` in payload**: Raw cost aggregator object no longer spread into the public return value (v1.3.15).

## [1.3.12] - 2026-03-17

### Fixed
- **AI Model Standardization**: Replaced all Gemini and DeepSeek models with Qwen `qwen-2.5-72b-instruct` and `qwen-2.5-vl-72b-instruct` via OpenRouter for enhanced reliability, cost efficiency, and performance.
- **Strict Specificity Enforcement**: Globally enforced strict anti-generic instructions for all analysis modules (Performance, SEO, etc.) via `promptTemplates.js`. AI outputs will now prioritize pixel-precise measurements, real DOM selectors, and actual metrics over lazy filler phrases like "Requires optimization".

## [1.3.6] - 2026-03-17

### Removed
- **Stale `packages/core` directory**: Eliminated the legacy copy that diverged from `packages/worker`. 88 files, 64,122 lines removed. Tarball shrunk from 181 → 102 files.
- Updated `test`, `install:all` scripts and `client-integration-test.js` to reference `packages/worker`.

## [1.3.5] - 2026-03-17

### Fixed
- **Screenshot embedding at capture source**: `cfScreenshotService.captureScreenshot()` now returns `screenshotDataUri` (`data:image/png;base64,...`) alongside the local path. The buffer is already in memory after the Cloudflare API call — zero extra I/O.
- `cli.js` passes full screenshot result objects to `analyzeWebsite()` instead of stripping to paths.
- `ui.js` carries `screenshotDataUri` through the analysis chain and uses it for `viewportDetail.screenshot`, with disk-read fallback.

## [1.3.4] - 2026-03-17

### Fixed
- Applied screenshot base64 embedding fix to both `packages/core` and `packages/worker` copies of `ui.js`.
- Synced `packages/core/package.json` version (was stuck at 1.3.1).

## [1.3.3] - 2026-03-17

### Fixed
- Moved screenshot base64 embedding from CLI-only post-processing (`cli.js`) into `analyzeSingleViewportScreenshot()` in `ui.js`, so API callers like WebEvo get renderable image data.

## [1.3.2] - 2026-03-17

### Fixed
- Initial fix for screenshots not appearing in webhook payload. Embedded base64 data URIs in `cli.js` post-processing step after `analyzeWebsite()` returns.

## [1.0.0] - 2026-03-14

### Added
- **Performance Reliability**: Added a strict requirement for `GOOGLE_PSI_API_KEY`. Unauthenticated public access to the PageSpeed Insights API caused sporadic `FAILED_DOCUMENT_REQUEST` errors due to strict WAF bot protections against Google's public IP pool. Providing an API key is now mandatory.
- **Inconclusive Scoring Pattern**: If a module (like Performance) receives corrupted or blocked data from a firewall, it will safely return a `null` score and an `"Inconclusive"` status with a detailed reason, rather than returning fabricated or misleading results.
- **Cost Optimizer Fix**: AI models using OpenRouter aliases (e.g., `deepseek-chat-v3`) now correctly route to their ultra-low token pricing structures instead of falling back to default GPT-4 equivalent pricing. This lowers the actual API cost of a complete 9-module DeepSeek scan to <$0.01.
- **Automated Fallbacks**: The PageSpeed Insights executor will automatically attempt a `desktop` strategy analysis, and cleanly retry with `mobile` if blocked by a user-agent specific WAF rule.