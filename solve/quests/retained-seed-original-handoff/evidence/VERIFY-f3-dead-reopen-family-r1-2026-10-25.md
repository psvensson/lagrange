---
audience: development
documentClass: evidence
---

# VERIFY F3 (ruling b): dead servedLegacy reopen family, r1, 2026-10-25

## Verdict

**REQUIRED CHANGES: two comment-only edits. The code in 743d1223b is approved as it stands.**

Every behavioural claim reproduces from the code and from my own runs. There is no
reachable `servedLegacy === true` path into the deleted family, so I am not
rejecting it. The deletion is not complete "end to end", though. Two src comments
still describe the deleted reopen as live behaviour, and one of them is in a file
this commit touched. Both edits are comment-only. Neither changes a decision or
needs a re-run of tests. Land them as a follow-up commit on top of 743d1223b, or
as an amend.

Exact required edits:

1. `src/partition/partition-participant-transaction-constants.js:127-128` (touched by this commit):
   `// Enabling admission on a connection that served a legacy session since`
   `// its open (0.0.14, the L6 clause): the cutover reopens it first.`
   Change it to say an unstamped connection is refused, and that nothing reopens
   it. The new wording in `partition-participant-transaction-connection.js:6-9`
   is the model.
2. `src/node/replica-handler-lifecycle-methods.js:146-148`:
   `// Release reads/pause/recovery stay available during bootstrap. The`
   `// reopen action still asks retained-storage admission before closing`
   `// anything; this does not authorize create/remove/storage shortcuts.`
   The reopen action no longer exists. Drop the second sentence's reopen clause
   and keep "this does not authorize create/remove/storage shortcuts".

## Identity

- Verified commit: 743d1223bd0c09f8e6e8f2b45e908d2b5a6f1ef0 (= `refs/wip/lab-f3-2`). Chain: 08ff8eb91 -> 4ceacb5d2 -> 743d1223b. Branch: work/leadership-transfer-one-issuer-20261024. The implementer worktree is clean at 743d1223b.
- Net delta `git diff 08ff8eb91 743d1223b`: 10 files, +77/-144. That is 8 src files, 1 test (a comment only) and `test/shards/impact-graph-seal.json`. The lead's "9 src files" is really 8 src files plus 1 test JS file, which is the 9 the hook scans.
- Byte identity with base, by blob SHA at 08ff8eb91 and at 743d1223b:
  - `src/node/replica-handler-leader-handoff-methods.js`: 630bf622, IDENTICAL
  - `test/node/replica-handler-leadership-transfer.test.js`: 50620822, IDENTICAL
  - `test/node/replica-handler-replacement-election-already-leader.test.js`: dac2b7c6, IDENTICAL
  - `test/shards/subsystem-classes.json`: IDENTICAL
- Verifier: an independent subagent. I did not write this unit, and I edited, committed and pushed nothing.

## Per-claim table

