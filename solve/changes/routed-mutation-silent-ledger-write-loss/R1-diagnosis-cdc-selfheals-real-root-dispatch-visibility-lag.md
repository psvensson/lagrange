# R1 diagnosis (VET-CORRECTED) — CDC self-heals; A1 resolved gap-v; residual redness is out-of-domain PROVISIONING-ADMISSION fragility

Session s12 (2026-07-07). Picks up the s11 HANDOFF R1 item. Two post-A1 affinity-demo runs
(run1 17:48→18:05 phase-4 fail; run2 21:22→21:26 [2/4] fail), on-disk SQLite + full logs, plus an
adversarial vet subagent that REFUTED my first-pass run1 root. **The vet corrections are folded in
below and are the authoritative conclusion — the initial "dispatch-visibility-lag is THE blocker"
framing (kept in git history of this file) was wrong.**

## 0. Headline
- **R1 as framed (level-triggered re-drive on the CDC read-back) is a NON-ISSUE. Do not build it.**
  The `No row found for CDC update` events self-heal (0 immortal on the full-length run; converge to
  identical terminal quorum state).
- **A1 resolved this quest's chartered gap-v** (routed-mutation silent ledger write-loss): across two
  runs, zero durability-fitness flap, all residual ledger ops quorum-consistent, no phantom-ack /
  diverged-terminal write-loss.
- **The doneWhen stays red on high-variance PROVISIONING-ADMISSION failures on a data table** — a
  different upstream trigger each run, NEITHER of which is CDC, a durability write-loss, or a
  stuck-ledger-op. These live in the affinity-placement / over-target-self-move domain, NOT here.

## 1. CDC self-heal — SURVIVES vet (CLAIM 1)
114 distinct No-row-found keys (replica_operations 24 / services 37 / storage_reservations 46 /
partitions 7). Global max re-drives = 5; **0 keys immortal** (last event 18:00:22, 5.5 min before end).
All 24 replica_operations keys are terminal on disk (21 REMOVED, 3 ACTIVE, none stuck-PENDING); zero
FAILED. Sampled high-recount ops (a7fff2ea, e06fec2e, 2b443c1b, 774914a4, 802051f4) byte-identical
`removed/REMOVED/<same completed_at>` across r3/r4/r5. Run2 same pattern (its 3 "immortal" keys are
low-count artifacts of the [2/4] abort at 288s, not full-run re-drive). → transient self-healing lag.

## 2. Durability lie — PARTIALLY holds (CLAIM 2, vet-softened)
Zero `leader_durability_unfit_*` across BOTH runs (the pre-A1 flap is gone). The residual in-flight
ops are byte-identical across replicas (no leader-only / diverged-terminal). **Caveat the vet caught:**
r5 in run1 has 49 vs 52 rows — it is missing **3 early TERMINAL rows** (30f458a6, 379ac87b, ff958a20)
despite identical committedIndex=346 on all three. So a small apply-state lag persists on one replica;
"A1 eliminated ALL divergence" overreaches. It is benign here (doesn't touch the in-flight set or any
routable partition) but should not be asserted away.

## 3. My first-pass run1 root (dispatch-visibility-lag on ab83742f) — REFUTED by vet (CLAIMS 3+4)
I over-anchored on a dramatic 137× dispatch-defer loop for ADD `ab83742f`. The vet dismantled it:
- **Count inflated:** 137 = 99 genuine `Cache update not observed` + 38 `shutdown_in_progress` teardown.
- **Its table is ALREADY FULLY PLACED.** ab83742f and sibling 95dc3f70 are two ADDs for the SAME
  `tbl-a08a77c7-p1` 3-replica set; **all 3 replica DBs exist on disk** (verified: node-0 r1, node-1 r2,
  node-2 r3). ab83742f is a *self-move* (source==target==coordinator) for r1 which physically exists —
  a **redundant stuck ledger row on an already-placed table**, not a placement blocker.
- **Its No-row-found was on `storage_reservations`, NOT replica_operations** (the reservation-release
  read). Its four replica_operations CDC fetches all succeeded. Decisive counter-example: sibling
  95dc3f70 *did* hit No-row-found on replica_operations and still reached ACTIVE. So CLAIM 4's causal
  chain (CDC-miss froze the terminal persist) is **misattributed**. ab83742f's PENDING freeze is a
  dropped progress-write on the single-partition self-move ADD path — plausibly A1-adjacent, unproven,
  and NOT the phase blocker.

