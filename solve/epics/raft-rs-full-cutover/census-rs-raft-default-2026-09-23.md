# Census: the whole corpus with rs-raft as the partition default (2026-09-23)

Read-only measurement for the `raft-rs-full-cutover` epic, taken before any
cutover quest is sealed, so R1's scope comes from evidence rather than from
the plan. Nothing here was landed.

## How it was measured

- Tree: main `8ed8f889c` plus exactly one local line on the lab node
  (`RAFT_BACKEND_DEFAULT = RAFT_BACKEND.RAFT_RS_WASM` in
  `src/raft/raft-backend-constants.js`; `selectRaftBackend({})` then answers
  `{backend: 'raft-rs-wasm', source: 'default'}`). The branch exists only on
  tv-dator and was never pushed.
- Runner: `node scripts/run-classified-test-files.js --keep-going --primary
  unit,packaging,integration,bootstrap` (the release corpus selection).
  Without `--keep-going` the runner stops the lane at its first failing batch
  and reported 100 files; the first attempt did exactly that.
- Lab node: tv-dator (12 cores, node 22, MovieLens and the toolchain present).

## Result

| Lane | Files | Pass | Fail |
| --- | --- | --- | --- |
| ordinary | 1877 | 1863 | 14 |
| external-toolchain | 14 | 14 | 0 |
| bootstrap | 182 | 177 | 5 |
| exclusive | 78 | 49 | 29 |
| **all** | **2151** | **2103** | **48** |

The 48 red files, by group (every file is listed once):

Group A (seed cannot bootstrap; 37 files):
- `test/bootstrap/bootstrap-epoch-manager-lifecycle.test.js`
- `test/bootstrap/bootstrap-websocket-server-reentry.test.js`
- `test/bootstrap/fresh-join-via-non-seed-node.integration.test.js`
- `test/bootstrap/node-bootstrap-consistency.property.test.js`
- `test/cdc/current-epoch-propagation.integration.test.js`
- `test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js`
- `test/integration/admin-cdc-propagation.integration.test.js`
- `test/integration/cdc-propagation.integration.test.js`
- `test/integration/concurrent-move-replica-assignment.integration.test.js`
- `test/integration/control-plane-rebalance.integration.test.js`
- `test/integration/convergence-control-snapshot.integration.test.js`
- `test/integration/create-table-partition-provisioning.integration.test.js`
- `test/integration/critical-partition-learner-safety.integration.test.js`
- `test/integration/critical-replica-placement-causal-trace.integration.test.js`
- `test/integration/debug-join-flow.test.js`
- `test/integration/failure-scenarios.integration.test.js`
- `test/integration/insert-or-ignore-raft-replay.integration.test.js`
- `test/integration/leader-metadata-validation.integration.test.js`
- `test/integration/managed-split-admission-reliability.integration.test.js`
- `test/integration/membership-consistency.integration.test.js`
- `test/integration/move-replica-handoff.integration.test.js`
- `test/integration/multi-node-cluster.integration.test.js`
- `test/integration/multi-node-raft-replication.integration.test.js`
- `test/integration/node-joining-rebalance.integration.test.js`
- `test/integration/node-join-replica-activation.integration.test.js`
- `test/integration/preflight-critical-path-hops.integration.test.js`
- `test/integration/raft-leader-election.integration.test.js`
- `test/integration/replica-operations-owner-read-transport-readiness.integration.test.js`
- `test/integration/seed-node-bootstrap.integration.test.js`
- `test/integration/seed-owner-read-diagnosis.integration.test.js`
- `test/integration/services-p1-self-referential-write.integration.test.js`
- `test/integration/single-node-default-replica-count-writes.integration.test.js`
- `test/integration/sql-engine-system-writes-contract.integration.test.js`
- `test/integration/three-node-seed-rebalance.integration.test.js`
- `test/simulation/formation-attribution-provenance.test.js`
- `test/simulation/formation-sim-charged-seed-host.test.js`
- `test/simulation/formation-sim-production-handoff.test.js`

Group B (liferaft-shaped fixtures; 5 files):
- `test/address/address-manager-peer-location-authority.test.js`
- `test/convergence/dt6-learner-promotion-progress-proof.test.js`
- `test/convergence/dt6-learner-promotion-proof-channel-wake.test.js`
- `test/partition/partition-service-transactions-query-routing.test.js`
- `test/raft/snapshot-catchup-end-to-end.test.js`

