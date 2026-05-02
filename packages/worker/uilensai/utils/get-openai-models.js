
/**
 * OpenAI Models and Token Limits Fetcher
 * 
 * This script fetches all available OpenAI models and their specifications
 * including context window sizes and token limits.
 */

// Load environment variables from .env file
require('dotenv').config();

const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Known token limits for OpenAI models (as of 2024)
// These are context window sizes - actual output limits may be lower
const KNOWN_TOKEN_LIMITS = {
  // GPT-4 Models
  'gpt-4': { context: 8192, output: 4096 },
  'gpt-4-32k': { context: 32768, output: 4096 },
  'gpt-4-0613': { context: 8192, output: 4096 },
  'gpt-4-turbo': { context: 128000, output: 4096 },
  'gpt-4-turbo-preview': { context: 128000, output: 4096 },
  'gpt-4-turbo-2024-04-09': { context: 128000, output: 4096 },
  'gpt-4-0125-preview': { context: 128000, output: 4096 },
  'gpt-4-1106-preview': { context: 128000, output: 4096 },
  'gpt-4-vision-preview': { context: 128000, output: 4096 },
  'gpt-4o': { context: 128000, output: 4096 },
  'gpt-4o-2024-05-13': { context: 128000, output: 4096 },
  'gpt-4o-2024-08-06': { context: 128000, output: 16384 },
  'gpt-4o-2024-11-20': { context: 128000, output: 16384 },
  'gpt-4o-mini': { context: 128000, output: 16384 },
  'gpt-4o-mini-2024-07-18': { context: 128000, output: 16384 },
  'chatgpt-4o-latest': { context: 128000, output: 16384 },
  
  // GPT-4.1 Models (Latest)
  'gpt-4.1': { context: 200000, output: 32768 },
  'gpt-4.1-2025-04-14': { context: 200000, output: 32768 },
  'gpt-4.1-mini': { context: 128000, output: 16384 },
  'gpt-4.1-mini-2025-04-14': { context: 128000, output: 16384 },
  'gpt-4.1-nano': { context: 64000, output: 8192 },
  'gpt-4.1-nano-2025-04-14': { context: 64000, output: 8192 },
  
  // GPT-4.5 Models (Preview)
  'gpt-4.5-preview': { context: 256000, output: 65536 },
  'gpt-4.5-preview-2025-02-27': { context: 256000, output: 65536 },
  
  // GPT-4o Audio Models
  'gpt-4o-audio-preview': { context: 128000, output: 4096 },
  'gpt-4o-audio-preview-2024-10-01': { context: 128000, output: 4096 },
  'gpt-4o-audio-preview-2024-12-17': { context: 128000, output: 4096 },
  'gpt-4o-mini-audio-preview': { context: 128000, output: 16384 },
  'gpt-4o-mini-audio-preview-2024-12-17': { context: 128000, output: 16384 },
  
  // GPT-4o Realtime Models
  'gpt-4o-realtime-preview': { context: 128000, output: 4096 },
  'gpt-4o-realtime-preview-2024-10-01': { context: 128000, output: 4096 },
  'gpt-4o-realtime-preview-2024-12-17': { context: 128000, output: 4096 },
  'gpt-4o-mini-realtime-preview': { context: 128000, output: 16384 },
  'gpt-4o-mini-realtime-preview-2024-12-17': { context: 128000, output: 16384 },
  
  // GPT-4o Search Models
  'gpt-4o-search-preview': { context: 128000, output: 4096 },
  'gpt-4o-search-preview-2025-03-11': { context: 128000, output: 4096 },
  'gpt-4o-mini-search-preview': { context: 128000, output: 16384 },
  'gpt-4o-mini-search-preview-2025-03-11': { context: 128000, output: 16384 },
  
  // GPT-4o Specialized Models
  'gpt-4o-transcribe': { context: 128000, output: 4096 },
  'gpt-4o-mini-transcribe': { context: 128000, output: 16384 },
  'gpt-4o-mini-tts': { context: 4096, output: 'Audio' },
  
  // GPT-3.5 Models
  'gpt-3.5-turbo': { context: 16385, output: 4096 },
  'gpt-3.5-turbo-0125': { context: 16385, output: 4096 },
  'gpt-3.5-turbo-1106': { context: 16385, output: 4096 },
  'gpt-3.5-turbo-16k': { context: 16385, output: 4096 },
  'gpt-3.5-turbo-instruct': { context: 4096, output: 4096 },
  'gpt-3.5-turbo-instruct-0914': { context: 4096, output: 4096 },
  
  // O1 Models (Reasoning)
  'o1': { context: 200000, output: 100000 },
  'o1-2024-12-17': { context: 200000, output: 100000 },
  'o1-mini': { context: 128000, output: 65536 },
  'o1-mini-2024-09-12': { context: 128000, output: 65536 },
  'o1-preview': { context: 128000, output: 32768 },
  'o1-preview-2024-09-12': { context: 128000, output: 32768 },
  'o1-pro': { context: 200000, output: 100000 },
  'o1-pro-2025-03-19': { context: 200000, output: 100000 },
  
  // O3 Models (Next Generation Reasoning)
  'o3-mini': { context: 128000, output: 65536 },
  'o3-mini-2025-01-31': { context: 128000, output: 65536 },
  
  // O4 Models (Future)
  'o4-mini': { context: 256000, output: 131072 },
  'o4-mini-2025-04-16': { context: 256000, output: 131072 },
  
  // Text Models (Legacy)
  'text-davinci-003': { context: 4097, output: 4097 },
  'text-davinci-002': { context: 4097, output: 4097 },
  'text-curie-001': { context: 2049, output: 2049 },
  'text-babbage-001': { context: 2049, output: 2049 },
  'text-ada-001': { context: 2049, output: 2049 },
  'davinci-002': { context: 16384, output: 4096 },
  'babbage-002': { context: 16384, output: 4096 },
  
  // Embedding Models
  'text-embedding-ada-002': { context: 8191, output: 1536 }, // 1536 dimensions
  'text-embedding-3-small': { context: 8191, output: 1536 },
  'text-embedding-3-large': { context: 8191, output: 3072 },
  
  // Audio Models
  'whisper-1': { context: 'N/A', output: 'N/A' },
  'tts-1': { context: 4096, output: 'Audio' },
  'tts-1-hd': { context: 4096, output: 'Audio' },
  'tts-1-1106': { context: 4096, output: 'Audio' },
  'tts-1-hd-1106': { context: 4096, output: 'Audio' },
  
  // Image Models
  'dall-e-2': { context: 1000, output: 'Image' },
  'dall-e-3': { context: 4000, output: 'Image' },
  'gpt-image-1': { context: 128000, output: 'Image' },
  
  // Moderation
  'text-moderation-latest': { context: 32768, output: 'Classification' },
  'text-moderation-stable': { context: 32768, output: 'Classification' },
  'omni-moderation-latest': { context: 32768, output: 'Classification' },
  'omni-moderation-2024-09-26': { context: 32768, output: 'Classification' },
  
  // Specialized Models
  'codex-mini-latest': { context: 8192, output: 4096 }
};

