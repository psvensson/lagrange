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
authorizes:
  - architecture
  - docs/development/agpl-feature-map.md
  - scripts/checks
  - scripts/lab
  - scripts/quest-evidence
  - scripts/solve
  - scripts/solve.js
  - solve/changes
  - solve/epics/release-0-3-queryable-core.md
  - solve/oracle/release-0-3-queryable-core.json
  - solve/specs/release-0-3-queryable-core
  - src/bootstrap
  - src/index-management
  - src/live-query
  - src/partition
  - src/query
  - src/runtime
  - src/entrypoint-runtime-admin-composition.js
  - test/compatibility
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
| Source/policy | Main `a43ce6a9fe3c2ffd17fcb084e596a0c709ba88c9`, reviewed under rule-set 4; adopted policy revision 5 is identified by this commit. |
| Published | [v0.3.0](https://github.com/psvensson/lagrange/releases/tag/v0.3.0), source `79ac781fcc3a30482492751b9971cb178e3cfdca`; publication does not discharge axes. |
| Integrated | [PR151](https://github.com/psvensson/lagrange/pull/151): Scenario A plus cache/readiness, UPDATE, join/read-affinity and PG conflict/TCP repairs. Current execution needs receipts. |
| First pickups | J1 installed startup/provenance; J7 real formation/admission and public setup. Establish current applicability of earlier failures. |
| Remaining frontier | SQL/key, index lifecycle, durable reservations, GSI integration and live producer/handoff qualification; [journeys](../specs/release-0-3-queryable-core/user-journeys.md) credit present components. |
| Next action | Integration owner assigns bounded Quests via [first actions](../specs/release-0-3-queryable-core/tasks.md#first-actions), recording actual candidate, causal blocker and continuation owner. |
| Acceptance | Existing [oracle](../oracle/release-0-3-queryable-core.json): PLANNED, eight outstanding axes; only certification may remove them. |

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
