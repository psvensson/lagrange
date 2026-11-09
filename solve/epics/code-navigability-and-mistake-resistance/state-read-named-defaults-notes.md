# state-read-named-defaults: implementer notes (append-only)

Worktree `lagrange-nav-defaults-20261108`, branch
`work/nav-state-read-named-defaults-20261108`, base 1ad04d21a. Rows are
measured read-only through the stream worktree's detector
(`lagrange-fallback-census-20261108/scripts/checks/code-navigability-detectors.js`).

## 2026-11-08 resume after the 10:55 reboot (implementer 2)

Recovered state: 183 src files edited by the predecessor, no notes.
Measured at recovery: state_read_defaults 36 (HEAD 413), row_field_alias_reads
709 (HEAD 745), two_source_fallback_reads 1708 (HEAD 1789),
legacy_term_identifiers 2925 (HEAD 2924). The budget script printed
state_read_defaults = 0 only because the predecessor's ESLint entry made the
row "promoted" and its head-only selectors matched nothing.

### Mechanism changes
- (a) One detector owner: deleted test/helpers/state-read-default-sites.js
  (a second AST walk) and the 19 per-directory witnesses. One witness,
  test/scripts/state-read-named-defaults.test.js, imports the detector module
  through the single constant DETECTOR_MODULE (env
  LAGRANGE_NAVIGABILITY_DETECTORS, else the stream worktree path); at the
  merge of code-navigability-budget-check it becomes
  '../../scripts/checks/code-navigability-detectors.js'. Until then the
  witness cannot load on a lab host (no stream path there): an expected,
  classified red.
- (b) ESLint promotion rewritten: selectors generated in eslint.config.js for
  depth 1 (term is `.left`), depth 2 (`a || T || d`) and depth 3
  (`(x || (a || T)) || d`), same operator at every level, plain and
  ChainExpression terms, member shapes plain / string key / template key /
  constants member. Parity: on the src tree at 36 remaining sites ESLint
  reported exactly the 36 detector sites (same file:line:col list, diffed).
  Fixture parity test: 6 counted shapes x 2 operators x 19 reads = 228 sites,
  ESLint == detector; uncounted shapes silent in both. Mutation check: with
  only the depth-1 selector the parity test fails (rejects the predecessor's
  defect). Rule lands with the last deletion (same uncommitted change).

