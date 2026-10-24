---
audience: development
documentClass: evidence
---

# VERIFY ratchet-src-exports r1 (2026-10-24)

## Verdict: APPROVE for commit

No required changes. Two things to record: the claim wording on the export count (finding F1), and the fact that three of the touched ratchets are still red overall even though this change lowers them (F2).

## Identity
- Worktree /mnt/data/peter/projects/.worktrees/ratchet-src-exports-20261024, branch work/ratchet-src-exports-20261024, HEAD 8c51246e2f9c0db2bc4d50c4a18e9d4410744d17.
- Staged index tree (`git write-tree`) a7220fe701c32a2ae5e5529bec8050b21873be13 is the same as the tree of refs/wip/lab-ratchet-src-1 (8aeb3e637). 21 files, +162/-122. The working tree has no unstaged changes, so the checks below ran against exactly the staged tree.
- The base copy `.../ratchet-src/base` matches HEAD blob-for-blob on all 21 touched files (`git hash-object` compare).

## Per-claim table
| # | Claim | Result | Evidence |
|---|---|---|---|
| 1 | unused exports 1448 -> 1427 | CONFIRMED (delta 21) | `verify-r1/unused.txt` 1427, `verify-r1/base-unused.txt` 1448. A sorted diff of the full knip listings (`verify-r1/unused-full.txt` vs `verify-r1/base-unused-full.txt`) shows 21 entries removed and 0 added. Wording: see F1 |
| 1a | 2 deleted constants were dead | CONFIRMED | `git grep -w` at HEAD outside solve/ and data/: RECOVERY_ROLLBACK_TRANSACTION_STATUS appears only at its definition and export (coordinator-constants.js:32,113). TRANSACTION_RELEASE_SCHEMA_VERSION appears only at its definition and export (release-census.js:9,66). The census takes `schemaVersion` from `enforcement?.schemaVersion` (census :22), which comes from TRANSACTION_SCHEMA_ENFORCEMENT_VERSION = 2 (schema-enforcement.js:12,50-51). So the `= 2` copy really is a duplicate |
| 1b | participantSetTextOf consumers still resolve | CONFIRMED | Defined and exported in distributed-transaction-participant-manifest.js:5,25. Every consumer (participant-set.js:10, test/partition/participant-release-tx1-decision-fixture.js:8, test/query/transaction-release-settlement.test.js:9, test/query/transaction-review-adversarial.test.js:10) imports it from the manifest module. No consumer imports it from participant-set |
| 2 | complexity 1805 -> 1800 | CONFIRMED | I diffed the base and staged complexity-src-test.json violation sets. Exactly 5 were removed (replaceRuntime 30, invokeCore 14, snapshotReceiverRow 15, claimMessageGroupMembershipOwner 17, settleMessageGroupMembershipNonAdmission 18) and 0 were added. So none of the new helpers is over 12 |
| 3 | cognitive 153 -> 152 green | CONFIRMED | "Cognitive complexity ratchet OK: 152/152", exit 0 (`verify-r1/cog.txt`) |
| 4 | [src+scripts] duplication baseline 47/1462 -> 46/1439 | CONFIRMED, tightened only | `scripts/check-duplication.js:89-92` diff only lowers the two numbers and adds a comment. "[src+scripts] Duplication ratchet OK: 46/46, 1439/1439" (`verify-r1/dup.txt`). The implementer's before-dup.txt hint at base shows base already measured 46/1439, and the comment says so honestly. No baseline was raised |
| 5 | consensusInitRefusedError fold STOPPED, the definitions differ | CONFIRMED (see E) | |
| 6 | lab: 0 reds caused | CONFIRMED at file level (see D) | |

## A. Behaviour preservation

