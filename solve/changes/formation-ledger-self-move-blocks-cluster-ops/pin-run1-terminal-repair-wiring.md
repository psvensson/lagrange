# Pin run-1 terminal repair wiring

Artifact: `data/examples/service-data-affinity-demo/node-{0..4}.log`, 2026-07-06 run. Source head includes terminal-transition repair from 70e434e6.

## 1. Terminal-transition repair wiring trace

### Where repair is armed

Terminal projections are produced by the normal owner transition path, not by repair. `completeOperation()` chooses the terminal step (`ADD` -> `ACTIVE`, all other completes -> `REMOVED`) and later stamps `completedAt` into the projected operation (`src/rebalancer/operation-workflow-transition-persistence.js:219-227`, `src/rebalancer/operation-workflow-transition-persistence.js:260-266`). Its persist closure calls `repository.persistOperationUpdate(projectedOperation, { ...transitionPersistOptions, terminalTransition: true })` (`src/rebalancer/operation-workflow-transition-persistence.js:286-293`), and the `afterCommit` hook calls `confirmCommittedTransitionPersistence(projectedOperation, {terminalTransitionRepair: true})` (`src/rebalancer/operation-workflow-transition-persistence.js:298-310`). The failure path is symmetric: `failOperation()` builds a failed terminal projection with `completedAt` and `errorMessage` (`src/rebalancer/operation-workflow-transition-persistence.js:424-430`), persists it with `terminalTransition: true` (`src/rebalancer/operation-workflow-transition-persistence.js:452-459`), and arms repair from the `afterCommit` confirmation hook (`src/rebalancer/operation-workflow-transition-persistence.js:464-476`).

`confirmCommittedTransitionPersistence()` explicitly says an unconfirmed terminal transition arms repair because a terminal projection that the ledger never reflects is an immortal non-terminal row (`src/rebalancer/operation-workflow-owner-execution-lane.js:723-728`). It calls `repository.confirmReplicaOperationPersistence(operation)` (`src/rebalancer/operation-workflow-owner-execution-lane.js:735-741`); if that throws and `terminalTransitionRepair` is true it calls `armTerminalTransitionRepair(..., CONFIRMATION_FAILED)` (`src/rebalancer/operation-workflow-owner-execution-lane.js:742-749`). If confirmation returns, `resolveTerminalTransitionConfirmationOutcome()` clears repair only when visibility is `CONFIRMED` with an operation (`src/rebalancer/operation-workflow-owner-execution-lane.js:784-791`); every other terminal confirmation result arms repair with `CONFIRMATION_DEFERRED` (`src/rebalancer/operation-workflow-owner-execution-lane.js:793-798`).

### Scheduling, backoff, and retained projection

`operation-workflow-terminal-transition-repair.js` states the contract: retain the terminal projection and re-persist it with capped backoff until the authoritative row reflects it, abandoning only if a different durable terminal state won (`src/rebalancer/operation-workflow-terminal-transition-repair.js:12-22`). Backoff is 500ms, doubled, capped at 30s (`src/rebalancer/operation-workflow-terminal-transition-repair.js:23-39`). `armTerminalTransitionRepair()` stores the cloned terminal projection and incrementing attempt in `terminalTransitionRepairStateByOperationId` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:58-71`), refuses to install a second timer if one already exists (`src/rebalancer/operation-workflow-terminal-transition-repair.js:72-74`), logs `Committed terminal transition not authoritatively visible; repair scheduled` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:75-81`, message constant `src/rebalancer/rebalancer-constants.js:294-300`), and schedules a timer that deletes the timer entry then runs `runTerminalTransitionRepairAttempt()` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:84-99`). If that attempt throws, the timer catch logs `Terminal transition repair attempt still unconfirmed; rescheduling` and re-arms (`src/rebalancer/operation-workflow-terminal-transition-repair.js:86-96`). A confirmed transition clears both timer and retained state (`src/rebalancer/operation-workflow-terminal-transition-repair.js:140-151`).

The maps are initialized as retained terminal projections for the run-21 ghost-row class (`src/rebalancer/operation-workflow-owner-retry-registry.js:99-103`) and are cleared on shutdown (`src/rebalancer/operation-workflow-owner-retry-registry.js:167-171`). Attempts run under the operation owner single-flight key (`src/rebalancer/operation-workflow-terminal-transition-repair.js:161-169`; key construction `src/rebalancer/operation-workflow-owner-execution-lane.js:245-249`).

### What one repair attempt actually does

A repair attempt re-asserts the retained terminal projection through the existing repository update path:

```js
await owner.repository.persistOperationUpdate(heldState.projectedOperation, {
  terminalTransition: true,
  confirmPersistence: false,
  disableSystemWriteSession: true,
});
```

That is `src/rebalancer/operation-workflow-terminal-transition-repair.js:175-182`. If the persist returns `false`, repair does not give up; it reads the authoritative operation owner-local and abandons only when that row is already terminal (`src/rebalancer/operation-workflow-terminal-transition-repair.js:183-189`, `src/rebalancer/operation-workflow-terminal-transition-repair.js:225-253`). If persist returns truthy, it calls `repository.confirmReplicaOperationPersistence(heldState.projectedOperation)` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:191-194`). Confirmation success logs `Terminal transition repair confirmed authoritative visibility` and clears repair (`src/rebalancer/operation-workflow-terminal-transition-repair.js:195-206`); any non-confirmed visibility result silently re-arms (`src/rebalancer/operation-workflow-terminal-transition-repair.js:207-208`).

