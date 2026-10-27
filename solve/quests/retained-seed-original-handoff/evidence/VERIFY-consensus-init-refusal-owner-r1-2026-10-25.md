---
audience: development
documentClass: evidence
---

# VERIFY consensus-init-refusal-owner r1 (2026-10-25)

## Verdict: REQUIRED CHANGES, one item (a misplaced comment). The behaviour is approved.

The unification is correct. It is behaviour-preserving apart from the observable changes listed in claim (B5) and finding F2. Every claim reproduced. One defect must be fixed before landing:

- **RC-1 (exact).** `src/raft/raft-operation-port-constants.js:37-48`. The new `RAFT_CONSENSUS_STARTUP_OUTCOME` block (comment lines 41-45 and the constant at 46-48) was inserted between `RAFT_OPERATION`'s own doc comment (lines 37-40, "The operations of the port beyond the scheduling and proposal surface, named once: the one read of the committed configuration ... section 3.1") and `const RAFT_OPERATION` (line 50). The result is that `RAFT_OPERATION`'s comment now sits above the wrong constant.
  - Fix: move lines 41-48, plus one blank line, so they sit above line 37. Equivalently, move lines 37-40 down so they sit directly above `const RAFT_OPERATION`.
  - Re-proof: eslint on the file. No test re-run is needed, because only comment placement changes.

Nothing else is required. F1-F5 below are reported for the lead to rule on and do not block.

## Identity

- Subject: `a8a05f7caad485badf0b851505d3057c67054f1b`, which is also `refs/wip/lab-cir-1` (checked by rev-parse). Parent: `9b78690a7`. Branch: `work/consensus-init-refusal-owner-20261024`.
- Diff: 31 files, +302/-228 (28 .js, 3 .json).
- I verified independently and am not the implementer. I edited, committed and pushed nothing, and did not touch the primary checkout.
- I worked in detached scratch worktrees at `.../scratchpad/vcir/{head,base}`, with node_modules symlinked from the primary. Both worktrees have been removed (`git worktree list` shows 0 vcir entries), and the lane worktree is clean at a8a05f7ca.

## Per-claim table

