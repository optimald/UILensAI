# UILensAI Monorepo

This is the refactored monorepo structure for UILensAI, eliminating code duplication and providing a clean separation of concerns.

## Package Structure

```
packages/
├── core/           # Shared analysis logic and utilities
├── cli/            # Command Line Interface
├── api/            # Vercel API service
└── worker/         # Fly.io worker service
```

## Packages

### @uilensai/core
The core package contains all shared analysis modules and utilities:
- **analyze/**: All analysis modules (UI, performance, security, etc.)
- **capture/**: Screenshot capture functionality
- **report/**: Report generation
- **storage/**: File storage utilities
- **utils/**: Shared utility functions
- **config/**: Configuration files
- **schemas/**: JSON schemas

### @uilensai/cli
The command-line interface package:
- Imports from `@uilensai/core`
- Your reliable CLI that has been working well
- No changes to functionality, just cleaner imports

### @uilensai/api
The Vercel API service package:
- API-specific middleware and services
- MCP integration
- WebEvo integration
- Authentication and rate limiting

### @uilensai/worker
The Fly.io worker service package:
- Background job processing
- Worker-specific services
- Dockerfile and deployment configuration

## Usage

From the root directory:

```bash
# Run CLI
npm run cli -- --url https://example.com

# Start API development server
npm run api:dev

# Start worker
npm run worker:start

# Install all dependencies
npm run install:all
```

## Benefits

1. **No Code Duplication**: Single source of truth for all analysis logic
2. **Clean Separation**: Environment-specific code is properly isolated
3. **Easy Maintenance**: Bug fixes only need to be applied once
4. **Consistent Versioning**: All packages share the same core logic
5. **Better Testing**: Shared code can be tested independently

## Migration Notes

- The original `src/` and `fly-worker/` directories have been moved to `backup/`
- All shared analysis code is now in `packages/core/`
- Import paths have been updated to use `@uilensai/core`
- Lazy loading prevents initialization issues with AI clients 

## Environment Variables

### Required
| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | API key for OpenRouter (all AI calls route through OpenRouter) |

### Optional (Durable Pipeline)
| Variable | Description |
|---|---|
| `INNGEST_EVENT_KEY` | Inngest Cloud event key — enables durable scan pipeline with retry and observability. If not set, scans execute directly (legacy path). |
| `INNGEST_SIGNING_KEY` | Inngest Cloud signing key — for webhook signature verification. |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string — enables persistent scan result storage. If not set, results are returned in-memory only. |

See `packages/worker/.env.example` for a template.