---
audience: evidence
recorded: 2026-11-02
quest: replica-admission-from-committed-operation
---

# Attempt 2 design note: routed system-table writes answer at commit (contract delta)

**Status:** design only. No `src/` edits; awaiting the lead's sequencing decision with Group A's attempt 2.

**Scope, as the lead bounded it on 2026-11-02:** at the cdc/gateway owner,

- a routed system-table write answers at commit with its log position;
- `awaitProjectionAt(position)` becomes the one projection wait (no timer);
- these are deleted: `waitForCacheUpdate`, `CACHE_WAIT_TIMEOUT_MS`, the 750/250 split, `confirmCacheVisibilityHoleWithinBudget` in the write path, the bootstrap bypass, `allowPendingVisibility`, `skipCacheWait` and the cache-visibility timeout classification.

**Out of scope:** the CREATE TABLE client answer vocabulary and the admin envelope states belong to Group A (F10: `ready / under_replicated / PROVISIONING_UNAVAILABLE -> 57P03`). Where this change alters what DDL answers, the new answer must be expressed in that vocabulary.

Line numbers are of `7486f64b0`.

## 1. The cdc owner's answer (the core delta)

**Today.** `insertSystemTableRow`, `updateSystemTableRow` and `upsertSystemTableRow` (`cdc-integration-service-mutation-operations.js:221-330, 368-480`; `cdc-integration-service-mutations.js:200-260`) and `deleteSystemTableRow` (`mutations.js:27-60`) execute the write, then wait for the writer's local cache. They answer in one of three ways:

- `{success: true, ..., visibilityState, contractState, nextAction, authoritativeVisibilityConfirmed, retryAfterMs}`;
- with `allowPendingVisibility`, the quieter `PENDING_VISIBILITY` / `DEFERRED_BY_PRESSURE`;
- **or they throw a retryable `CACHE_VISIBILITY_TIMEOUT` for a write that already committed.**

That last case reports a committed write as a failure, so callers retry it. This is the shape behind Phase 0's 69 committed services INSERTs that failed `UNIQUE` at apply. That is a hypothesis to confirm: the INSERT/UPDATE choice inside `ReplicaStateMachine.transition` is B2's.

**After.**

| Write outcome | Answer |
| --- | --- |
| Committed | `{success: true, committed: true, position: {tableName, key, originHlc}, operation, tableName, data, affectedRows, partitionResult}`. `originHlc` is the commit's own receipt (`result.originHlc`, already carried). |
| Commit failed | The existing typed error from `executeSQL`, unchanged. |
| Commit outcome unknown (timeout before an answer) | The existing typed timeout of the commit (`partition_execution_deadline`). It is never made into success later. |

Removed from every answer: `visibilityState`, `contractState`, `nextAction`, `authoritativeVisibilityConfirmed`, and the visibility-derived `retryAfterMs`/`deferRetry`.

## 2. The projection wait

`awaitProjectionAt({tableName, key, originHlc})` on the cdc owner:

- It resolves when the local cache row for `key` carries an `updated_at_hlc` at or after `originHlc`. The HLC order is `HLCTimestamp.compare`.
- For a delete position (`{tableName, key, deletedAtHlc}`), it resolves when the row is absent or carries a later origin.
- It is ended only by shutdown, with a typed `{code: 'shutdown'}` rejection. There is no timer.
- A position without an origin HLC is a typed refusal (`position_unknown`), never "resolved".

Red tests `2(a)` and `2(b)` already pin this shape. `2(d)` is the static deletion census.

## 3. Consumers whose answer shape changes

