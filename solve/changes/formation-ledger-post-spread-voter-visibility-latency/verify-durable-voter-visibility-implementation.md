# Adversarial verification: durable voter-visibility implementation

Quest: `formation-ledger-post-spread-voter-visibility-latency`
Verifier: read-only adversarial pass, 2026-07-05. No src/ or test/ edits.

## VERDICT: SHIP

All seven vet amendments (A1-A7) honored; helper state-machine sound; both guard
tests + regression suites GREEN; both dt:prove artifacts red-on-revert-proven.
No blocking items. Two non-blocking observations recorded at the end.

---

## V1 — A1: CAS guard from the AUTHORITATIVE row. PASS

- `buildWhereClause` guards on `context.authoritativeRow || context.cachedRow`
  (partition-service-core-base.js:590). authoritativeRow wins when present.
- flush() populates `mutationContext.authoritativeRow` from
  `probeAuthoritativeRow(value)` (authoritative-row-mutation-helper.js:281-301);
  probe returns `{settled:false, row: probe.row}` where row is the durable point-read
  row, so the CAS guard uses the AUTHORITATIVE row, never the seeded cache row.
- Attack — "capability present but still guards on the seed": the only path that
  leaves authoritativeRow=null with capability present is a THROW/`supported:false`
  from the read → intentional legacy fallback (V2). When the confirm returns a row,
  the guard is authoritative. When it returns `available:false`, the flush short-
  circuits to scheduleRetry (never writes against a stale guard). No seed-guarded
  write path survives.
- Guard test 2 (anti-livelock, durable updated_at=2000 vs cache guard=1000 + seed)
  converges in one flush by guarding on the authoritative learner row → CAS matches →
  applied. PASS.

## V2 — A2: capability-gate; only the ROLE helper carries readAuthoritativeRow. PASS

Enumerated ALL 6 construction sites (`grep new AuthoritativeRowMutationHelper`):
| site | table | readAuthoritativeRow |
|---|---|---|
| core-base.js:581 (partition ROLE) | services | **YES** (only one) |
| core-base.js:696 (leader-pointer) | partitions | no |
| message-group-metadata-publication.js:114 (role) | services | no |
| message-group-metadata-publication.js:172 (leader) | message_groups | no |
| wasm-service-replica.js:270 (role) | services | no (cdcIntegrationService = roleMutationTransport shim, only updateSystemTableRow) |
| wasm-service-replica.js:308 (leader) | services | no (shim) |

`grep readAuthoritativeRow src/` confirms the ONLY construction-time pass is
core-base.js:651. Helpers without it: `this.readAuthoritativeRow` is null →
`flush()` runs `syncFromCache()` (line 232) = byte-identical legacy behavior; no
probe branch entered. Wasm shim lacks `executeAuthoritativeSystemTableRead` AND does
not pass readAuthoritativeRow, so double-safe. Additionally the ROLE helper's callback
itself guards `typeof ...executeAuthoritativeSystemTableRead !== 'function'` →
`{supported:false}` → `resolveLegacyCacheDedupResult()` fallback (helper:421-426), so
a shim-backed partition service would still degrade to legacy dedup. PASS.

## V3 — A3: read-only confirm, correct delegate contract, failure handling. PASS

- Confirm source is `executeAuthoritativeSystemTableRead` (READ-ONLY;
  core-base.js:659). `refreshMetadataPublicationGuardRow` (the cache-WRITING
  `refreshAuthoritativeCacheRow`, line 565-578) is used ONLY on the CAS-miss recovery
  path (`refreshObservedRow`), never as the comparison source. PASS.
- SQL/params shape matches the delegate contract at
  cdc-integration-service-authoritative-read-delegates.js:258
  (`executeAuthoritativeSystemTableRead(tableName, sql, params)`): the callback passes
  `(SERVICES, SERVICES_ROW_POINT_READ_SQL='SELECT * FROM services WHERE service_id = ?',
  [replicaId])`. PASS.
- Failure handling: the read flow returns `{success:false,...}` on its failure paths
  (authoritative-read-flow.js — multiple `success:false` returns, no throw on the
  normal failure paths). Callback maps `success !== true` → `{supported:true,
  available:false}` → probeAuthoritativeRow → `scheduleRetry()` + a
  `AUTHORITATIVE_CONFIRM_UNAVAILABLE` result (helper:427-435) — a deferred retry, NOT
  a flush-killing throw and NOT a pending-clearing dedup. A rare THROW is caught
  (helper:416-420) → `supported:false` → legacy dedup fallback (see observation O1).
  PASS.

