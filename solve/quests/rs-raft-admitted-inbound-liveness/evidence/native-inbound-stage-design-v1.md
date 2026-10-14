# Native accepted-inbound scheduling diagnostic — design V1

Status: WIP / diagnostic-only. The active Quest is sealed red at 01ccac020143d2a61887712431188e206e02f51e, receipt 5/5 false. This document does not authorize production repair or a merge.

## Exact observed evidence

- V13 native input a9506863ab58493add5f7762dd05e8ef915f9844: both original follower step results CORE_OK / inbound-enqueued, both carrier promises settled, no follower APPLIED_PROGRESS before Node's unresolved-promise cancellation. Adam-laptop proof is instrumented only.
- V14 exact hosted input 4e81ba09747e128d386895a8e6212785555a0578, Actions run 38510736565: same two original typed enqueue outcomes, then the existing actual-core-entry observer records groupEntries=0 / groupStepCalls=0 after arming immediately before forwarding. This establishes *no core call in the observed window*, not which replica's native timer fired. It is not an independent qualified same-host negative, native positive, or proof of the private scheduling reason.
- Runtime owner src/raft/raft-rs-runtime-owner.js has the one native group inbound queue, scheduleInboundDrain (1728–1734), retryInboundDrainWhenAdmitted (1737–1754), runScheduledInboundDrain (1756 onward), and exact lifecycle. Both scheduling calls unref the timer. The event-loop effect is an evidence-supported hypothesis, not a selected repair.

## Next passive discriminator

Within that same existing native runtime owner, add one nullable test-only observation seam for the *scheduling stage* of its own queued inbound work. The seam must identify the exact immutable groupId + replicaIdentity that scheduled the timer and may record only bounded phase/counts:

- initial timer requested on accepted queue;
- retry timer requested within the existing admission wait window;
- the existing scheduled timer callback entered;
- callback saw closed/empty group, or deferred for persistence, or submitted the existing lifecycle-admitted turn;
- existing bounded persistence-admission wait was exhausted.

The callback must not ask readStatus, committed membership, storage, run Ready, change deadlines or timers, ref/unref any handle, drive a tick or produce an alternate classification. It is a source-owned *diagnostic*, not a second scheduler or release observer. No arrays of unbounded events. Store only counters and final phase, at most two exact follower identities for this witness. If absent in production, allocate no diagnostic record.

The V14 test installs the seam only after both held native N membership reads and immediately before the original carrier forwards, in the same window as its existing group-wide actual-core observer. The original beforeExit writer emits one <=4096-byte diagnostic with two exact follower stage records and original V13 outcome bytes. Removal is under the original test cleanup before any cleanup core operations. Event-loop cancellation is still RED and is never treated as an acceptable outcome.

## Causal next decision and excluded alternatives

If exact follower schedules are armed and callbacks never entered, the suspected unref/process lifetime boundary is supported; only then design one foreground *admitted debt* timer/cleanup obligation under the existing runtime owner. If callback entered but no core, inspect the lifecycle/persistence admission at that stage; do not alter timer refs. If entered core but no publication, inspect Ready/application/announce with identity-correct evidence. A group-wide core count cannot be assigned to r2 or r3.

A one-line unref toggle can be used only as a frozen, named experimental causal comparison after the diagnostic classification; it is not a production repair, native positive or permission to raise the timeout. A production change needs one retained timer handle, close/replacement cleanup, persistence retry-bound behavior, exact negative and uninstrumented same-physical-host positive, as well as independent review and static gates.

Nothing in this design modifies release OBSERVE, PA/R/K generation policy, transport ACK, message order, Raft core, snapshot ownership or acceptance budgets.
