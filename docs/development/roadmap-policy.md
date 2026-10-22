---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Roadmap and edition-scope pointer.

# Roadmap Steering Pointer

## Document Role

This document governs how roadmap and scope documents constrain Quest authoring
and implementation without replacing the Solver.

Use this file for:

- roadmap scope and sequence authority;
- AGPL scope and implementation-home checks;
- readiness rules for starting implementation from roadmap rows;
- deciding whether a Quest is in scope.

Do not use this file for:

- Quest attempt logs or terminal reports;
- system behavior rules;
- testing policy;
- style guidance;
- current subsystem owner maps.

The canonical AGPL feature sequence and scope map lives at
[`agpl-feature-map.md`](agpl-feature-map.md).

Human-readable product direction lives at [`../../roadmap.md`](../../roadmap.md).
Cross-edition visibility lives at
[`../development/product-roadmap.md`](../development/product-roadmap.md).
Edition ownership and implementation-home rules live at `../../edition-matrix.md`.

Use these documents as follows:

- `agpl-feature-map.md` constrains allowed AGPL feature scope and broad
  sequencing. It does not by itself prove a Quest is SOLVED.
- `../../roadmap.md` communicates product direction to humans and must not be
  used as implementation-scope authority.
- `../development/product-roadmap.md` is visibility-only and must not be used
  as an implementation source here.
- Any feature whose `Implementation home` is not `AGPL repo` in
  `../../edition-matrix.md` is out of scope for implementation in this
  repository unless the user explicitly asks for AGPL-scoped preparatory work.

## Document Authority Map

This map mirrors `AGENTS.md`; `AGENTS.md` is authoritative for the steering load
order. The table below assigns ownership of document *classes*, not boot sequence.

Use repository documents according to this ownership split:

| Document class | Canonical location | Primary concern |
| --- | --- | --- |
| Cross-cutting invariants | `docs/steering/rules.md` | The rules an agent can violate merely by not knowing them |
| Owner of any other concern | `docs/steering/router.md` | Turns a concern into the path that holds its detail |
| Runtime contract detail | `architecture/runtime-contracts.md` | Control-plane, cache, metadata, pressure, and transport rules |
| Workflow contract detail | `docs/steering/workflow-guidelines/solver-quests.md` | Quest workflow |
| Stable testing policy | `test/guidelines/INDEX.md` | Durable repo-wide testing rules |
| Style and lint | `docs/development/code-style.md` | Formatting, lint, and local coding style |
| Architecture entrypoint | `architecture/INDEX.md` | Canonical architecture entrypoint and subsystem detail |
| Human roadmap | `roadmap.md` | Public Now / Next / Later product direction |
| AGPL feature map | `docs/development/agpl-feature-map.md` | Allowed feature scope and broad sequence |
| Visibility roadmap | `docs/development/product-roadmap.md` | Cross-edition status only |
| Scope matrix | `edition-matrix.md` | Edition and implementation-home mapping |
| Quest definitions | `solve/quests/<id>/quest.json` | Bounded statement, sealed `doneWhen`, scope and constraints |
| Current milestone index | The active epic's current summary | Links to current work, contracts, blockers and immutable evidence |
| Workstream-local procedure | `solve/specs/*`, `test/*.local.md` | Thresholds, scripts, checklists, local proof detail |

## Quest Intake And Execution Flow

Route work through the smallest sufficient planning surface:

1. If the request changes product scope, feature sequence, or edition ownership,
   sharpen `agpl-feature-map.md` or `../../edition-matrix.md` first. Update the
   human roadmap in the same change when its public milestone narrative changes.
2. Use an existing active epic for milestone scope, sequence and coordination.
   A Quest names its owning epic unless it is a standalone `class: fix`; a fix
   needs no new epic merely for status. Approved contracts live in their spec or
   architecture owner rather than being duplicated in the epic summary.
3. Apply the Quest threshold in `AGENTS.md`: work likely to need more than one
   measured attempt or to change an owner boundary creates or selects a Quest.
   Only a single-sitting change with an obvious proof may remain direct.
4. A Quest must cite or encode enough scope context to prevent local invention.
5. Quest implementation begins after the bounded statement, binary `doneWhen`,
   authorized scope, constraints and required evidence are clear and the Quest
   is sealed against a measured red probe.
6. Quest completion is claimed only from the Solver terminal state and its
   evidence. A generated report is an optional human-readable projection of
   that state, not a completion prerequisite.

`docs/` holds documentation, never active work definition: user/operator-facing
docs, the agent steering tree under `docs/steering/`, and internal engineering
plans. Bounded active work is defined under `solve/quests/`; milestone scope and
coordination live in the owning active epic under `solve/epics/`.

## AGPL Preparatory Work

Shared substrate work may happen in this repository only when all of the
following are true:

1. The implementation home remains `AGPL repo`, or the user explicitly asks for
   AGPL-scoped preparatory work only.
