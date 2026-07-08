# Residual: consolidated synthesis + ranked recommendation (4 adversarial theory-vets + 3 research reports)

Session s12 (2026-07-08). Capstone. Research (2 code-archaeology + 1 literature) then 4 parallel
adversarial theory-vets. Conflicts between vets resolved by evidence below. **No code shipped.**

## The residual is TWO modes; they do NOT share a fix
| | run1 (MODE-A, phase-4) | run2 (MODE-B, [2/4]) |
|---|---|---|
| Fails at | **1/3** replicas (degraded fallback minted r1) | **0/3** (`provisionable=0`, synchronous throw) |
| Binding root | one readiness signal (`clusterMemberHealthy`) collapses under a load-peak stale-heartbeat-ingest transient | **25 overlapping disruptive ledger self-moves** (thrash) trip the partition-blind interlock |
| Greenable in THIS quest? | **YES — one root-signal fix** | **NO — belongs to the sibling over-target/drain-phase quest** |

## run1 (MODE-A) — ROOT FOUND: `isClusterMemberHealthy` ignores live transport evidence
During the 18:00:08→18:00:18 dip, node-0 (coordinator) denied all 100 admissions with
`failedDimensions:[clusterMemberHealthy, controlPlaneWritable, repairEligible, provisioningEligible,
placementEligible, serveEligible]`. The vet proved **`clusterMemberHealthy` is the ONLY failing root**;
every other dimension derives from it. The peer nodes were **demonstrably alive and writable** in-window
(node-2 logged `Storage admission allowed ×12` + `Starting rebalancing ×4`; node-0 logged
`Skipped lease disconnect for transport-connected node ×10` for those same peers). The flip is a
**coordinator-local stale-INGEST artifact**: node-0's `Heartbeat failing repeatedly` from 17:56 left its
ingested `nodes` heartbeat rows ~195s stale while peers were healthy.

The gate (`control-plane-readiness-node-service-rows.js:503-514`):
```js
if (!this.isNodeTransportConnected(nodeId, nodeRow)) return false;  // TRUE in-window (grace fired 10×)
if (connectionState !== STATE.READY) return false;                  // "ready" in-window
return this.isRecentHeartbeat(nodeRow);                             // 195s stale → FALSE  ← the whole bug
```
The live transport "slow, not dead" evidence is ALREADY computed (the lease-sweep grace uses it) but is
not allowed to veto a stale heartbeat here.

**Why this one signal explains BOTH halves of run1** (unifies the T-A3 vet + T-A1 vet):
- Provisioning eligible-set: `clusterMemberHealthy → controlPlaneWritable → provisioningEligible` →
  empty set → 10s convergence wait (`TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`=10000 < ~16s dip)
  times out → **degraded single-replica** minted.
- Up-replication heal-path: data partitions key off **`REPAIR_ELIGIBLE`**
  (`unified-rebalancer-control-plane-readiness-methods.js:50`), also derived from `clusterMemberHealthy`.
  So `availableNodeCount:1` at 18:02 (all 35 degraded logs) → `actionableTarget=min(3,1)=1` →
  `isSuboptimalState`/`isCriticalState` both false → the ALREADY-level-triggered rebalancer never plans
  the heal ADD. The degraded 1/3 table is never cured.

### RECOMMENDED FIX (run1) — reuse the lease-sweep "slow, not dead" grace at the root signal
In `isClusterMemberHealthy` (`node-service-rows.js:503-514`): when a node is transport-connected AND
`connectionState==="ready"`, grace a stale heartbeat (do not fail closed on `isRecentHeartbeat` alone),
guarded by a streak/veto so a genuine drop still fails closed. This is the SAME pattern already proven
safe in the lease-sweep (`lease-service.js:196-230`) and the ACK-quarantine (CL-007).
- Fixes BOTH halves: keeps `clusterMemberHealthy→provisioningEligible` true through the dip (prevents
  the degraded-single) AND restores `REPAIR_ELIGIBLE` so the existing rebalancer heals any degrade.
- **Strictly dominates** the rejected alternatives (below): one root signal, no new read path, reuses an
  in-repo grace, industry-validated (Lifeguard self-awareness: a disrupted coordinator trusts live
  evidence over its own lagged ingestion; suspect≠dead; grace windows 3-50s ≫ the 16s dip).
- **Blast radius BROAD** (`clusterMemberHealthy` feeds load/serve/placement/provisioning/rebalancer).
  Risk: a transport-flapping-but-genuinely-partitioned node graced. Mitigation: veto requires LIVE
  evidence (transport-connected + connection ready), plus a streak. **MUST be validated with a
  2-pre/2-post live A/B** (memory `692c9dbb`: a unit-green/DT-proven hot-path health fix regressed live
  via load amplification). Designed+vetted+live-A/B increment, exactly like A1.

