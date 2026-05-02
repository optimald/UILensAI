/**
 * Form UX Quality Analysis — Evidence-Based Utility
 * 
 * Extracts detailed form UX metrics from live pages via Playwright:
 * - Field inventory (types, labels, placeholders, required markers)
 * - Form friction score (field count, complexity, multi-step detection)
 * - Accessibility signals (labels, aria, error indicators)
 * - Mobile friendliness (input types, touch target sizes)
 * - Submit button quality (text, prominence, placement)
 * - CAPTCHA and spam protection detection
 * 
 * All metrics are deterministic and measurable — no AI fabrication.
 */

/**
 * Extract comprehensive UX data for all forms on the current page.
 * @param {import('playwright').Page} page - Playwright page object
 * @param {boolean} verbose
 * @returns {Promise<Object>} formUxEvidence
 */
async function extractFormUX(page, verbose = false, sharedPageContext = null) {
    if ((!page || page.isClosed()) && !sharedPageContext) {
        return { forms: [], summary: { totalForms: 0, overallScore: 0 }, error: 'Page not available' };
    }

    try {
        const rawData = await page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));

            // Also detect form-like containers without <form> tags
            const formLikeSelectors = [
                '[class*="form"]', '[id*="form"]', '[class*="contact"]',
                '[class*="signup"]', '[class*="subscribe"]', '[class*="newsletter"]',
                '[class*="booking"]', '[class*="appointment"]', '[class*="quote"]'
            ];
            const formLikeContainers = Array.from(document.querySelectorAll(formLikeSelectors.join(',')));
            formLikeContainers.forEach(container => {
                const inputs = container.querySelectorAll('input:not([type="hidden"]), textarea, select');
                if (inputs.length >= 2 && !container.closest('form') && !forms.includes(container)) {
                    forms.push(container);
                }
            });

            return forms.slice(0, 10).map((form, idx) => {
                const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea, select'));
                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');

                // Field analysis
                const fieldDetails = fields.map(field => {
                    const label = form.querySelector(`label[for="${field.id}"]`);
                    const ariaLabel = field.getAttribute('aria-label');
                    const ariaDescribedBy = field.getAttribute('aria-describedby');
                    const placeholder = field.getAttribute('placeholder');
                    const type = field.type || field.tagName.toLowerCase();
                    const rect = field.getBoundingClientRect();
                    const name = field.name || field.id || '';

                    return {
                        type,
                        name: name.substring(0, 50),
                        hasLabel: !!label,
                        labelText: label?.textContent?.trim().substring(0, 80) || '',
                        hasAriaLabel: !!ariaLabel,
                        hasAriaDescribedBy: !!ariaDescribedBy,
                        hasPlaceholder: !!placeholder,
                        placeholderText: (placeholder || '').substring(0, 80),
                        isRequired: field.required || field.getAttribute('aria-required') === 'true',
                        hasAutocomplete: !!field.getAttribute('autocomplete'),
                        autocompleteValue: field.getAttribute('autocomplete') || '',
                        inputMode: field.getAttribute('inputmode') || '',
                        // Touch target sizing
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        isTouchFriendly: rect.height >= 44 && rect.width >= 44, // Apple HIG minimum
                    };
                });

                // Submit button analysis
                const submitAnalysis = submitBtn ? (() => {
                    const rect = submitBtn.getBoundingClientRect();
                    const text = submitBtn.textContent?.trim() || submitBtn.value || '';
                    const bgColor = window.getComputedStyle(submitBtn).backgroundColor;
                    const fontSize = parseFloat(window.getComputedStyle(submitBtn).fontSize);
                    return {
                        found: true,
                        text: text.substring(0, 60),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        isTouchFriendly: rect.height >= 44,
                        hasContrastColor: bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent',
                        fontSize: Math.round(fontSize),
                        isVisible: rect.width > 0 && rect.height > 0,
                    };
                })() : { found: false };

                // CAPTCHA / spam protection (detailed type detection)
                const captchaEl = form.querySelector('.g-recaptcha, .h-captcha, [class*="captcha"], [id*="captcha"], [class*="recaptcha"]') ||
                    form.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]');
                const hasCaptcha = !!captchaEl;
                let captchaType = 'none';
                if (captchaEl) {
                    const captchaHTML = captchaEl.outerHTML.toLowerCase();
                    if (captchaHTML.includes('recaptcha') || captchaHTML.includes('g-recaptcha')) captchaType = 'reCAPTCHA';
                    else if (captchaHTML.includes('hcaptcha') || captchaHTML.includes('h-captcha')) captchaType = 'hCaptcha';
                    else if (captchaHTML.includes('turnstile')) captchaType = 'Turnstile';
                    else captchaType = 'unknown';
                }

                // Honeypot detection
                const hasHoneypot = !!form.querySelector(
                    'input[tabindex="-1"][style*="display:none"], input[style*="position:absolute"][style*="left:-9999px"], input[name*="honeypot"], input[name*="bot"]'
                );

                // Form purpose detection
                const formText = form.textContent?.toLowerCase() || '';
                const formId = (form.id || '').toLowerCase();
                const formClass = (form.className || '').toLowerCase();
                const formAction = (form.action || '').toLowerCase();
                let purpose = 'unknown';
                if (/contact|enquir|get in touch|reach us/i.test(formText) || /contact/i.test(formId + formClass + formAction)) purpose = 'contact';
                else if (/book|appointment|schedul/i.test(formText) || /book|appoint/i.test(formId + formClass)) purpose = 'booking';
                else if (/subscri|newsletter/i.test(formText) || /subscri|newsletter/i.test(formId + formClass)) purpose = 'newsletter';
                else if (/quote|estimate|consult/i.test(formText) || /quote|estimate/i.test(formId + formClass)) purpose = 'quote';
                else if (/login|sign.?in/i.test(formText) || /login|signin/i.test(formId + formClass)) purpose = 'login';
                else if (/sign.?up|register|create.?account/i.test(formText) || /signup|register/i.test(formId + formClass)) purpose = 'signup';
                else if (/search/i.test(formId + formClass) || form.querySelector('input[type="search"]')) purpose = 'search';
                else if (/checkout|payment/i.test(formText) || /checkout|payment/i.test(formId + formClass)) purpose = 'checkout';

                // Error handling indicators
                const hasInlineValidation = !!form.querySelector('[class*="error"], [class*="invalid"], [role="alert"], [aria-invalid="true"]');

                // Multi-step detection
                const hasSteps = !!(
                    form.querySelector('[class*="step"], [class*="wizard"], [class*="progress"]') ||
                    form.querySelector('[data-step], [data-wizard]')
                );

                // BEST-IN-CLASS: Progressive disclosure detection
                const hasConditionalFields = !!form.querySelector(
                    '[style*="display: none"], [style*="display:none"], [hidden], ' +
                    '[class*="hidden"], [class*="collapse"], [class*="accordion"], ' +
                    '[class*="expandable"], [class*="toggle"], [data-toggle], [data-collapse]'
                );
                const hasFieldGroups = !!form.querySelector(
                    'fieldset, [class*="group"], [class*="section"], [role="group"]'
                );
                const fieldGroupCount = form.querySelectorAll('fieldset, [role="group"]').length;

                // Smart defaults detection
                const autocompleteFields = fieldDetails.filter(f => f.hasAutocomplete).length;
                const inputModeFields = fieldDetails.filter(f => f.inputMode && f.inputMode !== '').length;

                // Form position
                const formRect = form.getBoundingClientRect();
                const isAboveFold = formRect.top < window.innerHeight;

                return {
                    index: idx,
                    purpose,
                    fieldCount: fields.length,
                    fields: fieldDetails,
                    submit: submitAnalysis,
                    hasCaptcha,
                    captchaType,
                    hasHoneypot,
                    hasInlineValidation,
                    hasSteps,
                    // BEST-IN-CLASS additions
                    hasConditionalFields,
                    hasFieldGroups,
                    fieldGroupCount,
                    autocompleteFieldCount: autocompleteFields,
                    inputModeFieldCount: inputModeFields,
                    isAboveFold,
                    formTop: Math.round(formRect.top),
                };
            });
        });

        // If we don't have a Playwright page but we DO have sharedPageContext,
        // we can't run advanced DOM heuristics. Return a neutral baseline.
        if ((!page || page.isClosed()) && sharedPageContext) {
            return {
                forms: [],
                summary: {
                    totalForms: 0,
                    overallScore: 50,
                    purposes: [],
                    hasAboveFoldForm: false,
                    avgFieldCount: 0,
                    frictionScore: 50,
                    mobileFriendlinessScore: 50,
                    accessibilityScore: 50,
                    smartDefaultsScore: 50,
                }
            };
        }

        // Compute scores for each form
        const scoredForms = rawData.map(form => ({
            ...form,
            scores: scoreFormUX(form),
        }));

        // Summary
        const totalForms = scoredForms.length;
        const overallScore = totalForms > 0
            ? Math.round(scoredForms.reduce((sum, f) => sum + f.scores.overall, 0) / totalForms)
            : 0;

        if (verbose) {
            console.log(`[FormUX] Found ${totalForms} forms. Overall UX score: ${overallScore}`);
            scoredForms.forEach(f => {
                console.log(`  Form #${f.index} (${f.purpose}): ${f.fieldCount} fields, score=${f.scores.overall}`);
            });
        }

        return {
            forms: scoredForms,
            summary: {
                totalForms,
                overallScore,
                purposes: scoredForms.map(f => f.purpose),
                hasAboveFoldForm: scoredForms.some(f => f.isAboveFold),
                avgFieldCount: totalForms > 0 ? Math.round(scoredForms.reduce((s, f) => s + f.fieldCount, 0) / totalForms) : 0,
                // BEST-IN-CLASS additions
                frictionScore: totalForms > 0 ? Math.round(scoredForms.reduce((s, f) => s + (f.scores.friction || 0), 0) / totalForms) : 0,
                mobileFriendlinessScore: totalForms > 0 ? Math.round(scoredForms.reduce((s, f) => s + (f.scores.mobileFriendliness || 0), 0) / totalForms) : 0,
                accessibilityScore: totalForms > 0 ? Math.round(scoredForms.reduce((s, f) => s + (f.scores.accessibility || 0), 0) / totalForms) : 0,
                smartDefaultsScore: totalForms > 0 ? Math.round(scoredForms.reduce((s, f) => s + (f.scores.smartDefaults || 0), 0) / totalForms) : 0,
            },
        };
    } catch (err) {
        if (verbose) console.error('[FormUX] Extraction failed:', err.message);
        return { forms: [], summary: { totalForms: 0, overallScore: 0 }, error: err.message };
    }
}

