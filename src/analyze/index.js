const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const chalk = require('chalk');
const sharp = require('sharp');
const { Anthropic } = require('@anthropic-ai/sdk');

// Define prompt templates for different focus areas
const PROMPT_TEMPLATES = {
  'accessibility': `Analyze this UI screenshot for accessibility issues, focusing on:
- Color contrast and readability
- Text size and legibility
- Interactive element affordances
- Keyboard navigability clues
- Alternative text indicators
- Screen reader compatibility hints

Rate the accessibility of this interface on a scale of 1-10, where 1 represents serious accessibility issues and 10 represents excellent accessibility.
Provide specific recommendations for improving accessibility.`,

  'usability': `Analyze this UI screenshot for usability issues, focusing on:
- Clarity of UI controls and interactions
- Logical layout and information hierarchy
- Ease of accomplishing key tasks
- Potential user confusion points
- Intuitiveness of navigation
- Layout consistency

Rate the usability of this interface on a scale of 1-10, where 1 represents very poor usability and 10 represents excellent usability.
Provide specific recommendations for improving usability.`,

  'visual-design': `Analyze this UI screenshot for visual design issues, focusing on:
- Visual hierarchy and emphasis
- Spacing and layout balance
- Typography choices and execution
- Color palette effectiveness
- Consistency of design elements
- Overall visual appeal

Rate the visual design of this interface on a scale of 1-10, where 1 represents poor visual design and 10 represents excellent visual design.
Provide specific recommendations for improving visual design.`,

  'responsive': `Analyze this UI screenshot for responsive design issues, focusing on:
- Content adaptation to viewport
- Readability at this screen size
- Touch target appropriateness
- Layout adjustments
- Content prioritization
- Potential viewport-specific issues

Rate the responsive design on a scale of 1-10, where 1 represents poor responsive implementation and 10 represents excellent responsive design.
Provide specific recommendations for improving responsive design at this viewport size.`,

  'hierarchy': `Analyze this UI screenshot for visual hierarchy issues, focusing on:
- Priority of information presentation
- Visual weight of elements
- Attention guidance through the interface
- Clear differentiation between UI sections
- Use of space to organize content
- Path for user's eye to follow

Rate the visual hierarchy on a scale of 1-10, where 1 represents poor information hierarchy and 10 represents excellent visual hierarchy.
Provide specific recommendations for improving visual hierarchy.`,

  'above-the-fold': `Analyze this UI screenshot focusing specifically on above-the-fold content (what users see without scrolling), examining:
- Initial impact and clarity of value proposition
- Presence and effectiveness of primary call-to-action
- Visual prioritization of critical information
- First impression quality
- Balance between information density and whitespace
- Content relevance to user needs
- Clarity of next steps for user

Rate the effectiveness of the above-the-fold content on a scale of 1-10.
Provide specific, actionable recommendations for improving the above-the-fold experience.`,

  'content-flow': `Analyze this UI screenshot for content flow and information architecture, focusing on:
- Logical progression of information
- Visual cues that guide users through content
- Scannable layout patterns (F-pattern, Z-pattern)
- Content chunking and grouping
- Use of headings, subheadings and typography to create flow
- Transition between different content sections
- Balance of text, images, and interactive elements

Rate the effectiveness of the content flow on a scale of 1-10.
Provide specific recommendations for improving content flow based on UX design best practices.`,

  'branding': `Analyze this UI screenshot for branding effectiveness, focusing on:
- Brand identity clarity and consistency
- Visual tone and personality
- Memorability of brand elements
- Differentiation from competitors
- Trust signals and credibility indicators
- Brand message reinforcement

Rate the branding effectiveness on a scale of 1-10, where 1 represents poor or inconsistent branding and 10 represents excellent brand implementation.
Provide specific recommendations for improving branding elements.`,

  'consistency': `Analyze this UI screenshot for design consistency issues, focusing on:
- Consistency of UI components
- Alignment with design systems
- Typography consistency
- Color application consistency
- Spacing and layout patterns
- Interaction patterns

Rate the design consistency on a scale of 1-10, where 1 represents highly inconsistent design and 10 represents perfect consistency.
Provide specific recommendations for improving design consistency.`,

  'aesthetics': `Analyze this UI screenshot for aesthetic appeal and visual attractiveness, focusing on:
- Visual balance and harmony
- Color harmony and appeal
- Typographic beauty and readability
- Quality of visual elements
- Overall visual appeal and memorability
- Modern vs dated appearance

Rate the aesthetics on a scale of 1-10, comparing to well-designed sites like Airbnb or Nike versus more functional but visually basic sites.
Provide specific recommendations for improving aesthetic appeal.`
};

