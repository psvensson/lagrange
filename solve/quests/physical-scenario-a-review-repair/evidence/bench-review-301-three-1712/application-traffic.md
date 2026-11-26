# Traffic observed before the formation deadline

The six directed peer sockets supplied 16 timeout or recovery observations before the 240-second deadline. Each row sums the last recorded counter on each socket. The last observations were taken at different times, between 17:19:28 and 17:19:44 UTC. The counters measure uncompressed application frames when the send call returned. Protocol acknowledgement and receiver completion are measured separately.

| Frame type | Frames | Application bytes | Share of observed bytes |
|---|---:|---:|---:|
| Raft consensus | 176,994 | 116,124,520 | 51.5% |
| Service requests with a CDC grant | 1,624 | 9,916,245 | 4.4% |
| Other service requests | 9,463 | 53,367,232 | 23.7% |
| Service responses | 10,948 | 44,988,949 | 20.0% |
| Router control | 11,168 | 959,428 | 0.4% |
| **Total** | **210,197** | **225,356,374** | **100%** |

Raft accounted for 84.2% of frames. Its aggregate counters do not distinguish heartbeats from replication messages. The two largest non-Raft directional readings were 28,673,122 bytes of other service requests from .41 to .34 and 20,483,178 bytes of service responses from .34 to .41. The counters do not pair requests with their responses.

The campaign result records the source and image identity and the SHA-256 of each underlying node log. [Run result](result.json)
