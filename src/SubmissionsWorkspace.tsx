import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
  EvaluationRoundAssignment,
  EvaluationRoundDistributionPreview,
  ProposalAuditEvent,
  ProposalScorecardReviewProjection,
  ScorecardCriterionValue,
  ProposalReviewResponse,
  ReviewProgressReminderDraft,
  ReviewResultsResponse,
  ProposalStatus,
  SubmissionAnswers,
} from "../shared/events";
import { auditEventLabel } from "../shared/portal-lifecycle";
import {
  createDecisionCourseCheck,
  distributeEvaluationRoundAssignments,
  fetchEvaluationPlan,
  fetchEvaluationRoundAssignments,
  fetchOrganizerProposal,
  fetchReviewResults,
  fetchReviewProgress,
  fetchProposals,
  fetchReviewerAssignments,
  grantReviewerTracks,
  previewReviewReminders,
  previewEvaluationRoundDistribution,
  retryReviewerInvitation,
  retryReviewReminder,
  revokeReviewerInvitation,
  revokeReviewerAccess,
  setEvaluationRoundAssignment,
  updateReviewerTracks,
  sendReviewReminders,
  recuseProposalReview,
  updateProposalReview,
  reviewResultsCsvUrl,
} from "./api";
import { AppSelect } from "./AppSelect";
import { createClientId } from "./id";

export type ProposalSort =
  | "newest"
  | "oldest"
  | "title-asc"
  | "title-desc"
  | "track-asc"
  | "track-desc"
  | "status-asc"
  | "status-desc"
  | "speaker-asc"
  | "aggregate-asc"
  | "aggregate-desc";

export interface ProposalQueueState {
  query: string;
  status: ProposalStatus | "all";
  track: string;
  roundId: string;
  sort: ProposalSort;
}

export type BatchChrome = {
  selectedCount: number;
  selectableCount: number;
  allVisibleSelected: boolean;
  batchMessage: string | null;
  isPending: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClear: () => void;
};

export type ReviewChrome = {
  open: boolean;
  onOpen: () => void;
};

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
  if (trackId.includes("course")) return "track-course";
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
  if (queue.roundId) params.set("roundId", queue.roundId);
  if (queue.sort !== "newest") params.set("sort", queue.sort);
  const suffix = params.size > 0 ? `?${params}` : "";
  return `/e/${eventId}/submissions/${proposalId}${suffix}`;
}

function decisionBatchStorageKey(eventId: string) {
  return `chartstead:decision-batch:${eventId}`;
}

type QueueCol = "talk" | "track" | "status" | "score" | "submitted";

const QUEUE_COL_DEFAULTS: Record<QueueCol, number> = {
  talk: 280,
  track: 148,
  status: 124,
  score: 108,
  submitted: 118,
};

const QUEUE_COL_MIN: Record<QueueCol, number> = {
  talk: 180,
  track: 128,
  status: 112,
  score: 96,
  submitted: 108,
};

// v2: Talk is fixed+resizable; Submitted absorbs leftover (resize direction stays correct).
const QUEUE_COL_STORAGE = "chartstead:submission-cols:v2";

