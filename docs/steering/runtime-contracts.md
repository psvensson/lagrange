---
scope: architecture
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/architecture.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Detail expands `system-guidelines.md`. Regenerate packs with `npm run steering:llm:pack`.

# Runtime Contracts Detail

## Document Role

This file expands the runtime, control-plane, data, cache, and transport
contracts summarized by [`system-guidelines.md`](system-guidelines.md).

Use this file when a Quest touches:

- system-table row ownership or mutation
- cache, CDC, snapshot, readiness, admission, or service discovery paths
- topology workflow, rebalance, split, recovery, or operation progression
- pressure, backpressure, resource lifetime, routing, or transport behavior

Do not use this file for Quest workflow, roadmap scope, or style-only rules.

## Owner And Path Detail

One semantic owner per concern remains the root rule.

Required runtime patterns:

1. Callers submit intent to the owner and consume the owner outcome.
2. Components constructed with owner dependencies must route owned behavior
   through those dependencies.
3. A shared row may have multiple owners only when field subsets are explicit
   and non-overlapping.
4. Temporary delegators may forward to the owner, but must not add a second
   decision path.
5. A transitional delegator must have a removal task, target owner, and
   structural guard preventing new callers from binding to it.

Forbidden runtime patterns:

- local replacement logic when a composition-root owner is available
- owner-unavailable branches that reconstruct equivalent decisions
- feature-local implementations of existing cache/read/write/retry primitives
- shadow state for lifecycle, readiness, admission, leader, or routing truth

## System-Table Row Lifecycle

For every system-table-backed entity, exactly one component owns row creation,
lifecycle transitions, and deletion.

Required patterns:

1. Initial creation writes the full canonical row shape.
2. Later lifecycle changes use partial updates only.
3. Lifecycle updates write only fields owned by that lifecycle owner.
4. Missing rows route through the canonical creation owner or fail loudly.
5. CDC-replicated row mutations are addressed by canonical primary key.
6. Multi-row transitions either transition rows one by one by primary key or
   use an explicit transaction wrapper that preserves row identity.

Forbidden patterns:

- `INSERT OR REPLACE` for steady-state lifecycle/status updates
- full-row replacement for existing lifecycle rows
- recreating missing rows inside updater code
- broad `UPDATE` or `DELETE` statements as the primary CDC mutation path
- one persisted field carrying unrelated claim, lease, workflow, and entity
  lifecycle semantics

## Cache And Read Models

`SystemTableCache` is the steady-state read model for CDC-propagated metadata.
It is not an authority for reconstructing owner-managed write payloads.

Required patterns:

1. CDC-propagated metadata decisions read from the cache unless the boundary
   explicitly declares another owner-fed read model.
2. SQL reads for equivalent semantics are limited to authoritative writes,
   explicit recovery sweeps, and diagnostics reconciliation.
3. Cache divergence recovery re-enters the owner reconcile path.
4. Cache/authoritative divergence is surfaced as typed diagnostics.
5. New system tables are classified in exactly one of
   `CDC_PROPAGATED_TABLES` or `CDC_NON_PROPAGATED_TABLES`.

Forbidden patterns:

- ad-hoc Maps, Sets, or objects that cache system data outside the declared
  owner or `SystemTableCache`
- copying owner-managed fields from cache into unrelated write paths
- completing executor-owned topology phases from cache visibility alone
- mixing cache and SQL fallbacks inside one semantic decision path

## Snapshot Readers And Repair

Shared truth surfaces such as startup, readiness, admin snapshot, service
discovery, and harness convergence must have one snapshot owner.

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
   of doing synchronous repair on the hot path.
3. Forced repair, when allowed, still routes through the same owner and bounded
   budget.
4. Reader-local caches do not memoize stale or deferred blocked answers as
   fresh observations.

## Critical Convergence Priority

When control-plane pressure forces a choice, critical convergence work outranks
diagnostics, observability reads, and broad repair.

Critical convergence includes:

- `NODE_STATE_UPDATE`
- membership publication
- authoritative `replica_operations` visibility
- other owner-defined control-plane progression writes

Forbidden patterns:

- snapshot repair consuming the same effective lane as critical convergence
- treating mild pressure as permission to publish cache-only emptiness
- reopening broad repair from readers on the same stressed path needed to
  finish convergence

## Canonical Owner Rows

Canonical owner rows outrank supporting read models.

Required precedence:

1. `partitions.leader_node_id` owns partition leader identity.
2. `message_groups.leader_node_id` owns message-group leader identity.
3. `services` owns replica-only fields such as replica role, status, and
   address.

Forbidden patterns:

- deriving canonical leader identity from replica row iteration order
- treating replica rows as alternative truth when the owner row is present
- collapsing owner-row mismatch and replica-role mismatch into one generic
  error

### Canonical writers

