# Requirements Document: Node Join Under Load Cleanup

## Introduction

This spec captures the remaining hardening work exposed by recent
`node-join-under-load` runs after the bootstrap-side `services` publication
fixes landed.

The current failure boundary is no longer "join cannot complete." The join
completes, but retryable control-plane pressure still crosses the admin query
boundary as generic load failures, the harness cannot explain where time is
being spent with enough precision, and residual lifecycle noise still obscures
root-cause diagnosis.

This work is in scope under the AGPL roadmap because it strengthens Phase 0.1
internal coherence and existing operational visibility/failure-simulation
substrate rather than introducing a new product feature.

## Problem Statement

Recent investigation surfaced four recurring issues:

1. the admin query boundary still drops typed retry/defer metadata, forcing the
   harness to infer retryability from generic error text
2. load metrics expose outcomes, but not enough bounded wait-reason accounting
   to identify the dominant chokepoint quickly
3. reports and failure bundles describe symptoms, but do not estimate the
   active bottleneck or likely waiting-time source from the captured run
4. duplicate join-to-ready lifecycle touches still produce avoidable warning
   noise, which suggests a porous ownership boundary
5. retryable control-plane pressure now carries `retryAfterMs`, but the load
   harness still falls back to a local minimum backoff instead of honoring the
   server-directed cooldown window
6. when some nodes are admission-blocked, the harness keeps the original
   static per-node concurrency cap, which strands global in-flight capacity on
   the remaining healthy nodes and inflates dispatch backlog
7. failed `node-join-under-load` runs lose their structured `loadMetrics`
   payload because the scenario asserts before returning, which hides the true
   bottleneck in the report path
8. the failing CDC/bootstrap/control-plane path emits the right high-level log
   messages, but not enough stable structured fields to determine whether the
   first broken boundary is write ownership, leader forwarding, raft propose,
   discovery repair, or log/backlog retention
9. the seed-node memory leak remains unattributed; current reports show the
   leaking node but not the retained control-plane or logging structure that
   explains why memory keeps growing
10. canonical readiness now blocks authoritative control-snapshot reads when
    self query transport is deferred, but `replica_operations` owner reads and
    routed partition selection still do not consume one shared
    participation-decision contract, so different workflows can derive
    opposite eligibility answers from the same underlying state

## Goals

1. Preserve one typed control-plane pressure contract across runtime, admin
   query transport, and harness load accounting.
2. Make load wait reasons and chokepoints directly observable in reports.
3. Estimate likely bottlenecks and waiting-time sources from measured run
   metrics instead of requiring manual reconstruction.
4. Remove duplicate READY transition noise and verify the canonical lifecycle
   owner path remains singular.
5. Keep the implementation aligned with the system-guideline owner and ingress
   rules while reducing local heuristics.
6. Honor server-directed retry windows so load does not storm the same
   pressured node into timeouts.
7. Redistribute harness concurrency across dispatch-ready nodes without
   violating the global in-flight limit.
8. Preserve failed-run telemetry so scenario failures retain the same
   structured metrics/reporting surfaces as passing runs.
9. Make the CDC/bootstrap/control-plane path diagnosable with bounded
   structured fields and one deterministic focused repro.
10. Attribute the seed-node leak to one retained bounded structure or leave a
   concrete residual-risk record tied to measured counters.
11. Preserve bounded participant-failure attribution across distributed reads
   so the first failing node and table are visible without log archaeology.
12. Classify authoritative discovery-repair failures with one bounded cause
   chain so downstream symptoms do not mask the first broken boundary.
13. Surface retained-object diagnostics directly in failed scenario reports so
   leak follow-up is rooted in scenario output rather than ad hoc node logs.
14. Gate authoritative control-plane reads on canonical local query-transport
   readiness so repair traffic slows under ingress loss instead of collapsing
   into misleading participant failures.
15. Surface local query-transport gating through canonical readiness and
   diagnostics so authoritative-read defers are observable without log
   archaeology.
