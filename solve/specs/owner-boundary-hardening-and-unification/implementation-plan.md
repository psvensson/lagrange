# Owner-Boundary Hardening and Unification — Implementation Plan

Date: 2026-07-10

Status: revision 10, program complete; final program re-audit approved

Epic:
[`solve/epics/owner-boundary-hardening-and-unification.md`](../../epics/owner-boundary-hardening-and-unification.md)

## Result

The reviewed integrity, durability, deadline, security, ownership, transaction,
and repository-surface gaps are closed by bounded Quests with executable
evidence. Each cutover has one authority, preserves distinctions that carry
safety meaning, and deletes the superseded path before closure.

## Program Invariants

1. A Quest can become terminal only from accepted measured evidence. Honest
   non-measurements remain bounded retry evidence; malformed, identity, or
   honesty failures are unresolved violations that block audit and closure.
2. No Raft mutator can delete, replace, or change the identity of a committed
   entry. Compaction is a separate snapshot-covered transition.
3. A default chart render neither wildcard-binds nor publishes the admin
   listener. No chart value can claim that an unauthenticated path is protected.
4. Nested work derives from the remaining parent deadline and cannot reset it.
5. `ControlPlaneReadinessService` is the readiness owner. Observer-local trust
   evidence is not replicated global truth.
6. Replica inventory owns occupancy and voter-target accounting only. It
   consumes readiness and catch-up classifications from their owners.
7. `TableCreationService` owns durable provisioning intent and projects the
   shared `OwnerContractOutcome` vocabulary.
8. Active explicit transactions always enlist participants. The coordinator
   selects one- or two-phase commit only after the final participant set is
   frozen.
9. Artifact storage, scope enforcement, and runtime module organization remain
   separate owner boundaries.
10. No compatibility flag, diagnostic dual read, or old authority survives a
    terminal cutover.

## Execution and Mixed-Tree Contract

For every source-changing Quest:

1. Capture `git status --short` and record unrelated paths as excluded evidence.
2. At Quest start, require every declared in-scope path to be free of
   unattributed changes. On later attempts, in-scope dirt may remain only when
   it is attributable to the active Quest's prior pending attempt/change
   artifact; reconcile that attribution before the next `solve step`.
3. Create the Quest draft, set `links.specRef` to the section in this file and
   `links.planDoc` to the epic, set exact `doneWhen`/frontier probes below, then
   begin the supervised step so the edited declaration is sealed.
4. Use deterministic tests first. Run the named scenario three times only after
   focused proof is green.
5. Inspect the generated attempt artifact's changed-path list. Every path must
   be declared in-scope; excluded paths must not appear.
6. Spawn an independent final-diff verifier with the mapped checklist files and
   require an evidence path for each verdict. Record the approval through a
   `verifier-approval` finding.
7. Run `git diff --check`, `solve audit --id <id>`, and the default-dry-run
   `solve handoff --id <id>`. Confirm the rendered in-scope pathspec exactly.
8. Commit with `solve handoff --id <id> --commit`. A Quest may have multiple
   independently verified checkpoint commits, but a commit may contain only one
   Quest's scope.

The current dirty-tree list is transient and must be recaptured immediately
before each Quest. At plan revision time, `scripts/generate-steering-llm-pack.js`
and an unrelated formation report were excluded.

## Exact Quest Closure Contract

Except for the W0 process-oracle bootstrap described below, every scenario command writes
`test-output/reports/<scenario>-<timestamp>.report.json`. The `scenario-harness`
probe uses `metric: priority`, and closure requires three distinct most-recent
reports whose scenario entry is `PASS`, whose `summary.failed` and
`optimizationSummary.totalPriorityItems` are both zero, and whose fidelity is
appropriate to the Quest. An empty/skipped guard list is a failure.

