import type {
  CommunicationPlanBody,
  CourseCheckPlan,
} from "../../shared/course-check";
import type {
  CommunicationDeliveryResult,
  CommunicationProgressStep,
  CommunicationReviewProjection,
  CommunicationVisibleStatus,
} from "../../shared/course-check-communication-results";

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function sourceLabel(body: CommunicationPlanBody): string {
  if (body.source.kind === "linked_decision") return "Prepared from applied decisions";
  if (body.source.kind === "publication") return "Prepared from the attendee program";
  if (body.source.kind === "compensation") return "Prepared as a reviewed correction";
  return "Prepared from an organizer selection";
}

function reconciliationCount(plan: CourseCheckPlan): number {
  return (plan.mutations ?? []).filter((mutation) => mutation.kind === "reconcile").length;
}

function correctionCount(plan: CourseCheckPlan): number {
  const mutations = (plan.mutations ?? []).filter(
    (mutation) => mutation.kind === "compensate",
  ).length;
  const linkedCorrection =
    plan.body.actionType === "communication" && plan.body.compensation ? 1 : 0;
  return Math.max(mutations, linkedCorrection);
}

function isBounce(error: string | null): boolean {
  return Boolean(error && /bounce|mailbox rejected|recipient rejected/i.test(error));
}

function currentStatus(
  plan: CourseCheckPlan,
  body: CommunicationPlanBody,
): CommunicationVisibleStatus {
  if (body.effects.length > 0) {
    const active =
      body.deliverySummary.queued +
      body.deliverySummary.sending +
      body.deliverySummary.retryScheduled;
    if (active > 0) return { key: "sending", label: "Sending" };
    if (body.deliverySummary.unknown > 0) return { key: "failed", label: "Failed" };
    if (body.deliverySummary.failed > 0) {
      return body.effects.some((effect) => isBounce(effect.lastError))
        ? { key: "bounced", label: "Bounced" }
        : { key: "failed", label: "Failed" };
    }
    if (body.deliverySummary.succeeded === body.deliverySummary.total) {
      return reconciliationCount(plan) >= body.deliverySummary.total
        ? { key: "delivered", label: "Delivered" }
        : { key: "sent", label: "Sent" };
    }
  }
  if (body.drafts.length === 0) return { key: "no_draft", label: "No draft" };
  if (body.effects.length === 0) return { key: "ready_to_send", label: "Ready to send" };
  return { key: "draft_prepared", label: "Draft prepared" };
}

function progress(status: CommunicationVisibleStatus): CommunicationProgressStep[] {
  const order: CommunicationVisibleStatus[] = [
    { key: "no_draft", label: "No draft" },
    { key: "draft_prepared", label: "Draft prepared" },
    { key: "ready_to_send", label: "Ready to send" },
    { key: "sending", label: "Sending" },
  ];
  const finalKeys = new Set(["sent", "delivered", "bounced", "failed"]);
  const currentIndex = order.findIndex((step) => step.key === status.key);
  const steps: CommunicationProgressStep[] = order.map((step, index) => ({
    ...step,
    state:
      finalKeys.has(status.key) || index < currentIndex
        ? ("complete" as const)
        : index === currentIndex
          ? ("current" as const)
          : ("pending" as const),
  }));
  if (finalKeys.has(status.key)) {
    steps.push({
      ...status,
      state:
        status.key === "bounced" || status.key === "failed"
          ? "attention"
          : "current",
    });
  }
  return steps;
}

function draftResult(body: CommunicationPlanBody): CommunicationReviewProjection["draftResult"] {
  if (body.stageVisibility.draft !== "complete" || body.drafts.length === 0) return null;
  const frozenAddresses = new Set(
    body.drafts.map((draft) => draft.toEmail.trim().toLowerCase()),
  );
  const omitted = body.recipientGroups.reduce(
    (count, group) =>
      count +
      group.recipients.filter(
        (recipient) => !recipient.selected || recipient.deliverability !== "ok",
      ).length,
    0,
  );
  const unchanged = body.recipientGroups.filter(
    (group) =>
      !group.recipients.some(
        (recipient) =>
          recipient.selected &&
          recipient.deliverability === "ok" &&
          frozenAddresses.has(recipient.address.trim().toLowerCase()),
      ),
  ).length;
  const prepared = body.drafts.length;
  const failed = 0;
  return {
    title: prepared === 1 ? "Draft prepared" : "Drafts prepared",
    counts: { prepared, omitted, failed, unchanged },
    noEmailsSent: true,
    statement: `${prepared} ${plural(prepared, "draft")} prepared, ${omitted} ${plural(omitted, "recipient")} omitted, ${failed} failed, and ${unchanged} ${plural(unchanged, "item")} unchanged. No emails were sent.`,
    preparedAt: body.drafts.map((draft) => draft.frozenAt).filter(Boolean).sort().at(-1) ?? null,
  };
}

