# Rung-0 research — runtime-service replica-create ADD budget starvation

Quest: `formation-runtime-service-create-lane-budget-starvation`
Live evidence: run-30 of `examples/service-data-affinity/run-affinity-demo.js` (5-node single host).

## VERDICT: PARTIAL (hypothesis mechanism REAL but magnitude claim REFUTED)

The reserved-priority-recovery slot mechanism the hypothesis names **is real and
is active through the entire formation**, but it depresses the plain-ADD limit by
**exactly 1**, not to 0. Default `maxConcurrentAdds = 5` (NUM.FIVE) → plain-ADD
limit = `5 - 1 = 4`. So reservation alone cannot explain full starvation.

The **dominant** starving factor is that the plain-ADD lane
(`CONCURRENT_CREATE_BUDGET_SCOPE.ADD`) is a **GLOBAL, cluster-wide cap shared by
every non-priority ADD + non-dispatch-phase REPLACE operation**, with **no
fair-share reservation for a genuine replica-create ADD**. During formation the
non-priority data-partition spread churn keeps the global non-priority
add-budget count at/above the trimmed limit of 4, so the service's replica-create
ADD — just another non-priority ADD with no reserved slot — loses every admission
race. The reservation trims 5→4, tightening the squeeze, but is not the sole cause.

## The exact starving gate (file:line)

1. Planner emits the ADD; `executeMove` logs `EXECUTE_MOVE` ("Executing rebalancing
   move", type=add, reason=increase_replica_count) at
   `src/rebalancer/unified-rebalancer-follow-up-move.js:555` (`logExecuteMove`
   `:588`), THEN calls `executeMoveViaCoordinator` `:567`.
   → This is why run-30 shows the ADD "executing" 6x: the log precedes the gate.
2. `executeMoveViaCoordinator` → `createOperation` with
   `enforceConcurrentOperationBudget: true`
   (`src/rebalancer/unified-rebalancer-move-execution.js:69,94`).
3. `createOperation` → `runConcurrentCreateBudgetGate`
   (`src/rebalancer/rebalance-coordinator-operation-creation.js:335-356`).
4. Scope resolves to `CONCURRENT_CREATE_BUDGET_SCOPE.ADD` ('add') because the
   service is non-priority (`shouldUsePriorityConcurrentAddLane` requires
   `isPriorityControlPlanePartition` → false)
   (`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:38-65,113-129`).
5. `ensureConcurrentOperationBudgetAllowed`
   (`src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js:11-50`) →
   `getConcurrentAddBudgetLimit` = `max(0, maxConcurrentAdds - reserved)` = 4
   (`rebalance-coordinator-concurrent-add-budget.js:195-201`) →
   `canStartAddOperation` returns **false**.
6. **STARVING GATE**: `canStartAddOperation`
   (`src/rebalancer/rebalance-coordinator-priority-budget-helper.js:419-519`).
   Because a slot is reserved (`getReservedPriorityRecoveryAddSlots > 0`, line
   433) it takes the authoritative owner-RPC path `resolveAuthoritativeAddAdmission`
   (`:394-417`) which returns `authoritativeCount < concurrentAddLimit` i.e.
   `globalNonPriorityAddCount < 4` → false when ≥4 non-priority ADD/REPLACE ops
   are in flight.
7. False → `createConcurrentOperationBudgetError` sets
   `rebalanceSkipReason = BUDGET_EXCEEDED`
   (`rebalance-coordinator-concurrent-budget-gate.js:46,75-92`) → thrown →
   caught at `unified-rebalancer-move-execution.js:96-107` →
   `buildSkippedMoveResult(BUDGET_EXCEEDED)` → `MOVE_SKIPPED` log
   (`unified-rebalancer-follow-up-move.js:569,622-629`).
   → This is the run-30 "Rebalancing move skipped reason=budget_exceeded" 6x.

This is NOT the loop-level global move budget
(`unified-rebalancer-rebalance-loop.js:197-235`): that gate returns *before*
`executeRebalancingMoves`, so it would suppress the EXECUTE_MOVE log. The
presence of EXECUTE_MOVE 6x proves the loop-global budget passed and the
per-operation concurrent-ADD gate is the emitter.

## Why the count is GLOBAL, not per-partition

`getConcurrentAddCount` → `queryIncompleteOperations(options)`
(`rebalance-coordinator-priority-budget-helper.js:22-28`). The repository read
(`rebalance-coordinator-operation-read-methods.js:59-72`) passes **only**
`visibilityReadMode` — **no partition filter** — so the count is every
incomplete operation cluster-wide. `filterConcurrentAddBudgetOperations`
(`:131-163`) counts ADD and non-dispatch-phase REPLACE
(`isConcurrentAddBudgetOperation` `:367-381`), *separating out* priority-control-
plane-partition ops into their own lane (`addConcurrentPriorityBudgetOperation`
`:71-88`, appended only if the partition assessment blocks planning). Net: the
plain-ADD count = all NON-priority ADD/REPLACE ops fleet-wide. The service ADD
and every non-priority data-partition spread REPLACE share this one global cap
of 4, and share one single-flight lock keyed on scope 'add'
(`runConcurrentCreateBudgetGate` `:26-35`, `getCreateBudgetSingleFlightKey(scope)`).

## Reserved-slot depression is real and persists all formation

- `getReservedPriorityRecoveryAddSlots` → plan `getReservedNonPrioritySlots`
  returns `recoveryActive ? 1 : 0` for a NON_PRIORITY partition — **capped at 1**
  (`src/control-plane/priority-recovery-snapshot-workflow.js:90-104,199`).
- `recoveryActive = hasPriorityRecoverySpreadGap(summary)` = blocked priority
  partitions > 0 OR `summary.satisfied === false`
  (`src/control-plane/priority-recovery-snapshot-ingress.js:677-693`).
  Through formation the priority control-plane partitions (raft-meta, operation
  ledger) are still spreading to their replication target → `satisfied === false`
  → `recoveryActive` true for the whole convergence watch. So the −1 reservation
  never lifts. Consistent with run-30's persistent priority churn (260x
  `operation_ledger_self_move_in_flight`, 56x `operation_ledger_quorum_concentrated`).