| # | Claim | Result | Evidence |
|---|---|---|---|
| A1 | `UNSTAMPED` is the only producer of `servedLegacy: true` | CONFIRMED | `connection.js:12` STAMPS is a module-private WeakMap. Its only write is `connection.js:25` (`servedLegacy: false`), called only from `partition-participant-transaction-store.js:80` (open hook). That hook is called only from `partition-service-raft-init-base.js:385`, right after `this.db = new Database(...)` at :370. `connection.js:15` UNSTAMPED is the only true value. There is no mutator: `noteLegacySessionServed` was removed in b8e36a97c and was never in a release (not an ancestor of v0.2.5). |
| A2 | Every remaining `servedLegacy` site is either live fail-closed or deleted | CONFIRMED | src: connection.js:15 (UNSTAMPED, live), :25 (stamp false, live), :32 (JSDoc), request.js:740 (ENABLE's CONNECTION_SERVED_LEGACY refusal, live). test: native-application-order.test.js:1009 (asserts false), partition-participant-release-admission.test.js:71/75/76 (asserts UNSTAMPED and the false stamps). Nothing else in src/scripts/test. |
| A3 | An unstamped connection is refused before any reopen site | CONFIRMED | `pause.js:162-164`: `replicaGenerationOf` puts `connection.generation` into `connectionGeneration` (:69,:76). `participantReleaseGenerationValid` (`release-contract.js:83-90`) requires `positiveInteger(connectionGeneration)`, so null gives UNAVAILABLE `current_replica_generation`. The only OBSERVED release-facts producer is `pause.js:117` (`observedReleaseFacts`). It runs only after that check. It reads `connection` (:123) in the same synchronous run as `generation`, with no await between :162 and :170, so the two cannot diverge. Implementer probe `cutover-unstamped-leader-probe.tap` leaf 6 shows exactly `release_fact_unavailable / current_replica_generation`. |
| A4 | Every path into reopenCohort/reopenReplica/REOPEN required servedLegacy true on an OBSERVED census | CONFIRMED (base code) | Base `runPausedCutover` reached `reopenCohort` only after `unavailableCensus(census) === null`, so all entries were OBSERVED and therefore stamped false. `dirtyFollowers` was empty and `own.connection.servedLegacy` false, so it returned null. `ACTION.REOPEN` was issued only from base `cutover.js:228,245`, inside that dead branch. Base `reopenReplica` was reached only via `executeReleaseAction` after `releaseRequestRefusal` passed the OBSERVED gate (release.js:216). It then hit `servedLegacy === false` and returned facts. |
| A5 | No snapshot/restore/rehydration path produces a stamped connection with servedLegacy true | CONFIRMED | The stamp lives in process memory, keyed by the db object, and is never persisted or copied. The only partition `service.db` assignments are init (:370, then stamped), null (core-base:139, lifecycle:82, init:380), and message-group/wasm services, which are not participant-release partitions. Snapshot catch-up (`snapshot-catchup-wiring.js:213-220`) installs a freshly initialized replacement service, which is stamped false by its own init. |
| B1 | REOPEN / reopenCohort / reopenReplica / REOPEN_REQUIRED / REOPEN_REFUSED / ORIGIN_APPLIED_ON_LEGACY_CONNECTION / observeOriginConnection are deleted | CONFIRMED for identifiers | `git grep` across the repo leaves only historical solve/ files: changes/legacy-connection-orphan-removal-20261013/{checkpoint,independent-review-v1}.md, quests/replicated-transaction-decision-and-apply/{design-...-2026-10-11,proof-plan-...-20261012}.md, quests/runtime-ordering-completion-consumer-proof/{evidence/receipt.json,log.ndjson}. No hits in docs/. Constant values at the commit (imported live): ACTION = {release, inspect, pause, enable, observe_applied_position, resume}; PHASE has no reopen. |
| B2 | No dangling imports | CONFIRMED | eslint clean on the 8 src files and `node --check` OK. `buildReplacementServiceOptions` (dropped from release.js) is still consumed by `raft/snapshot-catchup.js:375`. `isReleaseDrained` was dropped from the release.js import and is still used elsewhere. `participantConnectionStampOf` was dropped from apply.js and is still used by pause.js and request.js. `RAFT_LEADERSHIP_TRANSFER_SUCCESSOR` was dropped from cutover.js. |
| B3 | No ACTION switch still handles the removed member | CONFIRMED | `executeReleaseAction` (release.js) has no REOPEN case, so a wire `action:'reopen'` now falls to `default: INVALID`. `actionRequiresIdentity` no longer lists it. The other consumers compare named members only (`lifecycle-methods.js:152`, `participant-release-client.js`). `scripts/participant-release-completion-audit.js` references the ACTION import name only. |
| B4 | Deletion end to end, with no stale description left | **NOT MET (comments only)** | Two stale src comments, listed under Verdict. Nothing else: the other `reopen` hits in src are unrelated (formation handoff, readiness barrier, SQLite `ReopenIdx` opcode, and so on). |
| C | Removing the `controlReleaseAnswerValid` :144 check changes no decision | CONFIRMED (same-build inputs) | The answer's census entries must be OBSERVED with `buildDigest === targetBuildDigest` (same predicate). OBSERVED facts exist only via pause.js:117 after a valid generation, so `connection.servedLegacy === false` always held. The same reasoning covers the removed `releaseFactsDefect` REOPEN_REQUIRED (base release-contract.js:139). Its `!facts.connection` UNAVAILABLE guard (:130) remains. The narrow caveat is under Findings, item F4. |
| D1 | Terminal-status pairing (release-contract.js:54-57) equals the old literals | CONFIRMED | Imported live at 743d1223b: DECISION.COMMIT='COMMIT', DECISION.ROLLBACK='ROLLBACK', TRANSACTION_STATUS.COMMITTED='COMMITTED', TRANSACTION_STATUS.ROLLED_BACK='ROLLED_BACK'. The boolean structure `(C && S1) \|\| (R && S2)` is unchanged. The new imports introduce no cycle (test:cycles 0/0). |
| D2 | OBSERVATION_FIELD / MISSING_FACT constants equal the old literals | CONFIRMED | STATUS_LEADER='leaderId', CONTEXT_LEADER='leaderReplicaId' (release.js:32-33, used at :261/:267). MISSING_FACT.CURRENT_REPLICA_GENERATION='current_replica_generation' (cutover-constants.js:34, used at release.js:314). |
| D3 | The `enableParticipantTransactionAdmission` split keeps the decision order | CONFIRMED | See the old vs new control flow written out below. |
| E | Tests, statics, hook | CONFIRMED | See "What I ran". |
| NAMED | The port/core NAMED path is still live | CONFIRMED | The only `SUCCESSOR.NAMED` producer in src is `replica-handler-leader-handoff-methods.js:91` (REPLACE_TARGET_LEADER_ELECTION on a FOLLOWER). It is reached via `requestTrackedPartitionLeaderHandoff` from `replica-handler-remove-request-methods.js:631` (STEP_DOWN). It is consumed by `raft/raft-rs-leadership-transfer.js:69,144`. There is no raft-rs deletion candidate. One issuer: `.requestLeadershipTransfer(` in src now appears only at handoff-methods.js:144 (plus its definition in partition-service-leadership-transfer.js). |
| W5 | `leadership-transfer-single-path.test.js` is green by construction | CONFIRMED | Base: leaf 2 "one partition issuer and one caller" is red because of the cutover's `service.requestLeadershipTransfer`. At 743d1223b: all 3 leaves pass. |

### D3: old vs new control flow

Old, at 08ff8eb91:

1. Read `recorded`, then `coordinatorEnforcement` (null unless SQL_TRANSACTIONS).
2. If `recorded !== null && enf?.state !== REQUIRED`:
   - if `enf !== null && enf.state !== ENFORCED`, return the SCHEMA refusal;
   - otherwise return `alreadyEnabled`.
3. If `leadership = partitionWriteLeadershipRefusalOf(service)` is not null, return it.
4. Build `payload`, read the stamp. If `servedLegacy`, return CONNECTION_SERVED_LEGACY.
5. Propose the origin.

New, at 743d1223b:

1. Build `payload`. This is a pure object literal, so moving it earlier has no effect.
2. `recordedOriginAnswer` reads in the same order. It returns null exactly when
   `recorded === null || enf?.state === REQUIRED`, which is the De Morgan
   negation of the old guard, and it holds for enf null too
   (`undefined === REQUIRED` is false).
3. Otherwise it returns the same ternary (SCHEMA refusal or alreadyEnabled).
   It never returns undefined, so `??` falls through only on null.
4. `originProposalRefusal` runs leadership first, then the stamp, and returns the same objects.
5. Propose the origin, unchanged.

The decision order, the reads and the returned objects are all identical.

## Findings

- **F1. Required (comment-only): two stale reopen comments.** These are the two sites under Verdict.
- **F2. Implementer finding 1 confirmed: FACT.GENERATION duplicate.** `pause.js:32` `FACT.GENERATION = 'current_replica_generation'` and the new `cutover-constants.js:34` `MISSING_FACT.CURRENT_REPLICA_GENERATION` are two named owners of one wire value, and both are emitted as `missingFact`. The commit swapped a literal for a second constant, which does not make it worse. Unifying them, with pause.js consuming MISSING_FACT, is a follow-up under the "one version" rule.
- **F3. Implementer finding 2 confirmed: `transactionReleaseProofValid` restates `transactionReleaseProofOf`.** `release-contract.js:42-60` and `distributed-transaction-release-settlement.js:222-240` both encode the per-entry rules: exact RESULT_FIELDS, id order, decision membership, terminal pairing and participantIds. Their strictness differs. The validator requires DIGEST_PATTERN and nonempty participant ids. The builder requires only `typeof decisionDigest === 'string'` and an Array. These are two versions of one rule, which is a follow-up.
- **F4. Informational: a wire-shape check is gone with the dead branch.** The removed `releaseFactsDefect` line used `servedLegacy !== false`, and the removed :144 used `?.servedLegacy === false`. Both also refused a census entry whose `connection` object lacked `servedLegacy`. Such an entry could only come from a non-same-build or malformed peer. Same-build peers always carry false, and the build-digest checks run before or with these predicates. A mixed-build cutover from a pre-b8e36a97c peer is impossible because that mutator was never released and upgrade is unsupported by ruling. The remaining structural guard is only `!facts.connection`. No decision changes for any supported input.
- **F5. Informational (an improvement): a throw becomes a typed refusal.** Base `reopenCohort` dereferenced `own.connection` without a guard. If the cutover leader's own replica were missing from its census, base would throw a TypeError there. The new path reaches `releaseCensusDefect(release, census, undefined)`, which returns CENSUS_REFUSED (`releaseMemberIds(undefined)` is null). No test covers this edge.
- **F6. Implementer finding 3 confirmed: unwired `setLeaderDurabilityUnfitHook` JSDoc.** The JSDoc at `partition-service-durability-fitness.js:116-122` says "The replica handler wires this to requestTrackedPartitionLeaderHandoff". No src caller exists. The only caller is `test/convergence/dt6-ledger-leader-durability-fitness.test.js:50`. This is outside this diff and is a follow-up: either the doc or the wiring is wrong.
- **F7. Lineage-wide, not this unit: stale debt inventory.** `solve/changes/global-owner-debt-inventory/inventory.json` was last regenerated at 7a99717ef. Running `--refresh` at the base 08ff8eb91 already rewrites it (+172/-245 lines), so it is stale before this unit. The hook replay restages it on top of that (the delta from this unit is edgeCount 29640 -> 29639 and a few importOut counts). The commit does not carry it, which matches the branch's practice. Flag it for the publish gate if it checks the inventory.
- **F8. Ratchet hints, pre-existing.** `test:duplication` prints the same tighten hints at base and after (src+scripts 47->46 clones, 1462->1439 lines; test 26237->26233). This unit did not cause them. Per the ratchet rule, tighten them in a ratchet unit.

### Coordination note for the lead (report only)

Two versions of release-contract.js:50-57 exist. Keep the composed one at merge.

- **F3 version (743d1223b):** `release-contract.js` imports `TRANSACTION_STATUS` from `distributed-transaction-coordinator-constants.js` and `PARTICIPANT_TRANSACTION_DECISION as DECISION` from `partition-participant-transaction-constants.js`, then restates the two pairs inline:
  `(entry.decision === DECISION.COMMIT && entry.terminalStatus === TRANSACTION_STATUS.COMMITTED) || (entry.decision === DECISION.ROLLBACK && entry.terminalStatus === TRANSACTION_STATUS.ROLLED_BACK)`.
- **Composed version (lineage, from ratchet-src unit f731d701e; present on work/mg-delivery-resume-r2-20261023 341656e3b and its descendants, which contain 08ff8eb91):** one owned map `TRANSACTION_RELEASE_TERMINAL_STATUS = {[DECISION.COMMIT]: TRANSACTION_STATUS.COMMITTED, [DECISION.ROLLBACK]: TRANSACTION_STATUS.ROLLED_BACK}`, defined in `distributed-transaction-release-census.js:14-17`. `release-contract.js:8,50-51` checks `Object.keys(MAP).includes(entry.decision) && entry.terminalStatus === MAP[entry.decision]`, and `distributed-transaction-release-settlement.js:33,191,232` uses the same map.
- The two are behaviourally equivalent, since the map's keys are exactly COMMIT and ROLLBACK and it is frozen. The composed map is the one owner and also partly addresses F3. At merge, take the composed hunk, then drop F3's two new imports in release-contract.js (DECISION, TRANSACTION_STATUS), which become unused. Expect a textual conflict on these lines and the import block.

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/f3v/logs/`)

Detached scratch worktrees at 08ff8eb91 (base), at 743d1223b (after), and a third "hook" worktree. Each had node_modules symlinked from the primary checkout. All three were removed at the end and `git worktree prune` was run. I checked thermal headroom before every heavy run, ran them one at a time, and used `LAGRANGE_PLACEMENT=local`.

- **Owning tests (43 files), base and after: `owning-base.tap`, `owning-after.tap`.** The set is my own `u.txt`: every test importing one of the 8 changed modules, unioned with the implementer's `owning3b.txt` 31 files, fixtures excluded. It includes W5 and the 2 seed-release files.
  - Base: 6 red files. After: 5 red files. The leaf diff (`nb.txt` vs `na.txt`) is exactly W5 red -> green and nothing else.
  - Red files with the same failing leaf at base and after:
    - code-path-uniqueness Property 14
    - first-prepare-native leaf 1
    - prepare-identity-native leaf 1
    - runtime-completion-consumers-transfers leaf 2, with the same assertion "native transfer completion itself does not reopen admission" at both
    - seed-release-failure-custody leaf 1
    - retained-seed-original-handoff.integration leaf 1
  - The last two are outside the implementer's list of 4. Both are in the implementer's recorded base sets (`base-known.txt`, `known2.txt`) and are red at my base too, so they are pre-existing.
- **eslint + node --check** on the 8 src files: clean.
- **Scoped complexity, base vs after: `static-base.txt`, `static-after.txt`.** 4 violations both times, with no increase: observationStatusDisposition 28, transactionReleaseProofValid 19, releaseFactsDefect 33 -> 32, releaseCensusDefect 35.
- **Guidelines on the 9 JS files.**
  - Literals: 8 new at base -> 0 after.
  - Decision boundaries: 1 at base (request.js) -> 0 after.
  - Ambient intrinsics: 0 at both. Silent catch: 0 at both.
  - This confirms the hook fixes were needed to make the touched files committable.
- **test:cycles:** 0/0 cycle groups.
- **test:duplication:** OK, identical at base and after (see F8).
- **Metadata:** `test:metadata:refresh` at 743d1223b gives zero drift (clean git status), and snapshotDigest 61a9e755... equals the committed seal (`metadata-after.log`).
- **raft-rs audits:** `scripts/checks/raft-rs-operation-boundary-audit.js` and `scripts/checks/raft-rs-lifecycle-retirement-census.js` both exit 0 with no output at 743d1223b.
- **Hook replay (`hook.log`):** I applied the net diff as staged in a base worktree and ran `.githooks/pre-commit`. Exit 0. The staged src/test/seal after the hook is identical to 743d1223b (`git diff --cached 743d1223b -- src test scripts` is empty). The only extra file it staged is the inventory.json from F7.
- **Lab classification spot-check (F), base and after: `spot-base.tap`, `spot-after.tap`.** 5 of the implementer's 20 "red on clean base" files: query/partition-write-answer-consumers, query/deferred-hash, query/transaction-owned-commit-mode-guard, index-management/index-service, integration/sql-workflow. All 5 are red at 08ff8eb91 and at 743d1223b, with identical leaf sets (158 leaf lines each, no diff). The classification "red on a clean base" holds for the sample.

## Limits and unknowns

- I did not rerun the full lab 1070-file cone. I sampled 5 of the 20 "new on lab" files, and the other 15 rely on the implementer's `new3-base.tap`. That run came from an implementer `base-wt` whose exact commit is not recorded in the tap: **UNKNOWN**. My own base sample reproduces at 08ff8eb91. The 77 "in recorded base sets" files were not re-checked.
- The intermittency of runtime-completion-consumers-transfers leaf 2 is not characterized. It was red in both of my single runs, with the same assertion.
- The unreachability argument covers same-process, same-build code paths. Byzantine or malformed peers are out of model (F4).
- Some dominant failure texts differ between the implementer's `new3-base.tap` ("paused mutation admission ... cutover") and my sample's top-level error lines. My grep caught only top-level errors, and the leaf verdicts agree. I did not root-cause those base reds.
