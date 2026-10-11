# Publication-gate long tail: triage ledger (2026-10-11)

Reference head: FreshMG `6d4132222` (its `src/`, `test/`, `scripts/` trees are byte-identical to
`b5e62dd0d`; `6d4132222` only appends `solve/quests/message-group-fresh-identity-membership/log.ndjson`).
The lab hosts hold `b5e62dd0d` and not `6d4132222`, so every lab measurement below was taken on
`b5e62dd0d` and is cited as "head"; the controller-side ratchets ran on a `git archive` export of
`6d4132222`. Takeover parent: `60a60b2a6` (2026-10-09 23:29). Pre-window base used for coupling:
`bb3ed72d0` (2026-10-07 11:55, "Merge reservation authority with preserved history": the commit that
set the test-duplication baseline; every ratchet is green there and 14 of the 15 deterministic unit
reds below are green there).

Nothing was fixed. No worktree's tracked files were modified; the FreshMG worktree was read only.

Classification vocabulary: **D** deterministic (same first failing assertion on every run, every
host); **L** load-sensitive (green serial, red under lane parallelism or on the slowest host);
**F** flaky (red rate measured over serial single-file runs); **W** acceptance witness intentionally
red until its quest lands; **S** systemic apparatus defect (the runner), with the files it exposes.

## 0. Method

- Lab convention (scripts/lab/probe.js): one machine-wide `flock` on `~/.lab/machine.lock` (fd 9),
  holder record `machine.holder.json` written under the lock and removed on exit, nvm node 22,
  throwaway detached worktrees under `~/projects/lagrange/test-output/longtail-<name>/<sha>` with
  `node_modules`, ignored `data/*` and `tools/*` entries symlinked from the host repository, one
  `node scripts/run-classified-test-files.js <file>` per file (serial, `LAGRANGE_PLACEMENT=local`,
  `LAGRANGE_TEST_MACHINE_FACTOR` = the fleet speed factor), `.tap/test-results/<file>.tap` copied
  out, worktrees pruned and the holder removed on exit. Verified on every host after each session:
  `~/.lab/` holds only `machine.lock`, `git worktree list | grep -c longtail` = 0. Nothing was
  fetched or pushed into any host repository (the bundle path was not needed: `b5e62dd0d` and
  `60a60b2a6` are present on all five hosts).
- Sessions (host, factor passed, holder expectedMinutes, wall): tv-dator x1.4 25 min / 470 s;
  adam-laptop x2.0 24 min / 456 s; adams-gamla x2.1 16 min / 84 s (unit group at head + parent),
  12 min / 33 s (unit group at bb3ed72d0), 22 min / 315 s (coarse bisect, 9 commits x 13 files);
  lenovo-laptop x2.2 24 min / 643 s; carinas-windows x1.7 22 min / 221 s and 22 min / 347 s (fine
  bisect, 14 commits x 12 files = 168 runs). All hosts answered ssh BatchMode; none was skipped.
- Host facts that matter below: lenovo-laptop is the slowest host (x2.16, 8 cores, SATA SSD) and the
  only host where the bootstrap-heavy files timed out; carinas-windows is a 12-core VM
  ("Virtual Disk", x1.63) and passed every file placed on it, including two that fail elsewhere.
- Red rates were measured only for the three files the brief named flaky/load-sensitive plus the
  election file; every other classification rests on the cone logs (parallel lanes) versus the
  serial runs here and the first failing assertion's content.

## 1. Summary

