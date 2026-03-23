# Design Document: Node Join Under Load Cleanup

## Overview

The current node-join-under-load cleanup is a boundary-consolidation effort,
not a new subsystem.

The design follows the doctrine directly:

1. one read ingress per semantic decision
2. one pressure contract across runtime and harness
3. slower under pressure, never less correct
4. shrink the boundary where bugs cluster

The implementation is organized around eighteen design changes:

1. preserve typed retry semantics on the admin query boundary
2. make wait-reason accounting first-class in `LoadRun`
3. derive one bottleneck estimate from measured run signals
4. remove duplicate READY transition noise without adding a second lifecycle
   path
5. honor typed retry windows inside the existing load-run admission block
6. redistribute per-node concurrency across dispatch-ready nodes only
7. preserve structured partial results on failed scenario paths
8. add bounded structured diagnostics on the failing CDC/control-plane owners
9. use one deterministic integration repro to pick the first production fix
10. preserve bounded participant attribution across distributed read fanout
11. classify authoritative repair failures with one bounded cause chain
12. surface retained-object diagnostics directly through failed scenario
    reports
13. use one focused authoritative-read participant-failure repro for the
    remaining read-side failure family
14. gate authoritative reads on canonical local query-transport readiness
15. surface local query-transport gating through canonical readiness and
    diagnostics
16. isolate replay-heavy metadata propagation from critical control-plane work
17. fold self query-transport evidence into routed-read eligibility
18. expose one canonical control-plane participation contract to both routed
    reads and owner reads

## D1. Typed Admin Query Pressure Contract

### D1.1 Problem

Runtime code already emits typed pressure semantics such as `deferRetry`,
`retryAfterMs`, and stable `errorCode`, but the admin query transport collapses
that information down to plain `error` plus `errorCode` in several paths. The
harness then reconstructs admission behavior from message text, which violates
the "one pressure contract" direction in the doctrine.

### D1.2 Design

Preserve retry metadata end-to-end:

1. `AdminWebSocketAPI.sendQueryResult(...)` forwards `deferRetry` and
   `retryAfterMs` when present on a failed query result.
2. `NodeHandle._resolvePendingQuery(...)` restores those fields onto the thrown
   error object.
3. `LoadRun` classifies retryable control-plane pressure by consulting:
   - typed error fields first
   - the shared `src/control-plane/control-plane-error-classification.js`
     helper second
   - existing message heuristics last

### D1.3 Consequences

1. runtime and harness share the same retry contract
2. `query_admission_deferred` and related pressure signals stop being a special
   one-off case
3. attempt-level diagnostics stay visible while hard failure counts stay clean

## D2. Load Wait-Reason Accounting

### D2.1 Problem

Current load metrics can tell that attempts failed, but not precisely where the
run waited or backed off. That makes queue pressure, node-slot saturation, and
retryable control-plane pressure harder to separate.

### D2.2 Design

Add bounded wait-reason accounting owned by `LoadRun`.

Global counters:

1. `nodeSlotUnavailable`
2. `nodeAdmissionBlocked`
3. `retryableControlPlanePressure`
4. `timeoutWaits`
5. `queueCapacityRejected`

Per-node counters mirror the subset that can be attributed to a node.

Accounting rules:

1. queue-capacity waits are recorded where the scheduler cannot dispatch
2. per-node slot saturation is recorded when a candidate node is otherwise
   eligible but already at max in-flight
3. admission and retryable-pressure waits are recorded from typed error
   classification
4. timeout waits are recorded from timeout-shaped admin query failures

### D2.3 Consequences

1. report consumers can see what the run spent time waiting on
2. failure bundles no longer need to infer the dominant bottleneck only from
   distinct error text
3. the counters remain bounded and owned inside the run, consistent with the
   bounded-resource rules

## D3. Bottleneck Estimate From Measured Signals

### D3.1 Problem

The harness reports raw metrics, but users still need to manually infer whether
the run was admission-limited, queue-limited, or timeout-limited.

### D3.2 Design

Introduce one small derived estimate during report generation.

The estimate chooses the dominant chokepoint class from measured evidence:

1. `admission_pressure` when admission or retryable-pressure waits dominate
2. `node_slot_saturation` when per-node slot waits dominate
3. `dispatch_queue_backlog` when queue delay and undispatched backlog dominate
4. `timeout_limited` when timeout waits dominate
5. `mixed_or_unknown` otherwise

