import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { renderCommunicationTemplate } from "../shared/communication-template";
import type { CommunicationPlanBody, CourseCheckPlan } from "../shared/course-check";
import type { OnboardingBoardSpeaker } from "../shared/events";
import {
  ApiError,
  createCommunicationCourseCheck,
  fetchCourseCheckPlans,
  fetchOnboardingBoard,
} from "./api";

export type AudienceFilter = "all" | "needs_follow_up" | "overdue" | "ready";

const FILTERS: Array<{ value: AudienceFilter; label: string }> = [
  { value: "all", label: "All speakers" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "overdue", label: "Overdue" },
  { value: "ready", label: "Ready" },
];

const EMPTY_SPEAKERS: OnboardingBoardSpeaker[] = [];

const DEFAULT_SUBJECT = "Program update for {{speaker_name}}";
const DEFAULT_BODY =
  "Hello {{speaker_name}},\n\nWe have an update about {{proposal_title}} for {{event_name}}.\n\nThank you,\nThe organizing team";

type AudienceCol = "speaker" | "readiness" | "address";
type AudienceSort =
  | "speaker-asc"
  | "speaker-desc"
  | "readiness-asc"
  | "readiness-desc"
  | "address-asc"
  | "address-desc";

const AUDIENCE_COL_DEFAULTS: Record<AudienceCol, number> = {
  speaker: 320,
  readiness: 140,
  address: 220,
};

const AUDIENCE_COL_MIN: Record<AudienceCol, number> = {
  speaker: 200,
  readiness: 112,
  address: 150,
};

const AUDIENCE_COL_STORAGE = "chartstead:messages-audience-cols:v1";
const AUDIENCE_ACTION_WIDTH = 108;
const INSPECTOR_DEFAULT = 420;

