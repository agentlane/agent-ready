# Contributing to agent-ready

Thanks for considering a contribution. The fastest way to be useful is to add a **new rule** to the default pack, or to wire up an **adapter** for a ticket source we don't yet support.

## Quick start

```bash
git clone https://github.com/Schoaib/agent-ready
cd agent-ready
npm install
npm run build
node dist/cli.js check examples/tickets/bad-ticket.json   # should exit 1
node dist/cli.js check examples/tickets/good-ticket.json  # should exit 0
```

## Adding a new rule (the most welcome PR)

1. Add a `Rule` entry to [`src/rules/built-in.ts`](src/rules/built-in.ts). Follow the shape of the existing ones — one function, one default severity, one `run()` method that returns a `CheckResult`.
2. Append the rule's id to the `BUILTIN_RULES` array at the bottom of the file.
3. Add an entry to [`rule-packs/default.yaml`](rule-packs/default.yaml).
4. Update [`examples/tickets/bad-ticket.json`](examples/tickets/bad-ticket.json) or [`good-ticket.json`](examples/tickets/good-ticket.json) so the demo exercises your rule (and the CI fixtures keep passing).
5. Update the rules table in [`README.md`](README.md).
6. Open a PR. Keep the change focused — one rule per PR.

## Adding an adapter

Adapters live in `src/adapters/`. Each one exports `loadTicketFrom<Source>(...)` returning a `Ticket` shape (see [`src/types.ts`](src/types.ts)). The `file` adapter is the reference implementation: keep adapters thin, parse the source's native shape, and produce a `Ticket` — nothing more.

## Coding style

- TypeScript with `strict: true`. No `any` unless you justify it in a comment.
- No new runtime dependencies without prior discussion (the install footprint is part of the product).
- Tests use Node's built-in `node:test`. Fixtures live under `examples/`.

## Releasing

Maintainers only. Bump version in `package.json`, update `CHANGELOG.md`, tag `vX.Y.Z`, push, then `npm publish`.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