## V4 — Helper state-machine integrity. PASS

Walked every flush exit with capability present:
- shuttingDown / inFlight guards: unchanged, before probe (helper:210-220).
- prepareFlush skip / clearPending: unchanged, before inFlight (233-252); the ROLE
  helper's prepareFlush never skips, so no interaction.
- probe settled-dedup: sets persistedValue, clears pending, retryAttemptCount=0,
  returns (447-460); finally resets inFlight.
- probe settled-unavailable: scheduleRetry once, returns (427-435); finally resets
  inFlight; pending retained.
- probe supported:false → legacy dedup: resolveLegacyCacheDedupResult (472-488).
- write applied / zero-row recovery / thrown write: unchanged bodies, now inside the
  same try; `finally { this.inFlight = false; ... }` (383-391) ALWAYS resets inFlight
  because the probe+prep are INSIDE the try. No path leaves inFlight stuck true.
- No double scheduleRetry: the unavailable path is the only scheduleRetry before the
  write; the write's own OBSERVED_STATE_CHANGED/zero-row scheduleRetry is on a
  mutually-exclusive branch (probe returned settled:false to reach it).
- followUp flush: only on writeSucceeded && pending!=persisted (385-390) — unchanged.
- Re-entrancy (queue during in-flight probe): inFlight set true at 277 BEFORE the
  awaited probe → concurrent queue() → scheduleFollowUpFlush (queue:185-187),
  microtask fires after inFlight clears. No concurrent flush. PASS.

## V5 — Livelock / starvation. PASS (bounded, acceptable posture)

- Capability present + authority persistently `available:false` (unreadable or row
  missing): each flush → scheduleRetry; retryAttemptCount increments → exponential
  backoff capped at maxRetryDelayMs=30s (resolveRetryDelayMs:539-557). No hot spin.
- Authority readable but row perpetually missing: `!probe.row` → same available:false
  branch → same bounded backoff.
- `AUTHORITATIVE_CONFIRM_UNAVAILABLE` returns quietly each retry — this matches the
  pre-existing OWNER_NOT_READY silent-retry posture (helper:269-274). Ruling:
  ACCEPTABLE, not FIX-FIRST (consistent with the established owner-not-ready pattern;
  bounded backoff; the guard test's settleHelper spin bound would FAIL loudly, not
  pass silently, on a genuine non-convergence — see V10).

## V6 — F1b reassertDurableRaftRole. PASS

- reassertDurableRaftRole (partition-service-metadata-delivery-methods.js:56-62):
  `if (!this.role || this.role === RaftRole.LEARNER) return false;` — correct-cased
  (`RaftRole = PARTITION_RAFT_ROLE`, the same constant set across raft-init-base /
  learner-promotion; `this.role` is a real property). A learner is never re-queued →
  no unpromoted learner published (hold-safety preserved).
- Poll-loop re-entrancy: the voter-ready seam seeds + reasserts then `return;` on first
  success (replica-handler-voter-readiness-methods.js:168-174) — fires once per gated
  CREATE. Re-queue of an already-persisted value is a true no-op (queue():177 early-
  returns on `value === persistedValue`).
- Optional-chaining safety: `getTrackedService(replicaId)?.reassertDurableRaftRole?.()`
  — getTrackedService may return a non-partition service (runtime-methods.js:485-507
  can return a bare replica with only shutdown/syncFromLeader); the `?.` on the method
  guards it. PASS.

## V7 — F1d CRITICAL scope. PASS

- buildUpdateOptions scopes CRITICAL by `isPriorityControlPlanePartition({partitionId})`
  (core-base.js:610-624). Definition (system-partition-classification.js:128-131) keys
  on `PRIORITY_CONTROL_PLANE_TABLE_IDS` — the NARROW 5-table set, exactly A6's ruling
  (not the broad CONTROL_PLANE_PARTITION_IDS). Non-priority partitions keep BACKGROUND
  / allowPressureDefer:true (byte-identical to head).
- Constant values match the delivery layer: `PARTITION_SERVICE_LITERAL.CRITICAL='critical'`
  (shared.js:185) and `PRESSURE_WORK_CLASS.CRITICAL='critical'` (pressure-governor.js:17)
  — the same values getMetadataPublicationDeliveryPriority/WorkClass emit. Table is
  SERVICES (not the operation ledger) → no run-22 feedback. allowPressureDefer:false +
  CRITICAL for a priority role write during formation is the intended un-deferrable
  behavior; leader-pointer helper already ships this class (precedent). PASS.

## V8 — F2: skip-outcome admission field. PASS

