# Design Document: Readability Refactoring

## Overview

This design decomposes five oversized files, reorganizes a flat 58-file
directory, and standardizes constant naming — all without changing runtime
behavior. The approach is extract-and-delegate: move cohesive method groups
into focused modules, then have the original file import and delegate to them.

## Goals

1. Reduce the five largest files from 4,800–5,800 LOC to 1,500–2,500 LOC each.
2. Make `src/query/` navigable via logical subdirectories.
3. Eliminate PascalCase constant naming outliers.
4. Preserve all existing tests and runtime behavior.

## Non-Goals

1. Changing component ownership boundaries.
2. Adding new features or capabilities.
3. Refactoring test files (only import paths change if source files move).
4. Splitting `config-constants.js` (single-concern file, not worth splitting).
5. Reorganizing test directory structure.

## Extraction Pattern

All file decompositions follow the same mechanical pattern:

1. Identify a cohesive method group (e.g., all service discovery methods).
2. Create a new module exporting those methods as functions or a class.
3. Methods that access `this` on the original class become either:
   - Functions that accept the required state as parameters, or
   - A helper class that receives the required dependencies via constructor.
4. The original file imports the new module and delegates.
5. The original file's public API surface does not change.

### Delegation Style

For methods that are tightly coupled to instance state, the preferred pattern
is a helper object that receives dependencies:

```javascript
// admin-service-discovery.js
class AdminServiceDiscovery {
  constructor({systemTableCache, nodeId, logger}) {
    this.systemTableCache = systemTableCache;
    this.nodeId = nodeId;
    this.logger = logger;
  }

  buildLocalServiceDiscoverySnapshot(options = {}) {
    // ... extracted logic
  }
}

// admin-websocket-api.js
import {AdminServiceDiscovery} from './admin-service-discovery.js';

class AdminWebSocketAPI {
  constructor(options = {}) {
    // ... existing setup ...
    this.serviceDiscovery = new AdminServiceDiscovery({
      systemTableCache: this.systemTableCache,
      nodeId: this.nodeId,
      logger: this.logger,
    });
  }

  async handleServiceDiscovery(request, reply) {
    const snapshot = await this.serviceDiscovery
      .resolveServiceDiscoverySnapshot(options);
    // ...
  }
}
```

For pure functions (SQL parsing, schema version comparison), direct function
exports are preferred:

```javascript
// partition-sql-parser.js
export function extractInsertDataFromSQL(sql, tableName) { /* ... */ }
export function extractUpdateDataFromSQL(sql, tableName) { /* ... */ }
```

## Detailed Design

### 1) Admin WebSocket API Decomposition

#### Current State

`admin-websocket-api.js` (4,839 LOC) contains:
- WebSocket server lifecycle (~200 LOC)
- Connection management (~200 LOC)
- Message dispatch and query execution (~400 LOC)
- 15 free helper functions (~250 LOC)
- Service discovery snapshot building (~700 LOC)
- Preflight critical path snapshot building (~600 LOC)
- Control snapshot building (~300 LOC)
- Debug session HTTP handlers (~400 LOC)
- Live query subscription handling (~100 LOC)
- Test run HTTP handlers (~200 LOC)
- CDC broadcast (~50 LOC)
- Miscellaneous getters/setters (~100 LOC)

#### Extraction Plan

