---
version: alpha
name: ChartStead Design System
description: A calm, professional design system for open-source conference programming and speaker management software.
colors:
  primary: "#081D3A"
  on-primary: "#FFFFFF"
  primary-hover: "#102C56"
  primary-active: "#06152B"
  secondary: "#2F5D98"
  on-secondary: "#FFFFFF"
  secondary-hover: "#254C7E"
  secondary-active: "#1D3D67"
  tertiary: "#22B573"
  on-tertiary: "#081D3A"
  background: "#FFFFFF"
  on-background: "#081D3A"
  surface: "#FFFFFF"
  surface-subtle: "#F3F5F7"
  surface-muted: "#E9EDF2"
  surface-inverse: "#081D3A"
  on-surface: "#081D3A"
  on-surface-variant: "#526071"
  on-surface-muted: "#5B6878"
  outline: "#D7DEE7"
  outline-strong: "#AEBAC8"
  selection: "#EAF2FB"
  nav-active: "#173B70"
  info-container: "#EAF2FB"
  on-info-container: "#244E7D"
  success-container: "#E9F8F1"
  on-success-container: "#087A4D"
  warning: "#C47A16"
  warning-container: "#FFF4E5"
  on-warning-container: "#8A4D09"
  error: "#B42318"
  error-container: "#FDECEA"
  on-error-container: "#8A1C13"
  schedule-blue-container: "#E8F1FB"
  on-schedule-blue: "#245486"
  schedule-green-container: "#E8F7F0"
  on-schedule-green: "#087A4D"
  schedule-purple-container: "#F0EBFA"
  on-schedule-purple: "#5C3F8C"
  schedule-amber-container: "#FFF4E5"
  on-schedule-amber: "#8A4D09"
  chart-line: "#DCE5EF"
  chart-line-subtle: "#EEF3F8"
  focus-ring: "#2F5D98"
  scrim: "rgba(8, 29, 58, 0.56)"
  transparent: "transparent"
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.04em
  display-lg:
    fontFamily: Inter
    fontSize: 52px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.035em
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.02em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  overline:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.08em
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  unit: 4px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  4xl: 96px
  gutter: 24px
  page-mobile: 16px
  page-tablet: 24px
  page-desktop: 32px
  container-max: 1440px
  content-max: 1200px
  sidebar-width: 248px
  sidebar-collapsed: 72px
  header-height: 64px
  card-padding: 20px
  section-gap: 32px
components:
  page-background:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
  button-primary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.on-secondary}"
  button-primary-active:
    backgroundColor: "{colors.secondary-active}"
    textColor: "{colors.on-secondary}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.on-surface-muted}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  button-secondary-hover:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.primary}"
  button-ghost:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 40px
    padding: "{spacing.xs}"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  button-success:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  sidebar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    width: "{spacing.sidebar-width}"
  sidebar-collapsed:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    width: "{spacing.sidebar-collapsed}"
  sidebar-item-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    height: 40px
    padding: "{spacing.sm}"
  sidebar-item-pressed:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  sidebar-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    height: 40px
    padding: "{spacing.sm}"
  topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    height: "{spacing.header-height}"
    padding: "{spacing.md}"
  card-standard:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  card-subtle:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  card-inverse:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  input-field-disabled:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
    padding: "{spacing.sm}"
  table-header:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
    height: 40px
    padding: "{spacing.sm}"
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    height: 44px
    padding: "{spacing.sm}"
  table-row-hover:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.on-surface}"
  divider-standard:
    backgroundColor: "{colors.outline}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.outline-strong}"
    height: 1px
  badge-info:
    backgroundColor: "{colors.info-container}"
    textColor: "{colors.on-info-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs}"
  badge-success:
    backgroundColor: "{colors.success-container}"
    textColor: "{colors.on-success-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs}"
  badge-warning:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.on-warning-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs}"
  badge-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.xxs}"
  schedule-card-blue:
    backgroundColor: "{colors.schedule-blue-container}"
    textColor: "{colors.on-schedule-blue}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  schedule-card-green:
    backgroundColor: "{colors.schedule-green-container}"
    textColor: "{colors.on-schedule-green}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  schedule-card-purple:
    backgroundColor: "{colors.schedule-purple-container}"
    textColor: "{colors.on-schedule-purple}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  schedule-card-amber:
    backgroundColor: "{colors.schedule-amber-container}"
    textColor: "{colors.on-schedule-amber}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  chart-line:
    backgroundColor: "{colors.chart-line}"
    height: 1px
  chart-texture:
    backgroundColor: "{colors.chart-line-subtle}"
  status-info-icon:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.secondary}"
    size: 20px
  status-warning-icon:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.warning}"
    size: 20px
  focus-indicator:
    backgroundColor: "{colors.focus-ring}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.xs}"
    size: 3px
  modal-scrim:
    backgroundColor: "{colors.scrim}"
    textColor: "{colors.on-primary}"
  logo-app-icon:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xl}"
    size: 64px
