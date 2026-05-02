/**
 * structured-llm-output.js - Refactored for Schema v3.11.0
 *
 * Utilities for consistently obtaining structured JSON responses from LLMs
 * (Claude, GPT, Gemini) based on the report schema.
 */

const fs = require('fs');
const path = require('path');
const { getSchemaPath } = require('./paths');

// NOTE: $RefParser removed — it was unused (dereferenceSchema does manual resolution)
// and v15.x of @apidevtools/json-schema-ref-parser is ESM-only, breaking require().
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
// Legacy: MODEL_MAX_TOKENS was previously imported from ./ai-models/claude (now deleted).
// This inline constant is used only by the legacy getStructuredDataFromClaude function.
// The main getStructuredData() path now routes through analyzeWithAI → OpenRouter.
const MODEL_MAX_TOKENS = {
  default_claude_limit: 65536,
  'anthropic/claude-sonnet-4-5-20250929': 65536,
  'anthropic/claude-haiku-4-5-20251001': 65536,
};
// Assuming Anthropic and OpenAI SDKs are correctly required if used directly here,
// but typically they would be used within the getStructuredDataFrom[Provider] functions
// which are called by the main getStructuredData.

// Schema version this utility targets
const TARGET_SCHEMA_VERSION = "3.11.0";
const { getDefaultModelFamily } = require('../config/model-defaults');
const DEFAULT_MODEL_FAMILY = getDefaultModelFamily('structured'); // Centralized default from model-defaults.js
let reportSchema = null;
let dereferencedSchema = null;
let ajvInstance = null;

// Initialize AJV with proper Draft 2020-12 support
function initializeAJV() {
  if (ajvInstance) { return ajvInstance; }

  try {
    ajvInstance = new Ajv({
      allErrors: true,
      strict: false, // Allow Draft 2020-12 features
      validateFormats: true,
      addUsedSchema: false,
      loadSchema: false,
      removeAdditional: false,
      verbose: false
    });

    addFormats(ajvInstance);

    // Add Draft 2020-12 meta-schema support using the correct approach
    try {
      const metaSchema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://json-schema.org/draft/2020-12/schema",
        "$vocabulary": {
          "https://json-schema.org/draft/2020-12/vocab/core": true,
          "https://json-schema.org/draft/2020-12/vocab/applicator": true,
          "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
          "https://json-schema.org/draft/2020-12/vocab/validation": true,
          "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
          "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
          "https://json-schema.org/draft/2020-12/vocab/content": true
        },
        "$dynamicAnchor": "meta",
        "title": "Core and Validation specifications meta-schema",
        "type": ["object", "boolean"]
      };

      ajvInstance.addMetaSchema(metaSchema, "https://json-schema.org/draft/2020-12/schema");
      console.log(`[StructuredLLM] Draft 2020-12 meta-schema added successfully.`);
    } catch (metaError) {
      // Check if the error is about the schema already existing (which is fine)
      if (metaError.message && metaError.message.includes('already exists')) {
        console.log(`[StructuredLLM] Draft 2020-12 meta-schema already loaded. Proceeding with full validation.`);
      } else {
        console.warn(`[StructuredLLM] Could not add Draft 2020-12 meta-schema: ${metaError.message}. Proceeding with basic validation.`);
      }
    }

    return ajvInstance;
  } catch (error) {
    console.error(`[StructuredLLM] Failed to initialize AJV: ${error.message}`);
    return null;
  }
}

/**
 * Load and initialize the report schema with dereferencing
 */
async function initializeSchema() {
  if (reportSchema && dereferencedSchema) { return; }

  try {
    const schemaPath = getSchemaPath('report-schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    reportSchema = JSON.parse(schemaContent);

    // Ensure proper $schema declaration for Draft 2020-12
    if (!reportSchema.$schema || !reportSchema.$schema.includes('2020-12')) {
      reportSchema.$schema = "https://json-schema.org/draft/2020-12/schema";
    }

    // Dereference the schema to resolve all $ref references
    dereferencedSchema = dereferenceSchema(reportSchema);

    console.log(`[StructuredLLM] Schema loaded and dereferenced successfully (version: ${reportSchema.version || TARGET_SCHEMA_VERSION})`);
  } catch (error) {
    console.error(`[StructuredLLM] Failed to load schema: ${error.message}`);
    throw error;
  }
}

/**
 * Apply Claude-specific schema simplifications to improve compatibility
 * @param {Object} schema - The schema to simplify
 * @returns {Object} Simplified schema
 */
function applyClaudeSimplifications(schema) {
  const simplified = JSON.parse(JSON.stringify(schema)); // Deep clone

  function simplifyRecursive(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { return; }

    // Remove schema metadata that confuses Claude
    delete obj.$schema;
    delete obj.$id;
    delete obj.$vocabulary;
    delete obj.$dynamicRef;
    delete obj.$dynamicAnchor;
    delete obj.$comment;

    // Remove any remaining $defs that might confuse Claude about what to return
    delete obj.$defs;

    // Simplify conditional schemas that might confuse Claude
    if (obj.if || obj.then || obj.else) {
      // Convert if/then/else to simpler structure
      delete obj.if;
      delete obj.then;
      delete obj.else;
    }

    // Simplify oneOf/anyOf to just the first option for Claude
    if (obj.oneOf && Array.isArray(obj.oneOf) && obj.oneOf.length > 0) {
      const firstOption = obj.oneOf[0];
      delete obj.oneOf;
      Object.assign(obj, firstOption);
    }

    if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length > 0) {
      const firstOption = obj.anyOf[0];
      delete obj.anyOf;
      Object.assign(obj, firstOption);
    }

    // Ensure additionalProperties is explicitly set
    if (obj.type === 'object' && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }

    // Recursively apply to nested objects
    Object.values(obj).forEach(value => {
      if (Array.isArray(value)) {
        value.forEach(item => simplifyRecursive(item));
      } else {
        simplifyRecursive(value);
      }
    });
  }

  simplifyRecursive(simplified);
  return simplified;
}

