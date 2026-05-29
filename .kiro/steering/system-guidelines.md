---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/architecture.md
llm_load: represented_by_compact_packs
inclusion: represented_by_llm_core_and_architecture_pack
last_reviewed: 2026-05-23
---

> **Canonical source.** Generated packs at `.kiro/steering/llm/` derive rules from this file. Regenerate with `npm run steering:llm:pack` after edits.

# System Guidelines — Mandatory Implementation Contract

## Document Role

This file is one of the canonical *source* steering documents that the LLM
compact packs under `.kiro/steering/llm/` are generated from. It is **not** an
independent runtime override surface.

Steering precedence (mirrors `AGENTS.md` and `.kiro/steering/llm/boot.md`):

1. The compact packs under `.kiro/steering/llm/` are the runtime execution
   surface for LLM sessions.
2. Source steering files in this directory are consulted only to (a) chase
   cited detail behind a compact-pack rule, or (b) repair pack drift and
   regenerate the packs via `npm run steering:llm:pack`.
3. If a divergence exists between a compact pack and its source steering,
   fix the source, regenerate the packs, and re-validate. Do **not** treat
   the source as a parallel runtime contract that overrides the pack.

Use this file for:

- repo-wide hard stops
- ownership and single-path rules
- scalar, state, cache, communication, and pressure invariants
- closure expectations that apply to every non-trivial package

Use focused steering files for detail:

- [`doctrine.md`](doctrine.md): architectural intent behind these rules
- [`runtime-contracts.md`](runtime-contracts.md): detailed runtime,
  control-plane, data, cache, and transport contracts
- [`workflow-guidelines.md`](workflow-guidelines.md): package, sprint,
  sub-agent, causal-closure, guardrail, and roadmap-truth workflow
- [`testing-guidelines.md`](testing-guidelines.md): validation policy
- [`code-style.md`](code-style.md): formatting and lint policy
- [`roadmap.md`](roadmap.md): implementation scope and edition boundaries
- [`../../architecture/INDEX.md`](../../architecture/INDEX.md): canonical
  architecture entrypoint, current owner maps, and subsystem detail index
- [`../../architecture.md`](../../architecture.md): compatibility pointer for
  older links only
- [`../../work/README.md`](../../work/README.md): local work-tracker procedure

These rules are non-negotiable. The compact packs derived from this file
carry the same authority during a session; the detailed source files explain
proof and procedure but do not weaken this contract.

The system is called lagrange.

## Process Weight Gate

Use the lightest process lane that protects the owner boundary:

1. **Read/review/doc-only**: answer questions or edit explanatory docs. No work
   package is required unless implementation truth, roadmap scope/state, or
   architecture ownership changes.
2. **Lightweight maintenance**: use one focused package and focused proof. Do
   not require causal ledgers, representative reruns, or delegated role
   provenance unless runtime ownership or shared contracts can change.
3. **Runtime owner-boundary work**: use full package discipline with owner
   contract, static guardrails, focused owner tests, affected consumers, and
   package closure proof.
4. **Scenario or release-gate work**: use full scenario discipline with
   checked implementation and verification-fix role evidence, causal closure
   ledger, missing-edge probe, representative proof, and blocker-migration
   notes.

When unsure, choose the heavier lane only if runtime ownership, shared
contracts, or representative scenario evidence can change.

## 1. Work Starts From One Bounded Package

All non-trivial implementation work MUST follow the repository work-tracking
workflow.

Required contract:

1. Human ideas start in `work/ideas/`.
2. Broad or scope-changing work sharpens `../../roadmap.md` before code.
3. Bounded implementation work runs from one active package in `work/packages/`.
4. One work package owns one executable concern, one primary owner boundary,
   and one focused proof surface.
5. Package status lives in the filename: `idea-`, `todo-`, `active-`,
   `done-`, or `superseded-`. Do not create a second status system.
6. `docs/` is reserved for end-user or operator-facing documentation. Internal
   planning and package execution live under `work/`.
