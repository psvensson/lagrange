# defaults-stream-merge notes (append-only)

Merge of the landed quest `state-read-named-defaults` (f7fe3d297, branch
`work/code-navigability-defaults-20261108`) into the code-navigability stream
aligned with PR #201 (stream head 5c6fe7db5). Branch
`work/code-navigability-merge-defaults-20261109`, worktree
`lagrange-nav-merge-defaults-20261109`. Merge base 877eb01fa.

Rule: both intents survive. PR #201 behaviour (authoritative read provenance,
fences, canonical planning reader) is kept; the quest's invariant (no
state-read default anywhere in src) is applied to it, including code the PR
added. No src file is resolved by taking one side whole.

## 2026-11-09 merge: src conflicts

`git merge --no-ff f7fe3d297`: 13 src conflicts (exactly the list in
pr201-alignment-notes.md "Impact on in-flight quests"), 5 scripts, the epic
file and the priority-recovery owner inventory.

| File | PR/stream intent | Quest intent | Resolution |
| --- | --- | --- | --- |
| admin/admin-control-snapshot.js | PR (de8ccfe43, admin projection consolidation) deleted the local `hasDurablePublishedMembershipObservation`/`select...` copies; imports them from node-view-projection | same helper read `publicationStatus` through readUpperStateField; `row.status.length > 0` evidence predicate | PR's deletion kept (one fewer copy, also closes the quest's R17 "three copies" finding by one); the quest's now-unused `readUpperStateField` import dropped; the quest's `row.status.length > 0` hunk (auto-merged) kept. |
| admin/admin-control-snapshot-local-build-base.js | PR restructured the helper (`isControlSnapshotPlainRecord`, one boolean expression, status read factored into `resolveObservedPublicationStatus`) but kept the `status \|\| publicationStatus \|\| publicationObservation.status \|\| ''` default chain | read the one field every producer sets (`publicationStatus`) | PR's structure; `resolveObservedPublicationStatus` body = `readUpperStateField(publicationDiagnostics?.publicationStatus)` (quest's read + citation). Producer re-checked on the merged tree: admin-control-snapshot-publication-convergence-diagnostics.js:248-252 sets `status`, `publicationStatus` and `publicationObservation.status` from the one `publicationSnapshot.publicationStatus`; the unavailable branch sets none (absent -> not PUBLISHED, as '' was). |
| admin/admin-control-snapshot-node-view-projection.js | PR dropped `?.` on the guarded record (cosmetic) | readUpperStateField(publicationStatus) | quest side; the `?.` difference is behaviour-neutral (record is checked non-null above). |
| control-plane/node-liveness-semantic-projection.js | PR: one ready-lease decoder (`readReadyLeaseFact`, CLEARED/INVALID/VALID), `NODE_STATE` import, `statusSemantics.valid` | status `facts.status \|\| UNKNOWN` -> readStateField + explicit `=== STATE_ABSENT ? UNKNOWN` | both import lines (state-field-read + PR's `NODE_STATE`); bodies auto-merged, both present (`observedStatus` decision and PR's `valid`). |
| control-plane/replica-dispatch-operation-execution.js | PR hoisted the step into one `rowWorkflowStep = row.workflow_step \|\| null` used by four dispatch-failure records (one is new: terminal dispatch result) | read `row.workflow_step` directly (replica_operations.workflow_step NOT NULL) | PR's hoist kept (one read, four uses); its PR-added default removed: `const rowWorkflowStep = row.workflow_step;` with the NOT NULL citation. **PR site rewritten** (see below). |
| node/replica-create-admission-retained-recovery.js | PR: settle through `settleRetainedLifecycleProgress` + `claimRetainedTerminalFailedCreateRow`, still `reconciled.row?.status \|\| null` | `readStateField(reconciled.row?.status)` | PR's body; the status read is the quest's `readStateField`. Only ACTIVE/FAILED decide, so '' / absent -> no settle in both. **PR-carried site rewritten.** |
| partition/partition-service-learner-promotion-methods.js | PR: `?? null` (no ACTIVE default) and `status !== null` in the live check | `readStateField` + `!== STATE_ABSENT` | same intent from both sides; quest form taken (the `??` form is a counted state-read default). STATE_ABSENT is null, so the PR's witness (`getReplicaServiceStatusForPromotion({status: null}) === null`, learner-promotion-count-check-authorization-cases.js:706) holds. Difference: '' is absent (not live) under the quest form, '' live-ish under `?? null`; services.status NOT NULL and written from ReplicaStatus constants, so '' has no producer. |
| rebalancer/move-planner-state-methods.js | PR: `requirePolicyTargetReplicaCount` import | `STATE_ABSENT, readLowerStateField` import | both imports; bodies auto-merged. |
| rebalancer/operation-workflow-dispatch-rearm-evidence.js | PR: retry with `retryOperation` (the visible operation, or the caller's operation when the visible one is no longer safety-retryable); `retryOperation.workflowStep \|\| null` | `currentOperation.workflowStep` direct (decoded) | PR's `retryOperation` kept; the step read is `readStateField(retryOperation.workflowStep)` because retryOperation may be the caller's in-memory operation (the quest reads that one through readStateField everywhere else in the file). Same answer as `\|\| null` for every value (null for absent/''). **PR site rewritten.** |
| rebalancer/operation-workflow-recovery-observation.js | PR: one-line `return []` (format) | `String(serviceRow.status)` (no `\|\| ''`) | quest read + PR format + citation comment (services.status NOT NULL); absent -> 'undefined' not in the relevant set, same outcome as ''. |
| rebalancer/operation-workflow-replace-owner-wake.js | PR: `committedNodeFloorLevel` import | `readStateField` import | both imports. |
| rebalancer/priority-surplus-remove-placement-fence.js | PR: authoritative read witness + `partial`/`rowSetComplete` fence (imports) | `rowRaftRole` reads `raft_role` of the owner-RPC rows | both imports; PR's fence only narrows which observations are accepted, rows stay owner-RPC `SELECT * FROM services` rows, so the quest's producer proof (one spelling) still holds. |
| rebalancer/replica-operation-repository-visibility-methods.js | PR: canonical sync planning reader import (`readPriorityRecoveryPlanningAnswerSync`) | `readPublicationRecordStatus` import | both imports; the quest's status decision applies to the planning snapshot the canonical reader now returns (same record shape). |

Non-src conflicts: `scripts/check-complexity.js` 1711 (stream, lower than the
quest's 1714; both comments kept); `scripts/check-duplication.js` 37/1187
(stream, lower than the quest's 42/1330); the five navigability baselines:
`state_read_defaults` baseline deleted (the quest's ruling: the row is
ESLint-promoted and the audit no longer reads it), the others taken from the
stream and then regenerated with `--update-baseline`; epic file: both decision
entries kept; priority-recovery owner inventory regenerated by its producer.
Merge-caused cleanup: `MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL` import in
membership-publication-coordinator-reconcile.js lost its last use (the quest
removed it, the PR split the helpers out) -> dropped (ESLint no-unused-vars).

## PR state-read defaults rewritten the quest's way

After the conflict resolution the promoted ESLint rule / detector reported 4
sites, all added by PR #201 (absent at the merge base 877eb01fa and in the
quest). In addition, the alignment had re-expressed several PR defaults as
local typed readers with a named empty status (`''`), which the detector does
not count (its conditional shape needs a state member in the test) but which
are the same default; those PR-originated readers are folded into the one
reader too. The pre-existing (merge-base) typeof copies, e.g.
`hasCandidateStatusRefresh`, stay as routed by the quest (next detector
extension, epic entry 2026-11-09).

| Site | PR head (c8215e322) / stream | After | Behaviour argument |
| --- | --- | --- | --- |
| control-plane/replica-dispatch-operation-execution.js dispatchOperationRow `rowWorkflowStep` | `row.workflow_step \|\| null` (alignment hoist of four PR copies) | `row.workflow_step` + NOT NULL citation | replayed replica_operations rows always carry the NOT NULL step written from WORKFLOW_STEP constants; the value is a diagnostic field of the failure record. Equal for every reachable row. |
| control-plane/completed-priority-placement-handoff-observation.js `normalizeServiceStatus` / `normalizeServiceRaftRole` | `normalizeString(row?.status).toLowerCase()` ('' default) and `normalizeString(row?.raft_role ?? row?.raftRole)` | `readLowerStateField(row?.status)`, `readLowerStateField(row?.raft_role)` | only caller (admin node-view projection) passes `systemTableCache.getAll(TABLES.SERVICES)`: SQL-column keyed rows (the quest's cache-boundary proof), so `raftRole` is a dead spelling; absent -> STATE_ABSENT, which is in neither the transitional set, nor ACTIVE, nor a voter role: same decisions as ''. Dropped `.trim()`: statuses/roles are written from constants (no whitespace producer). |
| message-group/message-group-service-metadata-publication.js prepareFlush `liveRole` | `this.role \|\| null` | `readStateField(this.role)` | role is born FOLLOWER (message-group-service-state.js:261); STATE_ABSENT is null, so absent/'' -> null exactly as before. |
| partition/partition-service-metadata-mutation-helpers.js prepareFlush `liveRole` | `owner.role \|\| null` | `readStateField(owner.role)` | same; born FOLLOWER (partition-service-core-base.js:138). |
| partition/partition-replica-admission.js admitFromCommittedOperation refusal | `workflowStep: read.row?.workflow_step ?? null` | `readStateField(read.row?.workflow_step)` | absent row/step -> null as before; '' (no producer, NOT NULL from constants) now null too. |
| node/replica-create-admission-retained-recovery.js | `reconciled.row?.status \|\| null` | `readStateField(...)` | (conflict file, above) |
| rebalancer/operation-workflow-dispatch-rearm-evidence.js | `retryOperation.workflowStep \|\| null` | `readStateField(...)` | (conflict file, above) |
| rebalancer/failed-create-cleanup-token.js `normalizeLowercaseStatus` (PR helper) | typeof -> trim().toLowerCase() else null; previous state `normalize(previous_state) \|\| normalize(previousState)` | deleted; `readLowerStateField(row.status)`, `readLowerStateField(row.previous_state, row.previousState)` | first non-empty of the two spellings, as the `\|\|` was; absent -> STATE_ABSENT (null) as before; `.trim()` dropped (constants). The two spellings are a row-field alias pair for system-table-row-decoders (R17, not new). |
| cache/system-table-cache-authoritative-reconciliation.js `isActiveServiceStatus` | PR `String(row?.status \|\| '').toLowerCase() === ACTIVE`; alignment typeof copy | `readLowerStateField(row?.status) === SERVICE_STATUS.ACTIVE` | identical boolean for every value. |
| control-plane/membership-publication-coordinator-reconcile-helpers.js `normalizeLowercaseStatus` (PR helper) | PR `String(row?.status \|\| EMPTY).toLowerCase()`; alignment typeof -> named EMPTY | helper deleted; `isInProgressServiceStatus(readLowerStateField(row?.status))`, in-progress requires `status !== STATE_ABSENT` (was `length > 0`) | absent and '' are not in progress in both. |
| control-plane/serve-eligibility-record-decision.js `readStatus` | PR `String(row?.[COLUMN.STATUS] ?? row?.status ?? '')`; alignment typeof -> `NO_STATUS = ''` | `readLowerStateField(row?.[COLUMN.STATUS])`, NO_STATUS deleted | callers compare to ACTIVE (absent never ACTIVE) and compare two rows' statuses (absent == absent, as '' == ''; '' and absent were already equal). |
| control-plane/serve-eligibility-owner.js notePublicationSourceChange | `!pub.status \|\| pub.status === PUBLISHED` (an absent status silently counts as PUBLISHED) | `readStateField(pub.status)`; `isPublished = status === STATE_ABSENT \|\| status === PUBLISHED` | the PR's decision kept but named: same answer for every value (normalizeControlPlanePublicationRow decodes status to a string). Whether a status-less publication should count as published is the publication owner's question (R17, recorded, not changed). |
| rebalancer/replica-operation-repository-mutation-persistence-methods.js membershipVisibilitySatisfied | `!expected.workflowStep \|\| expected.workflowStep === PENDING` | `readStateField(...)`, `=== STATE_ABSENT \|\| === PENDING` | identical; absent step decided explicitly like PENDING. |

Not changed (no default): replica-handler-failed-create-publication.js
`isTerminalFailedOperationRow` (`typeof x === 'string' && x.toUpperCase() ===
FAILED`, a guard that answers false for absent; invents no state).

## Budget (code-navigability-budget.js), stream head 5c6fe7db5 vs merge

| Row | 5c6fe7db5 | merge | cap |
| --- | ---: | ---: | ---: |
| state_read_defaults | 413 (OVER) | **0** | 0 |
| row_field_alias_reads | 736 | 697 | 745 |
| two_source_fallback_reads | 1788 | 1696 | 1789 |
| fallback_branches_never_taken | 147 | 141 | 0 (open) |
| fallback_sites_unclassified | 1324 | 1282 | 0 (open) |
| rows OVER | 12 | 11 | |

Every other row is identical at both heads; the OVER rows that remain are the
open (target-0) rows already OVER at 5c6fe7db5 (pilot owners 59,
admission-path 3, partition-service bags 12, formation decoders 3, directories
4, stale_owner_indexes null in an archive, alias_exports 38, census 120 /
141 / 37 / 1282). No capped row exceeds its cap.

## Ratchet repairs on the merged tree (no baseline raised)

- File size: src/rebalancer/replica-operation-liveness.js was 813 lines
  (stream 794 + the quest's reader imports and display helpers; the quest
  branch had 817 under its own 26-file baseline, the stream is at 21). Brought
  to the cap at the owner by collapsing four single-name import blocks and two
  wrapped constants to one line each (formatting only). `audit:file-size`
  21/21 and 21/21.
- Duplication: the quest's citation comment, added inside the 47-line clone
  `resolvePublicationOrderingValue` / `isMembershipPublicationRow` /
  `resolveLatestMembershipPublicationRow` shared by admin-control-snapshot.js
  and admin-control-snapshot-membership-publication-reconcile.js, made it 48
  (1188 > 1187). Repaired by keeping one version: the reconcile module exports
  `resolveLatestMembershipPublicationRow` and `resolvePublicationOrderingValue`
  and admin-control-snapshot.js imports them (its copies deleted). The two
  copies were identical except `null` vs `MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_ROW`,
  which is `null`. Baseline tightened on the hint 37/1187 -> 35/1109.

## Commit and checks

Merge commit **daab6792c** (parents 5c6fe7db5, f7fe3d297), committed with the
hook on (`LAGRANGE_SOLVER_LANDING=1`), pushed to
`origin/work/code-navigability-merge-defaults-20261109`.

Checks on the merge tree (staged = committed):
- `npx eslint src`: exit 0 (the promoted state_read_defaults rule now covers
  the PR's code: 4 sites before the rewrites, 0 after).
- `node scripts/checks/code-navigability-budget.js`: state_read_defaults 0/0,
  no capped row over its cap (table above; after the owner-index
  regeneration the OVER count is 10: stale_owner_indexes met).
- `npm run -s audit:guideline:navigability`: 0 violations (baselines
  regenerated with `--update-baseline`; counts only lowered:
  row_field_alias_reads 737 -> 697, two_source_fallback_reads 1788 -> 1696,
  others re-identified at equal counts).
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0.
- `npm run -s test:duplication`: OK 35/35, 1109/1109 (test 629/23624).
- `npm run -s audit:file-size`: 21/21, 21/21.
- `node scripts/check-fast-static.js`: exit 0.
- complexity ratchet 1699/1699 (tightened on the hint).
- Regenerated: test metadata, global owner debt inventory, priority-recovery
  owner inventory, 57 source owner indexes.

## Local tests (node --test per file, 4 parallel, thermal gate per 60 files)

Batch 1 (88 files: the quest witnesses state-field-read,
state-read-named-defaults, operation-record-step-shape,
registered-service-row-raft-role, code-navigability-detectors,
check-guideline-navigability, plus every test importing a file this merge
rewrote, outside the four directories): 85 pass, 3 red:
- dt-ledger-completion-continuity-discriminator (41/1) and
  committed-membership-census (8/1): identical counts on an archive of
  5c6fe7db5 (both already listed red on the PR head in the alignment notes).
- fresh-join-via-non-seed-node.integration: every assertion passes, then the
  file hits the 30 s `timeout!` during teardown. Red at 5c6fe7db5 as well
  (2 of 4 base runs, same `timeout!`, 31-41 s); merge 4 of 4 (30-41 s). Host /
  timing at the edge of the bound, recorded for the lab run.
- No test file conflicted in the merge.

Batch 2 (660 files: every test under test/rebalancer, test/control-plane,
test/query, test/policy not in batch 1): 626 pass, 34 red. Every red re-run on
an archive of 5c6fe7db5 on the same machine (pass/fail subtests, merge | base):
- identical counts (31 files): query cache-based-routing.property 5/1,
  cache-based-routing 7/1, queryable-core-j2-sql-key-read-journey (no TAP
  summary on either side), service-read-locality-routing 23/1,
  sql-query-engine-provisioning-parent-deadline 8/8, -provision-ledger-hold-
  transient-wait 7/1, -provision-progress-gated-rewait 2/3; rebalancer
  committed-node-remove-safety 39/55, -wake 24/9,
  coordinator-created-operation-progress 33/1,
  formation-ledger-spread-voter-ready-readiness 8/3,
  ledger-quorum-spread-hold-cure-drain-admission 10/2,
  operation-workflow-remove-safety-concurrent-down-target 0/4,
  -concurrent-stale-phantom 0/2, -universal-floor 7/3,
  rebalance-coordinator-outcome-routing 70/5,
  rebalancer-entity-interaction-contract 24/1, replace-named-handoff-attempt
  7/16, replace-owner-lease-causal 6/12, replace-owner-wake 121/43,
  replace-real-group-completion 85/40, -d2 47/36, -deposed-leader 11/11,
  -handoff 31/22, -latency 15/10, -scheduling 64/49,
  replace-remove-safety-post-intent 0/6, replace-replica-workflow 213/31,
  replica-retirement-terminal-actuals-coherence 4/4,
  unified-rebalancer-affinity-policy-refetch-parity 0/3,
  user-table-leader-placement-cure 52/2. These are the PR-head reds listed in
  pr201-alignment-notes.md (red at 5c6fe7db5, not this merge).
- flaky on both sides: rebalance-budget-enforcement.property (seeded property,
  merge 2/3, base 1/4); replace-owner-recovery-equivalence (merge 146/90,
  148/88, 147/89; base 148/88, 148/88, 146/90); existing-group-add-topology-
  guard (merge 9/1 under batch load with a 30 s `timeout!`, then 11/0 twice
  alone; base 11/0).
- merge-caused: none.

## Lab

Owner constraint received mid-run (household Wi-Fi): at most one lab host at a
time, narrow `test changed` lanes only, no new full suites, bulk copies capped
(rsync --bwlimit=2500), base runs only as a narrow cone of the red files. The
one run already in flight (below) was allowed to finish; its reds are
classified locally against an archive of 5c6fe7db5, with no lab base run.

- Run 1: `lab test changed --lane all --sha daab6792c --base-sha 5c6fe7db5 --on
  adam-laptop` (holder claude:nav-merge-defaults) was refused at placement:
  "generated metadata is stale ... impact-graph-seal.json" (2460 files no
  result, exit 97). Cause: merge-caused. scripts/check-complexity.js was
  tightened after the metadata refresh, so the committed seal's sourceDigest
  was stale. This was reproduced in a clean checkout of daab6792c (the
  producer rewrote the seal) and fixed in **6606cd9df** (seal regenerated).
  The clean checkout of 6606cd9df regenerates with no diff.
- Run 2: same command at 6606cd9df (pid 2620800). The cone selected the
  whole suite (2460 files).
- Result: 2460 files, **2390 pass, 70 fail**, 99338 assertions
  (test-output/reports/test-results-adam-laptop.ndjson in the worktree).
  The alignment's whole-suite run at c82167e1e on the same host gave 2544 pass
  and 74 fail. All 70 reds here are files that run already had red and
  classified; this merge adds no new red file.

| Class | Files | Evidence |
| --- | ---: | --- |
| red at 5c6fe7db5, proven locally with the same pass/fail counts on an archive of 5c6fe7db5 | 33 | the 31 rebalancer/query files of batch 2, plus committed-membership-census 8/1 and dt-ledger-completion-continuity-discriminator 41/1 (batch 1) |
| flaky on both sides locally | 3 | rebalance-budget-enforcement.property, replace-owner-recovery-equivalence (batch 2). The third is existing-group-add-topology-guard, which was green on the lab. |
| lab host/timing, green locally on both sides | 2 | admin-websocket-api-control-snapshot-query (lab: "query should complete within local bound"), admin-websocket-api-diagnostics-and-control-snapshot; locally 57/0 and 96/0 at both the merge and 5c6fe7db5 |
| red on the PR head per the alignment notes; local base re-run INCOMPLETE | 22 | active-gate-authoritative-repair-convergence, join-resume-replica-lifecycle-owner, dt6-authoritative-observation-watermark, dt6-voter-surplus-promotion-drain-livelock, dt-formation-barrier-spread-release-oscillation, dt-formation-priority-placement-before-active, authoritative-discovery-repair-pressure, leader-metadata-validation, managed-split-admission-reliability, pgwire-bootstrap, seed-node-bootstrap, replica-handler, child-partition-leader-propagation, merge-auto-execution, partition-deferred-evaluation-obligation-scheduler, split-merge-hysteresis, movielens-formation-probe-wiring, check-operation-dispatch-completion-owner, solve-footprint-accounting, minimal-deployment-request-binding-compilation-owner-guard, formation-sim-attribution-isolation, formation-sim-runner |
| lab host/timing per the alignment notes; local base re-run INCOMPLETE | 9 | bootstrap-epoch-manager-lifecycle, bootstrap-sequence, node-bootstrap-consistency.property, cdc-source-occurrence-delivery, create-table-partition-provisioning, raft-leader-election, three-node-seed-rebalance, message-group-native-provisional-route, cdc-group-propagation-foreground-boundary |
| time out at 600 s on both sides per the alignment notes | 2 | dt6-operation-ledger-self-move-hold-engagement, -fairness (not re-run: 600 s per side) |

The local merge-vs-5c6fe7db5 re-run of the last three classes (31 files, both
sides, 2 in parallel) was stopped by Claude Code's low-memory reaper after 3
merge-side results: bootstrap-epoch-manager-lifecycle, bootstrap-sequence and
active-gate-authoritative-repair-convergence were red on the merge, with no
base result. As instructed, it was not restarted. Those 33 files therefore
rest on the alignment's classification of the same files, not on a fresh
base proof against 5c6fe7db5. The one-host narrow cone the owner allows for
that is `lab test changed` on a commit that touches only those red files
(the comment-touch method in the quest notes).

## Verifier's checklist

1. Parents: `git log -1 --format=%P daab6792c` = 5c6fe7db5 f7fe3d297;
   6606cd9df only regenerates test/shards/impact-graph-seal.json.
2. PR behaviour kept: for each of the 13 src conflict files, `git diff
   877eb01fa 5c6fe7db5 -- <file>` (stream/PR change) is present in daab6792c.
   Key spots: the dispatch-failure `rowWorkflowStep` hoist,
   `retryOperation` in the deferred re-arm, `settleRetainedLifecycleProgress`,
   the ready-lease decoder and `statusSemantics.valid`, the fence's
   `isValidLeaderReadAuthorityWitness` / `rowSetComplete`, the canonical sync
   planning reader import, the admin consolidation (helpers imported from
   node-view-projection).
3. Quest invariant applied: `npx eslint src` exit 0; budget
   state_read_defaults 0/0; `git grep -n "workflow_step || null\|role || null\|raftRole,\|NO_STATUS" src` finds nothing in the rewritten functions.
4. Each PR rewrite (table above): compare the old and new expression for
   absent, null, '' and every constant value; the only differences are '' and
   whitespace, and those values have no producer (NOT NULL columns written
   from constants). Read the citation on each line.
5. Known-bad input: restore `const liveRole = this.role || null;` in
   message-group-service-metadata-publication.js and `npx eslint` on that file
   fails with navigability-rule:state_read_defaults.
6. Ratchets only lowered: complexity 1711 -> 1699, duplication 37/1187 ->
   35/1109 (one resolver instead of two copies), navigability baselines
   regenerated (row_field_alias_reads 697, two_source_fallback_reads 1696);
   state_read_defaults baseline deleted (promoted row).
7. Judgement calls: (a) the PR-originated typed readers with a named empty
   status ('') were treated as state-read defaults and folded; the
   pre-existing (merge-base) typeof copies were left as routed by the quest;
   (b) serve-eligibility-owner keeps "a status-less publication counts as
   published", now explicit on STATE_ABSENT, and is routed to the publication
   owner (R17); (c) `readLowerStateField(row.previous_state,
   row.previousState)` keeps a two-spelling read for system-table-row-decoders;
   (d) the admin resolver dedupe goes slightly beyond the conflict list and
   was forced by the duplication ratchet.