16. Isolate replay-heavy control-plane metadata propagation from critical
   control-plane convergence traffic so hot replay partitions do not starve
   canonical reads and writes.
17. Unify routed-read and owner-read eligibility behind one canonical
    participation contract so self-ingress and local transport defers are
    interpreted once and consumed consistently.

## Non-Goals

1. Replacing the distributed harness.
2. Building a predictive performance model that guarantees exact throughput for
   every hardware profile.
3. Adding a second diagnostics path outside the existing report/failure-bundle
   surfaces.
4. Treating log cleanup as a substitute for fixing ownership or pressure-path
   bugs.
5. Reviving the previously rolled-back dynamic slot-reuse experiment in this
   phase.
6. Adding a second authoritative read path outside the canonical query/gateway
   flow.
7. Replacing the grouped CDC/control-plane publication path with a new
   subsystem in this phase.

## Requirements

### Requirement 1: Admin Query Pressure Must Preserve Typed Retry Semantics (P0)

**User Story:** As a maintainer, I need retryable control-plane pressure to
cross the admin query boundary with stable typed fields so the harness can
defer or classify it without re-parsing error text.

#### Acceptance Criteria

1. Admin query failures SHALL preserve `errorCode`, `deferRetry`, and
   `retryAfterMs` when those fields exist in the runtime result.
2. The harness SHALL consume the typed retry/defer fields before falling back
   to message-text heuristics.
3. Retryable control-plane pressure SHALL remain visible in attempt-level
   diagnostics, but SHALL NOT be counted as hard operation failure when the
   operation was only deferred or admission-blocked.
4. Shared control-plane retry classification SHALL route through the existing
   canonical classifier instead of duplicating a second rule set in the
   harness.
5. Tests SHALL prove the typed fields survive the admin query transport and are
   used by the load generator.

### Requirement 2: Load Runs Must Expose Bounded Wait Reasons And Chokepoints (P0)

**User Story:** As a developer, I need load metrics to show where operations
waited or were blocked so I can identify whether pressure came from admission,
queueing, per-node concurrency, or query execution.

#### Acceptance Criteria

1. Load metrics SHALL record stable wait-reason counters for at least:
   - queue capacity
   - per-node slot saturation
   - admission defer or reject
   - retryable control-plane pressure
   - timeout-shaped admin query waits
2. Wait-reason accounting SHALL remain bounded and owned by the load-run state;
   it SHALL NOT require scanning unbounded log text after the run.
3. Per-node metrics SHALL expose enough detail to identify the hottest node by
   dispatch pressure and attempt-level failures.
4. Reports and failure bundles SHALL serialize the wait-reason summary.
5. Tests SHALL cover both global and per-node wait-reason accounting.

### Requirement 3: Reports Must Estimate Active Bottleneck And Waiting-Time Source (P1)

**User Story:** As an operator, I need each run report to estimate the active
bottleneck from measured signals so I can tell whether the system was
coordination-limited, queue-limited, or timeout-limited.

#### Acceptance Criteria

1. Report generation SHALL compute one bottleneck estimate from captured load
   metrics and control-plane pressure signals.
2. The estimate SHALL include:
   - dominant chokepoint class
   - primary evidence metrics
   - likely waiting-time source
3. Failure bundles SHALL include the same estimate in machine-readable and
   human-readable form.
4. The estimate SHALL be derived from existing measured signals; it SHALL NOT
   invent unsupported hardware claims.
5. Tests SHALL verify estimate generation for at least admission-dominated and
   queue-dominated sample runs.

### Requirement 4: Join Lifecycle READY Ownership Must Remain Singular (P1)

**User Story:** As a maintainer, I need duplicate READY transitions to be
suppressed at the owner boundary so join completion diagnostics stay quiet and
the lifecycle owner remains unambiguous.

#### Acceptance Criteria

1. Repeated READY transition requests SHALL be idempotent when the lifecycle is
   already READY.
2. Join completion code SHALL route through the canonical lifecycle owner
   without producing invalid-transition noise for same-state requests.
3. Tests SHALL verify the canonical owner is still used and that READY is not
   transitioned twice through parallel local logic.