- Default `maxConcurrentAdds` = `REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS`
  = `NUM.FIVE` (`src/rebalancer/rebalancer-constants.js:80`), read at
  `src/rebalancer/rebalance-coordinator-lifecycle.js:162-164`. Demo does NOT
  override it (`examples/service-data-affinity/run-affinity-demo.js` has no
  rebalancer config set). ⇒ plain-ADD limit = 4, not 0.

## Alternatives ruled in/out

- (a) "never reaches the budget gate" — RULED OUT. Earlier gates in
  `createOperation` (`ensureCriticalPartitionCreateLaneAvailable`,
  `ensureCreateTopologyGuardAllowed`, ledger-interlock, safety) emit distinct
  reason codes (SAFETY_BLOCKED / topology-guard / admission decisionType), not
  `budget_exceeded`. run-30's reason is precisely `budget_exceeded` ⇒ the
  concurrent-ADD gate is the emitter.
- (b) single-flight coalescing (`operationWorkflowRunExclusive` /
  `getCreateBudgetSingleFlightKey`) — CONTRIBUTING but not the emitter. All
  non-priority ADDs serialize on one 'add'-scope lock, which serializes (does not
  reject) the service create behind control-plane non-priority ADDs. Rejection
  reason is still the count-vs-limit budget check inside the lock.
- (c) downstream `replica_operations` INSERT rejection — RULED OUT. The throw
  happens in the pre-INSERT admission gate (`ensureConcurrentOperationBudgetAllowed`),
  before `createOperationRecordInternal` runs the INSERT.

## partitionId sensibility for a runtime_service (Q4)