The estimate is heuristic but explicit. It includes:

1. `kind`
2. `primaryEvidence`
3. `likelyWaitingTimeSource`

This is serialized into the report entry and failure bundle summary.

### D3.3 Consequences

1. the report becomes operationally useful without claiming false precision
2. future capacity modeling can build on these measured categories
3. the estimate remains grounded in existing metrics, not external hardware
   assumptions

## D4. Singular READY Ownership

### D4.1 Problem

Join completion currently produces at least one observed same-state READY
transition warning. Even if correctness is unaffected, that is owner-boundary
noise and a likely symptom of duplicate lifecycle touching.

### D4.2 Design

Keep the existing lifecycle owner and make same-state READY requests idempotent
at the owner boundary rather than logging them as invalid transitions for this
path.

Implementation direction:

1. identify the canonical lifecycle owner entrypoint used by join completion
2. add an explicit idempotent fast path for same-state READY requests
3. preserve invalid-transition diagnostics for true illegal transitions

### D4.3 Consequences

1. join completion stops generating misleading warning noise
2. the fix remains within the existing lifecycle owner
3. no second lifecycle path is introduced

## Verification Strategy

The tasks will execute in strict sequence:

1. add a failing regression
2. implement the smallest owner-boundary fix
3. rerun the targeted test
4. mark the task complete in `tasks.md`
5. only then begin the next task

Scenario reruns happen only after the typed pressure and instrumentation tasks
are in place, so the expensive run occurs against the strengthened boundary.

## D5. Retry-After-Aware Admission Backoff

### D5.1 Problem

The harness now preserves typed `retryAfterMs`, but `LoadRun` still applies a
fixed local admission backoff for retryable control-plane pressure. Under node
join pressure that causes the same unhealthy node to be retried before the
runtime asked for, which converts a defer signal into timeout-shaped load
failures.

### D5.2 Design

Keep admission ownership inside `LoadRun`, but derive the node block window
from the typed retry contract:

1. for retryable control-plane pressure, compute the next probe time as the
   greater of:
   - the configured local admission-backoff floor
   - the typed `retryAfterMs` from the canonical control-plane classifier
2. preserve the existing node-client breaker-owner rule so the load generator
   still avoids opening its own second breaker for node-client-owned nodes
3. keep the block window temporary; once the deadline expires, the node becomes
   probeable again through the existing path

### D5.3 Consequences

1. defer signals should produce fewer reprobe storms and fewer query timeouts
2. the change remains inside the existing admission state machine
3. the pressure contract now influences both classification and pacing

## D6. Dynamic Healthy-Node Concurrency Reuse

### D6.1 Problem

`LoadRun` derives `nodeMaxInFlight` once from the initial node count. During
join-under-load, once some nodes are admission-blocked, the remaining healthy
nodes still keep the smaller original slot budget. That strands global
`maxInFlight` capacity and turns harness-side slot exhaustion into a dominant
backlog source.

### D6.2 Design

Keep the existing scheduler and global in-flight limit, but derive the
effective per-node slot cap from the current dispatch-ready node count:

1. count nodes whose admission block has expired at dispatch time
2. compute the effective per-node cap as the greater of:
   - the configured static `nodeMaxInFlight` floor
   - `ceil(maxInFlight / readyNodeCount)`
3. use that effective cap only for nodes that are currently dispatch-ready
4. preserve the existing global `maxInFlight` guard so total concurrency cannot
   exceed the configured budget

### D6.3 Consequences

1. healthy nodes can absorb more load while unhealthy nodes are cooling down
2. per-node bulkheads still exist when all nodes are healthy
3. harness backlog becomes a truer reflection of system pressure instead of a
   static fairness artifact

## D7. Failed-Run Partial Result Preservation

### D7.1 Problem

`node-join-under-load` currently asserts after `loadRun.waitComplete()` and
throws before returning its scenario payload. The runner only preserves
`err.diagnostics`, so failed runs lose `loadMetrics`, `performanceMeasurement`,
and the derived bottleneck estimate even though the data exists.

### D7.2 Design

Keep the existing `err.diagnostics` failure channel and extend it with one
stable `partialResult` object.

Implementation direction:

1. the scenario builds a structured failure error after load completes
2. `error.diagnostics.partialResult` carries:
   - `loadMetrics`
   - `convergenceTiming`
   - `newNodeId`
   - `failurePhase`
   - `dominantAssertion`
