import type { CfpDefinitionV1 } from "./cfp-definition";
import type { CfpPublicLifecycle } from "./events";

export function resolveCfpLifecycle(input: {
  definition: Pick<CfpDefinitionV1, "opensAt" | "closesAt">;
  lifecycleStatus: "draft" | "published" | "closed";
  lifecycleOverride?: "open" | "closed" | null;
  timezone: string;
  now: Date;
}): CfpPublicLifecycle {
  const evaluatedAt = input.now.toISOString();
  const opensAt = input.definition.opensAt;
  const closesAt = input.definition.closesAt;
  const nowMs = input.now.getTime();

  if (input.lifecycleStatus === "closed" || input.lifecycleOverride === "closed") {
    return {
      state: "closed",
      reason: "manual_close",
      opensAt,
      closesAt,
      deadlineAt: closesAt,
      timezone: input.timezone,
      evaluatedAt,
    };
  }
  if (input.lifecycleOverride === "open") {
    return {
      state: "open",
      reason: "manual_reopen",
      opensAt,
      closesAt,
      deadlineAt: null,
      timezone: input.timezone,
      evaluatedAt,
    };
  }
  if (opensAt && nowMs < Date.parse(opensAt)) {
    return {
      state: "scheduled",
      reason: "scheduled_open",
      opensAt,
      closesAt,
      deadlineAt: opensAt,
      timezone: input.timezone,
      evaluatedAt,
    };
  }
  if (closesAt && nowMs >= Date.parse(closesAt)) {
    return {
      state: "closed",
      reason: "scheduled_close",
      opensAt,
      closesAt,
      deadlineAt: closesAt,
      timezone: input.timezone,
      evaluatedAt,
    };
  }
  return {
    state: "open",
    reason: "open",
    opensAt,
    closesAt,
    deadlineAt: closesAt,
    timezone: input.timezone,
    evaluatedAt,
  };
}

export function cfpLifecycleError(lifecycle: CfpPublicLifecycle): string | null {
  if (lifecycle.state === "scheduled") {
    return `This call for proposals opens at ${lifecycle.opensAt}.`;
  }
  if (lifecycle.state === "closed") {
    return lifecycle.reason === "scheduled_close" && lifecycle.closesAt
      ? `This call for proposals closed at ${lifecycle.closesAt}.`
      : "This call for proposals is closed.";
  }
  return null;
}
