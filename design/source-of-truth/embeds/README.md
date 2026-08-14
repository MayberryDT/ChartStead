# Public embed visual source of truth

**Status:** Locked selections (2026-08-14)

These five images are the visual implementation source of truth for ChartStead’s attendee-facing embeds. They lock the composition, information hierarchy, density, and visual character of each embed type.

| Embed type | Locked direction | Reference |
| --- | --- | --- |
| Sessions List | Direction 05 — Atlas Modules | [`sessions-list.png`](sessions-list.png) |
| Speakers List | Direction 05 — Atlas Modules | [`speakers-list.png`](speakers-list.png) |
| Agenda | Direction 05 — Atlas Modules, with the top-left “ChartStead Agenda” control removed | [`agenda.png`](agenda.png) |
| Schedule Itinerary | Direction 04 — Indexed Folio | [`schedule-itinerary.png`](schedule-itinerary.png) |
| Speaker Gallery | Direction 03 — Signal Rail | [`speaker-gallery.png`](speaker-gallery.png) |

## Implementation contract

1. Match the selected reference’s layout, hierarchy, density, spacing, and interaction placement; do not blend unselected directions into it.
2. Apply the tokens and accessibility rules in [`../../DESIGN.md`](../../DESIGN.md). The images are compositional truth, not permission to invent new tokens.
3. Use the approved ChartStead brand assets from [`../../assets/brand/`](../../assets/brand/). Any generated mark, imperfect microcopy, or incidental icon rendering in these raster concepts is non-authoritative.
4. Preserve the existing widget semantics, revision behavior, filtering, field visibility, feed behavior, and public-safe data contract. Static images do not add product behavior.
5. Responsive and empty/loading/error states must be derived from the selected composition while meeting the written design system and 44px target requirements.
6. The Agenda reference intentionally has no top-left “ChartStead Agenda” control. Do not restore it during implementation. The top-right itinerary action and compact footer attribution remain part of the direction.

## Scope boundary

These files govern the five public embed renderers. They do not redefine the organizer Embeds manager workspace, whose desk treatment remains governed by the organizer source of truth and ticket 40’s manager direction.