function loadQueueColWidths(): Record<QueueCol, number> {
  try {
    const raw = localStorage.getItem(QUEUE_COL_STORAGE);
    if (!raw) return { ...QUEUE_COL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<QueueCol, number>>;
    return {
      talk: Math.max(QUEUE_COL_MIN.talk, Number(parsed.talk) || QUEUE_COL_DEFAULTS.talk),
      track: Math.max(QUEUE_COL_MIN.track, Number(parsed.track) || QUEUE_COL_DEFAULTS.track),
      status: Math.max(QUEUE_COL_MIN.status, Number(parsed.status) || QUEUE_COL_DEFAULTS.status),
      score: Math.max(QUEUE_COL_MIN.score, Number(parsed.score) || QUEUE_COL_DEFAULTS.score),
      submitted: Math.max(
        QUEUE_COL_MIN.submitted,
        Number(parsed.submitted) || QUEUE_COL_DEFAULTS.submitted,
      ),
    };
  } catch {
    return { ...QUEUE_COL_DEFAULTS };
  }
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

/** Shared shell toolbar slot for Submissions: queue filters and batch actions. */
export function SubmissionsCommandBar({
  event,
  principal,
  queue,
  onQueueChange,
  batch,
  review,
}: {
  event: EventRecord;
  principal: OrganizerPrincipal;
  queue: ProposalQueueState;
  onQueueChange: (next: ProposalQueueState) => void;
  batch?: BatchChrome | null;
  review?: ReviewChrome | null;
}) {
  const [search, setSearch] = useState(queue.query);
  const selectedCount = batch?.selectedCount ?? 0;
  const batchDisabled = !batch || selectedCount === 0 || batch.isPending;
  const currentRole = principal.rolesByEvent?.[event.id] ?? principal.role;
  const planQuery = useQuery({
    queryKey: ["evaluation-plan", event.id],
    queryFn: () => fetchEvaluationPlan(event.id),
  });
  const rounds = planQuery.data?.plan?.rounds ?? [];

  useEffect(() => setSearch(queue.query), [queue.query]);
  useEffect(() => {
    if (search === queue.query) return;
    const handle = window.setTimeout(
      () => onQueueChange({ ...queue, query: search }),
      150,
    );
    return () => window.clearTimeout(handle);
  }, [onQueueChange, queue, search]);
  useEffect(() => {
    if (queue.roundId || rounds.length === 0 || currentRole === "admin") return;
    onQueueChange({ ...queue, roundId: rounds[0]!.id });
  }, [currentRole, onQueueChange, queue, rounds]);

  function setQueue(patch: Partial<ProposalQueueState>) {
    onQueueChange({ ...queue, ...patch });
  }

  return (
    <div className="topbar-tools-inner">
      <label className="field search-field topbar-search">
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
        {(["all", "unreviewed", "approve", "maybe", "deny"] as const).map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={queue.status === status}
            onClick={() => setQueue({ status })}
          >
            {status === "all" ? "All" : statusLabel(status)}
          </button>
        ))}
      </div>
      <div className="topbar-track">
        <AppSelect
          label="Track"
          ariaLabel="Track filter"
          value={queue.track}
          options={[
            { value: "", label: "All tracks" },
            ...event.tracks.map((track) => ({ value: track.id, label: track.name })),
          ]}
          onValueChange={(track) => setQueue({ track })}
        />
      </div>
      {rounds.length > 0 ? (
        <div className="topbar-track">
          <AppSelect
            label="Round"
            ariaLabel="Evaluation round"
            value={queue.roundId}
            options={[
              ...(currentRole === "admin" ? [{ value: "", label: "All rounds" }] : []),
              ...rounds.map((round) => ({ value: round.id, label: round.name })),
            ]}
            onValueChange={(roundId) => setQueue({ roundId })}
          />
        </div>
      ) : null}
      {review ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-pressed={review.open}
          onClick={review.onOpen}
        >
          Review
        </button>
      ) : null}
      {batch ? (
        <>
          <span className="topbar-tools-spacer" aria-hidden="true" />
          <div
            className={`topbar-batch${selectedCount === 0 ? " topbar-batch-idle" : ""}`}
            role="region"
            aria-label="Batch final decisions"
          >
            <strong className="topbar-batch-count">
              {selectedCount === 0 ? "None selected" : `${selectedCount} selected`}
            </strong>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={batchDisabled}
              onClick={() => batch.onAccept()}
            >
              Accept batch
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={batchDisabled}
              onClick={() => batch.onDecline()}
            >
              Decline batch
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedCount === 0}
              onClick={() => batch.onClear()}
            >
              Clear
            </button>
            {batch.batchMessage ? (
              <span className="form-message" data-tone="error">
                {batch.batchMessage}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function toggleColumnSort(current: ProposalSort, column: "title" | "track" | "status" | "submitted" | "aggregate"): ProposalSort {
  if (column === "title") return current === "title-asc" ? "title-desc" : "title-asc";
  if (column === "track") return current === "track-asc" ? "track-desc" : "track-asc";
  if (column === "status") return current === "status-asc" ? "status-desc" : "status-asc";
  if (column === "aggregate") return current === "aggregate-desc" ? "aggregate-asc" : "aggregate-desc";
  return current === "newest" ? "oldest" : "newest";
}

function sortAria(current: ProposalSort, column: "title" | "track" | "status" | "submitted" | "aggregate") {
  if (column === "title") {
    if (current === "title-asc") return "ascending" as const;
    if (current === "title-desc") return "descending" as const;
  }
  if (column === "track") {
    if (current === "track-asc") return "ascending" as const;
    if (current === "track-desc") return "descending" as const;
  }
  if (column === "status") {
    if (current === "status-asc") return "ascending" as const;
    if (current === "status-desc") return "descending" as const;
  }
  if (column === "aggregate") {
    if (current === "aggregate-asc") return "ascending" as const;
    if (current === "aggregate-desc") return "descending" as const;
  }
  if (column === "submitted") {
    if (current === "oldest") return "ascending" as const;
    if (current === "newest") return "descending" as const;
  }
  return "none" as const;
}

function filterAndSortProposals(
  rows: OrganizerProposal[],
  queue: ProposalQueueState,
): OrganizerProposal[] {
  const needle = queue.query.trim().toLowerCase();
  let next = rows;
  if (queue.status !== "all") {
    next = next.filter((row) => row.status === queue.status);
  }
  if (queue.track) {
    next = next.filter((row) => row.trackId === queue.track);
  }
  if (needle) {
    next = next.filter((row) => {
      const hay = [
        row.title,
        row.speakerName,
        row.id,
        row.trackName,
        row.speakerEmail,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }
  const sorted = [...next];
  switch (queue.sort) {
    case "oldest":
      sorted.sort(
        (a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id),
      );
      break;
    case "title-asc":
      sorted.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
      break;
    case "title-desc":
      sorted.sort((a, b) => b.title.localeCompare(a.title) || a.id.localeCompare(b.id));
      break;
    case "track-asc":
      sorted.sort(
        (a, b) => a.trackName.localeCompare(b.trackName) || a.id.localeCompare(b.id),
      );
      break;
    case "track-desc":
      sorted.sort(
        (a, b) => b.trackName.localeCompare(a.trackName) || a.id.localeCompare(b.id),
      );
      break;
    case "status-asc":
      sorted.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));
      break;
    case "status-desc":
      sorted.sort((a, b) => b.status.localeCompare(a.status) || a.id.localeCompare(b.id));
      break;
    case "speaker-asc":
      sorted.sort(
        (a, b) => a.speakerName.localeCompare(b.speakerName) || a.id.localeCompare(b.id),
      );
      break;
    case "aggregate-asc":
      sorted.sort((a, b) => {
        const left = a.scorecardAggregate?.aggregateScore;
        const right = b.scorecardAggregate?.aggregateScore;
        if (left === null || left === undefined) return right === null || right === undefined ? a.id.localeCompare(b.id) : 1;
        if (right === null || right === undefined) return -1;
        return left - right || a.id.localeCompare(b.id);
      });
      break;
    case "aggregate-desc":
      sorted.sort((a, b) => {
        const left = a.scorecardAggregate?.aggregateScore;
        const right = b.scorecardAggregate?.aggregateScore;
        if (left === null || left === undefined) return right === null || right === undefined ? a.id.localeCompare(b.id) : 1;
        if (right === null || right === undefined) return -1;
        return right - left || a.id.localeCompare(b.id);
      });
      break;
    case "newest":
    default:
      sorted.sort(
        (a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id),
      );
      break;
  }
  return sorted;
}

export function SubmissionsWorkspace({
  event,
  principal,
  selectedProposalId,
  onSelectProposal,
  onCloseProposal,
  queue,
  onQueueChange,
  onBatchChromeChange,
  onReviewChromeChange,
  focusSelectedRecord = false,
}: {
  event: EventRecord;
  principal: OrganizerPrincipal;
  selectedProposalId?: string | null;
  onSelectProposal?: (proposalId: string) => void;
  onCloseProposal?: () => void;
  queue: ProposalQueueState;
  onQueueChange: (next: ProposalQueueState) => void;
  onBatchChromeChange?: (batch: BatchChrome | null) => void;
  onReviewChromeChange?: (review: ReviewChrome | null) => void;
  focusSelectedRecord?: boolean;
}) {
  const navigate = useNavigate();
  const [inspectorWidth, setInspectorWidth] = useState(560);
  const [queuePaneWidth, setQueuePaneWidth] = useState(0);
  const inspectorWidthRef = useRef(inspectorWidth);
  inspectorWidthRef.current = inspectorWidth;
  const [batchIds, setBatchIds] = useState<Set<string>>(() =>
    restoredDecisionBatch(event.id),
  );
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<QueueCol, number>>(loadQueueColWidths);
  const colWidthsRef = useRef(colWidths);
  const tableRef = useRef<HTMLTableElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  colWidthsRef.current = colWidths;

  useEffect(() => {
    localStorage.setItem(QUEUE_COL_STORAGE, JSON.stringify(colWidths));
  }, [colWidths]);

  function startColResize(column: QueueCol, pointer: ReactPointerEvent<HTMLSpanElement>) {
    pointer.preventDefault();
    pointer.stopPropagation();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const header = handle.closest("th");
    const colEl = tableRef.current?.querySelector<HTMLTableColElement>(`col.col-${column}`);
    const startX = pointer.clientX;
    const startWidth = header?.getBoundingClientRect().width ?? colWidthsRef.current[column];
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      nextWidth = Math.max(QUEUE_COL_MIN[column], Math.round(startWidth + event.clientX - startX));
      if (colEl) colEl.style.width = `${nextWidth}px`;
    };
    const stop = () => {
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      setColWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  useEffect(() => {
    const key = decisionBatchStorageKey(event.id);
    if (batchIds.size === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify([...batchIds]));
  }, [batchIds, event.id]);

  // Event + optional round only. Sort/filter stay client-side so header clicks never wipe the table.
  const query = useQuery({
    queryKey: ["proposals", event.id, queue.roundId || "all"],
    queryFn: () => fetchProposals(event.id, { roundId: queue.roundId || undefined }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const proposals = useMemo(
    () => filterAndSortProposals(query.data ?? [], queue),
    [query.data, queue],
  );
  const showInitialLoading = query.isPending && !query.data;
  const currentRole = principal.rolesByEvent?.[event.id] ?? principal.role;
  const detailQuery = useQuery({
    queryKey: ["proposal-review", event.id, selectedProposalId, queue.roundId],
    queryFn: () => fetchOrganizerProposal(event.id, selectedProposalId!, queue.roundId || undefined),
    enabled: Boolean(selectedProposalId),
    placeholderData: keepPreviousData,
  });
  const resultsQuery = useQuery({
    queryKey: ["review-results", event.id],
    queryFn: () => fetchReviewResults(event.id),
    enabled: currentRole === "admin",
    staleTime: 30_000,
  });
  const listSelected = selectedProposalId
    ? (proposals.find((proposal) => proposal.id === selectedProposalId) ?? null)
    : null;
  const selected = detailQuery.data?.proposal ?? listSelected;
  const auditEvents = selectedProposalId ? (detailQuery.data?.auditEvents ?? []) : [];
  const selectableIds = proposals
    .filter((proposal) => !proposal.programOutcome)
    .map((proposal) => proposal.id);
  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => batchIds.has(id));

  const batchMutation = useMutation({
    mutationFn: (outcome: ProgramOutcome) =>
      createDecisionCourseCheck(event.id, {
        items: [...batchIds].map((proposalId) => ({
          proposalId,
          outcome,
        })),
        idempotencyKey: `ui-batch-${[...batchIds].sort().join("-")}-${outcome}-${createClientId()}`,
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

  useEffect(() => {
    if (!onBatchChromeChange) return;
    if (currentRole !== "admin") {
      onBatchChromeChange(null);
      return;
    }
    onBatchChromeChange({
      selectedCount: batchIds.size,
      selectableCount: selectableIds.length,
      allVisibleSelected,
      batchMessage,
      isPending: batchMutation.isPending,
      onAccept: () => {
        setBatchMessage(null);
        batchMutation.mutate("accepted");
      },
      onDecline: () => {
        setBatchMessage(null);
        batchMutation.mutate("declined");
      },
      onClear: () => setBatchIds(new Set()),
    });
  }, [
    allVisibleSelected,
    batchIds.size,
    batchMessage,
    batchMutation.isPending,
    currentRole,
    onBatchChromeChange,
    selectableIds.length,
  ]);

  useEffect(() => {
    if (!onReviewChromeChange) return;
    if (currentRole !== "admin") {
      onReviewChromeChange(null);
      return;
    }
    onReviewChromeChange({
      open: resultsOpen,
      onOpen: () => setResultsOpen(true),
    });
  }, [currentRole, onReviewChromeChange, resultsOpen]);

  function openProposal(proposalId: string) {
    setResultsOpen(false);
    onSelectProposal?.(proposalId);
  }

  function setSort(column: "title" | "track" | "status" | "submitted" | "aggregate") {
    onQueueChange({ ...queue, sort: toggleColumnSort(queue.sort, column) });
  }

  function toggleSelectAllVisible() {
    setBatchIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        for (const id of selectableIds) next.delete(id);
        return next;
      }
      const next = new Set(current);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  }

  const leadingFixed = (currentRole === "admin" ? 36 : 0) + 40;
  const trailingFixed =
    colWidths.track + colWidths.status + colWidths.score + colWidths.submitted;

  function queueFloorWidth(widths: Record<QueueCol, number> = colWidths) {
    // Minimum queue footprint: Talk at its floor, trailing cols at their current sizes.
    return (
      leadingFixed +
      QUEUE_COL_MIN.talk +
      widths.track +
      widths.status +
      widths.score +
      widths.submitted
    );
  }

  function clampInspectorWidth(
    desired: number,
    splitWidth: number,
    widths: Record<QueueCol, number> = colWidths,
  ) {
    const floor = queueFloorWidth(widths);
    const maxWidth = Math.max(280, Math.floor(splitWidth - 8 - floor));
    return Math.min(maxWidth, Math.max(280, Math.min(desired, maxWidth)));
  }

  // Talk shrinks as the queue pane shrinks (inspector grows). Gap absorbs slack first.
  const talkDisplayWidth = (() => {
    if (queuePaneWidth <= 0) return colWidths.talk;
    const roomForTalk = queuePaneWidth - leadingFixed - trailingFixed;
    if (roomForTalk >= colWidths.talk) return colWidths.talk;
    return Math.max(QUEUE_COL_MIN.talk, roomForTalk);
  })();

  useEffect(() => {
    const splitEl = splitRef.current;
    if (!splitEl) return;
    const apply = () => {
      const splitWidth = splitEl.getBoundingClientRect().width;
      const next = clampInspectorWidth(
        inspectorWidthRef.current,
        splitWidth,
        colWidthsRef.current,
      );
      if (next !== inspectorWidthRef.current) {
        inspectorWidthRef.current = next;
        setInspectorWidth(next);
      }
      splitEl.style.setProperty("--inspector-width", `${next}px`);
      // Queue pane width = split minus gutter minus inspector
      setQueuePaneWidth(Math.max(0, Math.round(splitWidth - 8 - next)));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(splitEl);
    return () => observer.disconnect();
  }, [
    currentRole,
    colWidths.talk,
    colWidths.track,
    colWidths.status,
    colWidths.score,
    colWidths.submitted,
  ]);

  function startInspectorResize(pointer: ReactPointerEvent<HTMLDivElement>) {
    pointer.preventDefault();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const splitEl = handle.parentElement;
    const startX = pointer.clientX;
    const startWidth = inspectorWidthRef.current;
    const widths = colWidthsRef.current;
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      const splitWidth = splitEl?.getBoundingClientRect().width ?? window.innerWidth;
      nextWidth = clampInspectorWidth(
        startWidth + startX - event.clientX,
        splitWidth,
        widths,
      );
      if (splitEl) {
        splitEl.style.setProperty("--inspector-width", `${nextWidth}px`);
        setQueuePaneWidth(Math.max(0, Math.round(splitWidth - 8 - nextWidth)));
      }
    };
    const stop = () => {
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      inspectorWidthRef.current = nextWidth;
      setInspectorWidth(nextWidth);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  return (
    <div className="work" aria-label="Submissions workspace">
      <div
        ref={splitRef}
        className="split"
        style={
          {
            "--inspector-width": `${inspectorWidth}px`,
          } as CSSProperties
        }
      >
        <div className="table-wrap">
          {showInitialLoading ? (
            <p className="empty-state">Loading submissions…</p>
          ) : query.isError && !query.data ? (
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
              {event.submissionCount === 0
                ? "No submissions yet."
                : "No proposals match these queue filters. Try another status, track, or search."}
            </p>
          ) : (
            <table
              ref={tableRef}
              className="grid grid-queue"
              aria-label="Submissions"
              style={{
                minWidth: queueFloorWidth(),
              }}
            >
              <colgroup>
                {currentRole === "admin" ? <col className="col-batch" /> : null}
                <col className="col-avatar" />
                <col className="col-talk" style={{ width: talkDisplayWidth }} />
                <col className="col-gap" />
                <col className="col-track" style={{ width: colWidths.track }} />
                <col className="col-status" style={{ width: colWidths.status }} />
                <col className="col-score" style={{ width: colWidths.score }} />
                <col className="col-submitted" style={{ width: colWidths.submitted }} />
              </colgroup>
              <thead>
                <tr>
                  {currentRole === "admin" ? (
                    <th scope="col" className="col-batch">
                      <input
                        className="batch-check"
                        type="checkbox"
                        aria-label="Select all visible submissions"
                        checked={allVisibleSelected}
                        disabled={selectableIds.length === 0}
                        ref={(node) => {
                          if (!node) return;
                          node.indeterminate =
                            batchIds.size > 0 && !allVisibleSelected &&
                            selectableIds.some((id) => batchIds.has(id));
                        }}
                        onChange={toggleSelectAllVisible}
                      />
                    </th>
                  ) : null}
                  <th scope="col" className="col-avatar">
                    <span className="visually-hidden">Speaker</span>
                  </th>
                  <th scope="col" className="col-talk" aria-sort={sortAria(queue.sort, "title")}>
                    <button type="button" className="th-sort" onClick={() => setSort("title")}>
                      Talk
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(queue.sort, "title") === "ascending"
                          ? "↑"
                          : sortAria(queue.sort, "title") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Talk column"
                      onPointerDown={(event) => startColResize("talk", event)}
                    />
                  </th>
                  <th scope="col" className="col-gap" aria-hidden="true" />
                  <th scope="col" className="col-track" aria-sort={sortAria(queue.sort, "track")}>
                    <button type="button" className="th-sort" onClick={() => setSort("track")}>
                      Track
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(queue.sort, "track") === "ascending"
                          ? "↑"
                          : sortAria(queue.sort, "track") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Track column"
                      onPointerDown={(event) => startColResize("track", event)}
                    />
                  </th>
                  <th scope="col" className="col-status" aria-sort={sortAria(queue.sort, "status")}>
                    <button type="button" className="th-sort" onClick={() => setSort("status")}>
                      Status
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(queue.sort, "status") === "ascending"
                          ? "↑"
                          : sortAria(queue.sort, "status") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Status column"
                      onPointerDown={(event) => startColResize("status", event)}
                    />
                  </th>
                  <th scope="col" className="col-score" aria-sort={sortAria(queue.sort, "aggregate")}>
                    <button type="button" className="th-sort" onClick={() => setSort("aggregate")}>
                      Aggregate
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(queue.sort, "aggregate") === "ascending"
                          ? "↑"
                          : sortAria(queue.sort, "aggregate") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Aggregate column"
                      onPointerDown={(event) => startColResize("score", event)}
                    />
                  </th>
                  <th scope="col" className="col-submitted" aria-sort={sortAria(queue.sort, "submitted")}>
                    <button type="button" className="th-sort" onClick={() => setSort("submitted")}>
                      Submitted
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(queue.sort, "submitted") === "ascending"
                          ? "↑"
                          : sortAria(queue.sort, "submitted") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => {
                  const href = proposalHref(event.id, proposal.id, queue);
                  const locked = Boolean(proposal.programOutcome);
                  return (
                    <tr
                      key={proposal.id}
                      className={`proposal-row${locked ? " proposal-row-locked" : ""}`}
                      data-id={proposal.id}
                      data-polish-id="S-2-row"
                      aria-selected={selectedProposalId === proposal.id}
                      title={
                        locked
                          ? `Final outcome already set (${proposal.programOutcome}). Open to inspect; batch select is locked.`
                          : undefined
                      }
                    >
                      {currentRole === "admin" ? (
                        <td className="col-batch">
                          <input
                            className="batch-check"
                            type="checkbox"
                            aria-label={
                              locked
                                ? `${proposal.id} locked — final outcome already set`
                                : `Select ${proposal.id} for batch decision`
                            }
                            checked={batchIds.has(proposal.id)}
                            disabled={locked}
                            title={
                              locked
                                ? `Final outcome already set (${proposal.programOutcome})`
                                : "Select for batch decision"
                            }
                            onClick={(click) => click.stopPropagation()}
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
                      <td className="col-avatar">
                        <span className="avatar" aria-hidden="true">
                          {initials(proposal.speakerName)}
                        </span>
                      </td>
                      <td className="col-talk">
                        <ProposalLink
                          href={href}
                          proposalId={proposal.id}
                          onSelectProposal={openProposal}
                        >
                          <span className="talk">{proposal.title}</span>
                          <span className="talk-sub">
                            {proposal.speakerName} · {proposal.id}
                          </span>
                        </ProposalLink>
                      </td>
                      <td className="col-gap" aria-hidden="true" />
                      <td className="col-track">
                        <span className={`track ${trackClass(proposal.trackId)}`}>
                          {proposal.trackName}
                        </span>
                      </td>
                      <td className="col-status">
                        <span className={`flag flag-${proposal.status}`}>
                          {statusLabel(proposal.status)}
                        </span>
                      </td>
                      <td className="col-score">
                        {proposal.scorecardAggregate?.aggregateScore == null
                          ? <span className="muted">Unscored</span>
                          : `${proposal.scorecardAggregate.aggregateScore.toFixed(2)}`}
                      </td>
                      <td className="col-submitted muted">
                        {formatSubmittedAt(proposal.submittedAt)}
                      </td>
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
            const splitWidth =
              key.currentTarget.parentElement?.getBoundingClientRect().width ??
              window.innerWidth;
            if (key.key === "ArrowLeft") {
              key.preventDefault();
              setInspectorWidth((width) => {
                const next = clampInspectorWidth(width + 24, splitWidth, colWidthsRef.current);
                inspectorWidthRef.current = next;
                return next;
              });
            } else if (key.key === "ArrowRight") {
              key.preventDefault();
              setInspectorWidth((width) => {
                const next = clampInspectorWidth(width - 24, splitWidth, colWidthsRef.current);
                inspectorWidthRef.current = next;
                return next;
              });
            }
          }}
        />

        <aside
          className={`inspector${selectedProposalId || resultsOpen ? " has-selection" : ""}`}
          aria-label={resultsOpen || (!selectedProposalId && currentRole === "admin") ? "Review results" : "Proposal detail"}
        >
          {currentRole === "admin" && (resultsOpen || !selectedProposalId) ? (
            <ReviewResultsPanel
              eventId={event.id}
              results={resultsQuery.data ?? null}
              queueRows={proposals}
              fallbackTotal={event.submissionCount}
              isLoading={resultsQuery.isPending && !resultsQuery.data}
              error={resultsQuery.error instanceof Error ? resultsQuery.error.message : null}
            />
          ) : selectedProposalId && detailQuery.isError && !selected ? (
            <div className="inspector-body">
              <div className="submission-error" role="alert">
                <strong>Unable to open this proposal.</strong>
                <span>{detailQuery.error.message}</span>
              </div>
            </div>
          ) : selected ? (
            <ProposalInspector
              eventId={event.id}
              roundId={queue.roundId}
              proposal={selected}
              auditEvents={auditEvents}
              scorecard={detailQuery.data?.scorecard ?? null}
              isAdmin={currentRole === "admin"}
              focusRecord={focusSelectedRecord}
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

function ReviewResultsPanel({
  eventId,
  results,
  queueRows,
  fallbackTotal,
  error,
}: {
  eventId: string;
  results: ReviewResultsResponse | null;
  queueRows: OrganizerProposal[];
  fallbackTotal: number;
  isLoading: boolean;
  error: string | null;
}) {
  const rows =
    results?.submissions ??
    queueRows.map((proposal) => ({
      proposalId: proposal.id,
      title: proposal.title,
      speakers: [
        {
          name: proposal.speakerName,
          email: proposal.speakerEmail,
          role: "speaker",
        },
      ],
      completionStatus: "not_started" as const,
      recommendation: proposal.status,
      aggregateScore: proposal.scorecardAggregate?.aggregateScore ?? null,
    }));
  const completed = rows.filter((row) => row.completionStatus === "complete").length;
  const scored = rows.filter((row) => row.aggregateScore !== null);
  const average =
    scored.length === 0
      ? null
      : scored.reduce((sum, row) => sum + (row.aggregateScore ?? 0), 0) / scored.length;
  const incomplete = results ? rows.length - completed : Math.max(fallbackTotal, rows.length);
  const avgLabel = average === null ? "—" : average.toFixed(1);

  return (
    <div className="inspector-content review-results">
      <header className="review-results-header">
        <h2>Review Ledger</h2>
        <a className="btn btn-secondary btn-sm" href={reviewResultsCsvUrl(eventId)}>
          Download CSV
        </a>
      </header>
      <div className="inspector-body">
        {error ? (
          <div className="submission-error" role="alert">
            <strong>Unable to load review results.</strong>
            <span>{error}</span>
          </div>
        ) : null}
        <section className="review-results-metrics" aria-label="Review totals">
          <div className="review-stat review-stat-complete">
            <span className="review-stat-value">{completed}</span>
            <span className="review-stat-label">Complete</span>
          </div>
          <div className="review-stat review-stat-incomplete">
            <span className="review-stat-value">{incomplete}</span>
            <span className="review-stat-label">Incomplete</span>
          </div>
          <div className="review-stat review-stat-average">
            <span className="review-stat-value">{avgLabel}</span>
            <span className="review-stat-label">Average</span>
          </div>
        </section>
        <section className="panel review-results-ledger">
          <h3>Submissions</h3>
          {rows.length === 0 ? (
            <p>No submissions in this queue.</p>
          ) : (
            <ul className="review-results-list">
              {rows.map((row) => (
                <li key={row.proposalId}>
                  <div className="review-results-row-main">
                    <span className="talk">{row.title}</span>
                    <span className="review-results-score">
                      {row.aggregateScore === null ? "—" : row.aggregateScore.toFixed(1)}
                    </span>
                  </div>
                  <span className="talk-sub">
                    {row.speakers.map((speaker) => speaker.name).join(", ") || "No speakers"}
                    {" · "}
                    {row.completionStatus === "complete" ? "Complete" : "Incomplete"}
                    {" · "}
                    {statusLabel(row.recommendation)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function ReviewerRouting({ event }: { event: EventRecord }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [editingReviewerId, setEditingReviewerId] = useState<string | null>(null);
  const [editTrackIds, setEditTrackIds] = useState<string[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [bulkTrackIds, setBulkTrackIds] = useState<string[]>([]);
  const [bulkReviewerIds, setBulkReviewerIds] = useState<string[]>([]);
  const [bulkCap, setBulkCap] = useState("");
  const [distributionPreview, setDistributionPreview] =
    useState<EvaluationRoundDistributionPreview | null>(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(true);
  const [selectedReminderIds, setSelectedReminderIds] = useState<string[]>([]);
  const [reminderDrafts, setReminderDrafts] = useState<ReviewProgressReminderDraft[]>([]);
  const [reminderKey, setReminderKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reviewers", event.id],
    queryFn: () => fetchReviewerAssignments(event.id),
  });
  const planQuery = useQuery({
    queryKey: ["evaluation-plan", event.id],
    queryFn: () => fetchEvaluationPlan(event.id),
  });
  const rounds = planQuery.data?.plan?.enabled ? planQuery.data.plan.rounds : [];
  const selectedRound =
    rounds.find((round) => round.id === selectedRoundId) ?? rounds[0] ?? null;
  const proposalsQuery = useQuery({
    queryKey: ["assignment-proposals", event.id],
    queryFn: () => fetchProposals(event.id, { sort: "track-asc" }),
    enabled: rounds.length > 0,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["round-assignments", event.id, selectedRound?.id ?? ""],
    queryFn: () =>
      selectedRound
        ? fetchEvaluationRoundAssignments(event.id, selectedRound.id)
        : Promise.resolve([] as EvaluationRoundAssignment[]),
    enabled: Boolean(selectedRound),
  });
  const progressQuery = useQuery({
    queryKey: ["review-progress", event.id, selectedRound?.id ?? ""],
    queryFn: () => fetchReviewProgress(event.id, selectedRound?.id ?? null),
    enabled: query.isSuccess && planQuery.isSuccess,
  });
  const assignmentKeys = useMemo(
    () =>
      new Set(
        (assignmentsQuery.data ?? []).map(
          (assignment) => `${assignment.reviewerId}::${assignment.proposalId}`,
        ),
      ),
    [assignmentsQuery.data],
  );

  useEffect(() => {
    if (!selectedRound && selectedRoundId) {
      setSelectedRoundId("");
      return;
    }
    if (selectedRound && selectedRound.id !== selectedRoundId) {
      setSelectedRoundId(selectedRound.id);
      setBulkReviewerIds(selectedRound.reviewerPool);
      setDistributionPreview(null);
      setReminderDrafts([]);
      setSelectedReminderIds([]);
      setReminderKey("");
    }
  }, [selectedRound, selectedRoundId]);
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
  const roundAssignmentMutation = useMutation({
    mutationFn: (input: { proposalId: string; reviewerId: string; assigned: boolean }) => {
      if (!selectedRound) throw new Error("Choose an evaluation round.");
      return setEvaluationRoundAssignment(event.id, selectedRound.id, input);
    },
    onSuccess: () => {
      setMessage("Round assignment updated.");
      void queryClient.invalidateQueries({ queryKey: ["round-assignments", event.id, selectedRound?.id ?? ""] });
    },
  });

  function distributionRequest() {
    return {
      trackIds: bulkTrackIds,
      reviewerIds: bulkReviewerIds,
      maxAssignmentsPerReviewer: bulkCap.trim() ? Number(bulkCap) : null,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!selectedRound) throw new Error("Choose an evaluation round.");
      return previewEvaluationRoundDistribution(
        event.id,
        selectedRound.id,
        distributionRequest(),
      );
    },
    onSuccess: (preview) => {
      setDistributionPreview(preview);
      setMessage("Distribution preview ready.");
    },
  });
  const distributeMutation = useMutation({
    mutationFn: () => {
      if (!selectedRound) throw new Error("Choose an evaluation round.");
      return distributeEvaluationRoundAssignments(
        event.id,
        selectedRound.id,
        distributionRequest(),
      );
    },
    onSuccess: (result) => {
      setDistributionPreview(result.preview);
      setMessage("Round assignments distributed.");
      void queryClient.invalidateQueries({ queryKey: ["round-assignments", event.id, selectedRound?.id ?? ""] });
    },
  });
  const previewReminderMutation = useMutation({
    mutationFn: () =>
      previewReviewReminders(event.id, {
        roundId: progressQuery.data?.round.roundId ?? selectedRound?.id ?? null,
        reviewerIds: selectedReminderIds,
      }),
    onSuccess: (preview) => {
      setReminderDrafts(preview.drafts);
      setReminderKey(`review-reminder-${createClientId()}`);
      setMessage(
        preview.drafts.length === 0
          ? "No incomplete reviewers selected for reminders."
          : `Prepared ${preview.drafts.length} reviewer reminder draft${preview.drafts.length === 1 ? "" : "s"}.`,
      );
    },
  });
  const sendReminderMutation = useMutation({
    mutationFn: () =>
      sendReviewReminders(event.id, {
        roundId: progressQuery.data?.round.roundId ?? selectedRound?.id ?? null,
        idempotencyKey: reminderKey || `review-reminder-${createClientId()}`,
        drafts: reminderDrafts.map((draft) => ({
          reviewerId: draft.reviewerId,
          subject: draft.subject,
          bodyText: draft.bodyText,
        })),
      }),
    onSuccess: (result) => {
      const sent = result.results.filter((entry) => entry.status === "sent").length;
      const retryable = result.results.filter((entry) => entry.status === "retryable").length;
      const failed = result.results.filter((entry) => entry.status === "failed").length;
      setMessage(
        `Reviewer reminders queued: ${result.results.length}; sent ${sent}, retryable ${retryable}, failed ${failed}.`,
      );
      setReminderDrafts([]);
      setSelectedReminderIds([]);
      setReminderKey("");
      void queryClient.invalidateQueries({ queryKey: ["review-progress", event.id, selectedRound?.id ?? ""] });
    },
  });
  const retryReminderMutation = useMutation({
    mutationFn: (outboxId: string) => retryReviewReminder(event.id, outboxId),
    onSuccess: () => {
      setMessage("Reviewer reminder retry requested.");
      void queryClient.invalidateQueries({ queryKey: ["review-progress", event.id, selectedRound?.id ?? ""] });
    },
  });

  const reviewersById = new Map((query.data?.reviewers ?? []).map((reviewer) => [reviewer.id, reviewer]));
  const roundReviewers = selectedRound?.reviewerPool ?? [];
  const reviewProgressRows = progressQuery.data?.reviewers ?? [];
  const visibleReviewProgressRows = showIncompleteOnly
    ? reviewProgressRows.filter((reviewer) => reviewer.outstandingCount > 0)
    : reviewProgressRows;

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
      {mutation.isError || editMutation.isError || invitationRetryMutation.isError || invitationRevokeMutation.isError || roundAssignmentMutation.isError || previewMutation.isError || distributeMutation.isError || previewReminderMutation.isError || sendReminderMutation.isError || retryReminderMutation.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {mutation.error?.message ?? editMutation.error?.message ?? invitationRetryMutation.error?.message ?? invitationRevokeMutation.error?.message ?? roundAssignmentMutation.error?.message ?? previewMutation.error?.message ?? distributeMutation.error?.message ?? previewReminderMutation.error?.message ?? sendReminderMutation.error?.message ?? retryReminderMutation.error?.message}
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
      {query.isSuccess && (query.data.invitations ?? []).length > 0 ? (
        <div className="reviewer-invitations" aria-label="Reviewer invitations">
          <h3>Invitations</h3>
          <ul className="reviewer-list">
            {(query.data.invitations ?? []).map((invitation) => {
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
      {query.isSuccess && (query.data.reviewers ?? []).length > 0 ? (
        <ul className="reviewer-list">
          {(query.data.reviewers ?? []).map((reviewer) => (
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
      {progressQuery.isError ? (
        <div className="submission-error" role="alert">
          <strong>Unable to load review progress.</strong>
          <span>{progressQuery.error.message}</span>
          <button className="btn btn-sm" type="button" onClick={() => void progressQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : null}
      {progressQuery.isSuccess ? (
        <div className="review-progress-panel" aria-label="Review progress and reviewer reminders">
          <div className="reviewer-routing-header">
            <div>
              <h3>Review progress</h3>
              <p className="muted">
                {progressQuery.data.round.roundName}: {progressQuery.data.round.completedCount} of {progressQuery.data.round.assignedCount} assigned reviews complete · {progressQuery.data.round.outstandingCount} outstanding
              </p>
            </div>
            <label className="review-progress-filter">
              <input
                type="checkbox"
                checked={showIncompleteOnly}
                onChange={(change) => setShowIncompleteOnly(change.target.checked)}
              />
              Show incomplete only
            </label>
          </div>
          <div className="review-progress-summary">
            <span><strong>{progressQuery.data.round.percentComplete}%</strong> complete</span>
            <span><strong>{progressQuery.data.incompleteReviewers.length}</strong> incomplete reviewers</span>
            <span><strong>{progressQuery.data.round.overdueReviewerCount}</strong> overdue</span>
          </div>
          {visibleReviewProgressRows.length > 0 ? (
            <ul className="reviewer-list review-progress-list">
              {visibleReviewProgressRows.map((reviewer) => (
                <li key={reviewer.reviewerId} data-overdue={reviewer.overdue ? "true" : "false"}>
                  <div>
                    <label className="review-progress-select">
                      <input
                        type="checkbox"
                        checked={selectedReminderIds.includes(reviewer.reviewerId)}
                        disabled={reviewer.outstandingCount === 0}
                        onChange={(change) =>
                          setSelectedReminderIds((current) =>
                            change.target.checked
                              ? [...new Set([...current, reviewer.reviewerId])]
                              : current.filter((id) => id !== reviewer.reviewerId),
                          )
                        }
                      />
                      <strong>{reviewer.reviewerName}</strong>
                    </label>
                    <span>{reviewer.email || "No email on file"}</span>
                  </div>
                  <span className="reviewer-tracks">
                    {reviewer.completedCount}/{reviewer.assignedCount} complete · {reviewer.outstandingCount} outstanding{reviewer.recusedCount ? ` · ${reviewer.recusedCount} recused` : ""}
                  </span>
                  <span className="reviewer-tracks">
                    {reviewer.overdue ? "Overdue" : reviewer.lastReminderAt ? `Last reminded ${formatSubmittedAt(reviewer.lastReminderAt)}` : "No reminder yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No reviewers match the current progress filter.</p>
          )}
          <div className="reviewer-track-actions">
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={previewReminderMutation.isPending || selectedReminderIds.length === 0}
              onClick={() => previewReminderMutation.mutate()}
            >
              {previewReminderMutation.isPending ? "Preparing…" : "Prepare reminder drafts"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={selectedReminderIds.length === 0}
              onClick={() => setSelectedReminderIds([])}
            >
              Clear reminder selection
            </button>
          </div>
          {reminderDrafts.length > 0 ? (
            <div className="review-reminder-drafts">
              <h4>Editable reminder drafts</h4>
              {reminderDrafts.map((draft) => (
                <article key={draft.reviewerId} className="review-reminder-draft">
                  <label>
                    Subject for {draft.reviewerName}
                    <input
                      type="text"
                      value={draft.subject}
                      onChange={(change) =>
                        setReminderDrafts((current) =>
                          current.map((candidate) =>
                            candidate.reviewerId === draft.reviewerId
                              ? { ...candidate, subject: change.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Body ({draft.pendingCount} pending)
                    <textarea
                      rows={7}
                      value={draft.bodyText}
                      onChange={(change) =>
                        setReminderDrafts((current) =>
                          current.map((candidate) =>
                            candidate.reviewerId === draft.reviewerId
                              ? { ...candidate, bodyText: change.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </label>
                </article>
              ))}
              <div className="reviewer-track-actions">
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={sendReminderMutation.isPending}
                  onClick={() => sendReminderMutation.mutate()}
                >
                  {sendReminderMutation.isPending ? "Queueing…" : "Queue reviewed reminders"}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={sendReminderMutation.isPending}
                  onClick={() => {
                    setReminderDrafts([]);
                    setReminderKey("");
                  }}
                >
                  Discard drafts
                </button>
              </div>
            </div>
          ) : null}
          {progressQuery.data.history.length > 0 ? (
            <div className="review-reminder-history">
              <h4>Reminder history</h4>
              <ul className="reviewer-list">
                {progressQuery.data.history.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.reviewerName || entry.toEmail}</strong>
                      <span>{entry.pendingCount} pending when queued by {entry.actorName}</span>
                    </div>
                    <span className="reviewer-tracks">{entry.status} · {formatSubmittedAt(entry.createdAt)}</span>
                    {entry.outboxId && (entry.status === "failed" || entry.status === "retryable") ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={retryReminderMutation.isPending}
                        onClick={() => retryReminderMutation.mutate(entry.outboxId!)}
                      >
                        Retry
                      </button>
                    ) : <span />}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : progressQuery.isPending ? (
        <p className="muted">Loading review progress…</p>
      ) : null}
      {rounds.length > 0 ? (
        <div className="round-assignment-controls" aria-label="Round submission assignments">
          <div className="reviewer-routing-header">
            <div>
              <h3>Round submission assignments</h3>
              <p className="muted">
                Advanced review is enabled. Reviewer queues only show proposals explicitly assigned here.
              </p>
            </div>
            <label>
              Round
              <select
                value={selectedRound?.id ?? ""}
                onChange={(change) => {
                  setSelectedRoundId(change.target.value);
                  setDistributionPreview(null);
                }}
              >
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.name} ({round.state})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedRound && roundReviewers.length > 0 ? (
            <div className="round-distribution-panel">
              <fieldset>
                <legend>Bulk distribution reviewers</legend>
                {roundReviewers.map((reviewerId) => {
                  const reviewer = reviewersById.get(reviewerId);
                  return (
                    <label key={reviewerId}>
                      <input
                        type="checkbox"
                        checked={bulkReviewerIds.includes(reviewerId)}
                        onChange={(change) => {
                          setDistributionPreview(null);
                          setBulkReviewerIds((current) =>
                            change.target.checked
                              ? [...new Set([...current, reviewerId])]
                              : current.filter((id) => id !== reviewerId),
                          );
                        }}
                      />
                      {reviewer?.name ?? reviewerId}
                    </label>
                  );
                })}
              </fieldset>
              <fieldset>
                <legend>Filter proposals by track</legend>
                {event.tracks.map((track) => (
                  <label key={track.id}>
                    <input
                      type="checkbox"
                      checked={bulkTrackIds.includes(track.id)}
                      onChange={(change) => {
                        setDistributionPreview(null);
                        setBulkTrackIds((current) =>
                          change.target.checked
                            ? [...new Set([...current, track.id])]
                            : current.filter((trackId) => trackId !== track.id),
                        );
                      }}
                    />
                    {track.name}
                  </label>
                ))}
                <span className="muted">Leave all unchecked to include every track.</span>
              </fieldset>
              <label>
                Per-reviewer cap
                <input
                  type="number"
                  min="1"
                  value={bulkCap}
                  placeholder="No cap"
                  onChange={(change) => {
                    setBulkCap(change.target.value);
                    setDistributionPreview(null);
                  }}
                />
              </label>
              <div className="reviewer-track-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={previewMutation.isPending || bulkReviewerIds.length === 0}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? "Previewing…" : "Preview distribution"}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={distributeMutation.isPending || bulkReviewerIds.length === 0 || !distributionPreview}
                  onClick={() => distributeMutation.mutate()}
                >
                  {distributeMutation.isPending ? "Applying…" : "Apply distribution"}
                </button>
              </div>
              {distributionPreview ? (
                <div className="round-distribution-preview" role="status">
                  <strong>{distributionPreview.totalCandidates} candidate proposals</strong>
                  <ul>
                    {distributionPreview.assignments.map((assignment) => (
                      <li key={assignment.reviewerId}>
                        {reviewersById.get(assignment.reviewerId)?.name ?? assignment.reviewerId}: {assignment.count}
                      </li>
                    ))}
                    {distributionPreview.unassignedProposalIds.length > 0 ? (
                      <li>{distributionPreview.unassignedProposalIds.length} left unassigned by the cap</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : selectedRound ? (
            <p className="muted">Add reviewers to this round before assigning submissions.</p>
          ) : null}

          {selectedRound && proposalsQuery.isSuccess && assignmentsQuery.isSuccess ? (
            <div className="round-assignment-list">
              <h4>Specific proposal access</h4>
              <ul className="reviewer-list">
                {proposalsQuery.data.map((proposal) => (
                  <li key={proposal.id}>
                    <div>
                      <strong>{proposal.title}</strong>
                      <span>{proposal.trackName} · {proposal.id}</span>
                    </div>
                    <div className="reviewer-track-options">
                      {roundReviewers.map((reviewerId) => {
                        const key = `${reviewerId}::${proposal.id}`;
                        const reviewer = reviewersById.get(reviewerId);
                        return (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={assignmentKeys.has(key)}
                              disabled={roundAssignmentMutation.isPending}
                              onChange={(change) =>
                                roundAssignmentMutation.mutate({
                                  proposalId: proposal.id,
                                  reviewerId,
                                  assigned: change.target.checked,
                                })
                              }
                            />
                            {reviewer?.name ?? reviewerId}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : selectedRound ? (
            <p className="muted">Loading proposal assignments…</p>
          ) : null}
        </div>
      ) : planQuery.isSuccess && planQuery.data.plan ? (
        <p className="muted">Advanced review is disabled; reviewers continue using the shared track queue.</p>
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
  roundId,
  proposal,
  auditEvents,
  scorecard,
  isAdmin,
  focusRecord,
  onClose,
}: {
  eventId: string;
  roundId: string;
  proposal: OrganizerProposal;
  auditEvents: ProposalAuditEvent[];
  scorecard: ProposalScorecardReviewProjection | null;
  isAdmin: boolean;
  focusRecord: boolean;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const recordTitleRef = useRef<HTMLHeadingElement>(null);
  const [committeeNote, setCommitteeNote] = useState(proposal.committeeNote);
  const [message, setMessage] = useState<string | null>(null);
  const [scorecardValues, setScorecardValues] = useState<Record<string, ScorecardCriterionValue>>(
    scorecard?.reviewerResponse?.values ?? {},
  );
  const reviewerRecusals = proposal.reviewerRecusals ?? [];
  const isRecused = !isAdmin && Boolean(proposal.reviewerRecusal);
  const supportingFile = proposal.supportingFile ?? null;
  const coSpeakers = proposal.coSpeakers ?? [];
  const additionalAnswers = Object.entries(proposal.answers ?? {}).filter(
    ([name]) => !STANDARD_ANSWER_NAMES.has(name),
  );
  const speakerAnswers = speakerAnswerGroups(proposal.answers ?? {});

  useEffect(() => {
    setCommitteeNote(proposal.committeeNote);
    setScorecardValues(scorecard?.reviewerResponse?.values ?? {});
    setMessage(null);
  }, [proposal.id, scorecard]);

  useEffect(() => {
    if (focusRecord) {
      const frame = window.requestAnimationFrame(() => recordTitleRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    if (!window.matchMedia?.("(max-width: 960px)").matches) return;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRecord, proposal.id]);

  const mutation = useMutation({
    mutationFn: (input: {
      status?: ProposalStatus;
      committeeNote?: string;
      scorecardValues?: Record<string, ScorecardCriterionValue>;
    }) =>
      updateProposalReview(eventId, proposal.id, {
        ...input,
        expectedVersion: proposal.reviewVersion ?? 0,
        roundId: roundId || undefined,
      }),
    onSuccess: (data: ProposalReviewResponse, variables) => {
      queryClient.setQueryData(
        ["proposal-review", eventId, proposal.id, roundId],
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
      void queryClient.invalidateQueries({ queryKey: ["review-results", eventId] });
      setMessage(
        variables.status
          ? `Internal decision changed to ${statusLabel(variables.status)}.`
          : variables.scorecardValues
            ? "Scorecard saved."
            : "Committee note saved.",
      );
    },
  });

  const recusalMutation = useMutation({
    mutationFn: (reason?: string) =>
      recuseProposalReview(eventId, proposal.id, {
        roundId,
        reason: reason?.trim() || undefined,
      }),
    onSuccess: (data: ProposalReviewResponse) => {
      queryClient.setQueryData(
        ["proposal-review", eventId, proposal.id, roundId],
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
      setMessage("Conflict recorded. This assignment is closed for you.");
    },
  });


  function decide(status: ProposalStatus) {
    setMessage(null);
    mutation.mutate({ status });
  }

  function recuse() {
    if (!roundId) {
      setMessage("Select the evaluation round before recording a recusal.");
      return;
    }
    const reason = window.prompt("Optional private reason for organizers");
    if (reason === null) return;
    setMessage(null);
    recusalMutation.mutate(reason);
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
      <div>
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
          <h2 ref={recordTitleRef} tabIndex={focusRecord ? -1 : undefined}>{proposal.title}</h2>
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
                  <span className="talk-sub"> · {speaker.role || "co-speaker"} · {speaker.email}</span>
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
        {scorecard?.round ? (
          <section className="panel scorecard-panel">
            <h3>{scorecard.round.name} scorecard</h3>
            <p className="muted">{scorecard.calculationDescription}</p>
            {scorecard.aggregate ? (
              <p>
                Aggregate:{" "}
                <strong>
                  {scorecard.aggregate.aggregateScore == null
                    ? "Unscored"
                    : scorecard.aggregate.aggregateScore.toFixed(2)}
                </strong>{" "}
                from {scorecard.aggregate.responseCount} review
                {scorecard.aggregate.responseCount === 1 ? "" : "s"}.
              </p>
            ) : null}
            {!isAdmin ? (
              <>
                {scorecard.round.scorecard.criteria.map((criterion) => (
                  <label key={criterion.id}>
                    {criterion.label}
                    {criterion.required ? " *" : ""}
                    {criterion.guidance ? <span className="muted">{criterion.guidance}</span> : null}
                    {criterion.type === "numeric" ? (
                      <input
                        max={criterion.maxScore ?? 5}
                        min="0"
                        step="0.1"
                        type="number"
                        value={scorecardValues[criterion.id] ?? ""}
                        onChange={(event) =>
                          setScorecardValues((current) => ({
                            ...current,
                            [criterion.id]: event.target.value === "" ? null : Number(event.target.value),
                          }))
                        }
                      />
                    ) : criterion.type === "dropdown" ? (
                      <select
                        value={typeof scorecardValues[criterion.id] === "string" ? String(scorecardValues[criterion.id]) : ""}
                        onChange={(event) =>
                          setScorecardValues((current) => ({
                            ...current,
                            [criterion.id]: event.target.value || null,
                          }))
                        }
                      >
                        <option value="">Choose…</option>
                        {criterion.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                            {option.score == null ? "" : ` (${option.score})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={typeof scorecardValues[criterion.id] === "string" ? String(scorecardValues[criterion.id]) : ""}
                        onChange={(event) =>
                          setScorecardValues((current) => ({
                            ...current,
                            [criterion.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={mutation.isPending || isRecused || !roundId}
                  onClick={() => {
                    setMessage(null);
                    mutation.mutate({ scorecardValues });
                  }}
                >
                  Save scorecard
                </button>
              </>
            ) : scorecard.reviews.length > 0 ? (
              <ul className="inspector-list">
                {scorecard.reviews.map((review) => (
                  <li key={`${review.roundId}-${review.reviewerId}`}>
                    <strong>{review.reviewerName}</strong>
                    <span className="talk-sub">
                      {" "}· {review.completionStatus} ·{" "}
                      {review.aggregateScore == null ? "unscored" : review.aggregateScore.toFixed(2)}
                    </span>
                    <dl className="answer-list">
                      {scorecard.round!.scorecard.criteria.map((criterion) => (
                        <div key={criterion.id}>
                          <dt>{criterion.label}</dt>
                          <dd>{answerText(review.values[criterion.id] as SubmissionAnswers[string])}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No scorecard responses yet.</p>
            )}
          </section>
        ) : null}
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
            disabled={mutation.isPending || isRecused || committeeNote.trim() === proposal.committeeNote}
            onClick={() => {
              setMessage(null);
              mutation.mutate({ committeeNote: committeeNote.trim() });
            }}
          >
            Save committee note
          </button>
        </section>
        {!isAdmin || reviewerRecusals.length > 0 ? (
          <section className="panel">
            <h3>Conflict of interest</h3>
            {isAdmin ? (
              reviewerRecusals.length > 0 ? (
                <ul className="inspector-list">
                  {reviewerRecusals.map((recusal) => (
                    <li key={recusal.id}>
                      <strong>{recusal.reviewerName}</strong>
                      <span className="talk-sub"> · {formatSubmittedAt(recusal.createdAt)}</span>
                      {recusal.reason ? <p>{recusal.reason}</p> : <p>No reason provided.</p>}
                    </li>
                  ))}
                </ul>
              ) : null
            ) : proposal.reviewerRecusal ? (
              <p role="status">
                You recused yourself from this assignment
                {proposal.reviewerRecusal.reason ? `: ${proposal.reviewerRecusal.reason}` : "."}
              </p>
            ) : (
              <>
                <p className="internal-only-note">
                  Record a conflict or recusal if you should not review this assignment.
                  Organizers will see it for reassignment.
                </p>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={recusalMutation.isPending || !roundId}
                  onClick={recuse}
                >
                  Record conflict / recusal
                </button>
              </>
            )}
          </section>
        ) : null}
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
        ) : recusalMutation.isError ? (
          <p className="form-message" data-tone="error" role="alert">{recusalMutation.error.message}</p>
        ) : message ? (
          <p className="form-message" role="status">{message}</p>
        ) : null}
      </div>
      <div>
        <div className="inspector-footer" aria-label="Internal decision">
          {(["unreviewed", "approve", "maybe", "deny"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`btn btn-${status} btn-sm`}
              aria-pressed={proposal.status === status}
              disabled={mutation.isPending || isRecused || proposal.status === status}
              onClick={() => decide(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
