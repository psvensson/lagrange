# Native startup census checkpoint — HOLD

This is a non-main preservation checkpoint. The Quest remains OPEN, all five
acceptance receipts remain false, and no production repair is included.

## Exact inputs

- Parent: `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.
- Executed immutable input: `4d37a7eb2a95c297c7afe74a9fe5b88f88cae06e`, tree
  `f512d878f8191b2b2616ef96e6d390f6e3af3393`.
- Production `src` tree is unchanged:
  `4ff29d950a074768b3bcc40f6df310abda9827c0`.
- The three non-Quest changed files are the existing claim-cache test and its
  ordinary subsystem/impact-seal metadata. Their exact hashes are retained in
  `evidence/trace-v2-hashes.json`; the test hash is
  `e4c0697fbb18ead9b2b52a856b4e71f3352449d64e7267ccbc06c1bf02a2c013`.

The test-only observer preserves the original transport call and promise. Its
bounded copying and observer microtask add overhead; the run is not a latency
neutral measurement. Existing startup, assertion bodies, authorization,
configuration and deadlines are unchanged.

## Measured result and evidence ceiling

The canonical locked run on `adam-laptop` failed the original startup test,
before its T1 body, with no runner retry. The shared startup allowance was
1,000 ms: at `call_activation_leases-p1`, ordinal 10 of 135, it reported 932 ms
elapsed and 68 ms remaining. Nine partitions had completed; the tenth's first
attempt returned `release_drain_pending` with a 100 ms retry delay.

All three replicas were on the same node. Their initial INSPECT and PAUSE
facts were applied/commit/last `1/1/1`, with no origin. ENABLE completed on r1
at `2/2/2`, with origin index 2, term 1. The final census read r1 at `2/2/2`,
but r2 and r3 at `1/1/2`, with no origin and no other accepted work. The
canonical ordered classifier first rejects r2's drain. It correctly refuses
release before control-owner recheck or RESUME.

The trace header reports 380 complete records with no drops or capture errors.
The runner elided 805,931 middle bytes. The retained output contains 51 complete
records, including the complete final 11-record attempt suffix. Do not claim
custody of all 380 record contents. The immutable manifest is
`evidence/startup-trace-result-v2.json`, SHA-256
`edba934bf2ef4a4da7b63d9a039936ddf437b461141ca812456dcd9a19a9fc45`.

Independent census review `evidence/startup-trace-independent-review-v2.md`
(`d1696350d799dd9ef7176b7ea0c7b4c9791bf88a748e6a4d78f14e0ca5a4ec5d`)
confirms exact identities, order and branch. No rerun is needed merely to
identify the rejecting tuple.

## Qualified source diagnosis

Delivery can acknowledge native inbound admission before recipient application.
ENABLE awaits the leader's application; that is not an all-replica application
barrier. Ready and LightReady messages are sent, and the inspected native
configuration does not skip commit broadcasts.

The corrected report is `evidence/startup-source-ordering-diagnosis-v3.md`,
SHA-256 `efc7f3b88ecb72e085e311c80be38012842c60471cb44aaa37d77b23a1d19cf1`.
Its appended correction is material: status reads can queue/start inbound
draining, while answering from the previous published observation when that
drain is asynchronous. The trace does not distinguish an unfired timer from a
queued or running drain, and captures no Raft-envelope timeline. This is a
source-supported mechanism, not a measured complete scheduling history.

Existing F11 already proves the generic emitted-versus-applied boundary. A
second primitive test for that alone would duplicate coverage. The next useful
witness must exercise the actual release interaction.

## Continuation boundaries

Independent design review is considering one bounded, passive post-ENABLE
application observation at the existing release lifecycle recipient, followed
by the existing full fresh final census. No implementation is authorized by
this checkpoint. Exact request shape, publication wake and lifetime/cancellation
rules still need a recorded decision and independent review.

Keep transport acknowledgement, current drain/origin/query classifiers, shared
budgets, serialized seed order, original stored attempt deadline, control-owner
requirements and pause/resume fences intact. Application events occur before
completed runtime status publication; a wake must not be mistaken for proof.
No sleep, retry tuning, read repair, cached OPEN permission or weakened census
can close this failure.

The diagnostic parent still has inherited static debt. TX1, C2, recovery,
FreshMG, snapshot, CDC, full corpus and exact-main certification remain open.
The separate orphan deletion at `b8e36a97c46c5d0743aa34a95de18abadfc0bca7`
is preserved on its own branch and is not part of this measured source tree.