The owner rows above declare which row is authoritative; the components below are
the single writers. This table is a steering summary that defers to the canonical
maps, not a second source of truth. The canonical maps are split by concern:
component ownership lives in
[`architecture/current-owner-maps.md`](../../architecture/current-owner-maps.md),
the `services` field-writer matrix in `architecture/control-plane.md`
("services Row Ownership Matrix"), and the leader rows
(`partitions.leader_node_id` / `message_groups.leader_node_id`) in
`architecture/runtime-lifecycle.md` and `architecture/overview.md` (not in
`current-owner-maps.md`).

| Concern (table.field) | Single writer |
| --- | --- |
| `nodes.node_state` | `NodeLifecycleStateMachine` (owner); published via `NodeStatePublicationOwner` (NODE_STATE_UPDATE) |
| `services` replica lifecycle (`status`, `state_entered_at`, `trigger_reason`, …) | `ReplicaStateMachine` |
| `services.raft_role` | `PartitionService` / `MessageGroupService` (distinct field owner, not the lifecycle owner) |
| `services` identity (`service_id`, `address`, …) | service-row creation owner (`PartitionService` / `MessageGroupService`) |
| membership publication (`control_plane_publications`) | `MembershipPublicationCoordinator` |
| `partitions.leader_node_id`, `message_groups.leader_node_id` | the owner ROW is canonical, but no single writer component is named today — treat the row as authoritative, never reconstruct leader identity from `services.raft_role`, and assign/confirm the writer before extending this path |

The unnamed writer for the leader rows is a **known incomplete-owner gap**, not a
contradiction of doctrine §1 ("one semantic owner per concern", see
[`doctrine/owner-boundaries.md`](doctrine/owner-boundaries.md)): the owner *row*
exists, the owner *component* has not been cut over yet. Per §1's own rule, this
is recorded as an unfinished cutover here rather than papered over — assign the
writer before extending the path.

The `services` row is the canonical example of non-overlapping field owners on one
row: identity, lifecycle (`ReplicaStateMachine`), and `raft_role`
(`PartitionService` / `MessageGroupService`) are written by different components on
disjoint field subsets — permitted precisely because the subsets do not overlap.

Retry is not fallback: routing MAY retry or redirect to another live replica or a
new leader within the caller budget (for example `QueryExecutorWriteRetryRouting`);
it MUST NOT reconstruct an owner decision from secondary evidence when the owner is
unavailable.

## Runtime Shared-Metadata Gateways

Runtime shared-metadata access must cross canonical ingress owners.

Required patterns:

1. Semantic owners submit shared-metadata writes through one canonical runtime
   mutation gateway.
2. Semantic decisions use one canonical read gateway or one declared owner-fed
   read model.
3. Bootstrap-only shortcuts remain phase-scoped and unreachable from
   steady-state runtime code.

Forbidden patterns:

- raw system-table mutation helper calls from runtime feature code when a
  gateway owner exists
- second runtime read ingress with equivalent cache/SQL decisions
- bootstrap helper paths reachable from steady-state runtime code

## Bootstrap And Phase Handoff

Bootstrap, join, and recovery phases may initialize runtime mechanisms.
Bootstrap, join, and recovery phases must not remain the steady-state owner
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

When one owner produces control-plane truth that another owner consumes, the
handoff is a runtime contract rather than two independent local contracts.

Required patterns:

1. The producer declares its durable outcome, revision, freshness, and
   acknowledgement vocabulary.
2. The consumer declares the precondition that makes the producer outcome
   admissible for selection, activation, repair, readiness, or publication.
3. The handoff exposes one freshness, revision, or acknowledgement edge that
   proves the consumer is not reading pre-handoff truth.
4. Diagnostics serialize both sides of the handoff and the deciding edge in one
   grammar.

Forbidden patterns:

- treating producer publication and consumer readiness as independently fixed
  when representative evidence alternates between them
- letting a consumer select, repair, or admit from an owner stream that has not
  published the required durable handoff edge
- proving the producer and consumer with separate focused tests while no
  replayable handoff fixture or missing-edge probe covers their interaction
- allowing a publication recovery producer to stall or wait on unknown publication
  deficits when a downstream active-gate reconcile handoff is already pending,
  as this introduces structural deadlocks during rolling restarts under pressure.


## Deterministic Control-Plane Progression

Dispatch, rebalance, split, admission progression, and operation timeout
handling execute through deterministic owner-key reconcile paths.

Required patterns:

1. Events enqueue owner-key work; they do not execute long-running progression.
2. For one owner key, at most one reconcile execution is in flight.
3. Event, cache update, and timer triggers converge into the same reconcile
   queue and owner path.
4. Broad polling is recovery-only.
5. Participant executors emit outcomes and do not persist owner-managed phase
   transitions directly.

## Durable Workflow And Transaction Boundaries

Topology-changing operations use one durable workflow contract.
`DurableWorkflowCoordinator` owns generic durable-workflow state and fencing;
`DistributedTransactionCoordinator` is a distinct higher-level component that adds
the atomic multi-row (2PC) protocol on top of it. They are two components, not
two names for one.

Required patterns:

1. Step transitions persist previous step, next step, reason, and timestamp.
2. Atomic multi-row authoritative updates commit through the shared
   `DistributedTransactionCoordinator`.
