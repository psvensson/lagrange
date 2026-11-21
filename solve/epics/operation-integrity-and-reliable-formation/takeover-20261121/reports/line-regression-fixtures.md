# Line-regression fixture repair (G4, G5, G6, G7-fixture) — running record

Agent `claude:lr-fixtures`, 2026-11-21. Worktree `/mnt/data/peter/projects/.worktrees/line-regression-fixtures-20261121`,
branch `work/line-regression-fixtures-20261121`, base 23344cddc. Tests only, no `src/` change.
Instruction sources: CLAUDE.md, the lead's brief, `docs/steering/rules.md` (R03/R04/R19), `test/guidelines/fixtures.md`,
triage `reports/base-red-triage.md`, strict-operation-outcomes log line 38 (2026-11-20 fixture-migration decision).

Failing subtests per file at head 23344cddc (from `lab/w2-cone-23344cddc.log`):
scratch extract in the agent's scratchpad (cone-fails.txt); summarized per file below.

## Shared helpers

- `test/rebalancer/test-helpers.js`: `createObservationOnlyMutationPort`, `createFixtureSystemMutationPort`,
  `withExecutorMutationPort`, `applyOperationRowUpdate`, `routeOperationRowUpdates`, `createOperationRowInsertPort`.
- `test/rebalancer/operation-outcome-fixture.js`: `workflowFixtureHistory` (the strict-outcomes "producer history").

## Added shared helper (test/rebalancer/operation-outcome-fixture.js)

- `buildCreatedOperationFixture(params)`: the coordinator's record = `createOperationAt(params, createdAt)` (src
  `replica-status.js`, the one record builder) + `normalizeRebalancerEntityIdentity` (the coordinator ingress).
- `advanceOperationFixture(record, step, updatedAt)`: step, `WORKFLOW_STEP_TO_STATUS[step]`, step appended to history.
- Durable row = `buildCanonicalReplicaOperationRow(record, lease)` (src `replica-operation-repository-mutation-row-methods.js`,
  the repository's and placement applier's one row builder; JSON-text `steps_history`, canonical entity columns).

## Commits / pushes

- G5: c22d786d5fb1ddf13416b1f27835e286e7bb8076 (pushed). Lab `lab/lrfix-g5-1` (tv-dator): 3/4 green —
  bootstrap-failures 61 assertions, routing.property 41, mg-routing 21 (all pass); reservation-expiry case 2 red:
  the sweep proves terminality by `operation.completedAt !== null`
  (`rebalance-coordinator-reservation-lifecycle-methods.js` buildReservationOrphanReconcileSnapshot) and the advanced
  ACTIVE record had completedAt null. Fix: `advanceOperationFixture` stamps completedAt on terminal steps (owner's
  terminal commit does, `operation-workflow-transition-persistence.js` completedAt: now) — folded into the G6 commit.
- G6: first attempt refused by the hook (working tree must match the index for derived metadata: an unstaged test
  edit blocks the commit). Re-queued with the fixture follow-up included.
- G4/G7: edits drafted on scratch copies (agent scratchpad `draft/`), applied after the previous commit lands.

## G5 persisted history is not JSON text

Production check: `decodeReplicaOperationRow` is used for SQL rows, CDC-applied `event.data` and wake rows; the
repository writes rows only through `buildCanonicalReplicaOperationRow` (steps_history = JSON.stringify). Not
re-verified: whether a CDC UPDATE event's `data` can be a partial row without steps_history (cdcApplied emits
`event.data` as received) — recorded as an open product question, not pursued (quest decision already taken).

| File | Cause at head | Migration | Lab |
|---|---|---|---|
| control-plane/replica-dispatch-node-state-update-node-row-bootstrap-failures | case 1 hand-built CDC/cache rows without history; sync throw + unhandled rejection crashed the process (cases 10-13 "unfinished"/"left in queue" are collateral) | one producer row for both CDC and cache paths | pending |
| rebalancer/message-group-operation-routing.integration | case 1 hand row without history; case 3 (separate) engine answered `{rows:[],changes:1}` for all SQL → SENDING write deferred, visibility wait 5 s spent, no delivery | case 1 producer row, claim answer = same record; case 3 `createTestCoordinator` (production-schema SQLite ledger seeded with the producer row, `replaceWitness:false`, `committedMembershipFixture:false` so the spy router is unwrapped) | pending |
| rebalancer/reservation-expiry-operation-aware | cases 1-2 hand-planted op rows without history | `seedOperation` builds created record → advanced to SYNCING/ACTIVE → canonical row | pending |
| control-plane/replica-dispatch-routing.property | arbitrary rows without history | arbitrary yields params → record + canonical row; claim answer = record | pending |

## G6 Unsupported rebalancer entity type: undefined

- control-plane/replica-dispatch-node-state-update-remote-direct-wakeup: **STOP (not fixture-only)**. Besides the
  entity-less inputs (cases 1, 3, 8), cases 1, 4 and 6 assert `t.same` on the delivered OPERATION_ROW with the
  pre-4f347ca3f wake-row literal (status/completed_at `undefined`, steps_history `'[]'`, no other columns). The
  canonical wake row now adds 22 null columns (lease_expires_at, source_replica_id, copy_source_node_id,
  message_group_*, create_admission_*) — case 6 already passes entityType and still fails on exactly that diff
  (cone log). Passing needs the expected rows restated = an assertion change on a product contract change
  (4f347ca3f changed src only). Not edited.

