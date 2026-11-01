# Scenario B Network RTT Crossover and Working-Set Growth

Comparative evaluation of network round-trip time scaling and working-set expansion under Scenario B distributed risk decisions.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md)

![Scenario B RTT Crossover and Working-Set Growth](scenario-b-rtt-working-set-crossover.svg)

## Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)

Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN highlights the architectural overhead of multi-hop sequential orchestration across distributed nodes. Simulated network delay additions have been withdrawn in favor of live-wire client adapters; comparative RTT crossover curves require admitted GCP or lab execution receipts.

| Target | Hops | Local (0.2ms) | 0.2 ms | 2.0 ms | 10.0 ms | 30.0 ms | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2 | 1049.8 | 250.9 | 117.1 | 51.9 | 30.6 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 6 | 494.0 | 127.4 | 76.5 | 40.0 | 23.6 | observed-docker-cluster |
| Citus 13 (Dist Function) | 6 | 1286.3 | 157.8 | 68.3 | 32.2 | 15.8 | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 6 | 358.2 | 189.6 | 53.7 | 49.4 | 34.0 | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 6 | 334.8 | 152.5 | 30.3 | 39.6 | 20.5 | observed-docker-cluster |
| TiDB + TiKV | 12 | 383.8 | 106.4 | 42.0 | 22.8 | 12.3 | observed-docker-cluster |

## Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)

Increasing historical state from a moderate 64-event history to a heavy-correlation 2048-event working set evaluates the wire efficiency and serialization overhead of candidate architectures. Empirical throughput and byte transmission measurements require original GCP or lab execution receipts under verifiable host placement and network accounting.

| Target | Moderate (dec/s) | Moderate p99 (ms) | Moderate WAN | Heavy (dec/s) | Heavy p99 (ms) | Heavy WAN | Drop % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 538.7 | 128.0 | 8348 | 456.0 | 101.8 | 5825 | -15.4% | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 201.5 | 340.4 | 5773 | 199.4 | 222.4 | 9270 | -1.0% | observed-docker-cluster |
| Citus 13 (Dist Function) | 364.2 | 125.5 | 6980 | 159.6 | 315.0 | 12380 | -56.2% | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 361.4 | 80.9 | 5735 | 298.2 | 109.6 | 9252 | -17.5% | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 207.8 | 125.8 | 9154 | 175.5 | 151.0 | 14747 | -15.5% | observed-docker-cluster |
| TiDB + TiKV | 247.1 | 134.0 | 17603 | 190.9 | 158.4 | 28780 | -22.7% | observed-docker-cluster |
