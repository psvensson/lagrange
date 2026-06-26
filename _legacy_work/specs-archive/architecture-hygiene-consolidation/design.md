# Design: Architecture Hygiene Consolidation

## Overview

This design addresses six architecture hygiene issues through targeted
refactoring. No new subsystems are introduced. The changes fall into three
categories:

1. **Constants consolidation** (Requirements 1–2): Split overlapping enums into
   clearly-scoped constants with distinct ownership.
2. **Dead code removal** (Requirements 3–5): Remove unreachable code paths,
   unused classes, and legacy delegation adapters.
3. **Cache write audit** (Requirement 6): Verify and document every direct
   `applySystemTableChange` call site against the bootstrap exception rules.

## Architecture

The changes preserve the existing architecture. No new services, tables, or
communication paths are introduced.

### Constants Ownership After Consolidation

```
┌─────────────────────────────────────────────────────────────┐
│                    Constants Ownership                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NODE_STATE (node-state.js)         — node lifecycle        │
│    INITIALIZING, STARTING, CONNECTING, DISCOVERING,         │
│    JOINING, SYNCING, READY, ACTIVE, SUSPECTED, FAILED,     │
│    RECOVERING, DRAINING, SHUTTING_DOWN, STOPPED             │
│                                                             │
│  SERVICE_STATUS (service-status.js) — services table status │
│    ACTIVE (+ future service-specific statuses)              │
│                                                             │
│  STATE (states.js)                  — connection state      │
│    CONNECTED, DISCONNECTED, NORMAL, READY                   │
│                                                             │
│  SERVICE_LIFECYCLE_STATE            — unified lifecycle     │
│  (unified-service-lifecycle.js)                             │
│    CREATED, INITIALIZED, STARTING, RUNNING, STOPPING,      │
│    STOPPED, FAILED                                          │
│                                                             │
│  SERVICE_STATE                      — DELETED               │
│  (service-lifecycle-constants.js)                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### MessageRouter Delivery After Cleanup

```
┌─────────────────────────────────────────────────────────────┐
│                  MessageRouter.deliver()                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  BEFORE (two paths):                                        │
│    if (hasTransportRegistry())                              │
│      → deliverViaTransportRegistry() → deliverViaEndpoint() │
│    else                                                     │
│      → deliverRemote() (labeled "legacy path")              │
│                                                             │
│  AFTER (single path):                                       │
│    → deliverRemote()                                        │
│                                                             │
│  Also removed:                                              │
│    shouldFallbackToInProcess() + in-process fallback branch │
│    (tests use inProcess: true constructor option instead)   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Cache Write Audit Classification

```
┌─────────────────────────────────────────────────────────────┐
│           applySystemTableChange Call Sites                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CANONICAL CDC PATH (no change):                            │
│    CDCHandler.applyEvent()                                  │
│      → cache.applySystemTableChange(tableName, op, data)    │
│                                                             │
│  BOOTSTRAP HYDRATION EXCEPTION (no change, add comment):    │
│    CacheHydrationService.cdcEventApplier()                  │
│      → systemTableCache.applySystemTableChange(...)         │
│    NodeJoiningService.hydrateSystemCacheFromSnapshots()      │
│      → systemTableCache.applySystemTableChange(...)         │
│                                                             │
│  BOOTSTRAP TIMING EXCEPTION (analyze, document or remove):  │
│    NodeJoiningService.registerMessageGroupService()         │
│      → systemTableCache.applySystemTableChange(...)         │
│      Eager local cache write after HTTP POST to seed.       │
│      Needed if node must route to own MG replica before     │
│      CDC delivers the services row.                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Requirement 1: SERVICE_STATUS Extraction

**New file**: `src/constants/service-status.js`

```javascript
const SERVICE_STATUS = Object.freeze({
  ACTIVE: 'active',
});

