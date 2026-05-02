/**
 * Trust Signal Completeness by Niche — Evidence-Based Utility
 *
 * Defines what trust signals are EXPECTED for each business niche,
 * then scores how many the page actually has.
 *
 * E.g., a medical spa needs: reviews, certifications, before/after,
 * provider credentials, HIPAA notice, board certification.
 * A roofer needs: licensing, insurance proof, BBB badge, reviews, warranty info.
 */

const NICHE_TRUST_REQUIREMENTS = {
    // --- Medical specialties (each has distinct trust needs) ---
    'plastic surgery': {
        critical: ['reviews', 'boardCertification', 'beforeAfter'],
        important: ['hospitalPrivileges', 'surgicalFellowship', 'providerCredentials', 'consultationOffer'],
        nice: ['awards', 'mediaAppearances', 'professionalMemberships', 'patientTestimonials', 'hipaaNotice'],
    },
    dermatology: {
        critical: ['reviews', 'boardCertification', 'providerCredentials'],
        important: ['beforeAfter', 'insuranceAccepted', 'technologyHighlights', 'certifications'],
        nice: ['awards', 'professionalMemberships', 'publishedArticles', 'hipaaNotice'],
    },
    orthopedics: {
        critical: ['reviews', 'boardCertification', 'providerCredentials'],
        important: ['hospitalPrivileges', 'surgicalFellowship', 'insuranceAccepted', 'technologyHighlights'],
        nice: ['awards', 'professionalMemberships', 'patientTestimonials', 'hipaaNotice'],
    },
    dental: {
        critical: ['reviews', 'providerCredentials', 'certifications'],
        important: ['insuranceAccepted', 'beforeAfter', 'technologyHighlights'],
        nice: ['awards', 'communityInvolvement', 'professionalMemberships'],
    },
    medspa: {
        critical: ['reviews', 'providerCredentials', 'beforeAfter'],
        important: ['certifications', 'technologyHighlights', 'consultationOffer'],
        nice: ['awards', 'mediaAppearances', 'socialProof'],
    },
    medical: {
        critical: ['reviews', 'providerCredentials', 'certifications'],
        important: ['beforeAfter', 'hipaaNotice', 'boardCertification', 'insuranceAccepted'],
        nice: ['awards', 'mediaAppearances', 'professionalMemberships', 'patientTestimonials'],
    },
    veterinary: {
        critical: ['reviews', 'providerCredentials'],
        important: ['emergencyService', 'certifications', 'technologyHighlights'],
        nice: ['awards', 'communityInvolvement', 'socialProof'],
    },
    optometry: {
        critical: ['reviews', 'providerCredentials', 'insuranceAccepted'],
        important: ['certifications', 'technologyHighlights', 'serviceMenu'],
        nice: ['awards', 'professionalMemberships', 'socialProof'],
    },
    // --- Legal specialties ---
    legal: {
        critical: ['reviews', 'providerCredentials', 'caseResults'],
        important: ['barMembership', 'yearsExperience', 'freeConsultation'],
        nice: ['awards', 'mediaAppearances', 'professionalMemberships', 'publishedArticles'],
    },
    // --- Home services ---
    'home services': {
        critical: ['reviews', 'licensing', 'insurance'],
        important: ['bbbRating', 'warranty', 'freeEstimate', 'yearsExperience'],
        nice: ['beforeAfter', 'awards', 'communityInvolvement', 'manufacturerCertifications'],
    },
    hvac: {
        critical: ['reviews', 'licensing', 'insurance'],
        important: ['warranty', 'freeEstimate', 'emergencyService', 'manufacturerCertifications'],
        nice: ['bbbRating', 'yearsExperience', 'energyStarPartner'],
    },
    roofing: {
        critical: ['reviews', 'licensing', 'insurance'],
        important: ['warranty', 'freeEstimate', 'yearsExperience'],
        nice: ['bbbRating', 'beforeAfter', 'manufacturerCertifications', 'stormDamageExpertise'],
    },
    plumbing: {
        critical: ['reviews', 'licensing', 'insurance'],
        important: ['emergencyService', 'freeEstimate', 'warranty', 'yearsExperience'],
        nice: ['bbbRating', 'manufacturerCertifications', 'communityInvolvement'],
    },
    electrical: {
        critical: ['reviews', 'licensing', 'insurance'],
        important: ['emergencyService', 'freeEstimate', 'warranty', 'yearsExperience'],
        nice: ['bbbRating', 'manufacturerCertifications', 'certifications'],
    },
    // --- Wellness ---
    spa: {
        critical: ['reviews', 'serviceMenu'],
        important: ['providerCredentials', 'certifications', 'ambiance'],
        nice: ['awards', 'giftCards', 'membershipPrograms', 'socialProof'],
    },
    // --- Tech / Commerce ---
    ecommerce: {
        critical: ['reviews', 'securePayment', 'returnPolicy'],
        important: ['shippingInfo', 'customerSupport', 'productGuarantee'],
        nice: ['socialProof', 'trustBadges', 'mediaFeatures', 'sustainabilityClaims'],
    },
    saas: {
        critical: ['socialProof', 'securityCertifications', 'pricingTransparency'],
        important: ['caseStudies', 'integrations', 'uptimeGuarantee', 'freeTrialDemo'],
        nice: ['awards', 'teamPage', 'companyMission', 'publishedContent'],
    },
    // --- Other ---
    'real estate': {
        critical: ['reviews', 'licensing', 'providerCredentials'],
        important: ['yearsExperience', 'socialProof', 'contactInfo'],
        nice: ['awards', 'communityInvolvement', 'mediaAppearances'],
    },
    restaurant: {
        critical: ['reviews', 'serviceMenu', 'contactInfo'],
        important: ['socialProof', 'awards'],
        nice: ['mediaAppearances', 'communityInvolvement'],
    },
    fitness: {
        critical: ['reviews', 'certifications', 'serviceMenu'],
        important: ['providerCredentials', 'socialProof', 'freeTrialDemo'],
        nice: ['awards', 'beforeAfter', 'communityInvolvement'],
    },
    general: {
        critical: ['reviews'],
        important: ['contactInfo', 'aboutPage', 'serviceDescriptions'],
        nice: ['socialProof', 'awards', 'communityInvolvement'],
    },
};