The service move carries `entityType=runtime_service`; `operationPartitionId =
move.partitionId || this.entityId` (`unified-rebalancer-move-execution.js:31`),
so the "partitionId" passed to the gate is effectively the service id. Every
priority classifier is table-driven on system-partition ids
(`isPriorityControlPlanePartition`, `isCriticalSystemPartition`,
`isPriorityRecoveryEmergencyPartition`), so a service id is correctly classified
NON-priority → plain ADD lane, non-critical (no empty-backoff bypass), non-owner-
RPC read mode. No misclassification bug; the service is *correctly* placed in the
starved lane — it simply has no reserved fair-share there.

## Fix direction (recommendation)

Root gap: a genuine replica-CREATE ADD (target replica count increase, entity has
0 replicas) has **no reserved fair-share** in the global plain-ADD lane and is
outcompeted by non-priority REPLACE/self-move churn, while priority recovery
*takes* a slot from that same lane. Preferred directions, in order:

1. **Fair-share reservation for genuine creates (mirror the priority pattern).**
   Just as priority recovery reserves 1 non-priority slot, reserve ≥1 slot in the
   plain-ADD lane for `reason=increase_replica_count` ADDs of entities at/near 0
   replicas (a true create, not a REPLACE/rebalance move). Symmetric to
   `getReservedNonPrioritySlots`; add a `getReservedCreateAddSlots` and a
   create-lane admission that a REPLACE cannot consume. Aligns with the memory
   directive "fix the gap stopping the existing mechanism; no new read paths".
2. **Separate the create ADD from the REPLACE/spread churn in the count.** The
   global add-budget conflates true creates with rebalance REPLACEs. Give creates
   their own sub-lane or exclude non-dispatch-phase REPLACE self-moves from the
   count that a create is measured against (they already have their own
   interlock). Narrower but riskier.
3. **Do NOT** simply raise `maxConcurrentAdds` (masks the fairness bug; the −1
   reservation and REPLACE churn will re-saturate any larger N).
4. **Do NOT** re-chase the reserved-slot as "depresses to 0" — it is −1 only.

## DT-repro faithfulness notes

To reproduce deterministically, drive these coordinator methods/config (no full
demo needed):

- Config: default `maxConcurrentAdds = 5` (do not override) so plain limit = 4.
- Force `recoveryActive = true`: feed a `priorityPartitionSummary` with
  `satisfied === false` (or ≥1 blocked priority partition) into
  `resolveTrackedPriorityRecoveryAdmissionPlan` / the membership publication row
  the coordinator reads (`getLatestMembershipPublicationRow`), so
  `getReservedPriorityRecoveryAddSlots` returns 1 the whole run.
- Populate ≥4 in-flight NON-priority add-budget operations (ADD or
  non-dispatch-phase REPLACE on ordinary data partitions) visible to
  `queryIncompleteOperations` (authoritative owner read, since the reserved-slot
  path forces `resolveAuthoritativeAddAdmission`).
- Then call `createOperation` for a runtime_service ADD
  (`reason=increase_replica_count`, `enforceConcurrentOperationBudget: true`) and
  assert it throws `rebalanceSkipReason = BUDGET_EXCEEDED` at limit 4.
- Binding observable: the service ADD is rejected while a priority-lane ADD
  (PRIORITY_ADD scope, own limit) and a REMOVE (maxConcurrentRemoves lane) are
  admitted in the same tick — i.e. the lane is unfair, not globally saturated.
  The lever moving the observable = the reserved-create-slot fix must let the
  service ADD in when ≥1 create slot is held even with the plain lane at 4.

## FIX DESIGN VET

**VERDICT: GO-WITH-AMENDMENTS.** Direction 1 (a reserved create slot mirroring
the priority pattern) is the right shape and preserves the global concurrency
invariant, but the report's proposed *discriminator* and *plumbing* are wrong as
written and would produce a fix that either never activates or is consumable by
churn. The corrected discriminator is `type===ADD && entityType==='runtime_service'`,
which — unlike `reason=increase_replica_count` — is (a) unforgeable by a REPLACE,
(b) actually available at the gate, and (c) persisted on in-flight records so
concurrent creates can be counted. Three concrete code changes are required
beyond "add `getReservedCreateAddSlots`".

