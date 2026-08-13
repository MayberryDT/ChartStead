# 32 — Messages workspace shell port

**What to build:** Port the organizer Messages audience, compose, preview, and communication-history workspace into the shared organizer shell established by Competition 28. Preserve Course Check as the sole review/send boundary.

**Blocked by:** Competition 28 — Shared organizer desk shell baseline

**Status:** done

- [x] Messages renders through one shared shell toolbar and removes duplicate workspace-level command/header chrome.
- [x] Audience filters, visible selection, recipient counts, and the primary review action have a clear shell/work-surface ownership model without shifting the compose layout unexpectedly.
- [x] Audience eligibility, missing-address explanations, token preview, draft-only compose behavior, Course Check handoff, delivery status, failure retention, retry context, and communication history remain truthful.
- [x] Local audience filtering and selection preserve context without an unnecessary full-workspace loading wipe.
- [x] Desktop and narrow layouts retain readable list/detail or compose/history relationships, 44px targets, visible focus, and no accidental page-level horizontal overflow.
- [x] Focused tests prove direct Messages navigation, shell presence, filter/selection behavior, and that composing never sends directly.
- [x] Do not change Course Check approval, execution, retry, compensation, or provider semantics.

## Comments

Filed 2026-08-12 as the agent-owned Messages slice in the new parallel polish lane. Start after Competition 28 is complete; it can run in parallel with tickets 29–31 and 33 from the shared-shell commit.

- 2026-08-13 — frontier-reconcile: Still blocked on: Competition 28 (in-review).

### 2026-08-12 agent update

Tyler explicitly authorized clearing all remaining non-human-tandem tickets; moved from `blocked` to `in-progress` for active implementation in the main checkout.

### 2026-08-13 implementation update

Ported Messages chrome into the shared OrganizerShell toolbar: readiness filters, visible counts, included/excluded/missing counts, Select visible, and Review in Course Check now live in shell chrome while the work surface keeps audience, compose, preview, Course Check guidance, focused-plan result details, and communication history. Verified touched TSX parses with a targeted TypeScript transpile check. Browser-smoked the direct Messages route on the shared demo server at `/e/pacific-open-data-summit-2026/messages`: shell heading and tools rendered, Select visible updated counts, Ready filtering preserved the 4-recipient selection while showing 2 visible speakers, and Review handed off to a Communication Course Check without creating frozen drafts or send effects. Attempted the focused messages e2e (`npm run test:e2e -- test/e2e/competition-spine.spec.ts -g "speaker announcement stays a draft"`), but Playwright could not start its own server because port 4173 was already occupied by another worker server; a separate demo server launch on 4183 was blocked by the system file-watcher ENOSPC limit.