/**
 * Generate a function/tool definition from a schema section for AI model function calling.
 * @param {Object} schemaSection - The schema section to convert.
 * @param {string} functionName - The name of the function/tool.
 * @param {string} description - Description of the function/tool.
 * @param {string} provider - The AI provider ('anthropic', 'openai', 'gemini').
 * @returns {Object} The function/tool definition.
 */
async function generateFunctionFromSchema(schemaSection, functionName, description, provider = 'openai') {
  if (!schemaSection || typeof schemaSection !== 'object') {
    throw new Error("[StructuredLLM] Invalid schemaSection provided to generateFunctionFromSchema.");
  }

  // Ensure schema is initialized
  await initializeSchema();

  // Ensure the schema section is fully dereferenced
  const workingSchema = dereferenceSchema(schemaSection, dereferencedSchema);

  // Create a self-contained schema definition
  let schemaDefinition = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: workingSchema.type || "object",
    properties: workingSchema.properties || {},
    required: workingSchema.required || [],
    additionalProperties: workingSchema.additionalProperties !== undefined ? workingSchema.additionalProperties : false
  };

  // Copy over other important schema properties
  if (workingSchema.description) {
    schemaDefinition.description = workingSchema.description;
  }
  if (workingSchema.title) {
    schemaDefinition.title = workingSchema.title;
  }
  if (workingSchema.examples) {
    schemaDefinition.examples = workingSchema.examples;
  }

  // Apply provider-specific optimizations
  if (provider === 'anthropic') {
    // Apply Claude-specific simplifications
    schemaDefinition = applyClaudeSimplifications(schemaDefinition);

    // Validate the simplified schema with AJV
    try {
      const ajv = initializeAJV();
      if (ajv) {
        ajv.compile(schemaDefinition);
      }
    } catch (validationError) {
      console.warn(`[StructuredLLM] Schema validation failed for Claude, applying further simplifications:`, validationError.message);
      // Apply even more aggressive simplifications if needed
      schemaDefinition = createSimplifiedSchema(schemaDefinition);
    }
  }

  const funcDescription = description || workingSchema.description || `Generates structured data for ${functionName}`;

  if (provider === 'anthropic') { // Anthropic uses 'tools'
    return {
      name: functionName,
      description: funcDescription,
      input_schema: schemaDefinition // Anthropic's specific key for schema
    };
  } else if (provider === 'openai') { // OpenAI uses 'functions'
    return {
      name: functionName,
      description: funcDescription,
      parameters: schemaDefinition // OpenAI's specific key for schema
    };
  }
  // Add Gemini or other provider logic here if their function/tool calling API differs
  else { // Default to OpenAI-like structure for others or if provider not specified
    return {
      name: functionName,
      description: funcDescription,
      parameters: schemaDefinition
    };
  }
}

/**
 * Get the current schema version this utility is targeting.
 * @returns {string} Current schema version (e.g., "3.11.0").
 */
function getSchemaVersion() {
  return TARGET_SCHEMA_VERSION;
}

/**
 * Extract a specific section (definition) from the loaded report schema.
 *
 * @param {string} moduleKey - The key for the module or definition (e.g., 'uiModule', 'performanceMetric').
 * @param {boolean} [enhanced=true] - Whether to use the full enhanced schema or a simplified version.
 * @returns {Object} The schema section.
 * @throws {Error} If the schema is not loaded or the section is not found.
 */
