# Contributing to WU CILT Assistant

Thank you for helping. This project accepts fixes, accessibility improvements, documentation, tests, and carefully reviewed workflow changes.

## Before you start

- Read the privacy and safety notes in [README.md](README.md).
- Never include a real student ID, password, CILT cookie, OTP, production host, Redis password, or ticket content containing personal data in an issue, commit, test fixture, screenshot, or pull request.
- Do not add automated bulk submission, parallel submission, or a bypass for the built-in per-course delay and session lock.

## Development flow

1. Open an issue for material changes so the scope is clear.
2. Fork the repository and create a focused branch.
3. Make the smallest complete change and add or update documentation when behaviour changes.
4. Run `bun install --frozen-lockfile` and `bun run build`.
5. Open a pull request using the template.

## Review policy

Every pull request requires maintainer review before merge. The repository is configured for `@KamaruSama` code ownership; contributors must not self-merge or enable auto-merge. Maintainers may request a manual CILT verification when a change affects the submission flow.

## Scope boundaries

This is an unofficial helper for reducing repetitive clicks, not a way to damage CILT or bypass its normal flow. Do not represent it as a Walailak University or CILT service, scrape more data than needed for the active user session, or weaken its privacy controls.