| Work | Quest ID and class | Exact evidence command | `doneWhen` probe/identity | Engagement witness |
| --- | --- | --- | --- | --- |
| W0 | `solver-terminal-integrity-red-test-bootstrap` (process) | `node --test test/solve/solver-terminal-integrity-red-test-bootstrap.test.js` | `oracle` / `solver-terminal-integrity-red-test-bootstrap` | fresh evidence must contain the meta-test ID, every required W1 guard ID, and the exact pre-fix failure signature |
| W1 | `solver-terminal-integrity-cutover` (process) | `node scripts/run-solver-terminal-integrity-cutover-scenarios.js` | `solver-terminal-integrity-cutover` | red-on-revert tests drive the real loop, audit, report, and next projection |
| W2 | `solver-acceptance-proof-manifest` (process) | `node scripts/run-solver-acceptance-proof-manifest-scenarios.js` | `solver-acceptance-proof-manifest` | scenario runner invokes the same manifest executor as the public acceptance command |
| W3 | `raft-committed-entry-immutability` (product) | `node scripts/run-raft-committed-entry-immutability-scenarios.js` | `raft-committed-entry-immutability` | shared suite instantiates both production-usable adapters and MessageGroupService path |
| W4 | `raft-snapshot-gated-compaction` (product) | `node scripts/run-raft-snapshot-gated-compaction-scenarios.js` | `raft-snapshot-gated-compaction` | real adapter/service paths prove no physical prefix deletion is reachable |
| W5 | `helm-admin-default-deny-cutover` (product) | `node scripts/run-helm-admin-default-deny-live-scenario.js` | `helm-admin-default-deny-cutover` | live report combines real Helm render parsing with sibling-network refusal against a node started from the rendered admin environment |
| W6 | `provisioning-parent-deadline-cutover` (product) | `node scripts/run-provisioning-parent-deadline-cutover-scenarios.js` | `provisioning-parent-deadline-cutover` | virtual clock executes the real SQL/TableCreationService wait path |
| W7 | `control-plane-readiness-trust-cutover` (product) | `node scripts/run-control-plane-readiness-trust-cutover-scenarios.js` | `control-plane-readiness-trust-cutover` | trace test proves SQL consumes `ControlPlaneReadinessService` output and never raw cache+router joins |
| W8 | `canonical-replica-inventory-cutover` (product) | `node scripts/run-canonical-replica-inventory-cutover-scenarios.js` | `canonical-replica-inventory-cutover` | topology guard and move planner call the same inventory builder in trace tests |
| W9 | `durable-provisioning-job-owner` (product) | `node scripts/run-durable-provisioning-job-owner-scenarios.js` | `durable-provisioning-job-owner` | public CREATE is fail-closed; activation/restart, two-owner lease takeover, authoritative terminal replay, Admin, and PG projections share one persisted job |
| W10 | `transaction-owned-commit-mode-cutover` (product) | `node scripts/run-transaction-owned-commit-mode-cutover-scenarios.js` | `transaction-owned-commit-mode-cutover` | coordinator trace proves final participant freeze precedes commit-mode selection |
| W11 | `solver-proof-artifact-census` (process) | `node scripts/run-solver-proof-artifact-census-scenarios.js` | `solver-proof-artifact-census` | census hashes every referenced `changeRef` and reconciles byte totals with filesystem totals |
| W12 | `solver-proof-artifact-content-addressing` (process) | `node scripts/run-solver-proof-artifact-content-addressing-scenarios.js` | `solver-proof-artifact-content-addressing` | resolver reads old inline and new descriptor artifacts and rejects tampering |
| W13 | `solver-scope-pressure-precommit-enforcement` (process) | `node scripts/run-solver-scope-pressure-precommit-enforcement-scenarios.js` | `solver-scope-pressure-precommit-enforcement` | real step/handoff entry points reject a synthetic over-threshold attempt before commit |
| W14 | `priority-recovery-owner-inventory` (process) | `node scripts/run-priority-recovery-owner-inventory-scenarios.js` | `priority-recovery-owner-inventory` | inventory parses the production import graph and assigns every target module exactly once |

Each Quest declaration uses:

```json
{
  "probe": "scenario-harness",
  "args": {
    "scenario": "<table value>",
    "consecutive": 3,
    "metric": "priority"
  }
}
```

Product Quest `links.specRef` values point to the corresponding `## Wn` anchor
in this file. Process Quests also set `links.planDoc` for traceability.

## W0 — Solver Integrity Red-Test Bootstrap

Sealed result:

> Fresh Quest-specific evidence runs the future terminal-integrity guards
> against pre-fix Solver code and records their required IDs and expected
> invalid-attempt/SOLVED failure signature; the W1 runner exists and has a valid
> failing baseline before W1 is sealed.

Before W0 is sealed, create its process oracle with `done: false` and a null
evidence field. Its test command writes a fresh Quest-specific artifact at
`test-output/reports/solver-terminal-integrity-red-test-bootstrap.report.json`
containing the meta-test ID, every required W1 guard ID, the exact pre-fix
invalid-attempt/SOLVED signature, timestamp, and tested HEAD. Only after that
artifact is inspected does the oracle move to `done: true` and cite its path and
SHA-256. Thus no pre-existing project-hardening PASS can satisfy W0.

W0 may change only test files, its fresh oracle/evidence, and the new W1
scenario runner. The bootstrap meta-test spawns the W1 guards, requires a
non-zero exit and exact assertion IDs, then writes a failing W1 scenario report.
After W1 lands, the meta-test flips to require the guards to pass and remains a
red-on-revert check; it is not deleted as scaffolding.

Templates: `harness-fidelity.md`.

## W1 — Solver Terminal Integrity

Sealed result:

> Solver terminal events are emitted only from accepted measurements; honest
> non-measurements cannot progress or solve, integrity violations block audit,
> and terminal report/next projections contain no active blocker or continuation.

Owner and event policy:

- `scripts/solve/loop.js` owns the validated transition.
- A non-measuring report produces bounded non-measurement accounting and no
  ordinary measured-attempt or terminal event.
- It appends `EVENT_NON_MEASUREMENT` with Quest generation, frontier, attempt
  identity, before/after evidence identities, verdict reason, and retry ordinal.
  Projection, health, cannot-measure, reopen, report, and
  `trailingNonMeasuringRuns` readers migrate to that event in the same Quest.
- Malformed metrics, before/after identity mismatch, artifact identity mismatch,
  or goalpost mutation produce a violation with deterministic ID derived from
  Quest generation, attempt identity, and violation kind.
- A violation is not cleared by an operator-authored resolution. It is satisfied
  only when a later accepted attempt for the same frontier and Quest generation
  carries a valid replacement for the failed evidence identity. Goalpost
  mutations require a new Quest; reopen preserves the sealed `doneWhen` and
  cannot cure them.