### replaceRuntime (src/raft/raft-rs-runtime-owner.js:785-826 new)
- Prologue (:786-798) is unchanged: the REPLACING/retry-window guard, `runtimeRecovery ??=`, `attempts += 1`, `failure = null`, `runtimeHealth = REPLACING`, `invalidateRuntimeGroups()`, `core = null`, `restoredGroups = []`.
- Restore loop. The body moved verbatim into `restoreGroupsIntoNewCore(trigger, restoredGroups)` (:732-756) and is called inside the same outer `try`, right after `ensureCore()` (:800-802).
  - It still iterates over a snapshot of `[...groups.values()]`.
  - The per-group inner try/catch still routes unexpected throws to `containUnexpectedThrow(group, error)`.
  - The `runtimeRecovery.failure !== null` check still sits outside the inner try but inside the loop, so it still runs after every group, including after a contained throw.
  - On a mid-loop failure (CORE_FATAL, or a failure recorded by a callback), the helper returns `failedRuntimeReplacement(...)`. Groups already pushed stay in `restoredGroups`, exactly as before. `replaceRuntime` then returns that value from inside the try, so `finally` still runs before the return.
  - The `null` sentinel is safe: `failedRuntimeReplacement` (:604-612) always returns `runtimeRecoveryOutcome(...)`, which is an `outcome(...)` object (:576-), never null.
  - Throw routing is unchanged. A throw from `failedRuntimeReplacement` in the CORE_FATAL branch is still caught by the inner catch, as before. A throw from the post-group check still propagates to the outer catch (:816), as before.
  - The per-group mutations are unchanged in order: `health = RECOVERY_REQUIRED`, `recovery = null`, `pendingRuntimeResume = runtimeGeneration`, push. `runtimeGeneration` is the same module `let`.
- The finally body moved verbatim into `settleAbandonedReplacement()` (:760-769): guarded by `runtimeHealth === REPLACING`; sets UNHEALTHY; deletes closed groups; if no group is left, resets `core`, `runtimeRecovery` and `runtimeHealth = HEALTHY`. The writes to the module-level `let`s are the same and happen in the same order.
- After the try:
  - `generation` is captured once at :822 and passed to both helpers.
  - `scheduleRestoredResumptions` (:773-779) keeps the same skip predicate (`group === trigger || group.closed || pendingRuntimeResume !== generation`) and the same iteration order over `restoredGroups`.
  - `triggerAnswerAfterReplacement` (:830-) is the old tail moved verbatim: the GENERATION_CHANGED check against the live `runtimeHealth`/`runtimeGeneration`, then `resumeRuntimeGroup(trigger)`, otherwise the recovery or CORE_OK outcome.
- Result: control flow and side effects are equivalent.

### invokeCore / coreCallFailure (:354-395)
- The catch now does `return coreCallFailure(group, operation, args, error)`. The helper body is the old catch body moved verbatim:
  - A core refusal returns CORE_REFUSED (retryable false, recoveryRequired false) and records nothing.
  - Any other error is a trap. It writes `runtimeRecovery.failure` if REPLACING, otherwise sets `runtimeHealth = UNHEALTHY`. It then calls `reportCoreTrap(..., runtimeGeneration)` and returns CORE_FATAL (retryable, recoveryRequired).
- Nothing is rethrown, now or before. Equivalent.

### snapshotReceiverRow (src/raft/raft-rs-replica-lifecycle-owner.js:411)
- `rows.length !== 1 || receiverRowIdentityMismatch(row, request)`: the length test still runs first, so when `rows` is empty or has 2 rows, `row` (possibly undefined) is never dereferenced.
- The helper (:390-394) keeps the same five disjuncts in the same order. Equivalent.

### Membership owner-claim (src/rebalancer/replica-operation-message-group-membership-owner-claim.js)
- **claim, INVALID.** Old: `!request || typeof request !== 'object'` -> INVALID; destructure; `decodeMembershipIdentity`; then `!identity || identity.operationId !== operationId || (expectedClaim !== null && typeof expectedClaim !== 'string')` -> INVALID.
  New: `membershipRequestOf` (:163-169) returns null on the first two tests, in the same order and after the same decode call. The caller then tests `parsed === null || (expectedClaim !== null && typeof ... !== 'string')`.
  Same disjunct order. The only call inside these conditions is decode, which runs exactly once on the same path in both versions.
- **claim, UNAVAILABLE.** Old: `!await membershipBootIsCurrent` -> UNAVAILABLE; `observeMembershipOperation`; `!before.available` -> UNAVAILABLE.
  New: `observeMembershipOperationBeforeWrite` (:172-176) does the same two awaits in the same order. When the boot is not current, observe is never called, as before.
- **claim, CONFLICT.** Old: `!identityMatches(...) || ![INITIAL, UNRESOLVED].includes(state)`.
  New: `!claimableMembershipRow(...)` = `!(identityMatches && includes)`. By De Morgan this is identical, and the `&&` short-circuit gives the same evaluation order: `includes` is evaluated only when identity matches, exactly as with the old `||`.
- **claim, read-back.** Old: observe; then `!after.available || !await bootIsCurrent` -> UNKNOWN.
  New: `readBackMembershipOperation` (:179-182) = `after.available && await bootIsCurrent ? after : null`. Boot is awaited only when the row is available, as before.