4. The fix SHALL not add a fallback lifecycle path or bypass the existing owner
   dependency.

### Requirement 5: Closure Must Be Proven With Sequential Regression And Scenario Verification (P1)

**User Story:** As a developer, I need the cleanup work to close with targeted
regressions and a scenario rerun so the spec proves both boundary reduction and
observable improvement.

#### Acceptance Criteria

1. Each bug fix task SHALL begin with a failing regression.
2. Each completed task SHALL update the spec task status before the next task
   begins.
3. Closure SHALL include focused test verification for each changed owner path.
4. Closure SHALL include at least one `node-join-under-load` rerun after the
   typed pressure and instrumentation tasks land.
5. Residual risks SHALL be recorded if the scenario still fails after the
   planned tasks complete.

### Requirement 6: Load Admission Backoff Must Honor Server-Directed Retry Windows (P0)

**User Story:** As a maintainer, I need `LoadRun` to honor typed
`retryAfterMs` values from retryable control-plane pressure so the harness
slows down on the pressured node instead of probing it again too early and
turning a defer signal into real timeouts.

#### Acceptance Criteria

1. When a retryable control-plane pressure error carries `retryAfterMs`,
   `LoadRun` SHALL block that node for at least the greater of the configured
   admission-backoff floor and the typed retry window.
2. The fix SHALL remain inside the existing load-run admission state; it SHALL
   NOT add a second breaker owner or bypass node-client ownership rules.
3. Nodes SHALL remain probeable after the typed retry window expires.
4. Tests SHALL demonstrate that typed retryable participant-failure pressure
   reduces reprobe frequency relative to the local backoff floor.

### Requirement 7: Healthy Nodes Must Reuse Global Load Capacity Under Admission Pressure (P0)

**User Story:** As a maintainer, I need the load harness to let healthy nodes
borrow unused per-node concurrency budget when other nodes are temporarily
admission-blocked, so the harness does not become the dominant dispatch
backlog source during join under load.

#### Acceptance Criteria

1. When one or more nodes are admission-blocked, `LoadRun` SHALL allow the
   remaining dispatch-ready nodes to borrow unused per-node concurrency budget
   up to the existing global `maxInFlight` limit.
2. The fix SHALL preserve the global in-flight cap and SHALL NOT remove
   per-node bulkheads when all nodes remain dispatch-ready.
3. The fix SHALL remain inside the existing load-run dispatch logic; it SHALL
   NOT add a second scheduler or separate queue.
4. Tests SHALL show reduced backlog or improved dispatch throughput when a
   subset of nodes is admission-blocked.

### Requirement 8: Failed Scenario Runs Must Preserve Structured Partial Results (P0)

**User Story:** As a maintainer, I need failed `node-join-under-load` runs to
keep structured `loadMetrics` and scenario context so reports and bundles can
diagnose the real bottleneck without parsing playback artifacts manually.

#### Acceptance Criteria

1. Scenario failures after `loadRun.waitComplete()` SHALL throw an error whose
   diagnostics include a `partialResult` object with `loadMetrics`,
   `convergenceTiming`, `newNodeId`, `failurePhase`, and `dominantAssertion`.
2. The distributed runner SHALL merge `diagnostics.partialResult` into the
   failed `scenarioResult` using the existing `loadMetrics` and
   `details.diagnostics` report path.
3. Failed scenario reports SHALL still populate `loadMetrics`,
   `performanceMeasurement`, and `bottleneckEstimate` when partial results are
   present.
4. Tests SHALL verify failed runs preserve structured metrics in report and
   failure-bundle output.

### Requirement 9: CDC / Bootstrap / Control-Plane Failures Must Emit Bounded Structured Diagnostics (P0)

**User Story:** As a maintainer, I need the failing CDC/bootstrap/control-plane
owners to emit stable structured fields so I can determine the first broken
boundary directly from one run.

#### Acceptance Criteria

