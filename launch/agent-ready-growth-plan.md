# agent-ready OSS Growth Plan

## Goal

Make `agent-ready` the obvious open-source starting point for teams that want AI coding agents to work from better-scoped tickets.

Primary hook:

> CI for AI-agent-ready tickets.

Core promise:

> Bad tickets should fail before an AI coding agent wastes tokens, opens a messy PR, or blocks a human reviewer.

Target outcome for launch:

- 1,000 useful GitHub stars in the first 30 days.
- 50 real installs or GitHub Action users.
- 10 issues or discussions from external users.
- 3 credible communities discussing the problem.
- A repeatable launch and follow-up loop that can later support Gatepack.

Stretch outcome:

- 10,000 GitHub stars only if the demo, timing, and distribution compound naturally. Do not chase fake stars, vote rings, bot comments, or spam campaigns.

## Positioning

### One-Liner

`agent-ready` is a Definition-of-Ready linter for AI coding agents.

### Tagline

Make every ticket ready for AI coding agents.

### Problem

AI coding agents are often blamed for weak output when the input ticket is vague, missing acceptance criteria, missing test expectations, or unclear about risk.

### Differentiator

Most tools focus on the agent after it starts. `agent-ready` checks the work before the agent starts.

### Audience

- Engineering managers introducing Codex, Claude Code, Cursor, Copilot, or other coding agents.
- Staff engineers defining agent guardrails.
- Product owners and BAs writing stories for agent-assisted teams.
- Platform teams building internal agentic SDLC workflows.
- Devtool builders looking for agent-readiness primitives.

## Launch Principles

- Make it tryable in under two minutes.
- Show the failure and the fix in one screen.
- Lead with a demo, not architecture.
- Automate drafting, monitoring, reminders, and metric capture where safe.
- Keep HN, Reddit, and community replies human-written.
- Ask for feedback, not upvotes.
- Optimize for real usage, not vanity stars.

## Phase 0: Product Cut

Objective: keep the smallest demoable product crisp.

Checklist:

- [x] Confirm project name: `agent-ready`.
- [x] Confirm package name: `@agentlane/agent-ready`.
- [x] Keep CLI command aliases: `agent-ready` and `story-lint`.
- [x] Use TypeScript and npm.
- [x] Support local JSON tickets first.
- [x] Support GitHub Issues via CLI adapter.
- [x] Support rule-pack config through YAML.
- [x] Ship a GitHub Action.
- [x] Define exit codes:
  - [x] `0`: ticket ready.
  - [x] `1`: ticket not ready.
  - [x] `2`: config or runtime error.
- [x] Define V0 rule categories:
  - [x] Acceptance criteria exist.
  - [x] Definition of Done exists.
  - [x] Repo target exists.
  - [x] Risk classification exists.
  - [x] Test expectation exists.
  - [x] Ambiguous verbs are flagged.
  - [x] Tribal knowledge is flagged.
  - [x] UI tickets require design links.
  - [x] Restricted-scope signals require elevated risk.

Deliverable:

- [x] Public README and examples.

## Phase 1: Repo Readiness

Objective: make the repo trustworthy and instantly understandable.

Checklist:

- [x] Add README with:
  - [x] One-line pitch.
  - [x] Demo GIF near the top.
  - [x] Bad ticket fails example.
  - [x] Fixed ticket passes example.
  - [x] Install command.
  - [x] CLI usage.
  - [x] GitHub Action usage.
  - [x] Rule-pack example.
  - [x] Why this exists.
  - [x] Roadmap.
  - [x] Contributing.
- [x] Add `LICENSE`.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `SECURITY.md`.
- [x] Add `CODE_OF_CONDUCT.md`.
- [x] Add issue templates:
  - [x] Bug report.
  - [x] Rule request.
- [ ] Add pull request template.
- [x] Add GitHub topics:
  - [x] `ai-agents`
  - [x] `developer-tools`
  - [x] `sdlc`
  - [x] `definition-of-ready`