---
# ChartStead Design System

## Overview

ChartStead is an open-source conference programming and speaker management platform. It supports the complete journey from call for speakers through submission review, acceptance, scheduling, speaker onboarding, communications, and publication of the final agenda.

The design personality is **calm craftsmanship with operational authority**. It should feel dependable enough for experienced event producers, clear enough for nontechnical staff, and polished enough to become a serious commercial SaaS product. It must never look like a hackathon prototype, generic AI startup, developer tool, or consumer event app.

The primary emotional outcome is: **complex conference operations feel understandable, controlled, and safely on course**.

### Audience and surfaces

- **Organizer application:** Dense, dependable operational software for event-production teams. Prioritize tables, queues, deadlines, states, and conflict visibility.
- **Speaker portal:** A simpler, more supportive surface for profile completion, onboarding tasks, deadlines, files, messages, and session details.
- **Submission forms and published agenda:** Public-facing, accessible, responsive, and configurable to inherit each event's branding.
- **Marketing site:** More spacious and expressive than the application, but still precise, credible, and product-led.

### Brand name and descriptor

Always capitalize the name as **ChartStead**. Never write `Chartstead`, `Chart Stead`, or `CHARTSTEAD` in normal prose.

Because the name is intentionally ownable rather than literal, pair it with the canonical descriptor whenever the audience may not already know the product:

> **Conference programming and speaker management.**

The longer explanatory line is:

> **Call for speakers, review, scheduling, and speaker portals.**

Useful campaign lines include **“From call for speakers to published agenda.”**, **“Shape the agenda. Steady the work.”**, and **“Set the course.”** These are optional marketing copy, not replacements for the canonical descriptor.

### Logo system

The approved logo is the only logo. It contains:

- A circular compass rose.
- A visible `N` north indicator.
- Fine antique nautical-chart lines inside the ring.
- A simple, immediately recognizable speaker podium or lectern at the center.

The podium is essential. It connects the navigation metaphor to conferences and speakers. Do not replace it with a flag, lighthouse, sailboat, map pin, microphone-only icon, calendar, checklist, bar chart, monogram, or abstract lines.

Use approved vector assets rather than redrawing the mark in CSS or substituting an icon-library compass. Recommended asset names:

- `brand/chartstead-mark.svg`
- `brand/chartstead-lockup-horizontal.svg`
- `brand/chartstead-lockup-stacked.svg`
- `brand/chartstead-app-icon.svg`
- `brand/chartstead-favicon.svg`

At small sizes, use the approved detailed mark. The fine chart lines and north indicator may resolve as texture rather than individually legible elements; that retained detail is intentional and helps the mark remain distinctive. Do not redraw or remove those elements for favicon or compact-logo use.

### Core design principles

1. **Clarity before cleverness.** Every status, deadline, score, and conflict should be legible without interpretation.
2. **Calm operational density.** The organizer app may be information-dense, but grouping, hierarchy, and spacing must prevent visual stress.
3. **Tables before card walls.** Primary work objects such as submissions, sessions, reviewers, speakers, and communications belong in rows and structured lists. Cards are for summaries, actions, and grouped context.
4. **Human-centered confidence.** Speaker-facing language should be reassuring and direct; organizer-facing language should be concise and operational.
5. **Nautical metaphor, not nautical costume.** Use compass logic, plotted routes, chart lines, and directional language subtly. Avoid decorative anchors, waves, lighthouses, ropes, ships, and coastal illustrations in the product UI.
6. **Product brand plus event theme.** ChartStead owns the application structure. Individual events may theme public forms, speaker portals, emails, and agendas without turning the core product into the event organizer's brand.
7. **Preserve operational truth.** Incomplete and contradictory states are normal conference work. Show `TBD`, unplaced items, pending approval, and unresolved conflicts honestly instead of forcing false completion.
8. **Keep humans in authority.** Status changes, warnings, drafts, and recommendations may be automatic. Consequential communication and escalation remain explicit organizer actions.

