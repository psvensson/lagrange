# Work Intake And Package-Driven Steering

## Why

The repository needed one simple, explicit workflow for turning human ideas
into implementation work without letting planning scatter across `docs/`,
chat-only decisions, or parallel tracking systems.

## Scope Basis

Repository maintenance and steering-process cleanup within the existing AGPL
implementation workflow.

## In Scope

1. Reserve `docs/` for end-user and operator-facing documentation.
2. Introduce `work/` as the canonical home for ideas, work packages, and
   sprint grouping.
3. Encode the workflow in steering docs so future changes are driven through
   the same path.

## Out Of Scope

1. Changing product scope in `roadmap.md`.
2. Rewriting archived specs or legacy historical process documents.
3. Adding a second backlog or status system.

## Invariants

1. The implementation-driving roadmap remains `roadmap.md`.
2. Steering docs remain the durable source of repo-wide process rules.
3. Filename status remains the only status model for work packages.

## Hotspots

1. `.kiro/steering/roadmap.md`
2. `.kiro/steering/system guidelines.md`
3. `.kiro/steering/doctrine.md`
4. `.kiro/steering/testing-guidelines.md`
5. `work/`

## Validation

1. Steering docs reference the `work/` workflow consistently.
2. The systemic simplification plan no longer lives under `docs/`.
3. `work/` contains the expected `ideas`, `packages`, `sprints`, and
   `templates` layout.

## Outcome

Completed. The steering stack now defines:

1. Idea intake through `work/ideas/`.
2. Triage into roadmap sharpening or direct work packages.
3. Active implementation from `work/packages/active-...`.
4. Completion by renaming to `done-...`.
