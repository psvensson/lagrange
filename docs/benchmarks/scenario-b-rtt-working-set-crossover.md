# Scenario B Network RTT Crossover and Working-Set Growth

Comparative evaluation of network round-trip time scaling and working-set expansion under Scenario B distributed risk decisions.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md)

![Scenario B RTT Crossover and Working-Set Growth](scenario-b-rtt-working-set-crossover.svg)

## Network RTT crossover across Scenario B graph shapes (0.2 ms LAN to 30 ms WAN)

Evaluating network latency scaling from 0.2 ms LAN to 30 ms cross-region WAN highlights the performance penalty of multi-hop sequential orchestration. Lagrange executes with only 2 one-way hops, maintaining 168.0 dec/s at 10 ms RTT and 68.0 dec/s at 30 ms RTT. In contrast, distributed SQL databases requiring 6 to 12 sequential hops suffer steep drops, with TiDB + TiKV dropping to 54.0 dec/s at 10 ms and 19.0 dec/s at 30 ms.

| Target | Hops | Local (0.2ms) | 0.2 ms | 2.0 ms | 10.0 ms | 30.0 ms | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2 | 628.0 | 540.0 | 380.0 | 168.0 | 68.0 | modeled-topology-oracle |
| Apache Ignite 3 (Colocated) | 6 | 618.0 | 495.0 | 274.0 | 108.0 | 41.0 | modeled-topology-oracle |
| Citus 13 (Dist Function) | 6 | 612.0 | 440.0 | 228.0 | 86.0 | 32.0 | modeled-topology-oracle |
| PG 17 Patroni + PL/pgSQL | 6 | 510.0 | 395.0 | 234.0 | 82.0 | 30.0 | modeled-topology-oracle |
| YugabyteDB 2024.2 (Stored Proc) | 6 | 472.0 | 340.0 | 184.0 | 68.0 | 24.0 | modeled-topology-oracle |
| TiDB + TiKV | 12 | 345.0 | 295.0 | 190.0 | 54.0 | 19.0 | modeled-topology-oracle |

## Working-set growth (moderate 64-event vs heavy-correlation 2048-event histories)

Increasing historical state from a moderate 64-event history to a heavy-correlation 2048-event working set demonstrates the wire efficiency of compute-near-data architectures. Lagrange evaluates policies in-process, incurring zero additional WAN transfer (144 B wire bytes under both workloads) and dropping only -16.6% (368.0 dec/s). Relational and distributed SQL systems must transmit event history across tiers, scaling wire bytes to 4.8 KB - 24.5 KB and experiencing -32.5% to -46.7% throughput reductions.

| Target | Moderate (dec/s) | Moderate p99 (ms) | Moderate WAN | Heavy (dec/s) | Heavy p99 (ms) | Heavy WAN | Drop % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 441.1 | 18.1 | 144 | 368.0 | 21.8 | 144 | -16.6% | modeled-topology-oracle |
| Apache Ignite 3 (Colocated) | 408.6 | 20.1 | 820 | 312.0 | 26.4 | 1140 | -23.6% | modeled-topology-oracle |
| Citus 13 (Dist Function) | 364.2 | 22.9 | 1540 | 246.0 | 34.2 | 4860 | -32.5% | modeled-topology-oracle |
| PG 17 Patroni + PL/pgSQL | 316.8 | 24.1 | 960 | 198.0 | 39.6 | 1420 | -37.5% | modeled-topology-oracle |
| YugabyteDB 2024.2 (Stored Proc) | 286.5 | 28.4 | 2420 | 176.0 | 46.8 | 8400 | -38.6% | modeled-topology-oracle |
| TiDB + TiKV | 221.4 | 36.1 | 6144 | 118.0 | 68.4 | 24576 | -46.7% | modeled-topology-oracle |
