# Upgrade to v1.3.33

For WebEvo and MarketPounce. The engine is no longer installed from the npm registry. Pin the git tag.

Release: https://github.com/optimald/UILensAI/releases/tag/v1.3.33

## 1. Point the dependency at the tag

Node.js 22 or newer is required.

**WebEvo Pro** (`package.json` is `^1.3.30`) and **MarketPounce** (`package.json` is `^1.3.28`, lockfile resolved `1.3.30`):

```json
"@optimald/uilensai": "git+https://github.com/optimald/UILensAI.git#v1.3.33"
```

Then reinstall (`npm install` in WebEvo Pro, `pnpm install` in MarketPounce). Do not run `npm install @optimald/uilensai` against the registry. The copy on npm is an older tree.

**WebEvo Audit** and **Optimal** (`file:vendor/uilensai`):

Replace the vendored tree with the tag, then install that checkout's dependencies.

```bash
rm -rf vendor/uilensai
git clone --depth 1 --branch v1.3.33 https://github.com/optimald/UILensAI.git vendor/uilensai
cd vendor/uilensai && npm install && cd -
```

The `require('@optimald/uilensai')` calls stay as they are. MarketPounce's `require.resolve('@optimald/uilensai/packages/worker/uilensai')` still resolves inside the git checkout.

## 2. Environment

| Variable | Who needs it |
|---|---|
| `OPENROUTER_API_KEY` | Every scan. This is the only AI key the engine reads. |
| `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_BR_API_TOKEN` | Screenshots and crawls |
| `GOOGLE_PSI_API_KEY` | Performance module |

Anthropic, OpenAI, Gemini, DeepSeek, and xAI keys are not the scan path.

## 3. What changed in the report

- The old primary model, `google/gemini-3.1-flash-lite-preview`, was shut down on 2026-05-25. Scans now use live OpenRouter ids.
- UI vision, conversion, marketing, and the audit director use `google/gemini-3.8-flash`.
- Performance, accessibility, and security scores stay on the tools (PageSpeed Insights, axe-core 4.14, header checks). Flash Lite only writes fixes for findings those tools already reported. Site health does not call a model.
- Accessibility scoring is WCAG 2.2 AA. Touch targets use success criterion 2.5.8.
- Performance still comes from PageSpeed Insights. The Lighthouse major inside PSI is 13.
- `siteHealth` is included in `--modules all`.
- A module that cannot trust its inputs returns `status: "Inconclusive"` and `score: null`. Do not display a number for that module. Show `inconclusiveReason`.

## 4. Smoke check

```bash
node packages/cli/cli.js --url https://example.com --modules performance,accessibility,ui --testing
```

Run that from the UILensAI checkout. `--testing` forces `google/gemini-3.1-flash-lite`. A normal scan uses 3.8 Flash for UI, conversion, marketing, and the audit director.

Confirm one WebEvo or MarketPounce scan still returns `modules.seoContent`, `modules.ui`, and `modules.performance`, and that a blocked or error page comes back inconclusive instead of a perfect score.