1. CDC write failures SHALL log bounded structured fields including at least
   `causeId`, `tableName`, `operation`, `writeMode`, `bootstrapMode`,
   `primaryKey`, `attempt`, `retryAfterMs`, and `cacheWaitTimedOut` when
   applicable.
2. CDC forward rejections SHALL log bounded structured fields including at
   least `leaderServiceId`, `leaderAddress`, `deliveryRejectedByHandler`,
   `noHandler`, `acknowledged`, `success`, `relayDepth`, `strictForwarding`,
   and `strictForwardRetryAfterMs`.
3. Raft propose failures SHALL log bounded structured fields including at
   least `isCurrentRaftLeader`, `raftState`, `leaderTargetSource`,
   `configuredRetryBudget`, and `proposeTimeoutMs`.
4. Discovery-repair and replica-operation read failures SHALL include bounded
   summaries of requested tables, failed tables, retry timing, query duration,
   row count, and backpressure state.
5. Tests SHALL verify the new structured fields on the touched owner paths.

### Requirement 10: The Failing CDC / Bootstrap Path Must Have One Deterministic Focused Reproducer (P1)

**User Story:** As a maintainer, I need one deterministic integration repro for
the failing control-plane write path so root-cause work can iterate faster than
full distributed reruns.

#### Acceptance Criteria

1. The repository SHALL include one non-Docker integration test that exercises
   a system-table write via CDC integration plus either forward rejection, raft
   propose failure, or replay/buffer retry behavior.
2. The repro SHALL deterministically produce at least one currently observed
   failure family:
   - `Failed to upsert system table row`
   - `CDC forward to leader rejected`
   - `Raft CDC command failed`
   - `Buffered CDC replay failed`
3. The test SHALL assert structured diagnostics rather than raw string-only
   output.

### Requirement 11: Seed-Node Leak Attribution Must Be Tied To Bounded Retained Structures (P1)

**User Story:** As a maintainer, I need the seed-node leak report to identify a
bounded retained structure so leak follow-up is rooted in measured ownership
instead of a generic leaking-node label.

#### Acceptance Criteria

1. Logging/backlog retention paths SHALL expose bounded counters for
   `pendingWrites`, retained-backlog growth, replay-buffer growth, or replay
   retry depth where applicable.
2. Failure reports and bundles SHALL surface those counters when present under
   control-plane diagnostics.
3. If the first production fix does not eliminate the leak, the rerun report
   SHALL still attribute the leak to one measured retained structure or record
   that attribution as unavailable with an explicit reason.

### Requirement 12: Distributed Read Failures Must Preserve Bounded Participant Attribution (P0)

**User Story:** As a maintainer, I need the first
`DISTRIBUTED_PARTICIPANT_FAILURE` on the control-plane read path to identify
which participant failed, how long it took, and whether it was already under
pressure so I can distinguish a hot participant from a generic fanout error.

#### Acceptance Criteria

1. The distributed read fanout SHALL preserve bounded participant diagnostics
   for failed partitions including at least `partitionId`, `participantNodeId`,
   `participantAddress`, `errorCode`, `error`, `durationMs`, `retryAfterMs`,
   and `backpressured` when available.
2. The query aggregation layer SHALL preserve the failed participant list and a
   bounded first-failure summary instead of collapsing failures to one generic
   error string.
3. Replica-operation query failure logs SHALL surface bounded participant
   attribution including the first failing participant and failed table name.
4. Tests SHALL verify participant attribution survives the fanout boundary and
   reaches the coordinator diagnostics.

### Requirement 13: Authoritative Discovery Repair Failures Must Emit One Bounded Cause Chain (P0)

**User Story:** As a maintainer, I need authoritative discovery-repair
failures to classify the likely first broken boundary so downstream symptoms do
not obscure whether the read path broke on participant pressure, timeout,
leader targeting, or replay retention.

#### Acceptance Criteria

1. Failed authoritative discovery repairs SHALL emit a bounded `causeChain`
   array whose entries come from a stable controlled vocabulary.
2. The cause-chain vocabulary SHALL include at least:
   - `query_participant_failure`
   - `query_timeout`
   - `control_plane_backpressure`
   - `leader_resolution_gap`
   - `replay_backlog`