Group C (assert the old default; 2 files):
- `test/raft/raft-rs-backend/backend-seam.test.js`
- `test/raft/raft-rs-backend/operation-port-regression.test.js`

Group D (red on main regardless of backend, or unclassified; 4 files):
- `test/bootstrap/production-scheduling-defaults.test.js`
- `test/convergence/dt6-ledger-leader-durability-fitness.test.js`
- `test/packaging/sea-bundle-smoke.test.js`
- `test/query/write-path-internal-pacing.test.js`

## Classification of the red files

Every red file was read for its first failing assertion or error. Four groups.

### A. The seed cannot bootstrap on rs-raft: the write path is liferaft-shaped (blocker, R1)

Every group-A file (all the `test/bootstrap/*` and `test/integration/*` reds,
the formation simulations and the MovieLens cohort test) fails the same way: the seed's first partition write during `cache_hydration` throws

```
SqliteError: NOT NULL constraint failed: _raft_log.term
  at SQLiteLogAdapter.persistEntry (src/raft/sqlite-log-adapter.js:203)
  at SQLiteLogAdapter.saveCommand (src/raft/sqlite-log-adapter.js:388)
  at PartitionRaftStorage.appendEntry (src/partition/partition-raft-storage.js:223)
  at PartitionService.applyWrite (src/partition/partition-service-write-metrics-base.js:691)
  at PartitionService.proposeWrite
```

`applyWrite` appends the entry to the legacy durable log itself
(`storage.appendEntry` -> `logAdapter.saveCommand(data, this.currentTerm)`) and
only then proposes. Under rs-raft the durable log is the runtime owner's store
and the term lives in the core, so the legacy append has no term to write and
the write dies before consensus is reached. This is the first R1 defect and it
is structural: the partition write path must become one `propose()` through
the frozen port whose committed-entry application applies the write, with no
second durable log. Everything in this group is downstream of it and needs no
separate quest until it is fixed and the census is re-run.

### B. Fixtures that name the liferaft provider or its log (test debt, migrates with A)

- `dt6-learner-promotion-{fixture,progress-proof,proof-channel-wake}`:
  `leader.raftProvider.propose is not a function` (the rs-raft provider has no
  provider-level propose; the fixture must propose through the port) and the
  committed-prefix seeding through `service.logAdapter` is liferaft-only.
- `snapshot-catchup-end-to-end`: term boot-seeding from durable `currentTerm`
  and the `install_snapshot` decision are liferaft-path facts; the rs-raft path
  has no snapshot catch-up owner yet (epic gap "snapshot/catch-up ownership").
- `address-manager-peer-location-authority`: "the operation-port progress
  probe actually sent there" - the rs-raft `probePeerProgress` reads status or
  ticks; it does not send an append like the liferaft one.
- `partition-service-transactions-query-routing`: "joiner raft state should
  stay follower instead of drifting to candidate" - a deferred-election joiner
  campaigns under rs-raft (election-tick handling vs `DEFER_ELECTION`).

### C. Witnesses that assert the old default (expected reds, delete or invert at cutover)

- `raft-rs-backend/backend-seam` and `raft-rs-backend/operation-port-regression`:
  "an absent backend selection is liferaft, and it says so by name".

### D. Red on main regardless of backend (not census findings)

- `bootstrap/production-scheduling-defaults`, `convergence/dt6-ledger-leader-durability-fitness`,
  `query/write-path-internal-pacing`: frozen-port reach-through since #46,
  recorded in the Q0 re-measure.
- `packaging/sea-bundle-smoke`: "bundle dry-run exits cleanly" fails; the
  bundler warns that `import.meta` is empty in the cjs output, and the rs-raft
  runtime owner resolves the vendored WASM through `import.meta.url`. Whether
  this is rs-raft-specific needs one run of the smoke on plain main on the same
  node; if it is, the SEA packaging of the vendored binding is an R6/R8 item.

## What this changes in the epic's order

R1 ("single-path partition cutover") cannot start with the selector deletion.
Its first red control is group A: a seed node bootstraps and serves a write
with rs-raft as the default. The selector deletion, the `raftProvider`
injection seam, and the legacy-state refusal come after that control is green.