| New module | Methods extracted | Approx LOC |
|---|---|---|
| `admin-service-discovery.js` | `buildLocalServiceDiscoverySnapshot`, `resolveServiceDiscoverySnapshot`, `shouldAttemptAuthoritativeDiscoveryRepair`, `buildServiceDiscoveryReadinessContext`, `buildDiscoveryLocalTargetPartitionIds`, `resolveLocalPartitionServices`, `resolveLocalPartitionService`, `buildDiscoveryLocalPartitionCdcState`, `buildDiscoveryLocalTargetReplicaStateByNodeId`, `resolveDiscoveryTablePartitionContext`, `resolveDiscoverySchemaReady`, `resolveDiscoveryLeadershipStable`, `buildServiceDiscoveryReplicaReadiness`, `buildServiceDiscoveryReplicaBenchmarkAdmission`, `buildDiscoveryReplicaOperationDegradationByNodeId`, `isReplicaOperationRelevantToDiscoveryScope`, `resolveReplicaOperationDegradationState`, `buildServiceDiscoveryQueryResult`, `ensureAuthoritativeDiscoveryCacheRepair`, `applyAuthoritativeSystemTableRows` | ~700 |
| `admin-preflight-snapshot.js` | `buildLocalPreflightCriticalPathSnapshot`, `resolvePreflightCriticalPathSnapshot`, `shouldAttemptAuthoritativePreflightRepair`, `resolvePreflightSnapshotNodeAddress`, `buildPreflightRouterConnectivitySummary`, `buildPreflightControlPlanePartitionsSummary`, `buildPreflightControlPlanePartitionEntry`, `buildPreflightCdcHealthSummary`, `buildPreflightCacheFreshnessSummary`, `buildPreflightRowCountsSummary`, `buildPreflightDiscoverySummary`, `buildPreflightCriticalPathSnapshotQueryResult` | ~600 |
| `admin-control-snapshot.js` | `buildLocalControlSnapshot`, `buildControlSnapshotLeaderSummary`, `buildControlSnapshotVoterCounts`, `buildControlSnapshotReplicaOperationSummary`, `buildLocalCdcTelemetry`, `buildControlSnapshotQueryResult` | ~300 |
| `admin-debug-handlers.js` | `handleCreateDebugSession`, `handleGetDebugSession`, `handleUpdateDebugSession`, `handleAttachDebugSession`, `handleWriteDebugBreakpoints`, `handleListDebugBreakpoints`, `handleWriteDebugSnapshot`, `handleListDebugSnapshots`, `handleGetDebugSnapshot`, `handleDebugDapRequest`, `handlePlaybackViewerPage`, `handleOutputFile`, `resolveDebugSecurityContext`, `requireDebugMetadataStore`, `resolveDebugApiErrorStatus`, `handleDebugTraceConnection` | ~400 |

Free helper functions relocate to the module that uses them. Functions used by
multiple extracted modules go to `admin-helpers.js`.

#### Residual in `admin-websocket-api.js` (~1,500 LOC)

- Constructor and initialization
- WebSocket connection/disconnection handling
- Message dispatch (`handleMessage`, `handleDispatchableAdminMessage`)
- Query execution (`handleQueryMessage`, `executeQueryWithTimeout`)
- Cache dump (`sendCacheDump`, `buildCacheDump`)
- Live query subscribe/unsubscribe
- CDC broadcast
- Route registration (delegates to extracted handlers)
- Shutdown

### 2) Node Joining Service Decomposition

#### Current State

`node-joining-service.js` (5,781 LOC) contains:
- Phase orchestration (`join`, `executePhase`) (~200 LOC)
- 6 phase methods (~1,500 LOC total)
- Join readiness evaluation (~600 LOC)
- Schema version resolution (~300 LOC)
- Cleanup handlers (~400 LOC)
- CDC subscription and backfill (~400 LOC)
- Message group replica management (~500 LOC)
- Control plane initialization (~400 LOC)
- Node registration (~300 LOC)
- HTTP helpers and seed contact retry (~300 LOC)
- Miscellaneous getters (~100 LOC)

#### Extraction Plan

