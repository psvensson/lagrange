# Planning judgment: independent predecessors, coupled live activation

Recorded 2026-10-08 on clean source base
`82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`. This is a new, append-only
planning record. It does not edit or reinterpret sealed history.

The coordinating owner explicitly adopted Astra's decomposition judgment:
`/tmp/raft-rs-takeover-20261008/snapshot-quest-decomposition-owner-judgment-astra.txt`,
SHA256 `b68ad5cbcd270d015915eef2ccf5a60f2508a9e2784b9c4ef770676101f0cd21`.
This note records that decision for independent review. It does not itself
seal a Quest, authorize source changes, approve implementation, or land work.

## Dependency graph

1. **A: application image content and format.** A separately sealed bounded
   predecessor may repair the existing checkpoint content owner: application
   schema, rows, indexes, outcomes and sequences; immutable v2 manifest and
   descriptor/native-binding grammar; canonical validation; source-local
   exclusions; and same-boundary conflict/idempotence. Its genuine existing
   owner red is the file-backed checkpoint creation/validation path. It must
   prove its own declared claim and normal behavior independently.
2. **B: local-open storage binding and completeness.** A separately sealed
   bounded predecessor may repair the existing lifecycle/durable-record/open
   interaction: exact per-replica storage binding, supported missing/corrupt
   facts, typed read unavailability, known-wipe HOLD, and safe intact/virgin
   opening and cold restart. It may not introduce an extra majority token or
   reconstruct a wiped replica as the same voter.
3. **Coupled live exchange, activation and final certification.** After the
   committed clean dependency heads, one bounded Quest owns registered source
   identity/capture wiring, durable-before-native publication/compaction,
   actual native MsgSnapshot, staging/transport feedback/retry/pins, receiver
   native Ready admission, one FULL application-plus-Ready transaction,
   continuation and crash recovery. Sender and receiver activation remain
   one owner interaction. A live sender-only publication predecessor is not
   approved.

A and B have separate claims; their green receipts do not close snapshot
catch-up or substitute for final current-head evidence. Their exact order and
Quest IDs still require reviewed materialized statements and genuine red seals.

## No-activation fence for predecessor work

Content-only work must not add the missing runtime callback argument, enable
native publication or compaction, enable automatic cadence, or route v2 images
into the old destructive shutdown/install receiver. The exact current source
caller census found only `snapshot-catchup.js` calling the creator and omitting
`raftRsGroupId`; that observation must be rechecked on each candidate. A
predecessor requires an explicit no-activation regression proof and source
scope audit. If a supposedly isolated change activates the live interaction,
it belongs in the coupled Quest instead.

Fresh-CREATE v1 keeps its existing exact admission owner. Deferred v2 CREATE
remains typed unsupported. FreshMG, automatic lag/cadence, and unsupported
whole-image rollback stay outside these bounded claims.

## Explicit planning-order supersession

The earlier unsealed planning condition requiring all seven future-green
R1–R7 suites before **any** source is superseded **only for independently
sealed A/B predecessor work**. Each predecessor instead requires its own
reviewed bounded statement, concrete owner tests, meaningful measured binary
red, exact scope/interaction records, independent verification and normal
landing gates. This is an owner judgment about the work unit under R15/R16;
it is not a claim that the earlier gate was satisfied.

The current `quest.json`, preseal plan and older materialization note have not
been rewritten by this note. They remain historical unsealed planning bytes
pending an independently reviewed successor. No source may start under an
unamended contradictory draft merely because this planning record exists.
Any already sealed exact-82b54 statement whose starting premise changes must
be explicitly terminally superseded and replaced at the new clean head;
partial implementation packets cannot preserve a false exact-start claim.

## Final acceptance remains unchanged

All seven final scenarios remain required: registered application-image
preservation; independent publication/group generation; intact native catch-up
with receiver-owned election/incarnation; unsafe-open/known-wipe refusal and
safe cold restart; exact fresh-learner component authority; refusal/crash/lost
response continuation; and real registered dispatch, transfer, native admission,
atomic install, restart and tail replay with zero lost acknowledged writes.

R6/R7 keep their negative, retry/expiry/stale-work and physical atomicity
obligations. A missing downstream assertion, synthetic pass, unconditional STOP
or merely present observer is not a future-green suite. The coupled activation
Quest must have concrete reviewed future-green acceptance before its source
work, and final all-required greens, semantic/crash mutants, independent review
and required pressure evidence before landing. Dependency tests rerun on that
same final head. External manifests retain Path B source/test/helper/native
hashes and engagement review; the binary receipt probe does not enforce those
claims itself.

The draft remains unsealed. This note creates no receipt, source permission,
terminal success, commit, publication or full-cutover/FreshMG closure.
