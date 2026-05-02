/**
 * Tests for Multi-Agent Architecture:
 *   - Debate Protocol (Adversarial Alignment)
 *   - CEO Orchestrator
 *   - Procedural Memory
 */

const path = require('path');

// ─── DEBATE PROTOCOL TESTS ────────────────────────────────────────
describe('Debate Protocol', () => {
  const { DEBATE_PAIRS, buildDebatePrompt, applyDebateAdjustments } = require('../agents/debate-protocol');
  const { getPersona } = require('../agents/personas');

  test('defines exactly 5 debate pairs', () => {
    expect(DEBATE_PAIRS).toHaveLength(5);
  });

  test('each pair has required fields', () => {
    for (const pair of DEBATE_PAIRS) {
      expect(pair.id).toBeTruthy();
      expect(pair.challenger).toBeTruthy();
      expect(pair.defender).toBeTruthy();
      expect(pair.tension).toBeTruthy();
      expect(pair.challenger).not.toBe(pair.defender);
    }
  });

  test('all debate participants have corresponding personas', () => {
    const allModules = new Set();
    for (const pair of DEBATE_PAIRS) {
      allModules.add(pair.challenger);
      allModules.add(pair.defender);
    }
    for (const mod of allModules) {
      const persona = getPersona(mod);
      expect(persona).toBeTruthy();
      expect(persona.name).toBeTruthy();
    }
  });

  test('debate pair IDs are unique', () => {
    const ids = DEBATE_PAIRS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('buildDebatePrompt generates valid prompt', () => {
    const pair = DEBATE_PAIRS[0]; // security-vs-privacy
    const challengerData = { summary: { score: 85, rating: 'Good', topIssues: ['Missing CSP header'] } };
    const defenderData = { summary: { score: 72, rating: 'Fair', topIssues: ['No cookie consent'] } };
    const industryContext = { primaryIndustry: 'SaaS' };

    const prompt = buildDebatePrompt(pair, challengerData, defenderData, industryContext);

    expect(prompt).toContain('CHALLENGER');
    expect(prompt).toContain('DEFENDER');
    expect(prompt).toContain('SaaS');
    expect(prompt).toContain('85/100');
    expect(prompt).toContain('72/100');
    expect(prompt).toContain('security-vs-privacy');
    expect(prompt).toContain('JSON');
  });

  test('applyDebateAdjustments applies and clamps correctly', () => {
    const modules = {
      security: { summary: { score: 85 } },
      performance: { summary: { score: 60 } },
    };

    applyDebateAdjustments(modules, { security: -3, performance: 5 });

    expect(modules.security.summary.score).toBe(82);
    expect(modules.security.summary._preDebateScore).toBe(85);
    expect(modules.security.summary._debateAdjustment).toBe(-3);
    expect(modules.performance.summary.score).toBe(65);
  });

  test('applyDebateAdjustments clamps to 0-100', () => {
    const modules = {
      security: { summary: { score: 2 } },
      performance: { summary: { score: 98 } },
    };

    applyDebateAdjustments(modules, { security: -5, performance: 5 });

    expect(modules.security.summary.score).toBe(0); // Clamped
    expect(modules.performance.summary.score).toBe(100); // Clamped
  });

  test('applyDebateAdjustments skips missing modules', () => {
    const modules = { security: { summary: { score: 85 } } };
    // Should not throw
    applyDebateAdjustments(modules, { nonexistent: 3, security: 0 });
    expect(modules.security.summary.score).toBe(85); // Delta 0, no change
  });
});

// ─── CEO ORCHESTRATOR TESTS ───────────────────────────────────────
describe('CEO Orchestrator', () => {
  const { CEO_PERSONA, buildCEOBriefing, buildCEOPrompt } = require('../agents/ceo-orchestrator');

  test('CEO persona has required identity', () => {
    expect(CEO_PERSONA.id).toBe('ceo-victoria-sterling');
    expect(CEO_PERSONA.name).toBe('Victoria Sterling');
    expect(CEO_PERSONA.title).toContain('Chief');
    expect(CEO_PERSONA.instructions).toContain('McKinsey');
  });

  test('buildCEOBriefing compresses module data', () => {
    const modules = {
      security: {
        summary: { score: 85, rating: 'Good', topIssues: ['Missing CSP'] },
        narrative: 'The site has solid HTTPS but lacks critical headers.',
        _agentMeta: { agentName: 'Dr. Elena Vasquez' },
      },
      performance: {
        summary: { score: 60, rating: 'Fair', topIssues: ['Slow FCP'], _preDebateScore: 65, _debateAdjustment: -5 },
      },
    };

    const briefing = buildCEOBriefing(modules, null, { primaryIndustry: 'SaaS' });

    expect(briefing).toContain('security: 85/100');
    expect(briefing).toContain('performance: 60/100');
    expect(briefing).toContain('Dr. Elena Vasquez');
    expect(briefing).toContain('SaaS');
  });

  test('buildCEOBriefing includes debate verdicts', () => {
    const modules = { security: { summary: { score: 85 } } };
    const debateResults = {
      verdicts: [
        {
          debateId: 'security-vs-privacy',
          skipped: false,
          verdict: 'Security and privacy are misaligned',
          contradictions: ['CSP blocks analytics tracking'],
        },
      ],
      crossCuttingInsights: ['Both GDPR and CSP need unified policy'],
    };

    const briefing = buildCEOBriefing(modules, debateResults, { primaryIndustry: 'E-commerce' });

    expect(briefing).toContain('DEBATE VERDICTS');
    expect(briefing).toContain('security-vs-privacy');
    expect(briefing).toContain('CROSS-CUTTING INSIGHTS');
  });

  test('buildCEOPrompt includes persona and JSON instructions', () => {
    const prompt = buildCEOPrompt('=== MODULE SCORES ===\nsecurity: 85/100', null);

    expect(prompt).toContain('Victoria Sterling');
    expect(prompt).toContain('executiveSummary');
    expect(prompt).toContain('strategicPriorities');
    expect(prompt).toContain('riskAssessment');
    expect(prompt).toContain('JSON');
  });

  test('buildCEOPrompt injects memory context', () => {
    const prompt = buildCEOPrompt('briefing data', 'INDUSTRY: SaaS avg 72');

    expect(prompt).toContain('PROCEDURAL MEMORY');
    expect(prompt).toContain('SaaS avg 72');
  });
});

// ─── PROCEDURAL MEMORY TESTS ─────────────────────────────────────
describe('Procedural Memory', () => {
  const {
    createEmptyMemory, loadMemory, saveMemory, recordScan,
    getMemoryContext, getCEOMemoryContext, MEMORY_FILE,
  } = require('../agents/procedural-memory');
  const fs = require('fs');

  // Clean up after tests
  afterAll(() => {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        fs.unlinkSync(MEMORY_FILE);
      }
    } catch (e) { /* ignore */ }
  });

  test('createEmptyMemory returns valid structure', () => {
    const mem = createEmptyMemory();
    expect(mem.version).toBe('1.0.0');
    expect(mem.totalScans).toBe(0);
    expect(mem.industryPatterns).toEqual({});
    expect(mem.siteHistory).toEqual({});
    expect(mem.personaCalibration).toEqual({});
    expect(mem.commonIssues).toEqual({});
  });

  test('recordScan stores industry patterns', () => {
    recordScan({
      url: 'https://example.com',
      industry: 'SaaS',
      moduleScores: { security: 85, performance: 70 },
      agentMeta: {},
      debateAdjustments: {},
      topIssues: ['Missing CSP header'],
      overallScore: 78,
    });

    const mem = loadMemory();
    expect(mem.totalScans).toBeGreaterThanOrEqual(1);
    expect(mem.industryPatterns.saas).toBeTruthy();
    expect(mem.industryPatterns.saas.moduleAverages.security.avg).toBe(85);
  });

  test('recordScan tracks site history for drift', () => {
    recordScan({
      url: 'https://drift-test.com',
      industry: 'E-commerce',
      moduleScores: { security: 60 },
      agentMeta: {},
      debateAdjustments: {},
      topIssues: [],
      overallScore: 60,
    });

    recordScan({
      url: 'https://drift-test.com',
      industry: 'E-commerce',
      moduleScores: { security: 75 },
      agentMeta: {},
      debateAdjustments: {},
      topIssues: [],
      overallScore: 75,
    });

    const mem = loadMemory();
    const history = mem.siteHistory['drift-test.com'];
    expect(history).toBeTruthy();
    expect(history.length).toBe(2);
    expect(history[0].moduleScores.security).toBe(60);
    expect(history[1].moduleScores.security).toBe(75);
  });

  test('getMemoryContext returns null with insufficient data', () => {
    // Fresh memory with < 3 scans may return null
    const freshMem = createEmptyMemory();
    saveMemory(freshMem);
    const ctx = getMemoryContext('https://new-site.com', 'Fintech', 'security');
    expect(ctx).toBeNull();
  });

  test('getMemoryContext returns data when enough scans exist', () => {
    // Record 3+ scans to trigger memory context
    for (let i = 0; i < 3; i++) {
      recordScan({
        url: `https://site-${i}.com`,
        industry: 'Healthcare',
        moduleScores: { security: 70 + i * 5 },
        agentMeta: {},
        debateAdjustments: {},
        topIssues: ['HIPAA compliance gap'],
        overallScore: 70 + i * 5,
      });
    }

    const ctx = getMemoryContext('https://site-0.com', 'Healthcare', 'security');
    // Should have some context now (industry benchmark or site history)
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('healthcare');
  });

  test('getCEOMemoryContext returns null with insufficient data', () => {
    const freshMem = createEmptyMemory();
    saveMemory(freshMem);
    const ctx = getCEOMemoryContext('https://new-site.com', 'Fintech');
    expect(ctx).toBeNull();
  });

  test('recordScan tracks persona calibration', () => {
    recordScan({
      url: 'https://persona-test.com',
      industry: 'SaaS',
      moduleScores: { security: 80 },
      agentMeta: {
        security: { agentId: 'dr-elena-vasquez', agentName: 'Dr. Elena Vasquez' },
      },
      debateAdjustments: { security: -3 },
      topIssues: [],
      overallScore: 80,
    });

    const mem = loadMemory();
    const cal = mem.personaCalibration['dr-elena-vasquez'];
    expect(cal).toBeTruthy();
    expect(cal.agentName).toBe('Dr. Elena Vasquez');
    expect(cal.debateCount).toBeGreaterThanOrEqual(1);
  });
});
