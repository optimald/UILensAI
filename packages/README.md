# Packages

The published package is the repository root, `@optimald/uilensai`. These directories are what that package ships.

```
packages/
├── cli/                 # `uilensai` binary (packages/cli/cli.js)
└── worker/
    └── uilensai/        # Analysis engine imported by the CLI and by require('@optimald/uilensai')
        ├── analyze/     # Ten audit modules
        ├── agents/      # Personas, evidence tools, cross-module checks
        ├── capture/     # Screenshot capture
        ├── config/      # Model defaults and catalogs
        ├── report/      # Report assembly
        ├── schemas/     # Report JSON schema
        ├── services/    # Cloudflare Browser Run
        └── utils/       # OpenRouter client, scoring, presets
```

Install and run from the repository root. See the [root README](../README.md) for credentials, models, and CLI flags.

```bash
npm install
npm test
npm run cli -- --url https://example.com --modules ui
```

## Environment

| Variable | Required for |
|---|---|
| `OPENROUTER_API_KEY` | Every AI call |
| `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN` | Screenshots and crawls |
| `GOOGLE_PSI_API_KEY` | Performance module |
