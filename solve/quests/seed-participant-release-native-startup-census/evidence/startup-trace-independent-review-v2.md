# Native startup release trace review

## Binding and verdict

- Source baseline: `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.
- Immutable placement input: `4d37a7eb2a95c297c7afe74a9fe5b88f88cae06e`.
- Reviewed raw log: `adam-laptop.raw.log`, SHA-256
  `eb176ba7d1943c68d4940538b3ed69e20b72be8803114742ad02acd5841fe4ca`.
- `git diff ffe35e77d..4d37a7eb -- src` is empty. The test instrumentation wraps one
  call to the existing `MessageRouter.deliver`, attaches a passive settlement
  observer, and returns the original promise
  (`message-group-membership-claim-cache.integration.test.js:240-275`).

**Verdict:** the retained tail is sufficient, without another run, to identify
the exact three-replica work tuple rejected by the final post-ENABLE census and
the first rejecting member. It is not a complete transcript of all 380 records
and does not by itself establish the scheduling mechanism that produced the
tuple.

## What the retained evidence proves

The trace header reports schema `participant-release-delivery-trace/1`, one
installation, cap 8192, 380 matched/recorded/completed records, and zero
dropped, capture-error, or incomplete records. The installation is node
`membership-claim-cache-seed`, router
`f81305d7-7cd0-4049-bbd8-aff761fa87c8`. The runner then elides 805,931 bytes.
The retained suffix contains 11 independently decodable complete JSON records
for `call_activation_leases-p1`; all use installation 1, the same router and
node, deadline `1791915522467`, acknowledged delivery, and have no handler,
delivery, or capture error.

The outer startup answer at log lines 15 and 29 is `release_drain_pending` for
release `6ea7641163cda1c2b9e010387177aa6b3d54deb307bc3797b98512e680fc657e`,
phase `release`, retry 100 ms. It is seed ordinal 10 of 135, completed 9,
attempt 1, with a shared 1,000 ms budget, 932 ms elapsed and 68 ms remaining.
Both diagnostic first-observation slots are null.

The 11 records bind one full attempt suffix:

| Operation | Call / completion | Observed result |
| --- | --- | --- |
| Outer RELEASE | 16152 / 380 | `DRAIN_PENDING`, same release ID |
| Initial INSPECT r1/r2/r3 | 16167-16169 / 370-372 | each `1/1/1`, origin null, all other work zero/false |
| PAUSE r1/r2/r3 | 16170-16172 / 373-375 | each `1/1/1`, origin null, all other work zero/false |
| ENABLE r1 | 16173 / 376 | `2/2/2`, origin `{index:2, term:1}` |
| Final INSPECT r1 | 16236 / 377 | `2/2/2`, origin 2/1 |
| Final INSPECT r2 | 16237 / 378 | `applied=1, commit=1, last=2`, origin null |
| Final INSPECT r3 | 16238 / 379 | `applied=1, commit=1, last=2`, origin null |

Here `a/c/l` means the canonical accepted-work
`appliedIndex/commitIndex/lastIndex`; every row also has no open SQLite
transaction, no participant staging/prepared row, and zero proposals and
pending outcomes.

This is a three-voter cohort, not a singleton. The stable configuration key is
`[["1921393518098582310","1963047980350680659","3158433444273604225"],[],[],[],false]`,
generation index 0 and term 1. Its identities are r1, r3, r2 by peer ID; the
canonical sorted replica route is r1, r2, r3. The ENABLE request captures all
three members in that order with no dropped member. Their lifecycle identities
and connection/admission generations remain stable across the retained attempt:
r1 `cc477973-f0a1-4b38-b77b-e71cf31becfb` / 7 / 7, r2
`409dc455-eaa2-4acd-acd2-9df90c75a496` / 8 / 8, and r3
`eda0faed-2d03-43e6-8148-ff22e5faaf17` / 9 / 9. All have runtime generation 1
and owner incarnation 1. The attempt names r1 as leader with the r1 lifecycle
incarnation, term 1, and the same deadline as every retained request.

## Source-bound branch inference

`cohortOf` derives sorted routes from the committed membership and `readCohort`
uses `Promise.all`, preserving that route order
(`replica-handler-participant-cutover.js:43-58`; the sort is
`partition-participant-release-contract.js:75-83`). The attempt reads the
initial cohort, pauses it, and immediately rejects an initial non-drained member
at lines 248-263. All six initial observations are drained `1/1/1`, and the
recorded ENABLE proves execution proceeded beyond that branch.

For this non-SQL-transactions dependent partition, `settleQueryRelease` returns
the same census without a refresh (`replica-handler-participant-cutover.js:100-103`).
The pre-ENABLE `releaseCensusDefect` at lines 274-278 therefore passed. ENABLE
then completes on r1 at lines 279-282, after which the owner performs the three
final INSPECTs at lines 283-286 and calls `releaseCensusDefect` at lines 295-297.

The canonical work owner requires `appliedIndex === commitIndex === lastIndex`
(`partition-participant-release-facts.js:46-65`). The canonical defect owner
checks drain before topology, query, or origin and returns the first defect in
census order (`partition-participant-release-contract.js:104-135,140-173`).
Consequently final r1 passes at `2/2/2`; final r2 is the first rejected fact at
`1/1/2`; r3 has the same lag. The owner returns `DRAIN_PENDING` before it could
classify r2's null origin as `ORIGIN_REPLICATION_PENDING`. The outer answer is
therefore the final post-ENABLE branch. No second control-owner release or
RESUME can be reached after that return
(`replica-handler-participant-cutover.js:298-304`).

## Candidate mechanism, not root-cause proof

The tuple is consistent with the existing inbound-delivery boundary. A received
Raft envelope is acknowledged after `raft.step` returns
(`partition-service-entry-apply-base.js:247-259`), while the operation port's
step snapshots and enqueues the envelope and schedules its actual inbound drain
for the next zero-delay timer turn
(`raft-rs-operation-port.js:298-319`;
`raft-rs-runtime-owner.js:1705-1722,1877-1913`). The sender's Ready path awaits
message delivery before applying/advancing its own LightReady
(`raft-rs-peer-delivery.js:95-127`; `raft-rs-runtime-owner.js:1122-1150`). Thus
an acknowledgement need not mean the recipient has processed a later
commit-bearing envelope before an immediate status/facts read.

The existing F11 owner witness constructs this exact class of state: the leader
has advanced its commit, a follower holds the advanced-commit envelope, and a
step-only inbound drain later advances the follower's durable commit/applied
without a tick (`multi-replica-runtime-prerequisites.test.js:139-199`). That
supports this as the strongest current candidate interaction. The retained
startup tail does not expose individual Raft envelopes or timer turns, so it
does not prove that this scheduling interaction caused this particular failure.

## Evidence ceiling and next owner question

The runner output preserves the trace header and suffix but not the elided
middle. Completion ordinals 370-380 form the complete dependent-partition
attempt suffix; call ordinals jump from 16173 to 16236 because other router
traffic occurred. This review therefore does not claim the contents of all 380
records, the behavior of every seed partition, or absence of concurrent system
traffic.

No repeat run is needed merely to identify the rejected member/work tuple or
the final cutover branch. A repair decision still needs a bounded owner-level
falsifier that distinguishes whether final facts may legally observe an
enqueued but not yet processed commit message, without adding a second drain
predicate, an extra wait, or a competing release authority.
