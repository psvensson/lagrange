---
audience: development
documentClass: planning
---

# CLUSTERING: the 106 lineage base reds (2026-10-24)

Read-only. Worktree `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`
(HEAD b491a1292, src/ and test/ equal to bed8c6354 apart from `test/shards/*`). Nothing in it was
edited and nothing was committed; `git status` is clean after every run. No throwaway worktree was
needed: the TAP was complete for every file, and the worktree already holds the base sources.

Sources:
- First leaves: `scratchpad/c1/reds-local-base.tap`. The parser is `reds/work/parse.py` and its
  output is `reds/work/base.json`.
- Signatures: I ran each of the 101 non-scripts red files once, directly with `node`, at base
  sources, with a load hook that adds one stderr line at each candidate refusal site. Nothing is
  written to disk. The hook is `reds/probe/hooks.mjs` with `subs.json`, and the output is in
  `reds/probe/out/*.log`.
- Machine-readable table: `reds/reds.tsv`, one row per file with columns
  `file, dir, cluster, first_leaf, tap_line_base, first_error, first_src_frame, probe_signatures`.

Mechanism classes: (a) test double drift against an owner contract changed on this lineage,
(b) production regression or gap in src/, (c) environment or harness, (d) unknown, and
(e) legacy duplicate (the owner directive of 2026-10-24).

Not in the 106: `test/integration/failure-scenarios` and `multi-node-cluster` do not appear in
reds-local-base.tap at all, so they are not clustered here. They are 2 of the 109 lab reds; the
local rerun covered only 107 files.

## 0. Headline

1. **Seed startup on this lineage always fails, on purpose.**
   - `assertOriginalSeedContinuation` throws `original-handoff-continuation-unavailable`
     unconditionally (`src/bootstrap/seed-original-allocation-startup.js:106-112`).
   - Every seed reaches it: `completeSuccessfulBootstrap` (`bootstrap-service-seed-workflow.js:216-217`),
     `phaseRegistration` (`phases/seed-registration-phase.js:107`), `startWebSocketServer` and
     `openExternalTransportAdmission` (`bootstrap-service-runtime-methods.js:299,339`).
   - It was introduced by 7fa4d79ae (2026-10-22). Its commit message says "Elections, ordinary
     registration and startup success remain held."
   - The real entry point fails the same way: the three production-entry integration files log
     `"error":"original-handoff-continuation-unavailable" ... "subsystem":"main"`.
   - **Cluster O (44 files) is this lane's own unfinished WIP, not drift.**
2. **Every new PartitionService refuses every write until a participant-release RESUME.**
   - The admission state starts CLOSED (`src/partition/partition-participant-transaction-pause.js:1-3,193-216`)
     and writes get the answer at `:284-290`, applied at `partition-service-raft-write-commit.js:442`.
   - It was introduced by 4151a3ab4 (2026-10-12).
   - A bare `new PartitionService(...)` → `initialize()` → `insertData()` answers
     `partition_write_cutover_paused`. I measured this with `reds/probe/p1.mjs`.
   - **Cluster P: 18 files.**
3. **The delivery draft 681da1dc1 has at least two production defects behind its reds.**
   - (i) Every ordinary CDC forward on routing attempt 3 or later is refused as
     `cdc_committed_acceptance_invalid`, non-retryable. The routing attempt number is used as the
     relay depth (`message-group-service-cdc-replication-runtime-methods.js:23-30`) and then checked
     against `CDC_FORWARD_MAX_RELAY_DEPTH = 2` (`message-group-service-runtime-support.js:91`;
     `message-group-forwarding-owner-native-delivery-methods.js:81-84`). Measured value: `relayDepth:3`.
   - (ii) An `unref()` on the delivery-lifetime ACK deadline
     (`src/transport/message-router-delivery-lifetime.js:92`) lets the event loop drain while a
     delivery still waits. With only that one line neutralised, both transport files go fully
     green: 19/19 and 418/418.

## 1. Per-file first leaf

`reds.tsv` holds all 106 rows: the first failing leaf and its TAP line in reds-local-base.tap,
the first error, the first src frame, and the probe signatures. The clusters below list every
file. "SIG" counts are from the hooked run.

