# Lagrange Longitudinal Metrics Evolution

Progressive evolution of Lagrange across chronological milestones, tracking Scenario A OLTP throughput,
semantic proof closure, Scenario B distributed risk decision latency, and Scenario C streaming feature evaluation.

- Navigation: [Benchmark Index](README.md) | [Dashboard](index.html) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A OLTP Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk Decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | [Scenario C Streaming Feature Risk Decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![Lagrange metrics evolution over time](lagrange-metrics-evolution.svg)

## How Lagrange metrics develop over time (version and commit progression)

| Milestone | Version | Commit | Date | Evidence Tier | Execution Mode | Scenario A (tx/s) | p95 (ms) | Proofs | Scenario B (dec/s) | Scenario C (dec/s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.4.0-3node-rf3-multi-host | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 382.90 | 90.8 | 33/33 | 391.9 | 125.3 |
| v0.4.0-4node-rf3-multi-host | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 66.00 | 495.8 | 33/33 | 435.5 | 1128.0 |
| v0.4.0-5node-rf3-multi-host | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 146.80 | 403.9 | 33/33 | 538.7 | 774.1 |
| v0.4.0-5node-rf3-p30-sweet-spot | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 146.80 | 403.9 | 33/33 | 451.1 | 774.1 |
| v0.4.0-5node-rf3-live-movement | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 146.80 | 403.9 | 33/33 | 381.5 | 617.1 |
| v0.4.0-5node-rf3-scenario-c-5x | 0.4.0 | 07206ba1c8 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 146.80 | 403.9 | 33/33 | 538.7 | 1128.4 |

## Commit-over-commit delta progression

- **v0.4.0-3node-rf3-multi-host (commit 0.4.0)**: 3-node RF=3 cluster across 3 dedicated physical machines (`adam-laptop`, `adams-gamla`, `lenovo-laptop`) with external client on `tv-dator` over 192.168.86.0/24 LAN wire.
- **v0.4.0-4node-rf3-multi-host (commit 0.4.0)**: 4-node RF=3 scale-out across 4 dedicated physical machines (`adam-laptop`, `adams-gamla`, `lenovo-laptop`, `tv-dator`) with external client on `controller` over LAN wire.
- **v0.4.0-5node-rf3-multi-host (commit 0.4.0)**: 5-node RF=3 scale-out (60% per-node replica coverage) across 5 dedicated bare-metal Linux machines with external client on `carinas-windows` over LAN wire.
- **v0.4.0-5node-rf3-p30-sweet-spot (commit 0.4.0)**: 5-node RF=3 partition granularity sweep (P=6, 15, 30, 60) measured over physical LAN wire across 5 dedicated hosts.
- **v0.4.0-5node-rf3-live-movement (commit 0.4.0)**: 5-node RF=3 live partition movement under steady load measured over physical LAN wire across 5 dedicated hosts.
- **v0.4.0-5node-rf3-scenario-c-5x (commit 0.4.0)**: 5-node RF=3 Scenario C streaming feature evaluation under 0ms/100ms/1000ms SLAs and 5x joint load over physical LAN wire.

## Provenance qualification across historical milestones

All published milestones require strict multi-machine over-the-wire execution:

- **observed-docker-cluster (live-cluster-wire)**: Every cluster node, replica, and client driver runs on a separate physical host (`boot_id` verified) and all inter-node and client-to-cluster traffic traverses the physical network interface.
- **No estimated or single-host data**: Legacy single-host loopback runs and modeled topological projections (`local-oracle-plus-network-model` / `modeled-topology-oracle`) have been purged.
