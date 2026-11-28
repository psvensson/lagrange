# Peer timing during three-host formation

The seed was .34 in both trials. The observer sampled Linux TCP socket state on port 8082 at roughly five-second intervals. The RTT column uses the kernel’s smoothed RTT for each sample. The send queue is measured in bytes. Each row covers one direction over the capture lifetime, including startup and cleanup. Percentiles use nearest rank.

| Campaign | Sender | Peer | Samples | Median RTT (ms) | p95 RTT (ms) | p95 send queue (bytes) |
|---|---:|---:|---:|---:|---:|---:|
| ce2-three-1613 | .34 | .32 | 48 | 57.9 | 311.3 | 579,911 |
| ce2-three-1613 | .34 | .41 | 48 | 20.6 | 38.7 | 32,080 |
| ce2-three-1613 | .41 | .32 | 48 | 73.1 | 755.2 | 291,818 |
| ce2-three-1613 | .41 | .34 | 48 | 27.0 | 44.2 | 22,455 |
| ce2-three-1613 | .32 | .34 | 48 | 72.9 | 2045.8 | 293,222 |
| ce2-three-1613 | .32 | .41 | 48 | 69.5 | 320.9 | 231,680 |
| c94-three-1629 | .34 | .32 | 50 | 166.6 | 521.6 | 921,298 |
| c94-three-1629 | .34 | .41 | 50 | 41.1 | 148.9 | 118,739 |
| c94-three-1629 | .41 | .32 | 50 | 210.4 | 398.3 | 83,673 |
| c94-three-1629 | .41 | .34 | 50 | 55.8 | 140.4 | 137,183 |
| c94-three-1629 | .32 | .34 | 50 | 195.6 | 417.2 | 747,987 |
| c94-three-1629 | .32 | .41 | 49 | 211.0 | 519.9 | 344,534 |

Across the six directed TCP flows in c94, sampled cumulative `bytes_sent` reached 153.88 MiB on the seed, 71.75 MiB on .41 and 65.69 MiB on .32. Each host had two peer sockets. These kernel counters include retransmitted bytes and end at the last observed sample. They do not identify which application messages account for the traffic.

In c94 the seed recorded 42 participant-release responses taking at least five seconds. Thirty concerned the transaction-control partition, including requests that joined work already in progress. The CREATE for `contexts-p1` spent 7.891 seconds obtaining control authority before the pause and 6.281 seconds revalidating it before resume. Both checks contacted the .32 voter. Whole-run socket samples leave individual frame delivery and receiver processing time unresolved.

A read-only route inspection after the run found all three inter-host routes on wireless interfaces. Frequency and link rate can change. The runs lack a simultaneous wired control. The original custody and latency checks still apply.