- **settle, INVALID / UNAVAILABLE.** Same helpers, same order. One difference: settle now also reads `request.expectedClaim` during the destructure inside `membershipRequestOf` and then ignores it. That is one extra plain-property read and has no effect for data requests (only a getter or Proxy request could observe it). Not a finding.
- **settle, CONFLICT.** Old: `!identityMatches || !exactTerminal(repo,row) || !neverAuthorized(row) || state !== INITIAL`.
  New: `!settleableNonAdmission` = `!(identityMatches && exactTerminal && neverAuthorized && state === INITIAL)`. De Morgan-identical, with the same left-to-right call order and the same short-circuit points.
- Result: equivalent.

### Owning tests (own runs)
I ran 127 test files with `node scripts/run-test-files.js --jobs 4` in both the staged worktree and the base copy, after the thermal gate:
- The 53 tests that directly import a touched src module.
- All of test/raft/raft-rs-backend/*.test.js.
- The lifecycle-owner, snapshot-receiver and membership-claim tests.

Results (`verify-r1/tests-staged.log`, `verify-r1/tests-base.log`):
- Staged: total=127 pass=110 fail=17 assertions=1864.
- Base: total=127 pass=110 fail=17 assertions=1864.
- The pass/fail sets match file by file (`files-staged.txt` == `files-base.txt`), and the 55 failing leaf lines match too (`leaves-fail-staged.txt` == `leaves-fail-base.txt`).

These owning tests pass in both trees: runtime-trap-and-restore, runtime-replacement-review.integration, restart-from-durable-record, operation-port-throw-containment, snapshot-lifecycle-staging, and message-group-membership-branch-authorization. The last one drives `claimMessageGroupMembershipOwner` to the recorded, conflict and unknown outcomes.

These are red in both trees: message-group-membership-claim-cache.integration (it fails earlier, at bootstrap, with original-allocation-directory-custody-unavailable, before any claim runs) and operation-port-boundary leaf 2 ("one private binding owner ... only the runtime owner imports it").

## B. De-exports
- **Grep.** For every one of the 20 names I ran `git grep -w` over the whole repo, excluding node_modules, solve/ and data/, and excluding the defining file. The only hits are:
  - participantSetTextOf: manifest imports, all fine (see 1b).
  - consensusInitRefusedError: the three independent local definitions.
  - isPositiveSafeInteger: a separate local copy in src/rebalancer/spread-cure-transition-authorization.js:133 (see F3).
- **Dynamic and namespace imports.** No `import(`, `require(` or `import * as` of any of the 17 touched module paths exists in src, scripts, test, docs or architecture.
- **Remaining local use.** Every de-exported name is still used inside its own module, and eslint passes on all 21 files.

## C. Ratchets at the staged tree (logs in `.../ratchet-src/verify-r1/`)
| Check | Result | Exit | Log |
|---|---|---|---|
| check-unused-exports | 1427 vs baseline 1416 (base 1448) | 1 | `unused.txt` |
| check-complexity | 1800 vs baseline 1755 (base 1805) | 1 | `cx.txt` |
| check-cognitive-complexity | OK 152/152 | 0 | `cog.txt` |
| test:duplication [src+scripts] | OK 46/46, 1439/1439 | | `dup.txt` |
| test:duplication [test] | FAILED 701/26618 vs 697/26369 | 1 overall | `dup.txt` |
| audit:file-size | pass | 0 | `fs.txt` |
| test:cycles | OK 0/0 | 0 | `cycles.txt` |
| scripts/checks/raft-rs-operation-boundary-audit.js | pass, silent (same at base) | 0 | `boundary-audit.txt` |
| eslint on the 21 files | clean | 0 | `eslint.txt` |
| node --check on the 21 files | all ok | | |
| audit:guideline decision-boundaries / silent-catch / literals | summaries identical to the implementer's base logs (29 found / 751 inherited; 90 inherited; 312 new / 1261 inherited); red at base too | | `audit:guideline:*.txt` |

The [test] duplication numbers are the same at base (implementer's before-dup.txt). The test tree is not touched by this change.

The boundary-audit test file test/raft/raft-rs-backend/operation-port-boundary.test.js also checks that the runtime-owner source does not mention `partitionControlOf`, `walkObjectGraph` or `depth`. The staged runtime-owner.js has 0 matches.

## D. Lab classification
- `git diff 8c51246e2 refs/wip/lab-ratchet-src-base-1 --stat`: the same 21 files, 21 insertions, 0 deletions. Every added line is `+// lab base-cone probe (no behaviour)`, so the base-behaviour snapshot is base plus one comment per file.
- `lab-reds-files.txt` and `lab-base-reds-files.txt` each have 163 lines. Two of them are random-named `test-output/tap-timeout-fixtures/run-*/echo-timeout.test.js` paths. After normalising `run-<rand>/` the two lists are identical, leaving 161 real red files in both.
- Totals from the logs: snapshot (placement-head 8aeb3e637) and base (placement-head 3d011667c) both show 1674 files, 1513 pass, 161 fail.
- I also compared the per-file ndjson. Every difference is either:
  - a seeded property test (different seed, same verdict), or
  - formation/transport timing: write-path-internal-pacing and message-router fail in both trees with a different first failing line.

  None of them is in a touched owner's domain.
- Limit: the lab ndjson records files, not leaves, so the lab result is file-level only. My local 127-file run above is the leaf-level comparison.

## E. Fold STOP (report only; a one-version finding for the owner)
| Definition | message | code | identity fields | phase | consensus |
|---|---|---|---|---|---|
| src/partition/partition-consensus-port-opening.js:25 | `PARTITION_SERVICE_ERROR_MSG.consensusInitRefused(partitionId, answer)` (parameterised) | PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED ('partition_consensus_init_refused') | none (partitionId only in the message) | yes | `answer` (no `?? null`) |
| src/message-group/message-group-consensus-port.js:47 | MESSAGE_GROUP_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED | MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED | groupId, replicaId | yes | `answer ?? null` |
| src/wasm-service/wasm-service-consensus-port.js:99 | WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED | none | serviceDefinitionId, replicaId | none | `answer ?? null` |

Tests pin the per-domain codes and messages, for example test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js:124 (partition code), :127 (message-group code), :130 (wasm message). Also test/partition/partition-port-refusal-outcomes.test.js:157,194, test/message-group/message-group-service-lifecycle-and-ledger.test.js:179, and test/raft/raft-rs-backend/startup-cleanup-native-fixture.js:138.

The STOP is correct: a fold needs an owner decision on one shape. The interim de-export is behaviour-neutral.

## Findings
- **F1 (wording, no change needed).** knip removed 21 entries: 19 pure de-exports plus 2 deletions. consensusInitRefusedError is counted once per file, so those 21 entries cover 20 distinct names, the 2 deleted constants included. "De-exporting 20 symbols and deleting two" over-counts by one, but the 1448 -> 1427 arithmetic (21) is exact.
- **F2 (pre-existing, informational).** The unused-export, complexity and [test] duplication ratchets are still red overall: 11 over, 45 over, and 4/249 over respectively. This change lowers the first two and leaves the third unchanged. It does not make them green, so any gate that needs them green is still blocked by debt this change did not create.
- **F3 (one-version, for the owner).** isPositiveSafeInteger has two local definitions (distributed-transaction-prepare-evidence.js:9 and spread-cure-transition-authorization.js:133). This is the same kind of finding as consensusInitRefusedError and is out of this change's scope.
- **F4 (environmental).** The knip "Configuration hints" count differs between the base copy (5) and the worktree (1, redundant entry patterns). This is a side effect of the scratch archive and does not affect the export counts.

## What I ran
Everything is under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/ratchet-src/verify-r1/`:
- unused*.txt, base-unused*.txt, cx.txt, base-cx.txt, cog.txt, dup.txt, fs.txt, cycles.txt
- eslint.txt, boundary-audit.txt, base-boundary-audit.txt, audit:guideline:*.txt
- tests.txt (the 127-file list), tests-staged.log, tests-base.log, files-*.txt, leaves-fail-*.txt

