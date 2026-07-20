# Ordered live gate: ratings-load boundary moved before runtime service

## Measurement identity

- Checkpoint: `c48d5724`
- Approved attempt:
  `sha256:2c28b1e823978c95b07eafe01775c39970a2c736dfe095c4610eddf863b9c3cb`
- Stable live source fingerprint: `86dfcf00fa67b3e3`
- Formation summary:
  `test-output/reports/live-repetitions-probe-2026-07-19T20-04-52-027Z.summary.json`
  (`sha256:6b68ef8a3942a1bbe70de4addacefb8c7055d8d671e6f46942f54c8bc380cd00`)
- Demo report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T20-12-09-659Z.report.json`
  (`sha256:9da7fab883f0d506945f0852b951bd7535e3d55d563af4b0e956305be3a5b640`)
- Demo repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T20-12-10-768Z.summary.json`
  (`sha256:dab101275989af4743758ee2c9da3a8b80d97e3b2951183357bdb34244272ed9`)
- Immutable stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-runtime-service-creating-owner-wake-progress-admission-demo1-query-timeout-2026-07-19T20-12-09-659Z.tar.gz`
  (`sha256:c81809c296d538b2883d4ab8bb3bc431eb120d1e15378136c2be125314300e59`)

The ordered formation rung passed 5/5 without a thermal rerun. The demo sample
was measuring at 67.85 C before and after the run. The runner stopped after
Demo 1 and made no unchanged rerun.

## Boundary

Schema admission was quiescent, with priority and total spread gaps both zero,
effective in-flight operation count zero, and two stable confirmations.
Ratings preload and the production load lane both admitted. Demo 1 then failed
during the 100,000-row ratings load with
`Query timeout after 15000ms`.

The run never deployed the MovieLens runtime service. Consequently it never
reached the target-ACTIVE-to-source-CREATING wake seam repaired by this Quest.
This live red neither validates nor refutes the checkpointed runtime-service
fix. Its production-seam deterministic proof remains green on the fix, red on
revert, and green after restore:
`solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-56-04-324Z.json`.

## Stopped-state chronology

- `20:09:43.369Z`: the first ratings INSERT CDC observation appears.
- `20:10:19.114Z`: the query owner starts the managed ratings split.
- `20:10:42.859Z`: source snapshot replication to split children begins.
- `20:11:37.826Z`: the right split child elects node 2 as leader.
- `20:11:38.312Z`: the original ratings partition elects node 4 as leader.
- `20:11:39.507Z`: the seed records the last ratings INSERT CDC observation.
- `20:11:39.770Z`: the seed reports a 5,692 ms event-loop gap at utilization
  1.0; cumulative blocked wall time is 68.15%.
- `20:11:54.150Z`: seed critical delivery to the right-child leader is at its
  exact per-source limits: 8 pending and 8 in flight.
- `20:11:54.955Z`: the runner begins shutdown after the fixed 15-second
  load-lane/query budget expires.

The original source replica contains exactly 33,000 ratings with IDs
`1..33000`; its two followers contain 32,500 each. The left split children
contain 4,500, 4,416, and 4,500 rows. The right children contain 492, 0, and
428 rows. This stopped snapshot is intentionally mid-convergence. It proves
that 66 complete 500-row logical batches committed on the source and that the
next single-submit batch did not partially commit there.

The seed stayed at or near event-loop utilization 1.0 throughout the load,
with cumulative blocked wall time near 68%, repeated 1-5.7 second gaps,
heartbeat timeouts, peer ACK-timeout slow-liveness observations, and saturated
critical delivery sources. Five unrelated `nodes` statement-autocommit
transactions also held for about 60 seconds and rolled back; they are pressure
amplifiers, not evidence that the ratings statement itself owned those
transactions.

## Attribution and routing

This is the same owner-boundary class preserved from the earlier measuring
MovieLens run in
`solve/changes/write-path-internal-pacing/live-2026-07-19-ratings-split-load-timeout.md`.
That run committed 33,500 source rows before the same fixed 15-second timeout
during split replication. The subsequently landed bounded split snapshot
transfer changed physical copy throughput from one proposal per row to bounded
multi-row proposals and is present in this checkpoint. It improved transfer
progress, but the second live witness shows that it did not fully preserve the
single-submit foreground write inside the unchanged query budget.

The residual therefore routes to the existing open
`write-path-internal-pacing` Quest. Its deterministic discriminator must compose
the real query owner, remaining timeout budget, leader/participant movement,
and split-adjacent delivery pressure. It must prove one logical write commits
once or fails atomically, and that genuinely stuck work still expires at the
original budget.

Do not add a loader retry, shrink the 500-row batch, raise the 15-second
load-lane/query budget, change the ratings split policy, change live runner
order, or rerun unchanged bytes.