async function getSchemaForModule(moduleKey, enhanced = true) {
  // Ensure schema is initialized
  await initializeSchema();

  if (!reportSchema || !dereferencedSchema) {
    throw new Error('[StructuredLLM] Report schema is not loaded. Cannot retrieve module schema.');
  }

  let schemaSection;

  // Use dereferenced schema for better resolution
  const workingSchema = dereferencedSchema;

  // Prioritize direct definitions if moduleKey matches a $defs key
  if (workingSchema.$defs && workingSchema.$defs[moduleKey]) {
    schemaSection = workingSchema.$defs[moduleKey];
  }
  // Check for nested paths like 'uiViewportAnalysisDetail.properties.structured'
  else if (moduleKey.includes('.')) {
    const pathParts = moduleKey.split('.');
    let current = workingSchema;

    for (const part of pathParts) {
      if (current && current[part]) {
        current = current[part];
      } else if (current && current.$defs && current.$defs[part]) {
        current = current.$defs[part];
      } else {
        current = null;
        break;
      }
    }

    if (current) {
      schemaSection = current;
    }
  }
  // Fallback to properties if moduleKey matches a top-level module property
  else if (workingSchema.properties && workingSchema.properties.modules && workingSchema.properties.modules.properties && workingSchema.properties.modules.properties[moduleKey]) {
    schemaSection = workingSchema.properties.modules.properties[moduleKey];
  }
  // Special case for full report
  else if (moduleKey === 'fullReport') {
    schemaSection = workingSchema;
  }
  // Try to find in properties directly
  else if (workingSchema.properties && workingSchema.properties[moduleKey]) {
    schemaSection = workingSchema.properties[moduleKey];
  }

  if (!schemaSection) {
    // List available keys for debugging
    const availableKeys = [];
    if (workingSchema.$defs) {
      availableKeys.push(...Object.keys(workingSchema.$defs).map(k => `$defs.${k}`));
    }
    if (workingSchema.properties) {
      availableKeys.push(...Object.keys(workingSchema.properties).map(k => `properties.${k}`));
    }

    throw new Error(`[StructuredLLM] Schema definition for '${moduleKey}' not found. Available keys: ${availableKeys.slice(0, 10).join(', ')}${availableKeys.length > 10 ? '...' : ''}`);
  }

  // Return the schema section, applying simplifications if not enhanced
  const finalSchema = enhanced ? schemaSection : createSimplifiedSchema(schemaSection);

  // Ensure the returned schema is fully dereferenced (no remaining $refs)
  return dereferenceSchema(finalSchema, workingSchema);
}

/**
 * Create a simplified version of a schema section by removing complex/optional fields.
 * This is useful for older or less capable AI models.
 *
 * @param {Object} schema - The schema section to simplify.
 * @returns {Object} A simplified version of the schema.
 */
function createSimplifiedSchema(schema) {
  const simplified = JSON.parse(JSON.stringify(schema)); // Deep clone

  // Fields identified in REFACTOR.MD as complex and candidates for removal in simplified schemas
  const complexFieldsToRemove = [
    'industryBenchmarks', 'roiProjections', 'visualizationData', 'crossModuleInsights',
    'competitiveIntelligence', 'businessIntelligence', 'implementationPlan', 'effortBreakdown',
    'implementationSteps', 'regulatoryImpact', 'businessImpact', 'synergisticOpportunities',
    'metricPairs', 'correlationMetrics', 'financialRisk', 'implementationRoadmap',
    'deprecatedFields', 'featureSet', 'streamingSupport', 'streamChunkType', 'pagination', 'localization',
    // Module-specific complex fields (examples)
    'dynamicElementsAnalysis', 'multiBrowserComparison', 'zeroTrustAnalysis', 'phiHandling',
    'hipaaAuditLogging', 'crossBorderCompliance', 'voiceSearchOptimization', 'eatAnalysis',
    'localSEO', 'platformSpecific', 'progressiveEnhancement', 'legacyBrowserSupport',
    'customerJourney', 'technologyStack', 'competitiveIntelligence', 'healthcareCompliance', // These are often at module root
    'industrySpecificMetrics', 'gestureInteractionAnalysis', 'industrySpecificPatterns',
    'clientSideRenderingImpact', 'lighthouseAuditRecommendationsList', 'schemaMarkup', 'socialMedia',
    'csrfProtectionDetails', 'consentRecord', 'dataFlowMap', 'neurodiversityMetrics',
    'scoreExplanation', // From recommendation object
    // Fields within recommendations that are too complex for basic schema
    'effortBreakdown', 'regulatoryImpact', 'businessImpact', 'implementationSteps', 'testingGuidance', 'successMetrics'
  ];


  function simplify(currentSchemaNode) {
    if (currentSchemaNode.properties) {
      for (const field of complexFieldsToRemove) {
        delete currentSchemaNode.properties[field];
      }
      if (currentSchemaNode.required) {
        currentSchemaNode.required = currentSchemaNode.required.filter(req => !complexFieldsToRemove.includes(req));
        if (currentSchemaNode.required.length === 0) { delete currentSchemaNode.required; }
      }
      for (const key in currentSchemaNode.properties) {
        simplify(currentSchemaNode.properties[key]); // Recurse
      }
    }
    if (currentSchemaNode.items && currentSchemaNode.items.properties) {
      simplify(currentSchemaNode.items); // Recurse for array items
    }
    if (currentSchemaNode.additionalProperties && currentSchemaNode.additionalProperties.properties) {
      simplify(currentSchemaNode.additionalProperties); // Recurse for additionalProperties
    }
    // Remove unevaluatedProperties if present, as simpler models might not handle it.
    // delete currentSchemaNode.unevaluatedProperties;
  }

  simplify(simplified);
  return simplified;
}

