# Post-attempt-5 live schema drain-anchor recurrence

## Immutable evidence

- Ordered formation summary:
  `test-output/reports/live-repetitions-probe-2026-07-19T16-39-35-440Z.summary.json`
  (`5/5` green).
- Full-demo report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T16-44-58-388Z.report.json`
  (SHA-256
  `1f750ba2b43337a6a82a183f9372e16b4e9f5167661cf93f745a2dc9036e372a`).
- Repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T16-44-58-494Z.summary.json`
  (SHA-256
  `525a36c2b35325c9221ced1a718941ef5d890a0b8424f70297e9ea01e7a50914`).
- Stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-ordinary-placement-ready-lease-candidate-admission-demo1-schema-quiescence-timeout-2026-07-19T16-44-58-388Z.tar.gz`
  (SHA-256
  `a8c56151e75aa7864008ebc6f6bc20fa499365160c21e0f5b34e1b89d4741f9e`).

The repetition runner stopped on the first red. No unchanged rerun was made.
The source fingerprint remained stable at `b12a04460aa4e331`.

## Exact recurrence

The formation release tracker recovered the final retained topology-shaping
operation drain at `1784479343800`. The schema observer last saw one in-flight
operation with priority topology already ready at `1784479342802`, then first
saw full quiescence at `1784479350473`. It therefore started its independent
stability window `6673ms` after the canonical drain.

The schema observer reached its first mature confirmation at
`1784479412934`: `62461ms` after its local start, but only `69134ms` after the
canonical drain. The unchanged background fence released at drain plus
`70000ms`. `contexts-p1` created the first ordinary `REPLACE` operation at
`16:43:33.830Z`, only `896ms` after that first confirmation and before the
second fresh confirmation could be observed.

The background work was legitimate, not a ghost operation:

| operation | partition | created |
| --- | --- | --- |
| `replace-op-1cc8aac9aae9f908828fd1e14c6b808d` | `contexts-p1` | `16:43:33.830Z` |
| `replace-op-1fccf21937efbf158cbe55ffcf1c6aca` | `inter_group_latencies-p1` | `16:43:36.714Z` |
| `replace-op-c8a0a9e6ce5c79459b6b73a1c6ca2232` | `tables-p1` | `16:43:43.940Z` |
| `replace-op-ec4d884773bd55f56b0bf0ef66c54db5` | `service_endpoints-p1` | `16:43:44.290Z` |

Those operations correctly reset schema stability, drained by
`1784479468519`, and left only `14156ms` of the fixed `180000ms` schema budget
for the new candidate. The final timeout was therefore
`quiescence_candidate`, with no canonical blocker and zero effective in-flight
operations.

## Owner-boundary conclusion

The retained transition history newly falsifies the earlier run-specific
conclusion that the competing clocks were no longer binding. Both clocks use
the same topology-drain event but start from different observations:
background release uses the retained canonical terminal-operation watermark,
while schema stability starts only when a later polling snapshot first reports
ready.

The bounded intervention is to reuse the existing coordinator-owned
topology-shaping drain classifier in schema observation and transfer that
watermark into the local stability start only when the immediately preceding
authoritative snapshot was operation-only blocked and priority topology was
already ready. Leadership, spread, pressure, unavailable observation, and
other blocker transitions must continue to start at the fresh ready
observation. The `60000ms` schema interval, two-confirmation rule, `10000ms`
background handoff, timeout, workload, and one-shot release behavior remain
unchanged.
