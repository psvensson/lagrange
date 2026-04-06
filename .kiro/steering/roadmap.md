# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents are used during
implementation work.

Use this file for:

- implementation-driving roadmap authority
- AGPL scope and implementation-home checks
- readiness rules for starting work from roadmap rows

Do not use this file for:

- system behavior rules
- testing policy
- style guidance
- current subsystem owner maps

The canonical AGPL implementation roadmap lives at `../../roadmap.md`.

Cross-edition visibility lives at `../../product-roadmap.md`.
Edition ownership and implementation-home rules live at `../../edition-matrix.md`.

Use these documents as follows:
- `../../roadmap.md` is the only roadmap that may drive specs, tasks, or code
  in this repository.
- `../../product-roadmap.md` is visibility-only and must not be used as an
  implementation source here.
- Any feature whose `Implementation home` is not `AGPL repo` in
  `../../edition-matrix.md` is out of scope for implementation in this
  repository.

## Document Authority Map

Use the repository documents according to this ownership split:

| Document class | Canonical location | Primary concern |
| --- | --- | --- |
| Implementation doctrine | `.kiro/steering/doctrine.md` | Short repo-wide architectural intent |
| Stable implementation rules | `.kiro/steering/system guidelines.md` | Durable repo-wide coding rules |
| Stable testing policy | `.kiro/steering/testing-guidelines.md` | Durable repo-wide testing rules |
| Style and lint | `.kiro/steering/code-style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture.md` | Current subsystem owner maps and data flow index |
| Architecture support docs | `architecture/*.md` | Current concrete owner maps and subsystem detail |
| Implementation-driving roadmap | `roadmap.md` | Allowed implementation scope and status |
| Visibility roadmap | `product-roadmap.md` | Cross-edition status only |
| Scope matrix | `edition-matrix.md` | Edition and implementation-home mapping |
| Workstream-local procedure | `.kiro/specs/*`, `test/*.local.md` | Thresholds, scripts, checklists, local closure flow |

## AGPL Preparatory Work

Shared substrate work may happen in this repository only when all of the
following are true:

1. The implementation home remains `AGPL repo`, or the user explicitly asks for
   AGPL-scoped preparatory work only.
2. The work does not implement paid-only behavior, paid-only operator flows, or
   paid-only control surfaces in this repository.
3. The work remains consistent with `../../roadmap.md` and
   `../../edition-matrix.md`.

## Readiness To Start Work

Before implementation tasks begin from a roadmap row:

1. The row must be in scope for this repository under
   `../../edition-matrix.md`.
2. Broad rows must gain a linked spec or architecture document before active
   implementation starts.
3. A row may move to active implementation only when the intended behavior is
   sharp enough to produce tasks without inventing scope locally.

## Audit Procedure

Use these repository-root checks to confirm the steering stack still has one
doctrine path and one owning document per rule class:

```sh
rg -n --glob '*.md' '`doctrine\\.md`' .kiro/steering
rg -n --glob '*.md' '\\.kiro/steering/doctrine\\.md' .kiro/steering
rg -n --glob '*.md' '^## Document Role$' .kiro/steering
```

Expected result:

1. Short-name doctrine references return zero hits in steering Markdown.
2. Canonical `.kiro/steering/doctrine.md` references remain.
3. Every steering Markdown file carries a `Document Role` header.