/**
 * Extracts JSON from Claude's XML-structured response, looking for content within <response> tags
 * @param {string} text - The text response from Claude
 * @returns {Object|null} The extracted JSON object, or null if parsing fails
 */
function extractJsonFromClaudeXmlResponse(text) {
  if (!text || typeof text !== 'string') { return null; }

  try {
    // First, try to extract content from <response> tags
    const responseMatch = text.match(/<response>\s*([\s\S]*?)\s*<\/response>/i);
    if (responseMatch && responseMatch[1]) {
      const responseContent = responseMatch[1].trim();
      try {
        return JSON.parse(responseContent);
      } catch (e) {
        console.warn("[StructuredLLM] Failed to parse JSON from <response> tags, trying to fix...");
        const fixed = attemptJsonFix(responseContent);
        if (fixed) { return fixed; }
      }
    }

    // Fallback: try to extract from other XML tags
    const xmlContentMatch = text.match(/<[^>]+>\s*([\s\S]*?)\s*<\/[^>]+>/);
    if (xmlContentMatch && xmlContentMatch[1]) {
      try {
        return JSON.parse(xmlContentMatch[1].trim());
      } catch (e) {
        console.warn("[StructuredLLM] Failed to parse JSON from XML content, trying to fix...");
        const fixed = attemptJsonFix(xmlContentMatch[1].trim());
        if (fixed) { return fixed; }
      }
    }

    // Fallback: try direct JSON extraction
    return extractJsonFromText(text);

  } catch (error) {
    console.warn("[StructuredLLM] Error in XML response extraction:", error.message);
    return extractJsonFromText(text);
  }
}

/**
 * Enhanced JSON extraction with better error handling and fixing
 * @param {string} text - The text to extract JSON from
 * @returns {Object|null} The extracted JSON object, or null if parsing fails
 */
function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') { return null; }

  try {
    // Remove common prefixes and suffixes
    let cleanedText = text.trim();

    // Log raw AI output for debugging JSON parsing issues
    if (cleanedText.length > 5000) {
      console.log(`[StructuredLLM] DEBUG: Processing large AI response (${cleanedText.length} chars), first 1000 chars: ${cleanedText.substring(0, 1000)}`);
    }

    // Remove markdown code blocks
    const codeBlockMatch = cleanedText.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      cleanedText = codeBlockMatch[1].trim();
      console.log(`[StructuredLLM] DEBUG: Extracted from code block, length: ${cleanedText.length}`);
    }

    // Try direct parsing first
    try {
      const parsed = JSON.parse(cleanedText);
      console.log(`[StructuredLLM] DEBUG: Direct JSON parsing succeeded`);
      return parsed;
    } catch (e) {
      console.log(`[StructuredLLM] DEBUG: Direct parsing failed: ${e.message.substring(0, 200)}`);

      // If direct parsing fails, try to find and extract JSON
      const jsonMatch = cleanedText.match(/(\{[\s\S]*\})/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          console.log(`[StructuredLLM] DEBUG: JSON extraction from regex succeeded`);
          return parsed;
        } catch (e2) {
          console.log(`[StructuredLLM] DEBUG: JSON extraction failed, attempting fix: ${e2.message.substring(0, 200)}`);
          // Try to fix the JSON
          const fixed = attemptJsonFix(jsonMatch[1]);
          if (fixed) {
            console.log(`[StructuredLLM] DEBUG: JSON fix succeeded`);
            return fixed;
          }
        }
      }

      // Try to find array JSON
      const arrayMatch = cleanedText.match(/(\[[\s\S]*\])/);
      if (arrayMatch && arrayMatch[1]) {
        try {
          const parsed = JSON.parse(arrayMatch[1]);
          console.log(`[StructuredLLM] DEBUG: Array JSON parsing succeeded`);
          return parsed;
        } catch (e3) {
          // Try to fix the array JSON
          const fixed = attemptJsonFix(arrayMatch[1]);
          if (fixed) {
            console.log(`[StructuredLLM] DEBUG: Array JSON fix succeeded`);
            return fixed;
          }
        }
      }

      // Log the problematic content for debugging
      const sample = cleanedText.substring(0, 500);
      console.log(`[StructuredLLM] DEBUG: All JSON parsing attempts failed. Sample content: ${sample}`);
    }

    return null;
  } catch (error) {
    console.warn("[StructuredLLM] Error in JSON extraction:", error.message);
    return null;
  }
}

// GOLD-STANDARD: attemptJsonFix extracted to json-repair.js (breaks circular dep with deepseek.js)
// Re-exported here for backward compatibility
const { attemptJsonFix } = require('./json-repair');

