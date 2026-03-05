# Requirements Document

## Introduction

This specification addresses readability and understandability improvements
across the codebase. The primary targets are five oversized files that have
accumulated multiple responsibilities beyond their core concern, a flat 58-file
query directory that lacks navigational structure, and naming inconsistencies
in constants and service types.

The refactoring is strictly structural. No behavioral changes, no new features,
no ownership model changes. Every extraction must preserve the existing public
API surface and pass the full test suite unchanged.

## Scope

Five god files account for ~24k LOC of mixed-concern code:

| File | LOC | Core concern | Mixed-in concerns |
|---|---|---|---|
| `src/bootstrap/node-joining-service.js` | 5,781 | Join orchestration | Readiness evaluation, schema version resolution, cleanup, CDC subscription, phase execution |
| `src/partition/partition-service.js` | 4,957 | Partition lifecycle | SQL parsing, CDC delivery, size tracking, Raft storage class |
| `src/bootstrap/bootstrap-service.js` | 4,954 | Seed bootstrap | (parallel to node-joining-service; same extraction pattern applies) |
| `src/admin/admin-websocket-api.js` | 4,839 | WebSocket admin API | Service discovery snapshots, preflight diagnostics, control snapshots, debug session handlers, free helper functions |
| `src/bootstrap/bootstrap-api.js` | 3,644 | Bootstrap HTTP API | (secondary priority) |

Additionally:

- `src/query/` contains 58 files in a flat directory with no subdirectory
  grouping, making navigation difficult.
- Constants in `src/bootstrap/system-table-schemas-constants.js` use PascalCase
  (`ColumnType`, `SystemTableName`) while the rest of the codebase uses
  `SCREAMING_SNAKE_CASE` for constant objects.

## Glossary

- **God file**: A source file with multiple unrelated responsibilities that
  should be separate modules.
- **Extraction**: Moving a cohesive set of methods/functions from a god file
  into a dedicated module, re-exporting or delegating from the original file.
- **Structural refactoring**: Changing file/module organization without
  changing runtime behavior.

## Requirements

### Requirement 1: Admin WebSocket API Decomposition

**User Story:** As a maintainer, I want the admin WebSocket API file to contain
only WebSocket lifecycle and message routing so I can find diagnostic, discovery,
and debug logic in dedicated modules.

#### Acceptance Criteria

1. Service discovery snapshot logic (build, resolve, readiness context,
   partition context, schema readiness, leadership stability, replica
   readiness, benchmark admission, degradation) SHALL be extracted to a
   dedicated `admin-service-discovery.js` module.
2. Preflight critical path snapshot logic (build, resolve, router connectivity,
   control plane partitions, CDC health, cache freshness, row counts, discovery
   summary, authoritative repair) SHALL be extracted to a dedicated
   `admin-preflight-snapshot.js` module.
3. Control snapshot logic (build, leader summary, voter counts, replica
   operation summary, CDC telemetry) SHALL be extracted to a dedicated
   `admin-control-snapshot.js` module.
4. Debug session HTTP handlers (create, get, update, attach, breakpoints,
   snapshots, DAP request, playback viewer, output file) SHALL be extracted
   to a dedicated `admin-debug-handlers.js` module.
5. Free helper functions at module top level SHALL be relocated to the module
   that uses them, or to a shared `admin-helpers.js` if used by multiple
   extracted modules.
6. After extraction, `admin-websocket-api.js` SHALL contain only WebSocket
   server lifecycle, connection management, message dispatch, query execution,
   and CDC broadcast — approximately 1,500 LOC or less.
7. All existing tests SHALL pass without modification to test assertions
   (test imports may change).

### Requirement 2: Node Joining Service Decomposition

**User Story:** As a maintainer, I want the node joining service to be a thin
phase orchestrator so I can understand and modify individual join phases
independently.

#### Acceptance Criteria

1. Each `phase*` method and its direct helpers SHALL be extractable to
   individual modules under `src/bootstrap/phases/` (the directory already
   exists but is empty).
2. Join readiness evaluation logic (topology readiness, endpoint visibility,
   readiness snapshot building, readiness classification, schema diagnostics)
   SHALL be extracted to a dedicated `join-readiness-evaluator.js` module.
3. Schema version comparison helpers (resolve, extract, compare, parse HLC,
   normalize) SHALL be extracted to a dedicated
   `join-schema-version-resolver.js` module.
4. Join cleanup logic (`cleanupFailedJoin`, `_cleanupQueryingState`,
   `_cleanupWaitingLeadership`, `_cleanupMessageGroup`,
   `_cleanupConnectingWebSocket`) SHALL be extracted to a dedicated
   `join-cleanup-handler.js` module.
5. After extraction, `node-joining-service.js` SHALL be a phase orchestrator
   that sequences phases and delegates — approximately 2,000 LOC or less.
6. All existing tests SHALL pass without modification to test assertions.

### Requirement 3: Partition Service Decomposition

**User Story:** As a maintainer, I want partition Raft storage, SQL parsing,
and CDC delivery to live in focused modules so the partition service file
contains only partition lifecycle orchestration.

