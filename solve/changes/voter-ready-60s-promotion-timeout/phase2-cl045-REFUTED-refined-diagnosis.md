# Phase 2 (CL-045) REFUTED by live sub-reason breakdown — refined diagnosis

Phase 2 shipped CL-045 (over-count surplus-drain relief for the concurrent-op
serialization) on the hypothesis that the surplus REPLACE's remove-leg was
persistently blocked by the CL-043 concurrent-partition-operation gate. The live
A/B (3 POST Part-1+Part-2) REFUTES that hypothesis.

## Why it's refuted

**CL-045 fired only 0/0/1 times across the three POST runs.** And the sub-reason
breakdown of the blocked drains — on the REAL deadlock run (the one with 13
voter-ready-60s timeouts) — shows the concurrent-op gate CL-045 targets is a MINOR
contributor:

| gate blocking the surplus drain | count | CL-045 addresses? |
|---|---|---|
| `would_exceed_target` — promotion guard (activeVoterCount 4-5 / target 3) | 345 | no (guard side) |
| `would drop voter-ready below minimum` — drain floor (2/3) | 318 | no |
| `replacement is not voter-ready` (:522) | 142 | no |
| WAIT_REPLACEMENT_LEADER / handoff | 26 | no |
| **`concurrent partition operation` — CL-045's target** | **20** | yes (minor) |

Relaxing the concurrent-op gate (20) cannot break a deadlock where the floor (318)
and the guard (345) independently block. The earlier disk-confirm verified
`replace_remove_safety_blocked` existed and the surplus was a live-REPLACE source,
but did NOT break down the SUB-reason and wrongly assumed concurrent-op — the exact
check the Alt-3a research agent said to run.

## The REAL deadlock (refined, evidence-backed)

A raft-voter-count vs voter-ready-count disagreement, rooted in a 4th raft-voter
that never reaches voter-ready within 60s:

- A REPLACE's replacement promotes to raft-voter (raft count → 4) but is NOT
  voter-READY (routable) yet — still syncing.
- Promotion GUARD counts 4-5 raft voters (`activeVoterCount:4` ×294, `:5` ×51,
  target 3) → defers further learner promotion (345×).
- Drain FLOOR counts only 3 voter-READY (`storage_reservations-p1 would drop
  voter-ready below minimum (2/3)` ×187) → draining the source → 2 < min 3 →
  defers the drain (318×).
- Both wait for the replacement to become voter-ready. It doesn't within 60s → the
  "did not become voter-ready within 60000ms" timeout → REPLACE fails → churn.

**Binding question: why does a promoted raft-voter fail to reach voter-ready
(routable) within 60s?** That is a REPLICA READINESS / ROUTABILITY root
(`isVoterReadyRoutableReplica` / cluster-member-health / lease / catch-up), NOT a
rebalancer-accounting root. It looks connected to the prior MODE-A
(`isClusterMemberHealthy` stale-heartbeat) / readiness-veto / hysteresis-
consolidation work in memory — NOT to Part 1 (over-creation cap) or Part 2
(concurrent-op serialization).

## Decisions

- **REVERT Phase 2 (CL-045).** Fired 0/0/1 live; addresses 20 of ~345 blocks; a
  quorum-safety-path carve-out with no demonstrated benefit (s9 lesson: do not keep
  a fix that does not demonstrably help). Its DTs (surplus-drain-serialization)
  are removed with it.
- **KEEP Part 1 (`bf535665`).** Proven, industry-correct, reduces over-admission,
  live-improves the target symptom, no regression.
- **Next root = replica voter-ready readiness/routability.** Diagnose why a promoted
  raft-voter fails to reach voter-ready within 60s (readiness-veto / catch-up /
  cluster-member-health path). Fresh diagnosis, likely the hysteresis/readiness
  domain, not the rebalancer.

## Process lesson (recorded)

The disk-confirm proved the surplus was a live-REPLACE source but stopped short of
breaking down the DEFERRAL SUB-REASON. Attributing the block to concurrent-op
without that breakdown sent Phase 2 at a 20-of-345 gate. Always break down the
actual deferral reason distribution before choosing which gate to relax.