/**
 * Analyzes screenshots using Claude 3.7 API
 * 
 * @param {Object} options - Options for analysis
 * @param {Array<string>} options.screenshotPaths - Paths to screenshots to analyze
 * @param {string} options.url - URL the screenshots were captured from
 * @param {Array<string>} options.focus - Analysis focus areas
 * @param {string} options.model - Claude model to use (default: claude-3-haiku-20240307)
 * @param {number} options.maxTokens - Maximum tokens to use for the response (default: 4096)
 * @param {function} options.onProgress - Callback function for progress updates
 * @param {boolean} options.verbose - Whether to show verbose logs
 * @returns {Promise<Object>} - Analysis results
 */
async function analyzeScreenshots({ 
  screenshotPaths, 
  url, 
  focus = ['accessibility', 'branding', 'responsive', 'hierarchy', 'consistency', 'aesthetics', 'above-the-fold', 'content-flow', 'visual-design', 'usability'],
  model = 'claude-3-haiku-20240307',
  maxTokens = 4096,
  onProgress,
  verbose = false
}) {
  // Ensure maxTokens is an integer
  maxTokens = parseInt(maxTokens, 10);

  const analysisResults = {};

  if (verbose) {
    console.log(`Analyzing ${screenshotPaths.length} screenshots for ${url}`);
    console.log(`Focus areas: ${focus.join(', ')}`);
    console.log(`Using Claude model: ${model}`);
    console.log(`API key detected: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('WARNING: No ANTHROPIC_API_KEY found in environment variables. Analysis will fail.');
    }
  }

  // Group screenshots by viewport
  const screenshotsByViewport = {};
  for (let i = 0; i < screenshotPaths.length; i++) {
    const viewport = path.basename(screenshotPaths[i]).split('-viewport-')[1].split('-')[0];
    screenshotsByViewport[viewport] = screenshotPaths[i];
  }
  
  const totalViewports = Object.keys(screenshotsByViewport).length;
  let completedViewports = 0;

  // Analyze each viewport screenshot
  for (const [viewport, screenshotPath] of Object.entries(screenshotsByViewport)) {
    try {
    // Report progress
    if (onProgress) {
        const percentage = Math.floor((completedViewports / totalViewports) * 100);
      onProgress({
        step: `Analyzing ${viewport} viewport`,
          current: completedViewports,
          total: totalViewports,
        percentage
      });
    }
    
    // Read the screenshot file
      let imageBuffer = await fsPromises.readFile(screenshotPath);
      
      // Check image dimensions and resize if necessary
      const imageMetadata = await sharp(imageBuffer).metadata();
      const MAX_DIMENSION = 8000; // Claude's max image dimension
      
      if (imageMetadata.width > MAX_DIMENSION || imageMetadata.height > MAX_DIMENSION) {
        if (verbose) {
          console.log(`Image dimensions (${imageMetadata.width}x${imageMetadata.height}) exceed Claude's limit of ${MAX_DIMENSION}px. Resizing...`);
        }
        
        // Calculate new dimensions while maintaining aspect ratio
        let newWidth = imageMetadata.width;
        let newHeight = imageMetadata.height;
        
        if (imageMetadata.width > imageMetadata.height && imageMetadata.width > MAX_DIMENSION) {
          newWidth = MAX_DIMENSION;
          newHeight = Math.round((imageMetadata.height * MAX_DIMENSION) / imageMetadata.width);
        } else if (imageMetadata.height > MAX_DIMENSION) {
          newHeight = MAX_DIMENSION;
          newWidth = Math.round((imageMetadata.width * MAX_DIMENSION) / imageMetadata.height);
        }
        
        // Resize the image
        imageBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside' })
          .toBuffer();
          
        if (verbose) {
          console.log(`Resized image to ${newWidth}x${newHeight} for analysis`);
        }
      }
      
    const base64Image = imageBuffer.toString('base64');
    console.log(`Screenshot converted to base64 (${base64Image.length} chars)`);
    
      // Build the prompt for this viewport
    let promptText = `You are a UI/UX design expert analyzing a screenshot of a webpage.\n\n`;
    promptText += `This screenshot shows the page at ${url} at ${viewport} viewport size.\n\n`;
      
      // Add focus areas to the prompt
      promptText += 'Please analyze this UI and identify issues in these specific areas:\n\n';
      
      for (const area of focus) {
        if (PROMPT_TEMPLATES[area]) {
          promptText += PROMPT_TEMPLATES[area] + '\n\n';
        }
      }
      
      promptText += 'Provide a clear, prioritized list of issues for each category. End with a summary of the most critical issues to address first.';

      // Send the analysis request to Claude
      if (verbose) {
        console.log(`Sending analysis request to Claude API using model: ${model}`);
      }
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: parseInt(maxTokens, 10),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: promptText
                },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: base64Image
                  }
                }
              ]
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

      if (verbose) {
        console.log(`Received response from Claude API for ${viewport}`);
        console.log(`Response status: ${response.status}`);
        console.log(`Response model: ${response.data.model}`);
        console.log(`Response content length: ${response.data.content?.[0]?.text?.length || 0} characters`);
      }

      if (!response.data.content || !response.data.content[0] || !response.data.content[0].text) {
        throw new Error(`Empty or invalid response from Claude API for ${viewport}: ${JSON.stringify(response.data)}`);
      }

      analysisResults[viewport] = {
        analysis: response.data.content[0].text,
        screenshot: screenshotPath,
        model: response.data.model
      };

      completedViewports++;
    } catch (error) {
      console.error(`Error analyzing ${viewport} screenshot:`, error.message);
      
      if (error.response) {
        console.error(`API Error Status: ${error.response.status}`);
        console.error(`API Error Data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      if (verbose && error.stack) {
        console.error(`Error stack trace:`, error.stack);
      }
      
      analysisResults[viewport] = {
        error: error.response?.data || error.message,
        screenshot: screenshotPath,
      };
    }
  }
  
  // Perform cross-viewport analysis if there are multiple viewports
  if (Object.keys(screenshotsByViewport).length > 1 && !Object.values(analysisResults).some(r => r.error)) {
    try {
      // Report progress
      if (onProgress) {
        onProgress({
          step: 'Performing cross-viewport analysis',
          current: completedViewports,
          total: totalViewports + 1, // +1 for the cross-viewport analysis
          percentage: Math.floor((completedViewports / (totalViewports + 1)) * 100)
        });
      }
      
      // Build a multi-image prompt
      let crossPromptText = `You are a UI/UX design expert analyzing screenshots of a webpage at different viewport sizes.\n\n`;
      crossPromptText += `These screenshots show the page at ${url} at different viewport sizes.\n\n`;
      
      crossPromptText += 'Compare the responsive behavior across these viewports and identify any responsive design issues:\n\n';
      crossPromptText += '1. Elements that don\'t resize or reflow appropriately\n';
      crossPromptText += '2. Content that becomes illegible or unusable\n';
      crossPromptText += '3. Layout shifts or spacing issues\n';
      crossPromptText += '4. Inconsistencies in UI elements across viewports\n\n';
      
      crossPromptText += 'Provide a prioritized list of the most important responsive issues to fix.';
      
      // Prepare the content array with all screenshots (limited to first 3 if there are many)
      const contentItems = [{ type: 'text', text: crossPromptText }];
      
      // Add up to 3 screenshots to avoid reaching token limits
      const viewportsToInclude = Object.keys(screenshotsByViewport).slice(0, 3);
      
      for (const viewport of viewportsToInclude) {
        // Read and resize the image if needed
        let imageBuffer = await fsPromises.readFile(screenshotsByViewport[viewport]);
        
        // Check image dimensions and resize if necessary
        const imageMetadata = await sharp(imageBuffer).metadata();
        const MAX_DIMENSION = 8000; // Claude's max image dimension
        
        if (imageMetadata.width > MAX_DIMENSION || imageMetadata.height > MAX_DIMENSION) {
          if (verbose) {
            console.log(`Cross-viewport image dimensions (${imageMetadata.width}x${imageMetadata.height}) exceed Claude's limit of ${MAX_DIMENSION}px. Resizing...`);
          }
          
          // Calculate new dimensions while maintaining aspect ratio
          let newWidth = imageMetadata.width;
          let newHeight = imageMetadata.height;
          
          if (imageMetadata.width > imageMetadata.height && imageMetadata.width > MAX_DIMENSION) {
            newWidth = MAX_DIMENSION;
            newHeight = Math.round((imageMetadata.height * MAX_DIMENSION) / imageMetadata.width);
          } else if (imageMetadata.height > MAX_DIMENSION) {
            newHeight = MAX_DIMENSION;
            newWidth = Math.round((imageMetadata.width * MAX_DIMENSION) / imageMetadata.height);
          }
          
          // Resize the image
          imageBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside' })
            .toBuffer();
            
          if (verbose) {
            console.log(`Resized cross-viewport image to ${newWidth}x${newHeight} for analysis`);
          }
        }
        
        const base64Image = imageBuffer.toString('base64');
        
        contentItems.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: base64Image
          }
        });
      }
      
      // Send the cross-viewport analysis request
      const crossResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: parseInt(maxTokens, 10),
          messages: [
            {
              role: 'user',
              content: contentItems
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

      analysisResults['cross-viewport'] = {
        analysis: crossResponse.data.content[0].text,
        model: crossResponse.data.model
      };
    } catch (error) {
      console.error('Error in cross-viewport analysis:', error.response?.data || error);
      analysisResults['cross-viewport'] = {
        error: error.response?.data || error.message
      };
    }
  }

  return {
    viewports: Object.keys(screenshotsByViewport),
    focus,
    url,
    results: analysisResults
  };
}

