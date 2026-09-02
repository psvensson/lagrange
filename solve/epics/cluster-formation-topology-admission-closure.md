---
epicContractVersion: 2
id: cluster-formation-topology-admission-closure
roadmapRow: RM-0.2-five-node-convergence
graduatesTo: null
---

# 0.2 Cluster Formation And Topology Admission Closure

## Intent

Make cluster formation and topology change explicitly ordered operations rather
than a race between the control plane and user load.

> A node being alive is not the same thing as a node contributing serving
> capacity.

> No user traffic until a minimum control-plane cluster exists and the critical
> system tables have actually spread across distinct nodes and remained stable.

This completes mechanisms already present. It is not a rebalancer redesign, and
the causal trace in S6a is the hard stop against becoming one.

## Why

The G2 five-node MovieLens failure is a formation/rebalancing sequencing defect,
not a readiness-computation one. The seed simultaneously runs the control plane,
holds every critical system-table replica, manufactures readiness evidence and
absorbs formation load, and stops making control-plane progress in time.

Out of scope, deliberately: a new readiness cache, adaptive concurrent joins,
and seed scheduler priority as the primary cure.

## Measured, and it changed the plan

- **RF=3 is satisfied at t=0 by one node.** System tables are created with all
  three replicas on the seed; readiness must mean distinct nodes.
- **Critical placement never converges.** On a healthy three-node formation, all
  45 critical partitions stayed pending, 44 at one distinct node, *after* all
  nodes were READY.
- **TRAFFIC_READY is never reached.** The controller is driven, ends DEGRADED.
- **The denominator drifted.** Desired RF was inferred from the length of a
  mutable global; a minted `replace-replica-<hex>` made it read 4, not 3.
- **TRAFFIC_READY has no user-plane consumer.** The refusal machinery existed
  and was never called.

Together these say S4 cannot be made authoritative until placement actually
converges, and that the fix must be found causally rather than assumed.

## Slices

    S1    critical serving-topology invariant                LANDED 3cddfcf65
    S1.1  immutable replication-target authority             verifying
    S0.1  strict-own-data adversarial owner contract         prerequisite
    S2    admission owner, observational/unwired             verifying
    S3    formation placement observer, observational        verifying
    S6a   one-partition causal trace, NO behaviour change
    S6b   smallest repair at the first broken link
    S5    initial formation admission contract (min 3 peers)
    S4    authoritative TRAFFIC_READY barrier
    S7    user/control admission cleanup
    S9    G2 MovieLens falsifier

S5 precedes S4: once S4 requires three-node placement, the formation protocol
must guarantee it can admit enough peers to reach it. S8 (expansion cohorts,
topology generations) stays deferred, except that S4 must not accept
convergence evidence from a superseded membership generation.

## Acceptance

S6 succeeds on an observable outcome, not a mechanism. From a fresh seed with
nodes 2 and 3 joining, repeatedly: every S1-critical partition reaches three
distinct eligible holders, desired RF remains exactly 3, no critical
MOVE_REPLICA remains incomplete, and replacement replica IDs do not alter
desired RF. Only then does S4 become authoritative, and only then is S9 run.

## Decision log

- **S6 is not authorized as a precedence change.** Precedence assumes the moves
  are generated and merely lose scheduling. With no convergence at all, an
  eligibility, planning or target-authority defect is likelier. S6a must end in
  a receipt naming which transition is absent — deficit detected, candidates
  generated, target selected, plan emitted, MOVE_REPLICA recorded, dispatched,
  caught up, metadata committed, stabilised — and S6b repairs that link only.
- **If precedence is proven necessary**, prefer an exclusive critical-placement
  lane during initial formation over a weighting scheme, using the ordinary
  MOVE_REPLICA machinery and no second mover.
- **S1.1 is correctness, not debt.** Desired replication factor is an immutable
  policy value; replica identities are runtime state. A replacement replica is
  a new identity, not a changed factor.
- **S2's wiring was withdrawn** after measurement showed a wired gate would
  refuse user traffic permanently. The owner lands unwired.
- **S3 observes and does not gate.** A joiner waiting on spread its own join
  must supply would deadlock; worse, a fully formed cluster never reaches the
  bar, so gating would livelock.
- **Placement-authority exception, transferred to S6.** Measured: system tables
  have no `tables` row, so the table-policy fallback returns 3 and
  `move-planner.js:281` uses THAT as the placement target for critical system
  partitions, not `partitions.replica_count`. Semantic authority divergence is
  PROVEN; formation causality is NOT, because all three values are 3 today and
  the divergence is numerically masked. S1.1 records it; S6 repairs it after
  measurement. S1.1's inventory is 11 desired-RF consumers on canonical
  persisted-policy semantics plus 1 divergent placement-target consumer - not
  12/12. S6b must route the planner target to the same authoritative persisted
  policy as convergence and readiness BEFORE S4 becomes authoritative, even if
  it is not the root cause, because planner target and readiness requirement
  must never diverge.
- **Three provenance classes, kept distinct.** `persisted desired RF` is a valid
  `replica_count` from the authoritative row. `bootstrap expected RF` is that
  table's schema creation default, usable ONLY to keep initial formation safely
  blocked while the freshly seeded row becomes observable. `authoritative RF
  unknown` is missing or invalid persisted policy where authoritative evidence
  is required. The formation barrier may fall back to bootstrap expected RF -
  its purpose is to stay blocked, never to release. S3 and TRAFFIC_READY may
  NOT: a bootstrap default can never turn UNKNOWN into a KNOWN state.
- **S1.1 split into A and B by the scope guard, not by preference.** The quest
  reached 30 files / 9 owners and exhausted its blocked-scope override budget
  (limit 3). Each addition was justified - every verification round proved the
  authority claim false until one more consumer converged - but the cumulative
  candidate is not one implementation slice. `replication-target-authority-v2`
  is parked EXHAUSTED with that failure preserved, NOT rewritten as though it
  had always been smaller. A (`replication-policy-authority-substrate`, 15
  files / 3 owners) owns the decoder, strict invalid/absent-row semantics,
  identity isolation, seed hand-offs and per-table creation defaults, and is
  forbidden by constraint from claiming consumer-wide convergence. B
  (`behaviour-changing-consumer-convergence`, 18 files / 5 owners) owns the
  eleven routed consumers, the inventory claim and the transferred planner
  exception. Both preflight under the guard, so no override and no ratchet
  change was needed. The invariant is split, not weakened; S3 begins only after
  B lands, never after A alone.
- **strict-own-data.js needs an owner contract before S6.** Six answer-changing
  defects were found only through consumers, and placement correctness depends
  on it.

## Owner debt surfaced here

- `src/utils/strict-own-data.js` has no owner test. Establish an adversarial
  owner-level contract over container and record kinds, repair only what is
  demonstrated, then stop.
- Every hostile input shape collapses to `EVIDENCE_ABSENT`, so an operator
  cannot distinguish "formation has not started" from "the row set was refused".
  Needs a wider reason vocabulary.
