# Verify: provisioning-admission-ledger-hold-transient-wait

Started 2026-07-05. Diff read: query-constants.js (+1 log msg), sql-query-engine-initial-partition-provisioning.js (gate widened, quorum requiredReplicaCount, re-wait), rebalance-coordinator-ledger-interlock-admission.js (heldSelfMovePartitionId).

## Surfaces
- A regression widened gate: PASS with latency notes (degraded/partial-hold cases gain bounded 1s/10s adaptive waits; normal case zero-wait; splits unaffected)
- B re-wait semantics: PASS (sleep-based polling, child-budget clamped, one-shot)
- C false-positive transient: PASS with UX ruling (dead cluster 1s->30s bounded by existing budget; aggregate reason cannot masquerade alone)
- D interlock mislabel fix: PASS for run-24 branch; minor residual mislabel in selfMoveCreateInFlight branch (:407-415, held* null there); COVERAGE GAP: no test asserts the message fix
- E TOCTOU: PASS (bounded honesty, one-shot by construction; rule: leave planning-shortfall throw as-is)
- F test runs: query 4050/4050 PASS, provision-waits 41/41 PASS, dt6 interlock 37/37 PASS, complexity ratchet PASS, rebalancer suite 5232/5232 PASS (8 skip); LINT FAILS: 2 quotes errors in new test (169:5, 260:5 — substitution-free template literals)
- G constraints: PASS (no raised timeouts, no demo changes, REUSED/EXTENDED/NEW clean)

## dt:prove
red-on-revert-proven across all 3 src files (fixExit 0 / revertExit 1 / restoreExit 0), artifact solve/changes/dt-prove/...2026-07-05T11-32-06-297Z.json

## Notes
- Old gate: enforceEvery && (targets<targetCount || precheck()). New: (enforceEvery || precheck()) && (same). So precheck()===true now forces the wait block for ALL creates on precheck-capable engines regardless of enforceEvery. Need: normal-case first-probe fast path.

### A findings
- waitForProvisionTargetNodeIds: first refreshResolution probe returns immediately (waitedMs=0) when max>=required. Normal 5-node case: required=2, all admit -> zero added waiting. Probe count parity: planning loop skips prechecked candidates + passes skipProvisioningAdmissionRecheck, so admission checks MOVED from planning loop to precheck, not duplicated.
- resolveProvisionTargetNodeIdsForContext returns diagnostics.selectedNodeIds = FULL ordered active list (not capped at requiredReplicaCount) -> probe covers all actives; no truncation skew from required=2 vs target=3.
- Degraded case (1 active, target 3, min 2): NEW up-to-1s convergence wait (adaptive off since activeRows(1)<required(2)), then same fallback-to-1 as before. Was: immediate fallback. +1s latency on under-populated bootstrap CREATEs. Bounded, matches enforceEvery path's accepted behavior.
- Callers: table-creation (defaulted quorum min + wasDefaulted flag — confirmed passes flag, table-creation-service-partition-provisioning.js:31-60); managed-split passes explicit targetNodeIds -> whole block skipped (explicitTargetNodeIds.length===0 gate) -> splits unaffected.
- Downgrade block at :196 requires nextAction===WAIT (timedOut) -> not triggered by early quorum satisfaction.

### B findings
- waitForCondition (sql-query-engine-select-execution.js:76): sleep-based setTimeout polling, NOT busy. 
- Budget: allocateControlPlaneTimeoutBudget -> createChildTimeoutBudget clamps granted=min(requested 30s, parent remaining) (timeout-budget.js:129). If remaining<minimum -> allocateOrThrow throws inside try{} with failOnTimeout=false -> caught -> timedOut path. NO overrun of caller budget.
- Re-wait is ONE-SHOT (no loop). Total = convergence window + clamped re-wait <= original 30s budget.
- Thundering herd: N creates x actives probes per 50ms poll; checkProvisioningAdmission is local coordinator logic. Same class as pre-existing enforceEvery waits.

### C findings
- hasOnlyTransientProvisioningShortfall: requires >=1 reason from TRANSIENT set per rejection; AGGREGATE (insufficient_placement_eligible_nodes) only tolerated in blockingReasons ALONGSIDE a transient reason, never sufficient alone. Empty rejections -> false. Hard placement shortage cannot masquerade.
- Dead cluster (all actives persistently cluster_member_unhealthy): waits full remaining budget (~30s) then canonical throw, vs ~1s before. One-shot, bounded by EXISTING client budget.

### D findings
- heldSelfMoveOperationId set at exactly 1 site (:394), heldSelfMovePartitionId set alongside (:395); cleared at exactly 1 site (tryClearHeldOperationLedgerSelfMove :529-530) + init (:491). No other writers repo-wide.
- :422-429 branch: heldSelfMovePartitionId guaranteed non-null when heldSelfMoveOperationId non-null (set together) -> honest.
- :407-415 selfMoveCreateInFlight branch: held* is NULL here (must clear before create enters gate) -> falls back to admitted op's partitionId = residual mislabel in the narrow mid-create window. The in-flight ledger partition is not recorded in state. MINOR, not the run-24 branch.
- Disruptive waiting-throw :373-380 embeds admitted partitionId — admitted op IS the ledger self-move -> honest. Confirmed.
- No existing test pins the old message shape (grep: only new test + dt6 tests, no message asserts).
- COVERAGE GAP: no test asserts the heldSelfMovePartitionId message fix.

### E findings
- One-shot by construction; if hold re-engages between re-wait success and planning, planning collects transient rejections -> maximumPrecheck<min -> throw, no second re-wait. Bounded honesty.

### G findings
- query-constants diff: only new LOG MSG string. TABLE_CREATE_PROVISION_TIMEOUT_MS still 30s, convergence 1s, poll 50ms, adaptive 10s — unchanged. No demo/client changes in diff.
- REUSED: waitForProvisionTargetNodeIds, hasOnlyTransientProvisioningShortfall, budget machinery. EXTENDED: gate condition, required-count formula, one-shot re-wait wrapper. NEW: heldSelfMovePartitionId state field + log constant.