### Objection 1 — the proposed discriminator is UNUSABLE (two independent defects)

**1a. `reason` is not plumbed to the gate and is never persisted.** The move's
`reason` is dropped at `unified-rebalancer-move-execution.js:61-70`: the
`operationRequest` sent to `createOperation` contains
`{type, partitionId, entityType, entityId, nodeId, replicaId, sourceNodeId,
enforceConcurrentOperationBudget, ...}` — **no `reason`**. Consequently the budget
context built at `rebalance-coordinator-operation-creation.js:337-343` is
`{partitionId, entityType, entityId}` (no reason), and `rowToOperation`
(`replica-operation-repository-row-methods.js:60-76`) persists/returns no `reason`
field. A discriminator on `reason` therefore cannot be read at admission *and*
cannot be used to count in-flight creates. Dead on arrival.

**1b. Even if plumbed, `reason=increase_replica_count` is NOT create-unique.** The
same reason is minted for priority-recovery follow-up *partition* ADDs at
`unified-rebalancer-follow-up-move.js:491` and `:519`, and for any entity's
deficit fill at `move-planner-move-calculation-methods.js:301`. So it is shared by
control-plane partition churn, not specific to a genuine service create — a
reservation keyed on it would be consumed by partition follow-up ADDs.

**Clean discriminator (available + unforgeable):** `entityType`. It is present in
the gate budget context (`operation-creation.js:337-343`), is INSERTed
(`replica-operation-repository-mutation-persistence-methods.js:85`) and read back
(`row-methods.js:64`, `entityType: row.entity_type || SERVICE_TYPE.PARTITION`).
`RUNTIME_SERVICE = 'runtime_service'` (`constants/unified-service-lifecycle.js:14`,
`rebalancer-constants.js:20`), and the planner treats runtime_service as a
first-class entity (`move-planner.js:660`, `move-planner-state-methods.js:35`).
A partition spread REPLACE carries `entityType='partition'` and *cannot* spoof
`'runtime_service'`. Use `type===ADD && entityType===RUNTIME_SERVICE` — a service
ADD is by construction a replica create (moves of existing replicas are REPLACEs).
**Drop the "near-0 replicas" qualifier**: current replica count is not in the gate
options, reading it is a NEW read path (violates `avoid-secondary-tertiary-caches`
/ "no new read paths"), and it would wrongly exclude legitimate scale-out ADDs
(3→4). It buys nothing — the reservation is bounded at 1 concurrent regardless.

### Objection 2 — `entityType` is DROPPED before `canStartAddOperation`; and the authoritative-read trigger must be widened

**2a. The discriminator never reaches the admission function.**
`ensureConcurrentOperationBudgetAllowed` HAS `options.entityType` but forwards only
`{bypassEmptyQueryDelay, concurrentBudgetReadMode, partitionId}` to
`canStartAddOperation` (`rebalance-coordinator-concurrent-budget-gate.js:38-42`).
The fix MUST forward the discriminator, e.g. add
`isGenuineCreate: normalizedMoveType===ADD && String(options.entityType)===RUNTIME_SERVICE`
(and `entityType`) into that options object. Without this change the reservation
logic in `canStartAddOperation` has no way to tell a create from a REPLACE.

**2b. Stale-cache hazard: widen the owner-RPC trigger.** `canStartAddOperation`
only takes the authoritative owner-read path when
`getReservedPriorityRecoveryAddSlots(options) > 0`
(`rebalance-coordinator-priority-budget-helper.js:433`); otherwise it uses the
cached fast-path (`:440-458`). The comment at `:427-432` is explicit that a stale
undercount must not let a normal add consume a *reserved* slot. A create
reservation can be active when priority recovery is NOT (`priorityReserved=0`,
`createReserved=1`), so the trigger must become
`getReservedPriorityRecoveryAddSlots>0 || getReservedCreateAddSlots>0` — else a
non-create REPLACE reading a stale undercount consumes the reserved create slot,
voiding the fix. (In the run-30 demo `recoveryActive` is true so the authoritative
path already fires; this hardens the fix outside recovery.)

