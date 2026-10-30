---
id: release-0-3-queryable-core
status: open
proof: certification
roadmapRow: null
doneWhen:
  probe: oracle
  args:
    file: solve/oracle/release-0-3-queryable-core.json
quests:
  - partition-key-ordering-owner-completion
  - queryable-core-0-3-2-journeys-completion
authorizes:
  - .github/workflows/tidb-scenario-a-semantic-closure.yml
  - .githooks/pre-push
  - architecture
  - Dockerfile
  - docs/development/agpl-feature-map.md
  - knip.json
  - scripts/check-cognitive-complexity.js
  - scripts/check-duplication.js
  - scripts/checks
  - scripts/generate-global-owner-debt-inventory.js
  - scripts/lab
  - scripts/publish-head.js
  - scripts/quest-evidence
  - scripts/solve
  - scripts/solve.js
  - solve/changes
  - solve/epics/release-0-3-queryable-core.md
  - solve/oracle/release-0-3-queryable-core.json
  - solve/specs/global-secondary-indexes/requirements.md
  - solve/specs/release-0-3-queryable-core
  - src/bootstrap
  - src/index-management
  - src/live-query
  - src/partition
  - src/query
  - src/runtime
  - src/entrypoint-runtime-admin-composition.js
  - test/compatibility
  - test/distributed
  - test/distributed/harness/oltp-comparison-static-web.js
  - test/distributed/harness/oltp-comparison-svg-renderer.js
  - test/index-management
  - test/integration
  - test/live-query
  - test/partition
  - test/query
  - test/runtime
  - test/scripts
  - test/shards
  - test/solve
  - test/transaction
---

# Release 0.3 - Queryable Core completion

## Intent

