---
layout: home
title: UILensAI v1.0
subtitle: Visual UI Analysis with AI
nav_order: 1
permalink: /
---

## Launch Highlights
- 🤖 **AI-Powered Analysis**: Advanced visual recognition for detailed UI feedback
- 💬 **Interactive Mode**: Guides you through the analysis process with real-time feedback
- 🔒 **Enhanced Protection Handling**: Navigate websites with bot protection using stealth mode
- 📱 **Custom Device Profiles**: Define and test on specific device dimensions beyond standard presets
- ⚙️ **Non-Interactive Mode**: Run automated analyses without user interaction

## Overview
UILensAI is a powerful tool for UI/UX professionals, developers, and QA teams who need objective feedback on their user interfaces. It captures screenshots at different viewport sizes, analyzes them using advanced AI vision technology, and provides detailed recommendations for improvements.

## Key Features

### Core Capabilities
- **Multi-Device Screenshot Capture**: Captures screenshots at various viewport dimensions
- **AI-Powered Analysis**: Sends screenshots to AI for expert UI/UX evaluation
- **Plain Text Reports**: Generates actionable recommendations in simple, readable format
- **Multiple Environments**: Works with both production websites and local development servers
- **Component Analysis**: Target specific UI components using CSS selectors

## Getting Started

### Installation

#### Package Installation
```bash
# Install from GitHub Packages
npm install @optimald/uilensai --registry=https://npm.pkg.github.com
```

This requires setting up GitHub authentication:
```bash
# Add GitHub authentication for packages
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
echo "@optimald:registry=https://npm.pkg.github.com" >> ~/.npmrc
```

#### Manual Installation
If you prefer to install manually:

```bash
# Clone the repository
git clone https://github.com/optimald/UILensAI.git
cd UILensAI

# Install dependencies
npm install

# Run setup to configure your API keys
npm run setup
```

### Configuration
Create a `.env` file in the project root (or run `npm run setup`). Here's a basic configuration to get you started:

```
# API key for AI analysis
API_KEY=your_api_key

# Storage settings
STORAGE_RETENTION_DAYS=7
STORAGE_PATH=./storage
REPORTS_PATH=./storage/reports
```

A full `.env.example` file is included in the repository with additional configuration options including:
- Custom API endpoints
- Screenshot capture settings
- Browser and viewport configurations
- Protection and stealth mode options
- Analysis focus areas

For advanced use cases, copy the complete `.env.example` file:

```bash
cp .env.example .env
```

Then edit the `.env` file with your preferred settings.

## Usage

UILensAI provides a single unified command interface with various flag options to meet different needs:

### Command Syntax
All UILensAI commands use the npm run syntax with a double dash (--) delimiter to separate npm's command from the arguments passed to the script:

```bash
npm run ui -- [options]
```

The double dash is required because:
- Without it (`npm run ui --option`), npm would try to interpret the flags as arguments for npm itself
- With it (`npm run ui -- --option`), the flags are correctly passed to the underlying script

This is standard npm behavior for passing arguments to scripts defined in package.json.

### Basic UI Analysis
```bash
npm run ui -- --url https://example.com
```

This will:
- Capture screenshots of the URL at mobile and desktop viewports
- Analyze the UI with AI
- Generate a report with findings and recommendations

### Component-Specific Analysis
```bash
npm run ui -- --url https://example.com --selector "#header"
```

This enables you to:
- Target specific UI components using CSS selectors
- Get focused analysis on just that component
- Receive component-specific recommendations

## Additional Features

### Protected Website Support
```bash
# Analyze a protected site
npm run ui -- --url http://localhost:8080/protected --username admin --password password123

# Compare a public site with a protected site
npm run ui -- --url http://example.com --compare-url http://protected.example.com --username admin --password password123
```

### Custom Device Profiles
Define and test on specific device dimensions beyond standard presets.

### Non-Interactive Mode
Run automated analyses without user interaction.

### Authentication Support
Access password-protected sites using HTTP Basic Authentication.

### Automation
UILensAI supports non-interactive operation for automated analyses:

```bash
# Run non-interactive analysis with additional parameters
npm run ui -- --url https://example.com --non-interactive \
  --description "Dashboard UI for financial data" \
  --viewports mobile,desktop-large \
  --browsers chromium \
  --focus accessibility,branding \
  --include-code
```

### Protected Website Handling
When analyzing public websites, UILensAI may encounter various protection mechanisms that prevent automated browsing:

