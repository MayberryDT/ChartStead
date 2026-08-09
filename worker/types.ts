export interface SecretBindings {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export type AppBindings = CloudflareBindings & SecretBindings;