3. Authoritative read failures SHALL preserve the structured fields needed to
   derive the cause chain rather than rethrowing plain `Error(message)`.
4. Tests SHALL verify at least one participant-failure case and one
   backpressure-shaped case.

### Requirement 14: Failed Scenario Reports Must Surface Retained-Object Diagnostics (P0)

**User Story:** As a maintainer, I need failed `node-join-under-load` reports
to carry retained-object diagnostics directly so leak and backlog investigation
starts from the report, not from per-node log scraping.

#### Acceptance Criteria

1. Control snapshots SHALL expose bounded retained-object diagnostics for at
   least:
   - logs-table pending/deferred backlog counters
   - local CDC replay-buffer counters
2. `node-join-under-load` failure diagnostics SHALL copy those retained-object
   diagnostics into the existing `details.diagnostics.controlPlaneDiagnostics`
   path.
3. Report and failure-bundle generation SHALL preserve the retained-object
   diagnostics without introducing a second schema.
4. Tests SHALL verify failed scenario diagnostics include the retained-object
   counters when control snapshots expose them.

### Requirement 15: The Repository Must Include One Focused Authoritative-Read Participant-Failure Reproducer (P1)

**User Story:** As a maintainer, I need one deterministic focused repro for
authoritative read fanout under one overloaded participant so I can iterate on
the remaining read-side failure family without rerunning the full distributed
scenario.

#### Acceptance Criteria

1. The repository SHALL include one non-Docker integration test that exercises
   authoritative control-plane reading through the canonical read path while
   one participant fails or times out.
2. The repro SHALL assert the bounded participant diagnostics and the derived
   discovery-repair cause chain rather than raw string fragments only.
3. The repro SHALL not add a second read path or bypass the existing gateway /
   query-owner ownership boundaries.

### Requirement 16: Authoritative Reads Must Gate On Local Query-Transport Readiness (P0)

**User Story:** As a maintainer, I need authoritative control-plane reads to
fail closed with typed defer metadata when the canonical local query/data-plane
transport owner is not ready, so repair traffic waits instead of fanning out
through a known-broken ingress path.

#### Acceptance Criteria

1. The canonical query/data-plane transport owner SHALL expose one bounded
   readiness snapshot derived from the existing resolver or selection path
   rather than a duplicate readiness implementation.
2. Authoritative control-plane reads SHALL consult that owner before routed SQL
   fanout and SHALL return a typed deferred failure when the local query
   transport is not ready.
3. The deferred failure SHALL preserve stable fields including `errorCode`,
   `deferRetry`, `retryAfterMs`, and one bounded owner reason.
4. The fix SHALL remain within the canonical read owner path; it SHALL NOT add
   a second authoritative read mechanism or a transport-specific fallback path.
5. Tests SHALL prove authoritative reads defer before routed fanout when local
   query transport readiness is negative.

### Requirement 17: Local Query-Transport Gating Must Be Visible Through Readiness And Diagnostics (P1)

**User Story:** As a maintainer, I need canonical readiness and scenario
diagnostics to show when local query transport blocked authoritative reads, so
control-plane read gating is observable without reconstructing node logs.

#### Acceptance Criteria

1. Canonical readiness or compact diagnostics SHALL surface whether local
   query/data-plane transport was ready, unknown, or deferred when that
   evidence is available locally.
2. Failed authoritative read diagnostics SHALL include bounded local transport
   gating context without introducing a second report schema.
3. The implementation SHALL reuse the canonical query-transport owner rather
   than duplicating resolver logic in reporting code.
4. Tests SHALL verify the readiness or diagnostics surface reflects
   transport-gated authoritative-read defers.

### Requirement 18: Replay-Heavy Metadata Propagation Must Not Starve Critical Control-Plane Traffic (P1)

**User Story:** As a maintainer, I need replay-heavy metadata publication on
hot control-plane tables to degrade in a bounded class before it starves
critical control-plane convergence reads and writes.

#### Acceptance Criteria