## 2. Clusters by signature, with mechanism

### O. Seed original-allocation hold (44 files; retained-seed-original-handoff lane)

The owner is `src/bootstrap/seed-original-allocation-startup.js` (bootstrap) plus
`src/raft/raft-rs-original-allocation-preparation.js` (raft original allocation). See
`architecture/bootstrap.md`, linked from `architecture/INDEX.md` ("How do nodes form a cluster?").

- **O1 DIRECTORY, 23 files.** SIG `ORIG:original-allocation-directory-custody-unavailable`.
  - Path: `bootstrap()` → `prepareOriginalSeedAttempt` (`bootstrap-service-seed-workflow.js:500`)
    → `new RaftRsOriginalAllocationPreparation` (`seed-original-allocation-startup.js:50-53`)
    → the constructor's `assertCurrent()` (`raft-rs-original-allocation-preparation.js:190`)
    → `ownsDataDirectoryProcessOwner` is false (`:394-395`; `src/storage/data-directory-process-owner.js:70-74`).
  - Why: hand-built `BootstrapService` objects get `dataDirectoryProcessOwner = null`
    (`bootstrap-service.js:238`). Only `src/lagrange-runtime-startup.js:719` acquires the owner.
  - The first leaf is usually "bootstrap should succeed" or "seed bootstrap should succeed"
    (true !== false). Later TypeErrors (`reading 'size'`, `'values'`, `'storageAccountingService'`)
    follow from that failure.
  - Class: (a) for the fixture part, but supplying an owner only moves these files to O3.
    The binding cause is the lane's WIP hold.
  - Files: bootstrap-epoch-manager-lifecycle, bootstrap-sequence, bootstrap-websocket-server-reentry,
    fresh-join-registration-runtime-replacement, fresh-join-via-non-seed-node,
    node-bootstrap-consistency.property, phase-failure-handling.property (62 SIG),
    seed-release-failure-custody, cdc/current-epoch-propagation, admin-cdc-propagation, cdc-propagation,
    concurrent-join-message-group-assignment, create-table-partition-provisioning,
    critical-partition-learner-safety, managed-split-admission-reliability, membership-consistency,
    message-group-membership-claim-cache, node-join-replica-activation,
    replica-operations-owner-read-transport-readiness, seed-migration-cutover-persisted,
    seed-migration-process-loss (in the child; the TAP shows the DIRECTORY stack), seed-node-bootstrap,
    seed-owner-read-diagnosis.
- **O2 AUTHORITY, 11 files.** SIG `ORIG:original-allocation-authority-unavailable` at
  `seed-original-allocation-startup.js:37`.
  - The phases or simulator drive `assertOriginalSeedAttempt` through
    `bootstrap-service-runtime-methods.js:51` without `bootstrap()` having run
    `prepareOriginalSeedAttempt`.
  - Files: the 9 simulation formation-* files (formation-attribution-provenance,
    formation-sim-bootstrap-owner-entry, -charged-seed-host, -production-five-node-composition,
    -production-bootstrap-phase-one, -production-message-groups, -production-handoff,
    -production-partitions, -production-transcript-determinism), plus
    bootstrap/lifecycle-owner-replica-routing and bootstrap/production-scheduling-defaults.
  - Class: (a) against 7fa4d79ae, bounded by the O3 hold.
