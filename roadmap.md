---
audience: human
documentClass: planning
---

# Lagrange Roadmap

Lagrange is one product: a distributed runtime for data-intensive services,
backed by partitioned and replicated SQL storage.

This is one ordered release programme. Each planned deliverable has one version
that owns its initial completion, including its research, documentation and
acceptance evidence. Later versions name the extension or stronger guarantee
they add. Independent bounded implementation may proceed concurrently when its
consumed contracts are defined. One writer owns each changing interaction;
dependent changes integrate in order and publication follows one release train.

The latest GitHub published release is **0.3.3**, and the current development
source on main is **0.4.0 (experimental alpha)**. **0.4 (Practical and
demonstrated service core) is the active milestone**, incorporating the remaining
0.3.1/0.3.2 queryable-core obligations along with the complete developer-journey
and measured-comparison obligations. The package version 0.4.0 on main does not
imply that 0.4 milestone acceptance is complete. Version targets express scope
and priority, not shipping dates or claims of current support.
Use [Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md)
for availability and [CHANGELOG.md](CHANGELOG.md) for released changes.

## Release sequence

| Version | Milestone | Completion outcome |
| --- | --- | --- |
| 0.3.1 | Installed-product and claim corrections | Selected artifact/startup/publication repairs work for their advertised use; declarations identify remaining incomplete features. |
| 0.3.2 | Queryable Core completion | Ordinary SQL, indexes, locking reads and live results have working public journeys on one candidate, with inherited stable-core and bounded service evidence. |
| 0.4 | Practical and demonstrated service core | Active milestone incorporating remaining 0.3.1/0.3.2 queryable-core deliverables, the complete developer journey, and reproducible multi-machine measured comparisons. |
| 0.5 | Pilot-ready operation | A secure deployment can be installed, operated, recovered and evaluated within a measured pilot envelope. |
| 0.6 | Native OCI Call Cells | Real managed native services execute functions at the data through the same service model. |
| 0.7 | Transport independence and NATS | Complete NATS-only cluster operation and effective Raft timing profiles follow a measured transport baseline. |
| 0.8 | Veilid-only networking | The complete cluster workload works over Veilid alone within a measured envelope. |
| 0.9 | Customer-installable service products | A separately released service completes installation, operation, upgrade, rollback and removal through one lifecycle. |
| 1.0 | Production-supported release | Named profiles have supported correctness, durability, recovery, compatibility and capacity guarantees. |
| 1.1 | Broader SQL compatibility | Additional SQL and ordered-index features preserve the established distributed contracts. |
| 1.2 | Enterprise deployment and cross-region operation | Assigned enterprise identity, policy, secrets and cross-region profiles have explicit support contracts. |
| 2.0 | Deeper distributed execution and planning | Dynamic multi-stage execution, advanced planning and the complete Scenario B comparison are demonstrated. |
| 2.1 | Specialized search services | Vector, full-text, spatial and related services have their own semantics, lifecycle and acceptance. |

Major product capabilities require a tangible, credible journey through their
ordinary public entrypoint and real production composition. Existing applicable
evidence is reused; a bounded repair can complete while a wider feature remains
open with a named owner. Publication alone does not complete a feature.

Target the bounded 0.3.1 correction candidate in the next several working days,
subject to its acceptance. Review the integrated candidate, passing journeys and
first blockers by 6 November 2026; use observed repair, review and integration
throughput by 13 November to set or revise 0.3.2 and 0.4 windows. These are review
horizons, not shipping promises or waiting periods. Independent 0.4 and 0.5 work
can advance without creating another release sequence.

## Released - 0.1 Internal coherence

The earlier phase established the transaction, schema-migration and split/merge
foundations, including recovery, typed split-key comparison, durable dissolution
witnesses, fenced abort behavior and the split/merge overlap guard. Current
support remains bounded by the capability declaration.

## Released - 0.2 Foundation through 0.2.8