/**
 * Signal detection patterns — maps signal names to DOM/text patterns.
 */
const SIGNAL_DETECTORS = {
    reviews: (text, doc) =>
        /reviews?|testimonials?|★|⭐|star rating|\d+\s*out of\s*5/i.test(text) ||
        !!doc.querySelector('[class*="review"], [class*="testimonial"], [class*="rating"], [class*="stars"]'),
    providerCredentials: (text) =>
        /\b(M\.?D\.?|D\.?O\.?|D\.?D\.?S\.?|D\.?M\.?D\.?|Ph\.?D\.?|J\.?D\.?|Esq\.?|R\.?N\.?|N\.?P\.?|P\.?A\.?|D\.?C\.?)\b/i.test(text) ||
        /board.certified|fellowship|residency|credentials|qualifications/i.test(text),
    certifications: (text, doc) =>
        /certified|certification|accredited|credentials|licensed/i.test(text) ||
        !!doc.querySelector('[class*="certification"], [class*="accredit"], img[alt*="certified"]'),
    beforeAfter: (text, doc) =>
        /before\s*(and|&)\s*after|results gallery|transformation/i.test(text) ||
        !!doc.querySelector('[class*="before-after"], [class*="gallery"], [class*="results"]'),
    hipaaNotice: (text) =>
        /hipaa|health insurance portability|protected health information/i.test(text),
    boardCertification: (text) =>
        /board.certified|american board of|abms|specialty board/i.test(text),
    insuranceAccepted: (text) =>
        /insurance\s*(accepted|plans|coverage)|we\s*accept|in-network/i.test(text),
    caseResults: (text) =>
        /case results|verdicts|settlements|million\s*(dollar|recovery)|case.*won/i.test(text),
    barMembership: (text) =>
        /bar\s*(association|member)|state\s*bar|admitted\s*to\s*practice/i.test(text),
    licensing: (text) =>
        /licensed|license\s*#|lic\s*#|contractor\s*license|state\s*license/i.test(text),
    insurance: (text) =>
        /fully\s*insured|bonded\s*(and|&)\s*insured|liability\s*insurance|worker.?s?\s*comp/i.test(text),
    bbbRating: (text, doc) =>
        /bbb|better\s*business\s*bureau|a\+?\s*rated/i.test(text) ||
        !!doc.querySelector('img[alt*="BBB"], a[href*="bbb.org"]'),
    warranty: (text) =>
        /warranty|guarantee|money.back|satisfaction\s*guarantee/i.test(text),
    freeEstimate: (text) =>
        /free\s*(estimate|consultation|quote|assessment|inspection|evaluation)/i.test(text),
    yearsExperience: (text) =>
        /\d+\s*(years?|yrs?)\s*(of\s*)?(experience|in\s*business|serving)/i.test(text),
    emergencyService: (text) =>
        /24.?7|emergency\s*service|same.day|after.hours/i.test(text),
    manufacturerCertifications: (text, doc) =>
        /factory\s*authorized|certified\s*(dealer|installer|contractor)|partner\s*program/i.test(text) ||
        !!doc.querySelector('img[alt*="certified"], img[alt*="authorized"]'),
    serviceMenu: (text) =>
        /services|treatments|menu|pricing|our\s*(services|treatments)/i.test(text),
    securePayment: (text, doc) =>
        /secure\s*(payment|checkout)|ssl|encrypted|pci\s*compliant/i.test(text) ||
        !!doc.querySelector('img[alt*="secure"], img[alt*="ssl"], [class*="secure-badge"]'),
    returnPolicy: (text) =>
        /return\s*policy|refund\s*policy|money.back|returns?\s*(and|&)\s*exchange/i.test(text),
    socialProof: (text, doc) =>
        /trusted\s*by|used\s*by|loved\s*by|\d+[\s,]*\d*\s*(customers?|clients?|businesses?|users?)/i.test(text) ||
        !!doc.querySelector('[class*="logo-wall"], [class*="client-logos"], [class*="as-seen"]'),
    contactInfo: (text) =>
        /\(\d{3}\)\s*\d{3}[\s-]\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4}|contact\s*us|get\s*in\s*touch/i.test(text),
    securityCertifications: (text) =>
        /soc\s*2|iso\s*27001|gdpr\s*compliant|security\s*audit/i.test(text),
    pricingTransparency: (text) =>
        /pricing|plans?\s*(and|&)\s*pricing|starts?\s*at\s*\$/i.test(text),
    technologyHighlights: (text) =>
        /state.of.the.art|latest\s*technology|advanced\s*(equipment|technology)|3D|digital/i.test(text),
    consultationOffer: (text) =>
        /free\s*consultation|complimentary\s*consultation|schedule\s*(a|your)\s*consultation/i.test(text),
    awards: (text, doc) =>
        /award.winning|voted\s*best|top\s*rated|recognized|#1\s*rated/i.test(text) ||
        !!doc.querySelector('img[alt*="award"], img[alt*="winner"], [class*="award"]'),
    freeTrialDemo: (text) =>
        /free\s*trial|start\s*free|demo|try\s*(it\s*)?free/i.test(text),
    aboutPage: (text, doc) =>
        !!doc.querySelector('a[href*="about"], a[href*="team"], a[href*="our-story"]'),
    serviceDescriptions: (text, doc) =>
        !!doc.querySelector('a[href*="services"], a[href*="what-we-do"]'),
    hospitalPrivileges: (text) =>
        /hospital\s*privil|operating\s*privil|surgical\s*center|accredited\s*facility|hospital\s*affiliat/i.test(text),
    surgicalFellowship: (text) =>
        /fellowship\s*train|surgical\s*fellowship|completed\s*fellowship|fellowship\s*at|fellow\s*of\s*the/i.test(text),
    freeConsultation: (text) =>
        /free\s*consult|complimentary\s*consult|no.?cost\s*consult|no.?obligation\s*consult/i.test(text),
    publishedArticles: (text) =>
        /published|peer.reviewed|journal|authored|written\s*for/i.test(text),
    patientTestimonials: (text, doc) =>
        /patient\s*testimonial|patient\s*review|patient\s*story|patient\s*experience/i.test(text) ||
        !!doc.querySelector('[class*="testimonial"], [class*="patient-review"]'),
};

