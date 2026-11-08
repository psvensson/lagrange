# always-promise-port-answers: implementer notes

Append-only (R21). Quest `always-promise-port-answers`, epic
`code-navigability-and-mistake-resistance`. Worktree
`lagrange-nav-promise-20261108`, branch
`work/nav-always-promise-port-answers-20261108`, base `1ad04d21a`.

## 2026-11-08 resume after the 10:55 reboot (implementer, second session)

The first implementer's uncommitted work survived in the tree (raft runtime
turn, operation port, peer delivery, persistence admission, lifecycle owner,
apply-mode declaration, bootstrap readiness sync reads, admin/control-plane
sinks, call-stage mode, sea-entry, latency-group has(), CASE field rename,
and the consumer/test cascade). This session repaired the one red new test,
deleted the last 12 sites, landed the ESLint selector, and ran the cheap
checks. Everything is staged, nothing committed.

Row measurement (read-only, stream worktree's
`scripts/checks/code-navigability-budget.js`):

| row | at 1ad04d21a | at recovery | now |
| --- | --- | --- | --- |
| value_or_promise_then_checks | 45 | 12 | 0 |
| owner_port_feature_detection | (budget 2130) | 2126 | 2124 |
| typeof_dual_paths | (budget 627) | 623 | 623 |
| two_source_fallback_reads | (budget 1789) | 1789 | 1789 |

### The red test at recovery: harness AND production were wrong

`test/raft/raft-rs-backend/status-read-never-waits.test.js` failed at its
setup assertion ("the replacement's resumption waits on a held delivery").

- Harness: in a 3-voter group the new core restores every group as a
  follower; `resumeAfterReconstruction` campaigns only a sole voter, and a
  restored follower's `drainReady` has no messages. Probe (instrumented
  copy of the test): after the core trap the read sends nothing, `held` = 0,
  and the read answers CORE_OK. The fixture could not reach the state.
- Production: with a sole voter plus a learner the restored voter campaigns,
  leads and appends to the learner, so its resumption waits on the held
  delivery. Probe on that shape, before the fix: `readStatus()` answered
  `undefined` (the port's `readStatus` reads `.result` of the turn, and
  `readStatusNow`'s unhealthy-runtime branch returned the pending turn of
  `withinGroup(readStatusUndrained)`). At 1ad04d21a the same branch answered
  a promise through the port.
- Fix (src/raft/raft-rs-runtime-owner.js): one `answeredRead(group, read)`
  names a still-pending read as the group's recovery hold
  (HOST_FAILURE / RECOVERY_DEFERRED, retryable, recoveryRequired) and lets
  the resumption run on; `readStatusInRecovery` (which already did this) and
  the unhealthy branch of `readStatusNow` both use it. No turn became
  asynchronous; the replacement still runs synchronously in the read.
- Fixture: the test now uses a sole voter + learner (comment explains why).
  It fails on the unfixed path (the setup assertion holds and the read is
  `undefined`) and passes with the fix.

### Producer classification table (all 45 base sites)

Class: IO = I/O producer, answers a promise on every path; TURN =
synchronous-when-possible turn, answers a named settled-or-pending turn
(src/raft/raft-rs-turn-answer.js); MODE = apply mode declared once at
registration; FOREIGN = a foreign answer named once by
`turnFromForeignAnswer`; SYNC = producer is synchronous on every production
path, the probe was dead; DEAD = producer answers nothing.

First session (predecessor; verified by reading the diff, not re-derived):

