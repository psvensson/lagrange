# Native participant-release publication ordering diagnosis

Status: read-only diagnosis. This report authorizes no source, test, timeout,
retry, or policy change.

## Evidence binding

- Worktree HEAD inspected: `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec`.
- Executed immutable startup input identified by the retained evidence:
  `4d37a7eb`.
- Raw startup trace:
  `adam-laptop.raw.log`, SHA-256
  `eb176ba7d1943c68d4940538b3ed69e20b72be8803114742ad02acd5841fe4ca`.
- Independent trace review: `evidence-review.md`, SHA-256
  `d1696350d799dd9ef7176b7ea0c7b4c9791bf88a748e6a4d78f14e0ca5a4ec5d`.
- The trace captured and completed 380 matching participant-release deliveries,
  with zero drops, capture errors, or incomplete records.

The final `call_activation_leases-p1` suffix is a real three-voter cohort on
one node. Initial INSPECT and PAUSE observations are `1/1/1` with no origin.
ENABLE on r1 completes with applied/commit/last `2/2/2` and origin index 2.
The immediately following final INSPECTs observe r1 at `2/2/2`, but r2 and r3
at `1/1/2` with `origin: null`. The outer RELEASE completes
`release_drain_pending`. The seed failure is ordinal 10 at elapsed 932 ms with
68 ms remaining from its 1000 ms internal budget.

`lastIndex: 2` on the followers means the encoded origin entry is durably
appended. It does not mean the origin row exists there. Their commit and applied
indexes remain 1, so `origin: null` is the expected application state.

## Source-bound ordering

1. The cutover owner awaits ENABLE and then immediately reads the cohort for
   its final census:
   `src/node/replica-handler-participant-cutover.js:279-297`.

2. ENABLE proposes the generation origin through the ordinary committed-write
   owner and awaits its answer:
   `src/partition/partition-participant-transaction-request.js:690-726`.
   The proposer answer is scheduled after the leader's application transaction
   commits:
   `src/partition/partition-participant-transaction-apply.js:116-125` and
   `:554-579`.

3. The Ready host sends every Ready and persisted-message batch, then every
   LightReady message batch:
   `src/raft/raft-rs-runtime-owner.js:1105-1150`. The binding exposes the
   LightReady messages unchanged:
   `vendor/raft-rs-wasm/src/lib.rs:620-650`. The wrapper builds `Config` from
   `Default::default()` at `vendor/raft-rs-wasm/src/lib.rs:453-460`; the
   inspected raft-rs 0.7 default has `skip_bcast_commit=false`. The evidence
   therefore does not support a configured commit-broadcast skip or an omitted
   LightReady send.

4. `sendMessages` awaits the transport's delivery answer, which records peer
   delivery success, not recipient application:
   `src/raft/raft-rs-peer-delivery.js:75-127`.

5. Every traced replica has the same node identity, so the relevant production
   path is local MessageRouter delivery. It awaits the registered handler:
   `src/transport/message-router-delivery-behaviors.js:106-145`. The partition
   handler awaits `raft.step` and then acknowledges:
   `src/partition/partition-service-entry-apply-base.js:247-260`.

6. `raft.step` admits and snapshots the envelope into `group.inbound`, schedules
   a zero-delay drain, and returns `CORE_OK/INBOUND_ENQUEUED` before the core
   steps it:
   `src/raft/raft-rs-runtime-owner.js:1877-1913`. The timer-owned drain is at
   `:1705-1759`; its delay owner is
   `src/raft/raft-rs-runtime-owner-constants.js:217-221`.

7. Status and ordinary committed-membership reads intentionally bypass the
   group queue and do not drain inbound envelopes:
   `src/raft/raft-rs-runtime-owner.js:1763-1774`. Participant-release facts use
   those two reads and compare applied/commit/last:
   `src/partition/partition-participant-release-facts.js:46-65` and `:85-112`.

This permits the observed order: both followers append index 2; their Append
responses let the leader commit and apply index 2; the leader sends the commit
announcement and receives delivery/enqueue acknowledgements; ENABLE resolves;
the cutover continuation performs final INSPECT in promise microtasks before
the followers' zero-delay inbound-drain timer callbacks run. The followers are
therefore legitimately visible as `1/1/2` during that census.

Production defaults schedule ticks every 20 ms
(`src/config/config-definitions.js:35-40`) and the core heartbeat interval is
three ticks (`src/raft/raft-rs-group-constants.js:18-22`), an effective 60 ms.
That is a later convergence path. It does not establish post-ENABLE publication
ordering and is not a basis for changing the release budget or adding a wait.

The trace does not record Raft envelopes or timer firings. It proves the
three-member canonical state sequence, while the enqueue-before-application
explanation remains a source-supported causal hypothesis rather than a measured
startup-envelope timeline.

## What existing F11 already proves

The existing F11 case in
`test/raft/raft-rs-backend/multi-replica-runtime-prerequisites.test.js:139-195`
uses real operation ports. After a follower has appended a measured write and
its response reaches the leader, it proves:

