/**
 * Lead Capture & Email Marketing — Evidence-Based Utility
 *
 * Extracts lead generation and email marketing signals from live pages.
 * Detects newsletter signups, email service providers, lead magnets,
 * chat widgets, popup/overlay forms, and exit-intent mechanisms.
 *
 * All metrics are deterministic — no AI fabrication.
 */

/**
 * Extract lead capture signals from a live page
 * @param {import('playwright').Page} page
 * @param {boolean} verbose
 * @returns {Promise<Object>} Lead capture evidence
 */
async function extractLeadCaptureSignals(page, verbose = false) {
    if (!page || page.isClosed()) {
        return createEmptyLeadCapture();
    }

    try {
        const rawData = await page.evaluate(() => {
            const bodyText = document.body.textContent?.toLowerCase() || '';
            const scripts = Array.from(document.scripts).map(s => (s.src || '') + ' ' + (s.innerHTML || '').substring(0, 500));
            const allScriptText = scripts.join(' ').toLowerCase();

            // --- 1. Email Capture Forms ---
            const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email" i], input[placeholder*="email" i]');
            const emailForms = [];

            emailInputs.forEach(input => {
                const form = input.closest('form');
                const isLoginForm = form && (
                    form.querySelector('input[type="password"]') ||
                    form.action?.includes('login') ||
                    form.action?.includes('signin') ||
                    form.id?.toLowerCase().includes('login') ||
                    form.className?.toLowerCase().includes('login')
                );

                if (!isLoginForm) {
                    const label = input.getAttribute('placeholder') || input.getAttribute('aria-label') || '';
                    const nearbyText = form ? form.textContent?.trim().substring(0, 200) : '';
                    emailForms.push({
                        type: nearbyText.match(/newsletter|subscribe|updates|weekly|digest/i) ? 'newsletter' :
                            nearbyText.match(/download|ebook|guide|whitepaper|checklist|free/i) ? 'lead-magnet' :
                                nearbyText.match(/consult|appointment|quote|estimate|contact/i) ? 'consultation' :
                                    'generic-capture',
                        placeholder: label.substring(0, 80),
                        context: nearbyText.substring(0, 150),
                        hasNameField: form ? !!form.querySelector('input[name*="name" i], input[placeholder*="name" i]') : false,
                        hasPhoneField: form ? !!form.querySelector('input[type="tel"], input[name*="phone" i]') : false,
                        fieldCount: form ? form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), select, textarea').length : 1,
                    });
                }
            });

            // --- 2. Email Service Provider Detection ---
            const espPatterns = [
                { name: 'Mailchimp', pattern: /mailchimp\.com|list-manage\.com|chimpstatic\.com|mc\.us\d+\.list-manage/i },
                { name: 'Klaviyo', pattern: /klaviyo\.com|a\.]klaviyo\.com|static\.klaviyo\.com/i },
                { name: 'HubSpot', pattern: /hubspot\.com|hs-scripts\.com|hsforms\.com|hbspt\.forms/i },
                { name: 'ActiveCampaign', pattern: /activecampaign\.com|trackcmp\.net/i },
                { name: 'ConvertKit', pattern: /convertkit\.com|ck\.page/i },
                { name: 'Constant Contact', pattern: /constantcontact\.com|ctctcdn\.com/i },
                { name: 'Drip', pattern: /getdrip\.com|drip\.com/i },
                { name: 'Sendinblue/Brevo', pattern: /sendinblue\.com|brevo\.com|sibforms\.com/i },
                { name: 'AWeber', pattern: /aweber\.com/i },
                { name: 'GetResponse', pattern: /getresponse\.com/i },
                { name: 'MailerLite', pattern: /mailerlite\.com|ml\.com/i },
                { name: 'Campaign Monitor', pattern: /campaignmonitor\.com|createsend\.com/i },
                { name: 'Omnisend', pattern: /omnisend\.com/i },
                { name: 'Flodesk', pattern: /flodesk\.com/i },
            ];
            const detectedESPs = espPatterns.filter(esp => esp.pattern.test(allScriptText)).map(esp => esp.name);

            // Also check link hrefs and form actions
            const allHrefs = Array.from(document.querySelectorAll('a[href], form[action]'))
                .map(el => el.getAttribute('href') || el.getAttribute('action') || '')
                .join(' ');
            espPatterns.forEach(esp => {
                if (esp.pattern.test(allHrefs) && !detectedESPs.includes(esp.name)) {
                    detectedESPs.push(esp.name);
                }
            });

            // --- 3. Lead Magnet Detection ---
            const leadMagnetPatterns = [
                /download\s+(your\s+)?(free|our)\s+(guide|ebook|e-book|whitepaper|white paper|checklist|template|toolkit|report|pdf)/i,
                /free\s+(guide|ebook|e-book|whitepaper|white paper|checklist|template|toolkit|report|pdf|download)/i,
                /get\s+(your\s+)?(free|the)\s+(guide|ebook|report|checklist|template)/i,
                /grab\s+(your\s+)?(free|copy)/i,
                /gated\s+content/i,
                /unlock\s+(your|the|this|free)/i,
            ];
            const hasLeadMagnet = leadMagnetPatterns.some(p => p.test(bodyText));

            // --- 4. Popup/Overlay Detection ---
            const popupElements = document.querySelectorAll(
                '[class*="popup" i]:not([style*="display: none"]), [class*="modal" i]:not([style*="display: none"]), ' +
                '[class*="overlay" i]:not(nav *), [class*="lightbox" i], [class*="slide-in" i], ' +
                '[class*="sticky-bar" i], [class*="notification-bar" i], [class*="announcement" i]'
            );
            // Check for exit-intent scripts
            const hasExitIntent = allScriptText.includes('exit-intent') || allScriptText.includes('exitintent') ||
                allScriptText.includes('mouseleave') || allScriptText.includes('ouibounce') ||
                allScriptText.includes('optinmonster');

            // --- 5. Chat Widget Detection ---
            const chatPatterns = [
                { name: 'Intercom', pattern: /intercom\.com|intercomcdn\.com|widget\.intercom\.io/i },
                { name: 'Drift', pattern: /drift\.com|js\.driftt\.com/i },
                { name: 'LiveChat', pattern: /livechatinc\.com|cdn\.livechatinc\.com/i },
                { name: 'Tidio', pattern: /tidio\.co|code\.tidio\.co/i },
                { name: 'Zendesk', pattern: /zendesk\.com|zopim\.com|static\.zdassets\.com/i },
                { name: 'Crisp', pattern: /crisp\.chat|client\.crisp\.chat/i },
                { name: 'Freshchat', pattern: /freshchat|wchat\.freshchat\.com/i },
                { name: 'Tawk.to', pattern: /tawk\.to|embed\.tawk\.to/i },
                { name: 'Olark', pattern: /olark\.com|static\.olark\.com/i },
                { name: 'HubSpot Chat', pattern: /hubspot\.com.*messages|js\.usemessages\.com/i },
                // WORLD-CLASS GAP 2: SMB/local service chat providers
                { name: 'Podium', pattern: /podium\.com|connect\.podium\.com|webchat\.podium/i },
                { name: 'Birdeye', pattern: /birdeye\.com|webchat\.birdeye\.com/i },
                { name: 'Weave', pattern: /getweave\.com|chat\.getweave\.com/i },
                { name: 'SimpleTexting', pattern: /simpletexting\.com/i },
                { name: 'Textedly', pattern: /textedly\.com/i },
            ];
            const detectedChat = chatPatterns.filter(c => c.pattern.test(allScriptText)).map(c => c.name);

            // Also check for generic chat widget elements
            const chatElements = document.querySelectorAll(
                '[class*="chat-widget" i], [class*="live-chat" i], [id*="chat-widget" i], [class*="chat-bubble" i]'
            );
            if (chatElements.length > 0 && detectedChat.length === 0) {
                detectedChat.push('Unknown Chat Widget');
            }

            // --- 6. CRM/Marketing Automation Detection ---
            const crmPatterns = [
                { name: 'HubSpot CRM', pattern: /hubspot\.com|hs-scripts\.com|hbspt/i },
                { name: 'Salesforce', pattern: /salesforce\.com|force\.com|pardot\.com/i },
                { name: 'Marketo', pattern: /marketo\.(com|net)|mktoresp\.com|mktoForms/i },
                { name: 'Pipedrive', pattern: /pipedrive\.com|leadbooster/i },
                { name: 'Zoho', pattern: /zoho\.com|zsalesiq/i },
            ];
            const detectedCRM = crmPatterns.filter(c => c.pattern.test(allScriptText)).map(c => c.name);

            return {
                emailForms,
                emailServiceProviders: detectedESPs,
                leadMagnet: { detected: hasLeadMagnet },
                popups: {
                    count: popupElements.length,
                    hasExitIntent,
                },
                chatWidgets: detectedChat,
                crmTools: detectedCRM,
            };
        });

        const scored = scoreLeadCapture(rawData);
        rawData.scores = scored;

        if (verbose) {
            console.log('[LeadCapture] Email forms:', rawData.emailForms.length, 'types:', rawData.emailForms.map(f => f.type).join(', '));
            console.log('[LeadCapture] ESPs:', rawData.emailServiceProviders.join(', ') || 'none');
            console.log('[LeadCapture] Chat:', rawData.chatWidgets.join(', ') || 'none');
            console.log('[LeadCapture] CRM:', rawData.crmTools.join(', ') || 'none');
            console.log('[LeadCapture] Overall score:', scored.overall.score);
        }

        return rawData;

    } catch (error) {
        if (verbose) console.error('[LeadCapture] Extraction failed:', error.message);
        return createEmptyLeadCapture();
    }
}