| # | File | Head (b5e62dd0d) serial | Parent 60a60b2a6 | Class | Owner (router key; module) | Coupling |
|---|---|---|---|---|---|---|
| 1 | test/raft/raft-rs-backend/committed-membership-census.test.js | red | red (same assertion) | D | architecture / sealed-acceptance; src/raft/raft-rs-committed-membership-read.js consumers (src/node/message-group-membership-recipient.js) | pre-takeover 92504f38e (idx 137/140 of bb3ed72d0..60a60b2a6) |
| 2 | test/raft/raft-rs-backend/peer-identity.test.js | red | red | D | sealed-acceptance; src/raft/raft-rs-peer-identity.js | pre-takeover: d22c39192 (2026-10-07 15:54), first red at window idx 12 b98722cab (the merge carrying it), same assertion |
| 3 | test/raft/raft-rs-backend/evidence-o1-static.test.js | red | red | D | sealed-acceptance; src/raft/raft-committed-membership-constants.js (COMMITTED_MEMBERSHIP_READ_PURPOSE) | pre-takeover: file first red at idx 12 (ANSWER_FIELD member); head cause 6255634c7 (idx 117) |
| 4 | test/raft/raft-rs-backend/operation-port-boundary.test.js | red | red | D | architecture; src/raft/snapshot-install.js -> raft-rs-runtime-owner.js boundary | pre-takeover: 02cdbbef8, first red exactly at idx 14 08b0636cd (its merge), same assertion |
| 5 | test/raft/raft-rs-backend/operation-port-regression.test.js | red | red | D (derivative of #2) | same as #2 | same as #2 |
| 6 | test/rebalancer/rebalance-coordinator-operation-ownership.test.js | red | red | D | architecture / sealed-acceptance; src/rebalancer/operation-workflow-owner-execution-lane.js + rebalance-coordinator-concurrent-add-budget.js | pre-takeover: first red at idx 5 8222f5515 "join cleanup recovery scans to owner lifecycle" (2026-10-07 13:14), same assertion |
| 7 | test/rebalancer/message-group-membership-change-parked.test.js | red | red | W | quest message-group-fresh-identity-membership; planner refusal `message_group_membership_change_unsupported` (src/rebalancer/rebalancer-constants.js:478) | witness first present and red at idx 12 b98722cab "merge: compose fresh membership prerequisites" |
| 8 | test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js | red | red | D | contracts (R10) / sealed-acceptance; REPLACE owner src/rebalancer/operation-workflow-replace-owner-recovery.js, operation-workflow-recovery-reconcile.js | pre-takeover: file first red at idx 5 8222f5515 on a sibling case (owner-key sharing); the head assertion appeared later in the window |
| 9 | test/rebalancer/spread-cure-transition-authorization-row.test.js | red | red | D | contracts (R08) / sealed-acceptance; src/rebalancer/replica-operation-repository-mutation-row-methods.js + -constants.js | pre-takeover: first red at idx 12 b98722cab (message-group membership columns), same assertion |
| 10 | test/rebalancer/rebalance-coordinator-outcome-routing.test.js | red | red | D | same owner as #6 | pre-takeover: first red at idx 5 8222f5515, same assertion |
| 11 | test/rebalancer/replica-operation-membership-epoch-binding.test.js | red | red | D | architecture (R03) / sealed-acceptance; decode owner src/rebalancer/replica-operation-membership-epoch-binding.js; reader src/control-plane/replica-dispatch-readiness-capture.js | pre-takeover: first red at idx 6 a8686b37c (the commit that added the reader), same assertion |
| 12 | test/workflow/monotonic-workflow-regression.test.js (brief said test/rebalancer/) | red | red | D | contracts (R14) / sealed-acceptance; src/rebalancer/replica-operation-repository-mutation-update-methods.js (persistOperationUpdate) | older than bb3ed72d0 (red there too); not TX1/FreshMG |
| 13 | test/control-plane/replica-dispatch-node-state-update-ready-node-retry-cache-priority.test.js | red | red | D | contracts (R08); dispatch projection src/control-plane/replica-dispatch-readiness-capture.js:241-254 over the row owner's column list | pre-takeover: first red at idx 6 a8686b37c "preserve reservation identity in dispatch projection", same diff |
| 14 | test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js | red | red | D | same as #13 | same as #13 |
| 15 | test/control-plane/replica-dispatch-node-state-update-remote-direct-wakeup.test.js | red | red | D | same as #13 | same as #13 |
| 16 | test/integration/message-group-fresh-identity-replacement.integration.test.js | red (3 s) | red (3 s) | W | quest message-group-fresh-identity-membership (open, doneWhen test-receipt) | FreshMG epic witness, by design |
| 17 | test/integration/raft-leader-election.integration.test.js | green 3/3 (60 s each) | green 1/1 | L | contracts (R12); seed bootstrap + election wall time (src/bootstrap seed workflow, src/raft rs-raft election tick) vs the file's unscaled 20 s literal | pre-existing; red only under parallel lanes on 4-8 core hosts |
| 18 | test/integration/three-node-seed-rebalance.integration.test.js | adam-laptop red 3/3; carinas green 1/1 | carinas green 1/1 | L (host-deterministic) | contracts (R12); seed bootstrap duration (src/bootstrap seed workflow; rs-raft tick timers) vs READY_TIMEOUT_MS 12 s x factor | pre-existing on 8-core laptops (red in cones 954caf554..b5e62dd0d) |
| 19 | test/raft/raft-rs-backend/single-path-partition-cutover.test.js | green (16 s) | green (16 s) | L + S | contracts (R12) / runner; SEED_TEST_TIMEOUT_MS 90 s unscaled; 5 top-level timed tests share one TAP root budget | pre-existing; red only on lenovo under lanes (95-130 s) |
| 20 | test/integration/managed-split-admission-reliability.integration.test.js | green (80 s, 123 s) | lenovo red (167 s, `timeout!`) | S (+ L) | runner (scripts/run-test-files.js TAP_TIMEOUT); cost owner src/control-plane managed split admission | pre-existing; the shared-root-budget defect |
| 21 | test/integration/create-table-partition-provisioning.integration.test.js | green (53 s) | not run | S (+ L) | runner; 2 top-level 120 s tests share one 120 s root budget | pre-existing |
| 22 | test/integration/seed-node-bootstrap.integration.test.js | lenovo red (152 s, `timeout!`); carinas green in cone (67 s) | lenovo red (152 s) | L (slowest host) + S2 | runner root timer unscaled by machine factor; cost owner seed bootstrap | pre-existing |
| 23 | test/integration/single-node-default-replica-count-writes.integration.test.js | lenovo red (91 s, `timeout!` on a 45 s root budget) | carinas green (16 s) | L (slowest host) + S2 | same as #22 | pre-existing (red in TX1 cones on lenovo only) |
| 24 | test/integration/insert-or-ignore-raft-replay.integration.test.js | green 6/6 (22-58 s) | lenovo red 1/1 (`timeout!` on the 30 s root budget) | L (slowest host) + S2 | same as #22; cost owner the SQL rebuild replay (src/partition) | pre-existing |
| 25 | test/integration/pgwire-command-tag-real-engine.integration.test.js | green (88 s) | not run | L (1 red in >= 4 observed runs) | contracts (R12); rebalance-coordinator authoritative-visibility wait bound (REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS 5 s) under lane load | TX1 cone 56f1ce9b0 only |
| 26 | test/query/partition-write-answer-consumers.test.js (F-aj) | 1/6 red | 1/1 red (different assertion) | F 17% at head | contracts (R12/R14); src/query/query-executor-unknown-outcome.js + src/partition/partition-write-kernel.js; the fixture `withPartitionedLeader` leadership timing | pre-existing |
| 27 | test/closure/CL-040.repro.test.js | 3/6 red | not run | F 50% | contracts (R12); rs-raft election timing under test/test-helpers/raft-rs-network-host.js | pre-existing |
| 28 | test/integration/leader-metadata-validation.integration.test.js | red (listed only) | green | listed only | repair in flight: branch fix/leader-metadata-validation-budget-20261011 | shared 60 s budget |
| 29 | test/node/message-group-service-handler-membership.test.js | green (5 assertions) | red (1 assertion) | resolved | FreshMG B1 (6046cdf81) fixed it | not a current red |
| S1 | scripts/run-test-files.js TAP_TIMEOUT = largest declared timeout (one root timer per file) | - | - | S | runner (apparatus epic); no router key names the test runner (R24 gap) | exposes #19-21, #26 and 31 more files |
| S2 | scripts/run-test-files.js TAP root timer not scaled by LAGRANGE_TEST_MACHINE_FACTOR | - | - | S | runner | exposes #22-24 on lenovo-laptop |
| R1 | test duplication ratchet 698/26410 vs 697/26369 | red | red (same numbers) | ratchet | generated-artifacts / guideline-audits; two new test clone groups | pre-takeover (green at bb3ed72d0) |
| R2 | unused-export ratchet 1421 vs 1416 | red | red (identical list) | ratchet | six newly unused exports, one removed | pre-takeover (1416 at 135279070) |
| R3 | cyclomatic complexity ratchet 1760 vs 1755 (measured; brief said 1759) | red | red (1761) | ratchet | seven functions newly over 12 in three message-group membership modules | 60a60b2a6 -> head: FreshMG removed two, added one |
| R4 | audit:guidelines literal step: 264 new (263 in scripts/quest-evidence/*, 1 in src) | red | red (275) | ratchet | guideline-audits; quest cutover-transition-authority-review's evidence scripts | pre-takeover; FreshMG fixed 11 in -permit.js |

## 2. Deterministic unit reds (D) and the two unit-level witnesses

Common facts. All fifteen reproduce byte-for-byte at `60a60b2a6` on the same host (adams-gamla),
except the census (#1) whose assertion text changed (FreshMG B2 renamed T7; the failing content is
the same extra caller). Fourteen are GREEN at `bb3ed72d0` (2026-10-07 11:55); only #12 is red there.
So none of them is a TX1 (takeover) or FreshMG regression: they entered in the 140 first-parent
commits `bb3ed72d0..60a60b2a6` (2026-10-07 12:00 to 2026-10-09 23:29), and the fine bisect over the
first fourteen of those (bb3ed72d0..08b0636cd "Merge raft-rs checkpoint foundation") places the
first reds of the twelve bisected files at exactly four commits: idx 5 `8222f5515` (three files),
idx 6 `a8686b37c` (four), idx 12 `b98722cab` (four) and idx 14 `08b0636cd` (one); the matrix is in
2.13. Where the assertion that fails at head differs from the one that first turned red, both are
named.

### 2.1 committed-membership-census.test.js (#1) - D
- First failing assertion at head: `not ok 1 - T7: the committed-membership read has exactly three callers outside src/raft - the bootstrap read, the REPLACE completion witness and the message-group consensus port's one reader of any purpose`; deepStrictEqual, actual adds `src/node/message-group-membership-recipient.js` to the three expected callers.
- Parent 60a60b2a6: same extra caller (assertion text was the pre-B2 wording "a message group's witness read of its own configuration").
- History: green at bb3ed72d0 and at window idx 56 (6fa07ca26); first red at idx 57-70 for a different T7 member (at 76c3a6175 the extra callers were `src/rebalancer/committed-membership-bootstrap-read.js` and `replica-operation-message-group-membership-authorization.js` on the bootstrap-read assertion); the head cause is the recipient added by 92504f38e "connect registered learner reads to existing workflow recording owner" (idx 137).
- Owner: the committed-membership read's one-reader rule (architecture R01/R03) over `src/raft/raft-rs-committed-membership-read.js`; the sealed census is `sealed-acceptance`.
- Smallest bounded repair: route the recipient's learner read through the message-group consensus port (the "one reader of any purpose" the census names) so the recipient consumes the port instead of reading committed membership itself; alternatively supersede T7 to four named callers with the recorded reason (R09). Must preserve: no second message-group reader of committed membership outside the port; the recipient's learner-outcome recording semantics.
- Coupling: pre-takeover; TX1 (86d53bc79) later touched the same recipient file but did not introduce the read.

### 2.2 peer-identity.test.js (#2) and operation-port-regression.test.js (#5) - D
- First failing assertion (#2): `not ok 1 - a raft peer id survives restart, ignores address and is never reassigned` with error `an address anywhere in the identity owner would make identity follow placement` (expected true, actual false).
- Mechanism: the witness runs `ADDRESSY = /\b(address|host|port|endpoint|url)\b/i` over the RAW source of `src/raft/raft-rs-peer-identity.js` (its `sourceOf` does not strip comments); line 168 of the owner carries the JSDoc text "committed context cannot authorize address-as-identity or ...", added by d22c39192 "Propagate committed raft-rs peer identities" (2026-10-07 15:54). Fine bisect: first red at window idx 12, b98722cab "merge: compose fresh membership prerequisites" (16:20), the merge that carries d22c39192; same assertion and error text as at head.
- #5 `not ok 1 - the verified integration remains green while transport has no raft-rs node access`: it re-runs a fixed list of raft-rs backend witnesses as a child process; the only child failure is `not ok 14 - a raft peer id survives restart, ignores address and is never reassigned`. Fixing #2 fixes #5.
- Owner: raft-rs peer identity owner `src/raft/raft-rs-peer-identity.js` (sealed-acceptance receipt).
- Smallest bounded repair: reword the comment so the identity owner's source has no address-like token (or make the witness strip comments as the census does); preserve the receipt's property (identity independent of placement; no Number() on the identity path).
- Coupling: pre-takeover.

### 2.3 evidence-o1-static.test.js (#3) - D
- First failing assertion: `not ok 1 - enumerations: the stamp kinds and bootstrap sources are the two stamp origins plus the record`; `READ_PURPOSE: every member is classified exactly once`; the enumeration `COMMITTED_MEMBERSHIP_READ_PURPOSE` (src/raft/raft-committed-membership-constants.js:51) has `LEARNER_ACTION: 'learner-action'`, which the sealed O1 table (`leaderOnly: ['BOOTSTRAP','RETIREMENT'], anyReplica: ['WITNESS']`) does not classify.
- History: LEARNER_ACTION added by 6255634c7 "recover exact committed learner origin through existing native and checkpoint owners" (2026-10-09, idx 117). Fine bisect: the file first turned red at idx 12 (b98722cab) on a different member of the same test (`ANSWER_FIELD: every member is classified exactly once`); the READ_PURPOSE failure seen at head and at 60a60b2a6 dates from idx 117.
- Owner: `sealed-acceptance` (the O1 evidence table is a sealed classification; its own comment says a new member must fail the test) over the enumeration owner `src/raft/raft-committed-membership-constants.js`.
- Smallest bounded repair: supersede the O1 table by classifying `LEARNER_ACTION` (leader-only: it is the learner-action read of the recipient/authorization owners) with the recorded reason (R09); preserve "every member classified exactly once".
- Coupling: pre-takeover (the learner-origin recovery quest).

### 2.4 operation-port-boundary.test.js (#4) - D
- First failing assertion: `not ok 2 - one private runtime owner is the only production binding importer`; actual `[{code: 'lifecycle-owner-import-bypass', detail: './raft-rs-replica-lifecycle-owner.js', file: 'src/raft/snapshot-install.js'}]`, expected `[]`.
- Cause: `src/raft/snapshot-install.js:39` imports `RaftRsReplicaLifecycleOwner` directly (02cdbbef8 "Add raft-rs replica image checkpoint foundation", merged by 08b0636cd). Fine bisect: first red exactly at idx 14, 08b0636cd (the merge that brings 02cdbbef8 onto the first-parent line); same assertion.
- Owner: the operation-port boundary (architecture R11: one path) whose private owner is `src/raft/raft-rs-runtime-owner.js`.
- Smallest bounded repair: snapshot-install reaches the lifecycle owner through the runtime owner's port (or the install step is folded under the runtime owner), removing the second binding importer; a supersession admitting a second importer would have to record why the boundary now has two. Preserve: exactly one production binding importer; the checkpoint install semantics.
- Coupling: pre-takeover (checkpoint foundation).

### 2.5 rebalance-coordinator-operation-ownership.test.js (#6) and rebalance-coordinator-outcome-routing.test.js (#10) - D
- #6 first failing assertion: `not ok 1 - executeOperation should be guarded by shared workflow single-flight` (expected 1 `runExclusive` owner key for one ADD `executeOperation`, actual 2; tail-more-test-cases.js:87).
- #10 first failing assertion: `not ok 2 - owner key must contain the operationId` (outcome-routing.test.js:378; `ownerKeys[0].includes(TEST_OPERATION_ID)` false) under `REPLICA_CREATE_SYNCING routes through runExclusive and calls updateStep with SYNCING`, repeated for `REPLICA_CREATE_CREATING`.
- Mechanism: single-flight keys are `scope:key` with scopes `create`, `create-budget`, `operation` (src/rebalancer/operation-workflow-owner-shared.js:249, -execution-lane.js:189-235). The operation lane's own key `operation:<operationId>` contains the operationId, so the first key the spy records for a CREATE outcome is a `create`/`create-budget` scoped key (rebalance-coordinator-concurrent-add-budget.js:67 `getCreateBudgetSingleFlightKey(scope)`) taken before the operation lane; the same extra lane is the second key in #6. Exact key strings were not captured (the spy records counts only); one run with the spy printing `ownerKeys` settles it.
- Owner: the execution lane (`src/rebalancer/operation-workflow-owner-execution-lane.js`) and the create-budget admission (`rebalance-coordinator-concurrent-add-budget.js`, `-priority-budget-admission.js`), architecture R01 (one owner key per operation turn); the witnesses are sealed-acceptance.
- Smallest bounded repair: either nest the create-budget turn inside the operation lane turn (one key per operation, budget decided under it) or supersede both witnesses to assert "the operation key is taken and the action runs under it" instead of "exactly one key" / "keys[0]". Preserve: single-flight per operation, the concurrent-ADD budget.
- Coupling: pre-takeover. Fine bisect: #6 and #10 both turn red at window idx 5, 8222f5515 "join cleanup recovery scans to owner lifecycle" (2026-10-07 13:14), with exactly the head assertions; #8's sibling case `timeout and outcome paths must share the same owner key` turns red at the same commit. That commit is the accountable change for the extra lane key.

### 2.6 message-group-membership-change-parked.test.js (#7) - W
- First failing assertion: `not ok 2 - fresh-identity closing condition: seed-only mg-1 enters one REPLACE operation instead of the interim membership park`; `the approved fresh-identity path must cross the planner refusal`; actual still `message_group_membership_change_unsupported`.
- Status: the unit twin of #16; green at bb3ed72d0 with 3 assertions, red from window idx 12 with 4 (fine bisect: the closing-condition case arrives with b98722cab "merge: compose fresh membership prerequisites" and is red from its first run). Intentionally red until the fresh-identity REPLACE path crosses the planner refusal.
- Owner: quest `message-group-fresh-identity-membership` (open, doneWhen test-receipt); the refusal lives in `src/rebalancer/rebalancer-constants.js:478` (move planner).
- Repair: none now; it lands with the quest. Do not skip or weaken (R09, R23).

### 2.7 rebalance-coordinator-owner-path-convergence.test.js (#8) - D
- First failing assertion: `not ok 1 - service-row progress should continue the REPLACE into source removal even when authoritative operation reads miss` (expected `workflow_step` STOPPING, actual ACTIVE; test line 539). The case stubs `queryAuthoritativeOperationById` to null and answers the visibility observation with the operation plus a deferred outcome, then applies an ACTIVE service row for the target.
- Owner: the REPLACE owner's service-row progression (`src/rebalancer/operation-workflow-replace-owner-recovery.js`, `operation-workflow-recovery-reconcile.js`); contracts R10 (a deferred authoritative visibility is transient state) and sealed-acceptance.
- Smallest bounded repair: an owner judgment, then one change: if progress under a deferred authoritative visibility is now refused by design (the committed-read decisions O1/O2), supersede the witness with that reason; otherwise the REPLACE owner consumes the visibility observation's operation as its basis and continues into STOPPING. Preserve: no progress on a missing row without an observed operation.
- Coupling: pre-takeover. Fine bisect: the file first turned red at idx 5 (8222f5515) on a sibling case, `not ok 4 - timeout and outcome paths must share the same owner key` (the extra-lane-key mechanism of #6/#10); the service-row-progress assertion that leads at 60a60b2a6 and at head appeared later in the window (not bisected: it is outside bb3ed72d0..08b0636cd). TX1 (754cf6ba3, 7d86d8761) later edited the same owner files without changing the verdict.

### 2.8 spread-cure-transition-authorization-row.test.js (#9) - D
- First failing assertion: `not ok 1 - the authorization rides the operation row and rows without it preserve the pre-admission payload`; `critical-add: the pre-admission row payload is byte-identical to main's`; sha256 `ffb7f661...` vs sealed `07cf06ef...`.
- Mechanism: the witness digests the first `PRE_CREATE_ADMISSION_PARAM_COUNT` INSERT params of a `createOperation`; the replica_operations INSERT (src/rebalancer/replica-operation-repository-mutation-row-methods.js:40-54, column list -constants.js:7-10) now carries `target_claim_key` and `membership_publication_epoch` inside that range, so the bytes differ although the pre-admission semantics are unchanged (the additive-columns-begin-null assertion is not reached).
- Owner: the operation row's canonical shape (contracts R08; `replica-operation-repository-constants.js` column list) and the sealed digest (sealed-acceptance).
- Smallest bounded repair: re-seal `MAIN_ROW_DIGEST` against the current canonical INSERT, recording which columns moved into the range (R09), or replace the byte digest by a structural comparison against the row owner's column list (R03). Preserve: unauthorized moves write exactly one row whose CREATE-admission columns begin null.
- Coupling: pre-takeover. Fine bisect: green through idx 11 (so the a8686b37c reservation columns did NOT move the digest), first red at idx 12, b98722cab "merge: compose fresh membership prerequisites", with the head assertion: the message-group membership columns that merge adds to the INSERT are what changed the pre-admission bytes.

### 2.9 replica-operation-membership-epoch-binding.test.js (#11) - D
- First failing assertion: `not ok 4 - src/control-plane/replica-dispatch-readiness-capture.js: an unclassified reader of the membership epoch appeared; route it through the decode owner or classify it as passthrough` (test line 697, E8 single-decoder inventory).
- Mechanism: readiness-capture reads `row.membership_publication_epoch` through `assertMembershipPublicationEpochBinding` (lines 164-177; added by a8686b37c) - it already consumes the decode owner - but the census recognises consumers only by the relative import `from './replica-operation-membership-epoch-binding.js'` (DECODER_IMPORT_PATTERN), which a `src/control-plane` file cannot use, and the file is in neither table.
- Owner: decode owner `src/rebalancer/replica-operation-membership-epoch-binding.js` (architecture R03); the inventory is sealed-acceptance.
- Smallest bounded repair: add readiness-capture to `DECODE_CONSUMERS` and let `DECODER_IMPORT_PATTERN` accept the cross-directory specifier (`../rebalancer/replica-operation-membership-epoch-binding.js`). Preserve: no local numeric reinterpretation of the field anywhere in src.
- Coupling: pre-takeover. Fine bisect: first red at idx 6, a8686b37c, the commit that added the reader; same assertion.

### 2.10 monotonic-workflow-regression.test.js (#12) - D (older)
- Path is `test/workflow/monotonic-workflow-regression.test.js` (the brief's `test/rebalancer/` path does not exist at either head).
- First failing assertion: `not ok 1 - transition must persist exactly once` (expected 1 `executeQuery` call for `updateStep(operation, SENDING)`, actual 2; test line 535), followed by `not ok 2 - the rebalancer delegates commit mode through independent autocommit` because `persistCalls[0]` is not the guarded write.
- Mechanism: `persistProjectedStepTransition` passes `expectedWorkflowStep`; `persistOperationUpdate` (src/rebalancer/replica-operation-repository-mutation-update-methods.js:107) first runs `shouldRejectExpectedWorkflowStepMutation` -> `queryAuthoritativeOperationById` (line 504, a SELECT through the same engine) and then the UPDATE. The witness counts every `executeQuery`, so the guard read is the first "persist".
- History: red at bb3ed72d0 already; the guard dates from b1acc899f (2026-04-30) and the expected-step plumbing from a70176f96 (2026-05-16); the first red commit was not bisected (outside the window; the test was last edited 2026-07-11).
- Owner: the operation update owner (`replica-operation-repository-mutation-update-methods.js`), contracts R14; witness sealed-acceptance.
- Smallest bounded repair: make the witness count mutations (UPDATE statements) rather than every engine call, or move the guard read onto the read gateway (`readAuthoritativeControlPlaneRows`) so the write engine sees exactly one guarded-autocommit UPDATE with `disableSystemWriteSession`. Preserve: one UPDATE per transition under independent autocommit; the expected-step refusal.
- Coupling: none to TX1/FreshMG.

### 2.11 the three control-plane dispatch reds (#13, #14, #15) - D
- First failing assertions: #13 `not ok 1 - ready-node retry should wake the remote owner directly when the ready target only sees a remote-owned pending operation` (test line 782); #14 `not ok 3 - authoritative rediscovery should still re-enter the canonical per-operation queue` (line 955); #15 `not ok 1 - remote-owned coordinator creates should wake the target owner directly` (line 112). In all three the `t.same` diff is exactly two extra row fields in the dispatched `operationRow`: `"target_claim_key": null` and `"membership_publication_epoch": null`.
- Mechanism: the dispatch projection `src/control-plane/replica-dispatch-readiness-capture.js:241-254` projects the operation back to a row with the two columns (a8686b37c "preserve reservation identity in dispatch projection"); the three fixtures hold literal expected rows from before the columns existed. These are the "three control-plane dispatch reds inherited at 60a60b2a6" from the TX1 cone logs (d85caf6db, 56f1ce9b0, 518c8bbea); they reproduce at 60a60b2a6 and at head with the same diffs.
- Owner: the operation row canonical shape (contracts R08; `replica-operation-repository-constants.js`) consumed by the dispatch projection.
- Smallest bounded repair: the three fixtures build their expected rows through the row owner's projection (the same builder the dispatcher uses) instead of literal objects, so the shape has one owner (R03/R08). Preserve: the wake/retry routing the cases assert (remote owner wake, canonical per-operation queue re-entry).
- Coupling: pre-takeover. Fine bisect: all three first red at idx 6, a8686b37c "preserve reservation identity in dispatch projection", with the head diffs; one accountable commit for the trio.

### 2.12 message-group-fresh-identity-replacement.integration.test.js (#16) - W
- First failing assertion (both heads, 3 s): `not ok 1 - mg-1 survives physical seed storage loss from two distinct off-seed voters`; `two serial production REPLACEs must leave real voter state on distinct off-seed storage before seed loss` (false !== true).
- Owner: quest `message-group-fresh-identity-membership` (open). Acceptance witness intentionally red until the physical seed-loss proof; no repair now.

### 2.13 Fine-bisect attribution (bb3ed72d0..08b0636cd, carinas-windows, 14 commits x 12 files, serial, 1 = red)

Coarse pass first (adams-gamla, 9 evenly spaced first-parent commits of bb3ed72d0..60a60b2a6 x 13
files): 12 files red from the first sample (idx 14, 08b0636cd) onwards; the census (#1) green through
idx 56 (6fa07ca26) and red from idx 70 (76c3a6175, on a different T7 member: extra bootstrap-read
callers `committed-membership-bootstrap-read.js` and `replica-operation-message-group-membership-authorization.js`);
its head cause (the recipient) is idx 137. Fine pass over idx 1..14:

```
w    sha        u01 u02 u03 u04 u05 u06 u07 u08 u09 u10 u11 u12   (u01 peer-identity, u02 o1-static,
w01  8b9c962ba    0   0   0   0   0   0   0   0   0   0   0   0    u03 port-boundary, u04 ownership,
w02  c16e73eb8    0   0   0   0   0   0   0   0   0   0   0   0    u05 parked, u06 owner-path,
w03  a628b32b7    0   0   0   0   0   0   0   0   0   0   0   0    u07 spread-cure, u08 outcome-routing,
w04  8f70c1b10    0   0   0   0   0   0   0   0   0   0   0   0    u09 epoch-binding, u10-u12 dispatch trio)
w05  8222f5515    0   0   0   1   0   1   0   1   0   0   0   0
w06  a8686b37c    0   0   0   1   0   1   0   1   1   1   1   1
w07  f8a5ca8b1    0   0   0   1   0   1   0   1   1   1   1   1
w08  f13f7f37a    0   0   0   1   0   1   0   1   1   1   1   1
w09  cb17bd44d    0   0   0   1   0   1   0   1   1   1   1   1
w10  4c7fb5c9a    0   0   0   1   0   1   0   1   1   1   1   1
w11  7c011cc9f    0   0   0   1   0   1   0   1   1   1   1   1
w12  b98722cab    1   1   0   1   1   1   1   1   1   1   1   1
w13  455bb803b    1   1   0   1   1   1   1   1   1   1   1   1
w14  08b0636cd    1   1   1   1   1   1   1   1   1   1   1   1
```

| First red commit (first-parent idx, 2026-10-07) | Files | First failing assertion at that commit |
|---|---|---|
| idx 5 `8222f5515` 13:14 "join cleanup recovery scans to owner lifecycle" | #6 operation-ownership, #10 outcome-routing, #8 owner-path-convergence | #6/#10 exactly the head assertions; #8 `not ok 4 - timeout and outcome paths must share the same owner key` |
| idx 6 `a8686b37c` 13:44 "preserve reservation identity in dispatch projection" | #11 epoch-binding, #13 #14 #15 dispatch trio | exactly the head assertions (unclassified reader; two extra null row fields) |
| idx 12 `b98722cab` 16:20 "merge: compose fresh membership prerequisites" | #2 peer-identity (+#5), #3 evidence-o1-static, #7 parked (W), #9 spread-cure digest | #2, #7, #9 exactly the head assertions; #3 on `ANSWER_FIELD` (head's READ_PURPOSE member came at idx 117) |
| idx 14 `08b0636cd` 19:34 "Merge raft-rs checkpoint foundation" | #4 operation-port-boundary | exactly the head assertion (snapshot-install import) |
| idx 137 `92504f38e` 2026-10-09 "connect registered learner reads to existing workflow recording owner" | #1 census (head cause) | the recipient as fourth caller (file first red at idx 57-70 on another member) |
| before bb3ed72d0 | #12 monotonic | not bisected |

Every one of these commits precedes 60a60b2a6 (2026-10-09 23:29); none belongs to TX1 (754cf6ba3..518c8bbea) or to the FreshMG integration commits (3259d3d5f..b5e62dd0d).

## 3. Load-sensitive, flaky and apparatus-exposed files

### 3.1 raft-leader-election.integration.test.js (#17) - L
- Cone first failing assertion (b5e62dd0d, adams-gamla, 4 cores, parallel lane): `not ok 20 - total bootstrap and election should complete within 20s (took 20927ms)` under `seed node creates 3-replica Raft groups with leader election`, the file then `not ok 1 - Raft leader election # time=61564ms`. Serial here: 3/3 green at head (tv-dator, 60-61 s each) and 1/1 green at 60a60b2a6; red in nine cone runs across lenovo/adams-gamla/adam-laptop.
- Owner: the seed bootstrap + first election wall time (src/bootstrap seed workflow; rs-raft election tick, src/raft) under contracts R12; the file's literal `totalTime < 20000` (lines 195 and 376) is not scaled by `scaleByMachineFactor` (test/integration/helpers/test-machine-factor.js).
- Smallest bounded repair: scale the two 20 s literals by the machine factor (bounded, preserves the reference-machine SLO); the cost question (why a 3-replica seed election needs ~21 s on a loaded 4-core host) belongs to the seed cold-formation owner and is not a test change.

### 3.2 three-node-seed-rebalance.integration.test.js (#18) - L, deterministic on adam-laptop
- First failing assertion (adam-laptop, 3/3 serial at head): `not ok 1 - seed bootstrap timed out after 24000ms` (test line 108 `withTimeout`); carinas-windows passed it at both heads (37-39 s). The 24 s is `READY_TIMEOUT_MS` 12 s already scaled by the factor 2.0 (the file scales at the point of use, lines 36-45), so the seed bootstrap exceeds 12 s reference-equivalent on this 8-core x1.9 laptop.
- Owner: seed bootstrap duration (src/bootstrap seed workflow; the rs-raft per-group tick timer cost noted in memory) under contracts R12; `READY_TIMEOUT_MS` is pinned by test/bootstrap/join-formation-discovery-window-budget.test.js.
- Smallest bounded repair: measure the seed bootstrap wall time on adam-laptop against the reference and either re-pin READY_TIMEOUT_MS from the measurement (through its pinning test) or take the seed bootstrap hot path to its owner; do not raise the literal in this file alone.
- Repro at parent: not run on adam-laptop (carinas green at both heads); the cone logs show it red at 954caf554, 80632c7e4, 6046cdf81, d85caf6db, 36dc704b1 and b5e62dd0d, always on lenovo or adam-laptop.

### 3.3 single-path-partition-cutover.test.js (#19) - L + S1
- Cone first failing assertion (lenovo, parallel lane): `not ok 1 - seed bootstraps and serves a write on rs-raft by default`, `error: 'test timed out after 90000ms'` (124 s file time); serial: 16 s green at both heads on carinas.
- Owner: the cutover witness's `SEED_TEST_TIMEOUT_MS` 90 s literal (unscaled) and seed bootstrap cost under contention (contracts R12); the file has 5 top-level timed tests sharing one TAP root budget (S1).
- Smallest bounded repair: covered by S1 (sum of declared budgets) plus scaling the seed budget by the machine factor.

### 3.4 managed-split-admission-reliability.integration.test.js (#20) - S1 (+ L)
- Cone (lenovo, b5e62dd0d): tests 1-11 ok, `ok 2 - managed split persists blocked split admission ... # time=96316ms`, then `not ok 1 - timeout!` with `expired: TAP`: three top-level `{timeout: TEST_TIMEOUT_MS}` (120 s) tests share ONE 120 s root timer. Serial at head: green on tv-dator (80 s) and adam-laptop (123 s); at 60a60b2a6 on lenovo: `not ok 1 - timeout!` at 167 s (same expiry). The c1 triage runs were green serially.
- Owner: the runner (S1); cost owner src/control-plane managed split admission (its `timeout-budget.js` classification appears in the c1 triage output).
- Repair: S1; interim per-file watchdog `tap.setTimeout(3 x TEST_TIMEOUT_MS)` as in the leader-metadata-validation repair.

### 3.5 create-table-partition-provisioning.integration.test.js (#21) - S1 (+ L)
- Cone (lenovo): tests 1-7 ok then `not ok 1 - timeout!` / `expired: TAP` at 161 s: two top-level 120 s tests share one 120 s root timer. Serial at head: green on tv-dator (53 s), green twice in the c1 triage.
- Owner / repair: as 3.4.

### 3.6 seed-node-bootstrap.integration.test.js (#22) - L (slowest host) + S2
- lenovo (serial): `not ok 1 - timeout!` at 152 s at BOTH heads (single top-level test, `TEST_TIMEOUT_MS = 120000`; root timer 120 s wall, not scaled by the x2.2 factor); carinas passed it in the b5e62dd0d cone (67 s, 117 assertions). Red in cones only on adam-laptop (6046cdf81, 125 s) and tv-dator under lanes (d85caf6db, 131 s).
- Owner: runner S2 (root timer unscaled) and seed bootstrap cost (contracts R12).
- Smallest bounded repair: S2 (scale the root timer by the machine factor in the runner); the seed bootstrap cost stays with its owner.

### 3.7 single-node-default-replica-count-writes.integration.test.js (#23) - L (slowest host) + S2
- lenovo (serial, head): `not ok 1 - timeout!`, `expired: single node with production default replica_count serves user-table writes` (`TEST_TIMEOUT_MS = 45000`; 91 s wall). Green at 60a60b2a6 on carinas (16 s) and in the b5e62dd0d cone on adams-gamla (26 s). Red in the TX1 cones only on lenovo (84-90 s).
- Owner / repair: as 3.6 (the 45 s root budget is 2.8x the reference cost but lenovo exceeds it).

### 3.8 insert-or-ignore-raft-replay.integration.test.js (#24) - L (slowest host) + S2
- Head: 6/6 green (tv-dator 22 s x3; adam-laptop 28/58/57 s wall). 60a60b2a6 on lenovo: `not ok 1 - timeout!`, `expired: INSERT OR IGNORE lost through SQL rebuild` (`{timeout: 30000}`, 79 s wall). Red in cones only on lenovo (3259d3d5f, tx1-518c8bbea, tx1-56f1ce9b0: 77-83 s).
- Owner: runner S2; cost owner the SQL rebuild replay (src/partition). Repair: S2.

### 3.9 pgwire-command-tag-real-engine.integration.test.js (#25) - L (1 red observed)
- The brief's ":768": line 768 is the file's single top-level test `test('PG-wire command tags from the real engine through a real client', {timeout: TEST_TIMEOUT_MS = 300_000}, ...)`. Red once (TX1 cone 56f1ce9b0, tv-dator, 412 assertions, 93 s) with error-level logs during the run: `wait_bound_spent` for `REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS` (5000 ms, elapsed 5055 ms, sawVisibilityMismatch) on the schema-job operation, `Terminal transition repair abandoned: a different durable terminal state won`, and `Invalid state transition attempted pending -> pending`. The failing assertion itself sits in the 30995 elided bytes of that cone log and the host .tap is gone: FIRST FAILING ASSERTION UNRECOVERED. Green in the b5e62dd0d cone (tv-dator, 93 s, 414 assertions) and serial here (carinas, 88 s).
- Owner: the rebalance coordinator's authoritative-visibility wait bound under lane load (contracts R12); not a TAP budget (93 s << 300 s).
- Smallest bounded repair: first capture a red .tap (run the file concurrently with the exclusive lane on tv-dator until it reds), then name the fix; do not touch the 5 s bound before the assertion is known.

### 3.10 partition-write-answer-consumers.test.js F-aj (#26) - F, 17% at head
- Head serial: tv-dator 1/3 red, adam-laptop 0/3 red => 1/6. Red run: `not ok 2 - F-aj: the query executor re-delivers an unknown outcome under the write's one entryId until it is settled - its client gets the original result, applied once; a router holding the code re-proposes it only under its entryId`, error `its client is told the write applied ("The proposal was accepted into consensus and its outcome is not known to this replica; a retry with the same entryId is idempotent")` false !== true (test line 384 inside `withPartitionedLeader`, line 271). 60a60b2a6 (adam-laptop, 1/1 red): same test, different step: `setup: r2 leads` false (line 362). Cone reds: adam-laptop (b5e62dd0d), tv-dator (d85caf6db, tx1-518c8bbea).
- Owner: the unknown-outcome redelivery owners `src/query/query-executor-unknown-outcome.js` / `query-executor-partition-delivery.js` and `src/partition/partition-write-kernel.js` (contracts R12/R14); the flaking step is leadership timing in the fixture (`formAdmittedGroup` + `createControllablePartitionService`), not the property.
- Smallest bounded repair: make the fixture's leadership setup deterministic (await r2's leadership through the owner's leadership observation instead of elapsed time) and only then re-measure the redelivery assertion; preserve F-aj unchanged. Also an S1 instance (2 top-level timed tests).

### 3.11 CL-040.repro.test.js (#27) - F, 50%
- Head serial: tv-dator 1/3 red, adam-laptop 2/3 red => 3/6. First failing assertion: `not ok 2 - the majority elects a new leader` (test line 76) after `host.runUntil(1600)` of simulated time following `net.partition(leaderA, other)`; c1 triage: green at b5e62dd0d, red at 552940d4a (`committed raft log entries agree across nodes after a partition + heal`).
- Owner: rs-raft election timing as driven by `test/test-helpers/raft-rs-network-host.js` over the virtual network (src/raft election tick / randomized timeout constants); contracts R12.
- Smallest bounded repair: drive the host until a new leader is observed under a bounded term/time budget (predicate-driven `runUntil`) or seed the election jitter in the host; preserve the CL-040 property (committed log agreement after partition + heal).

### 3.12 leader-metadata-validation.integration.test.js (#28) - listed only
- Red at head (`not ok 1 - Leader metadata validation on join # time=60037..70101ms`, the file's shared literal 60 s budget for four seed bootstraps); green at 60a60b2a6 (lead's bisect). Repair in flight on branch `fix/leader-metadata-validation-budget-20261011`; not re-triaged here.

### 3.13 message-group-service-handler-membership.test.js (#29) - resolved
- Red at 60a60b2a6 (`not ok 1 - a real committed learner plus exact admission package is the only CREATE path`), green at head (5 assertions): fixed by FreshMG B1 (6046cdf81). Listed so the earlier cone logs' entry has a disposition.

## 4. Systemic apparatus items (runner owner)

### S1. TAP_TIMEOUT is one root timer per file, lifted only to the LARGEST declared `{timeout: N}`
- Where: `scripts/run-test-files.js:313-334` (comment "silently CAPS every test" is misleading: tap's root test owns the single timer; the runner exports `TAP_TIMEOUT = max(largestDeclaredTimeoutSeconds(file), TAP_TIMEOUT_FLOOR)`; declarations parsed by `scripts/checks/test-timeout-declarations.js`). Any file with several top-level tests each declaring N shares one N-second budget. Proven by the coordinator's split implementer (two 4 s tests under TAP_TIMEOUT=4: the second dies 1 s in with `expired: TAP`) and visible in this ledger as #20 (3 x 120 s), #21 (2 x 120 s), #19 (5 declared), #26 (2 declared) and the leader-metadata-validation file.
- Classification: S, deterministic given host speed (a file fails exactly when the sum of its top-level tests' wall time exceeds its single largest declaration).
- Owner: the classified test runner (`scripts/run-test-files.js`, `scripts/run-classified-test-files.js`, `scripts/checks/test-timeout-declarations.js`) under the testing-time/apparatus epic. The router has no key for the test runner (an R24 route gap: `test/guidelines/harness.md` "Timeout Budget and Classification Policy" is the nearest owner text and it speaks of control-plane budgets, not the harness timer).
- Candidate systemic repair (bounded): export TAP_TIMEOUT as the SUM of the file's top-level declared timeouts (capped by the per-process kill `--timeout-ms`, default 600 s), or honor a file-level `tap.setTimeout(...)` declaration when present; keep per-test `{timeout}` semantics unchanged. Interim: the leader-metadata-validation file's explicit `tap.setTimeout(count x per-test)` watchdog.
- Exposure census (AST over `test/**`, 2330 test files, 0 parse failures): 35 files have more than one top-level test declaring a timeout; 10 files declare a file-level `t.setTimeout`/`tap.setTimeout` (format `timed/top-level  file  setTimeout  declared values`):
```
14/14  test/integration/message-group-learner-successor-ordering.integration.test.js  -  30000
11/11  test/partition/committed-statement-outcome.test.js  -  TEST_TIMEOUT_MS
11/11  test/partition/partition-runtime-reconstruction-leadership.test.js  -  TEST_TIMEOUT_MS
 9/9   test/integration/message-group-learner-recipient.integration.test.js  -  30000
 9/9   test/query/unknown-outcome-same-entry.test.js  -  TEST_TIMEOUT_MS
 8/8   test/query/write-identity-instance.test.js  -  TEST_TIMEOUT_MS
 8/12  test/service/service-compiler-editor-typings.test.js  -  TOOLCHAIN_TIMEOUT_MS, TOOLCHAIN_TIMEOUT_MS * 2
 7/7   test/partition/partition-write-typed-releases.test.js  -  TEST_TIMEOUT_MS
 6/6   test/partition/partition-unreadable-durable-record.test.js  -  TEST_TIMEOUT_MS
 6/6   test/partition/settled-replay-preserves-result.test.js  -  TEST_TIMEOUT_MS
 5/5   test/examples/service-compiler-account-summary-parity.test.js  t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 2)  TOOLCHAIN_TIMEOUT_MS
 5/5   test/raft/raft-rs-backend/single-path-partition-cutover.test.js  -  SEED_TEST_TIMEOUT_MS, PARTITION_TEST_TIMEOUT_MS
 4/4   test/convergence/dt6-cpu-saturation-missed-budget-spike.test.js  t.setTimeout(TEST_FILE_TIMEOUT_MS)  TEST_FILE_TIMEOUT_MS
 4/4   test/integration/load-channel-resilience.integration.test.js  -  30000
 4/5   test/integration/node-join-convergence-slo.integration.test.js  tap.setTimeout(INTEGRATION_TEST_TIMEOUT_MS)  INTEGRATION_TEST_TIMEOUT_MS
 4/4   test/partition/partition-port-refusal-outcomes.test.js  -  TEST_TIMEOUT_MS
 4/4   test/query/settled-replay-sql-surface.test.js  -  TEST_TIMEOUT_MS
 4/4   test/raft/raft-rs-backend/operation-port-throw-containment.test.js  -  TEST_TIMEOUT_MS
 3/3   test/convergence/dt6-rebalancer-timeout-detection-network.test.js  -  SCENARIO_TIMEOUT_MS
 3/3   test/convergence/dt6-rebalancer-timeout-orchestration-network.test.js  -  SCENARIO_TIMEOUT_MS
 3/4   test/integration/managed-split-admission-reliability.integration.test.js  -  TEST_TIMEOUT_MS
 3/3   test/node/replica-handler-leadership-transfer.test.js  -  TEST_TIMEOUT_MS
 3/3   test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js  -  KIND_TIMEOUT_MS
 3/3   test/transaction/session-transaction-isolation.test.js  -  TEST_TIMEOUT_MS
 3/3   test/wasm-service/service-cell-world-abi.test.js  t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 3)  TOOLCHAIN_TIMEOUT_MS
 3/3   test/wasm-service/service-compiler-module-shape-spike.test.js  t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 2)  TOOLCHAIN_TIMEOUT_MS
 2/2   test/bootstrap/return-value-completeness.property.test.js  -  120000
 2/2   test/integration/concurrent-join-message-group-assignment.integration.test.js  -  TEST_TIMEOUT_MS
 2/2   test/integration/create-table-partition-provisioning.integration.test.js  -  TEST_TIMEOUT_MS
 2/2   test/integration/message-group-learner-runtime-authorization.integration.test.js  -  30000
 2/2   test/partition/partition-write-leadership-transfer-committed.test.js  -  TEST_TIMEOUT_MS
 2/2   test/partition/partition-write-leadership-transfer.test.js  -  TEST_TIMEOUT_MS
 2/2   test/query/partition-write-answer-consumers.test.js  -  TEST_TIMEOUT_MS
 2/2   test/query/write-exactly-once-schedules.test.js  -  TEST_TIMEOUT_MS
 2/2   test/wasm-service/service-cell-v2-world-abi.test.js  t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 3)  TOOLCHAIN_TIMEOUT_MS
 (file-level setTimeout with <= 1 timed top-level test: test/scripts/exact-election-evidence-same-turn-model-contract.test.js, test/scripts/local-leader-row-visibility-model-contract.test.js, test/bootstrap/bootstrap-sequence.test.js (0/17 timed, t.setTimeout(BOOTSTRAP_SEQUENCE_TEST_TIMEOUT_MS)), test/bootstrap/phase-failure-handling.property.test.js)
```
  The files whose top-level tests are the longest (wasm/service toolchain, convergence, learner integration) are the exposure; the four already-known instances are #19-21 and #26. Census script: scratchpad `longtail/tap-timeout-census.mjs` (read-only, espree from the export's node_modules).

### S2. The TAP root timer is not scaled by LAGRANGE_TEST_MACHINE_FACTOR
- `run-test-files.js:596-619` reads the factor only to RECORD it on a timeout (`sampleTimeout`); budgets are scaled "at the point of use" by `test/integration/helpers/test-machine-factor.js` inside tests that import it, while the exported TAP_TIMEOUT stays the reference-machine declaration. On lenovo-laptop (x2.16) this is why #22 (120 s declared), #23 (45 s) and #24 (30 s) expire there and nowhere else. Same owner as S1; bounded repair: multiply the exported root budget by the resolved machine factor (keeping the per-process kill as the ceiling).

## 5. Ratchets (controller, `git archive` exports of 6d4132222, 60a60b2a6 and each baseline-setting commit; `node_modules` symlinked from the FreshMG worktree; nothing ran inside a worktree)

### 5.1 `npm run -s test:duplication` - FAILED at 6d4132222 (exit 1): [test] 698 clone group(s) / 26410 duplicated line(s) vs baseline 697 / 26369 ([src+scripts] 47/47, 1473/1473 OK)
- Identical numbers at 60a60b2a6 (exit 1). Green at the baseline-setting commit bb3ed72d0 (697/26369, exit 0). So the group entered in bb3ed72d0..60a60b2a6, not in TX1/FreshMG.
- Diff of jscpd test reports (bb3ed72d0 vs 6d4132222): TWO new groups and ONE removed (net +1 group, +41 lines):
  1. `test/raft/raft-rs-backend/participation-gate.test.js:182-202` <-> `test/raft/raft-rs-backend/stampless-opening-refusal.test.js:66-86` (21 lines): a committed-membership stamp fixture builder (`reservedIdentities(dbFile) ... {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED, voters, votersOutgoing: [], learners: [], learnersNext: [], appliedIndex: ...}`).
  2. `test/query/unknown-outcome-same-entry.test.js:92-137` <-> `test/query/write-exactly-once-schedules.test.js:42-86` (46 lines): the `loseFirstAnswerFromR1({interceptors, services, members, dbFileOf, afterProposed})` helper.
  - Removed since bb3ed72d0: `test/rebalancer/coordinator-created-user-partition-remote-outcome.test.js:65-89` <-> `test/rebalancer/replica-operation-retained-owner-turn.test.js:38-62` (25 lines).
- Owner: guideline-audits (the ratchet) over the two test pairs' authors (raft-rs backend witnesses; query write-exactly-once witnesses). Repair: extract each duplicated helper into one shared test helper (the stamp builder next to the raft-rs backend fixtures; `loseFirstAnswerFromR1` into a query test helper) - either extraction alone returns the group count to 697; the line baseline then tightens on the checker's hint. Never raise 697/26369.

### 5.2 `npm run -s test:unused:ratchet` - FAILED at 6d4132222 (exit 1): 1421 unused exports vs baseline 1416
- Identical list at 60a60b2a6; 1416 exactly at the baseline-setting commit 135279070 (2026-10-07 11:41). Six exports became unused since then and one was consumed/removed (net +5):
  | Export | File | In-file uses | Disposition |
  |---|---|---|---|
  | REPLICA_OPERATION_MESSAGE_GROUP_MEMBERSHIP_COLUMN | src/bootstrap/replica-operation-message-group-membership-schema-constants.js:3 | 14 | de-export (constants owner used only in-file; no importer) |
  | claimReplicaCreatePhysicalWorker | src/node/replica-create-process-owner.js:105 | 3 | de-export (internal step of the create process owner) |
  | replicaCreatePhysicalWorkerEvidence | src/node/replica-create-process-owner.js:77 | 11 | de-export |
  | runReplicaCreatePhysicalCommit | src/node/replica-create-process-owner.js:168 | 3 | de-export |
  | requireProcessedSourceReplicationStart | src/partition/managed-source-replication-start-delivery.js:43 | 3 | de-export (used only by its own module's delivery path) |
  | COMMITTED_MEMBERSHIP_CONTEXT_ERROR | src/raft/raft-rs-committed-membership-context.js:29 | 11 | de-export (error-text owner used only in-file) |
  - Gone since the baseline (consumed or deleted): `src/transport/transport-semantic-outcome.js:ROUTER_CONNECTION_CLOSED_ERROR_CODE`.
  - None of the six has a consumer anywhere in src/test/scripts, and none is dead code (all are used in-file), so "consume" and "delete" do not apply; de-exporting all six yields 1415 and the baseline then tightens by the checker's hint. If a witness is meant to consume the create-process-owner trio (the CREATE physical-worker claim/commit), that is a FreshMG CREATE decision, not a ratchet repair.

### 5.3 `npm run -s test:complexity` (the cyclomatic ratchet `scripts/check-complexity.js`, threshold 12; it is the complexity stage `npm test` / `test:static` runs) - FAILED at 6d4132222 (exit 1): 1760 violations vs baseline 1755 (the brief's 1759 was not reproduced on the clean export)
- 60a60b2a6: 1761 (exit 1). Baseline-setting commit 04d49d61f: 1755 (exit 0). FreshMG net -1 against the parent (removed `buildOperationWorkflowOwnerDispatchPendingReentryEvidence` 30 and `buildControlPlaneFailurePayload` 20; added `recordMessageGroupLearnerOutcome` 13).
- Functions over the threshold at 6d4132222 that were not over it at 04d49d61f (seven; the eighth difference is the same anonymous arrow in test/rebalancer/rebalance-coordinator-outcome-routing.test.js:150 moving 21 -> 24):
  1. `src/rebalancer/replica-operation-message-group-membership-authorization.js:127` async `selectMessageGroupMembershipBranch` 29 (was 39 at 60a60b2a6). Smallest simplification: extract the pre-CAS refusal ladder (lines 135-157: identity/permit/spec validity, `selectedBranchRecorded`, `newBranchFactRefusal`, `branchSettlementGuard`, holder match, boot currency) into one `branchSelectionRefusal(repository, row, request)` returning a typed outcome or null, and the post-CAS read-back predicate (lines 176-184, eight `&&` terms) into `branchSelectionRecorded(observed, row, spec, nextPermit)`; the function keeps the write and the two observations.
  2. same file `:522` async `recordMessageGroupLearnerOutcome` 13. Smallest: move the `isCurrent` closure (try/catch over two predicates) into a named `invocationIsCurrent(repository, isInvocationCurrent)` helper; that alone returns it to <= 12.
  3. `src/rebalancer/replica-operation-message-group-membership-owner-claim.js:35` `membershipRowIdentityMatches` 14 (eleven `&&` terms). Smallest: compare through a field table (`[['operationId','operationId'],...]` zipped with `identity`) plus the two special terms (`laneKey`, `sourceClaimMatches`), as `CLAIM_FIELDS` already does for the SQL basis.
  4. same `:92` `claimCandidate` 16. Smallest: split the two branches: `initialClaim(repository, row)` and `renewedClaim(repository, old, identity, now)` each returning `generation | null`; `claimCandidate` keeps the time/expiry guard and the encoding.
  5. same `:154` async `claimMessageGroupMembershipOwner` 17. Smallest: extract the request decoding/validation (lines 155-159) into `decodeClaimRequest(request)` and the recorded check (lines 181-183) into `claimRecorded(after, identity, encodedIdentity, next)`.
  6. same `:208` async `settleMessageGroupMembershipNonAdmission` 18. Smallest: extract the CONFLICT ladder (lines 220-223) into `nonAdmissionBasisConflict(repository, row, identity, encodedIdentity)` and the STALE_OWNER check (225-228) into `staleForeignHolder(repository, row, identity)`.
  7. `src/rebalancer/replica-operation-message-group-membership-permit.js:82` `decodeMembershipPermit` 15. Smallest: move the `leaderConfigurationStamp` validation (lines 95-97) and the IN_FLIGHT/proposalIndex rule (98-99) into `permitStampValid(stamp)` and `permitIndexConsistent(value)`.
  - Owner: the message-group membership authorization/claim/permit owners (FreshMG's membership holder work, window commits idx 57-70 "WIP FreshMG: exact membership holder..."); the ratchet is guideline-audits. All seven sit in files the FreshMG branch continues to edit, so the simplifications belong in its next attempt, not a separate quest.

### 5.4 `npm run -s audit:guidelines` - FAILED at 6d4132222 (exit 1) in its first step (`audit:guideline:literals`): 264 new literal-guideline violations, 1267 inherited baseline matches; the chain stops there (`&&`), so the other seven audits did not run on this head
- 60a60b2a6: 275 (same six scripts + 11 in src/rebalancer/replica-operation-message-group-membership-permit.js, which FreshMG fixed). The 264 at head:
  | File | Hits | Kinds |
  |---|---|---|
  | scripts/quest-evidence/cutover-workflow-crash-baseline.js | 65 | free-floating string (245 of the 263) and number literals |
  | scripts/quest-evidence/cutover-workflow-crash-projection-baseline.js | 63 | |
  | scripts/quest-evidence/cutover-terminal-obligation-baseline.js | 45 | |
  | scripts/quest-evidence/retry-recovery-window.js | 42 | |
  | scripts/quest-evidence/cutover-owner-entry-baseline.js | 24 | |
  | scripts/quest-evidence/cutover-transition-authority-baseline.js | 24 | |
  | src/rebalancer/replica-operation-message-group-membership-owner-claim.js:145 | 1 | `' AND '` in `membershipRowWhere` (`predicates.join(' AND ')`), free_floating_string_literal, R06 |
- The lead's note named `raft-rs-membership-transition-runtime.js` as a hit: it has 0 violations on the committed 6d4132222 tree (the hit must come from an uncommitted edit in the FreshMG worktree).
- Owner: guideline-audits (R06) over the quest `cutover-transition-authority-review` (epic raft-rs-full-cutover, doneWhen test-receipt, OPEN: 4 attempts, 17 findings, no terminal entry), whose evidence package references the six scripts (solve/quests/cutover-transition-authority-review/{receipt.json, transition-census.md, classification-gcp-20261008.json}); no quest.json doneWhen names them.
- Baseline-able? No. The literal baseline (`scripts/check-guideline-literals-baseline.json`, `--update-baseline`) is a frozen inherited set; adding 264 identities to it is raising a ratchet, which the one-way rule in AGENTS.md forbids. Must be fixed. The checker scans only `src` and `scripts` (DEFAULT_SCAN_ROOTS), so the bounded options for the six evidence scripts are: (a) the quest owner names the literals as constants inside each script (mechanical, 263 sites), or (b) retire the scripts with the quest's terminal entry (R20: a closed unit keeps only what its sealed claim requires; the receipt already records their outputs) - (b) is smaller but is the quest owner's decision, not a gate repair; moving them under `solve/` would need the unused-files and reachability gates re-checked. The `' AND '` in owner-claim.js is a one-line fix (a `SQL_AND` constant in the module's constants owner) and belongs to FreshMG's next attempt.

## 6. Owners and counts

| Owner (router key; module/quest) | Items |
|---|---|
| runner / apparatus epic (scripts/run-test-files.js; no router key: R24 gap) | S1, S2, and they expose #19, #20, #21, #22, #23, #24, #26 (7 files) |
| contracts R12 (seed bootstrap / election wall time: src/bootstrap seed workflow, src/raft rs-raft tick) | #17, #18, (#19, #22 cost side) |
| contracts R12 (rebalance coordinator wait bounds / election timing) | #25, #27 |
| contracts R12/R14 (src/query unknown-outcome redelivery + partition write kernel; fixture timing) | #26 |
| contracts R08 (operation row canonical shape: replica-operation-repository-constants.js, dispatch projection) | #9, #13, #14, #15 |
| contracts R10/R14 (REPLACE owner progression; operation update guard read) | #8, #12 |
| architecture R01/R03/R11 (one reader / one key / one importer) + sealed-acceptance | #1, #4, #6, #10, #11 |
| sealed-acceptance only (witness text/table supersession) | #2 (+#5), #3 |
| quest message-group-fresh-identity-membership (W) | #7, #16 |
| fix/leader-metadata-validation-budget-20261011 (in flight) | #28 |
| resolved by FreshMG B1 | #29 |
| guideline-audits ratchets | R1 (two test pairs), R2 (six exports, de-export), R3 (seven functions, FreshMG membership owners), R4 (quest cutover-transition-authority-review's six evidence scripts + one FreshMG literal) |

Coupling summary: 0 of the 15 deterministic unit reds are TX1 or FreshMG regressions (14 entered in bb3ed72d0..60a60b2a6, 1 is older); the two acceptance witnesses are FreshMG's by design; every load/flaky item predates the takeover; FreshMG improved three gate numbers (complexity 1761 -> 1760, literals 275 -> 264, one witness #29 green) and worsened none.

## 7. Commands run (controller unless marked lab) and exit codes

- `cd /mnt/data/peter/projects/.worktrees/freshmg-integration-20261010 && node scripts/lab.js fleet` -> 0 (all five hosts ready/free)
- `git archive <sha> | tar -x -C scratchpad/longtail/export-<sha>` for 6d4132222, 60a60b2a6, bb3ed72d0, 135279070, 04d49d61f -> 0 each; `ln -s <freshmg>/node_modules`
- export-6d4132222: `npm run -s test:duplication` -> 1 (698/26410 vs 697/26369); export-60a60b2a6 -> 1 (same); export-bb3ed72d0 -> 0 (697/26369)
- export-6d4132222: `npm run -s test:complexity` -> 1 (1760/1755); export-60a60b2a6 -> 1 (1761); export-04d49d61f -> 0 (1755/1755)
- `node node_modules/knip/bin/knip.js --include exports --no-progress --reporter json` in export-6d4132222 -> 1 (1421), export-60a60b2a6 -> 1 (1421), export-135279070 -> 1 (1416); lists diffed by file:symbol
- export-6d4132222: `node scripts/check-guideline-literals.js --json` -> 0 (JSON mode; 264 new / 1267 inherited); `npm run -s audit:guidelines` -> 1 (literal step, 264); export-60a60b2a6: `node scripts/check-guideline-literals.js` -> 1 (275)
- `node scratchpad/longtail/tap-timeout-census.mjs scratchpad/longtail/export-6d4132222` -> 0 (2330 files, 35 multi-timed, 10 setTimeout)
- git read-only history queries in the FreshMG worktree (`git log -S/-G`, `rev-list --first-parent`, `merge-base --is-ancestor`, `diff --stat b5e62dd0d 6d4132222`) -> 0
- lab, per host (`ssh peter@<ip> bash ~/projects/lagrange/test-output/longtail-<name>.sh`; scripts and logs in scratchpad/longtail/): tv-dator -> 0 (15 runs: 2 red); adam-laptop -> 0 (15 runs: 7 red); adams-gamla -> 0 (32 runs: 31 red); adams-gamla-base (bb3ed72d0) -> 0 (15 runs: 1 red); adams-gamla-bisect1 -> 0 (117 runs); lenovo-laptop -> 0 (5 runs: 5 red); carinas-windows -> 0 (8 runs: 2 red); carinas-bisect2 -> 0 (168 runs; matrix in 2.13). Each session's per-file exit codes are in `scratchpad/longtail/results-<name>/summary.txt`; .tap and runner .out files beside them. Remote cleanup verified per host (`ls ~/.lab` = machine.lock only; 0 longtail worktrees).

## Ownership correction 2026-10-11 (owner review)

The 263 literal-guideline hits attributed above to "six scripts of the open quest cutover-transition-authority-review" break down differently:

| Group | Hits | Disposition |
| --- | --- | --- |
| Five cutover-*-baseline.js evidence runners (transition-authority, owner-entry, workflow-crash, workflow-crash-projection, terminal-obligation) | 221 | Retire together with their three historical workflow callers (.github/workflows/cutover-{contract-first,owner-entry,workflow-crash}.yml) after the genuine completion of cutover-transition-authority-review: its one outstanding receipt is the bounded independent review of the historical 82b54ef9 classification packet, assigned 2026-10-11; preserve the reproducible packet first. |
| scripts/quest-evidence/retry-recovery-window.js | 42 | NOT that quest's script: its retained evidence lives under FreshMG and concerns query retry budgets and write identity. Owner: the query delivery-budget owner. Retain pending that owner's disposition; meaningful constants if it stays useful; retirement only under a separate recorded justification. |

Publication policy (owner decision, same review): no sealed-red convention. Non-main preservation of the candidate continues with red acceptance witnesses visible; landing a quest and `npm run publish` keep their requirements. Red acceptance witnesses must be evolved deliberately by their owners: the parked-planner file (message-group-membership-change-parked.test.js) reuses one fixture for an interim zero-operations expectation and the closing one-REPLACE expectation - the obsolete interim assertion must be retired explicitly or refusal coverage kept through a genuinely unsupported or unauthorized case; the physical seed-loss file must be completed into the real replacement-and-seed-loss acceptance path (the two production REPLACEs run); the reviewed TX1 retirement map applies to obsolete TX1 witness revisions. Original red evidence, valid refusal controls and the sealed behavioural promise are preserved in each case.

## Corrections 2026-10-11 (from the repair agents)

- 2.8 spread-cure digest: the pre-admission bytes moved because of 0d60f1ac4's committed-membership answer fields (learnersNext, configurationKey, membershipGenerationIndex) inside steps_history[0].bootstrapMembership, carried by b98722cab, not because of the message-group membership columns (those are params 17-25, all null, after the pre-admission range). Repaired by binding the witness to the row owner's INSERT builder and admission columns.
- 2.3 LEARNER_ACTION is NOT leader-only: answerCommittedLearnerAction runs in the asked replica's queued turn from its own registry (the recipient reads it at the target learner); classified anyReplicaQueued. Four more enumeration members from 0d60f1ac4 were unclassified (LEARNERS_NEXT, CONFIGURATION_KEY, MEMBERSHIP_GENERATION_INDEX, CONFIGURATION_GENERATION_UNAVAILABLE).
- 2.9 a second unclassified epoch reader existed: operation-workflow-coordinator-created-handoff-scheduling.js (f13f7f37a, projects membershipPublicationEpoch ?? null; classified passthrough).
- 3.6/3.7/3.8 (#22 seed-node-bootstrap, #23 single-node-default-replica-count-writes, #24 insert-or-ignore-raft-replay): NOT S2 cases: on lenovo-laptop the expiry names the TEST ("expired: Seed node bootstrap integration", "expired: single node ... writes"), i.e. the test's own unscaled `{timeout}` binds, which the runner cannot reach. Owner: the test files (scale the declaration via test/integration/helpers/test-machine-factor.js). S2 still binds wherever the root sum is the limit (managed-split reached the 540 s bound at x2.1 with the runner fix).
- S1/S2 runner repair: fix/runner-tap-timeout-20261011 @ 73ba55a49 (from main 878eb8ac0): TAP_TIMEOUT = max(sum of top-level declared timeouts, largest, file-level setTimeout) x machine factor, bounded to 90% of the per-process kill budget; explicit TAP_TIMEOUT wins; floor unchanged. On main the exposure is 30 files (26 with >1 timed top-level test + 10 with a file-level setTimeout; the ledger's 35 was measured at b5e62dd0d); 30 files change budget at x1, 78 at x2.09; the only reductions are the two 600 s files to the 540 s bound. Verified on lenovo-laptop (x2.1): create-table and managed-split red -> green; single-path-partition-cutover green both; #22/#23 unchanged (test-owned budgets).
