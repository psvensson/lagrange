# Physical formation waits

Campaign `bench-review-3d1-three-1649`. Formation deadline 2026-11-26T16:56:29.335+00:00. The last complete seed census ended at 2026-11-26T16:56:24.346+00:00 with 12 under-replicated partitions. The readiness observer last reported 12 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| service_bindings-p1 | 2 | completed at 16:56:24.277 | completed at 16:56:24.578 |
| service_bindings-p1 | 3 | completed at 16:56:16.554 | completed at 16:56:17.229 |
| service_definitions-p1 | 2 | CREATING at 16:56:27.346 | voter_readiness started at 16:56:29.219 |
| service_definitions-p1 | 3 | completed at 16:56:24.908 | completed at 16:56:25.390 |
missing voter targets traced 24
