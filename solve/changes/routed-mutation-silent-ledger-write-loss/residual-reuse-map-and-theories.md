# Residual reuse-map + theory set (from 2 code-archaeology subagents; literature pending)

Session s12 (2026-07-08). Two adversarial code-archaeology subagents mapped the provisioning-admission
eligibility path and the control-plane health / membership / self-move machinery. This is the reuse
inventory + the theory set to vet in parallel. **No fix built.**

## The residual, precisely (both runs share a theme; different triggers)
Both are: *a transient control-plane condition denies a DATA-table provisioning cohort, and the
edge-triggered deadline gives up instead of riding it out.*
- **MODE-A (run1, phase-4):** a ~10-15s eligibility dip zeroes the eligible-node set →
  `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`=10000ms convergence wait times out mid-dip
  (`failOnTimeout:false`) → **degraded fallback places a single replica** → rebalancer up-replication
  then "constrained by available ready nodes" → table stuck 1/3 → not routable.
- **MODE-B (run2, [2/4]):** a live ledger self-move trips the partition-blind interlock →
  ALL provisioning targets deferred → the documented **OWNED RESIDUAL fails fast** (no pacing).

## Why the eligible set zeroes cluster-wide (MODE-A trigger)
`eligible = dimensions[provisioningEligible] && capacity.allowed` (`storage-admission-service.js:287`);
`provisioningEligible` ⊂ `writeEligible = clusterMemberHealthy && routingReady &&
writableControlPlaneService && publicationHealthy` (`runtime-authority-methods.js:273-277`).
- `clusterMemberHealthy` is per-node heartbeat/lease/connection_state, but **flips en masse when
  heartbeat CDC lags** (self-node fast-path protects only the local node).
- `publicationHealthy`/`controlPlanePublished` read a **single cluster-wide `membershipPublication`**
  object — one momentarily-not-PUBLISHED epoch flips ALL nodes at once.
- In run1 there was **no leadership handoff at 18:00** (leader stable 17:57→18:05); the trigger was a
  SWIM ACK-timeout blip (~17:59:40, peers "slow, not dead") → heartbeat/readiness-cache staleness →
  the health dimensions momentarily false for all remote candidates. Chronic churn: readiness cache
  repaired 446×, SWIM diverged 251× across the run.

## ⭐ Reuse inventory — 4 proven hysteresis mechanisms already in-repo, NONE guarding eligibility
| Mechanism | file:line | Shape | Fit |
|---|---|---|---|
| ACK-timeout quarantine liveness guard (CL-007 "never break, only slow") | `transport/message-router-reconnect-behaviors.js:555-607` (defaults `message-router.js:77-99`) | streak ≥N (default 2) + recent-inbound-evidence veto (30s window) | **BEST** front-side grace for the eligibility flip |
| Lease-sweep transport-connected grace | `control-plane/lease-service.js:196-230,278-289` | slow lease-expiry vetoed by live transport (CONNECTED/READY) | slow "unhealthy" vetoed by live transport |
| Projection `membershipFreeze` (broad-suspicion retention) | `control-plane/active-node-projection.js:39-43,685-717` | retain published set when suspected ratio ≥0.5 (min 3 pub/2 susp) | **CLOSEST analog to run1** "don't zero when many flap at once" |
| Authoritative-repair cooldown ladder | `control-plane/authoritative-node-evidence-reconciler.js:18-29,680-689` | 5s success / 30s fail / 15s no-change / 1s bypass-floor per key | rate-limit re-eval (reactive; needs front-side grace too) |
| CONVERGENCE_GRACE provisioning state | `runtime-authority-methods.js:315-319`; `diagnostics-eligibility.js:592-613` | keeps provisioningEligible=true while publication converges | **exists but gated on active recovery only** |
| Transient-shortfall allowlist + lowered floor | `sql-query-engine-provisioning-admission-methods.js:7-24,202-272` | classifies cluster_member_unhealthy + control_plane_write_unhealthy as transient; drops DDL fallback min to 1 | already lists MODE-A/B reasons; only lowers DDL floor |
| Whole-cluster transient-hold re-wait | `initial-partition-provisioning.js:707-728` | re-waits a 2nd full window when all rejections transient | **but all-deferred still fails fast (OWNED RESIDUAL)** |
| Self-move interlock ghost re-verify + CL-043 staleness | `rebalancer/rebalance-coordinator-ledger-interlock-admission.js:83-97,225-302` | owner-RPC re-verify drops terminal ghosts | interlock is intentionally partition-blind |

## GAPS (mapped)
1. **Provisioning eligibility zeroing has NO front-side grace** — a momentary cluster-wide health flip
   empties `eligibleNodeIds` with no streak/liveness/broad-suspicion veto (`storage-admission-service.js:259-315`).
2. **Write-leader predicate has zero debounce** (`control-plane-publications-leadership.js:114-146`) —
   general handoff-storm mechanism (not run1's trigger, but real).
3. **All-targets-deferred provisioning fails fast** (`sql-query-engine-provisioning-admission-methods.js:16-20`
   OWNED RESIDUAL) = MODE-B's exact surface.
4. **Degraded single-replica is not reliably up-replicated** — rebalancer "constrained by available
   ready nodes" (18:02) never heals 1/3 → 3/3.
5. **Self-move thrash** upstream in the planner drain-phase/over-target accounting blind spot
   (`move-planner-move-calculation-methods.js:312-316,507-582` + `in-flight-aware-replica-count.js`) =
   sibling quest `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot` (MODE-B root).

## Theory set to VET in parallel (each = mechanism + reuse locus + kill-question)
- **T-A1 — front-side eligibility grace (REUSE membershipFreeze / ACK-quarantine streak+veto).** Don't
  zero the provisioning eligible-set on a momentary cluster-wide health flip; require N consecutive
  unhealthy + no fresh live evidence, or retain-under-broad-suspicion. Kill-Q: does a graced eligible
  set actually place a full cohort, or does capacity/other dim still block? Would it wrongly admit a
  genuinely-dead node?
- **T-A2 — extend CONVERGENCE_GRACE to ordinary blips.** Promote provisioningEligible to grace on a
  bounded momentary publication/heartbeat blip, not only active-recovery. Kill-Q: bounded safely? risk
  of placing onto a node that can't actually accept writes?
- **T-A3 — up-replication recovery (the second half).** Make the level-triggered rebalancer drive a
  degraded under-replicated table back to full cohort. Kill-Q: WHY was it "constrained by available
  ready nodes" at 18:02 — genuine capacity, or the same stale-readiness signal? Is this already
  attempted and blocked, or never attempted?
- **T-B1 — pace all-deferred provisioning instead of fail-fast (fix the OWNED RESIDUAL).** Extend the
  whole-cluster transient-hold re-wait to the all-targets-deferred-transient case. Kill-Q: does pacing
  just move the timeout, or does the self-move actually clear within a bounded wait? memory: don't
  narrow the interlock.
- **T-B2 — reduce self-move thrash (SIBLING quest).** Fix the drain-phase/over-target accounting blind
  spot so self-moves don't spawn during load. Kill-Q: is this in-scope here or purely the sibling? does
  it green MODE-B alone?
- **T-X — reduce root churn.** Cut the readiness-cache-repair (446×) / SWIM-divergence (251×) churn so
  no dip forms. Kill-Q: what CAUSES the churn (event-loop/CDC load)? is it fixable without a rewrite?
