# Composition report: integration/rs-raft-candidate-20261017 (closeout plan step 2)

Composer report. It is not a completion claim, a verification or a lab result. Nothing was pushed or forced, no hook was bypassed, and no lab host was touched.

- Worktree: `/mnt/data/peter/projects/.worktrees/compose-20261017`, branch `integration/rs-raft-candidate-20261017`, started from `c6006c745`. `node_modules`, `data/examples` and `data/partitions` are symlinked to the primary checkout.
- Committed HEAD: **`d5fdaa312`** (merges i and ii).
- **Merge iii is resolved and fully staged but NOT committed.** The pre-commit hook refuses it on three staged-file guideline checks. Every one of those reds is inherited from a parent (see the blocker section).
  - Index tree of the pure merge resolution: `319129d99ea29a52cfd75024d836d29f8da7c960`.
  - Index tree including steps 4-6: `0a3f5258b7e708464471599726fd5b1a9f14cf5e`.
  - Patches: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/merge3-staged.patch` (the resolution) and `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/post-merge-steps4-6.patch` (steps 4-6).
  - Prepared commit message: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/msg3.txt`.
- The primary checkout `/mnt/data/peter/projects/lagrange` was not touched: its index and working tree are unchanged, and only `git worktree add/remove` metadata changed. The two detached scratch worktrees I made (`compose-20261017-parent-lane` @ c6006c745 and `compose-20261017-parent-cand` @ 10c2f0610) are removed.

## BLOCKER (needs a lead/owner ruling): merge iii cannot be committed with hooks on

`git commit` of merge iii fails three staged-file checks in `.githooks/pre-commit`. All the cited lines exist at a parent; the composition adds none of them:

| Check | Composed hits | At c6006c745 (lane) | At 10c2f0610 (candidate) |
| --- | --- | --- | --- |
| literal guideline | `owner-claim.js:145 ' AND '` | same (`:152`, bfd5611e7 layout) | same (`:145`) |
| silent catch | `owner-claim.js:174 claimMessageGroupMembershipOwner`, `:236 settleMessageGroupMembershipNonAdmission` | same 2 | same 2 |
| decision boundaries | `raft-rs-runtime-owner.js:591 invalidateRuntimeGroups`, `:735 replaceRuntime`; `snapshot-install.js:567 requestSnapshotInstall` | same 3 | 0 |

The hook checks every file that differs from the first parent, so a merge commit cannot leave these files out.

The brief rules out every way through:
- Fixing the hits means fixing inherited reds, which the brief forbids.
- Bypassing the hook (`LAGRANGE_SKIP_PRECOMMIT` / `--no-verify`) is forbidden.
- Changing the baselines would raise them, which is forbidden.

So I stopped before the commit and did steps 4-7 on the staged tree. Options for the lead:
- (a) An owner-scoped repair of those 6 hits, as its own reviewed change, before or after the merge.
- (b) Explicit authority for a hook bypass on this one merge commit. The lane commits that carried these hits evidently went in that way.
- (c) Another route the owner names.

## Merge i: PR #73 `finalize/zero-liferaft-2026-10-02` @ 6df3ec5e1 -> commit 3817408e3

- Clean.
- Files: `.github/workflows/ci.yml`, `test/integration/service-install-lifecycle-cli-pgwire.integration.test.js`, `test/runtime/wasm-driver-contract-conformance.test.js`. The impact-graph seal was kept as ours by the merge driver.
- The hook regenerated the seal and `inventory.json` into the commit.
- The hook's owner-debt refresh printed "ratchet exceeded" for complexity and duplication; both are inherited, see the statics section.

## Merge ii: contract-first @ ad0200207 -> commit d5fdaa312

- Clean: 8 files under `solve/quests/cutover-transition-authority-review`.
- Its log went from 21 to 23 entries, with the old 21 kept as a byte prefix.
- Finding: **ad0200207 is already an ancestor of the candidate 10c2f0610** (the candidate reconciled it in merge 994cccb3c), so merge ii was redundant with merge iii.

