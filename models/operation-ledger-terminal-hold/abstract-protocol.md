# Operation-ledger terminal hold — abstract protocol ↔ runtime

Model: `OperationLedgerTerminalHold.tla`.
Quest: `movielens-operation-ledger-terminal-hold`.

This focused model composes physical ledger self-move progress, lagging durable
workflow state, step timeout and recovery ownership, serialization-hold release,
dependent batch admission, workflow-row persistence, and snapshot closure.

| Model | Runtime |
| --- | --- |
| `physicalPhase` | target creation/election followed by source removal for a `replica_operations` REPLACE |
| `durablePhase` | authoritative `replica_operations` workflow row, which can lag while its own raft group is under surgery |
| `CrossDurableStepTimeout` | `isConcurrentOperationStalePastStepTimeout` / timeout-reaper eligibility |
| `RecoveryOwnerClaimsTimedOutRow` | level-triggered operation workflow recovery takes responsibility for a stale row |
| `RecoveryOwnerPublishesTerminal` | the normal workflow owner commits `REMOVED` or `FAILED`; this is the release evidence consumed by admission |
| `holdEngaged` | locally accounted and observed operation-ledger self-move serialization hold |
| `AdmitDependentBatch` | subsequent system-partition REPLACEs enter `createOperation` |
| `workflowWritesAvailable` | `replica_operations` progress UPDATEs can commit after ledger surgery |
| `PublishClosedSnapshot` | the stable Wave-4 snapshot is queryable after dependent workflows finish |

The fixed configuration proves that hold release requires authoritative terminal
evidence, dependent admission never overlaps ledger surgery, a closed snapshot
requires durable dependent workflow writes, and the composed protocol eventually
closes. The timeout-release mutant reuses durable row age as release permission
and violates the serialization-hold invariant while physical progress remains
active.

This is intentionally not a claim that every interaction between repository
layers is modeled in TLA+ or Alloy.
