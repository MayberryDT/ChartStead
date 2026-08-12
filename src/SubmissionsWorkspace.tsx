import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { useNavigate } from "@tanstack/react-router";

import type { ProgramOutcome } from "../shared/course-check";
import type {
  EventRecord,
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalAuditEvent,
  ProposalReviewResponse,
  ProposalStatus,
  SubmissionAnswers,
} from "../shared/events";
import { auditEventLabel } from "../shared/portal-lifecycle";
import {
  createDecisionCourseCheck,
  fetchOrganizerProposal,
  fetchProposals,
  fetchReviewerAssignments,
  grantReviewerTracks,
  retryReviewerInvitation,
  revokeReviewerInvitation,
  revokeReviewerAccess,
  updateReviewerTracks,
  updateProposalReview,
} from "./api";
import { AppSelect } from "./AppSelect";
import { createClientId } from "./id";

export interface ProposalQueueState {
  query: string;
  status: ProposalStatus | "all";
  track: string;
  sort: "newest" | "oldest" | "title-asc" | "speaker-asc";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function trackClass(trackId: string) {
  if (trackId.includes("program")) return "track-program";
  if (trackId.includes("design")) return "track-design";
  if (trackId.includes("community")) return "track-community";
  return "track-platform";
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function statusLabel(status: ProposalStatus) {
  switch (status) {
    case "approve":
      return "Approve";
    case "maybe":
      return "Maybe";
    case "deny":
      return "Deny";
    default:
      return "Unreviewed";
  }
}

function proposalHref(
  eventId: string,
  proposalId: string,
  queue: ProposalQueueState,
) {
  const params = new URLSearchParams();
  if (queue.query) params.set("q", queue.query);
  if (queue.status !== "all") params.set("status", queue.status);
  if (queue.track) params.set("track", queue.track);
  if (queue.sort !== "newest") params.set("sort", queue.sort);
  const suffix = params.size > 0 ? `?${params}` : "";
  return `/e/${eventId}/submissions/${proposalId}${suffix}`;
}

function decisionBatchStorageKey(eventId: string) {
  return `chartstead:decision-batch:${eventId}`;
}

function restoredDecisionBatch(eventId: string) {
  try {
    const stored = sessionStorage.getItem(decisionBatchStorageKey(eventId));
    if (!stored) return new Set<string>();
    const ids = JSON.parse(stored) as unknown;
    return new Set(
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

export function SubmissionsWorkspace({
  event,
  principal,
  selectedProposalId,
  onSelectProposal,
  onCloseProposal,
  queue,
  onQueueChange,
  cfpHref,
}: {
  event: EventRecord;
  principal: OrganizerPrincipal;
  selectedProposalId?: string | null;
  onSelectProposal?: (proposalId: string) => void;
  onCloseProposal?: () => void;
  queue: ProposalQueueState;
  onQueueChange: (next: ProposalQueueState) => void;
  cfpHref: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(queue.query);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(460);
  const [batchIds, setBatchIds] = useState<Set<string>>(() =>
    restoredDecisionBatch(event.id),
  );
  const [batchOutcome, setBatchOutcome] = useState<ProgramOutcome>("accepted");
  const [batchMessage, setBatchMessage] = useState<string | null>(null);

  useEffect(() => setSearch(queue.query), [queue.query]);
  useEffect(() => {
    const key = decisionBatchStorageKey(event.id);
    if (batchIds.size === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify([...batchIds]));
  }, [batchIds, event.id]);
  useEffect(() => {
    if (search === queue.query) return;
    const handle = window.setTimeout(
      () => onQueueChange({ ...queue, query: search }),
      150,
    );
    return () => window.clearTimeout(handle);
  }, [onQueueChange, queue, search]);

  const query = useQuery({
    queryKey: ["proposals", event.id, queue],
    queryFn: () => fetchProposals(event.id, queue),
  });
  const proposals = query.data ?? [];
  const detailQuery = useQuery({
    queryKey: ["proposal-review", event.id, selectedProposalId],
    queryFn: () => fetchOrganizerProposal(event.id, selectedProposalId!),
    enabled: Boolean(selectedProposalId),
  });
  const selected = selectedProposalId ? (detailQuery.data?.proposal ?? null) : null;
  const auditEvents = selectedProposalId ? (detailQuery.data?.auditEvents ?? []) : [];
  const currentRole = principal.rolesByEvent?.[event.id] ?? principal.role;

  function setQueue(patch: Partial<ProposalQueueState>) {
    onQueueChange({ ...queue, ...patch });
  }

  const batchMutation = useMutation({
    mutationFn: () =>
      createDecisionCourseCheck(event.id, {
        items: [...batchIds].map((proposalId) => ({
          proposalId,
          outcome: batchOutcome,
        })),
        idempotencyKey: `ui-batch-${[...batchIds].sort().join("-")}-${batchOutcome}-${createClientId()}`,
      }),
    onSuccess: (plan) => {
      setBatchMessage(null);
      void navigate({
        to: "/e/$eventId/course-checks/$planId",
        params: { eventId: event.id, planId: plan.id },
        search: {
          q: queue.query || undefined,
          status: queue.status === "all" ? undefined : queue.status,
          track: queue.track || undefined,
          sort: queue.sort === "newest" ? undefined : queue.sort,
        },
      });
    },
    onError: (error) => {
      setBatchMessage(error instanceof Error ? error.message : "Unable to open batch Course Check.");
    },
  });

  function startInspectorResize(pointer: ReactPointerEvent<HTMLDivElement>) {
    pointer.preventDefault();
    const startX = pointer.clientX;
    const startWidth = inspectorWidth;
    const move = (event: PointerEvent) => {
      const maxWidth = Math.max(380, Math.min(720, window.innerWidth - 560));
      setInspectorWidth(
        Math.min(maxWidth, Math.max(380, startWidth + startX - event.clientX)),
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div className="work" aria-label="Submissions workspace">
      <div className="toolbar">
        <label className="field search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(change) => setSearch(change.target.value)}
            placeholder="Search title, speaker, or ID…"
            aria-label="Search title, speaker, or ID"
            autoComplete="off"
          />
        </label>
        <div className="seg" role="group" aria-label="Status filter">
          {(["unreviewed", "approve", "maybe", "deny", "all"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                aria-pressed={queue.status === status}
                onClick={() => setQueue({ status })}
              >
                {status === "all" ? "All" : statusLabel(status)}
              </button>
            ),
          )}
        </div>
        <AppSelect
          label="Filter"
          ariaLabel="Track filter"
          value={queue.track}
          options={[
            { value: "", label: "All assigned tracks" },
            ...event.tracks.map((track) => ({ value: track.id, label: track.name })),
          ]}
          onValueChange={(track) => setQueue({ track })}
        />
        <AppSelect
          label="Sort"
          ariaLabel="Sort submissions"
          value={queue.sort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "title-asc", label: "Title A-Z" },
            { value: "speaker-asc", label: "Speaker A-Z" },
          ]}
          onValueChange={(sort) =>
            setQueue({ sort: sort as ProposalQueueState["sort"] })
          }
        />
        <span className="toolbar-spacer" />
        {currentRole === "admin" ? (
          <Dialog.Root open={routingOpen} onOpenChange={setRoutingOpen}>
            <Dialog.Trigger className="btn btn-secondary btn-sm">
              Reviewer routing
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="dialog-backdrop" />
              <Dialog.Viewport className="dialog-viewport">
                <Dialog.Popup className="routing-dialog">
                  <div className="routing-dialog-header">
                    <div>
                      <p className="eyebrow">Committee access</p>
                      <Dialog.Title>Reviewer routing</Dialog.Title>
                      <Dialog.Description>
                        Grant or remove track access for signed-in reviewers.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close className="dialog-close" aria-label="Close reviewer routing">
                      ×
                    </Dialog.Close>
                  </div>
                  <ReviewerRouting event={event} />
                </Dialog.Popup>
              </Dialog.Viewport>
            </Dialog.Portal>
          </Dialog.Root>
        ) : null}
        <a className="btn btn-primary btn-sm" href={cfpHref}>
          Open CFP form
        </a>
      </div>

      <div
        className="split"
        style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <div className="table-wrap">
          {currentRole === "admin" && batchIds.size > 0 ? (
            <div className="batch-decision-bar" role="region" aria-label="Batch final decisions">
              <strong>{batchIds.size} selected</strong>
              <AppSelect
                label="Final outcome"
                ariaLabel="Batch final outcome"
                value={batchOutcome}
                options={[
                  { value: "accepted", label: "Accept" },
                  { value: "declined", label: "Decline" },
                ]}
                onValueChange={(value) =>
                  setBatchOutcome(value === "declined" ? "declined" : "accepted")
                }
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={batchMutation.isPending}
                onClick={() => {
                  setBatchMessage(null);
                  batchMutation.mutate();
                }}
              >
                Open batch Course Check
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBatchIds(new Set())}
              >
                Clear
              </button>
              {batchMessage ? (
                <span className="form-message" data-tone="error">
                  {batchMessage}
                </span>
              ) : null}
            </div>
          ) : null}
          {query.isPending ? (
            <p className="empty-state">Loading submissions…</p>
          ) : query.isError ? (
            <div className="submission-error" role="alert">
              <strong>Unable to load submissions.</strong>
              <span>{query.error.message}</span>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
            </div>
          ) : proposals.length === 0 ? (
            <p className="empty-state">
              No proposals match these queue filters. Try another status, track,
              or search.
            </p>
          ) : (
            <table className="grid" aria-label="Submissions">
              <thead>
                <tr>
                  {currentRole === "admin" ? <th scope="col">Batch</th> : null}
                  <th scope="col"> </th>
                  <th scope="col">Talk</th>
                  <th scope="col">Track</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => {
                  const href = proposalHref(event.id, proposal.id, queue);
                  return (
                    <tr
                      key={proposal.id}
                      data-id={proposal.id}
                      aria-selected={selected?.id === proposal.id}
                    >
                      {currentRole === "admin" ? (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${proposal.id} for batch decision`}
                            checked={batchIds.has(proposal.id)}
                            disabled={Boolean(proposal.programOutcome)}
                            onChange={() => {
                              setBatchIds((current) => {
                                const next = new Set(current);
                                if (next.has(proposal.id)) next.delete(proposal.id);
                                else next.add(proposal.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                      ) : null}
                      <td>
                        <span className="avatar" aria-hidden="true">
                          {initials(proposal.speakerName)}
                        </span>
                      </td>
                      <td>
                        <ProposalLink
                          href={href}
                          proposalId={proposal.id}
                          onSelectProposal={onSelectProposal}
                        >
                          <span className="talk">{proposal.title}</span>
                          <span className="talk-sub">
                            {proposal.speakerName} · {proposal.id}
                          </span>
                        </ProposalLink>
                      </td>
                      <td>
                        <span className={`track ${trackClass(proposal.trackId)}`}>
                          {proposal.trackName}
                        </span>
                      </td>
                      <td>
                        <span className={`flag flag-${proposal.status}`}>
                          {statusLabel(proposal.status)}
                        </span>
                      </td>
                      <td className="muted">{formatSubmittedAt(proposal.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          className="inspector-resizer"
          role="separator"
          aria-label="Resize proposal detail"
          aria-orientation="vertical"
          aria-valuemin={380}
          aria-valuemax={720}
          aria-valuenow={inspectorWidth}
          tabIndex={0}
          onPointerDown={startInspectorResize}
          onKeyDown={(key) => {
            if (key.key === "ArrowLeft") {
              key.preventDefault();
              setInspectorWidth((width) => Math.min(720, width + 24));
            } else if (key.key === "ArrowRight") {
              key.preventDefault();
              setInspectorWidth((width) => Math.max(380, width - 24));
            }
          }}
        />

        <aside
          className={`inspector${selectedProposalId ? " has-selection" : ""}`}
          aria-label="Proposal detail"
        >
          {selectedProposalId && detailQuery.isPending ? (
            <div className="inspector-body" aria-busy="true">
              <p className="empty-state">Loading proposal…</p>
            </div>
          ) : selectedProposalId && detailQuery.isError ? (
            <div className="inspector-body">
              <div className="submission-error" role="alert">
                <strong>Unable to open this proposal.</strong>
                <span>{detailQuery.error.message}</span>
              </div>
            </div>
          ) : selected ? (
            <ProposalInspector
              eventId={event.id}
              proposal={selected}
              auditEvents={auditEvents}
              isAdmin={currentRole === "admin"}
              onClose={onCloseProposal}
            />
          ) : (
            <div className="inspector-body">
              <p className="empty-state">Select a proposal to inspect it.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ProposalLink({
  href,
  proposalId,
  onSelectProposal,
  children,
}: {
  href: string;
  proposalId: string;
  onSelectProposal?: (proposalId: string) => void;
  children: ReactNode;
}) {
  return (
    <a
      className="proposal-row-link"
      href={href}
      onClick={(click) => {
        if (
          click.button !== 0 ||
          click.altKey ||
          click.ctrlKey ||
          click.metaKey ||
          click.shiftKey
        ) {
          return;
        }
        click.preventDefault();
        onSelectProposal?.(proposalId);
      }}
    >
      {children}
    </a>
  );
}

function ReviewerRouting({ event }: { event: EventRecord }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [editingReviewerId, setEditingReviewerId] = useState<string | null>(null);
  const [editTrackIds, setEditTrackIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reviewers", event.id],
    queryFn: () => fetchReviewerAssignments(event.id),
  });
  const mutation = useMutation({
    mutationFn: () => grantReviewerTracks(event.id, { email, trackIds }),
    onSuccess: (result) => {
      setMessage(
        result.kind === "reviewer"
          ? `${result.reviewer.name} can now review ${result.reviewer.trackIds.length} track${result.reviewer.trackIds.length === 1 ? "" : "s"}.`
          : `Invitation ${result.invitation.deliveryState === "delivered" ? "delivered" : "queued"} for ${result.invitation.email}.`,
      );
      setEmail("");
      setTrackIds([]);
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (reviewerId: string) => revokeReviewerAccess(event.id, reviewerId),
    onSuccess: () => {
      setMessage("Reviewer access removed.");
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });
  const editMutation = useMutation({
    mutationFn: ({ reviewerId, trackIds }: { reviewerId: string; trackIds: string[] }) =>
      updateReviewerTracks(event.id, reviewerId, trackIds),
    onSuccess: () => {
      setMessage("Reviewer tracks saved.");
      setEditingReviewerId(null);
      setEditTrackIds([]);
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });
  const invitationRetryMutation = useMutation({
    mutationFn: (invitationId: string) =>
      retryReviewerInvitation(event.id, invitationId),
    onSuccess: (invitation) => {
      setMessage(
        invitation.deliveryState === "delivered"
          ? "Invitation delivered."
          : "Invitation retry queued.",
      );
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });
  const invitationRevokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      revokeReviewerInvitation(event.id, invitationId),
    onSuccess: () => {
      setMessage("Reviewer invitation revoked.");
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });

  return (
    <section className="reviewer-routing" aria-label="Reviewer access controls">
      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          setMessage(null);
          mutation.mutate();
        }}
      >
        <label>
          Reviewer email
          <input
            type="email"
            required
            value={email}
            onChange={(change) => setEmail(change.target.value)}
          />
        </label>
        <fieldset>
          <legend>Assigned tracks</legend>
          {event.tracks.map((track) => (
            <label key={track.id}>
              <input
                type="checkbox"
                checked={trackIds.includes(track.id)}
                onChange={(change) =>
                  setTrackIds((current) =>
                    change.target.checked
                      ? [...current, track.id]
                      : current.filter((trackId) => trackId !== track.id),
                  )
                }
              />
              {track.name}
            </label>
          ))}
        </fieldset>
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={mutation.isPending || trackIds.length === 0}
        >
          {mutation.isPending ? "Sending…" : "Send reviewer invitation"}
        </button>
      </form>
      {mutation.isError || editMutation.isError || invitationRetryMutation.isError || invitationRevokeMutation.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {mutation.error?.message ?? editMutation.error?.message ?? invitationRetryMutation.error?.message ?? invitationRevokeMutation.error?.message}
        </p>
      ) : message ? (
        <p className="form-message" role="status">{message}</p>
      ) : null}
      {query.isError ? (
        <div className="submission-error" role="alert">
          <strong>Unable to load reviewer routing.</strong>
          <span>{query.error.message}</span>
          <button className="btn btn-sm" type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : null}
      {query.isSuccess && query.data.invitations.length > 0 ? (
        <div className="reviewer-invitations" aria-label="Reviewer invitations">
          <h3>Invitations</h3>
          <ul className="reviewer-list">
            {query.data.invitations.map((invitation) => {
              const deliveryLabel =
                invitation.status === "revoked"
                  ? "Invitation revoked"
                  : invitation.status === "expired"
                    ? "Invitation expired"
                    : invitation.status === "accepted"
                      ? "Invitation accepted"
                      : invitation.deliveryState === "delivered"
                        ? "Invitation delivered"
                        : invitation.deliveryState === "retryable"
                          ? "Delivery failed — retry available"
                          : invitation.deliveryState === "failed"
                            ? "Delivery failed"
                            : "Invitation queued";
              return (
                <li key={invitation.id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>{deliveryLabel}</span>
                  </div>
                  <span className="reviewer-tracks">
                    {invitation.trackIds
                      .map((trackId) => event.tracks.find((track) => track.id === trackId)?.name ?? trackId)
                      .join(" · ")}
                  </span>
                  <div className="reviewer-invitation-actions">
                    {invitation.status === "pending" && invitation.deliveryState === "retryable" ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        aria-label={`Retry invitation to ${invitation.email}`}
                        disabled={invitationRetryMutation.isPending}
                        onClick={() => invitationRetryMutation.mutate(invitation.id)}
                      >
                        Retry
                      </button>
                    ) : null}
                    {invitation.status === "pending" ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        aria-label={`Revoke invitation to ${invitation.email}`}
                        disabled={invitationRevokeMutation.isPending}
                        onClick={() => invitationRevokeMutation.mutate(invitation.id)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {query.isSuccess && query.data.reviewers.length > 0 ? (
        <ul className="reviewer-list">
          {query.data.reviewers.map((reviewer) => (
            <li key={reviewer.id}>
              <div>
                <strong>{reviewer.name}</strong>
                <span>{reviewer.email}</span>
              </div>
              <button
                className="reviewer-tracks reviewer-tracks-button"
                type="button"
                aria-label={`Edit access for ${reviewer.name}`}
                onClick={() => {
                  setEditingReviewerId(reviewer.id);
                  setEditTrackIds(reviewer.trackIds);
                  setMessage(null);
                }}
              >
                {reviewer.trackIds
                  .map((trackId) => event.tracks.find((track) => track.id === trackId)?.name ?? trackId)
                  .join(" · ")}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                aria-label={`Remove access for ${reviewer.name}`}
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(reviewer.id)}
              >
                Remove access
              </button>
              {editingReviewerId === reviewer.id ? (
                <fieldset className="reviewer-track-editor">
                  <legend>Edit assigned tracks</legend>
                  <div className="reviewer-track-options">
                    {event.tracks.map((track) => (
                      <label key={track.id}>
                        <input
                          type="checkbox"
                          checked={editTrackIds.includes(track.id)}
                          onChange={(change) =>
                            setEditTrackIds((current) =>
                              change.target.checked
                                ? [...current, track.id]
                                : current.filter((trackId) => trackId !== track.id),
                            )
                          }
                        />
                        {track.name}
                      </label>
                    ))}
                  </div>
                  <div className="reviewer-track-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={editMutation.isPending || editTrackIds.length === 0}
                      onClick={() =>
                        editMutation.mutate({ reviewerId: reviewer.id, trackIds: editTrackIds })
                      }
                    >
                      {editMutation.isPending ? "Saving…" : "Save tracks"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => setEditingReviewerId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </fieldset>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatSessionFormat(value?: string) {
  if (!value) return "Not specified";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const STANDARD_ANSWER_NAMES = new Set([
  "title",
  "abstract",
  "trackId",
  "sessionFormat",
  "workshopDuration",
  "speakers",
  "speakerName",
  "speakerEmail",
  "biography",
  "coSpeakers",
  "supportingLink",
  "supportingFile",
]);

function answerLabel(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

function answerText(value: SubmissionAnswers[string]): string {
  if (value === null || value === "") return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => answerText(item as SubmissionAnswers[string])).join(", ");
  }
  if ("name" in value && typeof value.name === "string") return value.name;
  return Object.entries(value)
    .map(([key, item]) => `${answerLabel(key)}: ${answerText(item)}`)
    .join(" · ");
}

function speakerAnswerGroups(answers: SubmissionAnswers) {
  if (!Array.isArray(answers.speakers)) return [];
  return answers.speakers.flatMap((speaker, index) => {
    if (!speaker || typeof speaker !== "object" || Array.isArray(speaker)) return [];
    const record = speaker as SubmissionAnswers;
    const entries = Object.entries(record).filter(
      ([name]) => !["name", "email", "biography", "bio"].includes(name),
    );
    if (entries.length === 0) return [];
    return [
      {
        index,
        label:
          typeof record.name === "string" && record.name
            ? record.name
            : `Speaker ${index + 1}`,
        entries,
      },
    ];
  });
}

function ProposalInspector({
  eventId,
  proposal,
  auditEvents,
  isAdmin,
  onClose,
}: {
  eventId: string;
  proposal: OrganizerProposal;
  auditEvents: ProposalAuditEvent[];
  isAdmin: boolean;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [committeeNote, setCommitteeNote] = useState(proposal.committeeNote);
  const [message, setMessage] = useState<string | null>(null);
  const supportingFile = proposal.supportingFile ?? null;
  const coSpeakers = proposal.coSpeakers ?? [];
  const additionalAnswers = Object.entries(proposal.answers ?? {}).filter(
    ([name]) => !STANDARD_ANSWER_NAMES.has(name),
  );
  const speakerAnswers = speakerAnswerGroups(proposal.answers ?? {});

  useEffect(() => {
    setCommitteeNote(proposal.committeeNote);
    setMessage(null);
  }, [proposal.id]);

  useEffect(() => {
    if (!window.matchMedia?.("(max-width: 960px)").matches) return;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [proposal.id]);

  const mutation = useMutation({
    mutationFn: (input: { status?: ProposalStatus; committeeNote?: string }) =>
      updateProposalReview(eventId, proposal.id, {
        ...input,
        expectedVersion: proposal.reviewVersion ?? 0,
      }),
    onSuccess: (data: ProposalReviewResponse, variables) => {
      queryClient.setQueryData(
        ["proposal-review", eventId, proposal.id],
        data,
      );
      queryClient.setQueriesData<OrganizerProposal[]>(
        { queryKey: ["proposals", eventId] },
        (current) =>
          current?.map((item) =>
            item.id === data.proposal.id ? data.proposal : item,
          ),
      );
      void queryClient.invalidateQueries({ queryKey: ["proposals", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      setMessage(
        variables.status
          ? `Internal decision changed to ${statusLabel(variables.status)}.`
          : "Committee note saved.",
      );
    },
  });

  function decide(status: ProposalStatus) {
    setMessage(null);
    mutation.mutate({ status });
  }

  const outcomeMutation = useMutation({
    mutationFn: (outcome: ProgramOutcome) =>
      createDecisionCourseCheck(eventId, {
        proposalId: proposal.id,
        outcome,
        idempotencyKey: `ui-decision-${proposal.id}-${outcome}-${createClientId()}`,
      }),
    onSuccess: (plan) => {
      void navigate({
        to: "/e/$eventId/course-checks/$planId",
        params: { eventId, planId: plan.id },
      });
    },
  });

  return (
    <div
      className="inspector-content"
      onKeyDown={(key) => {
        if (key.key === "Escape") onClose?.();
      }}
    >
      <div className="inspector-header">
        <button
          ref={closeRef}
          className="inspector-close btn btn-secondary btn-sm"
          type="button"
          onClick={onClose}
        >
          Back to queue
        </button>
        <div className="inspector-kicker">{proposal.id}</div>
        <h2>{proposal.title}</h2>
        <div className="inspector-who">
          <span className="avatar" aria-hidden="true">
            {initials(proposal.speakerName)}
          </span>
          <span>
            {proposal.speakerName}
            <span className="talk-sub"> · {proposal.speakerEmail}</span>
          </span>
          <span className={`flag flag-box flag-${proposal.status}`}>
            {statusLabel(proposal.status)}
          </span>
        </div>
      </div>
      <div className="inspector-body">
        <section className="panel">
          <h3>Session</h3>
          <dl className="inspector-meta">
            <div>
              <dt>Track</dt>
              <dd><span className={`track ${trackClass(proposal.trackId)}`}>{proposal.trackName}</span></dd>
            </div>
            <div>
              <dt>Session format</dt>
              <dd>{formatSessionFormat(proposal.sessionFormat)}</dd>
            </div>
            {proposal.sessionFormat === "workshop" || proposal.workshopDuration ? (
              <div>
                <dt>Workshop duration</dt>
                <dd>{proposal.workshopDuration || "Not specified"}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="panel">
          <h3>Abstract</h3>
          <p>{proposal.abstract}</p>
        </section>
        <section className="panel">
          <h3>Biography</h3>
          <p>{proposal.biography}</p>
        </section>
        {coSpeakers.length > 0 ? (
          <section className="panel">
            <h3>Co-speakers</h3>
            <ul className="inspector-list">
              {coSpeakers.map((speaker) => (
                <li key={`${speaker.email}-${speaker.name}`}>
                  <strong>{speaker.name}</strong>
                  <span className="talk-sub"> · {speaker.email}</span>
                  {speaker.biography ? <p>{speaker.biography}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {speakerAnswers.length > 0 ? (
          <section className="panel">
            <h3>Speaker responses</h3>
            <dl className="answer-list">
              {speakerAnswers.flatMap((speaker) =>
                speaker.entries.map(([name, value]) => (
                  <div key={`${speaker.index}-${name}`}>
                    <dt>{speaker.label} · {answerLabel(name)}</dt>
                    <dd>{answerText(value)}</dd>
                  </div>
                )),
              )}
            </dl>
          </section>
        ) : null}
        {additionalAnswers.length > 0 ? (
          <section className="panel">
            <h3>Additional responses</h3>
            <dl className="answer-list">
              {additionalAnswers.map(([name, value]) => (
                <div key={name}>
                  <dt>{answerLabel(name)}</dt>
                  <dd>{answerText(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section className="panel">
          <h3>Supporting materials</h3>
          <p>
            {proposal.supportingLink ? (
              <a href={proposal.supportingLink} rel="noreferrer" target="_blank">
                {proposal.supportingLink}
              </a>
            ) : (
              "No supporting link"
            )}
          </p>
          {supportingFile?.status === "complete" ? (
            <p>
              <strong>{supportingFile.name}</strong>
              <span className="talk-sub"> · {(supportingFile.size / 1024).toFixed(1)} KB · {supportingFile.mime}</span>
            </p>
          ) : null}
        </section>
        <section className="panel committee-note-panel">
          <label htmlFor={`committee-note-${proposal.id}`}>Committee note</label>
          <textarea
            id={`committee-note-${proposal.id}`}
            value={committeeNote}
            onChange={(change) => setCommitteeNote(change.target.value)}
            placeholder="Add reasoning for the review committee…"
          />
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={mutation.isPending || committeeNote.trim() === proposal.committeeNote}
            onClick={() => {
              setMessage(null);
              mutation.mutate({ committeeNote: committeeNote.trim() });
            }}
          >
            Save committee note
          </button>
        </section>
        <section className="panel audit-panel">
          <h3>Review history</h3>
          {auditEvents.length === 0 ? (
            <p>No review changes yet.</p>
          ) : (
            <details>
              <summary>
                <strong>{auditEvents[0]!.actorName}</strong>{" "}
                {auditEvents[0]!.type === "proposal.review.changed"
                  ? `set ${statusLabel(auditEvents[0]!.toStatus as ProposalStatus)}`
                  : auditEventLabel(
                      auditEvents[0]!.type,
                      String(auditEvents[0]!.toStatus),
                    )}
                <span>{formatSubmittedAt(auditEvents[0]!.createdAt)}</span>
              </summary>
              <ol>
                {auditEvents.map((audit) => (
                  <li key={audit.id}>
                    {audit.type === "proposal.review.changed" ? (
                      <>
                        <strong>{audit.actorName}</strong> set{" "}
                        {statusLabel(audit.toStatus as ProposalStatus)}
                        {audit.committeeNoteChanged
                          ? " and updated the committee note"
                          : ""}
                        .
                      </>
                    ) : (
                      <>
                        <strong>{audit.actorName}</strong>{" "}
                        {auditEventLabel(audit.type, String(audit.toStatus))}.
                      </>
                    )}
                    <time dateTime={audit.createdAt}>{formatSubmittedAt(audit.createdAt)}</time>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
        <p className="internal-only-note">Internal only. No speaker email is sent when this decision changes.</p>
        {isAdmin ? (
          <section className="panel final-outcome-panel" aria-label="Final program outcome">
            <h3>Final program outcome</h3>
            <p className="internal-only-note">
              Accepted or declined opens Course Check. This is separate from Approve / Maybe /
              Deny above and does not send speaker email.
            </p>
            {proposal.programOutcome ? (
              <p role="status">
                Final outcome: <strong>{proposal.programOutcome}</strong>
              </p>
            ) : (
              <div className="final-outcome-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={outcomeMutation.isPending}
                  onClick={() => outcomeMutation.mutate("accepted")}
                >
                  Accept via Course Check
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={outcomeMutation.isPending}
                  onClick={() => outcomeMutation.mutate("declined")}
                >
                  Decline via Course Check
                </button>
              </div>
            )}
            {outcomeMutation.isError ? (
              <p className="form-message" data-tone="error" role="alert">
                {outcomeMutation.error.message}
              </p>
            ) : null}
          </section>
        ) : null}
        {mutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">{mutation.error.message}</p>
        ) : message ? (
          <p className="form-message" role="status">{message}</p>
        ) : null}
      </div>
      <div className="inspector-footer" aria-label="Internal decision">
        {(["unreviewed", "approve", "maybe", "deny"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`btn btn-${status} btn-sm`}
            aria-pressed={proposal.status === status}
            disabled={mutation.isPending || proposal.status === status}
            onClick={() => decide(status)}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>
    </div>
  );
}
