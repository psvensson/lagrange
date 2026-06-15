---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: steering/packs/architecture.md
last_reviewed: 2026-05-23
---

> Method kernel — portable. Keep the mechanism; this file is domain-neutral. Extend it with your project's own rules.

> **Canonical source.** Detail expands `system-guidelines.md`. Regenerate packs with `npm run steering:llm:pack`.

# Runtime Contracts Detail

## Document Role

This file expands the runtime, ownership, data, cache, and request-path
contracts summarized by [`system-guidelines.md`](system-guidelines.md).

Use this file when a task touches:

- record ownership or mutation in shared state
- cache, snapshot, readiness, admission, or service-lookup paths
- background workflow, recovery, or operation progression
- pressure, backpressure, resource lifetime, routing, or request-path behavior

Do not use this file for task workflow, roadmap scope, or style-only rules.

## Owner And Path Detail

One semantic owner per concern remains the root rule.

Required runtime patterns:

1. Callers submit intent to the owner and consume the owner outcome.
2. Components constructed with owner dependencies MUST route owned behavior
   through those dependencies.
3. A shared record MAY have multiple owners only when field subsets are explicit
   and non-overlapping.
4. Temporary delegators MAY forward to the owner, but MUST NOT add a second
   decision path.
5. A transitional delegator MUST have a removal task, target owner, and
   structural guard preventing new callers from binding to it.

Forbidden runtime patterns:

- local override logic when a composition-root owner is available
- owner-unavailable branches that reconstruct equivalent decisions
- feature-local reimplementations of existing cache/read/write/retry primitives
- shadow state for lifecycle, readiness, admission, ownership, or routing truth

## Shared-Record Lifecycle