| # | Claim | Result | Evidence |
|---|---|---|---|
| A1 | One `consensusInitRefusedError` | PASS | Definition only at `src/raft/raft-operation-port.js:103`. Importers: partition-consensus-port-opening.js:9, message-group-consensus-port.js:11, wasm-service-consensus-port.js:11, plus 3 test files. |
| A2 | One code string `consensus_init_refused` | PASS | Only `raft-operation-port-constants.js:47`. `_consensus_init_refused`, `partition_consensus_init_refused` and `message_group_consensus_init_refused` have 0 hits in src/test/scripts. A `git grep` excluding solve/ and handover/ (it covers data/ fixtures and receipts) also finds none. |
| A3 | Per-domain constants and messages deleted, readers migrated | PASS | `PARTITION_CONSENSUS_STARTUP_OUTCOME`, `MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME`, `consensusInitRefused(`, `MESSAGE_GROUP_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED`, `WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED`, "consensus refused to initialize" and "consensus port refused to open": 0 hits. Every reader listed in the design's B2 test list now uses `isConsensusInitRefusal(error, ENTITY_TYPE.X)`. |
| A4 | Top-level `phase` dropped, no reader | PASS | The only production reader is `node-joining-publication-activation.js:151`, which reads `error.consensus.phase`. The single `error.phase` test pin (partition-port-refusal-outcomes, partition-unreadable-durable-record) was moved to `consensus.phase`. Identity readers (`error.groupId/replicaId/serviceDefinitionId/partitionId`): the grep finds only `bootstrap-state-tracker.js:232-233` `recordError`, which has 0 callers in src. |
| A5 | `isHeldByHostFailure` moved to the owner | PASS | Defined only at `raft-operation-port.js:78`. Deleted from partition-write-kernel, which now imports it at :5 and uses it at :357. Repointed: raft-init-base:55/657, consensus-hold-log:14/59/75, replica-handler-release-recovery:16/67. The inline copies in MG and WASM are replaced (MG :156, WASM :225). The body is byte-identical. |
| A6 | One `isPositiveSafeInteger` | PASS | `src/utils/safe-integer.js:11`. Both copies deleted and imported (spread-cure:65, prepare-evidence:8); the dead export from prepare-evidence is dropped. Note: per the lead ruling, `isNonNegativeSafeInteger` stays local in spread-cure:130. The design's B-section had proposed moving it too, so this is a narrowing by ruling. |
| B1 | Partition path | PASS | `isRaftOpeningFailure` sits in the constructor catch (`partition-consensus-port-opening.js:32-36`). The held-at-open check (raft-init-base:655-660) and the campaign refusal (:601) both go through `refusePartitionConsensusStartup`. Old shape: {partition code, phase, consensus=answer}. New shape: {shared code, domain=partition, identity {partitionId, replicaId}, consensus=answer??null}. identity.groupId equals the request's GROUP_ID (raft-init-base:439). `service.replicaId` is set at core-base:91. |
| B2 | Message-group path | PASS | Constructor catch at :147-154, held check at :155-157, lone campaign at :176. Old shape: {MG code, groupId, replicaId, phase, consensus}. New shape: the same identity plus domain, without phase. groupId equals the request GROUP_ID (:86). |
| B3 | WASM path | PASS (gains a code, per R07) | Constructor catch at :216-223, held check at :224-226. Old shape: {no code, serviceDefinitionId, replicaId, consensus}. New shape: the shared code, domain=wasm_service, identity {groupId: wasmServiceConsensusGroupId, replicaId}. The request (:158) and the refusal now share that single helper. |
| B4 | No src reader matches message text | PASS | "cannot initialize: its" and "refused it in phase" appear only in the owner, at :85-86. Test text checks (committed-statement-outcome: `includes(unknownReason)`/`'BOGUS'`; unreadable-durable-record: `includes(phase)`) still hold, because the generalised message keeps phase, outcome, reason and detail. |
| B5 | Observable changes (a)(b)(c) | CONFIRMED, plus one unclaimed change (F2) | (a) `message-group-create-activation.js:35-56` forwards `error.code`, and no reader matches either the old or the new value. (b) `wasm-service-lifecycle.js:386` `cause.outcome ?? cause.code ?? CONSENSUS_START_REFUSED`: the refusal has no top-level `outcome`, so the start diagnostic is now the typed code. That fits the file's own rule at :383-384 ("A contract refusal's typed outcome is its code"), and nothing reads `CONSENSUS_START_REFUSED` (only :61 and :386). (c) Bound creation: `continueRetainedCreation` catch → `instanceFailure(error)`, which keeps only `ServiceInstanceContractError.outcome` (`service-instance-contract.js:107-108`), so the code is dropped. In addition, start errors are caught and settled by `refuseStart` at wasm-service-lifecycle.js:378-388, never rethrown. |
| B6 | O4 consumer | PASS | `node-joining-publication-activation.js:28-31`. durable-rejoin-record-refusal: 5/5 at head. The new foreign-domain negative is load-bearing: when I mutated the predicate to code-only (dropping the domain), subtest 4 went red (`vcir/mutant-o4.log`: pass 4, fail 1). |
| B7 | WASM groupId choice | PASS: a legitimate two-case shape, not an R03 fallback | `consensusCreation` is explicitly `options.consensusCreation ?? null` (`wasm-creation-opening.js:376`), and the replica branches on `=== null` throughout (replica-lifecycle:183, lifecycle:355/399/457/478, consensus-port:130). A non-null creation's `identity.groupId` is always computed by the identity owner: `runtime-service-replica-identity.js:78-87` derives it as a digest of serviceDefinitionId and incarnation, so it differs from serviceDefinitionId. The expression already existed in the request (since 8200dd452); the change single-sources it. Optional hardening is in F3. |
| C | Three remaining try/catch copies | CONFIRMED (report only) | See F1. |
| C' | The two proposal-refusal factories are different logic | CONFIRMED | `message-group-proposal-routing.js:97-110` builds a dynamic message plus `reason`, `retryAfterMs` and `retryable`. `wasm-service-committed-command-codec.js:101-106` builds a static message plus `reason`. Both are proposal-time refusals, not startup refusals. They are a separate one-version candidate between themselves (WASM lacks the retryable/retryAfterMs vocabulary). |
| D | Baseline re-key | PASS | `git diff` touches exactly one entry: filePath unchanged, `functionName` initialize → initializeUnserialized, `line` 544 → 580, the line numbers inside the reason text 544/337 → 580/452, and the same `kind` (`mixed_cache_and_sql_decision`) and ruleReference. The entry count is 806 at both commits. The rename is in 1952cd4b2 (`async initialize()` → `initialize()` wrapper plus `async initializeUnserialized()`), which is an ancestor of the base. Full checker: base reports 29 violations, including `partition-service-raft-init-base.js: 1` (the stale entry); head reports 28 with that file gone. The remaining 28 are repo-wide inherited reds, not touched files. |
| E1 | 21 owning files, 388 → 390 leaves, same reds | PASS | Base: top-level pass 335 / fail 6, 388 `ok` leaves. Head: 337 / 6, 390 leaves. The not-ok sets are identical, differing only in the fast-check seed/path text. Same reds: runtime-opening-refusal 21/26/27, startup-cleanup 13, spread-cure-row 1, dtx-coordinator property 1 (fast-check) and 6 (Property 17). The +2 are the two new owner tests in raft-opening-cleanup-error (1 → 3). |
| E2 | eslint / node --check on 28 files | PASS | Both clean. |
| E3 | `test:unused:ratchet` 1433 | PASS (the gate is red at both commits) | Head: "1433 exceed the current baseline of 1416". Base: 1436. That is −3, as claimed; the gate was already red on this lineage before the change. |
| E4 | `test:duplication` | PASS | The [test] and [src+scripts] lines are identical at base and head, and both have pre-existing tighten hints, so no tighten is owed by this change. |
| E5 | `test:cycles` | PASS | 0/0. |
| E6 | Metadata zero drift | PASS | `audit:shards` reports all current. `npm run test:metadata:refresh` at head leaves an empty `git status`, and its snapshotDigest f71ecc… equals the committed impact-graph seal. |
| E7 | raft-rs audits | PASS | `scripts/checks/raft-rs-operation-boundary-audit.js` and `raft-rs-lifecycle-retirement-census.js` exit 0. `no-legacy-consensus-reference-ratchet` reports 0/0. `active-legacy-consensus-reference-audit` exits 1 at both commits with identical output (689 doc findings), so it is pre-existing. |
| E8 | Hook staged checks | PASS | I replayed `.githooks/pre-commit` on the commit's exact staged diff (soft reset to base): exit 0. Decision-boundary: 0 new, 4 inherited matched. 0 hot-path, literal, ambient or silent-catch findings. The scoped complexity output lists 4 violations, all pre-existing functions, and the hook does not fail on them. See the limits for the inventory regeneration. |
| F | Two lab "environment" reds | CONFIRMED as known lab flakes | `lab-red.txt` lists both. `base-cls.txt` has both `ok` in the base corpus. The cir paired TAPs show both green 2× at base and 2× at head (20/20 and 8/8). My own local run at head is green too (20/20, 8/8). The lab failure modes match records from another unit (`solve/quests/retained-seed-original-handoff/evidence/VERIFY-mg-c1-implementation-r1-2026-10-24.md:391-396`): W-B6-3 "release owner revalidates the healed leader" was red on lab run 2 as a flake, and cdc subtest 5/6 hit "test timed out after 2000ms", which takes about 0.8 s locally versus about 2.04 s on the lab. The predicate touched by this change on the W-B6-3 path (`isHeldByHostFailure` via release-recovery) is byte-identical after the move. |

