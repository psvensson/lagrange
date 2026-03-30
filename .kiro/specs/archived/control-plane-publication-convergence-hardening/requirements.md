# Requirements

## Summary

Rolling restart, join-under-load, seed restart, and transaction-recovery scenarios
now fail after the weaker readiness gates because the cluster still lacks one
canonical publication contract for membership and priority control-plane
recovery state. Nodes reconnect, state reporters publish updates, and
authoritative cache repair can refill observational state, but no single
owner commits a cluster-wide publication epoch that all consumers use as the
completion boundary for convergence.

This spec defines a fully implementable control-plane publication convergence
model built on the existing owner, workflow, readiness, and authoritative-read
infrastructure. The design introduces one canonical control-plane publication
artifact, a dedicated priority recovery mode, a staged readiness cutover, and
harness/admin cutovers so all distributed scenarios can converge on the same
truth under restart churn.

## Scope Alignment

This work is in scope for the AGPL repository because it is part of topology
workflow stabilization, production guarantees, operational visibility basics,
and failure simulations listed in roadmap.md and mapped to AGPL repo in
edition-matrix.md.

## Requirements

### 1. Canonical Control-Plane Publication Owner

1.1 The system MUST introduce one explicit control-plane publication owner for
membership and priority control-plane recovery publication.

1.2 The publication owner MUST derive publication state from the existing
canonical topology owners (`nodes`, `partitions`, `services`,
`replica_operations`, and transaction workflow tables) and MUST NOT become a
second topology planner or second placement owner.

1.3 The publication owner MUST persist one durable publication artifact that
captures the currently published cluster membership and publication epoch.

1.4 The publication artifact MUST be additive over the existing topology state
and MUST serve as a convergence barrier, not a replacement topology store.

1.5 Active-node, readiness, benchmark admission, restart recovery, and harness
convergence checks MUST be able to consume the published artifact without
reconstructing membership solely from repaired cache observation.

### 2. Durable Publication Epoch And Acknowledgement

2.1 Each publication cycle MUST allocate a monotonically increasing publication
epoch.

2.2 The publication artifact MUST record at least:
- publication epoch
- publication kind
- publisher node ID
- published active node IDs
- required acknowledgement node IDs
- current acknowledgement node IDs
- publication status
- source topology epoch or source version summary
- publication timestamps

2.3 Publication completion MUST require durable acknowledgement from the
required acknowledgement set, not only successful local publication.

2.4 The acknowledgement contract MUST tolerate rolling restart churn and MUST
support partial progress visibility while publication is still open.

2.5 Publication acknowledgement MUST use one canonical owner path and MUST NOT
be inferred from local cache repair success.

2.6 Publication timeout, retry, and abandonment decisions MUST use the shared
control-plane timeout-budget model rather than independent ad hoc timeouts.

### 3. Separation Of Publication From CDC Catch-Up

3.1 The system MUST support publication reads and acknowledgement reads even
when ordinary CDC replay is degraded or backlogged.

3.2 Priority publication state (`nodes`, `partitions`, `services`,
`replica_operations`, transaction workflow tables, and the new publication
artifact) MUST be readable through authoritative owner-backed reads without
requiring local cache convergence first.

3.3 Publication success MUST NOT be defined as "cache repair completed" or
"CDC backlog drained".

3.4 The design MAY continue to use CDC as the steady-state propagation path,
but convergence-critical decisions MUST be able to complete through the
publication owner and authoritative reads while CDC catch-up is still in
progress.

### 4. Priority Control-Plane Recovery Mode

4.1 The system MUST introduce an explicit priority control-plane recovery mode
that activates when any of the following hold:
- restart/rejoin recovery is active
- publication is open or degraded
- priority control-plane partitions are under-spread
- priority control-plane quorum or leader stability is not satisfied
- priority control-plane write readiness is degraded

4.2 In priority recovery mode, non-critical rebalancing and other optional
background control-plane work MUST yield to priority recovery work.

4.3 Priority recovery mode MUST focus first on restoring:
- quorum
- leader stability
- replica spread across distinct ready nodes
- publication writability
- publication acknowledgement convergence

4.4 Priority control-plane partitions MUST be treated as first-class recovery
infrastructure, not ordinary rebalancing targets.

