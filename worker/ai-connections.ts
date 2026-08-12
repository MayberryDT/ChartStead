import {
  AI_ACCESS_PROFILES,
  AI_CONNECTION_PROVIDERS,
  type AiAccessProfile,
  type AiApprovalPolicy,
  type AiConnectionProvider,
  type AiConnectionStatus,
  type AiConnectionSummary,
} from "../shared/ai-connections";
import type { CourseCheckScopeGrant } from "../shared/agent-api";
import type { OrganizerPrincipal } from "../shared/events";
import { createApiKey, ensureApiKeysTable, hashApiKey, updateApiKeyGrant } from "./api-keys";

type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
    run(): Promise<{ meta?: { changes?: number } }>;
  };
};

interface ConnectionRow {
  id: string;
  event_id: string;
  provider: AiConnectionProvider;
  display_name: string;
  owner_user_id: string;
  owner_display_name: string | null;
  access_profile: AiAccessProfile;
  approval_policy: AiApprovalPolicy;
  status: AiConnectionStatus;
  authorization_code_hash: string | null;
  code_challenge: string | null;
  oauth_client_id: string | null;
  redirect_uri: string | null;
  resource_uri: string | null;
  code_issued_at: string | null;
  refresh_token_hash: string | null;
  last_mcp_at: string | null;
  api_key_id: string | null;
  created_at: string;
  last_test_at: string | null;
  revoked_at: string | null;
}

export async function ensureAiConnectionsTable(db: D1Like): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_connections (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    owner_display_name TEXT,
    access_profile TEXT NOT NULL,
    approval_policy TEXT NOT NULL,
    status TEXT NOT NULL,
    authorization_code_hash TEXT UNIQUE,
    code_challenge TEXT,
    oauth_client_id TEXT,
    redirect_uri TEXT,
    resource_uri TEXT,
    code_issued_at TEXT,
    refresh_token_hash TEXT UNIQUE,
    last_mcp_at TEXT,
    api_key_id TEXT,
    created_at TEXT NOT NULL,
    last_test_at TEXT,
    revoked_at TEXT
  )`).run();
  try { await db.prepare(`ALTER TABLE ai_connections ADD COLUMN owner_display_name TEXT`).run(); } catch { /* already exists */ }
  for (const ddl of [
    `ALTER TABLE ai_connections ADD COLUMN code_challenge TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN oauth_client_id TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN redirect_uri TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN resource_uri TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN code_issued_at TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN refresh_token_hash TEXT`,
    `ALTER TABLE ai_connections ADD COLUMN last_mcp_at TEXT`,
  ]) { try { await db.prepare(ddl).run(); } catch { /* already exists */ } }
  await db.prepare(`CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY NOT NULL,
    client_name TEXT NOT NULL,
    redirect_uris_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
}

export async function registerOAuthClient(input: {
  db: D1Like;
  clientName: string;
  redirectUris: string[];
}): Promise<{ clientId: string; clientName: string; redirectUris: string[] }> {
  await ensureAiConnectionsTable(input.db);
  const recent = await input.db.prepare(
    `SELECT COUNT(*) AS count FROM oauth_clients WHERE created_at > ?`,
  ).bind(new Date(Date.now() - 60 * 60 * 1000).toISOString()).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 1000) throw new Error("OAuth client registration is temporarily at capacity.");
  const clientId = `cs_client_${randomPart()}`;
  await input.db.prepare(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris_json, created_at) VALUES (?, ?, ?, ?)`,
  ).bind(clientId, input.clientName, JSON.stringify(input.redirectUris), new Date().toISOString()).run();
  return { clientId, clientName: input.clientName, redirectUris: input.redirectUris };
}

export async function isRegisteredOAuthRedirect(db: D1Like, clientId: string, redirectUri: string): Promise<boolean> {
  await ensureAiConnectionsTable(db);
  const row = await db.prepare(
    `SELECT redirect_uris_json FROM oauth_clients WHERE client_id = ? LIMIT 1`,
  ).bind(clientId).first<{ redirect_uris_json: string }>();
  if (!row) return false;
  try {
    const values = JSON.parse(row.redirect_uris_json) as unknown;
    return Array.isArray(values) && values.includes(redirectUri);
  } catch {
    return false;
  }
}

export function parseAiConnectionInput(body: unknown): {
  provider: AiConnectionProvider;
  accessProfile: AiAccessProfile;
  approvalPolicy: AiApprovalPolicy;
} | null {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (!AI_CONNECTION_PROVIDERS.includes(input.provider as AiConnectionProvider)) return null;
  if (!AI_ACCESS_PROFILES.includes(input.accessProfile as AiAccessProfile)) return null;
  const approvalPolicy = input.approvalPolicy === "any_change" ? "any_change" : "important_actions";
  return {
    provider: input.provider as AiConnectionProvider,
    accessProfile: input.accessProfile as AiAccessProfile,
    approvalPolicy,
  };
}

export async function createAiConnection(input: {
  db: D1Like;
  eventId: string;
  owner: OrganizerPrincipal;
  provider: AiConnectionProvider;
  accessProfile: AiAccessProfile;
  approvalPolicy: AiApprovalPolicy;
  origin: string;
  now?: Date;
}): Promise<AiConnectionSummary> {
  await ensureAiConnectionsTable(input.db);
  const id = crypto.randomUUID();
  const createdAt = (input.now ?? new Date()).toISOString();
  const name = providerName(input.provider);
  await input.db.prepare(`INSERT INTO ai_connections (
    id, event_id, provider, display_name, owner_user_id, owner_display_name, access_profile,
    approval_policy, status, authorization_code_hash, code_challenge,
    oauth_client_id, redirect_uri, resource_uri, api_key_id,
    created_at, last_test_at, revoked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connection_not_tested', NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`)
    .bind(
      id, input.eventId, input.provider, name, input.owner.id, input.owner.displayName, input.accessProfile,
      input.approvalPolicy, createdAt,
    ).run();
  return {
    id,
    name,
    provider: input.provider,
    accessProfile: input.accessProfile,
    approvalPolicy: input.approvalPolicy,
    status: "connection_not_tested",
    createdAt,
    lastUsedAt: null,
    lastTestAt: null,
    authorizationUrl: `${input.origin}/api/v1/ai-connections/setup?connectionId=${encodeURIComponent(id)}`,
  };
}

