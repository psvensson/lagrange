# Run1 refined timeline — the phase-4 blocker is an edge-triggered provisioning-convergence deadline that gives up during a transient eligibility dip, then up-replication never heals the degraded single-replica

Session s12 (2026-07-07), deeper dig on the vet-confirmed run1 root. Evidence: `run1-full/` scratch
copy (logs + DBs). **Corrects my committed s12 finding**, which attributed the dip to a
`control_plane_publications` write-leader handoff — there was NO handoff at 18:00.

## The corrected trigger — NOT a leadership handoff
`control_plane_publications` leadership was **stable 17:57:04 → 18:05:33** (next "Lost leadership" is
teardown). No handoff at 18:00. Instead:
- **Chronic background churn all run:** `MEMBERSHIP_SWIM_DIVERGENCE` ×251 (17:49→18:05), "Repaired
  readiness cache from authoritative rows" ×446 (17:49→18:05). The readiness cache is continuously
  wrong and continuously repaired; SWIM continuously diverges. Root of the churn = peers slow to ACK
  SWIM pings ("Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)" — the
  existing quarantine-grace fires correctly, so nodes are NOT quarantined, but membership still logs
  divergence and the readiness cache still goes stale).

## The dip and the deadline collision
- Provisioning admissions were **ALLOWED at 17:59:57**, then **DENIED 100× from 18:00:08 → 18:00:18**
  (all `eligibleNodeIds:[]`, `reasonCodes:[cluster_member_unhealthy, control_plane_write_unhealthy]`,
  every candidate failing `[clusterMemberHealthy, placementEligible, provisioningEligible,
  controlPlaneWrite…]`), then **ALLOWED again at 18:00:24**. A ~10-15s eligibility dip bracketed by
  working admission.
- `tbl-d11e7bb8-p1`'s **`Provisioning target-node convergence timed out` fired at 18:00:18.160Z** —
  i.e. the convergence deadline landed *inside* the dip and gave up ~6s before eligibility recovered.

## The consequence — degraded single-replica, never up-replicated
Immediately after the timeout (18:00:18–22):
```
18:00:18.160 Provisioning target-node convergence timed out
18:00:18.160 Using degraded provisioning target-node fallback
18:00:18.229 Create dispatch proceeding without bootstrap topology
18:00:18.5   Handling CREATE_REPLICA / Sending replica operation  (r1 only)
18:00:19.4   Single replica - becoming leader immediately  (peers=0/0)
18:00:20.120 Table created successfully
18:00:22.932 Operation completed
18:02:04.259 "Replica target is constrained by available ready nodes"   ← up-replication blocked
```
So the degraded fallback created **only r1** (single replica). The later up-replication attempt
(18:02:04) was **"constrained by available ready nodes"** and never added r2/r3. On disk tbl-d11e7bb8
is **1/3** — below the routable minimum (run2's cohort message: `required=2, target=3`) → the table is
not routable → phase-4 (service placement/attribution on its data) times out.

## Two-part mechanism (both needed to green)
1. **Edge-triggered convergence deadline gives up during a transient dip** → degraded single-replica
   instead of a full cohort. (Had it ridden out ~6s more, eligibility was back.)
2. **Up-replication never heals the degraded table** ("constrained by available ready nodes" 18:02) —
   even after the dip ends, the 1/3 table is not driven back to 3/3.

## Candidate fix directions (to VET in parallel — none built)
- **T-A (level-triggered / ride-out):** don't abandon provisioning convergence during a <~15s
  all-unhealthy transient; retry-with-backoff or an adaptive/longer deadline (cf. K8s unschedulable
  requeue). Would place a full cohort instead of degraded-single.
- **T-B (eligibility signal quality):** chronic readiness-cache staleness + SWIM divergence spuriously
  mark healthy nodes unhealthy; REUSE the existing "slow, not dead" quarantine-grace in the
  provisioning-eligibility predicate so a slow-ACK peer isn't excluded from placement.
- **T-C (up-replication recovery):** a level-triggered up-replication that drives a degraded
  under-replicated table back to full cohort once nodes are ready (cf. CockroachDB AllocatorAddVoter
  continuously up-replicating under-replicated ranges). Heals the residual even if the dip happens.
- **T-D (root churn):** reduce the background SWIM-divergence / readiness-cache-staleness churn (why
  446 repairs? peers slow to ACK — event-loop/CDC load) so the dip never forms.

Run2's blocker (self-move interlock rejecting the cohort) is a DIFFERENT trigger (over-target
self-move thrash, sibling quest) but shares the theme: a transient control-plane condition denies a
data-table provisioning cohort and the deadline gives up. T-A/T-C would also blunt run2.