/**
 * Score a single form's UX quality based on extracted evidence.
 * Returns scores 0-100 for each dimension and overall.
 */
function scoreFormUX(form) {
    const scores = {};

    // 1. Label quality (30% weight)
    const fieldsWithLabel = form.fields.filter(f => f.hasLabel || f.hasAriaLabel).length;
    const fieldsWithPlaceholderOnly = form.fields.filter(f => !f.hasLabel && !f.hasAriaLabel && f.hasPlaceholder).length;
    const totalFields = form.fields.length || 1;

    const labelRatio = fieldsWithLabel / totalFields;
    // Placeholder-only is bad practice but not zero
    const placeholderOnlyPenalty = fieldsWithPlaceholderOnly / totalFields * 30;
    scores.labelQuality = Math.round(Math.min(100, labelRatio * 100 - placeholderOnlyPenalty));
    scores.labelQuality = Math.max(0, scores.labelQuality);

    // 2. Form friction (20% weight) — fewer fields = less friction
    const fieldCount = form.fieldCount;
    if (fieldCount <= 3) scores.friction = 95; // Very low friction
    else if (fieldCount <= 5) scores.friction = 85;
    else if (fieldCount <= 8) scores.friction = 70;
    else if (fieldCount <= 12) scores.friction = 50;
    else scores.friction = Math.max(20, 100 - fieldCount * 5);

    // Bonus for multi-step (reduces perceived friction)
    if (form.hasSteps && fieldCount > 5) scores.friction = Math.min(100, scores.friction + 15);

    // 3. Mobile friendliness (20% weight)
    const touchFriendlyFields = form.fields.filter(f => f.isTouchFriendly).length;
    const touchRatio = totalFields > 0 ? touchFriendlyFields / totalFields : 0;

    // Check for mobile-appropriate input types
    const hasEmailType = form.fields.some(f => f.type === 'email');
    const hasTelType = form.fields.some(f => f.type === 'tel');
    const hasEmailField = form.fields.some(f => /email/i.test(f.name));
    const hasPhoneField = form.fields.some(f => /phone|tel/i.test(f.name));

    let mobileScore = Math.round(touchRatio * 70);
    // Bonus for using correct input types for email/phone
    if (hasEmailField && hasEmailType) mobileScore += 15;
    if (hasPhoneField && hasTelType) mobileScore += 15;
    // Bonus for submit button touch friendliness
    if (form.submit.found && form.submit.isTouchFriendly) mobileScore += 10;
    scores.mobileFriendliness = Math.min(100, mobileScore);

    // 4. Submit button quality (15% weight)
    if (!form.submit.found) {
        scores.submitQuality = 20; // No submit button found — bad
    } else {
        let sq = 40; // Base for having a submit button
        const text = (form.submit.text || '').toLowerCase();

        // Text quality
        const genericTexts = ['submit', 'send', 'go', 'ok'];
        const goodTexts = ['get', 'book', 'schedule', 'request', 'start', 'join', 'subscribe', 'sign up', 'contact', 'download', 'try'];
        if (goodTexts.some(t => text.includes(t))) sq += 25;
        else if (genericTexts.some(t => text === t)) sq += 5;
        else sq += 15; // Something specific but not recognized pattern

        // Visual prominence
        if (form.submit.hasContrastColor) sq += 15;
        if (form.submit.isVisible) sq += 10;
        if (form.submit.fontSize >= 14) sq += 5;
        scores.submitQuality = Math.min(100, sq);
    }

    // 5. Accessibility (15% weight)
    let a11y = 0;
    const labelledFields = form.fields.filter(f => f.hasLabel || f.hasAriaLabel).length;
    a11y += Math.round((labelledFields / totalFields) * 40);
    const ariaFields = form.fields.filter(f => f.hasAriaDescribedBy).length;
    if (ariaFields > 0) a11y += 15;
    if (form.hasInlineValidation) a11y += 15;
    const requiredFields = form.fields.filter(f => f.isRequired).length;
    if (requiredFields > 0) a11y += 10; // Indicates proper required field marking
    const autocompleteFields = form.fields.filter(f => f.hasAutocomplete).length;
    if (autocompleteFields > 0) a11y += 20;
    scores.accessibility = Math.min(100, a11y);

    // 6. BEST-IN-CLASS: Smart defaults (autocomplete, inputmode, autofill)
    let smartDefaults = 0;
    const autocompleteCount = form.autocompleteFieldCount || form.fields.filter(f => f.hasAutocomplete).length;
    const inputModeCount = form.inputModeFieldCount || form.fields.filter(f => f.inputMode && f.inputMode !== '').length;
    if (autocompleteCount > 0) {
        const autoRatio = autocompleteCount / totalFields;
        smartDefaults += Math.round(autoRatio * 60);
    }
    if (inputModeCount > 0) smartDefaults += 20;
    // Bonus for CAPTCHA (spam protection = professional)
    if (form.hasCaptcha) smartDefaults += 10;
    // Bonus for honeypot (anti-spam without friction)
    if (form.hasHoneypot) smartDefaults += 10;
    scores.smartDefaults = Math.min(100, smartDefaults);

    // BEST-IN-CLASS: Friction adjustments for progressive disclosure
    if (form.hasConditionalFields && form.fieldCount > 5) {
        scores.friction = Math.min(100, scores.friction + 10); // Reduces perceived complexity
    }
    if (form.hasFieldGroups && form.fieldCount > 4) {
        scores.friction = Math.min(100, scores.friction + 5); // Grouped fields feel organized
    }

    // Overall weighted score (updated weights to include smartDefaults)
    scores.overall = Math.round(
        scores.labelQuality * 0.25 +
        scores.friction * 0.20 +
        scores.mobileFriendliness * 0.18 +
        scores.submitQuality * 0.12 +
        scores.accessibility * 0.13 +
        scores.smartDefaults * 0.12
    );

    return scores;
}

module.exports = { extractFormUX, scoreFormUX };