`persistOperationUpdate()` treats `terminalTransition` specially: terminal writes carry no expected-step CAS and must overwrite a lagging non-terminal durable step unless a different durable terminal state already won (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:151-166`). The write is an UPDATE mutation over `replica_operations` with `buildReplicaOperationUpdateWhereClause()` / `buildReplicaOperationUpdateData()` (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:175-185`) and is sent via `executeReplicaOperationGatewayMutationWithRetry()` with owner id, optional session, timeout budget, `disableSystemWriteSession`, and `REPLACE_PENDING` merge policy (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:186-197`). A changed-row update normally confirms persistence, but repair passes `confirmPersistence:false`, so `confirmPersistedOperationUpdate()` records an owner-persisted visibility witness and returns true without doing the repository confirmation inside the write method (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:228-235`). The repair module then performs the explicit read-back described above.

The gateway path is the canonical mutation ingress if available: `submitMutation`, `insertSystemTableRow`, or `updateSystemTableRow`; otherwise it falls back to raw SQL (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:156-203`). Retries continue until success, a non-retryable result, shutdown, or retry budget exhaustion (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:91-153`). Query options use `timeoutMs: resolveOperationMutationQueryTimeoutMs(timeoutBudget || null)` and `skipCacheWait:true` (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:489-518`); `disableSystemWriteSession:true` forces `sessionId:null` (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:508-511`). Since repair supplies **no** `timeoutBudget` (`src/rebalancer/operation-workflow-terminal-transition-repair.js:175-182`), `resolveOperationMutationQueryTimeoutMs()` returns the default mutation query timeout (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:469-475`), which is 15s (`src/rebalancer/replica-operation-repository.js:196-201`). The 1ms floor only applies when a budget object exists and is exhausted (`src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:476-486`).

Confirmation is owner-local authoritative read-back. `confirmReplicaOperationPersistence()` calls `confirmReplicaOperationVisibility()`; a `DEFERRED` result is returned to the caller, but any non-deferred result without an operation throws `Authoritative replica operation not confirmed: <id>` (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:391-410`). `confirmReplicaOperationVisibility()` loops until a 5s deadline (`src/rebalancer/replica-operation-repository.js:219-223`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:443-447`), querying `OWNER_LOCAL_ONLY` with priority-recovery and owner-persisted-transition deferred visibility enabled (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:450-459`). It returns `CONFIRMED` only if operation id, replica id, workflow step, status, updatedAt, and completedAt satisfy the projected terminal operation (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:461-472`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:506-549`). If it sees a mismatching operation, it records mismatch and will return `MISSING` instead of `DEFERRED` at the deadline (`src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:474-498`). Empty/retryable reads can be converted into deferred owner-persisted-transition visibility outcomes while the witness is live (`src/rebalancer/replica-operation-repository-read-methods.js:284-344`; witness recording `src/rebalancer/replica-operation-repository-visibility-methods.js:108-116`; deferred outcome shape `src/rebalancer/replica-operation-repository-visibility-methods.js:519-545`).

