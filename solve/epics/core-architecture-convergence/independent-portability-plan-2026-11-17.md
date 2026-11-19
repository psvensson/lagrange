---
audience: development
documentClass: planning
---

# Independent implementation portability — approved plan

Status: **approved planning direction; Q0 read-only inventory in progress**.
Decision date: 2026-11-17. Initial audit baseline: `main` at
`f3a1be1eb79e5e6347ddc969968036eda49dcaf2`.

This plan belongs to [Core architecture convergence](../core-architecture-convergence.md).
It is not a second epic, runtime architecture, capability ledger, release gate,
or supersession of an existing Quest's sealed acceptance. Its initial findings
are in [the Q0 inventory](independent-portability-q0-inventory-2026-11-17.md).
The integration owner must re-check current Solver status and predecessor
certification before assigning behavior-changing work; a landed cutover is not
by itself certified. Existing 0.4.1 correctness work and the 0.5 direction
retain their own scope and acceptance.

## Objective and exclusions

Objective: A competent second implementation team can reproduce the selected
Lagrange behavior using normative owner contracts, public interfaces, schemas,
models, and executable conformance vectors without needing to read `src/` or
invent semantic decisions.

The first target is **behavioral equivalence**, not same-disk migration or
mixed-implementation cluster participation. Exact byte compatibility is
necessary only where an intended shared representation or public protocol
requires it; private memory layout, classes, scheduling structures and internal
transport encoding are not portable requirements. Same-disk and mixed-node
compatibility require separate scope decisions and proof.

No new database, workflow engine, topology planner, transport owner, universal
epoch, metadata authority or test scheduler is authorized. Preserve the
existing `PartitionService` and Raft boundaries, committed `ConfState`,
`MovePlanner`, topology workflow owners, `MessageRouter`, `SqlCore`, and
Artifact/Binding/Cell model unless a bounded owner census disproves a boundary.
No legacy/fallback or dual-owner path is a portability target. Unsupported
behavior is explicitly refused or unavailable, not silently emulated.

## Where the definitions live

| Concern | Existing authoritative home | Portability action |
| --- | --- | --- |
| Product architecture and owner interactions | `architecture/INDEX.md`, `architecture/contracts/`, relevant subsystem documents | Extend the **existing owner contract**, never copy its normative decisions into this plan |
| Concrete implementation owner map | `architecture/current-owner-maps.md` | Keep implementation names as bindings, not language-neutral requirements |
| Module state/absence/decision template | `solve/specs/spec-led-runtime-modularization/module-contract-template.md` | Reuse for owner modules; add language-neutral vectors at the owning contract when needed |
| Public guest interface | `wit/world.wit`, `docs/reference/javascript-service-reference.md` | Define complete observable behavior and error taxonomy at its interface owner |
| Public SQL compatibility | `docs/postgres-compatibility-matrix.json`, `architecture/postgres-wire.md` | Derive conformance cases from supported and refused cells, not driver connection alone |
| Current implementation capability | `docs/current-capabilities.json`, checked-in source and original proof | Report verified implementation separately from target behavior |
| Formal evidence and acceptance | `models/`, `architecture/models/`, `test/`, Solver Quest records | Reuse model/checker/harness infrastructure; add independent black-box witnesses without a second acceptance ledger |
| Version scope and delivery | Existing roadmap, milestone and Epic/Quest owners | No automatic expansion of 0.4.1/0.5 or retroactive edits to sealed `doneWhen` |

The four cross-cutting *organizing principles* are immutable descriptors,
deterministic identities, canonical owner state, and SQLite/WAL/Raft durability.
They are not a mandate to implement four new subsystems. A formal failure
model must distinguish process crash, power loss, storage corruption, message
loss/duplication/reordering, clocks, quorum and liveness fairness assumptions.

## Ordered work packages (proposed, not pre-sealed Quests)

Only create/activate a bounded Quest after the previous observation identifies
its actual owner, first falsifier, write scope and a measuring red `doneWhen`.
The labels below are planning units; they are not new proof records.

### Q0 — Source-bound definition and authority census

- Read-only audit of canonical contracts, active work, generated/current claims,
  models and public interfaces on one exact source head.
- Classify each apparent mismatch as `current-document drift`, `version/target
  difference`, `genuine contract ambiguity`, `missing definition`, or
  `unverified`; do not decide runtime behavior from competing prose.
