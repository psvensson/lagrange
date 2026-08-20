# Operation-ledger self-move waiter fairness — abstract protocol ↔ runtime

Model: `OperationLedgerSelfMoveWaiterFairness.tla`.
Quest: `operation-ledger-self-move-waiter-fairness`.

| Model | Runtime |
| --- | --- |
| `incumbentCount` | authoritative incomplete ordinary `replica_operations` rows |
| `AdmissionTurn` | `createOperation` ledger-interlock admission immediately before intent persistence |
| `waiterState = Pending` | durable self-move `replica_operations` row at `PENDING` |
| `newcomerGeneration` | continuous later priority ADDs which historically overtook the self-move |
| `DrainIncumbent` | incumbent workflow owner reaches a canonical terminal transition |
| `DispatchAfterAuthoritativeIdle` | owner-RPC incomplete-operation read immediately before `PENDING -> SENDING` |
| `CompleteSelfMove` | existing REPLACE/REMOVE workflow and owner lease/reaper lifecycle |

The fixed configuration proves that the durable waiter closes later admission,
physical dispatch never overlaps an incumbent, and the self-move completes.
The admission-only mutant models the witnessed GCP schedule: every scheduling
turn replaces the incumbent with a newcomer before an idle observation, so the
self-move is never registered and the liveness property fails.

This model intentionally abstracts numeric budgets, topology placement, and
transport; those unchanged owners remain covered by their existing contracts.
