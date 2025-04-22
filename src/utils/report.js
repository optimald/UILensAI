const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// This function generates a unique report ID
function generateReportId() {
  return uuidv4();
}

// When generating a report, add the reportId to the report data
async function generateReport(options) {
  // Generate a unique report ID
  const reportId = generateReportId();
  
  // Add the reportId to the report data
  const reportData = {
    reportId,
    timestamp: new Date().toISOString(),
    // ... other report data
  };
  
  // Include the reportId in the filename
  const fileName = `${options.url.replace(/[^a-zA-Z0-9]/g, '-')}-${reportId.slice(0, 8)}.html`;
  
  // ... rest of report generation code
}

// ... rest of the file 