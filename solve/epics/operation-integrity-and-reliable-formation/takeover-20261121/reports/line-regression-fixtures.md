# Line-regression fixture repair (G4, G5, G6, G7-fixture) — running record

Agent `claude:lr-fixtures`, 2026-11-21. Worktree `/mnt/data/peter/projects/.worktrees/line-regression-fixtures-20261121`,
branch `work/line-regression-fixtures-20261121`, base 23344cddc. Tests only, no `src/` change.
Instruction sources: CLAUDE.md, the lead's brief, `docs/steering/rules.md` (R03/R04/R19), `test/guidelines/fixtures.md`,
triage `reports/base-red-triage.md`, strict-operation-outcomes log line 38 (2026-11-20 fixture-migration decision).

Failing subtests per file at head 23344cddc (from `lab/w2-cone-23344cddc.log`):
scratch extract in the agent's scratchpad (cone-fails.txt); summarized per file below.

## Shared helpers

- `test/rebalancer/test-helpers.js`: `createObservationOnlyMutationPort`, `createFixtureSystemMutationPort`,
  `withExecutorMutationPort`, `applyOperationRowUpdate`, `routeOperationRowUpdates`, `createOperationRowInsertPort`.
- `test/rebalancer/operation-outcome-fixture.js`: `workflowFixtureHistory` (the strict-outcomes "producer history").

## Added shared helper (test/rebalancer/operation-outcome-fixture.js)

- `buildCreatedOperationFixture(params)`: the coordinator's record = `createOperationAt(params, createdAt)` (src
  `replica-status.js`, the one record builder) + `normalizeRebalancerEntityIdentity` (the coordinator ingress).
- `advanceOperationFixture(record, step, updatedAt)`: step, `WORKFLOW_STEP_TO_STATUS[step]`, step appended to history.
- Durable row = `buildCanonicalReplicaOperationRow(record, lease)` (src `replica-operation-repository-mutation-row-methods.js`,
  the repository's and placement applier's one row builder; JSON-text `steps_history`, canonical entity columns).

## Commits / pushes

- G5: c22d786d5fb1ddf13416b1f27835e286e7bb8076 (pushed). Lab `lab/lrfix-g5-1` (tv-dator): 3/4 green —
  bootstrap-failures 61 assertions, routing.property 41, mg-routing 21 (all pass); reservation-expiry case 2 red:
  the sweep proves terminality by `operation.completedAt !== null`
  (`rebalance-coordinator-reservation-lifecycle-methods.js` buildReservationOrphanReconcileSnapshot) and the advanced
  ACTIVE record had completedAt null. Fix: `advanceOperationFixture` stamps completedAt on terminal steps (owner's
  terminal commit does, `operation-workflow-transition-persistence.js` completedAt: now) — folded into the G6 commit.
- G6: first attempt refused by the hook (working tree must match the index for derived metadata: an unstaged test
  edit blocks the commit); second attempt killed externally (rc=143) mid-hook; third landed:
  5880e9d350e6dcb675d4a83b59f0af88975fe16e (pushed), includes the completedAt follow-up.
  Lab `lab/lrfix-g6-1` (tv-dator, 5880e9d35): 4/4 green — direct-wakeup-delivery-decision 6, self-owned-handoff 9,
  reservation-expiry 10, mg-routing 21 (re-run). **G5 4/4 and G6 2/2 green.**