2. The work does not implement paid-only behavior, paid-only operator flows, or
   paid-only control surfaces in this repository.
3. The work remains consistent with the scope and sequence in
   `agpl-feature-map.md` and the edition ownership in `../../edition-matrix.md`.

Architecture documents may mention Pro or Enterprise services only as examples
of external consumers of AGPL substrate. Such examples must not define
implementation tasks in this repository unless the active Quest explicitly
limits the work to AGPL-owned substrate and excludes paid-only behavior,
operator flows, and control surfaces.

## Readiness To Start Work

Before implementation tasks begin from a roadmap row:

1. The row must be in scope for this repository under the repo-root `edition-matrix.md`.
2. Broad rows must gain a linked spec or architecture document before active
   implementation starts.
3. A row may move to active implementation only when the intended behavior is
   sharp enough to produce a sealed `doneWhen`.
4. The Quest must name the roadmap row, approved maintenance scope, or explicit
   user request that makes it valid.

## Roadmap State Policy

Roadmap state is scope and sequence metadata. It is not Solver evidence.

Required workflow:

1. Treat `agpl-feature-map.md` as the stable AGPL feature map: row presence and
   row order constrain what can be scoped in this repository.
2. Treat `solve/quests/` and its retained evidence as active execution truth;
   the active epic's current summary indexes them without replacing them.
3. A roadmap row marked available means the capability exists at roadmap scope;
   it does not mean every related Quest is SOLVED.
4. If implementation proves a roadmap row is absent, overbroad, out of AGPL
   scope, or ordered incorrectly, classify that as a roadmap correction and fix
   the row.
5. Roadmap corrections discovered during implementation should land with the
   Quest changes that discovered them. Do not leave truth repair as chat-only
   memory.
6. Do not use roadmap state to claim Quest closure. Closure requires Solver
   terminal evidence.

## Choosing The Service Milestone

The active epic names the representative public service outcome, supported
configuration, required failure domains and evidence that would establish it.
For the stable core, preserve the distributed public service through the supported
WASI service path. A local substitute cannot certify that outcome.

Choose the smallest useful configuration already supported by the product. If
reducing scope is proposed, compare evidenced estimates and observed costs of
completing the behavior with excluding it safely. Safe exclusion covers every public ingress,
admission before work starts, internal and background producers, and retained
durable obligations and recovery. Hiding one API or flag is insufficient. Do not
create a new stabilization runtime, selector or compatibility path to organize
the work. A change to promised product scope or guarantees needs the user's
decision; routine sequencing within approved scope does not.

Use the completion levels in
[`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md): a bounded
repair, a representative service milestone and full stable-core/release
acceptance have separate evidence. A repair may finish while the service remains
blocked elsewhere. Its terminal report names the remaining blocker and next
owner; it does not claim the broader milestone or absorb unrelated work.

Separate standing policy from initial operating heuristics and hypotheses.
Existing correctness, scope, authority, review and release requirements are
binding. Work-in-progress limits and an approximately ten-working-day evaluation
window are initial heuristics to adjust from evidence, not shipping promises or
automatic gates. The belief that a particular process change removes the
bottleneck is a hypothesis: measure it on one recent or current cycle using
existing diagnosis, review, queue, result, integration and context-recovery
records. Reassess after the first representative run, then at that evaluation
window; do not build a new metrics platform or force a redesign on a date.

## Feature Flag Lifecycle

A feature flag (e.g. a `LAGRANGE_*` lever) is a within-session validation
scaffold only — NO flag survives the session that lands it (user directive
2026-06-26, re-affirmed 2026-07-02). Before the landing session ends, the flag
MUST be resolved: validate the change (deterministic red-on-revert proof plus
necessary native or physical evidence under the testing owner; a statistical
gate only for an irreducibly statistical claim) and bake the behavior in
unconditionally with the flag deleted, or revert the functionality together with
the flag. There is no multi-session promote-or-retire regime. Tests never pin a
flag (see [`test/guidelines/fixtures.md`](../../test/guidelines/fixtures.md)
"No Flag-Coupled Tests").

A flag that preserves old behavior as the live default while a new mechanism sits
dormant is an unfinished cutover (see [`rules.md`](../steering/rules.md) R01),
not a building block. Flags inherited from before this rule are recorded debt,
not license: retire or promote each one on contact (when other work touches its
area) or in a dedicated cleanup Quest. There is no automated flag-audit script,
so this cleanup must be performed deliberately, not assumed.

## Audit Procedure

Use the existing checks to validate the coordinated active instruction surface:

```sh
npm run audit:rule-set
npm run audit:steering-diet
npm run audit:roadmap-authority
npm run audit:doc-audience
npm run audit:documentation-current
npm run steering:generate
```

Review generated changes with their producers, then use `npm run steering:check`
against the committed candidate. These structural checks complement independent
coverage and contradiction review; they do not certify runtime capabilities.
