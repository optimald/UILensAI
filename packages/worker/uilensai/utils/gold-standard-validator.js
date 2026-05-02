/**
 * Gold Standard Validator for UILensAI
 * 
 * This module provides comprehensive validation to ensure all analysis modules
 * meet the gold standard quality criteria and provides detailed failure analysis.
 */

const { v4: uuidv4 } = require('uuid');

// Gold Standard Criteria
const GOLD_STANDARD_CRITERIA = {
    moduleCompletion: 9, // All 9 modules must complete
    schemaValidation: 'SUCCEEDED', // Schema validation must pass
    overallScore: 40, // Minimum overall score
    reportSize: 100000, // Minimum report size in bytes (100KB)
    noFallbackData: true, // No fallback data usage
    moduleStatuses: ['Success', 'Partial'], // Valid module statuses
    minimumModuleScores: {
        performance: 40,
        conversion: 10,
        marketing: 10,
        ui: 10,
        seoContent: 10,
        security: 10,
        privacy: 10,
        compatibility: 10,
        accessibility: 10
    }
};

/**
 * Comprehensive gold standard validation
 * @param {Object} reportData - Complete analysis report
 * @param {Object} options - Validation options
 * @returns {Object} Validation results
 */
async function validateGoldStandard(reportData, options = {}) {
    const { verbose = false, strictMode = true } = options;
    
    if (verbose) {
        console.log('[GoldStandardValidator] Starting comprehensive validation...');
    }
    
    const validationResults = {
        timestamp: new Date().toISOString(),
        overallPassed: false,
        criteria: {},
        failures: [],
        warnings: [],
        recommendations: [],
        qualityScore: 0,
        details: {}
    };
    
    try {
        // Criterion 1: Module Completion
        const moduleCompletionResult = validateModuleCompletion(reportData);
        validationResults.criteria.moduleCompletion = moduleCompletionResult;
        if (!moduleCompletionResult.passed) {
            validationResults.failures.push(moduleCompletionResult.reason);
        }
        
        // Criterion 2: Schema Validation
        const schemaValidationResult = validateSchemaCompliance(reportData);
        validationResults.criteria.schemaValidation = schemaValidationResult;
        if (!schemaValidationResult.passed) {
            validationResults.failures.push(schemaValidationResult.reason);
        }
        
        // Criterion 3: Overall Score
        const overallScoreResult = validateOverallScore(reportData);
        validationResults.criteria.overallScore = overallScoreResult;
        if (!overallScoreResult.passed) {
            validationResults.failures.push(overallScoreResult.reason);
        }
        
        // Criterion 4: Report Size
        const reportSizeResult = validateReportSize(reportData);
        validationResults.criteria.reportSize = reportSizeResult;
        if (!reportSizeResult.passed) {
            validationResults.failures.push(reportSizeResult.reason);
        }
        
        // Criterion 5: Fallback Data Detection
        const fallbackDataResult = validateNoFallbackData(reportData);
        validationResults.criteria.noFallbackData = fallbackDataResult;
        if (!fallbackDataResult.passed) {
            validationResults.failures.push(fallbackDataResult.reason);
        }
        
        // Criterion 6: Module Status Validation
        const moduleStatusResult = validateModuleStatuses(reportData);
        validationResults.criteria.moduleStatuses = moduleStatusResult;
        if (!moduleStatusResult.passed) {
            validationResults.failures.push(moduleStatusResult.reason);
        }
        
        // Criterion 7: Individual Module Score Validation
        const moduleScoresResult = validateModuleScores(reportData);
        validationResults.criteria.moduleScores = moduleScoresResult;
        if (!moduleScoresResult.passed) {
            validationResults.failures.push(moduleScoresResult.reason);
        }
        
        // Criterion 8: Cross-Module Integration Validation
        const crossModuleResult = validateCrossModuleIntegration(reportData);
        validationResults.criteria.crossModuleIntegration = crossModuleResult;
        if (!crossModuleResult.passed) {
            validationResults.warnings.push(crossModuleResult.reason);
        }
        
        // Calculate overall quality score
        validationResults.qualityScore = calculateQualityScore(validationResults.criteria);
        
        // Determine if overall validation passed
        validationResults.overallPassed = validationResults.failures.length === 0;
        
        // Generate recommendations
        validationResults.recommendations = generateRecommendations(validationResults);
        
        if (verbose) {
            console.log(`[GoldStandardValidator] Validation completed. Passed: ${validationResults.overallPassed}, Quality Score: ${validationResults.qualityScore}/100`);
        }
        
    } catch (error) {
        console.error('[GoldStandardValidator] Validation error:', error);
        validationResults.failures.push(`Validation system error: ${error.message}`);
        validationResults.overallPassed = false;
    }
    
    return validationResults;
}