3. the runner merges `partialResult` into the failed `scenarioResult` using the
   same fields the successful path already uses

### D7.3 Consequences

1. failed runs keep the same report and failure-bundle surfaces as passing runs
2. rerun comparison stops depending on manual `events.ndjson` extraction
3. no second report schema is introduced

## D8. Bounded CDC / Control-Plane Diagnostics

### D8.1 Problem

The current log signatures identify the rough subsystem, but not the first
broken boundary. Multiple owners can emit failures in the same second:
CDC write, leader forward, raft propose, authoritative repair, replica-op
read, and log retention pressure.

### D8.2 Design

Add bounded structured fields only at the observed failure boundaries:

1. CDC system-table write failures
2. CDC forward rejections
3. raft propose failures
4. authoritative discovery repair failures
5. replica-operation read failures
6. logging backlog defer/requeue/drop behavior

The fields are diagnostic only and must remain bounded:

1. IDs, modes, counts, retry delays, booleans, and short summaries
2. no unbounded row payloads or large object dumps
3. reuse existing typed retry helpers where possible

### D8.3 Consequences

1. one run can identify the first broken boundary directly
2. diagnostics stay aligned with owner boundaries instead of adding a generic
   log-scraping layer
3. leak attribution can be tied to retained bounded structures

## D9. Deterministic Focused Reproducer And First-Fix Selection

### D9.1 Problem

The distributed scenario is too expensive to use as the primary debugging loop,
but the repo still needs one faithful reproducer for the failing CDC/bootstrap
path.

### D9.2 Design

Create one non-Docker integration test that exercises:

1. system-table write via CDC integration
2. leader-forward handling
3. raft propose failure or replay-buffer retry behavior

Use that test plus one authoritative distributed rerun to choose exactly one
first-fix branch.

Branch-selection rule:

1. if forward rejection is earliest, fix the forwarding owner
2. if raft propose failure is earliest with correct leader state, fix the
   message-group service propose path
3. if direct upsert fails first, fix CDC/bootstrap write ownership
4. if logging/replay retention is earliest monotonic growth, fix bounded
   retention / work-class separation first

### D9.3 Consequences

1. production fixes are evidence-driven instead of guesswork
2. only one branch is implemented in this phase
3. the rolled-back dynamic slot-reuse idea remains parked

## D10. Distributed Read Participant Attribution

### D10.1 Problem

The current distributed read path retains partition-level success/failure, but
it collapses the first failed participant to a plain error string by the time
the coordinator and discovery-repair owners log it. That makes
`DISTRIBUTED_PARTICIPANT_FAILURE` difficult to attribute to one node, table, or
pressure condition.

### D10.2 Design

Preserve one bounded participant-failure shape across fanout, aggregation, and
owner logging.

Implementation direction:

1. `ParallelQueryCoordinator` records failed-partition diagnostics alongside
   latency metrics:
   - `partitionId`
   - `participantNodeId`
   - `participantAddress`
   - `errorCode`
   - `error`
   - `durationMs`
   - `retryAfterMs`
   - `backpressured`
2. `QueryExecutor` copies those fields into `partitionErrors` and emits a
   bounded `participantFailures` summary plus `firstFailedParticipant` on
   distributed failure results.
3. Read-path owners such as `ReplicaOperationRepository` /
   `RebalanceCoordinator` log the first failed participant and a bounded
   participant list instead of only the generic distributed failure text.

### D10.3 Consequences

1. the first failed participant becomes visible in one report/log hop
2. the design stays on the canonical read path rather than adding caller-side
   inference
3. bounded participant details can also feed repair cause-chain classification

## D11. Authoritative Repair Cause Chain

### D11.1 Problem

`Authoritative discovery cache repair failed` already reports failed tables,
but it does not classify whether the underlying break was participant failure,
timeout, leader targeting, or retained replay pressure. The caller therefore
cannot distinguish root cause from downstream symptoms.

### D11.2 Design

Build one bounded `causeChain` from preserved authoritative-read diagnostics.

Implementation direction:

1. authoritative read failures are rethrown as enriched errors preserving:
   - `code`
   - `retryAfterMs`
   - `failedPartitions`
   - `partitionErrors`
   - `participantFailures`
   - `firstFailedParticipant`
2. `AdminServiceDiscovery` derives a bounded `causeChain` by classifying the
   preserved fields with stable precedence:
   - participant failure
   - timeout
   - control-plane backpressure / retry-after
   - leader-resolution gap / no-handler / no-service
   - replay backlog