async function analyzeViewport(options, viewport, screenshot) {
  try {
    if (options.verbose) {
      console.log(`Analyzing viewport ${viewport.name} with size ${viewport.width}x${viewport.height}...`);
      console.log(`Screenshot buffer size: ${screenshot ? screenshot.length : 'unknown'} bytes`);
      console.log(`Model: ${options.model || 'default'}`);
    } else {
      // Add minimal logging even without verbose mode
      console.log(`Analyzing ${viewport.name} viewport...`);
    }

    // Prepare template data for the prompt
    const templateData = {
      url: options.url,
      viewportName: viewport.name,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      selector: options.selector
    };

    // Determine which focus areas to include in the prompt
    const focusAreas = Array.isArray(options.focus) && options.focus.length > 0 
      ? options.focus 
      : ['accessibility', 'branding', 'responsive', 'hierarchy', 'consistency', 'aesthetics', 'above-the-fold', 'content-flow', 'visual-design', 'usability'];

    if (options.verbose) {
      console.log(`Focus areas: ${focusAreas.join(', ')}`);
    }

    // Use the improved analyzeScreenshot function
    console.log(`Calling analyzeScreenshot for ${viewport.name}...`);
    const result = await analyzeScreenshot(options, screenshot, templateData, focusAreas);
    
    if (!result) {
      console.error(`Empty result returned from analyzeScreenshot for ${viewport.name}`);
      throw new Error('Analysis API returned empty result');
    }

    console.log(`Successfully received analysis for ${viewport.name} (length: ${result.length} chars)`);

    // Parse the response
    return parseAnalysisResponse(result);
  } catch (error) {
    console.error(`Failed to analyze viewport ${viewport.name}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// Add a helper function to generate the prompt
function generatePrompt(templateData, focusAreas) {
  let promptText = `You are a UI/UX design expert analyzing a screenshot of a webpage.\n\n`;
  promptText += `This screenshot shows the page at ${templateData.url} at ${templateData.viewportName} viewport size (${templateData.viewportWidth}x${templateData.viewportHeight}).\n\n`;
  
  if (templateData.selector) {
    promptText += `The user has specifically highlighted the element matching this selector: "${templateData.selector}".\n\n`;
  }

  promptText += 'Please analyze this UI and identify issues in these specific areas:\n\n';
  
  // Add focus areas to the prompt from our templates
  for (const area of focusAreas) {
    if (PROMPT_TEMPLATES[area]) {
      promptText += PROMPT_TEMPLATES[area] + '\n\n';
    }
  }
  
  // Add instructions for formatting the response
  promptText += `For each category, structure your response with a "# [Category Name]" heading.\n`;
  promptText += `End with a "# Summary" section that highlights the most critical issues to address first.\n\n`;
  promptText += `Provide actionable recommendations for improvements rather than just observations.`;
  
  return promptText;
}

/**
 * Resize image to fit within Claude's dimension limits if needed
 * @param {Buffer} imageBuffer - The image buffer to resize
 * @returns {Promise<Buffer>} The potentially resized image buffer
 */
async function resizeImageIfNeeded(imageBuffer) {
  try {
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    
    // Claude's dimension limit is 8000 pixels
    const MAX_DIMENSION = 8000;
    
    // Check if resizing is needed
    if (metadata.width <= MAX_DIMENSION && metadata.height <= MAX_DIMENSION) {
      return imageBuffer; // No resizing needed
    }
    
    // Calculate new dimensions while maintaining aspect ratio
    let newWidth = metadata.width;
    let newHeight = metadata.height;
    
    if (metadata.width > MAX_DIMENSION) {
      newWidth = MAX_DIMENSION;
      newHeight = Math.round((newWidth / metadata.width) * metadata.height);
    }
    
    if (newHeight > MAX_DIMENSION) {
      newHeight = MAX_DIMENSION;
      newWidth = Math.round((newHeight / metadata.height) * metadata.width);
    }
    
    console.log(`Resizing image from ${metadata.width}x${metadata.height} to ${newWidth}x${newHeight}`);
    
    // Resize the image
    return await sharp(imageBuffer)
      .resize(newWidth, newHeight)
      .toBuffer();
  } catch (error) {
    console.error('Error resizing image:', error);
    return imageBuffer; // Return original image if resizing fails
  }
}

/**
 * Analyzes a single screenshot with Anthropic's Claude API
 * 
 * @param {Object} options - Analysis options
 * @param {Buffer} screenshot - Screenshot buffer
 * @param {Object} templateData - Data to populate the prompt template
 * @param {Array<string>} focusAreas - Areas to focus the analysis on
 * @returns {Promise<string>} - Claude's analysis response text
 */
async function analyzeScreenshot(options, screenshot, templateData, focusAreas) {
  const { model, maxTokens, verbose } = options;
  
  console.log(`Using Claude model: ${model}`);
  console.log(`Focus areas: ${focusAreas.join(', ')}`);
  
  // Make sure we have an API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log(`API key detected: ${apiKey ? 'Yes' : 'No'}`);
  if (apiKey) {
    console.log(`API key length: ${apiKey.length}`);
  } else {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }
  
  try {
    let imageBuffer;
    
    if (typeof screenshot === 'string') {
      // If screenshot is a path, read the file
      imageBuffer = await fsPromises.readFile(screenshot);
    } else if (Buffer.isBuffer(screenshot)) {
      // If screenshot is already a buffer, use it directly
      imageBuffer = screenshot;
    } else {
      throw new Error('Screenshot must be a file path or buffer');
    }
    
    // Resize image if needed
    const resizedImageBuffer = await resizeImageIfNeeded(imageBuffer);
    
    // Convert the image to base64
    const base64Image = resizedImageBuffer.toString('base64');
    console.log(`Screenshot converted to base64 (${base64Image.length} chars)`);
    
    // Generate the prompt using the template data and focus areas
    const promptText = generatePrompt(templateData, focusAreas);
    console.log(`Prompt generated (${promptText.length} chars)`);

    // Log API request details
    console.log(`Sending analysis request to Claude API for viewport ${templateData.viewportName}`);
    console.log(`Request URL: https://api.anthropic.com/v1/messages`);
    console.log(`Request Headers: Content-Type, x-api-key, anthropic-version`);
    console.log(`Request payload includes model: ${model}, max_tokens: ${maxTokens}`);

    // Send the analysis request to Claude
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: parseInt(maxTokens, 10),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: base64Image
                }
              }
            ]
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

    console.log(`Received response from Claude API for ${templateData.viewportName}`);
    console.log(`Response status: ${response.status}`);
    console.log(`Response model: ${response.data.model || 'unknown'}`);
    console.log(`Response content length: ${response.data.content?.[0]?.text?.length || 0} characters`);

    if (!response.data.content || !response.data.content[0] || !response.data.content[0].text) {
      console.error(`Empty response structure:`, JSON.stringify(response.data, null, 2));
      throw new Error(`Empty or invalid response from Claude API: ${JSON.stringify(response.data)}`);
    }

    return response.data.content[0].text;
  } catch (error) {
    console.error(`Error in analyzeScreenshot:`, error.message);
    
    if (error.response) {
      console.error(`API Error Status: ${error.response.status}`);
      console.error(`API Error Data:`, JSON.stringify(error.response.data, null, 2));
      
      // Check for specific API error types
      const errorData = error.response.data;
      
      // Handle token limit errors
      if (errorData && errorData.error && 
         (errorData.error.type === 'invalid_request_error' || 
          errorData.error.type === 'validation_error') && 
         (errorData.error.message.includes('token') || 
          errorData.error.message.includes('max_tokens'))) {
        throw new Error(`Token limit exceeded: ${errorData.error.message}. Try increasing --max-tokens or using a model with higher output limits.`);
      }
      
      // Throw the API error with the detailed message
      if (errorData && errorData.error) {
        throw new Error(`Claude API error: ${errorData.error.message || JSON.stringify(errorData)}`);
      }
    }
    
    if (error.stack) {
      console.error(`Error stack trace:`, error.stack);
    }
    
    throw error;
  }
}

