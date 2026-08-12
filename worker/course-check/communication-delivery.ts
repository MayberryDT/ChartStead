import type { CommunicationEffect } from "../../shared/course-check";
import type {
  CommunicationEmailSender,
  CommunicationOutboundEmail,
  CommunicationSendResult,
} from "../email";

const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export const COMMUNICATION_MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface CommunicationEffectStore {
  listDueCommunicationEffectIds(nowIso: string, limit: number): Promise<string[]>;
  claimCommunicationEffect(
    effectId: string,
    nowIso: string,
  ): Promise<CommunicationEffect | null>;
  getCommunicationEffectPayload(
    effectId: string,
  ): Promise<CommunicationOutboundEmail | null>;
  recordCommunicationEffectResult(input: {
    effectId: string;
    result: CommunicationSendResult;
    nowIso: string;
    maxAttempts: number;
    nextAttemptAt: string | null;
  }): Promise<void>;
  scheduleNextCommunicationAlarm(): Promise<void>;
}

export async function flushCommunicationEffects(input: {
  store: CommunicationEffectStore;
  sender: CommunicationEmailSender;
  now: Date;
  limit: number;
}): Promise<{
  sent: number;
  retryScheduled: number;
  failed: number;
  unknown: number;
  skipped: number;
}> {
  const dueIds = await input.store.listDueCommunicationEffectIds(
    input.now.toISOString(),
    input.limit,
  );
  const counts = {
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    unknown: 0,
    skipped: 0,
  };

  for (const effectId of dueIds) {
    const claimed = await input.store.claimCommunicationEffect(
      effectId,
      input.now.toISOString(),
    );
    if (!claimed) {
      counts.skipped += 1;
      continue;
    }
    const payload = await input.store.getCommunicationEffectPayload(effectId);
    const result: CommunicationSendResult = payload
      ? await input.sender.send(payload)
      : {
          outcome: "permanent_failure",
          error: "Frozen communication payload is missing.",
        };
    const retryIndex = Math.max(0, claimed.attemptCount - 1);
    const nextAttemptAt =
      result.outcome === "transient_failure" &&
      claimed.attemptCount < COMMUNICATION_MAX_ATTEMPTS
        ? new Date(
            input.now.getTime() +
              RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)]!,
          ).toISOString()
        : null;
    await input.store.recordCommunicationEffectResult({
      effectId,
      result,
      nowIso: input.now.toISOString(),
      maxAttempts: COMMUNICATION_MAX_ATTEMPTS,
      nextAttemptAt,
    });

    if (result.outcome === "sent") counts.sent += 1;
    else if (result.outcome === "unknown") counts.unknown += 1;
    else if (result.outcome === "transient_failure" && nextAttemptAt) {
      counts.retryScheduled += 1;
    } else {
      counts.failed += 1;
    }
  }

  await input.store.scheduleNextCommunicationAlarm();
  return counts;
}