1. Critical control-plane metadata tables SHALL have a bounded protected work
   path or admission class that outranks replay-only churn.
2. Replay or backlog isolation SHALL remain within the existing owner and
   work-class machinery; it SHALL NOT introduce a parallel publication
   subsystem.
3. Diagnostics SHALL expose when replay isolation engaged and which protected
   tables were involved.
4. Tests SHALL reproduce replay pressure on hot control-plane tables and prove
   critical control-plane work is admitted first.

### Requirement 19: Self Query-Transport Readiness Must Gate Canonical Control-Plane Routing Eligibility (P0)

**User Story:** As a maintainer, I need the canonical readiness owner to mark
the self node ineligible for routed control-plane reads while its own local
query/data-plane transport is deferred, so distributed control-plane queries
do not route into a known-broken self ingress path.

#### Acceptance Criteria

1. Canonical readiness for the self node SHALL treat locally observed
   query/data-plane transport unavailability as a routing-eligibility miss for
   routed control-plane read consumers.
2. The readiness snapshot SHALL preserve one bounded reason identifying local
   query-transport gating instead of collapsing it into generic routing noise.
3. `QueryExecutor` and other routing consumers SHALL benefit through the
   existing readiness owner path; the fix SHALL NOT add a transport-specific
   local query fallback or a second participant-selection owner.
4. Tests SHALL prove self-node routed query candidates are filtered while local
   query transport is deferred and recover once the canonical readiness owner
   reports eligibility again.

### Requirement 20: Routed Reads And Owner Reads Must Share One Canonical Control-Plane Participation Contract (P0)

**User Story:** As a maintainer, I need routed partition reads and
`replica_operations` owner reads to consume one canonical participation
decision so the same local transport defer cannot be treated as both
"ineligible" and "routable" by different workflows.

#### Acceptance Criteria

1. The canonical readiness owner SHALL expose one participation-decision
   contract that returns a bounded `ready`, `defer`, or `blocked` outcome for
   a declared control-plane work kind.
2. `QueryExecutor` SHALL consume that participation contract for routed
   control-plane reads instead of rebuilding routed-read eligibility directly
   from the raw readiness snapshot.
3. `ReplicaOperationRepository` owner reads SHALL consume that same
   participation contract before issuing `replica_operations` reads. When the
   local seed/self owner is authoritative and only the local query transport is
   deferred, the same contract SHALL explicitly allow one owner-local safe
   execution path instead of forcing a routed defer.
4. The shared contract SHALL preserve bounded typed defer metadata,
   `retryAfterMs`, and a stable readiness reason code when participation is
   deferred.
5. The fix SHALL remain within the existing readiness owner and existing read
   owners; it SHALL NOT add a second readiness subsystem. Any owner-local safe
   execution allowance SHALL be surfaced through the same canonical
   participation contract, not by a parallel readiness path.
6. Tests SHALL prove the same contract governs both routed candidate
   selection and `replica_operations` owner-read admission.

### Requirement 21: Lifecycle Traffic Readiness Must Gate READY Publication And Steady-State Control-Plane Writers (P0)

**User Story:** As a maintainer, I need READY heartbeats and steady-state
control-plane writers to respect the same lifecycle traffic-readiness phase as
the bootstrap readiness owner, so nodes do not publish ready leases or steady
READY updates while they are still warming behind the local query transport and
stable-window barriers.

#### Acceptance Criteria

1. Join ready-heartbeat publication SHALL wait for lifecycle traffic readiness
   instead of depending only on local query-transport readiness.
2. Seed steady-state control-plane writers SHALL wait for lifecycle traffic
   readiness before starting recurring READY publication.
3. The implementation SHALL reuse the existing lifecycle owner and existing
   ready-publication entry points; it SHALL NOT add a second lifecycle
   subsystem or a special-case ready-publication bypass.
4. Tests SHALL prove join ready-signal gating and seed background-writer
   activation both follow the same lifecycle traffic-readiness contract.

### Requirement 22: Retryable Join Resume Must Preserve The Highest Durable Checkpoint (P0)