For every shared, persisted entity (a cache entry, a job, a ledger line, a
stored file's metadata), exactly one component owns record creation, lifecycle
transitions, and deletion.

Required patterns:

1. Initial creation writes the full canonical record shape.
2. Later lifecycle changes use partial updates only.
3. Lifecycle updates write only fields owned by that lifecycle owner.
4. Missing records route through the canonical creation owner or fail loudly.
5. Records are addressed by their canonical primary key.
6. Multi-record transitions either transition records one by one by primary key
   or use an explicit transaction wrapper that preserves record identity.

Forbidden patterns:

- upsert-style full overwrite for steady-state lifecycle/status updates
- full-record overwrite for an existing lifecycle record
- recreating missing records inside updater code
- broad blanket `UPDATE`/`DELETE` as the primary mutation path
- one persisted field carrying unrelated claim, lease, workflow, and entity
  lifecycle semantics

## Cache And Read Models

A read-model cache is the steady-state read surface for propagated metadata.
It is NOT an authority for reconstructing owner-managed write payloads.

Required patterns:

1. Propagated-metadata decisions read from the cache unless the boundary
   explicitly declares another owner-fed read model.
2. Direct backing-store reads for equivalent semantics are limited to
   authoritative writes, explicit recovery sweeps, and diagnostics
   reconciliation.
3. Cache divergence recovery re-enters the owner reconcile path.
4. Cache/authoritative divergence is surfaced as typed diagnostics.
5. New backing stores are classified into exactly one declared
   cached-or-not-cached set.

Forbidden patterns:

- ad-hoc Maps, Sets, or objects that cache shared data outside the declared
  owner or the canonical read model
- copying owner-managed fields from cache into unrelated write paths
- completing executor-owned background phases from cache visibility alone
- mixing cache and direct-store fallbacks inside one semantic decision path

## Snapshot Readers And Repair

Shared truth surfaces such as startup, readiness, admin snapshot,
service lookup, and test-harness state MUST have one snapshot owner.

That owner controls:

- freshness or revision state
- canonical observation state
- reason codes
- retry timing
- repair scheduling
- forced-repair routing

Required patterns:

1. Non-forced readers consume owner outcomes such as `fresh`,
   `stale-but-usable`, `deferred-refresh`, or `failed`.
2. Non-forced readers schedule repair through the owner reconcile path instead
   of doing synchronous repair on the request path.
3. Forced repair, when allowed, still routes through the same owner and bounded
   budget.
4. Reader-local caches MUST NOT memoize stale or deferred blocked answers as
   fresh observations.

## Critical-Progress Priority

When resource pressure forces a choice, critical forward progress outranks
diagnostics, observability reads, and broad repair.

Critical forward progress includes:

- authoritative state-transition writes that unblock waiting work
- the writes that make a newly available entity admissible
- other owner-defined progression writes on the maintenance path

Forbidden patterns:

- snapshot repair consuming the same effective lane as critical progress
- treating mild pressure as permission to publish cache-only emptiness
- reopening broad repair from readers on the same stressed path needed to
  finish forward progress

## Canonical Owner Records

Canonical owner records outrank supporting read models.

Required precedence:

1. The owner record for an identity owns that identity; supporting rows do not.
2. The owner record for a role/status field owns that field.

Forbidden patterns:

- deriving canonical identity from supporting-row iteration order
- treating supporting rows as alternative truth when the owner record is present
- collapsing owner-record mismatch and supporting-row mismatch into one generic
  error

## Runtime Shared-Metadata Gateways

Runtime shared-metadata access MUST cross canonical ingress owners.

Required patterns:

1. Semantic owners submit shared-metadata writes through one canonical runtime
   mutation gateway.
2. Semantic decisions use one canonical read gateway or one declared owner-fed
   read model.
3. Startup-only shortcuts remain phase-scoped and unreachable from steady-state
   runtime code.

Forbidden patterns:

- raw backing-store mutation helper calls from runtime feature code when a
  gateway owner exists
- a second runtime read ingress with equivalent cache/store decisions
- startup helper paths reachable from steady-state runtime code

## Bootstrap And Phase Handoff

Bootstrap, join, and recovery phases MAY initialize runtime mechanisms.
Bootstrap, join, and recovery phases MUST NOT remain the steady-state owner
after the phase completes.

Required patterns:

1. A phase-created subscriber, bridge, queue, retry loop, cache hydration path,
   or repair route transfers to a runtime owner before phase completion.
2. Phase completion removes temporary scaffolding only.
3. Handoff completion is represented by one owner transition.

Forbidden patterns:

- tearing down the only live subscriber, bridge, dissemination path, or repair
  route
- hiding missing handoff ownership behind fallback reads, broad repairs, or
  timeout inflation
- inferring handoff from elapsed time or "good enough" cache visibility

## Producer Consumer Handoff Invariants

When one owner produces authoritative truth that another owner consumes, the
handoff is a runtime contract rather than two independent local contracts.

Required patterns:

1. The producer declares its durable outcome, revision, freshness, and
   acknowledgement vocabulary.
2. The consumer declares the precondition that makes the producer outcome
   admissible for selection, activation, repair, readiness, or release.
3. The handoff exposes one freshness, revision, or acknowledgement edge that
   proves the consumer is not reading pre-handoff truth.
4. Diagnostics serialize both sides of the handoff and the deciding edge in one
   grammar.

Forbidden patterns:

- treating producer output and consumer readiness as independently fixed when
  representative evidence alternates between them
- letting a consumer select, repair, or admit from an owner stream that has not
  published the required durable handoff edge
- proving the producer and consumer with separate focused tests while no
  replayable handoff fixture or missing-edge probe covers their interaction
- letting a recovery producer stall or wait on an unknown deficit while a
  downstream reconcile handoff is already pending, since that introduces a
  structural deadlock during recovery under pressure

## Deterministic Progression

Dispatch, background work, admission progression, and operation timeout handling
execute through deterministic owner-key reconcile paths.

Required patterns:

1. Events enqueue owner-key work; they MUST NOT execute long-running progression
   inline.
2. For one owner key, at most one reconcile execution is in flight.
3. Event, cache update, and timer triggers converge into the same reconcile
   queue and owner path.
4. Broad polling is recovery-only.
5. Participant executors emit outcomes and MUST NOT persist owner-managed phase
   transitions directly.

## Durable Workflow And Transaction Boundaries

State-changing multi-step operations use one durable workflow contract.

Required patterns:

1. Step transitions persist previous step, next step, reason, and timestamp.
2. Atomic multi-record authoritative updates commit through the shared
   transaction coordinator.
3. Executor-owned phase progression waits for durable participant
   acknowledgement.
4. Existing shared workflow primitives are extended when a capability is
   missing.

Forbidden patterns:

- ad-hoc cross-owner write ordering to emulate atomicity
- sequential fallback branches for atomic cut points
- a second workflow engine when the durable workflow coordinator owns the
  contract

## Admission, Readiness, And Multi-Signal Decisions

Readiness, admission, and candidate selection separate observation from policy.

Required patterns:

1. Collectors fetch evidence and diagnostics.
2. One normalized per-entity snapshot records authoritative, equivalent, and
   degraded evidence.
3. One canonical adjudicator derives final state, verdict, retryability, and
   reason codes.
4. Equivalent evidence clears only the blocker classes declared equivalent by
   spec.
5. Degraded or cross-source evidence MAY explain or defer, but MUST NOT upgrade
   a blocked entity to ready or admitted.

Specific readiness rules:

- Use one declared readiness owner.
- Combine write-time lease/readiness evidence with live liveness evidence when
  the liveness owner has it.
- Apply bounded stale-heartbeat tolerance.
- Share an internal-repair-eligibility signal across internal consumers.
- Use a serve-eligibility signal for routing and benchmark consumers.

Specific admission rules:

- Evaluate the full ordered candidate pool.
- DO NOT pre-slice candidates to the requested count before admission; do not
  prematurely narrow inputs before the authoritative decision.
- Treat a denied candidate as one rejected candidate, not a global abort, until
  no admissible set can satisfy the minimum.
- Fail impossible requests immediately with structured rejection diagnostics.

## Modes And Status Taxonomy

Configured modes dominate disabled-path preconditions.

Required patterns:

1. Gate by configured mode first.
2. Execute only prerequisites for the active mode.
3. Publish reason codes valid for the active mode.
4. Active/terminal predicates consume canonical status sets.
5. Terminal success is monotonic and MUST NOT be rewritten by unrelated sweeps.

Forbidden patterns:

- emitting a disabled mode's diagnostics while that mode is off
- status checks that bypass declared active/terminal sets
- expiry sweeps that rewrite another owner's terminal workflow outcome

## Timeout And Invariant Rules

Timeouts and invariant breaches in owner logic are correctness bugs.

Required patterns:

1. Top-level operations start with one canonical timeout budget.
2. Nested operations derive from remaining budget.
3. Timeout classifications are typed outcomes with budget context.
4. Exact-boundary timeout clusters require deterministic regression coverage.
5. Owners emit structured invariant results that serialize into diagnostics and
   harness artifacts.

Forbidden patterns:

- nested waits using fresh full budgets after time has already elapsed
- generic timeout strings for semantic owner outcomes
- treating routine timeout under moderate load as operational tuning

## Pressure, Backpressure, And Resource Lifetime

The system MAY slow under pressure, but it MUST remain correct.

Required patterns:

1. Queues have capacity limits and structured rejection outcomes.
2. Downstream pressure propagates upstream with queue depth, retry-after, or
   equivalent structured context.
3. Load is shed at ingress when accepting work would produce deep-stack failure.
4. Maintenance/background paths and request/serving paths have explicit priority
   or capacity isolation when they share resources.
5. Runtime collections have owner, bound, expiry/teardown rule, and diagnostic
   surface.
6. Diagnostics can prove plateau under repeated join, restart, recovery, or load
   cycles.

Forbidden patterns:

- unbounded in-flight work
- hidden local priority queues outside the shared pressure contract
- callers discovering overload only by timeout
- resource cleanup that depends on process lifetime or scenario end

## Request Routing And Transport

During transient internal reconfiguration (migrations, failovers, cache
rebuilds), requests MAY be slower but MUST NOT fail because state is transient.

Required patterns:

1. Retry or redirect to another available backend when possible.
2. Return structured retryable outcomes when no backend can serve within the
   caller budget.
3. Bound retries by the caller timeout budget.
4. Tolerate briefly stale routing maps.
5. Route request/serving traffic through the canonical transport path.

Forbidden patterns:

- direct local handler calls, ad-hoc sockets, admin forwarding, or in-process
  bypasses for request/serving traffic
- unmanaged fast paths added purely for performance
- hard request failure while retryable backends exist
- indefinite request queues waiting for internal reconfiguration

## Idempotency

State-mutating operations MUST be safe under retry and redelivery.

Required patterns:

1. Use operation IDs, idempotency keys, or equivalent unique identity.
2. Make lifecycle transitions monotonic.
3. Use write-if-not-exists semantics for creation.
4. Make replayed transitions no-ops or deterministic equivalent outcomes.

Forbidden patterns:

- receiver logic that depends on caller discipline to avoid duplicates
- retryable paths that use non-idempotent counters or append-only writes without
  deduplication
