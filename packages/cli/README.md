# UILensAI CLI

Command-line entry point for the website audit. Setup, models, and module output are documented in the [root README](../../README.md).

## Get the engine

```bash
git clone https://github.com/optimald/UILensAI.git
cd UILensAI
git checkout v1.3.32
npm install
node packages/cli/cli.js --help
```

Requires Node.js >= 22. The `npm install` step installs this checkout's dependencies. The engine is not published to a package registry.

## Run

```bash
node packages/cli/cli.js --url https://example.com --modules ui,performance,seoContent,siteHealth
node packages/cli/cli.js --url https://example.com --modules all --analysis-depth comprehensive
```

`--modules all` runs ui, performance, seoContent, security, privacy, compatibility, marketing, conversion, accessibility, and siteHealth.

AI calls need `OPENROUTER_API_KEY`. Screenshots and crawls need `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN`. The performance module needs `GOOGLE_PSI_API_KEY`.

## License

[AGPL-3.0](../../LICENSE)
