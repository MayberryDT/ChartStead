import type {
  SpeakerCsvColumnMapping,
  SpeakerCsvMappedRow,
} from "./events";

export class SpeakerCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeakerCsvParseError";
  }
}

export interface ParsedSpeakerCsv {
  headers: string[];
  rows: SpeakerCsvMappedRow[];
}

const REQUIRED_MAPPINGS = ["name", "email", "title", "organization"] as const;

function parseCells(csvText: string): Array<{ rowNumber: number; cells: string[] }> {
  const rows: Array<{ rowNumber: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let physicalRow = 1;
  let recordRow = 1;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]!;
    if (character === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
      cells.push(cell);
      if (cells.some((value) => value.trim().length > 0)) {
        rows.push({ rowNumber: recordRow, cells });
      }
      physicalRow += 1;
      recordRow = physicalRow;
      cells = [];
      cell = "";
      continue;
    }
    if (character === "\n" || character === "\r") physicalRow += 1;
    cell += character;
  }

  if (inQuotes) {
    throw new SpeakerCsvParseError(
      `CSV row ${recordRow} has an unclosed quoted field.`,
    );
  }
  cells.push(cell);
  if (cells.some((value) => value.trim().length > 0)) {
    rows.push({ rowNumber: recordRow, cells });
  }
  return rows;
}

export function inspectSpeakerCsv(csvText: string): {
  headers: string[];
  rowCount: number;
} {
  const records = parseCells(csvText.replace(/^\uFEFF/, ""));
  return {
    headers: records[0]?.cells.map((header) => header.trim()) ?? [],
    rowCount: Math.max(0, records.length - 1),
  };
}

export function parseSpeakerCsv(
  csvText: string,
  mapping: SpeakerCsvColumnMapping,
): ParsedSpeakerCsv {
  if (new TextEncoder().encode(csvText).byteLength > 1_000_000) {
    throw new SpeakerCsvParseError("CSV files must be 1 MB or smaller.");
  }
  const records = parseCells(csvText.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new SpeakerCsvParseError("CSV must include a header row.");
  }
  const headers = records[0]!.cells.map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new SpeakerCsvParseError("CSV header names cannot be empty.");
  }
  if (new Set(headers).size !== headers.length) {
    throw new SpeakerCsvParseError("CSV header names must be unique.");
  }
  for (const field of [...REQUIRED_MAPPINGS, "biography"] as const) {
    const column = mapping[field];
    if (REQUIRED_MAPPINGS.includes(field as (typeof REQUIRED_MAPPINGS)[number]) && !column) {
      throw new SpeakerCsvParseError(`Map the required ${field} column.`);
    }
    if (column && !headers.includes(column)) {
      throw new SpeakerCsvParseError(
        `Mapped column "${column}" was not found in the CSV header.`,
      );
    }
  }
  if (records.length > 1_001) {
    throw new SpeakerCsvParseError("Import 1000 speaker rows or fewer at a time.");
  }

  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const value = (cells: string[], column: string | null): string =>
    column ? (cells[indexByHeader.get(column)!] ?? "").trim() : "";
  return {
    headers,
    rows: records.slice(1).map((record) => {
      const feedback =
        record.cells.length === headers.length
          ? []
          : [
              `Expected ${headers.length} columns but found ${record.cells.length}.`,
            ];
      return {
        rowNumber: record.rowNumber,
        values: {
          name: value(record.cells, mapping.name),
          email: value(record.cells, mapping.email).toLowerCase(),
          biography: value(record.cells, mapping.biography),
          titleSnapshot: value(record.cells, mapping.title),
          organizationSnapshot: value(record.cells, mapping.organization),
          role: "invited",
        },
        parseFeedback: feedback,
      };
    }),
  };
}