## Colors

The palette is intentionally narrow. Deep Indigo establishes trust and structure; Steel Blue drives interaction; Success Green communicates completed or healthy states; white and pale gray keep dense operational interfaces calm.

- **Primary / Indigo (`#081D3A`):** Brand anchor, wordmark, sidebar, dark banners, footer, and primary text. Use it for structure, not for every control.
- **Secondary / Steel Blue (`#2F5D98`):** Links, focused controls, active tabs, primary buttons, selected filters, and key interactive accents.
- **Tertiary / Success Green (`#22B573`):** Positive state icons, completion indicators, accepted status accents, and progress. Do not use it as the default CTA color or for large text on white.
- **Pale Gray (`#F3F5F7`):** Secondary surfaces, table headers, page sections, disabled fields, and gentle grouping.
- **White (`#FFFFFF`):** Main application surface and primary card background.

### Semantic application

- Text defaults to Indigo on white.
- Secondary text uses `on-surface-variant`; muted text must still meet WCAG AA.
- Primary actions use Steel Blue with white text.
- Dark navigation uses Indigo with white text and a lighter navy active state.
- Success, warning, and error messages use pale containers plus dark semantic text. Never rely on color alone; include an icon and explicit label.
- Schedule tracks use pastel containers with dark text. Track colors identify categories, not status or severity.

### Nautical chart texture

Chart lines are a background texture, not content. Use `chart-line` or `chart-line-subtle` at approximately 4–8% visual opacity on marketing pages, onboarding panels, empty states, or wide section backgrounds. Never place chart texture behind dense tables, form fields, or small body text.

### Dark surfaces

Dark Indigo is appropriate for:

- The main organizer sidebar.
- Marketing hero bands and footers.
- App icons and favicons.
- Event-specific public themes when configured by an organizer.

The default product is light mode. Do not create a full dark product theme unless it is explicitly scoped and fully accessible.

### Event theming

Public submission forms, speaker portals, emails, and published agendas may inherit an event logo, event accent color, campaign image, or event heading font. Preserve ChartStead's structural typography, spacing, accessibility rules, and component behavior. Keep a restrained “Powered by ChartStead” treatment in the footer or equivalent attribution area.

The organizer application should remain primarily ChartStead-branded. Event branding appears as context—event logo, title, cover art, or accent—not as a wholesale replacement for the product shell.

## Typography

ChartStead uses **Inter** throughout the application, portal, public surfaces, and marketing site. Inter's neutral construction keeps dense tables readable and gives the product a modern, procurement-safe tone.

The ChartStead wordmark is artwork inside the approved logo lockup. Do not recreate the wordmark by typing “ChartStead” in Inter when an official lockup is required.

### Hierarchy

- **Display styles:** Marketing hero statements only. Use tight tracking, short line lengths, and no more than one display block per view.
- **Headlines:** Page titles, major sections, dialogs, and key onboarding messages.
- **Titles:** Cards, panels, table groups, and session titles.
- **Body:** Explanations, form help, speaker instructions, and empty states.
- **Labels:** Controls, filters, table headers, badges, and compact metadata.
- **Overline:** Rarely used for small uppercase category labels in marketing or section intros.

### Weight and emphasis

- Use Regular `400` for body copy.
- Use Semi-Bold `600` for most headings, labels, and interactive text.
- Use Bold `700` for display headlines and major marketing statements.
- Avoid using more than three weights on one screen.
- Use color and spacing before introducing additional font weights.

### Data typography

Enable tabular numerals for scores, dates, times, counts, percentages, and schedule grids. Keep time and room metadata aligned so users can scan vertically. Avoid monospaced fonts unless displaying code, embed snippets, or fixed-width identifiers.

### Voice and copy

- Use direct nouns and verbs: `Mark approved`, `Send acceptance`, `Review track queue`, `Move session`, `Publish agenda`.
- Prefer explicit status language over clever labels.
- Distinguish internal state from external action in labels and confirmation text. `Mark approved` changes committee state; `Send acceptance` contacts the speaker.
- Avoid generic AI language, hype, and unexplained abbreviations.
- Organizer copy is concise and operational.
- Speaker copy is supportive without being overly cheerful or childish.
- Confirmation and error text must state what happened and what the user should do next.

## Layout

The product uses a **fixed-max desktop grid** and a **fluid responsive layout**. Desktop is the primary environment for organizer workflows; speaker and public surfaces must be excellent on mobile.