| # | Consumer (file) | Reads today | After | Owner |
| --- | --- | --- | --- | --- |
| G1 | Gateway mutation contracts (`control-plane-system-table-gateway-mutation-contracts.js:54, 193-230`), outcome classifier (`control-plane-mutation-outcome-classifier.js`), `raft/authoritative-row-mutation-vocabulary.js` | maps `visibilityState` to `CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY` | `PENDING_VISIBILITY` is no longer produced by a write. The gateway answers applied/committed with `position`, or the commit's typed failure. The vocabulary member is deleted with its producers. | cdc/gateway (mine) |
| G2 | Visibility vocabulary (`control-plane-system-table-visibility-constants.js`) | `VISIBLE / PENDING_VISIBILITY / AUTHORITATIVE_CONFIRMATION_PENDING / DEFERRED_BY_PRESSURE` | No write produces it. **Unknown:** whether non-write producers remain (priority-recovery observations use their own `visibilityState`). It is deleted only if the census shows no other producer. | mine, after census |
| D1 | CREATE TABLE metadata (`table-creation-service-create-table.js:243-280`, `allowPendingVisibility: true` on the `tables` and `partitions` inserts), completion (`table-creation-service-completion.js:136-155`) | metadata not yet cache-visible -> `pending_creation`, reason `metadata_visibility_pending`, `contractState: pending`, `nextAction: wait`; pressure -> `deferred / retry` | Metadata committed = metadata done. The `metadata_visibility_pending` completion reason disappears, and so does its pending state. Pending can then come only from provisioning convergence, which is **Group A's F10 vocabulary** (`under_replicated`, `PROVISIONING_UNAVAILABLE -> 57P03`). | **Group A** (client answer); mine (the metadata write) |
| D2 | Existing-table reconciliation (`table-creation-service-existing-table-reconciliation.js:83`), schema provisioning job repository (`schema-provisioning-job-repository.js:17`) | `allowPendingVisibility: true` | Commit answer. Any pending answer they forwarded comes only from F10. | Group A (answer); mine (write) |
| D3 | `sql-query-engine.js:604-610` -> pgwire / admin errors | copies `error.visibilityState` and `authoritativeVisibilityConfirmed` onto the result | These fields no longer exist on write errors; the copy is deleted. **The pgwire `55P03` "convergence pending" answer must then come only from F10.** | Group A (pgwire mapping) |
| A1 | Admin websocket envelope (`admin-websocket-api-shared.js:197, 431-449`) | forwards `visibilityState` and `authoritativeVisibilityConfirmed` | Fields absent; the envelope state is **Group A's**. | Group A |
| C1 | Membership publication coordinator queue, active-gate reconcile, admin control-snapshot publication reconcile, replica dispatch replay health readiness (pass `ALLOW_PENDING_VISIBILITY` constants: `membership-publication-coordinator-queue.js:91`, `-active-gate-reconcile.js:64`, `admin-control-snapshot-membership-publication-reconcile.js:62`, `replica-dispatch-replay-health-readiness.js:58`) | take the quieter pending answer | Commit answer. A step that then reads the cache for the same row calls `awaitProjectionAt(position)`. **Unknown per site until the audit (section 4).** | control-plane publication owner; the write call is mine |
| C2 | Managed split/merge persistence (`managed-split-workflow-persistence-methods.js:105, 139, 233`; `managed-merge-...:251, 268, 292`) | `allowPendingVisibility` true except on epoch transitions (false, so they must observe) | Commit answer. Epoch transitions that must observe call `awaitProjectionAt`. | partition managed-workflow owner |
| C3 | `sql-query-engine-partition-routing-readiness.js:282, 294, 391` (direct `waitForCacheUpdate`) | waits for cache visibility | Each becomes `awaitProjectionAt`, or is deleted if the decision should read the commit. **This is a routing-readiness decision, so it is Group A's (C5) to decide.** | **Group A** |
| S1 | `skipCacheWait` callers (26 src files): `replica-state-machine-transition.js`, `replica-state-machine-failed-create-claim.js`, `replica-state-machine-leader-clear.js`, `replica-cleanup-tombstone-owner.js`, `node-lifecycle-publication.js`, the heartbeat, registration, handoff and partition row owners, `replica-operation-repository-mutation-gateway-methods.js`, ... | opt out of the wait | The option is deleted, because answering at commit is now the default. The edit removes one option key per site. **Two of these files are B2's** (`replica-state-machine-transition.js`, `replica-state-machine-failed-create-claim.js`). | each owner; B2 for its two files |

**Reproducer predicate d** (`fresh-formation-routability-predicate.js`) requires `contractState != pending` for CREATE TABLE. Today, pending can come from metadata visibility (D1) or from replica convergence. After this change it can come only from provisioning convergence, in Group A's F10 vocabulary, so predicate d's reading of "pending" must be Group A's `under_replicated` / `PROVISIONING_UNAVAILABLE`. The predicate is preregistered and is not edited here. If F10 renames the field it reads, the scenario's adapter changes under Group A's quest.

## 4. The audit this attempt owes before deleting the wait

Some of the 88 mutation call sites in 31 src files may read the writer's cache right after their write, relying on today's wait. Each such site gets an explicit `awaitProjectionAt(position)`; none gets a quieter path.

- **Method:** an AST census (a red test) of every function that awaits a mutation and then reads `systemTableCache` for the same table. The census fails until each listed site either awaits the position or is reasoned to need no projection (commit answer suffices). It runs before the deletion.
- **Count:** unknown until written.

## 5. Sequencing proposal (for the lead)

| Order | Owner | Change | Dependency |
| --- | --- | --- | --- |
| 1 | mine | Section 1 + section 2 + G1/G2 + C1/C2 + S1 except B2's two files + the audit | - |
| 2 | Group A | D1 / D2 / D3 / A1 / C3 in its F10 vocabulary | Its attempt 2 consumes "metadata committed" from step 1 instead of `visibilityState` |
| 3 | B2 | Removes `skipCacheWait` from its two files | - |

All three must land together, or in the order step 1 -> step 2: a gap where D1 still reads `visibilityState` would answer every CREATE TABLE `ready` on metadata alone, which is a quieter path. That forbids landing step 1 alone, unless D1 is adapted in the same commit to read "metadata committed" and to leave every pending answer to F10.

**Options:**

- **(a)** I write sections 1-4 and a minimal D1 adapter, "metadata committed => no metadata-pending reason", in Group A's F10 terms after their vocabulary lands.
- **(b)** Group A's attempt 2 lands first; I rebase onto it and delete the wait.

**Recommendation: (b).** D1, D3 and A1 are their contract, and deleting `allowPendingVisibility` removes the only metadata-pending producer they consume.
