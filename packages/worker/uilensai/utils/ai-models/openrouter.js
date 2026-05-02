/**
 * OpenRouter Client for UILensAI
 * Handles interactions with OpenRouter models (like Qwen).
 * Built exactly like the OpenAI client but specific to OpenRouter URL and auth.
 */
const OpenAI = require('openai');

let openrouterClient;
try {
    openrouterClient = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        timeout: 180000, // 3 minute timeout at HTTP client level (prevents silent hangs)
        maxRetries: 0    // Disable SDK built-in retries — we handle 429 with proper backoff below
    });
} catch (error) {
    console.error("[OpenRouter Client] Failed to initialize OpenRouter SDK. Ensure OPENROUTER_API_KEY is set.", error.message);
    openrouterClient = null;
}

// Max output tokens per model (all accessed via OpenRouter gateway)
const OPENROUTER_MODEL_MAX_OUTPUT_TOKENS = {
    // Google models (currently used)
    'google/gemini-2.5-flash-lite': 65536,
    'google/gemini-2.5-flash': 65536,
    'google/gemini-2.5-pro': 65536,
    'google/gemini-3.1-pro-preview': 65536,
    'google/gemini-3.1-flash-lite-preview': 65536,
    // Anthropic models (available but not currently used)
    'anthropic/claude-sonnet-4-5-20250929': 16384,
    'anthropic/claude-opus-4-5-20251101': 16384,
    'anthropic/claude-haiku-4-5-20251001': 8192,
    // DeepSeek models (available but not used — truncation issues)
    'deepseek/deepseek-chat-v3-0324': 8192,
    // Qwen models (available but not used)
    'qwen/qwen-2.5-vl-72b-instruct': 65536,
    // Default for any unregistered OpenRouter model
    'default_openrouter_limit': 16384
};

// Session-level cost tracking accumulator
let costTracker = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUSD: 0,
    callCount: 0,
    calls: []
};

function getCostTracker() {
    return { ...costTracker, calls: [...costTracker.calls] };
}

function resetCostTracker() {
    costTracker = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUSD: 0,
        callCount: 0,
        calls: []
    };
}

/**
 * Analyzes text and/or image prompt with OpenRouter.
 */
