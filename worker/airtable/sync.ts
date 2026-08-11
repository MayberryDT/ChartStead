import {
  AIRTABLE_HEALTH_GUIDANCE,
  type AirtablePullResult,
  type AirtableResourceKind,
  type AirtableSyncState,
} from "../../shared/airtable";
import { mapAirtableRecordsToChanges } from "../../shared/airtable-field-map";
import type { EventStore } from "../event-store";
import {
  AirtableClientError,
  createAirtableClient,
  isAirtableConfigured,
  type AirtableClient,
} from "./client";
import {
  createDemoSandboxAirtableClient,
  isDemoAirtableSandbox,
} from "./demo-sandbox";

const PULL_KINDS: AirtableResourceKind[] = [
  "event",
  "submission",
  "speaker",
  "session",
  "task",
];

export type AirtableClientFactory = (env: {
  AIRTABLE_ACCESS_TOKEN?: string;
  AIRTABLE_BASE_ID?: string;
}) => AirtableClient | null;

/** Builds a client from explicit credentials (Settings-stored or env). */
export type AirtableCredentialClientFactory = (creds: {
  accessToken: string;
  baseId: string;
}) => AirtableClient;

export const defaultAirtableClientFactory: AirtableClientFactory = (env) => {
  if (!isAirtableConfigured(env)) return null;
  return createAirtableClient({
    accessToken: env.AIRTABLE_ACCESS_TOKEN!,
    baseId: env.AIRTABLE_BASE_ID!,
  });
};

export const defaultCredentialClientFactory: AirtableCredentialClientFactory = (
  creds,
) => createAirtableClient(creds);

export function unconfiguredSyncState(now = new Date()): AirtableSyncState {
  return {
    health: "unconfigured",
    configured: false,
    hasAccessToken: false,
    lastPullAt: null,
    lastSuccessAt: null,
    lastError: null,
    guidance: AIRTABLE_HEALTH_GUIDANCE.unconfigured,
    pendingChangeCount: 0,
    baseId: null,
  };
}

/** Prefer event Settings credentials; fall back to worker env secrets. */
export async function resolveAirtableConnection(input: {
  store: DurableObjectStub<EventStore>;
  env: { AIRTABLE_ACCESS_TOKEN?: string; AIRTABLE_BASE_ID?: string };
  clientFactory?: AirtableClientFactory;
  credentialClientFactory?: AirtableCredentialClientFactory;
}): Promise<{ client: AirtableClient; baseId: string } | null> {
  const makeClient =
    input.credentialClientFactory ?? defaultCredentialClientFactory;
  const stored = await input.store.getAirtableCredentials();
  if (stored) {
    if (
      !input.credentialClientFactory &&
      isDemoAirtableSandbox(stored)
    ) {
      return {
        client: await createDemoSandboxAirtableClient(input.store),
        baseId: stored.baseId,
      };
    }
    return {
      client: makeClient(stored),
      baseId: stored.baseId,
    };
  }

  const factory = input.clientFactory ?? defaultAirtableClientFactory;
  const envClient = factory(input.env);
  const baseId = input.env.AIRTABLE_BASE_ID?.trim() || null;
  if (!envClient || !baseId) return null;
  // Re-build through credential factory so tests can intercept both paths.
  const token = input.env.AIRTABLE_ACCESS_TOKEN?.trim() || "";
  if (!token) return { client: envClient, baseId };
  return { client: makeClient({ accessToken: token, baseId }), baseId };
}

export async function pullAirtableForEvent(input: {
  store: DurableObjectStub<EventStore>;
  client: AirtableClient | null;
  baseId: string | null;
  now?: Date;
}): Promise<AirtablePullResult> {
  const now = input.now ?? new Date();
  const pulledAt = now.toISOString();
  const previous = await input.store.getAirtableSyncState();

  if (!input.client || !input.baseId) {
    const state = {
      ...unconfiguredSyncState(now),
      lastPullAt: previous.lastPullAt,
      lastSuccessAt: previous.lastSuccessAt,
      hasAccessToken: previous.hasAccessToken,
      baseId: previous.baseId,
    };
    await input.store.setAirtableSyncState(state);
    return {
      ok: true,
      health: "unconfigured",
      pulledAt,
      changes: [],
      error: null,
      guidance: state.guidance,
    };
  }

  await input.store.setAirtableSyncState({
    health: "pending",
    configured: true,
    hasAccessToken: true,
    lastPullAt: pulledAt,
    lastSuccessAt: previous.lastSuccessAt,
    lastError: null,
    guidance: AIRTABLE_HEALTH_GUIDANCE.pending,
    pendingChangeCount: 0,
    baseId: input.baseId,
  });

  try {
    const allChanges = [];
    for (const kind of PULL_KINDS) {
      const records = await input.client.listTable(kind);
      allChanges.push(...mapAirtableRecordsToChanges(kind, records));
    }

    const applied = await input.store.applyAirtablePullChanges({
      changes: allChanges,
      pulledAt,
      baseId: input.baseId,
    });

    const state: AirtableSyncState = {
      health: "healthy",
      configured: true,
      hasAccessToken: true,
      lastPullAt: pulledAt,
      lastSuccessAt: pulledAt,
      lastError: null,
      guidance: AIRTABLE_HEALTH_GUIDANCE.healthy,
      pendingChangeCount: 0,
      baseId: input.baseId,
    };
    await input.store.setAirtableSyncState(state);

    return {
      ok: true,
      health: "healthy",
      pulledAt,
      changes: applied,
      error: null,
      guidance: state.guidance,
    };
  } catch (error) {
    const classified = classifyAirtableError(error);
    const state: AirtableSyncState = {
      health: classified.health,
      configured: true,
      hasAccessToken: true,
      lastPullAt: pulledAt,
      lastSuccessAt: previous.lastSuccessAt,
      lastError: classified.message,
      guidance: AIRTABLE_HEALTH_GUIDANCE[classified.health],
      pendingChangeCount: previous.pendingChangeCount,
      baseId: input.baseId,
    };
    await input.store.setAirtableSyncState(state);
    return {
      ok: false,
      health: classified.health,
      pulledAt,
      changes: [],
      error: classified.message,
      guidance: state.guidance,
    };
  }
}

function classifyAirtableError(error: unknown): {
  health: "delayed" | "failed";
  message: string;
} {
  if (error instanceof AirtableClientError) {
    if (error.code === "rate_limited" || error.code === "unavailable") {
      return { health: "delayed", message: error.message };
    }
    return { health: "failed", message: error.message };
  }
  if (error instanceof Error) {
    return { health: "failed", message: error.message };
  }
  return { health: "failed", message: "Airtable pull failed." };
}
