# Course Check killer walkthrough

Judge- and staff-facing path proving Course Check is more than a confirmation modal. Uses the **Course Check Demo** track on Pacific Open Data Summit 2026.

**Demo host (Tailscale):** `http://100.105.117.93:5191`  
**Event:** `pacific-open-data-summit-2026`  
**Run with:** `CLOUDFLARE_ENV=demo` and bind `--host 0.0.0.0`.

Reserved seed ids live in `worker/seed-course-check-demo.ts` (`SUB-PODS0048`–`SUB-PODS0057`).

## What to open first

1. Submissions:  
   `http://100.105.117.93:5191/e/pacific-open-data-summit-2026/submissions`
2. Filter or search track **Course Check Demo**.
3. You should see named fixtures (co-facilitators, missing email, prior notice, double-book pair, unplaced lightning, delivery matrix).

## Walkthrough (organizer UI)

### A — Batch decisions (internal only)

1. Multi-select several Course Check Demo proposals (include at least one accept with co-speakers and one decline).
2. Open **Course Check** for final accepted/declined outcomes.
3. Confirm the workspace is a **full page**, not a modal: evidence sections, stages, plan state badge, shared activity.
4. Read irreversible effects and people first; collapsed clean sections are OK.
5. Click **Apply decisions**.
6. Confirm: speakers/sessions/tasks appear for accepts; **no email was sent**; Airtable is planned or deferred separately.

### B — Linked communication

1. From the completed decision, open the linked **Communication Course Check** (or create from selection).
2. Confirm recipient groups, co-speakers, inclusion reasons, exclusions, missing addresses, and prior related sends (Sam Okonkwo).
3. Edit subject/body if needed → new plan version; draft approval clears.
4. Click **Create drafts** — payloads freeze; still no provider send.
5. Click **Send messages** only when ready to leave the machine (or skip and use the automated delivery suite).

### C — Out of date

1. Open a Decision Course Check on `SUB-PODS0050` (missing address) without applying.
2. Change ordinary review disposition on that proposal in Submissions.
3. Return to the plan: state is **Out of date**.
4. Attempt apply: error names the changed inputs and recovery guidance.

### D — Private conflict + publication

1. Agenda: place `SUB-PODS0053` and `SUB-PODS0054` in Harbor Hall at the same time.
2. Confirm the second placement **saves** with a visible conflict (not blocked).
3. Leave `SUB-PODS0055` unplaced.
4. Place `SUB-PODS0056` cleanly in Compass Room.
5. **Publish program** → Program Publication Course Check.
6. Confirm valid public subset, conflict warning, calendar consequences; unplaced stays out by default.
7. Override material conflict only with a short reason, then publish if desired.

### E — Recovery story (API or UI)

Use mock providers in automated tests, or real Resend only in a controlled environment:

1. One address succeeds.
2. One transient failure retries with the same effect identity.
3. One unknown outcome requires **reconcile** before another attempt (no blind duplicate).
4. **Create a reviewed correction** on a succeeded send — original stays on record; correction is a new Course Check.

### F — Airtable degradation

1. With Airtable unconfigured (default demo), apply decisions still succeed.
2. Settings → Airtable shows precise pending/failed/unconfigured state.
3. Internal program and public release remain usable.

### G — Scoped agent (same contract)

1. Settings → mint an agent API key with Course Check scopes + delegated execution.
2. Paste into `docs/course-check-agent-handoff-brief.md` placeholders.
3. Agent creates/inspects/applies a Decision Course Check via `/api/v1/...`.
4. Human opens the same plan URL and confirms agent attribution.

## Automated acceptance

```bash
npm run test:worker -- test/worker/course-check-killer-demo.test.ts
```

The suite walks seed presence, internal apply without send, linked communication evidence, delivery success/retry/unknown/reconcile/correction, out-of-date `changedInputs`, private conflict + publication findings, Airtable degradation, agent v1 parity, and audit redaction.

## Copy rules (spot-check)

- Product name: **Course Check**
- Stage verbs: Apply decisions, Create drafts, Send messages, Publish program, Write to Airtable
- No UI copy: manifest, effect graph, planner, control plane, kernel, effect ledger

## Provider boundary

Planning and **Apply decisions** never call email, calendar, or Airtable networks. Network I/O starts only on explicit external stages (send, calendar delivery, Airtable execute) after approval.
