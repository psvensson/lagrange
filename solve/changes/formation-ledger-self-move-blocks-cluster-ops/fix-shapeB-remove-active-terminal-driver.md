# Fix Shape B REMOVE ACTIVE terminal driver

## Mechanism recap

Shape B stranded REMOVE operations by treating target ACTIVE evidence as create progress. `reconcileDispatchWakePendingTargetProgress()` mapped a PENDING REMOVE with an ACTIVE existing replica to durable ACTIVE, but REMOVE ACTIVE was outside lifecycle, observed-progress, and dispatch-retry drivers. The source replica was still present, so the correct repair is to re-drive REMOVE_REPLICA through the existing stop-phase path, not to auto-complete the row.

## Exact changes

- `src/rebalancer/operation-workflow-dispatch-wake-preemption.js:186-203` now documents the create-phase scope and returns `false` for `OperationType.REMOVE`, so PENDING REMOVE dispatch wakes fall through to owner lifecycle dispatch. REPLACE is unchanged because only REMOVE is excluded.
- `src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:134-182` treats REMOVE ACTIVE as a remove dispatch phase and keeps REMOVE STOPPING retryable, so dispatch/safety retry timers can re-drive the repaired shape.
- `src/rebalancer/operation-workflow-dispatch-response-reconcile.js:210-257` recognizes REMOVE ACTIVE as a redrive dispatch phase. It skips the generic pre-dispatch step regression and still calls `evaluateRemoveSafety()` before sending `REMOVE_REPLICA`.
- `src/rebalancer/replica-operation-repository.js:152-158` and `src/rebalancer/replica-operation-repository-incomplete-read-methods.js:249-316` include REMOVE ACTIVE in incomplete-operation discovery, making the periodic `reconcileOrphanedOperations()` sweep a live driver.
- `test/rebalancer/remove-active-dispatch-redrive.test.js:138-250` adds focused coverage for PENDING REMOVE dispatch-wake fallthrough, periodic REMOVE ACTIVE redrive to completion on NOT_FOUND, and unchanged PENDING REPLACE create-phase shortcut behavior.

## Red-test evidence

Pre-fix command:

```sh
npx tap --disable-coverage --reporter=spec test/rebalancer/remove-active-dispatch-redrive.test.js
```

Relevant failure output:

```text
not ok 2 - PENDING REMOVE with ACTIVE target must dispatch REMOVE_REPLICA
not ok 3 - target ACTIVE is not create-progress evidence for REMOVE
  found: ACTIVE
  doNotWant: ACTIVE
not ok 4 - remove dispatch advances to STOPPING through the stop-phase path
  -STOPPING
  +ACTIVE
not ok 1 - REMOVE+ACTIVE remains visible to the periodic incomplete-op sweep
  -Array [ "op-shape-b-active-remove" ]
  +Array []
not ok 2 - orphan reconcile re-drives REMOVE_REPLICA for ACTIVE REMOVE
not ok 3 - source-absent remove response completes through completeOperation
  -REMOVED
  +ACTIVE
# { total: 13, pass: 5, fail: 8 }
```

## Green results

- `npx tap --disable-coverage --reporter=spec test/rebalancer/remove-active-dispatch-redrive.test.js` → `# { total: 13, pass: 13 }`.
- Required regression/import surface via `npx tap --disable-coverage --reporter=terse ...` over the focused remove suites, touched-module import tests, and repository import tests → `# { total: 1314, pass: 1307, skip: 7 }`.
- `npx eslint src/rebalancer/operation-workflow-dispatch-wake-preemption.js src/rebalancer/operation-workflow-dispatch-rearm-evidence.js src/rebalancer/operation-workflow-dispatch-response-reconcile.js src/rebalancer/replica-operation-repository.js src/rebalancer/replica-operation-repository-incomplete-read-methods.js test/rebalancer/remove-active-dispatch-redrive.test.js` → exit 0.

## Safety analysis

All actual removals still pass through the existing owner workflow. REMOVE ACTIVE now reaches `executeOperationInternal()`, which calls `evaluateRemoveSafety()` before message dispatch (`operation-workflow-dispatch-response-reconcile.js:257`), then uses the existing stop-phase response handler and `completeOperation()` on source-absent NOT_FOUND. No auto-completion path was added. REPLACE behavior is unchanged because the dispatch-wake shortcut is gated only against `OperationType.REMOVE`, and the new regression confirms PENDING REPLACE still advances through the create-phase shortcut without replaying create dispatch.

## Open risks

Shape A terminal visibility/read-back remains unresolved and is intentionally out of scope. The repaired REMOVE ACTIVE row depends on incomplete-operation cache or authoritative owner reads reaching the owner; this change includes both cache and SQL incomplete discovery, but a completely unavailable owner still needs the existing retry/handoff mechanisms.
