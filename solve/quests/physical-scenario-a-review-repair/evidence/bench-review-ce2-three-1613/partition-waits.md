# Physical formation waits

Campaign `bench-review-ce2-three-1613`. Formation deadline 2026-11-26T16:23:31.365+00:00. The last complete seed census ended at 2026-11-26T16:23:26.513+00:00 with 11 under-replicated partitions. The readiness observer last reported 11 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| module_dependency_locks-p1 | 2 | completed at 16:21:57.095 | completed at 16:21:57.580 |
| module_dependency_locks-p1 | 3 | completed at 16:23:31.106 | activation_worker_revalidation settled at 16:23:30.820 |
| service_endpoints-p1 | 2 | completed at 16:23:26.588 | completed at 16:23:26.969 |
| service_endpoints-p1 | 3 | completed at 16:23:19.279 | completed at 16:23:19.661 |
missing voter targets traced 22
