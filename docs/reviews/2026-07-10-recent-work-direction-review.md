# Recent Work and Architectural Direction Review

Date: 2026-07-10

Primary review window: 2026-07-07 through 2026-07-10

Historical context used where the causal chain began during 2026-07-03 through
2026-07-06.

## Overall Assessment

The architectural direction is generally sound: owner-based decisions,
fail-closed proof, canonical state, deterministic tests, and explicit separation
between observation and authority are the right goals. Several recent
implementations, however, stop halfway or contradict those contracts. New
convergence features should pause until the Solver proof-integrity gap, the Raft
adapter inconsistency, and the default admin exposure are addressed.

## Highest-Priority Findings

### 1. The Solver Does Not Actually Fail Closed

`finalizeAttempt()` records an honesty violation but still appends the invalid
attempt. It also marks the frontier solved whenever `after.done` is true,
regardless of those violations:

- [`scripts/solve/loop.js`](../../scripts/solve/loop.js#L301)
- [`scripts/solve/loop.js`](../../scripts/solve/loop.js#L455)

The audit does not inspect unresolved violation events:

- [`scripts/solve/audit.js`](../../scripts/solve/audit.js#L427)

The project-hardening Quest demonstrates the problem. Its event log records an
attempt with `metricBefore: null` and `invalidSample: false` as a violation, then
accepts that attempt and closes the Quest. Its generated report simultaneously
says `SOLVED`, lists an open current blocker, and recommends another attempt:

- [`solve/log/project-hardening-proof-integrity-cutover.ndjson`](../../solve/log/project-hardening-proof-integrity-cutover.ndjson)
- [`solve/report/project-hardening-proof-integrity-cutover.md`](../../solve/report/project-hardening-proof-integrity-cutover.md#L7)

The acceptance spec also names four proof commands, while the Quest closure
scenario runs only six focused test files. It does not execute `test:static`,
`model:contracts`, or `test:fast`:

- [`solve/specs/project-hardening-proof-integrity-cutover/README.md`](../../solve/specs/project-hardening-proof-integrity-cutover/README.md#L25)
- [`scripts/run-project-hardening-proof-integrity-cutover-scenarios.js`](../../scripts/run-project-hardening-proof-integrity-cutover-scenarios.js#L7)

Recommended correction:

1. Make one validated event transition the sole owner of terminal state.
2. Reject invalid attempts from the measured event stream rather than recording
   them as ordinary attempts.
3. Make unresolved violation events fail audit.
4. Suppress blocker, continuation, and next-attempt fields in terminal reports.
5. Define one machine-readable proof manifest that both the Quest probe and CI
   execute, containing every required proof command.

### 2. The Raft Safety Fix Is Correct in SQLite but Missing from the In-Memory Adapter

The SQLite adapter now correctly preserves the committed prefix:

- [`src/raft/sqlite-log-adapter.js`](../../src/raft/sqlite-log-adapter.js#L568)

The in-memory adapter still deletes entries beyond the requested index and then
moves `committedIndex` backward when the surviving log tail falls below it:

- [`src/raft/in-memory-log-adapter.js`](../../src/raft/in-memory-log-adapter.js#L123)

This adapter is used by `MessageGroupService`, so it is not merely a toy test
implementation. Both contradictory adapter tests currently pass, demonstrating
that the test suite encodes two different safety contracts.

Raft's Leader Completeness property requires committed entries to remain durable
and prevents a later leader from overwriting them. See the
[Raft paper](https://raft.github.io/raft.pdf) and the
[etcd Raft storage contract](https://pkg.go.dev/go.etcd.io/raft/v3).

Recommended correction:

1. Define a shared log-adapter contract suite.
2. Run the same committed-prefix tests against both adapters.
3. Require every adapter to reject or clamp truncation at the committed boundary.
4. Keep compaction separate from conflict-tail truncation and require explicit
   applied/snapshot bounds for compaction.

### 3. The Helm Chart Defaults to Cluster-Reachable, Unauthenticated Admin Access

Runtime defaults are correctly loopback-only, but the chart sets
`websocketHost: 0.0.0.0` and `allowInsecureExternalBind: true` by default:

- [`charts/lagrange-node/values.yaml`](../../charts/lagrange-node/values.yaml#L18)

It then exposes port 8081 through the chart's service:

- [`charts/lagrange-node/templates/service.yaml`](../../charts/lagrange-node/templates/service.yaml#L14)

A default chart value is not meaningful operator opt-in. Although the default
service type is `ClusterIP`, the admin surface is reachable from the cluster and
includes operational and test-run capabilities. The admin authentication helpers
are not wired as a request guard for this listener.

Comparable control planes authenticate and authorize API requests, including
in-cluster callers. See
[Kubernetes authentication](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)
and
[Kubernetes authorization](https://kubernetes.io/docs/reference/access-authn-authz/authorization/).

Recommended correction:

1. Do not expose the admin port in the default chart installation.
2. Require an explicit chart value to bind externally and publish the service
   port.
3. Require real authentication, or provide a chart-owned authenticated ingress
   and restrictive NetworkPolicy before enabling exposure.
4. Restrict anonymous access, if retained at all, to health and readiness
   endpoints.

### 4. The Progress-Gated DDL Wait Has the Right Signal but the Wrong Owner and Budget Semantics

The progress-gated re-wait is conceptually better than an unconditional timeout
increase. Its implementation, however, intentionally starts fresh nested
budgets, extending one request to three times its original budget:

- [`src/query/sql-query-engine-initial-partition-provisioning.js`](../../src/query/sql-query-engine-initial-partition-provisioning.js#L707)

That contradicts the repository's canonical deadline rule that nested work must
derive from the remaining parent budget. It also lets an internal operation wait
up to 90 seconds behind a client whose default admin deadline is 30 seconds. This
mismatch has already appeared in the next-gate diagnosis.

The SQL layer also reads a rebalancer-specific operation-ledger concentration
snapshot, coupling DDL request handling to control-plane recovery internals.

Recommended correction:

1. Move progression into a durable provisioning or schema job owned by the
   reconciler.
2. Retain one end-to-end request deadline; never reset nested budgets.
3. Let SQL either await the job within its remaining deadline or return a typed
   retry/pending result with a job or operation identifier.
4. Let the provisioning owner expose normalized progress and retry information,
   not rebalancer-specific concentration details.

CockroachDB runs schema changes as resumable background jobs, while Kubernetes
controllers continuously reconcile desired and observed state:

- [CockroachDB online schema changes](https://www.cockroachlabs.com/docs/stable/online-schema-changes.html)
- [Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubernetes Jobs and deadlines](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

## Consolidation and Simplification Opportunities

### Canonical Replica Inventory, Not One Universal Scalar

The unified voter-role constant is a good change. Separating full node occupancy
from the target-count census is also correct: an orphan must continue to block
double-placement on its node while no longer pretending to satisfy the voter
target.

The remaining issue is that
[`in-flight-aware-replica-count.js`](../../src/rebalancer/in-flight-aware-replica-count.js#L6)
claims to be the sole join of committed replicas and in-flight operations, while
the topology guard independently reconstructs rows, operations, voters, learners,
and orphans:

- [`src/rebalancer/rebalance-coordinator-topology-guard-methods.js`](../../src/rebalancer/rebalance-coordinator-topology-guard-methods.js#L275)

Introduce one canonical `ReplicaInventorySnapshot` containing at least:

- voter replicas and voter nodes;
- learner and promotable-learner replicas;
- occupied nodes;
- orphan rows;
- in-flight ADD and REPLACE influence;
- source and target bindings for replacements;
- effective state after currently owned operations complete.

Keep policy selectors distinct instead of forcing every decision through one
count:

- `occupiesNode`;
- `countsTowardVoterTarget`;
- `isServeReady`;
- `isPromotable`;
- `effectiveReplicaCountAfterOperations`.

TiKV/PD follows this general shape: PD collects Region and peer state, tracks
pending operators, and then applies separate replica-count, placement, and
scheduling-pressure policies. See
[TiKV scheduling](https://tikv.org/docs/6.1/reference/architecture/scheduling/).

### Finish the Node-Trust Consolidation

The shared
[`hasLiveTransportEvidence`](../../src/control-plane/live-transport-evidence.js#L3)
atom is a worthwhile intermediate improvement. It removes duplicated raw
transport checks and prevents stale cached `connection_state` values from acting
as fresh negative evidence.

The cutover remains incomplete because the query engine still combines raw cache
rows with the live message router directly:

- [`src/query/sql-query-engine-provisioning-methods.js`](../../src/query/sql-query-engine-provisioning-methods.js#L245)

Finish the planned `NodeTrustState` or provisioning-candidate owner. SQL should
submit provisioning intent and consume a normalized decision. It should not
reconstruct membership, readiness, and transport truth.

Do not over-unify the model. Liveness, readiness, formation grace, aggregate
safety holds, and corrective-action rate limiting are distinct concerns. The
epic's estimated floor of roughly four or five primitives is reasonable. An open
socket should remain one piece of evidence, not become the definition of a
healthy or placement-ready node.

Kubernetes similarly separates node heartbeats and Lease objects from the node
controller's lifecycle actions:

- [Kubernetes nodes and heartbeats](https://kubernetes.io/docs/concepts/architecture/nodes/)

### Keep the Single-Partition Optimization, Remove the Caller-Threaded Bypass

Avoiding 2PC for a genuine single-participant write is sound. The current shape
threads `bypassSingleParticipantSystemWrite` through the rebalancer, gateway,
CDC, and query engine before the query engine checks the final partition set:

- [`src/query/sql-query-engine-write-execution.js`](../../src/query/sql-query-engine-write-execution.js#L248)

This is a cross-layer special-case flag for a decision the transaction owner can
make directly. Preserve the behavior but move the decision into the transaction
coordinator after transition mirrors and the final participant set are known.
Use an explicit commit-mode outcome such as `SINGLE_PARTICIPANT`,
`MULTI_PARTICIPANT`, or `REJECTED`, with the proper distinction between implicit
internal writes and explicit multi-statement transactions.

CockroachDB's transaction coordinator follows this ownership pattern: it tracks
the transaction's writes and selects its one-phase commit optimization when all
writes target one range. See the
[CockroachDB transaction layer](https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer/).

### Reduce Proof and Module Surface

From July 7 through July 10, the repository accumulated approximately:

- 72 commits;
- 378 changed files;
- 38,371 insertions and 7,444 deletions;
- 128 changed `solve/` files and roughly 26,600 inserted lines there;
- 16 MB under `solve/changes`;
- 52 priority-recovery or publication-recovery modules in one flat
  `src/control-plane` directory.

The strict, acyclic dependency graph is a real improvement. The semantic layers
are nevertheless difficult to see, and the proof artifacts now dominate much of
the change volume.

Recommended target structure:

```text
raw observations
      |
      v
canonical snapshot / normalized evidence
      |
      v
owner decision or state transition
      |
      v
consumer views, diagnostics, and presentation
```

Apply this both to runtime recovery and the Solver itself:

- organize priority recovery by semantic layer rather than keeping dozens of
  mutually importing files in one flat directory;
- make one canonical snapshot DTO and one reducer, with pure policy selectors;
- content-address, compress, or store attempt patches outside the main history
  instead of repeatedly committing large full-diff artifacts;
- make scope-pressure thresholds enforceable when a Quest spans dozens of owner
  areas, rather than reporting the split recommendation after the broad commit
  has already landed.

## Decisions That Should Be Kept

The following recent changes are sound and should remain:

- the SQLite committed-prefix truncation guard at the adapter boundary;
- the shared `VOTER_RAFT_ROLES` constant;
- the distinction between full occupancy and target-count census;
- excluding a durable non-voter orphan from target satisfaction while retaining
  it for one-replica-per-node safety;
- the fail-closed test-file runner for empty and skipped test execution;
- the side-effect-free package public API separated from the daemon entrypoint;
- the managed PostgreSQL listener and real-client protocol tests;
- loopback-only PostgreSQL trust mode with unsupported password, SCRAM, and TLS
  modes rejected rather than falsely advertised;
- removing the dependency-cycle allowlist and making cycle detection strict;
- reverting the hot-path repair after live aggregate regression;
- requiring controlled live A/B evidence for hot retry and recovery paths.

## Recommended Order of Work

1. Repair Solver terminal and audit integrity; replace the focused-only closure
   probe with a composite executable proof manifest.
2. Unify the committed-prefix invariant across every Raft adapter.
3. Make default chart admin exposure secure.
4. Replace synchronous, budget-resetting DDL waits with owner-managed durable
   provisioning progress.
5. Introduce the canonical replica inventory and migrate count consumers to
   explicit selectors.
6. Finish `NodeTrustState` ownership and remove raw transport/cache joins from
   SQL.
7. Move the single-participant commit decision into the transaction owner.
8. Reduce Quest artifact duplication and reorganize the priority-recovery module
   graph by semantic layer.

## Validation Performed During This Review

The following checks passed on committed HEAD during the review:

- focused five-file suite: 65 assertions passed, including both Raft adapter
  tests, the fail-closed runner, progress-gated provisioning, and live transport
  evidence;
- strict dependency-cycle check: no circular dependencies detected;
- project-hardening focused scenario: all 6 guard files passed.

These results confirm that the individual implementations execute as currently
designed. They do not remove the contract gaps described above; in particular,
the two green Raft tests currently prove contradictory adapter behavior.

## Review Boundary

No source files were changed as part of the analysis. Uncommitted Solver and
steering edits that appeared independently during the review were treated as
in-progress work and excluded from judgments about completed solutions. The
review is anchored at committed HEAD `70194d25` and the previously existing
untracked formation report.