3. the warning payload preserves `causeChain`, `firstFailedParticipant`, and a
   bounded `firstFailedTable` summary.

### D11.3 Consequences

1. discovery repair failures become self-explaining without free-form parsing
2. downstream read callers can tell when repair failure is upstream of their
   own warnings
3. the cause chain remains bounded and machine-readable

## D12. Retained-Object Diagnostics In Scenario Reports

### D12.1 Problem

Retained-object counters exist in owners, but failed `node-join-under-load`
reports still depend on per-node logs or bundles to expose them. That slows
leak attribution and makes the primary report incomplete.

### D12.2 Design

Reuse the control-snapshot diagnostics path rather than adding a new report
channel.

Implementation direction:

1. `AdminControlSnapshot.buildControlPlaneDiagnosticsSnapshot()` aggregates
   bounded retained-object diagnostics from:
   - `LogsTableService.getStats()`
   - local partition `getStats().cdcReplay`
2. the snapshot emits:
   - `logsTable`
   - `cdcReplay` aggregate
   - bounded `cdcReplayByPartitionId` top entries
3. `node-join-under-load` queries a control snapshot on failure and copies the
   retained-object diagnostics into `error.diagnostics.controlPlaneDiagnostics`
   using the existing failure-report path.

### D12.3 Consequences

1. failed scenario reports become sufficient for first-pass leak/backlog triage
2. the design reuses existing snapshot/report ownership boundaries
3. retained-object counters remain bounded and directly attributable

## D13. Focused Authoritative-Read Participant-Failure Reproducer

### D13.1 Problem

The existing focused repro isolates the CDC/bootstrap write path, but the
remaining earliest observable failure in the real scenario is now on the
authoritative read fanout path.

### D13.2 Design

Add one deterministic non-Docker integration test that exercises:

1. an authoritative control-plane read through the existing gateway
2. one participant-failure or timeout-shaped read failure
3. discovery repair deriving the bounded `causeChain`

The repro should use the canonical gateway / admin-service-discovery read path
and assert structured diagnostics, not free-form log matching.

### D13.3 Consequences

1. read-side diagnosis gets a fast feedback loop comparable to the existing CDC
   write-path repro
2. the implementation stays inside the canonical ownership path
3. the repo can iterate on the current earliest failure family without full
   scenario reruns for every change

## D14. Canonical Local Query-Transport Gate For Authoritative Reads

### D14.1 Problem

The earliest remaining control-plane read failures are not only about remote
participants. `QUERY` routing first depends on one local query/data-plane
transport owner. When that owner is absent or not ready, authoritative reads
still continue into routed SQL and eventually surface as generic participant
failures or connection noise instead of a direct local-ingress defer.

### D14.2 Design

Reuse the message-router query transport owner as the single readiness source
for local authoritative-read fanout.

Implementation direction:

1. `MessageRouter` exposes one bounded query-transport readiness snapshot by
   reusing `resolveQueryDataPlaneTransportSelection()` rather than duplicating
   resolver logic elsewhere.
2. `CDCIntegrationService.executeAuthoritativeSystemTableRead()` consults that
   readiness snapshot before routed SQL fallback.
3. When local query transport is not ready, the authoritative read returns a
   typed deferred failure preserving:
   - `error`
   - `errorCode`
   - `deferRetry`
   - `retryAfterMs`
   - `source = query_transport_preflight`
4. The gateway and existing diagnostics path preserve that typed result; they
   do not add a second authoritative-read path or a transport-specific
   fallback.

### D14.3 Consequences

1. local-ingress failure becomes explicit instead of masquerading as a remote
   participant failure
2. authoritative reads slow under ingress loss rather than probing a known
   unavailable path
3. the readiness decision remains owned by the canonical transport owner

## D15. Query-Transport Gating In Canonical Readiness And Diagnostics

### D15.1 Problem

Even after authoritative reads gate correctly, operators still need to see
that local query transport caused the defer. If that signal remains only in
one owner log, the system still requires log archaeology to explain scenario
pressure.

### D15.2 Design

Surface local query-transport gating through existing readiness and diagnostics
owners rather than adding a new reporting channel.

Implementation direction:

1. the canonical readiness service consumes the bounded local query-transport
   readiness snapshot for self-node evaluation only
2. compact readiness or control-plane diagnostics record whether local query
   transport was:
   - ready
   - deferred
   - unknown
