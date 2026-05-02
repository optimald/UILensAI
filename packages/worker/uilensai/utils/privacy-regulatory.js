/**
 * Privacy Regulatory Context Detection — Evidence-Based Utility
 * 
 * Determines which privacy regulations likely apply to a website by examining:
 * - Geographic signals (TLD, contact addresses, currency, language)
 * - Industry signals (healthcare → HIPAA, finance → GLBA/PCI, children → COPPA)
 * - Business type signals (e-commerce → PCI DSS)
 * - Existing compliance signals (consent banners, policy page content)
 * 
 * All detection is deterministic — no AI fabrication.
 */

/**
 * Country code → applicable regulations mapping
 */
const GEO_REGULATIONS = {
    // EU/EEA → GDPR
    eu: ['GDPR'],
    uk: ['UK-GDPR', 'PECR'],
    de: ['GDPR', 'TTDSG'],
    fr: ['GDPR'],
    it: ['GDPR'],
    es: ['GDPR'],
    nl: ['GDPR'],
    // North America
    us: [], // State-specific, detected below
    ca: ['PIPEDA'],
    // Asia-Pacific
    au: ['APPs'],
    jp: ['APPI'],
    kr: ['PIPA'],
    br: ['LGPD'],
    in: ['DPDP'],
};

const US_STATE_REGULATIONS = {
    california: ['CCPA/CPRA'],
    virginia: ['VCDPA'],
    colorado: ['CPA'],
    connecticut: ['CTDPA'],
    utah: ['UCPA'],
    texas: ['TDPSA'],
    oregon: ['OCPA'],
    montana: ['MCDPA'],
};

const INDUSTRY_REGULATIONS = {
    healthcare: ['HIPAA'],
    medical: ['HIPAA'],
    dental: ['HIPAA'],
    medspa: ['HIPAA'],
    'plastic surgery': ['HIPAA'],
    dermatology: ['HIPAA'],
    veterinary: [],
    finance: ['GLBA', 'PCI DSS'],
    banking: ['GLBA', 'PCI DSS'],
    insurance: ['GLBA'],
    legal: ['Attorney-Client Privilege'],
    education: ['FERPA'],
    children: ['COPPA'],
    ecommerce: ['PCI DSS'],
};

/**
 * Detect regulatory context from a live page via Playwright.
 * @param {import('playwright').Page} page
 * @param {Object} industryContext - Industry context from business-context.js
 * @param {boolean} verbose
 * @returns {Promise<Object>} regulatoryContext
 */
