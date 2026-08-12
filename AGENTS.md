# AGENTS

Keep this file **minimal**. It only points agents at the right sources. Do not dump process essays, ticket lists, or full specs here.

**Living file:** when you add a significant new area (app code, design surface, context pack, research conclusion, or build decision), add **one short pointer** below. Prefer links over restating content. If a pointer goes stale, fix or remove it.

## Hard rules

- **Never start, resume, or “helpfully continue” a competition ticket unless Tyler explicitly names that ticket in this conversation.** Course Check, research, and docs sessions stay in their lane. Do not open ticket worktrees or edit ticket implementation “while you’re here.”
- Do not invent recovery handoffs, quarantine status, or blocked gates that Tyler did not ask for.
- Whenever you create or update a handoff, plan, research report, or other deliverable document on Halla, also copy the final file over SSH to `veelox:/home/tyler/Desktop/Plans/<filename>` and include a direct `file:///home/tyler/Desktop/Plans/<filename>` link plus the exact path in the final response; never report only the folder.
- **Board status is mandatory — move the ticket as you work** (see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)):
  1. **Start** named ticket work → `**Status:** in-progress` **before** coding (not later); advance only to `in-review` or `done`, never back to `ready-for-agent`.
  2. **Ready for human QA** → `in-review` + demo URL + what-to-test.
  3. **Done** (after QA / merge as appropriate) → `done` + checklist `- [x]`.
  4. Always write the issue file on the **main checkout** board path **and** the worktree copy.
  5. **Frontier maintenance on every start/finish/block (same rule as Masthead Pages):** re-scan **both** tracks. For every non-human-tandem ticket still `blocked`, if all declared blockers are `done`/`complete`, set it to `ready-for-agent` and comment why. Partially cleared blockers stay `blocked` (annotate remaining). Never leave Open empty when the graph has free agent work. Human-tandem tickets never auto-promote.
  6. Run `npm run issues:reconcile` (dry-run) then `npm run issues:reconcile:apply` on ticket closeout so dependents cannot stay stale.
- **Whenever you finish a ticket (or claim it ready for human QA), always start or reuse a Tailscale-reachable demo and put in the final response: (1) the direct demo URL `http://100.105.117.93:<port>/…` — never localhost — and (2) a short “what to test” checklist for that ticket.** Bind with `--host 0.0.0.0` (or the host Tailscale IP) and confirm the listener is not loopback-only before linking.

## Start here

1. [context/README.md](context/README.md) — how project context is organized
2. [context.md](context.md) — product requirements (what to build / not build)
3. [context/BUILD-PLAN.md](context/BUILD-PLAN.md) — locked competition architecture, spine order, spikes
4. [design/DESIGN.md](design/DESIGN.md) + [design/README.md](design/README.md) — design system and assets
5. [design/source-of-truth/](design/source-of-truth/) — locked visual UI (implement against this; not prototypes)

## Research (decisions already made — don’t re-litigate casually)

- [`.research/`](.research/) — form builder, micro-UX, and app-wide building-blocks research
- Prefer [context/BUILD-PLAN.md](context/BUILD-PLAN.md) for the condensed locks

## Agent skills

### Issue tracker

Specs and tickets: [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

**Live board:** `http://100.105.117.93:3939/` — main checkout `.scratch/` only.

**Board paths (write both when using a worktree):**

- Competition: `/home/halla/ChartStead/.scratch/chartstead-competition-build/issues/`
- Course Check: `/home/halla/ChartStead/.scratch/chartstead-course-check/issues/`

### Triage labels

Use the five canonical Matt skill labels. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Use the single-context domain-doc layout. See [docs/agents/domain.md](docs/agents/domain.md).

## App code

- React application: [`src/`](src/)
- Hono Worker, Better Auth boundary, and Durable Object event store: [`worker/`](worker/)
- Cloudflare bindings and environments: [`wrangler.jsonc`](wrangler.jsonc)
- Implementation work: [`.scratch/chartstead-competition-build/`](.scratch/chartstead-competition-build/)
- Course Check specification and implementation work: [`.scratch/chartstead-course-check/`](.scratch/chartstead-course-check/)
- Course Check killer walkthrough: [`docs/course-check-killer-walkthrough.md`](docs/course-check-killer-walkthrough.md) + seed fixtures in [`worker/seed-course-check-demo.ts`](worker/seed-course-check-demo.ts)

## Private / bulk source material

- Shareable notes: `context/`
- Restricted raw exports: `.context-private/` (gitignored) — use only if needed; don’t commit secrets
