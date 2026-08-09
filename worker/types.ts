export interface SecretBindings {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
}

export type AppBindings = CloudflareBindings & SecretBindings;
