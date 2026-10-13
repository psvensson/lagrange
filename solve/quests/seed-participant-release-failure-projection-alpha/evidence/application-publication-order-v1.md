# Native application/publication ordering investigation v1

Status: read-only diagnosis. This report does not authorize a source, test,
Quest, timeout, retry, or policy change.

## Binding and measured input

- Candidate commit: `3231b1311ad79fb933d059877c97fc296b951e5d`
- Candidate tree: `b3adccaa73f0bb401144a7e212916446ec370d44`
- The production owners traced below are byte-identical between that commit and
  the diagnostic working tree at the time of this investigation, except that
  the already-frozen diagnostic cutover file has separately reviewed changes;
  none of the write, application, runtime, port, membership, or release-facts
  owners was edited here.
- `startup-claim-v2/adam-laptop.raw.log` SHA-256
  `77f255f36d1209dbf4abc594be67915523a4af436f3bbbc7d16f4ba1b6955a46`.
  It measured `call_activation_leases-p1` returning `release_drain_pending`
  during the first seed attempt at ordinal 10/135, with phase `release`,
  `retryAfterMs: 100`, budget 1000 ms, elapsed 912 ms, remaining 88 ms, and no
  retained `blockedDrain` or `joinedAttempt` projection (raw line 15).
- `startup-bootstrap-v2/adams-gamla.raw.log` SHA-256
  `829c0f8270c2cee1910bc2fe5ea290702c8a4b8c947f3ebd87afc5797d353e3f`.
  It measured `debug_sessions-p1` returning `release_drain_pending` on its first
  seed attempt at ordinal 34/135, with budget 5000 ms, elapsed 4967 ms,
  remaining 33 ms, and no retained projection (raw line 81). The same run also
  contains different `release_fact_unavailable` failures, so this report does
  not generalize one ordering explanation to every startup failure.

These measurements establish the observed answer and phase. They do not expose
the unprojected `work` tuple and therefore do not identify which drain field was
nonzero or unequal.

## Result

There are two promises in the committed-write path, and treating them as one
would give the wrong ordering conclusion.

1. The private `commitPromise` owned by `proposalQueue` **can resolve while the
   native runtime has not yet published the entry in its in-memory applied
   observation or called the core's `advance_apply`**. Its resolution is an
   after-commit effect of the SQLite application transaction.
2. The public `outcomePromise` returned by
   `startPartitionRaftWriteCommit` **cannot resolve from that private
   notification alone**. Its execution first awaits `service.raft.propose`,
   whose native operation turn drains Ready through application,
   `recordAppliedEntry`, `advance_apply`, and the terminal status announcement.
   It then consumes the already-settled private promise and runs the ordinary
   write side effects before settling the public outcome.
3. `pendingWriteOutcomes` tracks the public outcome, not the private promise.
   Its identity-checked deletion reaction is registered before the public
   promise is returned. A later caller awaiting that same public promise runs
   after this pre-registered deletion reaction under ordinary ECMAScript
   promise ordering.
4. `ENABLE` awaits the public outcome. Only a successful outcome causes the
   recipient to read canonical release facts. The cutover owner then reads the
   cohort again before its final census and resume.

Accordingly, source inspection does **not** support the claim that ENABLE can
return successfully while its own generation-origin write remains in
`proposalQueue`, remains in `pendingWriteOutcomes`, or has not completed the
native Ready turn that applied it. Canonical facts can still report non-drained
work caused by a later or independent entry/turn. The current V2 startup logs
do not expose enough data to distinguish that from another cutover return path;
cutover return-path elimination is owned by the separate census investigation.

## Source-bound timeline

### 1. Release ENABLE enters the one write owner

- `src/node/replica-handler-participant-release.js:64-72` requires a leader,
  validates the supplied census, awaits
  `enableParticipantTransactionAdmission(service)`, and reads
  `readParticipantReleaseFacts` only when the answer has `success: true`.
- `src/partition/partition-participant-transaction-request.js:690-726` reads an
  existing durable origin first. For a fresh origin it checks leadership and
  connection eligibility, builds the deterministic origin command, joins an
  existing public pending outcome by entry ID if present, or awaits
  `startPartitionRaftWriteCommit`.

This path neither fabricates admission nor reads a cached completion proof.

