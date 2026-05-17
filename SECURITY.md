# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.0.x | ✅ |

`agent-ready` is pre-1.0. Security fixes will be applied to the latest released version only until 1.0.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report privately via GitHub's [private vulnerability reporting](https://github.com/agentlane/agent-ready/security/advisories/new). Include:

- A description of the issue and its impact
- A minimal reproduction
- Affected version(s)

You should receive an acknowledgement within 5 business days. We aim to ship a fix within 30 days for high-severity issues.

## Scope

In-scope:

- The CLI (`agent-ready`, `story-lint`)
- The GitHub Action and its `entrypoint.sh`
- Rule pack parsing
- Anything in this repository's `dist/` published to npm

Out of scope:

- Third-party rule packs you load via `--rules`
- The behavior of AI agents that consume `agent-ready` output (they are not authenticated by this tool)
- npm registry compromise, GitHub Actions runner compromise (report to the respective vendor)