async function analyze(prompt, options = {}) {
    if (!openrouterClient) {
        throw new Error("[OpenRouter Client] OpenRouter SDK not initialized. Check API key.");
    }

    const {
        model,
        systemPrompt = 'You are a helpful and insightful AI assistant. Respond accurately and concisely.',
        messages: providedMessages,
        images,
        imageMediaType = 'image/jpeg',
        maxTokens: requestedMaxTokens,
        temperature = 0.2,
        tools,
        toolChoice,
        isJsonOutput = false,
        customSchema,
        verbose = false
    } = options;

    if (!model) { throw new Error("[OpenRouter Client] 'model' option is required."); }

    let effectiveMaxTokens = requestedMaxTokens || OPENROUTER_MODEL_MAX_OUTPUT_TOKENS[model] || OPENROUTER_MODEL_MAX_OUTPUT_TOKENS.default_openrouter_limit;
    const modelHardLimit = OPENROUTER_MODEL_MAX_OUTPUT_TOKENS[model] || OPENROUTER_MODEL_MAX_OUTPUT_TOKENS.default_openrouter_limit;

    if (effectiveMaxTokens > modelHardLimit) {
        effectiveMaxTokens = modelHardLimit;
        if (verbose) { console.warn(`[OpenRouter Client] max_tokens for ${model} reduced from ${requestedMaxTokens} to ${effectiveMaxTokens} (model limit).`); }
    }

    const apiMessages = [];
    if (systemPrompt) { apiMessages.push({ role: 'system', content: systemPrompt }); }

    if (providedMessages && Array.isArray(providedMessages)) {
        const filteredMessages = systemPrompt ? providedMessages.filter(m => m.role !== 'system') : providedMessages;
        apiMessages.push(...JSON.parse(JSON.stringify(filteredMessages)));
    }

    const userMessageContent = [];
    if (typeof prompt === 'string') {
        userMessageContent.push({ type: 'text', text: prompt });
    } else if (Array.isArray(prompt)) {
        userMessageContent.push(...prompt);
    } else if (prompt) {
        userMessageContent.push({ type: 'text', text: String(prompt) });
    }

    if (images && Array.isArray(images)) {
        images.forEach((base64ImageData, index) => {
            if (typeof base64ImageData === 'string') {
                const mime = imageMediaType;
                let actualBase64;
                if (!base64ImageData.startsWith('data:image/')) {
                    actualBase64 = `data:${mime};base64,${base64ImageData}`;
                } else {
                    actualBase64 = base64ImageData;
                }
                userMessageContent.push({ type: 'image_url', image_url: { url: actualBase64 } });
            } else if (verbose) { console.warn(`[OpenRouter Client] Skipping invalid image data at index ${index}.`); }
        });
    }

    if (userMessageContent.length === 0 && apiMessages.filter(m => m.role === 'user').length === 0) {
        if (verbose) { console.warn("[OpenRouter Client] User message content is empty. Sending a generic request."); }
        userMessageContent.push({ type: 'text', text: 'Please provide an analysis.' });
    }

    // Append current user prompt/content to messages
    if (userMessageContent.length > 0) {
        const lastApiMessage = apiMessages.length > 0 ? apiMessages[apiMessages.length - 1] : null;
        if (lastApiMessage && lastApiMessage.role === 'user' && Array.isArray(lastApiMessage.content)) {
            lastApiMessage.content.push(...userMessageContent);
        } else {
            apiMessages.push({ role: 'user', content: userMessageContent });
        }
    }

    const requestBody = {
        model: model,
        messages: apiMessages,
        max_tokens: effectiveMaxTokens,
        temperature: temperature,
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
        requestBody.tools = tools;
        if (toolChoice) { requestBody.tool_choice = toolChoice; }
        else { requestBody.tool_choice = "auto"; }
    } else if (isJsonOutput && customSchema) {
        // OpenRouter/Qwen does NOT support tool_use (returns 404).
        // Use JSON mode + embed the schema in the system prompt instead.
        requestBody.response_format = { type: "json_object" };

        // Inject schema into system prompt so the model knows the expected structure
        const schemaStr = JSON.stringify(customSchema, null, 2);
        const schemaInstruction = `\n\nIMPORTANT: You MUST respond with valid JSON that conforms to this schema:\n\`\`\`json\n${schemaStr}\n\`\`\`\nDo not include any text outside the JSON object. Return ONLY the JSON.`;

        // Find and augment the system message
        const systemMsg = apiMessages.find(m => m.role === 'system');
        if (systemMsg) {
            systemMsg.content += schemaInstruction;
        } else {
            apiMessages.unshift({ role: 'system', content: `You are a structured data extraction assistant.${schemaInstruction}` });
        }
    } else if (isJsonOutput) {
        // Basic JSON mode
        requestBody.response_format = { type: "json_object" };
    }

    if (verbose) {
        const loggedRequestBody = { ...requestBody };
        if (loggedRequestBody.messages) {
            loggedRequestBody.messages = loggedRequestBody.messages.map(m => {
                if (m.content && Array.isArray(m.content)) {
                    return { ...m, content: m.content.map(c => c.type === 'image_url' ? { ...c, image_url: { url: c.image_url.url.substring(0, 50) + "..." } } : c) };
                }
                return m;
            });
        }
        console.log("[OpenRouter Client] Request body (images truncated):", JSON.stringify(loggedRequestBody, null, 2));
    }

    try {
        const API_CALL_TIMEOUT = 180000;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`OpenRouter API call exceeded ${API_CALL_TIMEOUT / 1000}s timeout`)), API_CALL_TIMEOUT);
        });

        // Explicit 429/overload retry with backoff (SDK retries are disabled)
        const MAX_API_RETRIES = 3;
        const BACKOFF_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s
        let lastApiError;

        for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
            try {
                const response = await Promise.race([
                    openrouterClient.chat.completions.create(requestBody),
                    timeoutPromise
                ]);

                // === TRUNCATION DETECTION ===
                // finish_reason === 'length' means the model hit max_tokens and output was cut short
                const finishReason = response.choices[0]?.finish_reason;
                if (finishReason === 'length') {
                    const currentMax = requestBody.max_tokens;
                    const modelHardLimit = OPENROUTER_MODEL_MAX_OUTPUT_TOKENS[model] || OPENROUTER_MODEL_MAX_OUTPUT_TOKENS.default_openrouter_limit;
                    const newMax = Math.min(currentMax * 2, modelHardLimit);

                    if (newMax > currentMax && attempt < MAX_API_RETRIES) {
                        console.warn(`[OpenRouter Client] ⚠️ TRUNCATION DETECTED (finish_reason=length) for ${model}. Output was ${response.usage?.completion_tokens || '?'} tokens. Retrying with max_tokens ${currentMax} → ${newMax}...`);
                        requestBody.max_tokens = newMax;
                        continue; // Retry with higher limit
                    } else {
                        console.warn(`[OpenRouter Client] ⚠️ TRUNCATION DETECTED for ${model} but already at max (${currentMax}). Proceeding with truncated response.`);
                    }
                }

                // Success — process response
                if (verbose) { console.log("[OpenRouter Client] Raw response from API:", JSON.stringify(response, null, 2)); }

                // Extract usage data from response for observability tracking
                const usage = {
                    inputTokens: response.usage?.prompt_tokens || 0,
                    outputTokens: response.usage?.completion_tokens || 0,
                    costUSD: response.usage?.cost || 0,
                    modelUsed: model
                };

                // Accumulate session-level cost tracking
                costTracker.totalInputTokens += usage.inputTokens;
                costTracker.totalOutputTokens += usage.outputTokens;
                costTracker.totalCostUSD += usage.costUSD;
                costTracker.callCount += 1;
                costTracker.calls.push({
                    model,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    costUSD: usage.costUSD,
                    timestamp: new Date().toISOString()
                });

                const message = response.choices[0]?.message;
                if (!message) { throw new Error("OpenRouter API response missing message content."); }

                if (message.tool_calls && message.tool_calls.length > 0) {
                    const toolCall = message.tool_calls[0];
                    if (toolCall.function && toolCall.function.arguments) {
                        try {
                            return { data: JSON.parse(toolCall.function.arguments), usage };
                        } catch (parseError) {
                            throw new Error(`OpenRouter tool call arguments were not valid JSON: ${parseError.message}`);
                        }
                    }
                }

                if (requestBody.response_format?.type === "json_object" && message.content) {
                    // Strip markdown fences if DeepSeek wrapped JSON in ```json ... ```
                    let jsonContent = message.content;
                    if (jsonContent.startsWith('```')) {
                        jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
                    }
                    console.log(`\n\n[!!! OPENROUTER NATIVE JSON OUTPUT for ${model} !!!]\n${jsonContent}\n\n`);
                    try {
                        return { data: JSON.parse(jsonContent), usage };
                    } catch (parseError) {
                        // Attempt to repair output before failing completely
                        const { attemptJsonFix } = require('../json-repair');
                        const fixed = attemptJsonFix(jsonContent);
                        if (fixed) return { data: fixed, usage };

                        throw new Error(`OpenRouter response was not valid JSON despite JSON mode request. Content: ${message.content.substring(0, 200)}...`);
                    }
                }

                return { data: message.content ? message.content.trim() : "", usage };

            } catch (apiError) {
                lastApiError = apiError;
                const errMsg = (apiError.message || '').toLowerCase();
                const errStatus = apiError.status || apiError.response?.status;
                const is429 = errStatus === 429 || errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('too many requests') || errMsg.includes('quota exceeded');
                const is5xx = errStatus >= 500 || errMsg.includes('overloaded') || errMsg.includes('service unavailable');

                if ((is429 || is5xx) && attempt < MAX_API_RETRIES) {
                    const delay = BACKOFF_DELAYS[attempt] || 30000;
                    console.warn(`[OpenRouter Client] ${is429 ? '429 Rate Limited' : '5xx Server Error'} on attempt ${attempt + 1}/${MAX_API_RETRIES + 1}. Retrying in ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                // Non-retryable error or max retries exhausted
                throw apiError;
            }
        }

        // Should not reach here, but safety net
        throw lastApiError;

    } catch (error) {
        console.error('[OpenRouter Client] Error calling OpenRouter API:', error.name, error.message);
        if (error.response) { console.error("OpenRouter API Error Details:", JSON.stringify(error.response.data || error.response.statusText, null, 2)); }
        throw new Error(`OpenRouter API error: ${error.message}`);
    }
}

module.exports = { analyze, getCostTracker, resetCostTracker };