- the leader emitted a further envelope carrying its advanced commit index
  (`:158-167`);
- the follower is still durably behind that leader commit while the envelope is
  held (`:169-175`);
- handing the held envelope to `step` advances follower commit and applied
  without any tick (`:176-195`).

The fixture transport is a bounded held-envelope queue at
`test/raft/raft-rs-backend/partition-node-cluster.js:147-174` and `:290-305`.
Thus F11 already proves the generic owner boundary needed here: emitting or
admitting a commit announcement is distinct from applying it at the follower.
Adding another test solely for that fact would duplicate current coverage.

F11 does not pin the envelope's exact `commit` field, use a three-voter quorum,
assert both followers at the same `1/1/2` state, or assert the leader application
and follower application absence for the same command. Those are shape and
nonvacuity details, not a different ordering contract.

## Proposed deterministic boundary witness, if exact shape is required

Use the existing `PartitionNodeCluster` with three voters and one existing
`VirtualTimeSource`; do not add another fixture or delivery algorithm:

1. Settle every replica at index 1.
2. Propose one measured command at index 2.
3. Hand the two initial Append envelopes to the followers and advance only
   their zero-delay inbound drains.
4. Hand their responses to the leader and advance only the leader drain.
5. Before delivering the resulting leader-to-follower envelopes, assert the
   leader is `2/2/2` and applied the command; both followers are `1/1/2` and did
   not apply it; and each held canonical envelope carries commit index 2.
6. Hand those exact envelopes to the followers, advance their zero-delay
   drains, and assert both become `2/2/2` and apply the command.

The witness uses no heartbeat, tick, sleep, subsequent proposal, fresh facts
read, copied drain predicate, or repair action. It would strengthen the exact
three-voter and envelope-shape correlation and make timer control fully
deterministic.

It still would not prove that the actual startup MessageRouter handler returns,
the ENABLE promise continues, and the final three INSPECT deliveries all finish
before the real followers' scheduled drains. It also would not traverse the
ReplicaHandler cutover or the 135-partition seed workload. Consequently, it
cannot by itself promote the current startup scheduling hypothesis to measured
root cause. The retained startup trace supplies the real workload/state suffix;
F11 already supplies the generic emitted-versus-applied contract. A new
three-voter witness is justified only if the next sealed claim explicitly needs
the exact quorum/envelope shape, not as another proof of the same owner boundary.

## Dated correction — 2026-10-13

The statement in source-bound ordering item 7 that status and committed-
membership reads “do not drain inbound envelopes” is too broad. The exact owner
is `readStatusObserved` at
`src/raft/raft-rs-runtime-owner.js:1392-1409`:

- with no active turn and no inbound envelope, it reads the core directly;
- with inbound work and an existing published observation, it enqueues
  `perform(READ_STATUS)`, which drains inbound before performing the read;
- if that work is asynchronous, it attaches rejection containment and returns
  the last completed `statusObservation` immediately instead of awaiting the
  queued read.

Both `READ_STATUS` and ordinary `READ_COMMITTED_MEMBERSHIP` enter that owner at
`src/raft/raft-rs-runtime-owner.js:1763-1774`. The membership answer is derived
from the status value that owner returns. Therefore a final participant INSPECT
can start, or queue behind, the follower's inbound drain and still answer from
the earlier `1/1/2` publication while application of index 2 is in progress.
The trace does not prove that all three INSPECT answers completed before any
follower drain callback began. It proves that their returned canonical
observations were still the earlier completed publication.

This correction narrows the causal hypothesis:

1. Delivery acknowledgement remains distinct from follower application.
2. ENABLE still waits for leader application only.
3. Final INSPECT may itself drive the outstanding follower inbound work, but
   its synchronous observation contract can return the prior publication when
   that drive becomes asynchronous.
4. The retained trace has neither envelope nor runtime-turn observations, so it
   cannot distinguish a not-yet-fired zero-delay drain from a drain already
   running or queued behind another turn. No measured root-cause claim follows.

The existing F11 test remains sufficient for the generic emitted-versus-applied
boundary. The proposed three-voter held-envelope witness would still add exact
quorum and envelope shape, but it would not exercise the asynchronous
`readStatusObserved` branch and therefore would not resolve this startup
scheduling ambiguity. A future claim about that exact branch would need an
existing-owner witness in which the follower drain is observably asynchronous
while the status read returns the unchanged prior observation; the current
report does not authorize adding it.

The generation-origin application already emits the existing
`PARTITION_SERVICE_EVENT.ENTRY_COMMITTED` after its application transaction
commits at
`src/partition/partition-participant-transaction-apply.js:630-635`. The same
module registers the leader proposer's answer as an after-commit effect at
`:116-125` and applies the origin at `:554-579`. Thus an exact future witness
can consume the existing committed-entry event to observe leader and follower
application; it needs no new application hook. This event was omitted from the
original report's witness discussion, but its existence does not upgrade the
current trace from hypothesis to causal proof.

