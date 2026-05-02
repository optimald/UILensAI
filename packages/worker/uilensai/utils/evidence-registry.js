/**
 * Evidence Registry — Typed, Keyed Signal Map
 * ============================================
 *
 * Converts cfHtmlExtractor outputs into a flat registry of typed evidence signals.
 * Each signal has: value, confidence (0-1), source, and optionally `applicable`.
 *
 * This is the SINGLE SOURCE OF TRUTH for all downstream agent tool calls.
 * Agents can ONLY cite evidence that exists in this registry.
 *
 * Usage:
 *   const { buildEvidenceRegistry } = require('./evidence-registry');
 *   const registry = buildEvidenceRegistry(rawHtml, url, { verbose: true });
 *   const lang = registry.get('a11y.htmlLang');
 *   // => { value: 'en', confidence: 1, source: 'html-attr' }
 */

const {
    extractSharedContextFromHtml,
    extractPrivacySignalsFromHtml,
    extractAccessibilitySignalsFromHtml,
    extractCompatibilitySignalsFromHtml,
    extractSecuritySignalsFromHtml,
    extractMarketingSignalsFromHtml,
    extractCTAContextFromHtml,
    extractTrustSignalsFromHtml,
    extractLeadCaptureFromHtml,
    extractEATSignalsFromHtml,
} = require('./cfHtmlExtractor');

// ============================================================================
// Signal helpers
// ============================================================================

/** Standard signal shape */
function sig(value, opts = {}) {
    return {
        value,
        confidence: opts.confidence ?? 1.0,
        source: opts.source || 'html-parse',
        applicable: opts.applicable !== undefined ? opts.applicable : true,
        ...(opts.reason ? { reason: opts.reason } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
        ...(opts.metric ? { metric: opts.metric } : {}),
        ...(opts.link ? { link: opts.link } : {}),
        ...(opts.details ? { details: opts.details } : {}),
    };
}

// ============================================================================
// Evidence Registry Class
// ============================================================================

class EvidenceRegistry {
    constructor() {
        /** @type {Map<string, object>} */
        this._signals = new Map();
        this._metadata = {
            builtAt: new Date().toISOString(),
            signalCount: 0,
        };
    }

    /** Set a signal */
    set(key, signal) {
        this._signals.set(key, signal);
        this._metadata.signalCount = this._signals.size;
    }

    /** Get a single signal by key */
    get(key) {
        return this._signals.get(key) || null;
    }

    /** List all signals in a category (e.g., 'a11y', 'privacy') */
    listCategory(category) {
        const prefix = category + '.';
        const results = [];
        for (const [key, val] of this._signals) {
            if (key.startsWith(prefix)) {
                results.push({ key, ...val });
            }
        }
        return results;
    }

    /** Get all signal keys */
    keys() {
        return Array.from(this._signals.keys());
    }

    /** Get full registry as plain object (for serialization) */
    toJSON() {
        const obj = {};
        for (const [key, val] of this._signals) {
            obj[key] = val;
        }
        obj._metadata = this._metadata;
        return obj;
    }

    /** Number of signals */
    get size() {
        return this._signals.size;
    }

    /**
     * Pre-execute ALL evidence into a structured text block for prompt injection.
     *
     * This REPLACES tool-calling. Instead of hoping the LLM calls our tools
     * mid-generation, we deterministically serialize all verified evidence
     * into a format the agent can directly reference.
     *
     * Groups signals by category, marks non-applicable signals, and includes
     * platform rules.
     *
     * @param {Object} [options]
     * @param {string[]} [options.categories] - Only include these categories (default: all)
     * @param {boolean} [options.includeNonApplicable=true] - Include non-applicable signals with warnings
     * @returns {string} Structured evidence block for prompt injection
     */
    toEvidenceBlock(options = {}) {
        const { categories, includeNonApplicable = true } = options;

        const lines = [];
        lines.push('=== VERIFIED EVIDENCE (ground-truth from HTML extraction) ===');
        lines.push(`Source: ${this._metadata.url || 'unknown'}`);
        lines.push(`Platform: ${this._metadata.platform || 'unknown'}`);
        lines.push(`Signals: ${this.size}`);
        lines.push('');

        // Group signals by category
        const grouped = {};
        for (const [key, signal] of this._signals) {
            const category = key.split('.')[0];
            if (categories && !categories.includes(category)) continue;
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push({ key, ...signal });
        }

        for (const [category, signals] of Object.entries(grouped)) {
            lines.push(`── ${category.toUpperCase()} ──`);

            for (const s of signals) {
                const applicableTag = s.applicable === false ? ' [NOT APPLICABLE]' : '';
                const value = this._formatValue(s.value);
                const confidence = s.confidence < 1 ? ` (confidence: ${Math.round(s.confidence * 100)}%)` : '';

                lines.push(`  ${s.key}: ${value}${confidence}${applicableTag}`);

                if (s.applicable === false && s.reason && includeNonApplicable) {
                    lines.push(`    ⚠ ${s.reason}`);
                }
            }
            lines.push('');
        }

        // Platform applicability rules
        const platformRules = this.get('platform.rules');
        if (platformRules?.value && Object.keys(platformRules.value).length > 0) {
            lines.push('── PLATFORM RULES (suppress these findings) ──');
            for (const [signalKey, reason] of Object.entries(platformRules.value)) {
                lines.push(`  ✕ ${signalKey}: ${reason}`);
            }
            lines.push('');
        }

        lines.push('=== END EVIDENCE ===');
        lines.push('CRITICAL: Base ALL findings on the evidence above. Do NOT fabricate data not present here.');
        lines.push('If a signal is marked [NOT APPLICABLE], do NOT penalize the site for that signal.');

        return lines.join('\n');
    }

    /**
     * Format a value for human-readable display in evidence blocks.
     * @private
     */
    _formatValue(value) {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'boolean') return value ? 'YES' : 'NO';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'string') return value.length > 120 ? value.substring(0, 120) + '…' : (value || '(empty)');
        if (Array.isArray(value)) {
            if (value.length === 0) return '(none)';
            if (value.length <= 5) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
            return `[${value.length} items]: ${value.slice(0, 3).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')}…`;
        }
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    /**
     * Compact JSON for Audit Director — structured data, not prompt text.
     * Returns only applicable signals with values.
     * @returns {Object}
     */
    toCompactJSON() {
        const result = {};
        for (const [key, signal] of this._signals) {
            if (key === 'platform.rules') continue; // separate
            result[key] = {
                v: signal.value,
                c: signal.confidence,
                a: signal.applicable !== false,
            };
        }
        result._platform = this._metadata.platform || null;
        result._signalCount = this.size;
        return result;
    }
}

