import {
  DEFAULT_AGENT_MODE,
  expandCourseCheckScopes,
  isAgentOperatingMode,
  isCourseCheckScopeGrant,
  type AgentOperatingMode,
  type CourseCheckScope,
  type CourseCheckScopeGrant,
} from "../shared/agent-api";
import type { OrganizerPrincipal } from "../shared/events";

/** Minimal D1 surface used by API key storage (avoids workers-types import). */
type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
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
  principal_kind: string | null;
  agent_id: string | null;
  agent_mode: string | null;
  course_check_scopes_by_event_json: string | null;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  initiating_human_json: string | null;
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
        principal_kind TEXT,
        agent_id TEXT,
        agent_mode TEXT,
        course_check_scopes_by_event_json TEXT,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT
        , expires_at TEXT
        , initiating_human_json TEXT
      )`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash)`,
    )
    .run();
  // Additive columns for pre-existing tables (IF NOT EXISTS not available — ignore errors).
  for (const ddl of [
    `ALTER TABLE api_keys ADD COLUMN principal_kind TEXT`,
    `ALTER TABLE api_keys ADD COLUMN agent_id TEXT`,
    `ALTER TABLE api_keys ADD COLUMN agent_mode TEXT`,
    `ALTER TABLE api_keys ADD COLUMN course_check_scopes_by_event_json TEXT`,
    `ALTER TABLE api_keys ADD COLUMN expires_at TEXT`,
    `ALTER TABLE api_keys ADD COLUMN initiating_human_json TEXT`,
  ]) {
    try {
      await db.prepare(ddl).run();
    } catch {
      // column already exists
    }
  }
}

