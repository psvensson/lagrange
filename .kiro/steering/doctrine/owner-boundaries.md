---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/architecture.md
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Doctrine sub-file: owner boundaries. Index: [`INDEX.md`](INDEX.md).

# Doctrine — Owner Boundaries

## 1. One Semantic Owner Per Concern

Every durable concern must have one semantic owner.

- Node lifecycle has one owner.
- Replica lifecycle has one owner.
- Topology workflow state has one owner.
- Shared metadata row lifecycle has one owner.

Callers submit intent to the owner. Callers do not reproduce the owner's logic
locally, and callers do not keep shadow state for the same concern.

## 6. Shrink The Boundary When Bugs Cluster

When multiple bugs appear at the same boundary, assume the boundary is wrong
until proven otherwise.

Examples of a boundary:

- metadata mutation ingress
- metadata read ingress
- bootstrap-to-runtime handoff
- CDC dissemination
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

## 17. Sprint Execution Has One Current Boundary

An active sprint may have a long history, but execution must start from one
current blocker snapshot.

Prefer:

- one current representative package
- one canonical blocker derived from the latest artifact
- one semantic owner and owner boundary
- one smallest focused proof surface before broad reruns
- one integrated handoff from execution-role evidence and any optional
  delegated findings back into the package

Do not let old migration history, stale residual packages, or several optional
delegated findings create competing active interpretations of the same blocker.

If a fresh artifact changes only counts, nodes, epochs, or timing while the
same owner boundary still dominates, continue the current package. If the
semantic owner, owner boundary, or next required action changes, split or
activate one new representative package and make the old boundary historical.

Optional real sub-agents should accelerate this sequence, not replace it.
Closure still depends on checked `implementation` and `verification-fix` roles.
Use an optional review role for the most recently executed package on the same
sprint or owner boundary. If that review finds closure, evidence, residual,
guardrail, or snapshot problems, fix those problems before new implementation
begins. Parent-session notes, local/manual labels, arbitrary text, and real
agent ids are provenance only. When delegation is unavailable or intentionally
not used, record `human-waived`, `tool-unavailable`, or
`blocked-by-environment-policy` with a reason instead of inventing an agent id.

The normal sequence is:

1. review the last package when needed
2. fix review findings if any
3. extract current artifact truth
4. map the owner path or focused proof surface
5. run the `implementation` role with bounded file ownership
6. run the `verification-fix` role and focused proof
7. commit and push the focused package slice with Commit And Push Ledger proof