The thermal gate (scripts/checks/wait-for-thermal-headroom.js) ran before each test batch. It held for 5 polls at 76-80C before the staged batch. The checks that wrote test-output/analysis reports wrote them inside the verification worktree's test-output and the base scratch copy only.

## Limits and unknowns
- The lab comparison is file-level only, because the lab ndjson has no leaf data.
- The claim-cache integration test fails at bootstrap in both trees, so it gives no behavioural coverage of the owner-claim path. That path's equivalence rests on the boolean proof above plus the passing branch-authorization test.
- I did not run the full local corpus.
- UNKNOWN: whether any non-JS consumer (for example a Python quest-evidence script that imports by string) relies on a de-exported name. git grep found none outside solve/ evidence logs.

---

# Re-verification r2 (delta a7220fe70 -> 26741cf4f, commit a95df4adf)

## Verdict: APPROVE keeping a95df4adf

No required changes.

## Identity
- HEAD a95df4adf ("ratchet(src): G5/G6/G7 structure-only repairs and staged-guideline fixes"); its parent is 8c51246e2.
- HEAD^{tree} is 26741cf4f10c83c2b957628c7a40972bc3554d88, and the working tree is clean. All runs below are at the committed tree.
- The delta covers 10 files, +131/-108:
  - 8 src files;
  - solve/changes/global-owner-debt-inventory/inventory.json and test/shards/impact-graph-seal.json, which are generated digests, byte counts and import counts only.
