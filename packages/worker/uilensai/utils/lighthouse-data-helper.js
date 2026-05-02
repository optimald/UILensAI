/**
 * Lighthouse Data Helper Utility
 * Extracts and processes Lighthouse data for use by other modules
 */

function getLighthouseDataStatus(performanceModuleData) {
    if (!performanceModuleData || !performanceModuleData.lighthouse) {
        return 'unavailable';
    }
    if (performanceModuleData.lighthouse.version) {
        return 'available';
    }
    return 'partial';
}

function getLighthouseScores(performanceModuleData) {
    if (!performanceModuleData || !performanceModuleData.lighthouse || !performanceModuleData.lighthouse.scores) {
        return {
            performance: null,
            accessibility: null,
            bestPractices: null,
            seo: null,
            pwa: null
        };
    }
    return performanceModuleData.lighthouse.scores;
}

function getAccessibilityAudits(performanceModuleData) {
    if (!performanceModuleData || !performanceModuleData.lighthouse || !performanceModuleData.lighthouse.audits) {
        return [];
    }
    
    const audits = performanceModuleData.lighthouse.audits;
    const accessibilityAudits = [];
    
    // Extract accessibility-related audits from Lighthouse
    const accessibilityAuditKeys = [
        'color-contrast',
        'image-alt',
        'label',
        'link-name',
        'button-name',
        'document-title',
        'html-has-lang',
        'html-lang-valid',
        'meta-viewport',
        'aria-allowed-attr',
        'aria-hidden-body',
        'aria-hidden-focus',
        'aria-input-field-name',
        'aria-required-attr',
        'aria-required-children',
        'aria-required-parent',
        'aria-roles',
        'aria-toggle-field-name',
        'aria-valid-attr',
        'aria-valid-attr-value',
        'duplicate-id-aria',
        'heading-order',
        'landmark-one-main',
        'list',
        'listitem',
        'meta-refresh',
        'object-alt',
        'tabindex',
        'td-headers-attr',
        'th-has-data-cells',
        'valid-lang'
    ];
    
    accessibilityAuditKeys.forEach(key => {
        if (audits[key]) {
            let failingNodes = [];
            if (audits[key].details) {
                if (Array.isArray(audits[key].details.items)) {
                    audits[key].details.items.forEach(item => {
                        if (item.node && item.node.selector) {
                            failingNodes.push(item.node.selector);
                        }
                    });
                } else if (audits[key].details.node && audits[key].details.node.selector) {
                    failingNodes.push(audits[key].details.node.selector);
                }
            }

            accessibilityAudits.push({
                id: key,
                title: audits[key].title || key,
                description: audits[key].description || '',
                score: audits[key].score,
                scoreDisplayMode: audits[key].scoreDisplayMode,
                details: audits[key].details || null,
                failingNodes: failingNodes.length > 0 ? failingNodes : undefined
            });
        }
    });
    
    return accessibilityAudits;
}

function getLighthouseDataSummary(performanceModuleData) {
    const status = getLighthouseDataStatus(performanceModuleData);
    const scores = getLighthouseScores(performanceModuleData);
    const audits = getAccessibilityAudits(performanceModuleData);
    
    if (status === 'unavailable') {
        return 'No Lighthouse data available';
    }
    
    const accessibilityScore = scores.accessibility ? Math.round(scores.accessibility * 100) : 'N/A';
    return `Lighthouse data: ${status}, accessibility score: ${accessibilityScore}, ${audits.length} audits`;
}

module.exports = {
    getLighthouseDataStatus,
    getLighthouseScores,
    getAccessibilityAudits,
    getLighthouseDataSummary
};