## 4. The REAL run1 phase-4 blocker (vet-found, disk-verified) — a zero-eligible-nodes window
`tbl-d11e7bb8-p1` is **under-replicated 1/3** on disk (vs a08a77c7's 3/3). The only convergence
timeout in run1 is for it: `Provisioning target-node convergence timed out` @ 18:00:18. Cause: a **10s
window 18:00:08→18:00:18 with 100 `Provisioning admission denied for storage-increasing move`, ALL
`eligibleNodeIds:[]`**, `blockingReasons:["insufficient_placement_eligible_nodes","control_plane_write_unhealthy"]`,
`reasonCodes:["cluster_member_unhealthy","control_plane_write_unhealthy"]`, every candidate node failing
`failedDimensions:[clusterMemberHealthy, placementEligible, provisioningEligible, controlPlane…]`.
During this window tbl-d11e7bb8's 11.5MB ADD could find NO eligible target → stayed 1/3 → phase-4 fails.
**Upstream trigger:** control_plane_publications write-leader flux + SWIM membership divergence
(`Membership reconcile deferred: not the control_plane_publications write-leader` ×153,
`MEMBERSHIP_SWIM_DIVERGENCE` ×33, `Repaired readiness cache from authoritative rows` ×48 in 17:59–18:01).
Run1 had only **2** ledger self-moves — so this is NOT self-move thrash; it is a membership/
control-plane-leadership health transient.

## 5. The run2 [2/4] blocker — the ledger self-move interlock (memory s6/s7)
Run2's control plane SETTLED cleanly (34 completions), then `[2/4]` load FAILED:
`Unable to satisfy minimum routable provisioning cohort for tbl-8d8d99ee-p1: required=2,
provisionable=0, rejected=…×3:operation_ledger_self_move_in_flight` (`operation_ledger_self_move_in_flight`
×140). A ledger self-move `ece665d7` (REPLACE, byte-identical SYNCING across all 5 replicas) spawned
DURING the load phase and, mid-sync, tripped the interlock that rejects the data-table provisioning
cohort. This is memory s6/s7's **self-move thrash + interlock-defers-provisioning**, root owned by the
sibling `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`. Memory (runs 20/22):
**do NOT narrow the interlock — UNSAFE + INEFFECTIVE.**

## 6. Unified conclusion & disposition
| run | data-table victim | proximate trigger | phase |
|---|---|---|---|
| run1 | tbl-d11e7bb8 (1/3) | 10s zero-eligible-nodes window: control_plane_write_unhealthy + SWIM divergence + cp_publications write-leader flux | phase-4 timeout |
| run2 | tbl-8d8d99ee (0 provisionable) | ledger self-move interlock rejects cohort (self-move thrash) | [2/4] timeout |

- **The residuals are PROVISIONING-ADMISSION / placement-eligibility failures**, high-variance, with
  independent upstream triggers (membership/leadership health vs self-move interlock). They are NOT in
  the routed-mutation (gap-v) quest's domain.
- **A1 discharged this quest's chartered scope.** Recommend the routed-mutation quest be recorded
  SOLVED-for-scope / handed to the placement domain: no write-loss remains; CDC self-heals.
- **Do NOT build:** (a) CDC read-back re-drive (self-heals), (b) a stuck-ledger-op reaper *as the
  doneWhen fix* — the vet's decisive caveat: it would not green either run because the binding failure
  is provisioning-admission eligibility, not a stuck ledger op. (A reaper may still be a minor hygiene
  win for ab83742f/e2d6cd3b redundant rows, but it is NOT the doneWhen lever.)
- **Next binding work is out-of-quest:** run1's membership/control-plane-write-health transient
  (why do all nodes go provisioning-ineligible for 10s? cp_publications write-leader flux) and run2's
  self-move thrash (the over-target sibling). Both are placement-domain.

## 7. Method / traps
Disk-first on both runs; adversarial vet REFUTED 3 of 4 first-pass claims (the value of the posture —
the dramatic 137-defer loop was a decoy on an already-placed table). Confirmatory 2nd run proved the
binding blocker VARIES run-to-run (trap 6). No fix shipped. Stable mechanism signals used
(self-heal, durability-flap-count, eligibleNodeIds:[]); aggregate-outcome claims backed by 2 runs.
