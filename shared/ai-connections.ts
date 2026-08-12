export const AI_CONNECTION_PROVIDERS = ["claude", "chatgpt", "copilot", "other"] as const;
export type AiConnectionProvider = (typeof AI_CONNECTION_PROVIDERS)[number];

export const AI_ACCESS_PROFILES = [
  "explore",
  "research_prepare",
  "operate_with_approval",
] as const;
export type AiAccessProfile = (typeof AI_ACCESS_PROFILES)[number];

export type AiApprovalPolicy = "any_change" | "important_actions";
export type AiConnectionStatus =
  | "connection_not_tested"
  | "connected"
  | "needs_sign_in"
  | "paused"
  | "revoked";

export interface AiConnectionSummary {
  id: string;
  name: string;
  provider: AiConnectionProvider;
  accessProfile: AiAccessProfile;
  approvalPolicy: AiApprovalPolicy;
  status: AiConnectionStatus;
  createdAt: string;
  lastUsedAt: string | null;
  lastTestAt: string | null;
  authorizationUrl?: string;
}
