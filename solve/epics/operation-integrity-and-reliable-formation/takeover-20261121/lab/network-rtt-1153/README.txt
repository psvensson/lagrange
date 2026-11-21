Host-to-host ICMP round-trip measurement on the lab LAN, started 2026-11-21T11:53:09Z, 1 Hz for 600 s, hosts idle (no formation, no test run).
tv-dator=192.168.86.32 adam-laptop=192.168.86.34 adams-gamla=192.168.86.41 controller=wired.
First 10-ping sample at 11:53:09 UTC: tv-dator->adam-laptop avg 1907 ms (539-3276), tv-dator->adams-gamla 100% loss;
adam-laptop->tv-dator avg 10 ms, adam-laptop->adams-gamla avg 155 ms; adams-gamla->tv-dator avg 93 ms, ->adam-laptop avg 177 ms.
tv-dator Wi-Fi: 2.4 GHz channel 11 (2462 MHz), signal -59 dBm.

RESULT (600 s, 1 Hz, 11:53-12:03 UTC; lab test runs by other tracks may have been active on the hosts):
pair                         loss   min    p50    p90    p99    max    >500ms >1s
adam-laptop -> tv-dator      2.5%   4.8    17.8   167    543    843     7     0
adam-laptop -> adams-gamla   0.0%   7.0   115     261    524    706     6     0
adams-gamla -> tv-dator      2.8%   8.9   144     359    874   1163    24     3
adams-gamla -> adam-laptop   0.2%   6.5   196     385    578    857     9     0
tv-dator -> adam-laptop      1.5%   5.2    44.4   178    502   1153     6     1
tv-dator -> adams-gamla      3.3%   8.8   136     251    819   1148    17     1
controller -> tv-dator       0.8%   3.0     7.2   121    498   1141     5     1
(milliseconds). The product's delivery ACK bounds seen missed in formation run 2 were 499-999 ms.