## 2. Shape (A) terminal-visibility ghost forensics

The last observed failed `replica_operations` ledger write in the prompt's writable-again boundary is `node-0.log:7448` at 17:49:19.401Z, followed by a deferred retry for `1316cda5` at `node-0.log:7450-7451`. The ghost repairs below continue well after that point.

No ownership skip evidence was found for the three concrete ghost ops. No repair success or repair-abandoned line was found for `114fa70c`, `f5d2a314`, or `5c629581`; their local terminal lines are present (`114fa70c`: `node-0.log:8376`, `node-2.log:2039`; `f5d2a314`: `node-0.log:8238`; `5c629581`: `node-0.log:2136`, `node-2.log:298`, `node-3.log:328`).

### `114fa70c-e448-4dd9-ab00-821796a8c79d` (`sql_transaction_participants-p1` ADD)

Local terminal state: `Operation completed` on node-0 at 17:49:40.849Z (`node-0.log:8376`) and node-2 at 17:49:43.483Z (`node-2.log:2039`). Repair-related lines found:

| node/log lines | timestamps / outcome |
|---|---|
| `node-0.log:8374-8375` | 17:49:40.848Z confirmation failed with `Authoritative replica operation not confirmed`, then repair scheduled `attempt:0`, `delayMs:500`, `workflowStep:ACTIVE`. |
| `node-0.log:8510-8511` | 17:49:47.110Z repair attempt threw `Authoritative replica operation not confirmed`, then scheduled `attempt:1`, `delayMs:1000`. |
| `node-0.log:8609-8610` | 17:49:53.526Z same error, scheduled `attempt:2`, `delayMs:2000`. |
| `node-0.log:8722-8723` | 17:50:01.859Z same error, scheduled `attempt:3`, `delayMs:4000`. |
| `node-0.log:8857-8858` | 17:50:11.287Z same error, scheduled `attempt:4`, `delayMs:8000`. |
| `node-0.log:9168-9169` | 17:50:25.368Z same error, scheduled `attempt:5`, `delayMs:16000`. |
| `node-0.log:9492-9493` | 17:50:47.198Z same error, scheduled `attempt:6`, `delayMs:30000`. |
| `node-0.log:9824-9825` | 17:51:22.332-333Z in stalled window: same error, scheduled `attempt:7`, `delayMs:30000`. |
| `node-0.log:10324-10325` | 17:51:57.355-356Z same error, scheduled `attempt:8`, `delayMs:30000`. |
| `node-0.log:10583-10584` | 17:52:32.577Z same error, scheduled `attempt:9`, `delayMs:30000`. |
| `node-0.log:10979-10980` | 17:53:07.676Z same error, scheduled `attempt:10`, `delayMs:30000`. |
| `node-0.log:11332-11333` | 17:53:43.282Z same error, scheduled `attempt:11`, `delayMs:30000` after ratings start. |
| `node-2.log:2038` | 17:49:43.419Z confirmation deferred, scheduled `attempt:0`, `delayMs:500`. |
| `node-2.log:2092`, `2134`, `2195`, `2356`, `2533`, `2859` | 17:49:50.757Z through 17:50:55.941Z scheduled `attempt:1..6`; all `cause:repair_unconfirmed`, no success. |
| `node-2.log:3373`, `3769`, `4176`, `4559` | 17:51:32.768Z, 17:52:09.584Z, 17:52:46.582Z, 17:53:23.393Z scheduled `attempt:7..10`; all `cause:repair_unconfirmed`, no success. |

Failure shape: repair attempts are running. On node-0 they re-persist (no write error is logged) and then the explicit read-back throws `Authoritative replica operation not confirmed` (`node-0.log:9824`, `node-0.log:10324`, `node-0.log:10583`, `node-0.log:10979`). Per code, that is confirmation/read-back failure after the 5s owner-local visibility loop, not a scheduled-but-never-run case (`src/rebalancer/operation-workflow-terminal-transition-repair.js:175-208`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:391-410`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:443-498`). Node-2's repeated schedules without the throw log are consistent with the non-throwing rearm path: persist returned false with non-terminal authoritative state, or final confirmation returned `DEFERRED`, both of which re-arm without the timer catch log (`src/rebalancer/operation-workflow-terminal-transition-repair.js:183-208`, `src/rebalancer/operation-workflow-terminal-transition-repair.js:225-253`).