function loadAudienceColWidths(): Record<AudienceCol, number> {
  try {
    const raw = localStorage.getItem(AUDIENCE_COL_STORAGE);
    if (!raw) return { ...AUDIENCE_COL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<AudienceCol, number>>;
    return {
      speaker: Math.max(
        AUDIENCE_COL_MIN.speaker,
        Number(parsed.speaker) || AUDIENCE_COL_DEFAULTS.speaker,
      ),
      readiness: Math.max(
        AUDIENCE_COL_MIN.readiness,
        Number(parsed.readiness) || AUDIENCE_COL_DEFAULTS.readiness,
      ),
      address: Math.max(
        AUDIENCE_COL_MIN.address,
        Number(parsed.address) || AUDIENCE_COL_DEFAULTS.address,
      ),
    };
  } catch {
    return { ...AUDIENCE_COL_DEFAULTS };
  }
}

function sortAria(
  current: AudienceSort,
  column: AudienceCol,
): "ascending" | "descending" | "none" {
  if (column === "speaker") {
    if (current === "speaker-asc") return "ascending";
    if (current === "speaker-desc") return "descending";
  }
  if (column === "readiness") {
    if (current === "readiness-asc") return "ascending";
    if (current === "readiness-desc") return "descending";
  }
  if (column === "address") {
    if (current === "address-asc") return "ascending";
    if (current === "address-desc") return "descending";
  }
  return "none";
}

function toggleAudienceSort(current: AudienceSort, column: AudienceCol): AudienceSort {
  if (column === "speaker") {
    return current === "speaker-asc" ? "speaker-desc" : "speaker-asc";
  }
  if (column === "readiness") {
    return current === "readiness-desc" ? "readiness-asc" : "readiness-desc";
  }
  return current === "address-asc" ? "address-desc" : "address-asc";
}

export type MessagesChrome = {
  filter: AudienceFilter;
  onFilterChange: (filter: AudienceFilter) => void;
  visibleCount: number;
  missingCount: number;
  historyScope: "all" | "speaker";
  historySpeakerName: string | null;
  onShowAllHistory: () => void;
};

export function MessagesCommandBar({ chrome }: { chrome: MessagesChrome | null }) {
  if (!chrome) {
    return (
      <div className="topbar-tools-inner messages-shell-tools" aria-busy="true">
        <span className="messages-shell-summary">Loading audience…</span>
      </div>
    );
  }

  return (
    <div className="topbar-tools-inner messages-shell-tools">
      <div className="seg messages-filter" role="group" aria-label="Readiness group">
        {FILTERS.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={chrome.filter === option.value}
            onClick={() => chrome.onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {chrome.historyScope === "speaker" ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={chrome.onShowAllHistory}
        >
          All history
        </button>
      ) : null}
      <span className="topbar-tools-spacer" aria-hidden="true" />
      <p className="messages-shell-stats" aria-label="Audience counts">
        <span>
          <strong>{chrome.visibleCount}</strong> shown
        </span>
        {chrome.missingCount > 0 ? (
          <span className="messages-shell-stats-missing">
            <strong>{chrome.missingCount}</strong> missing address
            {chrome.missingCount === 1 ? "" : "es"}
          </span>
        ) : null}
      </p>
    </div>
  );
}

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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type StatusTone = "neutral" | "ok" | "warn" | "info" | "bad";

function communicationStatus(plan: CourseCheckPlan & { body: CommunicationPlanBody }): {
  label: string;
  tone: StatusTone;
} {
  if (plan.communicationReview) {
    const label = plan.communicationReview.currentStatus.label;
    const key = plan.communicationReview.currentStatus.key;
    if (key.includes("fail") || key.includes("error")) return { label, tone: "bad" };
    if (key.includes("send") || key.includes("deliver") || key.includes("complete")) {
      return { label, tone: "ok" };
    }
    if (key.includes("queue") || key.includes("retry") || key.includes("ready")) {
      return { label, tone: "info" };
    }
    return { label, tone: "neutral" };
  }
  const body = plan.body;
  if (body.deliverySummary.unknown > 0) return { label: "Unknown outcome", tone: "warn" };
  if (body.deliverySummary.retryScheduled > 0) return { label: "Retry scheduled", tone: "info" };
  if (body.deliverySummary.failed > 0) return { label: "Failed", tone: "bad" };
  if (body.deliverySummary.queued > 0 || body.deliverySummary.sending > 0) {
    return { label: "Queued", tone: "info" };
  }
  if (
    body.deliverySummary.total > 0 &&
    body.deliverySummary.succeeded === body.deliverySummary.total
  ) {
    return { label: "Delivered", tone: "ok" };
  }
  if (body.stageVisibility.draft === "complete") return { label: "Draft prepared", tone: "info" };
  return { label: "Draft", tone: "neutral" };
}

function readinessTone(speaker: OnboardingBoardSpeaker): StatusTone {
  if (speaker.overdueCount > 0) return "warn";
  if (speaker.openTaskCount > 0) return "info";
  return "ok";
}

function speakerSessionLabel(speaker: OnboardingBoardSpeaker): string {
  return speaker.proposalTitle ?? speaker.titleSnapshot ?? "General event speaker";
}

function readinessRank(speaker: OnboardingBoardSpeaker): number {
  if (speaker.overdueCount > 0) return 3000 + speaker.overdueCount * 100 + speaker.openTaskCount;
  if (speaker.openTaskCount > 0) return 1000 + speaker.openTaskCount;
  return 0;
}

function sortSpeakers(
  rows: OnboardingBoardSpeaker[],
  sort: AudienceSort,
): OnboardingBoardSpeaker[] {
  const next = [...rows];
  next.sort((a, b) => {
    if (sort === "speaker-asc" || sort === "speaker-desc") {
      const cmp =
        a.name.localeCompare(b.name) ||
        speakerSessionLabel(a).localeCompare(speakerSessionLabel(b));
      return sort === "speaker-asc" ? cmp : -cmp;
    }
    if (sort === "address-asc" || sort === "address-desc") {
      const aKey = isDeliverable(a.email) ? a.email.toLowerCase() : `\uffff${a.name}`;
      const bKey = isDeliverable(b.email) ? b.email.toLowerCase() : `\uffff${b.name}`;
      const cmp = aKey.localeCompare(bKey);
      return sort === "address-asc" ? cmp : -cmp;
    }
    const cmp = readinessRank(a) - readinessRank(b) || a.name.localeCompare(b.name);
    return sort === "readiness-asc" ? cmp : -cmp;
  });
  return next;
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

function recipientNames(body: CommunicationPlanBody): string[] {
  const names: string[] = [];
  for (const group of body.recipientGroups ?? []) {
    for (const recipient of group.recipients ?? []) {
      if (!recipient.selected) continue;
      const name = recipient.name?.trim() || recipient.address?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function planIncludesSpeaker(
  plan: CourseCheckPlan & { body: CommunicationPlanBody },
  speaker: OnboardingBoardSpeaker,
): boolean {
  const email = speaker.email.trim().toLowerCase();
  for (const group of plan.body.recipientGroups ?? []) {
    for (const recipient of group.recipients ?? []) {
      if (recipient.speakerId && recipient.speakerId === speaker.speakerId) return true;
      if (email && recipient.address?.trim().toLowerCase() === email) return true;
      if (email && (recipient as { email?: string }).email?.trim().toLowerCase() === email) {
        return true;
      }
      if (recipient.name?.trim().toLowerCase() === speaker.name.trim().toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

export function MessagesWorkspace({
  eventId,
  eventName,
  focusedPlanId,
  onChromeChange,
}: {
  eventId: string;
  eventName: string;
  focusedPlanId?: string | null;
  onOpenCourseCheck?: (planId: string) => void;
  onChromeChange?: (chrome: MessagesChrome | null) => void;
}) {
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: ["onboarding-board", eventId],
    queryFn: () => fetchOnboardingBoard(eventId),
  });
  const plans = useQuery({
    queryKey: ["course-checks", eventId],
    queryFn: () => fetchCourseCheckPlans(eventId),
  });
  const [filter, setFilter] = useState<AudienceFilter>("all");
  const [sort, setSort] = useState<AudienceSort>("readiness-desc");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSpeakerId, setComposeSpeakerId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [bodyText, setBodyText] = useState(DEFAULT_BODY);
  const [portalInvitation, setPortalInvitation] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [audiencePaneWidth, setAudiencePaneWidth] = useState(0);
  const [colWidths, setColWidths] = useState<Record<AudienceCol, number>>(loadAudienceColWidths);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const inspectorWidthRef = useRef(inspectorWidth);
  const colWidthsRef = useRef(colWidths);
  inspectorWidthRef.current = inspectorWidth;
  colWidthsRef.current = colWidths;

  useEffect(() => {
    localStorage.setItem(AUDIENCE_COL_STORAGE, JSON.stringify(colWidths));
  }, [colWidths]);

  const speakers = board.data?.speakers ?? EMPTY_SPEAKERS;
  const visibleSpeakers = useMemo(
    () =>
      sortSpeakers(
        speakers.filter((speaker) => matchesFilter(speaker, filter)),
        sort,
      ),
    [filter, sort, speakers],
  );
  const deliverableSpeakers = useMemo(
    () => speakers.filter((speaker) => isDeliverable(speaker.email)),
    [speakers],
  );
  const missingCount = speakers.length - deliverableSpeakers.length;
  const selectedSpeaker =
    speakers.find((speaker) => speaker.speakerId === selectedSpeakerId) ?? null;

  const communicationPlans = (plans.data ?? []).filter(
    (plan): plan is CourseCheckPlan & { body: CommunicationPlanBody } =>
      plan.body.actionType === "communication",
  );

  const scopedPlans = useMemo(() => {
    if (!selectedSpeaker) return communicationPlans;
    return communicationPlans.filter((plan) => planIncludesSpeaker(plan, selectedSpeaker));
  }, [communicationPlans, selectedSpeaker]);

  const selectedPlan =
    scopedPlans.find((plan) => plan.id === selectedPlanId) ??
    communicationPlans.find((plan) => plan.id === selectedPlanId) ??
    null;

  const appliedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedPlanId || appliedFocusRef.current === focusedPlanId) return;
    appliedFocusRef.current = focusedPlanId;
    setSelectedPlanId(focusedPlanId);
    setSelectedSpeakerId(null);
  }, [focusedPlanId]);

  const composeSpeaker =
    deliverableSpeakers.find((speaker) => speaker.speakerId === composeSpeakerId) ?? null;

  const createPlan = useMutation({
    mutationFn: () => {
      if (!composeSpeaker) throw new Error("Choose one recipient.");
      return createCommunicationCourseCheck(eventId, {
        speakerIds: [composeSpeaker.speakerId],
        templateKind: "custom",
        subject,
        bodyText,
        portalInvitation,
        idempotencyKey: `speaker-message-${crypto.randomUUID()}`,
      });
    },
    onSuccess: async (plan) => {
      await queryClient.invalidateQueries({ queryKey: ["course-checks", eventId] });
      setSelectedSpeakerId(composeSpeaker?.speakerId ?? null);
      setSelectedPlanId(plan.id);
      setComposeOpen(false);
      setSubject(DEFAULT_SUBJECT);
      setBodyText(DEFAULT_BODY);
      setPortalInvitation(false);
    },
  });

  const openCompose = useCallback(
    (speakerId: string) => {
      if (!deliverableSpeakers.some((speaker) => speaker.speakerId === speakerId)) return;
      setComposeSpeakerId(speakerId);
      setComposeOpen(true);
      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    },
    [deliverableSpeakers],
  );

  const showAllHistory = useCallback(() => {
    setSelectedSpeakerId(null);
    setSelectedPlanId(null);
  }, []);

  function audienceFloorWidth(widths: Record<AudienceCol, number> = colWidths) {
    return (
      AUDIENCE_COL_MIN.speaker +
      widths.readiness +
      widths.address +
      AUDIENCE_ACTION_WIDTH
    );
  }

  function clampInspectorWidth(
    desired: number,
    splitWidth: number,
    widths: Record<AudienceCol, number> = colWidths,
  ) {
    const floor = audienceFloorWidth(widths);
    const maxWidth = Math.max(280, Math.floor(splitWidth - 8 - floor));
    return Math.min(maxWidth, Math.max(280, Math.min(desired, maxWidth)));
  }

  const speakerDisplayWidth = (() => {
    if (audiencePaneWidth <= 0) return colWidths.speaker;
    const room =
      audiencePaneWidth - colWidths.readiness - colWidths.address - AUDIENCE_ACTION_WIDTH;
    if (room >= colWidths.speaker) return colWidths.speaker;
    return Math.max(AUDIENCE_COL_MIN.speaker, room);
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
      setAudiencePaneWidth(Math.max(0, Math.round(splitWidth - 8 - next)));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(splitEl);
    return () => observer.disconnect();
  }, [colWidths.speaker, colWidths.readiness, colWidths.address]);

  function startColResize(column: AudienceCol, pointer: ReactPointerEvent<HTMLSpanElement>) {
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
      nextWidth = Math.max(AUDIENCE_COL_MIN[column], Math.round(startWidth + event.clientX - startX));
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
      nextWidth = clampInspectorWidth(startWidth + startX - event.clientX, splitWidth, widths);
      if (splitEl) {
        splitEl.style.setProperty("--inspector-width", `${nextWidth}px`);
        setAudiencePaneWidth(Math.max(0, Math.round(splitWidth - 8 - nextWidth)));
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

  function setColumnSort(column: AudienceCol) {
    setSort((current) => toggleAudienceSort(current, column));
  }

  useEffect(() => {
    if (!onChromeChange) return;
    onChromeChange({
      filter,
      onFilterChange: setFilter,
      visibleCount: visibleSpeakers.length,
      missingCount,
      historyScope: selectedSpeaker ? "speaker" : "all",
      historySpeakerName: selectedSpeaker?.name ?? null,
      onShowAllHistory: showAllHistory,
    });
    return () => onChromeChange(null);
  }, [
    filter,
    missingCount,
    onChromeChange,
    selectedSpeaker,
    showAllHistory,
    visibleSpeakers.length,
  ]);

  useEffect(() => {
    if (!composeOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setComposeOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composeOpen]);

  if (board.isPending || plans.isPending) {
    return (
      <div className="work messages-work" aria-label="Messages workspace">
        <p className="empty-state padded">Loading speaker messages…</p>
      </div>
    );
  }

  if (board.isError || plans.isError) {
    const error = board.error ?? plans.error;
    return (
      <div className="work messages-work" aria-label="Messages workspace">
        <div className="messages-state-panel" role="alert">
          <strong>Speaker messages could not be loaded.</strong>
          <p>{error instanceof ApiError ? error.message : "Try again shortly."}</p>
        </div>
      </div>
    );
  }

  const previewTokens = composeSpeaker
    ? {
        speakerName: composeSpeaker.name,
        proposalTitle:
          composeSpeaker.proposalTitle ?? composeSpeaker.titleSnapshot ?? "your session",
        eventName,
        portalUrl: portalInvitation
          ? "https://chartstead.test/e/event/portal/private-link"
          : undefined,
      }
    : null;

  const selectedStatus = selectedPlan ? communicationStatus(selectedPlan) : null;
  const selectedRecipients = selectedPlan ? recipientNames(selectedPlan.body) : [];

  return (
    <div className="work messages-work" aria-label="Messages workspace">
      <div
        ref={splitRef}
        className="split messages-split"
        style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <div className="table-wrap messages-audience-pane">
          {visibleSpeakers.length === 0 ? (
            <p className="empty-state padded">
              {speakers.length === 0
                ? "No speakers in this event yet."
                : "No speakers match this readiness filter."}
            </p>
          ) : (
            <table
              ref={tableRef}
              className="grid messages-audience-table"
              aria-label="Audience"
              style={{
                minWidth:
                  AUDIENCE_COL_MIN.speaker +
                  colWidths.readiness +
                  colWidths.address +
                  AUDIENCE_ACTION_WIDTH,
              }}
            >
              <colgroup>
                <col className="col-speaker" style={{ width: speakerDisplayWidth }} />
                <col className="col-readiness" style={{ width: colWidths.readiness }} />
                <col className="col-address" style={{ width: colWidths.address }} />
                <col className="col-action" style={{ width: AUDIENCE_ACTION_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="col-speaker"
                    aria-sort={sortAria(sort, "speaker")}
                  >
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => setColumnSort("speaker")}
                    >
                      Speaker
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(sort, "speaker") === "ascending"
                          ? "↑"
                          : sortAria(sort, "speaker") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Speaker column"
                      onPointerDown={(event) => startColResize("speaker", event)}
                    />
                  </th>
                  <th
                    scope="col"
                    className="col-readiness"
                    aria-sort={sortAria(sort, "readiness")}
                  >
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => setColumnSort("readiness")}
                    >
                      Readiness
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(sort, "readiness") === "ascending"
                          ? "↑"
                          : sortAria(sort, "readiness") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Readiness column"
                      onPointerDown={(event) => startColResize("readiness", event)}
                    />
                  </th>
                  <th
                    scope="col"
                    className="col-address"
                    aria-sort={sortAria(sort, "address")}
                  >
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => setColumnSort("address")}
                    >
                      Address
                      <span className="th-sort-ind" aria-hidden="true">
                        {sortAria(sort, "address") === "ascending"
                          ? "↑"
                          : sortAria(sort, "address") === "descending"
                            ? "↓"
                            : ""}
                      </span>
                    </button>
                    <span
                      className="col-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize Address column"
                      onPointerDown={(event) => startColResize("address", event)}
                    />
                  </th>
                  <th scope="col" className="col-action">
                    <span className="visually-hidden">Message</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleSpeakers.map((speaker) => {
                  const deliverable = isDeliverable(speaker.email);
                  const selected = selectedSpeakerId === speaker.speakerId;
                  return (
                    <tr
                      key={speaker.speakerId}
                      className="messages-audience-table-row"
                      data-disabled={!deliverable}
                      aria-selected={selected}
                      onClick={() => {
                        setSelectedSpeakerId(speaker.speakerId);
                        setSelectedPlanId(null);
                      }}
                    >
                      <th scope="row" className="col-speaker">
                        <strong>{speaker.name}</strong>
                        <span>{speakerSessionLabel(speaker)}</span>
                      </th>
                      <td className="col-readiness">
                        <span className="messages-status" data-tone={readinessTone(speaker)}>
                          {readinessLabel(speaker)}
                        </span>
                      </td>
                      <td className="col-address">
                        {deliverable ? (
                          <span className="messages-address">{speaker.email}</span>
                        ) : (
                          <span className="messages-status" data-tone="warn">
                            Missing address
                          </span>
                        )}
                      </td>
                      <td className="col-action messages-audience-action">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={!deliverable}
                          title={
                            deliverable
                              ? `Compose a message to ${speaker.name}`
                              : "Add an email address before messaging"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            openCompose(speaker.speakerId);
                          }}
                        >
                          Message
                        </button>
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
          aria-label="Resize message history"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={800}
          aria-valuenow={inspectorWidth}
          tabIndex={0}
          onPointerDown={startInspectorResize}
        />

        <aside
          className={`inspector messages-inspector${selectedPlan || selectedSpeaker ? " has-selection" : ""}`}
          aria-label="Communication history"
        >
          {!selectedPlan ? (
            <div className="messages-inspector-body">
              <div className="messages-inspector-header">
                <div>
                  <h2>{selectedSpeaker ? selectedSpeaker.name : "History"}</h2>
                  <p className="messages-inspector-sub">
                    {selectedSpeaker
                      ? `${scopedPlans.length} message${scopedPlans.length === 1 ? "" : "s"} to this speaker`
                      : `${scopedPlans.length} message${scopedPlans.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="messages-inspector-header-actions">
                  {selectedSpeaker ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={showAllHistory}
                    >
                      All history
                    </button>
                  ) : null}
                  {selectedSpeaker && isDeliverable(selectedSpeaker.email) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openCompose(selectedSpeaker.speakerId)}
                    >
                      Message
                    </button>
                  ) : null}
                </div>
              </div>
              {scopedPlans.length === 0 ? (
                <p className="empty-state padded">
                  {selectedSpeaker
                    ? `No messages to ${selectedSpeaker.name} yet.`
                    : "No messages yet. Compose to one speaker to start history."}
                </p>
              ) : (
                <ul className="messages-history-list">
                  {scopedPlans.map((plan) => {
                    const status = communicationStatus(plan);
                    const count = communicationRecipientCount(plan.body);
                    return (
                      <li key={plan.id}>
                        <button
                          type="button"
                          className="messages-history-item"
                          aria-current={selectedPlanId === plan.id ? "true" : undefined}
                          onClick={() => setSelectedPlanId(plan.id)}
                        >
                          <span className="messages-history-item-main">
                            <strong>{plan.body.subject}</strong>
                            <span>
                              {count} recipient{count === 1 ? "" : "s"}
                              {plan.body.portalInvitation ? " · Portal invitation" : ""}
                            </span>
                          </span>
                          <span className="messages-history-item-meta">
                            <span className="messages-status" data-tone={status.tone}>
                              {status.label}
                            </span>
                            <span className="messages-history-item-date">
                              {formatDate(plan.updatedAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="messages-inspector-body messages-inspector-detail">
              <div className="messages-inspector-header">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedPlanId(null)}
                >
                  Back
                </button>
                {selectedSpeaker ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={showAllHistory}
                  >
                    All history
                  </button>
                ) : null}
              </div>
              <div className="messages-detail-kicker">Message detail</div>
              <h2>{selectedPlan.body.subject}</h2>
              <dl className="messages-detail-meta">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className="messages-status" data-tone={selectedStatus?.tone ?? "neutral"}>
                      {selectedStatus?.label ?? "Draft"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(selectedPlan.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Recipients</dt>
                  <dd>
                    {communicationRecipientCount(selectedPlan.body)}
                    {selectedPlan.body.portalInvitation ? " · Portal invitation" : ""}
                  </dd>
                </div>
              </dl>
              {selectedRecipients.length > 0 ? (
                <div className="messages-detail-block">
                  <h3>To</h3>
                  <ul className="messages-detail-recipients">
                    {selectedRecipients.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="messages-detail-block">
                <h3>Message</h3>
                <p className="messages-detail-body">{selectedPlan.body.bodyText}</p>
              </div>
              {selectedPlan.body.deliverySummary.total > 0 ? (
                <div className="messages-detail-block">
                  <h3>Delivery</h3>
                  <p className="messages-detail-delivery">
                    {selectedPlan.body.deliverySummary.succeeded} delivered ·{" "}
                    {selectedPlan.body.deliverySummary.queued +
                      selectedPlan.body.deliverySummary.sending}{" "}
                    in flight · {selectedPlan.body.deliverySummary.failed} failed ·{" "}
                    {selectedPlan.body.deliverySummary.retryScheduled} retry ·{" "}
                    {selectedPlan.body.deliverySummary.unknown} unknown
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      {composeOpen ? (
        <div className="messages-compose-backdrop">
          <div
            className="messages-compose-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-dialog-title"
          >
            <div className="messages-compose-dialog-header">
              <h2 id="compose-dialog-title">Compose message</h2>
              <div className="messages-compose-dialog-header-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setComposeOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    !composeSpeaker ||
                    !subject.trim() ||
                    !bodyText.trim() ||
                    createPlan.isPending
                  }
                  onClick={() => createPlan.mutate()}
                >
                  {createPlan.isPending ? "Preparing…" : "Prepare message"}
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="btn btn-secondary messages-compose-close"
                  aria-label="Close compose"
                  onClick={() => setComposeOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="messages-compose-dialog-grid">
              <div className="messages-compose-dialog-form">
                {composeSpeaker ? (
                  <p className="messages-compose-recipient-chip">
                    To <strong>{composeSpeaker.name}</strong>
                    <span>{composeSpeaker.email}</span>
                  </p>
                ) : (
                  <p className="messages-compose-recipient-chip" data-tone="warn">
                    Pick a speaker with Message to compose.
                  </p>
                )}

                <label className="messages-invitation-toggle">
                  <input
                    type="checkbox"
                    checked={portalInvitation}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setPortalInvitation(checked);
                      if (checked && !bodyText.includes("{{portal_url}}")) {
                        setBodyText(
                          `${bodyText}\n\nOpen your private speaker portal: {{portal_url}}`,
                        );
                      }
                    }}
                  />
                  Personalize as speaker portal invitation
                </label>

                <label className="stack-field">
                  Subject
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </label>

                <label className="stack-field messages-compose-message-field">
                  Message
                  <textarea
                    rows={14}
                    value={bodyText}
                    onChange={(event) => setBodyText(event.target.value)}
                  />
                </label>

                <p className="messages-token-help">
                  Substitutions: <code>{"{{speaker_name}}"}</code>,{" "}
                  <code>{"{{proposal_title}}"}</code>, <code>{"{{event_name}}"}</code>
                  {portalInvitation ? (
                    <>
                      , <code>{"{{portal_url}}"}</code>
                    </>
                  ) : null}
                </p>

                {createPlan.isError ? (
                  <p className="form-message" data-tone="error" role="alert">
                    {createPlan.error instanceof ApiError
                      ? createPlan.error.message
                      : "Could not prepare this message."}
                  </p>
                ) : null}
              </div>

              <div className="messages-compose-dialog-preview" aria-live="polite">
                <p className="eyebrow">
                  {composeSpeaker ? `Preview · ${composeSpeaker.name}` : "Preview"}
                </p>
                {composeSpeaker && previewTokens ? (
                  <>
                    <p className="messages-compose-preview-to">
                      To {composeSpeaker.name} &lt;{composeSpeaker.email}&gt;
                    </p>
                    <h3>{renderCommunicationTemplate(subject, previewTokens)}</h3>
                    <p>{renderCommunicationTemplate(bodyText, previewTokens)}</p>
                  </>
                ) : (
                  <p>Choose a recipient to preview the message.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
