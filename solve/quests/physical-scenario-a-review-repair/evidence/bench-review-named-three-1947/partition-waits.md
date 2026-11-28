# Physical formation waits

Campaign `bench-review-named-three-1947`. Formation deadline 2026-11-26T19:53:34.104+00:00. The last complete seed census ended at 2026-11-26T19:53:29.157+00:00 with 1 under-replicated partition. The readiness observer last reported 1 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| wasm_operations-p1 | 2 | completed at 19:53:26.334 | completed at 19:53:26.494 |
| wasm_operations-p1 | 3 | completed at 19:53:29.380 | completed at 19:53:29.574 |