### `f5d2a314-017d-4e17-91f0-159912422f55` (`sql_write_operations-p1` ADD)

Local terminal state: `Operation completed` at 17:49:35.276Z (`node-0.log:8238`). Repair-related lines found:

| log lines | timestamps / outcome |
|---|---|
| `node-0.log:8237` | 17:49:35.273Z confirmation deferred, scheduled `attempt:0`, `delayMs:500`, `workflowStep:ACTIVE`. |
| `node-0.log:8396`, `8533`, `8666`, `8783`, `8972`, `9432` | 17:49:41.260Z through 17:50:41.640Z scheduled `attempt:1..6`; all `cause:repair_unconfirmed`, no success. |
| `node-0.log:9764`, `10269`, `10538`, `10901` | 17:51:16.737Z, 17:51:51.752Z, 17:52:26.873Z, 17:53:02.076Z scheduled `attempt:7..10` inside the stalled window; all `cause:repair_unconfirmed`, no success. |
| `node-0.log:11298` | 17:53:37.399Z scheduled `attempt:11` after ratings start. |

Failure shape: repair attempts are scheduled repeatedly and the attempt counter advances, so timers are firing. There are no `Failed to persist operation`, `Terminal transition repair attempt still unconfirmed`, success, or abandoned lines for this op after the terminal line. That points to the silent non-confirming rearm path, not write failure. The earlier `Query timeout after 1ms` budget-doom evidence for this op is pre-terminal transition write pressure: `node-0.log:5977`, `node-0.log:5980-5981`, `node-0.log:6984`, `node-0.log:6990-6991` at 17:48:00 and 17:48:55. Those are before `Operation completed` at `node-0.log:8238`, and the repair attempt itself has no `timeoutBudget`, so repair writes do not inherit the 1ms transition-mutation budget path (`src/rebalancer/operation-workflow-terminal-transition-repair.js:175-182`, `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:469-486`).

### `5c629581-9c0e-4adf-bbaf-b4323edda7c7` (`replica_operations-p1` REPLACE)

Local terminal state: `Operation completed` at `node-0.log:2136`, `node-2.log:298`, and `node-3.log:328`. Repair-related lines found:

| log lines | timestamps / outcome |
|---|---|
| `node-2.log:297`, `328`, `353`, `387`, `428` | 17:45:42.786Z through 17:46:21.616Z scheduled `attempt:0..4`; initial cause `confirmation_deferred`, then `repair_unconfirmed`. |
| `node-2.log:633`, `737-740`, `993`, `1109-1112`, `1542-1544` | 17:46:45.222Z through 17:48:47.788Z write failures / repair catch path under participant failures; repair re-scheduled through `attempt:7`. |
| `node-2.log:1810` | 17:49:19.813Z after the writable boundary: `Operation row missing from authoritative partition after zero-row update; re-inserting owner copy` for terminal `workflowStep:REMOVED`. |
| `node-2.log:1886`, `2197`, `2680` | 17:49:31.521Z, 17:50:08.428Z, 17:50:45.384Z scheduled `attempt:8..10`; no success. |
| `node-2.log:3268`, `3675`, `4082`, `4469` | 17:51:22.566Z, 17:51:59.488Z, 17:52:36.514Z, 17:53:13.459Z scheduled `attempt:11..14`; all `cause:repair_unconfirmed`, no success. |
| `node-2.log:4848` | 17:53:50.459Z scheduled `attempt:15` after ratings start. |
| `node-3.log:306` | 17:45:43.753Z another terminal confirmation deferred schedule for the same op. |

Failure shape: before 17:49:19 this op had real write failures. After 17:49:19 the repair attempt progressed as far as the zero-row divergence arm and reinserted the owner copy (`node-2.log:1810`), but later repair schedules still never confirmed (`node-2.log:1886`, `2197`, `2680`, `3268`, `3675`, `4082`, `4469`). This is not scheduled-but-never-run and not a 1ms budget gate after the writable boundary; it is repair/reinsert followed by non-confirming authoritative visibility.