async function fetchOpenAIModels() {
  console.log('🤖 Fetching OpenAI Models and Token Limits\n');
  
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
      console.log('\n💡 To set your API key:');
      console.log('   export OPENAI_API_KEY="your-api-key-here"');
      console.log('   # or add it to your .env file');
      process.exit(1);
    }

    console.log('📡 Fetching models from OpenAI API...\n');
    
    // Fetch all available models
    const response = await openai.models.list();
    const models = response.data;
    
    // Sort models by ID
    models.sort((a, b) => a.id.localeCompare(b.id));
    
    console.log(`✅ Found ${models.length} models\n`);
    
    // Group models by type
    const modelGroups = {
      'GPT-4 Models': [],
      'GPT-3.5 Models': [],
      'Text Models (Legacy)': [],
      'Embedding Models': [],
      'Audio Models': [],
      'Image Models': [],
      'Moderation Models': [],
      'Other Models': []
    };
    
    models.forEach(model => {
      const id = model.id;
      const tokenLimits = KNOWN_TOKEN_LIMITS[id] || { context: 'Unknown', output: 'Unknown' };
      
      const modelInfo = {
        id: id,
        object: model.object,
        created: new Date(model.created * 1000).toISOString().split('T')[0],
        owned_by: model.owned_by,
        context_tokens: tokenLimits.context,
        output_tokens: tokenLimits.output
      };
      
      if (id.includes('gpt-4')) {
        modelGroups['GPT-4 Models'].push(modelInfo);
      } else if (id.includes('gpt-3.5')) {
        modelGroups['GPT-3.5 Models'].push(modelInfo);
      } else if (id.includes('text-') && !id.includes('embedding') && !id.includes('moderation')) {
        modelGroups['Text Models (Legacy)'].push(modelInfo);
      } else if (id.includes('embedding')) {
        modelGroups['Embedding Models'].push(modelInfo);
      } else if (id.includes('whisper') || id.includes('tts')) {
        modelGroups['Audio Models'].push(modelInfo);
      } else if (id.includes('dall-e')) {
        modelGroups['Image Models'].push(modelInfo);
      } else if (id.includes('moderation')) {
        modelGroups['Moderation Models'].push(modelInfo);
      } else {
        modelGroups['Other Models'].push(modelInfo);
      }
    });
    
    // Display results
    Object.entries(modelGroups).forEach(([groupName, groupModels]) => {
      if (groupModels.length > 0) {
        console.log(`\n📋 ${groupName}:`);
        console.log('─'.repeat(80));
        
        groupModels.forEach(model => {
          console.log(`🔹 ${model.id}`);
          console.log(`   Context Window: ${model.context_tokens} tokens`);
          console.log(`   Max Output: ${model.output_tokens} tokens`);
          console.log(`   Owner: ${model.owned_by}`);
          console.log(`   Created: ${model.created}`);
          console.log('');
        });
      }
    });
    
    // Summary statistics
    console.log('\n📊 Summary:');
    console.log('─'.repeat(40));
    Object.entries(modelGroups).forEach(([groupName, groupModels]) => {
      if (groupModels.length > 0) {
        console.log(`${groupName}: ${groupModels.length} models`);
      }
    });
    
    // Export to JSON file
    const exportData = {
      fetched_at: new Date().toISOString(),
      total_models: models.length,
      models: models.map(model => ({
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by,
        context_tokens: KNOWN_TOKEN_LIMITS[model.id]?.context || 'Unknown',
        output_tokens: KNOWN_TOKEN_LIMITS[model.id]?.output || 'Unknown'
      })),
      token_limits: KNOWN_TOKEN_LIMITS
    };
    
    const fs = require('fs');
    fs.writeFileSync('openai-models.json', JSON.stringify(exportData, null, 2));
    console.log('\n💾 Results exported to openai-models.json');
    
    // Show recommended models for different use cases
    console.log('\n🎯 Recommended Models by Use Case:');
    console.log('─'.repeat(50));
    console.log('📝 Text Generation (High Quality): gpt-4o, gpt-4-turbo');
    console.log('💬 Chat Applications: gpt-4o-mini, gpt-3.5-turbo');
    console.log('📊 Data Analysis: gpt-4o, gpt-4-turbo');
    console.log('🔍 Embeddings: text-embedding-3-large, text-embedding-3-small');
    console.log('🎵 Audio Transcription: whisper-1');
    console.log('🗣️ Text-to-Speech: tts-1-hd, tts-1');
    console.log('🎨 Image Generation: dall-e-3, dall-e-2');
    console.log('🛡️ Content Moderation: text-moderation-latest');
    
  } catch (error) {
    console.error('❌ Error fetching models:', error.message);
    
    if (error.status === 401) {
      console.log('\n💡 This appears to be an authentication error.');
      console.log('   Please check that your OPENAI_API_KEY is valid and has the correct permissions.');
    } else if (error.status === 429) {
      console.log('\n💡 Rate limit exceeded. Please try again in a moment.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('\n💡 Network error. Please check your internet connection.');
    }
    
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  fetchOpenAIModels();
}

module.exports = { fetchOpenAIModels, KNOWN_TOKEN_LIMITS }; 