- unified-rebalancer-move-execution.js:96-106: the `rebalanceSkipReason` branch now
  passes `error.admissionResult ? {admission: error.admissionResult} : {}` as the
  `extra` arg to buildSkippedMoveResult; `rebalanceSkipReason` value itself unchanged.
- buildSkippedMoveResult spreads `...extra` (budget-planning.js:432-442), so
  `result.admission` = admissionResult. `admission` is the SAME field the sibling
  `error?.admissionResult` branch (108-116) already attached — no new field shape.
- Consumer check: logSkippedMoveOutcome reads `outcome?.admission?.decisionType`,
  `.reason`, `.blockingReasons` (follow-up-move.js:629-632, 650-653) — now populated
  for interlock skips. No consumer of the skip result's `admission` field breaks
  (grep of `.admission` consumers: all use optional chaining / array guards). PASS.

## V9 — Constraint compliance. PASS

- Diff touches ONLY 6 src files (git diff --stat): voter-readiness-methods,
  partition-service-core-base, metadata-delivery-methods, partition-service-shared,
  authoritative-row-mutation-helper, unified-rebalancer-move-execution.
- operation-ledger-quorum-concentration.js (hold evaluator): UNTOUCHED. Interlock
  admission files: UNTOUCHED. No client timeout/budget constant in the diff. No
  learner counted as a voter (V6). Actuals-only preserved (confirm reads the committed
  authoritative row; hold inputs unchanged). PASS.

## V10 — Test fidelity + dt:prove artifacts. PASS

- Both guard tests drive REAL production seams via prototype calls:
  `PartitionServiceCoreBase.prototype.createRoleMutationHelper.call`,
  `ReplicaHandler.prototype.seedLocalPriorityReplicaRaftRole.call`,
  `UnifiedRebalancerMoveExecution.prototype.executeMoveViaCoordinator.call`, the real
  `evaluateOperationLedgerQuorumConcentration`. Substrate fakes are contract-faithful
  (newer-updated_at-wins stale-guard merge; WHERE-equality CAS with honest
  affectedRows; read-only point read). This satisfies A7 repro-3 (role updates flow
  through the real helper+seed machinery, NOT driver fiat) and repro-4 (asserts through
  the move-execution skip-outcome path, not the raw error object).
- Tautology / spin-mask attack: settleHelper (maxSpins=10) does NOT throw on the bound;
  it returns and the test then asserts the DURABLE row value. A genuine livelock leaves
  the durable row = learner → the `t.equal(... FOLLOWER)` assertion FAILS. So a real
  non-convergence is RED, not silently green. No fake bypasses the code under test (the
  CAS/dedup/guard logic is all production code).
- dt:prove artifacts (newest each): durable-voter ...16-17-22-691Z.json and
  interlock-skip ...15-58-02-088Z.json both read `verdict: "red-on-revert-proven"`,
  fixRunExit 0 / revertRunExit 1 / restoreRunExit 0. PASS.

## V11 — Independent test runs (real exit codes). PASS

- `npx tap durable-voter-visibility-role-write.test.js interlock-skip-label-fidelity.test.js
  authoritative-row-mutation-helper.test.js` → `{ total: 82, pass: 82 }`, EXIT=0.
- `npx tap partition-service-learner-promotion.test.js child-partition-leader-propagation.test.js`
  → `{ total: 49, pass: 49 }`, EXIT=0. Leader-pointer helper + promotion consumers
  stay green. PASS.

---

## Non-blocking observations

- **O1 (LOW)**: If `executeAuthoritativeSystemTableRead` THROWS (rather than its normal
  `{success:false}` return), probeAuthoritativeRow catches it → `supported:false` →
  legacy cache dedup for that single flush, which in the exact seed-mask shape could
  NOOP-clear pending. Mitigated: (a) the read flow returns `{success:false}` on its
  documented failure paths (deferred-retry, not dedup); (b) the F1b re-assert and any
  subsequent role transition re-queue. Narrow edge, not a livelock. Worth a comment but
  not blocking.
- **O2 (INFO)**: `AUTHORITATIVE_CONFIRM_UNAVAILABLE` retries are silent (no warn). This
  matches the existing OWNER_NOT_READY posture; acceptable. If formation-window
  observability is later wanted, a debug line on repeated unavailability would help.

## Scope note
Verification limited to the implementation vs design v2 (A1-A7) and regression safety.
The doneWhen scenario-harness x3 and the live-demo budget clause (design's honest
"coin-flip marginal" projection, A4) are the Solver's terminal evidence, out of scope
for this implementation verifier.
