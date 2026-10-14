# One owned inbound scheduling timer — bounded design V1

Status: experimental implementation proposal under sealed Quest rs-raft-admitted-inbound-liveness. This is not an independent approval or a merge receipt.

## Evidence and causal control

The exact earlier unreferenced V14 witness at 04ec9517c1c7545dd4354320aa1590e83cc4b15a, run 38512017556, ended unresolved. Both exact r2/r3 step calls were CORE_OK/inbound-enqueued and recorded native inbound REQUEST with no corresponding scheduled CALLBACK; the group-wide core observer recorded other work. The sole-behavior reference-toggle input a0ec3f5f4fce140886279a3087a0a67571cebbf6 at run 38512196691 passed its instrumented native witness 1/1 on hosted CI. It removes only the initial native inbound timer unref. This is strong hosted causal evidence but no same-physical-host qualification, uninstrumented native positive or other environment proof.

## Contract

Existing raft-rs-runtime-owner.js owns group.inbound, its one serialized group.turn queue, scheduleInboundDrain, retryInboundDrainWhenAdmitted, and runScheduledInboundDrain. Once an exact envelope is acknowledged CORE_OK/inbound-enqueued and placed in the group queue, its drain timer is *foreground debt*, unlike idle election/tick timer activity. Preserve one timer for one burst, and the existing persisted-user-transaction wait bound (never increase deadline or number of timer firings).

Store one exact mutable timer record {scheduler, handle, active} in that same group, for scheduling and cancellation. The original scheduler is captured at acquisition and reused at release, never the handler's latest clock. The owner arms the scheduler only when inboundDrainScheduled is false; when a callback fires, it checks exact timer-record identity and retirement flag, consumes that record before entering the existing runScheduledInboundDrain, which itself enters only via admitScheduledEntry. No source re-read, extra tick, alternate driver or new clock window. Reentrantly synchronous scheduler test doubles must not leave a ghost record.

A close must mark group.closed, cancel exactly that timer through its original scheduler, and leave no referenced callback. A callback which entered before close still sees the existing closed branch and never advances core; an obsolete callback must not cancel a newer owner's record. A runtime core generation replacement does not replace the *group* or clock owner and cannot use the earlier core handle: the callback consumes current execution generation only when admitted in the group's later turn. If a whole group is deleted, close retires its timer. Retry callback remains referenced until it either runs, reaches the existing admission bound and reports the held debt, or is closed.

## Focused falsifiers

1. Native real group accepts a structurally valid inbound envelope with stopped election scheduling; the source originally reports CORE_OK/inbound-enqueued but an unref zero-delay timer may fail to run. Frozen unreferenced source and identical test/control are required for source-only comparison on the same physical host; hosted green after reference toggle remains diagnostic.
2. Under injected VirtualTimeSource, two enqueues coalesce to exactly one native timer. Close before firing cancels its exact handle. Advancing after close makes no core entry, and a second close is idempotent. A separately-owned second group's timer is unaffected.
3. In a completed callback, no stale handle remains; the real core entries still follow existing admission/Ready. Stale callback identity cannot retire the next timer.
4. While persistence is temporarily unavailable, retry uses exactly the original scheduler and existing PERSISTENCE_ADMISSION_WAIT bound. Close cancels the exact outstanding retry handle; reaching the configured bound remains an explicit fault/deferred obligation, not green.
5. Open runtime replacement/reconstruction retains the same registered group identity and original clock owner: no old core-generation step is allowed, group pending debt remains owned and is consumed through the new generation if permitted.

Any timer clear/set failure remains an observable error, not a silently ignored cleanup success. Do not alter the observation RPC timer (O), transport acknowledgement or overall release deadlines.

## Proof ceiling

All source changes here remain WIP, awaiting an independent current-byte review, identical-host source-only negative vs candidate native positive, native uninstrumented witness, A/R focused control composition, metadata, static/corpus, seed bootstrap at original bounds and full zero-legacy certification. The five Quest receipts remain false until each genuine proof exists.
