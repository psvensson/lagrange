# Physical formation on 7a88b41d

Both runs used commit `7a88b41d01aca8bb895f73d1935f44751b287bb6`, image `sha256:65b1efebc736f5192f06a1377d4f7e546b2524f9993f13848796ea09aefa0685`, three physical nodes and the 240-second deadline. The seed ran on 192.168.86.34 (node 1), with peers on 192.168.86.41 (node 2) and 192.168.86.32 (node 3). The second run added four reads of the placement owner's last decision plus a final seed census. Both runs exhausted formation before the workload started.

## Source admission in the repeat

The same seed refused a proposed copy of `wasm_operations-p1` in three observed passes. Each had unused capacity on the proposed target. The event-loop delay and CPU samples belong to the seed. Occupancy includes previously admitted work, which continues after a window shrinks.

| Time from seed start | Pass | Source occupancy / limit | Waiting demand | Target occupancy / limit | Main-thread CPU | ELU | Loop delay |
|---|---:|---:|---:|---:|---:|---:|---:|
| 115 s | 1800 | 1 / 1 | 23 | 0 / 3 | 83.36% | 90.99% | 21.78 ms |
| 172 s | 2585 | 3 / 1 | 10 | 1 / 4 | 94.76% | 100% | 110.67 ms |
| 209 s | 3106 | 2 / 2 | 5 | 1 / 6 | 80.59% | 85.29% | 16.43 ms |
| 233 s | 3455 | 1 / 1 | 0 | No copy check | 70.81% | 73.03% | 8.29 ms |

At the last census the seed held the only active voter for this partition. A copy for node 2 was in SENDING. Its worker reached final revalidation before the deadline. The trace contains no second target operation by the deadline. The earlier source-capacity refusals are directly observed. The exact succession of all intervening decisions remains unmeasured. On the seed's clock, operation 1173 completed at 15:14:38.191, 0.956 seconds after expiry. Operation 1192 started 70 milliseconds later and completed at 15:14:48.956. The separate promotion operation 1205 completed at 15:14:49.396, 12.161 seconds after expiry. Neither an eventual RF3 row nor the public workload was verified inside the deadline.

Across both remote workers, participant release took 20.319 seconds at p95 in the first run (72 successful waits and one 58.293-second failure). It took 4.304 seconds at p95 in the repeat (92 successes). These distributions include work completed after the deadline. Five of the first run’s long releases finished within a 12-millisecond window on one host.

## bench-review-7a8-three-1500

Campaign `bench-review-7a8-three-1500`. Formation deadline 2026-11-26T15:05:58.792+00:00. The last complete seed census ended at 2026-11-26T15:05:26.877+00:00 with 13 under-replicated partitions. The readiness observer last reported 14 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| schema_migrations-p1 | 2 | completed at 15:05:08.083 | completed at 15:05:08.396 |
| schema_migrations-p1 | 3 | SYNCING at 15:05:14.706 | participant_release started at 15:05:14.616 |
| service_bindings-p1 | 2 | send at 15:05:26.455 | createReplicaAsync entered at 15:05:48.277 |
| service_bindings-p1 | 3 | No recorded operation | Unobserved |
| service_definitions-p1 | 2 | SYNCING at 15:05:54.899 | participant_release started at 15:05:54.237 |
| service_definitions-p1 | 3 | No recorded operation | Unobserved |
| service_endpoints-p1 | 2 | No recorded operation | Unobserved |
| service_endpoints-p1 | 3 | send at 15:05:32.560 | Unobserved |
| service_install_failures-p1 | 2 | SYNCING at 15:05:54.174 | participant_release started at 15:05:53.907 |
| service_install_failures-p1 | 3 | No recorded operation | Unobserved |
| service_installations-p1 | 2 | SYNCING at 15:05:54.170 | participant_release started at 15:05:53.757 |
| service_installations-p1 | 3 | No recorded operation | Unobserved |
| service_instances-p1 | 2 | SYNCING at 15:05:54.998 | participant_release started at 15:05:54.239 |
| service_instances-p1 | 3 | No recorded operation | Unobserved |
| service_packages-p1 | 2 | SYNCING at 15:05:54.167 | participant_release started at 15:05:53.754 |
| service_packages-p1 | 3 | No recorded operation | Unobserved |
| service_partition_access-p1 | 2 | No recorded operation | Unobserved |
| service_partition_access-p1 | 3 | No recorded operation | Unobserved |
| service_revisions-p1 | 2 | No recorded operation | Unobserved |
| service_revisions-p1 | 3 | No recorded operation | Unobserved |
| service_timers-p1 | 2 | No recorded operation | Unobserved |
| service_timers-p1 | 3 | No recorded operation | Unobserved |
| storage_reservations-p1 | 2 | No recorded operation | Unobserved |
| storage_reservations-p1 | 3 | No recorded operation | Unobserved |
| wasm_operations-p1 | 2 | No recorded operation | Unobserved |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |

