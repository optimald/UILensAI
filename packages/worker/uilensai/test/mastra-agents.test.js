/**
 * Tests for Mastra Agent Personas and Registry
 */

const { getPersona, getPersonaInstructions, getAllPersonasMeta, PERSONAS } = require('../agents/personas');

describe('Expert Personas', () => {
  const ALL_MODULES = ['security', 'performance', 'ui', 'accessibility', 'seoContent', 'conversion', 'marketing', 'privacy', 'compatibility', 'siteHealth'];

  test('all 10 modules have persona definitions', () => {
    for (const mod of ALL_MODULES) {
      const persona = getPersona(mod);
      expect(persona).not.toBeNull();
      expect(persona.name).toBeTruthy();
      expect(persona.title).toBeTruthy();
      expect(persona.id).toBeTruthy();
      expect(persona.instructions.length).toBeGreaterThan(200);
    }
  });

  test('persona instructions contain scoring philosophy', () => {
    for (const mod of ALL_MODULES) {
      const persona = getPersona(mod);
      expect(persona.instructions).toContain('SCORING PHILOSOPHY');
      expect(persona.instructions).toContain('METHODOLOGY');
      expect(persona.instructions).toContain('COMMUNICATION STYLE');
      expect(persona.instructions).toContain('CRITICAL RULES');
    }
  });

  test('persona names are unique', () => {
    const names = Object.values(PERSONAS).map(p => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  test('persona IDs are unique', () => {
    const ids = Object.values(PERSONAS).map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('getPersonaInstructions injects industry context', () => {
    const instructions = getPersonaInstructions('security', {
      industryContext: { primaryIndustry: 'Healthcare' }
    });
    expect(instructions).toContain('Healthcare');
    expect(instructions).toContain('INDUSTRY CONTEXT');
  });

  test('getPersonaInstructions skips industry context for Unknown', () => {
    const instructions = getPersonaInstructions('security', {
      industryContext: { primaryIndustry: 'Unknown' }
    });
    expect(instructions).not.toContain('INDUSTRY CONTEXT');
  });

  test('module aliases resolve correctly', () => {
    expect(getPersona('seocontent')).not.toBeNull();
    expect(getPersona('seo')).not.toBeNull();
    expect(getPersona('seo-content')).not.toBeNull();
    // All should resolve to the same persona
    expect(getPersona('seocontent').name).toBe(getPersona('seo').name);
  });

  test('getAllPersonasMeta returns metadata for all modules', () => {
    const meta = getAllPersonasMeta();
    expect(Object.keys(meta).length).toBe(10);
    for (const [key, val] of Object.entries(meta)) {
      expect(val.name).toBeTruthy();
      expect(val.title).toBeTruthy();
      expect(val.id).toBeTruthy();
    }
  });

  test('all modules have cognitiveEngine field', () => {
    for (const mod of ALL_MODULES) {
      const persona = getPersona(mod);
      expect(persona.cognitiveEngine).toBeTruthy();
      const isValid = typeof persona.cognitiveEngine === 'string' || Array.isArray(persona.cognitiveEngine);
      expect(isValid).toBe(true);
    }
  });

  test('getPersonaInstructions includes COGNITIVE ENGINE prefix', () => {
    for (const mod of ALL_MODULES) {
      const instructions = getPersonaInstructions(mod);
      expect(instructions).toMatch(/^\[COGNITIVE ENGINE ACTIVE: .+\]/);
    }
  });

  test('unknown module returns null', () => {
    expect(getPersona('nonexistent')).toBeNull();
    expect(getPersonaInstructions('nonexistent')).toBeNull();
  });
});
