# Phase 2 (CL-045): over-count surplus-drain serialization relief

Implements the research-recommended Phase-2 direction (`phase2-path-research-
synthesis.md`): the durable surplus voter that Part 1 (`bf535665`) could not drain
is a LIVE-REPLACE source whose own remove-leg is persistently blocked by the
CL-043 concurrent-partition-operation serialization (disk-confirmed on the s14 A/B
logs: `replace_remove_safety_blocked` 326/32/83 across the three failing runs).
This is a deadlock, not a safety block.

## The deadlock

On a critical CP partition stacked at 4 voters / target 3:
1. surplus 4th voter (un-removed REPLACE source) → learner-promotion guard defers
   the paired learner (would exceed target) → 60s voter-ready timeout;
2. the timeout's ~1s promotion-retry churn keeps a concurrent op alive on the
   partition;
3. CL-043 sees that concurrent op → defers the REPLACE's own source-removal;
4. source stays → surplus persists → back to (1).

The quorum FLOOR (4→3, min 3) is satisfied — so draining is safe; only the
serialization holds it. CL-043's stale-step relief never fires (retry keeps the
step fresh); CL-044's down-target relief never fires (concurrent op targets a live
node); leader-handoff COMPLETES (disk-confirmed). Only the concurrent-op
serialization remains.

## The fix — a third sibling relief (one file)

`src/rebalancer/operation-workflow-remove-safety-evaluator.js`: alongside CL-043
(stale-step) and CL-044 (down-target), add **CL-045 (over-count surplus-drain
relief)**. When a REPLACE source-removal drains a partition holding a voter-ready
SURPLUS (`currentVoterReadyRows.length > minReplicaCount`), do NOT defer on the
concurrent op. Rationale, identical to CL-043/CL-044: draining ONE surplus voter
cannot violate the floor (current > min ⇒ projected ≥ min), and the independent
floor / published-membership / leader-handoff checks below STILL run — so the
concurrent-op gate is a serialization guard, not the sole quorum protector.

Scoped tight: REPLACE source-removal only (the proven deadlock), surplus-gated
(no relief at target), critical-system partitions only (the existing `:369` gate).
A guarded log (`surplusDrainSerializationRelief:true`) fires when the relief lets a
drain past — the A/B discriminator.

Implementation notes: `criticalReplicaRows` / `currentVoterReadyRows` /
`minReplicaCount` are hoisted above the concurrent-op check (reads, reused by every
downstream floor check; no behavior change on the empty / non-critical / early-
return paths). **Never touches the ledger interlock** (`OPERATION_LEDGER_
DISRUPTIVE_SELF_MOVE_TYPES`) — that is creation-only; this completes an
already-admitted REPLACE's own remove-leg, so the runs-20/22 seam is untouched.

## Why this seam (research-backed)

Four parallel path analyses (`phase2-path-research-synthesis.md`): standalone
drain = vetted-dead; interlock owned-drain (Alt-1) = RISKY (re-opens run-20);
ordering inversion (Alt-3b) = DEAD-END (min-floor=3 + source-leader-handoff);
joint consensus = DEAD-END (liferaft has no log-replicated membership). Re-driving
the REPLACE's own remove-leg (Alt-3a) = VIABLE, dodges both vet kills (interlock
creation-only, hasPendingMove planner-only). The re-drive already runs on a timer;
the load-bearing change is exactly this remove-safety relaxation.

## Proof (deterministic — complete)

- `dt:prove` **red-on-revert PROVEN** on the CL-045 falsifier
  (`operation-workflow-remove-safety-surplus-drain-serialization.test.js`):
  surplus (4/3) REPLACE drain is NOT concurrent-op-deferred WITH the fix, IS
  without it.
- Safety companion: at target (3/3, no surplus) the same REPLACE + concurrent op
  STILL blocks (relief is surplus-gated).
- Scope companion: a plain REMOVE with a surplus STILL blocks (relief is REPLACE-
  scoped).
- Regression: all remove-safety suites green (CL-043 stale-phantom, CL-044
  down-target, quorum-conditioned 201, surplus-drain 7/12/7); **191 rebalancer +
  convergence files pass**; lint clean.

## Live A/B is the gate (this is a quorum-safety-path edit)

Incremental A/B: Part-1-only (`bf509376`) vs Part-1+Part-2. Observables:
- voter-ready-60s timeouts → reliably 0 (was 0/0/13 with Part-1 alone);
- `replace_remove_safety_blocked` deferrals collapse;
- `surplusDrainSerializationRelief` fires (the drain actually completes → voters
  return to 3);
- **run-20 tell**: interlock churn / progress-write failures do NOT amplify.

Status: deterministic proof complete; live A/B pending (this is a proven
checkpoint, not a SOLVED claim).
