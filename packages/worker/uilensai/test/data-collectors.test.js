const { collectDomSignals } = require('../utils/data-collectors/dom-structure-collector');

describe('DOM Structure Collector', () => {
    const mockHtml = `
        <!doctype html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Page For SEO</title>
            <meta name="description" content="This is a test description that is long enough to be scored nicely by the SEO analyzer.">
            <link rel="canonical" href="https://example.com/test">
            <meta property="og:title" content="Test Page">
            <script type="application/ld+json">{"@context": "https://schema.org", "@type": "WebPage"}</script>
        </head>
        <body>
            <header role="banner">
                <nav role="navigation">
                    <a href="/">Home</a>
                    <a href="/privacy-policy">Privacy Policy</a>
                </nav>
            </header>
            <main role="main">
                <h1>Main Heading</h1>
                <h2>Sub Heading</h2>
                <h3>Another Level</h3>
                
                <p>This is a test paragraph with enough words to satisfy the word count checker. We need at least a few words here to test the split function properly.</p>
                
                <img src="/logo.png" alt="Company Logo">
                <img src="/spacer.gif" alt=""> <!-- Empty alt -->
                <img src="/bad.jpg"> <!-- Missing alt -->
                
                <form action="/submit" method="post">
                    <label for="name">Name:</label>
                    <input type="text" id="name" name="name">
                    
                    <label>Email: <input type="email" name="email"></label>
                    
                    <input type="tel" aria-label="Phone Number" name="phone">
                    
                    <button class="btn-primary">Submit Now</button>
                </form>
                
                <div class="testimonial">Great service!</div>
            </main>
            <footer role="contentinfo">
                <a href="#main-content">Skip to content</a>
                <a href="https://twitter.com/example">Twitter</a>
                <div id="cookie-consent-banner">We use cookies</div>
                <script src="https://www.google-analytics.com/analytics.js"></script>
            </footer>
        </body>
        </html>
    `;

    it('extracts SEO signals correctly', () => {
        const signals = collectDomSignals(mockHtml);
        expect(signals.titleLength).toBe(17);
        expect(signals.metaDescriptionLength).toBe(87);
        expect(signals.h1Count).toBe(1);
        expect(signals.hasCanonical).toBe(true);
        expect(signals.hasOgTags).toBe(true);
        expect(signals.hasSchemaMarkup).toBe(true);
        expect(signals.wordCount >= 20).toBeTruthy();
    });

    it('extracts Accessibility signals correctly', () => {
        const signals = collectDomSignals(mockHtml);
        expect(signals.altTextCoverage).toBe(1 / 3, '1 out of 3 images has valid alt text');
        expect(signals.headingHierarchyValid).toBe(true, 'H1 -> H2 -> H3 is valid');
        expect(signals.formLabelCoverage).toBe(1.0, 'All 3 inputs are labeled');
        expect(signals.hasAriaLandmarks).toBe(true);
        expect(signals.hasLangAttribute).toBe(true);
        expect(signals.hasSkipLink).toBe(true);
    });

    it('extracts Privacy signals correctly', () => {
        const signals = collectDomSignals(mockHtml);
        expect(signals.hasPrivacyPolicy).toBe(true);
        expect(signals.hasConsentBanner).toBe(true);
        expect(signals.thirdPartyTrackerCount).toBe(1, 'Google Analytics script detected');
    });

    it('extracts UI/Compatibility signals correctly', () => {
        const signals = collectDomSignals(mockHtml);
        expect(signals.hasViewportMeta).toBe(true);
        expect(signals.hasDoctype).toBe(true);
        expect(signals.hasCharsetMeta).toBe(true);
        expect(signals.hasResponsiveImages).toBe(false);
    });

    it('extracts Marketing/Conversion signals correctly', () => {
        const signals = collectDomSignals(mockHtml);
        expect(signals.hasAnalytics).toBe(true);
        expect(signals.socialLinksCount).toBe(1, 'Twitter link found');
        expect(signals.formCount).toBe(1);
        expect(signals.ctaCount).toBe(1, 'Submit button found');
        expect(signals.trustSignalCount).toBe(1, 'Testimonial div found');
    });

    it('handles invalid heading hierarchy', () => {
        const badHtml = `<h1>Main</h1><h3>Skipped H2</h3>`;
        const signals = collectDomSignals(badHtml);
        expect(signals.headingHierarchyValid).toBe(false, 'H1 -> H3 is an invalid skip');
    });

    it('handles empty inputs robustly', () => {
        const signals = collectDomSignals('');
        expect(signals).toEqual({});
        
        const nullSignals = collectDomSignals(null);
        expect(nullSignals).toEqual({});
    });
});
