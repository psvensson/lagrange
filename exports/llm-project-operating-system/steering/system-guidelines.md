---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/architecture.md
llm_load: represented_by_compact_packs
inclusion: represented_by_llm_core_and_architecture_pack
last_reviewed: 2026-05-23
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral. Extend it with your project's own rules.

> **Canonical source.** Generated packs at `steering/packs/` derive rules from this file. Regenerate with `npm run steering:llm:pack` after edits.

# System Guidelines — Mandatory Implementation Contract

## Document Role

This file is one of the canonical *source* steering documents that the LLM
compact packs under `steering/packs/` are generated from. It is **not** an
independent runtime override surface.

Steering precedence (mirrors `AGENTS.md` and `steering/packs/boot.md`):

1. The compact packs under `steering/packs/` are the runtime execution
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
- closure expectations that apply to every non-trivial Quest

Use focused steering files for detail:

- [`doctrine/INDEX.md`](doctrine/INDEX.md): architectural intent behind these rules
- [`runtime-contracts.md`](runtime-contracts.md): detailed runtime, data,
  cache, and communication contracts
- [`workflow/INDEX.md`](workflow/INDEX.md): Quest workflow,
  delegated execution, guardrails, findings, and terminal reports
- [`testing/INDEX.md`](testing/INDEX.md): validation policy
- [`style.md`](style.md): formatting and lint policy
- [`roadmap.md`](roadmap.md): implementation scope and edition boundaries
- [`../architecture/INDEX.md`](../architecture/INDEX.md): canonical
  architecture entrypoint, current owner maps, and subsystem detail index
- [`architecture.md`](architecture.md): compatibility pointer for
  older links only

These rules are non-negotiable. The compact packs derived from this file
carry the same authority during a session; the detailed source files explain
proof and procedure but do not weaken this contract.

## Process Weight Gate

Use the lightest Quest shape that protects the owner boundary:

1. **Read/review/doc-only**: answer questions or edit explanatory docs. A Quest
   is optional unless implementation truth, roadmap scope/state, or architecture
   ownership changes.
2. **Lightweight maintenance**: use one focused Quest and focused proof. Keep
   frontiers narrow and metrics cheap.
3. **Runtime owner-boundary work**: use a Quest with explicit owner constraints,
   static guardrails, focused owner tests, and affected-consumer proof.
4. **Scenario or release-gate work**: use a Quest with a scenario-harness
   `doneWhen`, representative evidence, and findings for failure migration.

When unsure, add constraints and proof to the Quest only if runtime ownership,
shared contracts, or representative scenario evidence can change.

## 1. Work Starts From One Bounded Quest

All non-trivial implementation work MUST follow the Quest workflow.

Required contract:

1. Broad or scope-changing work sharpens `../../roadmap.md` before code.
2. Bounded implementation work runs from one Quest under `solve/quests/`.
3. One Quest owns one sealed `doneWhen`, one primary owner boundary, and one
   focused proof surface.
4. Quest progress is recorded by Solver attempts and findings, not parallel
   status files.
5. `docs/` is reserved for end-user or operator-facing documentation. Active
   work definition lives under `solve/quests/`.
6. Model choice notes are advisory only. They never replace validation,
   delegated review, Solver attempts, or terminal reports.
7. Quest closure is SOLVED or EXHAUSTED in the Solver report.

See [`workflow/INDEX.md`](workflow/INDEX.md) for Quest
closure, findings, delegation, and report detail.

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
6. A shared record may have several field owners only when the owned subsets are
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
- decision branches that mix a cache and the authoritative store as equivalent
  truth for one meaning
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

## 6. Stored State And Cache Follow One Authority Chain

Persistent system state lives in the authoritative store. Shared state reaches
readers through one authoritative chain:

`authoritative commit -> change feed -> read-model cache -> readers`

Required contract:

1. Record creation, lifecycle updates, and deletion route through the canonical
   owner for that record or field subset.
2. Initial record creation writes the full canonical record shape. Later
   lifecycle changes use partial updates only.
3. Blind full-record overwrite is forbidden for steady-state lifecycle/status
   mutation of existing records.
4. Every state-mutating operation against a stored record must be addressed by
   the record's stable identity, not by positional or incidental lookup.
5. The read-model cache is a read view, not an authoritative reconstruction
   source.
6. Consumers may not maintain parallel system-data caches outside the declared
   owner or the canonical read-model cache.
7. Bootstrap shortcuts are phase-scoped exceptions only; they must not remain
   reachable from steady-state runtime code.

Cache divergence, stale reads, missing records, and repair needs must surface as
typed owner outcomes or diagnostics. Non-forced readers do not repair
authoritative state on the hot path.

## 7. Phase Code Must Hand Off To Runtime Owners

Bootstrap, join, recovery, migration, and readiness phases may initialize
runtime mechanisms. Steady-state correctness must not depend on phase-owned
wiring after phase completion.

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

## 8. Background And Maintenance Work Uses Shared Primitives

Background and maintenance concerns include dispatch, scheduled jobs, migration
progression, multi-step workflow, admission, readiness, and operation timeout
handling.

Required contract:

1. State-changing multi-step operations use one durable monotonic workflow
   contract.
2. Atomic multi-record authoritative updates commit through the shared
   transaction coordinator.
3. Owner-driven phase progression requires durable participant acknowledgement
   before the owner advances.