## run2 (MODE-B) — NOT greenable in this quest (sibling owns it)
25 distinct disruptive ledger REPLACE/REMOVE moves in 4 min (two wedged ~62s then FAILED:
`ab70c115` "did not become voter-ready within 60000ms", `2fb4f7dd` "failed during reconciliation") trip
the partition-blind interlock near-continuously. The DDL `ratings` create ALREADY paces ~30s
(adaptive 10s + 30s hard wait, `waitedMs` 10370 then 19339) and still fails; the one ~45s no-live-move
window was still blocked by `operation_ledger_quorum_concentrated` (self-move aftermath). Pacing longer
just relocates the deadline into ongoing thrash.
- **Lever = SIBLING quest `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`**
  (reduce thrash at `move-planner-move-calculation-methods.js:312-316,507-582` + `in-flight-aware-replica-count.js`).
- **T-B1 (remove the `hasExplicitMinimumRoutableReplicaCount` fail-fast at
  `sql-query-engine-provisioning-admission-methods.js:16-20`; let the explicit-minimum cohort ride out
  via `waitOutWholeClusterTransientProvisioningHold`):** SURVIVES-BUT-INSUFFICIENT — legitimate defensive
  hygiene (removes a hard throw), but does NOT green run2 alone and must not be shipped as if it does.
- Priority carve-out for data-table ADDs: **KILLED** (would narrow the interlock = memory 20/22 storm).
- Do NOT narrow the interlock.

## Vet verdicts (resolved)
- **T-A3 (up-replication purgatory): KILLED.** Rebalancer already level-triggered (re-ran 18:02); the
  block is the stale `REPAIR_ELIGIBLE` signal, not a missing retry. The root-signal fix restores it.
- **T-A1 (fold-level grace / membershipFreeze reuse): membershipFreeze KILLED** (layering violation —
  the suspected-ratio aggregate isn't in the per-node readiness context). Fold-level grace at
  `storage-admission-service.js:259-315` is too downstream (up-replication reads REPAIR_ELIGIBLE, not
  provisioning.eligible). **Correct locus = the root `isClusterMemberHealthy`** → this is the RECOMMENDED fix.
- **T-A2 (extend CONVERGENCE_GRACE): SURVIVES-BUT-INSUFFICIENT.** A clean 1-condition change at
  `diagnostics-eligibility.js:592-613` (grant grace when `controlPlaneRecoveryEligible` && transient
  `clusterMemberHealthy`, even while published — CONVERGENCE_GRACE fired 0× all run) would prevent the
  degraded birth, but it fixes provisioning.eligible ONLY and cannot restore the REPAIR_ELIGIBLE
  up-replication path → a degrade that forms is never healed. Inferior to the root-signal fix.
- **T-X (reduce churn): NO-GO.** The dip forms at a LOAD PEAK (ACK-slow/min ramps 24→40→43 around
  18:00; tbl-d11e7bb8 created 18:00:18 at the partition-split storm peak), not baseline churn.
  Reconciler already guards the burst (`DEFAULT_REPAIR_BYPASS_FLOOR_MS=1000`). Reducing baseline churn
  lowers dip probability but does not remove the mode — the system must TOLERATE the load-peak transient.
- **Demo-impatience: NO.** Demo timeouts (`CONVERGE_TIMEOUT_MS=600000`, `STALL_TIMEOUT_MS=300000`,
  `SETTLE_HARD_CAP_MS=900000`) NEVER fired in either failure. Genuine system bug. The only too-short
  constant is internal (`TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`=10000 vs ~16s dip) — but raising
  it alone is a band-aid that ignores the heal path and run2.

## Ranked plan
1. **run1 root-signal fix** (transport-veto on stale heartbeat in `isClusterMemberHealthy`). Highest
   leverage; reuse; fixes prevention + heal together. Gate: 2-pre/2-post live A/B + dt:prove red-on-revert.
2. **(optional, defensive) T-B1 hygiene** — remove the explicit-minimum fail-fast throw so a brief hold
   paces instead of erroring. Only AFTER the sibling thrash fix, and only if a run shows it helps. Not
   the run2 lever.
3. **run2** → route to the sibling over-target/drain-phase quest (out of this quest's domain).

## Do NOT build
T-A3 purgatory · T-A1 fold-level/membershipFreeze grace · T-A2 alone · T-X churn reduction · raise demo
timeouts · raise the 10s convergence window alone · narrow the self-move interlock · stuck-op reaper /
CDC read-back re-drive (prior vet: CDC self-heals).