async function detectRegulatoryContext(page, industryContext = {}, verbose = false) {
    if (!page || page.isClosed()) {
        return { applicable: [], confidence: 'low', signals: [], error: 'Page not available' };
    }

    try {
        const url = page.url();
        const signals = [];
        const applicableRegs = new Set();

        // 1. TLD-based geo detection
        const tld = extractTLD(url);
        const tldGeo = TLD_TO_GEO[tld];
        if (tldGeo && GEO_REGULATIONS[tldGeo]) {
            GEO_REGULATIONS[tldGeo].forEach(r => applicableRegs.add(r));
            signals.push({ type: 'tld', value: tld, geo: tldGeo, regs: GEO_REGULATIONS[tldGeo] });
        }

        // 2. Page content signals
        const pageSignals = await page.evaluate(() => {
            const body = document.body?.textContent?.toLowerCase() || '';
            const html = document.documentElement?.outerHTML?.toLowerCase() || '';

            // Address/location detection
            const addressPatterns = {
                us_states: body.match(/(?:california|new york|texas|florida|illinois|virginia|colorado|connecticut|utah|oregon|montana|washington|georgia|ohio|pennsylvania|michigan)\b/gi) || [],
                us_zip: !!body.match(/\b\d{5}(-\d{4})?\b/),
                uk_postcode: !!body.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i),
                eu_indicators: !!body.match(/\b(gdpr|european union|eu privacy|data protection authority|dpo)\b/i),
            };

            // Currency detection
            const currencies = {
                usd: !!body.match(/\$\d|USD/),
                eur: !!body.match(/€\d|EUR/),
                gbp: !!body.match(/£\d|GBP/),
                cad: !!body.match(/CAD|C\$/),
            };

            // Language detection
            const lang = document.documentElement.lang?.toLowerCase() || '';

            // Consent banner detection
            const hasConsentBanner = !!(
                document.querySelector('[class*="cookie-consent"], [class*="cookie-banner"], [id*="cookie-consent"], [id*="cookie-banner"]') ||
                document.querySelector('[class*="consent-banner"], [class*="gdpr"], [id*="gdpr"]') ||
                document.querySelector('[class*="cc-banner"], [class*="cookiefirst"], [class*="OneTrust"], [class*="onetrust"]')
            );

            // Privacy policy content indicators
            const privacyLinks = Array.from(document.querySelectorAll('a[href]'))
                .filter(a => /privacy|policy|legal|terms/i.test(a.textContent || ''))
                .map(a => ({
                    text: (a.textContent || '').trim().substring(0, 50),
                    href: a.href,
                })).slice(0, 5);

            // E-commerce signals
            const hasEcommerce = !!(
                document.querySelector('[class*="cart"], [class*="checkout"], [class*="product-price"]') ||
                body.match(/add to cart|buy now|shopping cart|checkout/i)
            );

            // Health information signals (HIPAA)
            const hasHealthInfo = !!(
                body.match(/patient portal|hipaa|protected health|medical records|appointment booking|patient information/i) ||
                document.querySelector('[class*="patient"], [id*="patient"], [class*="hipaa"]')
            );

            // Children-oriented signals (COPPA)
            const hasChildrenContent = !!(
                body.match(/children under 13|parental consent|coppa|child safety/i) ||
                html.match(/meta[^>]+rating[^>]+general/i)
            );

            // Financial signals
            const hasFinancialInfo = !!(
                body.match(/bank account|credit card|routing number|financial advisor|investment|loan application/i) ||
                document.querySelector('[class*="payment"], [class*="billing"]')
            );

            return {
                addressPatterns,
                currencies,
                lang,
                hasConsentBanner,
                privacyLinks,
                hasEcommerce,
                hasHealthInfo,
                hasChildrenContent,
                hasFinancialInfo,
            };
        });

        // 3. Process page signals

        // US state detection for state-specific regs
        if (pageSignals.addressPatterns.us_states.length > 0) {
            const states = [...new Set(pageSignals.addressPatterns.us_states.map(s => s.toLowerCase()))];
            states.forEach(state => {
                if (US_STATE_REGULATIONS[state]) {
                    US_STATE_REGULATIONS[state].forEach(r => applicableRegs.add(r));
                    signals.push({ type: 'us_state', value: state, regs: US_STATE_REGULATIONS[state] });
                }
            });
        }

        // EU detection
        if (pageSignals.currencies.eur || pageSignals.addressPatterns.eu_indicators) {
            applicableRegs.add('GDPR');
            signals.push({ type: 'eu_signal', value: 'EUR currency or GDPR reference', regs: ['GDPR'] });
        }

        if (pageSignals.currencies.gbp || pageSignals.addressPatterns.uk_postcode) {
            applicableRegs.add('UK-GDPR');
            signals.push({ type: 'uk_signal', value: 'GBP currency or UK postcode', regs: ['UK-GDPR'] });
        }

        // Consent banner suggests GDPR awareness
        if (pageSignals.hasConsentBanner) {
            signals.push({ type: 'consent_banner', value: 'Consent banner detected', regs: [] });
        }

        // 4. Industry-based regulations
        const primaryIndustry = (industryContext.primaryIndustry || '').toLowerCase();
        for (const [industry, regs] of Object.entries(INDUSTRY_REGULATIONS)) {
            if (primaryIndustry.includes(industry)) {
                regs.forEach(r => applicableRegs.add(r));
                signals.push({ type: 'industry', value: industry, regs });
                break;
            }
        }

        // Health-specific
        if (pageSignals.hasHealthInfo) {
            applicableRegs.add('HIPAA');
            signals.push({ type: 'health_content', value: 'Patient/health information handling detected', regs: ['HIPAA'] });
        }

        // Children-specific
        if (pageSignals.hasChildrenContent) {
            applicableRegs.add('COPPA');
            signals.push({ type: 'children_content', value: 'Children-oriented content detected', regs: ['COPPA'] });
        }

        // E-commerce / financial
        if (pageSignals.hasEcommerce || pageSignals.hasFinancialInfo) {
            applicableRegs.add('PCI DSS');
            signals.push({ type: 'financial', value: 'E-commerce or financial data handling', regs: ['PCI DSS'] });
        }

        // If no geo detected but .com with USD, assume US
        if (signals.length === 0 && tld === 'com' && pageSignals.currencies.usd) {
            signals.push({ type: 'default_geo', value: 'US assumed (.com + USD)', regs: [] });
        }

        // 5. Compliance evidence assessment
        const complianceEvidence = {
            hasConsentBanner: pageSignals.hasConsentBanner,
            hasPrivacyPolicy: pageSignals.privacyLinks.length > 0,
            privacyLinks: pageSignals.privacyLinks,
            consentBannerNeeded: applicableRegs.has('GDPR') || applicableRegs.has('UK-GDPR') || applicableRegs.has('LGPD'),
            hipaaRelevant: applicableRegs.has('HIPAA'),
            pciRelevant: applicableRegs.has('PCI DSS'),
        };

        // Gaps
        const gaps = [];
        if (complianceEvidence.consentBannerNeeded && !complianceEvidence.hasConsentBanner) {
            gaps.push({ regulation: 'GDPR', gap: 'No cookie consent banner detected', severity: 'high' });
        }
        if (!complianceEvidence.hasPrivacyPolicy) {
            gaps.push({ regulation: 'General', gap: 'No privacy policy link found', severity: 'critical' });
        }
        if (complianceEvidence.hipaaRelevant && pageSignals.hasHealthInfo) {
            // Check for secure form handling indicators
            gaps.push({ regulation: 'HIPAA', gap: 'Health information forms should use encrypted transmission', severity: 'high' });
        }

        const confidence = signals.length >= 3 ? 'high' : signals.length >= 1 ? 'medium' : 'low';

        if (verbose) {
            console.log(`[PrivacyRegulatory] Detected ${applicableRegs.size} applicable regulations:`, [...applicableRegs]);
            console.log(`[PrivacyRegulatory] Confidence: ${confidence}, Signals: ${signals.length}, Gaps: ${gaps.length}`);
        }

        return {
            applicable: [...applicableRegs],
            confidence,
            signals,
            complianceEvidence,
            gaps,
            score: computeRegulatoryScore(complianceEvidence, gaps, applicableRegs),
        };
    } catch (err) {
        if (verbose) console.error('[PrivacyRegulatory] Detection failed:', err.message);
        return { applicable: [], confidence: 'low', signals: [], error: err.message };
    }
}