function effectOutcome(
  status: CommunicationPlanBody["effects"][number]["status"],
  error: string | null,
): CommunicationDeliveryResult["effects"][number]["outcome"] {
  if (status === "queued" || status === "sending") return "sending";
  if (status === "retry_scheduled") return "retrying";
  if (status === "succeeded") return "sent";
  if (status === "unknown") return "unknown";
  return isBounce(error) ? "bounced" : "failed";
}

function deliveryResult(
  plan: CourseCheckPlan,
  body: CommunicationPlanBody,
): CommunicationReviewProjection["deliveryResult"] {
  if (body.effects.length === 0) return null;
  const reconciled = reconciliationCount(plan);
  const corrected = correctionCount(plan);
  const correctionMutations = (plan.mutations ?? []).filter(
    (mutation) => mutation.kind === "compensate",
  );
  const retrying =
    body.deliverySummary.queued +
    body.deliverySummary.sending +
    body.deliverySummary.retryScheduled;
  const counts = {
    succeeded: body.deliverySummary.succeeded,
    retrying,
    failed: body.deliverySummary.failed,
    unknown: body.deliverySummary.unknown,
    reconciled,
    corrected,
  };
  return {
    counts,
    statement: `${counts.succeeded} succeeded, ${counts.retrying} retrying, ${counts.failed} failed, ${counts.unknown} unknown, ${counts.reconciled} reconciled, and ${counts.corrected} corrected.`,
    effects: body.effects.map((effect) => {
      const outcome = effectOutcome(effect.status, effect.lastError);
      return {
        address: effect.toEmail,
        outcome,
        label:
          outcome === "sent"
            ? "Sent; the frozen message is immutable"
            : outcome === "retrying"
              ? "Retry scheduled"
              : outcome === "unknown"
                ? "Provider outcome unknown; reconcile before retrying"
                : outcome === "bounced"
                  ? "Bounced"
                  : outcome === "failed"
                    ? "Failed"
                    : "Sending",
        attemptCount: effect.attemptCount,
        corrected: correctionMutations.some((mutation) =>
          mutation.summary.includes(effect.effectId),
        ),
      };
    }),
  };
}