export {SERVICE_STATUS};
```

The value `'active'` is identical to the current `STATE.ACTIVE`. This is
intentional — the database column values do not change. The purpose is
semantic clarity: code that sets `services.status` imports from
`SERVICE_STATUS`, not from `STATE`.

**Changes to `src/constants/states.js`**:

Remove `ACTIVE`, `STARTING`, `CONNECTING`, `DISCOVERING`, `JOINING`,
`SYNCING`, `DRAINING`, `STOPPED` from `STATE`. These are all node lifecycle
values that belong in `NODE_STATE`, or service status values that belong in
`SERVICE_STATUS`. Retain only:

```javascript
const STATE = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  NORMAL: 'normal',
  READY: 'ready',
});
```

**Migration scope**: ~30 call sites use `STATE.ACTIVE` for service status.
Each is a mechanical replacement: `STATE.ACTIVE` → `SERVICE_STATUS.ACTIVE`
with an import change. The string value does not change, so no data migration
is needed.

`STATE.READY` is used for connection readiness (`connection_state` column) and
remains in `STATE`. This is distinct from `NODE_STATE.READY` (node lifecycle).

### Requirement 2: SERVICE_STATE → SERVICE_LIFECYCLE_STATE Migration

**Analysis**: `SERVICE_STATE` (CREATED → INITIALIZED → RUNNING → STOPPED) is
used only by `ServiceLifecycleMixin`, which is itself not used by any
production class (no class extends `ServiceLifecycleMixin(...)` in `src/`).
The mixin and its constants file are dead code.

**Decision**: Delete both `src/bootstrap/service-lifecycle-constants.js` and
`src/bootstrap/service-lifecycle-mixin.js`. If the mixin pattern is needed in
the future, it should use `SERVICE_LIFECYCLE_STATE` from the unified constants.

If the mixin is discovered to have production callers during implementation
(the grep may have missed dynamic usage), the fallback plan is:

1. Add `INITIALIZED` to `SERVICE_LIFECYCLE_STATE` in
   `src/constants/unified-service-lifecycle.js`.
2. Update `SERVICE_LIFECYCLE_TRANSITIONS` to allow CREATED → INITIALIZED →
   RUNNING (in addition to CREATED → STARTING → RUNNING).
3. Migrate `ServiceLifecycleMixin` to import from unified constants.
4. Delete `src/bootstrap/service-lifecycle-constants.js`.

### Requirement 3: Transport Delivery Path Cleanup

**Removed from MessageRouter**:
- `transportRegistry` field
- `connectionPool` field
- `hasTransportRegistry()` method
- `setTransportRegistry(registry, pool)` method
- `shouldFallbackToInProcess(error)` method
- `deliverViaTransportRegistry(...)` method
- `deliverViaEndpoint(...)` method
- The `if (this.hasTransportRegistry())` branch in `deliver()`
- The `if (this.shouldFallbackToInProcess(error))` branch in `startServer()`

**Preserved** (library code, tested independently):
- `src/transport/transport-registry.js`
- `src/transport/transport-provider.js`
- `src/transport/connection-pool.js`
- `src/transport/router-delivery-manager.js`

These classes are well-tested and represent a future transport abstraction.
They just should not be wired into `MessageRouter` as a dead branch.

**deliver() after cleanup**:

```javascript
async deliver(targetAddress, message, options = {}) {
  // ... address resolution (unchanged) ...

  let result;

  if (targetNodeId === this.nodeId) {
    const selfConn = this.nodeConnections.get(this.nodeId);
    const hasSelfConn =
      selfConn && selfConn.state === ConnectionState.CONNECTED;
    if (!hasSelfConn) {
      result = {
        messageId, correlationId, acknowledged: false,
        error: ROUTER_ERROR_MSG.noConnectionToNode(this.nodeId),
      };
    } else {
      result = await this.deliverRemote(...);
    }
  } else {
    result = await this.deliverRemote(...);
  }

  // ... metrics (unchanged) ...
  return result;
}
```

**startServer() after cleanup**:

The `wsServer.on('error', ...)` handler removes the
`shouldFallbackToInProcess` branch. On bind error, the server simply rejects
the startup promise. Tests that need in-process transport construct the router
with `{inProcess: true}`.

### Requirement 4: MetadataCache Removal

**Analysis**: `MetadataCache` is exported from `src/message-group/index.js`
and re-exported from `src/index.js`, but no production code instantiates it
(`new MetadataCache` appears only in test files). It is dead code.

**Deleted files**:
- `src/message-group/metadata-cache.js`

**Deleted test files**:
- `test/message-group/cache-ttl-expiration.property.test.js`
- `test/message-group/query-on-miss-behavior.property.test.js`

**Updated files**:
- `src/message-group/index.js` — remove `MetadataCache`, `CacheEntry`,
  `CacheEntryStatus` exports.

### Requirement 5: Bootstrap Phase Adapter Removal

**Analysis**: No production code imports from `src/bootstrap/phases/`. The
grep for `import.*from.*phases/infrastructure` etc. returned zero results.
These are dead delegation adapters.

**Deleted files**:
- `src/bootstrap/phases/infrastructure-phase.js`
- `src/bootstrap/phases/partition-phase.js`
- `src/bootstrap/phases/message-group-phase.js`
- `src/bootstrap/phases/cache-hydration-phase.js`
- `src/bootstrap/phases/registration-phase.js`

**Deleted test files**: Any tests in `test/bootstrap/phases/` that test these
adapters in isolation.

**Updated files**:
- `src/bootstrap/index.js` — remove any re-exports of deleted classes.

### Requirement 6: Cache Write Audit

#### Site 1: `NodeJoiningService.hydrateSystemCacheFromSnapshots()` (~line 2184)

**Classification**: Bootstrap hydration exception (valid).

**Timing context**: This runs during the DISCOVERING phase, before CDC
subscriptions are active. The joining node has received a snapshot from the
seed node via HTTP and needs to populate its local cache so it can route
messages. CDC is not yet subscribed — the node doesn't even have a message
group leader yet at this point.

**Action**: Keep. Add annotation comment:

```javascript
// Bootstrap hydration exception: populating cache from seed node
// snapshot before CDC subscriptions are active. See architecture.md
// § Bootstrap Exception and § Joining Node Bootstrap.
```

#### Site 2: `NodeJoiningService.registerMessageGroupService()` (~line 1300)

**Classification**: Requires chicken-and-egg analysis.

**Timing context**: This runs during the CREATING_MESSAGE_GROUP or
JOINING_MESSAGE_GROUP phase. The sequence is:

1. Node creates/joins a message group replica locally.
2. Node sends HTTP POST to seed node's `/bootstrap/register-service` endpoint.
3. Seed node writes the services row to the services partition leader.
4. CDC event propagates to all nodes (including this joining node, eventually).
5. **Eager write**: Node immediately writes the services entry to its own
   local cache without waiting for CDC.

**The chicken-and-egg question**: After step 2, does the joining node need
the services entry in its local cache before CDC delivers it in step 4?

**Analysis**:

- After `registerMessageGroupService()`, the join flow proceeds to
  `phaseWaitForLeadership()`, then initializes the ReplicaHandler, CDC
  integration service, and control plane.
- The CDC integration service creation (`createCdcIntegrationService()`)
  happens AFTER message group registration.
- CDC subscriptions are set up even later, during `phaseQuerySystemState()`.
- Between the HTTP POST (step 2) and CDC subscription activation, the node
  has NO mechanism to receive the CDC event for its own services row.
- The node's `MessageRouter` uses the system cache to resolve service
  addresses. If the node needs to route a message to its own message group
  replica during this window, it needs the services entry in cache.
- The message group replica IS registered with the MessageRouter via
  `messageRouter.register(unifiedAddress, handler)` directly (not via cache
  lookup), so local message delivery works without the cache entry.
- However, OTHER nodes that receive the CDC event may try to route messages
  TO this node's message group replica. Those nodes look up the address in
  their own cache, which gets populated by CDC from the seed's write. This
  path does not depend on the joining node's local cache.
- The joining node itself may need to look up its own message group service
  entry during control plane initialization or readiness checks. The
  `LeaseService` and `HeartbeatService` query the services table. If they
  query before CDC delivers the row, they would not find the entry.

**Conclusion**: The eager write IS necessary as a bootstrap timing exception.
The window between HTTP POST and CDC subscription activation is real, and
components initialized during that window (control plane services, readiness
checks) may query the local cache for the node's own service entries.
Removing this write would create a race condition where the node's own
readiness checks fail because they can't find the message group service entry.

**Action**: Keep. Add annotation comment:

```javascript
// Bootstrap timing exception: eager local cache write after HTTP POST
// to seed node. Required because CDC subscriptions are not yet active
// at this point in the join flow. The node's control plane services
// (initialized next) may query the local cache for this service entry
// before CDC delivers it. See architecture.md § Bootstrap Exception.
```

#### Site 3: `CacheHydrationService.cdcEventApplier` (~line 42)

**Classification**: Bootstrap hydration path (valid).

**Action**: Keep. Already has a comment explaining the purpose.

#### Site 4: `CDCHandler.applyEvent()` (~line 335)

**Classification**: Canonical CDC apply path (valid).

**Action**: Keep. This IS the CDC path.

## Data Models

No data model changes. No new tables, columns, or persistent state.

The only schema change is the addition of `SERVICE_STATUS` constant enum and
the optional addition of `INITIALIZED` to `SERVICE_LIFECYCLE_STATE` (only if
`ServiceLifecycleMixin` has production callers, which current analysis says
it does not).

## Correctness Properties

### Property 1: Service status value preservation

*For any* services table row written with `status: STATE.ACTIVE` before the
migration, the same row written with `status: SERVICE_STATUS.ACTIVE` after
the migration SHALL produce an identical string value (`'active'`).

**Validates: Requirement 1.3**

### Property 2: STATE enum reduction completeness

*For any* value removed from `STATE`, that value SHALL exist in exactly one
of `NODE_STATE` or `SERVICE_STATUS`. No value is lost — it is relocated.

**Validates: Requirements 1.1, 1.2**

### Property 3: Delivery path equivalence

*For any* message delivered via `MessageRouter.deliver()` after the transport
registry branch removal, the delivery result SHALL be identical to the result
produced by the `deliverRemote()` path in the pre-cleanup code when
`hasTransportRegistry()` returns false (which is always the case in
production).

**Validates: Requirement 3.1**

### Property 4: Lifecycle transition preservation

*For any* valid state transition in the pre-migration `ServiceLifecycleMixin`
(CREATED → INITIALIZED, INITIALIZED → RUNNING, RUNNING → STOPPED), the
equivalent transition SHALL be valid in the post-migration lifecycle model.
*For any* invalid transition in the pre-migration model, the equivalent
transition SHALL remain invalid.

**Validates: Requirement 2.4**

## Error Handling

### Constants Migration Errors

- If a file imports `STATE.ACTIVE` after migration and `ACTIVE` has been
  removed from `STATE`, the import will succeed but the value will be
  `undefined`. This will surface as test failures or runtime errors.
- To prevent this, the migration is mechanical: every `STATE.ACTIVE` usage
  is replaced with `SERVICE_STATUS.ACTIVE` in the same commit.

### Dead Code Removal Errors

- Deleting files that are imported by other files will cause immediate import
  errors. The prerequisite grep analysis confirms no production imports exist.
- Test files that import deleted modules will also fail. These test files are
  deleted as part of the same task.

### Cache Write Audit

- No code changes are made to cache write sites (only comments added). There
  is no error risk from the audit itself.

## Testing Strategy

### Testing Framework

- Node.js built-in test runner with TAP output
- Property-based testing with fast-check (max 10 iterations per `fc.assert`)
- All tests must complete under 2 seconds
- No skipped tests

### Unit Tests

1. **Requirement 1**: Test that `SERVICE_STATUS.ACTIVE` equals `'active'`.
   Test that `STATE` no longer contains `ACTIVE`. Test that `NODE_STATE` and
   `SERVICE_STATUS` have no overlapping keys.
2. **Requirement 2**: Test that `service-lifecycle-constants.js` no longer
   exists (file deletion verification). If mixin is preserved, test that it
   uses unified constants.
3. **Requirement 3**: Test that `MessageRouter` does not have
   `hasTransportRegistry`, `setTransportRegistry`, `deliverViaTransportRegistry`,
   `deliverViaEndpoint`, or `shouldFallbackToInProcess` methods. Test that
   `deliver()` routes through `deliverRemote()` for all remote messages.
4. **Requirement 4**: Test that `MetadataCache` is not exported from
   `src/message-group/index.js`.
5. **Requirement 5**: Test that `src/bootstrap/phases/` directory contains no
   phase adapter files.
6. **Requirement 6**: Test that all `applySystemTableChange` call sites in
   `src/` are in the sanctioned list (CDC handler, cache hydration service,
   node joining service hydration, node joining service MG registration).

### Property-Based Tests

- **Property 1** (Value preservation): Generate random service status
  assignments, verify `SERVICE_STATUS.ACTIVE === 'active'` and matches the
  former `STATE.ACTIVE` value.
- **Property 3** (Delivery equivalence): Generate random message payloads and
  target addresses, verify `deliver()` produces the same result as
  `deliverRemote()` for non-self targets.
- **Property 4** (Transition preservation): Generate all valid/invalid
  transition pairs, verify the post-migration model matches pre-migration
  validity.

### Test Configuration

```javascript
fc.assert(
  fc.property(/* ... */),
  {numRuns: 10}
);
```
