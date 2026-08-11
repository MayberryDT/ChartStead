import type { EmailSender, OutboundEmail } from "./email";
import type { EventStore } from "./event-store";

const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export type OutboxDeliveryResult = "sent" | "failed" | "skipped";

function sanitizeDeliveryError(error: unknown): string {
  const raw =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : "Email delivery failed.";
  return raw.slice(0, 200);
}

export async function deliverOutboxMessage(input: {
  store: DurableObjectStub<EventStore>;
  sender: EmailSender;
  messageId: string;
  now: Date;
}): Promise<OutboxDeliveryResult> {
  const claimed = await input.store.claimOutboxForDelivery(
    input.messageId,
    input.now.toISOString(),
  );
  if (!claimed) return "skipped";

  const bodies = await input.store.getOutboxBodies(input.messageId);
  if (!bodies) {
    await input.store.markOutboxFailed(
      input.messageId,
      "Outbox message body missing.",
      input.now.toISOString(),
      null,
    );
    return "failed";
  }

  const message: OutboundEmail = {
    to: claimed.toEmail,
    subject: claimed.subject,
    html: bodies.html,
    text: bodies.text,
  };

  try {
    await input.sender.send(message);
    await input.store.markOutboxSent(input.messageId, input.now.toISOString());
    return "sent";
  } catch (error) {
    const attemptCount = claimed.attemptCount;
    const nextAttemptAt =
      attemptCount >= MAX_ATTEMPTS
        ? null
        : new Date(
            input.now.getTime() + RETRY_DELAYS_MS[attemptCount - 1]!,
          ).toISOString();
    await input.store.markOutboxFailed(
      input.messageId,
      sanitizeDeliveryError(error),
      input.now.toISOString(),
      nextAttemptAt,
    );
    return "failed";
  }
}

export async function flushEventOutbox(input: {
  store: DurableObjectStub<EventStore>;
  sender: EmailSender;
  now: Date;
  limit: number;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const dueIds = await input.store.listDueOutboxMessageIds(
    input.now.toISOString(),
    input.limit,
  );
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const messageId of dueIds) {
    const result = await deliverOutboxMessage({
      store: input.store,
      sender: input.sender,
      messageId,
      now: input.now,
    });
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
    else skipped += 1;
  }

  return { sent, failed, skipped };
}
