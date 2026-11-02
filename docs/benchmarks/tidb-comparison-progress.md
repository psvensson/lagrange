# TiDB/TiKV and Lagrange Comparison Progress

This page is generated deterministically from [`data/tidb-comparison/history.ndjson`](../../data/tidb-comparison/history.ndjson) and [`data/tidb-comparison/progress-summary.json`](../../data/tidb-comparison/progress-summary.json), persisting results for every combination of comparison framework version/commit, scenario profile, and both compared systems' versions and commit hashes.

- Static HTML dashboard: [`tidb-comparison-progress.html`](tidb-comparison-progress.html)
- Scenario specifications: [Scenario A (`tidb-oltp-baseline`)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B (`tidb-distributed-risk-decision`)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate (`scenario-a-semantic-closure`)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![TiDB and Lagrange comparison progress chart](tidb-comparison-progress.svg)

## Recorded version and commit combinations

| Recorded (UTC) | Framework Version & Commit | Scenario / Profile | Lagrange Version & Commit | TiDB/TiKV Version & Commit | Combination Digest |
| --- | --- | --- | --- | --- | --- |
| 2026-11-01T17:35:57.365Z | 0.4.0 (9552bfbb68) | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) / risk-three-island-rf3 | 0.4.0 (9552bfbb68) | v8.5.8 (pingcap/ti) | 06fec0d0d847687c |
| 2026-11-01T17:35:57.365Z | 0.4.0 (9552bfbb68) | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) / risk-three-island-rf3-3node-multi-host | 0.4.0 (9552bfbb68) | v8.5.8 (pingcap/ti) | 2793ccae1eb67476 |
| 2026-11-01T17:35:57.365Z | 0.4.0 (9552bfbb68) | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) / 3-node-rf3-multi-host-oltp | 0.4.0 (9552bfbb68) | v8.5.8 (pingcap/ti) | 54825d3eeb1ac1c9 |
| 2026-11-01T17:35:57.365Z | 0.4.0 (9552bfbb68) | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) / 5-node-rf3-multi-host-oltp | 0.4.0 (9552bfbb68) | v8.5.8 (pingcap/ti) | a515470b4600f948 |

## Throughput, latency, and semantic proof progression

| Recorded (UTC) | Scenario | Lagrange ops/s (p50 / p95 / p99 ms) | TiDB/TiKV ops/s (p50 / p95 / p99 ms) | Throughput Ratio (Lagrange / TiDB) | Semantic Proofs (Lagrange / TiDB) |
| --- | --- | --- | --- | --- | --- |
| 2026-11-01T17:35:57.365Z | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | 74.10 (111.81 / 865.52 / 971.61) | 611.70 (21.29 / 63.90 / 65.31) | 0.121x (8.26x lag) | 8/8 vs 8/8 |
| 2026-11-01T17:35:57.365Z | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | 51.20 (114.69 / 1227.43 / 1229.02) | 816.30 (40.96 / 63.31 / 74.48) | 0.063x (15.94x lag) | 8/8 vs 8/8 |
| 2026-11-01T17:35:57.365Z | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | 5.30 (5001.05 / 5002.26 / 5002.79) | 1998.40 (14.57 / 32.37 / 38.20) | 0.003x (377.06x lag) | 33/33 vs 33/33 |
| 2026-11-01T17:35:57.365Z | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | 6.70 (5000.74 / 5002.32 / 5002.46) | 783.00 (22.40 / 84.47 / 95.89) | 0.009x (116.87x lag) | 33/33 vs 33/33 |

## Progress deltas over time

| Recorded (UTC) | Framework Commit | Lagrange ops/s Delta (prev / first) | TiDB ops/s Delta (prev / first) | Ratio Delta (prev) | Lag Factor Delta (prev) | TiDB Proofs Delta (prev) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01T17:35:57.365Z | 9552bfbb68 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 | 0.00 | 0.00 |
| 2026-11-01T17:35:57.365Z | 9552bfbb68 | -22.90 / -22.90 | +204.60 / +204.60 | -0.058 | +7.69 | 0 |
| 2026-11-01T17:35:57.365Z | 9552bfbb68 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 | 0.00 | 0.00 |
| 2026-11-01T17:35:57.365Z | 9552bfbb68 | +1.40 / +1.40 | -1215.40 / -1215.40 | +0.006 | -260.19 | 0 |

## Scenario B distributed risk & movement scorecard ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

> **Provenance notice (`observed-docker-cluster` | `live-cluster-wire`):** This series records live multi-machine cluster wire execution where each database replica, coordinator, and client runs on a separate physical host and all inter-component traffic traverses the physical network interface.

![Scenario B distributed risk and movement comparison chart](tidb-scenario-b-comparison.svg)

| Recorded (UTC) | Profile | Lagrange Cross-Island Bytes/Req | TiDB Cross-Island Bytes/Req | Lagrange Move p99 (ms) | TiDB Move p99 (ms) | Convergence (Lagrange vs TiDB ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01T17:35:57.365Z | [risk-three-island-rf3](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | n/a | n/a | 1545.63 | 74.95 | 1598.46 vs 77.62 |
| 2026-11-01T17:35:57.365Z | [risk-three-island-rf3-3node-multi-host](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | n/a | n/a | 1545.63 | 74.95 | 1598.46 vs 77.62 |
