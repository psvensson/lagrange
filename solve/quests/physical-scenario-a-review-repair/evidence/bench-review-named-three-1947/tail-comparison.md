# Tail copies at the original formation cutoff

Source pass 3292 on a723 (19:36:36.533 UTC) was 5.481 s before cutoff. Source occupancy was 2/2; timers, storage reservations and WASM operations were waiting. The late seed ledger census showed attempt 1 MATERIALIZED for access and attempt 1 ADMITTED for revisions. The exact token, replica, target boot, addressed worker observations and source transitions are retained in the [a723 operation evidence](../bench-review-owed-three-1929/last-two-copy-timing.json).

| a723 observed boundary (UTC) | access 1102 to .41 | revisions 1112 to .32 |
|---|---|---|
| Ledger PENDING creation | 19:36:33.056 | 19:36:36.106 |
| Target claim acquired / worker entered | 19:36:34.824 / 34.866 | 19:36:38.080 / 38.623 |
| Worker readiness stage settled | 19:36:37.185 (55.7 ms) | 19:36:39.714 (157.9 ms) |
| Target received CUT_OVER | 19:36:38.820 (1,634.6 ms) | 19:36:42.427 (2,711.9 ms) |
| Source ADD completed | 19:36:39.724 | 19:36:45.824 |
| Time left at source ADD completion | 2.290 s | −3.810 s |
| Later source GROWTH_PROMOTE completed | 19:36:48.297 | 19:36:51.163 |

Both workers joined as learners. Readiness settlement can signify learner admission for a growth ADD. Neither observation timestamps the first committed target voter configuration. Source ADD completion, reservation release, and subsequent placement occupancy are distinct. No later sampled pass establishes the exact slot-discharge instant. The outer acknowledgements carry two release hops each; the receiver did not log either final message ID. Per-control-phase elapsed time remains unavailable.

## f8 comparison

The original cutoff was 19:53:34.104 UTC. Access and revisions GROWTH_PROMOTE completions left 24.400 s and 15.513 s respectively, compared with 6.283 s and 9.149 s past cutoff on a723. Target-stage release times for the matched access-to-.41 and revisions-to-.32 copies were 0.671 s and 0.965 s, compared with 1.635 s and 2.712 s. The copy order for revisions changed: f8 issued its .32 copy second. These stage differences explain only part of the additional headroom; the partitions reached the front of the queue earlier as well.

Pass 3545 at 19:53:28.402 had one occupied slot, no waiting demand, and only wasm_operations-p1 below RF3 in the separate census. Its .32 ADD 1176 was SYNCING; readiness had settled at 19:53:28.078. The worker received CUT_OVER at 19:53:28.831 after 0.753 s; the seed completed the ADD at 19:53:29.380 and GROWTH_PROMOTE 1188 at 19:53:29.557. That leaves 4.547 s for visibility and readiness verification. Attempt 88 exhausted the deadline in the partitions inventory. The harness recorded zero ready attempts. Full RF3 at the instant of cutoff and stable public readiness are unverified. See [f8 operation records and input digests](tail-copy-timing.json).

The production diff selects the assigned caught-up voter at the source, qualified by term, membership generation, configuration and lifecycle. This can avoid an election through a third voter; the prior native control actually observed that extra transition (Quest log entry at 19:44:54 UTC). Across the complete three-host logs a723 records 58 local demotions and 58 dispatched handoffs; f8 records 26 source transfer-requested answers. These are different events. A transfer request does not certify a completed election or a fixed saving. Neither raw headroom nor the change in transfer path isolates the effect of the code in one physical pair.

For a parent-managed diagnostic repeat, the [two-partition timing overlay](../bench-review-owed-three-1929/selected-release-timing.patch) emits the existing receiver RELEASE phase summary for CREATEs on access and revisions. Join messageId to sender last/slowest and consult joinedHops when present. This adds logging on the selected release invocations only. Preserve the unchanged cutoff and the original uninstrumented repeat as a control. The overlay has only been apply-checked and source-reviewed.
