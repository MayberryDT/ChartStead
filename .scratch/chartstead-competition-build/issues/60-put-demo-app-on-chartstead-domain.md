# 60 — Put the demo app on a ChartStead domain

**Status:** done

**Blocked by:** None — can start as soon as DNS for `demo.chartstead.com` is attached.

## What to build

Give the isolated demo app the first-party host `https://demo.chartstead.com`. The marketing site is already on `https://chartstead.com`; its Try the demo CTA still sends people to `https://chartstead-demo.mayberrydt.workers.dev/demo`. Update Worker `BETTER_AUTH_URL`, trusted origins, and docs to match.

Leave production on `https://chartstead.mayberrydt.workers.dev`. Tyler will keep that host as-is; the public demo is a new ChartStead-domain deployment, not a rename of production.

## Acceptance criteria

- [x] `https://demo.chartstead.com` is attached to the `chartstead-demo` Worker and serves `/demo` over HTTPS.
- [x] Demo `BETTER_AUTH_URL` and trusted origins are `https://demo.chartstead.com`.
- [x] Production stays on `https://chartstead.mayberrydt.workers.dev` and still has no demo-admin bypass.
- [x] Walkthrough, README, and website config consumers can be pointed at `https://demo.chartstead.com/demo` (Website 04 owns the marketing CTA swap).
- [x] The live demo URL `https://demo.chartstead.com/demo` is recorded here before `in-review`.

## What to test

- Live first-party demo: https://demo.chartstead.com/demo — HTTPS, demo-admin / no-login, organizer / reviewer / speaker personas, CFP and program still load.
- Legacy host 308: `https://chartstead-demo.mayberrydt.workers.dev/demo` and a path+query such as `/demo?persona=organizer` must land on the same path on `https://demo.chartstead.com`.
- Production unchanged: `https://chartstead.mayberrydt.workers.dev/api/events` stays 401 (no demo-admin bypass).
- Local QA: http://100.105.117.93:5160/demo
- Marketing CTA swap is **Website 04**, not this ticket.

## Comments

- 2026-08-17 — Tyler QA: domain cutover is correct. Status → done. Merged `ticket-60-demo-domain` to `main`. Live: https://demo.chartstead.com/demo. Walkthrough follow-ups filed as Competition 63–67.
- 2026-08-16 — Tyler: the linked demo needs a real ChartStead-domain URL. Current demo auth URL is `https://chartstead-demo.mayberrydt.workers.dev`.
- 2026-08-16 — Tyler correction: marketing site is already on `https://chartstead.com`. This ticket is app/demo only. Website 06 closed as done.
- 2026-08-16 — Tyler locked hostname to `demo.chartstead.com`. Production stays on workers.dev; the public demo is a new ChartStead-domain deployment.
- 2026-08-16 — Claimed. Stopping before deploy: `demo.chartstead.com` does not resolve (no A/CNAME). Live demo is still `https://chartstead-demo.mayberrydt.workers.dev/demo`. Wrangler is logged in (`mayberrydt@gmail.com`, workers/routes write, zone read). Need Tyler on DNS attach, whether workers.dev stays as a fallback, and whether to cut over the current demo now vs wait for Competition 61. Frontier: no blocked non-human-tandem ticket has all blockers `done` (Website 04 still waits on this ticket plus Website 03; Website 01/02/03/05 wait on Competition 61 and other open work).
- 2026-08-16 — Tyler answers: attach DNS myself; 308 the workers.dev host; cut over the current Pacific Open Data Summit demo now (do not wait for Competition 61); leave demo-admin / no-login as-is and do not add a Google redirect URI; hostname is only `demo.chartstead.com` (no `www.demo`).
- 2026-08-16 — in-review. Worktree `.worktrees/ticket-60-demo-domain`, branch `ticket-60-demo-domain`. Attached `demo.chartstead.com` to `chartstead-demo` (custom domain + zone `chartstead.com` on this account). Demo `BETTER_AUTH_URL` is `https://demo.chartstead.com` (trusted origins follow that var). Demo env now runs the Worker first so HTML paths redirect too. Live: `https://demo.chartstead.com/demo` 200; `https://chartstead-demo.mayberrydt.workers.dev/demo` GET 308 → first-party host; production `https://chartstead.mayberrydt.workers.dev/api/events` still 401. Local QA: `http://100.105.117.93:5160/demo`. Website 04 still owns the marketing CTA swap. Frontier: no blocked non-human-tandem ticket has all blockers `done` (Website 04 still waits on this ticket plus Website 03; Website 01/02/03/05 wait on Competition 61 and other open work).