export async function createApiKey(input: {
  db: D1Like;
  name: string;
  principal: OrganizerPrincipal;
  rawKey?: string;
  now?: Date;
  principalKind?: "human" | "agent";
  agentMode?: AgentOperatingMode;
  /** Grants may include `all`; stored expanded per event. */
  courseCheckScopes?: CourseCheckScopeGrant[];
  eventId?: string;
  expiresAt?: string | null;
  initiatingHuman?: OrganizerPrincipal["initiatingHuman"];
}): Promise<{
  id: string;
  name: string;
  token: string;
  createdAt: string;
  principalKind: "human" | "agent";
  agentMode: AgentOperatingMode | null;
  courseCheckScopes: CourseCheckScope[];
  courseCheckScopesByEvent: Record<string, CourseCheckScope[]>;
}> {
  await ensureApiKeysTable(input.db);
  const now = (input.now ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const token = input.rawKey ?? `${API_KEY_PREFIX}${randomTokenPart()}${randomTokenPart()}`;
  const keyHash = await hashApiKey(token);
  const keyPrefix = token.slice(0, 12);

  const principalKind = input.principalKind ?? input.principal.principalKind ?? "human";
  const agentMode: AgentOperatingMode | null =
    principalKind === "agent"
      ? (input.agentMode ?? input.principal.agentMode ?? DEFAULT_AGENT_MODE)
      : null;

  const eventId =
    input.eventId ??
    input.principal.eventIds[0] ??
    Object.keys(input.principal.rolesByEvent ?? {})[0];

  let scopesByEvent: Record<string, CourseCheckScope[]> = {
    ...(input.principal.courseCheckScopesByEvent ?? {}),
  };
  if (principalKind === "agent") {
    const expanded = expandCourseCheckScopes(input.courseCheckScopes ?? []);
    if (eventId) {
      scopesByEvent = { ...scopesByEvent, [eventId]: expanded };
    }
  }

  const agentId = principalKind === "agent" ? id : null;
  const userId =
    principalKind === "agent" ? `agent:${id}` : input.principal.id;
  const displayName =
    principalKind === "agent"
      ? input.name.trim() || input.principal.displayName || "Agent"
      : input.principal.displayName;

  await input.db
    .prepare(
      `INSERT INTO api_keys (
        id, name, key_prefix, key_hash, user_id, display_name, role,
        event_ids_json, roles_by_event_json, track_ids_by_event_json,
        principal_kind, agent_id, agent_mode, course_check_scopes_by_event_json,
        created_at, revoked_at, last_used_at, expires_at,
        initiating_human_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.name.trim() || "API key",
      keyPrefix,
      keyHash,
      userId,
      displayName,
      input.principal.role,
      JSON.stringify(input.principal.eventIds),
      JSON.stringify(input.principal.rolesByEvent ?? {}),
      JSON.stringify(input.principal.trackIdsByEvent ?? {}),
      principalKind,
      agentId,
      agentMode,
      JSON.stringify(scopesByEvent),
      now,
      input.expiresAt ?? null,
      input.initiatingHuman ? JSON.stringify(input.initiatingHuman) : null,
    )
    .run();

  const courseCheckScopes = eventId ? (scopesByEvent[eventId] ?? []) : [];

  return {
    id,
    name: input.name.trim() || "API key",
    token,
    createdAt: now,
    principalKind,
    agentMode,
    courseCheckScopes,
    courseCheckScopesByEvent: scopesByEvent,
  };
}

export interface ListedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  principalKind: "human" | "agent";
  agentMode: AgentOperatingMode | null;
  courseCheckScopes: CourseCheckScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listApiKeysForEvent(input: {
  db: D1Like;
  eventId: string;
  includeRevoked?: boolean;
}): Promise<ListedApiKey[]> {
  await ensureApiKeysTable(input.db);
  const result = await input.db
    .prepare(
      `SELECT id, name, key_prefix, principal_kind, agent_id, agent_mode,
              course_check_scopes_by_event_json, event_ids_json,
              created_at, last_used_at, revoked_at
       FROM api_keys
       ORDER BY created_at DESC`,
    )
    .bind()
    .all<{
      id: string;
      name: string;
      key_prefix: string;
      principal_kind: string | null;
      agent_id: string | null;
      agent_mode: string | null;
      course_check_scopes_by_event_json: string | null;
      event_ids_json: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
    }>();

  const listed: ListedApiKey[] = [];
  for (const row of result.results ?? []) {
    if (!input.includeRevoked && row.revoked_at) continue;
    const eventIds = parseStringArray(row.event_ids_json);
    if (!eventIds.includes(input.eventId)) continue;
    const scopesByEvent = parseScopesByEvent(row.course_check_scopes_by_event_json);
    const principalKind =
      row.principal_kind === "agent" ? ("agent" as const) : ("human" as const);
    listed.push({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      principalKind,
      agentMode:
        principalKind === "agent"
          ? isAgentOperatingMode(row.agent_mode)
            ? row.agent_mode
            : DEFAULT_AGENT_MODE
          : null,
      courseCheckScopes: scopesByEvent[input.eventId] ?? [],
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    });
  }
  return listed;
}

export async function updateApiKeyGrant(input: {
  db: D1Like;
  keyId: string;
  eventId: string;
  agentMode?: AgentOperatingMode;
  courseCheckScopes?: CourseCheckScopeGrant[];
  revoke?: boolean;
  now?: Date;
}): Promise<{
  id: string;
  revoked: boolean;
  agentMode: AgentOperatingMode | null;
  courseCheckScopes: CourseCheckScope[];
} | null> {
  await ensureApiKeysTable(input.db);
  const row = await input.db
    .prepare(
      `SELECT id, agent_mode, course_check_scopes_by_event_json, revoked_at
       FROM api_keys WHERE id = ? LIMIT 1`,
    )
    .bind(input.keyId)
    .first<{
      id: string;
      agent_mode: string | null;
      course_check_scopes_by_event_json: string | null;
      revoked_at: string | null;
    }>();
  if (!row) return null;

  const now = (input.now ?? new Date()).toISOString();
  if (input.revoke) {
    await input.db
      .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`)
      .bind(now, input.keyId)
      .run();
    return {
      id: row.id,
      revoked: true,
      agentMode: isAgentOperatingMode(row.agent_mode) ? row.agent_mode : null,
      courseCheckScopes: [],
    };
  }

  const scopesByEvent = parseScopesByEvent(row.course_check_scopes_by_event_json);
  if (input.courseCheckScopes) {
    scopesByEvent[input.eventId] = expandCourseCheckScopes(input.courseCheckScopes);
  }
  const agentMode =
    input.agentMode ??
    (isAgentOperatingMode(row.agent_mode) ? row.agent_mode : DEFAULT_AGENT_MODE);

  await input.db
    .prepare(
      `UPDATE api_keys
       SET agent_mode = ?, course_check_scopes_by_event_json = ?, revoked_at = NULL
       WHERE id = ?`,
    )
    .bind(agentMode, JSON.stringify(scopesByEvent), input.keyId)
    .run();

  return {
    id: row.id,
    revoked: false,
    agentMode,
    courseCheckScopes: scopesByEvent[input.eventId] ?? [],
  };
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
              principal_kind, agent_id, agent_mode, course_check_scopes_by_event_json,
              created_at, revoked_at, last_used_at, expires_at, initiating_human_json
       FROM api_keys
       WHERE key_hash = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       LIMIT 1`,
    )
    .bind(keyHash, new Date().toISOString())
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
  const principalKind =
    row.principal_kind === "agent" ? ("agent" as const) : ("human" as const);
  const scopesByEvent = parseScopesByEvent(row.course_check_scopes_by_event_json);

  const principal: OrganizerPrincipal = {
    id: row.user_id,
    displayName: row.display_name,
    role: row.role,
    eventIds,
    rolesByEvent,
    trackIdsByEvent,
    principalKind,
  };

  if (principalKind === "agent") {
    principal.agentId = row.agent_id ?? row.id;
    principal.agentMode = isAgentOperatingMode(row.agent_mode)
      ? row.agent_mode
      : DEFAULT_AGENT_MODE;
    principal.courseCheckScopesByEvent = scopesByEvent;
    principal.initiatingHuman = parseInitiatingHuman(row.initiating_human_json);
  }

  return principal;
}

export async function findApiKeyId(db: D1Like, rawKey: string): Promise<string | null> {
  await ensureApiKeysTable(db);
  const row = await db.prepare(`SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1`)
    .bind(await hashApiKey(rawKey)).first<{ id: string }>();
  return row?.id ?? null;
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

export function parseApiKeyGrantBody(body: unknown): {
  name: string;
  principalKind: "human" | "agent";
  agentMode: AgentOperatingMode;
  courseCheckScopes: CourseCheckScopeGrant[];
} {
  const raw = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const name = typeof raw.name === "string" ? raw.name : "API key";
  const principalKind = raw.principalKind === "agent" ? "agent" : "human";
  const agentMode = isAgentOperatingMode(raw.agentMode)
    ? raw.agentMode
    : DEFAULT_AGENT_MODE;
  const courseCheckScopes: CourseCheckScopeGrant[] = [];
  if (Array.isArray(raw.courseCheckScopes)) {
    for (const entry of raw.courseCheckScopes) {
      if (isCourseCheckScopeGrant(entry)) courseCheckScopes.push(entry);
    }
  } else if (raw.courseCheckScopes === "all") {
    courseCheckScopes.push("all");
  }
  return { name, principalKind, agentMode, courseCheckScopes };
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

function parseInitiatingHuman(raw: string | null): OrganizerPrincipal["initiatingHuman"] {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; displayName?: unknown };
    return typeof value.id === "string" && typeof value.displayName === "string"
      ? { id: value.id, displayName: value.displayName }
      : null;
  } catch {
    return null;
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

function parseScopesByEvent(
  raw: string | null | undefined,
): Record<string, CourseCheckScope[]> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, CourseCheckScope[]> = {};
    for (const [eventId, entry] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(entry)) {
        out[eventId] = expandCourseCheckScopes(
          entry.filter(isCourseCheckScopeGrant),
        );
      }
    }
    return out;
  } catch {
    return {};
  }
}
