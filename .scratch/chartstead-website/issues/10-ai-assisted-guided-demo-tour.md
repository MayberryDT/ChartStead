# 10 — AI-assisted guided demo tour (copy-paste agent prompt)

**Status:** in-review

**Blocked by:** None (v1 uses existing API/MCP)

## What to build

One **copy-paste prompt** for visitors to hand to their own agent (Cursor, Claude Code, Codex, etc.). The demo UI does **not** ask them to pick a mode.

### Demo UI (locked)

- Quiet text link under the `/demo` intro (does not compete with the three persona cards). Suggested label: **Copy AI-guided tour** (or similar — plain language, not “guide-only”).
- **No panel, pop-up, or modal.** Click = copy prompt to clipboard + toast.
- Toast tells them the next human step, e.g. paste into their agent and continue there. (Final toast copy below; polish wording in implementation.)
- Optional mirror on docs (`/docs/guides/demo`); same single prompt.

### What the agent does (locked)

The prompt instructs the agent to greet once, confirm it understands the demo, then **ask the human how to run the tour** in plain language — not product jargon. Something in this spirit:

> I’m ready to walk you through the ChartStead demo. How do you want to do this?
>
> 1. I’ll tell you what to open and click, and give you links as we go. You do everything in the browser.
> 2. Same links and guidance, and I’ll also use ChartStead’s API (or MCP) so you can see what an agent can do against the live demo — you’ll still click in the browser when I ask you to look.

Then follow the shared ~10-stop path. If they pick (2), the prompt already contains connection steps (mint propose-only key / MCP config placeholders) so the agent can continue without a second document.

Reality check: ChartStead API/MCP can read/mutate event data. It cannot drive the visitor’s browser. Say that once, plainly, if relevant — never invent UI control.

## Acceptance criteria

- [x] `/demo` has a quiet under-intro control that copies the prompt; no modal/panel/popover.
- [x] Toast on copy acknowledges next step (paste into their AI agent; agent walks them through). No mode picker in the UI.
- [x] Single prompt blob; agent’s **first** job after reading it is to ask the human how to run the tour (links-only vs links + API/MCP), in plain explanatory language — **no** labels like “guide-only” or “guide + hands.”
- [x] Same coherent ~10-step AEWF organizer path (aligned with Website 09 story).
- [x] Prompt covers HTTP + MCP for path (2), propose-only default, never mint keys / touch integrations / dump secrets, stop-before-apply unless human says so.
- [x] Verified: path (1) works with zero ChartStead credentials; path (2) works after human mints a demo key when the agent asks.
- [x] Docs mention the control and that the agent will ask how to run the tour.
- [x] Gap list: which beats stay human-click even on path (2) (DnD agenda, uploads, etc.).
- [x] Tailscale/demo URL + what-to-test before `in-review`.

## Toast copy (shipped)

> Prompt copied. Paste it into your AI agent — it'll walk you through the demo from there.

## Agent opening ask (in prompt)

After a one-line ready confirmation, ask:

> How should we run this tour?
>
> • **You drive the browser** — I’ll tell you what to do and give you the exact links.
> • **You drive the browser, and I use the API too** — same guidance and links, plus I’ll call ChartStead so you can see agent access against this demo. I’ll ask before anything consequential.

Do not name these options “Guide-only,” “Guide + hands,” or similar.

## Gap list (path 2 still human-click)

- Agenda drag-and-drop / pixel placement
- Speaker portal file uploads
- Persona entry clicks on `/demo` (agent deep-links; human presses Enter as …)
- Multi-select + opening Course Check from the desk chrome (agent may prepare a plan via API; human still confirms in UI)
- Minting/revoking API keys (human only; agent must never do this)

## Implementation notes

- Prompt: `shared/demo-ai-tour-prompt.ts` (origin baked at copy time from `window.location.origin`).
- UI: `src/DemoPersonasPage.tsx` + `.demo-persona-ai-tour*` / `.demo-persona-toast` in `src/styles.css`.
- Docs: `chartstead-web/documentation/docs/guides/demo.md` (+ index blurb). Deploy chartstead-web for production `/docs`.
- Tests: `test/ui/demo-ai-tour-prompt.test.ts`, `test/ui/demo-personas.test.tsx`.

## Comments

- 2026-08-17 — Claimed `in-progress`. Implementing quiet copy link + toast on `/demo`, single prompt (agent asks how to run), docs update. Frontier: Website 09 remains human-tandem; Website 07 already in-progress; no other blocked non-human tickets to promote.

- 2026-08-17 — Tyler: file ticket. Want visitors to hand their agent a prompt for a guided tour.
- 2026-08-17 — Tyler: ship both modes and let the user choose — later revised.
- 2026-08-17 — Tyler: UI = quiet under-intro copy link only; no modal; toast points them to paste into their agent. **No mode picker in the UI.** Agent asks in plain language whether to give links only or also use the API. Do not use “guide-only” / “guide + hands” naming.

- 2026-08-17 — Ready for human QA.
  - Demo: `http://100.105.117.93:5840/demo` (bound `0.0.0.0:5840`)
  - Docs source updated in chartstead-web (not yet required on live chartstead.com for this ticket’s demo QA)
  - What to test:
    1. `/demo` shows quiet “Prefer an agent? Copy AI-guided tour” under the intro; persona cards unchanged.
    2. Click copies prompt + toast with next-step copy; no modal.
    3. Paste prompt into an agent → it asks how to run (browser-only vs browser + API), no jargon labels.
    4. Links-only path needs no key; API path asks for Settings → Agents with Mode **Propose only** and Stages **Decisions** (defaults OK).
    5. Prompt URLs match the demo origin you opened (local/Tailscale), AEWF ids (`SUB-AEWF0017`, Nora Ellison, five embeds).

- 2026-08-17 — Fixed API-path instructions: match live **Connect your agent** UI (Propose only + Stages like Decisions/Drafts). Removed invented "read / Course Check scopes" wording.