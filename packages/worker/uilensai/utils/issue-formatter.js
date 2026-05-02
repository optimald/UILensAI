/**
 * Issue Formatter Utility for UILensAI - Aligned with Schema v3.11.0
 *
 * This utility standardizes the format of issues identified by various analysis modules,
 * ensuring they conform to the 'moduleIssue' definition in the report schema.
 */

// const { v4: uuidv4 } = require('uuid'); // Not currently used for issues, but could be for unique IDs

// --- Configuration (based on schema v3.11.0 $defs/moduleIssues) ---
const DEFAULT_ISSUE_SEVERITY = "Medium";
const MAX_LENGTHS = {
    text: 5000,
    location: 1000,
    selector: 1000,
    regulatoryReference: 500
};

const VALID_SEVERITIES = ["Critical", "High", "Medium", "Low", "Informational"];

// --- Helper Functions ---

/**
 * Cleans, normalizes, and truncates text.
 * @param {string} inputText - The input text.
 * @param {number} maxLength - The maximum allowed length.
 * @param {string} [defaultTextIfEmpty=""] - Default text if input is empty after trimming.
 * @returns {string|undefined} - The cleaned and truncated text, or undefined if input is null/undefined.
 */
function cleanAndTruncateText(inputText, maxLength, defaultTextIfEmpty = undefined) {
    if (inputText === null || inputText === undefined) {
        return defaultTextIfEmpty;
    }
    if (typeof inputText !== 'string') {
        inputText = String(inputText); // Attempt to convert to string
    }

    let cleanedText = inputText.trim();
    
    // Remove common AI preamble/postamble if any (though less likely for raw issue text)
    const preambles = [/^Here's an issue.*?:\s*/i, /^The issue is:\s*/i];
    preambles.forEach(p => cleanedText = cleanedText.replace(p, ''));

    // Reduce multiple newlines to a single one for better readability if truncated
    cleanedText = cleanedText.replace(/\n\s*\n/g, '\n');

    if (cleanedText === "" && defaultTextIfEmpty !== undefined) {
        return defaultTextIfEmpty;
    }
    
    if (cleanedText.length > maxLength) {
        cleanedText = cleanedText.substring(0, maxLength - 3) + "...";
    }
    return cleanedText;
}

/**
 * Normalizes a severity string to one of the valid enum values from schema.
 * @param {string} severityInput - The raw severity input.
 * @returns {string} - A valid severity string.
 */
function normalizeSeverity(severityInput) {
    if (typeof severityInput !== 'string' || !severityInput.trim()) {
        return DEFAULT_ISSUE_SEVERITY;
    }
    const trimmedInput = severityInput.trim();
    // Case-insensitive check against valid severities
    const foundSeverity = VALID_SEVERITIES.find(validSev => validSev.toLowerCase() === trimmedInput.toLowerCase());
    
    if (foundSeverity) {
        return foundSeverity; // Return the schema-defined casing
    }

    // Fallback mapping for common variations if direct match fails
    const upperSeverity = trimmedInput.toUpperCase();
    if (upperSeverity.includes("CRITICAL")) {return "Critical";}
    if (upperSeverity.includes("HIGH")) {return "High";}
    if (upperSeverity.includes("MEDIUM") || upperSeverity.includes("MODERATE")) {return "Medium";}
    if (upperSeverity.includes("LOW")) {return "Low";}
    if (upperSeverity.includes("INFO")) {return "Informational";}

    return DEFAULT_ISSUE_SEVERITY; // Default if no match
}

// --- Main Formatting Functions ---

/**
 * Formats a single issue object to conform to the 'moduleIssue' schema definition (v3.11.0).
 *
 * @param {Object|string} rawIssue - The raw issue data. Can be a string (treated as text)
 * or an object with various properties.
 * @returns {Object|null} A formatted moduleIssue object, or null if input is unusable or lacks text.
 */
function formatIssue(rawIssue) {
    if (!rawIssue) {
        return null;
    }

    let issueTextContent;
    let issueSeverity = DEFAULT_ISSUE_SEVERITY;
    let issueLocationContent;
    let issueSelectorContent;
    let issueRegulatoryRefContent;
    let issueDetailsContent = {};

    if (typeof rawIssue === 'string') {
        issueTextContent = rawIssue;
    } else if (typeof rawIssue === 'object') {
        // Prioritize 'text', then 'description', then 'message' for the main issue text
        issueTextContent = rawIssue.text || rawIssue.description || rawIssue.message;
        
        // Handle severity, accepting 'priority' as an alias
        issueSeverity = rawIssue.severity || rawIssue.priority || DEFAULT_ISSUE_SEVERITY;
        
        // Handle location, accepting 'path' or 'url' as aliases
        issueLocationContent = rawIssue.location || rawIssue.path || rawIssue.url;
        
        // Handle selector, accepting 'element' as an alias
        issueSelectorContent = rawIssue.selector || rawIssue.element;
        
        // Handle regulatoryReference, accepting 'wcag' or 'standard' as aliases
        issueRegulatoryRefContent = rawIssue.regulatoryReference || rawIssue.wcag || rawIssue.standard;
        
        // Capture other properties as details, excluding known top-level ones and internal/temp fields
        const knownProps = [
            'text', 'description', 'message', 
            'severity', 'priority', 
            'location', 'path', 'url', 
            'selector', 'element', 
            'regulatoryReference', 'wcag', 'standard',
            'details', // Explicitly handle 'details' if it's already an object
            // Add any other fields that are explicitly handled and should not go into 'details'
            'source', 'id', '_isFormatted' 
        ];
        
        if (rawIssue.details && typeof rawIssue.details === 'object') {
            issueDetailsContent = { ...rawIssue.details }; // Start with existing details if provided
        }

        for (const key in rawIssue) {
            if (Object.prototype.hasOwnProperty.call(rawIssue, key) && !knownProps.includes(key)) {
                // Only add if value is not undefined. Null is acceptable.
                if (rawIssue[key] !== undefined) {
                    issueDetailsContent[key] = rawIssue[key];
                }
            }
        }
    } else {
        // Unusable input type
        return null;
    }

    const cleanedText = cleanAndTruncateText(issueTextContent, MAX_LENGTHS.text, "");
    if (cleanedText === "") { // If text is empty after cleaning, issue is not valid
        return null;
    }

    const formattedIssue = {
        text: cleanedText,
        severity: normalizeSeverity(issueSeverity),
    };

    const location = cleanAndTruncateText(issueLocationContent, MAX_LENGTHS.location, undefined);
    if (location !== undefined) {
        formattedIssue.location = location;
    }

    const selector = cleanAndTruncateText(issueSelectorContent, MAX_LENGTHS.selector, undefined);
    if (selector !== undefined) {
        formattedIssue.selector = selector;
    }

    const regulatoryRef = cleanAndTruncateText(issueRegulatoryRefContent, MAX_LENGTHS.regulatoryReference, undefined);
    if (regulatoryRef !== undefined) {
        formattedIssue.regulatoryReference = regulatoryRef;
    }

    if (Object.keys(issueDetailsContent).length > 0) {
        formattedIssue.details = issueDetailsContent;
    }
    // else, 'details' field will be omitted as it's optional

    return formattedIssue;
}

/**
 * Formats an array of raw issues.
 *
 * @param {Array<Object|string>} rawIssuesArray - An array of raw issue data.
 * @returns {Array<Object>} An array of formatted moduleIssue objects (never null).
 */
function formatIssuesArray(rawIssuesArray) {
    if (!Array.isArray(rawIssuesArray)) {
        // If a single issue object or string is passed, try to format it as a single-item array
        if (rawIssuesArray && (typeof rawIssuesArray === 'object' || typeof rawIssuesArray === 'string')) {
            const singleFormatted = formatIssue(rawIssuesArray);
            return singleFormatted ? [singleFormatted] : [];
        }
        return []; // Return empty array for invalid input
    }

    return rawIssuesArray
        .map(rawIssue => formatIssue(rawIssue))
        .filter(formattedIssue => formattedIssue !== null); // Remove any issues that couldn't be formatted
}

module.exports = {
    formatIssue,
    formatIssuesArray,
    // Export helpers if they might be useful externally, e.g., for testing or direct use
    normalizeSeverity, 
    cleanAndTruncateText 
};
