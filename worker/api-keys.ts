import type { OrganizerPrincipal } from "../shared/events";

/** Minimal D1 surface used by API key storage (avoids workers-types import). */
type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
    run(): Promise<unknown>;
  };
};

const API_KEY_PREFIX = "cs_live_";

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  user_id: string;
  display_name: string;
  role: "admin" | "reviewer";
  event_ids_json: string;
  roles_by_event_json: string;
  track_ids_by_event_json: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export async function ensureApiKeysTable(db: D1Like): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
        event_ids_json TEXT NOT NULL,
        roles_by_event_json TEXT NOT NULL DEFAULT '{}',
        track_ids_by_event_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT
      )`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash)`,
    )
    .run();
}

export async function createApiKey(input: {
  db: D1Like;
  name: string;
  principal: OrganizerPrincipal;
  rawKey?: string;
  now?: Date;
}): Promise<{ id: string; name: string; token: string; createdAt: string }> {
  await ensureApiKeysTable(input.db);
  const now = (input.now ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const token = input.rawKey ?? `${API_KEY_PREFIX}${randomTokenPart()}${randomTokenPart()}`;
  const keyHash = await hashApiKey(token);
  const keyPrefix = token.slice(0, 12);

  await input.db
    .prepare(
      `INSERT INTO api_keys (
        id, name, key_prefix, key_hash, user_id, display_name, role,
        event_ids_json, roles_by_event_json, track_ids_by_event_json,
        created_at, revoked_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .bind(
      id,
      input.name.trim() || "API key",
      keyPrefix,
      keyHash,
      input.principal.id,
      input.principal.displayName,
      input.principal.role,
      JSON.stringify(input.principal.eventIds),
      JSON.stringify(input.principal.rolesByEvent ?? {}),
      JSON.stringify(input.principal.trackIdsByEvent ?? {}),
      now,
    )
    .run();

  return { id, name: input.name.trim() || "API key", token, createdAt: now };
}

export async function resolvePrincipalFromApiKey(
  db: D1Like,
  rawKey: string,
): Promise<OrganizerPrincipal | null> {
  const token = rawKey.trim();
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  await ensureApiKeysTable(db);
  const keyHash = await hashApiKey(token);
  const row = await db
    .prepare(
      `SELECT id, name, key_prefix, key_hash, user_id, display_name, role,
              event_ids_json, roles_by_event_json, track_ids_by_event_json,
              created_at, revoked_at, last_used_at
       FROM api_keys
       WHERE key_hash = ? AND revoked_at IS NULL
       LIMIT 1`,
    )
    .bind(keyHash)
    .first<ApiKeyRow>();

  if (!row) return null;

  await db
    .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), row.id)
    .run();

  const eventIds = parseStringArray(row.event_ids_json);
  const rolesByEvent = parseStringRecord(row.roles_by_event_json) as
    | Record<string, "admin" | "reviewer">
    | undefined;
  const trackIdsByEvent = parseTrackMap(row.track_ids_by_event_json);

  return {
    id: row.user_id,
    displayName: row.display_name,
    role: row.role,
    eventIds,
    rolesByEvent,
    trackIdsByEvent,
  };
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawKey),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomTokenPart(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseStringArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseStringRecord(raw: string): Record<string, string> | undefined {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "string") out[key] = entry;
    }
    return out;
  } catch {
    return undefined;
  }
}

function parseTrackMap(raw: string): Record<string, string[]> | undefined {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const out: Record<string, string[]> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(entry)) {
        out[key] = entry.filter((item): item is string => typeof item === "string");
      }
    }
    return out;
  } catch {
    return undefined;
  }
}