- Logs declared before event schema version 2 are not rewritten. Audit labels
  accepted-post-violation history as `legacy_integrity_unverifiable`; it blocks
  new handoff unless an explicit migration Quest records replacement evidence.

Implementation:

1. Extract a pure validation result: `accepted`, `nonMeasuring`, `violations`,
   `terminalEligible`, and replacement identity.
2. Append the dedicated non-measurement event, not a normal measured attempt,
   for honest invalid samples; preserve bounded retry/cannot-measure accounting.
3. Gate `SOLVED` on accepted evidence and zero unresolved violations.
4. Teach audit to reconstruct unresolved violations mechanically.
5. Branch report and `next` projections on terminal state.
6. Add synthetic-log and real-loop red-on-revert tests.

Proof attacks:

- null/NaN metric; stale before identity; replaced artifact; invalid sample;
  valid later sample; goalpost mutation; historical v1 log; terminal report.

Templates: `harness-fidelity.md`, `admission-gating.md`.

## W2 — Executable Acceptance Proof Manifest

Sealed result:

> One versioned machine-readable manifest owns every project-hardening proof
> command, and both the Quest scenario and public acceptance command execute the
> same fail-closed runner with per-command status and artifact identity.

Implementation:

1. Define manifest version, ordered command/argv, timeout, required artifact,
   acceptable exit status, and environment contract. Shell strings are not
   accepted.
2. Build a runner that fails empty manifests, skipped entries, timeout,
   non-zero status, missing artifacts, or manifest drift.
3. Replace the focused-only project-hardening scenario with this runner.
4. Make CI/local acceptance call the same entry point and update the spec to
   reference the manifest rather than repeat commands.

Proof attacks: empty manifest, skipped command, stale artifact, timeout,
argument injection, focused-subset drift, and all-green execution.

Templates: `harness-fidelity.md`.

## W3 — Raft Committed-Entry Immutability

Sealed result:

> Every production-usable Raft adapter preserves the index/term/command identity
> of committed entries across conflict truncation, append, save, and overwrite
> paths, while retaining ordinary uncommitted-tail replacement.

Implementation:

1. Add a shared adapter contract factory for SQLite and in-memory adapters.
2. Clamp conflict-tail deletion to the committed boundary and keep commit index
   monotonic in memory.
3. Return a typed Raft conflict rejection from any save/append that changes an
   existing committed entry. That rejection must propagate through incoming
   AppendEntries handling so the node cannot emit an ACK or advance commit for
   an identity it did not store. Same-identity idempotent replay is allowed.
4. Ensure SQLite replacement writes cannot overwrite committed identity.
5. Replace contradictory in-memory expectations.
6. Add a seeded operation-sequence property test with the seed printed on
   failure, plus real incoming AppendEntries cases for the SQLite-backed Raft
   provider and the in-memory MessageGroupService path.

Proof attacks: truncate below/equal/above commit, same-index different term,
same-index different command, idempotent replay, empty tail, reopen, real
AppendEntries rejection-without-ACK, and random append/commit/conflict sequences.

Templates: `recovery-replay.md`, `concurrency-serialization.md`,
`harness-fidelity.md`.

Migration: callers attempting committed replacement are unsafe and must be
fixed, not preserved. No stored data rewrite is required.

## W4 — Disable Compaction Until Snapshot Protocol Exists

Sealed result:

> No production-usable Raft adapter physically removes a committed prefix until
> the protocol implements snapshot transfer/install and lagging-follower
> recovery; attempted compaction returns a typed unsupported result, commit
> index never moves backward, and conflict truncation cannot invoke compaction.

Implementation:

1. Inventory every physical prefix-deletion/retention path in both adapters and
   their service callers.
2. Remove implicit in-memory retention deletion and make any explicit compaction
   API return `snapshot_protocol_unavailable` without changing entries or
   indices.
3. Ensure SQLite has no reachable committed-prefix deletion outside database
   destruction explicitly owned by lifecycle teardown.
4. Add lagging-follower tests proving the full committed log remains available
   through ordinary AppendEntries catch-up.
5. Document the in-memory adapter's weaker restart contract: state is ephemeral
   across process restart, but committed identity is immutable for the lifetime
   of an adapter and no live compaction may erase it.
6. Record a future, separately sealed protocol feature for snapshot create,
   transfer, install, last-included index/term, membership/fencing, and recovery.
   Adapter compaction cannot be enabled merely by adding a storage method.

Templates: `recovery-replay.md`, `concurrency-serialization.md`.

## W5 — Helm Admin Default Deny

Sealed result:

> Default and legacy-insecure Helm values cannot render a cluster-published
> admin listener; pods bind the admin listener to loopback, and REST health and
> readiness remain available independently; a live node started from the
> rendered admin environment refuses an admin connection from a sibling network
> namespace.

This Quest does not pretend to provide authenticated exposure. The repository
has authorization helpers but no demonstrated wire-level admin authentication
guard. External chart exposure remains unsupported until a separate design
names and tests a concrete authenticated proxy or runtime handshake.

Implementation:

1. Set loopback/false runtime values.
2. Remove admin ports from client Service, headless Service, and container port
   declarations.
3. Add values-schema/template validation that rejects wildcard admin binding or
   `allowInsecureExternalBind: true`, including old values files.
