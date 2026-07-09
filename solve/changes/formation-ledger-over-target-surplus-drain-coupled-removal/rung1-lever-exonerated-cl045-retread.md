# RUNG-1: the coupled-removal / CL-043 lever is EXONERATED — it re-treads the reverted CL-045

RUNG-1 is the mandatory DT-first discovery rung: reproduce the durable over-target
surplus and confirm WHICH drain-blocking layer is live before sealing any fix. The
finding is that this quest's framed lever (Alt-3a: relax the CL-043 concurrent-op
serialization so the REPLACE's own remove-leg drains the surplus) is **already
implemented, live-A/B-refuted, and reverted** as **CL-045**. Re-deriving it here
independently re-confirmed the refutation. The frontier is **EXHAUSTED** on this
lever.

## What was built and then discarded (the re-tread)

A deterministic reproduction on the REAL `evaluateRemoveSafety` gate
(`createTestCoordinator` → `workflowOwner.evaluateRemoveSafety`) confirmed, red-on-
revert, that:

- Layer (i) — the CL-043 concurrent-op serialization
  (`operation-workflow-remove-safety-evaluator.js:409`) — DOES defer an over-target
  (4 voter-ready rows / min 3) REPLACE source-removal whenever any live concurrent
  op is co-resident, and CAN be relaxed for the over-target surplus-drain case.
- Layers (ii) admission and (iii) planner do not re-gate the REPLACE's own remove-
  leg (it is an already-in-flight REPLACE's ACTIVE-phase transition, not a newly
  planned/admitted REMOVE) — so at the safety-evaluator boundary, (i) is the layer
  that fires.

A candidate fix (new `isCriticalSurplusDrainOverReplicated` + a carve-out at the
concurrent-op gate) turned the reproduction green, red-on-revert, all 67 directly-
related safety tests green.

**This candidate is functionally identical to CL-045**
(`solve/changes/voter-ready-60s-promotion-timeout/phase2-cl045-implementation.md`):
same surplus-gated (`currentVoterReadyRows.length > minReplicaCount`) relief at the
same concurrent-op gate, same "downstream floor is the real guard" rationale, same
red-on-revert DT shape, same green regression profile. It was reverted.

The source changes and the reproduction test were reverted/removed. Nothing shipped.

## Why the lever is dead (two independent refutations)

### 1. Live A/B already refuted it (the authoritative evidence)

`solve/changes/voter-ready-60s-promotion-timeout/phase2-cl045-REFUTED-refined-diagnosis.md`:
on the real deadlock run, the deferral SUB-reason distribution is

| gate blocking the surplus drain | count | CL-045 / this lever addresses? |
|---|---|---|
| `would_exceed_target` — promotion guard (activeVoterCount 4-5 / target 3) | 345 | no (guard side) |
| `would drop voter-ready below minimum` — drain floor (2/3) | 318 | no |
| `replacement is not voter-ready` (`:522`) | 142 | no |
| WAIT_REPLACEMENT_LEADER / handoff | 26 | no |
| **`concurrent partition operation` — the lever's target** | **20** | yes (minor) |

CL-045 fired 0/0/1 across three POST runs. Relaxing a 20-of-~345 gate cannot break
a deadlock the floor (318) and guard (345) independently hold.

### 2. The quest's own "drain is safe" premise is false live (raft-voter vs voter-ready)

The quest statement asserts the quorum floor is "SATISFIED at 4->3/min3 so the
drain is SAFE." That uses the **raft-voter** count (4→3). The live drain floor
(`projectQuorumAfterRemoval` SIMPLE_FLOOR, evaluator `:551-564`) uses the
**voter-READY (routable)** count. Live there are 4 raft voters but only **3
voter-ready** — the 4th replacement promoted to raft-voter but is NOT yet routable.
Draining the source would drop voter-ready to **2 < min 3**, so the floor **correctly
refuses** (318×). There is no safe surplus to drain until the 4th voter becomes
voter-ready. This is the s13/s14 raft-voter-count vs voter-ready-count read
disagreement, and it means the coupled-removal class is structurally inapplicable
to this gate: coupling removal to a promotion that itself cannot complete does not
help.

### 3. Adversarial vet independently flagged the naive lever as unsafe anyway

An adversarial pass showed even the naive relaxation is TOO BROAD: it re-permits two
concurrent membership changes on the partition (the surplus-drain REMOVE dispatching
alongside an independent concurrent op), tripping
`test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js:243` and
violating the quest's c-vet/c-class constraint ("reject any lever that re-permits
two concurrent membership changes"). So the lever is both non-binding AND unsafe.

## Process lesson (already recorded in the CL-045 refutation, re-confirmed)

Break down the actual deferral SUB-reason distribution before choosing which gate to
relax. The disk-confirm (`phase2-path-research-synthesis.md`) proved the surplus was
a live-REPLACE source and that `replace_remove_safety_blocked` existed, but did NOT
break down the sub-reason and wrongly attributed the block to concurrent-op
serialization. The quest draft inherited that attribution as its leading hypothesis.

## The real root (out of this quest's scope)

Why does a promoted raft-voter fail to reach voter-ready (routable) within 60s? That
is a REPLICA READINESS / ROUTABILITY root (`isVoterReadyRoutableReplica` /
cluster-member-health / lease / catch-up) — the readiness-veto / hysteresis-
consolidation domain (memory: MODE-A `isClusterMemberHealthy`, node-liveness-veto
consolidation) — NOT rebalancer accounting or serialization, and NOT app-tier
coupled removal (this quest's declared class, c-class). It needs a fresh quest in
the readiness/routability domain.

## Recommendation

Close this quest **EXHAUSTED**: the framed drain-blocking layer is exonerated
(re-tread of reverted CL-045; 20/345 non-binding; premise false live; naive form
unsafe). Author a successor quest targeting the replica voter-ready-routability root
(why a promoted raft-voter is not routable within 60s), which is the layer the live
deferral distribution (promotion-guard 345 + drain-floor 318) actually binds on.
