# 11 — Add a Login link to the marketing site

**Status:** ready-for-agent

**Blocked by:** None — production login is live on `https://app.chartstead.com` (Competition 58 + 68 done).

## Context (do not over-promise)

Production auth works today: Google and magic-link on `https://app.chartstead.com` (`GET /api/auth-status` → `configured` / `google` / `magicLink` all true). That is **not** free self-service SaaS.

- Anyone can open the sign-in screen and create a Better Auth session.
- Access is **per-event membership**. A signed-in account with no memberships gets the honest no-access panel (“Ask an event administrator…”), not an empty guest workspace.
- Creating a new event requires an existing admin membership. Bootstrap admin is only `tyler@animasai.co`.
- The public try path stays **Try the demo** → `https://demo.chartstead.com/demo` (no login).

So this ticket is a **Login / Sign in** affordance for people who already have (or will be granted) organizer access. It is not “Start free,” “Get started,” or “Sign up for an account and run your conference.” Copywriting still forbids those claims until a real free offer exists.

## What to build

Add a clear **Log in** (or **Sign in**) control on the marketing site that opens the production app sign-in surface. Keep **Try the demo** as the primary evaluation CTA. Implementation lives in `/home/halla/chartstead-web`.

## Acceptance criteria

- [ ] `site.ts` (or equivalent) exposes a first-party app URL (`https://app.chartstead.com`) and a nav login CTA (`Log in` / `Sign in` — not “Get started” / “Start free” / “Sign up”).
- [ ] Desktop header and mobile nav both show the login control and open `https://app.chartstead.com/` (or a dedicated sign-in path if one is shipped later). External-link attributes match other off-site CTAs.
- [ ] Footer includes the same destination (label can match header).
- [ ] Primary product CTA remains **Try the demo** → `https://demo.chartstead.com/demo`. Login does not replace or outrank the demo CTA.
- [ ] No marketing copy claims free self-service organizer onboarding, unlimited event creation, or that signing in alone grants desk access.
- [ ] Live `https://chartstead.com/` shows the login control on desktop and narrow widths; recorded before `in-review`.

## Comments

- 2026-08-17 — Filed after Tyler noticed chartstead.com has no path to the real app. Confirmed: app login is live; free open signup/create-your-event is not. Ticket scope is the marketing Login link only.