- [x] Enable security features:
  - [x] Dependabot alerts.
  - [x] Secret scanning.
  - [x] Push protection.
  - [x] Code scanning.
- [x] Protect `main` with required checks and reviews.

Deliverables:

- [x] Public repo with clear trust signals.
- [x] README that sells the tool in 10 seconds.
- [x] Repo passes basic GitHub best-practice checks.

## Phase 2: Demo Readiness

Objective: create one viral, repeatable demo.

Demo narrative:

1. A vague ticket fails.
2. The report explains exactly what is missing.
3. A fixed ticket passes.
4. The GitHub Action blocks the bad ticket before an agent starts.

Checklist:

- [x] Create failing example ticket.
- [x] Create passing example ticket.
- [x] Add default rule pack.
- [x] Implement CLI report:
  - [x] Text summary.
  - [x] Markdown report.
  - [x] JSON output for CI.
  - [x] SARIF output.
- [x] Record a short terminal demo.
- [x] Add demo GIF to README top.
- [ ] Add `docs/demo-script.md`.

Deliverables:

- [x] Demo GIF.
- [ ] Demo script.
- [x] Reproducible local demo commands.

## Phase 3: Launch Assets

Objective: prepare public-safe launch assets before launch day.

Checklist:

- [ ] Create `launch/brief.md`.
- [ ] Create `launch/drafts/show-hn.md`.
- [ ] Create `launch/drafts/reddit.md`.
- [ ] Create `launch/drafts/linkedin.md`.
- [ ] Create `launch/drafts/x-thread.md`.
- [ ] Create `launch/drafts/bluesky.md`.
- [ ] Create `launch/drafts/product-hunt.md`.
- [ ] Create `launch/drafts/newsletter-pitch.md`.
- [ ] Create `launch/drafts/github-release.md`.
- [ ] Create `launch/faq.md`.
- [ ] Create `launch/objection-handling.md`.

Keep private or account-specific launch data out of git:

- `launch/community-targets.yml`
- `launch/outreach-tracker.md`
- `launch/private/`
- `launch/secrets.*`
- `launch/.env`
- `launch/daily-recaps/`
- `launch/metrics/raw/`

Required message angles:

- [ ] "AI coding agents fail on vague tickets."
- [ ] "Definition-of-Ready should be machine-checkable."
- [ ] "Before Codex/Claude/Cursor starts, run `agent-ready`."
- [ ] "CI should block agent work that lacks AC, risk, tests, or target repo."
- [ ] "This is the first piece of an agentic SDLC evidence chain."

HN draft requirements:

- [ ] Title starts with `Show HN:`.
- [ ] Link points to GitHub repo or demo, not a generic landing page.
- [ ] Body explains why we built it.
- [ ] Body includes exact try command.
- [ ] Body asks for feedback, not votes.
- [ ] No AI-generated comments posted directly.

Reddit draft requirements:

- [ ] Check each subreddit rules before posting.
- [ ] Customize per community.
- [ ] Be useful even if nobody clicks.
- [ ] Ask for critique from people using coding agents.
- [ ] Do not cross-post the same text everywhere.

Product Hunt requirements:

- [ ] Account is at least one week old.
- [ ] Profile completed.
- [ ] Maker comment prepared.
- [ ] Gallery includes demo GIF.
- [ ] Ask for feedback, not upvotes.

Deliverables:

- [ ] Complete public launch copy pack.
- [ ] Private community-specific posting plan kept out of git.

## Phase 4: Launch Automation Guardrails

Objective: use automation to keep launch work moving without spamming communities.

Automation can help with:

- [ ] Drafting posts from the launch brief.
- [ ] Finding relevant discussions.
- [ ] Summarizing community rules.
- [ ] Drafting human-review replies.
- [ ] Tracking metrics.
- [ ] Producing a daily launch recap.
- [ ] Suggesting the next best action.

Automation must not:

