/**
 * Scoring Engine Tests — validates deterministic base scoring,
 * composition with AI scores, and overall report score calculation.
 *
 * Run with: node --test packages/worker/uilensai/test/scoring-engine.test.js
 */


const {
  calculateDeterministicBaseScore,
  composeDeterministicAndAiScore,
  calculateModuleSummaryScore,
  calculateOverallReportScore,
  calculateWeightedAverage,
  DETERMINISTIC_WEIGHTS,
} = require('../utils/scoring-engine');

// ─── calculateDeterministicBaseScore ─────────────────────────────────────────

describe('calculateDeterministicBaseScore', () => {
  it('returns null when no collectedSignals provided', () => {
    expect(calculateDeterministicBaseScore('security')).toBe(null);
    expect(calculateDeterministicBaseScore('security', undefined)).toBe(null);
  });

  it('returns null for unknown module', () => {
    expect(calculateDeterministicBaseScore('unknownModule', { foo: true })).toBe(null);
  });

  it('scores security module with all checks passing', () => {
    const signals = {
      isHttps: true,
      hasHsts: true,
      hasCsp: true,
      hasXFrameOptions: true,
      hasXContentTypeOptions: true,
      hasReferrerPolicy: true,
      hasPermissionsPolicy: true,
      secureCookieRatio: 1.0,
    };
    const score = calculateDeterministicBaseScore('security', signals);
    expect(score).toBe(100, 'All security checks passing should score 100');
  });

  it('scores security module with no HTTPS as very low', () => {
    const signals = {
      isHttps: false,
      hasHsts: false,
      hasCsp: false,
      hasXFrameOptions: false,
      hasXContentTypeOptions: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false,
      secureCookieRatio: 0,
    };
    const score = calculateDeterministicBaseScore('security', signals);
    expect(score).toBe(0, 'All security checks failing should score 0');
  });

  it('scores security module with partial checks', () => {
    const signals = {
      isHttps: true,
      hasHsts: true,
      hasCsp: false,
      hasXFrameOptions: true,
      hasXContentTypeOptions: true,
    };
    const score = calculateDeterministicBaseScore('security', signals);
    expect(score > 0 && score < 100).toBeTruthy();
    // HTTPS (25% * 100) + HSTS (15% * 100) + CSP (20% * 0) + XFO (10% * 100) + XCTO (10% * 100)
    // = 25 + 15 + 0 + 10 + 10 = 60 out of 80% weight → 60/0.80 = 75
    expect(score >= 70 && score <= 80).toBeTruthy();
  });

  it('scores seoContent module with perfect title and meta', () => {
    const signals = {
      titleLength: 45,   // perfect range 30-60
      metaDescriptionLength: 140,  // perfect range 120-160
      h1Count: 1,
      hasCanonical: true,
      hasRobotsTxt: true,
      hasSitemap: true,
      hasOgTags: true,
      wordCount: 500,
    };
    const score = calculateDeterministicBaseScore('seocontent', signals);
    expect(score).toBe(100, 'Perfect SEO signals should score 100');
  });

  it('scores seoContent with no title as low', () => {
    const signals = {
      titleLength: 0,
      metaDescriptionLength: 0,
      h1Count: 0,
      hasCanonical: false,
      hasRobotsTxt: false,
      hasSitemap: false,
      hasOgTags: false,
      wordCount: 50,
    };
    const score = calculateDeterministicBaseScore('seocontent', signals);
    expect(score < 20).toBeTruthy();
  });

  it('scores performance module from direct metric values', () => {
    const signals = {
      lcpMs: 1500,  // good (< 2500)
      fcpMs: 1000,  // good (< 1800)
      tbtMs: 100,   // good (< 200)
      cls: 0.05,    // good (< 0.1)
    };
    const score = calculateDeterministicBaseScore('performance', signals);
    expect(score >= 90).toBeTruthy();
  });

  it('handles partial signals gracefully', () => {
    const signals = { isHttps: true }; // only one signal
    const score = calculateDeterministicBaseScore('security', signals);
    expect(score).toBe(100, 'Single passing check should score 100 for that check');
  });
});

// ─── composeDeterministicAndAiScore ──────────────────────────────────────────

