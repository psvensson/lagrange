# Alt-4 analysis: downstream provisioning-admission tolerance of ledger quorum-concentration

READ-ONLY analysis. HEAD `33e0026d`. Companion to `diagnosis-s13-run3.md`.

**VERDICT: viable-only-as-complement (and the mechanism ALREADY EXISTS).** Alt-4
is not a new capability — the provisioning path already classifies
`operation_ledger_quorum_concentrated` as transient and already waits it out
under the full provisioning budget. In run3 that wait *fired* and *still aborted*,
because the concentration was a ~9-minute persistent wedge, not a fast transient.
Standalone, Alt-4 is symptom-masking of a non-terminating stall (identical in kind
to the diagnosis's rejected lever-4 "raise the 60s timeout"). It is honest and
useful ONLY paired with a root fix (Alt-1/2/3) that makes the concentration
actually clear within seconds — and even then it needs no code change.

---

## 1. The rejection path (file:line)

- CREATE TABLE provisioning: `src/query/sql-query-engine-initial-partition-provisioning.js`
  `provisionInitialTablePartition` (:31). It probes admission per candidate node
  (`checkProvisioningAdmission`, :296-303), collects `rejectedTargetNodePlans`,
  and if `maximumProvisionableReplicaCount < minimumRoutableReplicaCount` throws
  `throwProvisioningInsufficientTargets`
  (`sql-query-engine-provisioning-admission-methods.js:280-314`) — the observed
  `Unable to satisfy minimum routable provisioning cohort … required=2,
  provisionable=0, target=3` at 11:54:36.251.
- The per-node rejection is minted upstream in the rebalancer:
  `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`
  `ensureOperationLedgerQuorumSpreadFirst` (:315-338) throws a typed admission
  error with `reason=operation_ledger_quorum_concentrated` via
  `buildOperationLedgerInterlockAdmissionResult` (:48-55). The concentration is
  evaluated from **actual placement rows** by
  `evaluateOperationLedgerQuorumConcentration`
  (`operation-ledger-quorum-concentration.js:170`), engaging only when
  `spreadActionable` (a feasible spread target exists OR the ledger is over-target,
  :154).

## 2. Is the coupling legitimate or false? — LEGITIMATE (not a placement false-coupling)

The block is **not** "these 5 nodes cannot host the new data table." Every
operation persists its workflow progress into the `replica_operations` LEDGER
(interlock-admission header comment :18-27, :99-127). Provisioning a new data
table means creating ADD operations whose progress writes land on that ledger.
While the ledger quorum is concentrated on one hot node, admitting new
progress-writing operations is exactly the run-20 storm the interlock exists to
prevent. So the coupling is on the **shared ledger-write path**, not on the data
table's placement geometry — it correctly rejects *all* nodes because the blocked
resource is the singleton ledger, not any candidate host. Emergency
quorum-restore ADDs to control-plane partitions are explicitly exempt (:136-141);
a plain data-table ADD is correctly non-exempt (it does not cure the ledger). The
rejection is therefore **correct, not over-broad** — the "reject all 5" shape is a
property of the shared resource, not a false fan-out.

## 3. Existing tolerance machinery — it already covers this case, and it fired

`waitOutWholeClusterTransientProvisioningHold`
(`sql-query-engine-initial-partition-provisioning.js:691-728`) is Alt-4, already
built:
- `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`
  (`sql-query-engine-provisioning-admission-methods.js:7-24`) **already includes**
  `operation_ledger_quorum_concentrated` (:23), alongside the two self-move codes.
- When the short convergence window (`TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS`
  = 1s; adaptive floor `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS` = 10s) ends
  with `provisionable=0` and every rejection transient, it re-waits under
  `maxWaitMs: this.tablePartitionProvisioningTimeoutMs` = **30s**
  (`TABLE_CREATE_PROVISION_TIMEOUT_MS`, `query-constants.js:427`).

**Why it did not save run3 — direct log evidence (the decisive finding):**
- The transient-hold re-wait FIRED: `Whole-cluster transient provisioning hold;
  waiting it out under the provisioning budget` at **11:54:15.866**, `maxWaitMs:30000`,
  all 5 targets `operation_ledger_quorum_concentrated`.
- It then threw `Insufficient admissible provisioning targets` at **11:54:36.251**
  — ~20s later (bounded by the caller `timeoutBudget`'s remaining headroom, not the
  full 30s), with the concentration **still present on all 5 nodes**.
- The quorum-spread hold was engaged continuously across the whole CREATE window:
  `OPERATION_LEDGER_QUORUM_SPREAD_HOLD` warnings (30s-throttled) at 11:52:09,
  11:52:40, 11:53:10, 11:53:59, 11:54:29 — right up to the abort. The hold's total
  span is 11:45:33 → 11:54:29 (~9 minutes).

So the existing wait waited nearly its full budget and observed **zero** clearing.
The concentration is a persistent wedge on this run's timescale, not a
sub-30s transient.

**Reuse-first:** there is nothing honest left to extend. The wait is already
pointed at this reason code and already uses the full provisioning budget.
Lengthening it beyond 30s (a) would not clear a wedge that did not move in 20s and
persisted ~9 min, and (b) would blow the demo/client deadline — the same
`internal-pacing` violation in reverse. The lever is upstream (clear the
concentration), not in the wait.

## 4. Honesty check (`internal-pacing-not-client-fidelity`)

The directive says a cluster transient that surfaces client-visible IS the bug —
i.e. the CREATE *should* wait out a genuine transient. The legitimacy of Alt-4
turns entirely on: **does the ledger concentration self-clear without the root
fix?** The diagnosis (§4) says the over-target 4-voter overflow "does not
self-clear because the corrective drain is being skipped" by the self-move
interlock; the one REMOVE that could spread the quorum did not complete until
11:52:04 and removed the *failed learner*, not the over-target voter. The run3
logs confirm: the concentration held continuously for ~9 minutes and did not
budge during the CREATE's 20s wait. `spreadActionable` is true (over-target), so
the system believes a spread is possible — but the spread is interlock-blocked in
practice. This is a **non-terminating stall dressed as a transient**. Waiting
longer only defers the abort; it does not convert a wedge into a success. That is
precisely the masking the directive warns against, and it is the same reasoning
that made the diagnosis REJECT lever-4 (raise the 60s promotion timeout).

Conversely, once a root fix (Alt-1 drain-leg interlock exemption, or Alt-2/3
promotion-credit path) lets the 4th voter drain, the concentration clears in
seconds — and the *existing* wait already absorbs that brief residual window
without failing the client. That is the legitimate internal-pacing role, and it
is already in place.

## 5. Proof / live-A/B design (if ever pursued as a complement)

- **Observable that proves honest wait-out (complement mode):** with a root fix
  applied, a CREATE that hits the transient hold emits
  `TABLE_PARTITION_TRANSIENT_HOLD_WAIT`, then *succeeds*
  (`Initial table partition provisioning completed`) rather than
  `Insufficient admissible provisioning targets` — and the gap between hold-start
  and success is bounded (< a few seconds), matching the concentration clearing in
  the `OPERATION_LEDGER_QUORUM_SPREAD_HOLD` warn stream ceasing.
- **Observable that would expose masking (standalone mode):** the hold-start →
  abort gap equals the full budget and the spread-hold warn stream never ceases —
  exactly the run3 signature (11:54:15 wait → 11:54:36 abort, warns through 11:54:29).
- **Live A/B:** 2-pre / 2-post on the affinity demo, watching (i)
  `Whole-cluster transient provisioning hold` → outcome (`completed` vs
  `Insufficient admissible provisioning targets`) for the ratings partition, and
  (ii) whether `OPERATION_LEDGER_QUORUM_SPREAD_HOLD` warnings terminate before the
  provisioning budget. Alt-4 alone should show NO change (it is already present);
  a root fix should flip the outcome. This isolates that Alt-4 is inert without a
  root fix.

## Bottom line

Alt-4 is already implemented, already fired in run3, and already failed — because
the ledger concentration in this scenario is a persistent interlock-blocked wedge,
not a fast transient. **viable-only-as-complement.** Do NOT ship it as the
demo-greening fix (it is a no-op / a longer-deferred abort). The binding work is
Alt-1/2/3 (clear the stacked 4th voter so the concentration lifts); the existing
`waitOutWholeClusterTransientProvisioningHold` is the correct, already-present
resilience layer that will absorb the residual once the wedge is gone — no change
needed there.
