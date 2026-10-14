# Admitted native inbound drain: host-lifetime owner

Status: scope design, not behavioral approval. The separate Quest remains
unsealed until this exact scope, causal falsifier and review boundary are
accepted. Existing seed participant release Quest explicitly excludes changes
to native scheduling, so no source change is allowed under that Quest.

## Observed facts

Native V13 exact input `a9506863ab58493add5f7762dd05e8ef915f9844`
on locked adam-laptop established two exact r2/r3
`CORE_OK/inbound-enqueued` original native.step outcomes.
Native V14 diagnostic input
`70c66f5de607576736969f41a1ef127eac89b433`, hosted run
`38508512532`, independently preserves follower identity in the
preexisting actual-core-entry observation seam. With no retries and no
observer timers it reports both original carriers forwarded, both core
step entries **zero**, progress callbacks zero, phase `applied-progress`,
and Node cancellation due unresolved Promise with event loop empty.
It does not prove that the scheduled drain callback did not enter the
host queue, only that no follower core entry followed admitted work.

Source `src/raft/raft-rs-runtime-owner.js` currently calls
`group.timers.setTimeout(() => runScheduledInboundDrain(group), delay)?.unref?.()`
after returning `CORE_OK/inbound-enqueued`. The potential bug is at
the native owner: admitted work is represented solely by an
unreferenced timer, so nothing keeps the otherwise idle host alive.
This is a testable causal hypothesis, NOT an inferred native-positive.

## Proposed minimal change and explicit exclusions

The **existing native inbound drain scheduler**, not the participant
release observation, must retain an execution lifetime while it owns
accepted inbound work. The smallest candidate is to avoid `unref()`
on its one scheduled drain timer. Keep the current reentrancy,
persistence admission, core step and durable Ready pipeline unchanged.
Retire/cancel the original timer via the same group lifecycle owner;
never add a poll, ref any O waiter timeout, or extend release deadlines.
Do not change the separate idle periodic tick policy, unless another
measured admission obligation independently requires it.

The source-only control uses the same V14 witness and old unreferenced
native scheduler. Acceptance requires a genuinely **uninstrumented**
original native witness positive, on a qualified physical host,
followed by the same old-source negative on the *same* host. A
diagnostic V14-positive is only a causal probe. Validate idle exit
when no inbound work exists, no group/host timer leak on disposal,
and later restart with fresh identity, alongside actual SQLite
commit/application/progress, existing release outcome and deadlines.

## Scope closure rules

A hosted run is useful fast feedback but does not substitute for a
locked-host or category-complete independent approval. Store exact
source and fixture SHAs, per-host NDJSON and failed attempts; run
census/startup and the full interaction cone after source change.
This design creates no behavioral acceptance receipts and does not
change the existing five all-false release receipts. If the minimal
candidate fails, leave it RED; diagnose native scheduled work further
before proposing another scheduling owner.