- In total the commit changes 25 files against base, 23 of them .js.

## (1) The 16 + 4 hook findings existed at base and were never baselined: CONFIRMED
I ran the hook's own commands (.githooks/pre-commit:109-115, `node scripts/check-guideline-<x>.js <the 23 js files>`) on the base copy at 8c51246e2 and on the committed tree. Logs are in `verify-r2/base-*.txt` and `verify-r2/committed-*.txt`.

| Check | Base 8c51246e2 | Committed |
|---|---|---|
| literals | 13 new (+3 inherited) | 0 new (3 inherited, unchanged) |
| decision-boundaries | 5 | 0 |
| silent-catch | 2 | 0 |
| ambient-intrinsics | 0 | 0 |

Base findings per file:
- **literals:** participant-release-contract 4, settlement 4, schema-enforcement 3, release-settlement 1, owner-claim 1.
- **decision-boundaries:** release-settlement 3, runtime-owner 2.
- **silent-catch:** owner-claim 2.

13 + 5 + 2 = 20. That is the 16 the hook flagged on the r1 staged files (12 + 2 + 2) plus the 4 in release-settlement (1 literal + 3 decision-boundary), which the fix brought into the commit.

No guideline baseline file is in the delta, so nothing was baselined. Each per-file count matches a fixed hunk:
- participant-release-contract: 'COMMIT', 'COMMITTED', 'ROLLBACK', 'ROLLED_BACK'.
- settlement: 3 field names and the literal 3.
- schema-enforcement: 'sha256', 'hex', the refusal message.
- release-settlement: 'COMMITTED'.
- owner-claim: ' AND '.

The checker prints counts only, not lines, so the line-level match is by inspecting the diff.

## (2) Each fix preserves behaviour
- **One owned terminal-status map (TRANSACTION_RELEASE_TERMINAL_STATUS).** It is defined at distributed-transaction-release-census.js:14-17 as `{[DECISION.COMMIT]: TRANSACTION_STATUS.COMMITTED, [DECISION.ROLLBACK]: TRANSACTION_STATUS.ROLLED_BACK}`. The constants resolve to the old literals: partition-participant-transaction-constants.js:46-47 gives 'COMMIT'/'ROLLBACK', and coordinator-constants.js:8,10 gives 'COMMITTED'/'ROLLED_BACK'. The release-settlement copy it replaces was the identical expression, so release-settlement :191 and :232 compute the same values as before.
- **partition-participant-release-contract.js:50-51, old vs new check.**
  - Old: `(d==='COMMIT' && t==='COMMITTED') || (d==='ROLLBACK' && t==='ROLLED_BACK')`.
  - New: `Object.keys(MAP).includes(d) && t === MAP[d]`.
  - `Object.keys` returns exactly ['COMMIT', 'ROLLBACK'], and `includes` uses SameValueZero without coercion. So a number, object, null, undefined, a boxed String, or an inherited key such as 'constructor' or '__proto__' fails, just as the old `===` did.
  - `MAP[d]` is read only when d is one of the two own keys, so no prototype lookup can leak.
  - For d='COMMIT' the new check is t==='COMMITTED'; for d='ROLLBACK' it is t==='ROLLED_BACK'. Equivalent for every input type.
  - The only side effect, in both versions, is reading `entry.decision` and `entry.terminalStatus` (both reads, on an `exactRecord`-checked plain record).
