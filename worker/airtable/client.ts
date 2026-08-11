import type { AirtableRecord, AirtableResourceKind } from "../../shared/airtable";
import { CHARTSTEAD_AIRTABLE_TEMPLATE, getTableMap } from "../../shared/airtable-field-map";

export class AirtableClientError extends Error {
  constructor(
    message: string,
    readonly code: "unconfigured" | "rate_limited" | "unavailable" | "auth" | "invalid",
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
  };
}

export function createMemoryAirtableClient(
  tables: Partial<Record<AirtableResourceKind, AirtableRecord[]>>,
): AirtableClient {
  return {
    async listTable(kind) {
      return tables[kind] ?? [];
    },
  };
}