## Findings (non-blocking, for the lead)

- **F1 (C, one-version, report only).** The constructor classification is still written three times: `try { create } catch (e) { if (!isRaftOpeningFailure(e)) throw e / pass through; throw <domain>Refusal(e.consensus) }`. Locations: partition `:31-37`, MG `:147-154`, WASM `:216-223`. The held-at-open check is also written twice (MG `:155-157`, WASM `:224-226`) beside the partition's `refuseConsensusHeldAtOpen` (`raft-init-base:655-661`). The three `<domain>ConsensusInitRefusal` wrappers (partition `:16-21`, MG `:42-46`, WASM `:109-114`) are 5-line identity adapters.
  - Proposed unification: one owner helper in `raft-operation-port.js`, for example `consensusOpeningFailure(error, {domain, identity})`, that returns the typed refusal for an opening failure or else the original error.
    - Partition would then call `cleanupRefusedPartitionStartup(service, consensusOpeningFailure(...))`; MG and WASM would `throw consensusOpeningFailure(...)`.
    - An optional `refusalIfHeldAtOpen(status, refusal)` would serve all three held checks.
  - Cleanup must stay per-lifecycle, as the owner module's own rule at `raft-operation-port.js:124-126` requires.
  - Estimate: src about +12/−20 over 4 files, plus 1 owner test case. Low risk, because the inputs and outputs are already unified. The partition differs only in passing a non-opening error into its own cleanup rather than rethrowing it, and the helper's "return the original" shape covers that.
