# Service traffic before the formation deadline

The six directed peer sockets supplied snapshots at different times. For each socket, this table uses the last predeadline observation following a returned send call. Counts exclude service messages carrying a CDC grant, which have a separate counter. Every column reconciles to its socket-level total.

| Request family | Outbound service requests (bytes) | Outbound replies (bytes) |
|---|---:|---:|
| Replica operation | 16,787,735 | 526,434 |
| Control write | 14,232,800 | 0 |
| Control read | 1,915,520 | 0 |
| Participant release | 4,384,091 | 3,046,648 |
| Query | 281,513 | 0 |
| CDC | 0 | 1,308,406 |
| Membership probe | 156,592 | 75,490 |
| Other | 28,476 | 34,926,808 |

Request senders can classify their own control reads and writes. Receivers lack that sender-side label, so their replies can appear under Other. A reply subtotal cannot identify the request that caused it. The counters measure application bytes, and their last observation can precede the end of a socket’s lifetime. [Campaign receipt and underlying log hashes](result.json)
