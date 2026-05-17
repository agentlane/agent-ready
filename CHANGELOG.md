# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] — 2026-05-17

First public release. MLP scope.

### Added
- TypeScript CLI with `check` command and `file` adapter
- 10 built-in rules: `has-acceptance-criteria`, `has-definition-of-done`, `has-repo-target`, `has-risk-classification`, `has-test-expectations`, `no-ambiguous-verbs`, `body-min-length`, `no-tribal-knowledge`, `t-shirt-size-present`, `has-design-link`
- User-defined custom rules of `type: regex`
- Three output formats: `text`, `markdown`, `json`
- JSON Schemas for rule packs (v1) and CLI output (v1)
- Default rule pack
- GitHub Action: `action.yml`, Docker-based runner, `entrypoint.sh` that fetches a GitHub Issue, normalizes it, lints, comments, and emits outputs
- CI workflow that runs the bad/good demo on every PR
- Bad + good example tickets demonstrating fail/pass
- README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- MIT license

[Unreleased]: https://github.com/Schoaib/agent-ready/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/Schoaib/agent-ready/releases/tag/v0.0.1
