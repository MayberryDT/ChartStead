# 06 — Put the marketing site on a ChartStead domain

**Status:** done

**Blocked by:** None

## What to build

Move `chartstead-web` off `chartstead-web.mayberrydt.workers.dev` onto a first-party ChartStead domain (likely `chartstead.com` or `www.chartstead.com`). Preview can stay on workers.dev; visitor-facing URLs cannot.

## Acceptance criteria

- [x] Custom domain is attached to the Cloudflare Worker and serves the current site over HTTPS.
- [x] `site.url`, canonical tags, sitemap, and social URLs use the ChartStead domain.
- [x] HTTP→HTTPS and apex/www redirect behavior is deliberate and documented.
- [x] The workers.dev URL is no longer the public marketing address.
- [x] The live URL is recorded on this ticket before `in-review`.

## Comments

- 2026-08-16 — README already says custom domain and production launch are separate launch work. Tyler owns DNS.
- 2026-08-16 — Tyler correction: the marketing site is already on a ChartStead domain. Live: `https://chartstead.com/` and `https://www.chartstead.com/`. This ticket was filed from stale repo config (`site.url` still `https://chartstead-web.mayberrydt.workers.dev`). Domain work is done. Leftover repo/canonical string updates fold into Website 04. The remaining domain ticket is Competition 60 (demo/app).
