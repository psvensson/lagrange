# Owner Dependency Fallback Inventory

## Task 2.3 — Enumerate all active topology decision paths that still accept missing owner dependencies and fall back locally

---

## Summary

Seven topology decision components accept owner dependencies optionally and
either fall back locally or silently degrade when those owners are missing.
Six of these are on active production topology decision paths and must be
fixed. One is diagnostic-only and acceptable.

| # | Component | Owner dependency | Fallback behavior | Classification |
| --- | --- | --- | --- | --- |
| 1 | `ControlPlaneReadinessService` | `storageAccountingService` | Returns `null` capacity → `placementEligible: false` | **Active-path-violation** |
| 2 | `ControlPlaneReadinessService` | `cdcGroupPropagationService` | Synthesizes `REPAIR_ONLY` publication mode | **Active-path-violation** |
| 3 | `ManagedSplitWorkflow` | `transactionCoordinator` | Sequential (non-atomic) child metadata insertion | **Active-path-violation** |
| 4 | `RebalanceCoordinator` | `transactionCoordinator` | Sequential (non-atomic) workflow step transitions | **Active-path-violation** |
| 5 | `MovePlanner` | `storageAdmissionService` | Skips capacity filtering entirely — all nodes pass | **Active-path-violation** |
| 6 | `MovePlanner` | `storagePressureBehavior` | Skips pressure gating — all moves pass | **Active-path-violation** |
| 7 | `PartitionSplitMergeManager` | `tablePolicyService` | Returns empty policy `{}` — uses default thresholds | **Diagnostic-only (acceptable)** |
| 8 | Multiple components | `ControlPlaneReadinessService` (self-created) | Create a private instance with potentially incomplete sub-owners | **Structural concern** |

---

## Detailed Findings

### 1. `ControlPlaneReadinessService.getCapacitySnapshot` — `storageAccountingService` missing

**File:** `src/control-plane/control-plane-readiness-service.js`
**Method:** `getCapacitySnapshot()` (line ~487)

**Constructor acceptance:**
```javascript
this.storageAccountingService = options.storageAccountingService || null;
```

**Fallback behavior:**
```javascript
async getCapacitySnapshot(nodeId, _nodeRow) {
  if (this.storageAccountingService &&
      typeof this.storageAccountingService.getCapacitySnapshotForNode ===
        TYPEOF.FUNCTION) {
    return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
  }
  // logs error once, then returns null
  return null;
}
```

**Impact on active topology paths:**
- `null` capacity causes `isCapacityPlacementEligible()` to return `false`
- This makes `placementEligible: false` in the readiness dimensions
- `StorageAdmissionService.evaluateProvisioning()` consumes readiness and
  will mark nodes as ineligible when `placementEligible` is false
- Affects: rebalance admission, split admission, dispatch readiness

**Classification: ACTIVE-PATH-VIOLATION**
The fallback silently degrades placement eligibility for all nodes when the
accounting owner is missing. This is a topology decision that reconstructs
a "deny all" semantic from the absence of an owner rather than failing closed.

---

### 2. `ControlPlaneReadinessService.getPublicationDiagnostics` — `cdcGroupPropagationService` missing

**File:** `src/control-plane/control-plane-readiness-service.js`
**Method:** `getPublicationDiagnostics()` (line ~204)

**Constructor acceptance:**
```javascript
this.cdcGroupPropagationService = options.cdcGroupPropagationService || null;
```

**Fallback behavior:**
```javascript
getPublicationDiagnostics(observedAt) {
  if (this.cdcGroupPropagationService &&
      typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
        TYPEOF.FUNCTION) {
    return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
  }
  // logs error once, then synthesizes a fallback result
  return Object.freeze({
    currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
    reasonCode: 'publication_owner_unavailable',
    enteredAt: observedAt,
    recentTransitions: Object.freeze([]),
  });
}
```

**Impact on active topology paths:**
- The synthesized `REPAIR_ONLY` mode with `reasonCode: 'publication_owner_unavailable'`
  is treated as unhealthy by `isPublicationHealthy()` (only `GROUPED` or
  config-safe-mode `REPAIR_ONLY` are healthy)
