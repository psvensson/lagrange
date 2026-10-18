# Recovery unit 2: progress-bound review decision

Status: **DRAFT for independent review. No source or test changes.**

This note preserves the approved requirement rather than silently turning a committed-write bound into an event bound. Source baseline is lane `a251ce4fd9c980a78c0fd33d8a5f873161f90870`.

## Exact approved wording

`RECOVERY-DESIGN-20261017.md:786–791` (R3-A rule 2):

> While the instance is serving-unconfirmed, every K-th APPLIED_PROGRESS is admitted (K = the named constant `UNCONFIRMED_RECONFIRM_EVERY_WRITES` at the reconciliation owner, R06; the count is per instance, in-process): one genesis read and one grant attempt per K committed writes while the owner is down, zero once confirmed. The confirming run fires its one OBSERVED wake (R1-C 7) and the latch unbinds.

The latest predicate is R4-A rule 1 (`:904–910`): it applies to **every instance whose genesis is OBSERVED in this process and whose LAST grant attempt answered UNAVAILABLE, HELD or serving alike**. Other grant outcomes keep the existing admission rule.

The proof obligations also state:

- R3-G P-R3 (`:859–861`): “the owner's return is observed within K committed writes without any explicit re-entry; one OBSERVED wake; CONFIRMED -> ACTIVE.”
- R3-G P-R3c (`:862–864`): “N committed writes under a down owner -> at most ceil(N/K) keyed runs, zero handler re-entries, zero journal reads outside those runs”.
- R4-A P-R3f (`:920–924`): the same cost and within-K-write bound on two HELD reopened followers beside a serving-unconfirmed leader.
- R4-B (`:928–936`): fewer than K user writes after return leads to no confirmation until an existing outside trigger such as explicit re-entry.

These are deliberately recorded as both event and write statements. Neither statement is silently superseded here.

## Observed source seam

`src/raft/raft-rs-runtime-owner.js:1196–1212` can drain multiple Ready cycles before `announce`. `announce` records the authoritative status observation at `:1264–1273`. Its progress emitter at `:1298–1304` emits **one** APPLIED_PROGRESS when `observed.value.appliedIndex` increases, regardless of the size of that increase:

```js
group.announcedAppliedRuntimeGeneration = expectedGeneration;
group.announcedAppliedIndex = observed.value.appliedIndex;
group.emit(RUNTIME_EVENT.APPLIED_PROGRESS);
```

There is **no current event payload**. The operation-port emitter only forwards/freezes the arguments it receives (`src/raft/raft-rs-operation-port.js:210–215`); its subscription wrapper adds no position (`:356–367`). The native owner already owns the position observation, so an additive payload should originate there if chosen. The WASM callback must not make an independent native-status read or treat arbitrary retained payloads as publication authority.

For example, if K is 32 and a native drain applies 64 committed entries, it can issue one notification. A notification counter reaches 1 and performs no confirmation attempt, despite more than K committed writes. A sequential fixture that always drains once per awaited write can pass while this real batched case fails.

## Choice A: preserve a progress-position/write obligation

The smallest stronger mechanism worth reviewing is an additive native-owned progress observation carrying an absolute applied position and runtime generation. The reconciliation owner records a bounded scalar baseline/credit and requests its existing keyed run when the native position crosses the K threshold. One batched notification containing at least K positions must request a run immediately, rather than consume one event credit. Absolute position/generation lets repeated or stale notifications be ignored and restart baselines be explicit. Formation events and the pre-genesis completing event keep their approved rules. No new queue, timer, publication authority or callback await is introduced.

This mechanism alone is **not automatically a proof of the literal approved write bound**. The design reviewer must resolve all of the following:

1. Applied log positions include native no-op/configuration entries, and replay or snapshot installation can jump positions. They are not inherently a count of user writes. A cost bound in user-write units needs a native/application-owned count with that exact meaning, or an explicit statement about excluded traffic and what counts as a write. The WASM subscription must not parse/reinterpret native commands to manufacture that count.
2. A batched notification occurs after the batch. Counting its position prevents K notifications of additional delay, but cannot retroactively confirm before a batch of more than K writes has already committed. A literal unrestricted “confirmation finishes before more than K additional committed writes” requires an observation/admission scheduling guarantee or backpressure barrier at the owning application boundary, followed by a guarantee that the keyed probe runs before further qualifying write progress. That is a wider interaction change and requires explicit review; the enqueue-only callback contract cannot silently become an awaited metadata probe.
3. Async probe coalescing can combine threshold crossings. The contract must define whether the bound is on requested probe opportunities, executed keyed runs, or completed owner observations, and preserve the upper cost bound without a burst of redundant catch-up probes after a large batch.
4. Baseline/reset ownership must be defined for fresh/reopened instances, completing replay, runtime generation changes and a non-UNAVAILABLE grant. No counter resets in response to an owner return that has not yet been observed.

If the intended stronger bound is “probe at the first native progress observation crossing K qualifying committed positions,” the amendment must state that timing qualification explicitly. If the literal unrestricted committed-write bound is required, implement the necessary owner scheduling/count contract rather than claiming a position payload alone satisfies it.

Required discriminators for this choice: batched real native progress (K or more writes represented by one notification), duplicate and generation-stale progress, replay/snapshot jumps, no-op/configuration traffic versus user writes, and owner return during a large batch. The batched witness must kill the simple notification-counter mutant.

## Choice B: explicitly correct the contract to a notification bound

Retain the existing no-payload event surface and implement the approved every-Kth APPLIED_PROGRESS notification admission. Amend R3-A, R3-G P-R3/P-R3c, R4-A P-R3f and R4-B together so their universal bound is expressed in **eligible APPLIED_PROGRESS notifications per instance**, not committed writes. Keep any sequential awaited-write witness as a separately qualified 1:1 fixture observation, not a general write-count guarantee. Record that batching can delay the probe beyond K committed writes and that the existing B9/explicit re-entry/REMOVE/restart triggers remain the quiet-group continuation.

This is a real correction to approved acceptance wording. It needs an independent content-bound approval before implementation; it is not an editorial relabel. The named constant can be renamed to reflect the reviewed unit, or retained with an explicit supersession, as the design reviewer decides.

## Quiet-group precision under either choice

R4-B's “fewer than K writes” no-confirmation witness must begin at a known counter phase immediately after a probe (credit zero). In a cumulative counter, an owner can return at credit K−1 and one more eligible progress unit can confirm. The implementation cannot detect owner return to reset that phase without an observation. The successor wording/witness should say “fewer than the remaining progress units to the next K threshold,” with the K−1 fixture started at a known zero phase. This preserves quiet-group behavior and avoids asserting a false universal no-event rule.

## Review gate

No choice has been selected or implemented by this preparer. Root must choose and obtain an independent review of the exact amendment. Unit 1 verification and its corrective round remain prior dependencies. No new activity is admitted for non-UNAVAILABLE grant outcomes by this note, and the approved HELD-follower scope, one confirming wake, pre-genesis completing event, and current-lifetime custody remain unchanged.