### Grid and rhythm

- Use a 12-column desktop grid inside a maximum `1440px` shell.
- Use an 8px rhythm with 4px micro-adjustments.
- Default desktop page padding is `32px`; tablet is `24px`; mobile is `16px`.
- Standard card padding is `20px` or `24px` depending on density.
- Related controls use 8–12px gaps; distinct groups use 24–32px gaps.
- Major page sections use 32–64px separation based on context.

### Organizer shell

- Persistent left sidebar: `248px` expanded, `72px` collapsed.
- Top bar: `64px` high.
- Main work area should prioritize width for tables and schedule grids.
- Page title, event selector, high-priority actions, and filters appear before content.
- Avoid permanent right sidebars unless the view is an editor, inspector, or conflict-resolution workflow.

### Information density

Use dense but readable layouts:

- Default table row height: `44px`.
- Compact row height may be `40px` where scanning speed matters.
- Table headers remain visually quiet with Pale Gray background and strong labels.
- Use sticky headers and frozen identifying columns for long tables.
- Keep summary metrics in one compact row; do not turn every metric into a large dashboard card.

### Portal layout

The speaker portal is calmer and more spacious than the organizer app:

- A simple dashboard with tasks, next deadline, session status, messages, and resources.
- Clear completion progress.
- One dominant action per panel.
- Mobile navigation uses a bottom bar or compact top menu.
- Onboarding tasks should remain visible until complete, then collapse into history.

### Responsive behavior

- At approximately `1024px`, collapse the organizer sidebar to an icon rail when necessary.
- Below `768px`, stack portal and public content vertically.
- Organizer tables may use horizontal scrolling and prioritized columns; do not compress all columns into illegibility.
- Full drag-and-drop schedule editing is a desktop/tablet workflow. Mobile may provide read-only agenda review, conflict summaries, and limited edits.
- Touch targets are at least `44px` high or wide.

### Marketing layout

Marketing pages may use wider negative space, oversized typography, logo-forward compositions, and subtle chart textures. Product screenshots should remain the proof point. Avoid decorative layouts that obscure what the software does.

## Elevation & Depth

ChartStead is primarily flat and structured. Hierarchy comes from borders, tonal surfaces, spacing, and typography—not dramatic shadows.

### Layer model

1. **Page:** White or Pale Gray background.
2. **Standard surface:** White card with a 1px `outline` border.
3. **Raised surface:** White card, popover, or inspector with a soft shadow and 1px border.
4. **Modal:** White surface over an Indigo scrim.

### Shadows

Use restrained shadows:

- Standard raised card: `0 2px 8px rgba(8, 29, 58, 0.08)`.
- Popover or dropdown: `0 8px 24px rgba(8, 29, 58, 0.12)`.
- Modal: `0 16px 48px rgba(8, 29, 58, 0.18)`.

Do not use glow effects, glassmorphism, frosted panels, thick ambient shadows, or floating 3D cards in the product UI. Marketing artwork may use subtle embossing or lighting around the logo, but this must not become an application pattern.

### Focus and selection

- Keyboard focus uses a 2–3px Steel Blue ring with a 2px white offset where needed.
- Selected rows use a pale blue fill and an additional icon, check, or border cue.
- Hover states are subtle and must not shift layout.

## Shapes

The shape language is **precise with controlled softness**.

- Default control radius: `8px`.
- Standard card radius: `12px`.
- Schedule blocks and compact table controls: `6px`.
- Large marketing feature panels: up to `16px`.
- Status pills and avatars: fully rounded where appropriate.

Avoid excessive pill-shaped containers, oversized bubbly cards, and mixed radius styles in the same view.

### Iconography

Use a consistent outline icon family such as Lucide or an equivalent with:

- `20px` default size.
- `16px` in dense tables and metadata.
- `24px` for prominent actions or feature explanations.
- Approximately `1.75px–2px` stroke width.
- Simple forms and rounded line caps.

Do not use the ChartStead compass logo as a generic navigation icon. Utility icons should remain functional; the logo is reserved for brand identity, the application shell, attribution, and selected branded empty states.

### Avatars and speaker imagery

- Admin avatars are circular.
- Speaker cards on public pages may use circular or softly rounded portraits.
- Headshots should use consistent crops, neutral backgrounds, and accessible fallback initials.
- Do not stylize user photos with nautical frames or compass overlays.