- control-plane/replica-dispatch-direct-wakeup-delivery-decision: entity-less coordinator op → record via
  `buildCreatedOperationFixture` (assertions are on branch counts only).
- rebalancer/self-owned-coordinator-handoff-dispatches-in-process: same (both cases, advanced to SENDING).

### Wake-row shape class (STOP, product contract change 4f347ca3f, src-only commit)

Three files assert `t.same` on the delivered OPERATION_ROW with the pre-line wake-row literal; tap `same` fails on
extra non-undefined keys, and the canonical wake row adds 22 null columns: remote-direct-wakeup (cases 1/4/6),
ready-node-retry-cache-priority (cases 6/12/13), ready-node-retry-dispatch (case 9 "authoritative rediscovery should
still re-enter the canonical per-operation queue", diff shows the added columns). Needs a ruling to restate the
expected rows as the canonical wake row (e.g. expected = `buildReplicaOperationWakeRow(record)`).

## G4 stale construction / removed paths

- gateway-sql-mutation-fallback-phase-scope: NodeRegistrationOwner now requires `getSystemTableCache` (774d58f2e);
  production (`query-system-state-phase.js:80`) passes it and `hostId`. Fixture: add both (null cache, precedent
  boot-incarnation-owner / cold-node-authority tests; `LOCAL_MACHINE_HOST_ID`). Also clears this file's omission in the
  G11 census `node-host-identity-start-site-census`.
- snapshot-dispatcher-wiring: ReplicaHandlerSetup now requires a cache-change reader (`get`, `onCacheChange`,
  `offCacheChange`; d31cbc87b). Fixture: real `SystemTableCache` seeded with the lifecycle services row +
  `createLifecycleCdcServiceForCache(cache)` (precedent: d31cbc87b's own test, replica-handler-owner-path-bypass).
- initialization-shutdown-serialization (cases 5-6): handler now asks `owner.ownsPhysicalWorker(claim)` (b0dd82398).
  Fixture `releaseOwner` substitute gains it with held-until-released semantics (precedent:
  replica-admission-delivery-lifetime.test.js:688). Evidence ceiling: admission owner substituted, not real.
- membership-count-neutral-steady-trim (case 9): publication persist reads back via `owner.getPublication`
  (ff1a075bd). Fixture double gains `getPublication` over its durable row (exact precedent of ff1a075bd's own
  migration; this was the only publications-owner double without it).
- bootstrap-api: **STOP** — removed path (pre-CDC bootstrap SQL fallback; `assertCdcIntegrationService` 7d261f681).
  Only a product change or deleting the case makes it pass; owner ruling needed.
- rebalancer-entity-interaction-contract: case 8 fixture (untyped row lacked JSON-text history, so history decode
  threw before the identity refusal) → give the untyped observation valid JSON-text history. Cases 2, 6: the
  hand-built evaluation context imitates the workflow owner; the evaluator now calls
  `repository.getRequiredRemoveArbitrationCompetitors(operation)` (requires the subject's own durable row in the
  entity ledger) and `context.buildDeferredRemoveSafetyEvaluation`. Case 3: `getMoveSafetyError` no longer goes
  through `getRemoveSafetyError` (78413c60d) — the stubbed seam is gone. Proper repair = rebuild on the real
  workflow owner (createTestCoordinator) with committed subject rows; NOT done (budget).
- durable-voter-visibility-role-write: NOT done. Real `AuthoritativeRowMutationHelper.executeFlush` → real gateway
  refuses the predicate (undefined / non-schema column) built from the hand-built "contract-faithful" services
  store rows. Needs rows from the real services row owner; 692-line custom store.

## G7 authoritative read incomplete (fixture part)

- operation-record-step-shape: input contract changed to `{operation, targetObservation}`; `targetLifecycleStatus: null`
  (absent) → authoritative ABSENT observation from the owner's exported constants (same object the repository builds).
- replica-operation-insert-retry-idempotency: collision confirmation reads with `requireCompleteExactKey`; the fixture's
  whole authority (`authoritativeRows()`) answered without `rowSetComplete`. Reads through
  `createMockControlPlaneSystemTableGateway` (shared `withAuthoritativeReadDefaults`).
- admission-real-size-estimates: entity census answered without completeness; reads through the same shared gateway
  (single-entity world: the store's all-rows answer is the complete entity census).
- duplicate-operation-prevention.property, storage-reservation-lost-outcome-idempotency: NOT done. Their hand SQL
  readers answer every unmatched read (incl. the entity census) with `rows: []`; marking that complete would be a
  false authority once operations exist. Needs the production-schema store (createCoordinatorSqlStore) and producer
  rows for seeded operations.
- ready-node-retry-cache-priority, ready-node-retry-dispatch: wake-row shape STOP (above); cache-priority cases 3/4
  also hand-build `repository.queryIncompleteOperations` answers without entity identity/history.
- placement-create-bootstrap-binding: not examined (budget).