## bench-review-7a8-decision-1509

Campaign `bench-review-7a8-decision-1509`. Formation deadline 2026-11-26T15:14:37.235+00:00. The last complete seed census ended at 2026-11-26T15:14:32.523+00:00 with 1 under-replicated partition. The readiness observer last reported 1 under-replicated. The table follows the census cohort through the deadline using each host’s timestamps. The clocks were not corrected for skew.

The target column identifies each missing voter at the census. A completed operation can precede a visible voter row. An empty operation history leaves the admission reason unmeasured.

| Partition | Target node | Latest source or ledger event by deadline (UTC) | Latest target observation by deadline (UTC) |
|---|---|---|---|
| wasm_operations-p1 | 2 | SYNCING at 15:14:34.989 | activation_worker_revalidation started at 15:14:37.142 |
| wasm_operations-p1 | 3 | No recorded operation | Unobserved |

## Retained inputs

These SHA-256 hashes identify the local campaign artifacts under `test-output/bench/<campaign>/`.

| Campaign | Input | SHA-256 |
|---|---|---|
| bench-review-7a8-three-1500 | bench-review-7a8-three-1500-formation.ndjson | `ec3c5aa4a30d3097f29004aeac571dbd3955c16ce72aa14611d29ed3cd761499` |
| bench-review-7a8-three-1500 | bench-review-7a8-three-1500-node1.log.gz | `aa954cbd6df983f049b478ebf78ec58938a19a230eb31ac8505ff52235367017` |
| bench-review-7a8-three-1500 | bench-review-7a8-three-1500-node2.log.gz | `4b08a16b0b85f4a200229a23464e024ff9b75aa942cb40604a418fec49150eba` |
| bench-review-7a8-three-1500 | bench-review-7a8-three-1500-node3.log.gz | `9c866b32c4a410a73e741d5c6eab3acf9493d1fb482a06a66cb165c7b91f7c2e` |
| bench-review-7a8-three-1500 | bench-review-7a8-three-1500-raw.ndjson | `6c7ff34bce808a55c29ba1d852fdac93d103c7e92ced186baaa47a9c247056c5` |
| bench-review-7a8-three-1500 | comparative-campaign-bench-review-7a8-three-1500.json | `ca53a5cbddf8619113f47a517e6661157d7645b70d39206b7be71ac622086f14` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-deadline-census.ndjson | `d1f9896d8eebd1833152bbc8a5096877e10b4304b829cc8cf295e01ddf8618bc` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-decision-samples.ndjson | `03cd5786ab7b17842baa5c5d5e6e7f72356fd922555e6b975ba12cb478791aab` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-formation.ndjson | `ab5a801272304ef93796548b340933c4904719fa1af1d5e5ab11c5f92d236c9a` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-node1.log.gz | `1ffc3063c824e8241754112f8fc540df925d0f25b138eb767356e6ce8eeae405` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-node2.log.gz | `400962e1d00679bbbf53c67658d2c9ee4c950ff81fcc6c05ecc73d232cfa5690` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-node3.log.gz | `d01e046b31cc22d6fb6183ba3eab8136b2fcbd3a38147a96136c8a037b03b94c` |
| bench-review-7a8-decision-1509 | bench-review-7a8-decision-1509-raw.ndjson | `c7cf8d17a472d760bc7f34eff93f80b63f9ab24982e8dcd6a2c39e652591f83f` |
| bench-review-7a8-decision-1509 | comparative-campaign-bench-review-7a8-decision-1509.json | `4aaccb176000f5fd8edee0cb6df6e5854bb595d9515af289469222101ea200b3` |
