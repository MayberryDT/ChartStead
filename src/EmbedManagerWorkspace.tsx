import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";

import type {
  EventRecord,
  PublicEmbedConfig,
  PublicEmbedConfigInput,
  PublicEmbedFieldVisibility,
  PublicEmbedTheme,
  PublicEmbedWidget,
  PublicProgramFilters,
  PublicProgramResponse,
} from "../shared/events";
import {
  DEFAULT_PUBLIC_EMBED_FIELDS,
  PUBLIC_EMBED_WIDGETS,
} from "../shared/public-program";
import {
  ApiError,
  createPublicEmbedConfig,
  fetchPublicEmbedConfigs,
  fetchPublicProgram,
  updatePublicEmbedConfig,
} from "./api";
import { AppButton } from "./AppButton";
import { AppCheckbox } from "./AppCheckbox";
import { AppInput } from "./AppInput";
import { AppSelect } from "./AppSelect";
import { PublicProgramRenderer } from "./PublicProgramRenderer";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

const WIDGET_LABELS: Record<PublicEmbedWidget, string> = {
  sessions: "Sessions List",
  speakers: "Speakers List",
  agenda: "Agenda",
  itinerary: "Schedule Itinerary",
  "speaker-gallery": "Speaker Gallery",
};

const FIELD_LABELS: Array<{ key: keyof PublicEmbedFieldVisibility; label: string }> = [
  { key: "title", label: "Session titles" },
  { key: "dateTime", label: "Date and time" },
  { key: "room", label: "Room" },
  { key: "track", label: "Track" },
  { key: "speakers", label: "Session speakers" },
  { key: "description", label: "Descriptions" },
  { key: "format", label: "Format" },
  { key: "headshots", label: "Speaker headshots" },
  { key: "biography", label: "Speaker biographies" },
];

type EmbedSort =
  | "name-asc"
  | "name-desc"
  | "widget-asc"
  | "widget-desc"
  | "status-asc"
  | "status-desc"
  | "updated-desc"
  | "updated-asc"
  | "revision-asc"
  | "revision-desc";
type EmbedSortColumn = "name" | "widget" | "status" | "updated" | "revision";
type EmbedStatusFilter = "all" | "live" | "disabled";
type EmbedCol = "name" | "widget" | "revision" | "status" | "updated";
type WorkspaceMode = "list" | "builder";

type EmbedsQueueState = {
  query: string;
  status: EmbedStatusFilter;
  sort: EmbedSort;
};

const defaultQueue: EmbedsQueueState = {
  query: "",
  status: "all",
  sort: "updated-desc",
};

const EMBED_COL_DEFAULTS: Record<EmbedCol, number> = {
  name: 260,
  widget: 132,
  revision: 120,
  status: 100,
  updated: 110,
};

const EMBED_COL_MIN: Record<EmbedCol, number> = {
  name: 140,
  widget: 100,
  revision: 92,
  status: 80,
  updated: 92,
};

const EMBED_COL_STORAGE = "chartstead:embed-cols:v3";

export type EmbedsChrome = {
  tools: ReactNode;
  actions: ReactNode;
};

