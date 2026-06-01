# Bootstrap Rejoin Recovery Silence Diagnostics

Superseded by:

1. [Rolling restart durable rejoin admin reachability](./done-20260425-rolling-restart-durable-rejoin-admin-reachability.md)

## Why

The original diagnostic gap is now active sprint work. The latest restarted
node reaches bootstrap health and starts the joining path, and the restart
readiness timeout now exposes
`bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.

The remaining work is no longer just silence diagnostics; it is durable rejoin
admin reachability while priority control-plane recovery is pending.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Rolling restart restart-recovery priority spread pending](./superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md)

## In Scope

1. Add owner-state diagnostics around bootstrap join progress after
   `contacting_seed`.
2. Surface the selected blocker in restart-readiness diagnostics and failure
   bundles.
3. Keep diagnostics descriptive; do not alter admission or recovery semantics
   in this package.

## Out Of Scope

1. Runtime recovery policy changes.
2. Timeout increases.
3. Matrix reruns beyond the active representative blocker.

## Residual Closure Inventory

- [ ] Name the bootstrap join phase that owns post-contact progress.
- [ ] Emit a bounded diagnostic snapshot when admin readiness remains false.
- [ ] Add focused test coverage for diagnostic projection.
- [ ] Use the diagnostic in the next `rolling-restart` blocker migration.

## Done When

1. A restarted node that reaches bootstrap health but not admin readiness emits
   one canonical blocker snapshot.
2. The failure bundle can report that blocker without log scraping.
