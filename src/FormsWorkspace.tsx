import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type {
  CfpLifecycleStatus,
  OrganizerCfpForm,
  OrganizerCfpFormSummary,
  PublishedCfpForm,
} from "../shared/events";
import { getWelcomeContent, validateCfpDefinition } from "../shared/cfp-definition";
import { fetchOrganizerForm, fetchOrganizerForms } from "./api";
import { AppSelect } from "./AppSelect";
import { CfpRuntime } from "./CfpRuntime";

type FormSort =
  | "name-asc"
  | "name-desc"
  | "status-asc"
  | "status-desc"
  | "published-asc"
  | "published-desc"
  | "updated-desc"
  | "updated-asc";
type FormSortColumn = "name" | "status" | "published" | "updated";
type FormStatusFilter = CfpLifecycleStatus | "all";
type FormCol = "name" | "status" | "published" | "updated";

const statusOrder: Record<CfpLifecycleStatus, number> = {
  draft: 0,
  published: 1,
  closed: 2,
};

const sortOptions = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "status-asc", label: "Status" },
  { value: "updated-desc", label: "Updated newest" },
  { value: "updated-asc", label: "Updated oldest" },
  { value: "published-desc", label: "Version high" },
  { value: "published-asc", label: "Version low" },
];

const FORM_COL_DEFAULTS: Record<FormCol, number> = {
  name: 280,
  status: 124,
  published: 120,
  updated: 118,
};

const FORM_COL_MIN: Record<FormCol, number> = {
  name: 180,
  status: 112,
  published: 100,
  updated: 108,
};

// v3: Form is the fluid column; trailing cols are fixed+resizable.
const FORM_COL_STORAGE = "chartstead:form-cols:v3";