// ============================================================================
// Registry Builder
// ============================================================================

/**
 * Build a complete evidence registry from raw HTML.
 *
 * Runs all cfHtmlExtractor functions and maps their outputs
 * into flat, typed, keyed signals.
 *
 * @param {string} rawHtml - Full page HTML
 * @param {string} url - Page URL
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {Object} [options.sharedPageContext] - Pre-extracted shared context (skip re-extraction)
 * @returns {EvidenceRegistry}
 */
function buildEvidenceRegistry(rawHtml, url, options = {}) {
    const { verbose = false, sharedPageContext } = options;
    const registry = new EvidenceRegistry();

    if (!rawHtml || rawHtml.length < 50) {
        if (verbose) console.log('[EvidenceRegistry] ⚠️ No HTML provided — returning empty registry');
        return registry;
    }

    const startTime = Date.now();

    // ── 1. Shared Context ─────────────────────────────────────────────
    const shared = sharedPageContext || extractSharedContextFromHtml(rawHtml, url);

    registry.set('meta.title', sig(shared.title || '', { source: 'html-tag' }));
    registry.set('meta.description', sig(shared.metaDescription || '', { source: 'html-meta' }));
    registry.set('meta.keywords', sig(shared.metaKeywords || '', { source: 'html-meta' }));
    registry.set('meta.canonical', sig(shared.canonicalUrl || '', { source: 'html-link' }));
    registry.set('meta.viewport', sig(shared.viewportMeta || '', { source: 'html-meta' }));
    registry.set('meta.htmlLang', sig(shared.htmlLang || '', { source: 'html-attr' }));

    // Open Graph
    if (shared.ogData) {
        registry.set('meta.og.title', sig(shared.ogData.title || '', { source: 'html-meta' }));
        registry.set('meta.og.description', sig(shared.ogData.description || '', { source: 'html-meta' }));
        registry.set('meta.og.image', sig(shared.ogData.image || '', { source: 'html-meta' }));
    }

    // Headings
    if (shared.headings) {
        registry.set('content.h1', sig(shared.headings.h1 || [], { source: 'html-tag' }));
        registry.set('content.h1Count', sig((shared.headings.h1 || []).length, { source: 'html-tag' }));
        registry.set('content.h2', sig(shared.headings.h2 || [], { source: 'html-tag' }));
        registry.set('content.h3Count', sig(shared.headings.h3Count || 0, { source: 'html-tag' }));
    }

    // Links
    if (shared.links) {
        registry.set('content.links.internal', sig(shared.links.internal || 0, { source: 'html-tag' }));
        registry.set('content.links.external', sig(shared.links.external || 0, { source: 'html-tag' }));
        registry.set('content.links.total', sig(shared.links.total || 0, { source: 'html-tag' }));
    }

    // Forms
    registry.set('content.forms', sig(shared.forms || [], { source: 'html-tag' }));
    registry.set('content.formCount', sig((shared.forms || []).length, { source: 'html-tag' }));

    // Resources
    if (shared.resources) {
        registry.set('content.scriptCount', sig(shared.resources.scriptCount || 0, { source: 'html-tag' }));
        registry.set('content.stylesheetCount', sig(shared.resources.stylesheetCount || 0, { source: 'html-tag' }));
    }

    // Images
    if (shared.images) {
        registry.set('content.images.total', sig(shared.images.total || 0, { source: 'html-tag' }));
        registry.set('content.images.withAlt', sig(shared.images.withAlt || 0, { source: 'html-tag' }));
    }

    // Social Media
    if (shared.socialMedia) {
        registry.set('marketing.socialPlatforms', sig(shared.socialMedia.linkedPlatforms || [], { source: 'html-link' }));
        registry.set('marketing.sharingButtons', sig(shared.socialMedia.sharingButtonsDetected || false, { source: 'html-link' }));
        registry.set('marketing.ogTags', sig(shared.socialMedia.ogTagsPresent || false, { source: 'html-meta' }));
        registry.set('marketing.twitterCard', sig(shared.socialMedia.twitterCardPresent || false, { source: 'html-meta' }));
    }

    // Body text word count
    const bodyText = shared.bodyText || '';
    registry.set('content.bodyWordCount', sig(bodyText.split(/\s+/).filter(Boolean).length, { source: 'html-body' }));

    // ── 2. Privacy Signals ────────────────────────────────────────────
    const privacy = extractPrivacySignalsFromHtml(rawHtml, url, verbose);

    // Platform detection (from privacy extractor)
    const platform = privacy.platformDetected || null;
    registry.set('platform', sig(platform, {
        source: 'html-pattern',
        confidence: platform ? 0.95 : 0,
    }));

    // Consent
    registry.set('privacy.consentBanner', sig(privacy.consent?.bannerDetected || false, {
        source: 'html-script+dom',
        provider: (privacy.consent?.managersDetected || [])[0] || null,
        details: privacy.consent?.managersDetected || [],
    }));
    registry.set('privacy.consentAcceptAll', sig(privacy.consent?.hasAcceptAll || false, { source: 'html-text' }));
    registry.set('privacy.consentRejectAll', sig(privacy.consent?.hasRejectAll || false, { source: 'html-text' }));
    registry.set('privacy.consentGranular', sig(privacy.consent?.hasGranularOptions || false, { source: 'html-text' }));

    // Privacy policy
    registry.set('privacy.policyFound', sig(privacy.privacyPolicy?.found || false, {
        source: 'html-link',
        link: privacy.privacyPolicy?.link || null,
    }));

    // Trackers
    registry.set('privacy.trackerCount', sig(privacy.trackers?.count || 0, {
        source: 'html-script',
        details: privacy.trackers?.detected || [],
    }));
    registry.set('privacy.externalDomains', sig(privacy.trackers?.externalDomainCount || 0, {
        source: 'html-script',
        details: (privacy.trackers?.externalDomains || []).slice(0, 15),
    }));

    // Data collection
    registry.set('privacy.piiFieldCount', sig(privacy.dataCollection?.piiFieldCount || 0, { source: 'html-form' }));
    registry.set('privacy.hasEmailCapture', sig(privacy.dataCollection?.hasEmailCapture || false, { source: 'html-form' }));
    registry.set('privacy.hasPasswordField', sig(privacy.dataCollection?.hasPasswordField || false, { source: 'html-form' }));

    // Third-party iframes
    registry.set('privacy.thirdPartyIframeCount', sig(privacy.thirdPartyIframes?.count || 0, { source: 'html-iframe' }));

    // ── 3. Accessibility Signals ──────────────────────────────────────
    const a11y = extractAccessibilitySignalsFromHtml(rawHtml, verbose);

    const isWix = platform === 'Wix';

    // Language
    registry.set('a11y.htmlLang', sig(a11y.language?.lang || '', {
        source: 'html-attr',
        applicable: true,
    }));
    registry.set('a11y.htmlDir', sig(a11y.language?.dir || '', { source: 'html-attr' }));

    // Skip navigation — mark not-applicable on Wix (Shadow DOM)
    registry.set('a11y.skipNav', sig(a11y.skipNavigation?.present || false, {
        source: 'html-dom',
        applicable: !isWix,
        reason: isWix ? 'Wix uses Shadow DOM for skip-nav — not extractable from static HTML' : undefined,
    }));

    // Images
    registry.set('a11y.images.total', sig(a11y.images?.total || 0, { source: 'html-tag' }));
    registry.set('a11y.images.withAlt', sig(a11y.images?.withAlt || 0, { source: 'html-tag' }));
    registry.set('a11y.images.missingAlt', sig(a11y.images?.missingAlt || 0, { source: 'html-tag' }));
    registry.set('a11y.images.emptyAlt', sig(a11y.images?.emptyAlt || 0, { source: 'html-tag' }));

    // Form labels — mark not-applicable on Wix
    const totalInputs = a11y.forms?.totalInputs || 0;
    const labeledInputs = (a11y.forms?.withExplicitLabel || 0) + (a11y.forms?.withAriaLabel || 0);
    const labelCoverage = totalInputs > 0 ? labeledInputs / totalInputs : 1;

    registry.set('a11y.formLabels.total', sig(totalInputs, { source: 'html-form' }));
    registry.set('a11y.formLabels.labeled', sig(labeledInputs, { source: 'html-form' }));
    registry.set('a11y.formLabels.unlabeled', sig(a11y.forms?.withoutLabel || 0, { source: 'html-form' }));
    registry.set('a11y.formLabels.coverage', sig(Math.round(labelCoverage * 100) / 100, {
        source: 'html-form',
        metric: 'ratio',
        applicable: !isWix,
        reason: isWix ? 'Wix uses Shadow DOM for form components — label extraction unreliable' : undefined,
    }));

    // ARIA
    registry.set('a11y.aria.elementCount', sig(a11y.aria?.elementCount || 0, { source: 'html-attr' }));
    registry.set('a11y.aria.landmarkCount', sig(a11y.aria?.landmarkCount || 0, { source: 'html-attr' }));
    registry.set('a11y.aria.hasMain', sig(a11y.aria?.hasMain || false, { source: 'html-tag+attr' }));
    registry.set('a11y.aria.hasNav', sig(a11y.aria?.hasNav || false, { source: 'html-tag+attr' }));
    registry.set('a11y.aria.hasFooter', sig(a11y.aria?.hasFooter || false, { source: 'html-tag+attr' }));

    // Headings
    registry.set('a11y.headings.total', sig(a11y.headings?.total || 0, { source: 'html-tag' }));
    registry.set('a11y.headings.h1Count', sig(a11y.headings?.h1Count || 0, { source: 'html-tag' }));
    registry.set('a11y.headings.skippedLevels', sig(a11y.headings?.skippedLevels || [], { source: 'html-tag' }));
    registry.set('a11y.headings.emptyCount', sig(a11y.headings?.emptyHeadings || 0, { source: 'html-tag' }));

    // Tabindex
    registry.set('a11y.tabindex.positiveCount', sig(a11y.tabindex?.positive || 0, { source: 'html-attr' }));
    registry.set('a11y.tabindex.negativeCount', sig(a11y.tabindex?.negative || 0, { source: 'html-attr' }));

    // Links
    registry.set('a11y.links.genericText', sig(a11y.links?.genericText || 0, { source: 'html-text' }));
    registry.set('a11y.links.emptyText', sig(a11y.links?.emptyText || 0, { source: 'html-text' }));

    // Media
    registry.set('a11y.media.videoCount', sig(a11y.media?.videos || 0, { source: 'html-tag' }));
    registry.set('a11y.media.videosWithCaptions', sig(a11y.media?.videosWithCaptions || 0, { source: 'html-tag' }));
    registry.set('a11y.media.audioCount', sig(a11y.media?.audios || 0, { source: 'html-tag' }));

    // ── 4. Compatibility Signals ──────────────────────────────────────
    const compat = extractCompatibilitySignalsFromHtml(rawHtml, verbose);

    // Viewport
    registry.set('compat.viewport.present', sig(!!compat.responsive?.viewportMeta, { source: 'html-meta' }));
    registry.set('compat.viewport.value', sig(compat.responsive?.viewportMeta || '', { source: 'html-meta' }));

    // CSS features
    if (compat.css) {
        registry.set('compat.css.grid', sig(compat.css.usesGrid || false, { source: 'css-parse' }));
        registry.set('compat.css.flexbox', sig(compat.css.usesFlexbox || false, { source: 'css-parse' }));
        registry.set('compat.css.customProperties', sig(compat.css.usesCustomProperties || false, { source: 'css-parse' }));
        registry.set('compat.css.containerQueries', sig(compat.css.usesContainerQueries || false, { source: 'css-parse' }));
        registry.set('compat.css.mediaQueries', sig(compat.css.mediaQueryCount || 0, { source: 'css-parse' }));
    }

    // JS features
    if (compat.js) {
        registry.set('compat.js.es6Modules', sig(compat.js.usesES6Modules || false, { source: 'html-script' }));
        registry.set('compat.js.asyncDefer', sig(compat.js.usesAsyncDefer || false, { source: 'html-script' }));
    }

    // Responsive
    if (compat.responsive) {
        registry.set('compat.responsive.mediaQueryCount', sig(compat.responsive.mediaQueryCount || 0, { source: 'css-parse' }));
        registry.set('compat.responsive.hasBreakpoints', sig((compat.responsive.mediaQueryCount || 0) >= 2, { source: 'css-parse' }));
    }

    // ── 5. Security Signals ───────────────────────────────────────────
    const security = extractSecuritySignalsFromHtml(rawHtml, verbose);

    registry.set('security.formsSummary', sig(security.forms || [], { source: 'html-form' }));
    registry.set('security.externalScripts', sig(security.externalScripts || [], { source: 'html-script' }));
    registry.set('security.metaCsp', sig(security.metaCSP || null, { source: 'html-meta' }));
    registry.set('security.subresourceIntegrity', sig(security.subresourceIntegrity || {}, { source: 'html-attr' }));

    // ── 6. Marketing Signals ──────────────────────────────────────────
    const marketing = extractMarketingSignalsFromHtml(rawHtml, url, verbose);

    registry.set('marketing.analytics', sig(marketing.analytics || [], { source: 'html-script' }));
    registry.set('marketing.tagManagers', sig(marketing.tagManagers || [], { source: 'html-script' }));
    registry.set('marketing.pixels', sig(marketing.pixels || [], { source: 'html-script' }));
    registry.set('marketing.emailPlatforms', sig(marketing.emailPlatforms || [], { source: 'html-script' }));
    registry.set('marketing.chatWidgets', sig(marketing.chatWidgets || [], { source: 'html-script' }));
    registry.set('marketing.schemaTypes', sig(marketing.schemaTypes || [], { source: 'json-ld' }));

    // ── 7. CTA Signals ────────────────────────────────────────────────
    const cta = extractCTAContextFromHtml(rawHtml, verbose);

    registry.set('conversion.ctaCount', sig(cta.ctaCount || 0, { source: 'html-dom' }));
    registry.set('conversion.primaryCta', sig(cta.primaryCta || null, { source: 'html-dom' }));
    registry.set('conversion.ctaTexts', sig((cta.ctaButtons || []).map(b => b.text).slice(0, 10), { source: 'html-dom' }));
    registry.set('conversion.aboveFoldCta', sig(cta.aboveFoldCta || false, { source: 'html-dom', confidence: 0.7 }));

    // ── 8. Trust Signals ──────────────────────────────────────────────
    const trust = extractTrustSignalsFromHtml(rawHtml, verbose);

    registry.set('conversion.trustSignals', sig(trust.signals || [], { source: 'html-dom' }));
    registry.set('conversion.trustSignalCount', sig(trust.count || 0, { source: 'html-dom' }));
    registry.set('conversion.testimonials', sig(trust.testimonials || false, { source: 'html-dom' }));
    registry.set('conversion.certBadges', sig(trust.certBadges || false, { source: 'html-dom' }));

    // ── 9. Lead Capture Signals ───────────────────────────────────────
    const leads = extractLeadCaptureFromHtml(rawHtml, verbose);

    registry.set('conversion.leadForms', sig(leads.forms || [], { source: 'html-form' }));
    registry.set('conversion.leadFormCount', sig(leads.count || 0, { source: 'html-form' }));

    // ── 10. E-E-A-T Signals ───────────────────────────────────────────
    const eat = extractEATSignalsFromHtml(rawHtml, verbose);

    registry.set('seo.eat.authorCount', sig(eat.authorCount || 0, { source: 'html-structured' }));
    registry.set('seo.eat.hasAboutPage', sig(eat.hasAboutPage || false, { source: 'html-link' }));
    registry.set('seo.eat.hasContactPage', sig(eat.hasContactPage || false, { source: 'html-link' }));
    registry.set('seo.eat.schemaTypes', sig(eat.schemaTypes || [], { source: 'json-ld' }));
    registry.set('seo.eat.businessName', sig(eat.businessName || '', { source: 'html-structured' }));

    // ── 11. SEO-specific derived signals ──────────────────────────────
    const htmlLang = shared.htmlLang || a11y.language?.lang || '';
    const hreflangCount = shared.hreflangTagsCount || 0;
    const isSingleLanguage = htmlLang.length >= 2 && hreflangCount === 0;

    registry.set('seo.hreflang.count', sig(hreflangCount, { source: 'html-link' }));
    registry.set('seo.hreflang.applicable', sig(!isSingleLanguage, {
        source: 'derived',
        reason: isSingleLanguage ? 'Single-language site — hreflang not required' : 'Multi-language or unknown',
    }));

    // ── 12. Platform-derived applicability rules ──────────────────────
    // These encode KNOWN platform limitations for downstream agents
    if (platform) {
        const platformRules = getPlatformApplicabilityRules(platform);
        registry.set('platform.rules', sig(platformRules, {
            source: 'derived',
            details: platformRules,
        }));
    }

    // ── Metadata ──────────────────────────────────────────────────────
    registry._metadata.url = url;
    registry._metadata.platform = platform;
    registry._metadata.buildTimeMs = Date.now() - startTime;

    if (verbose) {
        console.log(`[EvidenceRegistry] ✅ Built ${registry.size} signals in ${registry._metadata.buildTimeMs}ms (platform: ${platform || 'unknown'})`);
    }

    return registry;
}