export function buildCommunicationReviewProjection(
  plan: CourseCheckPlan,
  options: {
    canViewCommunicationEvidence: boolean;
    sendAction: "execute" | "endorse" | null;
    reasonRequired: boolean;
  },
): CommunicationReviewProjection | null {
  if (plan.body.actionType !== "communication") return null;
  const body = plan.body;
  const status = currentStatus(plan, body);
  const frozenAddresses = new Set(
    body.drafts.map((draft) => draft.toEmail.trim().toLowerCase()),
  );
  const groupDraftCount = (group: CommunicationPlanBody["recipientGroups"][number]) =>
    new Set(
      group.recipients
        .filter(
          (recipient) =>
            recipient.selected &&
            recipient.deliverability === "ok" &&
            frozenAddresses.has(recipient.address.trim().toLowerCase()),
        )
        .map((recipient) => recipient.address.trim().toLowerCase()),
    ).size;
  const groups = options.canViewCommunicationEvidence
    ? body.recipientGroups
        .filter((group) => groupDraftCount(group) > 0)
        .map((group) => ({
          label: group.label,
          outcome: group.outcome,
          draftCount: groupDraftCount(group),
          proposalHref: group.proposalId
            ? `/e/${encodeURIComponent(plan.eventId)}/submissions/${encodeURIComponent(group.proposalId)}`
            : null,
          sessionHref: group.sessionId
            ? `/e/${encodeURIComponent(plan.eventId)}/agenda?sessionIds=${encodeURIComponent(group.sessionId)}`
            : null,
          recipients: group.recipients.map((recipient) => ({
            name: recipient.name,
            address: recipient.address,
            inclusion: recipient.inclusion,
            inclusionReason: recipient.inclusionReason,
            selected: recipient.selected,
            draftPrepared: body.drafts.some(
              (draft) =>
                draft.groupId === group.groupId &&
                draft.toEmail.toLowerCase() === recipient.address.toLowerCase(),
            ),
            priorCommunicationCount: recipient.priorCommunications.length,
            priorCommunications: recipient.priorCommunications.map((prior) => ({
              status: prior.status,
              subject: prior.subject,
              sentAt: prior.sentAt,
            })),
          })),
        }))
    : [];
  const draftlessGroups = options.canViewCommunicationEvidence
    ? body.recipientGroups
        .filter((group) => groupDraftCount(group) === 0)
        .map((group) => ({
          label: group.label,
          reason:
            group.recipients.find((recipient) => !recipient.selected)?.inclusionReason ??
            "No draft was prepared for this item.",
          proposalHref: group.proposalId
            ? `/e/${encodeURIComponent(plan.eventId)}/submissions/${encodeURIComponent(group.proposalId)}`
            : null,
        }))
    : [];
  const sessionIds = options.canViewCommunicationEvidence
    ? [
        ...new Set(
          body.drafts
            .map((draft) => draft.sessionId)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
    : [];
  const prepared = body.drafts.length;
  const handoffs: CommunicationReviewProjection["handoffs"] = [
    {
      kind: "submissions",
      label: "Return to submissions",
      href: `/e/${encodeURIComponent(plan.eventId)}/submissions`,
      count: body.source.selection?.proposalIds.length ?? body.recipientGroups.filter((group) => group.proposalId).length,
    },
  ];
  if (prepared > 0) {
    handoffs.unshift({
      kind: "outbox",
      label: `Review ${prepared} ${plural(prepared, "draft")} in Outbox`,
      href: `/e/${encodeURIComponent(plan.eventId)}/messages?planId=${encodeURIComponent(plan.id)}`,
      count: prepared,
    });
  }
  if (sessionIds.length > 0) {
    handoffs.push({
      kind: "sessions",
      label: `View ${sessionIds.length} affected ${plural(sessionIds.length, "session")}`,
      href: `/e/${encodeURIComponent(plan.eventId)}/agenda?sessionIds=${sessionIds.map(encodeURIComponent).join(",")}`,
      count: sessionIds.length,
    });
  }
  if (draftlessGroups.length > 0) {
    handoffs.push({
      kind: "draftless",
      label: `View ${draftlessGroups.length} draftless ${plural(draftlessGroups.length, "item")}`,
      href: `/e/${encodeURIComponent(plan.eventId)}/messages?planId=${encodeURIComponent(plan.id)}#draftless-items`,
      count: draftlessGroups.length,
    });
  }
  const sendReady = body.stageVisibility.send === "ready" && body.drafts.length > 0;
  return {
    kind: "communication_review",
    currentStatus: status,
    progress: progress(status),
    draftResult: draftResult(body),
    handoffs,
    outbox: {
      exactDraftCount: body.drafts.length,
      sourceLabel: sourceLabel(body),
      groups,
      draftlessGroups,
    },
    deliveryResult: deliveryResult(plan, body),
    sendAction:
      sendReady && options.sendAction
        ? {
            stageId: "send-messages",
            action: options.sendAction,
            reasonRequired: options.reasonRequired,
            label: options.sendAction === "endorse"
              ? `Endorse send of ${body.drafts.length} ${plural(body.drafts.length, "message")}`
              : `Send ${body.drafts.length} ${plural(body.drafts.length, "message")}`,
            effectSummary: `Approve and queue exactly ${body.drafts.length} frozen ${plural(body.drafts.length, "message")}.`,
          }
        : null,
    immutableBoundary:
      body.effects.some((effect) => effect.status === "succeeded")
        ? "Sent messages cannot be edited, recalled, or undone. Create a new reviewed correction when follow-up is needed."
        : null,
  };
}
