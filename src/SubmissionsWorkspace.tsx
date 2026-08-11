import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  EventRecord,
  OrganizerPrincipal,
  OrganizerProposal,
  ProposalAuditEvent,
  ProposalReviewResponse,
  ProposalStatus,
  SubmissionAnswers,
} from "../shared/events";
import {
  fetchOrganizerProposal,
  fetchProposals,
  fetchReviewerAssignments,
  grantReviewerTracks,
  updateProposalReview,
} from "./api";

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
  const [search, setSearch] = useState(queue.query);
  const [routingOpen, setRoutingOpen] = useState(false);

  useEffect(() => setSearch(queue.query), [queue.query]);
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
        <label className="toolbar-select">
          <span>Track</span>
          <select
            aria-label="Track filter"
            value={queue.track}
            onChange={(change) => setQueue({ track: change.target.value })}
          >
            <option value="">All assigned tracks</option>
            {event.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span>Sort</span>
          <select
            aria-label="Sort submissions"
            value={queue.sort}
            onChange={(change) =>
              setQueue({ sort: change.target.value as ProposalQueueState["sort"] })
            }
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title-asc">Title A-Z</option>
            <option value="speaker-asc">Speaker A-Z</option>
          </select>
        </label>
        <span className="toolbar-spacer" />
        {currentRole === "admin" ? (
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            aria-expanded={routingOpen}
            onClick={() => setRoutingOpen((open) => !open)}
          >
            Reviewer routing
          </button>
        ) : null}
        <a className="btn btn-primary btn-sm" href={cfpHref}>
          Open CFP form
        </a>
      </div>

      {routingOpen && currentRole === "admin" ? (
        <ReviewerRouting event={event} />
      ) : null}

      <div className="split">
        <div className="table-wrap">
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
                      tabIndex={0}
                      onClick={() => onSelectProposal?.(proposal.id)}
                      onKeyDown={(key) => {
                        if (key.target !== key.currentTarget) return;
                        if (key.key === "Enter" || key.key === " ") {
                          key.preventDefault();
                          onSelectProposal?.(proposal.id);
                        }
                      }}
                    >
                      <td>
                        <span className="avatar" aria-hidden="true">
                          {initials(proposal.speakerName)}
                        </span>
                      </td>
                      <td>
                        <div className="talk">
                          <ProposalLink
                            href={href}
                            proposalId={proposal.id}
                            onSelectProposal={onSelectProposal}
                          >
                            {proposal.title}
                          </ProposalLink>
                        </div>
                        <div className="talk-sub">
                          {proposal.speakerName} ·{" "}
                          <ProposalLink
                            href={href}
                            proposalId={proposal.id}
                            onSelectProposal={onSelectProposal}
                          >
                            {proposal.id}
                          </ProposalLink>
                        </div>
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
      href={href}
      onClick={(click) => {
        click.stopPropagation();
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
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reviewers", event.id],
    queryFn: () => fetchReviewerAssignments(event.id),
  });
  const mutation = useMutation({
    mutationFn: () => grantReviewerTracks(event.id, { email, trackIds }),
    onSuccess: (reviewer) => {
      setMessage(`${reviewer.name} can now review ${reviewer.trackIds.length} track${reviewer.trackIds.length === 1 ? "" : "s"}.`);
      setEmail("");
      setTrackIds([]);
      void queryClient.invalidateQueries({ queryKey: ["reviewers", event.id] });
    },
  });

  return (
    <section className="reviewer-routing" aria-labelledby="reviewer-routing-title">
      <div>
        <p className="eyebrow">Committee access</p>
        <h2 id="reviewer-routing-title">Reviewer routing</h2>
        <p>Assign people who have already signed in. Reviewers only see proposals in these tracks.</p>
      </div>
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
          {mutation.isPending ? "Saving…" : "Grant review access"}
        </button>
      </form>
      {mutation.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {mutation.error.message}
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
      {query.isSuccess && query.data.length > 0 ? (
        <ul className="reviewer-list">
          {query.data.map((reviewer) => (
            <li key={reviewer.id}>
              <strong>{reviewer.name}</strong>
              <span>{reviewer.email}</span>
              <span>
                {reviewer.trackIds
                  .map((trackId) => event.tracks.find((track) => track.id === trackId)?.name ?? trackId)
                  .join(" · ")}
              </span>
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
  onClose,
}: {
  eventId: string;
  proposal: OrganizerProposal;
  auditEvents: ProposalAuditEvent[];
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
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
            <ol>
              {auditEvents.map((audit) => (
                <li key={audit.id}>
                  <strong>{audit.actorName}</strong> set {statusLabel(audit.toStatus)}
                  {audit.committeeNoteChanged ? " and updated the committee note" : ""}.
                  <time dateTime={audit.createdAt}>{formatSubmittedAt(audit.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="internal-only-note">Internal only. No speaker email is sent when this decision changes.</p>
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