### 2. Public pending outcome and private proposal wait are distinct

- `src/partition/partition-service-raft-write-commit.js:460-474` creates the
  public `outcomePromise`, records it in `pendingWriteOutcomes`, starts the
  write execution, and settles the public promise only from that execution's
  final result.
- `src/partition/partition-service-cdc-stream-base.js:360-375` records the
  public promise and immediately registers the identity-checked deletion
  reaction.
- `src/partition/partition-service-raft-write-commit.js:321-357` registers the
  private committed-write wait in `proposalQueue` before proposing, then awaits
  the consensus handoff.
- `src/partition/partition-service-raft-write-commit.js:77-92,239-258` awaits
  `service.raft.propose(entry)` through the existing bounded deferral owner.
  A typed deferral leaves the write owned; a successful native operation must
  return before the handoff finishes.
- `src/partition/partition-service-raft-write-commit.js:372-405` consumes the
  private result only after the consensus handoff, runs committed-write side
  effects, and then returns the value that settles the public outcome.

### 3. SQLite durability precedes the private notification

- `src/raft/raft-rs-application-transaction-owner.js:51-99` applies the
  application callback, committed membership context, and durable applied
  state inside one SQLite transaction. Only after that transaction returns
  successfully does it run the registered `afterCommit` effects.
- `src/partition/partition-participant-transaction-apply.js:116-125,549-579`
  records the generation origin inside that transaction and schedules the
  proposer's answer as an after-commit effect.
- `src/partition/partition-service-entry-apply-base.js:556-568,677-686` routes
  the participant command through the same application transaction and emits
  its committed event only as another after-commit effect.
- `src/partition/proposal-queue.js:135-148` deletes the proposal entry before
  invoking its resolve callback. At the private promise's resolution point,
  SQLite application/outcome/applied-state durability is complete and
  `proposalQueue.size` no longer includes this entry.

### 4. Native applied publication follows the private notification

- `src/raft/raft-rs-runtime-owner.js:1038-1102` commits the application
  transaction first, then advances `group.membershipGenerationIndex` and calls
  `recordAppliedEntry`.
- `src/raft/raft-rs-participation-gate.js:218-232` makes
  `group.appliedIndex` visible and re-evaluates the gate in
  `recordAppliedEntry`.
- `src/raft/raft-rs-runtime-owner.js:1105-1150` persists Ready, delivers its
  messages, applies committed entries, persists the light Ready commit, applies
  light committed entries, and finally calls the core's `advance_apply`.
- `src/raft/raft-rs-runtime-owner.js:1160-1208` recursively drains Ready. When
  no Ready remains, it calls `announce`, which records the completed status
  observation (`src/raft/raft-rs-runtime-owner.js:1228-1250,1346-1353`).
- `src/raft/raft-rs-runtime-owner.js:1609-1647,1686-1702` makes that complete
  `drainReady` result the result of the proposal command. The operation port's
  proposal is a protocol turn (`src/raft/raft-rs-operation-port.js:309-317,
  368-374`).

This establishes a real but private interval:

```
SQLite transaction commits
  -> proposalQueue deletes + private commitPromise resolves
  -> runtime recordAppliedEntry
  -> core advance_apply
  -> drainReady reaches no-Ready and records status
  -> raft.propose resolves
  -> write execution consumes private result and side effects
  -> public outcomePromise resolves
  -> pendingWriteOutcomes deletion reaction
  -> ENABLE caller continuation
```

The interval is relevant to re-entrant observers. It is not an early-success
path for the public write or ENABLE.

### 5. Canonical membership/facts are observations, not a wait primitive

- `src/raft/raft-rs-runtime-owner.js:1763-1775` deliberately answers ordinary
  committed-membership reads from `readStatusNow` without queueing. Learner
  action reads are the distinct queued form.
- `src/raft/raft-rs-runtime-owner.js:1356-1409` reads fresh state while idle and
  the last completed `statusObservation` while a healthy group is busy. It does
  not expose a partially mutated current turn.
- `src/raft/raft-rs-committed-membership-read.js:77-87,108-156` makes
  `RETIREMENT` stricter than `WITNESS`: it requires a leader and refuses joint
  or pending configuration transitions. Neither purpose waits for an applied
  index to catch up.
