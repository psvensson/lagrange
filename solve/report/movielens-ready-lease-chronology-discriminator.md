# Solve report: movielens-ready-lease-chronology-discriminator

**Goal:** A deterministic production-seam lease chronology witness names the exact active node rejected by ControlPlaneSnapshotOwner and correlates its canonical nodes-row heartbeat, owner-minted lease expiry, row-write HLC, and per-key CDC observation in the MovieLens schema-admission report; replayed publication failure, write-owner delay, CDC delay, and inactive-node controls are classified without changing readiness, repair, or admission outcomes.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-ready-lease-chronology-discriminator-2026-07-20T19-11-26-450Z.report.json

**Attempts:** 0

## Links
- spec: solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md
- parent quest: movielens-ready-lease-maintenance-critical-owner-lane
- plan: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **movielens-ready-lease-chronology-discriminator-main** [open] rung 0, attempts 0, metric ? -> 0

## Findings
- **movielens-ready-lease-chronology-discriminator-main**: Successor preserves the parent lineage's refuted levers before changing source (rules out: Do not rerun unchanged, reopen the exhausted maintenance Quest, change dispatch priority alone, or attribute the recurrence to per-table cache versions until the production-seam chronology witness discriminates owner write and per-key CDC visibility.) [quest:movielens-ready-lease-maintenance-critical-owner-lane]
- **movielens-ready-lease-chronology-discriminator-main**: Reverting production implementation while retaining the five guard files fails at the cache provenance, snapshot witness, and MovieLens projection seams (1/5 green); current source passes 5/5. (rules out: The scenario cannot pass from test-only fixtures, the existing table-wide cache apply watermark, or the already-verbatim live-report serializer.) [worktree:6fb95f9f-red-on-revert]
- **movielens-ready-lease-chronology-discriminator-main**: On clean source fingerprint 821892b96366f4db at commit 039804e6, the single permitted five-node MovieLens run passed schema admission and preload admission with a quiescent snapshot and readyLeaseAgeWitness unavailable:no_stale_active_node, then failed later because runtime service replicas were not initially placed; seed host-scheduling gaps exceeded the 60000ms total budget, so the downstream placement outcome is non-attributable and does not justify a source change or rerun. (rules out: The prior cache_stale_watermark recurrence is not the first violated invariant in this changed-source run; the host-invalidated later placement failure cannot reopen the heartbeat or cache freshness path.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T19-26-43-793Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
