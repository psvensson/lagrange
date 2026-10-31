# Lagrange Longitudinal Metrics Evolution

Progressive evolution of Lagrange across chronological milestones, tracking Scenario A OLTP throughput,
semantic proof closure, Scenario B distributed risk decision latency, and Scenario C streaming feature evaluation.

- Navigation: [Benchmark Index](README.md) | [Dashboard](index.html) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A OLTP Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk Decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) | [Scenario C Streaming Feature Risk Decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![Lagrange metrics evolution over time](lagrange-metrics-evolution.svg)

## How Lagrange metrics develop over time (version and commit progression)

| Milestone | Version | Commit | Date | Evidence Tier | Execution Mode | Scenario A (tx/s) | p95 (ms) | Proofs | Scenario B (dec/s) | Scenario C (dec/s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.2.0-tidb-ref | 0.2.0 | b0b2f9abcc | 2026-09-12 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.0-lab-paired | 0.3.0 | 8039e45f2a | 2026-10-29 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.0-conflict-retry | 0.3.0 | 66d054c9c9 | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.0-semantic-closure | 0.3.0 | 27af74dc7b | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.0-scenario-b-model | 0.3.0 | 2d416de6e5 | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.2-provenance-matrix | 0.3.2 | 4dc6db6b93 | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.2-scaleout-3to5-rf3 | 0.3.2 | 89300e4d8a | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.2-partition-sweep-p6to60 | 0.3.2 | 2025f7780d | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.2-rtt-working-set-crossover | 0.3.2 | bdee84d5fc | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.2-live-movement-scenario-c-scale | 0.3.2 | 72c76c6629 | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.3.3-tx-fast-path-5node-summary | 0.3.3 | b41d4ccec4 | 2026-10-30 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| v0.4.0-scaleout-scenario-c-release | 0.4.0 | 7565d8c09a | 2026-10-31 | none | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |

## Commit-over-commit delta progression

- **v0.2.0-tidb-ref (commit b0b2f9abcc)**: Initial TiDB reference baseline established in Docker cluster.
- **v0.3.0-lab-paired (commit 8039e45f2a)**: 5-node paired cluster brings Scenario A online (0.83 tx/s, 4/33 proofs).
- **v0.3.0-conflict-retry (commit 66d054c9c9)**: Retryable conflict handling and visibility gate expand proofs to 16/33.
- **v0.3.0-semantic-closure (commit 27af74dc7b)**: Full 33/33 semantic proof closure reached under contended OLTP.
- **v0.3.0-scenario-b-model (commit 2d416de6e5)**: Scenario B 3-island RF=3 risk model withdrawn pending live GCP/lab measurement.
- **v0.3.2-provenance-matrix (commit 4dc6db6b93)**: 13-target comparison matrix and Scenario C provenance audit.
- **v0.3.2-scaleout-3to5-rf3 (commit 89300e4d8a)**: 3-to-5-node RF=3 scale-out experiment framework.
- **v0.3.2-partition-sweep-p6to60 (commit 2025f7780d)**: 5-node RF=3 partition granularity sweep framework (P=6..60).
- **v0.3.2-rtt-working-set-crossover (commit bdee84d5fc)**: Scenario B RTT crossover and heavy working-set comparison framework.
- **v0.3.2-live-movement-scenario-c-scale (commit 72c76c6629)**: Live partition movement and 5x Scenario C scaling framework.
- **v0.3.3-tx-fast-path-5node-summary (commit b41d4ccec4)**: v0.3.3 Scenario A tx coordination fast-path and 5-node summary.
- **v0.4.0-scaleout-scenario-c-release (commit 7565d8c09a)**: v0.4.0 release with 5-node RF=3 and Scenario C framework.

## Provenance qualification across historical milestones

Historical progression explicitly distinguishes physical cluster measurements from modeled topological projections:

- **observed-docker-cluster (live-cluster-wire)**: Scenario A runs in a 5-node Docker cluster over live socket connections. Transaction conflict backoffs, retry queues, and commit latencies reflect actual Linux networking and storage execution.
- **modeled-topology-oracle (local-oracle-plus-network-model / local-js-oracle)**: Scenario B distributed risk decision and Scenario C streaming feature evaluation are evaluated using simulated 3-island WAN topology models with deterministic network latency simulation and colocated memory state.
