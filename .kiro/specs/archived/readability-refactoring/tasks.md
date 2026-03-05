# Implementation Plan: Readability Refactoring

## Overview

Structural refactoring to decompose five god files, reorganize the query
directory, and fix constant naming. No behavioral changes. The existing test
suite is the correctness oracle throughout.

## Workstreams and Tasks

- [x] 1. Constants naming consistency (Requirement 5)
  - [x] 1.1 Rename `ColumnType` to `COLUMN_TYPE` in `src/bootstrap/system-table-schemas-constants.js` and update all internal references within the file.
  - [x] 1.2 Rename `SystemTableName` to `SYSTEM_TABLE_NAME` in `src/bootstrap/system-table-schemas-constants.js` and update all internal references within the file.
  - [x] 1.3 Verify these constants are not exported; if they are, update all import sites.
  - [x] 1.4 Run targeted tests for bootstrap schema modules to confirm no regressions.

- [x] 2. Partition service decomposition (Requirement 3)
  - [x] 2.1 Extract SQL parsing helpers into `src/partition/partition-sql-parser.js`. Update `partition-service.js` to import and delegate.
  - [x] 2.2 Extract CDC delivery logic into `src/partition/partition-cdc-delivery.js`. Update `partition-service.js` to import and delegate.
  - [x] 2.3 Move `SQLiteRaftStorage` and `PartitionRaftLogEntry` classes out of `partition-service.js` into `src/partition/partition-raft-storage.js`.
  - [x] 2.4 Run targeted partition tests to confirm no regressions.

- [x] 3. Admin WebSocket API decomposition (Requirement 1)
  - [x] 3.1 Identify free helper functions and create `src/admin/admin-helpers.js` for shared helpers; relocate single-use helpers to their consuming module.
  - [x] 3.2 Extract service discovery snapshot logic into `src/admin/admin-service-discovery.js` with a helper class. Update `admin-websocket-api.js` to delegate.
  - [x] 3.3 Extract preflight critical path snapshot logic into `src/admin/admin-preflight-snapshot.js`. Update `admin-websocket-api.js` to delegate.
  - [x] 3.4 Extract control snapshot logic into `src/admin/admin-control-snapshot.js`. Update `admin-websocket-api.js` to delegate.
  - [x] 3.5 Extract debug session HTTP handlers into `src/admin/admin-debug-handlers.js`. Update `admin-websocket-api.js` route registration to delegate.
  - [x] 3.6 Verify `admin-websocket-api.js` is approximately 1,500 LOC or less after extractions.
  - [x] 3.7 Run targeted admin tests to confirm no regressions.

- [x] 4. Node joining service decomposition (Requirement 2)
  - [x] 4.1 Extract schema version resolution helpers into `src/bootstrap/join-schema-version-resolver.js` as pure exported functions.
  - [x] 4.2 Extract join readiness evaluation logic into `src/bootstrap/join-readiness-evaluator.js` with a helper class.
  - [x] 4.3 Extract cleanup handlers into `src/bootstrap/join-cleanup-handler.js`.
  - [x] 4.4 Extract `phaseContactSeed` and its retry/error helpers into `src/bootstrap/phases/contact-seed-phase.js`.
  - [x] 4.5 Extract `phaseConnectWebSocket` and connection helpers into `src/bootstrap/phases/connect-websocket-phase.js`.
  - [x] 4.6 Extract `phaseQuerySystemState` and registration helpers into `src/bootstrap/phases/query-system-state-phase.js`.
  - [x] 4.7 Extract `phaseWaitForLeadership` and system service leader helpers into `src/bootstrap/phases/wait-for-leadership-phase.js`.
  - [x] 4.8 Extract `phaseCreateSelfHostedMessageGroup` and message group replica helpers into `src/bootstrap/phases/create-message-group-phase.js`.
  - [x] 4.9 Extract `phaseJoinExistingMessageGroup` and ownership assertion into `src/bootstrap/phases/join-message-group-phase.js`.
  - [x] 4.10 Verify `node-joining-service.js` is approximately 2,000 LOC or less and functions as a thin phase orchestrator.
  - [x] 4.11 Run targeted bootstrap/joining tests to confirm no regressions.

- [x] 5. Bootstrap service decomposition (Requirement 6)
  - [x] 5.1 Audit `bootstrap-service.js` phase methods and map each to a phase module under `src/bootstrap/phases/` with `seed-` prefix.
  - [x] 5.2 Extract seed bootstrap phase methods into individual modules following the same pattern as workstream 4.
  - [x] 5.3 Identify shared helpers between seed and join paths; move to `src/bootstrap/shared/` if not already there.
  - [x] 5.4 Verify `bootstrap-service.js` is approximately 2,000 LOC or less.
  - [x] 5.5 Run targeted bootstrap tests to confirm no regressions.

- [x] 6. Query directory reorganization (Requirement 4)
  - [x] 6.1 Move distributed query files to `src/query/distributed/` using `smartRelocate` for each file.
  - [x] 6.2 Move callback files to `src/query/callback/` using `smartRelocate` for each file.
  - [x] 6.3 Move PostgreSQL compatibility files to `src/query/pg/` using `smartRelocate` for each file.
  - [x] 6.4 Verify core files remain at `src/query/` root and `index.js` re-exports are updated if needed.
  - [x] 6.5 Run targeted query tests to confirm no regressions.

## Verification Checkpoints

- [x] V1. Constants checkpoint — rename complete, targeted bootstrap schema tests pass.
- [x] V2. Partition extraction checkpoint — SQL parser, CDC delivery, and Raft storage extracted, targeted partition tests pass.
- [x] V3. Admin extraction checkpoint — all modules extracted, targeted admin tests pass.
- [x] V4. Node joining extraction checkpoint — all phases and helpers extracted, targeted bootstrap/joining tests pass.
- [x] V5. Bootstrap service extraction checkpoint — seed phases extracted, targeted bootstrap tests pass.
- [x] V6. Query reorganization checkpoint — all files moved to subdirectories, all imports updated, targeted query tests pass.
- [x] V7. Full suite checkpoint — run complete test suite (`npm test`) with 150s timeout, all tests pass.

## Non-Negotiable Guardrails

1. No behavioral changes. Runtime behavior identical before and after.
2. No test assertion changes. Only import paths may change in test files.
3. No new dependencies introduced.
4. No ownership model changes.
5. Each workstream is independently mergeable.
6. Lint must pass after every extraction.
