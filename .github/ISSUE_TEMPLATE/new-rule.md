---
name: New rule proposal
about: Propose a new built-in rule for the default rule pack
title: "rule: <short name> — <one-line summary>"
labels: ["rule", "good first issue"]
---

## Rule id

`<kebab-case-id>`

## What it checks

One sentence describing the signal.

## Why it matters for agents

Why does an AI coding agent care about this? What goes wrong if this isn't on the ticket?

## Detection

- Signal in `title` / `body` / `labels` (which?)
- Regex, structural check, or list of phrases
- Default severity: `error` / `warn`
- Defaults: e.g. `min_count: 1`

## Example

A short bad ticket fragment that should fail this rule, and a fixed version that should pass.

## Notes

(Optional) Edge cases, false-positive risks, prior art.
