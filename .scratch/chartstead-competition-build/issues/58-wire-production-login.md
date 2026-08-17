# 58 — Wire production login end to end

**Status:** done

**Blocked by:** None — can start immediately.

## What to build

Make real organizer login work on the production app. The sign-in surface already calls Better Auth Google and magic-link, but production remains credential-blocked: no host secrets, no Resend delivery, and no membership row that turns a signed-in user into an event admin. Demo-admin / `/demo` stays isolated. This ticket is the actual login path Tyler will use.

## Acceptance criteria

- [x] Production `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, Google OAuth, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` are configured in the host-local secret path (never committed) and on the production Worker. Host-local `.dev.vars` files stay identical, mode 600, `BETTER_AUTH_URL=http://localhost:5858`. Cloudflare Worker `BETTER_AUTH_URL` is `https://app.chartstead.com`. Secret names on Worker: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`.
- [x] Continue with Google creates or resumes a Better Auth session and lands in the organizer desk when the user has a membership.
- [x] Email sign-in link is delivered through Resend and completes the same session.
- [x] A signed-in user without memberships sees a truthful empty/no-access state, not a demo bypass and not a JSON 401 dump.
- [x] Tyler's production membership can open a real event; demo-admin code is absent from the production Worker.
- [x] Sign-out, expired session, failed Google, and failed/missing email config have recoverable UI.
- [x] Focused auth tests plus a live production smoke (Google and magic-link) are recorded. Tyler confirmed live Google + email sign-in on `https://app.chartstead.com/`. Focused tests: worker 9/9, UI 13/13 after account-dropdown + HTML email polish.
- [x] A Tailscale or production URL and what-to-test list are recorded.

## Comments

