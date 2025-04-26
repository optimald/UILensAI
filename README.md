---
layout: home
title: UILensAI v0.1.8
subtitle: Visual UI Analysis with AI
nav_order: 1
permalink: /
---

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
# Install from npm
npm install uilensai
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
ANTHROPIC_API_KEY=your_api_key

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

## Installation Troubleshooting

If you encounter installation issues, try these solutions:

### Automatic Browser Installation

UILensAI automatically installs Chromium via Playwright during installation. If you encounter browser-related errors, you can manually install the browser:

```bash
# Install Playwright browsers manually
npx playwright install chromium
```

For Apple Silicon (M1/M2/M3) Macs, you might need to ensure you have the right architecture:

```bash
# For Apple Silicon Macs
arch -arm64 npx playwright install chromium
```

### Dependency Conflicts

UILensAI bundles its dependencies to prevent conflicts with your project. However, if you still encounter issues:

```bash
# Install with the --no-save flag to test without modifying package.json
npm install uilensai --no-save

# If npm errors with dependency conflicts, try:
npm install uilensai --legacy-peer-deps

# For persistent issues, create a dedicated folder:
mkdir uilensai-tool && cd uilensai-tool
npm init -y
npm install uilensai
# Then use UILensAI from this dedicated project
```

### Common Issues and Solutions

#### "format is not a function" Error
If you encounter an error about "format is not a function", this is usually related to date formatting compatibility. Since version 0.1.7, UILensAI has removed external dependencies for date formatting to prevent any conflicts with different versions of date-fns in your project.

```bash
# Ensure you're using the latest version that fixes dependency conflicts
npm install uilensai@latest
```

For projects with multiple date formatting libraries or dependency conflicts, version 0.1.7+ is recommended as it uses a zero-dependency approach for date handling.

#### Chromium Browser Not Found Error
If you see an error like "Executable doesn't exist at .../ms-playwright/chromium-1105/chrome-mac/Chromium.app/Contents/MacOS/Chromium", this indicates the Playwright browser binary wasn't installed properly. The latest version automatically installs this for you, but you can also run:

```bash
npx playwright install chromium
```

### Installation Time

First-time installation may take several minutes due to:
- Downloading Playwright browser binaries (~300MB)
- Compiling native dependencies like Sharp
- Bundling all dependencies

Subsequent installations will be faster if npm caches are available.

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

### Basic Usage

```bash
npm run ui -- --url https://example.com
```

This will:
1. Capture screenshots of the site at mobile and desktop viewport sizes
2. Analyze the UI using Claude AI
3. Generate a comprehensive analysis report

### Options

| Option | Description |
|--------|-------------|
| `--url <url>` | The URL to analyze (required) |
| `--viewports <names>` | Comma-separated viewport names (default: mobile,desktop) |
| `--output <dir>` | Output directory for the report (default: ./storage/reports) |
| `--selector <css>` | CSS selector to analyze specific UI component |
| `--model <n>` | AI model to use (default: claude-3-haiku-20240307) |
| `--fullpage` | Capture full page height (enabled by default) |
| `--no-fullpage` | Capture only visible viewport |
| `--stealth [level]` | Enable stealth mode to bypass bot detection with optional level (basic, medium, advanced) |
| `--description <text>` | Provide context about the page being analyzed |
| `--focus <areas>` | Focus analysis on specific areas (comma-separated) |
| `--debug` | Output verbose debugging information |
| `--help` | Display help information |

### Component-Specific Analysis
```bash
npm run ui -- --url https://example.com --selector "#header"
```

This enables you to:
- Target specific UI components using CSS selectors
- Get focused analysis on just that component
- Receive component-specific recommendations

### Fullpage Capture Options

UILensAI provides both `--fullpage` and `--no-fullpage` flags to give you explicit control over screenshot capture behavior:

```bash
# Explicitly enable full page capture (this is the default behavior)
npm run ui -- --url https://example.com --fullpage

# Disable full page capture to only screenshot the visible viewport
npm run ui -- --url https://example.com --no-fullpage
```

Having both flags allows for clear script documentation and follows CLI convention patterns even though `--fullpage` is the default setting.

## Available Options

### Viewport Options

UILensAI supports the following standard viewport presets:

| Preset Name      | Dimensions (width × height) |
|------------------|----------------------------|
| tiny-mobile      | 280 × 480                  |
| narrow-mobile    | 320 × 568                  |
| mobile           | 375 × 667                  |
| tablet           | 768 × 1024                 |
| desktop          | 1024 × 768                 |
| large            | 1440 × 900                 |
| ultrawide        | 2560 × 1080                |
| super-ultrawide  | 5120 × 1440                |

Usage examples:

```bash
# Test on specific viewports
npm run ui -- --url https://example.com --viewports mobile,tablet,desktop

# Test on full range of viewports
npm run ui -- --url https://example.com --full-range-viewports

# Define and use custom viewport dimensions
npm run ui -- --url https://example.com --custom-viewport "large-mobile:480x854" --custom-viewport "ultrawide-desktop:3440x1440"
```

### Focus Areas

UILensAI can analyze specific aspects of your UI by focusing on particular areas of interest:

| Focus Area       | Description |
|------------------|-------------|
| accessibility    | Analyzes UI elements for accessibility standards compliance |
| branding         | Evaluates consistency with brand guidelines and identity |
| responsive       | Assesses how well the UI adapts to different screen sizes |
| hierarchy        | Examines visual hierarchy and information organization |
| consistency      | Checks for UI pattern consistency across components |
| aesthetics       | Evaluates overall visual appeal and design quality |
| above-the-fold   | Analyzes content visible without scrolling |
| content-flow     | Examines how content is organized and presented |
| visual-design    | Focuses on typography, color usage, and visual elements |
| usability        | Evaluates ease of use and interface clarity |

