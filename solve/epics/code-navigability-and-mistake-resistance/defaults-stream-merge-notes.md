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
