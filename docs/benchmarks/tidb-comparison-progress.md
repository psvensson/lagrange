# TiDB/TiKV and Lagrange Comparison Progress

This page is generated deterministically from [`data/tidb-comparison/history.ndjson`](../../data/tidb-comparison/history.ndjson) and [`data/tidb-comparison/progress-summary.json`](../../data/tidb-comparison/progress-summary.json), persisting results for every combination of comparison framework version/commit, scenario profile, and both compared systems' versions and commit hashes.

- Static HTML dashboard: [`tidb-comparison-progress.html`](tidb-comparison-progress.html)
- Scenario specifications: [Scenario A (`tidb-oltp-baseline`)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B (`tidb-distributed-risk-decision`)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate (`scenario-a-semantic-closure`)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![TiDB and Lagrange comparison progress chart](tidb-comparison-progress.svg)

## Recorded version and commit combinations

| Recorded (UTC) | Framework Version & Commit | Scenario / Profile | Lagrange Version & Commit | TiDB/TiKV Version & Commit | Combination Digest |
| --- | --- | --- | --- | --- | --- |
| 2026-11-01T14:06:39.413Z | 0.4.0 (86e795c441) | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) / risk-three-island-rf3 | 0.4.0 (86e795c441) | v8.5.8 (pingcap/ti) | 761bb3030b4285e7 |
| 2026-11-01T14:06:39.413Z | 0.4.0 (86e795c441) | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) / 5-node-rf3-multi-host-oltp | 0.4.0 (86e795c441) | v8.5.8 (pingcap/ti) | a8276e0be975c6b3 |
| 2026-11-01T14:06:39.413Z | 0.4.0 (86e795c441) | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) / risk-three-island-rf3-3node-multi-host | 0.4.0 (86e795c441) | v8.5.8 (pingcap/ti) | bf38ebdef7b9775f |
| 2026-11-01T14:06:39.413Z | 0.4.0 (86e795c441) | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) / 3-node-rf3-multi-host-oltp | 0.4.0 (86e795c441) | v8.5.8 (pingcap/ti) | c5d2ada54d79a839 |

## Throughput, latency, and semantic proof progression

| Recorded (UTC) | Scenario | Lagrange ops/s (p50 / p95 / p99 ms) | TiDB/TiKV ops/s (p50 / p95 / p99 ms) | Throughput Ratio (Lagrange / TiDB) | Semantic Proofs (Lagrange / TiDB) |
| --- | --- | --- | --- | --- | --- |
| 2026-11-01T14:06:39.413Z | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | 2345.20 (9.64 / 22.02 / 29.45) | 702.90 (23.85 / 33.45 / 37.66) | 3.336x (0.30x lag) | 8/8 vs 8/8 |
| 2026-11-01T14:06:39.413Z | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | 2199.40 (13.11 / 30.91 / 49.34) | 1118.70 (19.40 / 48.81 / 52.76) | 1.966x (0.51x lag) | 33/33 vs 33/33 |
| 2026-11-01T14:06:39.413Z | [tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | 2172.30 (9.88 / 23.42 / 26.78) | 2309.00 (13.04 / 20.15 / 23.71) | 0.941x (1.06x lag) | 8/8 vs 8/8 |
| 2026-11-01T14:06:39.413Z | [tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | 2014.00 (11.06 / 23.26 / 25.30) | 1359.40 (10.39 / 23.08 / 27.23) | 1.482x (0.67x lag) | 33/33 vs 33/33 |

## Progress deltas over time

| Recorded (UTC) | Framework Commit | Lagrange ops/s Delta (prev / first) | TiDB ops/s Delta (prev / first) | Ratio Delta (prev) | Lag Factor Delta (prev) | TiDB Proofs Delta (prev) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01T14:06:39.413Z | 86e795c441 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 | 0.00 | 0.00 |
| 2026-11-01T14:06:39.413Z | 86e795c441 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 | 0.00 | 0.00 |
| 2026-11-01T14:06:39.413Z | 86e795c441 | -172.90 / -172.90 | +1606.10 / +1606.10 | -2.396 | +0.76 | 0 |
| 2026-11-01T14:06:39.413Z | 86e795c441 | -185.40 / -185.40 | +240.70 / +240.70 | -0.484 | +0.17 | 0 |

## Scenario B distributed risk & movement scorecard ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

> **Provenance notice (`observed-docker-cluster` | `live-cluster-wire`):** This series records live multi-machine cluster wire execution where each database replica, coordinator, and client runs on a separate physical host and all inter-component traffic traverses the physical network interface.

![Scenario B distributed risk and movement comparison chart](tidb-scenario-b-comparison.svg)

| Recorded (UTC) | Profile | Lagrange Cross-Island Bytes/Req | TiDB Cross-Island Bytes/Req | Lagrange Move p99 (ms) | TiDB Move p99 (ms) | Convergence (Lagrange vs TiDB ms) |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01T14:06:39.413Z | [risk-three-island-rf3](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | n/a | n/a | 21.50 | 42.95 | 21.88 vs 48.04 |
| 2026-11-01T14:06:39.413Z | [risk-three-island-rf3-3node-multi-host](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | n/a | n/a | 21.50 | 42.95 | 21.88 vs 48.04 |