/**
 * Validate that all required modules completed successfully
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateModuleCompletion(reportData) {
    const requiredModules = ['ui', 'performance', 'seoContent', 'security', 'privacy', 'compatibility', 'marketing', 'conversion', 'accessibility'];
    const completedModules = [];
    const failedModules = [];
    
    requiredModules.forEach(moduleName => {
        if (reportData[moduleName] && reportData[moduleName].summary && reportData[moduleName].summary.score > 0) {
            completedModules.push(moduleName);
        } else {
            failedModules.push(moduleName);
        }
    });
    
    const passed = completedModules.length >= GOLD_STANDARD_CRITERIA.moduleCompletion;
    
    return {
        passed,
        completedCount: completedModules.length,
        requiredCount: GOLD_STANDARD_CRITERIA.moduleCompletion,
        completedModules,
        failedModules,
        reason: passed ? null : `Only ${completedModules.length}/${GOLD_STANDARD_CRITERIA.moduleCompletion} modules completed successfully. Failed: ${failedModules.join(', ')}`
    };
}

/**
 * Validate schema compliance
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateSchemaCompliance(reportData) {
    // Check for basic schema structure
    const hasRequiredFields = reportData && 
        typeof reportData === 'object' &&
        reportData.summary &&
        reportData.modules &&
        Array.isArray(reportData.errors);
    
    if (!hasRequiredFields) {
        return {
            passed: false,
            reason: 'Report missing required schema fields (summary, modules, errors)'
        };
    }
    
    // Check for schema validation errors
    const hasSchemaErrors = reportData.errors && 
        reportData.errors.some(error => 
            error.includes('schema') || 
            error.includes('validation') || 
            error.includes('JSON')
        );
    
    if (hasSchemaErrors) {
        return {
            passed: false,
            reason: 'Schema validation errors detected in report'
        };
    }
    
    return {
        passed: true,
        reason: null
    };
}

/**
 * Validate overall score meets minimum requirement
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateOverallScore(reportData) {
    const overallScore = reportData.summary?.overallScore || 0;
    const passed = overallScore >= GOLD_STANDARD_CRITERIA.overallScore;
    
    return {
        passed,
        score: overallScore,
        requiredScore: GOLD_STANDARD_CRITERIA.overallScore,
        reason: passed ? null : `Overall score ${overallScore} below minimum requirement of ${GOLD_STANDARD_CRITERIA.overallScore}`
    };
}

/**
 * Validate report size meets minimum requirement
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateReportSize(reportData) {
    const reportSize = JSON.stringify(reportData).length;
    const passed = reportSize >= GOLD_STANDARD_CRITERIA.reportSize;
    
    return {
        passed,
        size: reportSize,
        requiredSize: GOLD_STANDARD_CRITERIA.reportSize,
        sizeKB: Math.round(reportSize / 1024),
        requiredSizeKB: Math.round(GOLD_STANDARD_CRITERIA.reportSize / 1024),
        reason: passed ? null : `Report size ${Math.round(reportSize/1024)}KB below minimum requirement of ${Math.round(GOLD_STANDARD_CRITERIA.reportSize/1024)}KB`
    };
}

/**
 * Validate no fallback data is used
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateNoFallbackData(reportData) {
    const fallbackDetected = [];
    
    // Check performance module for fallback data
    if (reportData.performance && reportData.performance.lighthouse) {
        const version = reportData.performance.lighthouse.version;
        if (version && version.includes('fallback')) {
            fallbackDetected.push(`Performance module using fallback data (${version})`);
        }
    }
    
    // Check other modules for fallback indicators
    const modulesToCheck = ['ui', 'seoContent', 'security', 'privacy', 'compatibility', 'marketing', 'conversion', 'accessibility'];
    modulesToCheck.forEach(moduleName => {
        if (reportData[moduleName] && reportData[moduleName].error && 
            reportData[moduleName].error.includes('fallback')) {
            fallbackDetected.push(`${moduleName} module using fallback data`);
        }
    });
    
    const passed = fallbackDetected.length === 0;
    
    return {
        passed,
        fallbackDetected,
        reason: passed ? null : `Fallback data detected: ${fallbackDetected.join(', ')}`
    };
}

/**
 * Validate module statuses are acceptable
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateModuleStatuses(reportData) {
    const invalidStatuses = [];
    const modulesToCheck = ['ui', 'performance', 'seoContent', 'security', 'privacy', 'compatibility', 'marketing', 'conversion', 'accessibility'];
    
    modulesToCheck.forEach(moduleName => {
        if (reportData[moduleName]) {
            const status = reportData[moduleName].status || 'Unknown';
            if (!GOLD_STANDARD_CRITERIA.moduleStatuses.includes(status)) {
                invalidStatuses.push(`${moduleName}: ${status}`);
            }
        }
    });
    
    const passed = invalidStatuses.length === 0;
    
    return {
        passed,
        invalidStatuses,
        reason: passed ? null : `Invalid module statuses: ${invalidStatuses.join(', ')}`
    };
}

/**
 * Validate individual module scores meet minimum requirements
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateModuleScores(reportData) {
    const failedModules = [];
    const moduleScores = {};
    
    Object.entries(GOLD_STANDARD_CRITERIA.minimumModuleScores).forEach(([moduleName, minimumScore]) => {
        const moduleData = reportData[moduleName];
        const score = moduleData?.summary?.score || 0;
        moduleScores[moduleName] = score;
        
        if (score < minimumScore) {
            failedModules.push(`${moduleName}: ${score}/${minimumScore}`);
        }
    });
    
    const passed = failedModules.length === 0;
    
    return {
        passed,
        moduleScores,
        failedModules,
        reason: passed ? null : `Module scores below minimum: ${failedModules.join(', ')}`
    };
}

/**
 * Validate cross-module integration
 * @param {Object} reportData - Analysis report data
 * @returns {Object} Validation result
 */