7. The model ledger is advisory only for model, reasoning-effort, and
   output-profile choice. It never replaces validation, review sub-agents,
   package sequencing, closure proof, or focused commits.
8. Completed package slices are renamed to `done-...`, committed, and pushed as
   focused slices before the next package starts.

See [`workflow-guidelines.md`](workflow-guidelines.md) for closure, residual,
sub-agent, causal-ledger, and commit-and-push detail.

## 2. One Semantic Owner Per Concern

Every state transition, lifecycle decision, data transformation, cache view,
diagnostic grammar, and runtime resource MUST have one semantic owner.

Required contract:

1. Search before adding a function, helper, field, state value, cache, snapshot,
   queue, retry map, or decision path.
2. If the responsibility already exists, use the existing owner.
3. If the existing owner lacks one capability, extend that owner. Do not fork a
   feature-local implementation.
4. Callers submit intent to owners. They do not reproduce owner logic locally.
5. Injected owners are mandatory dependencies when owned behavior executes.
   Accepting an owner and bypassing it is an architecture violation.
6. A shared row may have several field owners only when the owned subsets are
   explicit and non-overlapping.
7. Repeated bugs at one boundary require boundary reduction, not another local
   symptom patch.

Forbidden:

- duplicate helpers, wrappers, caches, snapshots, fields, or aliases for the
  same semantic concern
- shadow state for owner-managed lifecycle or readiness
- fallback paths that reconstruct owner decisions from secondary evidence
- transitional delegators without a removal task and structural guard

## 3. One Path Per Semantic Decision

Any runtime function or semantic concern MUST have one active path after input
normalization.

Required contract:

1. Normalize boundary input once at ingress.
2. Runtime logic consumes normalized state; it must not reopen raw storage,
   transport, bootstrap, cache, or wire shapes.
3. Semantic mode is represented by one named mode set, not by combinable
   booleans or tri-state option bags.
4. Multi-signal outcomes use one evidence snapshot, one state model or decision
   table, and one canonical outcome with reasons.
5. Collectors may gather evidence; one canonical adjudicator emits the final
   ready, admit, select, retryable, terminal, or blocked verdict.

Forbidden:

- "try the new path, then the old path" logic
- feature flags that keep two implementations alive for one semantic
- decision branches that mix cache and SQL as equivalent truth for one meaning
- bags of independent `if` statements around readiness, admission, retry,
  phase, lifecycle, or outcome classification

## 4. Scalars, State, And Naming Have Owners

Raw literals are allowed only at their owner boundary.

Required contract:

1. Shared domain value: import the canonical constants-owner value.
2. File-private value: define one top-level named constant in that file.
3. Test-private value: define one suite-local named constant when repeated or
   semantically important.
4. Raw external input: normalize it at ingress before runtime logic sees it.
5. `null` and `undefined` MUST NOT encode runtime or domain state. Use an
   explicit named state variant.
6. If a scalar or state has no clear owner, stop and define the owner first.
7. Each concept has one name. Do not add synonyms for existing concepts.
8. New source-code files use semantic names for the owner boundary, decision,
   contract, state model, or consumer role they own.
9. Do not introduce ordinal, segment, or grab-bag source filenames such as
   `part-2`, `segment`, `misc`, `helpers`, or `utils` unless that name is an
   established domain concept.

Small local guards are allowed. Branch piles, absence-as-phase, and unowned
reason-code strings are not.

## 5. Shared Runtime Contracts Have One Shape

When a concern appears as several near-synonymous caches, helpers, snapshots, or
output shapes, treat that as design drift.

Shared contract surfaces MUST declare:

1. semantic owner
2. canonical evidence inputs
3. canonical state or outcome vocabulary
4. allowed consumers
5. forbidden reinterpretations
6. operational authority versus diagnostics-only or owner-internal views