/**
 * Analyze trust signal completeness for a page against niche expectations.
 * @param {import('playwright').Page} page
 * @param {string} niche - Industry niche
 * @param {boolean} verbose
 * @returns {Promise<Object>}
 */
async function analyzeTrustCompleteness(page, niche = 'general', verbose = false, sharedPageContext = null) {
    if ((!page || page.isClosed()) && !sharedPageContext) {
        return { score: 0, found: [], missing: [], error: 'Page not available' };
    }

    // Find niche key
    const nicheKey = findNicheKey(niche);
    const requirements = NICHE_TRUST_REQUIREMENTS[nicheKey] || NICHE_TRUST_REQUIREMENTS.general;

    try {
        let signalResults = {};
        
        if (page && !page.isClosed()) {
            signalResults = await page.evaluate((signalNames) => {
                const body = document.body?.textContent?.toLowerCase() || '';
                const results = {};
                
                // Keep original detectors behavior inside the browser
                // (Note: To keep this safe and not duplicate the entire map inside evaluate, 
                // we'll use the existing text/DOM strings).
                // Actually, the original code had the mapping hardcoded inside page.evaluate!
                
                // Reviews
                results.reviews = /reviews?|testimonials?|★|⭐|star rating|\d+\s*out of\s*5/i.test(body) ||
                    !!document.querySelector('[class*="review"], [class*="testimonial"], [class*="rating"], [class*="stars"]');
                // Provider credentials
                results.providerCredentials = /\b(M\.?D\.?|D\.?O\.?|D\.?D\.?S\.?|D\.?M\.?D\.?|Ph\.?D\.?|J\.?D\.?|Esq\.?|R\.?N\.?|N\.?P\.?|P\.?A\.?|D\.?C\.?)\b/i.test(body) ||
                    /board.certified|fellowship|residency|credentials|qualifications/i.test(body);
                results.certifications = /certified|certification|accredited|credentials|licensed/i.test(body) ||
                    !!document.querySelector('[class*="certification"], [class*="accredit"], img[alt*="certified"]');
                results.beforeAfter = /before\s*(and|&)\s*after|results gallery|transformation/i.test(body) ||
                    !!document.querySelector('[class*="before-after"], [class*="gallery"], [class*="results"]');
                results.hipaaNotice = /hipaa|health insurance portability|protected health information/i.test(body);
                results.boardCertification = /board.certified|american board of|abms|specialty board/i.test(body);
                results.insuranceAccepted = /insurance\s*(accepted|plans|coverage)|we\s*accept|in-network/i.test(body);
                results.caseResults = /case results|verdicts|settlements|million\s*(dollar|recovery)|case.*won/i.test(body);
                results.barMembership = /bar\s*(association|member)|state\s*bar|admitted\s*to\s*practice/i.test(body);
                results.licensing = /licensed|license\s*#|lic\s*#|contractor\s*license|state\s*license/i.test(body);
                results.insurance = /fully\s*insured|bonded\s*(and|&)\s*insured|liability\s*insurance|worker.?s?\s*comp/i.test(body);
                results.bbbRating = /bbb|better\s*business\s*bureau|a\+?\s*rated/i.test(body) ||
                    !!document.querySelector('img[alt*="BBB"], a[href*="bbb.org"]');
                results.warranty = /warranty|guarantee|money.back|satisfaction\s*guarantee/i.test(body);
                results.freeEstimate = /free\s*(estimate|consultation|quote|assessment|inspection|evaluation)/i.test(body);
                results.yearsExperience = /\d+\s*(years?|yrs?)\s*(of\s*)?(experience|in\s*business|serving)/i.test(body);
                results.emergencyService = /24.?7|emergency\s*service|same.day|after.hours/i.test(body);
                results.manufacturerCertifications = /factory\s*authorized|certified\s*(dealer|installer|contractor)|partner\s*program/i.test(body) ||
                    !!document.querySelector('img[alt*="certified"], img[alt*="authorized"]');
                results.serviceMenu = /services|treatments|menu|pricing|our\s*(services|treatments)/i.test(body);
                results.securePayment = /secure\s*(payment|checkout)|ssl|encrypted|pci\s*compliant/i.test(body) ||
                    !!document.querySelector('img[alt*="secure"], img[alt*="ssl"], [class*="secure-badge"]');
                results.returnPolicy = /return\s*policy|refund\s*policy|money.back|returns?\s*(and|&)\s*exchange/i.test(body);
                results.socialProof = /trusted\s*by|used\s*by|loved\s*by|\d+[\s,]*\d*\s*(customers?|clients?|businesses?|users?)/i.test(body) ||
                    !!document.querySelector('[class*="logo-wall"], [class*="client-logos"], [class*="as-seen"]');
                results.contactInfo = /\(\d{3}\)\s*\d{3}[\s-]\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4}|contact\s*us|get\s*in\s*touch/i.test(body);
                results.securityCertifications = /soc\s*2|iso\s*27001|gdpr\s*compliant|security\s*audit/i.test(body);
                results.pricingTransparency = /pricing|plans?\s*(and|&)\s*pricing|starts?\s*at\s*\$/i.test(body);
                results.technologyHighlights = /state.of.the.art|latest\s*technology|advanced\s*(equipment|technology)|3D|digital/i.test(body);
                results.consultationOffer = /free\s*consultation|complimentary\s*consultation|schedule\s*(a|your)\s*consultation/i.test(body);
                results.awards = /award.winning|voted\s*best|top\s*rated|recognized|#1\s*rated/i.test(body) ||
                    !!document.querySelector('img[alt*="award"], img[alt*="winner"], [class*="award"]');
                results.freeTrialDemo = /free\s*trial|start\s*free|demo|try\s*(it\s*)?free/i.test(body);
                results.aboutPage = !!document.querySelector('a[href*="about"], a[href*="team"], a[href*="our-story"]');
                results.serviceDescriptions = !!document.querySelector('a[href*="services"], a[href*="what-we-do"]');
                results.hospitalPrivileges = /hospital\s*privil|operating\s*privil|surgical\s*center|accredited\s*facility|hospital\s*affiliat/i.test(body);
                results.surgicalFellowship = /fellowship\s*train|surgical\s*fellowship|completed\s*fellowship|fellowship\s*at|fellow\s*of\s*the/i.test(body);
                results.freeConsultation = /free\s*consult|complimentary\s*consult|no.?cost\s*consult|no.?obligation\s*consult/i.test(body);
                results.publishedArticles = /published|peer.reviewed|journal|authored|written\s*for/i.test(body);
                results.patientTestimonials = /patient\s*testimonial|patient\s*review|patient\s*story|patient\s*experience/i.test(body) ||
                    !!document.querySelector('[class*="testimonial"], [class*="patient-review"]');

                return results;
            }, Object.keys(SIGNAL_DETECTORS));
        } else if (sharedPageContext) {
            // Fallback: evaluate regexes against sharedPageContext.bodyText
            const body = (sharedPageContext.bodyText || '').toLowerCase();
            const mockDoc = { querySelector: () => null }; // Ignore DOM checks
            Object.keys(SIGNAL_DETECTORS).forEach(name => {
                try {
                    signalResults[name] = SIGNAL_DETECTORS[name](body, mockDoc);
                } catch (e) {
                    signalResults[name] = false;
                }
            });
        }

        // Score against niche requirements
        const found = [];
        const missing = [];

        const allRequired = [
            ...requirements.critical.map(s => ({ name: s, weight: 'critical' })),
            ...requirements.important.map(s => ({ name: s, weight: 'important' })),
            ...(requirements.nice || []).map(s => ({ name: s, weight: 'nice' })),
        ];

        allRequired.forEach(({ name, weight }) => {
            if (signalResults[name]) {
                found.push({ name, weight });
            } else {
                missing.push({ name, weight });
            }
        });

        // Weighted score
        const weightValues = { critical: 30, important: 15, nice: 5 };
        const maxScore = allRequired.reduce((s, r) => s + weightValues[r.weight], 0);
        const earnedScore = found.reduce((s, r) => s + weightValues[r.weight], 0);
        const score = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 50;

        if (verbose) {
            console.log(`[TrustCompleteness] Niche: ${nicheKey}, Found: ${found.length}/${allRequired.length}, Score: ${score}`);
            if (missing.filter(m => m.weight === 'critical').length > 0) {
                console.log(`  Missing critical:`, missing.filter(m => m.weight === 'critical').map(m => m.name));
            }
        }

        return {
            score,
            niche: nicheKey,
            found: found.map(f => f.name),
            missing: missing.map(m => ({ ...m })),
            breakdown: {
                critical: { found: found.filter(f => f.weight === 'critical').length, total: requirements.critical.length },
                important: { found: found.filter(f => f.weight === 'important').length, total: requirements.important.length },
                nice: { found: found.filter(f => f.weight === 'nice').length, total: (requirements.nice || []).length },
            },
        };
    } catch (err) {
        if (verbose) console.error('[TrustCompleteness] Analysis failed:', err.message);
        return { score: 0, found: [], missing: [], error: err.message };
    }
}

