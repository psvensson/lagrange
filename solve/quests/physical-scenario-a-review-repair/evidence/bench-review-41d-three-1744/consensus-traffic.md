# Raft traffic during physical formation

Five directed WebSockets yielded cumulative send observations before the deadline. The last observation per socket occurred between 17:53:00.174 and 17:53:44.484 UTC. The deadline was 17:54:18.670 UTC. These observations count application messages after the send call returns. The sixth direction and later sends are outside this sample. [Campaign receipt and source log hashes](result.json)

| Raft message family | Entries | Serialized entry bytes |
|---|---:|---:|
| Heartbeat | 52,292 | 20,755,514 |
| Heartbeat response | 57,771 | 22,910,862 |
| Append | 7,381 | 22,726,279 |
| Append response | 10,674 | 4,187,697 |
| Election | 241 | 100,795 |
| Other | 105 | 42,012 |

Of 128,452 Raft frames, 128,440 carried one entry and 12 carried two. All five socket observations reconcile to 128,464 entries. Frames occupied 83,311,467 bytes including their wrappers. Heartbeats and responses contributed 110,063 entries, or 85.7% of the observed messages. Each group still owns its heartbeat content, ordering and acknowledgement. A transport experiment can test whether more messages for the same peer can share a frame while preserving those properties.

At the final committed census three partitions remained below RF3. Two subsequently had both target operations complete before the deadline according to their owner logs. The last wasm_operations target had entered participant release. The 92 completed release stages had median duration 1.042 seconds, p95 2.282 seconds and maximum 5.215 seconds. There was no measured workload. [Partition chronology](partition-waits.md)
