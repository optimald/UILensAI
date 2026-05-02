# Model Configuration - Central Control

## Quick Start: Change Default Provider

**To switch all defaults from one provider to another, edit ONE file:**

```javascript
// packages/worker/uilensai/config/model-defaults.js

const DEFAULT_MODEL_FAMILY = MODEL_PROVIDERS.GOOGLE; // Change this line!
```

**Options:**
- `MODEL_PROVIDERS.GOOGLE` - Google Gemini (cost-effective, fast)
- `MODEL_PROVIDERS.ANTHROPIC` - Claude (high quality, expensive)
- `MODEL_PROVIDERS.OPENAI` - OpenAI GPT (balanced)

## What This Controls

This configuration file controls the default model family used when:
- No explicit `modelFamily` is provided
- Fallback scenarios occur
- Module-specific defaults aren't set

## Module-Specific Defaults

You can also set different defaults per use case:

```javascript
const DEFAULT_MODEL_FAMILIES = {
  default: DEFAULT_MODEL_FAMILY,
  vision: DEFAULT_MODEL_FAMILY,        // Screenshot analysis
  recommendations: DEFAULT_MODEL_FAMILY, // AI recommendations
  structured: DEFAULT_MODEL_FAMILY,     // JSON schema output
  industry: DEFAULT_MODEL_FAMILY,       // Industry detection
  performance: DEFAULT_MODEL_FAMILY,    // Performance analysis
  conversion: DEFAULT_MODEL_FAMILY,      // Conversion analysis
  privacy: DEFAULT_MODEL_FAMILY         // Privacy analysis
};
```

## Files Using This Config

- ✅ `analyze/performance.js` - Performance analysis
- ✅ `analyze/conversion.js` - Conversion analysis  
- ✅ `analyze/privacy.js` - Privacy analysis
- ✅ `utils/structured-llm-output.js` - Structured JSON output
- ✅ `utils/ai-recommendation-engine.js` - AI recommendations

## After Changing

1. **Deploy worker:**
   ```bash
   cd packages/worker && flyctl deploy
   ```

2. **Test a scan** to verify the new provider is being used

## Override Per Job

Even with these defaults, you can still override per job via:
- Tier presets (`pro-tier.js`, etc.)
- Job-level `modelFamily` parameter
- Module-specific configs in tier presets