function findNicheKey(niche) {
    const n = (niche || '').toLowerCase().trim();
    if (!n) return 'general';

    // 1. Try exact match against niche keys first
    if (NICHE_TRUST_REQUIREMENTS[n]) return n;

    // 2. Try substring match against multi-word niche keys (e.g. 'home services', 'plastic surgery', 'real estate')
    for (const key of Object.keys(NICHE_TRUST_REQUIREMENTS)) {
        if (key.includes(' ') && n.includes(key)) return key;
    }

    // 3. Precise pattern matching — ordered from most specific to least
    //    Medical specialties (each is distinct, do NOT collapse)
    if (/plastic\s*surg|cosmetic\s*surg|facial\s*surg|reconstructive/i.test(n)) return 'plastic surgery';
    if (/dermatolog|skin\s*care\s*clinic|skin\s*doctor/i.test(n)) return 'dermatology';
    if (/orthop|ortho\s*surg|sports\s*medicine|joint\s*replacement/i.test(n)) return 'orthopedics';
    if (/optometr|ophthalmolog|eye\s*doctor|vision\s*care|eye\s*care/i.test(n)) return 'optometry';
    if (/veterinar|vet\s*clinic|animal\s*hospital|pet\s*care/i.test(n)) return 'veterinary';
    if (/dental|dentist|orthodont|oral\s*surg|periodont|endodont/i.test(n)) return 'dental';
    if (/med\s*spa|medspa|medical\s*spa|aesthetic.*clinic|injectables|botox|filler/i.test(n)) return 'medspa';
    if (/spa|day\s*spa|wellness\s*center|massage\s*therapy|salon|beauty/i.test(n)) return 'spa';
    // Catch-all medical (after specific specialties)
    if (/medical|healthcare|hospital|physician|clinic|cardiol|neurolog|urolog|oncol|pediatr|chiropr|physical\s*therap/i.test(n)) return 'medical';

    //    Legal
    if (/law|legal|attorney|lawyer|personal\s*injury|criminal\s*defense|family\s*law|immigration|estate\s*planning/i.test(n)) return 'legal';

    //    Home services specialties
    if (/hvac|heating|air\s*condition|furnace/i.test(n)) return 'hvac';
    if (/roof/i.test(n)) return 'roofing';
    if (/plumb/i.test(n)) return 'plumbing';
    if (/electric/i.test(n)) return 'electrical';
    if (/landscap|lawn|tree\s*service|pest\s*control|clean|painting|remodel|handyman|contractor|home\s*improvement|home\s*service|general\s*contract/i.test(n)) return 'home services';

    //    Real estate
    if (/real\s*estate|realtor|property|broker|mortgage/i.test(n)) return 'real estate';

    //    Food / hospitality
    if (/restaurant|cafe|bakery|bar\s*&|catering|food\s*service/i.test(n)) return 'restaurant';

    //    Fitness
    if (/fitness|gym|personal\s*train|yoga|pilates|crossfit|martial\s*art/i.test(n)) return 'fitness';

    //    Tech / commerce
    if (/e-?commerce|online\s*store|shop|retail|marketplace/i.test(n)) return 'ecommerce';
    if (/saas|software|app|platform|startup|tech/i.test(n)) return 'saas';

    // 4. Single-word key match as last resort
    for (const key of Object.keys(NICHE_TRUST_REQUIREMENTS)) {
        if (!key.includes(' ') && n.includes(key)) return key;
    }

    return 'general';
}

module.exports = { analyzeTrustCompleteness, findNicheKey, NICHE_TRUST_REQUIREMENTS };
