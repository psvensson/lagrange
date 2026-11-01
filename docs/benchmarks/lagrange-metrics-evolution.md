# Lagrange Longitudinal Metrics Evolution

Progressive evolution of Lagrange across chronological milestones, tracking Scenario A OLTP throughput,
semantic proof closure, Scenario B distributed risk decision latency, and Scenario C streaming feature evaluation.

- Navigation: [Benchmark Index](README.md) | [Dashboard](index.html) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A OLTP Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk Decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | [Scenario C Streaming Feature Risk Decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![Lagrange metrics evolution over time](lagrange-metrics-evolution.svg)

## How Lagrange metrics develop over time (version and commit progression)

| Milestone | Version | Commit | Date | Evidence Tier | Execution Mode | Scenario A (tx/s) | p95 (ms) | Proofs | Scenario B (dec/s) | Scenario C (dec/s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.4.0-3node-rf3-multi-host | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 5.30 | 5002.3 | 33/33 | 51.2 | 35.3 |
| v0.4.0-4node-rf3-multi-host | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 135.60 | 453.0 | 33/33 | 113.5 | 248.2 |
| v0.4.0-5node-rf3-60pct-coverage | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 6.70 | 5002.3 | 33/33 | 74.1 | 54.9 |
| v0.4.0-5node-rf3-p30-sweet-spot | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 6.70 | 5002.3 | 33/33 | 53.1 | 54.9 |
| v0.4.0-5node-rf3-live-movement | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 6.70 | 5002.3 | 33/33 | 49.8 | 54.9 |
| v0.4.0-5node-rf3-scenario-c-5x | 0.4.0 | 9552bfbb68 | 2026-11-01 | observed-docker-cluster | live-cluster-wire | 6.70 | 5002.3 | 33/33 | 74.1 | 56.8 |

## Commit-over-commit delta progression

- **v0.4.0-3node-rf3-multi-host (commit 0.4.0)**: 3-node RF=3 cluster across 3 dedicated GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-3`) with external client on `lagrange-bench-6` over GCP VPC internal wire.
- **v0.4.0-4node-rf3-multi-host (commit 0.4.0)**: 4-node RF=3 scale-out across 4 dedicated GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-4`) with external client on `lagrange-bench-6` over GCP VPC internal wire.
- **v0.4.0-5node-rf3-multi-host (commit 0.4.0)**: 5-node RF=3 scale-out (60% replica coverage) across 5 dedicated GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-5`) with external client on `lagrange-bench-6` over GCP VPC internal wire.
- **v0.4.0-5node-rf3-p30-sweet-spot (commit 0.4.0)**: 5-node RF=3 partition granularity sweep (P=6, 15, 30, 60) measured across 5 dedicated GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-5`) with client on `lagrange-bench-6` over GCP VPC internal wire.
- **v0.4.0-5node-rf3-live-movement (commit 0.4.0)**: 5-node RF=3 live partition movement under steady load measured across 5 dedicated GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-5`) with client on `lagrange-bench-6` over GCP VPC internal wire.
- **v0.4.0-5node-rf3-scenario-c-5x (commit 0.4.0)**: 5-node RF=3 Scenario C streaming feature evaluation under 0ms/100ms/1000ms SLAs and 5x joint load across 5 GCP e2-standard-4 VMs (`lagrange-bench-1`..`lagrange-bench-5`) with client on `lagrange-bench-6` over GCP VPC internal wire.

## Provenance qualification across historical milestones

All published milestones require strict multi-machine over-the-wire execution:

- **observed-docker-cluster (live-cluster-wire)**: Every cluster node, replica, and client driver runs on a separate physical host (`boot_id` verified) and all inter-node and client-to-cluster traffic traverses the physical network interface.
- **No estimated or single-host data**: Legacy single-host loopback runs and modeled topological projections (`local-oracle-plus-network-model` / `modeled-topology-oracle`) have been purged.