- `src/partition/partition-participant-release-facts.js:46-65,85-115` reads
  committed membership, cross-checks it against status, and reports the live
  accepted-work owners. `isReleaseDrained` requires no SQLite transaction,
  staging, prepared participants, proposal, or pending public outcome and
  requires `appliedIndex === commitIndex === lastIndex`.

These APIs provide the intended safety witness: a current observation either
proves exact drain or names non-drained work. They do not promise quiescence,
retire work, or wait for it. Turning them into a local wait would duplicate the
release attempt/retry owner. Waiting from an application effect would also be
circular: the same native turn must finish `recordAppliedEntry`,
`advance_apply`, and announcement before the observation can advance.

### 6. ENABLE and final cutover observation

- `src/node/replica-handler-participant-release.js:64-72` performs the first
  post-origin canonical fact read after the public write outcome.
- `src/node/replica-handler-participant-cutover.js:279-304` requires that
  ENABLE answer to be `OBSERVED`, then performs a fresh full-cohort read,
  validates the final release census, checks the control owner again, and only
  then resumes the cohort and returns `CUT_OVER`.

The source therefore has two post-write observations, not an ENABLE return
based solely on the private committed-write notification.

## Synchronous controllable witness versus native release

The diagnostic case at
`test/partition/participant-release-protocol.test.js:354-505` uses
`startLeader` from `test/test-helpers/participant-transaction-fixture.js`.
That helper builds a `ControllableConsensusPort`; its test controls when
`port.commit(proposal)` synchronously invokes application and updates its
fixture indexes. This is an honest witness for the release contract's
`blockedDrain` shape, a genuinely pending proposal, same-build joined-attempt
sharing, and cleanup. It cannot prove the native sequence through Ready,
`recordAppliedEntry`, `advance_apply`, terminal announcement, and the operation
turn's promise.

The earlier case
`test/partition/participant-release-protocol.test.js:156-262` is different. It
constructs a real `PartitionService`, opens its production raft-rs operation
port, campaigns the lone voter, registers it in a real `ReplicaHandler`, and
calls the production release recovery/registered release route. Its first
release begins with no generation origin and commits that origin through the
native path before returning `CUT_OVER`. The current assertions prove the
end-to-end release, durable origin, admission resume, and reconstruction, but
do not pin the complete work tuple at the public return boundary.

The operator authorization in that case differs from the seed's
`FRESH_SEED` authorization. After authorization, both requests enter the same
`runParticipantCutover`/ENABLE/native-origin path. Thus it is a suitable
minimal falsifier for the application/publication ordering question, but not a
substitute for the retained full seed-workflow evidence or a proof of fresh-seed
authority selection.

## Smallest real native falsifier through the existing owner seam

If a new measured unit is authorized, extend only the existing test named:

> `real release route pauses initial writes, applies origin, censuses and resumes; registry and consensus triggers recover a recreated service from the same durable origin`

Use its existing real `PartitionService`, `ReplicaHandler`, release owner, and
first no-origin release. Immediately after the single awaited `release()`
returns `CUT_OVER`, consume existing owner outputs only:

1. Find the local replica's fact in `answer.census`; assert its durable origin
   equals `readPartitionWriteOrigin(service.db)` and is non-null.
2. Assert the returned fact's complete `work` tuple is release-drained through
   canonical `isReleaseDrained`, including `proposals === 0`,
   `pendingOutcomes === 0`, and
   `appliedIndex === commitIndex === lastIndex`.
3. Make one immediate
   `readParticipantReleaseFacts(handler, service, RETIREMENT)` call and assert
   it is `OBSERVED`, carries the same origin and generation, and its complete
   work tuple is drained.
4. Retain the existing post-release write, restart, durable-origin equality,
   automatic recovery, and post-recovery write assertions unchanged.

This falsifies exactly the suspect public ordering: a real native first-origin
release must not return success while its own origin remains accepted,
unpublished, or unapplied. It uses no local wait, retry, cached proof, copied
drain predicate, port monkeypatch, or new lifecycle owner. On a source-only
failure, the full fact tuple identifies which existing owner remains live.

Limits of that falsifier:

- It covers the one-member native first-origin path used by the existing
  release fixture. It does not certify asynchronous multi-peer delivery or
  follower catch-up.
