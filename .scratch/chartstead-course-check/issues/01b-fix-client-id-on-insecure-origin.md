# 01b — Fix client idempotency ids on insecure origins

**What to build:** Stop Course Check UI from calling `crypto.randomUUID()` directly so Accept/Decline/Apply works on non-secure origins (Tailscale HTTP demo).

**Blocked by:** none

**Status:** done

## Notes

- Symptom: clicking **Accept via Course Check** / **Decline via Course Check** threw `crypto.randomUUID is not a function`.
- Cause: `randomUUID` is secure-context-only; demo is served over `http://100.x.x.x` Tailscale, not localhost/HTTPS.
- Fix: `src/id.ts` `createClientId()` with `randomUUID` → `getRandomValues` UUID → timestamp fallback; used by submissions inspector and Course Check apply.

## Comments

- 2026-08-11 — Found in human QA of Course Check 01 demo.