- **F2 (unclaimed observable change).** `OPENING_ERROR_METADATA` (`raft-operation-port.js:9-11`) was narrowed from {code, phase, consensus, partitionId, groupId, replicaId, serviceDefinitionId} to {code, domain, identity, consensus}. The narrowing is prescribed by design B3. It applies to every primary passed to `withRaftOpeningCleanupFailure`, not only refusals, for example:
  - `replicaRetiredError` (`wasm-service-replica-lifecycle.js:73-79`, which carries `replicaId`) via `releaseFailedOpen`/`joinFailure`;
  - the primaries in `replica-runtime-cleanup-custody.js:89` and `message-group-transport-handler.js:104`.

  The combined AggregateError no longer carries a top-level `replicaId`, `phase` or `partitionId` from those primaries, but `cause` still holds them. The census (my greps of `error|err|cause|failure|primary|refusal|startupFailure|combined|refused` . identity/phase fields) found no reader. It should still be listed as claim (d) in the attempt record.
- **F3 (optional hardening, R07).** `wasmServiceConsensusGroupId` (`wasm-service-consensus-port.js:103-105`) could branch explicitly: `replica.consensusCreation === null ? replica.serviceDefinitionId : replica.consensusCreation.identity.groupId`. That would match the file's own `=== null` idiom (:130) and make sure a malformed non-null creation can never silently fall back. Today the identity owner guarantees a groupId, so this is not a defect.
- **F4 (test-strength note).** `runtime-opening-refusal.integration.test.js:481` asserts that the cleanup AggregateError is a partition refusal (code and domain) and checks `consensus`, but not `identity`. Identity propagation through the aggregate is pinned only at the unit level (`raft-opening-cleanup-error.test.js` test 3, `result.identity === primary.identity`). That is adequate, but the native fixture (`startup-cleanup-native-fixture.js:137-139`) is the only integration-level identity pin, and it exercises only the WASM no-creation branch (groupId = serviceDefinitionId). No integration test pins identity.groupId for a creation-bound WASM replica.
- **F5 (guideline note).** test/guidelines/fixtures.md "System Guideline Conformance Gate" step 4 says not to land a test change that leaves a known duplicate-logic violation in the tested path. F1 is exactly such a violation, and the lead's ruling defers it. The deferral should be recorded explicitly (R16/R17) so the gate's exception is on file.

## What I ran (logs under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/vcir/`)

- Thermal gate (`scripts/checks/wait-for-thermal-headroom.js`) before each heavy batch. The package was at about 50 °C, with one batch at a time.
- The 21 owning files, run serially at head and at base: `head.txt`, `base.txt`, TAPs in `head-out/` and `base-out/`, not-ok diffs in `head-notok.txt` and `base-notok.txt`.
- O4 mutant: `mutant-o4.log`.
- eslint and `node --check` on the 28 files: clean, no output.
- `unused-head-full.log`, `unused-base-full.log`, `cycles-head.log`, `dup-head.log`, `dup-base.log`, `db-head.log`, `db-base.log`, `shards-head.log`, `metadata-refresh-head.log`.
- raft-rs audits: `raft-rs-operation-boundary-audit-head.log`, `raft-rs-lifecycle-retirement-census-head.log`, `no-legacy-consensus-reference-ratchet-head.log`, `active-legacy-consensus-reference-audit-head.log`, `active-legacy-base.log`.
- Hook replay: `hook-replay.log`; its inventory side effect is in `inventory-drift.diff`.
- Lab-red recheck at head: `partition-runtime-reconstruction-leadership.test.js.head.tap`, `cdc-group-propagation-foreground-boundary.test.js.head.tap`.

