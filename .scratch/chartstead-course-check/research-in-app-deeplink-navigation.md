# In-app deep link navigation (organizer desks)

Primary sources: `src/router.tsx`, `src/App.tsx` (`EventDesk` / `AgendaPage` / `SubmissionsPage`), `src/OrganizerShell.tsx`, `src/AgendaWorkspace.tsx`, `src/course-check/IssueActions.tsx`, `src/course-check/DecisionExceptionReview.tsx`, `src/course-check/useCourseCheckReturnContext.ts`, TanStack `Link` / `useNavigate` call sites under `src/`.

## 1. Terminology

| Term | Meaning in this codebase |
| --- | --- |
| **Client-side navigation** | URL/history updates through TanStack Router without a document reload. App shell stays mounted; React swaps route components. |
| **Declarative `Link`** | `<Link to="…" params={…} search={…}>` from `@tanstack/react-router`. Intercepts left-clicks and navigates in-app. Used on Course Check, public program, forms, CFP, etc. |
| **Imperative `navigate`** | `useNavigate()` then `void navigate({ to, params, search, replace? })`. Same client-side path as `Link`. Dominant pattern inside `EventDesk` and `AgendaWorkspace`. |
| **Hard `href` / document navigation** | Raw `<a href="/e/…">` with no `preventDefault` and no TanStack `Link`. Browser loads the URL as a normal navigation → full page load, JS re-bootstrap, React remount from root. |

“Deep link” here means a typed route + search params (e.g. agenda `session` / `sessionIds` / `returnTo`), not a separate deep-link framework.

## 2. How EventDesk switches Submissions ↔ Agenda

Desks are **separate routes**, each mounting `EventDesk` with a different `initialNav`:

- `/e/$eventId/submissions` → `SubmissionsPage` → `EventDesk` `initialNav="Submissions"` (`src/App.tsx`, `src/router.tsx`)
- `/e/$eventId/agenda` → `AgendaPage` → `EventDesk` `initialNav="Agenda"`; search → `initialAgendaDay` / `initialAgendaSessionIds` / `repairReturnTo`

Sidebar switching is **not** a raw href:

1. `OrganizerShell` renders `<a href={navHref(…)}>` for middle-click/copy URL, but `onClick` → `preventDefault()` → `onNavigate(item)` (`src/OrganizerShell.tsx`).
2. `EventDesk.selectNav` sets local `activeNav`, clears desk chrome, then `navigate({ to: "/e/$eventId/agenda" | …/submissions", params, search })` (`src/App.tsx`).

So the intended desk switch is **imperative client-side `navigate`**, with a momentary optimistic `activeNav` update before the route component remounts.

In-desk agenda URL sync (day / selected session) also uses `navigate` with `replace: true` and search `day` + `sessionIds` (`AgendaWorkspace.syncAgendaUrl`).

## 3. Why raw `<a href="/e/…/agenda?session=…">` full-reloads and remounts

Course Check “Fix” / route actions currently emit plain anchors:

- `IssueActions`: `<a href={repairHref(action.target.href, context.returnPath)}>` — no `preventDefault`, no `Link` (`src/course-check/IssueActions.tsx`)
- `DecisionExceptionReview` Fix button: same pattern (`src/course-check/DecisionExceptionReview.tsx`)
- Worker targets look like `/e/{eventId}/agenda?session={id}` (`worker/course-check/issue-actions.ts` `agendaRoute`)

TanStack only intercepts its own `Link` (or your own `preventDefault` + `navigate`). A bare click follows the href as a **document navigation**:

1. Full load through `RouterProvider` (`src/main.tsx`)
2. Fresh React tree; `AgendaPage` shows `LoadingShell` until events refetch
3. New `EventDesk` + `AgendaWorkspace` mount from scratch (all local state reset)
4. Stylesheets/layout recalculate against a cold tree (see §6)

Contrast: `ProposalLink` in Submissions keeps `href` for open-in-new-tab but `preventDefault` + `onSelectProposal` → `navigate` for primary clicks (`src/SubmissionsWorkspace.tsx`). Sidebar uses the same hybrid pattern.

## 4. Recommended pattern: Fix → Agenda (highlight session + `returnTo`) without full reload

Mirror desk navigation and existing Course Check `Link`/`navigate` usage.

**Preferred APIs**