function validateCrossModuleIntegration(reportData) {
    // Check for cross-module insights
    const hasCrossModuleInsights = reportData.crossModuleInsights && 
        Array.isArray(reportData.crossModuleInsights) && 
        reportData.crossModuleInsights.length > 0;
    
    // Check for cross-module recommendations
    const hasCrossModuleRecommendations = reportData.topRecommendations && 
        Array.isArray(reportData.topRecommendations) && 
        reportData.topRecommendations.length > 0;
    
    const passed = hasCrossModuleInsights || hasCrossModuleRecommendations;
    
    return {
        passed,
        hasCrossModuleInsights,
        hasCrossModuleRecommendations,
        reason: passed ? null : 'No cross-module insights or recommendations detected'
    };
}

/**
 * Calculate overall quality score based on validation criteria
 * @param {Object} criteria - Validation criteria results
 * @returns {number} Quality score (0-100)
 */
function calculateQualityScore(criteria) {
    let score = 0;
    let totalWeight = 0;
    
    // Weight each criterion
    const weights = {
        moduleCompletion: 25,
        schemaValidation: 20,
        overallScore: 20,
        reportSize: 10,
        noFallbackData: 15,
        moduleStatuses: 5,
        moduleScores: 5
    };
    
    Object.entries(weights).forEach(([criterion, weight]) => {
        if (criteria[criterion]) {
            score += criteria[criterion].passed ? weight : 0;
        }
        totalWeight += weight;
    });
    
    return Math.round((score / totalWeight) * 100);
}

/**
 * Generate recommendations based on validation failures
 * @param {Object} validationResults - Complete validation results
 * @returns {Array} Array of recommendations
 */
function generateRecommendations(validationResults) {
    const recommendations = [];
    
    if (validationResults.failures.length > 0) {
        recommendations.push({
            id: uuidv4(),
            priority: 'Critical',
            text: `Address ${validationResults.failures.length} critical validation failures to achieve gold standard quality`,
            impact: 'High',
            effort: 'High'
        });
    }
    
    if (validationResults.warnings.length > 0) {
        recommendations.push({
            id: uuidv4(),
            priority: 'High',
            text: `Resolve ${validationResults.warnings.length} warnings to improve overall quality`,
            impact: 'Medium',
            effort: 'Moderate'
        });
    }
    
    // Specific recommendations based on criteria failures
    Object.entries(validationResults.criteria).forEach(([criterion, result]) => {
        if (!result.passed) {
            switch (criterion) {
                case 'moduleCompletion':
                    recommendations.push({
                        id: uuidv4(),
                        priority: 'Critical',
                        text: `Ensure all ${GOLD_STANDARD_CRITERIA.moduleCompletion} modules complete successfully`,
                        impact: 'High',
                        effort: 'High'
                    });
                    break;
                case 'overallScore':
                    recommendations.push({
                        id: uuidv4(),
                        priority: 'High',
                        text: `Improve overall score from ${result.score} to at least ${GOLD_STANDARD_CRITERIA.overallScore}`,
                        impact: 'High',
                        effort: 'Moderate'
                    });
                    break;
                case 'noFallbackData':
                    recommendations.push({
                        id: uuidv4(),
                        priority: 'Critical',
                        text: 'Eliminate fallback data usage and ensure real analysis data',
                        impact: 'High',
                        effort: 'High'
                    });
                    break;
            }
        }
    });
    
    return recommendations;
}

/**
 * Generate detailed failure analysis report
 * @param {Object} validationResults - Validation results
 * @returns {Object} Detailed failure analysis
 */
function generateFailureAnalysis(validationResults) {
    const analysis = {
        timestamp: new Date().toISOString(),
        summary: {
            totalFailures: validationResults.failures.length,
            totalWarnings: validationResults.warnings.length,
            qualityScore: validationResults.qualityScore,
            overallStatus: validationResults.overallPassed ? 'PASSED' : 'FAILED'
        },
        failures: validationResults.failures.map(failure => ({
            id: uuidv4(),
            failure,
            severity: 'Critical',
            impact: 'High',
            suggestedAction: 'Immediate remediation required'
        })),
        warnings: validationResults.warnings.map(warning => ({
            id: uuidv4(),
            warning,
            severity: 'Medium',
            impact: 'Medium',
            suggestedAction: 'Address when possible'
        })),
        recommendations: validationResults.recommendations,
        criteriaDetails: validationResults.criteria
    };
    
    return analysis;
}

module.exports = {
    validateGoldStandard,
    generateFailureAnalysis,
    GOLD_STANDARD_CRITERIA
}; 