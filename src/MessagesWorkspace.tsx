import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { renderCommunicationTemplate } from "../shared/communication-template";
import type { CommunicationPlanBody, CourseCheckPlan } from "../shared/course-check";
import type { OnboardingBoardSpeaker } from "../shared/events";
import {
  ApiError,
  createCommunicationCourseCheck,
  fetchCourseCheckPlans,
  fetchOnboardingBoard,
} from "./api";
import { CommunicationResultPanel } from "./course-check/CommunicationResultPanel";

type AudienceFilter = "all" | "needs_follow_up" | "overdue" | "ready";

const FILTERS: Array<{ value: AudienceFilter; label: string }> = [
  { value: "all", label: "All speakers" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "overdue", label: "Overdue" },
  { value: "ready", label: "Ready" },
];

function isDeliverable(address: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim());
}

function matchesFilter(speaker: OnboardingBoardSpeaker, filter: AudienceFilter): boolean {
  if (filter === "needs_follow_up") return speaker.openTaskCount > 0;
  if (filter === "overdue") return speaker.overdueCount > 0;
  if (filter === "ready") return speaker.openTaskCount === 0;
  return true;
}

function readinessLabel(speaker: OnboardingBoardSpeaker): string {
  if (speaker.overdueCount > 0) {
    return `${speaker.overdueCount} overdue · ${speaker.openTaskCount} open`;
  }
  if (speaker.openTaskCount > 0) return `${speaker.openTaskCount} open`;
  return "Ready";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function communicationStatus(plan: CourseCheckPlan & { body: CommunicationPlanBody }): string {
  if (plan.communicationReview) return plan.communicationReview.currentStatus.label;
  const body = plan.body;
  if (body.deliverySummary.unknown > 0) return "Unknown outcome";
  if (body.deliverySummary.retryScheduled > 0) return "Retry scheduled";
  if (body.deliverySummary.failed > 0) return "Failed";
  if (body.deliverySummary.queued > 0 || body.deliverySummary.sending > 0) {
    return "Queued";
  }
  if (
    body.deliverySummary.total > 0 &&
    body.deliverySummary.succeeded === body.deliverySummary.total
  ) {
    return "Delivered";
  }
  if (body.stageVisibility.draft === "complete") return "Drafts frozen";
  return "Draft";
}

function communicationRecipientCount(body: CommunicationPlanBody): number {
  if (body.deliverySummary.total > 0) return body.deliverySummary.total;
  if (body.drafts?.length > 0) return body.drafts.length;
  return body.recipientGroups.reduce(
    (total, group) =>
      total +
      group.recipients.filter(
        (recipient) => recipient.selected && recipient.deliverability === "ok",
      ).length,
    0,
  );
}

export function MessagesWorkspace({
  eventId,
  eventName,
  focusedPlanId,
  onOpenCourseCheck,
}: {
  eventId: string;
  eventName: string;
  focusedPlanId?: string | null;
  onOpenCourseCheck: (planId: string) => void;
}) {
  const board = useQuery({
    queryKey: ["onboarding-board", eventId],
    queryFn: () => fetchOnboardingBoard(eventId),
  });
  const plans = useQuery({
    queryKey: ["course-checks", eventId],
    queryFn: () => fetchCourseCheckPlans(eventId),
  });
  const [filter, setFilter] = useState<AudienceFilter>("all");
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<Set<string>>(
    new Set(),
  );
  const [subject, setSubject] = useState("Program update for {{speaker_name}}");
  const [bodyText, setBodyText] = useState(
    "Hello {{speaker_name}},\n\nWe have an update about {{proposal_title}} for {{event_name}}.\n\nThank you,\nThe organizing team",
  );

  const speakers = board.data?.speakers ?? [];
  const visibleSpeakers = useMemo(
    () => speakers.filter((speaker) => matchesFilter(speaker, filter)),
    [filter, speakers],
  );
  const deliverableSpeakers = speakers.filter((speaker) => isDeliverable(speaker.email));
  const includedSpeakers = speakers.filter(
    (speaker) =>
      selectedSpeakerIds.has(speaker.speakerId) && isDeliverable(speaker.email),
  );
  const missingCount = speakers.length - deliverableSpeakers.length;
  const excludedCount = deliverableSpeakers.length - includedSpeakers.length;
  const previewSpeaker = includedSpeakers[0] ?? null;
  const communicationPlans = (plans.data ?? []).filter(
    (plan): plan is CourseCheckPlan & { body: CommunicationPlanBody } =>
      plan.body.actionType === "communication",
  );
  const focusedPlan = focusedPlanId
    ? communicationPlans.find((plan) => plan.id === focusedPlanId) ?? null
    : null;

  const createPlan = useMutation({
    mutationFn: () =>
      createCommunicationCourseCheck(eventId, {
        speakerIds: includedSpeakers.map((speaker) => speaker.speakerId),
        templateKind: "custom",
        subject,
        bodyText,
        idempotencyKey: `speaker-message-${crypto.randomUUID()}`,
      }),
    onSuccess: (plan) => onOpenCourseCheck(plan.id),
  });

  if (board.isPending || plans.isPending) {
    return (
      <div className="workspace messages-workspace">
        <section className="operations-panel">
          <p className="empty-state padded">Loading speaker messages…</p>
        </section>
      </div>
    );
  }

  if (board.isError || plans.isError) {
    const error = board.error ?? plans.error;
    return (
      <div className="workspace messages-workspace">
        <section className="operations-panel padded-panel" role="alert">
          <h2>Speaker messages could not be loaded.</h2>
          <p>{error instanceof ApiError ? error.message : "Try again shortly."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace messages-workspace">
      {focusedPlan?.communicationReview ? (
        <CommunicationResultPanel
          review={focusedPlan.communicationReview}
          showOutboxDetails
          onSend={
            focusedPlan.communicationReview.sendAction
              ? () => onOpenCourseCheck(focusedPlan.id)
              : undefined
          }
        />
      ) : null}
      <section className="messages-intro" aria-labelledby="speaker-messages-title">
        <div>
          <p className="eyebrow">Communications</p>
          <h2 id="speaker-messages-title">Speaker messages</h2>
          <p>
            Choose the exact audience and message. Course Check reviews recipients and
            freezes drafts before any separate send approval.
          </p>
        </div>
        <div className="messages-scope-counts" aria-label="Audience scope">
          <strong>{includedSpeakers.length} included</strong>
          <span>{excludedCount} excluded</span>
          <span>
            {missingCount} missing {missingCount === 1 ? "address" : "addresses"}
          </span>
        </div>
      </section>

      <div className="messages-compose-grid">
        <section className="operations-panel messages-audience" aria-labelledby="audience-title">
          <div className="panel-heading messages-panel-heading">
            <div>
              <h2 id="audience-title">Audience</h2>
              <span>{visibleSpeakers.length} shown</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!visibleSpeakers.some((speaker) => isDeliverable(speaker.email))}
              onClick={() => {
                setSelectedSpeakerIds((current) => {
                  const next = new Set(current);
                  for (const speaker of visibleSpeakers) {
                    if (isDeliverable(speaker.email)) next.add(speaker.speakerId);
                  }
                  return next;
                });
              }}
            >
              Select visible
            </button>
          </div>
          <div className="seg messages-filter" role="group" aria-label="Readiness group">
            {FILTERS.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="messages-table-wrap">
            <table className="messages-table">
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Speaker</th>
                  <th>Readiness</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {visibleSpeakers.map((speaker) => {
                  const deliverable = isDeliverable(speaker.email);
                  return (
                    <tr key={speaker.speakerId} data-selected={selectedSpeakerIds.has(speaker.speakerId)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${speaker.name} (${speaker.email || "missing address"})`}
                          checked={selectedSpeakerIds.has(speaker.speakerId)}
                          disabled={!deliverable}
                          onChange={() => {
                            setSelectedSpeakerIds((current) => {
                              const next = new Set(current);
                              if (next.has(speaker.speakerId)) next.delete(speaker.speakerId);
                              else next.add(speaker.speakerId);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <th scope="row">
                        <strong>{speaker.name}</strong>
                        <span>{speaker.proposalTitle ?? "General event speaker"}</span>
                      </th>
                      <td>{readinessLabel(speaker)}</td>
                      <td>
                        {deliverable ? (
                          speaker.email
                        ) : (
                          <span className="messages-missing">Missing address</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="operations-panel messages-compose" aria-labelledby="compose-title">
          <div className="panel-heading">
            <h2 id="compose-title">Compose</h2>
            <span>Draft only</span>
          </div>
          <div className="messages-compose-fields">
            <label className="stack-field">
              Subject
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label className="stack-field">
              Message
              <textarea
                rows={9}
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
              />
            </label>
            <p className="messages-token-help">
              Available substitutions: <code>{"{{speaker_name}}"}</code>,{" "}
              <code>{"{{proposal_title}}"}</code>, <code>{"{{event_name}}"}</code>
            </p>
          </div>
          <div className="messages-preview" aria-live="polite">
            <p className="eyebrow">
              {previewSpeaker ? `Preview for ${previewSpeaker.name}` : "Recipient preview"}
            </p>
            {previewSpeaker ? (
              <>
                <h3>
                  {renderCommunicationTemplate(subject, {
                    speakerName: previewSpeaker.name,
                    proposalTitle: previewSpeaker.proposalTitle ?? "your session",
                    eventName,
                  })}
                </h3>
                <p>
                  {renderCommunicationTemplate(bodyText, {
                    speakerName: previewSpeaker.name,
                    proposalTitle: previewSpeaker.proposalTitle ?? "your session",
                    eventName,
                  })}
                </p>
              </>
            ) : (
              <p>Select at least one deliverable speaker to preview their message.</p>
            )}
          </div>
          <div className="messages-handoff">
            <p>
              This creates a reviewable Communication Course Check. It does not create
              drafts and does not send.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                includedSpeakers.length === 0 ||
                !subject.trim() ||
                !bodyText.trim() ||
                createPlan.isPending
              }
              onClick={() => createPlan.mutate()}
            >
              {createPlan.isPending
                ? "Opening Course Check…"
                : `Review ${includedSpeakers.length} recipient${
                    includedSpeakers.length === 1 ? "" : "s"
                  } in Course Check`}
            </button>
          </div>
          {createPlan.isError ? (
            <p className="form-message" data-tone="error" role="alert">
              {createPlan.error instanceof ApiError
                ? createPlan.error.message
                : "Could not open Communication Course Check."}
            </p>
          ) : null}
        </section>
      </div>

      <section className="operations-panel messages-history" aria-labelledby="message-history-title">
        <div className="panel-heading">
          <h2 id="message-history-title">Communication history</h2>
          <span>{communicationPlans.length} Course Checks</span>
        </div>
        {communicationPlans.length === 0 ? (
          <p className="empty-state padded">No speaker communications yet.</p>
        ) : (
          <table className="messages-table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Recipients</th>
                <th>Delivery</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {communicationPlans.map((plan) => (
                <tr key={plan.id}>
                  <th scope="row">
                    <a href={`/e/${eventId}/course-checks/${plan.id}`}>
                      {plan.body.subject}
                    </a>
                    {plan.body.compensation ? <span>Reviewed correction</span> : null}
                  </th>
                  <td>{communicationRecipientCount(plan.body)}</td>
                  <td>
                    <span className="messages-delivery-status">
                      {communicationStatus(plan)}
                    </span>
                  </td>
                  <td>{formatDate(plan.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