4. Update chart docs and release migration notes.
5. Add a real render parser and mandatory live scenario. The runner renders the
   chart, extracts the actual admin environment, starts the production node on
   an isolated Docker/network-namespace network, and proves a sibling cannot
   connect to 8081 while REST health/readiness remains reachable as declared.
   It writes `fidelity: live`; inability to create the sibling network is a
   non-measuring report, not a pass.
6. Record the live run ID and refused-connect observable in the closing
   live-validation finding.

Templates: `admission-gating.md`, `harness-fidelity.md`.

Rollback: operators may roll back the chart, but no insecure compatibility flag
is retained in the new version.

## W6 — Parent Deadline Cutover

Sealed result:

> Initial partition provisioning and all progress re-waits derive from one
> caller-owned deadline; observed wall/virtual time cannot exceed the original
> request budget, and progress never creates a fresh budget.

Implementation:

1. Pass an absolute deadline or remaining-budget object from admin SQL through
   SQL and `TableCreationService`.
2. Replace the three fresh waits with `max(0, deadline-now)`.
3. Preserve current success/failure projection; durable pending semantics belong
   to W9.
4. Delete the reset helper and add a dependency guard preventing new nested
   raw-duration waits in this path.

Proof attacks: progress at one millisecond before expiry, no progress, repeated
wakeups, cancellation, negative remaining time, and an outer 30-second/inner
90-second mismatch fixture.

Templates: `retry-loops.md`, `harness-fidelity.md`.

## W7 — Readiness Cycle Cut and Observer-Local Trust

Sealed result:

> `ControlPlaneReadinessService` produces the per-node repair/serve eligibility
> consumed by provisioning; its observer-local evidence combines membership,
> freshness, transport, bounded grace, and readiness without a projection-to-
> provisioning cycle or direct SQL cache/router join.

Contract:

- `NodeTrustState` is an observer-local evidence record with capture time,
  membership revision, cache watermark, transport observation time, readiness
  revision, and reason codes. It is not persisted as cluster truth.
- `ControlPlaneReadinessService` maps that evidence to existing
  `repairEligible` and `serveEligible` views.
- An open transport can veto a stale negative but cannot alone grant serve
  eligibility.

Implementation order:

1. Cut the projection↔provisioning-eligibility dependency identified in the
   hysteresis epic.
2. Add observer-local evidence derivation behind the readiness service.
3. Migrate SQL provisioning to the service view.
4. Delete direct cache+message-router trust reconstruction and fallback paths.

Proof attacks: stale cache/fresh transport, fresh removal/stale socket, unknown
evidence, readiness false, grace expiry, membership revision change, and
formation without circular self-admission.

Engagement: trace/call-count guard fails if SQL bypasses the service; static
import guard is secondary evidence.

Templates: `formation-circularity.md`, `admission-gating.md`,
`recovery-replay.md`, `harness-fidelity.md`.

## W8 — Canonical Replica Inventory

Sealed result:

> One immutable, coherently captured rebalancer inventory joins committed rows
> with owned in-flight operations; topology and planning consume its occupancy,
> voter-target, and effective-after-operation selectors without rebuilding the
> join.

Contract:

- Snapshot includes capture time and real per-source revisions. It does not
  claim atomicity when cache rows and operation-ledger rows lack one generation.
- Fields cover voters, learners, orphans, occupied nodes, ADD/REPLACE source and
  target influence, and effective post-operation state.
- Owned selectors are `occupiesNode`, `countsTowardVoterTarget`, and
  `effectiveReplicaCountAfterOperations`.
- Serve readiness comes from W7. Promotability/catch-up comes from the Raft
  replication owner. Inventory composes those inputs but does not redefine them.

Implementation:

1. Define DTO/builder and source-revision skew policy.
2. Move in-flight accounting into the builder.
3. Migrate topology guard and planners one decision at a time using test-only
   differential oracles, not runtime dual authority.
4. Delete independent raw joins.

Proof attacks: voter, learner, orphan, ADD, REPLACE, source/target overlap,
source revision skew, duplicate rows, and one-replica-per-node property cases.

Engagement: trace guards require topology guard and move planner to call the
builder; red-on-revert fixtures retain the orphan occupancy/target distinction.

Templates: `admission-gating.md`, `recovery-replay.md`,
`concurrency-serialization.md`.

## W9 — Durable Provisioning Job Owner

Sealed result:

> `TableCreationService` atomically records schema intent and an idempotent
> durable provisioning job, reconciles it through existing replica-operation
> workflows with fenced single-writer ownership, and projects stable pending,
> success, or failure outcomes through SQL/Admin boundaries.

Durable contract:

- New versioned `schema_operations` system record: job ID, canonical workflow ID
  and owner key, normalized DDL/table idempotency key, schema revision,
  schema-specific progress reason codes, retry-after, created/updated/completed
  times, and terminal schema result/error. This one row is both the atomic
  schema-intent outbox and the canonical persistence backing for the parent
  `DurableWorkflowCoordinator` record (owner/lease epoch and expiry, attempt
  count, participant state, transition history, and fence token); schema code
  must not maintain a second copy of those workflow fields.