// Placeholder functions for provider-specific structured data retrieval
// These would call the respective AI model clients (claude.js, openai.js, gemini.js)
// and use their function/tool calling capabilities.

async function getStructuredDataFromClaude({ moduleType, prompt, model, systemPrompt, enhancedSchema, customSchema, messages, images, maxTokens, verbose }) {
  // Ensure schema is initialized
  await initializeSchema();

  let targetSchema;
  if (customSchema) {
    // Dereference the custom schema
    targetSchema = dereferenceSchema(customSchema, dereferencedSchema);
  } else {
    // Get the schema for the module type and ensure it's dereferenced
    targetSchema = await getSchemaForModule(moduleType, enhancedSchema);
  }

  if (!targetSchema) {
    throw new Error(`[StructuredLLM-Claude] Could not retrieve schema for moduleType: ${moduleType}`);
  }

  // Apply Claude-specific simplifications to the schema
  const claudeOptimizedSchema = applyClaudeSimplifications(targetSchema);

  // Create XML-based prompt following Claude's best practices
  const xmlStructuredPrompt = `
<instructions>
You are an expert web analyzer. Analyze the provided content and generate a structured JSON response containing your ANALYSIS DATA that conforms to the provided schema.

IMPORTANT: Return your analysis results as JSON data, NOT the schema definition itself. The schema shows you the structure to follow, but you should populate it with actual analysis results.

Your response MUST be valid JSON containing analysis data that matches the schema structure exactly. Do not include any explanatory text outside the JSON.
</instructions>

<schema_structure>
The JSON you return should follow this structure:
${JSON.stringify(claudeOptimizedSchema, null, 2)}
</schema_structure>

<analysis_task>
${prompt}
</analysis_task>

<output_requirements>
Return your analysis as a valid JSON object containing ANALYSIS DATA (not the schema). 

Example of what to return (populate with real analysis data):
{
  "summary": {
    "score": 75,
    "rating": "Good", 
    "topIssues": ["Issue 1", "Issue 2"]
  },
  "specificAnalysisField": {
    "score": 82,
    "details": "Your analysis details here"
  }
}

DO NOT return schema metadata like "$schema", "$id", or "$defs". Return populated analysis data.
</output_requirements>

<response>
`;

  // Prepare messages using XML structure
  let claudeMessages;
  if (messages && Array.isArray(messages)) {
    // If custom messages provided, append our structured prompt to the last user message
    claudeMessages = [...messages];
    const lastMessage = claudeMessages[claudeMessages.length - 1];
    if (lastMessage.role === 'user') {
      if (typeof lastMessage.content === 'string') {
        lastMessage.content = lastMessage.content + '\n\n' + xmlStructuredPrompt;
      } else if (Array.isArray(lastMessage.content)) {
        lastMessage.content.push({ type: 'text', text: xmlStructuredPrompt });
      }
    } else {
      claudeMessages.push({ role: 'user', content: xmlStructuredPrompt });
    }
  } else {
    claudeMessages = [{ role: 'user', content: xmlStructuredPrompt }];
  }

  // Add images to the last user message if provided
  if (images && images.length > 0 && claudeMessages.length > 0) {
    const lastMessage = claudeMessages[claudeMessages.length - 1];
    if (lastMessage.role === 'user') {
      // Convert content to array format if it's a string
      if (typeof lastMessage.content === 'string') {
        lastMessage.content = [{ type: 'text', text: lastMessage.content }];
      }

      // Add images
      images.forEach(img => {
        lastMessage.content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType || 'image/png',
            data: img.data
          }
        });
      });
    }
  }

  // Use intelligent token limit fallback based on model
  // INCREASED: 16384 was causing truncation on Security/SEO modules with complex schemas
  const effectiveMaxTokens = maxTokens || MODEL_MAX_TOKENS[model] || MODEL_MAX_TOKENS.default_claude_limit || 24576;

  const requestBody = {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: effectiveMaxTokens,
    temperature: 0.1, // Low temperature for consistent structured output
    system: systemPrompt + '\n\nYou must respond with valid JSON that exactly matches the provided schema. Use the XML tags in the prompt to understand the structure and requirements.' +
      '\n\n**OUTPUT LENGTH GUIDANCE**: Target 6000-8000 tokens for optimal balance of detail and efficiency. Focus on the most critical insights and actionable recommendations. Avoid repetition and verbose descriptions. You have additional capacity if needed to complete your analysis, but concise responses improve speed and cost-effectiveness.',
    messages: claudeMessages
  };

  if (verbose) {
    console.log(`[StructuredLLM-Claude] Using XML-based structured output for ${moduleType}`);
    console.log(`[StructuredLLM-Claude] Request body (truncated):`, JSON.stringify({
      ...requestBody,
      messages: requestBody.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string' ?
          m.content.substring(0, 200) + '...' :
          '[complex content with images]'
      }))
    }, null, 2));
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (verbose) {
      console.log(`[StructuredLLM-Claude] Response received for ${moduleType}`);
    }

    // Extract text content from Claude's response
    const textContent = data.content?.find(c => c.type === 'text')?.text;
    if (!textContent) {
      throw new Error(`Claude did not return text content for ${moduleType}. Response: ${JSON.stringify(data).substring(0, 500)}`);
    }

    // Extract JSON from the response using our XML-aware extraction
    const extractedJson = extractJsonFromClaudeXmlResponse(textContent);
    if (extractedJson) {
      if (verbose) { console.log(`[StructuredLLM-Claude] Successfully extracted structured JSON for ${moduleType}`); }
      return extractedJson;
    }

    // Fallback to general JSON extraction
    const fallbackJson = extractJsonFromText(textContent);
    if (fallbackJson) {
      if (verbose) { console.log(`[StructuredLLM-Claude] Extracted JSON using fallback method for ${moduleType}`); }
      return fallbackJson;
    }

    throw new Error(`Claude did not return valid JSON for ${moduleType}. Response text: ${textContent.substring(0, 500)}`);
  } catch (error) {
    console.error(`[StructuredLLM-Claude] Error during Claude API call for ${moduleType}: ${error.message}`);
    throw error;
  }
}

