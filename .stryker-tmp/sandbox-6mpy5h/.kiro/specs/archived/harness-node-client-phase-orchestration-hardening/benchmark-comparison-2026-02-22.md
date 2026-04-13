# Distributed Benchmark Comparison (2026-02-22)

## Runs Compared

- Current run:
  `test-output/reports/postgres-baseline-comparison-orchestrator-latest.report.json`
  (timestamp: 2026-02-22T19:07:38.575Z)
- Previous successful multinode run:
  `test-output/reports/postgres-baseline-comparison-multinode-20260222T173654Z.report.json`
  (timestamp: 2026-02-22T17:40:01.014Z)

## Metric Delta

- Throughput (`loadMetrics.opsPerSec`)
  - Previous: `21.58770191557077`
  - Current: `120`
  - Delta: `+98.41229808442924` (`+455.87%`)

- p99 latency (`loadMetrics.latency.p99`)
  - Previous: `20804`
  - Current: `535`
  - Delta: `-20269` (`-97.43%`)

- Error count (`loadMetrics.errors`)
  - Previous: `124`
  - Current: `3255`
  - Delta: `+3131`

- Failed operations (`loadMetrics.failed`)
  - Previous: `0`
  - Current: `3255`
  - Delta: `+3255`

- SUT/Baseline throughput ratio (`comparison.throughputRatioSutToBaseline`)
  - Previous: `0.17989751596308973`
  - Current: `1.0000333333333333`
  - Delta: `+0.8201358173702435`

- SUT p99 / baseline avg latency ratio (`comparison.p99LatencyRatioSutToBaselineAvg`)
  - Previous: `30150.72463768116`
  - Current: `691.8103448275863`
  - Delta: `-29458.914292853573`

- Verification confidence (`details.verification.confidence`)
  - Previous: unavailable in older schema
  - Current: `high`

## Notes

- Current run passes and reports `verification.verdict = consistent`.
- Error/failure counts increased substantially despite throughput/latency ratio
  improvements; this requires follow-up before treating this as full quality
  parity with baseline behavior.
