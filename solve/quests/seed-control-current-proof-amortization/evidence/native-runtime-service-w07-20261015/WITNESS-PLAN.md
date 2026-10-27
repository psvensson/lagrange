# W07 frozen native witness plan

Base: ec6a14832e843080e1079c19efe3c0d2fce1bab8. Test-only; no production
correction, release command implementation, seal, activation or merge.
This plan was written before the first native execution. The preceding design
vet used a heartbeat-reply predecessor; the final test uses the verifier's
simpler existing forwarded-proposal predecessor. Exact-content review below
must review these final bytes before execution. The four-arrival bound is unchanged.

## Source and single ownership

`src/raft/raft-rs-runtime-owner.js`: `enqueue` owns serialized turns;
`enqueueStep` owns accepted immutable inbound snapshots; `perform` drains
inbound before its command; `drainInbound` recursively consumes the live queue
across asynchronous `drainReady`; `invokeCoreAt` rejects stale generations;
`runScheduledInboundDrain` owns clock-driven accepted-work service.
`raft-rs-operation-port.js` encodes existing proposals and supplies lifecycle
admission. Its existing scheduled tick drives the separate replacement trigger.
`PartitionNodeCluster` composes real native ports, WAL/FULL databases and
transport inboxes. No replicated staging, new result, invented decision,
production hook or competing owner is introduced.

## Frozen finite schedule and success/failure

RF3 forms through real ports and commits one setup write on all three replicas.
Setup may settle, tick, deliver and read status. It then quiesces, captures an
unmodified native leader A -> follower B heartbeat, and caches native peer IDs.
The captured envelope remains test-owned until delivered through `B.step`.

An existing B proposal enters native `propose` and its real forwarded send is
held by the existing `sendFor` Promise seam. This is the predecessor already
owned at the cut. No measured inbound is yet accepted. At that cut:

1. Queue a uniquely encoded ordinary B proposal behind the predecessor.
2. Deliver captured heartbeat occurrence 1 through B's native ingress.
3. Release the predecessor's actual send.
4. At each real heartbeat-response send await, deliver the next exact duplicate
   before releasing that reply, through occurrence 4. No fifth occurrence.
5. Advance only B's owned clock by zero at the explicitly coded turns, allowing
   its already-owned inbound wake. Release all sends and retain the full trace.

**Bound fixed before execution:** at most ONE post-cut inbound core step before
the selected native proposal entry. It follows from the selected captured-round
rule: the queued turn initially owns only occurrence 1; later arrivals during
its Ready await cannot enlarge that turn's captured input. This does not propose
discarding already-pending tails or replacing CA1/M9's refusal semantics.
The four messages are four deliveries of ONE native-produced heartbeat, three
deliberate duplicates, not four newly produced decisions. Each retains its
envelope hash, message hash, ordinal, ingress acceptance and native output.

Success requires actual matching encoded `propose` core entry and its real
forwarded output, all four accepted occurrences stepped with unchanged bytes,
four native heartbeat replies, and the fixed service bound. Service failure
is the final assertion after preservation checks: more than one post-cut step
precedes the selected proposal. This is finite late-service evidence, not a
proof of infinite starvation or commitment/application of the proposal.
Setup/Promise-guard failures are seam failures, not semantic service REDs.

## Paired controls

- Quiet: identical owned predecessor and queued proposal, zero inbound arrivals.
- Replacement: one actual heartbeat suspends the selected invocation before its
  proposal; another exact duplicate is accepted. Two declared ticks of a
  pre-created RF1 trigger's owned clock cause a one-shot native trap then real
  shared runtime reconstruction. Resuming the old await must return the existing
  generation-changed failure without entering any target primitive. B's existing
  owned wake must service the preserved second occurrence in the new generation.
  This is same-process native runtime replacement, not snapshot/process-crash proof.
- Refusal: RF3 legally removes C; C's real removal acknowledgement is delivered
  after removal, followed by a real forwarded B proposal. A's ordinary proposal
  must consume both preaccepted messages, keep the native StepPeerNotFound
  refusal attached to C, and enter successfully after the valid tail. This
  preserves CA1/M9 meaning; membership is RF2 during this measured control.

## Observer and execution discipline

Observers only append observation records and retain message references with
capture-time hashes; they never mutate them. Incoming messages are runtime-frozen. `actualCoreEntryObserver` supplies
sequence/group/generation; the existing fault seam passively captures step
arguments/proposal bytes (and injects the one declared trigger trap only).
Inbound-stage observer records acceptance/wake events; transport records native
outputs. No observer calls a port, clock or delivery helper. Actual native
outputs and returned outcomes distinguish attempted core entry from refusal.
The measured service interval has no status reads, settle, deliverAll, manual
ticks or unrelated rescue commands. Refusal diagnostics are read only after
both inbound core entries and selected proposal have already completed.
The fixed 256-microtask guard drives no external operation or clock.

Pre-run review tightened the controls without changing the arrival schedule or
service bound: exactly one selected and one predecessor proposal entry;
predecessor typed success;
two accepted occurrences and two actual replies in replacement; exact durable
forwarded-tail bytes and ordering before A's own entry in the refusal control.
The refusal's native phase, type, reason and count remain separate from the
successful command. The service falsifier is registered last.

Cleanup first freezes diagnostics, disables new transport holds, releases all
owned gates, passively observes known invocation/send Promise settlement, and
allows a fixed 256-microtask unwind before disposing. It never ticks, delivers
or reads status and is outside the measurement. Cleanup cannot turn a failed
measurement into a pass. Its failure preserves the original error and leaves
unsettled fixture storage identified rather than closing under owned work.
Constructed-fixture setup failure also disposes/reset observers. Partial failure
inside the existing cluster constructor itself remains that fixture's existing
resource-management limitation; this packet does not replace its constructor.

One whole-file first execution through the existing locked `runLabTest` executor,
using its exact committed checkout, one ready host and unchanged matching
dependencies. Preserve raw TAP, command, host, exit, identities and first failures.
No threshold changes or retry-until-green. Native controls are separate tests so
the service assertion does not erase their observations. Exact test content must
receive independent review before this run.

This witness does not certify future M/H/settlement priority, compound commands,
durable custody/discard accounting, physical multi-host operation, TX1, release
state, application snapshots or whole-operation liveness. Those owners and
I1-I6/W01-W12 obligations remain open on the complete release unit.