3. Executor-owned phase progression waits for durable participant
   acknowledgement.
4. Existing shared workflow primitives are extended when a capability is
   missing.

Forbidden patterns:

- ad-hoc cross-owner write ordering to emulate atomicity
- sequential fallback branches for atomic topology cut points
- a second control-plane workflow engine when `DurableWorkflowCoordinator`
  owns the contract

## Admission, Readiness, And Multi-Signal Decisions

Readiness, admission, placement, and cohort selection separate observation from
policy.

Required patterns:

1. Collectors fetch evidence and diagnostics.
2. One normalized per-entity snapshot records authoritative, equivalent, and
   degraded evidence.
3. One canonical adjudicator derives final state, verdict, retryability, and
   reason codes.
4. Equivalent evidence clears only the blocker classes declared equivalent by
   spec.
5. Degraded or cross-plane evidence may explain or defer, but must not upgrade
   a blocked entity to ready or admitted.

Specific readiness rules:

- Use `ControlPlaneReadinessService` as the readiness owner (node readiness and
  planning surfaces). The snapshot/watch surface — control snapshot, service
  discovery, freshness and observation state — has a DISTINCT owner,
  `ControlPlaneSnapshotOwner`. Readiness and snapshot ownership are two separate
  components; do not conflate "readiness owner" with "snapshot/watch owner".
- Combine write-time lease/readiness evidence with live transport evidence
  when the transport owner has it.
- Apply bounded stale-heartbeat tolerance.
- Share `repairEligible` across internal topology consumers.
- Use `serveEligible` for routing and benchmark consumers.

Specific admission rules:

- Evaluate the full ordered candidate pool.
- Do not pre-slice candidates to the requested replica count before admission.
- Treat a denied candidate as one rejected candidate, not a global abort, until
  no admissible cohort can satisfy the minimum.
- Fail impossible cohorts immediately with structured rejection diagnostics.

## Modes And Status Taxonomy

Configured modes dominate disabled-path preconditions.

Required patterns:

1. Gate by configured mode first.
2. Execute only prerequisites for the active mode.
3. Publish reason codes valid for the active mode.
4. Active/terminal predicates consume canonical status sets.
5. Terminal success is monotonic and not rewritten by unrelated sweeps.

Forbidden patterns:

- grouped-path diagnostics while grouped mode is disabled
- status checks that bypass declared active/terminal sets
- expiry sweeps that rewrite another owner's terminal workflow outcome

## Timeout And Invariant Rules

Timeouts and invariant breaches in control-plane logic are correctness bugs.

Required patterns:

1. Top-level operations start with one canonical timeout budget.
2. Nested operations derive from remaining budget.
3. Timeout classifications are typed outcomes with budget context.
4. Exact-boundary timeout clusters require deterministic regression coverage.
5. Owners emit structured invariant results that serialize into diagnostics
   and harness artifacts.

Forbidden patterns:

- nested waits using fresh full budgets after time has already elapsed
- generic timeout strings for semantic control-plane outcomes
- treating routine timeout under moderate load as operational tuning

## Pressure, Backpressure, And Resource Lifetime

The system may slow under pressure, but it must remain correct.

Required patterns:

1. Queues have capacity limits and structured rejection outcomes.
2. Downstream pressure propagates upstream with queue depth, retry-after, or
   equivalent structured context.
3. Load is shed at ingress when accepting work would produce deep-stack
   failure.
4. Control-plane and query-plane paths have explicit priority or capacity
   isolation when they share resources.
5. Runtime collections have owner, bound, expiry/teardown rule, and diagnostic
   surface.
6. Diagnostics can prove plateau under repeated join, restart, recovery, or
   load cycles.

Forbidden patterns:

- unbounded in-flight work
- hidden local priority queues outside the shared pressure contract
- callers discovering overload only by timeout
- resource cleanup that depends on process lifetime or scenario end

## Query Routing And Transport

During splits, moves, and leader elections, queries may be slower but must not
fail because topology is transient.

Required patterns:

1. Retry or redirect to available replicas or new leaders when possible.
2. Return structured retryable outcomes when no replica can serve within the
   caller budget.
3. Bound retries by the caller timeout budget.
4. Tolerate briefly stale partition maps.
5. Route query/data-plane traffic through Message Group transport.

Forbidden patterns:

- direct local handler calls, ad-hoc sockets, admin forwarding, or
  service-to-service in-process bypasses for data-plane traffic
- non-replicated fast paths for performance
- hard query failure while retryable replicas exist
- indefinite query queues waiting for topology transitions

## Idempotency

State-mutating operations must be safe under retry and redelivery.

Required patterns:

1. Use operation IDs, idempotency keys, or equivalent unique identity.
2. Make lifecycle transitions monotonic.
3. Use write-if-not-exists semantics for creation.
4. Make replayed transitions no-ops or deterministic equivalent outcomes.

Forbidden patterns:

- receiver logic that depends on caller discipline to avoid duplicates
- retryable paths that use non-idempotent counters or append-only writes
  without deduplication