4.5 Existing priority partition spread checks MUST be extended so they gate on
published convergence, not only local ready replica spread.

### 5. Serialized Membership And Recovery Execution

5.1 Membership publication, acknowledgement processing, and priority recovery
progression MUST run through owner-key serialized execution.

5.2 At most one publication progression execution MAY be active for a given
publication owner key at a time.

5.3 At most one priority recovery execution MAY be active for a given
partition-group or publication owner key at a time.

5.4 Durable step transitions for publication and recovery workflows MUST be
recorded through the shared durable workflow coordinator and MUST include
previous step, next step, reason, timestamp, owner key, and fence token.

5.5 Executor-side participants MUST emit outcomes through the existing
owner-key reconcile model instead of mutating publication state directly.

### 6. Staged Readiness Contract

6.1 The readiness model MUST introduce one explicit dimension for
control-plane publication convergence.

6.2 The staged readiness contract MUST distinguish at minimum:
- process alive
- cluster member healthy
- control plane writable
- metadata publication healthy
- control plane published
- control plane recovery eligible
- repair eligible
- serve eligible

6.3 `controlPlanePublished` MUST remain false until the local node can observe
the currently required publication epoch as durably published or durably
acknowledged.

6.4 `controlPlaneRecoveryEligible` MUST require the publication convergence
dimension in addition to existing writability and cluster-member requirements.

6.5 `serveEligible` and workload admission MUST continue to be stricter than
recovery eligibility and MUST NOT regress to weaker pre-publication signals.

6.6 Readiness diagnostics MUST expose the current publication epoch,
acknowledged epoch, publication status, publication mode, and recovery epoch.

### 7. Active-Node Projection And Admission Cutover

7.1 Canonical active-node projection MUST prefer the latest durable published
active-node set over reconstructed cache-only node activity.

7.2 Benchmark-ready node selection MUST use the publication convergence gate.

7.3 Restart readiness and post-restart recovery readiness MUST use the
publication convergence gate.

7.4 Harness convergence assertions MUST be updated so the success path is
based on the shared publication epoch and published active-node set rather than
per-node repaired cache derivation.

7.5 The harness MUST continue to fail when nodes disagree about the published
epoch or published active-node set.

### 8. Admin And Diagnostics Cutover

8.1 The admin control snapshot MUST expose publication diagnostics including:
- current publication epoch
- publication status
- published active node IDs
- required acknowledgement node IDs
- acknowledged node IDs
- publication owner node ID
- priority recovery mode state
- priority partition spread state

8.2 Authoritative discovery repair diagnostics MUST remain available, but the
admin surface MUST clearly distinguish repaired observation from published
convergence.

8.3 Recovery epoch history recorded by the readiness service MUST be extended
or linked so operators can correlate recovery episodes with publication epochs
and publication failures.

### 9. Resource Isolation And Budgeting

9.1 Priority recovery and publication owner reads MUST use dedicated operation
lanes or equivalent dedicated owner-scoped execution paths.

9.2 Control-plane query pressure and publication pressure MUST be surfaced as
first-class diagnostics.

9.3 The system MUST reserve bounded execution capacity for publication,
acknowledgement, and priority partition progression so these flows continue to
make progress under restart churn and background load.

9.4 Non-critical work MUST observe shared backpressure signals and defer when
priority recovery mode is active.

### 10. Verification

10.1 Unit tests MUST cover publication artifact creation, epoch monotonicity,
and acknowledgement completion.

10.2 Unit tests MUST cover readiness evaluation for the new
`controlPlanePublished` dimension.

10.3 Unit tests MUST cover active-node projection preferring the published set
when repaired cache observation is incomplete or stale.

10.4 Integration tests MUST cover rolling restart, node join under load, seed
restart under load, and transaction recovery using the new publication barrier.

10.5 Focused distributed scenarios MUST prove that priority control-plane
partitions spread, publication converges, and benchmark/workload gating no
longer depend on weaker cache-only observation.

10.6 The validation ladder MUST end with rerunning the distributed harness
matrix scenarios that were previously blocked by active-node disagreement,
priority partition under-spread, CDC backlog, and publication non-convergence.
