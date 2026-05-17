# Open-Source Product Ideas — Agentic SDLC

Snapshot of the brainstorming session that produced `agent-ready`. This document is here so future contributors (and future-you) understand **why this product, in this shape, now** — and which adjacent products are intentionally *not* in scope yet.

Source: derived from the 15-layer "Agentic SDLC North Star" architecture in [`shoaib/agentic-sdlc-north-star`](https://github.com/your-org/agentic-sdlc-north-star).

---

## Context

The north-star blueprint describes an enterprise Agentic SDLC: AI agents embedded across business intake, design, engineering, build, test, and release — gated by 5 quality gates (QG1–QG5), governed via OPA, observable via Langfuse, evidenced as signed bundles, and continuously upskilled via a Teacher/Student distillation loop.

That blueprint is *too big* to open-source as one platform. The opportunity is in **small, sharp products that compose with the existing OSS stack** — not in rebuilding what Backstage, Langfuse, OPA, GitHub Spec Kit, and friends already do.

---

## Landscape (deliberately skipped — already saturated)

| Category | Existing OSS | Verdict |
|---|---|---|
| LLM cost / observability | Langfuse, Helicone, Portkey, OpenMeter, Phoenix | Done. Don't rebuild. |
| DORA metrics | Apache DevLake, Faros, DX | Done. |
| Generic AI-BOM / SBOM | CycloneDX ML-BOM, Cisco AI-BOM | Done. |
| Jira / Confluence MCP | mcp-atlassian, Jira-Context-MCP, atlassian/atlassian-mcp-server | Done. |
| Agent governance runtime | Microsoft Agent Governance Toolkit, Pipelock | Done. |
| MCP gateway / virtual keys | Bifrost, IBM ContextForge, lunar.dev | Done. |
| Skill format (SKILL.md) | `anthropics/skills`, agentskills.io, Microsoft Skills | Done — **build ON**. |
| Code attribution (line level) | Cursor `agent-trace` | Done — extend, don't replicate. |
| Skill distillation loop | jcode, Hermes Agent | Done in narrow scope. |
| Sandboxing | agent-safehouse.dev | Done. |
| Per-PR traditional evidence | Evidence Gate Action | Done for SBOM/SAST/tests — **AI-blind**. |
| Lifecycle event spec | AgentHook | Done — **compose with**. |
| Live governance | GovForge | Done — different shape. |
| Specs / spec-driven dev | GitHub Spec Kit | Done — adjacent, don't compete. |
| LoC counting (AI %) | GitHub Copilot Metrics API, copilot-metrics-viewer, agent-trace, DX, LinearB, Faros | **Saturated *and* metric is broken.** See "rejected ideas" below. |

---

## Shortlist (merged)

| Idea | What it solves | Effort | Traction | Verdict |
|---|---|:-:|:-:|---|
| **agent-ready** (CLI: `story-lint`) | Ticket/story Definition-of-Ready linter before agent picks it up | S | ★★★★★ | **🥇 Building now — this repo.** |
| **Gatepack** | Signed per-PR evidence bundle: AI traces, gates, tests, approvals, cost, model/tool usage | M | ★★★★ | **🥈 Second wave — depth play. Own repo.** |
| **AI Contribution Ledger** | AI LOC + human-modified AI LOC + surviving AI LOC + risk-area AI LOC | M | ★★★★ | **Inside Gatepack as a metric layer. Not standalone.** |
| **context-tiers** | T1/T2/T3 progressive context-budget loader; cuts MCP context blowup | M | ★★★ | Later. Strong primitive, harder to demo. |
| **SkillGuard** | Safety scanner for SKILL.md: dangerous instructions, hidden tools, permissions, trust tier | S–M | ★★★ | Timely, skill space crowding. Optional. |
| **path-router** | Classifies ticket into Path A / B / C (autonomous / multi-agent / human-led) | S | ★★ | Folds into `agent-ready` as a rule pack. |
| **awesome-rego-for-ai-coding** | Curated OPA bundles for restricted paths (auth/payments/secrets/IaC) | XS | ★★ | Side project / contribution magnet. |
| **create-sdlc-fabric** | Cookiecutter scaffolding `skills/ policies/ prompts/ schemas/ tool-registry/` | XS | ★★ | Starter kit, not a product. |
| **ai-cost-pr-bot** | Per-PR cost + model blend comment from Langfuse | XS | ★ | Becomes a Gatepack renderer. |
| **quality-gate-bundler** | QG3–QG5 evidence bundler | M | ★★ | Subset of Gatepack. |

## Rejected ideas

| Idea | Why rejected |
|---|---|
| **WorkPacket** (issue → folder-as-API context pack) | GitHub Spec Kit overlaps too much. The piece worth keeping (DoR check) became `agent-ready`. |
| **AI LoC counter** (count lines AI wrote) | Bad metric (Goodhart) + crowded space (Copilot Metrics, Cursor, DX, LinearB, Faros). **Reframed:** the survival-rate angle becomes the **AI Contribution Ledger** *inside Gatepack*, not a standalone product. |
| **Generic "agentic SDLC platform"** | Space is crowded with vendors and consultancies. Niche wins over breadth here. |

---

## The picked product universe

**Three sequential products, one coherent brand:**

```
┌─────────────────┐    ┌──────────────┐    ┌───────────────────────┐
│   agent-ready   │ ─► │   Gatepack   │ ─► │ AI Contribution       │
│  (this repo)    │    │  (next repo) │    │ Ledger (inside        │
│                 │    │              │    │  Gatepack)            │
│ ticket → ✅/❌   │    │  PR → signed │    │ PR → 30d survival     │
│ + fix list      │    │  evidence    │    │ + risk-weighted churn │
└─────────────────┘    └──────────────┘    └───────────────────────┘
   front door             depth play          counter-metric moat
```

**Why this sequence:**
- **Distribution → depth → durability.** `agent-ready` stars fund Gatepack's launch; the Ledger's survival-rate framing makes Gatepack uncopyable.
- **Coherent universe.** An `agent-ready` pass becomes a Gatepack input field (`pre_flight: { agent_ready: pass, ruleset: v1.2 }`). Same brand, same audience, compounding adoption.
- **Optionality.** If `agent-ready` underperforms, Gatepack still ships with a different front-door story. No sunk cost.

---

## Product 1 — `agent-ready` (this repo)

- **Tagline:** *Make every ticket ready for AI coding agents.*
- **Status:** v0.0.1 shipped — see [`README.md`](../README.md).
- **Composes with:** GitHub Issues, Jira, Linear (via adapters); Spec Kit (upstream authoring); Gatepack (downstream evidence).

## Product 2 — Gatepack (planned, separate repo)

- **Tagline:** *The evidence bundle that knows AI wrote part of this PR.*
- **Differentiator vs Evidence Gate Action:** AI-aware schema (model, prompt, skill, agent-run-id, Langfuse trace, prompt-injection scan, cost) + portable signed bundle (not pipeline-scoped) + per-PR scope.
- **Spec-first.** The JSON Schema (`gatepack.v1`) is the durable moat — ship the spec before the tooling.
- **MVP shape:**
  ```bash
  gatepack init
  gatepack collect --pr 123
  gatepack verify gatepack.json
  gatepack render --format markdown
  ```
- **Outputs:** `gatepack.json`, `gatepack.md`, `gatepack.sig`, PR comment summary, optional S3/GCS upload.
- **Composes with:** AgentHook (lifecycle events as input), Langfuse (traces), OPA (decisions), Evidence Gate (traditional gates as a feeder), cosign/Sigstore.

## Product 3 — AI Contribution Ledger (inside Gatepack)

- **The counter-metric:** measures *survival* of AI-written code, not *volume*.
- **Fields added to Gatepack schema:**
  ```yaml
  ai:
    lines_added_by_agent: 412
    lines_kept_after_human_review: 287
    lines_surviving_at_30_days: 198
    defects_attributed_to_agent_lines: 2
    survival_rate_30d: 0.48
  ```
- **Implementation:** a follow-on `gatepack survival-scan` job runs nightly, scans 30-day-old PR bundles, recomputes survival/churn, emits an updated bundle.
- **Launch hook:** *"Stop counting AI lines. Start counting which ones lasted."*
- **Defensibility:** competitors (Copilot Metrics, agent-trace, AgentHook) don't carry per-PR bundles forward in time, so they structurally can't ship this without rebuilding their data model.

---

## Launch checklist (applies to whichever product ships next)

- [ ] Single-screen README with an animated GIF above the fold
- [ ] One-command install (`npx`, `pipx`, or `gh extension install`)
- [ ] 3 ready-made integrations (Linear, Jira, GitHub Issues)
- [ ] Comparison table: *"What you had before vs. with this."*
- [ ] HN-ready post title drafted **before** coding starts
- [ ] Public benchmark / dataset for the launch blog post
- [ ] Discord or GitHub Discussions enabled day 1
- [ ] "good first issue" labels seeded

---

## Useful references from the research session

- **Skill format / distillation:** `anthropics/skills`, agentskills.io, jcode, Hermes Agent
- **Code attribution:** Cursor `agent-trace` (line level)
- **Cost / observability:** Langfuse (MIT), Helicone, Portkey, OpenMeter, Phoenix
- **Governance / firewall:** Pipelock (Ed25519-signed, CycloneDX 1.6), Microsoft Agent Governance Toolkit, agent-safehouse.dev sandbox
- **Per-PR evidence (AI-blind, the wedge for Gatepack):** Evidence Gate Action
- **Live governance (adjacent, not competing):** GovForge
- **Lifecycle event spec (input source for Gatepack):** AgentHook
- **DORA / EIP:** Apache DevLake, Faros, DX
- **Jira agents (commercial competitors):** Tabnine, Atlassian Rovo Dev
- **MCP gateways:** Bifrost, IBM ContextForge, lunar.dev
- **Compliance tailwind:** EU AI Act, ISO 42001, SOC 2 — all asking for AI provenance artifacts

---

## Naming & uniqueness checks (do before public push)

```bash
gh search repos agent-ready
gh search repos story-lint
gh search repos gatepack
npm view agent-ready 2>&1
npm view story-lint 2>&1
npm view gatepack 2>&1
pip show agent-ready 2>&1
```

If `story-lint` is taken (likely), fall back to `agent-ready` as the sole CLI name.