/**
 * Compute a compliance score based on detected regulations vs evidence.
 */
function computeRegulatoryScore(evidence, gaps, applicableRegs) {
    let score = 70; // Base if no regs detected

    if (applicableRegs.size === 0) return 75; // No specific regs — basic compliance OK

    // Privacy policy is universal
    if (!evidence.hasPrivacyPolicy) score -= 30;

    // Per-gap penalties
    gaps.forEach(gap => {
        if (gap.severity === 'critical') score -= 25;
        else if (gap.severity === 'high') score -= 15;
        else score -= 5;
    });

    // Positive signals
    if (evidence.hasConsentBanner && evidence.consentBannerNeeded) score += 15;
    if (evidence.hasPrivacyPolicy) score += 10;

    return Math.max(0, Math.min(100, Math.round(score)));
}

// --- Helpers ---

const TLD_TO_GEO = {
    'co.uk': 'uk', 'uk': 'uk', 'de': 'de', 'fr': 'fr', 'it': 'it', 'es': 'es',
    'nl': 'nl', 'eu': 'eu', 'ca': 'ca', 'com.au': 'au', 'au': 'au',
    'jp': 'jp', 'kr': 'kr', 'com.br': 'br', 'br': 'br', 'in': 'in',
};

function extractTLD(url) {
    try {
        const hostname = new URL(url).hostname;
        // Handle compound TLDs
        const parts = hostname.split('.');
        if (parts.length >= 3) {
            const compound = parts.slice(-2).join('.');
            if (TLD_TO_GEO[compound]) return compound;
        }
        return parts[parts.length - 1];
    } catch {
        return '';
    }
}

module.exports = { detectRegulatoryContext, computeRegulatoryScore };
