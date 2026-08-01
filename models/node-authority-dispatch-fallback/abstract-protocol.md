# Node-authority dispatch fallback — abstract protocol ↔ runtime

Quest: `rolling-restart-fresh-formation-node-authority-deferred-read`.

This model composes the existing system-metadata owner, canonical synchronous
readiness snapshot, bounded authoritative refresh, priority-recovery dispatch
fallback, and deferred retry lane. It introduces no new recovery mechanism.

| Model element | Runtime surface |
| --- | --- |
| `ObserveAuthority` | `NodesOwner.getNode` through `SystemMetadataOwnerBase.readByPrimaryKeyObservation` and the control-plane system-table gateway |
| `success_row` / `present` | a successful authoritative primary-key read containing the target node row |
| `success_empty` / `missing` | a successful authoritative primary-key read with zero rows; readiness may emit `node_row_missing` and dispatch remains deferred |
| `typed_retryable_failure` | a failed gateway envelope preserved as an error with `errorCode`, `retryAfterMs`, `deferRetry`, and participant metadata |
| `UseExistingRecoveryFallback` | `ReplicaDispatchReadinessCapture.shouldUseSyncDispatchReadinessFallback`, restricted to `controlPlaneRecoveryEligible` priority-recovery work |
| `DeferWithoutFallback` | the existing operation-dispatch deferred retry lane for successful absence, non-retryable failure, ordinary repair, or ineligible sync readiness |
| `CollapseFailureToMissing = TRUE` | the pre-fix `unwrapRowReadResult({success:false, rows:[]}) -> null` behavior, which bypasses the existing fallback |

The fixed configuration proves absence/failure separation, successful-empty
and non-retryable fail-closed safety, and eventual priority-recovery dispatch
when a retryable authoritative failure is paired with an already-satisfied
canonical sync snapshot. The mutant configuration produces the requested
liveness counterexample. Alloy remains unchanged because the correction alters
temporal authority-state propagation, not owner, cohort, or replica cardinality.
