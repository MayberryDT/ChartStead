# 68 — Put the production app on a ChartStead domain

**Status:** done

**Blocked by:** None — Tyler named the host.

## What to build

Give the production app the first-party host `https://app.chartstead.com`. Competition 60 put the isolated demo on `https://demo.chartstead.com` and left production on `https://chartstead.mayberrydt.workers.dev`. That lock is no longer acceptable. This ticket owns the production hostname, DNS, Worker custom domain, `BETTER_AUTH_URL`, trusted origins, Google origin/redirect, and the workers.dev 308.

Competition 58 stays login (Google, Resend, membership) on whatever production host exists. Do not invent another name. Hostname is only `app.chartstead.com` (no `www.app`, no `auth.chartstead.com`). Marketing stays `https://chartstead.com`. Demo stays `https://demo.chartstead.com`.

## Acceptance criteria

- [x] `https://app.chartstead.com` is attached to the production `chartstead` Worker and serves the app over HTTPS.
- [x] Production `BETTER_AUTH_URL` and trusted origins include `https://app.chartstead.com`.
- [x] Google Console origins/redirects for production use `https://app.chartstead.com` (plus localhost for local smoke). Do not add Tailscale IPs.
- [x] `https://chartstead.mayberrydt.workers.dev` permanently redirects (308) to the same path on `https://app.chartstead.com`.
- [x] Demo (`https://demo.chartstead.com`) and marketing (`https://chartstead.com`) stay unchanged. Production still has no demo-admin bypass.
- [x] Walkthrough, README, and submission docs name `https://app.chartstead.com` as the production app URL.
- [x] The live production URL is recorded here before `in-review`.

## What to test

- Live first-party production: https://app.chartstead.com/ — HTTPS, sign-in surface, `/api/events` stays 401 until a session exists.
- Legacy host 308: `https://chartstead.mayberrydt.workers.dev/` and a path+query such as `/api/health` must land on the same path on `https://app.chartstead.com`.
- Demo unchanged: https://demo.chartstead.com/demo
- Marketing unchanged: https://chartstead.com/
- Local production entrypoint remains `http://100.105.117.93:5858/` (Competition 58). Google local smoke stays `http://localhost:5858/`.

## Comments

- 2026-08-17 — Tyler: login works on this host; asked why still in-review. Host QA passed. Not merged and not committed. Live `https://app.chartstead.com` stays the production app.
- 2026-08-17 — Tyler confirmed live login. Follow-up on this host: account dropdown + HTML magic-link email. 68 still in-review for host QA.
- 2026-08-17 — Production login Worker now lives on this host. Deployed version `d5101589-b00a-464e-b669-b1fdf736de7f` from `.worktrees/competition-68-production-domain`. Live `https://app.chartstead.com/api/auth-status` is configured/google/magicLink all true. Ticket 58 still owns the human Google + magic-link click. 68 stays in-review pending Tyler QA of the host.
- 2026-08-17 — Google Console updated on existing client **ChartStead production login**: origin `https://app.chartstead.com`, redirect `https://app.chartstead.com/api/auth/callback/google`. Prior localhost and workers.dev entries left intact. No Tailscale IPs. No smoke, Cloudflare secrets, deploy, source change, or commit. Ticket stays in-review pending Tyler QA.
- 2026-08-17 — in-review. Worktree `.worktrees/competition-68-production-domain`, branch `competition-68-production-domain`. Attached `app.chartstead.com` to production Worker `chartstead` (custom domain + zone `chartstead.com`). Production `BETTER_AUTH_URL` is `https://app.chartstead.com`. Live: `https://app.chartstead.com/` 200 HTML; `/api/health` 200 `{"status":"ok"}`; `/api/events` 401 `{"error":"Unauthorized"}`. Legacy `https://chartstead.mayberrydt.workers.dev/` and `/api/health` 308 to the same path on `app.chartstead.com`. Demo `https://demo.chartstead.com/demo` 200. Marketing `https://chartstead.com/` 200. No `www.app`. Focused worker tests 4/4. Deployed version `820afeed-464e-492d-92ee-2a31ded6d659`. Google Console client still not created — Competition 58 browser-use agent should add localhost + `https://app.chartstead.com` only. No `wrangler secret put`. Do not merge until Tyler QA.
- 2026-08-17 — Tyler: file this ticket, claim it, make `app.chartstead.com`, and wire production login to that host. Hostname is `app.chartstead.com` (spelling on the existing `chartstead.com` zone; not `chartsted`). No `www.app`. Worktree `.worktrees/competition-68-production-domain`.