3. failed authoritative-read diagnostics copy the bounded transport-gating
   fields into existing `details.diagnostics` payloads

### D15.3 Consequences

1. scenario reports can distinguish local-ingress defer from remote
   participant pressure
2. the design preserves one owner for readiness and one owner for transport
   selection
3. no second diagnostics schema is introduced

## D16. Replay-Heavy Metadata Isolation

### D16.1 Problem

The seed shows replay churn on `replica_operations`, `partitions`, `nodes`,
`services`, and `service_endpoints`. Without work-class separation, replay-only
pressure can crowd out the same critical metadata traffic needed for canonical
reads, publication convergence, and join completion.

### D16.2 Design

Keep the existing publication and pressure-governor owners, but give critical
control-plane metadata work bounded priority over replay churn.

Implementation direction:

1. classify critical control-plane metadata work separately from replay-only
   retry waves inside the existing work-class/admission machinery
2. preserve correctness for canonical metadata writes and reads first; replay
   retry loops should defer before they saturate the same bounded resources
3. export bounded diagnostics showing:
   - protected table names
   - whether replay isolation engaged
   - deferred replay counts

### D16.3 Consequences

1. hot replay partitions should stop starving canonical convergence traffic
2. the design remains inside the current publication/pressure owners
3. the next scenario rerun should show whether replay churn was a symptom or a
   dominant upstream bottleneck

## D17. Self Query-Transport-Aware Control-Plane Routing Eligibility

### D17.1 Problem

The latest rerun moved the first broken boundary to the seed's own
`ROUTER_QUERY_TRANSPORT_NOT_READY` failures on `replica_operations-p1`.
`ControlPlaneReadinessService` already captures self local query-transport
evidence, but it does not feed that evidence into the readiness dimensions that
`QueryExecutor` uses for canonical routing. The result is that the self node
can still be treated as routable and enlisted as a participant while its local
query ingress is explicitly deferred.

### D17.2 Design

Keep one readiness owner and one routing owner, but fold self local
query-transport evidence into the existing readiness dimensions used by routed
control-plane reads.

Implementation direction:

1. `ControlPlaneReadinessService` consumes the already available self
   `localQueryTransport` evidence when building readiness dimensions
2. for the self node only, negative local query-transport readiness causes the
   routed-read eligibility path to fail closed through the existing readiness
   dimensions instead of leaving the node routable
3. readiness reasons preserve one bounded reason code for local
   query-transport gating so routing denials and scenario diagnostics explain
   the self-ingress miss directly
4. `QueryExecutor` continues to filter candidates through canonical readiness;
   it does not gain a transport-specific local bypass

### D17.3 Consequences

1. routed control-plane reads stop selecting the self node before its local
   query ingress is ready
2. the system remains aligned with single-owner readiness and routing
   boundaries
3. the next scenario rerun should show whether self-ingress gating removes the
   earliest `replica_operations` participant failure or only makes a deeper
   bottleneck visible

## D18. Canonical Control-Plane Participation Contract

### D18.1 Problem

The current code still asks two different questions about the same node at the
same moment:

1. `QueryExecutor` asks whether a service row is routable for a partition read
2. `ReplicaOperationRepository` asks whether it should issue a
   `replica_operations` owner read

Both decisions ultimately depend on the same readiness owner, but only routed
partition selection currently consumes the self query-transport gate. The
owner-read path still issues routed work and discovers the same local ingress
miss too late. That is duplicated eligibility logic and it is exactly how the
latest rerun produced "deferred" and "selected anyway" from one underlying
transport state.

### D18.2 Design

Keep one readiness owner, but let it expose one explicit control-plane
participation contract for read consumers.

Implementation direction:

1. `ControlPlaneReadinessService` exposes one bounded synchronous and async
   participation decision API:
   - declared `participationKind`
   - canonical `decisionDimension`
   - outcome: `ready`, `defer`, or `blocked`
   - bounded `reasonCode`, `retryAfterMs`, and compact readiness summary
2. the first participation kinds are:
   - `routed_read`
   - `replica_operation_owner_read`
3. `QueryExecutor` consumes the participation contract for partition candidate
   selection instead of deriving routed-read eligibility from raw readiness
   snapshots on its own
