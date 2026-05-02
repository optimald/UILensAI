# UILensAI CLI

A powerful command-line interface for comprehensive UI analysis and optimization.

## Installation

### From GitHub Packages

```bash
npm install @optimald/uilensai-cli
```

### From Source

```bash
git clone https://github.com/optimald/uilensai-private.git
cd uilensai-private/packages/cli
npm install
npm link
```

## Usage

### Basic Analysis

```bash
# Analyze a website
uilensai analyze https://example.com

# Analyze with specific modules
uilensai analyze https://example.com --modules performance,accessibility

# Analyze and save results
uilensai analyze https://example.com --output results.json
```

### Available Modules

- `performance` - Core Web Vitals and performance metrics
- `accessibility` - WCAG compliance and accessibility checks
- `seo` - Search engine optimization analysis
- `ui` - User interface analysis and recommendations
- `security` - Security headers and best practices
- `best-practices` - General web development best practices

### Command Options

```bash
Options:
  -V, --version              output the version number
  -u, --url <url>           URL to analyze
  -m, --modules <modules>   Comma-separated list of modules to run
  -o, --output <file>       Output file for results
  -h, --help                display help for command
```

## Features

- **Comprehensive Analysis**: Get detailed insights into your website's performance, accessibility, SEO, and more
- **Screenshot Capture**: Visual analysis with automated screenshot generation
- **Detailed Reporting**: JSON output with actionable recommendations
- **Modular Design**: Run only the analysis modules you need
- **Batch Processing**: Analyze multiple URLs efficiently

## Examples

### Performance Analysis Only

```bash
uilensai analyze https://example.com --modules performance
```

### Full Analysis with Custom Output

```bash
uilensai analyze https://example.com --output my-analysis.json
```

### Batch Analysis

```bash
# Create a file with URLs (one per line)
echo "https://example.com" > urls.txt
echo "https://another-site.com" >> urls.txt

# Run batch analysis
uilensai analyze --batch urls.txt
```

## Output Format

The CLI generates detailed JSON reports containing:

- **Summary**: Overall scores and key metrics
- **Modules**: Detailed results for each analysis module
- **Recommendations**: Actionable suggestions for improvement
- **Screenshots**: Visual captures of the analyzed pages
- **Metadata**: Analysis timestamp, URL, and configuration

## Requirements

- Node.js >= 18.0.0
- Chrome/Chromium browser (for screenshot capture)

## Contributing

Contributions are welcome! Please see our [contributing guidelines](https://github.com/optimald/uilensai-private/blob/main/CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](https://github.com/optimald/uilensai-private/blob/main/LICENSE) for details.

## Support

For issues and questions:
- [GitHub Issues](https://github.com/optimald/uilensai-private/issues)
- [Documentation](https://github.com/optimald/uilensai-private/tree/main/docs)

## Changelog

### v1.0.1
- Enhanced UI analysis capabilities
- Improved performance monitoring
- Better error handling and reporting
- Updated dependencies for better stability

### v1.0.0
- Initial release
- Core analysis modules
- Screenshot capture functionality
- JSON reporting output