Diagnostics, admin, harness, and reporting surfaces that consume a boundary
must reuse the same grammar or declare a bounded view role, and must not invent
a new dominant reason by reassembling lower-layer fragments.

## 6. Tables, Cache, And Metadata Follow One Authority Chain

Persistent system state lives in tables. Shared metadata reaches readers through
one authoritative chain:

`authoritative partition commit -> CDC -> SystemTableCache -> readers`

Required contract:

1. System-table row creation, lifecycle updates, and deletion route through the
   canonical owner for that row or field subset.
2. Initial row creation writes the full canonical row shape. Later lifecycle
   changes use partial updates only.
3. `INSERT OR REPLACE` and full-row replacement are forbidden for steady-state
   lifecycle/status mutation of existing system rows.
4. CDC-replicated row mutation must be primary-key addressed.
5. `SystemTableCache` is a read model, not an authoritative reconstruction
   source.
6. Consumers may not maintain parallel system-data caches outside the declared
   owner or `SystemTableCache`.
7. Bootstrap shortcuts are phase-scoped exceptions only; they must not remain
   reachable from steady-state runtime code.

Cache divergence, stale reads, missing rows, and repair needs must surface as
typed owner outcomes or diagnostics. Non-forced readers do not repair
authoritative state on the hot path.

## 7. Phase Code Must Hand Off To Runtime Owners

Bootstrap, join, rejoin, recovery, split, rebalance, and readiness phases may
initialize runtime mechanisms. Steady-state correctness must not depend on
phase-owned wiring after phase completion.

Required contract:

1. Subscribers, bridges, queues, retry loops, cache hydration paths, and repair
   scheduling created by a phase must transfer to an explicit runtime owner
   before the phase completes.
2. Events may enqueue owner-key work; they must not execute long-running
   progression inline.
3. For one owner key, at most one reconcile execution may be in flight.
4. Event, cache, and timer triggers for one concern converge into the same
   owner path.
5. Broad polling loops are recovery tools only, not steady-state primary
   progression.
6. Phase completion removes temporary scaffolding only, never the sole live
   dissemination, observation, admission, or repair path.

## 8. Control-Plane Work Uses Shared Primitives

Control-plane concerns include dispatch, rebalance progression, split
progression, topology workflow, admission, readiness, and operation timeout
handling.

Required contract:

1. Topology-changing operations use one durable monotonic workflow contract.
2. Atomic multi-row authoritative updates commit through the shared transaction
   coordinator.
3. Executor-owned phase progression requires durable participant acknowledgement
   before the owner advances.
4. Readiness, admission, placement, and cohort selection consume canonical
   owner snapshots and policy, not helper-local booleans.
5. Timeout budgets are canonical: nested work derives from remaining budget and
   never starts with a fresh default full budget.
6. Exact-boundary timeout clusters are correctness evidence, not operational
   noise.
7. Runtime shared-metadata access crosses canonical read/write gateways.
8. Missing owner dependencies fail loudly with typed errors. They do not
   synthesize "allow by default" or equivalent fallback decisions.

See [`runtime-contracts.md`](runtime-contracts.md) for the detailed owner-row,
snapshot-reader, admission, readiness, workflow, and pressure rules.

## 9. Load May Slow The System, Not Break It

The system must remain correct under contention, topology change, recovery,
and control-plane pressure.

Required contract:

1. Throughput may fall under pressure; correctness must not.
2. Operations must not fail, return incorrect results, leak memory, or silently
   drop work because the system is under load.
3. Backpressure is structured and explicit: bounded queues, retry/defer
   outcomes, rejection reasons, retry-after data, or equivalent owner outcomes.
4. Callers must not discover overload only through timeout expiry.
5. Control-plane pressure must not cause query/data-plane correctness failures.
6. Query routing during topology transitions retries, redirects, or returns a
   structured retryable outcome within the caller budget; it does not return a
   hard failure while retryable replicas or leaders exist.