- Recording the normalized table/schema intent and initial job is one atomic
  `schema_operations` INSERT, never a replace/upsert. Its versioned semantic
  intent uses the current cluster-global schema namespace plus the normalized
  table/column/type/constraint and primary-key shape and options. `SqlRequest`
  still carries tenant identity to the owner boundary, but W9 must not pretend
  tenant-local catalogs exist while `tables.table_name` remains globally unique.
  Deterministic table, partition, job,
  workflow, and idempotency identities let a duplicate matching submission
  attach to the existing active/terminal row without cross-partition 2PC; the
  same table identity with a different intent fails with a stable conflict.
  Workers idempotently project the row into `tables`, `partitions`, and existing
  replica-operation workflows.
- Extend `DurableWorkflowCoordinator` with a storage-backed compare-and-swap
  port for claim/renew/transition persistence and an injected terminal-state
  policy. The coordinator state machine projects
  `PENDING -> RUNNING -> SUCCEEDED|FAILED`; higher-epoch claims win, stale
  writers fail closed, and terminal states are immutable. Process-local
  `runExclusive` is only a contention optimization, never the durable lock.
- Child placement uses existing durable replica-operation workflows; SQL never
  reads their concentration ledger directly. Child operation intent IDs derive
  from the schema job and target so replayed or stale parent workers converge on
  the same replica-operation row; the replica-operation owner remains the only
  code allowed to materialize it.
- W9 exposes no schema-job DELETE path and retains terminal records indefinitely.
  Bounded garbage collection is a separate Quest after a reference-safe policy
  exists; this makes cleanup races fail closed in W9.

Owner reuse map:

- REUSED: `TableCreationService` owns schema intent, idempotency identity, and
  schema-specific success/failure semantics.
- EXTENDED: `DurableWorkflowCoordinator` owns owner-key recovery, monotonic
  transitions, participant persistence, replay, and the new generic durable
  claim/renew/transition CAS contract. W9 must extend and use that shared
  machinery rather than implement a schema-local lease coordinator; its current
  in-memory single-flight and fence checks alone are not durable ownership.
- REUSED: the replica-operation workflow owns child placement operations and
  their recovery.
- REUSED: `OwnerContractOutcome` owns the cross-layer pending/retry/ready/failed
  projection.
- NEW: only the versioned `schema_operations` atomic aggregate and its
  schema-specific persistence/projection adapter that bind normalized DDL/table
  identity to the canonical durable workflow.

Public projection:

- Internal owner output uses `OwnerContractOutcome`: pending/retry with `jobId`,
  `reasonCodes`, and `retryAfterMs`; ready/proceed on success; failed/stop with a
  stable error on terminal failure.
- Admin JSON preserves that typed envelope.
- PostgreSQL wire completion remains ordinary command completion on success. If
  the parent deadline expires while the durable job remains active, return a
  retryable `55P03` error with machine-readable `provisioning_job_id` and
  `retry_after_ms` fields in structured error detail; retrying the same DDL
  attaches to the existing job.

Upgrade posture: W9 is a fail-closed full-restart/minimum-version cutover for
schema writes. Fresh bootstrap and restart-from-pre-W9 metadata must install the
new system table before CREATE is admitted; mixed-version nodes that do not know
the schema-job record cannot own or execute provisioning work.

Proof attacks: duplicate submission, crash after atomic insert, lease expiry,
stale worker completion, terminal replay, cleanup race, client timeout followed
by retry, and failure propagation.

Directed real-owner proof: constrained multi-node provisioning returns pending,
recreates the owner over shared durable storage, restores capacity, and reaches
one terminal result without duplicate replica-operation or replica identities.
The proof runs the real `TableCreationService -> SQLQueryEngine ->
RebalanceCoordinator` owner chain on deterministic storage and remote-node
boundaries, and emits an immutable report naming the run and observable. A
Docker engagement may supplement this evidence, but an unrelated formation
blocker must not be relabeled as W9 evidence.

Templates: `retry-loops.md`, `recovery-replay.md`,
`concurrency-serialization.md`, `formation-circularity.md`.

## W10 — Transaction-Owned Commit Mode

Sealed result:

> Callers no longer request a single-participant bypass: independent internal
> writes may use autocommit, active explicit transactions always enlist, and the
> coordinator freezes the final participant set before selecting one- or
> two-phase commit.

Contract:

- `transactionMode`: `AUTOCOMMIT` or `EXPLICIT`.
- `commitMode`: `ONE_PHASE_COMMIT` or `TWO_PHASE_COMMIT`, selected once at
  coordinator commit and immutable afterward.
- An independent system mutation may run as `AUTOCOMMIT` only when it is not
  semantically part of an enclosing explicit transaction.
- Every write in an active explicit transaction enlists its participant so
  rollback remains complete. One final participant may use 1PC at commit; a
  late second participant before freeze selects 2PC. A participant after freeze
  is rejected fail-closed.

Implementation:

1. Add pure coordinator selection over transaction kind, frozen participants,
   transition mirrors, and protocol constraints.
2. Route truly independent workflow writes through normal autocommit intent.
3. Remove `bypassSingleParticipantSystemWrite` from rebalancer, gateway, CDC,
   query, and tests.
4. Emit selected mode as read-only diagnostics.

Proof attacks: implicit one participant, explicit one participant rollback,
explicit one participant 1PC at commit, late second participant, transition
mirror, retry/replay, unknown state, and post-freeze mutation.