- **O3 CONTINUATION, 4 files.** SIG `ORIG:original-handoff-continuation-unavailable` at
  `seed-original-allocation-startup.js:111`.
  - These files use the real production entry: managed-split-writes-after-cutover,
    pgwire-command-tag-real-engine, public-binding-cell-invocation-seam, plus
    retained-seed-original-handoff (the lane's own done-witness, c6ece57ee).
  - The leaf "Cannot add property tapCaught, object is not extensible" is tap trying to annotate a
    frozen rejection. It is noise; the log line above it carries the real error.
  - Class: (b), an intentional WIP hold.
- **O4 phase-delegate double drift, 3 files.**
  - Errors: `d.assertOriginalSeedAttempt is not a function` (`phases/seed-infrastructure-phase.js:149`)
    and `d.admitOriginalSeedReplica is not a function` (`phases/seed-message-groups-phase.js:135`).
    The delegates were added in 7fa4d79ae (`bootstrap-service-seed-delegates.js:76-79`).
  - Files: seed-infrastructure-phase, seed-infrastructure-runtime-identity,
    seed-message-group-founder-open-refusal.
  - Class: (a) and (e). These are hand-written delegate maps restating
    `buildPhaseExecutionDelegates`.
- **O5 startup prerequisites absent in a hand-built BootstrapService, 3 files.**
  - join-lifecycle-sub-phase-parity-characterization and phase-event-ordering-characterization:
    `bootstrap()` fails with no ORIG signature, so the failure comes before any `originalAllocationError`.
    bootstrap-sequence's TAP shows the same family as `Cannot read properties of null (reading 'getDataDir')`
    at `seed-original-allocation-startup.js:49`. For these two files that is inferred, not measured.
  - dynamic-partition-cdc-subscription: `this.replicaHandler.initialize is not a function`
    (`bootstrap-service-replica-registration-methods.js:300`, last changed in 4151a3ab4). The test
    passes `replicaHandler: {}` (`test/bootstrap/dynamic-partition-cdc-subscription.test.js:172`).
  - Class: (a).
- **O? (3 files): probably O, but not proven.**
  - entrypoint/process-custody-review: "actual startup must engage" (missing 'initialize'). It runs
    in a child process, the hook did not reach it, and there is no ORIG text in the TAP. Unknown.
  - seed-migration-interrupted-decision: the child exited with code 1. Its sibling
    seed-migration-process-loss shows DIRECTORY in its child. The cause for this file is unknown.
  - message-group-fresh-identity-replacement: "two serial production REPLACEs must leave real voter
    state" is false. No probe signature fired. Unknown.

### P. Partition mutation admission starts CLOSED (18 files)

The owner is `src/partition/partition-participant-transaction-pause.js` (PartitionService,
`architecture/runtime-components.md:214`).

- **Signature:** `SIG:PAUSED` (`pausedWriteAnswerOf`, `:284-290`). The answer is
  `"The partition paused mutation admission for its participant transaction cutover..."`
  (`src/constants/errors.js:46-48`).
- **Mechanism:**
  - Every service lifetime starts CLOSED (`:1-3`, `newPause` at `:193-203`).
  - Production opens it only through the release coordinator's RESUME
    (`src/node/replica-handler-participant-release.js:214-216` → `resumeParticipantCutoverAdmission`, `:252-282`).
  - Tests that construct PartitionService directly never RESUME. The fixture helper
    `resumeFixtureParticipantAdmission` exists (`test/test-helpers/participant-transaction-fixture.js:488-530`),
    but none of these files use it.
  - Every listed test was last changed before 4151a3ab4 (2026-10-12). Examples: sqlite-metrics and
    consensus-hold-log 1aea11baf (09-30); settled-replay f8a5ca8b1 (10-07); write-kernel f5d538139 (10-10).
- **Class:** (a), fixture drift against the 4151a3ab4 contract. It may also be (b), but that is
  unknown: no fresh partition can be measured end to end while O holds seed startup.
- **Files (SIG count):** cdc-generation.property (87), table-partition-structure.property (26),
  partition-service (22), partition-service-size-split-transport (17, also RETIRE_REFUSED=2),
  cdc-subscription-catchup (12), partition-statement-admission (7), settled-replay-preserves-result (6),
  partition-service-stale-topology-write-guard (5), partition-service-raft-propose-metrics (4),
  partition-service-sqlite-metrics (3), migration-partition-alter-routing (2),
  partition-replication-restart-attempt-handoff (2), partition-write-leadership-transfer-committed (2),
  partition-write-leadership-transfer (2), partition-consensus-hold-log (1),
  partition-service-raft-noop-cdc-placement (1), split-backfill-internal-pacing (1),
  seed-teardown-pending-cdc-delivery (1).
- **(e) overlap.** cdc-generation.property ("CDC event generated for INSERT") and
  cdc-subscription-catchup (in-memory catch-up after `insertData`) also expect the volatile CDC
  emission that 4151a3ab4 retired. See L.

### M. Message-group delivery draft 681da1dc1 (9 files)

The owner is `src/message-group/*` (MessageGroupService, `architecture/runtime-components.md:237`).

- **M1, 4 files: status-identity double drift plus the relay-depth production bug.**
  Files: cdc-non-leader-propagation, message-group-service-raft-replication-and-cdc,
  message-group-service-strict-cdc-forward-routing, message-group-service.
  - The first leaf is "Unable to resolve unified peer address for <g>-r2"
    (`message-group-service-peer-resolution.js:91`), or a `resolveLiveLeaderForwardTarget` mismatch.
  - Cause: since 681da1dc1, live peer resolution needs the port status to carry `groupId` and
    `replicaIdentity` (`message-group-forwarding-owner-routing-methods.js:193-196`). Native
    observation also needs `runtimeHealth`, `groupHealth`, `gateOpen` and `identityRecorded` (`:47-51`).
  - The double's `readStatus` returns none of these (`test/test-helpers/controllable-consensus-port.js:234-252`).
    SIG `PEER_UNRESOLVED=37` (cdc-non-leader).
  - The retries then hit `RELAY_INVALID` (measured `relayDepth:3`): attempt n becomes relayDepth n
    (`message-group-service-cdc-replication-runtime-methods.js:23-30`) and is refused at
    `message-group-forwarding-owner-native-delivery-methods.js:81-84`. That surfaces as
    `cdc_committed_acceptance_invalid` with `retryable:false`.
  - Before 681da1dc1 the same attempt-as-depth existed (681da1dc1^ `:373-375`) but was never refused
    at the sender.
  - Class: (a) for the double and (b) for the relay depth.
- **M2, 2 files: hand-written doubles that lack new owner members.**
  - proposal-deadline-wait-bound-spent: `manualTimers()` has no `now`
    (`test/message-group/message-group-proposal-deadline-wait-bound-spent.test.js:23-33`).
    `withinProposalDeadline` calls `timers.now()` (`message-group-proposal-routing.js:139`) since 681da1dc1.
  - join-message-group-identity-record: the service literal at `test/bootstrap/join-message-group-identity-record.test.js:181-187`
    has no `cdcCommitWaiters`. `openMessageGroupConsensusPort` → `retireCdcCommitWaiters`
    (`message-group-consensus-port.js:150`; `message-group-cdc-committed-acceptance.js:292-293`)
    was added in 681da1dc1.
  - Class: (a) and (e).
- **M3, 3 files: the delivery draft's own witnesses.** The 681da1dc1 commit message says
  "Corrected runtime and final composition remain unexecuted."
  - message-group-native-provisional-route: the known red at :395, `leaderId === null`.
  - partition-cdc-delivery-progress: the first leaf is the hook "Cannot set properties of null
    (setting 'prepare')" at `test/partition/partition-cdc-delivery-progress.test.js:207`. The restore
    hook runs after `leader.db` was released, which is a test-side defect.
  - partition-cdc-topology-progress-currentness: "the old weak tag cannot skip the replacement route"
    (`test/...currentness.test.js:59`).
  - Both partition test files were born in 681da1dc1. Whether their cause is in src or in the test
    is unknown. Class: (d).

### T. Transport ACK deadline unref (3 files)

The owner is `src/transport/message-router-delivery-lifetime.js` (MessageRouter, `architecture/runtime-components.md:136`).

- **Leaves:** "test unfinished" or "child test left in queue".
- **Cause:** `timeoutId?.unref?.()` at `:92`, new in 681da1dc1. The test's fake socket holds no
  handle, so the event loop drains before the ACK deadline fires.
- **Measured:** with that one line neutralised, message-router-quarantine-liveness-guard goes 19/19
  and message-router 418/418.
- formation-sim-connection-environment improves (test 4 passes), but test 3 still fails with "the
  ACK came back across the link" false. That remainder is unknown, possibly the virtual-link harness
  against the new ack encoding.
- **Class:** (b)/(c). The production behaviour changed. Whether that is acceptable is a judgment
  for the owner.

### R. Fresh-create participant release (6 files)

The owner is `src/node/replica-handler-release-recovery.js` with
`src/node/participant-release-authorization-owner.js` (4151a3ab4, with 7fa4d79ae).

- **Authority refused (3 files):** replica-handler-cache-state, replica-handler-metadata-propagation,
  websocket-create-replica-ack.
  - SIG `FRESH_AUTHORITY`: `authorizeFreshCreate` returns null (`participant-release-authorization-owner.js:25-33`),
    then throws `Fresh replica release authority unavailable` (`replica-handler-release-recovery.js:263-264`).
- **Authority granted, release never completes (3 files):** replica-handler, replica-handler-owner-path-bypass,
  replica-create-admission-recovery.
  - Measured: AUTH granted, DONE never printed.
  - `completeParticipantRelease` (`src/node/participant-release-client.js:151-189`) cannot reach
    CUT_OVER against `createMockPartitionServiceFactory` partitions.
  - Its sleep is unref'd (`replica-handler-release-recovery.js:96-101`), so the event loop drains.
    That is the source of "Promise resolution is still pending" and "test unfinished".
- **Class:** (a) and (e). Hand-written partition mocks restate the partition contract without the
  release facts.

### H. Exact handler retirement is fail-closed (2 files)

- dt6-learner-promotion-proof-channel-wake: SIG `RETIRE_REFUSED=12`, at
  `src/node/replica-transport-handler-identity.js:29-35` through `partition-service-lifecycle-methods.js:63-76`.
  - `requireReplicaHandlerRetirement` was introduced by e2c7435b7 (2026-10-12) and is absent on origin/main.
  - The test transport has no `getRegisteredHandler` or `unregisterExact` (`:38-41`).
  - Class: (a) and (e).
- partition-activation-handler-boundary: leaf 7 "shutdown retires the handler in the lane before
  closing the store", plus the N2 census. No SIG fired, so the exact divergence is unknown. Same owner.

### CEN. Census and inventory drift (5 files)

- **code-path-uniqueness:** flags `ENABLE_*` state names as feature flags.
  - From 4151a3ab4: node/replica-handler-participant-release.js and
    partition/partition-participant-transaction-cutover-constants.js.
  - From 89e70949f (2026-10-17): wasm-service/wasm-creation-opening.js, -publication.js and
    -service-constants.js.
  - Class: (a), a test heuristic.
- **cdc-shutdown-terminal-owner-write census:** a new timer
  `src/cdc/cdc-delivery-invocation.js:273` (`beginCdcDeliveryInvocation:setTimeout`, 681da1dc1)
  bypasses the CDC delayed-work primitive. Class (b): an owner bypass to route or classify.
- **leadership-transfer-single-path W5:** a second caller of the partition leadership-transfer issuer,
  `src/node/replica-handler-participant-cutover.js` (4151a3ab4). Class (e): two paths to one issuer.
- **replica-operation-membership-epoch-binding:** an unclassified membership-epoch reader,
  `src/control-plane/replica-dispatch-readiness-capture.js` (a8686b37c, 10-07). Class (a).
- **partition-admission-redrive-wakes:** `RAFT_EVENT.APPLIED_PROGRESS`
  (`src/raft/raft-operation-port-constants.js:13`, 3ebc7da41, 10-13) is in neither REDRIVE_WAKES nor
  NOT_A_WAKE. Class (a)/(b): src/partition must decide whether it is a wake.

### X. TX1 witnesses written ahead of production (4 files)

- **participant-release-prepare-identity-native** (897ccebeb) and
  **participant-release-first-prepare-native** (f22c8b322). Both are "expose/preserve boundary
  witness" commits with no production change.
  - A PREPARE is accepted across a different epoch.
  - A first PREPARE is admitted after PAUSE.
  - Class: (b), a production gap in src/partition PREPARE admission. The exact site was not traced.
- **partition-transaction-replay-cursor-v4:** 'dup-a' (a deterministically failed entry) is mirrored.
  - fa5d86146 says "no src change".
  - `src/partition/partition-mirror-replay-cursor.js` is unchanged since 1aea11baf and does not
    consult APPLIED outcome rows.
  - Class: (b), a gap.
- **partition-cdc-obligation O3:** `ackApply:'not proposed'`, delivered 0, owed 2. No PAUSED signature
  fired. Unknown (d).

### Singles

- **L, partition-write-kernel.** The test expects `emitCdcEntry` to be an object.
  - Since 4151a3ab4, `buildPartitionWriteSideEffectPlan` always returns `emitCdcEntry: null`
    (`src/partition/partition-write-kernel.js:530-572`; its comment says "the old volatile emission
    would create a second retry owner").
  - The consumer branch `partition-service-write-metrics-base.js:691-693` → `generateCDCEvent`
    (`partition-service-cdc-stream-base.js:129`) is now its only caller and is dead.
  - Class: (e).
- **MGADD, node/message-group-service-handler-membership.**
  - `handleCreateReplica` refuses unconditionally (`src/node/message-group-service-handler.js:186-200`,
    e0d208773 10-04, unchanged since). SIG `MG_CREATE_REFUSED`.
  - The test (0b205d0d2, 10-07) asserts a committed-learner CREATE path that src never implemented.
  - Class: (b), a gap where the test was written ahead of production.
- **ROW, partition-service-row-absence-heal.** `REPLICA_IDENTITY_CONFLICT` at
  `partition-service-row-owner.js:96,148`.
  - Exact birth identity has been required since 76f98c3b7 and 72a7a7649 (10-21).
  - The test's writer double rows (1aea11baf) carry no birth identity.
  - Class: (a).
- **SETB (already fixed in flight):** committed-membership-census, operation-port-boundary and
  single-path-partition-cutover. single-path also shows DIRECTORY=1 and PAUSED=6, so at base it
  additionally depends on O and P.
- **REBAL (fixed):** runtime-service-replace-canonical-target-handoff.
- **SCRIPTS (in flight):** the five scripts files.

## 3. Table

Owner references: B = `architecture/bootstrap.md`; RC = `architecture/runtime-components.md`
(PartitionService :214, MessageGroupService :237, MessageRouter :136, CDCIntegrationService :194).

| Cluster | Files | Owner | Class | In-flight stream | Repair unit |
|---|---|---|---|---|---|
| O1 DIRECTORY | 23 | B; src/raft original allocation | a, bounded by O3 | NONE | the lane's continuation (O3). A fixture owner alone is insufficient |
| O2 AUTHORITY | 11 | B | a, bounded by O3 | NONE | same, plus simulator/phase entry through `prepareOriginalSeedAttempt` |
| O3 CONTINUATION | 4 | B (seed-original-allocation-startup.js:106-112) | b (WIP hold) | NONE (lane's own) | implement the classified replay/publication continuation (retained-seed-original-handoff quest) |
| O4 delegate doubles | 3 | B | a/e | NONE | delete the hand-written delegate maps; build them through `buildPhaseExecutionDelegates` |
| O5 prerequisites | 3 | B | a | NONE | one shared BootstrapService fixture that owns directory, data-dir manager and replicaHandler |
| O? | 3 | B | d | NONE | measure in the child (stderr capture) |
| P admission CLOSED | 18 | RC:214 / partition-participant-transaction-pause.js | a (b unknown) | NONE | one partition fixture that RESUMEs through `resumeFixtureParticipantAdmission`; owner decision on fresh-partition admission |
| M1 status identity + relay depth | 4 | RC:237 | a + b | C1 partly (receiver/forward custody); the relay-depth bug NONE | fix `forwardedCdcRelayDepth` (attempt ≠ depth); one status double carrying the native fields |
| M2 doubles | 2 | RC:237 | a/e | C1 (delivery) adjacent | use the real time source and the real service state |
| M3 delivery witnesses | 3 | message-group / partition CDC | d | C1/C2 | the delivery R2 completion |
| T unref | 3 | RC:136 | b/c | C2 adjacent; unref NONE | drop or justify the unref at delivery-lifetime.js:92; sim link remainder unknown |
| R fresh-create release | 6 | src/node release recovery | a/e | NONE | a partition double carrying release facts, or real partitions; review the unref'd sleep (:96-101) |
| H retirement | 2 | src/node handler identity | a/e | NONE | doubles implement `getRegisteredHandler` and `unregisterExact`, or use the real router |
| CEN | 5 | per census | a / b / e | NONE (Set-B covers only raft-rs-backend) | classify the new sites; unify the second leadership-transfer caller |
| X TX1 gaps | 4 | src/partition TX1 | b / d | NONE | production work: PREPARE admission vs pause/epoch; mirror cursor F-MIR |
| L legacy emission | 1 | src/partition write kernel | e | NONE | delete `generateCDCEvent` and the dead branch; move the assertion to the durable obligation |
| MGADD | 1 | src/node MG handler | b (gap) | NONE | fresh-identity MG ADD, or retire the test |
| ROW | 1 | src/partition row owner | a | NONE | the writer double emits the birth identity |
| SETB | 3 | src/raft | a | Set-B (fixed) | done |
| REBAL | 1 | src/rebalancer | a | rebalancer (fixed) | done |
| SCRIPTS | 5 | scripts | c | tooling/relocation | in flight |

## 4. By lane

- **retained-seed-original-handoff's own production, 44 files.**
  - O1–O5 and O? (src/raft original allocation, seed bootstrap).
  - X's participant-release items (src/node participant release) and R (fresh-create participant
    release, 4151a3ab4/7fa4d79ae).
  - P (participant cutover pause, 4151a3ab4) and H (e2c7435b7).
  - Counted as the release lane: R 6 + P 18 + H 2.
- **U1** (src/node runtime-service, src/service lifecycle, src/wasm-service): none of the 106
  clusters traces into U1 code, except the REBAL fixture (fixed) and the code-path-uniqueness hits
  in wasm-service (89e70949f, CEN).
- **Delivery** (message-group, cdc, transport, topology, partition CDC): M1, M2, M3, T, the
  cdc-shutdown census and partition-cdc-obligation. That is 15 files.
- **Other:** MGADD (e0d208773/0b205d0d2), ROW (10-21 birth identity), CEN census items,
  L/X mirror (TX1), SETB, REBAL, SCRIPTS.

## 5. Is origin/main (40795f7d2) likely green? Sample of 10

Reasoning only from history and from whether the failing src frames exist on main. Nothing was run
on main.

| File | On main | Failing frame on main | Verdict |
|---|---|---|---|
| integration/seed-node-bootstrap | same bytes as lineage | `raft-rs-original-allocation-*`, `seed-original-allocation-startup.js` absent | likely green |
| bootstrap/bootstrap-sequence | differs | same O frames absent | likely green |
| simulation/formation-sim-production-handoff | differs | same O frames absent | likely green |
| partition/partition-service-sqlite-metrics | same bytes | `partition-participant-transaction-pause.js` absent | likely green |
| message-group/cdc-non-leader-propagation | differs | `message-group-forwarding-owner-native-delivery-methods.js`, `cdc-delivery-outcome.js` absent | likely green |
| transport/message-router-quarantine-liveness-guard | same bytes | `message-router-delivery-lifetime.js` absent | likely green |
| convergence/dt6-learner-promotion-proof-channel-wake | same bytes | `requireReplicaHandlerRetirement` absent | likely green |
| partition/partition-write-kernel | differs | main still emits `emitCdcEntry: executedEntry` (main `partition-write-kernel.js:435`) | likely green |
| config/code-path-uniqueness | differs | the five flagged files absent on main | likely green |
| partition/partition-admission-redrive-wakes | differs | 'applied progress' absent from main's raft-operation-port-constants | likely green |

Not on main at all: settled-replay-preserves-result, message-group-service-handler-membership,
partition-transaction-replay-cursor-v4.

Main is likely green for these mechanisms. Whether main is green overall is unknown.

## 6. The three biggest clusters: causal story

1. **O (44 files).**
   - Trigger: any seed bootstrap. `bootstrap()` → `prepareOriginalSeedAttempt` (`bootstrap-service-seed-workflow.js:500`).
   - Owner: `seed-original-allocation-startup.js` with `RaftRsOriginalAllocationPreparation`.
   - First divergence:
     - With no process directory owner: the constructor's custody check at `raft-rs-original-allocation-preparation.js:190→394-395` (O1).
     - Phases entered without preparation: `seed-original-allocation-startup.js:37` (O2).
     - With both supplied, the first continuation gate: `:111` (`phaseRegistration` :107,
       `completeSuccessfulBootstrap` :217) (O3).
   - O3 is unconditional, so no test-side repair turns O green. Only completing the lane's
     continuation does.
   - Commits: 8b3638233 and 65f4b0b6a (10-21) preparation and custody; 7fa4d79ae (10-22) startup
     lifetime and hold.
2. **P (18 files).**
   - Trigger: the first mutation on a fresh PartitionService.
   - Owner: `partition-participant-transaction-pause.js`.
   - First divergence: `participantReleaseAdmissionOf` creates CLOSED (`:193-203`) →
     `participantCutoverPauseOf` returns non-null (`:210-216`) → `pausedWriteAnswerOf` (`:284-290`)
     → `startAdmittedPartitionWrite` returns it unproposed (`partition-service-raft-write-commit.js:441-447`).
   - Production opens admission only through ACTION.RESUME (`replica-handler-participant-release.js:214-216`).
   - Commit: 4151a3ab4 (10-12), consolidated in 19f3f09c9 and f6c483012 (10-13).
3. **O1 inside O is the largest single signature. The next-largest independent cluster is M plus T (12 files).**
   - Trigger: a non-leader `applyCDCEvent`.
   - First divergence: `buildPeerAddress` cannot resolve live (`message-group-forwarding-owner-routing-methods.js:193-196`
     needs status identity, which the double lacks) → `message-group-service-peer-resolution.js:91`
     → retry → attempt 3 becomes relayDepth 3 (`message-group-service-cdc-replication-runtime-methods.js:23-30`)
     → `readCdcForwardContext` refusal (`native-delivery-methods.js:81-84`) → wrapped at
     `message-group-service-runtime-support.js:253`.
   - In transport: `delivery-lifetime.js:92` unref → the event loop drains → "test unfinished".
   - Commit: 681da1dc1 (10-23).

## 7. Legacy-duplicate view (owner directive 2026-10-24)

- **Volatile CDC emission (L):**
  - Delete `generateCDCEvent` (`partition-service-cdc-stream-base.js:129`) and the dead branch at
    `partition-service-write-metrics-base.js:691-693`.
  - Rewrite partition-write-kernel's emitCdcEntry assertion against the durable obligation
    (`partition-cdc-delivery.js`).
  - Move cdc-generation.property and cdc-subscription-catchup to the durable obligation owner's path,
    once P is resolved.
- **Hand-written fakes restating an owner contract, to replace with the owner or one shared double:**
  - `ControllableConsensusPort.readStatus` (M1)
  - `manualTimers` (M2)
  - the join-message-group service literal (M2)
  - the phase delegate maps (O4)
  - `replicaHandler: {}` (O5)
  - `createMockPartitionServiceFactory` (R)
  - transport doubles without the identity API (H)
  - the row-writer double (ROW)
- **Second leadership-transfer caller:** `replica-handler-participant-cutover.js` (CEN). Unify it at
  the replica handler's handoff issuer.
- **Not established here:** whether any of the 106 exercises `src/transport/websocket-transport*.js`
  or `src/transport/router-message-handler.js`. None of the 106 test files names either module.
  The only consumers of router-message-handler are three tests outside the 106:
  - test/transport/immediate-ack-ordering.property
  - test/transport/service-response-correlation.property
  - test/transport/message-router-late-response-classification

  Those three tests go with that module's deletion.

## Unknowns

- O? (3 files).
- M3's src-vs-test split.
- The formation-sim-connection-environment test 3 remainder.
- The partition-activation-handler-boundary divergence.
- partition-cdc-obligation O3.
- The exact PREPARE admission sites in X.
- Whether production fresh partitions ever reach RESUME (unmeasurable while O holds).
