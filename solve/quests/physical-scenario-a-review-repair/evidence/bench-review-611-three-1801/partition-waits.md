# Physical formation waits

Campaign `bench-review-611-three-1801`. Formation deadline 2026-11-26T18:09:42.903+00:00. The last complete seed census ended at 2026-11-26T18:09:37.900+00:00 with 1 under-replicated partition. The final completed readiness observation found 46 partitions at RF3. The system-table stage recorded 1 ready poll(s) of 3 required for stability. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| wasm_operations-p1 | 2 | completed at 18:09:37.932 | completed at 18:09:38.445 |
| wasm_operations-p1 | 3 | completed at 18:09:32.918 | completed at 18:09:33.329 |
