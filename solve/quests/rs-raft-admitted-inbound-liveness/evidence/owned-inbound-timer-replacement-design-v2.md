# Inbound wake debt across shared-runtime replacement — bounded correction V2

Status: WIP corrective design, no independent approval, no Quest receipt closure.

## Measured first violated transition

Exact input `98d146fb2018e43e9c4603d1db1ec127b2d885b3`, hosted Actions `38518730457`, native `test/raft/raft-rs-backend/inbound-drain-owned-timer.test.js` case `a replacement-time native drain preserves the admitted follower debt`: actual native follower ingress accepts `CORE_OK/inbound-enqueued`. Its owned timer fires inside the shared core reconstruction while the runtime is still REPLACING. The exact recipient's existing lifecycle-admitted turn attempt occurs; group-wide `step` count remains zero (correct during the barrier). The trigger group completes the shared replacement. After advancing only the original recipient's virtual clock, its accepted envelope still does not re-enter the new-generation native core. This is a named assertion failure after all engagement/precondition gates, not a timeout or setup red.

This reveals a separate consequence of a referenced timer: `runScheduledInboundDrain` retired the one timer before `admitScheduledEntry` returned a replacement-time refusal; its own caller discarded that result. No second timer or explicit wake debt remained even though the group still owns the admitted inbound envelope. A new caller's read/tick can drain it, but relying on that would violate admitted-work liveness.

## Canonical owner interaction

The existing shared runtime owner already knows (1) a group's accepted inbound queue, (2) global runtimeHealth/generation and (3) when `resumeRuntimeGroup` publishes a successful current reconstruction. Do not add an observer-side retry, new scheduler, polling read, independent recovery coordinator, or duplicate status classifier.

The inbound wake owner stores one explicit **transient** disposition:

- NONE: no deferred shared-runtime wake. The existing `inboundDrainScheduled` and timer handle own normal work.
- SHARED_RUNTIME: the timer callback was consumed while the shared runtime was non-HEALTHY; the exact group's queued work must be reoffered to its existing scheduler after successful current-generation recovery.

The branch is reached *after* the exact closed/empty check but *before* testing user-transaction persistence admission; the global runtime replacement barrier outranks a group's local persistence state. It records SHARED_RUNTIME without consuming or restarting a persistence retry deadline and returns without attempting a forbidden core entry. This records debt, not authority to step.

At the successful, exact-current `resumeRuntimeGroup` finish (which already owns the shared-runtime reactivation transition), consume SHARED_RUNTIME by calling only the existing `scheduleInboundDrain` for a nonclosed group whose original queue still contains accepted envelopes. Coalescing handles any already-armed timer. Reset the transient disposition only after success, or immediately if the exact group has no accepted queue. A failed, stale-generation or interrupted resumption retains the named debt. Exact close retires it.

This does not alter normal native queue order, Ready persistence, lease/campaign, lifecycle admission, transport acknowledgement, retries, timeout budgets or final APPLIED_PROGRESS publication. The existing timer custody helper still owns only the original scheduler and handle.

## Discriminators

- The new two-real-group replacement reentry case must be red at its named post-recovery step assertion on unchanged source and green on corrected owner; the exact accepted follower and replacement-time callback are witnessed.
- The four original timer tests and the native application-order V10 (no extra diagnostics) must stay green.
- Real/native runtime-load-recovery, replacement review, serialized turn, wait-bound, lifecycle, throw containment, message-group, and zero-legacy tests remain obligatory.
- Add follow-on tests only for reachable new concerns (failed replacement, queued close, local host admission). Do not infer a proof for these from one recovery success.

No main/cutover/corpus/Quest independent approval follows from a focused green.
