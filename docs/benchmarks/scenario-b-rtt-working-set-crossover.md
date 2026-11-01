# Scenario B Network RTT Crossover and Working-Set Growth

Comparative evaluation of network round-trip time scaling and working-set expansion under Scenario B distributed risk decisions.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md)

![Scenario B RTT Crossover and Working-Set Growth](scenario-b-rtt-working-set-crossover.svg)

## Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)

Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN highlights the architectural overhead of multi-hop sequential orchestration across distributed nodes. Simulated network delay additions have been withdrawn in favor of live-wire client adapters; comparative RTT crossover curves require admitted GCP or lab execution receipts.

| Target | Hops | Local (0.2ms) | 0.2 ms | 2.0 ms | 10.0 ms | 30.0 ms | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2 | 2742.3 | 1799.7 | 1131.0 | 296.0 | 113.9 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 6 | 2575.1 | 1517.1 | 1232.3 | 294.0 | 113.7 | observed-docker-cluster |
| Citus 13 (Dist Function) | 6 | 2644.6 | 1234.1 | 912.2 | 199.1 | 76.6 | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 6 | 2631.8 | 1492.5 | 1295.3 | 286.7 | 112.8 | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 6 | 1777.6 | 1282.1 | 925.5 | 197.0 | 76.7 | observed-docker-cluster |
| TiDB + TiKV | 12 | 2309.0 | 416.6 | 279.6 | 52.4 | 19.5 | observed-docker-cluster |

## Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)

Increasing historical state from a moderate 64-event history to a heavy-correlation 2048-event working set evaluates the wire efficiency and serialization overhead of candidate architectures. Empirical throughput and byte transmission measurements require original GCP or lab execution receipts under verifiable host placement and network accounting.

| Target | Moderate (dec/s) | Moderate p99 (ms) | Moderate WAN | Heavy (dec/s) | Heavy p99 (ms) | Heavy WAN | Drop % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2345.2 | 29.4 | 3216 | 1638.0 | 23.7 | 4008 | -30.2% | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 1041.3 | 91.7 | 5310 | 1619.6 | 25.5 | 8364 | 55.5% | observed-docker-cluster |
| Citus 13 (Dist Function) | 2141.1 | 28.8 | 6374 | 1865.7 | 22.0 | 10086 | -12.9% | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 2181.6 | 32.4 | 4824 | 1600.2 | 22.8 | 7376 | -26.7% | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 1448.8 | 38.9 | 11455 | 1289.4 | 25.4 | 18837 | -11.0% | observed-docker-cluster |
| TiDB + TiKV | 702.9 | 37.7 | 39152 | 639.8 | 42.9 | 67594 | -9.0% | observed-docker-cluster |
