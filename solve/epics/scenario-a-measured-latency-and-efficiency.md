---
id: scenario-a-measured-latency-and-efficiency
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/scenario-a-measured-latency-and-efficiency-guard.js --metric
    target: 0
quests:
  - transaction-redundant-progress-writes
authorizes:
  - src/query/distributed/distributed-transaction-participant-set.js
  - src/query/distributed/distributed-transaction-statement.js
  - src/query/sql-query-engine-transaction-persistence-methods.js
  - src/workflow/durable-workflow-coordinator.js
  - src/partition/managed-workflow-record-coordinator.js
  - src/query/schema-provisioning-job-repository.js
  - src/query/distributed/distributed-transaction-telemetry.js
  - test/query/tx-metadata-pgwire-and-result-representation.test.js
  - test/query/transaction-participant-set-authority.test.js
  - test/query/scenario-a-transaction-coordination-fast-path.test.js
  - test/query/schema-provisioning-job-owner.test.js
  - test/bootstrap/transaction-telemetry-production-defaults.test.js
  - test/query/transaction-progress-write-witness-support.js
  - test/query/transaction-redundant-progress-writes.test.js
  - test/query/transaction-redundant-progress-writes-recovery.test.js
  - test/scripts/transaction-redundant-progress-writes-guard.test.js
  - test/scripts/scenario-a-measured-latency-and-efficiency-guard.test.js
  - scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js
  - scripts/checks/transaction-redundant-progress-writes-guard.js
  - scripts/checks/scenario-a-measured-latency-and-efficiency-guard.js
  - test/shards/primary-classes.json
  - test/shards/resource-classes.json
  - test/shards/subsystem-classes.json
  - test/shards/impact-graph-seal.json
  - solve/changes/global-owner-debt-inventory/inventory.json
  - solve/changes/priority-recovery-owner-inventory/inventory.json
  - src/query/INDEX.md
  - src/query/distributed/INDEX.md
  - src/workflow/INDEX.md
  - src/partition/INDEX.md
---

# Scenario A: measured latency and efficiency of the transaction path

Successor to the two closed, deterministically proven Scenario A epics
(`scenario-a-transaction-coordination-fast-path`,
`scenario-a-deep-stack-throughput-and-latency`), whose gains were never measured
physically. Why now: the commit-path trace (`reports/r1-commit-path.md` in the OLTP
programme's coordination directory, `/mnt/data/peter/projects/lagrange-oltp-perf-20261128/`)
shows that a write transaction waits for `9 + 2P` consensus rounds in sequence and
issues `6 + 6P` Raft proposals (P = tables written, one partition each): new_order 19
rounds and 36 proposals, payment 17 and 30. On three hosts every round costs a network
round trip to the fastest follower plus two synced SQLite commits in sequence, so the
fixed part of a transaction is dominated by these rounds and not by its statements. The
probe measures the shape of that path deterministically and in process. Through the one
measuring owner its quests share (`measureTransactionShape` in
`test/query/transaction-progress-write-witness-support.js`), it runs a new_order-shaped
and a payment-shaped write transaction through the real `SQLQueryEngine` and transaction
coordinator over the coordinator-table gateway double, with every consensus round taking
one tick of a virtual round clock. It prints the number of unmet rows of a budget:
row 1, new_order sequential rounds at most 14 (today 19); row 2, payment sequential
rounds at most 13 (today 17); row 3, proposals per transaction at most 31 for new_order
and 26 for payment (today 36 and 30). Zero means the commit path does at most this much
sequential and total consensus work, which is the structure the epic set out to reduce.
It reads the tree only, starts nothing, and fails closed (no number, exit 2) when it
cannot measure. It measures no time: latency claims of this epic are made only from
measured runs on the substrate ladder (first look, three lab hosts, then GCP), recorded
with their round-trip measurements, never from this probe.
