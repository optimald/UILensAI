# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅ Active  |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email security findings to `security@uilensai.com`.
3. Include: description, reproduction steps, impact assessment.
4. We will acknowledge within 48 hours and provide a fix timeline.

## Security Controls

### Code Protection (NIST SSDF PS.1)
- All production changes require pull request review
- Signed commits are enforced via CI checks
- Force pushes to `main` are blocked
- Secrets scanning via TruffleHog on every push
- Static analysis via Semgrep SAST and CodeQL

### Release Integrity (NIST SSDF PS.2)
- SHA-256 checksums generated for all releases
- Docker images scanned via Trivy before deployment
- npm lockfile integrity verified in CI
- Deployment gates reject unsigned artifacts

### Software Bill of Materials (NIST SSDF PS.4)
- SBOMs in CycloneDX format generated at build time
- SBOMs attached to GitHub releases
- Dependency review enforced on pull requests

## Environment Variables

All secrets are managed via Vercel environment variables. The following must be configured:
- `ADMIN_SECRET` — Admin endpoint authentication
- `WEBEVO_WEBHOOK_SECRET` — Webhook HMAC signatures
- `SCALE_WORKERS_AUTH_TOKEN` — Worker scaling authentication
- `REPORT_ENCRYPTION_KEY` — Report AES-256 encryption