### Shape (A) budget / ownership classification

The declared transition-mutation budget doom-loop is real, but it gates priority dispatch transition mutations that pass a budget anchored at `operation.createdAt` (`src/rebalancer/operation-workflow-transition-orchestration.js:520-533`, `src/rebalancer/operation-workflow-transition-orchestration.js:780-805`; quest statement `solve/quests/transition-mutation-budget-doom-loop.json:2-3`). The terminal repair write does not pass a budget and therefore gets the default 15s mutation timeout (`src/rebalancer/operation-workflow-terminal-transition-repair.js:175-182`, `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:469-486`, `src/rebalancer/replica-operation-repository.js:196-201`). The artifact's `Query timeout after 1ms` examples for these concrete ghosts are pre-terminal / non-repair evidence (`node-0.log:5977`, `node-0.log:5980-5981`, `node-0.log:6984`, `node-0.log:6990-6991`), not the post-17:49 repair loop.

Verdict for shape (A): **repair runs and re-persist/reinsert attempts happen, but authoritative confirmation never reaches `CONFIRMED`**. The mechanism is half-wired at the authority boundary: the write-side intent exists and is consumed, but the retained terminal projection does not become a visible `completed_at` row, and the repair either throws `Authoritative replica operation not confirmed` or silently re-arms forever.

## 3. Shape (B) `dispatch_already_exists` REMOVE -> ACTIVE driver trace

### What emits `dispatch_already_exists`

The log reason is generated by `OperationWorkflowOwner.resolveTransitionReason()`: any transition to `ACTIVE` that is not `SYNCING -> ACTIVE` returns `OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS` (`src/rebalancer/operation-workflow-owner-execution-lane.js:470-488`; constants `src/rebalancer/rebalancer-constants.js:478-488`). `updateStep()` chooses that reason when no explicit reason is supplied (`src/rebalancer/operation-workflow-transition-orchestration.js:457-464`), persists the step through `persistOperationUpdate()` (`src/rebalancer/operation-workflow-transition-orchestration.js:520-552`), and logs `Operation step changed` with the reason (`src/rebalancer/operation-workflow-transition-orchestration.js:608-615`).

The path that can put a PENDING op directly into `ACTIVE` is dispatch-wake progress preemption, not the normal REMOVE dispatch response. A bounded pending wake is allowed for PENDING critical/priority operations (`src/rebalancer/operation-workflow-dispatch-wake-preemption.js:85-119`; decision table `src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js:38-52`). If the reconciled target status is `ACTIVE`, the pending-target decision resolves `TARGET_ACTIVE` (`src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js:55-63`, `src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js:89-93`, `src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js:113-119`), and `reconcileDispatchWakePendingTargetProgress()` calls `updateStep(operation, WORKFLOW_STEP.ACTIVE)` (`src/rebalancer/operation-workflow-dispatch-wake-preemption.js:195-231`). That helper's comment is create-oriented: target `pending` proves the create handler accepted the request, so it advances durable owner state to creating (`src/rebalancer/operation-workflow-dispatch-wake-preemption.js:184-190`). It is not specialized for REMOVE.

### What should terminalize a proper REMOVE

The normal REMOVE dispatch path claims PENDING to SENDING (`src/rebalancer/operation-workflow-dispatch-execution.js:42-70`, `src/rebalancer/operation-workflow-dispatch-execution.js:287-312`), builds a `REMOVE_REPLICA` request for `OperationType.REMOVE` (`src/rebalancer/operation-workflow-dispatch-response-reconcile.js:337-349`), and delivers it to the target handler (`src/rebalancer/operation-workflow-dispatch-response-reconcile.js:432-449`). For `ALREADY_EXISTS`, `COMPLETED`, or `NOT_FOUND` responses on REMOVE / replace-remove phase, `_handleDispatchResponse()` calls `handleStopPhaseSatisfiedResponse()` (`src/rebalancer/operation-workflow-dispatch-response-reconcile.js:527-545`, `src/rebalancer/operation-workflow-dispatch-response-reconcile.js:551-580`). `handleStopPhaseSatisfiedResponse()` first updates the op to `STOPPING` if necessary, then completes it only when the response is a stop-phase source-absent status; otherwise it reports in-progress (`src/rebalancer/priority-publication-safety-topology.js:43-56`). If a REMOVE is already in STOPPING, `reconcileStoppingOperationProgress()` observes the removing replica and calls `completeOperation()` when the source is absent/removed (`src/rebalancer/operation-workflow-recovery-observation.js:607-638`).