/**
 * Takes a screenshot of a URL with the given viewport
 * 
 * @param {string} url - URL to capture
 * @param {Object} viewport - Viewport dimensions and name
 * @param {Object} options - Screenshot options
 * @returns {Promise<Buffer>} - Screenshot image as buffer
 */
async function takeScreenshot(url, viewport, options) {
  // In our implementation, we'll just use the screenshots captured earlier
  // This is called during analyze, but we already have the screenshots at that point
  
  if (options.verbose) {
    console.log(`Using screenshot for viewport ${viewport.name}`);
  }
  
  // Find the screenshot in the screenshotResults
  if (options && options.screenshotResults) {
    const result = options.screenshotResults.find(r => r.viewport.name === viewport.name);
    if (result && result.screenshot) {
      return result.screenshot;
    }
  }
  
  throw new Error(`Screenshot not found for viewport ${viewport.name}`);
}

async function analyze(options) {
  const { url, viewports, useCache, cacheDir, onProgress, filterScreenshots, verbose, screenshotResults } = options;

  // Create cache directory if it doesn't exist and caching is enabled
  if (useCache && !fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  if (verbose) {
    console.log(`Starting analysis of ${url}`);
    console.log(`Using viewports: ${viewports.map(v => v.name).join(', ')}`);
    console.log(`Caching enabled: ${useCache ? 'Yes' : 'No'}`);
    console.log(`Using model: ${options.model}`);
    console.log(`API key detected: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
  }

  onProgress?.('Capturing screenshots', 0);
  
  // Check if we already have screenshots or need to take them
  const screenshots = screenshotResults || [];
  
  if (screenshots.length === 0) {
    // Take screenshots of each viewport
    const screenshotOptions = {
      ...options,
      screenshotResults: screenshots
    };
    
    const newScreenshots = await Promise.all(
      viewports.map(async (viewport, index) => {
        try {
          if (verbose) {
            console.log(`Capturing screenshot for viewport ${viewport.name} (${viewport.width}x${viewport.height})...`);
          }

          // Take screenshot
          const screenshot = await takeScreenshot(url, viewport, screenshotOptions);
          
          onProgress?.('Capturing screenshots', (index + 1) / viewports.length);
          
          return { 
            viewport, 
            screenshot, 
            error: null 
          };
        } catch (error) {
          console.error(`Error capturing screenshot for viewport ${viewport.name}:`, error.message);
          
          return { 
            viewport, 
            screenshot: null, 
            error: {
              message: error.message,
              stack: error.stack
            } 
          };
        }
      })
    );
    
    screenshots.push(...newScreenshots);
  }

  // Filter out failed screenshots
  const validScreenshots = screenshots.filter(result => result.screenshot && !result.error);
  
  if (validScreenshots.length === 0) {
    throw new Error('Failed to capture any valid screenshots');
  }

  onProgress?.('Analyzing screenshots', 0);

  // Analyze each valid screenshot
  const analysisResults = await Promise.all(
    validScreenshots.map(async ({ viewport, screenshot }, index) => {
      try {
        if (verbose) {
          console.log(`Starting analysis for viewport ${viewport.name}...`);
        }

        const result = await analyzeViewport(options, viewport, screenshot);
        
        onProgress?.('Analyzing screenshots', (index + 1) / validScreenshots.length);
        
        if (verbose) {
          console.log(`Analysis complete for viewport ${viewport.name}`);
        }

        return {
          viewport,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Analysis failed for viewport ${viewport.name}:`, error.message);
        
        return {
          viewport,
          result: null,
          error: {
            message: error.message,
            stack: error.stack
          }
        };
      }
    })
  );

  if (verbose) {
    console.log('Analysis complete for all viewports');
  }

  // Return combined results
  return {
    url,
    viewports: viewports.map(viewport => viewport.name),
    timestamp: new Date().toISOString(),
    screenshots,
    analysis: analysisResults
  };
}