- **Cycles.** The census now imports partition-participant-transaction-constants and coordinator-constants. `test:cycles` reports 0/0.
- **NO_STATUS_OBSERVATION / NO_REPLACEMENT_FAILURE** (both `null`, runtime-owner.js:115-117).
  - `statusObservation` is written at :602 (invalidate) and :1947 (init) using the name, compared at :1476 using the name, and otherwise only assigned `observed.value` (:1433) and read (:1487).
  - `runtimeRecovery.failure` is reset at :797/:799 using the name (the `??=` initialiser literal and the per-attempt reset), compared at :757 using the name, and otherwise only assigned objects (:386, :611).
  - The remaining bare `null`s, at :587 (`?? null` output field), :814 (report payload) and :858 (group recovery default), are different fields and keep their meaning.
  - The `??=` semantics are unchanged because the sentinel is literally `null`.
- **NO_RELEASE_AUTHORITY = null** (release-settlement).
  - It replaces each `return null` in readAuthority's catch, ensureFrozen (2 sites) and ensureDecision (2 sites). The comparison `authority === NO_RELEASE_AUTHORITY` replaces `=== null`.
  - `!authority` in ensureDecision still treats it as falsy.
  - The `applySettlement(...) === null` comparisons are left unchanged; they test another function's result.
- **SETTLEMENT_RESULT_FIELDS** (settlement.js:74): a frozen list of the same 3 names, `.length === 3`, with the same `every(key in data)` check and the same order of tests.
- **DIGEST_ALGORITHM / DIGEST_ENCODING** are 'sha256' / 'hex'. **MIGRATION_REFUSAL_MESSAGE** is byte-identical to the old literal (checked in the diff).
- **SQL_PREDICATE_JOIN** is ' AND ', the same separator.
- **PARTICIPANT_COMMIT_OUTCOME.COMMITTED** is 'COMMITTED' (src/constants/transactions.js:21).

## (3) noteUncertainMembershipWrite: one definition, log-only
- It is defined once, at owner-claim.js:30-33, and exported at :285.
- The authorization module imports it (authorization.js:27) and its local copy is deleted. Its existing call sites at :162, :268 and :497 are unchanged.
- The body is `repository.logger?.debug?.(MEMBERSHIP_WRITE_UNCERTAIN, {nodeId, operationId, error: error?.message || String(error)})`. It logs at debug level only and returns undefined.
- The new calls at owner-claim.js:215 and :277 sit inside the catch, the catch still falls through to the exact read-back, and nothing is returned from the catch. Control flow and return values are unchanged.
- Theoretical residual, not a finding: a throwing logger, or an error whose `message` getter or `toString` throws, would now escape a catch that used to be silent. The authorization module's three existing call sites already accept the same risk.

## (4) Owner suites on the committed tree vs base: IDENTICAL
- I ran the same 127-file list as r1 (`verify-r2/tests.txt`). The release-census, release-settlement, schema-enforcement, participant-release-protocol, seed-retained-effects and learner tests were already in it.
- Committed: total=127 pass=110 fail=17 assertions=1864. The r1 base run had the same numbers.
- `files-committed.txt` is identical to r1 `files-base.txt`, and the 55 failing leaves are identical (`leaves-fail-committed.txt` vs r1 `leaves-fail-base.txt`).
- These pass: transaction-release-census, transaction-release-settlement, transaction-schema-enforcement, participant-release-protocol, message-group-membership-branch-authorization, the 3 learner integration tests, runtime-trap-and-restore, and runtime-replacement-review.

## (5) Ratchets at the committed tree (`verify-r2/`)
| Check | Result |
|---|---|
| unused exports | 1427 (exit 1 vs baseline 1416; this debt predates the change, same as r1) |
| complexity | 1800 (exit 1 vs 1755, same debt); against base, exactly the 5 functions removed and 0 added |
| cognitive | OK 152/152 |
| duplication [src+scripts] | OK 46/46, 1439/1439 |
| duplication [test] | red, unchanged from base |
| test:cycles | 0/0 |
| audit:file-size | 0 |
| raft-rs-operation-boundary-audit | 0 |
| eslint on the 23 js files | 0 |
| node --check on the 23 js files | all ok |
| hook staged guideline checks (literals / decision-boundaries / ambient-intrinsics / silent-catch) | 0 / 0 / 0 / 0 |

Inventory freshness: by mistake I ran `node scripts/generate-global-owner-debt-inventory.js --help`, and that does a non-refresh run. It rewrote nothing (`git status` stayed clean), which shows the committed inventory and seal are fresh.

## Limits
- The guideline checkers report counts, not lines.
- The base results for (4) are reused from r1. Base is unchanged since then: same 8c51246e2 copy, blob-checked.
- No lab run in r2.