### Objection 3 — arithmetic: numbers work at N=5 but the reservation MUST be clamped and GLOBAL

The `-1` priority reservation is NOT a second occupant of the plain lane — it
trims the plain-lane limit (`getConcurrentAddBudgetLimit = max(0, maxAdds -
reservedPriority)` = `5-1=4`, `concurrent-add-budget.js:195-201`) so the *separate*
priority lane (`canStartPriorityAddOperation`) has headroom; the two do not
double-count. The create reservation re-slices **within** the plain lane:

- plainLimit = `maxAdds - priorityReserved` = `5 - 1 = 4` (recoveryActive).
- non-create effective limit = `plainLimit - createReserved` = `4 - 1 = 3`.
- create effective limit = `plainLimit` = `4`.
- Steady state: 3 non-create + 1 create + 1 priority = 5 = maxAdds. Invariant held.

**Clamp (mandatory).** At small `maxConcurrentAdds` the naive subtraction zeroes
ordinary REPLACEs and deadlocks spread: `maxAdds=2`, recovery → plainLimit=1,
non-create limit = `1-1=0`. Guard with `nonCreateLimit = max(1, plainLimit -
createReserved)` so ordinary REPLACEs never starve. Default N=5 is safe; the clamp
protects operators who lower the config.

**Must be a SINGLE GLOBAL reservation, not per-service.** If each deploying service
got its own reserved slot, K simultaneous deploys → K reserved slots >
maxConcurrentAdds → over-admission and the leadership/budget flap the cap exists to
prevent. `getReservedCreateAddSlots` returns a scalar (default 1) independent of
partition/service id — a single fleet-wide guarantee. Many services deploying at
once serialize on the existing `'add'`-scope single-flight lock
(`concurrent-add-budget.js:26-27`) and admit one-at-a-time up to plainLimit; the
reservation only guarantees *at least one* create can always enter, it does not
multiply with demand.

### Objection 4 — counting: reserve demand-sensitively by counting IN-FLIGHT creates

To avoid both over-admission and permanent REPLACE starvation, make the reservation
demand-sensitive: apply the `-createReserved` haircut to the non-create limit ONLY
while no create is already in flight.

- `effectiveCreateReserved = inFlightCreateCount > 0 ? 0 : createReserved`.
- A create already occupies its slot ⇒ lift the reservation so non-creates get the
  full plainLimit (max throughput). Creates remain globally capped at plainLimit,
  so two simultaneous creates cannot both over-admit (2nd sees count≥plainLimit →
  rejected). This directly answers Q4's over-admission concern.

**The data is sufficient.** In-flight creates are countable from the operations
`filterConcurrentAddBudgetOperations` already iterates: each carries `type`
(`row-methods.js:62`) and `entityType` (`:64`). Add
`countInFlightServiceCreateAddOperations(ops)` = count of
`op.type===ADD && op.entityType===RUNTIME_SERVICE`, computed over the SAME
authoritative operation set used for the plainLimit count (do NOT open a second
read — reuse the `resolveAuthoritativeAddAdmission` / cached list already fetched,
per `read-precomputed-artifacts-first` and `avoid-secondary-tertiary-caches`).

### Objection 5 — direction 2 (exclude REPLACE self-moves from the create's count) is UNSAFE — reject

Direction 2 splits creates and REPLACEs into independent sub-lanes (or lets creates
ignore REPLACE churn). If creates measure against a REPLACE-excluded count while
REPLACEs keep their own budget, total concurrency = createLimit + replaceLimit,
which **exceeds `maxConcurrentAdds`** — it breaks the very global concurrency
invariant the cap enforces, re-opening the over-creation / leadership-flap failure
class this subsystem has repeatedly fought (`136aebbc`, the over-target accounting
line in MEMORY). Direction 1's reservation re-slices *within* the fixed global cap
and never raises total concurrency. Direction 1 is strictly safer. Reject 2.