**User Story:** As a maintainer, I need retryable join resumes to rerun lost
local infrastructure safely without demoting the durable join-session
checkpoint, so cleanup-driven local-state refresh cannot fail the join with a
synthetic checkpoint regression.

#### Acceptance Criteria

1. When a retryable join resume reruns a previously satisfied earlier
   checkpoint because local state was cleaned up, the durable join session
   SHALL preserve its highest satisfied checkpoint.
2. `JoinCoordinator` SHALL support rerunning an earlier satisfied step through
   `shouldRerun` without calling `advanceCheckpoint` with a lower checkpoint
   than the already persisted session state.
3. The implementation SHALL remain within the existing join-session store and
   coordinator; it SHALL NOT add a second resume subsystem or permit true
   checkpoint regression in durable state.
4. Tests SHALL reproduce a resume that reruns
   `JOIN_INFRASTRUCTURE_READY` after `MEMBERSHIP_WRITTEN` and prove the
   session remains at `MEMBERSHIP_WRITTEN` while later steps can continue.

### Requirement 23: Join READY Publication Must Use Metadata-Publication Readiness, Not Full Traffic Readiness (P0)

**User Story:** As a maintainer, I need the one-time join ready-signal to wait
only for metadata-publication-safe lifecycle states, so it can publish the
lease/heartbeat information needed to finish leader metadata convergence
without waiting on the stricter steady-state traffic-ready phase.

#### Acceptance Criteria

1. The join ready-signal SHALL open when the lifecycle owner reports a
   metadata-publication-safe state, including `CONTROL_READY` with only
   `LEADER_METADATA_INCOMPLETE` and `JOIN_READY` with only
   `READINESS_STABLE_WINDOW_PENDING`.
2. The seed's recurring steady-state control-plane writers SHALL remain gated
   on strict `TRAFFIC_READY`; this slice SHALL NOT relax that steady-state
   writer gate.
3. The implementation SHALL reuse the existing lifecycle owner and existing
   metadata-publication readiness utility; it SHALL NOT add a second readiness
   lattice or special-case the join path with raw reason parsing outside that
   owner.
4. Tests SHALL prove the join ready-signal no longer deadlocks on
   `CONTROL_READY` plus `LEADER_METADATA_INCOMPLETE` and that the metadata
   publication helper preserves the bounded ready/open states.

### Requirement 24: Owner-Local Authoritative Read Execution Must Be Chosen Inside The Canonical Gateway (P0)

**User Story:** As a maintainer, I need the canonical control-plane gateway to
choose true owner-local authoritative execution for seed/self
`replica_operations` reads, so local-safe participation does not still route
back through query/data-plane transport and recreate the same ingress failure.

#### Acceptance Criteria

1. `ControlPlaneSystemTableGateway` SHALL own the choice between:
   - direct owner-local authoritative read
   - canonical authoritative routed read
   - other existing gateway strategies
   for the declared read strategy, rather than depending on callers to infer
   whether a "local-safe" allowance became a true local execution path.
2. The `OWNER_LOCAL_NON_PROPAGATED` read strategy SHALL prefer existing local
   authoritative system-partition replicas through the current CDC /
   authoritative-read owner before any query-engine path that may route over
   query/data-plane transport.
3. When owner-local authoritative rows are unavailable, the gateway SHALL fail
   closed with the same bounded typed owner-read result instead of silently
   introducing a second caller-owned fallback path.
4. `ReplicaOperationRepository` SHALL keep submitting the same canonical
   owner-read intent through the gateway; it SHALL NOT gain a second direct
   local query helper or a new read ingress.
5. The implementation SHALL remain within the existing gateway and existing
   authoritative-read owner; it SHALL NOT add a new bootstrap-only runtime
   bypass or a second readiness subsystem.
6. Tests SHALL prove the gateway uses the authoritative local-read owner for
   `OWNER_LOCAL_NON_PROPAGATED` reads, preserves typed failure when local
   authoritative state is unavailable, and keeps `replica_operations` owner
   reads on the canonical gateway path.