- This makes `metadataPublicationHealthy: false` and `controlPlaneWritable: false`
- Cascading effect: `placementEligible: false` for all nodes
- Affects: all admission decisions, dispatch readiness, rebalance planning

**Classification: ACTIVE-PATH-VIOLATION**
The fallback synthesizes a degraded publication mode from the absence of the
owner. This is a topology decision that reconstructs owner-managed semantics
locally (System Guidelines §1.4.5, §1.4.10). The synthesized reason code
`'publication_owner_unavailable'` is from a disabled-path precondition that
should not produce active topology decisions.

---

### 3. `ManagedSplitWorkflow.insertPartitionMetadataAtomically` — `transactionCoordinator` missing

**File:** `src/partition/managed-split-workflow.js`
**Method:** `insertPartitionMetadataAtomically()` (line ~684)

**Constructor acceptance:**
```javascript
this.transactionCoordinator = options.transactionCoordinator || null;
```

**Fallback behavior:**
```javascript
async insertPartitionMetadataAtomically(leftMetadata, rightMetadata) {
  const txCoordinator = this.transactionCoordinator;
  if (txCoordinator) {
    // atomic path: begin → insert left → insert right → commit
  } else {
    // sequential fallback: insert left, then insert right
    await this.insertPartitionMetadata(leftMetadata);
    await this.insertPartitionMetadata(rightMetadata);
  }
}
```

**Impact on active topology paths:**
- When the transaction coordinator is absent, child partition metadata is
  inserted sequentially without atomicity guarantees
- If the process crashes between the two inserts, one child partition exists
  and the other does not — an inconsistent split state
- This is a semantic cut point per Design §6 and Req 5

**Classification: ACTIVE-PATH-VIOLATION**
The sequential fallback changes the atomicity semantics of a topology cut
point based on wiring. Per Design §6 and Req 5, this path must fail closed
when the transaction coordinator is absent.

---

### 4. `RebalanceCoordinator.executeAtomicTransition` — `transactionCoordinator` missing

**File:** `src/rebalancer/rebalance-coordinator.js`
**Method:** `executeAtomicTransition()` (line ~2269)

**Constructor acceptance:**
```javascript
this.transactionCoordinator = options.transactionCoordinator || null;
```

**Fallback behavior:**
```javascript
async executeAtomicTransition(operation, step, reason, persistFn) {
  const txCoordinator = this.transactionCoordinator;
  if (txCoordinator) {
    // atomic path: begin → transitionStep → persistFn → commit
  } else {
    // sequential fallback: transitionStep then persistFn
    await this.operationWorkflowCoordinator.transitionStep(
      operation.operationId,
      {nextStep: step, reason},
    );
    await persistFn();
  }
}
```

**Impact on active topology paths:**
- Every `updateStep()`, `completeOperation()`, and `failOperation()` call
  flows through `executeAtomicTransition()`
- When the transaction coordinator is absent, the in-memory workflow
  transition and the durable SQL persist are not atomic
- If the process crashes between `transitionStep()` and `persistFn()`,
  the in-memory workflow state and the durable row diverge
- This is the primary workflow advancement path for all replica operations

**Classification: ACTIVE-PATH-VIOLATION**
Same pattern as finding #3. The sequential fallback changes the atomicity
semantics of a topology workflow transition based on wiring. Per Design §6
and Req 5, atomic topology cut points must fail closed when the transaction
coordinator is absent.

---

### 5. `MovePlanner.filterNodesByCapacity` — `storageAdmissionService` missing

**File:** `src/rebalancer/move-planner.js`
**Method:** `filterNodesByCapacity()` (line ~183)

**Constructor acceptance:**
```javascript
this.storageAdmissionService = options.storageAdmissionService || null;
```

**Fallback behavior:**
```javascript
async filterNodesByCapacity(nodes, estimatedBytes) {
  if (!this.storageAdmissionService || estimatedBytes <= NUM.ZERO) {
    diagnostics.feasibleCount = nodes.length;
    return {feasibleNodes: nodes, diagnostics};
  }
  // ... admission checks per node
}
```