## Limits and unknowns

- **Hook replay side effect.** In my fresh worktree the import graph was absent, so the hook took its `--refresh` fallback. That rewrote `solve/changes/global-owner-debt-inventory/inventory.json` (`inventory-drift.diff`): analysis input digests and test-file entries, with no hunk naming a touched file. This is the known fresh-worktree prerequisite effect (no `test-output/analysis`), not drift attributable to this commit. `test:metadata:refresh`, the non-fallback path, produced zero diff. UNKNOWN: whether the implementer's own hook run took the same fallback. The commit does not include inventory.json.
- I did not run the full corpus or the lab myself. The lab classification rests on the implementer's `lab-red.txt`, `base-cls.txt` and paired TAPs, plus one local head run of each of the two files and the cross-record from VERIFY-mg-c1.
- (c) is traced through `continueRetainedCreation` and the WASM `refuseStart` catch. I did not exhaustively prove that no other path delivers a WASM init refusal to `runtime-service-bound-creation-route.js:283`. Either way the observable there would be `consensus_init_refused` instead of `UNKNOWN`, which is the R07-correct direction.
- The `# pass` counts are top-level; the 388/390 figures are `ok` lines including subtests. Both comparisons match the implementer's `before.txt` and `after.txt` exactly.

---

# Re-verification r2 (2026-10-25)

## Verdict: APPROVE, keep 4a1015b8a

There are no required changes. I found one edge difference that does not block (R2-N1).

## Identity

- **Subject.** `4a1015b8a95ef5a3ad9bb5e9b6277e97ddc7c5c0`, which is also `refs/wip/lab-cir-2` (checked with rev-parse).
- **Parent.** `e629dc0b2`, a merge whose parents are a8a05f7ca and d04ae12ee.
- **Scope.** I verified only `git diff e629dc0b2 4a1015b8a` plus a sanity check of the merge. That diff touches 6 src files, 1 test file and the impact-graph seal.
- **Worktrees.** I used detached scratch worktrees at `.../scratchpad/vcir2/{head,base}` and removed both afterwards. The lane worktree is clean at 4a1015b8a.
- **No repository edits.** I made two temporary mutations, each in a scratch worktree and reverted immediately.

