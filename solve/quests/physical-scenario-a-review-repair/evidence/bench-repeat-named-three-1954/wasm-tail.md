# Same-image final WASM copy

Seed wall-clock events normalized to the original controller deadlines. Target order rotated. These are elapsed intervals between named observations, with no claim about unsampled internal wait states.

| Event or interval | 1947, second copy to .32 | 1954, second copy to .41 |
|---|---:|---:|
| Headroom at PENDING → SENDING | 7.691 s | 4.130 s |
| SENDING → first logged send | 0.001 s | 1.911 s |
| First logged send → ADD terminal | 2.966 s | 3.297 s |
| ADD terminal → GROWTH_PROMOTE terminal | 0.177 s | 0.421 s |
| Headroom at GROWTH_PROMOTE terminal | 4.547 s | −1.499 s |

The 6.046 s difference decomposes into 3.561 s before SENDING and 2.485 s afterward, including 1.910 s extra between SENDING and the first logged send. On the repeat, seed operation 1182 entered SENDING at 19:58:28.550, logged storage reservation creation at 30.458, then logged send at 30.461. The reservation interval itself was not measured. Target participant release occupied 0.610 s in 1954 versus 0.753 s in 1947. Seed logs and hashes are retained alongside the [matched per-operation records](matched-tail-discharge.json).