4. `ReplicaOperationRepository` consumes that same participation contract
   before issuing `replica_operations` owner reads. When the local node is the
   authoritative owner and the only immediate blocker is self query-transport
   readiness, the contract exposes one bounded `localExecutionAllowed` flag so
   the repository may use the existing owner-local execution path instead of
   failing closed
5. the contract remains a thin projection over canonical readiness; it does
   not publish a second source of truth. The owner-local safe path is only an
   execution allowance on the same contract, not a parallel readiness owner

### D18.3 Consequences

1. routed reads and owner reads stop disagreeing about the same self-node
   transport defer, while the seed can still use its local authoritative owner
   read path during warming
2. the system gets a higher-level way to reason about information flow:
   durable metadata, live transport, and derived participation become one
   explicit lattice instead of repeated local conditionals
3. the next distributed rerun should tell us whether the earliest miss moves
   past self-owner `replica_operations` reads or whether remote participant
   instability remains the next dominant bottleneck

## D19. Lifecycle-Traffic-Gated READY Publication

### D19.1 Problem

The latest rerun no longer shows different consumers disagreeing about local
query-transport defers. The remaining mismatch is higher in the lifecycle:

1. joiners can still send READY-flavored `NODE_STATE_UPDATE` publication before
   the bootstrap readiness owner has reached `TRAFFIC_READY`
2. seed steady-state control-plane writers can start while the lifecycle owner
   is still inside the stable window

That is one phase-ordering bug expressed through the two READY publication
boundaries that actually matter here.

### D19.2 Design

Keep one lifecycle owner and gate the existing READY publication boundaries on
its `TRAFFIC_READY` phase.

Implementation direction:

1. add one bounded wait helper for lifecycle traffic readiness that reuses the
   existing lifecycle owner snapshot and stable-window timing
2. `NodeJoiningService` uses that helper before the ready heartbeat so the join
   checkpoint cannot advertise READY while the lifecycle owner still reports
   `JOIN_READY` or another non-ready phase
3. `BootstrapService` waits for lifecycle traffic readiness before starting the
   recurring steady-state control-plane writers, so the seed does not begin
   periodic READY publication while it is still warming
4. the initial seed registration path remains unchanged so cache hydration can
   still observe the seed's ready lease during bootstrap; the lifecycle gate
   applies only to the join ready signal and to recurring steady-state writers

### D19.3 Consequences

1. ready leases and READY `NODE_STATE_UPDATE` messages line up with the same
   lifecycle owner that drives `/readyz` and readiness diagnostics
2. joiners stop advertising READY and seeds stop recurring READY publication
   before the lifecycle owner reaches `TRAFFIC_READY`, without reopening a
   bootstrap-time deadlock around seed cache hydration
3. the next scenario rerun should tell us whether lifecycle ordering was the
   last correctness gate before the remaining control-plane pressure becomes a
   pure capacity/isolation problem

## D20. Monotonic Join Resume Over Cleaned Local State

### D20.1 Problem

The lifecycle-ready slice exposed a structural bug in join resume:

1. failed join cleanup can legitimately remove local infrastructure such as the
   message-group connection path while the durable session has already advanced
   to `MEMBERSHIP_WRITTEN`
2. `JoinCoordinator` correctly allows an already satisfied earlier step to
   rerun via `shouldRerun`
3. after that rerun succeeds, the coordinator still calls
   `advanceCheckpoint(step.checkpoint)`, which becomes a synthetic durable
   regression such as `MEMBERSHIP_WRITTEN -> JOIN_INFRASTRUCTURE_READY`

That means the coordinator currently supports local-state replay but not
monotonic durable state.

### D20.2 Design

Keep the existing join-session store and existing `shouldRerun` contract, but
preserve the highest durable checkpoint whenever an earlier satisfied step is
rerun.

Implementation direction:

1. `JoinCoordinator.run()` distinguishes three cases:
   - unsatisfied checkpoint: run the step, then advance durably
   - satisfied checkpoint with no rerun: skip
   - satisfied checkpoint with `shouldRerun === true`: rerun the step but keep
     the durable checkpoint at the current session high-water mark
2. the coordinator continues to record failures with the current persisted
   checkpoint so resume policy remains evidence-driven
3. the store keeps strict regression rejection for real non-monotonic durable
   writes; only the coordinator’s rerun path avoids issuing the regressing
   write in the first place

### D20.3 Consequences

1. retryable join resumes can rebuild cleaned local infrastructure without
   corrupting durable join progress
2. checkpoint monotonicity remains strict in the store, but the coordinator no
   longer turns a legitimate rerun into a false regression