/**
 * Parse the analysis response from Claude
 * @param {string} response - The raw text response from Claude
 * @returns {Object} Structured analysis data
 */
function parseAnalysisResponse(response) {
  if (!response) {
    throw new Error('Empty response from analysis API');
  }

  try {
    // Simple parsing - real implementation would be more sophisticated
    const sections = {};
    let currentSection = null;
    let currentContent = [];
    
    // Split response by lines and process
    const lines = response.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if this is a section header
      if (trimmedLine.match(/^#+\s+/)) {
        // Save previous section if exists
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
          currentContent = [];
        }
        
        // Extract new section name
        currentSection = trimmedLine.replace(/^#+\s+/, '').toLowerCase();
      } else if (currentSection) {
        // Add content to current section
        currentContent.push(line);
      }
    }
    
    // Save the last section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n');
    }
    
    return {
      accessibility: sections.accessibility || '',
      usability: sections.usability || '',
      visualDesign: sections['visual design'] || sections['visual-design'] || '',
      summary: sections.summary || '',
      raw: response
    };
  } catch (error) {
    console.error('Error parsing analysis response:', error);
    throw new Error(`Failed to parse analysis response: ${error.message}`);
  }
}

module.exports = {
  analyzeScreenshots,
  analyze,
  analyzeViewport,
  analyzeScreenshot,
  parseAnalysisResponse
}; 