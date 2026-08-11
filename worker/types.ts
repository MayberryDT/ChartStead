export interface SecretBindings {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  /** Optional Airtable personal access token (never required for core app). */
  AIRTABLE_ACCESS_TOKEN?: string;
  /** Optional Airtable base id for the ChartStead template base. */
  AIRTABLE_BASE_ID?: string;
}

export interface AssetBindings {
  ASSETS?: R2Bucket;
}

export type AppBindings = CloudflareBindings & SecretBindings & AssetBindings;