Thus the intended REMOVE terminal driver is the stop-phase handler / stopping reconciliation path, which eventually calls `completeOperation()` and writes `completed_at` (`src/rebalancer/operation-workflow-transition-persistence.js:219-227`, `src/rebalancer/operation-workflow-transition-persistence.js:260-293`).

### Why an already-applied REMOVE that became ACTIVE never terminalizes

`REMOVE + ACTIVE` is outside the existing owner state graph:

- `isObservedProgressOperationShapeCandidate()` allows normal observed-progress steps or `REPLACE + ACTIVE`; it does **not** allow `REMOVE + ACTIVE` (`src/rebalancer/operation-workflow-recovery-observation.js:100-112`).
- Dispatch rearm treats replace-remove `ACTIVE/STOPPING` and REMOVE `STOPPING` as retryable, but not REMOVE `ACTIVE` (`src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:134-157`).
- `isCreateRearmDispatchPhase()` is restricted to critical ADD/REPLACE in `CREATING`, and excludes replace-remove; it does not cover REMOVE (`src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:159-172`).
- `resolveOperationLifecycleAction()` drives `REPLACE + ACTIVE`, initial REMOVE dispatch (`PENDING`/`SENDING`), and REMOVE/REPLACE `STOPPING`, then only pre-sync statuses; `REMOVE + ACTIVE` falls through to `NOOP` (`src/rebalancer/operation-workflow-recovery-timeout.js:471-512`).

Concrete artifact rows:

| op | evidence |
|---|---|
| `b5192375` | Created as REMOVE at `node-4.log:2543`; authoritative row is PENDING at `node-4.log:2544`; it becomes authoritative ACTIVE with `completed_at:null` at `node-4.log:2550`, then logs `PENDING -> ACTIVE`, `reason:dispatch_already_exists` at `node-4.log:2551`. Later planner attempts are blocked by this active op (`node-4.log:2579`, `2680`, `2740`, `2760`, `2783`, `2800`, `2838`, `2875`, `2897`). No completed/failed line was found. |
| `72e4caf4` | Created as REMOVE at `node-4.log:2932`; PENDING authoritative row at `node-4.log:2936`; ACTIVE authoritative row with `completed_at:null` at `node-4.log:2937`; step changed `PENDING -> ACTIVE`, `reason:dispatch_already_exists` at `node-4.log:2938`. Later planner attempts are blocked (`node-4.log:2950`, `2971`, `2995`, `3012`, `3015`). No completed/failed line was found. |
| `a2335184` | Created as REMOVE at `node-0.log:9557`; step changed `PENDING -> ACTIVE`, `reason:dispatch_already_exists` at `node-0.log:9648`; later cleanup attempts are safety-blocked by this active op (`node-0.log:9654`, `9664`, `9725`, `9782`, `9839`). No completed/failed line was found. |
| `3efed647` | Created as REMOVE at `node-0.log:9933`; step changed `PENDING -> ACTIVE`, `reason:dispatch_already_exists` at `node-0.log:10107`; shutdown shows deferred retryable dispatch failures from other nodes while still `workflowStep:ACTIVE` (`node-1.log:3265`, `node-2.log:4852`). No completed/failed line was found. |
| `84048586` | Created as REMOVE at `node-0.log:10664`; step changed `PENDING -> ACTIVE`, `reason:dispatch_already_exists` at `node-0.log:10746`. No completed/failed line was found. |