- [ ] Auto-post to HN.
- [ ] Auto-comment on HN.
- [ ] Mass-post identical Reddit content.
- [ ] Ask for upvotes.
- [ ] Buy, trade, or incentivize GitHub stars.
- [ ] DM strangers at scale.
- [ ] Commit private contacts, secrets, raw metrics, or account-specific outreach details.

Suggested recurring tasks:

- [ ] Daily: find relevant conversations about AI coding-agent failure, vague tickets, Codex, Claude Code, Cursor, or agent governance.
- [ ] Daily: draft useful comments or posts for human review.
- [ ] Daily: summarize mentions, stars, issues, comments, and follow-up opportunities.
- [ ] Weekly: draft a build-in-public update from commits and issues.
- [ ] Weekly: draft a ticket teardown post using one anonymized bad ticket.

Deliverables:

- [ ] `launch/automation-brief.md`
- [ ] Private automation config outside the public repo.
- [ ] Daily recap format.

## Phase 5: Community And Distribution

Objective: build useful attention before launch day.

Target surfaces:

- [ ] Hacker News.
- [ ] Product Hunt.
- [ ] GitHub Trending.
- [ ] Reddit.
- [ ] LinkedIn.
- [ ] X.
- [ ] Bluesky.
- [ ] Dev.to.
- [ ] Medium or personal blog.
- [ ] AI engineering newsletters.
- [ ] Devtool newsletters.
- [ ] Discord/Slack groups where maintainers already have context.

Community target checklist:

- [ ] Identify the community.
- [ ] Record URL.
- [ ] Record rules.
- [ ] Record whether self-promo is allowed.
- [ ] Record best post format.
- [ ] Record target audience.
- [ ] Record who should post.
- [ ] Record launch-day owner.
- [ ] Record follow-up cadence.

High-priority public surfaces:

- [ ] HN Show HN.
- [ ] Relevant AI coding-agent communities.
- [ ] Relevant GitHub/devtools communities.
- [ ] Dev.to AI/devtools post.
- [ ] LinkedIn build-in-public post.
- [ ] X thread with demo GIF.
- [ ] Bluesky thread with demo GIF.

Newsletter/outreach checklist:

- [ ] Identify relevant newsletters or curators privately.
- [ ] Write one-line pitch.
- [ ] Write 5-sentence pitch.
- [ ] Include demo GIF.
- [ ] Include GitHub URL.
- [ ] Include why this matters now.
- [ ] Track sent/replied/published privately.

Deliverables:

- [ ] Public pitch assets.
- [ ] Private community target and outreach trackers kept out of git.

## Phase 6: Launch Runbook

Objective: execute launch day with focus and fast response.

T-14 days:

- [ ] Repo public or private-beta ready.
- [ ] README complete.
- [ ] Demo works locally.
- [ ] Start build-in-public posts.
- [ ] Ask target users for feedback.

T-7 days:

- [ ] Product Hunt account ready.
- [ ] HN account ready.
- [ ] Reddit community rules checked.
- [ ] Launch drafts complete.
- [ ] Demo GIF complete.
- [ ] GitHub Action working.
- [ ] Release candidate ready.

T-3 days:

- [ ] Publish pre-launch technical post.
- [ ] Ask more target users to test install.
- [ ] Fix install friction.
- [ ] Finalize launch FAQ.
- [ ] Prepare response shifts.

T-1 day:

- [ ] Cut release.
- [ ] Confirm install command works on clean machine.
- [ ] Confirm README links.
- [ ] Confirm social preview.
- [ ] Confirm launch metrics dashboard.
- [ ] Sleep. Seriously.

Launch day:

- [ ] Post Show HN.
- [ ] Post LinkedIn demo.
- [ ] Post X thread.
- [ ] Post Bluesky thread.
- [ ] Post Product Hunt if ready.
- [ ] Post to selected communities with customized copy.
- [ ] Send newsletter pitches.
- [ ] Monitor every 30-60 minutes.
- [ ] Reply personally to thoughtful comments.
- [ ] Open issues for repeated feedback.
- [ ] Pin known limitations.

