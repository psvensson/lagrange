# Heartbeat batching on the three physical hosts

The two images differ in the outbound consensus flush implementation. Both ran the same Scenario A physical harness and the original 240-second deadline. On the four directed peer connections observed in both runs, entries per WebSocket frame increased from 1.000 to 2.295. The last observations on those sockets occurred at different times in each run. Raw frame totals therefore do not measure a change in traffic rate. [Baseline measurements](../bench-review-41d-three-1744/consensus-traffic.md) · [Campaign receipt and log hashes](result.json)

| Directed connections | Entries | Frames | Frames carrying multiple entries | Entries per frame |
|---|---:|---:|---:|---:|
| Baseline on the four shared directions | 95,153 | 95,141 | 12 | 1.000 |
| Check-phase flush on those directions | 136,594 | 59,518 | 27,380 | 2.295 |

A plain heartbeat or reply opens one batch for the existing outbound connection until Node's next check phase. Append, election and context-bearing heartbeat messages schedule the earlier microtask flush for the same ordered batch. At 64 entries the sender flushes immediately. The receiver obtains every original group's envelope. A closed or replaced socket cannot forward an old batch. Node's check phase sets a scheduling boundary and offers no fixed millisecond guarantee under event-loop congestion. [Tested implementation](https://github.com/psvensson/lagrange/blob/6115f57cd8aac7e2b96d6bda5daf9b172cf9c756/src/transport/message-router-consensus-delivery.js#L285) · [Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/understanding-setimmediate)

The seed census found 45/46 at RF3 5.003 seconds before the deadline. The last completed readiness poll reported all 46 at RF3. Only one poll satisfied readiness out of the three stable polls required, and the external workload did not start. Across 92 completed participant releases the median was 717 ms and p95 was 2,169 ms. This pair of runs establishes increased frame occupancy. Establishing a formation-time gain requires repeats. [Placement decisions](partition-admission.md) · [Final partition timeline](partition-waits.md)
