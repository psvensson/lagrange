---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/architecture.md (complete architecture domain pack)
parent_index: ../doctrine/INDEX.md
last_reviewed: 2026-08-22
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

Introducing a new owner is a cutover, not an addition: the prior authority for that
concern must be retired in the same body of work. A new owner left running alongside
the old path it was meant to replace is an unfinished cutover, not a second owner —
record it as incomplete, never as done.

A recorded-incomplete owner of exactly this kind currently exists: the
`partitions.leader_node_id` / `message_groups.leader_node_id` rows in
[`../runtime-contracts.md`](../runtime-contracts.md) have a canonical owner *row*
but no named writer *component* yet. That is a known gap tracked under this rule,
not a §1 exception.

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

This rule pairs with — and is distinct from — single-path §11b ("One Contract
Shape Per Concern", see [`single-path.md`](single-path.md)). §14 governs naming
the *consumers* of a shared surface; §11b governs keeping one *contract shape*
(schema/version) per concern. They are two rules, not one; consult both when a
shared surface changes.

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

Sub-agents are optional for research, implementation, and additional attempt
review; they should accelerate this sequence, not replace it. Independent
subagent verification is mandatory only at the explicit workflow boundaries
that require it: adversarial vetting before a non-trivial hypothesis or lever is
presented, and content-bound verification before source checkpoint or terminal
handoff. Closure still depends on Solver measurement and terminal state. If any
review finds closure, evidence, residual, guardrail, or snapshot problems, fix
those problems before claiming SOLVED. Parent-session notes, local/manual
labels, arbitrary text, and real agent ids are provenance only.

The normal sequence is:

1. review the last attempt when needed
2. fix review findings if any
3. extract current artifact truth
4. map the owner path or focused proof surface
5. execute one bounded attempt
6. rerun the focused proof
7. commit the attempt with `node scripts/solve.js step --commit`

## 18. Interactions Between Owners Are Owned Contracts

A seam where two owners meet is itself a concern, and it must have one owner
and one checked artifact. The signature of an unowned interaction is every
per-owner seal green while the composition deadlocks or diverges: false
terminals on store divergence, a detector wired to no cure, two writers
sharing a tolerance only one honors, a hold deferring the cure its own policy
documents. Fixing such a bug purely inside one participant leaves the
interaction implicit, and the failure ping-pongs to the adjacent owner (§16
records that migration; this rule prevents the next one).

The contract layer for interactions already exists. Search it before writing
code, argue the change against it, and extend it in the same body of work:

- **Decision tables** — `docs/specs/decision-tables/*.json`
  (`npm run model:decision-tables`): each names an `owner`, a `boundary`, and
  `invariants` for one cross-input decision. Any change to a hold, fence,
  admission lane, cure classification, or observation authority starts here;
  the table is where the argument is settled (e.g.
  `operation-ledger-hold-engagement.json` invariant `cure-stays-admissible`).
- **Model checks** — `models/` indexed by `models/CL-INDEX.md`: design-class
  liveness bugs (circular dependencies, lost wakeups, holds without release)
  are proven by a TLC bug/fixed config pair, never by scenario reruns alone.
- **System contracts** — `architecture/contracts/`
  (`npm run model:contracts`), including the liveness contracts.
- **Coupled-pair registry** — `coupledPairs` in
  `test/shards/impact-contracts.json`: a change crossing both endpoints of a
  registered pair must carry the pair's complete contract edge (named
  contract plus witness tests) before landing, and a one-endpoint change
  pulls the opposite endpoint's witness tests into its proof cone.
- **Closure-record and theory history** — CL records (e.g. CL-013 cure and
  exemption classes, CL-001 variant D detection-to-cure wiring) and the quest
  theory ledger carry the precedents for each interaction class.

When fixing a bug at a seam between owners:

1. Name the interaction and locate its artifact; if none exists, authoring one
   — owned by the component that decides — is in the fix's scope.
2. Argue the fix against the artifact's invariants and extend the artifact in
   the same change, never afterwards.
3. Hold every gate to the default liveness invariant: **an engaged hold, gate,
   or fence must have a reachable release path** — an admissible move class, a
   disengagement condition, or a bounded escalation releases it. A gate that
   defers its own cure violates this rule even when every row of its matrix is
   individually justified.

A Quest whose scope crosses owners must seal the interaction artifact as a
closure requirement, not only the code change.
