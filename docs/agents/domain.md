# Domain docs

How engineering skills should consume ChartStead's domain documentation.

## Before exploring

Read, when present:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If these files do not exist, proceed silently. Create them lazily through domain-modeling work when terminology or a durable architectural decision actually needs them.

## Layout

ChartStead uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

The existing product requirements remain canonical in `context.md`; a future uppercase `CONTEXT.md` is reserved for a concise domain glossary and ubiquitous language, not a duplicate requirements document.

## Vocabulary and decisions

- Use the canonical terms in `context.md` and any future `CONTEXT.md` in ticket titles, tests, APIs, and user-facing copy.
- If a needed concept is missing or overloaded, note the gap for domain modeling rather than inventing competing terminology.
- Surface conflicts with an existing ADR explicitly instead of silently overriding the decision.
