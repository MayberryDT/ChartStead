export type AcceptanceEvidenceKind =
  | "test"
  | "kernel_invariant"
  | "real_human_validation";

export interface CourseCheckAcceptanceRow {
  id: string;
  requirement: string;
  evidence: { kind: AcceptanceEvidenceKind; reference: string };
}

const test = (reference: string) => ({ kind: "test" as const, reference });
const invariant = (reference: string) => ({
  kind: "kernel_invariant" as const,
  reference,
});

export const COURSE_CHECK_UX_ACCEPTANCE_MATRIX: CourseCheckAcceptanceRow[] = [
  { id: "TF1", requirement: "The page title names the business action, not the safety system.", evidence: test("test/ui/course-check.test.tsx — business review projection") },
  { id: "TF2", requirement: "Supporting text says whether anything has already changed.", evidence: test("test/worker/course-check-review-projection.test.ts — pre/post commit boundary") },
  { id: "TF3", requirement: "Course Check appears only as secondary explanatory language.", evidence: test("test/ui/course-check.test.tsx — internal machinery absent from ordinary copy") },
  { id: "FP1", requirement: "A clean batch does not open empty issue pages.", evidence: test("test/e2e/course-check-walkthrough.spec.ts — clean fast path has zero details") },
  { id: "FP2", requirement: "The clean batch can be reviewed and confirmed in one surface.", evidence: test("test/ui/course-check.test.tsx — compact clean decision review") },
  { id: "FP3", requirement: "The final button names counts and effects.", evidence: test("test/ui/course-check.test.tsx — exact accepted/declined/session/speaker/task action") },
  { id: "I1", requirement: "Issues are classified as Needs action, Check, Details, or Could not check.", evidence: test("test/worker/course-check-review-projection.test.ts — four exception classes") },
  { id: "I2", requirement: "Each issue names the affected submission, speaker, recipient group, or message.", evidence: test("test/ui/decision-exception-review.test.tsx — affected objects remain visible") },
  { id: "I3", requirement: "Each issue explains the consequence in plain English.", evidence: test("test/ui/decision-exception-review.test.tsx — consequence and scope copy") },
  { id: "I4", requirement: "Each issue provides an inline fix, exact deep link, safe alternative, or exclusion action.", evidence: test("test/ui/course-check.test.tsx — only declared issue actions execute") },
  { id: "I5", requirement: "No generic Fix issues action remains.", evidence: test("test/ui/course-check.test.tsx — generic fix/resolve/manage controls absent") },
  { id: "I6", requirement: "Repeated issues can be grouped and resolved in bulk when the effect is identical.", evidence: test("test/worker/course-check-issue-actions.test.ts — shared dependency targets every affected item") },
  { id: "N1", requirement: "Fixing an issue returns to the same review.", evidence: test("test/e2e/course-check-walkthrough.spec.ts — deep repair returns to plan") },
  { id: "N2", requirement: "Selection, filters, scroll position, and expanded issue are preserved.", evidence: test("test/ui/course-check-return-context.test.ts — complete return context round trip") },
  { id: "N3", requirement: "Only affected checks rerun after a fix.", evidence: invariant("worker/course-check/issue-actions.ts — affected_dependencies revalidation scope") },
  { id: "N4", requirement: "Stale data invalidates affected rows, not the entire batch.", evidence: test("test/worker/course-check-batch.test.ts — dependent stage-only invalidation") },
  { id: "P1", requirement: "Valid items can proceed when other items are ineligible.", evidence: test("test/e2e/course-check-walkthrough.spec.ts — safe partial decision execution") },
  { id: "P2", requirement: "The user sees exact ready, blocked, warned, and skipped counts.", evidence: test("test/ui/decision-exception-review.test.tsx — exact review and result counts") },
  { id: "P3", requirement: "Skip language states what remains unchanged.", evidence: test("test/ui/decision-exception-review.test.tsx — leave unchanged action language") },
  { id: "P4", requirement: "Final results identify every unprocessed item.", evidence: test("test/worker/course-check-review-projection.test.ts — skipped and unchanged receipt") },
  { id: "M1", requirement: "Decision and message issues appear on the same review surface.", evidence: test("test/ui/course-check.test.tsx — connected communication exceptions") },
  { id: "M2", requirement: "Missing message data can block drafts without automatically blocking decisions.", evidence: test("test/worker/course-check-communication.test.ts — mixed draft eligibility") },
  { id: "M3", requirement: "Draft creation and sending are separate states.", evidence: invariant("worker/course-check/communication-delivery.ts — distinct draft and send commits") },
  { id: "M4", requirement: "Course Check never implies a draft was sent.", evidence: test("test/ui/communication-result.test.tsx — durable draft result says no send") },
  { id: "M5", requirement: "The result explicitly says No emails were sent.", evidence: test("test/e2e/course-check-walkthrough.spec.ts — draft result no-send statement") },
  { id: "M6", requirement: "Outbox review is a follow-up action rather than a hidden mandatory completion stage.", evidence: test("test/ui/messages-outbox.test.tsx — exact explicit Outbox handoff") },
  { id: "C1", requirement: "Planned effects never use applied or success styling.", evidence: test("test/ui/external-effect-review.test.tsx — planned consequences stay pending") },
  { id: "C2", requirement: "Completion reports decisions, records, drafts, skipped items, and sends separately.", evidence: test("test/ui/decision-exception-review.test.tsx — persistent separated result groups") },
  { id: "C3", requirement: "A persistent result is available in addition to any toast.", evidence: test("test/ui/course-check.test.tsx — result survives plan reload") },
  { id: "C4", requirement: "Audit and technical details remain available without dominating the normal interface.", evidence: test("test/ui/course-check.test.tsx — collapsed permission-gated technical details") },
  { id: "A1", requirement: "Severity is communicated with text and icon, not color alone.", evidence: test("test/ui/decision-exception-review.test.tsx — visible class text and hidden icon") },
  { id: "A2", requirement: "Issue links move focus to the corresponding field or record.", evidence: test("test/e2e/course-check-walkthrough.spec.ts — deep repair opens the affected source record") },
  { id: "A3", requirement: "Keyboard focus returns correctly after inline and deep fixes.", evidence: test("test/ui/course-check.test.tsx — inline result focus; browser deep-repair return focus") },
  { id: "A4", requirement: "Buttons use verbs and specific objects.", evidence: test("test/ui/course-check.test.tsx — exact commit and issue-action labels") },
  { id: "A5", requirement: "Internal jargon is hidden from normal users.", evidence: test("test/worker/course-check-review-projection.test.ts — ordinary copy jargon exclusion") },
  { id: "A6", requirement: "Dense tables support scanning without making primary decisions depend on a developer-style report.", evidence: test("test/e2e/accessibility.spec.ts — dense responsive review") },
];

const human = (reference: string) => ({
  kind: "real_human_validation" as const,
  reference: `${reference} This is not automated evidence.`,
});

export const COURSE_CHECK_HUMAN_VALIDATION_MATRIX: CourseCheckAcceptanceRow[] = [
  { id: "H1", requirement: "Recruit 5–6 representative administrators, including a newcomer and a lower-confidence user.", evidence: human("Future moderated participant session.") },
  { id: "H2", requirement: "At least 5 of 6 participants explain final effects without prompting and nobody believes drafts were sent.", evidence: human("Future comprehension observation.") },
  { id: "H3", requirement: "At least 5 of 6 participants complete the clean batch without assistance.", evidence: human("Future moderated clean-batch task.") },
  { id: "H4", requirement: "Every issue is repaired, acknowledged, or excluded within two human-observed context changes and clean median is under 30 seconds.", evidence: human("Future observed timing; telemetry is only a proxy.") },
  { id: "H5", requirement: "At least 4 of 6 participants prefer the consolidated review to the prior sequential flow.", evidence: human("Future comparative participant interview.") },
  { id: "H6", requirement: "Apply the report kill conditions if participants overlook effects, confuse drafts and sends, prefer focused previews, or slow down.", evidence: human("Future kill-condition review.") },
];
