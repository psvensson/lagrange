# Scenario B Network RTT Crossover and Working-Set Growth

Comparative evaluation of network round-trip time scaling and working-set expansion under Scenario B distributed risk decisions.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md)

![Scenario B RTT Crossover and Working-Set Growth](scenario-b-rtt-working-set-crossover.svg)

## Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)

Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN highlights the architectural overhead of multi-hop sequential orchestration across distributed nodes. Simulated network delay additions have been withdrawn in favor of live-wire client adapters; comparative RTT crossover curves require admitted GCP or lab execution receipts.

| Target | Hops | Local (0.2ms) | 0.2 ms | 2.0 ms | 10.0 ms | 30.0 ms | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2 | 56.0 | 36.8 | 24.6 | 20.9 | 20.0 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 6 | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Citus 13 (Dist Function) | 6 | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| PG 17 Patroni + PL/pgSQL | 6 | 1118.9 | 576.6 | 828.0 | 359.1 | 141.7 | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 6 | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| TiDB + TiKV | 12 | 816.3 | 460.2 | 268.4 | 58.2 | 20.5 | observed-docker-cluster |

## Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)

Increasing historical state from a moderate 64-event history to a heavy-correlation 2048-event working set evaluates the wire efficiency and serialization overhead of candidate architectures. Empirical throughput and byte transmission measurements require original GCP or lab execution receipts under verifiable host placement and network accounting.

| Target | Moderate (dec/s) | Moderate p99 (ms) | Moderate WAN | Heavy (dec/s) | Heavy p99 (ms) | Heavy WAN | Drop % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 74.1 | 971.6 | 69878 | 50.3 | 1253.4 | 115240 | -32.1% | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Citus 13 (Dist Function) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| PG 17 Patroni + PL/pgSQL | 1139.7 | 104.1 | 1110 | 961.1 | 80.8 | 1476 | -15.7% | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| TiDB + TiKV | 611.7 | 65.3 | 13135 | 541.4 | 80.2 | 16688 | -11.5% | observed-docker-cluster |
