# Decision: one passive application observation before final release census

Base: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`. Production is unchanged from
`ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`. The measured rejecting census belongs
to exact input `4d37a7eb2a95c297c7afe74a9fe5b88f88cae06e` on locked `adam-laptop`.

## Explicit supersession

This Quest succeeds `seed-participant-release-native-startup-census`. The old
sealed constraint `existing-authority-and-one-path` prohibited a local convergence
loop without a defined application-observation phase. It is not reinterpreted.
The successor explicitly permits one passive, bounded applied-position observation
at the existing release lifecycle recipient; the existing complete final census
runs once after it. Every old safety fence and the same five proof obligations
remain. Old records, failed receipts and retained evidence are unchanged.

Root accepts independent design report
`evidence/owner-boundary-design-review-v1.md`, SHA-256
`59fd68dce020fd0bc261cb8427c80dd2f6b68fbbf64e83c96a4f2dd0b63ca4d8`, with the
more precise RPC lifetime ruling in
`evidence/owner-boundary-design-rpc-lifetime-v1.md`, SHA-256
`e08a208350be4b49650aa8960f4e475e580e75300f56aca7fdfa454d4d76d525`.
This authorizes the bounded design and test-first work, not a production edit
before the real-owner witness is reviewed and measured red.

## Complete transition

An existing authorized release pauses the exact cohort, settles the existing
query/control obligations and ENABLEs the leader. Its durable commit point remains
the native application transaction recording origin and applied state. ENABLE's
stored origin supplies only the applied-position watermark.

Each exact paused member observes its published applied position through the
existing recipient and canonical facts reader. A passive runtime publication wake
may cause a new observation, but grants no permission and drives no tick, proposal,
transport application acknowledgement or repair. One stored observer promise and
its original bounded deadline own the transient obligation; no join extends it.
Term, membership, generation or lifecycle changes refuse stale observations.

After all positions are observed, the existing fresh final census, final query
proof, canonical full classifier, current control-owner check and guarded RESUME
remain the only route to OPEN. Applied position is not origin equality, a clear
query census, absence of accepted work, or admission authority.

The existing client budget owner carries the actual observation RPC deadline;
arrival delay consumes it. RPC expiry and overall expiry retain distinct existing
failure meanings. All observers are cancelled before handler shutdown waits for
recovery tasks. Service shutdown gives an entry wake before asynchronous cleanup.
Listeners, timer and record are released on every exit, with identity-checked
starter cleanup. Restart discards these volatile observations; durable origin and
application records remain recovery authority. Lost replies may be re-observed
idempotently. Runtime reconstruction and release recovery retain their existing
owners and policies.

## Proof and source scope

Use the real three-member release owner and native application. The held-delivery
witness must prove current source prematurely settles the same release attempt,
while the repaired source waits and completes only after actual follower application.
It must keep ordinary writes paused during the hold, then prove one subsequent
ordinary write on all replicas. The witness also needs the reviewed deadline,
lost-wake, duplicate/join, stale lifetime, query/control and older-origin controls.
Existing F11 is retained as primitive coverage and is not duplicated.

Witness plan V1 is rejected by
`evidence/native-release-boundary-witness-plan-review-v1.md`, SHA-256
`ca8e3256cabbcf3e58021bc2bed590d068ea94b29b77fabd1b37cb34bb06339d`.
Its revised exact plan needs incremental preflight before implementation. The
actual startup tests remain required within existing bounds; this design does
not presume that eliminating the observed ordering gap closes the whole budget.

Declared production scope: existing release constants/recipient/cutover/contract
and client budget owner; Raft event constants, port event whitelist and existing
publication point; current handler cleanup and service shutdown/event owners.
Update the existing registered application/transaction interaction as one unit.
No generic progress framework, callback RPC, new duration policy, alternate
application path or new durable store is permitted.
