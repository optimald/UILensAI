# UILensAI CLI

Command-line entry point for the UILensAI website audit. The published package is [`@optimald/uilensai`](https://www.npmjs.com/package/@optimald/uilensai). Setup, models, and module output are documented in the [root README](../../README.md).

## Install

```bash
npm install @optimald/uilensai
```

Requires Node.js >= 22.

## Run

```bash
uilensai --url https://example.com --modules ui,performance,seoContent,siteHealth
uilensai --url https://example.com --modules all --analysis-depth comprehensive
uilensai --help
```

`--modules all` runs ui, performance, seoContent, security, privacy, compatibility, marketing, conversion, accessibility, and siteHealth.

AI calls need `OPENROUTER_API_KEY`. Screenshots and crawls need `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN`. The performance module needs `GOOGLE_PSI_API_KEY`.

## License

[AGPL-3.0](../../LICENSE)
