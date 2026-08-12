import type { AirtableRecord, AirtableResourceKind } from "../../shared/airtable";
import { CHARTSTEAD_AIRTABLE_TEMPLATE, getTableMap } from "../../shared/airtable-field-map";

export class AirtableClientError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unconfigured"
      | "rate_limited"
      | "unavailable"
      | "auth"
      | "invalid"
      | "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "AirtableClientError";
  }
}

export interface AirtableClientConfig {
  accessToken: string;
  baseId: string;
  fetchImpl?: typeof fetch;
}

export interface AirtableClient {
  listTable(kind: AirtableResourceKind): Promise<AirtableRecord[]>;
  upsertRecord(input: {
    kind: AirtableResourceKind;
    chartsteadId: string;
    fields: Record<string, unknown>;
    providerRecordId: string | null;
  }): Promise<{ recordId: string; created: boolean }>;
}

function classifyResponse(response: Response): never {
  if (response.status === 429) {
    throw new AirtableClientError("Airtable rate limited the request.", "rate_limited", 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AirtableClientError(
      "Airtable rejected the access token.",
      "auth",
      response.status,
    );
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new AirtableClientError(
      `Airtable rejected the mapped record (${response.status}).`,
      "invalid",
      response.status,
    );
  }
  throw new AirtableClientError(
    `Airtable request failed (${response.status}).`,
    "unavailable",
    response.status,
  );
}

export function isAirtableConfigured(env: {
  AIRTABLE_ACCESS_TOKEN?: string;
  AIRTABLE_BASE_ID?: string;
}): boolean {
  return Boolean(env.AIRTABLE_ACCESS_TOKEN?.trim() && env.AIRTABLE_BASE_ID?.trim());
}

export function createAirtableClient(config: AirtableClientConfig): AirtableClient {
  const token = config.accessToken.trim();
  const baseId = config.baseId.trim();
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!token || !baseId) {
    throw new AirtableClientError(
      "Airtable is not configured.",
      "unconfigured",
    );
  }

  return {
    async listTable(kind) {
      const table = getTableMap(kind, CHARTSTEAD_AIRTABLE_TEMPLATE);
      const records: AirtableRecord[] = [];
      let offset: string | undefined;

      do {
        const url = new URL(
          `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table.tableName)}`,
        );
        url.searchParams.set("pageSize", "100");
        if (offset) url.searchParams.set("offset", offset);

        const response = await fetchImpl(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (response.status === 429) {
          throw new AirtableClientError(
            "Airtable rate limited the request.",
            "rate_limited",
            429,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AirtableClientError(
            "Airtable rejected the access token.",
            "auth",
            response.status,
          );
        }
        if (!response.ok) {
          throw new AirtableClientError(
            `Airtable request failed (${response.status}).`,
            "unavailable",
            response.status,
          );
        }

        const body = (await response.json()) as {
          records?: Array<{ id: string; fields?: Record<string, unknown> }>;
          offset?: string;
        };
        for (const row of body.records ?? []) {
          records.push({ id: row.id, fields: row.fields ?? {} });
        }
        offset = body.offset;
      } while (offset);

      return records;
    },
    async upsertRecord(input) {
      const table = getTableMap(input.kind, CHARTSTEAD_AIRTABLE_TEMPLATE);
      const collectionUrl = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table.tableName)}`;
      const url = input.providerRecordId
        ? `${collectionUrl}/${encodeURIComponent(input.providerRecordId)}`
        : collectionUrl;
      const body = input.providerRecordId
        ? { fields: input.fields }
        : {
            performUpsert: { fieldsToMergeOn: [table.chartsteadIdField] },
            records: [{ fields: input.fields }],
          };
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new AirtableClientError(
          "Airtable delivery outcome could not be confirmed.",
          "unknown",
        );
      }
      if (!response.ok) classifyResponse(response);
      const payload = (await response.json()) as {
        id?: string;
        records?: Array<{ id: string }>;
        createdRecords?: string[];
      };
      const recordId = payload.id ?? payload.records?.[0]?.id;
      if (!recordId) {
        throw new AirtableClientError(
          "Airtable returned no record identity after the write.",
          "unknown",
        );
      }
      return {
        recordId,
        created: input.providerRecordId == null || payload.createdRecords?.includes(recordId) === true,
      };
    },
  };
}

export function createMemoryAirtableClient(
  tables: Partial<Record<AirtableResourceKind, AirtableRecord[]>>,
): AirtableClient {
  let recordSequence = 0;
  return {
    async listTable(kind) {
      return tables[kind] ?? [];
    },
    async upsertRecord(input) {
      const table = getTableMap(input.kind, CHARTSTEAD_AIRTABLE_TEMPLATE);
      const rows = tables[input.kind] ?? (tables[input.kind] = []);
      const existing = input.providerRecordId
        ? rows.find((row) => row.id === input.providerRecordId)
        : rows.find((row) => row.fields[table.chartsteadIdField] === input.chartsteadId);
      if (existing) {
        existing.fields = { ...existing.fields, ...input.fields };
        return { recordId: existing.id, created: false };
      }
      recordSequence += 1;
      const record = {
        id: `recMemory${recordSequence.toString().padStart(6, "0")}`,
        fields: { ...input.fields },
      };
      rows.push(record);
      return { recordId: record.id, created: true };
    },
  };
}
