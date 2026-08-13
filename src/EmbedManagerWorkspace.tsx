import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  EventRecord,
  PublicEmbedConfig,
  PublicEmbedConfigInput,
  PublicEmbedFieldVisibility,
  PublicEmbedTheme,
  PublicEmbedWidget,
  PublicProgramFilters,
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
import { PublicProgramRenderer } from "./PublicProgramRenderer";

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

function fieldValue(fields: PublicEmbedFieldVisibility, key: keyof PublicEmbedFieldVisibility) {
  return fields[key];
}

export function EmbedManagerWorkspace({ event }: { event: EventRecord }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PublicEmbedConfigInput>(() => draftFromConfig(null));
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const configs = useQuery({
    queryKey: ["public-embed-configs", event.id],
    queryFn: () => fetchPublicEmbedConfigs(event.id),
  });
  const program = useQuery({
    queryKey: ["public-program", event.id, "embed-manager"],
    queryFn: () => fetchPublicProgram(event.id),
  });

  const selected = useMemo(
    () => configs.data?.find((config) => config.id === selectedId) ?? null,
    [configs.data, selectedId],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (selected) return updatePublicEmbedConfig(event.id, selected.id, draft);
      return createPublicEmbedConfig(event.id, draft);
    },
    onSuccess: async (config) => {
      setSelectedId(config.id);
      setDraft(draftFromConfig(config));
      setMessage("Embed configuration saved.");
      await queryClient.invalidateQueries({ queryKey: ["public-embed-configs", event.id] });
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? error.message : "Unable to save embed configuration.");
    },
  });

  const disabledToggle = useMutation({
    mutationFn: (input: { config: PublicEmbedConfig; disabled: boolean }) =>
      updatePublicEmbedConfig(event.id, input.config.id, { disabled: input.disabled }),
    onSuccess: async (config) => {
      if (selectedId === config.id) setDraft(draftFromConfig(config));
      setMessage(config.disabled ? "Embed disabled." : "Embed re-enabled.");
      await queryClient.invalidateQueries({ queryKey: ["public-embed-configs", event.id] });
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? error.message : "Unable to update embed status.");
    },
  });

  const filters = draft.filters;
  const updateFilters = (patch: Partial<PublicProgramFilters>) => {
    setDraft((current) => ({
      ...current,
      filters: { ...current.filters, ...patch },
    }));
  };

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`${label} copied.`);
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  return (
    <div className="workspace embed-manager-workspace">
      <section className="operations-panel embed-manager-list" aria-labelledby="embed-manager-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Public distribution</p>
            <h2 id="embed-manager-title">Embed manager</h2>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSelectedId(null);
              setDraft(draftFromConfig(null));
              setMessage(null);
            }}
          >
            New embed
          </button>
        </div>
        {configs.isPending ? <p className="empty-state padded">Loading embeds…</p> : null}
        {configs.isError ? (
          <p className="empty-state padded" role="alert">
            {configs.error instanceof ApiError ? configs.error.message : "Unable to load embeds."}
          </p>
        ) : null}
        {configs.data && configs.data.length === 0 ? (
          <p className="empty-state padded">No saved embed configurations yet.</p>
        ) : null}
        <ul className="embed-config-list">
          {(configs.data ?? []).map((config) => (
            <li key={config.id}>
              <button
                type="button"
                className={config.id === selectedId ? "embed-config-card active" : "embed-config-card"}
                onClick={() => {
                  setSelectedId(config.id);
                  setDraft(draftFromConfig(config));
                  setMessage(null);
                }}
              >
                <span>
                  <strong>{config.name}</strong>
                  <span>{WIDGET_LABELS[config.widget]} · {config.revisionId ? "Pinned revision" : "Current revision"}</span>
                </span>
                <span className={config.disabled ? "status-pill status-error" : "status-pill status-success"}>
                  {config.disabled ? "Disabled" : "Live"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="operations-panel embed-manager-editor" aria-labelledby="embed-config-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Configuration</p>
            <h2 id="embed-config-title">{selected ? selected.name : "New embed"}</h2>
          </div>
          {selected ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => disabledToggle.mutate({ config: selected, disabled: !selected.disabled })}
              disabled={disabledToggle.isPending}
            >
              {selected.disabled ? "Re-enable" : "Disable"}
            </button>
          ) : null}
        </div>

        <form
          className="embed-config-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            save.mutate();
          }}
        >
          <label className="settings-label">
            Embed name
            <input
              className="settings-input"
              value={draft.name}
              onChange={(change) => setDraft((current) => ({ ...current, name: change.target.value }))}
            />
          </label>

          <div className="embed-widget-grid" role="group" aria-label="Widget">
            {PUBLIC_EMBED_WIDGETS.map((widget) => (
              <label key={widget} className="embed-widget-option">
                <input
                  type="radio"
                  name="widget"
                  checked={draft.widget === widget}
                  onChange={() => setDraft((current) => ({ ...current, widget }))}
                />
                <span>{WIDGET_LABELS[widget]}</span>
              </label>
            ))}
          </div>

          <div className="embed-config-columns">
            <label className="settings-label">
              Theme
              <select
                className="settings-input"
                value={draft.theme}
                onChange={(change) =>
                  setDraft((current) => ({
                    ...current,
                    theme: change.target.value as PublicEmbedTheme,
                  }))
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
            <label className="settings-label">
              Revision source
              <select
                className="settings-input"
                value={draft.revisionId ?? ""}
                onChange={(change) =>
                  setDraft((current) => ({
                    ...current,
                    revisionId: change.target.value || null,
                  }))
                }
              >
                <option value="">Current published revision</option>
                {(program.data?.revisions ?? []).map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    Revision {revision.version} {revision.isCurrent ? "(current)" : "(pinned)"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="embed-filter-fieldset">
            <legend>Content filters</legend>
            <label className="settings-label">
              Track
              <select
                className="settings-input"
                value={filters.trackId ?? ""}
                onChange={(change) => updateFilters({ trackId: change.target.value || undefined })}
              >
                <option value="">All tracks</option>
                {event.tracks.map((track) => (
                  <option key={track.id} value={track.id}>{track.name}</option>
                ))}
              </select>
            </label>
            <label className="settings-label">
              Room
              <select
                className="settings-input"
                value={filters.roomId ?? ""}
                onChange={(change) => updateFilters({ roomId: change.target.value || undefined })}
              >
                <option value="">All rooms</option>
                {event.rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
                <option value="tbd">Location pending</option>
              </select>
            </label>
            <label className="settings-label">
              Format
              <input
                className="settings-input"
                value={filters.format ?? ""}
                placeholder="keynote, talk, workshop…"
                onChange={(change) => updateFilters({ format: change.target.value || undefined })}
              />
            </label>
          </fieldset>

          <fieldset className="embed-field-fieldset">
            <legend>Visible fields</legend>
            {FIELD_LABELS.map((field) => (
              <label key={field.key} className="settings-check">
                <input
                  type="checkbox"
                  checked={fieldValue(draft.fields, field.key)}
                  onChange={(change) =>
                    setDraft((current) => ({
                      ...current,
                      fields: { ...current.fields, [field.key]: change.target.checked },
                    }))
                  }
                />
                {field.label}
              </label>
            ))}
          </fieldset>

          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : selected ? "Update embed" : "Save embed"}
            </button>
            {message ? <span role="status" className="form-message inline-message">{message}</span> : null}
          </div>
        </form>

        {selected ? (
          <div className="embed-copy-panel" aria-label="Embed copy tools">
            <div>
              <h3>Install code</h3>
              <p className="muted">Copy the iframe for websites, or use the JSON feed URL for custom integrations.</p>
            </div>
            <pre className="mcp-config-pre"><code>{selected.embedCode}</code></pre>
            <div className="mcp-copy-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(selected.embedCode, "Embed code")}>
                Copy embed code
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(selected.feedUrl, "Feed URL")}>
                Copy feed URL
              </button>
              <a className="btn btn-ghost btn-sm" href={selected.publicUrl} target="_blank" rel="noreferrer">
                Open public embed
              </a>
              {copyMessage ? <span role="status" className="form-message inline-message">{copyMessage}</span> : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="operations-panel embed-preview-panel" aria-labelledby="embed-preview-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Preview</p>
            <h2 id="embed-preview-title">Public-safe rendering</h2>
          </div>
        </div>
        {program.data ? (
          <PublicProgramRenderer
            data={program.data}
            mode="embed"
            widget={draft.widget}
            theme={draft.theme}
            fieldVisibility={draft.fields}
            filters={draft.filters}
            onFiltersChange={(filters) => setDraft((current) => ({ ...current, filters }))}
          />
        ) : (
          <p className="empty-state padded">Publish a public program revision to preview embeds.</p>
        )}
      </section>
    </div>
  );
}
