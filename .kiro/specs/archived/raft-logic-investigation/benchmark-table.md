# Baseline vs Spike Benchmark Table

## Source Artifacts

- `.kiro/specs/raft-logic-investigation/reports/resource-viability-report.json`
- `.kiro/specs/raft-logic-investigation/reports/final-spike-report.json`
- `test-output/reports/benchmark-3node.json`
- `test-output/reports/latest-benchmark.json`

## Measured Table

| Metric | Liferaft System 3-node | Liferaft System 5-node | Raft-logic Spike (3-node harness) |
| --- | ---: | ---: | ---: |
| Throughput | 49.22 ops/s | 49.12 ops/s | 4.98 writes/s |
| Tail latency | p99 903 ms | p99 2199 ms | n/a (write-only synthetic check) |
| Idle CPU | n/a in harness report | n/a in harness report | 6.94% |
| RSS growth | n/a in harness report | n/a in harness report | +2,813,952 bytes / 2m |
| Disk write during idle | n/a in harness report | n/a in harness report | 0 B/s (`fsWriteDelta=0`) |
| Postgres baseline context | 4220.80 TPS baseline | 4017.98 TPS baseline | n/a (different workload) |

## Notes

1. The spike throughput figure is from a dedicated synthetic write loop and is
   not workload-identical to the Postgres baseline scenario.
2. The main decision blocker is restart/storage correctness, not idle resource
   usage.
3. A true apples-to-apples baseline would require wiring the spike adapter into
   the distributed benchmark harness path with equivalent workload generation.
4. Current spike defaults are tuned for short diagnostic runs
   (2-minute idle soak, 20 write operations).