**Impact on active topology paths:**
- When the admission service is absent, ALL candidate nodes pass capacity
  filtering — no capacity check is performed
- This means rebalance moves can be planned to nodes that are at or beyond
  storage capacity
- `MovePlanner` is used by `UnifiedRebalancer` for every rebalance cycle

**Classification: ACTIVE-PATH-VIOLATION**
The fallback silently allows all nodes when the admission owner is missing.
This is an "allow by default" behavior that violates System Guidelines
§1.5.1 item 4 ("Missing owner dependencies are hard dependency errors.
Fail loudly with a typed error instead of synthesizing fallback decisions
or 'allow by default' behavior.").

---

### 6. `MovePlanner.applyPressureGating` — `storagePressureBehavior` missing

**File:** `src/rebalancer/move-planner.js`
**Method:** `applyPressureGating()` (line ~1031)

**Constructor acceptance:**
```javascript
this.storagePressureBehavior = options.storagePressureBehavior || null;
```

**Fallback behavior:**
```javascript
async applyPressureGating(moves) {
  if (!this.storagePressureBehavior || moves.length === NUM.ZERO) {
    return moves;
  }
  // ... pressure checks per move
}
```

**Impact on active topology paths:**
- When the pressure behavior owner is absent, ALL moves pass pressure
  gating — no pressure check is performed
- Storage-increasing moves to nodes under hard or exhausted pressure
  proceed unchecked

**Classification: ACTIVE-PATH-VIOLATION**
Same "allow by default" pattern as finding #4. The fallback bypasses
pressure gating entirely when the owner is missing.

---

### 7. `PartitionSplitMergeManager.getTablePolicy` — `tablePolicyService` missing

**File:** `src/partition/partition-split-merge-manager.js`
**Method:** `getTablePolicy()` (line ~122)

**Constructor acceptance:**
```javascript
this.tablePolicyService = options.tablePolicyService || null;
```

**Fallback behavior:**
```javascript
async getTablePolicy(partitionId) {
  if (this.tablePolicyService) {
    return this.tablePolicyService.getPolicyForPartition(partitionId);
  }
  return {};
}
```

**Impact:**
- Returns an empty policy object, causing the manager to use its own
  default thresholds for split/merge evaluation
- This only affects split/merge candidate evaluation thresholds, not
  the actual split execution path
- The `PartitionSplitMergeManager` is a trigger/evaluator, not a
  topology state writer (confirmed in task 2.2 inventory)

**Classification: DIAGNOSTIC-ONLY (ACCEPTABLE)**
The empty-policy fallback only affects evaluation thresholds for
split/merge candidate detection. It does not affect topology state
transitions, admission decisions, or workflow advancement. The
production wiring in `ControlPlaneSetup` asserts `tablePolicyService`
as required, so this fallback is only reachable in unit tests.

---

### 8. Structural concern: Multiple components self-create `ControlPlaneReadinessService`

**Affected components:**
- `RebalanceCoordinator` (line ~227)
- `UnifiedRebalancer` (line ~289)
- `ReplicaDispatchService` (line ~82)
- `StorageAdmissionService` (line ~122)

**Pattern:**
```javascript
this.controlPlaneReadinessService =
  options.controlPlaneReadinessService ||
  new ControlPlaneReadinessService({
    nodeId: this.nodeId,
    systemTableCache: this.systemTableCache,
    // sub-owners may be null if not provided
    storageAccountingService: this.storageAccountingService,
    cdcGroupPropagationService: this.cdcGroupPropagationService,
  });
```

**Impact:**
- Each component creates its own `ControlPlaneReadinessService` instance
  when one is not injected
- These self-created instances may have incomplete sub-owners (findings
  #1 and #2 above), propagating the fallback behavior
- In production, `ControlPlaneSetup.create()` constructs a shared
  `ControlPlaneReadinessService` and passes it to all consumers, so
  the self-creation path is primarily a test/wiring-gap concern
- However, the self-creation pattern means that if any component is
  constructed outside `ControlPlaneSetup` (e.g., during bootstrap
  transitions or dynamic reconfiguration), it silently gets a
  potentially degraded readiness service

**Classification: STRUCTURAL CONCERN**
Not a direct active-path violation in steady-state production, but the
pattern enables findings #1 and #2 to propagate silently. The
constructors should require the readiness service rather than
self-creating a potentially incomplete one.

---

## Production Wiring Analysis

`ControlPlaneSetup.create()` is the canonical production composition root.
It constructs shared instances and passes them to consumers:

| Owner | Created in `ControlPlaneSetup`? | Passed to consumers? |
| --- | --- | --- |
| `StorageCapacityAccountingService` | Yes (or reused from coordinator) | Yes — to readiness, admission |
| `ControlPlaneReadinessService` | Yes (or reused from coordinator) | Yes — to admission, dispatch, coordinator |
| `StorageAdmissionService` | Yes (or reused from coordinator) | Yes — to coordinator |
| `RebalanceCoordinator` | Yes (or reused) | Yes — to dispatch |
| `cdcGroupPropagationService` | Passed through from caller | Yes — to readiness, coordinator |
| `DistributedTransactionCoordinator` | **Not wired here** | **Not passed to ManagedSplitWorkflow** |
| `StoragePressureBehavior` | **Not wired here** | **Not passed to MovePlanner** |

**Key wiring gaps:**
1. `DistributedTransactionCoordinator` is not wired through
   `ControlPlaneSetup` to `ManagedSplitWorkflow`. The split workflow
   gets its `transactionCoordinator` from `SQLQueryEngine`'s constructor
   options, which may or may not include it.
2. `DistributedTransactionCoordinator` is also accepted as optional by
   `RebalanceCoordinator` (`options.transactionCoordinator || null`).
   `ControlPlaneSetup.create()` does not pass it, so the coordinator's
   `executeAtomicTransition()` always takes the sequential fallback in
   production unless the caller explicitly provides it.
3. `StoragePressureBehavior` is not wired through `ControlPlaneSetup`
   to `MovePlanner`. The `MovePlanner` is created by `UnifiedRebalancer`
   and only receives what the rebalancer has.
4. `cdcGroupPropagationService` is passed as `|| null` at multiple
   levels, meaning it can be absent in production if the caller of
   `ControlPlaneSetup.create()` does not provide it.

---

## Violations to Resolve (Task 8 scope)

### Must fix (active-path-violations):

1. **`ControlPlaneReadinessService` — `storageAccountingService`:**
   Fail closed when missing on active readiness paths. The constructor
   or a startup hook should assert the dependency is present.

2. **`ControlPlaneReadinessService` — `cdcGroupPropagationService`:**
   Fail closed when missing on active readiness paths. Do not synthesize
   a degraded publication mode from the absence of the owner.

3. **`ManagedSplitWorkflow` — `transactionCoordinator`:**
   Fail closed in `insertPartitionMetadataAtomically()` when the
   transaction coordinator is absent. Remove the sequential fallback
   branch entirely.

4. **`RebalanceCoordinator` — `transactionCoordinator`:**
   Fail closed in `executeAtomicTransition()` when the transaction
   coordinator is absent. Remove the sequential fallback branch
   entirely.

5. **`MovePlanner` — `storageAdmissionService`:**
   Fail closed in `filterNodesByCapacity()` when the admission service
   is absent. Do not silently pass all nodes.

6. **`MovePlanner` — `storagePressureBehavior`:**
   Fail closed in `applyPressureGating()` when the pressure behavior
   owner is absent. Do not silently pass all moves.

### Structural fix:

7. **Self-created `ControlPlaneReadinessService` instances:**
   Components should require the readiness service as a mandatory
   dependency rather than self-creating a potentially incomplete one.
   This prevents findings #1 and #2 from propagating through
   incomplete wiring.

### Acceptable (no fix needed):

8. **`PartitionSplitMergeManager` — `tablePolicyService`:**
   The empty-policy fallback only affects evaluation thresholds and
   is not reachable in production wiring. No change needed.