Usage examples:

```bash
# Focus on specific areas
npm run ui -- --url https://example.com --focus accessibility,branding,hierarchy

# Provide additional context for more focused analysis
npm run ui -- --url https://example.com --description "An e-commerce product page for a clothing store"
```

### AI Models

UILensAI supports multiple AI models for analysis, from fastest to most powerful:

#### Fastest Models
- **Claude 3 Haiku** (`claude-3-haiku-20240307`) - Default model, fastest and most compact for quick analysis
- **Claude 3.5 Haiku** (`claude-3-5-haiku-20241022`) - Fast intelligence with improved capabilities

#### Balanced Models
- **Claude 3.5 Sonnet** (`claude-3-5-sonnet-20241022`) - High intelligence with good balance of speed and capability
- **Claude 3.5 Sonnet** (Previous: `claude-3-5-sonnet-20240620`) - Earlier version of 3.5 Sonnet

#### Most Powerful Models
- **Claude 3 Opus** (`claude-3-opus-20240229`) - Comprehensive analysis with top-level intelligence
- **Claude 3.7 Sonnet** (`claude-3-7-sonnet-20250219`) - Most advanced model with extended thinking capabilities

#### Usage Examples

```bash
# Use default fastest model
npm run ui -- --url https://example.com

# Use a more powerful model for complex UI analysis
npm run ui -- --url https://example.com --model claude-3-opus-20240229

# Use latest and most advanced model
npm run ui -- --url https://example.com --model claude-3-7-sonnet-20250219

# Increase token limit for more detailed analysis
npm run ui -- --url https://example.com --max-tokens 8192
```

## Additional Features

### Protected Website Support
```bash
# Analyze a protected site
npm run ui -- --url http://localhost:8080/protected --username admin --password password123
```

### Custom Device Profiles
Define and test on specific device dimensions beyond standard presets.

### Authentication Support
Access password-protected sites using HTTP Basic Authentication.

### Automation
UILensAI supports operation for automated analyses:

```bash
# Run automated analysis with additional parameters
npm run ui -- --url https://example.com \
  --description "Dashboard UI for financial data" \
  --viewports mobile,desktop-large \
  --focus accessibility,branding
```

### Report Format Options
UILensAI supports two output formats:

```bash
# Generate a plain text report (default)
npm run ui -- --url https://example.com --format text

# Generate a JSON-structured report
npm run ui -- --url https://example.com --format json
```

The JSON format is particularly useful for integrating with other tools or for programmatic analysis of results.

### Protected Website Handling
When analyzing public websites, UILensAI may encounter various protection mechanisms that prevent automated browsing:

- Bot Detection: Many websites employ bot detection that may block automated browser sessions
- CAPTCHA/reCAPTCHA: Sites with CAPTCHA challenges may prevent automated access
- IP-based Rate Limiting: Websites may block your IP after multiple automated requests
- Content Security Policies: Some CSP settings can block screenshot capturing

#### Stealth Mode Options

UILensAI provides a stealth mode with three levels of protection to bypass these protection mechanisms:

| Option | Description |
|--------|-------------|
| `--stealth` | Enable basic stealth mode (default level) |
| `--stealth basic` | Explicitly select basic stealth level |
| `--stealth medium` | Enable medium stealth level with additional protections |
| `--stealth advanced` | Enable advanced stealth level with comprehensive protections |

```bash
# Use enhanced stealth mode to bypass sophisticated bot detection
npm run ui -- --url https://example.com --stealth
```

##### Basic Stealth (Default)
```bash
npm run ui -- --url https://example.com --stealth
# or
npm run ui -- --url https://example.com --stealth basic
```

Basic stealth mode includes:
- WebGL fingerprinting prevention
- Automation marker removal (webdriver property)
- User agent and header spoofing
- Browser signature randomization
- Chrome plugins emulation

This level is sufficient for most websites with basic bot detection.

##### Medium Stealth
```bash
npm run ui -- --url https://example.com --stealth medium
```

Medium stealth adds additional protections:
- Canvas fingerprinting randomization 
- WebRTC fingerprinting protection
- Advanced header manipulation
- Improved timing attack prevention
- More sophisticated Chrome object emulation

Use this level for websites with more advanced protection systems.

##### Advanced Stealth
```bash
npm run ui -- --url https://example.com --stealth advanced
```

Advanced stealth adds sophisticated protection measures:
- Hardware concurrency spoofing
- Device memory randomization
- Timezone and locale randomization
- Permissions API spoofing
- Connection API randomization
- Speech API protection
- High-precision timing attack prevention

Use this level for websites with enterprise-grade bot protection systems.

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

### Animation Handling
```bash
# Enable animations (disabled by default)
npm run ui -- --url https://example.com --no-disable-animations

# Explicitly disable animations for consistent screenshots 
npm run ui -- --url https://example.com --disable-animations
```

Disabling animations helps ensure consistent screenshots across multiple runs by preventing moving elements from affecting the analysis.

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

### Analyzing Protected Content

For sites requiring authentication:

```bash
npm run ui -- --url https://protected-site.com --auth username:password
```

### Focusing Analysis

```bash
# Focus on specific areas
npm run ui -- --url https://example.com --focus accessibility,branding,hierarchy

# Provide additional context for more focused analysis
npm run ui -- --url https://example.com --description "An e-commerce product page for a clothing store"
```

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