T+1 day:

- [ ] Publish "what we heard" update.
- [ ] Ship fixes for top install/documentation issues.
- [ ] Thank contributors.
- [ ] Ask for concrete rule contributions.

T+7 days:

- [ ] Release follow-up version if fixes or polish landed.
- [ ] Publish first-week learnings.
- [ ] Share metrics honestly.
- [ ] Convert common objections into docs.

Deliverables:

- [ ] `launch/runbook.md`
- [ ] Private launch-day response log kept out of git if it includes account names or contacts.

## Phase 7: Metrics

Objective: know what is actually working.

Core metrics:

- [ ] GitHub stars.
- [ ] Forks.
- [ ] Watchers.
- [ ] Clones.
- [ ] Unique visitors.
- [ ] Release downloads.
- [ ] Package downloads.
- [ ] GitHub Action usage.
- [ ] Issues opened.
- [ ] Discussions opened.
- [ ] External PRs.
- [ ] Community mentions.
- [ ] Newsletter mentions.
- [ ] HN points/comments.
- [ ] Product Hunt comments/upvotes.
- [ ] Reddit comments/upvotes.

Quality metrics:

- [ ] Stars-to-clones ratio.
- [ ] Stars-to-issues ratio.
- [ ] External contributor count.
- [ ] Install success rate from testers.
- [ ] Number of organizations trying it.
- [ ] Number of rule contributions.
- [ ] Number of real tickets linted.

Daily launch report:

```text
Date:
Stars:
Forks:
Clones:
Downloads:
Mentions:
Top channel:
Top feedback:
Broken install/doc issues:
Next best action:
```

Deliverables:

- [ ] `launch/metrics.md`
- [ ] Private daily recaps and raw metrics kept out of git.

## Phase 8: Follow-Up Loop

Objective: keep momentum after the launch spike.

Weekly content pillars:

- [ ] Ticket teardown: vague ticket -> agent-ready ticket.
- [ ] Rule spotlight: why this rule matters.
- [ ] Agent failure story: what better input would have prevented.
- [ ] Community contribution highlight.
- [ ] Integration post: Codex, Claude Code, Cursor, GitHub Actions.

Product follow-up:

- [ ] v0.2: more rules and better reports.
- [ ] v0.3: GitHub issue comment improvements.
- [ ] v0.4: Jira/Linear adapter polish.
- [ ] v0.5: WorkPacket preview.
- [ ] v1.0: stable schema and GitHub Action.

Bridge to Gatepack:

- [ ] Add `agent-ready` result output as evidence.
- [ ] Define first Gatepack importer for `agent-ready` results.
- [ ] Write "from ready ticket to evidence pack" demo.

Deliverables:

- [ ] 4-week editorial calendar.
- [ ] v0.2/v0.3 roadmap.
- [ ] Gatepack bridge note.

## Immediate Next 10 Tasks

1. [ ] Merge the repo polish PRs already opened.
2. [ ] Add `docs/demo-script.md`.
3. [ ] Create `launch/brief.md`.
4. [ ] Create `launch/drafts/show-hn.md`.
5. [ ] Create `launch/drafts/linkedin.md`.
6. [ ] Create `launch/faq.md`.
7. [ ] Create `launch/objection-handling.md`.
8. [ ] Confirm clean-machine install command.
9. [ ] Refresh demo GIF if output changed.
10. [ ] Set up private metrics and outreach tracking outside the public repo.

## Done Definition

This plan is done when:

- [ ] A user can try `agent-ready` in under two minutes.
- [ ] The README makes the value obvious above the fold.
- [ ] The demo is clear enough to share as a GIF.
- [ ] Launch drafts are ready before launch day.
- [ ] Automation drafts and monitors, but humans approve posts/replies.
- [ ] Metrics are captured daily.
- [ ] Feedback turns into issues, docs, and follow-up priorities.