- G4: cf43a76ff1f3af507953d8d69f92358b27fc8de9 (pushed). Lab `lab/lrfix-g4-1` = RUNNER FAILURE (tv-dator "not a
  ready lab machine this run", held by another agent), not a result. `lab/lrfix-g4-2` (adams-gamla, cf43a76ff):
  gateway-sql-mutation-fallback-phase-scope 16 green, membership-count-neutral-steady-trim 35 green,
  snapshot-dispatcher-wiring 21 green; rebalancer-entity-interaction-contract red as expected (case 8 now green,
  cases 2/3/6 remain: hand-built evaluation context, not migrated); initialization-shutdown-serialization: case 5
  green, case 6 NEW first failure "Missing expected rejection" (`createReplicaAsync` resolves although the
  post-construction runtime `shutdown()` rejects; asserts shutdownCalls>=2, releases 1, pendingRuntimeShutdowns
  holds the service). Not a fixture seam: stopped, for the product-cause investigation (b0dd82398 CREATE work
  ownership is the candidate).
- G7: 50cc71c3c097cf50834907a131edd705cbd0daac (pushed). Lab `lab/lrfix-g7-1` (adams-gamla): operation-record-step-shape
  5 green, admission-real-size-estimates 27 green; replica-operation-insert-retry-idempotency still red at case 1
  "Authoritative replica operation not confirmed" after the completeness migration. Next suspect (not tested): the
  hand-built row is `status:'in_progress'` at `workflow_step:CREATING` (owner status for CREATING is 'creating');
  the visibility check compares observed status with the step's status. Successor: build the row with
  `buildCanonicalReplicaOperationRow(advanceOperationFixture(buildCreatedOperationFixture(...), CREATING))`.
- Agent stopped here (context budget). Follow-on receipt groups NOT started (plan above).
- G4/G7: edits drafted on scratch copies (agent scratchpad `draft/`), applied after the previous commit lands.

## Follow-on assignment (coordinator, mid-run): receipt groups G1/G2/G3/G13/G18 + G12 two items — NOT STARTED

Source: `reports/line-regression-causes.md` §1-4. Rule: a fake standing in for a control-plane write producer must
answer what the real producer answers (7d261f681: APPLIED only with the producer's `durableCommitWitness` bound to
the attempt's partition and `entryId = deriveParticipantEntryId(key, partition)`), via the real producer or ONE
shared helper calling the production builders; a fake modelling a genuinely unknown outcome must also provide the
owner's read-back. No assertion changes; tests pinning the OLD contract (bare success settles) → report.
Builders found: `buildDurableCommitWitness` (`src/partition/partition-write-kernel.js:307`), the partition apply
answer (`src/partition/partition-service-entry-apply-base.js:641-662`), the engine rendering carrying
`durableCommitWitness` (`src/query/query-executor-sql-command-rendering.js:90,355`), `deriveParticipantEntryId`
(`src/query/distributed/distributed-write-coordinator.js:77`), participant `partitionId` added in
`executePlanParticipants` (:239-262). Real-chain host to reuse: `test/query/unknown-outcome-surface-fixture.js`
(`withSurface`). Shared fakes to migrate first (one place, many files): `createCreationSqliteFixture`
(`test/control-plane/service-instance-creation-sqlite-fixture.js`; 14 consumers incl. wasm bound-*, G18),
`insertViaUpsert`/`createMockCdc` (G1/G3 registration and heartbeat mocks; ~70 references), engine fakes answering
`{success:true, affectedRows}` behind a real CDCIntegrationService (G2). G3 `heartbeat-storage-budget-preservation`
pins the pre-8540d6b7a write options (no `confirmWriteEffect`) = old-contract pin → report, do not migrate.
Judge repair (TypeError → UNKNOWN) is on `work/line-regression-causes-20261121`, not on this branch: until it lands,
migrated G2/G13/G18 files can only be judged by whether they reach APPLIED; unmigrated ones throw.
G12: `sql-query-engine-create-table-quorum` — raise `tablePartitionProvisioningTimeoutMs: 10` (spent by the new
per-read fence `assertProvisioningAttemptBudget` before the first admission read) to a budget the fence can honour;
assertion `/insufficient/i` unchanged. `bootstrap-api` seed case — move to the real path (CDC wired before HTTP opens,
`lagrange-runtime-startup.js:486-510`), fallback stays removed.

## G5 persisted history is not JSON text

Production check: `decodeReplicaOperationRow` is used for SQL rows, CDC-applied `event.data` and wake rows; the
repository writes rows only through `buildCanonicalReplicaOperationRow` (steps_history = JSON.stringify). Not
re-verified: whether a CDC UPDATE event's `data` can be a partial row without steps_history (cdcApplied emits
`event.data` as received) — recorded as an open product question, not pursued (quest decision already taken).

| File | Cause at head | Migration | Lab |
|---|---|---|---|
| control-plane/replica-dispatch-node-state-update-node-row-bootstrap-failures | case 1 hand-built CDC/cache rows without history; sync throw + unhandled rejection crashed the process (cases 10-13 "unfinished"/"left in queue" are collateral) | one producer row for both CDC and cache paths | pending |
| rebalancer/message-group-operation-routing.integration | case 1 hand row without history; case 3 (separate) engine answered `{rows:[],changes:1}` for all SQL → SENDING write deferred, visibility wait 5 s spent, no delivery | case 1 producer row, claim answer = same record; case 3 `createTestCoordinator` (production-schema SQLite ledger seeded with the producer row, `replaceWitness:false`, `committedMembershipFixture:false` so the spy router is unwrapped) | pending |
| rebalancer/reservation-expiry-operation-aware | cases 1-2 hand-planted op rows without history | `seedOperation` builds created record → advanced to SYNCING/ACTIVE → canonical row | pending |
| control-plane/replica-dispatch-routing.property | arbitrary rows without history | arbitrary yields params → record + canonical row; claim answer = record | pending |

## G6 Unsupported rebalancer entity type: undefined

- control-plane/replica-dispatch-node-state-update-remote-direct-wakeup: **STOP (not fixture-only)**. Besides the
  entity-less inputs (cases 1, 3, 8), cases 1, 4 and 6 assert `t.same` on the delivered OPERATION_ROW with the
  pre-4f347ca3f wake-row literal (status/completed_at `undefined`, steps_history `'[]'`, no other columns). The
  canonical wake row now adds 22 null columns (lease_expires_at, source_replica_id, copy_source_node_id,
  message_group_*, create_admission_*) — case 6 already passes entityType and still fails on exactly that diff
  (cone log). Passing needs the expected rows restated = an assertion change on a product contract change
  (4f347ca3f changed src only). Not edited.

- control-plane/replica-dispatch-direct-wakeup-delivery-decision: entity-less coordinator op → record via
  `buildCreatedOperationFixture` (assertions are on branch counts only).
- rebalancer/self-owned-coordinator-handoff-dispatches-in-process: same (both cases, advanced to SENDING).

### Wake-row shape class (STOP, product contract change 4f347ca3f, src-only commit)

Three files assert `t.same` on the delivered OPERATION_ROW with the pre-line wake-row literal; tap `same` fails on
extra non-undefined keys, and the canonical wake row adds 22 null columns: remote-direct-wakeup (cases 1/4/6),
ready-node-retry-cache-priority (cases 6/12/13), ready-node-retry-dispatch (case 9 "authoritative rediscovery should
still re-enter the canonical per-operation queue", diff shows the added columns). Needs a ruling to restate the
expected rows as the canonical wake row (e.g. expected = `buildReplicaOperationWakeRow(record)`).

## G4 stale construction / removed paths

- gateway-sql-mutation-fallback-phase-scope: NodeRegistrationOwner now requires `getSystemTableCache` (774d58f2e);
  production (`query-system-state-phase.js:80`) passes it and `hostId`. Fixture: add both (null cache, precedent
  boot-incarnation-owner / cold-node-authority tests; `LOCAL_MACHINE_HOST_ID`). Also clears this file's omission in the
  G11 census `node-host-identity-start-site-census`.
- snapshot-dispatcher-wiring: ReplicaHandlerSetup now requires a cache-change reader (`get`, `onCacheChange`,
  `offCacheChange`; d31cbc87b). Fixture: real `SystemTableCache` seeded with the lifecycle services row +
  `createLifecycleCdcServiceForCache(cache)` (precedent: d31cbc87b's own test, replica-handler-owner-path-bypass).
- initialization-shutdown-serialization (cases 5-6): handler now asks `owner.ownsPhysicalWorker(claim)` (b0dd82398).
  Fixture `releaseOwner` substitute gains it with held-until-released semantics (precedent:
  replica-admission-delivery-lifetime.test.js:688). Evidence ceiling: admission owner substituted, not real.
- membership-count-neutral-steady-trim (case 9): publication persist reads back via `owner.getPublication`
  (ff1a075bd). Fixture double gains `getPublication` over its durable row (exact precedent of ff1a075bd's own
  migration; this was the only publications-owner double without it).
- bootstrap-api: **STOP** — removed path (pre-CDC bootstrap SQL fallback; `assertCdcIntegrationService` 7d261f681).
  Only a product change or deleting the case makes it pass; owner ruling needed.
- rebalancer-entity-interaction-contract: case 8 fixture (untyped row lacked JSON-text history, so history decode
  threw before the identity refusal) → give the untyped observation valid JSON-text history. Cases 2, 6: the
  hand-built evaluation context imitates the workflow owner; the evaluator now calls
  `repository.getRequiredRemoveArbitrationCompetitors(operation)` (requires the subject's own durable row in the
  entity ledger) and `context.buildDeferredRemoveSafetyEvaluation`. Case 3: `getMoveSafetyError` no longer goes
  through `getRemoveSafetyError` (78413c60d) — the stubbed seam is gone. Proper repair = rebuild on the real
  workflow owner (createTestCoordinator) with committed subject rows; NOT done (budget).
- durable-voter-visibility-role-write: NOT done. Real `AuthoritativeRowMutationHelper.executeFlush` → real gateway
  refuses the predicate (undefined / non-schema column) built from the hand-built "contract-faithful" services
  store rows. Needs rows from the real services row owner; 692-line custom store.

## G7 authoritative read incomplete (fixture part)

- operation-record-step-shape: input contract changed to `{operation, targetObservation}`; `targetLifecycleStatus: null`
  (absent) → authoritative ABSENT observation from the owner's exported constants (same object the repository builds).
- replica-operation-insert-retry-idempotency: collision confirmation reads with `requireCompleteExactKey`; the fixture's
  whole authority (`authoritativeRows()`) answered without `rowSetComplete`. Reads through
  `createMockControlPlaneSystemTableGateway` (shared `withAuthoritativeReadDefaults`).
- admission-real-size-estimates: entity census answered without completeness; reads through the same shared gateway
  (single-entity world: the store's all-rows answer is the complete entity census).
- duplicate-operation-prevention.property, storage-reservation-lost-outcome-idempotency: NOT done. Their hand SQL
  readers answer every unmatched read (incl. the entity census) with `rows: []`; marking that complete would be a
  false authority once operations exist. Needs the production-schema store (createCoordinatorSqlStore) and producer
  rows for seeded operations.
- ready-node-retry-cache-priority, ready-node-retry-dispatch: wake-row shape STOP (above); cache-priority cases 3/4
  also hand-build `repository.queryIncompleteOperations` answers without entity identity/history.
- placement-create-bootstrap-binding: not examined (budget).

## Successor B (agent `claude:fixtures-b`, 2026-11-21)

Worktree `/mnt/data/peter/projects/.worktrees/line-regression-fixtures-b-20261121`, branch
`work/line-regression-fixtures-b-20261121`, base 50cc71c3c (predecessor head). Tests and test helpers only, no `src/`.
Instruction sources: CLAUDE.md, lead brief, `docs/steering/rules.md`, `test/guidelines/INDEX.md`, this report,
`reports/base-red-triage.md`.

### Item 1: wake-row intent (4f347ca3f) — INTENDED

4f347ca3f "Use canonical operation row codecs for dispatch replay and wakeups" deleted the dispatch service's
local 17-column `buildOperationRowFromCoordinator` row and returned `buildCanonicalReplicaOperationRow(operation, ...)`
(diff of `src/control-plane/replica-dispatch-readiness-capture.js`); e8f4bdb84 ("Keep ... operation wake custody exact
end to end") named it `buildReplicaOperationWakeRow` (`replica-operation-repository-mutation-row-methods.js:96`) and
routes all three wake producers through it (readiness capture :129, `operation-workflow-owner-handoff-state.js:292`,
`membership-publication-coordinator-reads.js:546`). The 22 extra columns are the canonical row's own nullable columns,
so the full canonical row in the wake is the intended contract.

Shared helpers added to `test/rebalancer/operation-outcome-fixture.js`:
- `expectedOperationWakeRow(operation, assertedColumns)`: column set and unasserted values from
  `buildReplicaOperationWakeRow(operation)`; `assertedColumns` overlay as literals; a name outside the canonical
  column set throws (renamed/dropped column fails).
- `readBackOperationFixture(operation)`: `decodeReplicaOperationRow(buildCanonicalReplicaOperationRow(op, null))` =
  what `repository.rowToOperation` / `queryIncompleteOperations` answer.

Literal (asserted) columns in every migrated wake expectation: the same 17 the old literal pinned — operation_id,
type, partition_id, replica_id, source_node_id, target_node_id, status, workflow_step, created_at, updated_at,
completed_at, error_message, steps_history, entity_type, entity_id, target_claim_key, membership_publication_epoch.
The 22 added columns come from the builder.

Changed expected values (old → new, all because the input is now the producer's record/row instead of a hand
object that lacked the field): status `undefined` → `'pending'`; completed_at, error_message `undefined` → `null`;
replica_id `undefined` → `null` where the case names no replica; steps_history `'[]'` →
`JSON.stringify([{step:'PENDING', timestamp:createdAt}])` (literal, not taken from the producer); created_at
`undefined` or self-referential (read back from the actual delivery) → the literal creation time; entity_type/
entity_id `undefined` → `'partition'`/partition id (remote-direct-wakeup case 1). No assertion removed or loosened.

Per file:
- `control-plane/replica-dispatch-node-state-update-remote-direct-wakeup`: cases 1, 3, 4, 6 inputs =
  `buildCreatedOperationFixture` (cases 3/4/6 keep their original updatedAt via `{...record, updatedAt}`: the same
  PENDING record after a later owner write); case 1 and case 6 expected rows via `expectedOperationWakeRow`
  (case 6 created_at/updated_at literals unchanged).
- `control-plane/...-ready-node-retry-cache-priority`: cases 3/4 `queryIncompleteOperations` answers =
  `readBackOperationFixture(buildCreatedOperationFixture(...))` (cause: the entity-less record made
  `buildOperationRowFromCoordinator` throw; `getAuthoritativeDispatchRetryRowsForNode`
  (`replica-dispatch-replay-readiness.js:565-591`) catches it, logs a warn and answers `[]`, so the authoritative op
  was silently dropped — an error turned into "no rows" in production code; recorded, not in scope); case 6 cache row,
  case 12 cache INSERT row, case 13 CDC data = `buildCanonicalReplicaOperationRow(producer record)`; expected wake rows
  via `expectedOperationWakeRow`.
- `control-plane/...-ready-node-retry-dispatch`: cases 9/10 `queryIncompleteOperations` answer = read-back of the
  producer record (case 10 created a minute ago, as its old updatedAt); expected rows via `expectedOperationWakeRow`.

### Item 2: replica-operation-insert-retry-idempotency

Cause confirmed (lab `lrfix-g7-1` stack: `resolveNewOperationInsertCollision` :257 = no row observed): the exact-key
read (`replica-operation-repository-read-methods.js:390-412`) runs `assertOperationUpdateRecord`, which refuses the
hand row's `status:'in_progress'` at CREATING (STEP_STATUS_DISAGREE, `replica-operation-update-outcome.js:157-159`), and
defers. Fix: `makeRow()` = canonical row of the producer ADD advanced PENDING→SENDING→CREATING. The content-mismatch
case used an impossible SENDING/`'failed'` tuple (now refused at decode, so it no longer exercised the mismatch); it is
now the same ADD committed at SENDING (updated_at 1), which reaches the step/status mismatch
(`isReplicaOperationVisibilitySatisfied`). Fixture input change only; no assertion changed.

### Item 7: initialization-shutdown-serialization case 6 — investigation only (no change)

Production does NOT swallow a post-construction shutdown rejection when the factory honours the exact construction
handoff:
- `replica-handler-create-methods.js:336-337` (handler shutting down) returns `retireReplicaCreateWork(...)`;
- `replica-handler-create-work.js:242-247` fences `work.openedService` through `fenceFailedReplicaCreateRuntime`;
- `replica-runtime-cleanup-custody.js:73-95`: the service is put in `handler.pendingRuntimeShutdowns` before
  `service.shutdown()`, the rejection is rethrown (wrapped with the primary CREATE error by
  `withRaftOpeningCleanupFailure`), and the entry is deleted only after a successful shutdown; `shutdownReplicaHandler`
  keeps "failed releases reachable";
- `replica-handler-create-methods.js:715` `return await failCreate(error)` propagates the rejection; `:717` releases the
  claim in `finally`.
Why the test resolves: its factory (`async () => {handler.shuttingDown = true; return service;}`) never calls
`options.onPartitionConstructed`, the exact factory handoff required since **7ccb67f35** ("Require exact factory
handoff for replica publication", after b0dd82398; it migrated ~20 tests, not this one, which was then red earlier on
`ownsPhysicalWorker`). So `work.openedService` stays null, `construction.publish` throws INVALID
(`bootstrap/shared/partition-service-construction.js:42-44`), failCreate takes the shutting-down branch, and
`retireReplicaCreateWork` has no opened service → resolves; the returned service is never shut down. Production
factories always acknowledge through `exposePartitionConstruction` (same file :69-72), which throws otherwise.
Candidate fixture change (NOT applied, needs a lab run): factory `async (options) => { handler.shuttingDown = true;
return completePartitionConstructionFixture(service, options); }` (`test/test-helpers/replica-handler-identity-fixture.js`).
Ruling risk: `assert.ok(shutdownCalls >= 2)` may pin main's two fence attempts (main fenced explicitly after
construction, `0dbed1718:src/node/replica-handler-create-methods.js:596-598`, and again on failCreate); the line makes
one attempt and then retains the service in `pendingRuntimeShutdowns`. If the lab shows 1, that assertion pins the
old contract → ruling. Side observation: with no opened service, the shutting-down branch drops any create error
without a log (`:336-338`).

### Item 8: partition/placement-create-bootstrap-binding — owned by another writer, not edited

At head, cases 12/13 ("ledger self-move dispatch waits for unstamped native ADD in PENDING|SENDING", assertion :522)
and 14 ("all removal phases distinguish complete entity reads...", :577 `voterFloorReads` 0 vs 3) fail with
"Entity partition/placement-bootstrap-p1 operation ledger is unavailable for removal arbitration: Required entity
operation observation is incomplete". Cause: `owner.evaluateRemoveSafety` now reads competitors through
`repository.getRequiredRemoveArbitrationCompetitors(operation)`
(`replica-operation-repository-entity-read-methods.js:246-254`), which requires the SUBJECT's own durable row in the
complete entity read (`if (!own) throw incompleteEntityOperationRead()`) and then `assertRemoveArbitrationSubject`; the
evaluator turns that into the deferred "ledger unavailable" answer (`operation-workflow-remove-safety-evaluator.js:
451-462`). The test's subjects (`peerRemoval` :507-517, `requests` :560-570) are `createOperationAt` records never
committed to the ledger. Fixture change: commit each subject's canonical row (`buildCanonicalReplicaOperationRow`, with
the step it is evaluated at reached through its history, e.g. `advanceOperationFixture`) into the ledger leader
(`commitLedgerStatement` INSERT) before `evaluateRemoveSafety`, so the complete read holds the subject; case 14's
"complete empty owner read" premise becomes "a complete read holding only the subject". (Prospective checks without a
durable subject use `evaluateProspectiveRemoveSafety` instead, evaluator :714-719; the effect owner's
`evaluateRemoveSafety` proves its own row by design.)

### Item 6: bootstrap/bootstrap-api case 14 — STOPPED (real path blocked by G2)

Only case 14 ("register-service falls back to bootstrap-scoped SQL mutation routing when CDC mutation helpers are not
ready yet") is red at head (cone 23344cddc: 146/149). Its last four assertions pin the removed path itself
(`sqlCalls.length === 1` "route through the SQL fallback once", `INSERT INTO services` via raw SQL,
`options.phaseScope === 'bootstrap'`, no `skipCacheWait`). The real path (production hydrates BootstrapAPI with the
real `cdcIntegrationService` before `bootstrapAPI.initialize()`, `src/lagrange-runtime-startup.js:487-509`) is the
gateway's CDC route (`control-plane-system-table-gateway-mutation-submission.js:346-355`; the startup-SQL branch there
exists only for gateways built with `startupSqlMutationPhase`, i.e. the JOIN admission owner,
`node-registration-owner-publication-methods.js:381`). That exact route is red at head for an ordinary registration:
`register-service-move-handoff-refused` (wires `cdcIntegrationService: createCdcIntegrationServiceFixture(rows)`)
answers 500 "Cannot read properties of undefined (reading 'partitionId')" (G2, named-write judge). Moving case 14
there now would fail on G2, not on its own fixture. Needs: the G2 judge repair
(`work/line-regression-causes-20261121`) and a producer-faithful CDC double (follow-on plan above). When moved, the
API assertions (200, handoff contract, next-action diagnostics) stay; the four fallback assertions have no real-path
meaning and would be restated as "exactly one canonical services INSERT reaches the CDC mutation owner, no raw SQL
write" — the lead should confirm that restatement (it removes the phaseScope/skipCacheWait pins by the ruling).

### Item 4: rebalancer-entity-interaction-contract — case 3 migrated, cases 2/6 NOT done (plan)

Case 3 ("move preflight preserves canonical entity identity"): `getMoveSafetyError` now calls
`evaluateProspectiveRemoveSafety(this, ...)` directly (`priority-recovery-superseded-target.js:609-628`, 78413c60d),
so the stubbed `getRemoveSafetyError` seam is gone. Rebuilt on the real workflow owner (`createTestCoordinator`,
`coordinator.workflowOwner`, which the coordinator facade delegates to, `rebalance-coordinator-owner-facade.js:323`);
the observed operation is recorded by a pass-through observer on the owner's first evaluator question
(`isRemoveInitialDispatchPhase`), which still delegates to the real method. Both assertions unchanged.
Cases 2 and 6 (plan, not done): build on `createTestCoordinator`; commit the subject (runtime-service REPLACE at
ACTIVE for case 2; message-group REMOVE and runtime-service REMOVE at PENDING for case 6) as canonical rows in the
store (`cacheData.replicaOperations`), because `getRequiredRemoveArbitrationCompetitors` requires the subject's own row;
put the services rows in `cacheData.services` (the store answers services reads from the cache via
`answerFixtureServicesRead`, with rowSetComplete and witness); nodes node-a/b/c READY in `cacheData.nodes` with
`readinessFixture` for `isVoterReadyRoutableReplica`; peer contactability (`evaluateProjectedPeersContactable`) via the
message router; message-group minimum from an authoritative policy fact (`getEntityRemoveSafetyMinReplicaCount`,
`priority-publication-safety-rows.js:181-202`; runtime-service uses `REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE`).
The "calls" assertion becomes a pass-through observer on `owner.repository.getRequiredRemoveArbitrationCompetitors`
(entity identity it was asked for). Expect 2+ lab iterations.

### Item 5: partition/durable-voter-visibility-role-write — NOT started (budget)

Predecessor's cause stands (hand "contract-faithful" services store yields a predicate the canonical gateway refuses,
`control-plane-system-table-gateway-mutation-contracts.js:139`). Note for the successor: once the real gateway hosts
the write, the services mutation goes through the same CDC route as item 6, so the G2 judge state applies.

### Successor B commits and lab

- Group 1 (items 1+2): **b455ca4a8** (pushed; hook regenerated inventory.json, impact-graph-seal.json,
  subsystem-classes.json). Lab `lab/lrfixb-g1-1` (adams-gamla, b455ca4a8): **4/4 green, 139 assertions** —
  remote-direct-wakeup 38, ready-node-retry-cache-priority 37, ready-node-retry-dispatch 54, insert-retry 10 (each
  equal to its assertion count on main 0dbed1718 in the triage).
- Group 2 (item 3 + item 4 case 3): **b2a4d8796** (pushed). Lab `lab/lrfixb-g2-1` (adams-gamla, b2a4d8796):
  duplicate-operation-prevention.property **green, 45** (= main), storage-reservation-lost-outcome-idempotency
  **green, 100** (= main); rebalancer-entity-interaction-contract **red as expected**: 21/23, case 3 now green, cases
  2 and 6 still "context.buildDeferredRemoveSafetyEvaluation is not a function" (hand evaluation context, not migrated;
  plan above).
- Item 3 details: duplicate-prevention seeds the in-flight ADD as the producer row (the hand row lacked the
  schema-required source_node_id and used step 'pending'); storage-reservation only case 1 moved (the other cases seed
  operations directly and never reach the census; they keep the hand engine). No assertion line changed in either
  file (only `sqlEngine.reservations.size` → `reservations.length` read from the store, same meaning).
- Stopped here (context budget). Remaining: item 4 cases 2/6, item 5, item 6 (G2-blocked), item 7 fixture change +
  `shutdownCalls >= 2` ruling, item 8 (other writer). Publications-owner double: not touched by any file here.

### Successor B, continuation after the coordinator's rulings

- Rulings received: bootstrap-api and durable-voter REASSIGNED to the receipt-fakes writer (not touched); the
  bootstrap-api restatement ("exactly one services INSERT reaches the CDC owner, no raw SQL write") confirmed.
- **8e1571c6a** (pushed): items 7 and 8.
- Item 7 (initialization-shutdown case 6) **GREEN**. Factory now hands off through
  `completePartitionConstructionFixture` (7ccb67f35 contract). Retry owner of a retained failed runtime (the line
  makes one fence attempt, `replica-runtime-cleanup-custody.js:83-91`, and keeps it in `pendingRuntimeShutdowns`):
  (a) the node's shutdown, `shutdownReplicaHandler` iterates `pendingRuntimeShutdowns.keys()` and retries each
  (`replica-runtime-cleanup-custody.js:140-157`), rejecting with an AggregateError and keeping the runtime retained
  while it fails (its promise resets so it can be retried, :178-181); (b) a later CREATE of the same replica,
  `createReplicaAsync` → `settlePendingReplicaRuntimeCleanup` (`replica-handler-create-methods.js:441` →
  `replica-runtime-cleanup-custody.js:44-60` → `fenceFailedReplicaCreateRuntime` without a service, :75-81). The
  case now drives (a): `await assert.rejects(handler.shutdown(), <aggregate containing the exact injected failure>)`
  before the unchanged `assert.ok(shutdownCalls >= 2)`; the remaining assertions (releases 1, tracker cleared,
  service still retained) unchanged. Not a product finding: a retained runtime has two retry owners.
- Item 8 (placement-create-bootstrap-binding): confirmed `git diff --stat 23344cddc work/placement-outcome-format-20261121
  -- <file>` is empty (local and origin). Subjects are now producer records committed to the ledger as canonical rows
  before evaluation (`commitSubjectRow`, `committedAtStep`). **Still red (11/14, same count as before)** but past the
  original failure, on a NEW cause that needs a ruling:
  - cases 12/13: the remove-safety assertion (:~548) now PASSES; they then fail at
    "the next dispatch wake sees the committed terminal and may claim the self-move" (:562): the gate answers
    `operation_ledger_self_move_waiting_for_idle_ledger` / "waiting for incumbent operation bootstrap-peer-remove" —
    the durable in-flight REMOVE subject is itself an incumbent of the ledger self-move gate (correct production
    behaviour).
  - case 14 (:603, voterFloorReads 0 vs 3): the three removal subjects are durable at once on the same entity, so
    each arbitrates against the other two (concurrent active operation) and defers before the voter floor.
  The tests' premise "a removal evaluated by the effect owner while the ledger/entity is otherwise idle" is not
  representable once the subject must be durable. Two candidate repairs for a ruling: (1) evaluate each subject
  alone — commit a fresh subject per evaluation, evaluate, commit its terminal (FAILED) before the next step/gate;
  (2) use the prospective evaluator (`evaluateProspectiveRemoveSafety`, the `getMoveSafetyError` path) where the
  case is really a preflight. Not done (budget).
- Item 4 cases 2/6: NOT done (budget); plan above stands.
- Consolidated lab at **8e1571c6a**: `lab/lrfixb-all-1` = RUNNER FAILURE (adams-gamla "not a ready lab machine this
  run", not a result). `lab/lrfixb-all-2` (tv-dator): **20 files, 18 pass / 2 fail, 588 assertions**. Green (17 of
  predecessor + me, no regression): node-row-bootstrap-failures 61, message-group-operation-routing 21,
  reservation-expiry 10, replica-dispatch-routing.property 41, direct-wakeup-delivery-decision 6, self-owned-handoff 9,
  gateway-sql-mutation-fallback-phase-scope 16, membership-count-neutral-steady-trim 35, snapshot-dispatcher-wiring 21,
  operation-record-step-shape 5, admission-real-size-estimates 27, remote-direct-wakeup 38, ready-node-retry-cache-
  priority 37, ready-node-retry-dispatch 54, insert-retry 10, duplicate-operation-prevention 45,
  storage-reservation 100, initialization-shutdown-serialization 6. Red as expected: entity-interaction-contract
  (cases 2/6 unmigrated), placement-create-bootstrap-binding (above).

## Successor C (agent `claude:fixtures-c`, 2026-11-21)

Worktree `/mnt/data/peter/projects/.worktrees/line-regression-fixtures-b-20261121`, branch
`work/line-regression-fixtures-b-20261121`, start head 8e1571c6a (clean). Tests and test helpers only, no `src/`.
Instruction sources: CLAUDE.md, lead brief (per-case caller ruling), `docs/steering/rules.md`,
`test/guidelines/INDEX.md`, this report. Ownership re-check: `git diff --stat 23344cddc
origin/work/placement-outcome-format-20261121 -- test/partition/placement-create-bootstrap-binding.test.js` empty
(origin tip ec1b2f77c), so the placement file stayed mine.

### Production fact that decides the per-case caller

Partition (and runtime-service) operations are created only through placement admission
(`rebalance-coordinator-operation-creation.js:495-499`; production enables it in `control-plane-setup.js:415`,
`bindReplicaPlacementOwnerFactory`). The admission applier refuses any admission on an entity that already holds an
incomplete row: `entityAdmissionDecision` → `PARTITION_BUSY` (`partition-placement-admission-decision.js:202-229`;
incomplete = PENDING/SENDING/CREATING/SYNCING/STOPPING, plus ACTIVE for REPLACE/REMOVE,
`replica-operation-step-policy.js:276-295`); retained repair uses the same decision
(`partition-placement-retained-repair.js:149-155`). So two in-flight operations on one partition entity are not a
ledger any producer can write, in either order. A fixture that commits a second in-flight row there by direct
INSERT does not answer what the real producer answers.

### rebalancer-entity-interaction-contract (commit 5b3c29192)

Shared helper added: `buildCommittedOperationFixture(params, step, at)` in `test/rebalancer/operation-outcome-fixture.js`
(the placement test's local `committedAtStep`, moved there; throws on a step outside the type's workflow).

- **Case 2** ("non-partition remove safety serializes ..."). Caller = the effect owner's dispatch gate on an existing
  REPLACE (`operation-workflow-dispatch-response-reconcile.js:488`, replace remove phase, evaluated without a claim).
  Subject = runtime REPLACE committed at ACTIVE, alone on its entity, in createTestCoordinator's production-schema
  ledger; context = `coordinator.workflowOwner`; services rows from the store's complete services read; peer contact
  through the fixture router. "calls" = pass-through observer on `repository.readRequiredEntityOperationRows(entityType,
  entityId)` (the effect-arbitration ledger read that `getRequiredRemoveArbitrationCompetitors` makes). **GREEN**
  (lab `lab/lrfixc-entity-1`, tv-dator, 5b3c29192: 2/2).
- **Case 6** ("message-group and runtime-service floors remain entity-owned"). Caller = the same dispatch gate (REMOVE
  initial dispatch; the gate claims PENDING→SENDING before evaluating, `dispatch-response-reconcile.js:467-488`, so the
  subjects are committed at SENDING), one coordinator per half (the original had one context per half). Group floor
  from the policy owner's authoritative fact (`createMockPolicyService` message-group policy, minimum 3 as before);
  runtime floor = the owner's `REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.minReplicaCount` (1, as before); group rows
  countable through READY node rows. Runtime half **GREEN**. Group half **STOPPED for a ruling** (red, captured):
  - What production does now (lab `lrfixc-entity-1`, the case's `t.comment`): `fail: message_group group-safety would
    drop active replicas below minimum (2/3)`. The floor is reached and refuses, but classified FAIL, not DEFER:
    `evaluateEntityRemoveSafety` answers through `buildDeferredRemoveSafetyEvaluationForOperation`, which defers only a
    REPLACE removal phase or a REMOVE of an over-replicated system-table partition
    (`priority-recovery-superseded-target.js:357-397`, `operation-workflow-recovery-reconcile.js:513-528`); every other
    REMOVE is FAIL, and the dispatch gate then fails the operation (`settleDispatchFailure`,
    `dispatch-response-reconcile.js:567-573`) instead of scheduling a safety retry.
  - Did DEFER ever describe a reachable state? No. The same deferral logic was already in place when the case was added
    (d29c7d8c8, 2026-08-21); DEFER came only from the hand context's always-DEFER builder (test :100-103 at base). No
    production caller can classify a message-group REMOVE below its floor as DEFER.
  - Ruling needed: restate the expected classification as FAIL (production's answer since the case was written; "cannot
    cross the floor" holds either way), or treat DEFER (retry instead of fail) as the intended message-group contract,
    which is a product change, not a fixture one.
  - Diagnostic added (no assertion): one `t.comment` printing the group answer's classification and reason.
- Case 7 still uses the hand `buildEvaluationContext` (only for the WASM rejection, which throws at the identity check
  before the context is consulted); untouched, green.

### placement-create-bootstrap-binding (commit 92a441229)

- **Cases 12/13** ("ledger self-move dispatch waits for unstamped native ADD in PENDING|SENDING"). Caller = the
  planner's PREFLIGHT, not the dispatch gate. The evaluated removal (the source voter `placement-bootstrap-p1-r1`, on the
  native ADD's own partition, while that ADD is in flight) cannot be durable: placement admission would refuse it
  (PARTITION_BUSY, above), so the effect owner can never evaluate it; the only production caller that evaluates that
  removal against the in-flight ADD is `getMoveSafetyError` → `evaluateProspectiveRemoveSafety`
  (`priority-recovery-superseded-target.js:609-628`). The predecessor's committed subject was a ledger the producer
  cannot write, and it was exactly what then held the self-move gate at :562. Change: the peer removal is the case's
  original uncommitted record again (byte-identical to base), evaluated with `evaluateProspectiveRemoveSafety(owner,
  peerRemoval)` at both sites; this is the competitor census the case was written against (a243a75cf, before the
  subject proof 538bd3330). I departed here from the brief's anticipated "exists" classification of 12/13 because of
  PARTITION_BUSY; the lead may overrule. Result: **GREEN** (cases 12 and 13, lab `lrfixc-all-1`).
- **Case 14** ("all removal phases distinguish complete entity reads from unavailable ownership"). Caller = the effect
  owner's dispatch gate (REPLACE at ACTIVE/STOPPING exists only as an existing operation; the prospective evaluator
  always builds PENDING and answers SAFE for a REPLACE there). **STOPPED for a ruling**; code unchanged in substance
  (only `committedAtStep` → the shared `buildCommittedOperationFixture`, same records).
  - What production does now with the current fixture (lab `lrfixb-all-2`, :603 `0 !== 3`): all three subjects are
    durable and in flight at once, so each arbitrates against the other two as concurrent active operations and defers
    before the voter floor (inferred from the evaluator's competitor loop; the three-at-once ledger is itself
    unreachable, PARTITION_BUSY).
  - Evaluate-alone (commit a fresh subject, evaluate, commit its terminal) is faithful and reachable for round 1 (count 3:
    one in-flight removal on an idle entity, three times) and for round 3 (owner unavailable / incomplete / malformed).
  - Round 2 is not: it needs a durable removal subject beside an in-flight native placement on the same partition. The
    applier refuses that pair in both orders (a removal in flight → the placement at :605 is refused PARTITION_BUSY, no
    incumbent row; the placement in flight → the removal's admission is refused). The old round 2 passed only because the
    removal "intents" were never durable, so the placement census could not see them. For REMOVE at PENDING the old
    expectation does describe a reachable state as a PREFLIGHT (prospective evaluator against the in-flight placement);
    for REPLACE at ACTIVE/STOPPING it describes no reachable state.
  - Options for the ruling: (a) rounds 1/3 evaluate-alone; round 2 = REMOVE preflight via the prospective evaluator,
    REPLACE ACTIVE/STOPPING dropped from round 2; (b) as (a) but REPLACE phases kept by a direct-committed subject,
    labelled as a producer-unreachable defence-in-depth check of the evaluator; (c) round 2 restated as the producer's
    exclusion (the removal's admission is refused PARTITION_BUSY while the placement is in flight).

### Changed expected values

None. No assertion line was changed, removed or loosened in either file. Additions that are not assertions: one
`t.comment` (entity case 6) and comments explaining the caller of each case.

### Lab

- `lab/lrfixc-entity-1` (tv-dator, 5b3c29192): entity-interaction-contract 24/25 subtests, 34 assertions; only case 6's
  message-group assertion red (the stop above), with the owner's answer printed by its `t.comment`.
- `lab/lrfixc-all-1` (tv-dator, 92a441229), the 20 files of `lrfixb-all-2`: **18 pass / 2 fail, 590 assertions** (was
  588). The 18 green files have the same assertion counts as in `lrfixb-all-2` (no regression). Red, both as stopped:
  placement-create-bootstrap-binding 13/14 (case 14 at :603 `0 !== 3`, unchanged from before; cases 12/13 now green)
  and rebalancer-entity-interaction-contract (case 6 message-group half: `fail` where `defer` is asserted).
- Commits: 5b3c29192 (entity file + shared helper; hook also regenerated inventory.json, impact-graph-seal.json),
  92a441229 (placement file; hook regenerated inventory.json, impact-graph-seal.json, subsystem-classes.json). Both
  pushed to `origin/work/line-regression-fixtures-b-20261121`. Two commits total, both through `tools/heavy.sh`.

### Successor C, continuation after the coordinator's rulings

Rulings received: (1) placement cases 12/13 as PREFLIGHT confirmed; (2) entity case 6 message-group half restated as
FAIL with the reason asserted; (3) placement case 14: rounds 1/3 evaluate each subject alone; round 2 = the reachable
part through the prospective evaluator (REMOVE at PENDING) and the unreachable part restated as the admission
applier's refusal in both orders; a test must not commit a state production cannot produce (option (b) rejected);
(4) final consolidated run, all 20 green.

**For the owner (contract as executed):** a message-group REMOVE that would drop active replicas below the minimum
FAILS the operation; it is not deferred and retried.

#### Changed expected values

1. `rebalancer-entity-interaction-contract`, case 6, message-group half (commit c2558d9c2):
   classification `DEFER` → `FAIL`; new assertion on the reason, exact text `message_group group-safety would drop
   active replicas below minimum (2/3)`. Why: the real workflow owner answers this (lab `lrfixc-entity-1`). The entity
   tier reaches the floor and answers through `buildDeferredRemoveSafetyEvaluationForOperation`, which defers only a
   REPLACE removal phase or a REMOVE of an over-replicated system-table partition
   (`priority-recovery-superseded-target.js:357-397`, `resolveRemoveSafetyDeferredReason`;
   `operation-workflow-recovery-reconcile.js:513-528`, `isCriticalRemoveOverReplicated`); every other REMOVE is FAIL,
   and the dispatch gate then fails the operation (`settleDispatchFailure`,
   `operation-workflow-dispatch-response-reconcile.js:567-573`) instead of scheduling a safety retry. Same logic at
   d29c7d8c8, where the case was added; DEFER came only from the hand context's always-DEFER builder and never
   described a reachable state. The diagnostic `t.comment` is removed.
2. `placement-create-bootstrap-binding`, case 14, round 2 (commit cfd056019):
   old: each of REMOVE@PENDING, REPLACE@ACTIVE, REPLACE@STOPPING, evaluated by the effect owner
   (`owner.evaluateRemoveSafety`), names the in-flight native placement in its error (3 assertions).
   new: REMOVE@PENDING evaluated as a preflight (`evaluateProspectiveRemoveSafety`) still names the placement (1
   assertion, same regex); REPLACE@ACTIVE and REPLACE@STOPPING beside an in-flight native placement are restated as
   the real admission applier's refusal in both orders: a native placement requested behind an in-flight REPLACE at
   ACTIVE and at STOPPING is `{outcome: REFUSED, reason: PARTITION_BUSY, operationIds: [that REPLACE]}` and writes no
   row (2 × 2 assertions); a REPLACE requested behind the in-flight placement is `{REFUSED, PARTITION_BUSY,
   [the placement]}` and writes no row (2 assertions). Added: the contender placement is asserted `ADMITTED` (1).
   Why: the pair cannot exist (PARTITION_BUSY), so "a removal is judged against the in-flight placement" moved from
   the removal-safety evaluation to the admission boundary for existing operations; a comment at the round says so.
3. Case 14 voter-floor counts (`voterFloorReads`, ~:644/:681/:697 now): **unchanged, 3 → 3 at all three checks**
   (the expression is `phases.length` instead of `requests.length`, the same three phases). Per round: round 1 adds 3
   (one per phase, each subject alone on the entity, so the complete read holds no in-flight competitor; at
   92a441229 it was 0 because the three subjects were in flight together and each deferred on the other two); round
   2 adds 0 (the preflight defers on the placement before the floor; refusals do not evaluate); round 3 adds 0 (owner
   unavailability defers before the floor).

Not changed: round 1 and round 3 assertions (same text and values). Round 3 now ends the native placement first
(committed FAILED) and commits each of its 9 subjects alone before evaluating it, so no forbidden pair exists.
Terminals go through `commitOperationTerminal` (record advanced to FAILED by `advanceOperationFixture`; the owner's
CAS on the current step writing the transition columns of its canonical row; asserts one changed row).

#### Lab

- Commits after the rulings (both through `tools/heavy.sh`, pushed): **c2558d9c2** (entity file; hook regenerated
  inventory.json, impact-graph-seal.json), **cfd056019** (placement file; hook regenerated inventory.json,
  impact-graph-seal.json, subsystem-classes.json). Successor C total: 5b3c29192, 92a441229, c2558d9c2, cfd056019.
- `lab/lrfixc-all-2` (tv-dator, cfd056019), the 20 files of `lrfixb-all-2`: **20 pass / 0 fail, 591 assertions**,
  every file green on its first attempt (no retry). placement-create-bootstrap-binding 14/14 (cases 12, 13, 14 green);
  rebalancer-entity-interaction-contract 35 assertions (34 before plus the new reason assertion in case 6). The other
  18 files have the same counts as in `lrfixb-all-2`.