/**
 * Score lead capture completeness (0-100)
 */
function scoreLeadCapture(data, industry = 'general') {
    const scores = {};

    // Email capture forms (30 points)
    let emailScore = 0;
    if (data.emailForms.length >= 2) emailScore = 30;
    else if (data.emailForms.length === 1) emailScore = 20;
    else emailScore = 0;

    // Bonus for newsletter specifically
    if (data.emailForms.some(f => f.type === 'newsletter')) emailScore = Math.min(30, emailScore + 5);
    scores.emailCapture = { score: emailScore, detail: `${data.emailForms.length} email capture form(s)` };

    // ESP integration (20 points)
    if (data.emailServiceProviders.length > 0) {
        scores.espIntegration = { score: 20, detail: data.emailServiceProviders.join(', ') };
    } else {
        scores.espIntegration = { score: 0, detail: 'No email service provider detected' };
    }

    // Lead magnets (15 points)
    scores.leadMagnet = {
        score: data.leadMagnet.detected ? 15 : 0,
        detail: data.leadMagnet.detected ? 'Lead magnet detected (free download/guide)' : 'No lead magnet detected',
    };

    // Chat widget (15 points)
    if (data.chatWidgets.length > 0) {
        scores.chatWidget = { score: 15, detail: data.chatWidgets.join(', ') };
    } else {
        scores.chatWidget = { score: 0, detail: 'No chat widget detected' };
    }

    // CRM integration (10 points)
    if (data.crmTools.length > 0) {
        scores.crmIntegration = { score: 10, detail: data.crmTools.join(', ') };
    } else {
        scores.crmIntegration = { score: 0, detail: 'No CRM detected' };
    }

    // Popup/engagement tools (10 points)
    let popupScore = 0;
    if (data.popups.hasExitIntent) popupScore += 7;
    if (data.popups.count > 0) popupScore += 3;
    scores.engagementTools = { score: Math.min(10, popupScore), detail: `${data.popups.count} popups, exit-intent: ${data.popups.hasExitIntent}` };

    // Overall
    scores.overall = {
        score: Math.round(
            scores.emailCapture.score +
            scores.espIntegration.score +
            scores.leadMagnet.score +
            scores.chatWidget.score +
            scores.crmIntegration.score +
            scores.engagementTools.score
        ),
        detail: `Lead capture completeness across ${Object.keys(scores).length - 1} dimensions`,
    };

    return scores;
}

function createEmptyLeadCapture() {
    return {
        emailForms: [],
        emailServiceProviders: [],
        leadMagnet: { detected: false },
        popups: { count: 0, hasExitIntent: false },
        chatWidgets: [],
        crmTools: [],
        scores: { overall: { score: 0, detail: 'Lead capture extraction failed' } },
    };
}

module.exports = {
    extractLeadCaptureSignals,
    scoreLeadCapture,
};