#### Acceptance Criteria

1. The `SQLiteRaftStorage` class (currently defined inside
   `partition-service.js`) SHALL be moved to its own module or merged with the
   existing `partition-raft-storage.js` if that file serves the same purpose.
2. SQL parsing helpers (`extractInsertDataFromSQL`, `extractUpdateDataFromSQL`,
   `extractDeleteDataFromSQL`, `extractDataFromParameterizedSQL`,
   `parseValuesFromSQL`, `parseValue`) SHALL be extracted to a dedicated
   `partition-sql-parser.js` module.
3. CDC delivery logic (`deliverCDCEventToSubscriber`,
   `buildCDCSubscriberWrapper`, `subscribeToCDCWithHandshake`,
   `subscribeToCDC`, `unsubscribeFromCDC`, `bufferCDCEventForRetry`,
   `scheduleBufferedCDCReplay`, `flushBufferedCDCEvents`,
   `resolveCDCSubscriberId`, `getCDCSubscriptionDiagnostics`) SHALL be
   extracted to a dedicated `partition-cdc-delivery.js` module.
4. Size tracking methods (`calculatePartitionSize`, `updatePartitionSize`,
   `scheduleSizeUpdate`, `startPeriodicSizeUpdates`,
   `stopPeriodicSizeUpdates`) SHALL be extracted to a dedicated
   `partition-size-tracker.js` module or kept inline if extraction adds
   complexity without clarity benefit.
5. After extraction, `partition-service.js` SHALL contain partition lifecycle,
   Raft role management, query execution, and write proposal — approximately
   2,500 LOC or less.
6. All existing tests SHALL pass without modification to test assertions.

### Requirement 4: Query Directory Reorganization

**User Story:** As a maintainer, I want the query directory organized into
logical subdirectories so I can navigate 58 files without scanning a flat list.

#### Acceptance Criteria

1. Distributed query files (`distributed-merge-engine.js`,
   `distributed-query-planner.js`, `distributed-query-plan-constants.js`,
   `distributed-transaction-coordinator.js`,
   `distributed-write-coordinator.js`, `parallel-query-coordinator.js`,
   `exchange-manager.js`, `straggler-detector.js`,
   `distributed-context-constants.js`) SHALL be moved to
   `src/query/distributed/`.
2. Callback files (`callback-constants.js`, `callback-context.js`,
   `callback-execution-host.js`, `callback-module-artifact.js`,
   `callback-runtime-driver-registry.js`, `callback-stage-constants.js`,
   `callback-stage-executor.js`, `callback-validator.js`,
   `partition-callback-dispatcher.js`) SHALL be moved to
   `src/query/callback/`.
3. PostgreSQL compatibility files (`pg-compat-constants.js`,
   `pg-function-registry.js`, `pg-translate.js`, `pg-type-affinity.js`,
   `postgres-wire-adapter.js`) SHALL be moved to `src/query/pg/`.
4. Core files (`sql-query-engine.js`, `query-executor.js`, `sql-parser.js`,
   `sql-request.js`, `query-router.js`, `query-constants.js`, `index.js`)
   SHALL remain at `src/query/` root.
5. All import paths across the codebase SHALL be updated to reflect new
   locations.
6. All existing tests SHALL pass without modification to test assertions.

### Requirement 5: Constants Naming Consistency

**User Story:** As a maintainer, I want constant object naming to follow one
convention so I do not have to remember which files use PascalCase vs
SCREAMING_SNAKE_CASE.

#### Acceptance Criteria

1. `ColumnType` in `system-table-schemas-constants.js` SHALL be renamed to
   `COLUMN_TYPE` to match codebase convention.
2. `SystemTableName` in `system-table-schemas-constants.js` SHALL be renamed
   to `SYSTEM_TABLE_NAME` to match codebase convention.
3. All internal references within the file SHALL be updated.
4. If these constants are exported and used elsewhere, all import sites SHALL
   be updated.
5. All existing tests SHALL pass without modification to test assertions.

### Requirement 6: Bootstrap Service Decomposition

**User Story:** As a maintainer, I want the seed bootstrap service to follow
the same phase-extraction pattern as the node joining service so both bootstrap
paths are equally navigable.

#### Acceptance Criteria

1. Phase methods in `bootstrap-service.js` SHALL be extractable to individual
   modules under `src/bootstrap/phases/` following the same pattern as
   Requirement 2.
2. Shared bootstrap helpers between seed and join paths SHALL be identified
   and placed in `src/bootstrap/shared/` rather than duplicated.
3. After extraction, `bootstrap-service.js` SHALL be a phase orchestrator —
   approximately 2,000 LOC or less.
4. All existing tests SHALL pass without modification to test assertions.

## Constraints

1. No behavioral changes. Runtime behavior must be identical before and after.
2. No new dependencies. Extractions use only existing project patterns.
3. No test assertion changes. Tests may need import path updates but assertions
   must remain identical.
4. No ownership model changes. Component ownership boundaries defined in
   `architecture.md` are unchanged.
5. Each requirement is independently deliverable and mergeable.
