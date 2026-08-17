# Canonical demo event

This is the one shared source of names and IDs for `/demo`, the public program, all five embeds, Website 03, and Website 05. Do not invent a second sample event on the marketing site.

Code constants live in `shared/demo-event.ts`.

## Event

| Field | Value |
| --- | --- |
| id | `ai-engineer-worlds-fair-2026` |
| name | AI Engineer World's Fair 2026 |
| dates | June 29–July 2, 2026 |
| venue | Moscone West, San Francisco |
| timezone | `America/Los_Angeles` |
| public program | `/e/ai-engineer-worlds-fair-2026/program` |

Pacific Open Data Summit 2026 and Civic Tech Summit 2026 remain switcher events. They are not the launch demo. Course Check killer-demo fixtures stay on Pacific Open Data Summit and are hidden from Settings.

## Sample records for website copy

| Field | Value |
| --- | --- |
| proposalId | `SUB-AEWF0017` |
| speakerId | `aewf-speaker-000` |
| sessionId | `aewf-session-000` |
| track | Agents |
| speaker | Nora Ellison |
| coSpeaker | Priya Raman |
| talkTitle | Shipping reliable agent workflows in production |

`/demo` personas use the same event, speaker, talk, and Agents track. The accepted-speaker portal is provisioned through the existing guaranteed-speaker path so the signed link stays valid; public embeds should use the IDs above.

## Public embeds

Managed embed configs are seeded on the event so the Embeds workspace is not empty.

| Widget | Embed id | Public page | Managed embed |
| --- | --- | --- | --- |
| Sessions List | `aewf-embed-sessions` | `/e/ai-engineer-worlds-fair-2026/program/sessions` | `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-sessions` |
| Speakers List | `aewf-embed-speakers` | `/e/ai-engineer-worlds-fair-2026/program/speakers` | `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speakers` |
| Agenda | `aewf-embed-agenda` | `/e/ai-engineer-worlds-fair-2026/program/agenda` | `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-agenda` |
| Itinerary | `aewf-embed-itinerary` | `/e/ai-engineer-worlds-fair-2026/program/itinerary` | `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-itinerary` |
| Speaker Gallery | `aewf-embed-speaker-gallery` | `/e/ai-engineer-worlds-fair-2026/program/speaker-gallery` | `/e/ai-engineer-worlds-fair-2026/embed/aewf-embed-speaker-gallery` |

## Hosting

Competition 61 is the seed, local `/demo`, and this shared source. Attaching `https://demo.chartstead.com` is Competition 60.