3. the next scenario rerun should reveal whether readiness-gated join resume
   now proceeds far enough to expose the next real control-plane bottleneck

## D21. Metadata-Publication-Safe Join READY Signal

### D21.1 Problem

The monotonic-resume fix removed the synthetic checkpoint regression, but the
next rerun exposed a different structural deadlock:

1. joiners reach the ready-signal boundary with lifecycle phase
   `CONTROL_READY` and only `LEADER_METADATA_INCOMPLETE`
2. `NodeJoiningService` waits for strict `TRAFFIC_READY` before sending the
   ready heartbeat
3. that ready heartbeat is itself part of the metadata publication needed to
   clear the remaining leader-metadata blocker

So the current join ready-signal waits on a stricter state than the lifecycle
model already says is required for metadata publication.

### D21.2 Design

Keep the stricter `TRAFFIC_READY` gate for recurring steady-state writers, but
switch the one-time join ready-signal to the existing metadata-publication
readiness contract.

Implementation direction:

1. add one wait helper in `traffic-readiness-utils` that resolves when
   `isMetadataPublicationReady(readinessState)` becomes true and preserves the
   same bounded retry metadata / stable-window timing behavior as the traffic
   wait helper
2. `NodeJoiningService.signalReadyForReplicas()` uses that metadata-publication
   wait after local query-transport readiness succeeds
3. `BootstrapService.activateControlPlaneBackgroundWriters()` continues to use
   strict `waitForTrafficReadiness()` so steady-state recurring publication
   still waits for `TRAFFIC_READY`
4. diagnostics for the join ready-signal should label the gate as metadata
   publication, not strict traffic readiness

### D21.3 Consequences

1. the join ready-signal can publish the metadata that clears
   `LEADER_METADATA_INCOMPLETE` instead of deadlocking behind it
2. recurring steady-state READY writers stay aligned with the stricter
   lifecycle traffic gate
3. the next scenario rerun should tell us whether this removes the current
   inactive/warming joiner wall and exposes the next real transport or replay
   bottleneck

## D22. Gateway-Owned Owner-Local Authoritative Reads

### D22.1 Problem

The latest reruns exposed a deeper structural mismatch in the owner-read slice:

1. `ControlPlaneReadinessService` can now say a self
   `replica_operation_owner_read` is locally safe
2. `ReplicaOperationRepository` honors that allowance and stops failing closed
   before issuing the read
3. the canonical gateway path for `OWNER_LOCAL_NON_PROPAGATED` still executes
   through `sqlQueryEngine.executeQuery`, which may re-enter query/data-plane
   transport instead of taking the existing authoritative local-partition read
   owner

That means the repository can declare "local-safe" while the execution path is
still not structurally local. This is exactly the porous-boundary problem from
the doctrine: one decision, two effective ingresses.

### D22.2 Design

Keep one readiness owner and one canonical read ingress, but move the
owner-local execution choice fully into `ControlPlaneSystemTableGateway`.

Implementation direction:

1. keep `ReplicaOperationRepository` on the current gateway contract:
   - canonical participation still decides whether the read may proceed
   - the repository still issues one `OWNER_LOCAL_NON_PROPAGATED` read intent
2. change `ControlPlaneSystemTableGateway.executeOwnerLocalRead()` so it first
   uses the existing authoritative-read owner
   (`cdcIntegrationService.executeAuthoritativeSystemTableRead`) with:
   - local authoritative consistency first
   - no routed SQL fallback
   - the same bounded query options and read telemetry surface
3. only if the authoritative-read owner itself is unavailable should the
   gateway return a typed owner-not-ready failure; it should not reconstruct a
   caller-local fallback or silently route through a second ingress
4. keep all read telemetry, pressure policy, and strategy labels on the same
   gateway path so diagnostics still describe one canonical read ingress
5. update focused tests to assert the gateway, not the repository, now owns
   the true owner-local authoritative read choice

### D22.3 Consequences

1. one semantic owner-read decision now maps to one structural execution owner
   instead of "repository says local-safe, gateway still routes"
2. the system becomes easier to reason about:
   participation decides admission, gateway decides execution, authoritative
   local replicas decide data availability
3. the next focused integrations and harness rerun will tell us whether the
   remaining seed failure is only this execution-path mismatch or whether the
   deeper issue is that local authoritative `replica_operations` state is not
   actually available during seed warming