| New module | Methods extracted | Approx LOC |
|---|---|---|
| `src/bootstrap/phases/contact-seed-phase.js` | `phaseContactSeed`, `resolveJoinRetryPolicy`, `classifySeedContactFailure`, `computeSeedContactRetryDelayMs`, `applySeedContactRetryJitter`, `resolveSeedContactRetryAfterMs`, `parseBootstrapError`, `buildBootstrapFailureError`, `formatLeaderMetadataDetails` | ~350 |
| `src/bootstrap/phases/connect-websocket-phase.js` | `phaseConnectWebSocket`, `connectToClusterNodes`, `deriveWsAddressFromNodeAddress` | ~250 |
| `src/bootstrap/phases/query-system-state-phase.js` | `phaseQuerySystemState`, `hydrateSystemCacheFromBootstrap`, `getSnapshotHydrationOperation`, `registerNodeInCluster`, `registerNodeEndpoint`, `registerMetaServiceEndpoints`, `upsertSystemTableRow`, `getJoinTimeUpsertOptions`, `seedJoinTimeCacheRow` | ~400 |
| `src/bootstrap/phases/wait-for-leadership-phase.js` | `phaseWaitForLeadership`, `waitForSystemServiceLeaders`, `getRequiredSystemWriteTables`, `isSystemTableWriteRoutable`, `hasSystemTablePartition`, `getMissingSystemServiceLeaders`, `getBlockingSystemServiceLeaders` | ~250 |
| `src/bootstrap/phases/create-message-group-phase.js` | `phaseCreateSelfHostedMessageGroup`, `createJoinMessageGroupReplica`, `startJoinMessageGroupReplica`, `stopJoinMessageGroupReplica`, `startDeferredJoinMessageGroupElections`, `registerMessageGroupService`, `registerCreateSelfHostedMetadata` | ~400 |
| `src/bootstrap/phases/join-message-group-phase.js` | `phaseJoinExistingMessageGroup`, `assertReplicaStartupOwnership` | ~200 |
| `join-readiness-evaluator.js` | `waitForCanonicalJoinReadinessConvergence`, `resolveJoinReadinessTimeoutMs`, `resolveJoinReadinessPollIntervalMs`, `repairCanonicalJoinReadinessIfNeeded`, `resolveJoinReadinessTableName`, `collectCanonicalJoinReadinessSnapshot`, `buildCanonicalJoinReadinessSnapshot`, `isControlPlaneAddressReachable`, `evaluateCanonicalJoinTopologyReadiness`, `evaluateCanonicalJoinEndpointVisibility`, `getCanonicalJoinActiveNodeIds`, `resolveMeshConnectivityNodeRows`, `buildClusterMeshSignature`, `shouldReconnectClusterMesh`, `collectCanonicalInFlightReplicaOperationDetails`, `resolveJoinReadinessRequiredNodeIds`, `evaluateCanonicalJoinReadinessSnapshot`, `classifyCanonicalJoinReadinessReasons`, `normalizeCanonicalJoinReadinessSnapshot`, `buildJoinSchemaDiagnosticsByNode`, `getJoinReadinessReasonRank` | ~600 |
| `join-schema-version-resolver.js` | `resolveCanonicalRequiredSchemaVersion`, `resolveCanonicalAppliedSchemaVersion`, `extractCanonicalSnapshotSchemaVersion`, `extractCanonicalCacheSchemaVersion`, `extractCanonicalTableMetadataSchemaVersion`, `extractJoinSchemaVersionFromRecord`, `selectNewestJoinSchemaVersion`, `normalizeJoinSchemaVersion`, `compareJoinSchemaVersions`, `tryParseJoinSchemaHlc` | ~300 |
| `join-cleanup-handler.js` | `handleJoiningFailure`, `cleanupFailedJoin`, `_executeJoinCleanupStep`, `_cleanupQueryingState`, `_cleanupWaitingLeadership`, `_cleanupMessageGroup`, `_cleanupConnectingWebSocket`, `cleanup` | ~400 |

#### Residual in `node-joining-service.js` (~1,500 LOC)

- Constructor
- `join()` orchestrator
- `executePhase()` runner
- `signalReadyForReplicas()`
- CDC subscription (`subscribeToCDCEvents`, `backfillPropagatedCacheTablesFromAuthoritativeState`)
- Control plane initialization (delegates to `src/bootstrap/shared/`)
- Lifecycle owner management
- Service descriptor/replica queue helpers
- Getters and status methods

### 3) Partition Service Decomposition

#### Current State

`partition-service.js` (4,957 LOC) contains:
- `PartitionRaftLogEntry` class (~20 LOC)
- `SQLiteRaftStorage` class (~170 LOC)
- `PartitionService` class (~4,700 LOC)
  - Constructor and initialization (~400 LOC)
  - Raft role/leader management (~300 LOC)
  - Query execution (~300 LOC)
  - Transaction handling (~200 LOC)
  - Write proposal and apply (~400 LOC)
  - CDC event generation (~250 LOC)
  - SQL parsing helpers (~400 LOC)
  - CDC delivery/subscription (~300 LOC)
  - Size tracking (~100 LOC)
  - Learner promotion (~200 LOC)
  - Rebalancer integration (~200 LOC)
  - Miscellaneous getters/setters (~200 LOC)

#### Extraction Plan

| New module | Methods/classes extracted | Approx LOC |
|---|---|---|
| `partition-sql-parser.js` | `extractInsertDataFromSQL`, `extractUpdateDataFromSQL`, `extractDeleteDataFromSQL`, `extractDataFromParameterizedSQL`, `parseValuesFromSQL`, `parseValue` | ~400 |
| `partition-cdc-delivery.js` | `deliverCDCEventToSubscriber`, `buildCDCSubscriberWrapper`, `subscribeToCDCWithHandshake`, `subscribeToCDC`, `unsubscribeFromCDC`, `bufferCDCEventForRetry`, `scheduleBufferedCDCReplay`, `flushBufferedCDCEvents`, `resolveCDCSubscriberId`, `getCDCSubscriptionDiagnostics`, `nextCDCEventSequenceNumber`, `isExternalCdcAllowedForTable`, `shouldBufferCdcWithoutSubscribers` | ~350 |
| Merge `SQLiteRaftStorage` + `PartitionRaftLogEntry` into existing `partition-raft-storage.js` | `SQLiteRaftStorage`, `PartitionRaftLogEntry` | ~190 |

