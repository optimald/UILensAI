# Packages

WebEvo loads this repository from a git checkout. These directories are the engine.

```
packages/
├── cli/                 # `uilensai` binary (packages/cli/cli.js)
└── worker/
    └── uilensai/        # Analysis engine, required by path from the repo root
        ├── analyze/     # Ten audit modules
        ├── agents/      # Personas, evidence tools, cross-module checks
        ├── capture/     # Screenshot capture
        ├── config/      # Model defaults and catalogs
        ├── report/      # Report assembly
        ├── schemas/     # Report JSON schema
        ├── services/    # Cloudflare Browser Run
        └── utils/       # OpenRouter client, scoring, presets
```

From a checkout of the release tag:

```bash
git checkout v1.3.33
npm install
npm test
npm run cli -- --url https://example.com --modules ui
```

`npm install` installs this checkout's dependencies. Do not publish the package. See the [root README](../README.md) for credentials, models, and CLI flags.

## Environment

| Variable | Required for |
|---|---|
| `OPENROUTER_API_KEY` | Every AI call |
| `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN` | Screenshots and crawls |
| `GOOGLE_PSI_API_KEY` | Performance module |