### The 36 remaining sites (done; detector count 0 after this step)
Non-overlap files:
- admin: leadership-summary, node-view-projection (convergence status), and
  the three copies of hasDurablePublishedMembershipObservation
  (admin-control-snapshot.js, -local-build-base.js, -node-view-projection.js;
  the predecessor's 3-source readUpperStateField) read the one field every
  producer sets: `publicationStatus` (admin
  resolvePublicationConvergenceDiagnostics sets status = publicationStatus =
  publicationObservation.status; control-plane
  publication-recovery-convergence-builder sets status and publicationStatus
  together). Publication-row evidence predicates (admin-control-snapshot.js,
  -membership-publication-reconcile.js,
  control-plane/membership-publication-active-gate-reconcile.js) read
  `row.status.length > 0`: normalizeControlPlanePublicationRow decodes status
  to a string.
- bootstrap-control-plane-recovery-health: planning snapshot's
  publicationStatus only; absent -> existing DIAGNOSTICS_INCOMPLETE state.
- management-v1-owner sendErrorReply: `error.statusCode ?? defaultStatus`
  (ManagementV1ValidationError sets statusCode; `.status` is its alias).
- cli resolveRuntimeStatus(endpoint): endpoint health only (schema citation);
  definition param removed; consumers census: remote-cache.js wrapper and two
  in-file callers.
- recovery-protocol-snapshot: `options.publicationStatus` only (both callers
  pass it; status/publicationStatusNormalized were dead).
- priority-recovery-observation-gate-resolution, -observation-snapshot,
  publication-recovery-convergence-gate-builder (2): dead `convergence.status`
  alias term deleted.
- projection-readiness-evidence: source is polymorphic (owner-stream source,
  membership publication, recovery gate) -> new owner reader
  readPublicationRecordStatus (system-row-normalizers.js, next to the row
  decoder) names the two publication-record shapes once.
- migration (2): current_stage only (NOT NULL).
- operation-workflow-replace-witness: decision on delivery.outcome
  (DELIVERED -> answer status, else delivery reason).
- unified-rebalancer-priority-recovery-coordination: payload.newStep only
  (both STEP_CHANGED emitters carry it; used only for that event).
Overlap files (minimal edits, done last):
- control-plane-readiness-diagnostics-eligibility, -priority-recovery-planning,
  -publication-planning-resolution, -runtime-authority-methods: pairs
  `x.publicationStatus ?? x.status` -> readPublicationRecordStatus(x) (+1
  import line at line 1).
- rebalancer/replica-operation-repository-visibility-methods: same reader;
  absent status decides nothing (typeof check, no re-default).
- message-group-proposal-routing, raft-operation-port: refusal messages name
  outcome, reason and phase explicitly (no fallback text; same convention as
  consensusInitRefusedMessage).
- node/runtime-service-bound-creation-route: heldRetirementCode() explicit
  stage order, typeof on the retirement status.
- query/distributed/distributed-transaction-telemetry: telemetry.outcome is
  always set (createTransactionTelemetry ACTIVE, finalize replaces);
  finalize's one caller passes tx.status (constructor-set).

### Predecessor-diff review, non-rebalancer/control-plane/admin dirs (read-only reviewer subagent, then fixes)
Multi-source helper calls resolved to one owner:
- node-joining-admission-readiness (3): failureResult.phase only (the failure
  record owns the failed phase; getPhase() is FAILED afterwards).
- entrypoint-runtime-admin-composition: startupOwner.phase only.
- managed-workflow-record-coordinator: record gone -> STATE_ABSENT, not the
  requested outcome.
- replica-handler-runtime-methods: explicit `tracked ? tracked.status :
  cacheEntry.status` (two distinct facts, branch on which exists).
- raft-rs-runtime-owner: decide on `recovery?.failure` (the real fact), not on
  the phase being empty (was a re-default via STATE_ABSENT).
- operation-workflow-replace-owner / -witness: deliveryUnavailableReason() and
  replaceAnswerStatus() in the witness owner; both modules use them.
Duplicate readers folded into readStateField: readRegisteredRaftRole,
readParticipantCurrentStatus. Left (R17, noted): resolveMergedNodeStatus
(bootstrap-node-ready-rebalance-owner, legitimate overlay of a partial CDC row
on the previous row), readSignatureStateText (query-executor-shared, '' is the
fingerprint's encoding of absent; still reads raft_role/raftRole), inline
typeof copies in traffic-readiness-utils:63,
entrypoint-runtime-join-startup-policy:44, runtime-replica-state-projection-
owner:139.

### schema-proves-presence citations (code comment on the line)
services.status NOT NULL DEFAULT 'active'; nodes.status NOT NULL DEFAULT
'active'; replica_operations.status/workflow_step NOT NULL; migrations
.current_stage NOT NULL; service_endpoints.health_status NOT NULL DEFAULT
'healthy'; schema_migrations / schema_migration_partitions / sql_transactions /
sql_transaction_participants / sql_write_operations / schema_operations
.status NOT NULL; service_definitions.status, service_timers.status NOT NULL.
Constructor/producer guarantees cited: PartitionService.role
(merge-cutover-wait-report, partition-service-cdc-stream-base),
split/merge replication phase (partition-participant-transaction-topology-
fence), partitionStatements role (distributed-write-coordinator x2),
ContactSeedPhase phase (bootstrap-readiness-owner-probe-details), reservation
status (move-replica-handoff-owner), registerExistingReplica's one caller
(replica-handler-runtime-methods), finalize's one caller and
createTransactionTelemetry (distributed-transaction-telemetry).

### File-size cap
Five files had crossed 800 by one line (predecessor imports/comments):
service-registration-handoff-owner, active-node-publication-snapshots,
replica-state-machine-recovery, managed-merge-workflow-execution-gate-methods,
operation-workflow-replace-owner; each brought back to <= 800 at the owner
(no baseline change).

### R17 findings (not absorbed)
- move-replica-assignment-reservation-persistence.js:240-243 decodes an
  absent reservation status to 'unknown' (outside BOOTSTRAP_API_HANDOFF_STATUS)
  -> owner: bootstrap move-replica handoff.
- rebalancer/replica-status.js:242 isPeerRowStatusAdmissible `status ||
  ACTIVE` admits a status-less row as a peer -> owner: rebalancer replica
  status (not a state_read_defaults shape: identifier, not member).
- Publication records carry status twice (status and publicationStatus,
  admin diagnostics also publicationObservation.status); the control-plane
  convergence builder and admin diagnostics set both. readPublicationRecordStatus
  (system-row-normalizers.js) is the one reader of the two shapes until the
  shapes are unified -> owner: system-table-row-decoders / readiness.
- management-v1-request-validator sets error.status as an alias of
  statusCode -> owner: management API.
- Three copies of hasDurablePublishedMembershipObservation in admin
  (admin-control-snapshot.js, -local-build-base.js, -node-view-projection.js)
  -> owner: admin control snapshot (duplication).
- Contract changes inherited from the predecessor to confirm with owners:
  /register-service now 400s without status and stores NULL raft_role when
  none is sent; persisted timers without status never fire
  (wasm-service-models deserializeTimerEntry); transaction recovery refuses a
  status-less row (TransactionRecoveryIncomplete).

### Predecessor-diff review, control-plane/admin/cli/cdc/cache/debug (reviewer subagent, then fixes)
Dead re-defaults removed (producers always set the field):
- membership-publication-candidate-derivation: unchanged candidate restates
  latest row status (no latest row => changed => OPEN earlier); NOT NULL.
- membership-publication-planning-evidence: candidate.publicationStatus only
  (dead options.status arm and invented OPEN "birth state" deleted).
- admin-test-run-lifecycle-methods buildProgressPayload, admin-test-run-
  progress stderr payload: phase always present at every caller.
- debug-runtime/breakpoint-manager: resume adapters always answer status.
Multi-source reads resolved to the one producer field:
- priority-recovery-snapshot-rebalancer: steps_history `step` and `status`
  only (no writer sets workflowStep/state on entries).
- control-plane-publication-story: `status` (buildMembershipPublication-
  Diagnostics sets status, no publicationStatus).
- publication-active-gate-handoff-contract-helpers: `publicationStatus`.
- control-plane-readiness-diagnostics-eligibility:686 String(null) ->
  readUpperStateField (overlap file, one line + import).
Doc blocks reattached (priority-partition-summary CL-021, debug-metadata-
service). debug_sessions birth status ACTIVE cited to the column default.
readPublicationRecordStatus JSDoc corrected ('' from decoded rows).
Open question for the lead: readPublicationRecordStatus is a named owner
reader of two publication-record shapes (projection-readiness-evidence and
the readiness planning files take records of either shape). It centralises
the ambiguity rather than removing it; removing it needs the shapes unified
(R17 above).

### Lab
- refs/wip/nav-defaults-1143 (74a9eb0c1) on adams-gamla: refused, stale
  test/shards/impact-graph-seal.json (2392 files "no result", exit 97) --
  infrastructure, metadata regenerated.
- refs/wip/nav-defaults-1146 (370e6fdd4) on adams-gamla: running.

### Predecessor-diff review, rebalancer (reviewer subagent, then fixes)
Dead second spelling deleted (decoded-only paths read `workflowStep`; rowToOperation emits camelCase only): operation-ledger-hold-policy,
operation-workflow-owner-ports (also the duplicate `status`/`['status']`
read and two orphan constants), operation-workflow-owner-shared,
operation-workflow-persistence, priority-recovery-superseded-target,
rebalance-coordinator-priority-budget-helper (orphan WORKFLOW_STEP_SNAKE in
rebalance-coordinator-helper-common removed), replica-operation-repository-
row-methods, rebalance-coordinator-operation-intent-methods,
rebalance-coordinator-replica-identity-methods (legacy_term back to HEAD 2924).
Raw-only paths read the column: effective-placement-serial-priority-planner
and unified-rebalancer-replica-state (`workflow_step`, raw cache rows),
unified-rebalancer-control-plane-readiness-methods and priority-surplus-
remove-placement-fence (`raft_role`, raw services rows).
Genuinely dual (raw rows AND decoded ops reach): replica-operation-liveness
resolveRecordOwnerNodeId (admin leadership-summary passes raw rows) and
replica-operation-progress -> one reader readOperationRecordWorkflowStep
(replica-operation-progress.js) that decides the shape by which key the
record holds (Object.hasOwn 'workflow_step'), never first-of-two.
operation-workflow-coordinator-created-handoff-scheduling: named STATE_ABSENT
branch for the budget step (an unobserved step from the dispatch-pending
snapshot keeps the budget grace as PENDING did) -- flagged for the verifier:
same outcome as HEAD's `|| PENDING`, now an explicit decision.
Not changed, R17 (normalisers convert STATE_ABSENT back to '' one frame
down; owner = system-table-row-decoders): priority-recovery-visibility-
decision toVisibilityString, replica-operation-progress
normalizeWorkflowStepIdentifier/normalizeReplicaStatusIdentifier,
replica-operation-liveness normalizeReplicaOperationRecord ('' then
`.length > 0 ? x : UNKNOWN_*` display mapping), owner-ports
normalizeOperationWorkflowOwnerPortText.
Unverified from the review: node-storage-budget-service persisting path
callers (options.nodeRow) and operation-workflow-port-freshness '' vs null
on pre-change persisted NEXT_STEP entries.

Rows after this step (stream detector, read-only): state_read_defaults 0,
row_field_alias_reads 707 (HEAD 745), two_source_fallback_reads 1697 (HEAD
1789), legacy_term_identifiers 2924 (HEAD 2924), parse failures 0.
- Lead note (2026-11-08): the "generated metadata is stale ...
  impact-graph-seal.json" refusal (exit 97, every file no result) is a known
  environmental defect (foreign node_modules/@pulumi symlink), not this
  candidate. The 1143 run was that defect. The worktree's
  test/shards/impact-graph-seal.json is restored to the committed 1ad04d21a
  content and must not be regenerated; only primary/resource/subsystem
  classes are regenerated for the new test files. Run 1146 (370e6fdd4) was
  snapshotted with a regenerated seal but passed placement and is executing.

### Lab run 1146 (370e6fdd4, adams-gamla): 2392 files, 2363 pass, 29 fail, 96293 assertions
Classification and repair (each re-run locally as a single-file witness):
- buildMembershipPublicationRow: my removal of the OPEN birth state was
  wrong (fixtures and the deferred-catchup real path build rows from
  candidates without publicationStatus) -> named birth state restored.
  Explains membership-publication-coordinator, -deferred-catchup,
  first-epoch-members, task27, dt6-* publication files, and plausibly the
  integration reds (re-run pending).
- wasm-service-models: serialize sides now name the birth state (definition
  ACTIVE, timer entry ACTIVE) instead of the predecessor's silent removal;
  deserializers read what serialize stamped.
- bootstrap-api: predecessor made /register-service refuse a status-less
  body (400); reverted (service-registration-handoff-owner.js and
  bootstrap-api-constants.js back to HEAD content). The row builder names
  the birth state ACTIVE (services.status NOT NULL DEFAULT 'active');
  raft_role stays NULL when not stated (nullable column).
- learner-promotion-count-check-inputs: frozen oracle and random generator
  carried the deleted operation_status/operationStatus spellings (no
  producer in src); test aligned to the one status field, recorded in a
  comment.
- distributed-transaction-coordinator "supports recovery payloads":
  recover(payload) (test-only caller in src; R17 -> query/distributed owner)
  synthesised status-less rows; the adapter now states the statuses it
  synthesises (participants FAILED, unstated writes PENDING), so the
  fail-closed readRecoveredRowStatus holds for every real row.
- test/scripts/state-read-named-defaults.test.js: expected red on lab hosts
  (stream path absent until the budget-check merge).
- Local re-runs green: projection-readiness receipt, dt6 persist-pipeline,
  message-group-native-provisional-route, single-path-partition-cutover,
  plus the files above.
- refs/wip/nav-defaults-1404 (699690e21, committed seal): running.

### Lab runs after the fixes (blocked by the environmental seal defect)
- 1404 (699690e21) `test changed`: refused before running, "MODULAR PROOF NOT
  SAFE / UNKNOWN_SCOPE": changed test support code
  (learner-promotion-count-check-authorization-cases.js) is not in the
  import graph the committed seal binds. Fixing that needs a regenerated
  seal, which the lead has said not to do.
- `test all` on 699690e21: refused at placement, "generated metadata is
  stale ... impact-graph-seal.json" (2555 files no result, exit 97) -- the
  known environmental defect. Not counted as red.
Local single-file witnesses, all green (node --test, thermal-gated): every
file that was red in 1146 except the 13 long integration files (lab only):
membership-publication-coordinator / -deferred-catchup /
-first-epoch-members, task27 interleavings, dt6 ack-recovery-gate /
failback / failback-pct-search / quorum-failback / persist-pipeline,
projection-readiness receipt, message-group-native-provisional-route,
single-path-partition-cutover, cdc-source-occurrence-delivery,
seed-release-failure-custody, wasm-service-models, bootstrap-api,
distributed-transaction-coordinator, learner-promotion-count-check-inputs,
utils/state-field-read, scripts/state-read-named-defaults (3/3 locally:
zero sites, both parity tests).
Cheap checks on the final tree: eslint over every changed file clean;
fast-static ok; pre-commit (LAGRANGE_SOLVER_LANDING=1) exit 0, file-size
26/26 and 21/21; duplication ok, baseline tightened 1331 -> 1330 on the
checker's hint (scripts/check-duplication.js).
Final rows (stream detector): state_read_defaults 0, row_field_alias_reads
707 (HEAD 745), two_source_fallback_reads 1697 (HEAD 1789),
legacy_term_identifiers 2924 (HEAD 2924), parse failures 0.

### NEXT (handover)
1. When the lead says the seal producer fix has landed: snapshot (committed
   seal or the fixed producer's output, as the lead directs) and run
   `lab.js test changed --lane all --base-sha 1ad04d21a --on adams-gamla`.
   The 13 integration files red in 1146 (cdc-group-boundary-handoff,
   create-table-partition-provisioning, critical-replica-placement-causal-
   trace, leader-metadata-validation, managed-split-admission-reliability,
   message-group-membership-claim-cache, raft-leader-election,
   seed-node-bootstrap, single-node-default-replica-count-writes,
   three-node-seed-rebalance, bootstrap-api, seed-release-failure-custody,
   cdc-source-occurrence-delivery) are expected green after the
   publication-row and register-service repairs but are UNPROVEN until then.
2. At the budget-check merge: flip DETECTOR_MODULE in
   test/scripts/state-read-named-defaults.test.js to
   '../../scripts/checks/code-navigability-detectors.js'.
3. Independent verification of the src change (constraint
   independent-verification); open decisions for the verifier/lead:
   readPublicationRecordStatus (two publication-record shapes, one reader),
   readOperationRecordWorkflowStep (shape decided by key presence), the
   named birth states (publication row OPEN, registration ACTIVE,
   definition/timer ACTIVE, debug session ACTIVE, budget step for an
   unobserved dispatch-pending step).
4. Overlap files (concurrent readiness/promise quests), edits minimal:
   control-plane-readiness-diagnostics-eligibility,
   -priority-recovery-planning, -publication-planning-resolution,
   -runtime-authority-methods; rebalancer/replica-operation-repository-
   visibility-methods; message-group-proposal-routing; raft-operation-port;
   raft-rs-runtime-owner; node/runtime-service-bound-creation-route;
   node/replica-handler-runtime-methods; query/distributed/
   distributed-transaction-telemetry, -recovery; plus many predecessor
   edits in src/raft, src/message-group, src/query, src/partition, src/node,
   src/wasm-service and src/rebalancer/* (see git diff --cached --stat).

## 2026-11-08 round 2 (implementer 3): in-tree detector, audit disposition, verifier model

Base 03a63c859 (stream head with budget-check, import-graph producer fix,
owner index and guideline audit); HEAD a7d312e6f = base + seal.

### Mechanism changes this round
- test/scripts/state-read-named-defaults.test.js: DETECTOR_MODULE is the
  in-tree `../../scripts/checks/code-navigability-detectors.js` resolved from
  import.meta.url; the env override and the stream-worktree path are gone
  (one path, R11). Local: 3/3 pass.
- Guideline audit disposition for the promoted row: the audit drops a
  pattern ESLint promotes (scripts/check-guideline-navigability.js
  promotedSelection, "Promoted to ESLint (audited there, not here):
  state_read_defaults"), so `--update-baseline --pattern state_read_defaults`
  writes nothing and the 413-entry baseline file was read by no gate (R05:
  dead derived material). Deleted
  scripts/check-guideline-navigability-baseline-state_read_defaults.json.
  The budget row navigability_patterns_without_ratchet accepts a baseline OR
  the ESLint marker and stays 0. The audit's real-tree witness
  (test/scripts/check-guideline-navigability.test.js "the real audit over src
  reports only inherited violations") required a baseline file for all twelve
  rows; it now exempts the rows the audit's own promotion note names
  (promotedRowsNamedBy(stderr)), so the audit and its witness read promotion
  through the same reader. 12/12 pass.
- Tightened on the audit's hint (lowering only): row_field_alias_reads
  745 -> 707, two_source_fallback_reads 1789 -> 1695.
- src/node/runtime-service-bound-creation-route.js heldRetirementCode: the
  predecessor's split produced two NEW two_source_fallback_reads identities
  (`completion?.outcome ?? projection?.outcome`, `result?.outcome ??
  OUTCOME.UNKNOWN`), failing the audit on the staged set. Rewritten as an
  explicit ordered stage table (HELD_RETIREMENT_STAGES: completion outcome,
  projection outcome, string status, outcome) ending in the named UNKNOWN,
  the same shape as decideRetirement's own table; same answers as HEAD's
  chain for every non-null stage. test/node/runtime-service-remove-execution-
  custody.test.js 5/5 locally.
- src/rebalancer/rebalance-coordinator-priority-budget-helper.js
  isAddBudgetOperationPastWorkflowTimeout: the predecessor's "only decoded
  operations reach here" was FALSIFIED by lab run 2 (adams-gamla) and a local
  run: test/rebalancer/rebalance-coordinator-operation-ownership.test.js
  (2 subtests, "...releases priority add budget..." and "...a different
  blocked priority partition use the add lane...") feed raw replica_operations
  rows, and the same function reads partition_id / updated_at / operation_id.
  Base 03a63c859 local: 119/119; candidate before: 117/119. Repaired at the
  owner without re-adding a second spelling: the step is read through the
  ruled shape-dispatch reader readOperationRecordWorkflowStep
  (replica-operation-progress.js), absent -> STATE_ABSENT -> not past timeout
  (HEAD's '' -> false). Orphaned REBALANCE_COORDINATOR_OPERATION_FIELD
  .WORKFLOW_STEP removed (rebalance-coordinator-helper-common.js). Local
  119/119. The other "decoded-only" deletions in src/rebalancer
  (operation-workflow-owner-shared, -persistence, -owner-ports,
  replica-operation-repository-row-methods resolveOperationOwnerNodeId,
  rebalance-coordinator-operation-intent-methods,
  rebalance-coordinator-replica-identity-methods, operation-ledger-hold-policy,
  priority-recovery-superseded-target) remain claims proven only by the lab
  cone: FOR THE VERIFIER, resolveOperationOwnerNodeId and
  operation-workflow-owner-shared still read snake spellings of other fields
  in the same function, the same signal that falsified this one.

### Lab runs this round (cone `lab.js test changed --lane all`)
- Run A: refs/wip/nav-defaults-1432 = 8957e8f42 (staged tree after the
  flip/audit/heldRetirementCode changes), base 03a63c859, lenovo-laptop:
  INFRASTRUCTURE - ssh to lenovo-laptop dropped ("Timeout, server
  192.168.86.27 not responding"); 517 pass, 4 fail, 1876 files no result
  (exit 255). Not counted.
- Run B: same snapshot 8957e8f42, adams-gamla: 2397 files, 2380 pass, 17
  fail, 96668 assertions.
- Base B': base 03a63c859 + a comment line on each red test file + regenerated
  test metadata (c14ceaf7b), run from a scratch worktree, adams-gamla: 224
  files, 209 pass, 15 fail.
- Run C (final tree): refs/wip/nav-defaults-* = f83523ed8 (after the
  budget-helper repair), base 8957e8f42 (cone selected the full 2397),
  lenovo-laptop: 2397 files, 2370 pass, 27 fail, 96596 assertions.
- Base C': base 03a63c859 + comment touches on the C reds + metadata
  (4d066bd89), lenovo-laptop: 235 files, 211 pass, 24 fail.
- Candidate C'': f83523ed8 + comment touches on the three files red in C but
  green in C' (a9911a5bd), lenovo-laptop alone: 204 files, 203 pass, 1 fail
  (lagrange-server-npm-package, red at base in B').
Classification of every red:
- Candidate-caused, repaired: rebalancer/rebalance-coordinator-operation-
  ownership (B; see the budget-helper bullet above). Green in C.
- Pre-existing at base, red in the base runs on the same host (B' adams
  and/or C' lenovo): message-group-native-provisional-route,
  single-path-partition-cutover, model-contract-tools (B' adams; green in C''),
  cdc-source-occurrence-delivery, seed-release-failure-custody,
  create-table-partition-provisioning, critical-replica-placement-causal-trace,
  leader-metadata-validation, managed-split-admission-reliability,
  message-group-membership-claim-cache, raft-leader-election,
  seed-node-bootstrap, single-node-default-replica-count-writes,
  three-node-seed-rebalance, lagrange-server-npm-package (B'),
  dt6-publication-ack-recovery-gate-network, dt6-publication-failback-pct-
  search, cdc-group-boundary-handoff, membership-consistency,
  multi-node-raft-replication (also red locally on a `git archive 03a63c859`
  tree: 18 pass / 2 fail, the same "Raft append ack" subtest as on the
  candidate locally), node-join-replica-activation, public-application-
  database-transaction-facade, formation-attribution-provenance,
  formation-sim-bootstrap-owner-entry, formation-sim-production-handoff.
  Of the 13 files of run 1146 still unproven at handover: bootstrap-api is
  green in B and C; cdc-group-boundary-handoff is red at base on
  lenovo-laptop (C'); the other 11 are red at base 03a63c859 on adams-gamla
  (B'). The seed-release
  "release_fact_unavailable / replica_release_reply" budget expiry they
  share is NOT this candidate (owner: seed participant release; R17).
- Host/timing (red only under the full-cone load on lenovo, green at base
  on lenovo, green on the candidate alone on lenovo in C'' and on adams in
  B): replace-real-group-completion (TAP 30s file timeout; C 37.4s red, C''
  23.8s green, base C' 22.2s; locally candidate 3.3s vs base 3.4s),
  fresh-seed-activation (240s test timeout; C 260s red, C'' 213s green),
  managed-split-writes-after-cutover (C 248s red, C'' 153s green).
- Host/timing: message-group-fresh-identity-replacement red only in B
  (adams), green in C on the final tree and in B' at base; green locally.
- The witness test/scripts/state-read-named-defaults.test.js is green on
  the lab now (B, C, C''): the in-tree detector loads on lab hosts.

### Verifier model: summary by decision class
Counts are from `git diff --cached` of the src tree (204 files); the per-site
record is in the sections above.
1. Schema- or producer-guaranteed read (default deleted, presence cited on
   the line): 88 citation comments in 56 files. Column constraints: services
   .status NOT NULL DEFAULT 'active', nodes.status NOT NULL DEFAULT 'active',
   replica_operations.status / workflow_step NOT NULL, migrations
   .current_stage NOT NULL, service_endpoints.health_status NOT NULL DEFAULT
   'healthy', schema_migrations / schema_migration_partitions /
   sql_transactions / sql_transaction_participants / sql_write_operations /
   schema_operations .status NOT NULL, service_definitions.status and
   service_timers.status NOT NULL, debug_sessions.status NOT NULL DEFAULT
   'active'. Constructor/producer guarantees: PartitionService.role,
   split/merge replication phase, partitionStatements role (x2),
   ContactSeedPhase, move-replica reservation status, registerExistingReplica's
   one caller, createTransactionTelemetry + finalize's one caller,
   rowToOperation (camelCase only), STEP_CHANGED emitters (payload.newStep),
   ManagementV1ValidationError.statusCode, every publication-diagnostics
   producer setting publicationStatus.
2. Named STATE_ABSENT decided by the caller (src/utils/state-field-read.js
   readStateField / readLowerStateField / readUpperStateField): 98 src files
   call the reader. Two calls pass two sources (flagged, not state-default
   sites): admin-test-run-lifecycle-methods.js:355 (an update without a phase
   keeps the run's phase: an overlay of an update on the current state) and
   rebalancer/operation-workflow-replace-terminal-admission.js:114 (the
   persistence authority's step else the in-memory operation's step: HEAD's
   `||` preserved; an owner-port feature-detected fallback, R17 to the
   owner_port_feature_detection / replace-workflow owner).
3. Routed to an owner's named state: DIAGNOSTICS_INCOMPLETE
   (bootstrap-control-plane-recovery-health), TransactionRecoveryIncomplete
   (distributed-transaction recovery), OUTCOME.UNKNOWN
   (runtime-service-bound-creation-route), refusal messages naming outcome,
   reason and phase (message-group-proposal-routing, raft-operation-port),
   witness owner deliveryUnavailableReason()/replaceAnswerStatus()
   (operation-workflow-replace-owner/-witness), and the named birth states
   below.
4. Shape dispatch per the lead's ruling (two readers; R08 unification routed
   to system-table-row-decoders):
   - readOperationRecordWorkflowStep (rebalancer/replica-operation-progress
     .js:527) dispatches on Object.hasOwn(record, 'workflow_step') and ends in
     STATE_ABSENT via readStateField. Used by replica-operation-progress and
     replica-operation-liveness.
   - readPublicationRecordStatus (control-plane/system-row-normalizers.js:372)
     is `record?.publicationStatus ?? record?.status`: a first-present read of
     two keys, NOT a key-presence dispatch, and it answers undefined, null or
     '' rather than STATE_ABSENT; its callers continue the chain across other
     sources with mixed `||`/`??` (readiness overlap files below). FOR THE
     VERIFIER/LEAD: this differs from the ruling's description ("by the shape
     the record declares", "ends in a named state"). Left as is in this round
     because every caller sits in the readiness quest's files and changing the
     '' / null answer changes which source the callers' `??` chains reach;
     the fix belongs with the publication-record unification
     (system-table-row-decoders), recorded here (R17).

### Named birth states introduced, each with its producer guarantee
- Membership publication row OPEN: control-plane/membership-publication-
  planning-evidence.js MEMBERSHIP_PUBLICATION_BIRTH_STATUS /
  resolveBuiltPublicationStatus (caller's status, else the candidate's
  publicationStatus, else OPEN). OPEN is the protocol's first status
  (MEMBERSHIP_PUBLICATION_STATUS.OPEN); fixtures and the deferred-catchup
  path build rows from candidates without publicationStatus (run 1146 reds).
- Service registration ACTIVE: bootstrap/bootstrap-api-registration-methods
  .js readRegisteredServiceStatus; services.status NOT NULL DEFAULT 'active'.
  raft_role is NOT given a birth state (nullable; NULL when unstated, where
  HEAD invented FOLLOWER: a contract change for the bootstrap owner to confirm).
- WASM service definition ACTIVE and timer entry ACTIVE: wasm-service/
  wasm-service-models.js statedOrBorn on the serialize side only
  (service_definitions.status NOT NULL; TimerManager stamps FIRED and
  CANCELLED, a scheduled entry is ACTIVE); deserializers read what serialize
  stamped, so a persisted timer without status no longer fires (contract
  change noted above).
- Debug session ACTIVE: debug-runtime/debug-metadata-service.js
  DEBUG_SESSION_BIRTH_STATUS / resolveCreatedSessionStatus;
  debug_sessions.status NOT NULL DEFAULT 'active'; an update without a status
  keeps the existing (NOT NULL) status.
- Handoff budget step: rebalancer/operation-workflow-coordinator-created-
  handoff-scheduling.js buildCoordinatorCreatedRemoteHandoffTimeoutDecision:
  workflowStep = readStateField(operation?.workflowStep); budgetStep =
  STATE_ABSENT -> WORKFLOW_STEP.PENDING. A decoded operation always carries
  its step (replica_operations.workflow_step NOT NULL, rowToOperation); only
  the dispatch-pending re-entry snapshot can carry none, and its budget grace
  is decided as for a not-yet-dispatched operation (HEAD's `|| PENDING`,
  now an explicit decision).

### Overlap with concurrent quests (staged-tree line numbers, new side of `git diff --cached -U0`)
readiness-service-constructor-injection (control-plane-readiness-*.js and
its three planning-answer consumers):
- control-plane/control-plane-readiness-diagnostics-eligibility.js: 1-2
  (imports), 552 (readPublicationRecordStatus), 687 (readUpperStateField).
- control-plane/control-plane-readiness-node-liveness-methods.js: 182, 185.
- control-plane/control-plane-readiness-node-service-rows.js: 1, 170, 210,
  250, 299, 310.
- control-plane/control-plane-readiness-priority-recovery-planning.js: 1,
  434, 436.
- control-plane/control-plane-readiness-publication-planning-resolution.js:
  1, 346, 348, 351-352.
- control-plane/control-plane-readiness-publication-planning-snapshot.js:
  289, 307-309.
- control-plane/control-plane-readiness-runtime-authority-methods.js: 1, 304.
- control-plane/control-plane-readiness-service-node-methods.js: 1, 169.
- control-plane/control-plane-readiness-startup-authority-health.js: 1, 591,
  606.
- partition/partition-service-learner-promotion-methods.js: 1, 243-244, 273,
  276, 279, 574.
- rebalancer/replica-operation-repository-visibility-methods.js: 1, 439-440,
  442-443.
- rebalancer/unified-rebalancer-available-nodes.js: 1, 144.
always-promise-port-answers (files holding value_or_promise_then_checks
sites at 03a63c859, detector run on a `git archive 03a63c859` tree):
- raft/raft-rs-runtime-owner.js: 1, 609-610, 886.
- bootstrap/owners/bootstrap-readiness-owner-probe-details.js: 1, 182, 697,
  700, 708.
No edit in these files touches a `.then` check or the readiness class chain.

## 2026-11-08 round 3 (repair after verification REJECT)

Implementer 4. Inputs: verdict verify-defaults-r2/verdict.md (B1 + N1-N10),
lead rulings (a)-(e) (log `finding` kind `decision`, 21:36:41Z).

### Stream merge (ruling e)
- Saved the staged round-2 candidate as scratchpad
  defaults-r2-candidate.patch (sha256 5ff873d6..., includes the two
  verification/decision log lines appended after the verdict's 48d1b3c6
  hash), `git stash`, `git merge --no-ff 95877e60b` = **b18f512c2**. The
  merge tree is the stream plus the seal commit only (`git diff 95877e60b
  b18f512c2` = quest.json + log.ndjson); `npm run -s test:metadata:refresh`
  changed nothing, so no regeneration commit was owed or made.
- `git stash pop` (three-way) conflicted in 9 files, resolved by hand:
  - eslint.config.js: the promise quest's VALUE_OR_PROMISE_SELECTORS and this
    quest's STATE_READ_DEFAULT_RESTRICTIONS are ONE `no-restricted-syntax`
    rule object for `src/**/*.js` (`--print-config`: severity 2, 13 promise
    entries + 36 state_read_defaults entries after the N3/N5 extension below).
  - test/scripts/check-guideline-navigability.test.js: the stream's file
    verbatim (promotedPatterns exemption + "a promoted row has no baseline"
    assertion); this quest's promotedRowsNamedBy deleted (one version). The
    deleted state_read_defaults baseline satisfies the stream's assertion.
  - solve/epics/code-navigability-and-mistake-resistance.md: both decision
    entries kept (stream's readiness/promise/decoders rulings, then this
    quest's shape-dispatch ruling).
  - The six readiness files (diagnostics-eligibility, node-service-rows,
    priority-recovery-planning, publication-planning-resolution,
    publication-planning-snapshot, startup-authority-health): the stream's
    free-function form taken whole, then the quest's edits re-applied on it.
    The detector found exactly the 17 sites the verdict counted, all here:
    diagnostics-eligibility 549 (readPublicationRecordStatus), 661
    (readUpperStateField); node-service-rows 144 (readStateField), 182/222/
    271/282 (readLowerStateField; `allowedStatuses.includes(null)` = false as
    `includes('')` was); priority-recovery-planning 439/443
    (readPublicationRecordStatus, same `||` continuation as round 2);
    publication-planning-resolution 348/351/355/357 (readPublicationRecordStatus
    in both branches, round-2 shape); publication-planning-snapshot 287
    (`latestPub.status` direct), 305 (memo key: `readStateField(probe.status)`
    then `=== STATE_ABSENT ? PLANNING_MEMO_VERSION_KEY_ABSENT : status`; '' and
    absent now render one marker: no producer writes '' as a publication
    status, and both mean "no stated status" to the memo); startup-authority-
    health 576 (readStateField), 591 (readLowerStateField).
  - Clean three-way merges needing no hand work: test/shards/*,
    scripts/check-duplication.js (src ratchet 42/1330 from the candidate, test
    ratchet 648/24259 from the stream: the lower of each), the two
    navigability baselines, control-plane-readiness-service-node-methods.js.
- Row table after the merge, before the round-3 repair: state_read_defaults
  0/0, row_field_alias_reads 707/745, two_source_fallback_reads 1691/1789,
  owner_port_feature_detection 2020/2130 (no regression).

### B1 repair and witness
src/rebalancer/replica-operation-repository-row-methods.js
resolveOperationOwnerNodeId reads the step through
readOperationRecordWorkflowStep (replica-operation-progress.js); the false
citation is deleted and replaced by the true one (raw rows from the dispatch
replay/execution paths and decoded operations both reach it). Note a decoded
operation carries `semanticPhase` (rowToOperation), so the step read is in
practice reached only by raw rows and plain records. Witness:
test/rebalancer/operation-record-step-shape.test.js
- every ReplicaStatus value and '' on a raw REPLACE row at workflow_step
  REMOVED on sql_write_operations-p1 -> source owner (the verdict's 7
  divergent cells are among these), and the decoded counterpart;
- every REPLACE step with mirrored status: raw row and decoded operation give
  the same owner (target, source at REMOVED).
Mutation: restoring `readStateField(operation?.workflowStep)` turns the file
red (4 pass / 1 fail).

### Class repair (ruling a): every "decoded only" / "raw only" step read
Census method: every hunk of the candidate in which HEAD read a state field
in two spellings and the candidate keeps one (comments stripped; script
scratchpad/r3tools/dropped.py), plus every citation comment of the
"decoded"/"reach here"/"producer" kind. Operation-record workflow steps are
ROUTED through the one shape reader (exact for both shapes: a decoded
operation holds no snake key, rowToOperation output listed at
replica-operation-repository-row-methods.js:98-150), so no call-graph claim
remains to be believed; every citation below is deleted.

| Site (function) | HEAD read | Round 2 | Round 3 |
| --- | --- | --- | --- |
| replica-operation-repository-row-methods resolveOperationOwnerNodeId | camel `\|\|` snake | camel only, false cite | routed, witness above |
| operation-workflow-owner-ports getOperationWorkflowOwnerPortWorkflowStep | camel `\|\|` snake const | camel only, cite | routed |
| effective-placement-serial-priority-planner operationStep | camel `\|\|` snake | snake only, "raw rows" cite | routed (readUpperStateField of the reader) |
| rebalance-coordinator-operation-intent-methods maybeRearmReusedPendingOperation | camel `\|\|` snake | camel only, cite | routed |
| unified-rebalancer-replica-state (in-flight topology check) | camel `??` snake | snake only, "raw rows" cite | routed |
| priority-recovery-superseded-target getOperationWorkflowStepRank | camel `??` snake | camel only, cite | routed |
| rebalance-coordinator-replica-identity-methods isRetiredReplaceSourceOperation | camel `??` snake | camel only, cite | routed |
| operation-workflow-owner-shared resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence | camel `??` snake | camel only, cite | routed, witness (raw + decoded CREATING -> UNMATERIALIZED, raw SYNCING -> NOT_APPLICABLE) |
| operation-ledger-hold-policy isOperationLedgerSelfMoveDispatchClaimed | camel `??` snake | camel only, cite | routed, witness (raw SENDING/PENDING, decoded SENDING, none) |
| operation-workflow-persistence operationToRecoveredWorkflow (N10) | camel `\|\|` snake | camel only, cite | routed; JSDoc now true; test/rebalancer/operation-progress-store-persistence.test.js asserts the raw row's step is recovered |
| operation-workflow-dispatch-rearm-evidence isDispatchRetryableWorkflowStep | camel `\|\|` snake | camel only, no cite | routed |
| bootstrap/shared/durable-rejoin-partition-restore-planner hasActiveReplicaOperationOwner | snake `\|\|` camel | snake only | routed |
| priority-recovery-visibility-decision (operation workflow step) | camel `\|\|` snake | readVisibilityRowField(camel, snake) | routed; orphan WORKFLOW_STEP / WORKFLOW_STEP_SNAKE field constants deleted |
| rebalance-coordinator-priority-budget-helper (round 2) | | routed | unchanged |
| replica-operation-liveness resolveRecordOwnerNodeId (round 2) | | routed | unchanged |

Every routed read keeps HEAD's outcome for a raw row and a decoded
operation; the only difference is a record holding BOTH keys with different
values (read as raw, by the ruling) and '' (absent, as `||` had it).

Re-proven by producer trace (read-only tracing subagent, every hop file:line;
report in this session, spot-checked), not routed:
- unified-rebalancer-priority-recovery-coordination STEP_CHANGED newStep: the
  two emitters (operation-workflow-transition-persistence.js:288-293,
  -orchestration.js:514-519) always carry `newStep: step`.
- raft_role sites keeping one spelling: admin-shared-metadata-consistency:135
  (sole caller admin-preflight-snapshot:508, systemTableCache.getAll),
  bootstrap-topology-snapshot-owner-contract readBootstrapTopologySnapshot
  ServiceRaftRole (cache rows / `SELECT * FROM services` / overlay literals
  keyed COLUMN.RAFT_ROLE), canonical-leader-routing readCanonicalLeaderService
  Role (7 production chains, all cache/SQL/COLUMN-keyed rows),
  priority-surplus-remove-placement-fence rowRaftRole (owner-RPC
  `SELECT * FROM services` rows only), unified-rebalancer-control-plane-
  readiness-methods (getCurrentReplicas: cache rows + literals carrying both
  spellings with one value). The cache boundary: SystemTableCache rows are
  SQL-column keyed (every applySystemTableChange producer listed in the
  trace); the camelCase `raftRole` producers (normalizeServiceRow,
  placement-owner-evidence, priority-partition-summary, local-diagnostics,
  message-group-proposal-routing, replica-inventory,
  current-priority-placement-observation) feed none of these chains.
  UNREACHABLE for all five.
- publicationStatus/status sites keeping one spelling: admin leadership-
  summary:216, local-build-base:201, node-view-projection:249/:277,
  bootstrap-control-plane-recovery-health:167, control-plane-publication-
  story:84, recovery-protocol-snapshot:123: every producer sets both keys from
  one variable, or only the kept key. UNREACHABLE. admin-control-snapshot.js
  :193/:259: the three helpers are dead code at HEAD and in the candidate
  (R17: deletion candidate for the admin owner). membership-publication-
  planning-evidence and replica-operation-repository-visibility-methods keep
  both spellings (not drops).
No "only decoded operations reach here" or "raw rows reach here" citation
remains in src (`grep` 0).

### N3: inline reader copies folded; the conditional shape is counted
Detector (scripts/checks/code-navigability-detectors.js stateReadDefaults):
besides chain terms, it counts each branch of a ConditionalExpression that is
a state read when the test reads (is or contains) a state field:
`typeof r.status === 'string' ? r.status : null`, `r.step === undefined ?
null : r.step`, `r.status.length > 0 ? r.status : UNKNOWN`, `isStated(r.x) ?
r.x : y`, `r.step ? r.step : 0`. Site = the branch. Not counted: a decision on
a local holding the reader's answer (`status === STATE_ABSENT ? X : status`),
the sanctioned explicit form. On the merged tree the extended row read 44
(41 conditionals); all 44 removed, row 0 again. ESLint: the same shape as
`ConditionalExpression:has(> .test:matches(S, :has(S))) > S.consequent|
.alternate` (plain and ChainExpression), same marker and message.
Folds (each `typeof`/length guard -> readStateField / readLowerStateField /
readUpperStateField, a fallback -> an explicit `=== STATE_ABSENT` decision):
- plain reader (diagnostic or payload field, absent -> null as before):
  admin-test-run-report serializeRun status; node-joining-admission-readiness
  bootstrapResponsePhase; bootstrap-request-owner phase x2; startup-recovery-
  coordinator phaseDetail; traffic-readiness-utils x2; invariant-engine
  violation status; readiness-transition-state membershipPublicationStatus;
  entrypoint-runtime-join-startup-policy phase; runtime-replica-state-
  projection-owner status; rebalancer-planning-gate-methods readinessPhase;
  replica-handler-remove-execution-methods cachedStatus/localStatus (consumed
  by a `||` chain that already treated '' as absent); runtime-service-bound-
  creation-route HELD_RETIREMENT_STAGES status stage; managed-workflow-record-
  changes and durable-workflow-storage-ownership PREVIOUS_STEP.
- explicit named outcome kept from HEAD: bootstrap-readiness-owner and
  -probe-details phase (absent -> LIFECYCLE_PHASE.INIT, the birth phase);
  move-replica-assignment-lease-validation phase (absent -> LEASE_RENEWED);
  distributed-transaction-recovery payload write status (absent -> PENDING);
  operation-workflow-transition-retry-grace step (absent -> PENDING);
  operation-workflow-transition-retry step (recorded, else the operation's);
  migration-coordinator update status (requested, else the row's);
  debug-metadata-service create (birth ACTIVE) and update (existing status);
  bootstrap-node-ready-rebalance-owner resolveMergedNodeStatus (incoming,
  else previous); node-liveness-semantic-projection state (absent ->
  UNKNOWN); replica-operation-liveness readDisplayStatus /
  readDisplayWorkflowStep (normaliser '' -> named UNKNOWN keys, 3 sites);
  membership-publication-readiness-repair (latest row, else latest published
  row, else PUBLISHED: HEAD's decision kept, R17 to the publication owner: a
  convergence with no stated status reports PUBLISHED).
- publication record's two spellings (N1 class, routed to
  system-table-row-decoders; exact semantics of the stream's first-non-empty
  ternaries): active-node-publication-snapshots publicationStatus;
  control-plane-readiness-priority-recovery-planning x3;
  control-plane-readiness-publication-planning-snapshot (planning snapshot,
  then retained snapshot, then gates, written as explicit STATE_ABSENT
  decisions so the cross-record order stays visible);
  priority-publication-safety-rows.
- helpers deleted/folded: query-executor-shared readSignatureStateText ->
  signatureStateText(readStateField(...)); operation-workflow-recovery-
  reconcile-dispatch-pending readFirstSnapshotStateText -> readStateField over
  the same three sources, trimmed when stated; debug-metadata-service
  isStatedSessionStatus deleted; priority-recovery-visibility-decision
  readVisibilityRowField no longer reads a state (only connection/lease/health
  fields, alias reads for the decoders quest); wasm-service-models statedOrBorn,
  control-plane-publications-leadership isLeaderRaftRole,
  bootstrap-topology-snapshot-owner-contract status/raft-role readers,
  canonical-leader-routing role reader, admin readiness-context entry status,
  move-replica-assignment-reservation-persistence status, membership-
  publication-planning-evidence resolveBuiltPublicationStatus,
  move-planner-state-methods state, operation-workflow-owner-execution-lane
  resolveDeferredWorkflowStep, replica-operation-liveness timeline step:
  identifier-form copies folded into the reader.
'' handling: the inline copies accepted '' as a state where the reader
answers STATE_ABSENT. Every folded field is written only from named
constants (lifecycle phases, ReplicaStatus, WORKFLOW_STEP, publication and
session statuses), so '' has no producer; where it did matter the HEAD form
was `||` (already treating '' as absent) and the round-2 ternary had
diverged from HEAD, so the fold restores HEAD.
Witnesses: test/scripts/code-navigability-detectors.test.js (conditional
positives/negatives, nesting); test/scripts/state-read-named-defaults.test.js
(ESLint = detector for 5 conditional shapes x 19 reads; silent shapes).

### N4, N5
- N4: operation-record-step-shape.test.js pins the key-presence dispatch:
  camel only, snake only, both (snake wins), `workflow_step: ''` with a camel
  value (STATE_ABSENT), `workflow_step: undefined` (key presence decides),
  neither, null, undefined. Mutant M3 (first-present-of-two) turns it red.
- N5: the ESLint positions are generated to STATE_READ_DEFAULT_RIGHT_NESTING
  = 6 parenthesised right-nested chains (was 1). The parity witness includes
  nesting 2, 4 and 6; a further test states the bound: at nesting 7 the
  detector counts and ESLint is silent. The detector witness counts nesting 8.

### N8 (ruling b)
A MOVE_REPLICA rollback rebuilds the stored row through
buildRegisteredServiceMutationRow; a stored NULL raft_role is restored as
NULL. HEAD's `|| RAFT_ROLE.FOLLOWER` healed it to 'follower', the silent
default this quest removes (it made a role-less row look spread-visible:
membership-publication-priority-partition-summary `raft_role_missing`).
Witness test/bootstrap/registered-service-row-raft-role.test.js (NULL ->
NULL, stated role/status restored, status-less registration born ACTIVE).

### N7 and routings
- N7: `npm run -s generate:source-owner-index` after
  `npm run -s test:metadata:refresh`; src/utils/INDEX.md lists
  state-field-read.js (importers: hub).
- N1, N9 -> system-table-row-decoders; N2's authority-then-local fallback
  (operation-workflow-replace-terminal-admission.js:114) -> its owner (R17);
  unchanged here as ruled. The admin-test-run overlay (two sources) also
  unchanged.

### Ratchets
- two_source_fallback_reads baseline 1695 -> 1691 on the hint (0 raised
  identities by filePath|kind|functionName). Complexity 1731 -> 1714 on the
  hint (base 1731 measured on the merge tree). Hints printed but already
  present on the merge base 95877e60b (not this candidate, left to their
  owners): owner_port_feature_detection 2124->2020, inheritance_depth_over_two
  65->58, typeof_dual_paths 621->596, alias_exports 40->38, cognitive
  complexity 147->146 (detector counts on an archive of b18f512c2 equal the
  candidate's for these rows).
- Duplication 42/1330 src, 648/24259 test.

### Round-3 closeout (lead's closeout agent, 2026-11-09)
Implementer 4 stopped after launching the split lab runs; this section
finishes its record. The staged tree is unchanged by the closeout except
this notes section (`git diff --cached` src/test/scripts identical to the
r3 snapshot refs/wip/nav-defaults-r3-2303 = 744ac6f86, which differs from
the final index only in this file).

Inventory re-checked on the final staged tree:
- B1: resolveOperationOwnerNodeId routes through
  readOperationRecordWorkflowStep; mutation (restore
  `readStateField(operation?.workflowStep)`) turns
  operation-record-step-shape.test.js red (4 pass / 1 fail), restored.
- Ruling (a): `grep` for "only decoded operations reach here" / "producer
  guarantees" / "raw rows reach here" in src = 0; the routed and re-proven
  sites are the table above.
- N3: state_read_defaults 0/0 with the conditional shape counted; ESLint
  `--print-config` on a src file: one `no-restricted-syntax` rule object,
  severity 2, 49 entries (36 state_read_defaults + 13 promise).
- N4/N5/N8/N10 witnesses green locally (operation-record-step-shape 5/5,
  state-read-named-defaults 5/5, code-navigability-detectors 17/17,
  registered-service-row-raft-role 3/3, operation-progress-store-persistence
  20/20, check-guideline-navigability 12/12 incl. the stream's
  promotedPatterns exemption).
- N7: src/utils/INDEX.md lists state-field-read.js.
- Stream readiness sites (ruling e): detector row 0 covers the 17.

### Round-3 lab (candidate 744ac6f86, base 95877e60b)
Candidate runs (implementer 4, `test changed --base-sha 95877e60b`):
- carinas-windows ordinary: 2048 files, 2045 pass, 3 fail.
- lenovo-laptop bootstrap: 220 files, 217 pass, 3 fail.
- lenovo-laptop external-toolchain: 22/22 pass.
- lenovo-laptop exclusive: 118 files, 92 pass, 15 fail, 11 no result
  (controller lost ssh to lenovo, "server not responding"; the host stayed
  up, uptime 21h, the remote run continued).
- (r3-lab-lenovo.log at 97e7eac35 refused on stale seal metadata;
  r3-lab-lenovo-2.log lost ssh after 108 files: neither counted.)
Classification runs (closeout; comment-touch snapshots so the cone holds the
red files, metadata regenerated, refs/wip/nav-defaults-r3c*):
- B-carinas: base 65d2e8f33 (95877e60b + 32 touches), carinas ordinary:
  201 files, 197 pass, 4 fail.
- B-lenovo: same base, lenovo `--lane all`: 239 files, 216 pass, 18 fail,
  5 no result (ssh drop again at the tail of the exclusive lane).
- C2/B2-tv: 2ea05e229 (744ac6f86 + 13 touches) / 83d1b7976 (95877e60b + 13
  touches), tv-dator: candidate 215 files 212 pass 3 fail; base 214 files
  212 pass 2 fail.
- C3/B3-tv: 3fd316dd6 / baf00d21e (2 touches each), tv-dator: candidate 204
  files 203 pass 1 fail; base 203 files 201 pass 2 fail.
- Local, workstation, two rounds each side, same two formation files.

| Red on the candidate | Class | Evidence |
| --- | --- | --- |
| q10-postgres-compatibility-certification-matrix (carinas) | base-red, host | B-carinas red, same DRIVER_VERSION_UNSUPPORTED (host psql major outside the certified set); green locally both sides |
| pgwire-runtime-module (carinas) | base-red, host | B-carinas red, same ECONNRESET after "should close listener"; green locally both sides (131 vs 148 ms) |
| single-path-partition-cutover (carinas) | base-red | B-carinas and B-lenovo red, same "seed bootstraps through production construction" via seed participant release_fact_unavailable |
| cdc-source-occurrence-delivery, seed-release-failure-custody (lenovo bootstrap) | base-red | B-lenovo red |
| fresh-seed-activation (lenovo bootstrap) | host/timing | 252 s vs the 240 s test bound on lenovo; base on lenovo 206 s green; candidate on tv 53 s green (round 2 same class) |
| cdc-group-boundary-handoff, membership-consistency, message-group-membership-claim-cache, public-consumer-contract-ratchet, seed-node-bootstrap, minimal-deployment-runtime-access-policy-live-validation, insert-or-ignore-raft-replay, single-node-default-replica-count-writes, control-plane-rebalance, raft-leader-election, three-node-seed-rebalance, lagrange-server-npm-package, leader-metadata-validation, managed-split-admission-reliability (lenovo exclusive) | base-red | all 14 red in B-lenovo; lagrange-server-npm-package also red at base in B2-tv and B3-tv |
| preflight-critical-path-hops (lenovo exclusive) | host/timing | 133 s red on lenovo under the full exclusive lane; base on lenovo 79 s green; candidate on tv 41 s green |
| minimal-deployment-call-cell-invocation-live (no result on lenovo) | base-red | red in C2-tv and B2-tv alike (36.5 s / 36.2 s), red in B-lenovo |
| multi-node-raft-replication (no result on lenovo) | host/timing (flaky, red at base locally) | C2-tv red once (CDCConfirmationTimeoutError on nodes), C3-tv green 76 s; B2/B3-tv green; locally red on BOTH sides in both rounds with the same two subtests ("Raft append ack ..." timeout) and equal durations (32-38 s) |
| critical-replica-placement-causal-trace (no result on lenovo) | base-red (flaky at base) | C2-tv and C3-tv red at "seed bootstrap succeeds" (135 s, seed participant release_fact_unavailable); B3-tv red identically (135 s, same release failure), B2-tv green once; locally red on both sides identically (subtest 5 timeout, 31-32 s) |
| the other 8 lenovo no-result files | green | all green on the candidate in C2-tv |
No red is candidate-caused. The shared seed participant release
"release_fact_unavailable / replica_release_reply" expiry appears at base on
carinas (2), lenovo (11) and tv (2) log lines, as in round 2: owner seed
participant release, R17, not this quest. The candidate's only edit near it
(replica-handler-release-recovery statusReportOf recoveryPhase:
`?? null` -> readStateField) is a diagnostic field and STATE_ABSENT is null.

### Round-3 checks on the final staged tree (closeout)
node --check on 224 changed .js files 0; eslint on them 0; `npx eslint src`
0; `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit` 0;
test:duplication 0 (src 42/1330, test 648/24259); audit:guideline:navigability
0 (tighten hints only on rows already present at the merge base:
inheritance_depth_over_two 65->58, typeof_dual_paths 621->596,
alias_exports 40->38); audit:file-size 0; test:metadata:refresh 0, no
change; `solve.js probe` 0 (metric 0, target 0, done).
Rows: state_read_defaults 0/0, row_field_alias_reads 707/745,
two_source_fallback_reads 1691/1789.

### Verifier's model for the round-3 delta
The delta is the quest diff of round 2 (03a63c859..f83523ed8) against the
quest diff of round 3 (95877e60b..staged), compared per file by the +/-
lines: 160 files carry the identical quest hunk, 79 differ (65 src, 10
test, 4 scripts/config: eslint.config.js, scripts/check-complexity.js, the
two_source_fallback_reads baseline, scripts/checks/code-navigability-
detectors.js). List: /tmp/claude-1000/-mnt-data-peter-projects-lagrange/b57bdb9b-ebd1-4b81-aa6b-3edafb0a0148/scratchpad/r3c-delta-files.txt.
Read the 79 against:
1. Merge resolution (six readiness files, eslint.config.js, the
   navigability test, the epic file): the stream's form plus the quest's
   edit; the 17 stream sites listed under "Stream merge".
2. Step-read routing (ruling a): every operation-record workflow-step read
   goes through readOperationRecordWorkflowStep; the claim to check is the
   key-presence dispatch (N4 witness) and that rowToOperation output holds
   no snake key; no call-graph claim is relied on.
3. Producer re-proofs (not routed): STEP_CHANGED newStep, five raft_role
   sites, seven publication-status sites; each with the producer list above.
4. N3 folds: each former typeof/length/truthiness ternary becomes the
   reader plus, where HEAD named an outcome, an explicit
   `=== STATE_ABSENT` decision; the one behavioural difference is '' now
   absent, argued per field above (no producer writes '').
5. Detector/ESLint extension and its witnesses (conditional shape, nesting
   bound 6, parity test).
6. N8 rollback witness (NULL raft_role restored as NULL, ruling b).
Routed, not repaired here: N1, N9 (system-table-row-decoders), N2 (R17).

### Correction after the round-3 verification (lead)

The round-3 text says routed reads treat an empty string as absent "as `||` had it". Five of those sites used `??` at HEAD, so an empty string was a present value there. The only observable instance is isOperationLedgerSelfMoveDispatchClaimed, which answered "claimed" for an empty step at HEAD and answers "not claimed" now. workflow_step is NOT NULL and every writer uses the WORKFLOW_STEP constants, so an empty step is unreachable in production.