## Merge iii: candidate @ 10c2f0610 (staged, uncommitted)

The analysis expected 9 conflicts; there were **10**. The tenth is `solve/quests/message-group-fresh-identity-membership/log.ndjson`, because the owner's 2026-10-17 decision entry was appended on the lane after the probe.

Before using any prepared resolution I checked its inputs:
- The m3 `.base/.ours/.theirs` files are byte-equal to `e7c89f4b5` / `c6006c745` / `10c2f0610`.
- None of the conflict files changed between 89e70949f (the analysis' lane tip) and c6006c745.
- For all 10 option-D files, 10c2f0610 equals 50a003b86 (the reviewed C2).
- For the 6 keep-theirs files, the lane bytes equal bfd5611e7, plus 406ceac1c for authorization and permit.

### Resolutions

| File | Resolution | Basis |
| --- | --- | --- |
| `src/raft/raft-rs-committed-membership-context.js`, `-read.js`, `raft-rs-peer-identity.js`, `raft-rs-peer-identity-constants.js` | THEIRS whole | The lane differs from theirs only by the 50a003b86->bfd5611e7 option-D delta. |
| `src/rebalancer/replica-operation-message-group-membership-authorization.js`, `-permit.js` | THEIRS whole | Dropped: the lane's unreviewed bfd5611e7 complexity splits (`selectedBranchMatches`/`decodedBranchSelectionRequest`/`observationIsCurrent`/`submitSelectedBranch`; `permit*IsValid`), the 406ceac1c deletions (17 exports) and the lane's comments that deny successor/promotion issuance. Consequence: the candidate's complexity violations in these functions return. They are inherited from the candidate and counted as such below. |
| `src/raft/raft-rs-operation-port.js`, `src/raft/raft-rs-runtime-owner.js` | COMBINED | See the proof below. |
| `test/shards/impact-contracts.json` | UNION | Prepared `impact-contracts.json.resolved-escaped`, re-checked by my own three-way JSON check: 70 contracts, 41 pairs, 0 keys changed by both sides, 0 extras, ours' order kept as a prefix, every value from its single changing side. Base `§` escapes kept (3 escaped, 0 literal). `npm run -s audit:impact-contracts`: PASS (70 contracts, 41 coupled pairs, sha256:1e1f3862...). |
| FreshMG `log.ndjson` | UNION | See the quest-log unions section. |
| Reverted to theirs (clean merges): `src/raft/raft-rs-application-transaction-owner.js` and `src/rebalancer/replica-operation-message-group-membership-owner-claim.js` | Applied | `grep -n promotionAdmission`: 0 hits in both. application-transaction-owner carried the option-D `committedMembershipApplication` parameter and third argument. owner-claim carried only the behaviour-neutral bfd5611e7 split, with no option-D names; I reverted it per the analysis because those are unreviewed bfd5611e7 bytes. Both now equal 10c2f0610 (= base). |

### Proof for the two combined files

I derived each combination independently, not from the prepared file:
- Three-way `git merge-file` with ours = lane file, base = bfd5611e7 version, theirs = 50a003b86 version, which reverses exactly the option-D delta.
- Result: 0 conflicts, and the output is **byte-identical** to the prepared `m3/*.resolved-optionA`.

Diff to theirs equals the lane's own changes:

| File | Result vs theirs | Lane's own (bfd5611e7 -> c6006c745) | Compared |
| --- | --- | --- | --- |
| operation-port | +32 / -22 | +32 / -22 | `diff -U0` changed-line sets IDENTICAL |
| runtime-owner | +418 / -167 | +418 / -167 | IDENTICAL |

Removed relative to ours:
- **operation-port (51 lines):**
  - the option-D codec imports and the `raftRsConfStateKey` import;
  - `sortedPeerIds`, `promotionAfter`, `retainedFoldedPromotionMatches`;
  - the `application` parameter and the PROMOTE branch, including the `PROMOTION_ADMISSION_CONFLICT` throw;
  - `readPromotionAdmission`.
- **runtime-owner (16 lines):**
  - the extra `CORE_OPERATION.CONF_STATE` "before" read;
  - `membershipBeforeConfState`;
  - the `committedMembershipApplication` property;
  - the `readPromotionAdmission` request mapping.

The lane work is kept: APPLIED_PROGRESS, opening history, publishing the membership owner after construction, `close()`/`ALREADY_CLOSED`, and the native-inbound work. Both files pass `node --check`, and every listed key module imports cleanly.

Residue scan of the 8 option-D files the lane did not copy byte-for-byte (lifecycle-owner, checkpoint-constants, checkpoint-store, install-constants, snapshot-install, plus port and runtime owner): 0 option-D-added lines remain that are absent from theirs.

### Option-D grep

`git grep -nE 'promotion_admission|promotionAdmission|PROMOTION_ADMISSION'`: **0 hits in src/, test/ and scripts/.** The remaining hits are historical records only:
- the closeout plan and analysis;
- the orphan-removal and FreshMG logs;
- 3 static-attribution logs under `seed-participant-release-applied-position-barrier/evidence`.

### Other clean merges worth knowing

- The candidate **closes `cutover-transition-authority-review`**: terminal "solved" 2026-10-11, with a preserved packet and independent approvals, and it retires 43 paths (the quest's docs and evidence, five `scripts/quest-evidence/cutover-*` runners and three workflows). These merge as deletions.
  - The C0 log goes from 23 to 39 entries; theirs is a superset with ours as a prefix.
  - The closeout plan's "C0 last stood REJECT" is therefore stale for the composed tree. The lead should restate C0 for step 3.
- Both-touched src files that merged cleanly were not semantically reviewed by me: `message-group-consensus-port.js`, `message-group-service-state.js`, `replica-create-admission-owner.js`, `raft-rs-status-observation.js`, `snapshot-install.js`. Their direct consumers are in lab list C.

## Quest-log unions

| Log | Before | After | Union rule check |
| --- | --- | --- | --- |
| `solve/quests/message-group-fresh-identity-membership/log.ndjson` | base 143; ours 144 (+1, the 2026-10-17 decision); theirs 175 (+32, 2026-10-10..11) | 176 | Base kept as a byte prefix in recorded order; appended entries merged by timestamp (theirs' 32, then ours' 1); 0 lines dropped from either side. |
| `cutover-transition-authority-review` | ours 23 | theirs 39 (clean) | ours is a prefix |

- I did not sort the base itself, because the base is not timestamp-ordered (line 23). Sorting it would have reordered recorded history, so the timestamp order applies to the appended entries only.
- Result: theirs is a byte prefix of the union and ours' single entry is last, which satisfies the merge rule of `check-quest-log-append-only.js` (order-preserving subsequence of every parent; new entries last).
- Until merge iii is committed, `audit:quest-log-append-only` reports `message-group-fresh-identity-membership/log.ndjson at working tree: rewritten`. This is expected: the working-tree edge is judged against HEAD alone with the single-parent prefix rule. It clears once the merge commit exists.
- No `solve/oracle/*` or `evidence/` file conflicted.

## Step 4: terminal entry for message-group-c2-orphan-removal-alpha

- Before the entry, `audit:closed-quest-shape` was red on 22 paths of `seed-participant-release-native-startup-census/evidence/*`. They are identical at c6006c745 (lane-inherited; the candidate is clean) and are recorded only.
- I ran `node scripts/solve.js note --id message-group-c2-orphan-removal-alpha --superseded "..." --by message-group-fresh-identity-membership`.
  - The entry cites the decision entries at 2026-10-17T12:13:41.264Z (this log) and 12:13:41.455Z (the FreshMG log).
  - Appended at ts 2026-10-17T13:01:23.431Z, status `superseded`, `supersededBy` `message-group-fresh-identity-membership`.
- The audit then named 95 paths in that quest dir as "not required by the sealed terminal claim". I `git rm`'d exactly those 95 and nothing else. The quest now holds `quest.json`, `log.ndjson` and `evidence/receipt.json`.
- The bytes are preserved at c6006c745 (on `origin/work/rs-raft-event-reconciliation-20261016`).
- The audit is now clean for this quest; the only remaining offences are the 22 inherited ones above.
- **New red caused by that deletion:** `audit:documentation-current` reports 2 violations. `solve/quests/participant-release-held-recovery-continuation/evidence/integrated-composition-content-review-v1.md:17` and `...-evidence-review-v2.md:21` reference `message-group-c2-orphan-removal-alpha/evidence/independent-implementation-review.md`; the reference is hash-bound (sha256 0429ae58...). I did not edit another quest's evidence. This is an owner interaction between closed-quest-shape and documentation-current (see open findings). Totals: composed 272 vs lane 288 (lane already red), candidate 0.

## Step 6: expected reds

1. `test/rebalancer/message-group-membership-branch-authorization.test.js`: **composition-caused**. It was red at subtest 69 "O1 a non-canonical learner stamp encoding is refused before any branch CAS" (`notStrictEqual` at :1137) and is green at both parents (lane 90 assertions, candidate 115). I took theirs' two fixture lines (the raw `Object.freeze` fixture and `assert.ok(committedStampOfAnswer(learnerStamp))`), which makes the file equal 10c2f0610. Result: 115/115 green.
2. `test/raft/raft-rs-backend/committed-membership-census.test.js`: **NOT repaired, inherited from both parents.**
   - It is red at the lane: T7 callers gain recipient, participant-transaction-pause and wasm-creation-genesis; stamp origins gain authorization.js and wasm-creation-genesis; the carrier set gains +partition-reopen-options / -snapshot-catchup; V1a gains +replica-handler-participant-release.
   - It is red at the candidate: T7 gains recipient; stamp origins gain authorization.js.
   - The composed failure set equals the union of the two parents' sets exactly; the composition adds nothing.
   - The brief asked me to justify the two lane readers, but that is an owner judgement on R01 (is each reader legitimate?), and the brief also says an inherited red is recorded, not fixed. I left it for the owner.

## Statics on the composed staged tree, each red classified against both parents

| Check | Result | Classification |
| --- | --- | --- |
| `npm run -s test:metadata:refresh` | ok (2411 tests, 22 subsystems) | seal and inventory regenerated and staged |
| `npm run -s audit:shards` | OK | |
| `node scripts/check-fast-static.js --base c6006c745` | ok, 12.5 s (110 changed paths, 83 JS; deps, shards, scoped metrics, eslint, 10 audits) | |
| `npm run -s audit:impact-contracts` | PASS 70/41 | |
| `npm run -s test:unused` (knip) | RED: 2 unused files, `test/raft/raft-rs-backend/runtime-load-recovery-child.js` and `runtime-replacement-review-child.js` | lane-inherited (lane has the same 2 plus 4 unlisted binaries; the candidate is clean) |
| `test:unused:ratchet` | RED 1447 > 1415 | 0 composition-caused. Every composed unused export is unused at a parent: 40 are lane-only (cdc-delivery-outcome 9, cdc-source-scope-evidence 4, participant-release-disposition model 4, ...; full list in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/unused-lane-inherited-40.txt`). Lane 1456 > 1416 (red); candidate 1415/1415. |
| `npm run -s test:duplication` | src+scripts OK 47/1462; test RED 696 / 26393 > 696 / 26345 | 0 composition-caused: every composed clone pair equals the lane's or the candidate's. Lane 698/26458 > 697/26369 (red). |
| `test:complexity` | RED 1798 > 1755 | 0 composition-caused (set comparison by file and function); lane 1793, candidate 1759 (both red) |
| `audit:guidelines` | RED: literals 99, decision-boundaries 40, silent-catch 4 new | 0 composition-caused by identity count; lane 320/40/4, candidate 43/1/3 |
| `audit:file-size`, `test:unused:prod`, `test:deps`, no-legacy-*, steering-diet, rule-set, doc-audience, doc-ascii, roadmap-authority, steering:check, runtime-grammar, current-capabilities, cli-docs, closure-ledger, service-portability-claims, metadata-gateway | ok | |
| `audit:operation-progress-authority` | RED (`test/scripts/quest-evidence-harness-expected-tests.test.js: WITNESS_SOURCE`) | identical at both parents |
| `audit:no-kiro` | RED (3 refs in a seed-participant-release-applied-position-barrier evidence baseline JSON) | lane-inherited |
| `lint:scripts` | RED (53) | identical lines at the parents |
| `lint` | RED (85) | every line present at the lane |
| `audit:documentation-current` | RED 272 | 270 lane-inherited, **2 composition-caused** (step 4 deletion, see above) |
| `audit:closed-quest-shape` | RED 22 | lane-inherited |
| `audit:quest-log-append-only` | RED (working-tree edge) | artifact of the uncommitted merge, see the quest-log section |

No baseline was raised. No checker printed a tighten hint I could act on: every ratchet is over its baseline because of parent debt, not under it.

## Step 7: local single-file runs

All runs were `npm run test:file -- <file>`, gated on `scripts/checks/wait-for-thermal-headroom.js`, one at a time. The 25 unit files of analysis section 4 ran locally; integration and bootstrap files go to the lab.

Green (19):

| File | Assertions |
| --- | --- |
| peer-identity | 1 |
| participation-gate | 5 |
| stampless-opening-refusal | 2 |
| message-group-membership-semantic-port | 15 |
| snapshot-lifecycle-staging | 21 |
| inbound-drain-owned-timer | 6 |
| runtime-captured-inbound-service-native | 4 |
| message-group-create-admission-recovery | 35 |
| message-group-service-handler-membership | 5 |
| replica-create-admission-owner | 30 |
| message-group-fresh-learner-snapshot | 1 |
| branch-authorization (after the fix) | 115 |
| spread-cure-transition-authorization-row | 1 |
| replica-operation-membership-epoch-binding | 110 |
| message-group-fresh-learner-promotion | 7 |
| learner-promotion-progress-proof-contract | 76 |
| partition-service-learner-promotion | 47 |
| partition-service-learner-promotion-wake | 41 |
| dt6-learner-promotion-progress-proof | 29 |

The two native runtime witnesses re-run because the runtime owner lost its extra core read, inbound-drain-owned-timer and runtime-captured-inbound-service-native, are both green.

Red, with first failures and parent classification:

| File | First failure (composed) | Lane | Candidate | Class |
| --- | --- | --- | --- | --- |
| `test/raft/raft-rs-backend/evidence-o1-static.test.js` | subtest 3: RUNTIME_REASON classification lacks `REPLACEMENT_IN_PROGRESS` | red 1, 2, 3 (subtest 3 identical) | green | lane-inherited (the composition removes subtests 1 and 2) |
| `test/raft/raft-rs-backend/committed-membership-census.test.js` | T7 (see step 6) | red | red | inherited from both |
| `test/raft/raft-rs-backend/operation-port-boundary.test.js` | subtest 2: `lifecycle-write-outside-owner retireReplica src/runtime/wasm-component-driver-consensus.js` | identical | red, different hit (snapshot-install `lifecycle-owner-import-bypass`) | lane-inherited |
| `test/node/replica-create-admission-recovery.test.js` | whole suite `cancelledByParent` ("Promise resolution is still pending but the event loop has already resolved"); all 10 subtests | same mode, 9 subtests | green (11) | lane-inherited (the candidate's added case is swept into the same cancellation) |
| `test/message-group/message-group-native-custody-handoff.test.js` | "exact actual recipient proposal is retained 0 !== 1" at :146 | identical | absent | lane-inherited |
| `test/partition/participant-release-native-application-order.test.js` | run 1: `test timed out after 30000ms` (normal runtime about 1.9 s) | 0 hangs in 6 runs | absent | **UNCLASSIFIED intermittent**. Composed hung in 1 of 8 runs (7 later runs green). Not attributable from these counts; first failure kept at `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/local/test_partition_participant-release-native-application-order.test.js.log`. Needs a lab repeat batch on composed versus lane. |

All local logs are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/local/`.

## Lab selection (for the lead; not run)

The lists are files:
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/reports/compose-20261017-lab-list-A.txt` (14 files): FreshMG and composition integration/bootstrap. Section-4 integration files: successor-ordering, promotion, promotion-recording-guards, promotion-selection-guards, join, learner-runtime-authorization, membership-claim-cache, learner-process-loss, learner-recipient, learner-discovery, plus `test/node/replica-runtime-cleanup-custody.integration.test.js`, the two bootstrap files, and `test/integration/leader-metadata-validation.integration.test.js` (changed by the candidate).
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/reports/compose-20261017-lab-list-B.txt` (33 files): the lane's retained acceptance. The union of the stage-1 (30) and stage-1b (17) request.json selections from `wasm-creation-genesis/evidence/serving-publication-20261017/lab-stage1{,b}`; it includes the retained 21. Three files are known lane reds there (durable-commit-replica-kinds, wasm-service-group-on-raft-rs, wasm-service-replica).
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/reports/compose-20261017-lab-list-C.txt` (61 files):
  - direct test consumers of the combined and both-touched owners (operation port, runtime owner, application-transaction owner, owner-claim, snapshot-install, the replica-create-admission owner, message-group consensus port and service state);
  - the candidate-changed tests not run locally;
  - the 25 section-4 units, for an exact-head receipt.
- Plus a repeat batch, for example 10 runs each on the composed head and on the lane, of `test/partition/participant-release-native-application-order.test.js`.

The candidate's own 22-file C2 "declared selection" is not recorded in-tree (only its digest 1454043e... in the FreshMG log). The candidate-changed test files in list C approximate it.

## Open findings (where option A or the brief could not be followed as written)

1. **Merge iii is uncommitted** (see BLOCKER): the hook refuses on 6 inherited guideline hits; this needs a ruling. When it is committed, the hook will regenerate the inventory and seal again; steps 4-6 can go in the same commit or, preferably, in a follow-up commit (patches are split for that).
2. **Census not repaired.** It is inherited from both parents, and the composition adds nothing. Justifying the lane readers (wasm-creation-genesis, participant-transaction-pause, the recipient, authorization.js as a stamp origin, partition-reopen-options as a carrier, replica-handler-participant-release as a V1a site) is an owner decision.
3. **documentation-current +2:** created by the deletions closed-quest-shape demanded. Two owners conflict here: closed-quest-shape requires the deletion, and documentation-current requires referenced paths to exist. One option is the C0 pattern: a preservation packet plus pointer update, done by the owner of `participant-release-held-recovery-continuation`.
4. **The owner-claim revert had no option-D names** (grep 0). I reverted it because it was unreviewed bfd5611e7 bytes, per the analysis. That revert, and taking theirs for authorization/permit, restore candidate-level complexity in those files; the debt is inherited from the candidate.
5. **The C0 quest is closed by the candidate** (terminal "solved", 2026-10-11), and contract-first is already inside the candidate. The closeout plan's step-3 line for C0 needs restating against the composed tree.
6. **Unclassified intermittent hang** in `participant-release-native-application-order` (1 in 8 composed, 0 in 6 lane). It needs the lab batch before it can be classified.
7. **R01 risk carried from the analysis, not checked:** the candidate's learner CREATE path creates and tears down a MessageGroupService outside the lane's `replica-host-cleanup-custody` owner list. This needs an owner check.
8. Inherited debt recorded and not fixed:
   - unused exports: 40 lane-only;
   - test duplication: lane clone pairs;
   - complexity;
   - literal / decision-boundary / silent-catch;
   - knip unused files (2 lane child fixtures);
   - closed-quest-shape (22 paths of seed-participant-release-native-startup-census);
   - no-kiro, lint, lint:scripts, operation-progress-authority;
   - local reds: evidence-o1-static subtest 3, operation-port-boundary, replica-create-admission-recovery, native-custody-handoff.

Status: the tree is composed in the index, the statics are measured and classified, and the lab lists are written. Merge iii is not committed and nothing has been verified independently or on the lab.

---

# Update 2026-10-17: lead ruling (a) applied, merge iii committed

**Merge iii is committed with hooks enabled: `99d145ace64c5725a9777fe136a3dab8d8bedb84`** (parents d5fdaa312 and 10c2f0610; 239 files). There was no bypass, no baseline file changed and nothing was pushed. Message: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/msg3-final.txt` (the prepared message plus a post-resolution paragraph and the guideline-repair paragraph). The BLOCKER and open finding 1 above are resolved by this.

## Guideline repairs at the owner (inherited at c6006c745 and 10c2f0610)

All are behaviour-preserving, use the modules' existing vocabulary and leave control flow unchanged:

| Site | Repair |
| --- | --- |
| `owner-claim.js:145` | The `' AND '` literal becomes the module constant `ROW_PREDICATE_CONJUNCTION`. I grepped first: owner-claim imports no SQL separator constant. Such constants exist only in `replica-operation-progress.js` (not exported) and `partition-service-constants.js`. |
| `owner-claim.js:174` (`claimMessageGroupMembershipOwner`) and `:236` (`settleMessageGroupMembershipNonAdmission`) | The silent catches become `catch (error)` and record the error through the existing `noteUncertainMembershipWrite` recorder (`REBALANCE_COORDINATOR_LOG_MSG.MEMBERSHIP_WRITE_UNCERTAIN`). The exact read-back still decides the outcome. |
| `raft-rs-runtime-owner.js:591` (`invalidateRuntimeGroups`) | Named empty state `NO_STATUS_OBSERVATION`, also used at the group's initial value (:1897) and the `readStatusObserved` comparison (:1427). |
| `raft-rs-runtime-owner.js:735` (`replaceRuntime`) | Named empty state `NO_RUNTIME_REPLACEMENT_FAILURE`, also used at the recovery record's initial value (:731) and the per-group comparison (:761). |
| `snapshot-install.js:567` (`requestSnapshotInstall`) | Named empty state `NO_RECEIVER_LIFECYCLE_INSPECTION`. Only the non-raft-rs branch holds it, and that branch never reads it. |

Two points about how the repairs were done:
- **Recorder moved, scope widened by one file.** The authorization module imports owner-claim, so owner-claim importing the recorder from authorization would create a cycle. I moved the recorder (same body) from authorization into owner-claim; authorization now imports and re-exports it, so the successor module's import is unchanged and there is still one recorder. This touches `replica-operation-message-group-membership-authorization.js`, one of the keep-theirs files (-7 lines, +1 import name, the comment pointed to the new owner, and its now-unused `REBALANCE_COORDINATOR_LOG_MSG` import dropped). The verifier should know this file now differs from 10c2f0610.
- **Named nulls, not objects.** The three named empty states keep the existing `null` value, following the repository's `NO_* = null` convention (for example `application-database.js` `NO_RETRY_AFTER_MS`, `operation-workflow-owner-ports.js`). Every reader, including `raft-rs-runtime-faults.js` `statusObservation?.confState` and the exposed `failure` fields in recovery outcomes, behaves byte-for-byte the same. This differs from D8's frozen-object pattern: an object would change observable outcome shapes (`failure: null` in runtime recovery outcomes).

Checks on the four touched files:

| Check | Result |
| --- | --- |
| `check-guideline-literals` | 0 new (4 inherited baseline matches) |
| `check-guideline-silent-catch` | 0 |
| `check-guideline-decision-boundaries --json` | 0 new (3 inherited baseline matches) |
| `check-guideline-ambient-intrinsics` | 0 |
| eslint | clean |
| pre-commit hook | passed every check |

## Owning witnesses (local, one file at a time, thermal-gated)

I ran 27 files. 24 are green: branch-authorization (115), create-admission-recovery (35), epoch-binding (110), spread-cure (1), participant-release-native-application-order (1), partition-runtime-reconstruction-leadership (20), durable-commit-sync (4), inbound-drain-owned-timer (6), operation-port-lifecycle (5), operation-port-provenance (1), restart-from-durable-record (4), runtime-captured-inbound-service-native (4), runtime-wait-bound-spent (4), runtime-replacement-review.integration (8), runtime-load-recovery.integration (4), fresh-learner-snapshot (1), replica-image-checkpoint-transfer (64), and the snapshot set: boundary-observability (25), cadence (16), catchup-end-to-end (7), install-restart-states (35), install-transition (36), lifecycle-staging (21), recorded-gaps (19).

Three are red. None is caused by the repair: each was checked in the same scratch-worktree setup at the pre-repair composed tree 0a3f5258b, at c6006c745 and at 10c2f0610.

| File | Repaired | Pre-repair | Lane | Candidate | Class |
| --- | --- | --- | --- | --- | --- |
| `test/partition/partition-write-leadership-transfer-committed.test.js` | 2/2 fail, "setup: the group serves a write false !== true" | identical | identical | green | lane-inherited |
| `test/partition/settled-replay-preserves-result.test.js` | 6/6 fail, "setup: the lone leader serves a write false !== true" | identical | identical | green | lane-inherited |
| `test/raft/raft-rs-backend/operation-port-boundary.test.js` | subtest 2 `lifecycle-write-outside-owner retireReplica` | as before | identical | red, different hit | lane-inherited (already in the table above) |

The scratch worktrees are removed. Logs: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/repair/`. The two partition files belong in lab list C.

## Post-commit audits at 99d145ace

| Audit | Result |
| --- | --- |
| `audit:quest-log-append-only` (`--base c6006c745` and `--base 10c2f0610`) | clean (the working-tree artifact is gone) |
| `check-fast-static --base c6006c745` | ok, 12.4 s |
| `audit:shards` | OK (2411 tests, digests unchanged) |
| `audit:impact-contracts` | PASS 70/41 |
| option-D grep at HEAD | 0 hits in src/, test/ and scripts/ |

The whole-corpus reds classified above (unused exports, test duplication, complexity, guideline totals, lint, knip, no-kiro, operation-progress-authority) were not re-measured after the repair. The repair removes 6 inherited guideline hits and adds no export, clone or function.

## documentation-current messages caused by the closed-quest-shape deletions (not edited)

`npm run -s audit:documentation-current` at 99d145ace reports 272 violations in total; these 2 come from the deletions:

1. `solve/quests/participant-release-held-recovery-continuation/evidence/integrated-composition-content-review-v1.md:17`: "referenced repository path is missing: solve/quests/message-group-c2-orphan-removal-alpha/evidence/independent-implementation-review.md" (table row "C2 source, 41-item independent review", sha256 `0429ae581ab04210a5f6f04287e309afaf0e263f246e249a40fb98b058ae31bd`).
2. `solve/quests/participant-release-held-recovery-continuation/evidence/integrated-composition-evidence-review-v2.md:21`: the same missing path (row "C2 independent source review, 41 items", the same sha256).

The deleted file is the git blob `825b2aa6882a436ee04e7b388aa58db000b282f6` at `c6006c745:solve/quests/message-group-c2-orphan-removal-alpha/evidence/independent-implementation-review.md`. Its sha256 recomputed from that blob equals the cited `0429ae58...`, so the bytes are intact in history on `origin/work/rs-raft-event-reconciliation-20261016`. The other quest's evidence is not edited; the fix belongs to that quest's owner (for example a preservation pointer, as the C0 closure did).

## Kept

- The hanging-test first failure log: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/v/local/test_partition_participant-release-native-application-order.test.js.log` (the run in this update was green).
- The lab lists, unchanged and not started: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/reports/compose-20261017-lab-list-{A,B,C}.txt`.

Branch `integration/rs-raft-candidate-20261017` @ 99d145ace, local only, not pushed. It has not been independently verified or run on the lab.
