# Wrong-leg finding: reservation orphan-release is causally incapable of holding an op in-flight

Quest: `formation-reservation-reconcile-premature-orphan-release` (design gap iv).
Verdict: **EXHAUSTED — misdiagnosis.** The premature-orphan-release mechanism
cannot cause the settle stall it was blamed for. Do NOT ship a reconcile-read
escalation for this; pivot to gap v (`routed-mutation-silent-ledger-write-loss`).

## What was claimed (gap iv)
`design-cdc-nontermination-fix.md` gap iv: during cold formation a transient
op-visibility read mis-reads a still-live ADD as ABSENT → `ABSENT_OPERATION` →
`RELEASE_ACTIVE` → "Released orphan storage reservation during reconciliation" →
"the ADD op is abandoned before its completion transition runs → stays in-flight
→ demo [2/4] settle stalls." Named ops fb9aedc3 / 3d863303 (ratings ADDs), disk
`active / ACTIVE / completed_at=NULL`.

## Why it is a wrong leg (three independent proofs)

### 1. Causal non-coupling (decisive)
Releasing a reservation ONLY mutates `storage_reservations`. The reconcile
RELEASE path calls `transitionActiveReservationById`
(`rebalance-coordinator-reservation-lifecycle-methods.js:123-151`) → a single
`UPDATE_RESERVATION_STATUS_BY_ID`. It emits no op transition, no fail, no abandon.
`releaseReservationForOperation` (:244-305) only flips reservation rows + emits
`RESERVATION_RELEASED`.

The causal arrow runs the OPPOSITE direction: op completion *calls* release as a
downstream consequence — `operation-workflow-transition-persistence.js:317` (and
:329, and the FAIL path :483/:496) invoke `releaseReservationForOperation`
**after** the terminal transition has already committed. No op-progress,
admission, dispatch, or completion path READS reservation-active state to gate an
op (interlock/budget admission key off `isOperationTerminal`, never reservation
status). Therefore a reservation release cannot hold an op in-flight. The gap-iv
causal claim is false.

### 2. The named ops were terminal by the record predicate
`isTerminalReplicaOperationRecord` (`replica-operation-progress.js:561`) returns
**true** for an ADD at `workflow_step=ACTIVE, status=active, completed_at=NULL`
(`ACTIVE ∈ TERMINAL_STATUSES`, verified by direct call). So a *correct*
authoritative read would classify fb9aedc3/3d863303 as `TERMINAL_OPERATION` →
`RELEASE_ACTIVE` anyway — the release was not premature; it was the correct action
for a terminal op. Their missing "Operation completed" is a downstream
completion/CDC problem, not a reservation problem.

### 3. Live signal counts (fresh run `data/examples/service-data-affinity-demo`, ~10:28–10:31Z)
| signature | count |
|---|---|
| Released orphan storage reservation | **1** |
| No row found for CDC update | 54 |
| Deferred (dispatch/transition) | 78 |
| Failed to persist operation | 34 |
| dispatch failure | 28 |
| Cache update not observed | 6 |

The single orphan-release was op `782b7025` — a **REPLACE**, released 6s AFTER its
`Priority recovery drain settled operation` (10:28:41.426 → release 10:28:47.719):
a correct release of an already-settled op. Zero ADDs were prematurely released.
The settle stall is `inFlightReplicaOperations:1` / `topology_operations_in_flight`
held by a REPLACE stuck in a `Fetching updated row for CDC → No row found for CDC
update` loop on `replica_operations-p1-r4` = gap v, outnumbering reservation
release 50–80×.

## Disposition
- Reverted the exploratory gap-iv edits (owner-RPC escalation of the reconcile
  read + `ABSENT_OPERATION → KEEP_ACTIVE`). They are a correct-but-non-binding
  safety property that would ADD owner-RPC read load on the formation hot path for
  zero binding benefit (net-negative; violates "no new read paths / fix the gap
  that stops the existing mechanism").
- Quest parked EXHAUSTED (wrong leg). Binding [2/4] blocker = gap v.

## Verification
Two adversarial subagents (fix-shape vet + wrong-leg root-cause) plus direct
predicate execution and live-log counts. Causal-noncoupling is the load-bearing
proof and is independent of which run's logs are examined.
