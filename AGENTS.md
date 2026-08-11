# AGENTS

Keep this file **minimal**. It only points agents at the right sources. Do not dump process essays, ticket lists, or full specs here.

**Living file:** when you add a significant new area (app code, design surface, context pack, research conclusion, or build decision), add **one short pointer** below. Prefer links over restating content. If a pointer goes stale, fix or remove it.

## Hard rules

- **Never start, resume, or “helpfully continue” a competition ticket unless Tyler explicitly names that ticket in this conversation.** Course Check, research, and docs sessions stay in their lane. Do not open ticket worktrees or edit ticket implementation “while you’re here.”
- Do not invent recovery handoffs, quarantine status, or blocked gates that Tyler did not ask for.
- Whenever you create or update a handoff, plan, research report, or other deliverable document on Halla, also copy the final file over SSH to `veelox:/home/tyler/Desktop/Plans/<filename>` and include a direct `file:///home/tyler/Desktop/Plans/<filename>` link plus the exact path in the final response; never report only the folder.

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

Specs and implementation tickets live as local Markdown under `.scratch/`. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

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

## Private / bulk source material

- Shareable notes: `context/`
- Restricted raw exports: `.context-private/` (gitignored) — use only if needed; don’t commit secrets
