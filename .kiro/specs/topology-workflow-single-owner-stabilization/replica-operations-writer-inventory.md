# `replica_operations` Writer Inventory

## Task 2.1 — Enumerate every writer and classify owned field subsets

### Table Schema (15 columns)

| Column | Type | Constraint |
| --- | --- | --- |
| `operation_id` | TEXT | PRIMARY KEY |
| `type` | TEXT | NOT NULL |
| `partition_id` | TEXT | NOT NULL |
| `entity_type` | TEXT | NOT NULL |
| `entity_id` | TEXT | NOT NULL |
| `replica_id` | TEXT | — |
| `source_node_id` | TEXT | NOT NULL |
| `target_node_id` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL |
| `workflow_step` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL |
| `updated_at` | INTEGER | NOT NULL |
| `completed_at` | INTEGER | — |
| `error_message` | TEXT | — |
| `steps_history` | TEXT (JSON) | NOT NULL |

---

## Field Ownership Classification

### A. Identity fields (immutable after creation)

`operation_id`, `type`, `partition_id`, `entity_type`, `entity_id`,
`source_node_id`, `target_node_id`, `created_at`

These are set once at row creation and never mutated afterward.

### B. Workflow-owner fields (coordinator-owned lifecycle)

`status`, `workflow_step`, `updated_at`, `completed_at`,
`error_message`, `steps_history`

Per the target architecture (Design §2, Req 1), these fields should be
mutated exclusively by `RebalanceCoordinator`.

### C. Mutable identity field

`replica_id` — set at creation, but also updated by executor-side
`updateOperationStep` calls (passed via `options.replicaId`).

---

## Production Writers

### 1. `RebalanceCoordinator` — Owner-legitimate

**File:** `src/rebalancer/rebalance-coordinator.js`

**Write mechanisms:**

| Method | SQL | Operation |
| --- | --- | --- |
| `persistNewOperation` | `INSERT INTO replica_operations (all 15 cols)` | Row creation |
| `persistOperationUpdate` | `UPDATE replica_operations SET status, workflow_step, updated_at, completed_at, error_message, steps_history, replica_id WHERE operation_id = ?` | Row update |

**Callers of persistOperationUpdate (via higher-level methods):**

- `createOperationInternal` → `persistNewOperation` — initial row INSERT
- `updateStep` → `persistOperationUpdate` — workflow_step transitions
  (CREATING→SYNCING, SYNCING→ACTIVE, etc.)
- `completeOperation` → `persistOperationUpdate` — terminal success
  (sets completed_at, final workflow_step)
- `failOperation` → `persistOperationUpdate` — terminal failure
  (sets completed_at, error_message, FAILED step)

**Fields written:** All 15 columns on INSERT; `status`, `workflow_step`,
`updated_at`, `completed_at`, `error_message`, `steps_history`,
`replica_id` on UPDATE.

**Classification: OWNER-LEGITIMATE** — This is the intended single owner
per Design §2 and Req 1.

---

### 2. `ReplicaHandler` — Owner-bypassing

**File:** `src/node/replica-handler.js`

**Write mechanism:** `updateOperationStep(operationId, workflowStep, options)`
→ `cdcIntegrationService.updateSystemTableRow(REPLICA_OPERATIONS, ...)`

**Workflow step transitions performed:**

| Call site | Transition | Context |
| --- | --- | --- |
| `handleAddReplica` (line ~721) | → `SYNCING` | After replica creation starts |
| `handleAddReplica` (line ~752) | → `ACTIVE` | After replica becomes active |
| `handleAddReplica` (line ~806) | → `FAILED` | On creation error |
| `handleRemoveReplica` (line ~1003) | → `REMOVED` | After replica removal |
| `handleRemoveReplica` (line ~1069) | → `FAILED` | On removal error |

**Fields written:** `workflow_step`, `status` (derived from step),
`updated_at`, `steps_history`, and optionally `replica_id`,
`error_message`, `completed_at` (for terminal steps).

**Additional behavior:** Has a retry mechanism
(`scheduleReplicaOperationUpdateRetry` / `retryReplicaOperationUpdate`)
that re-attempts the same `updateSystemTableRow` call on cache-visibility
errors.

**Classification: OWNER-BYPASSING** — Directly mutates coordinator-owned
workflow fields (`workflow_step`, `status`, `completed_at`,
`error_message`, `steps_history`). This is the primary contradiction
identified in Design §2. The executor should emit typed outcomes instead.

---

### 3. `MessageGroupServiceHandler` — Owner-bypassing

**File:** `src/node/message-group-service-handler.js`

**Write mechanism:** `updateOperationStep(operationId, workflowStep, options)`
→ `cdcIntegrationService.updateSystemTableRow(REPLICA_OPERATIONS, ...)`

**Workflow step transitions performed:**

| Call site | Transition | Context |
| --- | --- | --- |
| `handleAddReplica` (line ~269) | → `ACTIVE` | After MG replica active |
| `handleAddReplica` (line ~286) | → `FAILED` | On MG creation error |
| `handleRemoveReplica` (line ~447) | → `REMOVED` | After MG replica removal |
| `handleRemoveReplica` (line ~464) | → `FAILED` | On MG removal error |

**Fields written:** `workflow_step`, `status`, `updated_at`,
`steps_history`, and optionally `replica_id`, `error_message`,
`completed_at`.

**Classification: OWNER-BYPASSING** — Same pattern as `ReplicaHandler`.
Directly mutates coordinator-owned workflow fields.

---

### 4. `RuntimeServiceHandler` — Owner-bypassing

**File:** `src/node/runtime-service-handler.js`