function loadColWidths(): Record<EmbedCol, number> {
  try {
    const raw = localStorage.getItem(EMBED_COL_STORAGE);
    if (!raw) return { ...EMBED_COL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<EmbedCol, number>>;
    return {
      name: Math.max(EMBED_COL_MIN.name, Number(parsed.name) || EMBED_COL_DEFAULTS.name),
      widget: Math.max(EMBED_COL_MIN.widget, Number(parsed.widget) || EMBED_COL_DEFAULTS.widget),
      revision: Math.max(
        EMBED_COL_MIN.revision,
        Number(parsed.revision) || EMBED_COL_DEFAULTS.revision,
      ),
      status: Math.max(EMBED_COL_MIN.status, Number(parsed.status) || EMBED_COL_DEFAULTS.status),
      updated: Math.max(
        EMBED_COL_MIN.updated,
        Number(parsed.updated) || EMBED_COL_DEFAULTS.updated,
      ),
    };
  } catch {
    return { ...EMBED_COL_DEFAULTS };
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

function draftFromConfig(config: PublicEmbedConfig | null): PublicEmbedConfigInput {
  return {
    name: config?.name ?? "Conference agenda embed",
    widget: config?.widget ?? "agenda",
    theme: config?.theme ?? "light",
    filters: config?.filters ?? {},
    fields: config?.fields ?? DEFAULT_PUBLIC_EMBED_FIELDS,
    revisionId: config?.revisionId ?? null,
    disabled: config?.disabled ?? false,
  };
}

function revisionLabel(config: PublicEmbedConfig, currentRevisionId: string | null) {
  if (!config.revisionId) return "Current";
  if (currentRevisionId && config.revisionId === currentRevisionId) return "Pinned · current";
  return "Pinned";
}

function compareEmbeds(
  a: PublicEmbedConfig,
  b: PublicEmbedConfig,
  sort: EmbedSort,
  currentRevisionId: string | null,
) {
  const dir = sort.endsWith("asc") ? 1 : -1;
  if (sort.startsWith("name")) return a.name.localeCompare(b.name) * dir;
  if (sort.startsWith("widget")) {
    return WIDGET_LABELS[a.widget].localeCompare(WIDGET_LABELS[b.widget]) * dir;
  }
  if (sort.startsWith("status")) {
    const av = a.disabled ? 1 : 0;
    const bv = b.disabled ? 1 : 0;
    return (av - bv) * dir;
  }
  if (sort.startsWith("revision")) {
    const al = revisionLabel(a, currentRevisionId);
    const bl = revisionLabel(b, currentRevisionId);
    return al.localeCompare(bl) * dir;
  }
  return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
}

function toggleSort(current: EmbedSort, column: EmbedSortColumn): EmbedSort {
  if (column === "name") return current === "name-asc" ? "name-desc" : "name-asc";
  if (column === "widget") return current === "widget-asc" ? "widget-desc" : "widget-asc";
  if (column === "status") return current === "status-asc" ? "status-desc" : "status-asc";
  if (column === "revision") return current === "revision-asc" ? "revision-desc" : "revision-asc";
  return current === "updated-desc" ? "updated-asc" : "updated-desc";
}

function sortAria(current: EmbedSort, column: EmbedSortColumn) {
  const prefix = column === "updated" ? "updated" : column;
  if (current === `${prefix}-asc`) return "ascending" as const;
  if (current === `${prefix}-desc`) return "descending" as const;
  return "none" as const;
}

function sortIndicator(current: EmbedSort, column: EmbedSortColumn) {
  const aria = sortAria(current, column);
  if (aria === "ascending") return "↑";
  if (aria === "descending") return "↓";
  return "";
}

function EmbedPreview({
  program,
  pending,
  widget,
  theme,
  fields,
  filters,
  onFiltersChange,
  meta,
}: {
  program: PublicProgramResponse | undefined;
  pending: boolean;
  widget: PublicEmbedWidget;
  theme: PublicEmbedTheme;
  fields: PublicEmbedFieldVisibility;
  filters: PublicProgramFilters;
  onFiltersChange?: (filters: PublicProgramFilters) => void;
  meta?: string;
}) {
  return (
    <div className="embeds-preview-pane">
      <div className="embeds-preview-head">
        <h3>Public-safe preview</h3>
        {meta ? <span className="muted">{meta}</span> : null}
      </div>
      {program ? (
        <div className="embeds-preview-frame">
          <PublicProgramRenderer
            data={program}
            mode="embed"
            widget={widget}
            theme={theme}
            fieldVisibility={fields}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </div>
      ) : pending ? (
        <p className="empty-state padded">Loading public program…</p>
      ) : (
        <p className="empty-state padded">Publish a public program revision to preview embeds.</p>
      )}
    </div>
  );
}

function EmbedConfigForm({
  event,
  draft,
  setDraft,
  program,
  onSubmit,
  savePending,
  submitLabel,
}: {
  event: EventRecord;
  draft: PublicEmbedConfigInput;
  setDraft: Dispatch<SetStateAction<PublicEmbedConfigInput>>;
  program: PublicProgramResponse | undefined;
  onSubmit: () => void;
  savePending: boolean;
  submitLabel: string;
}) {
  const form = useForm({
    defaultValues: draft,
    listeners: {
      onChange: ({ formApi }) => {
        setDraft(formApi.state.values);
      },
    },
    onSubmit: async () => {
      onSubmit();
    },
  });

  const themeOptions = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "minimal", label: "Minimal" },
  ];
  const widgetOptions = PUBLIC_EMBED_WIDGETS.map((widget) => ({
    value: widget,
    label: WIDGET_LABELS[widget],
  }));
  const revisionOptions = [
    { value: "", label: "Current published revision" },
    ...(program?.revisions ?? []).map((revision) => ({
      value: revision.id,
      label: `Revision ${revision.version}${revision.isCurrent ? " (current)" : ""}`,
    })),
  ];
  const trackOptions = [
    { value: "", label: "All tracks" },
    ...event.tracks.map((track) => ({ value: track.id, label: track.name })),
  ];
  const roomOptions = [
    { value: "", label: "All rooms" },
    ...event.rooms.map((room) => ({ value: room.id, label: room.name })),
    { value: "tbd", label: "Location pending" },
  ];

  return (
    <form
      className="embeds-config-form"
      onSubmit={(submit) => {
        submit.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => (value.trim() ? undefined : "Name is required"),
        }}
      >
        {(field) => (
          <label className="embeds-field">
            <span>Name</span>
            <AppInput
              className="settings-input"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(change) => field.handleChange(change.target.value)}
            />
            {field.state.meta.errors.length > 0 ? (
              <em className="embeds-field-error">{field.state.meta.errors.join(", ")}</em>
            ) : null}
          </label>
        )}
      </form.Field>

      <div className="embeds-config-row">
        <form.Field name="widget">
          {(field) => (
            <label className="embeds-field">
              <span>Widget</span>
              <AppSelect
                label="Widget"
                ariaLabel="Widget"
                variant="sidebar"
                value={field.state.value}
                options={widgetOptions}
                onValueChange={(value) => field.handleChange(value as PublicEmbedWidget)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="theme">
          {(field) => (
            <label className="embeds-field">
              <span>Theme</span>
              <AppSelect
                label="Theme"
                ariaLabel="Embed theme"
                variant="sidebar"
                value={field.state.value}
                options={themeOptions}
                onValueChange={(value) => field.handleChange(value as PublicEmbedTheme)}
              />
            </label>
          )}
        </form.Field>
      </div>

      <form.Field name="revisionId">
        {(field) => (
          <label className="embeds-field">
            <span>Revision</span>
            <AppSelect
              label="Revision"
              ariaLabel="Revision source"
              variant="sidebar"
              value={field.state.value ?? ""}
              options={revisionOptions}
              onValueChange={(value) => field.handleChange(value || null)}
            />
          </label>
        )}
      </form.Field>

      <div className="embeds-config-section">
        <h3>Filters</h3>
        <div className="embeds-config-row">
          <form.Field name="filters.trackId">
            {(field) => (
              <label className="embeds-field">
                <span>Track</span>
                <AppSelect
                  label="Track"
                  ariaLabel="Track filter"
                  variant="sidebar"
                  value={field.state.value ?? ""}
                  options={trackOptions}
                  onValueChange={(value) => field.handleChange(value || undefined)}
                />
              </label>
            )}
          </form.Field>
          <form.Field name="filters.roomId">
            {(field) => (
              <label className="embeds-field">
                <span>Room</span>
                <AppSelect
                  label="Room"
                  ariaLabel="Room filter"
                  variant="sidebar"
                  value={field.state.value ?? ""}
                  options={roomOptions}
                  onValueChange={(value) => field.handleChange(value || undefined)}
                />
              </label>
            )}
          </form.Field>
        </div>
        <form.Field name="filters.format">
          {(field) => (
            <label className="embeds-field">
              <span>Format</span>
              <AppInput
                className="settings-input"
                name={field.name}
                value={field.state.value ?? ""}
                placeholder="keynote, talk, workshop…"
                onBlur={field.handleBlur}
                onChange={(change) => field.handleChange(change.target.value || undefined)}
              />
            </label>
          )}
        </form.Field>
      </div>

      <div className="embeds-config-section">
        <h3>Visible fields</h3>
        <div className="embeds-field-grid">
          {FIELD_LABELS.map((item) => (
            <form.Field key={item.key} name={`fields.${item.key}`}>
              {(field) => (
                <label className="embeds-check">
                  <AppCheckbox
                    checked={Boolean(field.state.value)}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                  {item.label}
                </label>
              )}
            </form.Field>
          ))}
        </div>
      </div>

      <form.Subscribe selector={(state) => [state.canSubmit]}>
        {([canSubmit]) => (
          <div className="settings-actions embeds-form-actions">
            <AppButton
              type="submit"
              className="btn btn-primary"
              disabled={savePending || !canSubmit}
            >
              {savePending ? "Saving…" : submitLabel}
            </AppButton>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

function EmbedInstallPanel({
  config,
  onCopy,
}: {
  config: PublicEmbedConfig;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="embed-copy-panel" aria-label="Embed copy tools">
      <div>
        <h3>Install</h3>
        <p className="muted">
          Copy the iframe for websites, or use the JSON feed URL for custom integrations.
        </p>
      </div>
      <pre className="mcp-config-pre">
        <code>{config.embedCode}</code>
      </pre>
      <div className="mcp-copy-row">
        <AppButton
          className="btn btn-secondary btn-sm"
          onClick={() => void onCopy(config.embedCode, "Embed code")}
        >
          Copy embed code
        </AppButton>
        <AppButton
          className="btn btn-secondary btn-sm"
          onClick={() => void onCopy(config.feedUrl, "Feed URL")}
        >
          Copy feed URL
        </AppButton>
        <AppButton
          className="btn btn-secondary btn-sm"
          nativeButton={false}
          render={
            <a href={config.publicUrl} target="_blank" rel="noreferrer" />
          }
        >
          Open public embed
        </AppButton>
      </div>
    </div>
  );
}

export function EmbedManagerWorkspace({
  event,
  onChromeChange,
}: {
  event: EventRecord;
  onChromeChange?: (chrome: EmbedsChrome | null) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<WorkspaceMode>("list");
  const [queue, setQueue] = useState<EmbedsQueueState>(defaultQueue);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PublicEmbedConfigInput>(() => draftFromConfig(null));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(0);
  const inspectorWidthRef = useRef(0);
  const inspectorSeededRef = useRef(false);
  const [colWidths, setColWidths] = useState<Record<EmbedCol, number>>(loadColWidths);
  const colWidthsRef = useRef(colWidths);
  const tableRef = useRef<HTMLTableElement>(null);
  const splitElRef = useRef<HTMLDivElement | null>(null);
  const splitObserverRef = useRef<ResizeObserver | null>(null);
  colWidthsRef.current = colWidths;

  const configs = useQuery({
    queryKey: ["public-embed-configs", event.id],
    queryFn: () => fetchPublicEmbedConfigs(event.id),
  });
  const program = useQuery({
    queryKey: ["public-program", event.id, "embed-manager"],
    queryFn: () => fetchPublicProgram(event.id),
  });

  const currentRevisionId = program.data?.revision.id ?? null;

  const rows = useMemo(() => {
    const needle = queue.query.trim().toLowerCase();
    return [...(configs.data ?? [])]
      .filter((config) => {
        if (queue.status === "live") return !config.disabled;
        if (queue.status === "disabled") return config.disabled;
        return true;
      })
      .filter((config) =>
        needle
          ? config.name.toLowerCase().includes(needle) ||
            WIDGET_LABELS[config.widget].toLowerCase().includes(needle) ||
            config.id.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => compareEmbeds(a, b, queue.sort, currentRevisionId));
  }, [configs.data, currentRevisionId, queue]);

  const selected = useMemo(
    () => configs.data?.find((config) => config.id === selectedId) ?? null,
    [configs.data, selectedId],
  );

  const builderConfig = creating ? null : selected;

  useEffect(() => {
    localStorage.setItem(EMBED_COL_STORAGE, JSON.stringify(colWidths));
  }, [colWidths]);

  useEffect(() => {
    if (mode !== "list") return;
    if (rows.length === 0) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]!.id);
  }, [mode, rows, selectedId]);

  function showToast(message: string) {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 2200);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (builderConfig) return updatePublicEmbedConfig(event.id, builderConfig.id, draft);
      return createPublicEmbedConfig(event.id, draft);
    },
    onSuccess: async (config) => {
      setCreating(false);
      setSelectedId(config.id);
      setDraft(draftFromConfig(config));
      setMode("builder");
      showToast("Embed configuration saved.");
      await queryClient.invalidateQueries({ queryKey: ["public-embed-configs", event.id] });
    },
    onError: (error) => {
      showToast(error instanceof ApiError ? error.message : "Unable to save embed configuration.");
    },
  });

  const disabledToggle = useMutation({
    mutationFn: (input: { config: PublicEmbedConfig; disabled: boolean }) =>
      updatePublicEmbedConfig(event.id, input.config.id, { disabled: input.disabled }),
    onSuccess: async (config) => {
      if (selectedId === config.id && mode === "builder") setDraft(draftFromConfig(config));
      showToast(config.disabled ? "Embed disabled." : "Embed re-enabled.");
      await queryClient.invalidateQueries({ queryKey: ["public-embed-configs", event.id] });
    },
    onError: (error) => {
      showToast(error instanceof ApiError ? error.message : "Unable to update embed status.");
    },
  });

  function openBuilder(config: PublicEmbedConfig) {
    setCreating(false);
    setSelectedId(config.id);
    setDraft(draftFromConfig(config));
    setMode("builder");
  }

  function startNew() {
    setCreating(true);
    setSelectedId(null);
    setDraft(draftFromConfig(null));
    setMode("builder");
  }

  function backToList() {
    setCreating(false);
    setMode("list");
  }

  function selectRow(id: string) {
    setCreating(false);
    setSelectedId(id);
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    showToast(`${label} copied.`);
  }

  function queueMinFloor() {
    return 240;
  }

  function clampInspectorWidth(desired: number, splitWidth: number, floor = queueMinFloor()) {
    const gutter = 8;
    const maxWidth = Math.max(280, Math.floor(splitWidth - gutter - floor));
    const minWidth = Math.min(280, maxWidth);
    return Math.min(maxWidth, Math.max(minWidth, desired));
  }

  const applyInspectorWidth = useCallback((splitEl: HTMLDivElement) => {
    const splitWidth = splitEl.getBoundingClientRect().width;
    if (splitWidth <= 0) return;
    if (!inspectorSeededRef.current || inspectorWidthRef.current <= 0) {
      const half = Math.round((splitWidth - 8) / 2);
      const seeded = clampInspectorWidth(half, splitWidth, queueMinFloor());
      inspectorSeededRef.current = true;
      inspectorWidthRef.current = seeded;
      setInspectorWidth(seeded);
      splitEl.dataset.previewSized = "true";
      splitEl.style.setProperty("--inspector-width", `${seeded}px`);
      return;
    }
    const next = clampInspectorWidth(
      inspectorWidthRef.current,
      splitWidth,
      queueMinFloor(),
    );
    if (next !== inspectorWidthRef.current) {
      inspectorWidthRef.current = next;
      setInspectorWidth(next);
    }
    splitEl.dataset.previewSized = "true";
    splitEl.style.setProperty("--inspector-width", `${next}px`);
  }, []);

  const setSplitNode = useCallback(
    (node: HTMLDivElement | null) => {
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
    },
    [applyInspectorWidth],
  );

  useEffect(() => {
    return () => {
      splitObserverRef.current?.disconnect();
      splitObserverRef.current = null;
    };
  }, []);

  function tableWidthFor(widths: Record<EmbedCol, number>) {
    return widths.name + widths.widget + widths.revision + widths.status + widths.updated;
  }

  function applyColPercents(table: HTMLTableElement, widths: Record<EmbedCol, number>) {
    const total = tableWidthFor(widths);
    (["name", "widget", "revision", "status", "updated"] as const).forEach((key) => {
      const col = table.querySelector<HTMLTableColElement>(`col.col-embed-${key}`);
      if (col) col.style.width = `${(widths[key] / total) * 100}%`;
    });
  }

  function startColResize(column: EmbedCol, pointer: ReactPointerEvent<HTMLSpanElement>) {
    pointer.preventDefault();
    pointer.stopPropagation();
    const handle = pointer.currentTarget;
    handle.setPointerCapture(pointer.pointerId);
    const table = tableRef.current;
    const startX = pointer.clientX;
    const startWidth = colWidthsRef.current[column];
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      nextWidth = Math.max(EMBED_COL_MIN[column], Math.round(startWidth + event.clientX - startX));
      if (table) applyColPercents(table, { ...colWidthsRef.current, [column]: nextWidth });
    };
    const stop = () => {
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      setColWidths((current) => {
        const next = { ...current, [column]: nextWidth };
        colWidthsRef.current = next;
        return next;
      });
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
    const startWidth =
      inspectorWidthRef.current || Math.round((splitEl?.getBoundingClientRect().width ?? 800) / 2);
    let nextWidth = startWidth;
    const move = (event: PointerEvent) => {
      const splitWidth = splitEl?.getBoundingClientRect().width ?? window.innerWidth;
      nextWidth = clampInspectorWidth(
        startWidth + startX - event.clientX,
        splitWidth,
        queueMinFloor(),
      );
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

  function setSort(column: EmbedSortColumn) {
    setQueue((current) => ({ ...current, sort: toggleSort(current.sort, column) }));
  }

  const activeToggleTarget = mode === "builder" ? builderConfig : selected;

  useEffect(() => {
    if (!onChromeChange) return;

    if (mode === "builder") {
      onChromeChange({
        tools: (
          <div className="topbar-tools-inner">
            <AppButton className="btn btn-secondary btn-sm" onClick={backToList}>
              Back
            </AppButton>
            <span className="embeds-builder-title" title={draft.name}>
              {creating ? "New embed" : draft.name || "Embed builder"}
            </span>
          </div>
        ),
        actions: (
          <>
            {builderConfig ? (
              <AppButton
                className="btn btn-secondary btn-sm"
                disabled={disabledToggle.isPending}
                onClick={() =>
                  disabledToggle.mutate({
                    config: builderConfig,
                    disabled: !builderConfig.disabled,
                  })
                }
              >
                {builderConfig.disabled ? "Re-enable" : "Disable"}
              </AppButton>
            ) : null}
            {builderConfig ? (
              <AppButton
                className="btn btn-secondary btn-sm"
                nativeButton={false}
                render={
                  <a href={builderConfig.publicUrl} target="_blank" rel="noreferrer" />
                }
              >
                Open public
              </AppButton>
            ) : null}
            <AppButton
              className="btn btn-primary btn-sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : builderConfig ? "Save" : "Save embed"}
            </AppButton>
          </>
        ),
      });
      return () => onChromeChange(null);
    }

    onChromeChange({
      tools: (
        <div className="topbar-tools-inner">
          <label className="field search-field topbar-search">
            <Search aria-hidden="true" />
            <AppInput
              type="search"
              className=""
              value={queue.query}
              onChange={(change) =>
                setQueue((current) => ({ ...current, query: change.target.value }))
              }
              placeholder="Search embed name or widget…"
              aria-label="Search embed name or widget"
              autoComplete="off"
            />
          </label>
          <ToggleGroup
            className="seg"
            aria-label="Status filter"
            value={[queue.status]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "all" || value === "live" || value === "disabled") {
                setQueue((current) => ({ ...current, status: value }));
              }
            }}
          >
            <Toggle value="all">All</Toggle>
            <Toggle value="live">Live</Toggle>
            <Toggle value="disabled">Disabled</Toggle>
          </ToggleGroup>
        </div>
      ),
      actions: (
        <>
          {activeToggleTarget ? (
            <AppButton
              className="btn btn-secondary btn-sm"
              disabled={disabledToggle.isPending}
              onClick={() =>
                disabledToggle.mutate({
                  config: activeToggleTarget,
                  disabled: !activeToggleTarget.disabled,
                })
              }
            >
              {activeToggleTarget.disabled ? "Re-enable" : "Disable"}
            </AppButton>
          ) : (
            <AppButton className="btn btn-secondary btn-sm" disabled>
              Disable
            </AppButton>
          )}
          {selected ? (
            <AppButton
              className="btn btn-secondary btn-sm"
              onClick={() => openBuilder(selected)}
            >
              Open Embed Builder
            </AppButton>
          ) : (
            <AppButton className="btn btn-secondary btn-sm" disabled>
              Open Embed Builder
            </AppButton>
          )}
          <AppButton className="btn btn-primary btn-sm" onClick={startNew}>
            New embed
          </AppButton>
        </>
      ),
    });
    return () => onChromeChange(null);
  }, [
    activeToggleTarget,
    builderConfig,
    creating,
    disabledToggle.isPending,
    draft.name,
    mode,
    onChromeChange,
    queue.query,
    queue.status,
    save.isPending,
    selected,
  ]);

  const builderPreviewMeta = `${draft.theme} · ${WIDGET_LABELS[draft.widget]}${
    draft.revisionId ? " · pinned revision" : " · current revision"
  }`;

  return (
    <div className="work embeds-work" aria-label="Embeds workspace" data-mode={mode}>
      {toast ? (
        <div className="builder-toast" data-tone="success" role="status">
          {toast}
        </div>
      ) : null}

      {configs.isPending ? <p className="empty-state padded">Loading embeds…</p> : null}
      {configs.isError ? (
        <p className="form-message" data-tone="error" role="alert">
          {configs.error instanceof ApiError ? configs.error.message : "Unable to load embeds."}
        </p>
      ) : null}

      {configs.isSuccess && mode === "list" ? (
        <div
          ref={setSplitNode}
          className="split embeds-split"
          style={
            inspectorWidth > 0
              ? ({ "--inspector-width": `${inspectorWidth}px` } as CSSProperties)
              : undefined
          }
        >
          <div className="table-wrap">
            {rows.length === 0 ? (
              <p className="empty-state padded">
                {(configs.data?.length ?? 0) === 0
                  ? "No saved embeds yet. Create one to generate a public snippet or feed."
                  : "No embeds match these filters. Try another status or search."}
              </p>
            ) : (
                <table
                  ref={tableRef}
                  className="grid embeds-grid"
                  aria-label="Saved embeds"
                >
                  <colgroup>
                    <col
                      className="col-embed-name"
                      style={{ width: `${(colWidths.name / tableWidthFor(colWidths)) * 100}%` }}
                    />
                    <col
                      className="col-embed-widget"
                      style={{ width: `${(colWidths.widget / tableWidthFor(colWidths)) * 100}%` }}
                    />
                    <col
                      className="col-embed-revision"
                      style={{ width: `${(colWidths.revision / tableWidthFor(colWidths)) * 100}%` }}
                    />
                    <col
                      className="col-embed-status"
                      style={{ width: `${(colWidths.status / tableWidthFor(colWidths)) * 100}%` }}
                    />
                    <col
                      className="col-embed-updated"
                      style={{ width: `${(colWidths.updated / tableWidthFor(colWidths)) * 100}%` }}
                    />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className="col-embed-name" aria-sort={sortAria(queue.sort, "name")}>
                        <AppButton className="th-sort" onClick={() => setSort("name")}>
                          Embed
                          <span className="th-sort-ind" aria-hidden="true">
                            {sortIndicator(queue.sort, "name")}
                          </span>
                        </AppButton>
                        <span
                          className="col-resizer"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize Embed column"
                          onPointerDown={(event) => startColResize("name", event)}
                        />
                      </th>
                    <th
                      scope="col"
                      className="col-embed-widget"
                      aria-sort={sortAria(queue.sort, "widget")}
                    >
                      <AppButton className="th-sort" onClick={() => setSort("widget")}>
                        Widget
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "widget")}
                        </span>
                      </AppButton>
                      <span
                        className="col-resizer"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize Widget column"
                        onPointerDown={(event) => startColResize("widget", event)}
                      />
                    </th>
                    <th
                      scope="col"
                      className="col-embed-revision"
                      aria-sort={sortAria(queue.sort, "revision")}
                    >
                      <AppButton className="th-sort" onClick={() => setSort("revision")}>
                        Revision
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "revision")}
                        </span>
                      </AppButton>
                      <span
                        className="col-resizer"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize Revision column"
                        onPointerDown={(event) => startColResize("revision", event)}
                      />
                    </th>
                    <th
                      scope="col"
                      className="col-embed-status"
                      aria-sort={sortAria(queue.sort, "status")}
                    >
                      <AppButton className="th-sort" onClick={() => setSort("status")}>
                        Status
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "status")}
                        </span>
                      </AppButton>
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
                      className="col-embed-updated"
                      aria-sort={sortAria(queue.sort, "updated")}
                    >
                      <AppButton className="th-sort" onClick={() => setSort("updated")}>
                        Updated
                        <span className="th-sort-ind" aria-hidden="true">
                          {sortIndicator(queue.sort, "updated")}
                        </span>
                      </AppButton>
                      <span
                        className="col-resizer"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize Updated column"
                        onPointerDown={(event) => startColResize("updated", event)}
                      />
                    </th>
                    </tr>
                  </thead>
                <tbody>
                  {rows.map((config) => (
                    <tr
                      key={config.id}
                      className="embed-row"
                      aria-selected={selectedId === config.id}
                      onClick={() => selectRow(config.id)}
                      onDoubleClick={() => openBuilder(config)}
                    >
                      <td className="col-embed-name">
                        <div className="form-name-stack">
                          <AppButton
                            className="embed-title-link"
                            onClick={(click) => {
                              click.stopPropagation();
                              openBuilder(config);
                            }}
                          >
                            {config.name}
                          </AppButton>
                          <span className="form-id-sub">{config.id}</span>
                        </div>
                      </td>
                      <td className="col-embed-widget">{WIDGET_LABELS[config.widget]}</td>
                      <td className="col-embed-revision">
                        <span
                          className={`flag flag-box ${config.revisionId ? "flag-pinned" : "flag-current"}`}
                        >
                          {revisionLabel(config, currentRevisionId)}
                        </span>
                      </td>
                      <td className="col-embed-status">
                        <span
                          className={`flag flag-box ${config.disabled ? "flag-disabled" : "flag-live"}`}
                        >
                          {config.disabled ? "Disabled" : "Live"}
                        </span>
                      </td>
                      <td className="col-embed-updated muted tabular-nums">
                        {formatUpdatedAt(config.updatedAt)}
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
            aria-label="Resize embed preview"
            aria-orientation="vertical"
            aria-valuemin={320}
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
                  const next = clampInspectorWidth(width + 24, splitWidth, queueMinFloor());
                  inspectorWidthRef.current = next;
                  splitElRef.current?.style.setProperty("--inspector-width", `${next}px`);
                  return next;
                });
              } else if (key.key === "ArrowRight") {
                key.preventDefault();
                setInspectorWidth((width) => {
                  const next = clampInspectorWidth(width - 24, splitWidth, queueMinFloor());
                  inspectorWidthRef.current = next;
                  splitElRef.current?.style.setProperty("--inspector-width", `${next}px`);
                  return next;
                });
              }
            }}
          />

          <aside
            className={`inspector embeds-inspector${selected ? " has-selection" : ""}`}
            aria-label="Embed preview"
          >
            {selected ? (
              <div className="inspector-content">
                <div className="embeds-list-inspector">
                  <div className="embeds-list-bar">
                    <h2 title={selected.name}>{selected.name}</h2>
                    <div className="embeds-list-actions">
                      <AppButton
                        className="btn btn-secondary btn-sm"
                        onClick={() => openBuilder(selected)}
                      >
                        Open Embed Builder
                      </AppButton>
                      <AppButton
                        className="btn btn-secondary btn-sm"
                        onClick={() => void copy(selected.embedCode, "Embed code")}
                      >
                        Copy embed code
                      </AppButton>
                      <AppButton
                        className="btn btn-secondary btn-sm"
                        onClick={() => void copy(selected.feedUrl, "Feed URL")}
                      >
                        Copy feed URL
                      </AppButton>
                      <AppButton
                        className="btn btn-secondary btn-sm"
                        nativeButton={false}
                        render={
                          <a href={selected.publicUrl} target="_blank" rel="noreferrer" />
                        }
                      >
                        Open public embed
                      </AppButton>
                    </div>
                  </div>
                  <div className="embeds-list-preview">
                    {program.data ? (
                      <PublicProgramRenderer
                        data={program.data}
                        mode="embed"
                        widget={selected.widget}
                        theme={selected.theme}
                        fieldVisibility={selected.fields}
                        filters={selected.filters}
                      />
                    ) : program.isPending ? (
                      <p className="empty-state padded">Loading public program…</p>
                    ) : (
                      <p className="empty-state padded">
                        Publish a public program revision to preview embeds.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="inspector-body">
                <p className="empty-state padded">
                  Select an embed to preview it, or create a new one.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {configs.isSuccess && mode === "builder" ? (
        <div className="embeds-builder" aria-label="Embed builder">
          <div className="embeds-builder-config">
            <EmbedConfigForm
              key={creating ? "new" : (selectedId ?? "none")}
              event={event}
              draft={draft}
              setDraft={setDraft}
              program={program.data}
              onSubmit={() => save.mutate()}
              savePending={save.isPending}
              submitLabel={builderConfig ? "Save changes" : "Save embed"}
            />
            {builderConfig ? (
              <EmbedInstallPanel config={builderConfig} onCopy={copy} />
            ) : (
              <p className="empty-state padded embeds-install-empty">
                Save this embed to get install code and a feed URL.
              </p>
            )}
          </div>
          <div className="embeds-builder-preview">
            <EmbedPreview
              program={program.data}
              pending={program.isPending}
              widget={draft.widget}
              theme={draft.theme}
              fields={draft.fields}
              filters={draft.filters}
              onFiltersChange={(next) => setDraft((current) => ({ ...current, filters: next }))}
              meta={builderPreviewMeta}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
