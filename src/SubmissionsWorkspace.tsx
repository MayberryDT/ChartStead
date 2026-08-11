import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { EventRecord, OrganizerProposal } from "../shared/events";
import { fetchProposals } from "./api";

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

function statusLabel(status: OrganizerProposal["status"]) {
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

export function SubmissionsWorkspace({
  event,
  selectedProposalId,
  onSelectProposal,
  cfpHref,
}: {
  event: EventRecord;
  selectedProposalId?: string | null;
  onSelectProposal?: (proposalId: string) => void;
  cfpHref: string;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search), 150);
    return () => window.clearTimeout(handle);
  }, [search]);

  const query = useQuery({
    queryKey: ["proposals", event.id, debounced],
    queryFn: () => fetchProposals(event.id, debounced),
  });

  const proposals = query.data ?? [];
  const selected = useMemo(() => {
    if (!proposals.length) return null;
    return (
      proposals.find((proposal) => proposal.id === selectedProposalId) ??
      proposals[0]
    );
  }, [proposals, selectedProposalId]);

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
        <a className="btn btn-primary btn-sm" href={cfpHref}>
          Open CFP form
        </a>
      </div>

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
              No proposals match this search. Public CFP submissions appear here
              after speakers submit.
            </p>
          ) : (
            <table className="grid">
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
                {proposals.map((proposal) => (
                  <tr
                    key={proposal.id}
                    data-id={proposal.id}
                    aria-selected={selected?.id === proposal.id}
                    onClick={() => onSelectProposal?.(proposal.id)}
                  >
                    <td>
                      <span className="avatar" aria-hidden="true">
                        {initials(proposal.speakerName)}
                      </span>
                    </td>
                    <td>
                      <div className="talk">
                        <a
                          href={`/e/${event.id}/submissions/${proposal.id}`}
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
                            onSelectProposal?.(proposal.id);
                          }}
                        >
                          {proposal.title}
                        </a>
                      </div>
                      <div className="talk-sub">
                        {proposal.speakerName} ·{" "}
                        <a
                          href={`/e/${event.id}/submissions/${proposal.id}`}
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
                            onSelectProposal?.(proposal.id);
                          }}
                        >
                          {proposal.id}
                        </a>
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
                    <td className="muted">
                      {formatSubmittedAt(proposal.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="inspector" aria-label="Proposal detail">
          {selected ? (
            <ProposalInspector proposal={selected} />
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

function formatSessionFormat(value: string) {
  if (!value) return "Not specified";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ProposalInspector({ proposal }: { proposal: OrganizerProposal }) {
  const supportingFile = proposal.supportingFile ?? null;
  const coSpeakers = proposal.coSpeakers ?? [];
  return (
    <>
      <div className="inspector-header">
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
              <dd>
                <span className={`track ${trackClass(proposal.trackId)}`}>
                  {proposal.trackName}
                </span>
              </dd>
            </div>
            <div>
              <dt>Session format</dt>
              <dd>{formatSessionFormat(proposal.sessionFormat)}</dd>
            </div>
            {proposal.sessionFormat === "workshop" ||
            proposal.workshopDuration ? (
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
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="panel">
          <h3>Supporting link</h3>
          <p>
            {proposal.supportingLink ? (
              <a href={proposal.supportingLink} rel="noreferrer" target="_blank">
                {proposal.supportingLink}
              </a>
            ) : (
              "None provided"
            )}
          </p>
        </section>
        <section className="panel">
          <h3>Supporting file</h3>
          {supportingFile?.status === "complete" ? (
            <p>
              <strong>{supportingFile.name}</strong>
              <span className="talk-sub">
                {" "}
                · {(supportingFile.size / 1024).toFixed(1)} KB ·{" "}
                {supportingFile.mime}
              </span>
            </p>
          ) : (
            <p>None provided</p>
          )}
        </section>
        <section className="panel">
          <h3>Committee note</h3>
          <p>{proposal.committeeNote || "No committee note yet."}</p>
        </section>
        <section className="panel">
          <h3>Private note</h3>
          <p>{proposal.privateNote || "No private note yet."}</p>
        </section>
      </div>
      <div className="inspector-footer">
        <button type="button" className="btn btn-approve btn-sm" disabled>
          Approve
        </button>
        <button type="button" className="btn btn-maybe btn-sm" disabled>
          Maybe
        </button>
        <button type="button" className="btn btn-deny btn-sm" disabled>
          Deny
        </button>
      </div>
    </>
  );
}