async function getStructuredDataFromOpenAI({ moduleType, prompt, model, systemPrompt, enhancedSchema, customSchema, messages, images, maxTokens, verbose }) {
  // Actual implementation would use OpenAI SDK with functions
  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modelToUse = model || (enhancedSchema ? 'gpt-4o' : 'gpt-3.5-turbo'); // GPT-4o for enhanced
  const schema = customSchema || await getSchemaForModule(moduleType, enhancedSchema);
  const functionName = `generate_${moduleType}_analysis_openai`;
  const functionDefinition = await generateFunctionFromSchema(schema, functionName, `Generate OpenAI structured ${moduleType} analysis`, 'openai');

  let requestMessages = messages || [{ role: 'user', content: prompt }];
  // OpenAI image format is different if using 'content' array for user message
  if (images && images.length > 0) {
    const userMessageContent = [{ type: 'text', text: prompt }];
    images.forEach(img => {
      userMessageContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType || 'image/png'};base64,${img.data}` }
      });
    });
    requestMessages = [{ role: 'user', content: userMessageContent }];
  }
  if (messages && messages.length > 0 && messages[0].role === 'user' && images && images.length > 0) {
    // If messages are provided and there are images, ensure the user message is an array
    if (typeof messages[0].content === 'string') {
      messages[0].content = [{ type: 'text', text: messages[0].content }];
    }
    images.forEach(img => {
      messages[0].content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType || 'image/png'};base64,${img.data}` }
      });
    });
    requestMessages = messages;
  }


  if (verbose) { console.log(`[StructuredLLM-OpenAI] Requesting function_call for: ${functionName} with model ${modelToUse}`); }
  try {
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [{ role: 'system', content: systemPrompt }, ...requestMessages],
      tools: [{ type: "function", function: functionDefinition }],
      tool_choice: { type: "function", function: { name: functionName } }, // Force use of the function
      max_tokens: maxTokens || 16384 // Intelligent fallback for OpenAI
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.find(tc => tc.function.name === functionName);
    if (toolCall) {
      if (verbose) { console.log(`[StructuredLLM-OpenAI] Successfully received structured data via function call for ${functionName}`); }
      return JSON.parse(toolCall.function.arguments);
    } else {
      console.warn(`[StructuredLLM-OpenAI] Function call for ${functionName} not found. Attempting text extraction. Response:`, JSON.stringify(response.choices[0]?.message).substring(0, 500));
      const textContent = response.choices[0]?.message?.content;
      if (textContent) {
        const extracted = extractJsonFromText(textContent);
        if (extracted) { return extracted; }
      }
      throw new Error(`OpenAI did not return the expected function call for ${functionName}. Message: ${JSON.stringify(response.choices[0]?.message).substring(0, 200)}`);
    }
  } catch (error) {
    console.error(`[StructuredLLM-OpenAI] Error during OpenAI API call for ${functionName}: ${error.message}. Request content: ${JSON.stringify(requestMessages[0].content).substring(0, 200)}`);
    throw error;
  }
}

async function getStructuredDataFromGemini({ moduleType, prompt, model, systemPrompt, enhancedSchema, customSchema, messages, images, maxTokens, verbose }) {
  // DEPRECATED: All AI now routes through OpenRouter via the `openai` SDK.
  // This legacy Gemini-direct path is no longer used. The @google/generative-ai
  // dependency has been removed. If you need Gemini, use OpenRouter with
  // model ID 'google/gemini-*' via getStructuredDataFromOpenAI().
  throw new Error(
    `[StructuredLLM-Gemini] DEPRECATED: Direct Gemini SDK path removed. ` +
    `Use OpenRouter with model 'google/gemini-*' instead. Module: ${moduleType}`
  );
}

