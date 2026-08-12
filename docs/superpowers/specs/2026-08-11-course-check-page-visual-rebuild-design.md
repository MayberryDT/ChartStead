# Course Check page visual rebuild

**Date:** 2026-08-11  
**Branch:** `course-check-07-airtable-effects`  
**Status:** Approved design direction; awaiting written-spec review

## Purpose

Rebuild the Course Check workspace so it feels native to ChartStead's submissions experience while retaining a purpose-built consequence-review flow. The result must be compact, calm, and easy to scan. Users should see which evidence deserves attention before expanding anything.

## Existing failure

`CourseCheckPage` currently renders `className="app course-check-page"`. The global `.app` class is the organizer shell's two-column grid, so nesting it on this route reserves another sidebar-width column and crushes Airtable values into a narrow track. The page also relies on a stack of visually equal cards, which obscures risk and separates the action controls from their consequences.

## Visual direction

Use the submissions surface as the styling reference, not as a layout template:

- Inter typography and the existing ChartStead type scale.
- White and subtle gray surfaces with thin `outline` rules.
- Compact metadata, restrained blue actions, and operational density.
- Amber and red only as semantic warning and blocker signals.
- Minimal radius and shadow; hierarchy comes from spacing, rules, weight, and status color.

The Course Check remains a single-purpose review workspace rather than copying the submissions queue and inspector arrangement.

## Page structure

The page uses one bounded content canvas with five regions:

1. **Header:** Course Check eyebrow, action-specific title, one-line purpose, back link, state badge, and plan reference.
2. **Plan strip:** version, owner, progress, age/freshness, and linked-plan facts in a compact ruled metadata row.
3. **Decision or action scope:** the affected proposals, publication operation, communication recipients, or guaranteed-speaker source.
4. **Consequence register:** collapsed evidence sections ordered by importance.
5. **Execution stages:** optional Airtable stage followed by a grounded action bar for the current internal action.

Mutation history and secondary operational details sit after the primary review flow and remain collapsed.

## Consequence register

All evidence sections are collapsed on initial render, including sections containing warnings or blockers. The closed summary row must still explain whether it needs attention.

Each summary row contains:

- section title;
- affected-record count;
- one-line summary;
- severity badge when findings exist;
- chevron and explicit `Review` affordance.

Severity treatment:

- **Blocker:** red left rail, red badge, and the blocker count.
- **Warning:** amber left rail, amber badge, and the warning count.
- **Informational finding:** blue-gray badge without an alarm treatment.
- **Clean:** neutral rule and record count only.

Color is never the only signal. Badges include text, and the native disclosure control remains keyboard-operable with accurate expanded state.

Expanded content uses flat ruled lists rather than nested cards. Findings appear before record deltas. Recovery guidance is visually paired with its finding.

## Airtable stage

The Airtable area is a visibly separate optional integration stage. It must not imply that applying internal ChartStead changes also approves provider writes.

The stage header shows its disposition and aggregate effect state. Each effect is a readable, independently collapsible row containing:

- operation and table;
- resource kind and stable ChartStead ID;
- effect-state badge;
- provider record reference when available;
- mapped fields in a responsive label/value definition list;
- retry or error guidance when applicable.

Effect rows start collapsed. Failed, unknown, or retryable effects receive semantic highlighting on the closed row. Long IDs truncate visually with full text preserved in the DOM and a title/copy-friendly presentation. Field values use `minmax(0, 1fr)`, `min-width: 0`, and safe wrapping so no value can force or collapse the grid.

The stage controls remain explicit: `Write to Airtable`, `Reconcile unknown writes`, `Defer`, and `Remove stage`. Destructive or recovery actions never share the primary-action treatment.

## Action bar

The action bar is part of the normal page flow and spans the content width. It uses the submissions inspector footer language: white surface, strong top rule, compact explanatory status, and grouped buttons.

Internal apply controls and Airtable controls remain in their respective sections. The action bar only presents the next internal Course Check action and any relevant deferral controls.

## Component boundaries

Refactor the large page into focused display components without changing API behavior:

- `CourseCheckHeader`
- `CourseCheckPlanStrip`
- `ConsequenceRegister`
- `ConsequenceSection`
- `AirtableStage`
- `AirtableEffectRow`
- `CourseCheckActionBar`

Action-specific decision, publication, communication, and guaranteed-speaker bodies continue to own their domain content. Shared layout components receive frozen plan data and callbacks; they do not perform network requests.

## Data and error behavior

Existing queries, mutations, plan versions, digests, idempotency keys, and API responses remain unchanged. The rebuild is presentational and compositional.

Mutation errors render adjacent to the action that caused them. Airtable degraded, retryable, permanent, and unknown states remain visible on collapsed summaries. Successful internal work stays visibly complete even when the optional integration stage is unavailable.

## Responsive behavior

- Desktop content width is bounded but uses the available organizer-main width.
- Metadata flows from a ruled horizontal strip into a two-column and then single-column layout.
- Definition lists use fixed readable labels only where space permits; mobile stacks label above value.
- Buttons wrap without becoming narrow vertical strips.
- No horizontal page overflow at 320px or wider.

## Accessibility

- Native `details`/`summary` behavior for every consequence and Airtable effect disclosure.
- Visible keyboard focus consistent with submissions controls.
- Text labels accompany severity colors and icons.
- Minimum 44px interactive targets for primary actions.
- Heading order remains logical across action types.
- Full identifiers remain available to assistive technology even when visually truncated.

## Verification

Automated coverage will verify:

- the organizer `.app` shell class is not nested on Course Check routes;
- all consequence sections start collapsed;
- warning and blocker summaries expose counts and textual severity;
- Airtable IDs and mapped fields remain within their row at desktop and mobile widths;
- internal and Airtable actions remain separate;
- existing Course Check worker and UI behavior remains green.

Browser QA will cover decision and publication Course Checks at 1280px desktop and a narrow mobile viewport, including a warning-bearing register row and a multi-effect Airtable stage.

## Out of scope

- Changes to Course Check planning, persistence, effect delivery, or Airtable mapping.
- New workflow stages or permissions.
- A redesign of the organizer shell or submissions workspace.
- Changes to locked ChartStead design tokens.
