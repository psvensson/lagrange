# Lagrange Longitudinal Metrics Evolution

Progressive evolution of Lagrange across chronological milestones, tracking Scenario A OLTP throughput,
semantic proof closure, Scenario B distributed risk decision latency, and Scenario C streaming feature evaluation.

- Navigation: [Benchmark Index](README.md) | [Dashboard](index.html) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A OLTP Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk Decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | [Scenario C Streaming Feature Risk Decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![Lagrange metrics evolution over time](lagrange-metrics-evolution.svg)

## How Lagrange metrics develop over time (version and commit progression)

| Milestone | Version | Commit | Date | Evidence Tier | Execution Mode | Scenario A (tx/s) | p95 (ms) | Proofs | Scenario B (dec/s) | Scenario C (dec/s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.2.0-tidb-ref | 0.2.0 | b0b2f9abcc | 2026-09-12 | observed-docker-cluster | live-cluster-wire | 0.00 | 0.0 | 0/33 | 0.0 | 0.0 |
| v0.3.0-lab-paired | 0.3.0 | 8039e45f2a | 2026-10-29 | observed-docker-cluster | live-cluster-wire | 0.83 | 4418.9 | 4/33 | 0.0 | 0.0 |
| v0.3.0-conflict-retry | 0.3.0 | 66d054c9c9 | 2026-10-30 | observed-docker-cluster | live-cluster-wire | 0.83 | 4418.9 | 16/33 | 0.0 | 0.0 |
| v0.3.0-semantic-closure | 0.3.0 | 27af74dc7b | 2026-10-30 | observed-docker-cluster | live-cluster-wire | 0.83 | 4418.9 | 33/33 | 0.0 | 0.0 |
| v0.3.0-scenario-b-model | 0.3.0 | 2d416de6e5 | 2026-10-30 | modeled-topology-oracle | local-js-oracle | 0.83 | 4418.9 | 33/33 | 441.1 | 0.0 |
| v0.3.2-provenance-matrix | 0.3.2 | 4dc6db6b93 | 2026-10-30 | modeled-topology-oracle | local-js-oracle | 0.83 | 4418.9 | 33/33 | 441.1 | 441.1 |
| v0.3.2-scaleout-3to5-rf3 | 0.3.2 | 89300e4d8a | 2026-10-30 | modeled-topology-oracle | local-js-oracle | 2.24 | 2590.0 | 33/33 | 720.4 | 441.1 |

## Commit-over-commit delta progression

- **v0.2.0-tidb-ref (commit b0b2f9abcc)**: Initial TiDB reference baseline established in Docker cluster.
- **v0.3.0-lab-paired (commit 8039e45f2a)**: 5-node paired cluster brings Scenario A online (0.83 tx/s, 4/33 proofs).
- **v0.3.0-conflict-retry (commit 66d054c9c9)**: Retryable conflict handling and visibility gate expand proofs to 16/33.
- **v0.3.0-semantic-closure (commit 27af74dc7b)**: Full 33/33 semantic proof closure reached under contended OLTP.
- **v0.3.0-scenario-b-model (commit 2d416de6e5)**: Scenario B 3-island RF=3 risk model (441.15 dec/s, 18.09ms p99, 144 B/req WAN).
- **v0.3.2-provenance-matrix (commit 4dc6db6b93)**: 13-target comparison matrix, Scenario C (441.15 dec/s @ 0ms), provenance audit.

## Provenance qualification across historical milestones

Historical progression explicitly distinguishes physical cluster measurements from modeled topological projections:

- **observed-docker-cluster (live-cluster-wire)**: Scenario A runs in a 5-node Docker cluster over live socket connections. Transaction conflict backoffs, retry queues, and commit latencies reflect actual Linux networking and storage execution.
- **modeled-topology-oracle (local-oracle-plus-network-model / local-js-oracle)**: Scenario B distributed risk decision and Scenario C streaming feature evaluation are evaluated using simulated 3-island WAN topology models with deterministic network latency simulation and colocated memory state.