- Its operator authorization isolates application/publication ordering. The
  full startup tests remain the evidence for `FRESH_SEED` authority,
  serialization across 135 services, and the shared startup deadline.
- A green result would exclude the origin write's own publication as the cause
  of the measured one-member return. It would not identify a later tick,
  no-op, control-owner entry, or another service's accepted work.

## Risks and confidence limits

- **High confidence, source-backed:** the private commit notification precedes
  runtime applied publication; the public outcome awaits the complete native
  proposal turn; ENABLE awaits that public outcome; the public pending map's
  cleanup reaction is registered before downstream callers receive the
  promise.
- **High confidence, source-backed:** witness/retirement reads are observations,
  not application barriers; RETIREMENT adds membership-transition constraints
  rather than a wait.
- **Medium confidence, inference from JavaScript promise registration order:**
  the public pending-outcome deletion reaction runs before the ENABLE caller's
  continuation. This follows directly from the registration sites but is not
  currently pinned by a real-native assertion at the release boundary.
- **Low confidence on the measured startup cause:** the logs omit the work
  tuple for these first failing-service DRAIN_PENDING answers. They cannot tell
  whether the non-drained fact was a proposal, a public pending outcome, or an
  applied/commit/last mismatch, nor whether it belonged to the origin or later
  work.
- **Circularity risk:** any repair that waits inside application, an
  `ENTRY_COMMITTED` effect, or a synchronous membership observer for the
  runtime applied index can block the same turn that must publish it.
- **Authority risk:** treating the durable SQLite applied row or committed
  outcome as sufficient release proof would bypass the runtime/core observation
  and the canonical full work tuple.
- **Scope risk:** a local retry or a second drain predicate would compete with
  `runParticipantCutover` and `isReleaseDrained`; neither follows from this
  investigation.

## Candidate source hashes used

All hashes are SHA-256 of `git show 3231b131:<path>`:

| Path | SHA-256 |
| --- | --- |
| `src/partition/partition-service-raft-write-commit.js` | `d990d746c4d204a2a0f6f77d0eb3a99dd0f1997ac5dabf4cd5b0f377bb9e9291` |
| `src/partition/partition-service-cdc-stream-base.js` | `05816c130303bb130970e4751a5188895c3afc1fb90930a7306b88f52711d1c2` |
| `src/partition/partition-service-entry-apply-base.js` | `3878b8011849c336f36e4848c15d58b09bb84b1218a2856b865c46bf73fda7cb` |
| `src/partition/partition-participant-transaction-apply.js` | `ed6b64f76f27f7f746e0613bef324ad5e762302077a41adcd15ae88874b4309d` |
| `src/raft/raft-rs-application-transaction-owner.js` | `f12ff39650a0c221212168129f24ff070b563bd3c65cb1498572af7e3642f6aa` |
| `src/raft/raft-rs-runtime-owner.js` | `b6cf3a1138030e75f23cb83eeeb31f1bc9080a8d72c414a160320217e556b1b5` |
| `src/raft/raft-rs-operation-port.js` | `552ec26c5d173a6962646e45e8a990d79a3f8052125fc5f798a77473d2a726bd` |
| `src/raft/raft-rs-committed-membership-read.js` | `8b1c9383b8beb23443588b77b2b52ecb8aae5685bb0fb93f3c8f371f034e5283` |
| `src/partition/partition-participant-release-facts.js` | `fcc0d2daee5ef58382d98419094ac007cc1f74ec8f8d8435ffa2edfd6b56990e` |
| `src/partition/partition-participant-transaction-request.js` | `4e7266f30114643679c3523ebbd5900bf37c1aa9fcd9476c3a7b7a87cf238a75` |
| `src/node/replica-handler-participant-release.js` | `cf1fbffb4e8e000ae5006cf23b0f2629e62d5845398d557cc04000c546fd8bbe` |
| `src/node/replica-handler-participant-cutover.js` | `36b24096246f4c57f11c4238ebd4847276eb0f802b82d7aa56acd347303a57c3` |
| `test/partition/participant-release-protocol.test.js` | `037c9c287d8c0efd5821dcd7d0548ab409054deb61ec259726dca62f1c029f82` |

No behavioral command was run for this investigation.
