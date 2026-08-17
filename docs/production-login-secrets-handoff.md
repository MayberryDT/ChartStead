# Browser-use agent prompt — ChartStead production login secrets

Copy everything below the line into the local browser-use agent. Do not paste secret values back into chat, tickets, git, or screenshots.

---

You are a local browser-use agent on the ChartStead host. Resend is already done. Finish **Google OAuth only**. Do **not** deploy to Cloudflare. Do **not** run `wrangler secret put`. Do **not** commit `.dev.vars`. Do **not** print, screenshot, or repeat secret values in any chat, ticket, or commit. Do **not** create DNS, a tunnel, or `auth.chartstead.com`.

## Goal

Update these two files so they stay identical (never commit):

1. `/home/halla/ChartStead/.dev.vars`
2. `/home/halla/ChartStead/.worktrees/competition-58-production-login/.dev.vars`

Keep mode `600`. Preserve existing Resend, From, Better Auth secret, and Airtable values.

Write only these keys if they are still placeholders or the wrong local origin:

| Key | What to put |
| --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:5858` |
| `GOOGLE_CLIENT_ID` | Real Google OAuth web client id |
| `GOOGLE_CLIENT_SECRET` | Real Google OAuth web client secret |

Leave `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` alone.

Localhost on `BETTER_AUTH_URL` is required for local Google smoke. Do not treat it as a placeholder. Do not write a Tailscale IP into Google Console or into `BETTER_AUTH_URL`. Production Worker `BETTER_AUTH_URL` is `https://app.chartstead.com` (Competition 68) and is not this file.

## Google Cloud Console

1. Sign into the Google account that owns ChartStead / Animas cloud projects. Use existing project **chartstead**.
2. Open APIs and Services, then Credentials.
3. Create the web client if it does not exist:
   - Application type: Web application
   - Name: ChartStead production login
4. Authorized JavaScript origins — add only these. Google rejects Tailscale `100.64/10` IPs; do not add `100.105.117.93`.

http://localhost:5173
http://127.0.0.1:5173
http://localhost:5858
http://127.0.0.1:5858
https://app.chartstead.com

5. Authorized redirect URIs — add only these:

http://localhost:5173/api/auth/callback/google
http://127.0.0.1:5173/api/auth/callback/google
http://localhost:5858/api/auth/callback/google
http://127.0.0.1:5858/api/auth/callback/google
https://app.chartstead.com/api/auth/callback/google

6. Save. Copy the client id and client secret into both `.dev.vars` files. Do not put them in wrangler.jsonc.

## Explicitly out of scope

- Do not send email.
- Do not change Resend or `AUTH_EMAIL_FROM`.
- Do not wrangler secret put and do not deploy Workers.
- Do not change application source code.
- Do not create DNS, a Cloudflare tunnel, or any `*.chartstead.com` auth host. Competition 68 already owns `app.chartstead.com`.
- Do not create a Google service account or download a JSON key file.
- When you finish, report only: OAuth client created yes/no, and the presence / length / placeholder table. No secret values.

## Done when

- OAuth client **ChartStead production login** exists in project **chartstead** with the localhost + `app.chartstead.com` origins above.
- Both `.dev.vars` files have real Google id/secret, `BETTER_AUTH_URL=http://localhost:5858`, and unchanged Resend/From/secret.
- Files are gitignored, mode 600, identical.
- You have not deployed anything.
