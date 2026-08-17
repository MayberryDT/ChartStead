# 04 — Point website CTAs at the ChartStead-domain demo and example event

**Status:** done

**Blocked by:** Competition 60; Website 03

## What to build

The marketing site already lives on `https://chartstead.com`. Stop sending visitors from that site to `*.mayberrydt.workers.dev` for the product. The primary CTA opens `https://demo.chartstead.com/demo`. The second CTA opens the ChartStead-domain example event. Also replace leftover repo strings that still say `chartstead-web.mayberrydt.workers.dev` for `site.url` / canonicals.

## Acceptance criteria

- [x] `site.url`, canonical tags, sitemap, and social URLs use `https://chartstead.com` (repo config is stale; live site is already on that domain).
- [x] `site.demoUrl`, `nav.primaryCta`, and the homepage close CTA use `https://demo.chartstead.com/demo`.
- [x] The second CTA uses the Website 03 example-event URL on a ChartStead domain.
- [x] No shipped marketing page still links a `mayberrydt.workers.dev` demo or site URL as the visitor destination.
- [x] External-link attributes, notes, and Open Graph URLs match the first-party domains.
- [x] A Tailscale or production preview plus a CTA link checklist are recorded before `in-review`.

## Comments

- 2026-08-16 — Current repo `site.url` is still `https://chartstead-web.mayberrydt.workers.dev` and `site.demoUrl` is `https://chartstead-demo.mayberrydt.workers.dev/demo`. Live marketing host is already `https://chartstead.com`.
- 2026-08-16 — Tyler correction: Website 06 is already done. This ticket no longer waits on putting the marketing site on a domain. Remaining blockers are Competition 60 (demo hostname) and Website 03 (example event).
- 2026-08-16 — Tyler locked the demo host to `https://demo.chartstead.com`. Production stays on workers.dev.

- 2026-08-17 — frontier-reconcile: Still blocked on: Website 03 (ready-for-agent).
- 2026-08-17 — Competition 60 is done (`demo.chartstead.com` live). Still blocked only on Website 03 (now in-progress).
- 2026-08-17 — Website 03 moved to in-review. Still blocked until Website 03 is done (Competition 60 already done).

- 2026-08-17 — Unblocked and shipped. Competition 60 done; Website 03 already lands second CTA on `/live-program` + demo.chartstead.com embeds. Pointed `site.url` / `site.demoUrl` / Astro `site` at first-party hosts; primary CTA is now `https://demo.chartstead.com/demo`. Preview: `https://chartstead.com/`.

- 2026-08-17 — Tyler QA: looks great. Marked done. Live checklist: Try the demo → `https://demo.chartstead.com/demo`; See a live program → `/live-program`; canonical/OG → `https://chartstead.com`; no `mayberrydt.workers.dev` visitor destinations on shipped pages.
