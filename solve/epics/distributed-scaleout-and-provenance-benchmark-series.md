---
id: distributed-scaleout-and-provenance-benchmark-series
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/distributed-scaleout-provenance-guard.js --metric
quests:
  - provenance-audit-and-evidence-tier-separation
  - real-3to5-node-rf3-scaleout-and-scenario-a-modes
  - partition-granularity-sweep-5node-rf3
  - scenario-b-rtt-crossover-and-working-set-growth
  - live-movement-under-load-and-scenario-c-joint-scaling
authorizes:
  - .github/workflows
  - data/tidb-comparison
  - docs/benchmarks
  - docs/README.md
  - README.md
  - scripts/checks
  - solve/epics
  - test/distributed/harness
  - test/shards
---

# Distributed scale-out and provenance benchmark series

## Intent (why now)

Establish an empirical, evidence-tier-separated distributed scale-out and provenance
benchmark series across 3-node and 5-node RF=3 topologies. Distinguish verified live cluster
measurements from deterministic contract-model projections. Reclassify modeled baseline
evidence to preserve strict provenance accounting, while qualifying horizontal scaling,
partition granularity, RTT crossover, and live partition movement under load across
Scenario A (`tidb-oltp-baseline`), Scenario B (`tidb-distributed-risk-decision`), and
Scenario C (`streaming-feature-risk-decision`).

## Selected boundary

- Quest 1: Provenance audit and evidence-tier separation. Audit existing benchmark comparisons,
  classify evidence tiers (`observed-docker-cluster` vs `local-oracle-plus-network-model`),
  reclassify Scenario B baseline comparator to contract-model-non-comparable, and badge
  progress visualizations.
- Quest 2: Real 3-to-5 node RF=3 scale-out and Scenario A modes. Measure real scale-out
  throughput and tail latency across 3-node and 5-node RF=3 topologies comparing mesh-partitioned
  and shared-engine configurations.
- Quest 3: Partition granularity sweep on 5-node RF=3 cluster. Evaluate partition density,
  shard count scaling, memory overhead, and coordination latency across 10 to 1000 partitions.
- Quest 4: Scenario B RTT crossover and working set growth. Measure distributed risk decision
  latency and WAN bandwidth consumption as inter-node RTT varies from 0.5 ms to 50 ms and
  working set scales.
- Quest 5: Live movement under load and Scenario C joint scaling. Evaluate continuous event
  ingestion, partition rebalancing, stale route redirection, and freshness-bounded risk decision
  under dynamic topology changes.
- Explicit evidence-tier qualification on every scorecard, chart, and artifact.

## Decision log

- 2026-10-30: Defined the distributed scale-out and provenance benchmark series epic with five
  focused quests. Established strict evidence-tier qualification distinguishing observed live
  cluster runs from local contract models. Reclassified Scenario B comparator baseline as
  `local-oracle-plus-network-model` with non-comparable provenance badging.
