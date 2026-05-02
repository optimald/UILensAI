/**
 * Compatibility module with inline implementations to avoid dependency conflicts
 * This provides date formatting functions without any external dependencies
 */

/**
 * Returns a date formatting function that doesn't rely on date-fns
 * This is crucial for avoiding dependency conflicts with projects using different date-fns versions
 * 
 * @returns {Function} A function that formats dates
 */
function getDateFormatter() {
  // Pure JavaScript implementation - no dependencies
  return (date, formatStr) => {
    const d = new Date(date);
    
    // Helper to pad numbers with leading zeros
    const pad = (num, size = 2) => String(num).padStart(size, '0');
    
    // Handle different format strings
    if (formatStr === 'yyyyMMdd-HHmmss-SSS') {
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
             `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
             `${pad(d.getMilliseconds(), 3)}`;
    }
    
    if (formatStr === 'yyyy-MM-dd HH:mm:ss') {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    
    // Default format for any other patterns
    return d.toISOString();
  };
}

module.exports = {
  getDateFormatter
}; 