export async function beginAiConnectionAuthorization(input: {
  db: D1Like;
  owner: OrganizerPrincipal;
  connectionId: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  origin: string;
}): Promise<{ code: string; connection: AiConnectionSummary }> {
  await ensureAiConnectionsTable(input.db);
  const pending = await input.db.prepare(
    `SELECT * FROM ai_connections WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL LIMIT 1`,
  ).bind(input.connectionId, input.owner.id).first<ConnectionRow>();
  if (!pending) throw new Error("Pending AI connection not found.");
  if (!await isCurrentEventAdmin(input.db, pending.owner_user_id, pending.event_id)) {
    throw new Error("The connection owner is no longer an event administrator.");
  }
  const code = `cs_auth_${randomPart()}${randomPart()}`;
  const codeHash = await hashApiKey(code);
  await input.db.prepare(
    `UPDATE ai_connections SET authorization_code_hash = ?, code_challenge = ?,
      oauth_client_id = ?, redirect_uri = ?, resource_uri = ?, code_issued_at = ? WHERE id = ?`,
  ).bind(codeHash, input.codeChallenge, input.clientId, input.redirectUri, input.resource, new Date().toISOString(), pending.id).run();
  return { code, connection: toSummary(pending) };
}

export async function exchangeAiConnectionCode(input: {
  db: D1Like;
  code: string;
  provider?: AiConnectionProvider;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  now?: Date;
}): Promise<{ accessToken: string; refreshToken: string; connectionId: string } | null> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(input.codeVerifier)) return null;
  await ensureAiConnectionsTable(input.db);
  const codeHash = await hashApiKey(input.code);
  const row = await input.db.prepare(
    `SELECT * FROM ai_connections
     WHERE authorization_code_hash = ? AND revoked_at IS NULL
        AND code_issued_at > ? LIMIT 1`,
  ).bind(codeHash, new Date((input.now ?? new Date()).getTime() - 10 * 60 * 1000).toISOString()).first<ConnectionRow>();
  if (!row) return null;
  if (!await isCurrentEventAdmin(input.db, row.owner_user_id, row.event_id)) return null;
  if (
    row.oauth_client_id !== input.clientId ||
    row.redirect_uri !== input.redirectUri ||
    row.resource_uri !== input.resource ||
    !row.code_challenge ||
    await pkceChallenge(input.codeVerifier) !== row.code_challenge
  ) return null;
  const claimed = await input.db.prepare(
    `UPDATE ai_connections SET authorization_code_hash = NULL, code_issued_at = NULL
     WHERE id = ? AND authorization_code_hash = ? AND revoked_at IS NULL`,
  ).bind(row.id, codeHash).run();
  if ((claimed.meta?.changes ?? 0) !== 1) return null;
  if (row.api_key_id) {
    await updateApiKeyGrant({ db: input.db, keyId: row.api_key_id, eventId: row.event_id, revoke: true });
  }
  const scopes = scopesForProfile(row.access_profile);
  const owner: OrganizerPrincipal = {
    id: row.owner_user_id,
    displayName: row.owner_display_name ?? "Connected organizer",
    role: "admin",
    eventIds: [row.event_id],
    rolesByEvent: { [row.event_id]: "admin" },
  };
  const created = await createApiKey({
    db: input.db,
    name: row.display_name,
    principal: owner,
    principalKind: "agent",
    agentMode: row.access_profile === "operate_with_approval" ? "delegated_execution" : "propose_only",
    courseCheckScopes: scopes,
    eventId: row.event_id,
    expiresAt: new Date((input.now ?? new Date()).getTime() + 60 * 60 * 1000).toISOString(),
    initiatingHuman: { id: row.owner_user_id, displayName: owner.displayName },
    aiAccessProfile: row.access_profile,
    aiResourceUri: row.resource_uri,
    aiApprovalPolicy: row.approval_policy,
  });
  const refreshToken = `cs_refresh_${randomPart()}${randomPart()}`;
  const refreshHash = await hashApiKey(refreshToken);
  const attached = await input.db.prepare(
    `UPDATE ai_connections SET api_key_id = ?, refresh_token_hash = ?, status = 'connection_not_tested', last_mcp_at = NULL
     WHERE id = ? AND revoked_at IS NULL`,
  ).bind(created.id, refreshHash, row.id).run();
  if ((attached.meta?.changes ?? 0) !== 1) {
    await updateApiKeyGrant({ db: input.db, keyId: created.id, eventId: row.event_id, revoke: true });
    return null;
  }
  return { accessToken: created.token, refreshToken, connectionId: row.id };
}