[0.2.6](https://github.com/psvensson/lagrange/releases/tag/v0.2.6) shipped the
raft-rs consensus cutover through WASM, replicated transaction decisions and
participant apply, fresh-identity message-group replacement, durable boot
incarnations and generation-fenced replica lifecycle, and automatic user-partition
snapshot compaction and follower reconstruction.

0.2.7 added SQL/routing, ingress, runtime-bound, packaging and developer-workflow
repairs, but publication reached npm before its Docker build failed.
[0.2.8](https://github.com/psvensson/lagrange/releases/tag/v0.2.8) repaired the
Docker build context and release-proof recording/reuse. Improved service
scaffolding, package authoring and onboarding are part of this baseline.

Published alpha artifacts do not establish general production support or close
every stabilization obligation. User-partition replica repair is distinct from
control-plane/message-group log coverage and from a user backup/PITR product.

## Released - 0.3.0 implementation baseline

[0.3.0](https://github.com/psvensson/lagrange/releases/tag/v0.3.0) is the published
baseline for completing Queryable Core. Credit its delivered implementation
without inferring that every public journey or inherited stabilization obligation
passed. [PR #151](https://github.com/psvensson/lagrange/pull/151) subsequently
merged the Scenario A framework and runtime corrections onto main. That work is
part of the next candidate; historical branch receipts do not certify it.

## Milestone - 0.3.1 Installed-product and claim corrections

0.3.1 addressed selected installed-startup, artifact and publication corrections.
With the published release at 0.3.3 and development on main at 0.4.0, remaining
queryable-core and stabilization obligations are carried forward into the active
0.4 milestone. A new evaluator must be able to install a supported distribution,
boot it, create/read data and restart within the advertised correction-release
scope. Check the installed authoring package through its documented build and
basic deployment path.

Verify immutable published artifact identities, consumer startup and Docker Hub
documentation readback, including honest pending or failed publication outcomes.
Correct current capability and operating declarations, and adopt the standing
major-feature user-journey requirement. Reuse valid evidence and shared setup;
the retrospective inventory does not make every historical feature a new gate.

Independently proved bounded SQL or feature repairs may ship here. This release
does not close all Queryable Core axes, the full distributed service journey or
the remaining stable-core acceptance. Those obligations remain visible for
0.3.2 with their original owners and evidence.

## Milestone - 0.3.2 Queryable Core completion

Ordinary SQL should reach the right data efficiently without physical-partition
knowledge. Remaining 0.3.2 Queryable Core obligations - including routing, indexes,
locking reads, and live queries - are carried forward and incorporated into the
active 0.4 milestone. First define the supported key/row-identity and read-visibility
contracts shared by routing, indexes, locking reads and live-query startup.
Consume what stabilization actually delivered rather than repeat completed
ordering or transaction repairs. Changing an access path must preserve the
query's promised result semantics; this does not imply global snapshot isolation
or serializability.

The milestone has four outcomes:

1. **Correct keys and routing:** one type-aware persisted key/tuple order, exact
   supported value representation, a boundary revalidation/upgrade policy, and
   declared/compound primary-key narrowing beyond an implicit `id` convention.
2. **Usable indexes:** ordinary and compound local B-tree `CREATE INDEX` /
   `DROP INDEX`; non-unique global indexes as partitioned, Raft-replicated
   datasets; resumable backfill, readable activation, failure, restart and drop;
   correct left-prefix/equality-prefix-plus-range matching; and selection or
   rejection explained by `EXPLAIN DISTRIBUTED`.
3. **Real locking transactions:** preserve `SELECT ... FOR UPDATE` through the
   canonical SQL path and enforce reservations through the transaction owners,
   with the supported fail-fast contention, cancellation, release and recovery
   contract. Broader waiting and locking modes require their own scope decision.
4. **Live application results:** ordinary SQL owns query identity and future
   dependencies, including changes entering an initially empty result; relevant
   partition CDC drives updates and equivalent local interests are coalesced.
   Startup, reconnect and topology changes preserve a proven result/frontier
   boundary or produce an explicit reset.

0.3.2 owns completion of the global-index maintenance decision and its proof.
Current research favors synchronous TX1 maintenance for ordinary non-unique
indexes, conditional on read completeness and measured contention, fanout and
write-availability cost.
Reconcile the existing implementation with one explicitly sealed maintenance
decision through its current owner; a recommendation or component implementation
alone does not establish full acceptance. Incomplete read paths fall back safely.
Required transactional maintenance can refuse a write when unavailable; it cannot silently omit index
updates. Global uniqueness belongs to 1.0.

Live queries discover changes without polling. Safe plans emit incremental row
deltas; more complex plans may re-execute/reset in response to committed events.
Idle observation performs no repeated data reads to discover change. Consumer
cleanup, pressure and split/merge/leader transitions are part of the contract.

Completion is demonstrated through declared-key lifecycle, indexed query and
build recovery, public locking-transaction, and remote live-view journeys on one
identified candidate. The existing stabilization owners also complete remaining
SQL/retry/unknown-outcome, internal-ingress, retained-history, diagnostic and
queue-bound obligations, plus the existing bounded public distributed WASI
service journey. Its service contract does not gain 0.4's expanded features here.

Use the merged Scenario A workload as a current-candidate semantic regression
with honest performance observations. Full comparative qualification remains
0.4; defects in the current promised SQL/transaction behavior cannot be deferred
to that comparison. Relevant restart, concurrency, topology and pressure cases
must preserve useful progress and cleanup through the actual public owners. See
[PostgreSQL Locking Reads](architecture/postgres-locking-reads.md),
[Live Query Data Plane](architecture/live-query-data-plane.md), and
[Execution Semantics](docs/execution-semantics.md).

## Active - 0.4 Practical and demonstrated service core

0.4 is the active milestone on main (package source 0.4.0, experimental alpha;
latest GitHub published release is 0.3.3). Package version 0.4.0 on main does not
imply 0.4 acceptance is complete. This milestone incorporates the complete
developer-journey and measured-comparison obligations alongside the remaining
0.3.1/0.3.2 queryable-core deliverables.

Make the code-first WASM service path useful for larger inputs and richer
operations, then measure the declared configuration reproducibly.

- Narrow selectors safely from call arguments.
- Page or stream inputs beyond one bounded shard batch through an explicit
  contract with bounded memory, cancellation and pressure behavior.
- Support bounded structured partials and multi-operation service dispatch.
- Publish multi-machine public HTTP-to-distributed-service measurements and a
  controlled conventional-baseline comparison for the supported workload.
- Complete the common Scenario A semantic proof and publish the first qualified
  TiDB/TiKV ordinary-SQL comparison with an independent oracle, equivalent
  durability, full resource accounting and repeated paired measurements.

A valid slower Lagrange result still completes the comparative measurement.
Claims name their source, workload, topology and limitations. These measurements
do not substitute for 0.5's full secure pilot/failure certification. Input paging
within one operation belongs here; multi-stage exchange and the complete dynamic
Scenario B comparison belong to 2.0. See
[Execution Semantics](docs/execution-semantics.md) and the
[comparative workload contract](https://github.com/psvensson/lagrange/blob/a43ce6a9fe3c2ffd17fcb084e596a0c709ba88c9/docs/benchmarks/tidb-reference-scenarios.md).

## Planned - 0.5 Pilot-ready operation

A developer can install, load data, deploy a service, connect supported SQL
clients, diagnose failure and rehearse recovery within a measured pilot profile.

- Cryptographically authenticate and encrypt node communication on the supported
  transport; this requirement does not wait for NATS or Veilid.
- Complete cluster/CLI onboarding, service development and debugging workflows.
- Document and exercise data load, shadowing, cutover, rollback and exit tooling.
- Certify named PostgreSQL-driver/SQL profiles, supported release-pair upgrade
  and downgrade procedures, and a topology/capacity/failure-domain envelope.
- Qualify the bounded retained-log and message-group mechanisms completed in
  0.3.2 under the declared pilot topology, load, soak and recovery profile.
- Provide one operational view of requests, shard runs, placement, retries and
  failures, plus index build/state and live-query dependency/frontier diagnostics.

Completion includes a fresh-install journey and failure, recovery, upgrade and
exit rehearsals. The production backup/PITR service is assigned to 1.0 in its
commercial implementation home; pilot recovery limitations and independent
export/reload procedures must already be explicit here. See
[Operations Readiness](docs/operations-readiness.md),
[Migration and Adoption](docs/migration.md), and [Security](docs/security.md).

At this milestone, choose the first intended production workload and review
whether OCI and every alternative transport must precede 1.0. The current
0.6-0.9 allocations remain chronological predecessors. Accelerating 1.0 requires
an explicit coordinated version reallocation; this review alone moves no work.

## Planned - 0.6 Native OCI Call Cells

Run code with genuine native dependencies at the selected data through the
existing Artifact / Binding / Cell model. This release owns both minimum safe
managed OCI activation and the native invocation path.

- Verify signed immutable package/revision identity, compatibility, dependencies
  and required configuration before activation.
- Pull, start, inspect, health-check, restart, replace, stop and remove the exact
  revision through one lifecycle, with diagnostics and desired-state reconciliation.
- Provide a code-first native SDK and authenticated application-initiated broker
  channel; handler-originated and direct calls converge on the existing
  distributed invocation owner.
- Preserve bounded context, identity, deadlines, emit/reduce, nested calls and
  typed failures across WASM and OCI, including necessary request continuity
  and duplicate-effect protection.
- Read each shard's local partition replica before native execution. Keep loaded
  models, process globals and native heaps disposable warm cache.
- Prove worker-loss/retry ambiguity honestly: managed result visibility does not
  make arbitrary external side effects exactly-once.

Completion requires a multi-node genuine-native-library workload and a second
materially different language/runtime. The OCI host agent remains lifecycle-only;
it does not own partition routing, scheduling or retries. 0.9 extends this
working substrate into the complete customer service-product lifecycle. See
[Native OCI Call Cells](architecture/native-oci-call-cells.md).

## Planned - 0.7 Transport independence and NATS

Complete the networking work in dependency order within this release:

1. Finish N0's physical baseline, including traffic attribution, per-peer timing,
   pressure and desired-versus-effective Raft timing observations.
2. Establish N1's narrow peer-link boundary while preserving WebSocket semantics
   and one routing/delivery owner.
3. Prove NATS-only formation, SQL/service calls, replication, CDC, snapshot/bulk
   transfer, split/merge, restart, broker loss and seed-loss recovery.
4. Prove effective configurable static Raft timing profiles for the supported
   workload and latency envelope.

The selected transport carries the complete workload with no hidden inter-node
fallback. Completion includes inherited security, bounded pressure/bulk behavior
and physical failure/recovery evidence. Existing component measurements are
inputs, not full baseline certification. The preserved
[networking preparation](https://github.com/psvensson/lagrange/pull/145) must be
reconciled with consumed owner contracts during integration and with the
accepted predecessor baseline for milestone acceptance.

## Planned - 0.8 Veilid-only networking

Consume 0.7's transport and timing contracts to deliver standalone Veilid
operation: bounded small-frame and bulk transfer, private-route lifecycle,
identity, cancellation, pressure and complete cluster workload support.

Completion requires formation, SQL/services, replication, CDC, snapshot catch-up,
topology change, restart and route-loss recovery over Veilid alone, plus measured
resource, latency and failure bounds. NATS or WebSocket is not a required
inter-node fallback. Backend availability does not establish the cross-region
support profiles assigned to 1.2.

## Planned - 0.9 Customer-installable service products

A signed separately released service can be installed and operated without a
repository checkout or a second service manager. Consume the working lifecycle
and native execution delivered in 0.6 and complete:

- one idempotent install/status/remove/upgrade surface, with health-gated rollout
  and rollback to a known-good immutable revision;
- stable configuration, diagnostics and metrics contribution contracts;
- customer-inspectable support bundles with bounded content and redaction;
- customer-controlled telemetry/export plumbing, independent of licensing;
- mirrored and air-gapped artifact acquisition; and
- commercial entitlement and secret-reference integration contracts with typed
  unavailable/refusal behavior where the selected edition lacks a provider.

Completion uses a real separately released service: install, become ready,
survive restart, diagnose failure, upgrade, roll back and remove without unmanaged
state. Shared substrate remains Community; paid implementations retain their
assigned homes. Broader enterprise providers belong to 1.2. Service choice does
not silently classify Lagrange AI or another unclassified product.

## Planned - 1.0 Production-supported release

Support named configurations with explicit, evidenced guarantees:

- durability, availability, consistency, recovery, balance and capacity contracts;
- stable service, SQL, upgrade and support policies;
- security appropriate to the declared network and tenancy model;
- supported backup/restore/PITR and measured disaster-recovery procedures in
  their assigned implementation homes; replica snapshots are not user backups;
- unique global secondary indexes with transactional uniqueness enforcement;
- supported index rebuild/backfill, restart/failover and write-amplification
  envelopes; and
- stable tuple-order, NULL, type and collation semantics exposed through SQL
  metadata and constraints.

Completion requires representative certification on named hardware/workloads and
measured recovery objectives. Support names the qualified transport profiles and
distinguishes availability from certification. 0.3.2 may already supply synchronous
non-unique maintenance; 1.0 adds uniqueness and production guarantees. Installed
services consume the 0.6/0.9 lifecycle and gain production compatibility,
diagnostics, support and operating guarantees.

## Planned - 1.1 Broader SQL compatibility

Expand the established contracts with partial and expression indexes,
`INCLUDE`/covering indexes and index-only scans, richer collation/operator
semantics, and broader PostgreSQL catalog/DDL compatibility, including supported
concurrent build behavior, window functions and sequences. Each admitted feature
needs public SQL and lifecycle evidence; the enumerated compatibility profile is
the completion boundary.

## Planned - 1.2 Enterprise deployment and cross-region operation

Deliver the assigned enterprise identity/SSO, policy/RBAC, tenant isolation and
quota controls, advanced secrets/KMS integrations, and named cross-region
replication, durability and recovery profiles in their designated implementation
homes. Consume 0.9's integration contracts and 1.0's support discipline.

Completion names supported identity providers, tenancy boundaries, region and
failure-domain configurations, and measured recovery/security behavior. These
features do not replace 0.5's basic security. The
[Edition Matrix](edition-matrix.md) continues to govern repository ownership.

## Planned - 2.0 Deeper distributed execution and planning

Extend the same service model with multi-stage plans, streaming exchange and
backpressure, deeper dynamic call composition, concurrent Cell invocations,
planner-initiated pushdown, richer typed SDKs, and provider-aware placement/cost
modeling. This release also owns keyed invocation and non-request source
extensions, richer external service/registry APIs and the native artifact-store
substrate beyond the earlier installation requirements.

Optional mixed-backend selection and adaptive network/timing policies belong to
this release, extending the independently qualified single-backend contracts.

Planning adds statistics/cardinality estimates, cost-based index selection,
index intersection/union and bitmap-style access, query hints and advisor tooling.

The complete Scenario B comparison is part of acceptance: data-dependent
sequential and fan-out graphs, strong valid TiDB/TiKV comparators, controlled
topology cost, movement, equivalent resource accounting and repeated paired
measurements. Implement the required composition first, then publish the result
even if it does not demonstrate the hoped-for advantage. Earlier bounded
demonstrations do not satisfy this full contract. See the
[Scenario B workload](https://github.com/psvensson/lagrange/blob/3b737ce7e1c818194f8188297dd175f6135e271e/docs/benchmarks/tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision).

## Planned - 2.1 Specialized search services

Deliver vector, full-text, spatial, embedding and related search capabilities as
explicitly classified services or access-path families. They retain their own
query, storage, update and recovery semantics rather than stretching the ordinary
ordered B-tree contract.

Completion requires public query behavior, installation/build/update/drop
lifecycle, restart/failure and representative performance evidence for each
admitted family. Edition and implementation-home classification must precede
implementation of any unclassified data-local AI service.
