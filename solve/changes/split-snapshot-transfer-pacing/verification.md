# Split snapshot transfer pacing verification

## Live binding

The immutable MovieLens failure is documented in
`solve/changes/write-path-internal-pacing/live-2026-07-19-ratings-split-load-timeout.md`
(SHA-256
`f79498bd097010d55e036828d1a1f1f5d10c0539a789747f9a924992860b3eed`).
The source accepted 67 complete 500-row batches, began ratings split
replication, then the next single-submit foreground batch exhausted its
unchanged 15,000 ms budget. During the failure window the old snapshot path
made one routed child proposal per row, completed only about 13 rows, and
recorded sustained near-1.0 event-loop utilization.

The deterministic geometry deliberately uses a lower 300 ms proposal cost:
64 old per-row proposals take 19,200 ms, which preserves the live ordering
`foreground budget < first yield`. The fixed first batch needs at most two
child proposals (600 ms) before the same yield. No production timeout, demo
batch, client retry, or split policy changes.

## Harness fidelity

- `test/partition/split-backfill-internal-pacing.test.js` composes real
  `PartitionService` instances for the source and both children. Only the
  distributed executor boundary and elapsed clock are controlled.
- One foreground submission runs from the production source write path during
  the first cooperative backfill turn. The test asserts one committed source
  row, not only a callback or mock result.
- All 65 snapshot rows are queried from the real child SQLite stores and must
  appear exactly once on the child selected by the split key.
- A real 512-column SQLite table receives 64 rows through the production
  routing helper. The configured batch is capped to 63 rows (32,256 binds)
  plus one row (512 binds), staying below the runtime's 32,766-variable limit.
- The failed child case returns one processed failure after exactly the
  original 15,000 ms model budget. The backfill rejects after that one call;
  it neither retries nor starts a fresh budget.
- `dt:solve/changes/dt-prove/split-backfill-internal-pacing.test.js-2026-07-19T13-56-29-860Z.json`
  proves green with the five-file fix, red with those production files
  reverted, and green after restoration.

## CDC and replay

Snapshot rows predate the split and are physical state transfer, not new
logical mutations. They use the explicit `snapshot` mirror origin and are
suppressed before CDC envelope construction. The composed test registers real
child subscribers and proves zero snapshot CDC events, then routes a normal
`source` live mirror and proves one valid row-valued CDC event. This avoids the
old parser's invalid interpretation of a multi-row parameter list without
silencing queued or post-snapshot mutations.

Each child proposal is an idempotent `INSERT OR REPLACE`. A partial two-child
batch can therefore be replayed after failure without duplicating rows.
In-child row order is retained, and the routing test replaces descriptor
evidence between the two child proposals to prove the second proposal is
fenced before dispatch.

## Transport and boundedness

The change retains the existing query-executor delivery and processed-success
contract; it does not interpret raw transport acknowledgement. A missing
handler, timeout, or failed child remains a failed query result and causes the
backfill to reject. Batching reduces proposals but adds no retry loop, deadline,
or bypass write path. Zero, negative, or non-integer batch configuration falls
back to bounded one-row proposals without cooperative yields, preserving the
previous disabled-yield behavior.

## Evidence

- Attempt patch SHA-256:
  `57093dd77d4af628bd9d0be4b309388bc61ff564e919c5408f461ebf49c553a1`
- Latest accepted scenario report:
  `test-output/reports/split-snapshot-transfer-pacing-2026-07-19T13-56-58-789Z.report.json`
  (SHA-256
  `638090a80bd678d08b3e951ad61a1c048ff8f123b79adc428c7f849b1647c372`)
- Scenario closure: three consecutive valid passes, metric 0.
- Focused split/CDC regression: 13 files, 739 assertions, all green.