export async function refreshAiConnectionToken(input: {
  db: D1Like;
  refreshToken: string;
  resource: string;
  now?: Date;
}): Promise<{ accessToken: string; refreshToken: string } | null> {
  await ensureAiConnectionsTable(input.db);
  const refreshHash = await hashApiKey(input.refreshToken);
  const row = await input.db.prepare(
    `SELECT * FROM ai_connections WHERE refresh_token_hash = ? AND resource_uri = ? AND revoked_at IS NULL LIMIT 1`,
  ).bind(refreshHash, input.resource).first<ConnectionRow>();
  if (!row) return null;
  if (!await isCurrentEventAdmin(input.db, row.owner_user_id, row.event_id)) return null;
  const nextRefresh = `cs_refresh_${randomPart()}${randomPart()}`;
  const nextHash = await hashApiKey(nextRefresh);
  const claimed = await input.db.prepare(
    `UPDATE ai_connections SET refresh_token_hash = ?
     WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL`,
  ).bind(nextHash, row.id, refreshHash).run();
  if ((claimed.meta?.changes ?? 0) !== 1) return null;
  if (row.api_key_id) await updateApiKeyGrant({ db: input.db, keyId: row.api_key_id, eventId: row.event_id, revoke: true });
  const principal: OrganizerPrincipal = {
    id: row.owner_user_id,
    displayName: row.owner_display_name ?? "Connected organizer",
    role: "admin",
    eventIds: [row.event_id],
    rolesByEvent: { [row.event_id]: "admin" },
  };
  try {
    const created = await createApiKey({
      db: input.db, name: row.display_name, principal, principalKind: "agent",
      agentMode: row.access_profile === "operate_with_approval" ? "delegated_execution" : "propose_only",
      courseCheckScopes: scopesForProfile(row.access_profile), eventId: row.event_id,
      expiresAt: new Date((input.now ?? new Date()).getTime() + 60 * 60 * 1000).toISOString(),
      initiatingHuman: { id: row.owner_user_id, displayName: principal.displayName },
      aiAccessProfile: row.access_profile, aiResourceUri: row.resource_uri,
      aiApprovalPolicy: row.approval_policy,
    });
    const attached = await input.db.prepare(
      `UPDATE ai_connections SET api_key_id = ?
       WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL`,
    ).bind(created.id, row.id, nextHash).run();
    if ((attached.meta?.changes ?? 0) !== 1) {
      await updateApiKeyGrant({ db: input.db, keyId: created.id, eventId: row.event_id, revoke: true });
      return null;
    }
    return { accessToken: created.token, refreshToken: nextRefresh };
  } catch (error) {
    await input.db.prepare(`UPDATE ai_connections SET refresh_token_hash = ? WHERE id = ? AND refresh_token_hash = ?`)
      .bind(refreshHash, row.id, nextHash).run();
    throw error;
  }
}

export async function recordAiConnectionMcpActivity(db: D1Like, keyId: string, now = new Date()): Promise<void> {
  await ensureAiConnectionsTable(db);
  await db.prepare(`UPDATE ai_connections SET last_mcp_at = ? WHERE api_key_id = ? AND revoked_at IS NULL`)
    .bind(now.toISOString(), keyId).run();
}

