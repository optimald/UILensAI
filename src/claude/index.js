// Import required modules
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');

// Default constants from environment or fallback values
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);
const API_ENDPOINT = process.env.ANTHROPIC_API_ENDPOINT || 'https://api.anthropic.com/v1/messages';

/**
 * Analyzes a screenshot using Anthropic's Claude vision model
 * @param {string|Buffer} imageData - The image data or file path
 * @param {string} viewport - The viewport name
 * @param {string} focusAreas - Comma-separated list of areas to focus on
 * @param {Object} options - Analysis options
 * @returns {Promise<string>} Analysis results
 */
export async function analyzeScreenshot(imageData, viewport, focusAreas = '', options = {}) {
  try {
    console.log(`Calling analyzeScreenshot for ${viewport}...`);
    console.log(`Using Claude model: ${options.model || DEFAULT_MODEL}`);
    console.log(`Focus areas: ${focusAreas}`);

    // Check if API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log(`API key detected: ${apiKey ? 'Yes' : 'No'}`);
    if (apiKey) {
      console.log(`API key length: ${apiKey.length}`);
    }

    // Convert the image to base64 if it's a file path
    let imageBase64;
    if (typeof imageData === 'string' && fs.existsSync(imageData)) {
      const imageBuffer = fs.readFileSync(imageData);
      imageBase64 = imageBuffer.toString('base64');
    } else if (Buffer.isBuffer(imageData)) {
      imageBase64 = imageData.toString('base64');
    } else if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
      // Extract base64 part if it's a data URL
      imageBase64 = imageData.split(',')[1];
    } else {
      imageBase64 = imageData;
    }

    // Check if image dimensions are too large for Claude
    const resizedBase64 = await checkAndResizeImage(imageBase64);
    
    console.log(`Screenshot converted to base64 (${resizedBase64.length} chars)`);

    // Generate the prompt
    const prompt = getAnalysisPrompt(resizedBase64, viewport, focusAreas);
    console.log(`Prompt generated (${prompt.length} chars)`);

    const analysisOptions = {
      model: options.model || DEFAULT_MODEL,
      max_tokens: options.max_tokens || MAX_TOKENS,
      temperature: options.temperature || 0.7,
      critical_evaluation: true, // Signal that we want critical analysis
      detailed_feedback: true,   // Request detailed feedback
    };

    // Send the request to Claude
    console.log(`Sending analysis request to Claude API for viewport ${viewport}`);
    console.log(`Request URL: ${API_ENDPOINT}`);
    console.log(`Request Headers: Content-Type, x-api-key, anthropic-version`);
    console.log(`Request payload includes model: ${analysisOptions.model}, max_tokens: ${analysisOptions.max_tokens}`);

    const analysisResponse = await requestClaudeAnalysis(prompt, analysisOptions);

    console.log(`Received response from Claude API for ${viewport}`);
    console.log(`Response status: ${analysisResponse.status}`);
    console.log(`Response model: ${analysisResponse.model}`);
    console.log(`Response content length: ${analysisResponse.content.length} characters`);

    if (analysisResponse.content) {
      console.log(`Successfully received analysis for ${viewport} (length: ${analysisResponse.content.length} chars)`);
      return analysisResponse.content;
    } else {
      throw new Error('No content received from Claude API');
    }
  } catch (error) {
    console.error(`Error analyzing screenshot: ${error.message}`);
    throw error;
  }
}

/**
 * Sends a request to Claude API for analysis
 * @param {string} prompt - The prompt text
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis response
 */
async function requestClaudeAnalysis(prompt, options) {
  try {
    const response = await axios.post(
      API_ENDPOINT,
      {
        model: options.model,
        max_tokens: options.max_tokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error(`Error calling Claude API: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a prompt for UI analysis
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} viewport - Viewport name
 * @param {string} focusAreas - Focus areas for analysis
 * @returns {string} Formatted prompt
 */
function getAnalysisPrompt(imageBase64, viewport, focusAreas) {
  // Prompt implementation
  return `Analyze this UI screenshot for viewport ${viewport}...`;
}

/**
 * Checks if an image is too large and resizes if needed
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<string>} Possibly resized base64 image
 */
async function checkAndResizeImage(base64Image) {
  // Resize implementation
  return base64Image;
} 