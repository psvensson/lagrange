# MovieLens ratings-split load timeout

## Measurement identity

- Live repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T13-16-30-917Z.summary.json`
  (`sha256:681cfd97030b4429a14c41f237aadd49df23f16dfdf38d8cfa5316666853990e`)
- Live scenario report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T13-16-30-620Z.report.json`
  (`sha256:9f4f96c0d4e70ac22a18ddf585e97897ce1faaf3afb71a6e2d87005e64a85b9c`)
- Immutable cluster archive:
  `data/examples/service-data-affinity-demo-archive/quest-effective-placement-serial-priority-planner-demo1-first-batch-timeout-2026-07-19T13-16-30-620Z.tar.gz`
  (`sha256:2e7872341486559dd8279beb985ba30d84fbd6b7282aeb96245cc13be9b60580`)
- Source fingerprint: `f2d0d5fd6bd209b5` at commit
  `dcc29027a9bf8b35e1f6f5674292c076f7c8f097`; the repetition runner recorded
  the same fingerprint at session start and completion.
- The sample was measuring: pre/post temperature was 67.85 C,
  `nonMeasuring=false`, and the repetition summary was not inconclusive.

## Observed boundary

The fixed 5-of-5 formation-probe rung passed immediately before this full-demo
rung. In the full demo, schema admission was quiescent for 62,596 ms with both
priority and total spread gaps at zero. Ratings preload admission and the load
lane both admitted. The run then failed with `Query timeout after 15000ms`.
The repetition runner correctly stopped after measuring demo slot 1 instead of
rerunning unchanged bytes.

This was not a first-batch failure. The source ratings SQLite replica contains
exactly 33,500 committed rows with `rating_id` 1 through 33,500: 67 complete
500-row logical batches. Node 0 logged 68 ratings INSERT CDC fetches from
13:15:42.861Z through 13:16:01.285Z; the extra fetch belongs to split
replication, not an additional committed source batch.

The timeout coincides with the ratings managed-split transition:

- 13:15:49.456Z: managed ratings split started.
- 13:15:52.487Z: left-child replica creation began.
- 13:15:57.438Z: right-child replica creation began.
- 13:16:01.274Z: source split replication request began.
- 13:16:01.291Z: the seed loop became runnable after a 1,027 ms gap; the
  load-lane timeout surfaced immediately afterward.

At shutdown, authoritative table state was still
`split_backfilling`, active partition version remained 1, the source remained
the only normal routing partition, and both version-2 child descriptors and
their service cohorts were present. The source database remained at exactly
33,500 rows, so the timed-out logical batch did not appear as a partial source
commit.

## Resource and ownership evidence

The seed process was already saturated while child provisioning competed with
foreground ratings writes:

- event-loop utilization was 0.996-1.000 across the failure window;
- post-load-start loop gaps included 1,807, 1,027, 5,001, 2,612, 1,225, and
  2,593 ms;
- the run-wide maximum gap was 21,432 ms;
- cumulative blocked wall time was about 45% at failure;
- heap rose from 138 MiB near load connection to 375 MiB by 13:16:15Z.

The client already sends each logical batch once. The load lane caps a
well-formed request at 15 seconds, and the SQL owner receives that same bounded
budget and cancellation token. Therefore a loader retry, a smaller demo batch,
or a longer timeout would move responsibility above the write owner and would
contradict the sealed internal-pacing contract.

The last known green full report,
`test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T17-49-37-367Z.report.json`
(`sha256:62fc5d4802c8721c4b81176c062881847ce6f79689a4921e2f545d5a041cb131`),
loaded all 100,000 ratings with the same 500-row loader batch size. The current
failure therefore does not justify changing workload fidelity.

## Routing decision

This evidence does not reproduce the EffectivePlacement Quest's pre-load
priority-placement defect: formation passed 5-of-5, schema and preload
admission were quiescent, and priority spread was zero. It blocks that Quest's
ordered full-demo terminal gate at a later owner boundary.

Route the residual to the existing open `write-path-internal-pacing` Quest.
Its deterministic reproduction must compose a well-formed foreground write
with formation/split-adjacent transient delay, assert that the client submits
the logical write only once, and prove:

1. the write owner absorbs retryable internal delay only inside the original
   remaining timeout budget;
2. the logical write commits once or fails atomically;
3. genuinely stuck work still fails at the original budget;
4. no timeout, workload, loader batch, split-policy, or client-retry widening
   is used.

The current artifact does not yet distinguish whether the highest-leverage
production change belongs in participant retry, source-partition foreground
admission, or split/provisioning pacing. That choice requires the deterministic
composition before a source attempt.
