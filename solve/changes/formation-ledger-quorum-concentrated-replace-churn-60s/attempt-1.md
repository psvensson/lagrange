# Attempt 1: remove fabricated inventory skew from the ledger cure

## Measured root cause

The 2026-07-11 MovieLens live run did plan the second
`replica_operations-p1` spread `REPLACE` repeatedly. It did not admit the move:
the create-time topology guard returned `replica_inventory_unusable` while the
quorum-concentration interlock continued holding dependent work.

`buildTopologyGuardSnapshot` paired a missing authoritative services
`observedAtMs` with `cacheStateBefore.capturedAtMs`, then paired the operation
observation with `cacheStateAfter.capturedAtMs`. Successful sequential reads
that took over the inventory's one-second skew threshold therefore appeared to
be inconsistent even though neither source supplied an observation timestamp.
Formation latency sustained the false skew, and the rejected recovery move
sustained formation latency: a circular recovery block.

## Change

When the authoritative services source supplies no observation timestamp, the
topology guard now preserves `null`. The canonical inventory consequently
reports `revision_unavailable` without claiming cross-source skew. Existing
fail-closed inputs remain unchanged: unavailable/deferred sources, source or
watermark mutation during capture, explicit timestamp skew, and identity
conflicts still make topology increase unusable.

The deterministic topology-guard test advances the injected clock by more than
one second during successful untimestamped owner reads. It failed on the old
behavior with `observation_skew_exceeded` and now proves that the recovery
`REPLACE` remains admissible. The Quest scenario composes that proof with the
existing real-coordinator quorum-spread-first guard.

## Evidence

- RED before the source change: `rebalance-coordinator-topology-guard.test.js`
  returned `inventory_unusable`, with fabricated `observedAtSkewMs: 3000`.
- Focused tests after the change: topology guard 29/29 and canonical inventory
  54/54.
- Scenario reports, three consecutive PASS samples (69 assertions each):
  - `test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-38-23-837Z.report.json`
  - `test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-38-32-716Z.report.json`
  - `test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-38-35-378Z.report.json`

Live validation is deliberately deferred until after deterministic closure.
