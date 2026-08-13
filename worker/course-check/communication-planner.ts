import type {
  CalendarOperation,
  CommunicationPlanBody,
  CommunicationRecipient,
  CommunicationRecipientGroup,
  CommunicationTemplateKind,
  CourseCheckDelta,
  CourseCheckFinding,
  CourseCheckStage,
  FrozenCalendarIntent,
  FrozenCommunicationDraft,
  PriorCommunicationEvidence,
  ProgramOutcome,
} from "../../shared/course-check";
import { DEFAULT_AGE_WARNING_HOURS } from "../../shared/course-check";
import { renderCommunicationTemplate } from "../../shared/communication-template";
import {
  buildCalendarInviteIcs,
  calendarInviteAttachmentFilename,
  methodForOperation,
  resolveCalendarLocation,
  statusForOperation,
} from "../../shared/calendar-invite";
import { emptyCourseCheckAirtableEvidence } from "./airtable-effects";
import { buildEvidenceSections } from "./evidence";

export interface CommunicationSpeakerRef {
  speakerId: string | null;
  name: string;
  email: string;
  role: "primary" | "co" | "speaker";
  portalUrl?: string | null;
  portalTokenId?: string | null;
}

export interface CommunicationGroupInput {
  proposalId: string | null;
  sessionId: string | null;
  label: string;
  outcome: ProgramOutcome | null;
  speakers: CommunicationSpeakerRef[];
  priorCommunications: PriorCommunicationEvidence[];
}