## Components

### Brand lockups

- Use the horizontal logo lockup in desktop navigation, marketing headers, and collateral.
- Use the stacked lockup only where vertical space is intentional.
- Use the mark alone for the app icon, favicon, compact rail, and approved branded badges.
- Maintain clear space of at least one central podium width around the mark.
- On light surfaces use Indigo artwork; on Indigo surfaces use the approved white/reversed artwork.

### Navigation

The organizer sidebar is a dark Indigo anchor. Active items use the lighter `nav-active` surface and white text. Inactive items remain white at reduced emphasis, never low-contrast gray.

Navigation groups use clear labels such as:

- Event
- Submissions
- Review
- Scheduling
- Communications
- Settings

The speaker portal should expose fewer choices: Dashboard, Submissions, Tasks, Messages, Session, and Resources.

### Buttons

- **Primary:** Steel Blue fill, white text. One visually dominant primary action per panel or page region.
- **Secondary:** White surface, Steel Blue text, 1px Steel Blue or outline border.
- **Ghost:** Text-and-icon action for low-priority controls.
- **Destructive:** Red only for irreversible actions.
- **Success:** Green may be used for explicit completion actions, but do not make every positive CTA green.

Button labels use verbs and remain specific. Prefer `Publish agenda` over `Continue`, and `Resolve conflict` over `Fix`.

### Inputs and forms

- Labels sit above fields.
- Required status is explicit and not communicated by color alone.
- Helper text appears below the field.
- Validation occurs inline and preserves entered data.
- Multi-step submission forms show progress and allow saving.
- Form builders use a clear canvas plus a restrained inspector, not nested card stacks.
- File upload areas clearly show type, size, upload progress, replacement, and failure state.

### Tables and queues

Tables are the primary pattern for submissions, review assignments, sessions, speakers, communications, and audit history.

- Keep the identifying title column prominent.
- Use status pills with text and color.
- Allow filtering, sorting, bulk selection, export, and saved views where appropriate.
- Row actions live in a trailing menu; the most common action may be visible.
- Preserve column alignment across loading and empty states.
- Long titles wrap to two lines before truncating.
- Submission titles and IDs link to stable proposal permalinks that can be shared in committee messages.
- Review queues default to the reviewer's assigned tracks rather than individually assigned proposals.
- If ratings are present, prioritize `Fewest ratings` for coverage work and `Average score` for decision-meeting order.

### Summary metrics

Metric cards should answer operational questions, not decorate a dashboard. Typical metrics include total submissions, under review, accepted, ready to schedule, conflicts, missing information, incomplete speaker tasks, and upcoming deadlines.

Use one large number, a concise label, and optionally one comparison or action. Avoid gratuitous charts. A trend chart is appropriate only when time-series information changes a decision.

### Status badges

Status names should be stable and explicit. Recommended vocabulary:

- Draft
- Open
- Submitted
- Under review
- Revision requested
- Accepted
- Declined
- Withdrawn
- Ready to schedule
- Scheduled
- Conflict
- Missing information
- Complete

Use pale containers with dark semantic text. Pair warnings and conflicts with an icon.

### Review workspace

- Treat each proposal as one durable conversation surface with a stable permalink.
- Show the full proposal, speaker context, committee notes, and internal decision together.
- Make the active submission and current reviewer identity clear.
- Keep `approve / maybe / deny` lightweight and reversible during deliberation.
- Never imply that changing an internal decision sends email to the speaker.
- Ratings are optional. When present, show coverage count and average without overpowering written reasoning.
- Do not introduce bidding, blind rounds, assignment matrices, or academic-review ceremony without explicit product scope.

### Schedule builder

The schedule builder is a grid organized by time, room, and track.

- Session blocks use pastel track colors with dark text.
- Show session title, speaker, duration, and room at useful zoom levels.
- Dragging displays a clear source, destination, and valid drop target.
- Conflicts appear immediately and identify the exact speaker, room, track, or time issue.
- The inspector edits session details without leaving the schedule.
- Provide agenda, day, track, and room views without changing the underlying information model.
- Keep an obvious unplaced-session pool and allow room, time, or exact placement to remain `TBD`.
- Save partial placement and known conflicts. Never require a false value merely to satisfy the interface.
- Show compact live math such as `3 unplaced · 1 conflict`.

### Conflict alerts

Conflict panels use the error container only for the affected records, not the entire screen. Present:

1. What conflicts.
2. Where and when it conflicts.
3. Why it matters.
4. The available resolution paths.

Suggested actions include `Find another time`, `Move room`, `Keep this session`, and `Open speaker schedule`.

Conflict alerts inform and assist; they do not block saving. A named warning chip or inline panel is preferable to a modal interruption.

### Speaker portal

The speaker portal should feel guided rather than administrative.

The default dashboard includes:

- Task count and completion progress.
- Next deadline.
- Submission or acceptance status.
- Session details.
- Messages and reminders.
- Resource links.

Tasks use clear verbs, deadlines, and completion states. The portal must support profile editing, biography, headshot, social links, materials upload, agreements, calendar invitations, and organizer communication.

The organizer view of onboarding should emphasize the chase: who is missing what, how late it is, the last contact, and the next useful action. Co-speaker details and employer approval may appear as explicit readiness tasks or flags. Assisted message drafts must remain editable and require a human send action.

### Public agenda and speaker lineup

- Public pages prioritize event identity while preserving ChartStead structure.
- Agendas offer day, track, type, room, and speaker filters.
- Session detail pages include time, room, track, description, speakers, and add-to-calendar or personal-agenda action.
- Speaker lineup cards use consistent portraits and minimal metadata.
- Embedded agendas must be responsive and visually neutral enough to sit inside another website.

### Email and calendar surfaces

Emails inherit event branding in the header and ChartStead structure in the body. Use one clear action, explicit deadlines, and plain-language status. Review notifications should include enough proposal context and a direct permalink to act without navigating from a generic dashboard.

Internal decision state and speaker communication state are separate. Show draft, queued, sent, delivered, and failed communication states independently from approve/maybe/deny. Confirmations may send automatically; acceptance, denial, and escalation sends require deliberate organizer action. Calendar invitations may be created before room assignment and updated later; the UI must make pending location status clear and preserve one stable UID throughout the invitation lifecycle.

### Empty, loading, and error states

- Empty states explain why the page is empty and give the next useful action.
- Loading uses skeletons that preserve final layout dimensions.
- Errors preserve user input and provide recovery steps.
- Nautical language may appear in a short empty-state line, but never obscure the actual action required.

## Do's and Don'ts

### Do

- Do use the exact approved compass-and-podium logo; use no substitute marks.
- Do pair the name with **“Conference programming and speaker management.”** on first exposure.
- Do make deadlines, conflicts, review states, and incomplete tasks visually obvious.
- Do use tables and rows for operational work and cards for summaries or grouped context.
- Do reserve Steel Blue for meaningful interaction and Success Green for positive state.
- Do keep navigation, controls, and status language consistent across organizer and speaker surfaces.
- Do provide text and icon cues in addition to color.
- Do maintain WCAG AA contrast, visible keyboard focus, and 44px touch targets.
- Do let event branding influence public surfaces through a controlled theme layer.
- Do use subtle nautical-chart linework on broad, quiet surfaces.
- Do show realistic data density in product mockups; ChartStead is serious operational software.
- Do preserve partial work, stable permalinks, and visible communication state.
- Do surface conflicts and missing information without blocking an operator from recording the current truth.

### Don't

- Don't create alternate logos, `CS` or `CE` monograms, bar-chart marks, line-chart marks, flags, lighthouses, sailboats, map pins, or calendar-based brand marks.
- Don't redraw the approved logo from an icon library or simplify away the podium.
- Don't use the compass logo as a routine utility icon throughout the product.
- Don't make the UI look like analytics software merely because the word “Chart” appears in the name.
- Don't overuse anchors, waves, ropes, maritime illustrations, or nautical puns.
- Don't use generic AI gradients, neon glows, glassmorphism, or futuristic “agent” aesthetics.
- Don't create a wall of oversized rounded cards where a table or list would scan better.
- Don't use gradients in core product controls or status indicators.
- Don't use Success Green for ordinary navigation or default primary buttons.
- Don't hide essential information in hover-only interactions.
- Don't abbreviate status language or use unexplained event-industry jargon.
- Don't make the organizer application inherit an event theme so heavily that it stops feeling like ChartStead.
- Don't copy AI Engineer's visual identity into the permanent product brand; apply it only as a configurable event theme where appropriate.
- Don't send speaker decisions as a side effect of changing an internal review status.
- Don't force rooms, times, or conflict resolution before a draft schedule can save.
- Don't hide consequential automated actions behind vague labels such as `Continue` or `Done`.
