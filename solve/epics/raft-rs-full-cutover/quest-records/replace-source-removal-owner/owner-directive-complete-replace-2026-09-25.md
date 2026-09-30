# Owner directive (2026-09-25, binding): complete the approved REPLACE design

## Classification of the A2 SLO red at 102e127c4

The failure is not a new mechanism and not a new product decision. It is an unimplemented part of the already-approved REPLACE progress design. No new quest boundary is drawn around it.

## Directive

1. **Classification.** Classify causally, not statistically. Stop once there is decisive evidence: two or more instrumented slow cases showing the same sequence (readiness unavailable or recomputing, no event wake, progress only at the fallback timer), with the alternative mechanisms absent.
2. **Implement the level-triggered wake from the approved design.**
   - A readiness publication or change wakes the REPLACE owner.
   - The event carries no authority. The owner rereads authoritative readiness and membership and decides again.
   - The 1 s reconciliation timer stays only as the lost-event and restart liveness backstop.
3. **Prove the lost-wakeup race directly.**
   - The sequence to cover: the owner observes not-ready or recomputing, readiness becomes usable, and the notification arrives around waiter registration. The owner must not sleep until the 1 s fallback.
   - Prefer the existing readiness generation or revision state. Use subscribe-before-recheck or an equivalent existing mechanism. Do not add a new event ledger.
4. **Prove the causal latency property, not only the 2 s SLO.**
   - With the fallback clock frozen, readiness becomes authoritative and emits its normal update. The REPLACE wakes and progresses promptly without the fallback advancing.
   - With that event suppressed, advancing the fallback still recovers progress.
5. **No special case for "recomputing".** An indeterminate or placeholder readiness answer may safely defer the removal. The later authoritative publication must wake the same REPLACE owner. A wake-up is never proof that removal is safe.
6. **Checklist against the approved design before the next A2.** None of these may still be merely deferred:
   - the REPLACE re-drives an uncommitted source removal;
   - a membership change wakes the owner;
   - completion rereads committed membership;
   - the planner cannot independently remove an active REPLACE's source;
   - a handoff attempt cannot be retargeted while it is active;
   - missed notifications and restarts recover through the same owner.

   Do not pass the release by fixing only whichever part trips the SLO next.
7. **Narrow verification.**
   - Focused evidence for the readiness wake-up, the lost wake-up, fallback recovery, and any owner interaction the change touches.
   - A fresh verifier attacks that property and the changed source.
   - Do not reopen the approved F1 or lease-verdict evidence unless the new code touches their semantics.
8. **Parallel A2 from the start.**
   - A2 is one logical gate, executed across the lab.
   - The performance-sensitive join SLO runs on the declared reference performance host. Do not mix absolute 2 s results from different machines.
   - The raft, node, partition, rebalancer, CDC and other suites are sharded across the other hosts, each locked and thermally healthy. Static and ratchet checks run separately.
   - Any real red cancels the remaining work.
9. **Start everything together.** Once the focused verifier approves, start the reference-host SLO batch and the independent shards at the same time. Do not run the 10 SLO trials locally first. The release criterion is unchanged.
10. **After A2 is green, keep the final sequence.** Merge the complete seed-parity + F1 + REPLACE candidate into local main. Rerun the original blocker controls and the join SLO on the exact merge. Publish once. Add no further pre-publish verification cycle unless the merge itself changes semantics.

This supersedes the earlier narrowed scope, which deferred the rest of the design to a later epic, for the checklist items in point 6 and the wake in points 2-5.