Complete the original eight Queryable Core axes in **0.3.2**, consuming existing
stabilization/service/comparison evidence. **0.3.1** owns selected corrections
and the [journey rule](../../test/guidelines/release-gate.md#major-feature-user-journeys),
not full feature acceptance. The [feature map](../../docs/development/agpl-feature-map.md)
owns version scope; this planning adoption certifies no runtime.

## Current summary

Checked **2026-10-30**. Continuation: Queryable Core integration owner.

| Field | Current state |
| --- | --- |
| Source/policy | Candidate HEAD `6089dcf038c4e1cf766b0ef8d580345721953506` under rule-set revision 5. |
| Published | [v0.3.0](https://github.com/psvensson/lagrange/releases/tag/v0.3.0), source `79ac781fcc3a30482492751b9971cb178e3cfdca`; publication does not discharge axes. |
| Integrated | [PR151](https://github.com/psvensson/lagrange/pull/151): Scenario A plus cache/readiness, UPDATE, join/read-affinity and PG conflict/TCP repairs. Current execution needs receipts. |
| First pickups | J1 installed startup/provenance; J7 real formation/admission and public setup. Establish current applicability of earlier failures. |
| Remaining frontier | SQL/key, index lifecycle, durable reservations, GSI integration and live producer/handoff qualification; [journeys](../specs/release-0-3-queryable-core/user-journeys.md) credit present components. |
| Next action | Integration owner assigns bounded Quests via [first actions](../specs/release-0-3-queryable-core/tasks.md#first-actions), recording actual candidate, causal blocker and continuation owner. |
| Acceptance | Existing [oracle](../oracle/release-0-3-queryable-core.json): PLANNED, eight outstanding axes; only certification may remove them. |

First-action root-cause trace completed:
- **J1**: container `Dockerfile` runtime stage omits `COPY --from=builder /app/package-lock.json ./package-lock.json` while installed npm provenance without `package-lock.json` is being repaired in `published-package-provenance-closure`.
- **J7**: `test/distributed/harness/oltp-scenario-a-lagrange-public-pg-context.js` writes raw SQL `UPDATE service_definitions` (refused by system-table write guard) and `.github/workflows/tidb-scenario-a-semantic-closure.yml` references missing `scripts/checks/tidb-retryable-conflict-probe-guard.js`.
- **C1**: `R2` sealed as Mode A (synchronous non-unique TX1 index maintenance in 0.3.2; global uniqueness deferred to 1.0).
- **J2–J6**: parallel implementation units active for:
  - **J2**: `PartitionResolver` fail-closed boundary decoding + SQLite oracle journey.
  - **J3**: `IndexService` unique DDL, fail-closed partition execution, pre-persistence materialization, and compound prefix planner journey.
  - **J4**: durable participant locking-read reservations, projection-independent PK extraction, and fail-closed candidate reads.
  - **J5**: synchronous non-unique GSI lifecycle coordinator, fail-closed backfill on unresolved target, current-owner Stage-2 base-row routing.
  - **J6**: committed user-table CDC subscriber delivery, canonical query/projection/limit/param grouping, fail-closed predicate evaluation, and serialized refresh.

`queryable-core-0-3-2-journeys-completion` completed and independently verified:
- **C1**: `R2` sealed as Mode A (synchronous non-unique TX1 maintenance in 0.3.2; global uniqueness deferred to 1.0) with static guard (`metric=0`).
- **J1 & J7 bounded repairs**: `Dockerfile` runtime stage copies `/app/package-lock.json` for container lockfile provenance; `oltp-scenario-a-lagrange-public-pg-context.js` uses `seedNode.scalePostgresWireListener` instead of raw `UPDATE service_definitions`; `tidb-retryable-conflict-probe-guard.js` added for `tidb-scenario-a-semantic-closure.yml`. Recorded remaining external blockers: installed npm package startup without `package-lock.json` (`published-package-provenance-closure`) and live multi-node Scenario A execution on certified lab hardware.
- **J2**: `PartitionResolver` fail-closed boundary decoding and `extractConditionValue` parameter/NaN validation + 285-assertion SQLite oracle journey (`test/query/queryable-core-j2-sql-key-read-journey.test.js`).
- **J3**: `IndexService` partition-scoped `UNIQUE` DDL, fail-closed partition execution with rollback (`DROP INDEX IF EXISTS`) before metadata persistence, zero-partition refusal, and 73-assertion local/compound index journey (`test/index-management/queryable-core-j3-local-compound-index-journey.test.js`).
- **J4**: durable SQLite `_lagrange_locking_read_reservations` participant mirroring, projection-independent PK extraction, fail-closed candidate reads, and locking-read journey (`test/transaction/queryable-core-j4-locking-read-journey.test.js`).
- **J5**: `GlobalIndexLifecycleCoordinator`, `SQLParser` `CREATE [UNIQUE] GLOBAL INDEX` admission (`0A000` refusal for `UNIQUE`), `IndexService` delegation, fail-closed backfill on unresolved target, synchronous TX1 multi-row maintenance with `INDEX_PARTICIPANT_UNAVAILABLE` rollback, stale generation fencing, Stage-2 current-owner resolution across splits, and 14-step journey (`test/index-management/queryable-core-j5-global-index-journey.test.js`).
- **J6**: transient user-table CDC subscriber delivery on commit without durable Raft obligation amplification, canonical grouping across projection/ORDER BY/LIMIT/params, fail-closed predicate evaluation, serialized refresh with generation fencing, and anti-polling journey (`test/live-query/queryable-core-j6-live-query-journey.test.js`).
- **PG-wire idle rollback notice**: removed duplicate `NO_TRANSACTION_ROLLBACK` success rewrite in `src/query/pg/postgres-wire-adapter.js` so the wire transaction-outcome owner emits PostgreSQL `WARNING 25P01` (`test/query/postgres-wire-adapter.test.js`).

The [five-process receipt](https://github.com/psvensson/lagrange-lab/issues/2643#issuecomment-6505606365)
measured 200 transactions at approximately 0.826 transactions/second on
`8039e45f2ad8314239ed8c67c9883ebb8b47ec9f`, not rebased main. Implemented 33-ID
coverage is not execution. CI/publication provenance stays in the
[stabilization summary](release-0-2-7-stabilization.md#current-coordination-summary);
old receipts neither certify nor veto fresh main by themselves.

## Package and owner index

Use the sole [J0-J10 pickup table](../specs/release-0-3-queryable-core/tasks.md#package-ownership-and-pickup).
J labels are not Quest IDs. Stabilization retains J1/J8/J10 and inherited J2;
J7 consumes graduated comparison authority and J9 service/Q17. Detailed feature
acceptance remains in the journeys and their canonical owners.

## Dependencies and scope

Follow the [dependency map](../specs/release-0-3-queryable-core/tasks.md#dependencies):
independent work under defined contracts, one writer per changing interaction,
ordered integration and one release train. Preserve alpha read limits, fail-fast
locking, complete-read fallback and one SQL/key/TX1/CDC authority. No global
snapshot, serializability, global uniqueness, general transactional DDL or broader
SQL is added. Expansion/comparison stays 0.4, pilot 0.5, global uniqueness 1.0.

The unchanged `authorizes` list grants no blanket cache/testing/steering scope.
Record narrow future expansions, including `src/cache/cdc-table-policy.js`,
through the existing lifecycle before editing. Version bumps remain release-owned.

## Adoption coverage and preserved history

Coverage: R19/revision 5, testing and routed Quest/harness guidance, generated
steering, coordinated roadmap/edition surfaces, both epics/specifications.
Record actual audits in existing review evidence. J0/J10 capability graduation
still needs its canonical source/generator and measured support.

Preserve original Quest IDs, seals, logs, receipts and `doneWhen`/oracle. The
[prior summary](https://github.com/psvensson/lagrange/blob/a43ce6a9fe3c2ffd17fcb084e596a0c709ba88c9/solve/epics/release-0-3-queryable-core.md),
[preimplementation research](../specs/release-0-3-queryable-core/preimplementation-research.md)
and [GSI research](../specs/release-0-3-queryable-core/global-index-maintenance-research.md)
remain provenance, not serial fences. The [crosswalk](../specs/release-0-3-queryable-core/tasks.md#existing-task-crosswalk)
preserves task identities; changed seals require explicit supersession.

## Completion and next review

[Evidence/completion](../specs/release-0-3-queryable-core/user-journeys.md#evidence-and-completion)
binds ordering, PK narrowing, locking, local indexes, compound planning, GSI,
live queries and exact-head exit to working journeys on one candidate. It
consumes stabilization, current-core Scenario A and bounded public-service proof.
0.3.1 leaves unfinished axes open; only existing certification closes them.

By **6 November 2026**, report candidate, passing journeys, first blockers and
Scenario A execution. By **13 November**, use observed repair/review/lab/integration
throughput to set/revise 0.3.2/0.4 windows. These are review horizons, not promises
or waiting periods.

## Activity log

- **2026-10-30**: Sealed C1 (`global-index-maintenance-mode-seal`) adopting Mode A (synchronous non-unique TX1 index maintenance in 0.3.2; global uniqueness deferred to 1.0); authorized narrow scope `solve/specs/global-secondary-indexes/requirements.md` under R16; recorded first-action root-cause traces and launched parallel implementation units J1–J7.
- **2026-10-30**: Authorized narrow scope `.github/workflows/tidb-scenario-a-semantic-closure.yml`, `Dockerfile`, and `test/distributed/harness/oltp-scenario-a-lagrange-public-pg-context.js` under R16 for J1 container lockfile provenance repair and J7 Scenario A public service configuration + workflow guard repair.
- **2026-10-30**: Completed and independently verified `queryable-core-0-3-2-journeys-completion`: sealed C1 Mode A GSI contract and static guard; completed bounded repairs for J1 Dockerfile package-lock provenance, J7 public PG listener scaling and TiDB conflict probe guard, and PG-wire idle ROLLBACK WARNING 25P01 preservation; verified J2-J6 runtime fixes and end-to-end user journeys (J2 285-assertion SQLite oracle, J3 local/compound index DDL rollback and prefix planner, J4 durable SQLite locking-read reservations and PK extraction, J5 synchronous non-unique GSI lifecycle/TX1 maintenance/routing, J6 push-backed live-query CDC delivery and canonical grouping) with 0 guideline or ratchet violations.