7. Every queue, buffer, subscription registry, deferred-work map, retry
   registry, or single-flight registry has one owner, one bound, one teardown
   rule, and diagnostics that can prove plateau.

## 10. Communication Has One Replicated Data Path

All service communication that should be a message goes through the
`MessageRouter`.

Required contract:

1. Query/data-plane traffic uses Message Group transport.
2. Do not add alternate fast paths such as direct local handler calls,
   ad-hoc sockets, admin API forwarding, or service-to-service in-process
   bypasses.
3. If performance is insufficient, optimize inside the canonical transport path
   instead of adding a non-replicated path.

## 11. Mutations Are Idempotent

All state-mutating operations MUST be safe under retry, redelivery, and recovery
sweeps.

Required contract:

1. State-mutating operations carry unique operation identity.
2. State transitions are monotonic.
3. Row creation uses insert-if-not-exists semantics or equivalent.
4. Replaying an already-applied transition is a no-op or the same deterministic
   outcome, not a second mutation.

## 12. User-Facing Model Stays Small

The external platform model is tables, services, SQL, and policies.

Required contract:

1. Users do not directly manage partitions, replicas, placement, leader
   election, message groups, cache hydration, or rebalance workflows.
2. Internal machinery may appear in diagnostics, but not as ordinary
   user-facing control surfaces unless explicitly designed as such.
3. New features should strengthen tables, services, policies, and canonical
   execution paths before introducing new user-visible concepts.
4. Runtime kinds such as native JS, WebAssembly components, and OCI containers
   are service implementation choices, not separate ontology categories unless
   the architecture explicitly says otherwise.

## 13. Closure Requires Proof, Review, And Truth Repair

A package is not done merely because the hot path passes.

Required contract:

1. Package validation must prove the owner path and affected tail consumers.
2. Static guardrail proof is required for touched runtime/control-plane,
   diagnostics, admin, harness, or shared test infrastructure boundaries.
3. Before closure, perform the affected-area deep dive required by
   [`workflow-guidelines.md`](workflow-guidelines.md) and
   [`testing-guidelines.md`](testing-guidelines.md).
4. Known in-scope doctrine or system-guideline violations in the affected area
   must be fixed before package closure.
5. Scenario-driven packages must prove what the original scenario does next:
   representative green, same frontier, reduced, migrated, classification-only,
   architecture gap, autonomous architecture experiment, or human-only
   escalation for blocked/contradictory evidence.
6. If a package discovers roadmap or architecture truth drift, repair the
   tracker, roadmap, or architecture record in the same closure cycle.
7. Architectural exceptions must be explicit, owned, time-bounded, and recorded
   in an active spec or architecture note with a removal checkpoint.
8. If a representative blocker returns to a recently closed owner boundary,
   stop local patching and raise a causal-escalation package for the
   cross-boundary handoff.

## 14. Stop Checklist Before Writing Code

Stop before implementation if any answer is yes:

1. Am I adding a second owner, cache, helper, field, path, status system, or
   fallback for an existing concern?
2. Am I using raw literals, `null`, or `undefined` as runtime/domain state?
3. Am I recomputing a semantic decision from lower-level evidence instead of
   using the canonical owner outcome?
4. Am I mixing row creation with lifecycle update, or writing fields owned by
   another component?
5. Am I using cache visibility, elapsed time, or incidental row observation to
   prove owner-managed phase completion?
6. Am I letting phase teardown remove the only live runtime path?
7. Am I adding a queue, retry map, subscriber set, or single-flight registry
   without an owner, bound, teardown rule, and diagnostics?
8. Am I turning pressure or topology lag into user-visible hard failure instead
   of structured retry, defer, or backpressure?
9. Am I closing a package while residuals, guardrail drift, tail consumers, or
   scenario migration evidence remain unnamed?
10. Am I starting another local runtime patch after the representative frontier
    returned to a recently closed related owner boundary?

If a local fix feels hard because the boundary is porous, reduce the boundary
or raise the abstraction rather than adding another symptom patch.