export async function recordAiConnectionMcpActivityByResource(db: D1Like, resource: string, now = new Date()): Promise<void> {
  await ensureAiConnectionsTable(db);
  await db.prepare(`UPDATE ai_connections SET last_mcp_at = ? WHERE resource_uri = ? AND revoked_at IS NULL`)
    .bind(now.toISOString(), resource).run();
}

export async function listAiConnections(db: D1Like, eventId: string): Promise<AiConnectionSummary[]> {
  await ensureAiConnectionsTable(db);
  await ensureApiKeysTable(db);
  const rows = await db.prepare(
    `SELECT c.*, k.last_used_at, k.expires_at FROM ai_connections c
     LEFT JOIN api_keys k ON k.id = c.api_key_id
     WHERE c.event_id = ? AND c.revoked_at IS NULL ORDER BY c.created_at DESC`,
  ).bind(eventId).all<ConnectionRow & { last_used_at: string | null; expires_at: string | null }>();
  return rows.results.map(toSummary);
}

export async function testAiConnection(input: {
  db: D1Like;
  eventId: string;
  connectionId: string;
  now?: Date;
}): Promise<AiConnectionSummary | null> {
  await ensureAiConnectionsTable(input.db);
  const current = await input.db.prepare(
    `SELECT c.*, k.last_used_at, k.expires_at FROM ai_connections c
     LEFT JOIN api_keys k ON k.id = c.api_key_id
     WHERE c.id = ? AND c.event_id = ? AND c.revoked_at IS NULL LIMIT 1`,
  ).bind(input.connectionId, input.eventId).first<ConnectionRow & { last_used_at: string | null; expires_at: string | null }>();
  if (!current?.api_key_id || !current.last_mcp_at || !current.expires_at || current.expires_at <= new Date().toISOString()) return null;
  const testedAt = (input.now ?? new Date()).toISOString();
  await input.db.prepare(
    `UPDATE ai_connections SET status = 'connected', last_test_at = ?
     WHERE id = ? AND event_id = ? AND revoked_at IS NULL`,
  ).bind(testedAt, input.connectionId, input.eventId).run();
  const row = await input.db.prepare(
    `SELECT c.*, k.last_used_at, k.expires_at FROM ai_connections c
     LEFT JOIN api_keys k ON k.id = c.api_key_id
     WHERE c.id = ? AND c.event_id = ? AND c.revoked_at IS NULL LIMIT 1`,
  ).bind(input.connectionId, input.eventId).first<ConnectionRow & { last_used_at: string | null; expires_at: string | null }>();
  return row ? toSummary(row) : null;
}

export async function revokeAiConnection(input: {
  db: D1Like;
  eventId: string;
  connectionId: string;
  now?: Date;
}): Promise<boolean> {
  await ensureAiConnectionsTable(input.db);
  const row = await input.db.prepare(
    `SELECT * FROM ai_connections WHERE id = ? AND event_id = ? AND revoked_at IS NULL LIMIT 1`,
  ).bind(input.connectionId, input.eventId).first<ConnectionRow>();
  if (!row) return false;
  if (row.api_key_id) {
    await updateApiKeyGrant({ db: input.db, keyId: row.api_key_id, eventId: input.eventId, revoke: true });
  }
  const now = (input.now ?? new Date()).toISOString();
  await input.db.prepare(
    `UPDATE ai_connections SET status = 'revoked', revoked_at = ?, authorization_code_hash = NULL WHERE id = ?`,
  ).bind(now, row.id).run();
  return true;
}

function scopesForProfile(profile: AiAccessProfile): CourseCheckScopeGrant[] {
  if (profile === "explore") return [];
  if (profile === "research_prepare") return ["decisions", "drafts", "publication"];
  return ["all"];
}

function providerName(provider: AiConnectionProvider): string {
  return provider === "chatgpt" ? "ChatGPT" : provider === "claude" ? "Claude" : provider === "copilot" ? "Microsoft Copilot" : "Compatible assistant";
}

function toSummary(row: ConnectionRow & { last_used_at?: string | null; expires_at?: string | null }): AiConnectionSummary {
  const expired = row.expires_at ? row.expires_at <= new Date().toISOString() : false;
  return {
    id: row.id,
    name: row.display_name,
    provider: row.provider,
    accessProfile: row.access_profile,
    approvalPolicy: row.approval_policy,
    status: expired && row.status === "connected" ? "needs_sign_in" : row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    lastTestAt: row.last_test_at,
  };
}

function randomPart(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function isCurrentEventAdmin(db: D1Like, userId: string, eventId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT role FROM event_memberships WHERE user_id = ? AND event_id = ? LIMIT 1`,
  ).bind(userId, eventId).first<{ role: string }>();
  return row?.role === "admin";
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