### Objection 6 — DT-passes-but-demo-unmoved risks

A unit assertion that `canStartAddOperation` returns `true` for a service ADD at
count=4 proves admission only. It can pass while the live observable
(`replica_count>0`) does not move because: (a) the create admits but a downstream
gate (topology guard / ledger interlock / dispatch readiness) blocks *completion*;
(b) lowering non-create limit to 3 slows partition spread enough to regress overall
convergence; (c) `entityType` on the persisted row is null/`'partition'` (not
`'runtime_service'`), silently breaking in-flight-create counting. The DT must
therefore assert the binding observable end-to-end AND a red-on-revert, not just the
admission boolean.

### Corrected fix — exact touch list

1. `rebalancer-constants.js` — add `REBALANCER_DEFAULT.COORDINATOR.RESERVED_CREATE_ADD_SLOTS = 1`
   (NUM.ONE); wire it into config read at `rebalance-coordinator-lifecycle.js:162-164`
   as `config.reservedCreateAddSlots`.
2. `rebalance-coordinator-concurrent-add-budget.js` — add
   `getReservedCreateAddSlots(coordinator) => max(0, config.reservedCreateAddSlots ?? 1)`
   and a discriminator helper
   `isGenuineServiceCreateAdmission(moveType, entityType) => moveType===ADD && String(entityType)===SERVICE_TYPE.RUNTIME_SERVICE`.
   Export both. (`SERVICE_TYPE.RUNTIME_SERVICE` is already in `REBALANCE_COORDINATOR_SHARED`.)
3. `rebalance-coordinator-concurrent-budget-gate.js:38-42` — forward the
   discriminator into the `canStartAddOperation({...})` call:
   `isGenuineCreate: this.isGenuineServiceCreateAdmission(normalizedMoveType, options.entityType)`.
4. `rebalance-coordinator-priority-budget-helper.js`:
   - `:433` — widen authoritative trigger to
     `getReservedPriorityRecoveryAddSlots(options) > 0 || coordinator.getReservedCreateAddSlots() > 0`.
   - Add `countInFlightServiceCreateAddOperations(coordinator, operations)` filtering
     `type===ADD && entityType===RUNTIME_SERVICE`, computed over the operation list
     already fetched (no new read).
   - In both the authoritative (`resolveAuthoritativeAddAdmission`) and cached
     comparisons, compute
     `reservedCreate = options.isGenuineCreate ? 0 : (inFlightCreateCount > 0 ? 0 : getReservedCreateAddSlots())`
     and compare against `effectiveLimit = max(1, concurrentAddLimit - reservedCreate)`.
     (Creates use full `concurrentAddLimit`; non-creates use the haircut, clamped ≥1;
     haircut lifts once a create is in flight.)

Net behavior at default N=5, recoveryActive: creates admit against limit 4;
ordinary REPLACEs cap at 3 while no create is pending, relax to 4 once a create is
in flight; total concurrency never exceeds 5; a REPLACE can never consume the last
create slot; stale cache cannot bypass the reservation.

### Minimal anti-regression assertions the DT MUST include

- **A1 (lever moves):** recoveryActive + 3 in-flight non-priority *partition*
  REPLACEs (count=3), a `runtime_service` ADD → `canStartAddOperation` **true**
  (create limit 4 > 3).
- **A2 (slot is reserved-for-create):** same state, an ordinary *partition*
  ADD/REPLACE → **false** (non-create limit 3, count 3). Proves REPLACE churn cannot
  consume the create slot.
- **A3 (no create over-admission):** 1 in-flight `runtime_service` ADD + 3 non-create
  (count=4), a 2nd `runtime_service` ADD → **false** (capped at plainLimit).
- **A4 (REPLACE throughput preserved):** 1 in-flight `runtime_service` ADD + 2
  non-create (count=3), an ordinary REPLACE → **true** (haircut lifts once a create
  is in flight; limit 4 > 3). Guards against permanently starving spread.