function loadFormColWidths(): Record<FormCol, number> {
  try {
    const raw = localStorage.getItem(FORM_COL_STORAGE);
    if (!raw) return { ...FORM_COL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<FormCol, number>>;
    return {
      name: Math.max(FORM_COL_MIN.name, Number(parsed.name) || FORM_COL_DEFAULTS.name),
      status: Math.max(FORM_COL_MIN.status, Number(parsed.status) || FORM_COL_DEFAULTS.status),
      published: Math.max(
        FORM_COL_MIN.published,
        Number(parsed.published) || FORM_COL_DEFAULTS.published,
      ),
      updated: Math.max(FORM_COL_MIN.updated, Number(parsed.updated) || FORM_COL_DEFAULTS.updated),
    };
  } catch {
    return { ...FORM_COL_DEFAULTS };
  }
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function statusLabel(status: CfpLifecycleStatus) {
  switch (status) {
    case "published":
      return "Published";
    case "closed":
      return "Closed";
    default:
      return "Draft";
  }
}

function toggleSort(current: FormSort, column: FormSortColumn): FormSort {
  if (column === "name") return current === "name-asc" ? "name-desc" : "name-asc";
  if (column === "status") return current === "status-asc" ? "status-desc" : "status-asc";
  if (column === "published") return current === "published-desc" ? "published-asc" : "published-desc";
  return current === "updated-desc" ? "updated-asc" : "updated-desc";
}

function sortAria(current: FormSort, column: FormSortColumn) {
  if (column === "name") {
    if (current === "name-asc") return "ascending" as const;
    if (current === "name-desc") return "descending" as const;
  }
  if (column === "status") {
    if (current === "status-asc") return "ascending" as const;
    if (current === "status-desc") return "descending" as const;
  }
  if (column === "published") {
    if (current === "published-asc") return "ascending" as const;
    if (current === "published-desc") return "descending" as const;
  }
  if (column === "updated") {
    if (current === "updated-asc") return "ascending" as const;
    if (current === "updated-desc") return "descending" as const;
  }
  return "none" as const;
}

function sortIndicator(current: FormSort, column: FormSortColumn) {
  const direction = sortAria(current, column);
  if (direction === "ascending") return "↑";
  if (direction === "descending") return "↓";
  return "";
}

function compareForms(a: OrganizerCfpFormSummary, b: OrganizerCfpFormSummary, sort: FormSort) {
  const byName =
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
  if (sort === "name-asc") return byName;
  if (sort === "name-desc") return -byName;
  if (sort === "status-asc" || sort === "status-desc") {
    const delta = statusOrder[a.lifecycleStatus] - statusOrder[b.lifecycleStatus];
    return (sort === "status-asc" ? delta : -delta) || byName;
  }
  if (sort === "published-asc" || sort === "published-desc") {
    const aVersion = a.publishedVersion ?? -1;
    const bVersion = b.publishedVersion ?? -1;
    const delta = aVersion - bVersion;
    return (sort === "published-asc" ? delta : -delta) || byName;
  }
  const delta = Date.parse(a.draftUpdatedAt) - Date.parse(b.draftUpdatedAt);
  return (sort === "updated-asc" ? delta : -delta) || byName;
}

function previewFormFromOrganizer(form: OrganizerCfpForm): PublishedCfpForm | null {
  const definition = form.publishedDefinition ?? form.draft;
  if (validateCfpDefinition(definition).length > 0) return null;
  return {
    id: form.id,
    name: form.name,
    status: "published",
    definitionVersion: form.publishedVersion ?? 0,
    definition: { ...definition, status: "published" },
    publishedAt: form.publishedAt ?? form.draftUpdatedAt,
  };
}

export type FormsQueueState = {
  query: string;
  status: FormStatusFilter;
  sort: FormSort;
};

export const defaultFormsQueue: FormsQueueState = {
  query: "",
  status: "all",
  sort: "name-asc",
};

export type FormsSelection = {
  id: string;
  publishedVersion: number | null;
};

export function FormsCommandBar({
  queue,
  onQueueChange,
}: {
  queue: FormsQueueState;
  onQueueChange: (next: Partial<FormsQueueState>) => void;
}) {
  return (
    <div className="topbar-tools-inner">
      <label className="field search-field topbar-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={queue.query}
          onChange={(change) => onQueueChange({ query: change.target.value })}
          placeholder="Search form name or ID…"
          aria-label="Search form name or ID"
          autoComplete="off"
        />
      </label>
      <div className="seg" role="group" aria-label="Status filter">
        {(["all", "draft", "published", "closed"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={queue.status === item}
            onClick={() => onQueueChange({ status: item })}
          >
            {item === "all" ? "All" : statusLabel(item)}
          </button>
        ))}
      </div>
      <div className="topbar-track">
        <AppSelect
          label="Sort"
          ariaLabel="Sort forms"
          value={queue.sort}
          options={sortOptions}
          onValueChange={(value) => onQueueChange({ sort: value as FormSort })}
        />
      </div>
    </div>
  );
}

function FormInspector({
  eventId,
  formId,
}: {
  eventId: string;
  formId: string;
}) {
  const detail = useQuery({
    queryKey: ["form", eventId, formId],
    queryFn: () => fetchOrganizerForm(eventId, formId),
    staleTime: 60_000,
  });
  // Never treat another form's cached/placeholder payload as the current selection.
  const form = detail.data?.form?.id === formId ? detail.data.form : undefined;
  const preview = form ? previewFormFromOrganizer(form) : null;
  const welcome = form
    ? getWelcomeContent(form.publishedDefinition ?? form.draft)
    : null;
  const loading = !form && (detail.isPending || detail.isFetching);

  return (
    <div
      className="inspector-content"
      aria-busy={loading || undefined}
      data-preview-form-id={form?.id ?? undefined}
      data-preview-pending={loading ? "true" : undefined}
    >
      {detail.isError && !form ? (
        <p className="form-message" data-tone="error" role="alert">
          {detail.error.message}
        </p>
      ) : null}
      {form ? (
        <>
          <div className="inspector-header forms-preview-header">
            <div className="inspector-kicker">Preview</div>
            <h2 data-testid="forms-preview-name">{form.name}</h2>
            {welcome?.title ? (
              <p className="forms-preview-welcome" data-testid="forms-preview-welcome">
                {welcome.title}
              </p>
            ) : null}
          </div>
          <div className="inspector-body forms-inspector-body">
            {preview ? (
              <CfpRuntime
                key={formId}
                eventId={eventId}
                form={preview}
                mode="preview"
                themeAccent={detail.data?.event.themeAccent}
              />
            ) : (
              <p className="empty-state padded" data-testid="forms-preview-invalid">
                This draft cannot preview until required fields are valid.
              </p>
            )}
          </div>
        </>
      ) : loading ? (
        <p className="empty-state padded" data-testid="forms-preview-loading">
          Loading form…
        </p>
      ) : null}
    </div>
  );
}

export function FormsWorkspace({
  eventId,
  queue,
  onQueueChange,
  onSelectionChange,
}: {
  eventId: string;
  queue: FormsQueueState;
  onQueueChange: (next: Partial<FormsQueueState>) => void;
  onSelectionChange?: (selection: FormsSelection | null) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(0);
  const inspectorWidthRef = useRef(0);
  const inspectorSeededRef = useRef(false);
  const [colWidths, setColWidths] = useState<Record<FormCol, number>>(loadFormColWidths);
  const colWidthsRef = useRef(colWidths);
  const tableRef = useRef<HTMLTableElement>(null);
  const splitElRef = useRef<HTMLDivElement | null>(null);
  const splitObserverRef = useRef<ResizeObserver | null>(null);
  colWidthsRef.current = colWidths;

  const forms = useQuery({
    queryKey: ["forms", eventId],
    queryFn: () => fetchOrganizerForms(eventId),
  });

  const rows = useMemo(() => {
    const needle = queue.query.trim().toLowerCase();
    return [...(forms.data ?? [])]
      .filter((form) => (queue.status === "all" ? true : form.lifecycleStatus === queue.status))
      .filter((form) =>
        needle
          ? form.name.toLowerCase().includes(needle) || form.id.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => compareForms(a, b, queue.sort));
  }, [forms.data, queue]);

  useEffect(() => {
    localStorage.setItem(FORM_COL_STORAGE, JSON.stringify(colWidths));
  }, [colWidths]);

  useEffect(() => {
    if (!forms.data?.length) return;
    for (const form of forms.data) {
      void queryClient.prefetchQuery({
        queryKey: ["form", eventId, form.id],
        queryFn: () => fetchOrganizerForm(eventId, form.id),
        staleTime: 60_000,
      });
    }
  }, [eventId, forms.data, queryClient]);

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    if (selectedId && rows.some((form) => form.id === selectedId)) return;
    setSelectedId(rows[0]!.id);
  }, [rows, selectedId]);

  useEffect(() => {
    if (!onSelectionChange) return;
    if (!selectedId) {
      onSelectionChange(null);
      return;
    }
    const selected = rows.find((form) => form.id === selectedId);
    onSelectionChange(
      selected ? { id: selected.id, publishedVersion: selected.publishedVersion } : null,
    );
  }, [onSelectionChange, rows, selectedId]);

  function queueFloorWidth() {
    // Mins only — never block a true ~50% preview seed.
    return (
      FORM_COL_MIN.name +
      FORM_COL_MIN.status +
      FORM_COL_MIN.published +
      FORM_COL_MIN.updated
    );
  }

  function clampInspectorWidth(desired: number, splitWidth: number) {
    const gutter = 8;
    const floor = queueFloorWidth();
    const maxWidth = Math.max(280, Math.floor(splitWidth - gutter - floor));
    const minWidth = Math.min(280, maxWidth);
    return Math.min(maxWidth, Math.max(minWidth, desired));
  }

  function applyInspectorWidth(splitEl: HTMLDivElement) {
    const splitWidth = splitEl.getBoundingClientRect().width;
    if (splitWidth <= 0) return;
    if (!inspectorSeededRef.current || inspectorWidthRef.current <= 0) {
      const half = Math.round((splitWidth - 8) / 2);
      const seeded = clampInspectorWidth(half, splitWidth);
      inspectorSeededRef.current = true;
      inspectorWidthRef.current = seeded;
      setInspectorWidth(seeded);
      splitEl.dataset.previewSized = "true";
      splitEl.style.setProperty("--inspector-width", `${seeded}px`);
      return;
    }
    const next = clampInspectorWidth(inspectorWidthRef.current, splitWidth);
    if (next !== inspectorWidthRef.current) {
      inspectorWidthRef.current = next;
      setInspectorWidth(next);
    }
    splitEl.dataset.previewSized = "true";
    splitEl.style.setProperty("--inspector-width", `${next}px`);
  }

  // Attach when the split actually mounts (forms load async — a mount-time effect misses it).
  function setSplitNode(node: HTMLDivElement | null) {
    if (splitObserverRef.current) {
      splitObserverRef.current.disconnect();
      splitObserverRef.current = null;
    }
    splitElRef.current = node;
    if (!node) return;
    applyInspectorWidth(node);
    const observer = new ResizeObserver(() => applyInspectorWidth(node));
    splitObserverRef.current = observer;
    observer.observe(node);
  }

  useEffect(() => {
    return () => {
      splitObserverRef.current?.disconnect();
      splitObserverRef.current = null;
    };
  }, []);

  function startColResize(column: Exclude<FormCol, "name">, pointer: ReactPointerEvent<HTMLSpanElement>) {
    pointer.preventDefault();
    pointer.stopPropagation();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const header = handle.closest("th");
    const colEl = tableRef.current?.querySelector<HTMLTableColElement>(`col.col-form-${column}`);
    const startX = pointer.clientX;
    const startWidth = header?.getBoundingClientRect().width ?? colWidthsRef.current[column];
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      // Right-edge handle on trailing cols: drag right grows, left shrinks.
      nextWidth = Math.max(FORM_COL_MIN[column], Math.round(startWidth + event.clientX - startX));
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
    const startWidth = inspectorWidthRef.current || Math.round((splitEl?.getBoundingClientRect().width ?? 800) / 2);
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      const splitWidth = splitEl?.getBoundingClientRect().width ?? window.innerWidth;
      // Divider is the left edge of the preview: drag left → wider preview.
      nextWidth = clampInspectorWidth(startWidth + startX - event.clientX, splitWidth);
      if (splitEl) {
        splitEl.dataset.previewSized = "true";
        splitEl.style.setProperty("--inspector-width", `${nextWidth}px`);
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

  function setSort(column: FormSortColumn) {
    onQueueChange({ sort: toggleSort(queue.sort, column) });
  }

  return (
    <div className="work forms-work" aria-label="Forms workspace">
      {forms.isPending ? <p className="empty-state padded">Loading forms…</p> : null}
      {forms.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {forms.error.message}
        </p>
      ) : null}

      {forms.isSuccess ? (
        <div
          ref={setSplitNode}
          className="split forms-split"
          style={
            inspectorWidth > 0
              ? ({ "--inspector-width": `${inspectorWidth}px` } as CSSProperties)
              : undefined
          }
        >
          <div className="table-wrap">
            {rows.length === 0 ? (
              <p className="empty-state padded">
                {forms.data.length === 0
                  ? "No forms yet. Create one to open a public CFP."
                  : "No forms match these filters. Try another status or search."}
              </p>
            ) : (
              <table ref={tableRef} className="grid forms-grid" aria-label="Forms">
                <colgroup>
                  <col className="col-form-name" />
                  <col className="col-form-status" style={{ width: colWidths.status }} />
                  <col className="col-form-published" style={{ width: colWidths.published }} />
                  <col className="col-form-updated" style={{ width: colWidths.updated }} />
                </colgroup>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="col-form-name"
                      aria-sort={sortAria(queue.sort, "name")}
                    >
                      <button type="button" className="th-sort" onClick={() => setSort("name")}>
                        Form
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "name")}
                        </span>
                      </button>
                    </th>
                    <th
                      scope="col"
                      className="col-form-status"
                      aria-sort={sortAria(queue.sort, "status")}
                    >
                      <button type="button" className="th-sort" onClick={() => setSort("status")}>
                        Status
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "status")}
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
                    <th
                      scope="col"
                      className="col-form-published"
                      aria-sort={sortAria(queue.sort, "published")}
                    >
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => setSort("published")}
                      >
                        Version
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "published")}
                        </span>
                      </button>
                      <span
                        className="col-resizer"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize Version column"
                        onPointerDown={(event) => startColResize("published", event)}
                      />
                    </th>
                    <th
                      scope="col"
                      className="col-form-updated"
                      aria-sort={sortAria(queue.sort, "updated")}
                    >
                      <button type="button" className="th-sort" onClick={() => setSort("updated")}>
                        Updated
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "updated")}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((form) => (
                    <tr
                      key={form.id}
                      className="form-row"
                      aria-selected={selectedId === form.id}
                      onMouseEnter={() => {
                        void queryClient.prefetchQuery({
                          queryKey: ["form", eventId, form.id],
                          queryFn: () => fetchOrganizerForm(eventId, form.id),
                          staleTime: 60_000,
                        });
                      }}
                      onClick={() => setSelectedId(form.id)}
                    >
                      <td className="col-form-name">
                        <div className="form-name-stack">
                          <Link
                            className="form-title-link"
                            to="/e/$eventId/forms/$formId"
                            params={{ eventId, formId: form.id }}
                            onClick={(click) => click.stopPropagation()}
                          >
                            {form.name}
                          </Link>
                          <span className="form-id-sub">{form.id}</span>
                        </div>
                      </td>
                      <td className="col-form-status">
                        <span className={`flag flag-box flag-${form.lifecycleStatus}`}>
                          {statusLabel(form.lifecycleStatus)}
                        </span>
                      </td>
                      <td className="col-form-published">
                        {form.publishedVersion != null ? (
                          <span className="tabular-nums">v{form.publishedVersion}</span>
                        ) : (
                          <span className="muted">Not published</span>
                        )}
                      </td>
                      <td className="col-form-updated muted tabular-nums">
                        {formatUpdatedAt(form.draftUpdatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div
            className="inspector-resizer"
            role="separator"
            aria-label="Resize form preview"
            aria-orientation="vertical"
            aria-valuemin={280}
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
                  const next = clampInspectorWidth(width + 24, splitWidth);
                  inspectorWidthRef.current = next;
                  return next;
                });
              } else if (key.key === "ArrowRight") {
                key.preventDefault();
                setInspectorWidth((width) => {
                  const next = clampInspectorWidth(width - 24, splitWidth);
                  inspectorWidthRef.current = next;
                  return next;
                });
              }
            }}
          />

          <aside
            className={`inspector forms-inspector${selectedId ? " has-selection" : ""}`}
            aria-label="Form preview"
          >
            {selectedId ? (
              <FormInspector key={selectedId} eventId={eventId} formId={selectedId} />
            ) : (
              <div className="inspector-body">
                <p className="empty-state padded">Select a form to preview it.</p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