| site at 1ad04d21a | producer | class | change |
| --- | --- | --- | --- |
| admin/admin-control-snapshot-stale-watermark-record.js:288 | installed emission sink | FOREIGN | sink answer named by turnFromForeignAnswer |
| control-plane/readiness-admission-transition-record.js:314 | installed log sink | FOREIGN | same |
| bootstrap/bootstrap-api-readiness-methods.js:143 | service startup-authority read | SYNC | only the `...Sync` reader is read; async fallback deleted |
| bootstrap/owners/bootstrap-readiness-owner-probe-details.js:577 | publication story read | SYNC | same |
| bootstrap/owners/bootstrap-readiness-owner-probe-details.js:616 | membership publication diagnostics | SYNC | same |
| bootstrap/owners/bootstrap-startup-authority-evidence.js:51 | startup-authority read | SYNC | same |
| node/replica-create-process-owner.js:215 | snapshot install mutation | SYNC | answers one boolean; a non-boolean throws |
| partition/partition-service-raft-membership-administration.js:122 | port proposeConfChange | TURN | switches on `answered.settled` |
| query/call-stage.js:73 | ctx.call | MODE | `resolveCallMode` decides promise vs iterator from the call's arguments |
| query/sql-parser-schema-mutation-methods.js:172 | CASE AST (`cond.then` was a field, not a promise) | n/a | field renamed `thenExpression` at the producer (sql-parser-expression-methods.js) and both consumers (query-executor-sql-command-rendering.js, sql-parser-schema-mutation-methods.js); census of `.conditions` readers complete |
| sea-entry.js:56 | runServiceCommand | IO | `async`; sea-entry chains `.then` |
| topology/latency-group-manager-runtime-helpers.js:143 | system table cache has() | SYNC | answers a boolean; a non-boolean throws TypeError |
| raft/raft-rs-application-transaction-owner.js:65 | group committed-entry application | MODE | APPLY_COMMITTED_ENTRY_MODE declared at port registration, refused at construction otherwise |
| raft/raft-rs-application-transaction-owner.js:73 | membership-context applier | SYNC | must answer undefined; any answer throws |
| raft/raft-rs-group-membership-admission.js:127 | port proposeConfChange | TURN | switches on `proposal.settled` |
| raft/raft-rs-operation-port.js:124 | runtime dispatch (containRuntimeThrow) | TURN | settled/pending turn |
| raft/raft-rs-operation-port.js:263 | host identityRecorded acknowledgement | IO | absent or the promise of the write |
| raft/raft-rs-operation-port.js:442 | committed-membership read | TURN | continueTurn / settled read |
| raft/raft-rs-peer-delivery.js:31 | thenMaybe helper | TURN | deleted; continueTurn |
| raft/raft-rs-peer-delivery.js:138 | snapshotCatchupNeeded notifier | DEAD | answer never read |
| raft/raft-rs-peer-delivery.js:168 | transport send | FOREIGN | turnFromForeignAnswer |
| raft/raft-rs-replica-lifecycle-owner.js:287 | lifecycle execute(work) | TURN | work answers a turn |
| raft/raft-rs-runtime-owner.js:742,1084,1092,1224,1295,1356,1550,1576,1953,2077,2088 | the runtime's internal turn (enqueue, thenMaybe, applyEntries, finishReady, drainReady, status reads, drainInbound, scheduled drain, batch settle) | TURN | named turn; applyEntries synchronous (MODE) |

This session:

