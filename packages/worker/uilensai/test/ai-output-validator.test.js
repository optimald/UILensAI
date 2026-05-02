/**
 * AI Output Validator Tests — validates the trust boundary layer
 * that checks AI module responses for missing fields, wrong types,
 * and hallucinations.
 *
 * Run with: node --test packages/worker/uilensai/test/ai-output-validator.test.js
 */


const {
  validateModuleAiResponse,
  detectHallucinations,
  aggregateAiTrustMetrics,
} = require('../utils/ai-output-validator');

// ─── validateModuleAiResponse ────────────────────────────────────────────────

describe('validateModuleAiResponse', () => {
  it('rejects null response', () => {
    const result = validateModuleAiResponse('security', null);
    expect(result.valid).toBe(false);
    expect(result.confidence).toBe('low');
  });

  it('accepts well-formed security response', () => {
    const aiResponse = {
      summary: { score: 75, rating: 'Underperforming', topIssues: ['Missing CSP header'] },
      headers: {
        contentSecurityPolicy: { present: false, score: 0, recommendation: 'Add CSP header' },
        strictTransportSecurity: { present: true, score: 90 },
      },
      ssl: { isHttps: true, score: 85 },
      recommendations: {
        items: [{ text: 'Implement a Content-Security-Policy header to prevent XSS attacks' }],
      },
      issues: {
        items: [{ title: 'Missing CSP', severity: 'High', description: 'No CSP detected' }],
      },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.confidence).toBe('high');
    expect(result.fieldsMissing.length).toBe(0);
  });

  it('flags missing summary', () => {
    const aiResponse = {
      headers: {},
      ssl: {},
      recommendations: { items: [{ text: 'Add security headers for protection' }] },
      issues: { items: [{ title: 'Weak security' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsMissing.includes('summary')).toBeTruthy();
  });

  it('flags invalid summary.score', () => {
    const aiResponse = {
      summary: { score: 'high', rating: 'Good', topIssues: ['stuff'] },
      headers: {},
      ssl: {},
      recommendations: { items: [{ text: 'Do security stuff right now please' }] },
      issues: { items: [{ title: 'Issue 1' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsWrongType.includes('summary.score')).toBeTruthy();
  });

  it('flags out-of-range summary.score (>100)', () => {
    const aiResponse = {
      summary: { score: 150, rating: 'Good', topIssues: ['stuff'] },
      headers: {},
      ssl: {},
      recommendations: { items: [{ text: 'Do security stuff right now please' }] },
      issues: { items: [{ title: 'Issue 1' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsWrongType.includes('summary.score')).toBeTruthy();
  });

  it('flags empty recommendations', () => {
    const aiResponse = {
      summary: { score: 50, rating: 'Poor', topIssues: ['Issue'] },
      headers: {},
      ssl: {},
      recommendations: { items: [] },
      issues: { items: [{ title: 'Issue 1' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsMissing.includes('recommendations.items')).toBeTruthy();
  });

  it('flags too-short recommendation text', () => {
    const aiResponse = {
      summary: { score: 50, rating: 'Poor', topIssues: ['Issue'] },
      headers: {},
      ssl: {},
      recommendations: { items: [{ text: 'Fix it' }] }, // < 10 chars
      issues: { items: [{ title: 'Issue 1' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsWrongType.includes('recommendations.items[0].text')).toBeTruthy();
  });

  it('gives medium confidence for 1-2 missing fields', () => {
    const aiResponse = {
      summary: { score: 50, rating: 'Poor', topIssues: ['Issue'] },
      // missing headers
      ssl: {},
      recommendations: { items: [{ text: 'Implement strict transport security headers' }] },
      issues: { items: [{ title: 'Issue 1' }] },
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.confidence).toBe('medium');
  });

  it('gives low confidence for 3+ missing fields', () => {
    const aiResponse = {
      summary: { score: 50, rating: 'Poor', topIssues: ['Issue'] },
      // missing headers, ssl, recommendations, issues
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.confidence).toBe('low');
    expect(result.valid).toBe(false);
  });

  it('works with seoContent module', () => {
    const aiResponse = {
      summary: { score: 80, rating: 'Needs Work', topIssues: ['Short meta description'] },
      metadata: { title: { text: 'Test Page', score: 85 } },
      content: { readabilityScore: 70 },
      recommendations: { items: [{ text: 'Extend the meta description to include target keywords' }] },
      issues: { items: [{ title: 'Meta too short' }] },
    };
    const result = validateModuleAiResponse('seoContent', aiResponse);
    expect(result.confidence).toBe('high');
  });

  it('handles array-format recommendations', () => {
    const aiResponse = {
      summary: { score: 60, rating: 'Poor', topIssues: ['Issue 1'] },
      headers: {},
      ssl: {},
      recommendations: [{ text: 'Add a content security policy header to the server' }],
      issues: [{ title: 'Problem 1' }],
    };
    const result = validateModuleAiResponse('security', aiResponse);
    expect(result.fieldsMissing.filter(f => f === 'recommendations.items').length).toBe(0);
  });
});

// ─── detectHallucinations ────────────────────────────────────────────────────

describe('detectHallucinations', () => {
  it('returns empty when no collected data', () => {
    const result = detectHallucinations('security', {}, null);
    expect(result.flaggedFields.length).toBe(0);
    expect(result.confidence).toBe('high');
  });

  it('flags security header presence contradiction', () => {
    const aiResponse = {
      headers: {
        strictTransportSecurity: { present: true, score: 90 },
      },
    };
    const collectedData = {
      headers: {
        'strict-transport-security': null, // not present
      },
    };
    const result = detectHallucinations('security', aiResponse, collectedData);
    expect(result.flaggedFields.length > 0).toBeTruthy();
    expect(result.flaggedFields[0].field).toBe('headers.strictTransportSecurity.present');
  });

  it('does not flag when AI and data agree', () => {
    const aiResponse = {
      headers: {
        strictTransportSecurity: { present: true, score: 90 },
      },
    };
    const collectedData = {
      headers: {
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      },
    };
    const result = detectHallucinations('security', aiResponse, collectedData);
    expect(result.flaggedFields.length).toBe(0);
  });

  it('flags HTTPS contradiction', () => {
    const aiResponse = { ssl: { isHttps: true } };
    const collectedData = { isHttps: false };
    const result = detectHallucinations('security', aiResponse, collectedData);
    expect(result.flaggedFields.length > 0).toBeTruthy();
    expect(result.flaggedFields[0].field).toBe('ssl.isHttps');
  });

  it('flags fabricated UI selectors', () => {
    const aiResponse = {
      viewportAnalyses: {
        mobile: {
          structured: {
            branding: {
              visualEvidence: [
                { elementSelector: '.real-element' },
                { elementSelector: '.fabricated-element' },
              ],
            },
          },
        },
      },
    };
    const collectedData = {
      discoveredSelectors: {
        branding: ['.real-element'],
      },
    };
    const result = detectHallucinations('ui', aiResponse, collectedData);
    expect(result.flaggedFields.length > 0).toBeTruthy();
  });

  it('returns medium confidence for 1-2 flagged fields', () => {
    const aiResponse = { ssl: { isHttps: true } };
    const collectedData = { isHttps: false };
    const result = detectHallucinations('security', aiResponse, collectedData);
    expect(result.confidence).toBe('medium');
  });
});

// ─── aggregateAiTrustMetrics ─────────────────────────────────────────────────

describe('aggregateAiTrustMetrics', () => {
  it('aggregates across multiple modules', () => {
    const moduleResults = {
      security: {
        validation: { fieldsValidated: 10, fieldsFlagged: 1, confidence: 'high' },
        hallucination: { flaggedFields: [], confidence: 'high' },
      },
      seoContent: {
        validation: { fieldsValidated: 8, fieldsFlagged: 0, confidence: 'high' },
        hallucination: { flaggedFields: [{ field: 'h1Count' }], confidence: 'medium' },
      },
    };
    const metrics = aggregateAiTrustMetrics(moduleResults);
    expect(metrics.fieldsValidated).toBe(18);
    expect(metrics.fieldsFlagged).toBe(1);
    expect(metrics.hallucinationsDetected).toBe(1);
    expect(metrics.overallConfidence).toBe('medium'); // medium beats high
  });

  it('returns low confidence if any module is low', () => {
    const moduleResults = {
      security: {
        validation: { fieldsValidated: 5, fieldsFlagged: 4, confidence: 'low' },
        hallucination: { flaggedFields: [], confidence: 'high' },
      },
    };
    const metrics = aggregateAiTrustMetrics(moduleResults);
    expect(metrics.overallConfidence).toBe('low');
  });

  it('handles empty results', () => {
    const metrics = aggregateAiTrustMetrics({});
    expect(metrics.fieldsValidated).toBe(0);
    expect(metrics.fieldsFlagged).toBe(0);
    expect(metrics.overallConfidence).toBe('high');
  });
});