**Write mechanism:** `updateOperationStep(operationId, workflowStep, options)`
→ `cdcIntegrationService.updateSystemTableRow(REPLICA_OPERATIONS, ...)`

**Workflow step transitions performed:**

| Call site | Transition | Context |
| --- | --- | --- |
| `handleAddReplica` (line ~263) | → `ACTIVE` | After runtime service active |
| `handleAddReplica` (line ~277) | → `FAILED` | On runtime creation error |
| `handleRemoveReplica` (line ~445) | → `REMOVED` | After runtime removal |
| `handleRemoveReplica` (line ~459) | → `FAILED` | On runtime removal error |

**Fields written:** `workflow_step`, `status`, `updated_at`,
`steps_history`, and optionally `replica_id`, `error_message`,
`completed_at`.

**Classification: OWNER-BYPASSING** — Same pattern as `ReplicaHandler`
and `MessageGroupServiceHandler`.

---

### 5. `ReplicaDispatchService` — Dispatch-claim (borderline)

**File:** `src/control-plane/replica-dispatch-service.js`

**Write mechanism:** `claimPendingDispatch(operationId)`
→ `cdcIntegrationService.updateSystemTableRow(REPLICA_OPERATIONS, ...)`

**Fields written:** `workflow_step` (PENDING → SENDING), `updated_at`

**Conditional write:** Only succeeds if current `workflow_step` is
`PENDING` (optimistic claim pattern).

**Classification: BORDERLINE** — This is a dispatch-claim transition
(PENDING → SENDING) that acts as a coordination lock before forwarding
the operation to the target node. Design §2 states that "any
workflow-step claim required before dispatch is performed through the
coordinator-owned workflow transition path." This write should be routed
through the coordinator or explicitly delegated.

---

### 6. `BootstrapAPI` — MOVE_REPLICA handoff operations

**File:** `src/bootstrap/bootstrap-api.js`

**Write mechanisms:**

| Method | SQL | Operation |
| --- | --- | --- |
| `insertMoveReplicaHandoffOperation` (line ~1763) | `INSERT INTO replica_operations (all 15 cols)` | Row creation for MOVE_REPLICA handoff |
| `updateMoveReplicaHandoffOperation` (line ~1800) | `UPDATE replica_operations SET status, workflow_step, updated_at, completed_at, error_message, steps_history WHERE operation_id = ?` | Phase updates during handoff |
| `reserveMoveReplicaAssignment` (line ~2538) | `INSERT INTO replica_operations (all 15 cols)` | Row creation for MOVE_ASSIGNMENT reservation |
| `markMoveReplicaAssignmentReservationTerminal` (line ~2587) | `UPDATE replica_operations SET status, workflow_step, updated_at, completed_at, error_message, steps_history WHERE operation_id = ?` | Terminal status for expired/completed reservations |

**Fields written:** All 15 columns on INSERT; `status`, `workflow_step`,
`updated_at`, `completed_at`, `error_message`, `steps_history` on UPDATE.

**Classification: OWNER-BYPASSING (special case)** — The bootstrap API
creates and manages its own `replica_operations` rows for MOVE_REPLICA
handoff and assignment reservation workflows. These rows are not created
by `RebalanceCoordinator`. This is a parallel row-creation path that
violates the single-writer contract (Req 1, Design §2). The bootstrap
handoff workflow should either delegate row creation to the coordinator
or be explicitly documented as a separate ownership domain.

---

## Summary Table

| # | Component | File | Creates rows | Mutates workflow fields | Classification |
| --- | --- | --- | --- | --- | --- |
| 1 | `RebalanceCoordinator` | `src/rebalancer/rebalance-coordinator.js` | Yes | Yes | **Owner-legitimate** |
| 2 | `ReplicaHandler` | `src/node/replica-handler.js` | No | Yes | **Owner-bypassing** |
| 3 | `MessageGroupServiceHandler` | `src/node/message-group-service-handler.js` | No | Yes | **Owner-bypassing** |
| 4 | `RuntimeServiceHandler` | `src/node/runtime-service-handler.js` | No | Yes | **Owner-bypassing** |
| 5 | `ReplicaDispatchService` | `src/control-plane/replica-dispatch-service.js` | No | Yes (claim only) | **Borderline** |
| 6 | `BootstrapAPI` | `src/bootstrap/bootstrap-api.js` | Yes | Yes | **Owner-bypassing (special)** |

---

## Duplicated Logic Observation

`ReplicaHandler`, `MessageGroupServiceHandler`, and
`RuntimeServiceHandler` each contain a near-identical
`updateOperationStep` implementation. All three:

1. Read the existing row from `SystemTableCache`
2. Parse and append to `steps_history`
3. Derive `status` from `WORKFLOW_STEP_TO_STATUS`
4. Build an `updateData` object with the same field set
5. Call `cdcIntegrationService.updateSystemTableRow`

This is a textbook §1.2 (No Parallel Implementations) violation — three
copies of the same write logic in three different executor components.

---

## Violations to Resolve (Task 3 scope)

1. **Executor workflow_step writes (ReplicaHandler,
   MessageGroupServiceHandler, RuntimeServiceHandler):** Replace with
   typed outcome emission per Design §2. The coordinator consumes
   outcomes and decides whether to transition.

2. **Dispatch claim write (ReplicaDispatchService):** Route through
   coordinator-owned transition path per Design §2.

3. **Bootstrap MOVE_REPLICA writes (BootstrapAPI):** Either delegate to
   coordinator or document as an explicit separate ownership domain with
   clear boundary.

4. **Triplicated updateOperationStep logic:** Eliminate once executor
   writes are replaced with typed outcomes.