// ============================================================================
// Platform Applicability Rules
// ============================================================================

/**
 * Returns a map of signal keys that are NOT APPLICABLE on a given platform,
 * along with the reason. Agents use this to avoid false positives.
 */
function getPlatformApplicabilityRules(platform) {
    const rules = {};

    switch (platform) {
        case 'Wix':
            rules['a11y.skipNav'] = 'Wix uses Shadow DOM for skip navigation — not extractable from static HTML';
            rules['a11y.formLabels.coverage'] = 'Wix renders form components in Shadow DOM — label extraction unreliable';
            rules['a11y.formLabels.unlabeled'] = 'Wix renders form components in Shadow DOM — label extraction unreliable';
            break;

        case 'Shopify':
            rules['privacy.consentBanner'] = 'Shopify has built-in consent via customer-privacy-api — may not be in static HTML';
            break;

        case 'Squarespace':
            // Squarespace SSR works well, but some components are client-rendered
            rules['conversion.aboveFoldCta'] = 'Squarespace CTA positioning requires JS rendering — static extraction is approximate';
            break;

        case 'Framer':
            rules['a11y.formLabels.coverage'] = 'Framer renders forms client-side — static extraction may miss labels';
            rules['a11y.skipNav'] = 'Framer navigation is client-rendered — skip-nav detection unreliable';
            break;
    }

    return rules;
}

module.exports = {
    buildEvidenceRegistry,
    EvidenceRegistry,
    getPlatformApplicabilityRules,
};