- Assign every high-risk missing answer to its **existing semantic owner**;
  identify the earliest coherent vertical slice and measurable red falsifier.
- Deliver one current inventory and Quest proposals; do not change `src/`,
  re-seal existing claims, run a live cluster, or claim certification.

**Q0 exit:** all questions blocking the first selected slice are assigned an
owner and an explicit resolution or typed hold, with evidence at a named source
commit. A fully source-verified verdict is not claimed by a document-only scan.

### Q1 — Canonical types, absence, identities and representations

Define for the chosen slice the exact types/ranges, `absent` versus
`unavailable` versus `unknown`, generation/term/epoch domains, routing-key
ordering, 64-bit integers, HLC and canonical JSON. Add representation vectors
only at cross-language or persisted boundaries. Acceptance requires a second
decoder/comparator to match positive and negative vectors without importing
runtime implementations.

### Q2 — Replicated write, acknowledgment and recovery

Specify the complete `CREATE TABLE -> write -> commit -> apply -> reply ->
crash -> recover -> read` journey, including Raft operation semantics,
persist-before-acknowledge, snapshots/replay, durable obligations and unknown
outcomes. Enumerate crash points, quorum and storage assumptions. Model and
falsify acknowledged-loss and false-acknowledgment safety properties.

### Q3 — Formation, topology and CDC

Specify bootstrap/join, exact-generation ADD/REMOVE/REPLACE, split/merge,
publication/readiness handoffs, cleanup authority and CDC occurrence ordering,
recipient progress, deduplication, gaps and replay. Conformance must prove that
stale projections cannot become authority and every recoverable hold retains a
canonical continuation within declared fairness conditions.

### Q4 — One TX1 protocol

Specify the exact participant manifest, PREPARE evidence and digest, durable
immutable decision, idempotent decision apply, unknown outcome reconciliation
and coordinator/participant crash recovery. Reuse the existing Raft-applied
outcome ledger and participant owners; no second transaction mechanism.

### Q5 — SQL and service API

Define the admitted SQL/refusal subset, WIT/host capability and error contracts,
immutable Binding behavior, multi-operation dispatch, `run`/`emit`/`reduce`,
partial ordering and bounds, cancellation, retry and idempotency. Existing
PostgreSQL matrix cells and public user journeys are the starting evidence,
not an automatic claim of implemented support.

### Q6 — Independent portability and maintenance proof

Compose existing conformance vectors into a black-box runner that does not
import production decision modules. Reuse the existing test/harness machinery,
lab scheduling and immutable exact-source evidence. First write a small
second-language state/codec implementation; require a physical three-node
second implementation only if later justified. Keep contract changes and
their invalidated fixtures/proofs together in future PRs.

**Q6 exit:** the selected behavioral scope can be implemented and tested from
the contract alone, including inverse negative cases and documented failure
assumptions. Same-disk/mixed-node portability is not implied.

## Per-package verification and landing

1. Record the first counterexample, actual owner, producer/consumer symbols,
   writable paths, base SHA, exclusions and proof scope in its existing Quest.
2. Freeze the owner transition before altering implementation; make the
   decision table total and preserve identity, deadline, absence and retained
   obligations through every adapter.
3. Include a positive vector, inverse negative control, and a failure/restart
   case where the contract demands one. Correctness tests come with the slice,
   not deferred until Q6.
4. Use static/docs-only checks for inert planning changes; deterministic owner
   tests for bounded semantics; independent review for source and operative
   proof changes; physical lab evidence for distributed service claims.
5. Keep original review and exact-candidate receipts, no fabricated success,
   no skipped gates, no separate capability ledger. Existing release/Quest
   acceptance is never silently widened.

## Stop conditions and decisions

- If the chosen owner contract is contradictory, resolve at that owner before
  implementation. Source behavior is evidence, not automatically the target.
- If mixed-node or same-disk compatibility is requested, stop and obtain a
  separate scope decision before specifying byte compatibility for private
  formats.
- If the predecessor Epic remains blocked or its readiness census is stale,
  Q0 planning may continue but behavior-changing convergence stays held.
- If an audit uncovers unrelated product bugs, record and route them; do not
  absorb them into portability work.

The test of completion is *independent reproducibility of selected behavior*,
not the number of new documents, modules, Quest records or passing source-only
unit tests.