- 2026-08-17 — Tyler: login works; asked why still in-review. QA passed. Not merged and not committed — live Worker on `https://app.chartstead.com` has the login, account dropdown, and HTML magic-link mail. Source remains uncommitted in `.worktrees/competition-68-production-domain`.
- 2026-08-17 — Tyler: live login works. Account/sign-out is now a sidebar dropdown like the event picker; magic-link mail uses the same HTML card as proposal confirmation (button + plaintext fallback). Ticket stays in-review for the dropdown/email look. No commit.
- 2026-08-17 — Tyler: official live site cannot log in; also wire CFP and every other login button. Ported 58 login onto `.worktrees/competition-68-production-domain` and deployed production Worker `chartstead` version `d5101589-b00a-464e-b669-b1fdf736de7f`. Cloudflare secrets put (names only). Remote D1 migrations 0002–0004 applied. Live `https://app.chartstead.com/api/auth-status` is `{"configured":true,"google":true,"magicLink":true}`. `/api/auth/ok` 200. `/api/events` still 401 until a session exists. Shared `AuthMethodButtons` now drives home, CFP, My proposals, and reviewer invitation. Demo Worker unchanged (no production secrets). No commit. Live Google + email click still Tyler.
- 2026-08-17 — Google Console verified on existing **ChartStead production login** client: `https://app.chartstead.com` origin + `/api/auth/callback/google` redirect; localhost and workers.dev entries remain. Host-local Google id/secret are real in both `.dev.vars` (identical, mode 600). Local `:5858` `GET /api/auth-status` is `{"configured":true,"google":true,"magicLink":true}`. Live `https://app.chartstead.com/api/auth-status` is still 404 (58 Worker not on that deploy; no Cloudflare secrets). No smoke, `wrangler secret put`, deploy, or commit. Live Google/magic-link still wait for Tyler go-ahead.
- 2026-08-17 — Tyler named the first-party production host: `https://app.chartstead.com`. That work is Competition 68, not this ticket. This ticket stays login. Google Console production origin/redirect becomes `https://app.chartstead.com` (plus localhost for local smoke). Host-local `BETTER_AUTH_URL` stays `http://localhost:5858`.
- 2026-08-17 — Tyler: pick the Google origin. Chose localhost-only Google (option 1): no new hostname, no tunnel, no `auth.chartstead.com`, no workers.dev deploy. `BETTER_AUTH_URL` is now `http://localhost:5858` in both host-local `.dev.vars` files. Magic-link emails rewrite localhost/127.0.0.1 onto `http://100.105.117.93:5858`. Google Console origins are localhost/127.0.0.1 `:5173`+`:5858` plus `https://chartstead.mayberrydt.workers.dev` only. Browser-use agent should finish the **ChartStead production login** client and write Google id/secret only. Live smoke still waits for Tyler go-ahead.
- 2026-08-17 — Browser-use agent pause confirmed. OAuth client created: no. Both `.dev.vars` files identical, mode 600, gitignored. Presence/length/placeholder table matches: `BETTER_AUTH_URL` 21 / not a replace-with placeholder (now `http://localhost:5858`); `BETTER_AUTH_SECRET` 48 / real; Google id 35 and secret 39 / still placeholders; `RESEND_API_KEY` 36 / real; `AUTH_EMAIL_FROM` 32 / real (`animasai.co`). Live `GET /api/auth-status` is `{"configured":true,"google":false,"magicLink":true}`. No DNS, tunnel, deploy, or `wrangler secret put`.
- 2026-08-17 — Browser-use agent: Resend done on verified `animasai.co`; send-only key stored in both `.dev.vars` (mode 600); first displayed key revoked; no email sent. Google OAuth client not created — Google Console rejects `http://100.105.117.93:5173` and `:5858`. Agent proposed `https://auth.chartstead.com` tunneled to Halla `:5858`; not approved.
- 2026-08-16 — Stall recovery: worktree gitdir had been pruned; reattached `.worktrees/competition-58-production-login` on `competition-58-production-login` and restored the uncommitted login work. Restarted Tailscale production entrypoint on `:5858`. Focused tests still pass (worker 7/7, UI 6/6). No workers.dev deploy.
- 2026-08-16 — What to test:
  1. Signed-out `/` shows Google + email sign-in, not a JSON dump and not the demo desk. Official production: `https://app.chartstead.com/`. Local Google smoke: `http://localhost:5858/`. Tailscale: `http://100.105.117.93:5858/`.
  2. `GET /api/events` is `401 {"error":"Unauthorized"}` until a session exists.
  3. `GET /api/auth-status` on production is `{"configured":true,"google":true,"magicLink":true}`.
  4. Continue with Google as `tyler@animasai.co` from `https://app.chartstead.com/` should create a session and open the organizer desk on every known event.
  5. Email a magic link to `tyler@animasai.co` from `https://app.chartstead.com/`; the link host should be `app.chartstead.com` and open the same desk.
  6. A signed-in non-member should see the no-access panel and be able to Sign out back to `/`.
  7. Cancelled Google, failed Google, expired session, and missing email config should stay on a recoverable sign-in surface.
  8. `/demo` remains isolated; do not treat it as this ticket's proof.
- 2026-08-16 — Implementation in `.worktrees/competition-58-production-login` (`competition-58-production-login`). `tyler@animasai.co` auto-grants admin on every known event after sign-in. Signed-in users without memberships get HTTP 200 + no-access UI. Production Worker still has no demo-admin. Browser-agent prompt: `docs/production-login-secrets-handoff.md`. Do not deploy to workers.dev until Tyler says so.
- 2026-08-16 — Tyler: browser-use agent will set host secrets; use `tyler@animasai.co` as admin on all events; no live Google/Resend smoke yet; Tailscale local production only; Google redirect URIs confirmed; continue in `.worktrees/competition-58-production-login`.
- 2026-08-16 — Claimed. Pausing before implementation for host secrets, Tyler identity/membership, and live-smoke ownership. Code already exists for the sign-in surface; production Cloudflare secret list is empty and local Google/Resend/`AUTH_EMAIL_FROM` still look like placeholders.
- 2026-08-16 — Tyler: login is not wired for real use; demo-without-login was deliberate. Ticket 01 already noted production Google/magic-link is credential-blocked until host-local secrets and a membership row exist.
- 2026-08-16 — Code already exists: `src/App.tsx` `SignIn`, `src/auth-client.ts`, `worker/auth.ts` (`createAuth` returns null without `BETTER_AUTH_SECRET`; magic-link throws if Resend is missing).