Known/declared gap check: `operation-workflow-drain-redrive` mentions a historical `REMOVE+ACTIVE / REPLACE+SENDING` symptom, but its own statement says the class was re-scoped/falsified and the accepted lever is unmasking `spread_satisfied_in_flight`, not already-applied REMOVE terminalization (`solve/quests/operation-workflow-drain-redrive.json:14-21`, `solve/quests/operation-workflow-drain-redrive.json:54-56`). `replica-operation-insert-retry-idempotency` covers already-applied INSERT retry collisions, not REMOVE ACTIVE terminalization (`solve/quests/replica-operation-insert-retry-idempotency.json:3`). `transition-mutation-budget-doom-loop` covers exhausted priority transition budgets, not this state-machine gap (`solve/quests/transition-mutation-budget-doom-loop.json:2-3`). I found no quest statement matching `dispatch_already_exists` / already-applied REMOVE -> ACTIVE with missing `completed_at`; this appears unrecorded.

## 4. Verdicts and minimal owner-boundary fix direction

### Shape (A): terminal-visibility ghosts

First violated invariant: **a terminal owner transition must become authoritatively visible as terminal (`completed_at` set) or retain an authority-driving repair until it does**. Owner boundary: `OperationWorkflowOwner` terminal-transition repair and `ReplicaOperationRepository` authoritative visibility (`src/rebalancer/operation-workflow-terminal-transition-repair.js:12-22`, `src/rebalancer/operation-workflow-terminal-transition-repair.js:175-208`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:443-498`).

Classification: **half-wired authority repair**, not gated-by-budget and not proven ownership gap. The mechanism exists, retains terminal projections, schedules timers, and attempts writes. But after the ledger is writable it still either throws `Authoritative replica operation not confirmed` (`114fa70c`) or silently re-arms (`f5d2a314`, `5c629581`) without making `completed_at` authoritative. Minimal fix direction: finish the existing terminal-transition repair to authority. Do not add a parallel watchdog. The repair path must make its retained terminal projection win through the canonical `replica_operations` owner mutation path (including missing-row / zero-change reinsert) and keep actionable diagnostics for every non-confirming read until `confirmReplicaOperationPersistence()` observes the terminal projection; only then clear the repair.

### Shape (B): already-applied REMOVE non-terminalization

First violated invariant: **a REMOVE whose target/source evidence says the removal is already satisfied must enter the stop/removal terminal path (`STOPPING` -> `completeOperation()`), not durable `ACTIVE` with `completed_at:null`**. Owner boundary: dispatch wake/progress preemption plus operation lifecycle resolution (`src/rebalancer/operation-workflow-dispatch-wake-preemption.js:195-231`, `src/rebalancer/operation-workflow-owner-execution-lane.js:470-488`, `src/rebalancer/priority-publication-safety-topology.js:43-56`, `src/rebalancer/operation-workflow-recovery-timeout.js:471-512`).

Classification: **genuinely missing / half-wired state-machine driver**. The evidence is consumed, but by a create-oriented `PENDING -> ACTIVE` progress shortcut. Existing REMOVE terminal drivers only cover normal dispatch responses and `STOPPING` reconciliation, while `REMOVE + ACTIVE` falls to `NOOP`. Minimal fix direction: finish the existing owner workflow, not a parallel path: type-gate the dispatch-wake `TARGET_ACTIVE` shortcut so REMOVE routes through `handleStopPhaseSatisfiedResponse()` / `reconcileStoppingOperationProgress()`, or make `REMOVE + ACTIVE` immediately re-drive to `STOPPING` / complete via the same stop-phase authority.

### Binding count for the demo settle loop

The demo settle loop counts `replica_operations.completed_at` and cannot settle while either class remains. Shape (A) contributes 10 terminal-visibility ghosts in the pinned census (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/pin-run1-operation-churn-source.md:19-34`). Shape (B) contributes at least 5 already-applied REMOVE rows in this artifact (`b5192375`, `72e4caf4`, `a2335184`, `3efed647`, `84048586`; `solve/changes/formation-ledger-self-move-blocks-cluster-ops/pin-run1-operation-churn-source.md:36-50`, `solve/changes/formation-ledger-self-move-blocks-cluster-ops/pin-run1-operation-churn-source.md:61-68`). Therefore fixing only shape (B) would still leave 10 shape-(A) ghosts; fixing only shape (A) would still leave at least 5 shape-(B) rows. Shape (A) is the larger/dominant binding class by count, but the settle loop is co-bound: both owner-boundary fixes are required for `inFlight === 0`.
