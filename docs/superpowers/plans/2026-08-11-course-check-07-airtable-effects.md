# Course Check 07 Airtable Consequence Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consequence-aware Airtable previews, durable per-write execution, safe recovery, inbound-change classification, and compensation without allowing Airtable availability to block ChartStead's internal event workflow.

**Architecture:** Relevant Course Check planners freeze mapped Airtable effects beside their internal evidence and expose `Write to Airtable` as an independent stage. Applying the internal stage commits internal records, immutable effect intents, stable identities, and audit history in one Durable Object transaction; a later HTTP command performs provider I/O and records each result independently. Pull remains immediate only for ordinary mapped changes, while changes that could affect finalized or public state are rejected from automatic application and audited for review.

**Tech Stack:** TypeScript, Hono, Cloudflare Durable Objects with SQLite, Vitest Workers pool, React, TanStack Query/Router, Airtable Web API.

## Global Constraints

- ChartStead Durable Object SQLite remains the operational primary; Airtable is an optional mirror.
- Internal decision, draft, and publication work must commit without Airtable configuration or availability.
- Airtable access tokens remain server-only and never appear in Course Check payloads or reviewer projections.
- Every external effect has a stable id and one of: `pending`, `attempting`, `succeeded`, `retryable_failure`, `permanent_failure`, `unknown`, or `compensated`.
- `unknown` effects cannot be retried until reconciliation proves whether the provider record exists.
- Tests exercise real EventStore and Hono behavior; only the external Airtable boundary is replaced by a deterministic in-memory client.

---

### Task 1: Freeze exact Airtable evidence into relevant plans

**Files:**
- Modify: `shared/airtable.ts`
- Modify: `shared/course-check.ts`
- Modify: `shared/airtable-field-map.ts`
- Create: `worker/course-check/airtable-effects.ts`
- Modify: `worker/course-check/decision-planner.ts`
- Modify: `worker/course-check/communication-planner.ts`
- Modify: `worker/course-check/publication-planner.ts`
- Test: `test/worker/course-check-airtable.test.ts`

**Interfaces:**
- Produces: `AirtableEffect`, `AirtableEffectState`, `AirtableStageDisposition`, and `CourseCheckAirtableEvidence` in `shared/airtable.ts`.
- Produces: `buildCourseCheckAirtableEvidence({ planId, resources, recordLinks, configured })` in `worker/course-check/airtable-effects.ts`.
- Consumes: `CHARTSTEAD_AIRTABLE_TEMPLATE` and stable planned ChartStead ids already frozen by decision/publication planners.

- [ ] **Step 1: Write failing plan-evidence tests**

```ts
it("freezes exact mapped Airtable creates and updates before integration approval", async () => {
  const plan = await createAcceptedDecision();
  expect(plan.body.airtable.effects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "speaker",
        operation: "create",
        state: "pending",
        fields: expect.objectContaining({
          "ChartStead Speaker ID": expect.any(String),
          Name: expect.any(String),
          Email: expect.any(String),
        }),
      }),
      expect.objectContaining({ kind: "session", operation: "create" }),
    ]),
  );
  expect(plan.body.stages).toContainEqual(
    expect.objectContaining({ id: "write-airtable", verb: "Write to Airtable" }),
  );
});

it("shows an exact empty Airtable scope on communication plans", async () => {
  const plan = await createCommunicationFromAppliedDecision();
  expect(plan.body.airtable.effects).toEqual([]);
  expect(plan.body.airtable.summary).toBe("No mapped Airtable writes in this plan.");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "freezes exact mapped|exact empty"`

Expected: FAIL because Course Check bodies do not expose `airtable` evidence or the `write-airtable` stage.

- [ ] **Step 3: Add the frozen effect contract and mapping helper**

```ts
export type AirtableEffectState =
  | "pending"
  | "attempting"
  | "succeeded"
  | "retryable_failure"
  | "permanent_failure"
  | "unknown"
  | "compensated";

export interface AirtableEffect {
  id: string;
  planId: string;
  planVersion: number;
  kind: AirtableResourceKind;
  chartsteadId: string;
  tableName: string;
  operation: "create" | "update";
  fields: Record<string, unknown>;
  beforeFields: Record<string, unknown> | null;
  providerRecordId: string | null;
  state: AirtableEffectState;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  compensatesEffectId: string | null;
}
```

Build effect ids from the immutable tuple `planId:planVersion:kind:chartsteadId`; include the template's stable ChartStead id column in every `fields` payload. Add `airtable: CourseCheckAirtableEvidence` to decision, guaranteed-speaker, communication, and publication bodies and include it in every digest payload. Existing stored plans normalize to an empty, removed Airtable stage so old plans remain readable.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "freezes exact mapped|exact empty"`

