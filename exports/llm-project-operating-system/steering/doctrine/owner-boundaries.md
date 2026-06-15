---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/architecture.md
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-05-23
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

> **Canonical source.** Doctrine sub-file: owner boundaries. Index: [`INDEX.md`](INDEX.md).

# Doctrine — Owner Boundaries

## 1. One Semantic Owner Per Concern

Every durable concern must have one semantic owner.

- Session lifecycle has one owner.
- Cache invalidation has one owner.
- Background-job scheduling has one owner.
- Shared metadata record lifecycle has one owner.

Callers submit intent to the owner. Callers do not reproduce the owner's logic
locally, and callers do not keep shadow state for the same concern.

## 6. Shrink The Boundary When Bugs Cluster

When multiple bugs appear at the same boundary, assume the boundary is wrong
until proven otherwise.

Examples of a boundary:

- metadata mutation ingress
- metadata read ingress
- bootstrap-to-runtime handoff
- change-feed dissemination
- readiness classification
- transport admission

After repeated bugs at one boundary, the next fix must reduce the number of
paths, states, or owners that can cross it. Do not keep patching symptoms while
leaving the boundary porous.

## 14. Shared Surfaces Must Name Consumers

If a runtime surface is shared across owners or layers, the design is not done
until its consumer contract is explicit.

Prefer:

- one named operational authority surface
- observed or retained views only when their roles are explicit
- one declared consumer set per shared surface
- one declared list of forbidden reinterpretations

Do not let diagnostics views, retained owner state, bootstrap-normalized
ingress state, or cache-local observations drift into a second operational
authority by convention.

## 17. Quest Execution Has One Current Boundary

An active Quest may have several frontiers, but each attempt must start from one
selected frontier and one semantic owner boundary.

Prefer:

- one current frontier
- one canonical blocker derived from the latest probe artifact
- one semantic owner and owner boundary
- one smallest focused proof surface before broad reruns
- one integrated handoff from delegated findings back into the Quest log

Do not let old migration history or several optional delegated findings create
competing active interpretations of the same blocker.

If a fresh artifact changes only counts, nodes, epochs, or timing while the
same owner boundary still dominates, continue the current frontier. If the
semantic owner, owner boundary, or next required action changes, record a
finding and add or author the frontier that owns the new boundary.

Optional real sub-agents should accelerate this sequence, not replace it.
Closure still depends on Solver measurement and report state. Use an optional
review role for the most recently executed attempt on the same owner boundary.
If that review finds closure, evidence, residual, guardrail, or snapshot
problems, fix those problems before claiming SOLVED. Parent-session notes,
local/manual labels, arbitrary text, and real agent ids are provenance only.

The normal sequence is:

1. review the last attempt when needed
2. fix review findings if any
3. extract current artifact truth
4. map the owner path or focused proof surface
5. execute one bounded attempt
6. rerun the focused proof
7. commit the attempt with `node tooling/solve.js step --commit`
