# 08 — Publish product docs at /docs (docmd)

**Status:** done

**Blocked by:** None

## What to build

Publish curated ChartStead product documentation with [docmd](https://github.com/docmd-io/docmd), host it on the marketing site at `https://chartstead.com/docs/`, and link it from site chrome. Keep the docmd project **inside `chartstead-web`**, not the ChartStead app repository.

Scope includes the initial docs content (introduction, concepts, workflow, Course Check, guides, API/MCP) plus:

- `/docs` (and nested doc routes) served from the marketing Worker
- Header and footer Docs link/button
- Remove any temporary docs copy left in the ChartStead app repo
- Deploy to production (`chartstead.com`)

## Acceptance criteria

- [x] Docmd source and config live under `/home/halla/chartstead-web` (not ChartStead `documentation/`).
- [x] `https://chartstead.com/docs/` serves the docs site (nested pages resolve).
- [x] Marketing header and footer expose a Docs link to `/docs`.
- [x] ChartStead app repo no longer hosts the public docmd project.
- [x] Site is rebuilt and deployed; live URL recorded here before handoff.

## Comments

- 2026-08-17 — Tyler asked to create docs with docmd, add `/docs` + nav link on the marketing site, file/claim this ticket (including the docs already drafted), move everything into `chartstead-web`, then merge and deploy. Claimed `in-progress`.

- 2026-08-17 — Docs live at https://chartstead.com/docs/ (header + footer Docs links). Source in chartstead-web `documentation/`. ChartStead app `documentation/` removed. Deployed via chartstead-web main `1dc0449`.