Expected: PASS.

- [ ] **Step 5: Commit the frozen evidence model**

```bash
git add shared/airtable.ts shared/course-check.ts shared/airtable-field-map.ts worker/course-check test/worker/course-check-airtable.test.ts
git commit -m "feat: freeze Airtable effects in Course Check plans"
```

### Task 2: Commit effect intents atomically with internal work

**Files:**
- Modify: `worker/event-store.ts`
- Modify: `worker/course-check/airtable-effects.ts`
- Test: `test/worker/course-check-airtable.test.ts`

**Interfaces:**
- Produces: `EventStore.listAirtableEffects(planId)` and `EventStore.setAirtableStageDisposition(...)`.
- Produces: SQL tables `airtable_effects` and `airtable_effect_events`.
- Consumes: frozen `plan.body.airtable.effects` from Task 1.

- [ ] **Step 1: Write failing atomicity and stage-disposition tests**

```ts
it("commits internal state, stable Airtable intents, and audit history atomically", async () => {
  const plan = await createAcceptedDecision();
  const applied = await applyStage(plan, "apply-decision");
  const effects = await env.EVENT_STORE.getByName(eventId).listAirtableEffects(plan.id);
  expect(applied.state).toBe("Complete");
  expect(effects.every((effect) => effect.state === "pending")).toBe(true);
  expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
  expect(await auditTypes()).toContain("course_check.airtable.intent_recorded");
});

it.each(["deferred", "removed"] as const)(
  "keeps completed internal work when the Airtable stage is %s",
  async (disposition) => {
    const applied = await createAndApplyDecision();
    const next = await setAirtableDisposition(applied, disposition);
    expect(next.body.airtable.disposition).toBe(disposition);
    expect(await acceptedProposal()).toBeTruthy();
  },
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "commits internal state|keeps completed internal work"`

Expected: FAIL because effect rows and disposition commands do not exist.

- [ ] **Step 3: Add durable effect tables and transactional staging**

Create `airtable_effects` with immutable identity/payload columns plus mutable execution columns. Create append-only `airtable_effect_events` for intent, attempt, result, reconciliation, deferral, removal, and compensation transitions. During decision, guaranteed-speaker, publication, or communication-draft internal apply, insert every frozen intent and its audit event inside the same `transactionSync` callback as the internal records and Course Check receipt. Mark the internal stage and top-level internal action complete while leaving `write-airtable` ready; the separate stage and per-effect states carry unresolved external work without making the applied internal action stale.

- [ ] **Step 4: Add defer/remove mutation behavior**

`setAirtableStageDisposition` must require current `planVersion` and `digest`, refuse a stage already executing, append a plan mutation, retain effect rows for audit, and never revert internal records. `removed` makes pending rows non-executable; `deferred` keeps them resumable.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "commits internal state|keeps completed internal work"`

Expected: PASS.

- [ ] **Step 6: Commit durable intent staging**

```bash
git add worker/event-store.ts worker/course-check/airtable-effects.ts test/worker/course-check-airtable.test.ts
git commit -m "feat: persist Airtable effect intents atomically"
```

### Task 3: Execute, retry, and reconcile Airtable writes independently

**Files:**
- Modify: `worker/airtable/client.ts`
- Create: `worker/airtable/effects.ts`
- Modify: `worker/app.ts`
- Modify: `shared/airtable.ts`
- Test: `test/worker/course-check-airtable.test.ts`

**Interfaces:**
- Produces: `AirtableClient.upsertRecord(input): Promise<AirtableWriteResult>`.
- Produces: `executeAirtableEffectsForPlan(...)` and `reconcileUnknownAirtableEffects(...)`.
- Produces: `POST /api/events/:eventId/course-checks/:planId/airtable/execute` and `/airtable/reconcile`.
- Consumes: `EventStore.beginAirtableEffectAttempt`, `recordAirtableEffectResult`, and `listAirtableEffects`.

- [ ] **Step 1: Write failing execution-state tests**

```ts
it("preserves successful writes while rate-limited writes retry independently", async () => {
  const { plan, client } = await appliedPlanWithScriptedAirtable([
    { result: "success", recordId: "rec_speaker" },
    { error: new AirtableClientError("slow down", "rate_limited", 429) },
  ]);
  const first = await executeAirtable(plan);
  expect(first.effects.map((effect) => effect.state)).toContain("succeeded");
  expect(first.effects.map((effect) => effect.state)).toContain("retryable_failure");
  await executeAirtable(plan);
  expect(client.calls.filter((call) => call.effectId === first.effects[0]!.id)).toHaveLength(1);
});

