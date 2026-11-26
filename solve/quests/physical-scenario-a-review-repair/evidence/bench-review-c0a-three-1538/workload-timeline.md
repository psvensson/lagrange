# The first failed order and the two failed rollbacks

The three-host run issued 100 operations. Its 57 terminal failures occurred on two PG-wire connections. The workload also failed to read the final warehouse state, so the campaign rejected the measurement. Times below are UTC. Client times use the workload's recorded monotonic-to-wall-clock origin. Each node log uses its own wall clock. [Campaign accounting and artifact hashes](result.json)

| Time | Recorded event |
|---|---|
| 15:53:29.351 | Worker 1 began attempt 2 of new order 26. This attempt and worker 2's order 17 both read district sequence 14, then each received a one-row UPDATE result. |
| 15:53:35.983 | The orders participant reported a statement failure. Worker 2 committed order 14. Worker 1's INSERT failed before COMMIT and its ROLLBACK succeeded. The retained product event omitted the underlying SQLite error code. |
| 15:53:42.727 and 15:53:43.130 | The seed and peer recorded transport ACK timeouts in opposite directions on established connections. The peer's last-inbound timestamp stayed fixed and its timeout streak reached 45 before reconnecting. The earlier orders refusal preceded these timeouts. |
| 15:54:11.154 and 15:54:11.189 | Two SQL transaction participant metadata writes exhausted delivery with unknown outcomes. The in-flight application requests were a payment inserting history and a payment updating warehouse. |
| 15:54:39.924 and 15:54:41.073 | The two ROLLBACK requests also failed while updating SQL transaction metadata. The next 31 BEGINs on connection 222457683 and 23 on connection 325056146 received SQLSTATE 25P02. |
| 15:54:42.458 | The final warehouse read found three addressed replicas. All three ready leases had expired and the committed readiness filter admitted zero routes. |

The first failure now has a controlled reproduction using the SQL engine and two partition participants. On `ce239691d` the losing transaction updated the district from its stale read, then its dependent orders insert failed. On `96c7d87ba` the repair rejected the stale update with a serialization conflict. All four focused cases passed, including a genuine duplicate and intervening disjoint writes. That result applies to the same-participant read-before-write case. [Investigation and verification record](../../log.ndjson)

The transport events establish when application and metadata deliveries began to fail. For the initial timed-out message the existing trace does not locate the missing frame or ACK within the two hosts. The subsequent fleet experiment records socket-level evidence alongside the product's own delivery decisions. The readiness filter and transaction rollback obligations still apply during that experiment.