Engagement: coordinator trace proves participant-freeze happens before the mode
event; a caller-provided mode field is ignored/rejected.

Templates: `concurrency-serialization.md`, `recovery-replay.md`,
`harness-fidelity.md`.

## W11 — Proof Artifact Census

Sealed result:

> A reproducible report accounts for every Quest `changeRef`, referenced and
> unreferenced payload byte, SHA-256 duplicate group, encoding, and historical
> readability status, and reconciles its total byte count to the filesystem.

This is measurement/design only. The report must classify 100% of artifacts,
have zero unresolved paths, reconcile bytes exactly, and emit baseline totals
for unique bytes, duplicate bytes, duplicate ratio, and largest groups. It then
selects W12's migration threshold without changing storage.

Templates: `harness-fidelity.md`.

## W12 — Content-Addressed Proof Artifacts

Sealed result:

> New large attempt patches use verified content-addressed descriptors while
> old inline paths remain readable; identical payloads are stored once, missing
> or tampered content fails audit, and a migration tool verifies every rewrite.

Quantitative proof:

- Two identical 1 MiB fixture patches create two descriptors and at most
  1.05 MiB of payload storage.
- A second identical payload adds zero new content objects.
- All W11 duplicate groups whose individual payloads are at least 32 KiB are
  migrated, and measured duplicate bytes in those eligible groups fall by at
  least 90% relative to the W11 baseline.
- 100% of W11 references preserve their classified readability status before
  and after migration, and every W11 payload-backed reference resolves with the
  same SHA-256; the two W11-classified pre-integrity source-path records remain
  explicitly historical-invalid rather than being presented as payload proof.
  A zero-migration run cannot satisfy the eligible-group reduction predicate.
- One-byte tampering fails identity verification.
- Small-artifact inline threshold is 32 KiB and content compression is gzip, as
  selected by the W11 census from the largest threshold with an observed exact
  duplicate group and the measured aggregate compression savings.

Templates: `harness-fidelity.md`, `recovery-replay.md`.

## W13 — Pre-Commit Scope-Pressure Enforcement

Sealed result:

> An attempt that exceeds owner/path/byte thresholds cannot be recorded or
> handed off until it is split into bounded Quest declarations; the guard acts
> before commit rather than warning after a broad change lands.

Thresholds reuse the existing scope-pressure analyzer. Proof runs exact
below/equal/above cases through real `step --commit` and handoff entry points;
above-threshold fixtures record zero ordinary attempt/commit events. There is no
self-authorizable override: an over-threshold attempt must be split into a new
Quest declaration before work continues.

Templates: `admission-gating.md`, `harness-fidelity.md`.

## W14 — Priority-Recovery Ownership Inventory

Sealed result:

> A generated inventory classifies every priority/publication-recovery module by
> owner and semantic layer, records every import edge, identifies duplicate DTO
> or reducer authority, and emits bounded owner-scoped migration candidates
> without moving runtime files.

Layers are raw observation, canonical snapshot/reducer, owner decision, and
consumer presentation. Closure requires 100% unique module classification,
zero unparsed import edges, an acyclic proposed direction, and a generated list
where each migration candidate touches one owner boundary. Quantitative baseline
includes module count, public export count, cross-layer edge count, and largest
strongly connected component.

W14 also generates, for every migration candidate, a draft Quest ID, exact
scenario command and report predicate, engagement witness, declared pathscope,
and applicable verifier templates. Those are proposals only. After W14, revise
this implementation plan with the measured baselines and draft closure rows,
obtain independent architecture and proof approval, and only then seal one
product Quest per approved migration candidate. Do not pre-authorize a
repository-wide move. The epic cannot complete until those approved migration
Quests are terminal or an independently approved finding rejects a candidate
with evidence.

### W14 Measured Baseline and Draft Closure Rows (Revision 5)

The terminal W14 projection is
`solve/changes/priority-recovery-owner-inventory/inventory.json`, generated
from production source SHA-256
`a521d718b3a81bcfd71351bec71ba4184580c912a5ec72c038a48a51cbaca725`.
It classifies 65 modules exactly once across five owners and all four semantic
layers, parses 279 import/export edges with zero unresolved or parser failures,
counts 750 public exports and 87 cross-layer edges, and measures largest SCC 1.
Ten same-name authority signals remain visible; zero bodies are byte-identical.
The declared five-character Jaccard threshold of 0.70 narrows those signals to
three review-only migration proposals:

| Draft Quest | Boundary | Authority evidence | Declared pathscope | Review disposition |
| --- | --- | --- | --- | --- |
| `priority-recovery-admin-control-plane-admission-publication-single-engaged-authority` | `admin -> control-plane` | `buildPriorityRecoveryAdmissionByPartitionId` 0.915; `buildPriorityRecoveryPublicationNodeDecisions` 0.928 | runtime mutation: `src/admin/admin-control-snapshot-priority-recovery-context.js`, `src/admin/admin-control-snapshot.js`; read-only engagement trace: `src/admin/admin-control-snapshot-control-plane-diagnostics.js`, `src/control-plane/priority-recovery-snapshot.js`, `src/control-plane/priority-recovery-snapshot-closure.js`, `src/control-plane/priority-recovery-snapshot-burndown.js`; proof/support: `scripts/run-priority-recovery-admin-control-plane-admission-publication-single-engaged-authority-scenarios.js`, `test/admin/admin-control-snapshot-priority-recovery-authority.test.js`, `solve/quests/priority-recovery-admin-control-plane-admission-publication-single-engaged-authority.json` | `SOLVED`; commit `64e2c076` |
| `priority-recovery-admin-dormant-context-retirement` | `admin -> control-plane` | the generated 0.742 reason-code signal exposed an entirely unreachable six-export Admin context surface | runtime mutation: delete `src/admin/admin-control-snapshot-priority-recovery-context.js`; edit `src/admin/admin-control-snapshot.js`; read-only engagement trace: `src/admin/admin-control-snapshot-control-plane-diagnostics.js`, `src/control-plane/priority-recovery-snapshot.js`, `src/control-plane/priority-recovery-snapshot-closure.js`, `src/control-plane/priority-recovery-snapshot-burndown.js`, `src/control-plane/priority-recovery-snapshot-ingress.js`; proof/support: `scripts/run-priority-recovery-admin-dormant-context-retirement-scenarios.js`, `test/admin/admin-control-snapshot-priority-recovery-authority.test.js`, `test/admin/admin-control-snapshot-priority-recovery-dormant-context-retirement.test.js`, `solve/quests/priority-recovery-admin-dormant-context-retirement.json` | `SOLVED`; commit `86df6381` |
| `priority-recovery-control-plane-normalize-distinct-string-array-authority` | `control-plane` | `normalizeDistinctStringArray` 0.774 | runtime: `src/control-plane/publication-recovery-evidence-values.js`, `src/control-plane/publication-recovery-stream-evidence.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-priority-spread.js`; proof/support: `scripts/run-priority-recovery-control-plane-normalize-distinct-string-array-authority-scenarios.js`, `test/control-plane/publication-recovery-normalization-authority.test.js`, `solve/quests/priority-recovery-control-plane-normalize-distinct-string-array-authority.json` | `SOLVED`; commit `86cb4fb2` |

Each row uses its listed runner as the exact scenario command and requires
three consecutive PASS reports with zero priority items and a non-empty stable
guard-ID list. Every attempt path must be one of the row's runtime or proof
paths. Closure removes the local duplicate declarations and every non-owner
forwarding/re-export alias; a stable public seam reaches authority through the
declared canonical snapshot entry chain and never through dormant direct
imports. The engagement attacks are:

- admission/publication: direct and nested publication projections are
  identical through the live `AdminControlSnapshot` decision-snapshot seam; an
  admission fixture covers source and multiple target partition fanout,
  malformed workflow exclusion, eligible-node trim/dedup, normalized
  ineligible reasons, and blocking reasons. Static guards prove the context
  declarations/exports and dormant Admin imports/pass-throughs are gone and
  the sole engaged chain is Admin -> shared priority-recovery snapshot ->
  snapshot closure -> burndown;
- dormant Admin context: the module, every import, all six options
  pass-throughs, and every local replacement/forwarding alias are absent. A
  real Admin snapshot fixture covers blocked/missing planner projection,
  replica-operation identity and timeline evidence, source/target admission,
  repair-eligible promotion, recovery-only hold, unknown-readiness hold, and
  learner reason codes containing whitespace, duplicates, blanks, empty
  objects, and nulls through the canonical ingress/burndown owners;
- distinct-string normalization: frozen insertion order, deduplication,
  trimming, and non-array behavior are preserved through both consumers, while
  static single-declaration and import-cycle guards prove the stream alias is
  gone.

Every suite is red on restoration of its removed local declaration or consumer
import, and each row retains `recovery-replay.md` plus `harness-fidelity.md`.
Similarity alone does not authorize a move.

Templates: `recovery-replay.md`, `harness-fidelity.md`.

## Delivery Order

1. Re-review this revision. Commit the plan only after approval.
2. Execute W0, then W1. Execute W2–W6 in any order allowed by clean pathscope;
   complete all immediate safety work before
   starting new convergence behavior. W6 does not wait for W7–W9.
3. Execute W7, then W8, then W9.
4. Execute W10 independently after immediate safety work.
5. Execute W11, then W12 and W13 as separate Quests.
6. Execute W14, revise and independently reapprove this plan, then execute only
   the approved generated owner-scoped migrations.
7. Run aggregate static/fast/model and relevant distributed gates on final HEAD.
8. Use a fresh subagent—neither plan reviewer nor implementation helper—for the
   final program audit. It inspects every terminal report, commit pathscope,
   engagement witness, broad-gate artifact, and residual risk.

## Completion

The program is complete when every declared and W14-generated Quest is honestly
`SOLVED`, or an `EXHAUSTED` Quest has an independently approved superseding
decision recorded in this plan; all source Quests have verifier-approval
findings; aggregate gates pass; no excluded dirty path entered a commit; and a
fresh final verifier approves the implementation against the ten invariants.

## Plan Review Disposition

Revision 1 was rejected by:

- `/root/plan_arch_review` — owner/cycle, transaction, Raft mutator, chart, and
  module-scope findings.
- `/root/plan_proof_review` — exact probe, non-measurement, durable job,
  worktree, security, quantitative closure, and engagement findings.

Revision 3 addresses those findings as mapped in the epic decision log and was
approved by both reviewers:

- `/root/plan_arch_review` — APPROVE, no architecture blockers.
- `/root/plan_proof_review` — APPROVE, no proof/workflow blockers. W0's terminal
  finding must cite the test artifact SHA-256 and verifier evidence.

Revision 4 added the terminal W14 measurements and generated candidate rows.
Both reviewers rejected it: `/root/w14_plan_arch_review` found that the runtime
scopes omitted active consumers and would force forbidden forwarding aliases;
`/root/w14_plan_proof_review` found that proof-support paths and concrete
red-on-revert engagement attacks were undeclared. Revision 5 expands each row
to the reviewers' minimum alias-free runtime scope, declares exact proof paths,
and seals the concrete engagement and deletion predicates above. It is
independently approved by `/root/w14_plan_arch_review` (all three owner
directions, alias-free scopes, and cycle posture) and
`/root/w14_plan_proof_review` (all three exact pathscopes, scenario contracts,
engagement attacks, red-on-revert guards, and deletion predicates).

Revision 6 records one implementation-time correction. The originally sealed
`priority-recovery-admin-control-plane-build-priority-recovery-admission-by-partition-id-authority`
Quest is `EXHAUSTED`: independent verification proved its required direct Admin
imports were dormant options pass-throughs, so satisfying that literal frame
would preserve dead wiring. `/root/w14_plan_arch_review` and
`/root/w14_plan_proof_review` independently approve the superseding
`priority-recovery-admin-control-plane-admission-publication-single-engaged-authority`
row above. It deletes the same duplicate context authorities and the dormant
wiring, but proves the already-live shared-snapshot chain through a real
`AdminControlSnapshot` instance. This is the independently approved
superseding decision required for the exhausted generated Quest; no generated
candidate is silently dropped.

Revision 7 records the independently approved row-2 correction. Inspection
showed `admin-control-snapshot-priority-recovery-context.js` has exactly one
production importer and all six remaining exports are passed into an options
object that consumes none. `/root/w14_plan_arch_review` and
`/root/w14_plan_proof_review` approve replacing the unsealed narrow reason-code
row with `priority-recovery-admin-dormant-context-retirement`: delete the whole
unreachable module and wiring, then prove representative planner,
replica-context, learner, admission, and publication behavior through the live
shared snapshot chain. The generated reason-code candidate is superseded with
stronger deletion evidence rather than dropped.

Revision 8 records terminal execution and the regenerated post-migration
inventory. Production source SHA-256 is now
`4e4927edf45959e2fedb5bc6c7f2f047c12672b94c1fac53ca4146c4d873233a`:
64 modules, 738 public exports, 280 import/export edges, 89 cross-layer edges,
largest SCC 1, four visible lower-similarity name signals, zero confirmed exact
duplicates, and zero migration candidates. The three approved rows above are
`SOLVED`; the literal dormant-direct-import Quest remains honestly `EXHAUSTED`
with the independently approved and solved superseding row recorded here.
The final static ratchet also removed the unused compatibility-barrel aliases
for the canonical normalizer/input helper and keeps the generator writer
private; unused exports improve from the 1,628 baseline to 1,627.

Revision 9 records the final aggregate-gate cleanup and current inventory. The
guideline audit initially exposed 144 new raw-literal violations in the W11-W14
tooling; named constant ownership and explicit state decisions close all of
them. Focused reruns then exposed three live consumers still importing
`normalizeDistinctStringArray` through the retired compatibility barrel. Commit
`37be0676` moves those consumers directly to the canonical evidence-values
owner and regenerates the inventory. Production source SHA-256 is now
`736b8588a7a8218f32de74cb12332ee254b3449f3d02b2de4bf332ae0308d8c9`:
64 modules, 738 public exports, 283 import/export edges, 91 cross-layer edges,
largest SCC 1, four visible lower-similarity name signals, zero confirmed exact
duplicates, and zero migration candidates.

The final aggregate commands are green on commit `37be0676`: `npm run
test:static`, `npm run test:fast`, `npm run model:contracts`, `npm run
test:safety-pregate`, and every focused W11-W14 scenario runner. The optional
`test:convergence-probes` lane was also exercised both at its default
concurrency and at `--jobs=1`; its three bounded-wall-clock probes retain their
documented pre-existing formation/ledger stalls. Commits `6fcb6329` and
`5881bfa0` explicitly removed those hardware-relative statistical probes from
the blocking gates after proving them red at the pre-release base, so their
current failure is recorded as residual risk rather than represented as a new
program regression. The blocking distributed safety pregate is 6/6 files and
112/112 assertions green, while the fast aggregate includes the deterministic
distributed-harness and convergence suites.

Revision 10 corrects the W3/W4 closure-table identities to the Quest IDs,
runner names, and scenario identities that were actually sealed and solved:
`raft-committed-entry-immutability` and `raft-snapshot-gated-compaction`. The
revision-9 final verifier found no implementation, evidence, test, scope,
inventory, residual-risk, or invariant blocker; it rejected only the stale
pre-sealing names in that table and requested this narrow plan-only correction
before re-audit.

The fresh `/root/final_program_audit` re-audit approved revision 10 at commit
`8f1d43ef`: the corrected W3/W4 identities reconcile, all Quest audits remain
green, the current inventory reproduces exactly, all ten program invariants
have direct evidence, and the unrelated formation report remains untracked and
absent from program history.