describe('composeDeterministicAndAiScore', () => {
  it('falls back to pure AI score when no deterministic data', () => {
    const result = composeDeterministicAndAiScore('security', null, 75);
    expect(result.score).toBe(75);
    expect(result.deterministicBase).toBe(null);
    expect(result.deterministicWeight).toBe(0);
  });

  it('blends correctly for security (60% deterministic)', () => {
    const result = composeDeterministicAndAiScore('security', 80, 60);
    // 80 * 0.6 + 60 * 0.4 = 48 + 24 = 72
    expect(result.score).toBe(72);
    expect(result.deterministicBase).toBe(80);
    expect(result.aiScore).toBe(60);
    expect(result.deterministicWeight).toBe(0.6);
  });

  it('blends correctly for performance (80% deterministic)', () => {
    const result = composeDeterministicAndAiScore('performance', 90, 50);
    // 90 * 0.8 + 50 * 0.2 = 72 + 10 = 82
    expect(result.score).toBe(82);
  });

  it('blends correctly for UI (30% deterministic)', () => {
    const result = composeDeterministicAndAiScore('ui', 100, 60);
    // 100 * 0.3 + 60 * 0.7 = 30 + 42 = 72
    expect(result.score).toBe(72);
  });

  it('clamps score to 0-100 range', () => {
    const result = composeDeterministicAndAiScore('security', 100, 100);
    expect(result.score <= 100 && result.score >= 0).toBeTruthy();
  });
});

// ─── calculateModuleSummaryScore with _collectedSignals ──────────────────────

describe('calculateModuleSummaryScore with deterministic composition', () => {
  it('uses pure AI score when _collectedSignals is absent', () => {
    const moduleData = {
      ssl: { score: 80, isHttps: true },
      headers: {},
      summary: { score: 70, rating: 'Underperforming' },
    };
    const score = calculateModuleSummaryScore('security', moduleData, {});
    expect(typeof score === 'number').toBeTruthy();
    expect(score >= 0 && score <= 100).toBeTruthy();
  });

  it('composes deterministic + AI when _collectedSignals is present', () => {
    const moduleData = {
      ssl: { score: 80, isHttps: true },
      headers: {},
      summary: { score: 70 },
      _collectedSignals: {
        isHttps: true,
        hasHsts: true,
        hasCsp: true,
        hasXFrameOptions: true,
        hasXContentTypeOptions: true,
      },
    };
    const score = calculateModuleSummaryScore('security', moduleData, {});
    expect(typeof score === 'number').toBeTruthy();
    expect(score >= 0 && score <= 100).toBeTruthy();
    // Should have _scoreMetrics attached
    expect(moduleData._scoreMetrics).toBeTruthy();
    expect(moduleData._scoreMetrics.deterministicBase !== null).toBeTruthy();
    expect(moduleData._scoreMetrics.deterministicWeight).toBe(0.6);
  });
});

// ─── calculateOverallReportScore ─────────────────────────────────────────────

describe('calculateOverallReportScore', () => {
  it('returns 0 for empty array', () => {
    expect(calculateOverallReportScore([])).toBe(0);
  });

  it('returns weighted average for successful modules', () => {
    const modules = [
      { moduleName: 'ui', status: 'Success', score: 80 },
      { moduleName: 'performance', status: 'Success', score: 90 },
      { moduleName: 'security', status: 'Success', score: 70 },
    ];
    const score = calculateOverallReportScore(modules);
    expect(score >= 70 && score <= 90).toBeTruthy();
  });

  it('ignores failed modules', () => {
    const modules = [
      { moduleName: 'ui', status: 'Success', score: 80 },
      { moduleName: 'performance', status: 'Failed', score: 0 },
    ];
    const score = calculateOverallReportScore(modules);
    expect(score).toBe(80, 'Should only use the successful module');
  });

  it('includes partial modules', () => {
    const modules = [
      { moduleName: 'ui', status: 'Success', score: 80 },
      { moduleName: 'security', status: 'Partial', score: 50 },
    ];
    const score = calculateOverallReportScore(modules);
    expect(score > 50 && score < 80).toBeTruthy();
  });

  it('returns 5 when all modules failed', () => {
    const modules = [
      { moduleName: 'ui', status: 'Failed', score: 0 },
      { moduleName: 'security', status: 'Failed', score: 0 },
    ];
    const score = calculateOverallReportScore(modules);
    expect(score).toBe(5, 'All failed should return 5');
  });
});

// ─── DETERMINISTIC_WEIGHTS config ────────────────────────────────────────────

describe('DETERMINISTIC_WEIGHTS', () => {
  it('has entries for all 9 modules', () => {
    const expected = ['security', 'performance', 'seocontent', 'accessibility', 'privacy', 'ui', 'compatibility', 'marketing', 'conversion'];
    for (const mod of expected) {
      expect(DETERMINISTIC_WEIGHTS[mod] !== undefined).toBeTruthy();
      expect(DETERMINISTIC_WEIGHTS[mod] >= 0 && DETERMINISTIC_WEIGHTS[mod] <= 1).toBeTruthy();
    }
  });

  it('performance has highest deterministic weight', () => {
    expect(DETERMINISTIC_WEIGHTS.performance).toBe(0.80);
  });

  it('security has 60% deterministic weight', () => {
    expect(DETERMINISTIC_WEIGHTS.security).toBe(0.60);
  });
});
