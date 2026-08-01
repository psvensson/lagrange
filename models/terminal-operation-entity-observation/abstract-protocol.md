# Terminal operation entity observation — abstract protocol ↔ runtime

Quest: `rolling-restart-fresh-formation-terminal-add-observation-v2`.

This composition models the existing operation workflow owner, entity-scoped
priority-recovery observation, surplus REMOVE, and fresh-formation barrier. It
does not introduce a new recovery mechanism.

| Model element | Runtime surface |
| --- | --- |
| `CompleteAdd` / `durableStep = "terminal"` | `ReplicaOperationRepository.persistOperationUpdate` confirms the ADD terminal transition through the existing owner authority path |
| `ownerAvailable` | whether the `replica_operations` owner/leader RPC lane can answer the entity query |
| `ObserveWhileOwnerUnavailable` with `AllowStaleSqlFallback = FALSE` | `getOperationsByEntityAuthoritativeObservation` uses `OWNER_RPC_REQUIRED` and emits the existing typed deferred observation on authority failure, independent of local witness or recovery-readiness state |
| `AllowStaleSqlFallback = TRUE` | the pre-fix `OWNER_RPC_PREFERRED_SQL_FALLBACK` shape, which can re-admit an older SQL `CREATING` row after the terminal witness was confirmed and cleared |
| `PlanExistingSurplusRemove` | the existing priority planner sees the ADD as terminal and can schedule its normal over-target REMOVE |
| `CompleteExistingSurplusRemove` / `formation = "ready"` | existing REMOVE safety and operation-ledger formation checks converge; no ready lease is synthesized by this modelled correction |

The fixed configuration proves terminal observation monotonicity, fail-closed
deferral without assuming an active recovery gap, and eventual reuse of the
existing surplus-drain route once owner authority returns. The mutant
configuration provides the stale-SQL counterexample. Alloy is not extended
because this correction changes temporal read authority, not owner, replica,
or cohort cardinality.