4. Readiness, admission, scheduling, and cohort selection consume canonical
   owner snapshots and policy, not helper-local booleans.
5. Timeout budgets are canonical: nested work derives from remaining budget and
   never starts with a fresh default full budget.
6. Timeouts that pile up exactly at a budget boundary are correctness evidence,
   not operational noise.
7. Runtime shared-state access crosses canonical read/write gateways.
8. Missing owner dependencies fail loudly with typed errors. They do not
   synthesize "allow by default" or equivalent fallback decisions.

See [`runtime-contracts.md`](runtime-contracts.md) for the detailed owner-record,
snapshot-reader, admission, readiness, workflow, and pressure rules.

## 9. Load May Slow The System, Not Break It

The system must remain correct under contention, reconfiguration, recovery,
and background/maintenance work pressure.

Required contract:

1. Throughput may fall under pressure; correctness must not.
2. Operations must not fail, return incorrect results, leak memory, or silently
   drop work because the system is under load.
3. Backpressure is structured and explicit: bounded queues, retry/defer
   outcomes, rejection reasons, retry-after data, or equivalent owner outcomes.
4. Callers must not discover overload only through timeout expiry.
5. Background/maintenance work pressure must not cause foreground request
   correctness failures.
6. Request routing during reconfiguration retries, redirects, or returns a
   structured retryable outcome within the caller budget; it does not return a
   hard failure while a retryable target still exists.
7. Every queue, buffer, subscription registry, deferred-work map, retry
   registry, or single-flight registry has one owner, one bound, one teardown
   rule, and diagnostics that can prove plateau.

## 10. Communication Has One Canonical Transport Path

All service communication that should be a message goes through the canonical
transport router.

Required contract:

1. Foreground request traffic uses the canonical transport.
2. Do not add alternate fast paths such as direct local handler calls,
   ad-hoc sockets, admin API forwarding, or service-to-service in-process
   bypasses.
3. If performance is insufficient, optimize inside the canonical transport path
   instead of adding a bypass path.

## 11. Mutations Are Idempotent

All state-mutating operations MUST be safe under retry, redelivery, and recovery
sweeps.

Required contract:

1. State-mutating operations carry unique operation identity.
2. State transitions are monotonic.
3. Record creation uses insert-if-not-exists semantics or equivalent.
4. Replaying an already-applied transition is a no-op or the same deterministic
   outcome, not a second mutation.

## 12. User-Facing Model Stays Small

The external model is the small set of concepts users actually operate on, not
the internal machinery that serves them.

Required contract:

1. Users do not directly manage internal scheduling, work distribution,
   transport, or cache-hydration machinery.
2. Internal machinery may appear in diagnostics, but not as ordinary
   user-facing control surfaces unless explicitly designed as such.
3. New features should strengthen the canonical user-facing concepts and
   execution paths before introducing new user-visible concepts.
4. Alternate runtime or implementation kinds are implementation choices, not
   separate ontology categories unless the architecture explicitly says so.

## 13. Closure Requires Proof, Review, And Truth Repair

A Quest is not SOLVED merely because the hot path passes.

Required contract:

1. Quest validation must prove the owner path and affected tail consumers.
2. Static guardrail proof is required for touched runtime, background-work,
   diagnostics, admin, harness, or shared test infrastructure boundaries.
3. Before closure, perform the affected-area deep dive required by
   [`workflow/INDEX.md`](workflow/INDEX.md) and
   [`testing/INDEX.md`](testing/INDEX.md).
4. Known in-scope doctrine or system-guideline violations in the affected area
   must be fixed before Quest closure.
5. Scenario-driven Quests must prove what the original scenario does next:
   representative green, same frontier, reduced, migrated, classification-only,
   architecture gap, autonomous architecture experiment, or human-only
   escalation for blocked/contradictory evidence.
6. If a Quest discovers roadmap or architecture truth drift, repair the
   roadmap or architecture record with the same Quest changes.
7. Architectural exceptions must be explicit, owned, time-bounded, and recorded
   in an active spec or architecture note with a removal checkpoint.
8. If a representative blocker returns to a recently closed owner boundary,
   stop local patching and add or author a frontier that models the
   cross-boundary handoff.

## 14. Stop Checklist Before Writing Code

Stop before implementation if any answer is yes:

1. Am I adding a second owner, cache, helper, field, path, status system, or
   fallback for an existing concern?
2. Am I using raw literals, `null`, or `undefined` as runtime/domain state?
3. Am I recomputing a semantic decision from lower-level evidence instead of
   using the canonical owner outcome?
4. Am I mixing record creation with lifecycle update, or writing fields owned by
   another component?
5. Am I using cache visibility, elapsed time, or incidental record observation
   to prove owner-managed phase completion?
6. Am I letting phase teardown remove the only live runtime path?
7. Am I adding a queue, retry map, subscriber set, or single-flight registry
   without an owner, bound, teardown rule, and diagnostics?
8. Am I turning pressure or reconfiguration lag into user-visible hard failure
   instead of structured retry, defer, or backpressure?
9. Am I claiming SOLVED while residuals, guardrail drift, tail consumers, or
   scenario migration evidence remain unnamed?
10. Am I starting another local runtime patch after the representative frontier
    returned to a recently closed related owner boundary?

If a local fix feels hard because the boundary is porous, reduce the boundary
or raise the abstraction rather than adding another symptom patch.