Size tracking (~100 LOC) stays inline — extraction would add complexity
without meaningful clarity benefit.

#### Residual in `partition-service.js` (~3,800 LOC → target ~2,500 with further inline cleanup)

After extraction the file drops to ~3,800 LOC. The remaining methods are
tightly coupled to partition lifecycle and Raft state, which is the file's
actual responsibility. Further reduction would require deeper architectural
changes outside this spec's scope.

### 4) Query Directory Reorganization

#### Current State

58 files in flat `src/query/` directory.

#### Target Structure

```
src/query/
├── distributed/           (9 files)
│   ├── distributed-context-constants.js
│   ├── distributed-merge-engine.js
│   ├── distributed-query-plan-constants.js
│   ├── distributed-query-planner.js
│   ├── distributed-transaction-coordinator.js
│   ├── distributed-write-coordinator.js
│   ├── exchange-manager.js
│   ├── parallel-query-coordinator.js
│   └── straggler-detector.js
├── callback/              (9 files)
│   ├── callback-constants.js
│   ├── callback-context.js
│   ├── callback-execution-host.js
│   ├── callback-module-artifact.js
│   ├── callback-runtime-driver-registry.js
│   ├── callback-stage-constants.js
│   ├── callback-stage-executor.js
│   ├── callback-validator.js
│   └── partition-callback-dispatcher.js
├── pg/                    (5 files)
│   ├── pg-compat-constants.js
│   ├── pg-function-registry.js
│   ├── pg-translate.js
│   ├── pg-type-affinity.js
│   └── postgres-wire-adapter.js
├── sql-query-engine.js    (core, stays)
├── query-executor.js      (core, stays)
├── sql-parser.js          (core, stays)
├── sql-request.js         (core, stays)
├── query-router.js        (core, stays)
├── query-constants.js     (core, stays)
├── index.js               (core, stays)
├── ... (remaining ~35 files stay at root)
```

#### Migration Approach

Use `smartRelocate` for each file move to automatically update import paths
across the codebase. Process one subdirectory group at a time, running targeted
tests after each group.

### 5) Constants Naming Consistency

#### Current State

In `src/bootstrap/system-table-schemas-constants.js`:
- `ColumnType` (PascalCase) — used only within the file
- `SystemTableName` (PascalCase) — used only within the file

#### Design

Rename to `COLUMN_TYPE` and `SYSTEM_TABLE_NAME` respectively. Since these are
file-local (not exported), the change is contained to one file with no external
import updates needed.

### 6) Bootstrap Service Decomposition

Follows the same extraction pattern as node-joining-service (Requirement 2).
Phase methods are extracted to `src/bootstrap/phases/` with a `seed-` prefix
to distinguish from join phases. Shared helpers between seed and join go to
`src/bootstrap/shared/`.

Detailed method mapping deferred to task execution since it mirrors the
node-joining-service pattern exactly.

## Execution Order

The requirements are independent but have a natural ordering that minimizes
merge conflicts:

1. **Requirement 5** (constants naming) — smallest, zero cross-file impact
2. **Requirement 3** (partition service) — self-contained extraction
3. **Requirement 1** (admin WebSocket API) — self-contained extraction
4. **Requirement 2** (node joining service) — builds on existing `phases/` dir
5. **Requirement 6** (bootstrap service) — mirrors Requirement 2 pattern
6. **Requirement 4** (query directory) — file moves touch many import sites,
   best done last to avoid conflicts with other changes

## Risks and Mitigations

1. **Risk:** Extracted methods access deep `this` state from the original class.
   **Mitigation:** Pass required state as constructor dependencies to helper
   classes. Keep the delegation surface minimal.

2. **Risk:** File moves in Requirement 4 break import paths.
   **Mitigation:** Use `smartRelocate` for automatic import updates. Run
   targeted tests after each subdirectory group.

3. **Risk:** Circular dependencies from extracted modules importing each other.
   **Mitigation:** Extracted modules depend only on constants and utilities,
   never on each other or back on the original file.

4. **Risk:** Test files import internal helpers that move.
   **Mitigation:** Update test imports. No test assertion changes needed.

## Testing Strategy

Each requirement uses the same verification approach:

1. Run targeted tests for the affected module before extraction (baseline).
2. Perform extraction.
3. Run the same targeted tests — all must pass with identical assertions.
4. Run lint to verify no style violations.
5. At final checkpoint, run full test suite.

No new tests are required by this spec. The existing test suite is the
correctness oracle.