it("requires reconciliation before retrying an unknown write outcome", async () => {
  const plan = await appliedPlanWithUnknownWrite();
  expect((await executeAirtable(plan)).effects[0]!.state).toBe("unknown");
  expect((await executeAirtable(plan)).effects[0]!.attemptCount).toBe(1);
  expect((await reconcileAirtable(plan)).effects[0]!.state).toBe("succeeded");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "preserves successful writes|requires reconciliation"`

Expected: FAIL because the client has read-only methods and no effect executor.

- [ ] **Step 3: Implement idempotent provider writes**

Use Airtable's `PATCH /v0/{baseId}/{table}` update-records endpoint with `performUpsert.fieldsToMergeOn` set to the template's stable ChartStead id field. If a provider record id is already linked, patch that exact record. Parse the returned record id and persist it in `airtable_record_links`. The memory client must record calls and support scripted success, rate-limit, authorization, unavailable, and unknown-after-send outcomes.

- [ ] **Step 4: Implement per-effect execution and classification**

Claim only `pending` and due `retryable_failure` rows. Persist `attempting` before I/O. Map rate limits and temporary availability failures to `retryable_failure` with bounded backoff; map authorization/invalid-payload failures to `permanent_failure`; map ambiguous transport failure after request dispatch to `unknown`. Never include `succeeded`, `permanent_failure`, `unknown`, or `compensated` rows in blind retry.

- [ ] **Step 5: Implement unknown reconciliation**

List the affected mapped table, locate the unique record by the stable ChartStead id field, and mark the effect `succeeded` with its provider record id when found. If no record exists, transition to `retryable_failure`; if multiple records exist, retain `unknown` and return operator guidance.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "preserves successful writes|requires reconciliation"`

Expected: PASS.

- [ ] **Step 7: Commit the external executor**

```bash
git add worker/airtable worker/app.ts shared/airtable.ts test/worker/course-check-airtable.test.ts
git commit -m "feat: execute and recover Airtable effects"
```

### Task 4: Classify inbound pulls and retain audit history

**Files:**
- Modify: `shared/airtable.ts`
- Modify: `worker/airtable/sync.ts`
- Modify: `worker/event-store.ts`
- Test: `test/worker/course-check-airtable.test.ts`
- Test: `test/worker/airtable-and-api-v1.test.ts`

**Interfaces:**
- Produces: `AirtablePullClassification = "ordinary" | "requires_course_check" | "rejected"`.
- Produces: `EventStore.applyAirtablePullChanges` response with `applied`, `rejected`, and reasons.
- Consumes: current proposal outcomes, the current public revision, mapped field bindings, and existing Airtable pull precedence.

- [ ] **Step 1: Write failing pull-classification tests**

```ts
it("applies ordinary mapped inbound fields immediately with audit history", async () => {
  const result = await pullOrdinarySubmissionTitle();
  expect(result.changes).toHaveLength(1);
  expect(result.rejectedChanges).toEqual([]);
  expect(await auditTypes()).toContain("airtable.pull.applied");
});

it("rejects inbound mappings that would alter finalized or public state", async () => {
  const result = await pullPublishedSessionTimeAndAcceptedSubmissionIdentity();
  expect(result.changes).toEqual([]);
  expect(result.rejectedChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringMatching(/public|final/i) }),
    ]),
  );
  expect(await auditTypes()).toContain("airtable.pull.review_required");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts test/worker/airtable-and-api-v1.test.ts -t "ordinary mapped|finalized or public"`

Expected: FAIL because pulls currently apply every mapped field and write no audit record.

- [ ] **Step 3: Implement classification at the EventStore boundary**

Apply mapped fields immediately when their local record is not final/public. Reject automatic updates to accepted/declined submissions, speaker identity used by accepted participation, or sessions present in the current public revision. Continue rejecting unmapped local-only outcome, communication, and Course Check fields by construction. Record an audit event for every applied or rejected change and return the rejected rows with a non-secret reason.

- [ ] **Step 4: Run focused pull tests and verify GREEN**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts test/worker/airtable-and-api-v1.test.ts -t "ordinary mapped|finalized or public|pulls mapped Airtable"`

Expected: PASS.

- [ ] **Step 5: Commit inbound safeguards**

```bash
git add shared/airtable.ts worker/airtable/sync.ts worker/event-store.ts test/worker/course-check-airtable.test.ts test/worker/airtable-and-api-v1.test.ts
git commit -m "feat: classify consequential Airtable pulls"
```

### Task 5: Expose stage controls, redaction, and reviewed compensation

**Files:**
- Modify: `worker/event-store.ts`
- Modify: `worker/app.ts`
- Modify: `src/api.ts`
- Modify: `src/CourseCheckPage.tsx`
- Modify: `src/styles.css`
- Test: `test/worker/course-check-airtable.test.ts`
- Test: `test/ui/app.test.tsx`

**Interfaces:**
- Produces: stage disposition API, execution/reconciliation API, and compensation-intent API.
- Produces: `EventStore.createAirtableCompensation({ originalEffectId, reason, actor, idempotencyKey })`.
- Consumes: the exact prior effect's `beforeFields`; compensation creates a new pending effect linked by `compensatesEffectId` and never mutates provider state during review.

- [ ] **Step 1: Write failing authorization, redaction, and compensation tests**

```ts
it("redacts Airtable field values for reviewers", async () => {
  const response = await reviewerGetCourseCheck(await createAcceptedDecision());
  expect(JSON.stringify(response.body.airtable.effects)).not.toContain("@example.com");
  expect(response.body.airtable.redacted).toBe(true);
});

it("creates a reviewed compensation intent linked to the succeeded effect", async () => {
  const original = await succeededAirtableEffect();
  const compensation = await createCompensation(original, "Correct mapped biography");
  expect(compensation.state).toBe("pending");
  expect(compensation.compensatesEffectId).toBe(original.id);
  expect(original.providerRecordId).toBe(compensation.providerRecordId);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts -t "redacts Airtable|reviewed compensation"`

Expected: FAIL because effect projection and compensation APIs do not exist.

- [ ] **Step 3: Add admin-only commands and reviewer projection**

Require event-admin authority for execute, reconcile, defer, remove, and compensation commands. Require plan version, digest, and an idempotency key for every mutation. Reviewer GET responses retain effect count/state/table/kind but replace field values and errors with redacted summaries.

- [ ] **Step 4: Add the Course Check Airtable panel**

Render exact table, create/update operation, stable ChartStead id, mapped fields, provider reference, attempt count, state, and guidance. Show `Write to Airtable`, `Defer`, and `Remove stage` only after the internal stage is complete. Show `Reconcile unknown` when any effect is unknown, and `Create compensation` for succeeded effects. Do not expose credentials or imply Airtable failure rolled back internal work.

- [ ] **Step 5: Run worker and UI tests and verify GREEN**

Run: `npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts && npm run test:ui`

Expected: PASS with the new panel behavior and API security assertions.

- [ ] **Step 6: Commit product controls**

```bash
git add worker/event-store.ts worker/app.ts src/api.ts src/CourseCheckPage.tsx src/styles.css test/worker/course-check-airtable.test.ts test/ui/app.test.tsx
git commit -m "feat: add Airtable recovery controls to Course Check"
```

### Task 6: Verify, reconcile the board, and prepare human QA

**Files:**
- Modify: `.scratch/chartstead-course-check/issues/07-airtable-consequence-effects.md`

**Interfaces:**
- Consumes: every acceptance item in Course Check 07.
- Produces: an `in-review` board ticket with checked acceptance boxes, demo URL, and a concise QA list.

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
npx vitest run --config vitest.worker.config.ts test/worker/course-check-airtable.test.ts test/worker/airtable-and-api-v1.test.ts
npm run typecheck
npm run build
npm test
git diff --check
```

Expected: every command exits 0; any known baseline warning is reported separately from failures.

- [ ] **Step 2: Exercise the organizer flow in the collaborative browser**

Create and apply a Decision Course Check, inspect exact Airtable effects, defer/resume or execute the separate stage, and confirm the plan continues to show internal completion if Airtable is disconnected.

- [ ] **Step 3: Update both ticket copies and reconcile both frontiers**

Set Course Check 07 to `in-review`, check every acceptance item backed by verification, append the demo URL and QA list, update the main-checkout and worktree copies, then run:

```bash
npm run issues:reconcile
npm run issues:reconcile:apply
```

- [ ] **Step 4: Start and verify a Tailscale-reachable demo**

Bind the dev server to `0.0.0.0`, confirm the listener with `ss -tlnp`, and use `http://100.105.117.93:<port>/e/pacific-open-data-summit-2026/submissions` for human QA.

- [ ] **Step 5: Commit closeout metadata**

```bash
git add .scratch/chartstead-course-check/issues/07-airtable-consequence-effects.md
git commit -m "chore: move Course Check 07 to review"
```