## Per-item table

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | RC-1: comment placement | PASS | At 4a1015b8a, `raft-operation-port-constants.js:37-44` holds the refusal comment directly above `RAFT_CONSENSUS_STARTUP_OUTCOME`. Lines 46-49 hold `RAFT_OPERATION`'s comment directly above `const RAFT_OPERATION`. |
| 2a | F1: owner helpers | PASS | `consensusOpeningFailure` is at `raft-operation-port.js:133-137` and returns either the refusal or the original error. `assertConsensusNotHeldAtOpen` is at :148-152. In src, the only call to `isRaftOpeningFailure(` is the owner's (:134). Calls to `isHeldByHostFailure(` are at :149 (the owner's at-open check) plus four running-group checks: hold-log :59/:75, release-recovery :67, write-kernel :357. That matches the claim exactly. Each port now builds one opening value: `partitionConsensusOpening`, `messageGroupConsensusOpening`, `wasmServiceConsensusOpening`. |
| 2b | Per-port old→new behaviour | PASS (see R2-N1) | See "Per-port equivalence" below. |
| 2c | Attack: `readStatus()` throws | No change in behaviour | See "Per-port equivalence" below. |
| 3 | F3: WASM group id | PASS (equivalent on every reachable state) | `consensusCreation` is assigned only at `wasm-creation-opening.js:376` (`options.consensusCreation ?? null`), so it is either null or a captured creation. `captureWasmCreation` (:204-215) always attaches `identity` from `runtimeServiceConsensusIdentity`, which always computes a string `groupId`. The new explicit branch differs only on an unreachable malformed creation: there it now throws a TypeError where the old code silently fell back, which is the R07-correct direction. |
| 4 | Owner test | PASS | Test leaf `ok 3 - consensus opening: an opening failure is the domain refusal, anything else stays itself`. For each of the three domains it checks: CORE_REFUSED, CORE_FATAL and HOST_FAILURE each become the domain refusal, carrying the identity and the exact answer. An unrelated throw is returned unchanged, and so is an error tagged CORE_OK. A held status throws a refusal carrying the exact status and the groupId. CORE_OK, and HOST_FAILURE with `recoveryRequired:false`, both return undefined. |
| 5a | Merge: net delta | PASS | Compared hunk by hunk, `git diff d04ae12ee e629dc0b2` equals `git diff 9b78690a7 a8a05f7ca` with three exceptions. First, the de-exports the lineage had already composed (`consensusInitRefusedError` from the partition export, and `isPositiveSafeInteger` from prepare-evidence) are absent because they already landed. Second, the seal and observation digests differ, which is expected for derived files. Third, the decision-boundary baseline hunk is identical: the lineage's own edit to that file (the transport entry at :7208) does not overlap it, and the file still has 806 entries. |
| 5b | `TRANSACTION_RELEASE_TERMINAL_STATUS` | PASS | It is defined once, at `distributed-transaction-release-census.js:14`. The r2 delta has 0 lines mentioning it. |
| 5c | One `consensusInitRefusedError` | PASS | There is one definition, `raft-operation-port.js:103`, at 4a1015b8a. |
| 5d | Inventory not regenerated | Acceptable | `git diff d04ae12ee e629dc0b2 -- solve` is empty, so the lineage's inventory was kept. `global-owner-debt-inventory/inventory.json` is derived material (R05). No gate checks it: the generator has no `--check` mode, and neither `audit:shards` nor `test:metadata:refresh` reads it. The hook's `REGEN_INVENTORIES` step rewrites and stages it on the next source commit (`.githooks/pre-commit:157-172`). Committing a copy regenerated in a different environment would have added noise; r1's replay showed an environment-dependent rewrite on the `--refresh` fallback. UNKNOWN: whether the hook regenerated anything at the 4a1015b8a commit. That commit carries only the seal. |
| 6a | The 21 owning files | PASS | Base e629dc0b2: 337 top-level passes, 6 failures, 390 `ok` leaves. Head 4a1015b8a: 338 passes, 6 failures, 391 leaves. The not-ok sets are identical apart from fast-check seeds: runtime-opening-refusal 21/26/27, startup-cleanup 13, spread-cure-row 1, and dtx-coordinator property 1 and 6. The extra leaf is owner test 3. Logs: `vcir2/head.txt`, `vcir2/base.txt`, `vcir2/{head,base}-out/`, `vcir2/{head,base}-notok.txt`. |
| 6b | eslint and `node --check` on the 7 files | PASS | Both clean. |
| 6c | Unused-export ratchet | PASS | "Unused-export ratchet OK: 1413/1416", identical at head and base (`vcir2/unused-{head,base}.log`). The two new owner exports and `refusePartitionConsensusHeldAtOpen` all have src consumers. |
| 6d | Cycles | PASS | 0/0. |
| 6e | Duplication | PASS | Identical at head and base: src+scripts 46/46 and 1439/1439; test 689/689 and 26148/26148. There are no tighten hints (`vcir2/dup-{head,base}.log`). |
| 6f | Metadata drift | PASS, zero drift | `audit:shards` passes. `npm run test:metadata:refresh` at head leaves an empty `git status`, and its snapshotDigest `d4c14129…` equals the committed seal. |
| 6g | Scoped complexity, using the hook's form | PASS | The hook runs `node scripts/check-complexity.js --scoped "${CODE_JS_FILES[@]}" \|\| true` (`.githooks/pre-commit:121`, report-only). On the 6 src targets it reports 2 violations at both head and base, both inherited and both in `partition-service-raft-init-base.js`: `initializeUnserialized` (:305, complexity 31) and `applyRaftTimingConfig` (complexity 22; :691 at head, :695 at base, shifted by the 4 lines removed above it). There are no new violations (`vcir2/complexity-{head,base}.log`). |
| 6h | Staged guideline checks on the 7 files | PASS | Decision-boundary: 0 new, 1 inherited. Ambient-intrinsics: 0. Silent-catch: 0. Hot-path: 0 (`vcir2/staged-checks.log`). |

