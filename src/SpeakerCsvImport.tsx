import { ChangeEvent, useMemo, useState } from "react";

import type {
  SpeakerCsvColumnMapping,
  SpeakerCsvImportApplyResult,
  SpeakerCsvImportPreview,
  SpeakerCsvPreviewOutcome,
  SpeakerCsvResolution,
} from "../shared/events";
import { inspectSpeakerCsv } from "../shared/speaker-csv";
import {
  ApiError,
  applySpeakerCsvImport,
  previewSpeakerCsvImport,
} from "./api";
import { AppSelect } from "./AppSelect";

const EMPTY_MAPPING: SpeakerCsvColumnMapping = {
  name: "",
  email: "",
  biography: null,
  title: "",
  organization: "",
};

function chooseHeader(headers: string[], candidates: string[]): string {
  const normalized = new Map(headers.map((header) => [header.toLowerCase(), header]));
  for (const candidate of candidates) {
    const match = normalized.get(candidate);
    if (match) return match;
  }
  return "";
}

function automaticMapping(headers: string[]): SpeakerCsvColumnMapping {
  return {
    name: chooseHeader(headers, ["full name", "speaker name", "name"]),
    email: chooseHeader(headers, ["email address", "speaker email", "email"]),
    biography:
      chooseHeader(headers, ["biography", "speaker biography", "bio"]) || null,
    title: chooseHeader(headers, ["job title", "speaker title", "title", "role"]),
    organization: chooseHeader(headers, [
      "organization",
      "organisation",
      "company",
      "employer",
    ]),
  };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the CSV file."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

function defaultResolution(
  outcome: SpeakerCsvPreviewOutcome,
  speakerId: string | null,
): SpeakerCsvResolution {
  if (outcome === "create") return { action: "create" };
  if (outcome === "reuse" && speakerId) return { action: "reuse", speakerId };
  if (outcome === "update" && speakerId) return { action: "update", speakerId };
  return { action: "skip" };
}

function resolutionValue(resolution: SpeakerCsvResolution): string {
  return resolution.speakerId
    ? `${resolution.action}:${resolution.speakerId}`
    : resolution.action;
}

function rowActionOptions(row: SpeakerCsvImportPreview["rows"][number]) {
  const options: { value: string; label: string }[] = [];
  if (row.outcome === "create") options.push({ value: "create", label: "Create" });
  if (row.outcome === "reuse" && row.selectedSpeakerId) {
    options.push({ value: `reuse:${row.selectedSpeakerId}`, label: "Reuse match" });
  }
  if (row.outcome === "update" && row.selectedSpeakerId) {
    options.push({ value: `update:${row.selectedSpeakerId}`, label: "Update match" });
  }
  if (row.outcome === "invalid") {
    for (const match of row.matches) {
      options.push({
        value: `reuse:${match.speakerId}`,
        label: `Reuse ${match.name} · ${match.email}`,
      });
    }
    if (row.matches.length > 0 && row.matches.every((match) => match.signal === "name")) {
      options.push({ value: "create", label: "Create separate identity" });
    }
  }
  options.push({ value: "skip", label: "Skip" });
  return options;
}

function summary(
  totals: Record<string, number>,
  labels: Record<string, string> = {},
): string {
  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${labels[key] ?? key}`)
    .join(" · ");
}

export function SpeakerCsvImport({
  eventId,
  onChanged,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  eventId: string;
  onChanged: () => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<SpeakerCsvColumnMapping>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<SpeakerCsvImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, SpeakerCsvResolution>>(
    {},
  );
  const [receipt, setReceipt] = useState<SpeakerCsvImportApplyResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      const inspected = inspectSpeakerCsv(text);
      setCsvText(text);
      setFileName(file.name);
      setHeaders(inspected.headers);
      setRowCount(inspected.rowCount);
      setMapping(automaticMapping(inspected.headers));
      setPreview(null);
      setReceipt(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read CSV.");
    }
  }

  async function onPreview() {
    setPending("preview");
    setError(null);
    try {
      const planned = await previewSpeakerCsvImport(eventId, { csvText, mapping });
      setPreview(planned);
      setReceipt(null);
      setIdempotencyKey(`speaker-csv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setResolutions(
        Object.fromEntries(
          planned.rows.map((row) => [
            String(row.rowNumber),
            defaultResolution(row.outcome, row.selectedSpeakerId),
          ]),
        ),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not preview CSV.");
    } finally {
      setPending(null);
    }
  }

  async function onApply() {
    if (!preview) return;
    setPending("apply");
    setError(null);
    try {
      const applied = await applySpeakerCsvImport(eventId, {
        csvText,
        mapping,
        previewDigest: preview.digest,
        resolutions,
        idempotencyKey,
      });
      setReceipt(applied);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not apply CSV.");
    } finally {
      setPending(null);
    }
  }

  const changeCount = useMemo(
    () => Object.values(resolutions).filter((resolution) => resolution.action !== "skip").length,
    [resolutions],
  );

  function updateMapping(field: keyof SpeakerCsvColumnMapping, value: string) {
    setMapping({ ...mapping, [field]: value || (field === "biography" ? null : "") });
    setPreview(null);
    setReceipt(null);
  }

  function setResolution(rowNumber: number, value: string) {
    const [action, speakerId] = value.split(":");
    setResolutions({
      ...resolutions,
      [String(rowNumber)]: {
        action: action as SpeakerCsvResolution["action"],
        ...(speakerId ? { speakerId } : {}),
      },
    });
  }

  if (hideTrigger && !open) return null;

  return (
    <div className="speaker-csv-import">
      {hideTrigger ? null : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setOpen(!open);
            setError(null);
          }}
        >
          {open ? "Close CSV import" : "Import CSV"}
        </button>
      )}
      {open ? (
        <section className="speaker-csv-panel" aria-label="Import speakers from CSV">
          <div className="speaker-directory-form-head">
            <h3>Import speakers from CSV</h3>
            <p>Map columns, preview every outcome, then apply only approved rows.</p>
          </div>
          <label className="speaker-csv-file">
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
          </label>
          {fileName ? <p className="muted-line">{fileName} · {rowCount} rows</p> : null}
          {headers.length > 0 ? (
            <div className="speaker-csv-mapping">
              {(
                [
                  ["name", "Name column", false],
                  ["email", "Email column", false],
                  ["biography", "Biography column", true],
                  ["title", "Title column", false],
                  ["organization", "Organization column", false],
                ] as const
              ).map(([field, label, optional]) => (
                <AppSelect
                  key={field}
                  label={label}
                  ariaLabel={label}
                  value={mapping[field] ?? ""}
                  options={[
                    { value: "", label: optional ? "Not mapped" : "Choose column" },
                    ...headers.map((header) => ({ value: header, label: header })),
                  ]}
                  onValueChange={(value) => updateMapping(field, value)}
                />
              ))}
            </div>
          ) : null}
          {error ? <p className="form-message" data-tone="error">{error}</p> : null}
          {headers.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending !== null}
              onClick={() => void onPreview()}
            >
              {pending === "preview"
                ? "Previewing…"
                : `Preview ${rowCount} row${rowCount === 1 ? "" : "s"}`}
            </button>
          ) : null}

          {preview ? (
            <div className="speaker-csv-review">
              <p className="speaker-csv-totals" aria-live="polite">
                {summary(preview.totals)}
              </p>
              <div className="onboarding-table-wrap">
                <table className="onboarding-table" aria-label="Speaker import preview">
                  <thead><tr><th>Row</th><th>Speaker</th><th>Outcome</th><th>Feedback</th><th>Action</th></tr></thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const resolution = resolutions[String(row.rowNumber)] ?? { action: "skip" };
                      return (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td><strong>{row.values.name || "Missing name"}</strong><br /><span className="muted-line">{row.values.email || "Missing email"}</span></td>
                          <td><span className="speaker-csv-outcome" data-outcome={row.outcome}>{row.outcome}</span></td>
                          <td>{row.feedback.join(" ")}</td>
                          <td>
                            <AppSelect
                              label="Action"
                              ariaLabel={`Action for CSV row ${row.rowNumber}`}
                              value={resolutionValue(resolution)}
                              options={rowActionOptions(row)}
                              onValueChange={(value) => setResolution(row.rowNumber, value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending !== null || changeCount === 0 || Boolean(receipt)}
                onClick={() => void onApply()}
              >
                {pending === "apply" ? "Applying…" : `Apply ${changeCount} changes`}
              </button>
            </div>
          ) : null}

          {receipt ? (
            <div className="speaker-csv-receipt" role="status">
              <strong>Import receipt {receipt.id}</strong>
              <p>{summary(receipt.totals)}</p>
              <time dateTime={receipt.appliedAt}>{new Date(receipt.appliedAt).toLocaleString()}</time>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
