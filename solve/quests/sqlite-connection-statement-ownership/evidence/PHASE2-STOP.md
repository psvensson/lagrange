# Phase 2 stopped candidate

Base HEAD: 1b51362e0f7af24a5e373b8a57619d4cf13ec706. Rules revision 5, source 2fca51dc9a2f0344e23f0535dfa50fe0e000b674.

F preservation aed5cba28; integration composition 3a1fcd4ee; frozen tree b8f0f6474fa013c8393460fa54e40a5be4793ea5. Applied patch without commit, excluding generated primary-classes conflict. All 55 other F paths matched final F manifest before migration (phase2-f-composition.json). Phase1 owner/three tests/evidence preserved. Phase1 approval and Phase2 scope/release appended canonically.

## First unexpected failure and required handoff

phase2-boundaries.log: 9 refusal cases pass; positive explicit-birth/init control fails at its witness SELECT against invented `_replica_lifecycle`. Canonical table is `_raft_rs_replica_lifecycle` (lifecycle constants owner). This is a test author schema-name error, not demonstrated product incorrectness. Actual born database acquisition reached branded connection assertion and identity checks before this SELECT. Remaining positive initialization assertions did not execute. Exit1; no timeout/loader failure. No implementation or witness repair after failure. Stronger Astra must reassess/reimplement per user policy.

The earlier phase2-red-first.log is an expected baseline: 9 cases, 1 pass and 8 missing/before-SQL refusal failures. It does not trigger unexpected-failure policy.

## Applied migration and unfinished work

Ten production acquisitions across six files converted: shared operation-port acquisition (partition/MG/WASM), preparation custody, two lifecycle observations, two hydration opens, two checkpoint opens, and installed-image/staging opens. Cached-owner assertions added before constructor DDL, participant stamping/state shortcut, lifecycle birth/original allocation, snapshot absence shortcuts, explicit reservation registration/acquisition/release/sweep, and CDC/outcome initialization. Existing helpers keep canonical private branding; no adoption or cache/close logic changes.

Shared producer fixtures from the approved design converted, plus specifically selected handles passed directly to strict durable/peer/participant/lifecycle owners. Exact selections in phase2-fixture-producers.json. This file records the additional direct selections; seven shared producer files are represented in phase2-changed-paths.json. Other constructors co-located in the same file remain raw.

This candidate is incomplete and not integration-ready. Remaining raw fixture closure has not been audited completely: lifecycle helpers and indirect schema/census callers may still require migration. Production raw acquisitions are individually classified in phase2-retained-raw-acquisitions.json; 14 sites retained. Generic SQLiteStore indirect fixture consumers remain an explicit audit item. Reservation no-database memory semantics and existing SQL-failure catches remain inherited; supplied unowned handle paths were tightened. Full schema/census boundary controls, production opening/restart/hydration/checkpoint/install positives, scoped static checks, source-size completion and broad lab cone remain unrun. Existing approved phase1 evidence cannot discharge them. No further tests after the first unexpected failure, no commits/push, and no foreign worktree edits.

## Exact Phase 2 changed paths

Baseline uses own HEAD plus the verified F patch, excluding preserved Phase1.

- src/partition/partition-hydration-image-pages.js
- src/partition/partition-cdc-obligation-ledger.js
- src/partition/partition-participant-transaction-store.js
- src/partition/partition-committed-statement-outcome.js
- src/partition/partition-locking-read-reservation.js
- src/raft/raft-rs-snapshot-witness.js
- src/raft/raft-rs-replica-lifecycle-observation.js
- src/raft/raft-rs-preparation-custody.js
- src/raft/raft-rs-durable-store.js
- src/raft/snapshot-checkpoint-store.js
- src/raft/raft-rs-peer-identity.js
- src/raft/raft-rs-replica-lifecycle-owner.js
- src/raft/raft-rs-operation-port.js
- src/raft/snapshot-install.js
- test/node/replica-handler-remove-closed-service.test.js
- test/node/replica-removal-required-ports.test.js
- test/node/replica-handler-owner-path-bypass-removal.test.js
- test/query/scenario-a-transaction-coordination-fast-path.test.js
- test/query/scenario-a-deep-stack-throughput-and-latency.test.js
- test/query/sql-query-engine-system-table-write-admission.test.js
- test/storage/sqlite-prepared-statement-owner.test.js
- test/partition/partition-legacy-consensus-state.test.js
- test/partition/partition-port-refusal-outcomes.test.js
- test/partition/participant-origin-retained-history.test.js
- test/partition/partition-unreadable-durable-record.test.js
- test/partition/partition-participant-transaction-apply.test.js
- test/partition/learner-promotion-proof-committed-admission.test.js
- test/partition/replica-admission-from-committed-operation.test.js
- test/diagnostics/raft-churn-sync-section-attribution.test.js
- test/raft/raft-rs-status-peer-resolution.test.js
- test/raft/raft-rs-original-allocation-store.test.js
- test/raft/raft-rs-original-allocation-lifecycle-operation.test.js
- test/raft/raft-rs-original-allocation-cold-inspection.test.js
- test/raft/snapshot-lifecycle-staging.test.js
- test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js
- test/raft/raft-rs-backend/durable-store-committed-entries.test.js
- test/raft/raft-rs-backend/deterministic-raft-rs-cluster.js
- test/raft/raft-rs-backend/peer-identity.test.js
- test/raft/raft-rs-backend/replica-freshness-closure.test.js
- test/raft/raft-rs-backend/durable-commit-sync.test.js
- test/raft/raft-rs-backend/durable-own-group-record.test.js
- test/raft/raft-rs-backend/membership-generation-persistence.test.js
- test/raft/raft-rs-backend/operation-port-ready-recovery.test.js
- test/raft/raft-rs-backend/persistence-admission.test.js
- test/test-helpers/transaction-coordinator-group-fixture.js
- test/test-helpers/original-allocation-durable-reader.js
- test/test-helpers/original-allocation-declaration-fixture.js
- test/test-helpers/partition-removal-serving-surface.js
- test/integration/message-group-learner-runtime-authorization.integration.test.js
- test/bootstrap/seed-retained-effects-fixture.js
- test/bootstrap/seed-retained-effects-preparation.test.js
- test/storage/sqlite-connection-production-boundaries.test.js

The retained phase2-source-migration.patch is a tracked source delta against F preservation aed5cba28; it also contains earlier integration-base differences. Use phase2-changed-paths.json for exact Phase2-only scope.