- Bot Detection: Many websites employ bot detection that may block automated browser sessions
- CAPTCHA/reCAPTCHA: Sites with CAPTCHA challenges may prevent automated access
- IP-based Rate Limiting: Websites may block your IP after multiple automated requests
- Content Security Policies: Some CSP settings can block screenshot capturing

#### Workarounds for Protected Sites
For sites with protection mechanisms, UILensAI offers enhanced stealth mode capabilities:

```bash
# Use enhanced stealth mode to bypass sophisticated bot detection
npm run ui -- --url https://example.com --stealth
```

The stealth mode provides advanced protection against common detection techniques:
- WebGL fingerprinting prevention
- Automation marker removal (webdriver property)
- User agent and header spoofing
- Browser signature randomization
- Chrome plugins emulation

### Smart Error Feedback
UILensAI provides intelligent error feedback when encountering issues like bot protection or timeouts:

```bash
# When this command fails due to bot protection
npm run ui -- --url https://complex-site.com

# You'll see helpful suggestions like:
# It looks like the site might have bot protection or is taking too long to load.
# Try using stealth mode:
#   npm run ui -- --url https://complex-site.com --stealth
```

The tool automatically detects common error patterns and provides appropriate suggestions:
- Bot protection detection with stealth mode recommendation
- Timeout errors with advice to increase timeout and use stealth mode
- Network errors with connectivity troubleshooting steps

You can also manually set timeouts for sites that load slowly:

```bash
# Use a longer timeout for sites that load slowly or have delayed protection triggers
npm run ui -- --url https://example.com --timeout 60000
```

### Focus Areas and Page Description
UILensAI allows you to focus the analysis on specific aspects and provide page context:

```bash
# Run with specific focus areas
npm run ui -- --url https://example.com --focus accessibility,branding,hierarchy

# Run with page description for more focused analysis
npm run ui -- --url https://example.com --description "An e-commerce product page for a clothing store"
```

### Custom Viewport Testing
```bash
# Test specific viewport sizes
npm run ui -- --url https://example.com --viewports mobile,tablet,desktop

# Test full range of viewports (from tiny-mobile to super-ultrawide)
npm run ui -- --url https://example.com --full-range-viewports
```

### Animation Handling
```bash
# Enable animations (disabled by default)
npm run ui -- --url https://example.com --no-disable-animations

# Explicitly disable animations for consistent screenshots 
npm run ui -- --url https://example.com --disable-animations
```

Disabling animations helps ensure consistent screenshots across multiple runs by preventing moving elements from affecting the analysis.

### Custom Viewport Definitions
```bash
# Define a custom viewport with specific dimensions 
npm run ui -- --url https://example.com --custom-viewport "large-mobile:480x854"

# Define multiple custom viewports
npm run ui -- --url https://example.com --custom-viewport "large-mobile:480x854" --custom-viewport "ultrawide-desktop:3440x1440"
```

Custom viewports allow you to test specific device dimensions not covered by the standard presets.

### Max Tokens Control
```bash
# Increase token limit for more detailed analysis
npm run ui -- --url https://example.com --max-tokens 8192
```

### Console Output Mode
```bash
# Output results directly to console instead of saving to a file
npm run ui -- --url https://example.com --console-output
```

This mode is useful for piping results to other tools or for quick checks without generating report files.

### Test Server Configuration
To test local development servers:

```bash
# First, start your test server in one terminal
cd test-site && npm run dev  # or whatever starts your local server

# In another terminal, run UILensAI against localhost
npm run ui -- --url http://localhost:8080
```

Note: Make sure your test server is running on port 8080 or change the URL accordingly.

## Project Structure
```
├── src/
│   ├── cli/              # CLI tools and entry points
│   ├── index.js          # Main entry point
│   ├── capture/          # Screenshot capture module
│   ├── analyze/          # AI integration
│   ├── report/           # Report generation
│   ├── storage/          # Temporary storage system
│   └── utils/            # Utility functions
├── storage/              # Main storage directory
│   ├── screenshots/      # Screenshot files
│   └── reports/          # Generated reports
├── test-site/            # Test website files
├── .env                  # Environment variables
└── package.json          # Project dependencies
```

## Development
Screenshots are stored in the `storage/screenshots` directory by default, and reports are saved to the `reports` directory. You can configure these locations in your `.env` file.

Note for Developers: When contributing to this project, be aware that your local paths and usernames may be recorded in logs and error messages. Consider using generic usernames in your development environment.

## Support

If you need assistance, have questions, or want to report issues, please contact our support team at hello@uilensai.com.

## License
MIT 