| site at 1ad04d21a | producer | class | change |
| --- | --- | --- | --- |
| bootstrap/critical-placement-formation-observer.js:74 | the system table cache handed to observeCriticalPlacement: production's one caller (node-joining-operation-ledger-formation-readiness.js:287) passes NodeService.getSystemTableCache(), synchronous getAll | SYNC | thenable branch deleted; any non-array answer (an async client's promise included) is already typed unreadable by `arrayIsArray`; the `asynchronous` flag had no reader |
| bootstrap/owners/startup-runtime-handoff-owner.js:244 | activation action = SqlQueryEngine.activateDistributedTransactionRecovery (returns its replay promise, or throws a fatal synchronously) | IO | trackDistributedTransactionRecovery chains `replay.then` unconditionally |
| bootstrap/owners/startup-runtime-handoff-owner.js:302 | trackDistributedTransactionRecovery | IO | `result.catch` unconditional; dormant answers are `DORMANT_TRANSACTION_RECOVERY` (a resolved promise of null) instead of a bare null |
| bootstrap/shared/startup-sql-runtime-handoff.js:26 | owner.activateDistributedTransactionRecovery | IO | `.catch` unconditional (a synchronous fatal is still converted to a rejection there) |
| diagnostics/resource-diagnostics-sampler.js:390 | getStats of the 13 owner components | SYNC | every getStats in src is synchronous except RebalanceCoordinator.getStats, which is not a sampled component; probe deleted |
| live-query/live-query-manager.js:568 | unsubscribeFromPartition (live-query-startup-wiring.js, both wirings `async`; every test double `async`) | IO | `.catch` unconditional |
| live-query/live-query-startup-wiring.js:163 | onPartitionTopologyChange = LiveQueryManager.handlePartitionTopologyChange (`async`) | IO | `.catch` unconditional |
| node/replica-state-machine-serialization.js:69 | the replica-mutation lane's action | TURN | every action answers a turn: `pendingTurn(asyncWork())` for the 7 async actions, `settledTurn(...)` for removeFromTracking and snapshot registration, and runTransitionAttempt answers settled (refused / unpersisted commit) or pending (persisted write) per branch; the lane answers a turn (MUTATION_ADMISSION_CLOSED settled false; queued pending; idle settled stays synchronous) |
| node/replica-state-machine.js:413 | applyTransition (the lane's turn) | TURN | completeDurableRemoval continues the turn; `_applyTransition` is the boundary reading it with turnChainValue for callers that await |
| raft/leader-activation-scheduler.js:136 | entry.run = LeaderActivationGate's activateNow (block body, answers nothing) | DEAD | probe deleted |
| rebalancer/operation-owner-shutdown-join.js:52 | inFlightExecutionsByOwnerKey values: DurableWorkflowCoordinator.runExclusive is the map's one writer and stores a promise | IO | filter deleted |
| rebalancer/rebalance-coordinator-lifecycle.js:40 | workflowOwner.recoverFailedCreateCleanupReleaseDebt = OperationLane.run -> runExclusive (promise); absent only without a workflow owner method | IO | `void recovery?.catch(...)` |

Production delegates changed for one shape: bootstrap-service.js and
node-joining-owner-construction.js `activateDistributedTransactionRecovery`
re-checked the engine the owner had just asked about through
`isDistributedTransactionRecoveryAvailable` in the same synchronous call and
answered `undefined` when absent (a second shape and a duplicate decision);
both now answer the engine's replay promise directly.

### Ordering-named (producers that were synchronous on some path)

1. `StartupRuntimeHandoffOwner.activateDistributedTransactionRecovery` -
   dormant answer was `null`, now a resolved promise of `null`; a delegate
   answering a non-promise recorded completion synchronously, now on
   settlement. In production the delegate always answered the engine's
   promise (its engine-absent branch was unreachable behind the availability
   check), so no production ordering changed. Consumers:
   - startup-runtime-handoff-owner.js writer activation (~line 184): ignores
     the answer. Witness: test/bootstrap/node-joining-control-plane-heartbeat.test.js.
   - startup-sql-runtime-handoff.js `activateOwnerTrackedTransactionRecovery`
     (via BootstrapService / NodeJoiningService pass-through methods): returns
     the promise; seed and join entrypoints do not await. Witnesses:
     test/bootstrap/shared/startup-sql-runtime-handoff.test.js,
     test/bootstrap/transaction-recovery-handoff-outcome.test.js,
     test/bootstrap/bootstrap-service-ready-signal.test.js.
   - snapshot readers (`getDistributedTransactionRecoverySnapshot`): a test
     that read COMPLETED synchronously after activation now awaits it
     ("a completed replay publishes a ready witness", transaction-recovery-
     handoff-outcome.test.js); the dormant answer is awaited in
     node-joining-service-final-sql-runtime-handoff.test.js.
2. `runServiceCommand` (predecessor) - synchronous commands now answer a
   promise. Consumers: sea-entry.js (process.exit one microtask later),
   test/cli/service-init-scaffold.test.js,
   test/cli/service-init-wasm-scaffold.test.js,
   test/service/h6-successor-contract-and-evidence-cutover.test.js.
3. The reverse direction, recorded for completeness: the port's
   `readStatus` during a replacement whose resumption waits on delivery
   answered a promise at 1ad04d21a and now answers the named hold at once.
   Witness: test/raft/raft-rs-backend/status-read-never-waits.test.js.

No other producer changed timing: the replica lane, the raft runtime turn
and the operation port keep every synchronous path synchronous (named turn);
the live-query, rebalancer, scheduler, sampler and observer producers already
had one shape in production.

### ESLint promotion (lands with the last deletion)

`eslint.config.js`: a `src/**/*.js` block with `no-restricted-syntax` at
error, message `navigability-rule:value_or_promise_then_checks ...`.
Selectors are child chains anchored at the comparison or the test, reporting
the promise-method read: typeof on `.then`/`.catch` (plain, optional chain,
string-literal computed key) under `===`/`!==` either side; a `.then`/`.catch`
read as an if/conditional test through up to 4 levels of `!`, `&&`, `||`,
`??` (optionally inside a ChainExpression); `instanceof Promise`. Multi-step
relative `:has(> A > B)` does not match in esquery 1.7.0, hence the anchored
chains. No per-file override: the adapter `turnFromForeignAnswer` reads
`value.then` into a local and tests the local, which no selector matches.

Witness: test/scripts/eslint-value-or-promise-selector.test.js (config
resolves to error with the marker; 10 probe shapes draw exactly one marked
report each; 6 non-probe shapes draw none; the adapter lints clean with the
rule on). Cross-check run read-only against the stream worktree's detector
on the same 16 shapes: 1 site for each probe shape, 0 for each non-probe
shape, 0 parse failures. `npx eslint --format json src`: 2035 files, 0 marked
reports, 0 other reports.

Known divergence: a test with two promise-method reads (`if (a.then &&
b.catch)`) is one detector site and two ESLint reports. Both are non-zero,
so the ratchet at zero is unaffected.

### Overlaps

None of this session's files are in the defaults or readiness quests'
overlap list (control-plane-readiness-*.js, partition-service-learner-
promotion-methods.js, replica-operation-repository-visibility-methods.js,
unified-rebalancer-available-nodes.js are untouched). Files this session
touched outside the raft/node lane: src/bootstrap/{bootstrap-service.js,
node-joining-owner-construction.js, critical-placement-formation-observer.js,
owners/startup-runtime-handoff-owner.js, shared/startup-sql-runtime-handoff.js},
src/diagnostics/resource-diagnostics-sampler.js,
src/live-query/{live-query-manager.js, live-query-startup-wiring.js},
src/rebalancer/{operation-owner-shutdown-join.js,
rebalance-coordinator-lifecycle.js}, src/raft/leader-activation-scheduler.js.
The predecessor touched src/control-plane/readiness-admission-transition-
record.js (not a control-plane-readiness-* file).

### Reported sites (named answer cannot hold without a timing change)

None found. Every remaining producer either already had one shape in
production or keeps its synchronous path through the named turn.

### R17 findings (recorded, not absorbed)

- Owner `replica-state-machine` (src/node): the public `transition()`,
  `restartFailedCreate()`, `removeFromTracking()`, `activateRegisteredReplica()`
  and `completeDurableRemoval()` still answer boolean-or-promise to their
  callers (`turnChainValue` at the class boundary). No caller probes the
  shape (they await), so the row does not count them, but the API is still
  value-or-promise; a follow-up could hand callers the turn or make the
  persisted entry points always-promise.
- Owner `raft-rs runtime` (src/raft/raft-rs-runtime-owner.js): the
  unhealthy-runtime status read resumes the group outside the group's queue
  (`withinGroup`, not `enqueue`), as at 1ad04d21a; its pending resumption is
  not serialized against the group's next operation. Unchanged here (timing).
- Owner `startup runtime handoff` (src/bootstrap/owners): a synchronous fatal
  of the recovery activation still throws out of the background-writer
  activation IIFE, skipping the retry-timer clear and
  onControlPlaneBackgroundWritersActivated. Unchanged here (behaviour).
- Owner `startup runtime handoff`: the instance-level compatibility override
  (`getCompatibilityService: () => this`, `hasOwnProperty` on the service)
  is a test seam that production never uses (no-legacy rule candidate).
- Predecessor changes worth an independent check (they change behaviour, not
  only shape): latency-group-manager has() now throws on a non-boolean cache
  answer (was: false); the bootstrap readiness reads return null when a
  service lacks the `...Sync` reader (was: the async reader's synchronous
  answer); node/replica-create-process-owner.js throws on a non-boolean
  install answer.
- The status-read witness needs a sole voter with a learner; the 3-voter
  shape cannot exercise the resumption-waits-on-delivery path at all.

### Cheap checks (this session, staged tree)

- `node --check` on every changed src file: ok.
- `npx eslint --no-warn-ignored <staged .js>`: exit 0 (fixed 5 predecessor
  max-len lines in 3 integration tests).
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0 after
  compressing replica-state-machine-{recovery,transition}.js back under the
  800-line cap (first run: source oversized 28/26).
- `node scripts/check-fast-static.js`: exit 0.
- `npm run -s test:duplication`: OK 42/42, 649/649.
- `npm run -s audit:file-size`: 26/26, 21/21.
- `npm run -s test:metadata:refresh`: regenerated test/shards/*-classes.json
  and impact-graph-seal.json (staged).
- Local single-file witnesses (all green): status-read-never-waits,
  critical-placement-authoritative-evidence, 7 bootstrap recovery files,
  3 activation-handler-boundary files, 5 replica-state-machine files,
  live-query-manager, leader-activation-scheduler, resource-diagnostics-
  sampler (tap, run directly), failed-create-cleanup-recovery-owner-lifetime,
  operation-ownership-lease-fencing, eslint-value-or-promise-selector.

### 2026-11-08 lab placement and the impact-graph seal

- Lab run 1 (snapshot f4c07987e, refs/wip/nav-promise-1143, adam-laptop)
  died at placement: "the commit's generated metadata is stale; regenerate
  and commit test/shards/impact-graph-seal.json"; all 2315 files reported no
  result, exit 97. Lead: this is a known environmental defect (a foreign
  node_modules/@pulumi symlink makes the import-graph producer key an
  optional external depth-dependently), not this candidate; not counted as a
  red of these tests.
- Run 2 (snapshot 1603249bd, refs/wip/nav-promise-1150) was taken with a
  seal regenerated in this worktree and passed placement on adam-laptop.
- Per the lead, the staged tree now carries the committed seal from
  1ad04d21a again (written from `git show HEAD:...`); the regenerated
  test/shards/{primary,resource,subsystem}-classes.json for the new test
  files stay staged. A re-run waits on the lead's word after the producer
  fix lands on the stream branch.

### 2026-11-08 lab run 2 classification (snapshot 1603249bd, adam-laptop)

`# test-files total=2315 pass=2295 fail=20 assertions=94864`. Per leaf:

Candidate defects (missed cascade of the predecessor's turn contract),
deterministic, reproduced locally, fixed in tests only:
- test/raft/raft-rs-backend/lifecycle-registry-runtime-generation.test.js and
  reseed-hold-durability.test.js: `owner.execute(() => new Promise(...))`
  hit RaftRsReplicaLifecycleOwner.execute's turn contract ("reading
  'finally'"); the work now answers `pendingTurn(...)` and the test awaits
  `.pending`.
- test/raft/raft-rs-backend/evidence-o1-static.test.js: the new
  RUNTIME_REASON.COMMITTED_ENTRY_APPLY_MODE_NOT_SYNCHRONOUS and
  RUNTIME_PHASE.PORT_REGISTRATION were unclassified; added as
  `portRegistration` classes.
- test/raft/raft-rs-backend/evidence-o1-anchors.test.js (3 subtests): read
  `.outcome` of port turns; the synchronous model's turns are now read through
  `settledResult(turn)`, which asserts the turn settled.

Not reproduced (16 files): message-group-native-provisional-route,
single-path-partition-cutover, cdc-group-propagation-foreground-boundary,
bootstrap-epoch-manager-lifecycle, cdc-source-occurrence-delivery,
node-bootstrap-consistency, seed-release-failure-custody,
create-table-partition-provisioning, critical-replica-placement-causal-trace,
leader-metadata-validation, managed-split-admission-reliability,
managed-split-writes-after-cutover, raft-leader-election,
seed-node-bootstrap, single-node-default-replica-count-writes,
three-node-seed-rebalance. On the lab most died at seed bootstrap with
"Seed participant release failed ... release_fact_unavailable, missingFact
replica_release_reply / release_deadline" or on timing budgets
("bootstrap and election within 20s (took 25424ms)"). Locally, through
`node scripts/run-test-files.js --jobs 2` on the corrected candidate:
`total=20 pass=20 fail=0 assertions=508` (all 20 files, including the 4
fixed ones). Five of them were also run at 1ad04d21a in a scratch worktree
(`--jobs 1`): 5/5 pass, durations comparable to the candidate (e.g.
critical-replica-placement 147s base vs 156s / 138s candidate). Classification:
lab-load timing on adam-laptop, NOT proven; a lab comparison at the base and
a lab re-run of the candidate are pending (below). Note: running these
files with bare `node <file>` uses tap's 30 s default timeout and fails at
base and candidate alike; that is not a witness.

Lab run 3 (snapshot 005da5b9e, refs/wip/nav-promise-1419, committed seal
from 1ad04d21a as the lead instructed) was refused by the planner before
any test: "MODULAR PROOF NOT SAFE ... UNKNOWN_SCOPE: import graph is not the
one the committed seal binds" for the changed test support files. This is
the seal defect the lead named; the lab green boundary for this candidate
waits on its producer fix.

## 2026-11-08 round 2 (implementer, third session): lab boundary

Base of record: stream head 1fd4e9ef3 (HEAD bfa898b71 = 1fd4e9ef3 + the seal).

### Rows (budget script, staged tree)

| row | value | budget |
| --- | --- | --- |
| value_or_promise_then_checks | 0 | 0 |
| owner_port_feature_detection | 2124 | 2130 |
| typeof_dual_paths | 621 | 627 |
| two_source_fallback_reads | 1789 | 1789 |
| navigability_patterns_without_ratchet | 0 | 0 |

`node scripts/solve.js probe --id always-promise-port-answers`: metric 0
target 0 done=true measuring=true.

### Guideline audit and the promoted pattern's baseline

`scripts/check-guideline-navigability.js` drops a pattern ESLint promotes
(no baseline read, no violations), and docs/development/code-style.md says a
promoted pattern "needs no baseline file". The budget row
`navigability_patterns_without_ratchet` counts a promoted pattern as
ratcheted without a file. Disposition: the 45-entry
`scripts/check-guideline-navigability-baseline-value_or_promise_then_checks.json`
is DELETED (dead data once promoted; tightening it to 0 would keep a second
gate for a row ESLint owns). Both targets hold: the audit exits 0 ("Promoted
to ESLint: value_or_promise_then_checks", 0 violations) and the row is 0.
`test/scripts/check-guideline-navigability.test.js` ("the real audit over
src") demanded a baseline for every row and went red on the lab (candidate
caused); its contract now reads promotion through the same reader
(`promotedPatterns`, `scripts/checks/code-navigability-eslint-promotion.js`):
every unpromoted row keeps a baseline and a promoted row must not. Witnessed
both ways: with the old file restored the test fails "delete the baseline
file of a row promoted to ESLint"; without it the test passes.

The audit run on the full domain then found 3 NEW identities the earlier
session had not seen (the per-identity ratchet, not the count):
- `src/node/replica-state-machine.js` `settleInLane` catch_returns_default:
  an inherited `<anonymous>` site (the canonical-leader-clear lane action)
  moved into a named const. The lane action is anonymous again (the same
  body, now `() => pendingTurn((async () => {...})())`), restoring the
  inherited identity; no behaviour change.
- `src/query/call-stage.js` `resolveCallMode` typeof_dual_paths x2: the
  new mode decision was written as two typeof conditionals with
  alternates. It is now guard returns (plan object, handler as second
  argument, handler as third argument, else iterator): the same one
  decision, read by ExecutionContext.call and the stage context. The
  overloaded `ctx.call(query, params|handler, handler|opts)` signature
  itself is the dual shape (R17 finding below).
The tighten hints were applied (`--update-baseline --pattern` for
owner_port_feature_detection 2130 -> 2124 and typeof_dual_paths 627 -> 621);
an identity-level diff against HEAD shows 0 raised identities in either file.

### Lab run 4 (snapshot fdbdf445b, refs/wip/nav-promise-1500, adam-laptop)

`lab test changed --lane all --sha fdbdf445b --base-sha 1fd4e9ef3`:
`total=2322 pass=2304 fail=18 assertions=95078`. Per lane: ordinary 1964
(5 red), external-toolchain 22 (0), bootstrap 219 (4), exclusive 117 (9).

Base comparison on the SAME host (adam-laptop), `lab test all --lane
bootstrap|exclusive --sha 1fd4e9ef3` (the `changed` cone cannot be narrowed
from this worktree: the selector adds the worktree's staged diff to any
head/base pair and widens to the whole corpus, and the classified plan of a
base sha then refuses candidate-only test files):
- bootstrap at base: `total=218 pass=214 fail=4`
  (bootstrap-websocket-server-reentry, cdc-source-occurrence-delivery,
  node-bootstrap-consistency, seed-release-failure-custody).
- exclusive at base: `total=122 pass=113 fail=9` - exactly the candidate's
  nine exclusive reds.

Classification per red file:

| file | lane | class | evidence |
| --- | --- | --- | --- |
| scripts/check-guideline-navigability.test.js | ordinary | CANDIDATE, fixed | baseline deletion; test contract fixed (above) |
| integration/create-table-partition-provisioning | exclusive | BASE | red at base, same host; seed release budget 3000 ms spent |
| integration/critical-replica-placement-causal-trace | exclusive | BASE | red at base, same host; seed release spent |
| integration/leader-metadata-validation | exclusive | BASE | red at base, same host; 60 s outer timeout |
| integration/managed-split-admission-reliability | exclusive | BASE | red at base, same host ("Failed to start partition split replication" in 2 subtests at base, 1 + timeout at candidate); the "Replica removal lacks exact durable authority" error lines are also in the base run (22 lines); local cand and base both pass |
| integration/multi-node-raft-replication | exclusive | BASE | red at base, same host; CDCConfirmationTimeoutError 45 s |
| integration/raft-leader-election | exclusive | BASE | red at base, same host; "within 20s (took 24884ms)"; local: base 10159/9591 ms, cand 9535/9532 ms |
| integration/seed-node-bootstrap | exclusive | BASE | red at base, same host; timeouts |
| integration/single-node-default-replica-count-writes | exclusive | BASE | red at base, same host; seed release spent |
| integration/three-node-seed-rebalance | exclusive | BASE | red at base, same host; joins fail |
| bootstrap/cdc-source-occurrence-delivery (W9) | bootstrap | BASE | red at base, same host (54 vs 64 at base, 47 vs 64 at cand); local W9 subtest base 2443/2541/2423 ms, cand 2456/2472/2462 ms |
| bootstrap/node-bootstrap-consistency.property | bootstrap | BASE | red at base, same host; wait bounds spent, 90 s property timeout |
| bootstrap/seed-release-failure-custody | bootstrap | BASE | red at base, same host; seed release spent |
| bootstrap/bootstrap-sequence | bootstrap | HOST/TIMING | green at base this run, red at cand with the seed-release-budget signature; the base run had bootstrap-websocket-server-reentry red with the same signature (green at cand): one flaky class. Local seed-release time (probe in scratch copies of both trees): base 1398/1293/1305 ms, cand 1352/1238/1449 ms |
| raft-rs-backend/single-path-partition-cutover | ordinary | HOST/TIMING | seed release 15/46 partitions in the 3000 ms budget, the signature reproduced at base above; local seed release base 1378/1374/1266 ms, cand 1366/1321/1500 ms, all pass |
| message-group/message-group-native-provisional-route | ordinary | HOST/TIMING | lab 20.2 s and a deferred transport delivery; local base 5122/5193 ms, cand 5102/5364 ms, all pass |
| topology/cdc-group-propagation-foreground-boundary | ordinary | HOST/TIMING | lab: subtest timed out at 6000 ms; local subtest base 1050/1050/1014 ms, cand 1028/1037/1115 ms, all pass |
| admin/admin-websocket-api-control-snapshot-query | ordinary | HOST/TIMING | lab 311 ms against a 100 ms wall-clock assertion; local base 3/3 and cand 3/3 + 3/3 pass (subtest ~33 ms both) |

The four ordinary-lane timing files were not rerun at base on the lab (the
ordinary lane is 1964 files); their class rests on the equal local
durations plus the same seed-release signature reproduced at base on the
lab. The seed release budget (`leadershipWaitTimeoutMs`, 3000 ms in these
tests for 46 partitions) takes ~1.3-1.5 s locally at speed x1.00 on both
trees; adam-laptop measures x1.99, so it sits at the budget under any load.
That is a base defect of the tests' fixed budgets (R17 finding below), not
a candidate change.

### Ordering-named witnesses on lab run 4

All green: node-joining-control-plane-heartbeat, shared/startup-sql-runtime-
handoff, transaction-recovery-handoff-outcome, bootstrap-service-ready-
signal, node-joining-service-final-sql-runtime-handoff (item 1);
cli/service-init-scaffold, cli/service-init-wasm-scaffold,
service/h6-successor-contract-and-evidence-cutover (item 2);
raft-rs-backend/status-read-never-waits (item 3). Also green: the round-1
test fixes (lifecycle-registry-runtime-generation, reseed-hold-durability,
evidence-o1-static, evidence-o1-anchors), eslint-value-or-promise-selector,
query/call-stage, node/replica-lifecycle-durable-generation. The lab reds
revealed no further consumer whose ordering changed: every red in the
table is base or host/timing.

### Verifier's model

Per producer (classes as in the table above; this is the set to check):

1. I/O, always a promise: sea-entry `runServiceCommand` (async);
   `StartupRuntimeHandoffOwner.activateDistributedTransactionRecovery` and
   `trackDistributedTransactionRecovery` (dormant answer
   `DORMANT_TRANSACTION_RECOVERY`, a resolved promise of null);
   `startup-sql-runtime-handoff` `.catch` unconditional; live-query
   `unsubscribeFromPartition` / `handlePartitionTopologyChange`;
   rebalancer `recoverFailedCreateCleanupReleaseDebt` and the shutdown
   join's in-flight map (only `runExclusive` writes it, with a promise);
   the operation port's host `identityRecorded` acknowledgement (absent or
   the write's promise).
2. Named turn (src/raft/raft-rs-turn-answer.js: settledTurn / pendingTurn /
   continueTurn / turnChainValue): the raft runtime's internal turn
   (enqueue, applyEntries, finishReady, drainReady, drainInbound, scheduled
   drain, batch settle, status reads); the operation port's dispatch and
   committed-membership read; peer delivery (thenMaybe deleted); the
   lifecycle owner's `execute(work)`; partition and group-membership
   `proposeConfChange` consumers switch on `settled`; the replica-mutation
   lane (`runSerializedReplicaMutation`) and every lane action;
   `applyTransition`. Synchronous paths stay synchronous (no-raft-timing-
   change): a settled turn continues in the same run.
3. Foreign answers named once by `turnFromForeignAnswer`: transport send,
   the admin emission sink, the readiness admission log sink.
4. Apply mode declared at registration: `APPLY_COMMITTED_ENTRY_MODE`
   (`RAFT_COMMITTED_ENTRY_APPLY_MODE.SYNCHRONOUS`) at port registration,
   refused at construction otherwise (`COMMITTED_ENTRY_APPLY_MODE_NOT_
   SYNCHRONOUS`, phase `PORT_REGISTRATION`); the membership-context applier
   must answer undefined. `query/call-stage.js` `resolveCallMode` decides
   promise (plan / stage) vs async iterator from the call's arguments,
   once, for ExecutionContext.call and the stage context's inflight
   accounting.
5. Dead probes deleted (producer synchronous on every production path, or
   answers nothing): bootstrap readiness `...Sync` readers, critical-
   placement observer cache, resource-diagnostics sampler getStats,
   leader-activation scheduler entry.run, peer delivery
   snapshotCatchupNeeded, latency-group cache has(), replica-create
   snapshot install mutation, the CASE AST field (`then` renamed
   `thenExpression`, not a promise).

Consumers whose ordering changed and their witnesses: the three ordering-
named items above (all green on lab run 4).

Production defect fixed: the unhealthy-runtime status read
(`readStatusNow` -> `answeredRead`, src/raft/raft-rs-runtime-owner.js)
answered `undefined` through the port when the replacement's resumption
waited on a held delivery; it now answers the group's named recovery hold
(HOST_FAILURE / RECOVERY_DEFERRED, retryable, recoveryRequired) at once and
the resumption runs on. Witness: test/raft/raft-rs-backend/status-read-
never-waits.test.js (sole voter + learner), green on lab run 4.

Behaviour changes (predecessor) needing independent verification, with
their production callers:
- latency-group `hasLatencyGroup` (src/topology/latency-group-manager-
  runtime-helpers.js) throws TypeError on a non-boolean has() (was: false).
  Production cache: LatencyGroupManager built in src/bootstrap/shared/
  latency-topology-setup.js with the node's systemTableCache;
  `SystemTableCache.has` (src/cache/system-table-cache-observation-
  methods.js) answers `Map.prototype.has`; `ReadOnlySystemTableCache.has`
  delegates to it. Callers: the same helpers file (`buildLatencyGroupId`
  collision loop and the row filter).
- bootstrap readiness reads answer null when the service lacks the
  `...Sync` reader (was: the non-Sync reader's synchronous answer).
  Production service in all three: `getControlPlaneReadinessService()` =
  the control-plane readiness service, which defines both
  `getStartupAuthoritySnapshotSync` (control-plane-readiness-startup-
  authority-health.js) and `getControlPlanePublicationStorySync` /
  `getMembershipPublicationDiagnosticsSync` (control-plane-readiness-
  publication-diagnostics.js); their non-Sync readers are `async`, so the
  removed branch answered null in production too. Callers:
  bootstrap-api-readiness-methods.js
  `getStartupAuthoritySnapshotForBootstrapResponse`,
  bootstrap-readiness-owner-probe-details.js
  `getControlPlanePublicationStory` / `getMembershipPublicationDiagnostics`,
  bootstrap-startup-authority-evidence.js
  `resolveLocalStartupAuthoritySnapshot`.
- replica-create-process-owner `commitReplicaCreateSnapshotInstall` throws
  on a non-boolean install answer (was: `result === true`). Production
  mutations: src/raft/snapshot-install.js `commitPreparedInstall` (swap =
  `swapPreparedInstall`, returns false/true) via
  `ReplicaCreateAdmissionOwner.commitSnapshotInstall`, and
  `recoverPendingSnapshotInstall` (its mutation returns true).

### Cheap checks (final staged tree)

`node --check` on 223 staged JS files: ok. `npx eslint --no-warn-ignored`
on them: exit 0. `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`:
exit 0 (file-size 26/26, 21/21; guideline audits 0 new). `node
scripts/check-fast-static.js`: exit 0. `npm run -s test:duplication`: OK
42/42, 649/649. `npm run -s audit:file-size`: exit 0. `npm run -s
audit:impact-contracts`: PASS. `node scripts/check-runtime-grammar-
contracts.js`: 0 violations. `npm run -s audit:guideline:navigability`:
exit 0. `npm run -s test:metadata:refresh`: re-run after the test change,
seal and subsystem classes staged. `npm run -s test:unused:ratchet`: red
at the candidate (1391 > 1390) AND at the base (1392 > 1390, run in a
`git archive HEAD` scratch copy); the candidate lowers it by one
(`CALL_MODE` now used) - a base red, not this quest's.

### R17 findings (this session)

- Owner `query` (call-stage / ExecutionContext): `ctx.call(query,
  params|handler, handler|opts)` is an overloaded signature; the mode
  decision is now one function, but the overload itself is a dual shape.
- Owner `bootstrap` seed release / its tests: integration and bootstrap
  tests pin `leadershipWaitTimeoutMs` to 2000-3000 ms for a 46-partition
  seed release that takes ~1.3-1.5 s at speed x1.00; on adam-laptop
  (x1.99) it is spent under load at base and candidate alike (9 exclusive
  + 3 bootstrap reds at base). Budgets are not scaled by the machine
  factor.
- Owner `scripts` unused-export ratchet: red at the stream head
  (1392 > 1390).
- Selector: `select-change-tests.js` run in a worktree with staged changes
  includes them in any `--head/--base` pair, so a lab base comparison of a
  narrow file set is impossible from the candidate's worktree.