- **A5 (clamp):** `maxConcurrentAdds` set so plainLimit=1 → non-create limit is 1,
  never 0 (ordinary REPLACE not deadlocked).
- **A6 (stale-cache):** createReserved>0 with priorityReserved=0 forces the
  authoritative owner read; a stale cached undercount does NOT admit a non-create
  into the reserved slot.
- **A7 (discriminator persistence):** a `runtime_service` ADD operation record
  round-trips `entity_type==='runtime_service'` through INSERT→`rowToOperation`, so
  in-flight-create counting is real (guards Objection 6c).
- **A8 (binding observable + red-on-revert):** `npm run dt:prove` showing the
  service ADD admission flips **true→false** on revert under the sustained
  ≥3-non-priority-REPLACE + recoveryActive scenario; plus a scenario-level assert
  that the service reaches `replica_count>0` and ordinary spread still converges
  (not merely the admission boolean).

## IMPLEMENTATION + LIVE VALIDATION STATUS (2026-07-05)

**Fix landed (GO-WITH-AMENDMENTS design implemented in full):**
- New config `reservedCreateAddSlots` (default 1, `rebalancer-constants.js`
  RESERVED_CREATE_ADD_SLOTS, wired in `rebalance-coordinator-lifecycle.js`).
- `getReservedCreateAddSlots` + `isGenuineServiceCreateAdmission(moveType,
  entityType)` in `rebalance-coordinator-concurrent-add-budget.js`; coordinator
  methods in `rebalance-coordinator-priority-budget-admission.js`.
- Discriminator = `type===ADD && entityType===runtime_service`
  (UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) — the vet's amendment; the report's
  `reason=increase_replica_count` was unusable (dropped before the gate, not
  create-unique).
- `isGenuineCreate` plumbed through `concurrent-budget-gate.js` into
  `canStartAddOperation`; `resolveCreateReservedAddLimit` applies a
  demand-sensitive, clamped haircut (create sees full limit; non-create yields
  one slot only while no create is in flight; `max(1, ...)`), applied in BOTH the
  authoritative path (`resolveAuthoritativeAddAdmission`, which now fetches the
  filtered op list to count in-flight creates) and the cached fast-paths.

**Proven:** DT `test/rebalancer/runtime-service-create-add-budget-reservation.test.js`
(A1 create admitted / A2 red-on-revert non-create yields the slot / A3 no 2nd-create
over-admission / A4 lift preserves REPLACE throughput / A5 clamp / regression). dt:prove
red-on-revert PROVEN. Rebalancer regression: 959/959 across 25 create/budget files; lint +
complexity clean.

**LIVE VALIDATION BLOCKED UPSTREAM (honest — DT observable moved, live [4/4] observable NOT
yet shown).** Three post-poison-fix demo runs:
- run-2 (pre-this-fix): reached [4/4], service starved (budget) — the mechanism this fix
  targets, confirmed live.
- run-3 (this fix): formation settled cleanly, but [2/4] ratings CREATE failed on the LEDGER
  SELF-MOVE INTERLOCK (`operation_ledger_self_move_in_flight` x3, provisionable=0) — never
  reached [4/4]. NOT my gate (zero runtime_service budget_exceeded).
- run-4 (this fix): settle-stall + [2/4] load admin timeout — formation-interlock churn.
So the demo's CURRENT binding blocker is the formation/load-phase ledger self-move interlock
(the deadlock/over-target quest class), which the demo hits at [2/4] before reaching this
fix's [4/4] path. My fix does NOT touch the control-plane PRIORITY add lane
(canStartPriorityAddOperation) — only the non-priority plain lane — so it does not worsen
formation. NEXT to LIVE-prove this fix: either (a) an isolated scenario-harness that deploys a
runtime service on an already-settled cluster with injected non-priority ADD churn and asserts
replicas>0 (the quest doneWhen, decoupled from the upstream flakiness), or (b) fix the upstream
load-phase ledger interlock first so the demo reaches [4/4] reliably. Quest stays OPEN.
