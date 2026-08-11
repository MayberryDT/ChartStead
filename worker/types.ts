export interface SecretBindings {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
}

export interface AssetBindings {
  ASSETS?: R2Bucket;
}

export type AppBindings = CloudflareBindings & SecretBindings & AssetBindings;