## Per-port equivalence (item 2b)

**Partition**
- **Constructor.** The old code used `isRaftOpeningFailure ? refusal : error` and passed the result into `cleanupRefusedPartitionStartup`. The new code passes `consensusOpeningFailure(error, opening)` into the same cleanup. The cleanup gets the same primary error in both cases.
- **Held at open.** The old code read the status in `refuseConsensusHeldAtOpen`, did nothing if the group was not held, and otherwise called `refusePartitionConsensusStartup` (refusal, then cleanup, then throw). The new code reads the status once, as the argument to `refusePartitionConsensusHeldAtOpen`. That function wraps only the assert in a try and, on a refusal, calls the same `cleanupRefusedPartitionStartup`. That cleanup always throws (`partition-consensus-port-opening.js:65-79`), so the catch never swallows an error.
- **Campaign.** It still goes through `refusePartitionConsensusStartup` (raft-init-base:601) and builds the same value.
- **Load-bearing proof.** With `refusePartitionConsensusHeldAtOpen` turned into a no-op, `partition-unreadable-durable-record` subtest 4 goes red ("F-ap: a follower restarted while its record table is missing is refused at init…"; `vcir2/mutant-held.log`, 5 passes, 1 failure). The path is exercised, and its release assertions (raft and db both null) are green at head.

**Message group and WASM**
- **Constructor.** The old code rethrew a non-opening error unchanged and threw the refusal for an opening failure. The new code throws `consensusOpeningFailure(...)`, which gives the same result in both cases.
- **Held at open.** The old code did one `readStatus()` after the try, then an inline check, then threw. The new code does one `readStatus()` after the try, as the first argument to `assertConsensusNotHeldAtOpen`. Arguments are evaluated left to right, and the opening-value builder is pure. Exception order is unchanged and there is a single status read.
- **Message-group campaign.** It builds the same refusal from the opening value plus the answer.

**Attack (item 2c): `readStatus()` throws.** In every version, old and new, `readStatus()` sits outside any try that classifies or cleans up errors. The MG and WASM status reads are after their try blocks. The partition status read happened in an un-guarded async method before, and now happens as a call argument before the helper's try. A throwing `readStatus` therefore propagates unclassified and without the opening cleanup, exactly as before. For MG and WASM, the caller's lifecycle releases resources (`releaseFailedOpen` and similar), also unchanged.

## Non-blocking note

- **R2-N1, an edge difference in the partition held-at-open path.** The new `catch (refusal)` (`partition-consensus-port-opening.js:47-51`) catches anything `assertConsensusNotHeldAtOpen` throws, not only the refusal.
  - The one other possible throw is from building the refusal's message: `JSON.stringify(detail)` at `raft-operation-port.js:83-87` would throw on a BigInt or circular `failure.detail`.
  - In that case the new code runs the cleanup with that TypeError as the primary error, and then throws it.
  - The old code threw the TypeError while evaluating the argument, before calling the cleanup, so it rejected with no cleanup.
  - The detail values are deep-frozen, JSON-shaped data from the runtime owner, so I believe this is unreachable. If it were reached, the new behaviour is the R11-safer one.
  - Not required. If you want byte-exact parity, build the refusal outside the try.

## Limits

- I did not run a lab or corpus run for r2. The r1 lab classification stands; r2 changes only refusal plumbing that is pinned by the 21 files.
- runtime-opening-refusal subtests 26 and 27 ("partition status/campaign refusal uses the same cleanup boundary") fail at both base and head on the precondition "the actual initializer must consume the controlled refusal". Those two integration tests are inherited reds and give no signal on the partition held and campaign paths. My mutation above stands in for them on the held path.