/**
 * Dereference a schema by resolving all $ref references
 * @param {Object} schema - The schema to dereference
 * @param {Object} rootSchema - The root schema containing $defs
 * @returns {Object} - The dereferenced schema
 */
function dereferenceSchema(schema, rootSchema = null) {
  if (!schema || typeof schema !== 'object') { return schema; }

  const root = rootSchema || reportSchema;
  if (!root) { return schema; }

  // Create a deep copy to avoid modifying the original
  const result = JSON.parse(JSON.stringify(schema));

  function resolveRef(obj, currentPath = []) {
    if (!obj || typeof obj !== 'object') { return obj; }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => resolveRef(item, [...currentPath, index]));
    }

    // Handle $ref resolution
    if (obj.$ref && typeof obj.$ref === 'string') {
      const refPath = obj.$ref.replace('#/', '').split('/');
      let resolved = root;

      for (const segment of refPath) {
        if (resolved && resolved[segment]) {
          resolved = resolved[segment];
        } else {
          console.warn(`[StructuredLLM] Could not resolve $ref: ${obj.$ref} at segment: ${segment}`);
          return obj; // Return original if can't resolve
        }
      }

      // Recursively resolve the resolved schema in case it has more $refs
      return resolveRef(resolved, currentPath);
    }

    // Recursively process all properties
    const processed = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref') { continue; } // Skip $ref as we handled it above
      processed[key] = resolveRef(value, [...currentPath, key]);
    }

    return processed;
  }

  return resolveRef(result);
}

/**
 * Get structured data from any supported LLM based on options.
 * This is the main entry point for other modules.
 *
 * @param {Object} options - Options object.
 * @param {string} options.moduleType - Module type (e.g., 'ui', 'seo') or a custom key for schema lookup.
 * @param {string} options.prompt - Prompt text for the LLM.
 * @param {string} [options.modelFamily='claude'] - AI model family ('claude', 'openai', 'gemini').
 * @param {string} [options.model=null] - Specific model ID. If null, a default for the family/tier is chosen.
 * @param {string} [options.systemPrompt='You are an expert web analyzer...'] - System prompt.
 * @param {boolean} [options.enhancedSchema=true] - Whether to use the full (true) or simplified (false) schema.
 * @param {string} [options.schemaVersion=TARGET_SCHEMA_VERSION] - Target schema version for the output. (Currently informational for prompt).
 * @param {Array} [options.images=null] - Optional array of image data for vision models. Each object: { mediaType: string, data: base64String }.
 * @param {number} [options.maxTokens=null] - Max tokens for the response.
 * @param {boolean} [options.verbose=false] - Verbose logging.
 * @param {Object} [options.customSchema=null] - A custom schema object to use instead of one from reportSchema.$defs.
 * @param {Array} [options.messages=null] - Pre-defined message array for advanced chat scenarios.
 * @param {string} [options.tier='Free'] - Service tier for fallback selection.
 * @returns {Promise<Object>} Structured data as specified by the schema.
 */
/**
 * Helper function to detect provider from model name
 */
function getProviderFromModelName(modelName) {
  if (!modelName) return null;
  const lower = modelName.toLowerCase();
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gpt') || lower.includes('o3') || lower.includes('o4')) return 'openai';
  if (lower.includes('gemini')) return 'google';
  return null;
}