export interface PlanCommunicationInput {
  planId: string;
  source: CommunicationPlanBody["source"];
  templateKind: CommunicationTemplateKind;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  groups: CommunicationGroupInput[];
  excludedRecipientIds?: string[];
  linkedPlanIds?: string[];
  parentPlanId?: string | null;
  ageWarningHours?: number;
  drafts?: FrozenCommunicationDraft[];
  draftStageComplete?: boolean;
  calendarOps?: CalendarOperation[];
  organizerEmail?: string;
  organizerName?: string;
  eventName?: string;
  compensation?: CommunicationPlanBody["compensation"];
  portalInvitation?: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function contentFingerprint(subject: string, bodyText: string, bodyHtml: string): string {
  return `${subject}\n---\n${bodyText}\n---\n${bodyHtml}`;
}

function defaultSubject(kind: CommunicationTemplateKind, outcome: ProgramOutcome | null): string {
  if (kind === "acceptance" || outcome === "accepted") {
    return "Your session has been accepted";
  }
  if (kind === "decline" || outcome === "declined") {
    return "Update on your conference proposal";
  }
  return "Conference program update";
}

function defaultBodyText(
  kind: CommunicationTemplateKind,
  outcome: ProgramOutcome | null,
  label: string,
): string {
  if (kind === "acceptance" || outcome === "accepted") {
    return `Hello,\n\nWe are pleased to accept "${label}" for the program. Please complete your speaker tasks in the portal.\n\nThank you,\nThe organizing team`;
  }
  if (kind === "decline" || outcome === "declined") {
    return `Hello,\n\nThank you for submitting "${label}". We are unable to include it in this year's program.\n\nThank you,\nThe organizing team`;
  }
  return `Hello,\n\nThis is an update regarding "${label}".\n\nThank you,\nThe organizing team`;
}

function defaultBodyHtml(text: string): string {
  return `<p>${text
    .split("\n\n")
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
        .join("<br />"),
    )
    .join("</p><p>")}</p>`;
}

export function defaultCommunicationContent(input: {
  templateKind: CommunicationTemplateKind;
  outcome: ProgramOutcome | null;
  label: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const subject =
    input.subject?.trim() || defaultSubject(input.templateKind, input.outcome);
  const bodyText =
    input.bodyText?.trim() ||
    defaultBodyText(input.templateKind, input.outcome, input.label);
  const bodyHtml = input.bodyHtml?.trim() || defaultBodyHtml(bodyText);
  return { subject, bodyText, bodyHtml };
}

function inclusionReason(input: {
  inclusion: CommunicationRecipient["inclusion"];
  role: CommunicationRecipient["role"];
  name: string;
  sharedWith?: string[];
  duplicateOf?: string;
}): string {
  switch (input.inclusion) {
    case "include":
      if (input.role === "primary") {
        return `${input.name} is the primary speaker for this proposal and should receive the decision message.`;
      }
      if (input.role === "co") {
        return `${input.name} is a co-speaker on this proposal and should receive the same decision context.`;
      }
      return `${input.name} is a selected speaker and should receive this message.`;
    case "missing":
      return `${input.name} has no deliverable email address, so they cannot receive this message until an address is added.`;
    case "duplicate":
      return `Address already included once for this recipient group${
        input.duplicateOf ? ` (same as ${input.duplicateOf})` : ""
      }; additional rows stay visible but are not selected.`;
    case "shared":
      return `This address is shared across ${
        input.sharedWith?.join(", ") || "multiple groups"
      }. Delivery is address-level; one send covers every group that includes it.`;
    case "exclude":
      return `${input.name} was excluded from this communication by staff.`;
    default:
      return "Recipient status is unknown.";
  }
}

export function planCommunicationCascade(
  input: PlanCommunicationInput,
): CommunicationPlanBody {
  const findings: CourseCheckFinding[] = [];
  const deltas: CourseCheckDelta[] = [];
  const excluded = new Set(input.excludedRecipientIds ?? []);
  const addressOwners = new Map<string, string[]>();

  const groupsWithIds = input.groups.map((group, index) => ({
    ...group,
    groupId: `grp_${input.planId.slice(0, 8)}_${index}`,
  }));

  for (const group of groupsWithIds) {
    for (const speaker of group.speakers) {
      const address = normalizeEmail(speaker.email);
      if (!address) continue;
      const owners = addressOwners.get(address) ?? [];
      if (!owners.includes(group.groupId)) owners.push(group.groupId);
      addressOwners.set(address, owners);
    }
  }

  const recipientGroups: CommunicationRecipientGroup[] = [];
  const proposalRevisions: Record<string, number> = {};
  const proposalIds: string[] = [];
  const speakerEmails: string[] = [];
  let recipientIndex = 0;

  for (const group of groupsWithIds) {
    if (group.proposalId) {
      proposalIds.push(group.proposalId);
    }
    const seenInGroup = new Map<string, string>();
    const recipients: CommunicationRecipient[] = [];

    for (const speaker of group.speakers) {
      const address = normalizeEmail(speaker.email);
      const recipientId = `rcp_${input.planId.slice(0, 8)}_${recipientIndex++}`;
      speakerEmails.push(address || `(missing:${speaker.name})`);

      let inclusion: CommunicationRecipient["inclusion"] = "include";
      let deliverability: CommunicationRecipient["deliverability"] = "ok";
      let selected = true;
      let duplicateOf: string | undefined;
      let sharedWith: string[] | undefined;

      if (!address) {
        inclusion = "missing";
        deliverability = "missing";
        selected = false;
        findings.push({
          id: `finding_missing_${recipientId}`,
          severity: "warning",
          code: "recipient_missing_address",
          message: `${speaker.name} has no email address.`,
          recoveryGuidance:
            "Add a deliverable address or exclude this recipient before creating drafts.",
          entityRef: recipientId,
        });
      } else if (!isValidEmail(address)) {
        inclusion = "missing";
        deliverability = "invalid";
        selected = false;
        findings.push({
          id: `finding_invalid_${recipientId}`,
          severity: "warning",
          code: "recipient_invalid_address",
          message: `${speaker.name} has an invalid email address (${address}).`,
          recoveryGuidance: "Correct the address or exclude this recipient.",
          entityRef: recipientId,
        });
      } else if (seenInGroup.has(address)) {
        inclusion = "duplicate";
        selected = false;
        duplicateOf = seenInGroup.get(address);
        findings.push({
          id: `finding_dup_${recipientId}`,
          severity: "info",
          code: "recipient_duplicate_address",
          message: `Duplicate address ${address} within ${group.label}.`,
          entityRef: recipientId,
        });
      } else {
        seenInGroup.set(address, speaker.name);
        const owners = addressOwners.get(address) ?? [];
        if (owners.length > 1) {
          inclusion = "shared";
          sharedWith = owners.filter((id) => id !== group.groupId);
          findings.push({
            id: `finding_shared_${recipientId}`,
            severity: "info",
            code: "recipient_shared_address",
            message: `Address ${address} is shared across recipient groups.`,
            entityRef: recipientId,
          });
        }
      }

      if (excluded.has(recipientId)) {
        inclusion = "exclude";
        selected = false;
      }

      const prior = group.priorCommunications.filter(
        (row) =>
          normalizeEmail(row.toEmail) === address ||
          (group.proposalId && row.proposalId === group.proposalId),
      );
      if (prior.some((row) => row.status === "sent" || row.status === "queued")) {
        findings.push({
          id: `finding_prior_${recipientId}`,
          severity: "warning",
          code: "prior_related_communication",
          message: `Prior related communication exists for ${address || speaker.name}.`,
          recoveryGuidance:
            "Review prior sends before approving drafts so you do not resend a decision accidentally.",
          entityRef: recipientId,
          materialExternal: true,
        });
      }

      const recipient: CommunicationRecipient = {
        recipientId,
        address,
        name: speaker.name,
        role: speaker.role,
        speakerId: speaker.speakerId,
        inclusion,
        inclusionReason: inclusionReason({
          inclusion,
          role: speaker.role,
          name: speaker.name,
          sharedWith,
          duplicateOf,
        }),
        deliverability,
        selected,
        priorCommunications: prior,
        portalUrl: speaker.portalUrl ?? null,
        portalTokenId: speaker.portalTokenId ?? null,
      };
      recipients.push(recipient);

      deltas.push({
        entityType: "recipient",
        action: selected ? "include" : "exclude",
        summary: `${selected ? "Include" : "Exclude"} ${speaker.name} <${address || "no-address"}> — ${recipient.inclusionReason}`,
        proposalId: group.proposalId ?? undefined,
        after: {
          recipientId,
          address,
          inclusion,
          deliverability,
          selected,
        },
      });
    }

    recipientGroups.push({
      groupId: group.groupId,
      proposalId: group.proposalId,
      sessionId: group.sessionId,
      label: group.label,
      outcome: group.outcome,
      recipients,
    });
  }

  if (recipientGroups.length === 0) {
    findings.push({
      id: `finding_empty_${input.planId.slice(0, 8)}`,
      severity: "blocker",
      code: "empty_communication_scope",
      message: "No proposals, sessions, speakers, or tasks resolved into recipient groups.",
      recoveryGuidance:
        "Select accepted or declined work with speakers, or link a completed Decision Course Check.",
    });
  }

  const selectedCount = recipientGroups.reduce(
    (sum, group) => sum + group.recipients.filter((r) => r.selected && r.deliverability === "ok").length,
    0,
  );
  if (recipientGroups.length > 0 && selectedCount === 0) {
    findings.push({
      id: `finding_no_selected_${input.planId.slice(0, 8)}`,
      severity: "blocker",
      code: "no_deliverable_recipients",
      message: "No deliverable recipients are selected for draft creation.",
      recoveryGuidance: "Include at least one valid address or fix missing addresses.",
    });
  }

  const draftStageComplete = Boolean(input.draftStageComplete && input.drafts?.length);
  const stages: CourseCheckStage[] = [
    {
      id: "create-drafts",
      label: "Create drafts",
      verb: "Create drafts",
      status: draftStageComplete
        ? "complete"
        : findings.some((f) => f.severity === "blocker")
          ? "blocked"
          : "ready",
      external: false,
    },
    {
      id: "send-messages",
      label: "Send messages",
      verb: "Send messages",
      status: "pending",
      external: true,
    },
  ];

  if (!draftStageComplete) {
    deltas.push({
      entityType: "message_draft",
      action: "create",
      summary: `Will freeze ${selectedCount} message draft(s) with the current subject and body without sending.`,
      after: {
        selectedCount,
        subject: input.subject,
      },
    });
  }

  const calendarOps = input.calendarOps ?? [];
  for (const op of calendarOps) {
    const location = resolveCalendarLocation({
      roomName: op.roomName,
      locationPending: op.locationPending,
    });
    deltas.push({
      entityType: "calendar_invite",
      action: op.kind === "cancel" ? "cancel" : op.kind,
      summary: `Calendar ${op.kind} for “${op.title}” (uid ${op.uid}, sequence ${op.sequence})${
        op.locationPending ? " · location pending" : location ? ` · ${location}` : ""
      }${op.timePending ? " · time TBD" : ""}.`,
      sessionId: op.sessionId,
      before: op.previous,
      after: {
        sessionId: op.sessionId,
        kind: op.kind,
        uid: op.uid,
        sequence: op.sequence,
        startsAt: op.startsAt,
        endsAt: op.endsAt,
        roomId: op.roomId,
        roomName: op.roomName,
        locationPending: op.locationPending,
        timePending: op.timePending,
        recipients: op.recipients,
        reversibility: op.reversibility,
      },
    });
    if (op.locationPending) {
      findings.push({
        id: `finding_cal_pending_loc_${op.sessionId}`,
        severity: "info",
        code: "calendar_location_pending",
        message: `Calendar ${op.kind} for “${op.title}” will show location as pending until a room is assigned.`,
        entityRef: op.sessionId,
      });
    }
  }
  if (calendarOps.length > 0) {
    findings.push({
      id: `finding_cal_separate_${input.planId.slice(0, 8)}`,
      severity: "info",
      code: "calendar_delivery_separate",
      message:
        "Calendar delivery is separately approved from decision application and public-program release. Create drafts freezes ICS; Send messages delivers.",
    });
  }

  const evidenceSections = buildEvidenceSections({ findings, deltas });
  const decisionState =
    input.source.kind === "linked_decision" && input.source.decisionPlanId
      ? "complete"
      : "not_started";

  const purpose: CommunicationPlanBody["purpose"] =
    input.portalInvitation
      ? "speaker_notification"
      : input.source.kind === "publication" || calendarOps.length > 0
      ? "calendar_update"
      : input.templateKind === "custom"
        ? "custom"
        : "decision";

  const airtable = emptyCourseCheckAirtableEvidence();
  return {
    actionType: "communication",
    source: input.source,
    purpose,
    portalInvitation: Boolean(input.portalInvitation),
    templateKind: input.templateKind,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    recipientGroups,
    recipients: [],
    drafts: input.drafts ?? [],
    effects: [],
    deliverySummary: {
      total: 0,
      queued: 0,
      sending: 0,
      succeeded: 0,
      retryScheduled: 0,
      failed: 0,
      unknown: 0,
    },
    calendarOps,
    deltas,
    findings,
    stages,
    airtable,
    evidenceSections,
    softWarningOverrides: [],
    stageVisibility: {
      decision: decisionState,
      draft: draftStageComplete ? "complete" : "ready",
      send: "not_started",
      delivery: "not_started",
    },
    linkedPlanIds: input.linkedPlanIds ?? [],
    parentPlanId: input.parentPlanId ?? null,
    compensation: input.compensation ?? null,
    batchGroupId: null,
    splitExplanation: null,
    relevantRevisions: {
      proposalIds: [...new Set(proposalIds)],
      proposalRevisions,
      speakerEmails: [...new Set(speakerEmails)],
      contentFingerprint: contentFingerprint(
        input.subject,
        input.bodyText,
        input.bodyHtml,
      ),
    },
    ageWarningHours: input.ageWarningHours ?? DEFAULT_AGE_WARNING_HOURS,
    ageWarning: null,
  };
}

export function communicationBodyDigestPayload(body: CommunicationPlanBody): unknown {
  return {
    actionType: body.actionType,
    source: body.source,
    portalInvitation: Boolean(body.portalInvitation),
    templateKind: body.templateKind,
    subject: body.subject,
    bodyText: body.bodyText,
    bodyHtml: body.bodyHtml,
    recipientGroups: body.recipientGroups.map((group) => ({
      groupId: group.groupId,
      proposalId: group.proposalId,
      sessionId: group.sessionId,
      label: group.label,
      outcome: group.outcome,
      recipients: group.recipients.map((recipient) => ({
        recipientId: recipient.recipientId,
        address: recipient.address,
        name: recipient.name,
        role: recipient.role,
        speakerId: recipient.speakerId,
        portalUrl: recipient.portalUrl ?? null,
        portalTokenId: recipient.portalTokenId ?? null,
        inclusion: recipient.inclusion,
        selected: recipient.selected,
        deliverability: recipient.deliverability,
        priorIds: recipient.priorCommunications.map((row) => row.id),
      })),
    })),
    drafts: body.drafts.map((draft) => ({
      draftId: draft.draftId,
      groupId: draft.groupId,
      toEmail: draft.toEmail,
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodyHtml: draft.bodyHtml,
      attachmentRefs: draft.attachmentRefs,
      calendarIntent: draft.calendarIntent
        ? {
            uid: draft.calendarIntent.uid,
            sequence: draft.calendarIntent.sequence,
            operation: draft.calendarIntent.operation,
            sessionId: draft.calendarIntent.sessionId,
            startsAt: draft.calendarIntent.startsAt,
            endsAt: draft.calendarIntent.endsAt,
            location: draft.calendarIntent.location,
            locationPending: draft.calendarIntent.locationPending,
            method: draft.calendarIntent.method,
            ics: draft.calendarIntent.ics,
          }
        : null,
      status: draft.status,
      frozenPlanVersion: draft.frozenPlanVersion,
    })),
    calendarOps: body.calendarOps,
    stages: body.stages.map((stage) => ({
      id: stage.id,
      status: stage.status,
    })),
    stageVisibility: body.stageVisibility,
    findings: body.findings.map((finding) => ({
      id: finding.id,
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
    })),
    linkedPlanIds: body.linkedPlanIds,
    parentPlanId: body.parentPlanId,
    compensation: body.compensation,
    softWarningOverrides: body.softWarningOverrides,
    relevantRevisions: body.relevantRevisions,
    airtable: body.airtable,
  };
}

export function hasCommunicationBlockers(findings: CourseCheckFinding[]): boolean {
  return findings.some((finding) => finding.severity === "blocker");
}

function calendarOpForGroup(
  body: CommunicationPlanBody,
  sessionId: string | null,
): CalendarOperation | null {
  if (!sessionId) return null;
  return body.calendarOps.find((op) => op.sessionId === sessionId) ?? null;
}

export function freezeCommunicationDrafts(input: {
  body: CommunicationPlanBody;
  planVersion: number;
  at: string;
  organizerEmail?: string;
  organizerName?: string;
  eventName?: string;
}): {
  body: CommunicationPlanBody;
  drafts: FrozenCommunicationDraft[];
} {
  const drafts: FrozenCommunicationDraft[] = [];
  const frozenAddresses = new Set<string>();
  const organizerEmail = input.organizerEmail ?? "program@chartstead.events";
  const organizerName = input.organizerName ?? "ChartStead Program";
  const eventName = input.eventName ?? "Conference program";

  for (const group of input.body.recipientGroups) {
    for (const recipient of group.recipients) {
      if (!recipient.selected || recipient.deliverability !== "ok") continue;
      const addressIdentity = normalizeEmail(recipient.address);
      if (frozenAddresses.has(addressIdentity)) continue;
      frozenAddresses.add(addressIdentity);
      const draftId = `draft_${recipient.recipientId}`;
      const op = calendarOpForGroup(input.body, group.sessionId);
      let calendarIntent: FrozenCalendarIntent | null = null;
      const attachmentRefs: string[] = [];

      if (op && op.kind !== undefined) {
        const location = resolveCalendarLocation({
          roomName: op.roomName,
          locationPending: op.locationPending,
        });
        const method = methodForOperation(op.kind);
        const ics = buildCalendarInviteIcs({
          uid: op.uid,
          sequence: op.sequence,
          method,
          operation: op.kind,
          title: op.title,
          description: input.body.bodyText,
          location,
          locationPending: op.locationPending,
          startsAt: op.startsAt,
          endsAt: op.endsAt,
          organizerEmail,
          organizerName,
          attendee: { email: recipient.address, name: recipient.name },
          eventName,
          dtStamp: input.at,
          status: statusForOperation(op.kind),
        });
        const filename = calendarInviteAttachmentFilename(op.kind);
        attachmentRefs.push(filename);
        calendarIntent = {
          uid: op.uid,
          sequence: op.sequence,
          operation: op.kind,
          sessionId: op.sessionId,
          title: op.title,
          startsAt: op.startsAt,
          endsAt: op.endsAt,
          location,
          locationPending: op.locationPending,
          timePending: op.timePending,
          method,
          ics,
          reversibility: op.reversibility,
        };
      } else if (group.sessionId) {
        calendarIntent = {
          uid: `cal_${group.sessionId}`,
          sequence: 0,
          operation: "none",
          sessionId: group.sessionId,
          title: null,
          startsAt: null,
          endsAt: null,
          location: null,
          locationPending: false,
          timePending: false,
          method: null,
          ics: null,
          reversibility: null,
        };
      }

      drafts.push({
        draftId,
        groupId: group.groupId,
        proposalId: group.proposalId,
        sessionId: group.sessionId,
        toEmail: recipient.address,
        recipientName: recipient.name,
        subject: renderCommunicationTemplate(input.body.subject, {
          speakerName: recipient.name,
          proposalTitle: group.label,
          eventName,
          portalUrl: recipient.portalUrl ?? undefined,
        }),
        bodyText: renderCommunicationTemplate(input.body.bodyText, {
          speakerName: recipient.name,
          proposalTitle: group.label,
          eventName,
          portalUrl: recipient.portalUrl ?? undefined,
        }),
        bodyHtml: renderCommunicationTemplate(
          input.body.bodyHtml,
          {
            speakerName: recipient.name,
            proposalTitle: group.label,
            eventName,
            portalUrl: recipient.portalUrl ?? undefined,
          },
          { html: true },
        ),
        attachmentRefs,
        calendarIntent,
        status: "frozen",
        frozenAt: input.at,
        frozenPlanVersion: input.planVersion,
      });
    }
  }

  const stages: CourseCheckStage[] = input.body.stages.map((stage) => {
    if (stage.id === "create-drafts") {
      return { ...stage, status: "complete" as const };
    }
    if (stage.id === "send-messages") {
      return { ...stage, status: "pending" as const };
    }
    return stage;
  });

  const deltas: CourseCheckDelta[] = [
    ...input.body.deltas.filter((delta) => delta.entityType !== "message_draft"),
    ...drafts.map((draft) => ({
      entityType: "message_draft" as const,
      action: "freeze" as const,
      summary: `Froze draft to ${draft.toEmail} with subject "${draft.subject}" (not sent).`,
      proposalId: draft.proposalId ?? undefined,
      after: {
        draftId: draft.draftId,
        toEmail: draft.toEmail,
        subject: draft.subject,
        status: draft.status,
      },
    })),
  ];

  const body: CommunicationPlanBody = {
    ...input.body,
    drafts,
    deltas,
    stages,
    evidenceSections: buildEvidenceSections({
      findings: input.body.findings,
      deltas,
    }),
    stageVisibility: {
      ...input.body.stageVisibility,
      draft: "complete",
      send: "ready",
      delivery: "not_started",
    },
  };

  return { body, drafts };
}

export function redactCommunicationBody(body: CommunicationPlanBody): CommunicationPlanBody {
  return {
    ...body,
    redacted: true,
    subject: "[redacted]",
    bodyText: "[redacted]",
    bodyHtml: "[redacted]",
    recipientGroups: body.recipientGroups.map((group) => ({
      ...group,
      recipients: group.recipients.map((recipient) => ({
        ...recipient,
        address: recipient.address ? "[redacted]" : "",
        portalUrl: null,
        portalTokenId: null,
        inclusionReason: "Private recipient evidence is hidden without communication authority.",
        priorCommunications: recipient.priorCommunications.map((prior) => ({
          ...prior,
          toEmail: "[redacted]",
          subject: "[redacted]",
        })),
      })),
    })),
    drafts: body.drafts.map((draft) => ({
      ...draft,
      toEmail: "[redacted]",
      recipientName: "[redacted]",
      subject: "[redacted]",
      bodyText: "[redacted]",
      bodyHtml: "[redacted]",
      calendarIntent: draft.calendarIntent
        ? {
            ...draft.calendarIntent,
            ics: draft.calendarIntent.ics ? "[redacted]" : null,
          }
        : null,
    })),
    effects: body.effects.map((effect) => ({
      ...effect,
      toEmail: "[redacted]",
      lastError: effect.lastError ? "[redacted]" : null,
    })),
    deltas: body.deltas.map((delta) =>
      delta.entityType === "recipient" || delta.entityType === "message_draft"
        ? {
            ...delta,
            summary: "Private communication detail redacted.",
            after: null,
            before: null,
          }
        : delta,
    ),
  };
}
