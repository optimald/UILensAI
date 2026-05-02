# Contributing to UILensAI

Thanks for your interest in contributing to UILensAI! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/uilensai.git
   cd uilensai
   ```
3. **Install dependencies**:
   ```bash
   npm install
   npm run install:all
   ```
4. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Required Environment Variables

Copy `.env.example` to `.env` and configure at least one AI provider:

```bash
cp .env.example .env
```

You'll need at minimum:
- One AI provider key (OpenRouter recommended — `OPENROUTER_API_KEY`)
- Cloudflare credentials for screenshot capture (optional for non-UI work)

### Running Tests

```bash
npm test
```

### Running a Local Scan

```bash
node packages/cli/cli.js --url https://example.com --modules ui --testing
```

## How to Contribute

### Reporting Bugs

Open an issue with:
- A clear description of the bug
- Steps to reproduce
- Expected vs. actual behavior
- Your Node.js version and OS

### Suggesting Features

Open an issue tagged `enhancement` with:
- A description of the feature
- The problem it solves
- Any proposed implementation approach

### Pull Requests

1. Keep PRs focused — one feature or fix per PR
2. Update documentation if you change behavior
3. Add tests for new functionality
4. Ensure all tests pass before submitting
5. Follow the existing code style

### Areas We'd Love Help With

- **New analysis modules** — Additional website analysis capabilities
- **AI provider integrations** — New model providers or improved prompts
- **Report output formats** — HTML, PDF, or other report formats
- **Performance improvements** — Faster analysis, reduced API calls
- **Documentation** — Guides, tutorials, examples
- **Bug fixes** — Check open issues for known bugs

## Code Style

- Use `const` / `let` (no `var`)
- Use descriptive variable and function names
- Add JSDoc comments to exported functions
- Keep functions focused and under 50 lines when possible

## Architecture

```
packages/
├── cli/           # CLI entry point
└── worker/        # Core analysis engine
    └── uilensai/
        ├── agents/    # AI agent orchestration (CEO, debate, personas)
        ├── analyze/   # Analysis modules (9 modules)
        ├── config/    # Model defaults, industry taxonomy
        ├── report/    # Report generation
        ├── services/  # Cloudflare Browser services
        └── utils/     # Shared utilities, AI providers, scoring
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