async function getStructuredData({
  moduleType,
  prompt,
  modelFamily = DEFAULT_MODEL_FAMILY,
  model = null,
  systemPrompt = `You are an expert web analyzer. Provide a structured analysis based on the schema for ${moduleType}.`,
  enhancedSchema = true,
  schemaVersion = TARGET_SCHEMA_VERSION, // Informational for now
  images = null,
  maxTokens = null, // Will use provider defaults if not set
  verbose = false,
  customSchema = null,
  messages = null,
  tier = 'Free' // Added tier parameter for fallback selection
}) {
  if (verbose) { console.log(`[StructuredLLM] Starting structured data extraction for ${moduleType} using ${modelFamily} family`); }

  // CRITICAL: If modelFamily is set and model is explicitly provided, check compatibility
  if (modelFamily && model) {
    const modelProvider = getProviderFromModelName(model);
    const familyToProvider = {
      'google': 'google',
      'anthropic': 'anthropic',
      'claude': 'anthropic',
      'openai': 'openai'
    };
    const expectedProvider = familyToProvider[modelFamily.toLowerCase()];

    if (modelProvider && expectedProvider && modelProvider !== expectedProvider) {
      console.log(`[StructuredLLM] CRITICAL: Rejecting incompatible model ${model} (from ${modelProvider}) because modelFamily is ${modelFamily} (expected ${expectedProvider}). Clearing model to use fallback selection.`);
      model = null; // Clear incompatible model, let analyzeWithAI select from modelFamily
    }
  }

  // Ensure schema is initialized before proceeding
  if (!reportSchema || !dereferencedSchema) {
    if (verbose) { console.log(`[StructuredLLM] Initializing schema...`); }
    await initializeSchema();
  }

  if (!customSchema && !reportSchema) {
    throw new Error("[StructuredLLM] Cannot proceed: Report schema is not loaded and no custom schema provided.");
  }

  const finalSchema = customSchema || (await getSchemaForModule(moduleType, enhancedSchema));

  if (!finalSchema) {
    throw new Error(`[StructuredLLM] Could not retrieve schema for moduleType: ${moduleType}`);
  }

  // Add schema version information to the system prompt or user prompt
  const augmentedSystemPrompt = `${systemPrompt} Ensure your response strictly conforms to the provided JSON schema definition (targeting schema version ${schemaVersion}).`;
  const augmentedPrompt = `${prompt}\n\n(Your output must be valid JSON according to schema version ${schemaVersion} for module ${moduleType}).`;

  // Use the enhanced AI models system with automatic fallback for overload errors
  const { analyzeWithAI } = require('./ai-models');

  try {
    // CRITICAL FIX: Inject conciseness instructions for models with limited output (<= 8192 tokens)
    // This prevents JSON truncation which causes "Unterminated string" errors
    const modelConfig = await require('./ai-models').selectIntelligentModel({
      modelFamily, model, tier, moduleName: moduleType, verbose: false
    });

    let finalSystemPrompt = augmentedSystemPrompt;
    let finalPrompt = augmentedPrompt;

    if (modelConfig && modelConfig.maxOutputTokens && modelConfig.maxOutputTokens <= 8192) {
      if (verbose) console.log(`[StructuredLLM] Detected limited output model (${modelConfig.maxOutputTokens} tokens). Injecting EXTIFREME conciseness instructions.`);

      const concisenessInstruction = `
\n\nIMPORTANT: You have a STRICT token limit. You MUST be extremely concise.
1. Use bullet points and short sentences (max 10-15 words).
2. Avoid flowery language or long explanations.
3. Focus ONLY on the most critical findings.
4. If a list asks for 3-5 items, provide exactly 3.
5. Do not output more than 6000 tokens under any circumstances or the response will be cut off and fail.`;

      finalSystemPrompt += concisenessInstruction;
      finalPrompt += "\n(Keep response under 6000 tokens - be extremely concise)";
    }

    const aiResult = await analyzeWithAI({
      prompt: finalPrompt,
      systemPrompt: finalSystemPrompt,
      modelFamily,
      model,
      tier,
      moduleName: moduleType,
      vision: images && images.length > 0,
      images: images ? images.map(img => ({
        data: img.data,
        mediaType: img.mediaType || 'image/png'
      })) : null,
      maxTokens,
      isJsonOutput: true,
      expectedJsonStructure: "object",
      verbose
    });

    if (aiResult.error) {
      throw new Error(`AI analysis failed: ${aiResult.error}`);
    }

    let structuredData = aiResult.data;

    // If the AI returned a string, try to parse it as JSON
    if (typeof structuredData === 'string') {
      try {
        structuredData = JSON.parse(structuredData);
      } catch (parseError) {
        // Try our enhanced JSON extraction methods
        structuredData = extractJsonFromText(structuredData);
        if (!structuredData) {
          throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
      }
    }

    if (verbose) {
      console.log(`[StructuredLLM] Successfully received structured data for ${moduleType}`);
      if (aiResult.usage && aiResult.usage.fallbackUsed) {
        console.log(`[StructuredLLM] Fallback was used: Primary provider failed, used ${aiResult.usage.provider} instead`);
      }
    }

    // Return both the structured data and usage information for cost tracking
    return {
      data: structuredData,
      usage: aiResult.usage || null
    };

  } catch (error) {
    console.error(`[StructuredLLM] Error in getStructuredData for ${moduleType}: ${error.message}`);

    // Enhanced error message with fallback context
    const errorContext = error.message.includes('All providers failed') ?
      'All available AI providers failed or are overloaded' :
      `Primary AI provider failed: ${error.message}`;

    throw new Error(`Failed to get structured data for ${moduleType}: ${errorContext}`);
  }
}

module.exports = {
  getStructuredData,
  // Expose provider-specific functions if direct access is needed, though getStructuredData is preferred
  getStructuredDataFromClaude,
  getStructuredDataFromOpenAI,
  getStructuredDataFromGemini,
  getSchemaForModule,
  getSchemaVersion,
  generateFunctionFromSchema, // Useful for direct tool creation
  extractJsonFromText, // Fallback utility
  initializeSchema, // Expose schema initialization
  initializeAJV, // Expose AJV initialization
  applyClaudeSimplifications, // Expose Claude simplifications
  createSimplifiedSchema, // Expose schema simplification
  dereferenceSchema, // Expose schema dereferencing
  extractJsonFromClaudeXmlResponse, // Expose new function
  attemptJsonFix // Expose new function
};