```ts
import { Link, useNavigate } from "@tanstack/react-router";

// Declarative (Fix control)
<Link
  to="/e/$eventId/agenda"
  params={{ eventId }}
  search={{
    session: sessionId,           // accepted by agenda validateSearch + AgendaPage
    // or sessionIds: sessionId,  // what AgendaWorkspace.syncAgendaUrl writes
    returnTo: returnPath,         // must pass safeCourseCheckReturnPath if banner desired
  }}
  onClick={() => {
    saveCourseCheckReturnContext(planId, { …context, focusActionId });
    onBeforeFix?.(); // DecisionFinalize: persistFixResume
  }}
>
  Fix
</Link>

// Imperative (same effect)
void navigate({
  to: "/e/$eventId/agenda",
  params: { eventId },
  search: { session: sessionId, returnTo: returnPath },
});
```

**Concrete contract already wired**

| Piece | Location | API |
| --- | --- | --- |
| Route + search | `src/router.tsx` `agendaRoute` | `day?`, `session?`, `sessionIds?`, `returnTo?` |
| Highlight / open | `src/App.tsx` `AgendaPage` | `session` or comma `sessionIds` → `initialAgendaSessionIds` |
| Selection / day / move dialog | `src/AgendaWorkspace.tsx` | mounts from `initialSessionIds`; auto-selects linked day; opens move UI |
| Return banner | `src/App.tsx` `safeCourseCheckReturnPath` | only `/e/{eventId}/course-checks/{planId}` with **no** `?/#` suffix |
| Append `returnTo` | `repairHref` in `src/course-check/useCourseCheckReturnContext.ts` | string helper; fine to keep for building `search.returnTo` |
| Finalize resume | `DecisionFinalizeOverlay` `persistFixResume` / `onBeforeFix` | sessionStorage resume; do not rely on repair banner alone (`emptyIssueContext.returnPath` is currently `/e/…/submissions`, which **fails** `safeCourseCheckReturnPath`) |

**Do not** use bare `<a href={repairHref(…)}>` for in-app Fix. Keep `href`-equivalent via `Link`/`navigate` so middle-click/copy still work when using `Link`.

Optional hybrid (same as sidebar / `ProposalLink`): keep `<a href={…}>` but `preventDefault` on plain left-click and call `navigate({ to: "/e/$eventId/agenda", … })`.

## 5. File paths and APIs (cheat sheet)

| Concern | Path | Use |
| --- | --- | --- |
| Router tree | `src/router.tsx` | `createRoute` `/e/$eventId/agenda`, `validateSearch` |
| Desk shell / switch | `src/App.tsx` | `EventDesk.selectNav`, `useNavigate` |
| Sidebar intercept | `src/OrganizerShell.tsx` | `preventDefault` + `onNavigate` |
| Agenda deep state | `src/AgendaWorkspace.tsx` | `useNavigate`, `syncAgendaUrl` |
| Course Check typed links | `src/CourseCheckPage.tsx` | `Link`, `useNavigate` |
| Fix anchors today | `src/course-check/IssueActions.tsx`, `DecisionExceptionReview.tsx` | replace with `Link`/`navigate` |
| `returnTo` helper | `src/course-check/useCourseCheckReturnContext.ts` | `repairHref`, `saveCourseCheckReturnContext` |
| Agenda Fix href source | `worker/course-check/issue-actions.ts` | `agendaRoute` → `?session=` |

## 6. Agenda CSS / layout: full remount vs client switch

| Navigation | What remounts | Layout risk |
| --- | --- | --- |
| **Hard `<a href>`** | Entire app (document load) | Highest: `LoadingShell` flash, events refetch, cold CSS paint, agenda chrome (`onChromeChange`) reattaches after workspace mounts, highlight timer / move dialog restart from initial search only. |
| **Client `Link` / `navigate` Course Check → Agenda** | `CourseCheckPage` unmounts; `AgendaPage` → new `EventDesk` + `AgendaWorkspace` | Medium: still a **fresh** desk mount (routes are separate components), but **no** stylesheet reload / JS bootstrap. Cached `["events"]` often skips long loading. Highlight/day still applied from search on mount. |
| **Sidebar Submissions → Agenda** | Optimistic `activeNav` swap, then route remount of `EventDesk` | Lowest flash among desk switches; still remounts `AgendaWorkspace` when `AgendaPage` takes over. |

Agenda layout bugs attributed to “CSS broken after Fix” are often **cold remount + async chrome/tools**, not missing CSS files. Prefer client-side `Link`/`navigate` so styles stay hot and the only remount is the desk route (same as normal organizer nav). Full document reload amplifies layout thrash and can look like a broken agenda grid until queries and `agendaChrome` settle.
