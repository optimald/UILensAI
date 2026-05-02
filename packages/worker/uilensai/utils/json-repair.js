/**
 * json-repair.js — Standalone JSON repair utility
 * Handles common LLM JSON malformation patterns:
 * - Escaped single quotes inside strings: \'text\' → 'text'
 * - Backslash-escaped double quotes breaking JSON structure
 * - Missing closing braces/brackets (truncated output)
 * - Trailing commas
 * - Unquoted keys
 * - Prefix text before JSON
 */

/**
 * Attempts to fix common JSON syntax errors
 * @param {string} jsonString - The malformed JSON string
 * @returns {Object|null} The parsed JSON object, or null if unfixable
 */
function attemptJsonFix(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') { return null; }

    try {
        let fixed = jsonString.trim();

        // Step 1: Try direct parse first (might already be valid)
        try { return JSON.parse(fixed); } catch (_) { /* continue with repairs */ }

        // Step 2: Strip markdown fences if present
        if (fixed.startsWith('```')) {
            fixed = fixed.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
            try { return JSON.parse(fixed); } catch (_) { /* continue */ }
        }

        // Step 3: Find the actual JSON content — strip any prefix text
        const jsonStartObj = fixed.indexOf('{');
        const jsonStartArr = fixed.indexOf('[');
        let jsonStart = -1;
        if (jsonStartObj === -1) jsonStart = jsonStartArr;
        else if (jsonStartArr === -1) jsonStart = jsonStartObj;
        else jsonStart = Math.min(jsonStartObj, jsonStartArr);

        if (jsonStart > 0) {
            fixed = fixed.substring(jsonStart);
            try {
                const parsed = JSON.parse(fixed);
                console.log(`[JsonRepair] JSON fix succeeded after removing ${jsonStart}-char prefix`);
                return parsed;
            } catch (_) { /* continue */ }
        }

        // Step 4: Fix LLM-specific escape patterns
        // Pattern: \' inside double-quoted strings — Gemini does this with embedded quotes
        // e.g., "...the 'Start Free Trial\', \'Request a Demo\' above..." should be
        //        "...the 'Start Free Trial', 'Request a Demo' above..."
        let escFixed = fixed.replace(/\\'/g, "'");
        try {
            const parsed = JSON.parse(escFixed);
            console.log(`[JsonRepair] JSON fix succeeded after fixing escaped single quotes`);
            return parsed;
        } catch (_) { /* continue */ }

        // Step 5: Remove trailing commas before } or ]
        escFixed = escFixed.replace(/,(\s*[}\]])/g, '$1');
        try {
            const parsed = JSON.parse(escFixed);
            console.log(`[JsonRepair] JSON fix succeeded after removing trailing commas`);
            return parsed;
        } catch (_) { /* continue */ }
        
        // Step 5.5: Gemini OpenRouter Array Suffix Bug
        // Gemini flash sometimes outputs trailing `] ] ]` at the end of the JSON.
        // Let's explicitly search for the last valid array/object boundary and truncate the string there.
        let strippedSuffix = escFixed;
        // Strip everything after the last } or ]
        const lastBrace = strippedSuffix.lastIndexOf('}');
        const lastBracket = strippedSuffix.lastIndexOf(']');
        const trueEnd = Math.max(lastBrace, lastBracket);
        if (trueEnd !== -1) {
            strippedSuffix = strippedSuffix.substring(0, trueEnd + 1);
            // Further strip mismatched ending brackets like } ] ] if it's supposed to be an object or array
            strippedSuffix = strippedSuffix.replace(/([}\]])\s*[}\]]+\s*$/, '$1');
            try {
                const parsed = JSON.parse(strippedSuffix);
                console.log(`[JsonRepair] JSON fix succeeded after aggressive trailing bracket strip`);
                return parsed;
            } catch (_) { /* continue */ }
        }

        // Step 6: Truncation repair — trim to last valid closing delimiter
        // Remove content after the last valid } or ]
        const isArray = escFixed.trimStart().startsWith('[');
        const closingChar = isArray ? ']' : '}';
        const lastClose = escFixed.lastIndexOf(closingChar);
        if (lastClose !== -1 && lastClose < escFixed.length - 1) {
            const trimmed = escFixed.substring(0, lastClose + 1);
            try {
                const parsed = JSON.parse(trimmed);
                console.log(`[JsonRepair] JSON fix succeeded after trimming trailing content`);
                return parsed;
            } catch (_) { /* continue */ }
        }

        // Step 7: Complete incomplete braces/brackets
        const openBraces = (escFixed.match(/{/g) || []).length;
        const closeBraces = (escFixed.match(/}/g) || []).length;
        const openBrackets = (escFixed.match(/\[/g) || []).length;
        const closeBrackets = (escFixed.match(/\]/g) || []).length;

        let completed = escFixed.replace(/,\s*$/, '');
        if (openBrackets > closeBrackets) {
            completed += ']'.repeat(openBrackets - closeBrackets);
        }
        if (openBraces > closeBraces) {
            completed += '}'.repeat(openBraces - closeBraces);
        }
        try {
            const parsed = JSON.parse(completed);
            console.log(`[JsonRepair] JSON fix succeeded after completing ${openBraces - closeBraces} braces and ${openBrackets - closeBrackets} brackets`);
            return parsed;
        } catch (e) {
            console.log(`[JsonRepair] Brace/bracket completion failed: ${e.message.substring(0, 100)}`);
        }

        // Step 8: Nuclear option — fix unquoted keys and retry
        let nuclear = escFixed;
        nuclear = nuclear.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
        // Remove newlines and normalize whitespace  
        nuclear = nuclear.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ');
        try {
            const parsed = JSON.parse(nuclear);
            console.log(`[JsonRepair] JSON fix succeeded with nuclear cleanup`);
            return parsed;
        } catch (_) { /* continue */ }

        // Log the final failed attempt for debugging
        console.log(`[JsonRepair] All fix attempts failed. Final attempt was: ${escFixed.substring(0, 200)}...`);
        return null;
    } catch (error) {
        console.warn("[JsonRepair] Error in JSON fixing:", error.message);
        return null;
    }
}

module.exports = { attemptJsonFix };
