# ChartStead design references

Start with [DESIGN.md](DESIGN.md). It is the canonical design-system specification for product UI, public surfaces, marketing, voice, and brand usage.

## UI source of truth (implement against this)

Locked visual implementation lives in **[source-of-truth/](source-of-truth/)**.

- Written system: [DESIGN.md](DESIGN.md)
- Cross-screen organizer contract: [ORGANIZER-DESK-CHROME.md](ORGANIZER-DESK-CHROME.md)
- **Visual truth:** [source-of-truth/organizer-submissions.html](source-of-truth/organizer-submissions.html) — Harbor Master Desk shell + submissions master-detail
- Exploration only (not canonical): [prototypes/](prototypes/)
- Mood / hierarchy only: [references/marketing/](references/marketing/)

When app UI and the source-of-truth HTML disagree, match the HTML and the organizer contract (or revise them deliberately first). See [source-of-truth/README.md](source-of-truth/README.md).

The HTML is the visual truth for the reference surface, while cross-screen shell behavior is governed by [ORGANIZER-DESK-CHROME.md](ORGANIZER-DESK-CHROME.md). Product behavior remains governed by [context.md](../context.md), the [competition build plan](../context/BUILD-PLAN.md), and the behavioral contract in [source-of-truth/README.md](source-of-truth/README.md). Do not infer missing workflow behavior from a static screen alone.

## Brand assets

- [chartstead-mark-on-light.png](assets/brand/chartstead-mark-on-light.png) — 1254×1254 indigo mark on a light background
- [chartstead-mark-on-dark.png](assets/brand/chartstead-mark-on-dark.png) — 1254×1254 reversed mark on an indigo background
- [chartstead-favicon.png](assets/brand/chartstead-favicon.png) — 256×256 small-size derivative of the corrected dark mark

The two 1254×1254 files are the supplied high-resolution raster originals. Preserve them unchanged. Approved vector lockups, a transparent-background mark, and additional app-icon formats remain future production assets. The detailed mark is intentional at small sizes: fine chart elements may resolve as visual texture rather than individually legible lines.

The root [favicon.svg](../favicon.svg) is a self-contained favicon using the corrected dark mark so T3 Code can load it without an external asset dependency.

## Marketing and UI direction

- [organizer-dashboard.png](references/marketing/organizer-dashboard.png) — admin overview, schedule, submissions, communications, and reporting
- [speaker-experience.png](references/marketing/speaker-experience.png) — speaker profile, sessions, tasks, updates, and support
- [conference-team-workflow.png](references/marketing/conference-team-workflow.png) — call-for-speakers through speaker-portal workflow
- [submissions-reviews-schedule.png](references/marketing/submissions-reviews-schedule.png) — submission inbox, review rounds, and agenda table
- [product-overview.png](references/marketing/product-overview.png) — organizer product overview and major workflow areas

Use these boards for visual direction, information hierarchy, tone, and workflow cues. They are concept references rather than exact UI specifications; product requirements remain grounded in [context.md](../context.md), and implementation decisions should follow [DESIGN.md](DESIGN.md).
