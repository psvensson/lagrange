# C3 automatic fresh-identity REPLACE driver

Date: 2026-10-11  
Author: `subagent:freshmg_implementation_56` (GPT-5.6-sol, high)  
Status: round-eight source-bound design aligned to operation-local startup recovery; source held  
Quest: `message-group-fresh-identity-membership`

## Scope and accepted authority

This note orders the already accepted Quest owner chain into the normal
production path. It does not reopen F1/J1 promotion, delivery lifetime,
snapshot image, CREATE admission, ordinary settlement, reservation, removal,
absence, or cleanup decisions.

The required chain is:

1. `RebalanceCoordinator` and `ReplicaOperationRepository` create one durable,
   count-neutral message-group REPLACE with a fresh target identity.
2. `OperationWorkflowOwner` claims the existing per-group membership lane and
   drives each already authorized action through its explicit repository entry.
3. The native membership owner records ADD learner, promotion, and REMOVE
   results. Its receipts are historical facts, never grants for later actions.
4. `ReplicaCreateAdmissionOwner` admits exactly one physical target generation;
   the message-group learner join installs authentic group state and opens it.
5. The handoff/removal/absence owners retain the source until the target is a
   voter and the named handoff is complete. Cleanup and reservation release use
   their existing exact-generation authorities.

The driver does not add a scheduler, ledger, general retry registry, cache
authority, RawNode surface, or legacy consensus path.

## Current source observation

The planner still parks every message group in
`UnifiedRebalancerRebalanceLoop.messageGroupMembershipChangeRefusal`. Its one
positive closing test is intentionally red.

Removing that park is insufficient and unsafe. The operation-creation owner
currently allocates a fresh target replica, builds the durable target claim,
and stamps bootstrap topology, but it does not construct or persist:

- `messageGroupMembershipLaneKey`;
- `messageGroupMembershipIdentity`;
- `messageGroupSourceLifecycleClaim`;
- `messageGroupMembershipPhase = learner_requested`;
- `messageGroupMembershipObligationState = intent_recorded`.

The repository already persists those fields in the same operation insert,
owns a unique membership-lane constraint, confirms every membership field on
authoritative visibility, and classifies lane collision separately from target
claim collision. Existing claim/action/recovery consumers therefore have no
legitimate row to drive until operation creation becomes the authentic producer.

Source fingerprints at this decision:

| Path | SHA-256 |
| --- | --- |
| `src/rebalancer/unified-rebalancer-rebalance-loop.js` | `e09288a04f36cac753efc4f2d87b2f254b515aa3f2add898da58ff847a71d0d6` |
| `src/rebalancer/rebalance-coordinator-operation-creation.js` | `adbcb518825e239d5fb247300676bd431e136bef8003be9b2d05def06c4c6e09` |
| `src/rebalancer/rebalance-coordinator-replica-identity-methods.js` | `bb174620f420b425eb3457c6c251fe299269a6b00ffab9dddad9393140954517` |
| `src/rebalancer/replica-operation-message-group-membership-permit.js` | `20822a12027a4e375402324ea676496e028b133925e40ef37cf2904b92f918c1` |
| `src/rebalancer/replica-operation-message-group-membership-owner-claim.js` | `149a1ad99276c6dab365551abe0f73419213fea80d59a86a592f0a767f2ccf78` |
| `src/rebalancer/replica-operation-repository-mutation-row-methods.js` | `7242896a8a04b6a2e5e53230d57ef42e0d8811017ba32fe1782356f96b65bebe` |
| `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js` | `13af058d340bb1735ddd4dd5738d56bf7bab576b1c62dbc6e32db877e41a8d13` |
| `src/rebalancer/operation-workflow-owner.js` | `d3fd1fdb1b1f10f5576b59676ebe4db6847f9b7387bd4d507f5b413728cadc2c` |
| `src/rebalancer/operation-workflow-message-group-membership-recovery.js` | `395c2062e691a8fd41a5a8cad837f6a3a1028b0cc488d5d9b9ab87d5d8aa7246` |
| `src/rebalancer/operation-workflow-message-group-native-read.js` | `28e817dc703610056aca2e7cbaa375b1308aa9cfe33dab33e81c3338fd600e9a` |
| `src/node/message-group-service-handler-create-admission.js` | `e10ee0af448588caa7940cb2d4875625e83abcd91d60a23be7be2d54188c49ec` |
| `src/message-group/message-group-learner-join.js` | `3cdc17939cde35734dab37594f6c688bb0d86e0c87806123f8d897454a4b5bad` |
| `src/raft/snapshot-install.js` | `697f7f90aec4a2d86cfcab388b2cf6aee1321247b07e76d63c929cd22df06a2c` |
| `test/rebalancer/message-group-membership-change-parked.test.js` | `e7d3f578092dbbdb4c2e59ef55e215a0f2da42d93eb85bcd25fd49fd01cafeeb` |
| `src/message-group/message-group-service-row-owner.js` | `86009d61bb1dc03fcbb5111bbaa895399f95454adeda59b6d84064153d0c8b69` |
| `src/node/service-row-incarnation.js` | `a635339e8e3cb654119d4b243c6d47f393e339346453ffd746ed80821cfc4fcb` |
| `src/raft/raft-rs-operation-port.js` | `19e4c8826a2429b02a6546431b32c4d31ee0dcc78d03bd7ed7cb5f2dedf5bad1` |
| `src/raft/raft-rs-replica-lifecycle-owner.js` | `0b96d0a0a1e9315c0edfd180fb6b51bb1dab9776a5fe26c3409a49e2b1d8ea0e` |
| `src/raft/raft-rs-status-observation.js` | `aaa968a85bfd49035b8faa6ba1b75d3e0344403a67da6f30c8b0ea8c90a5b0b5` |
| `src/node/message-group-service-handler.js` | `0858f5a8bfdace42587342c741151bc1fae8aaa8ea2cd091241cf4b209bddcfe` |
| `src/node/message-group-membership-recipient.js` | `0485228ac2e4b394b42463c26f2a43f2d420daa4b7be88c820d261e070e6628b` |
| `src/rebalancer/operation-workflow-owner-retry-registry.js` | `fd289df689dd6714b306ee9278ca37edcfdb88de84a6a3c9018359ec612e2ba3` |
| `src/message-group/message-group-service-outbound-dispatch-runtime-methods.js` | `26d28e0560a8d6b39adee7c0dcd92f53ff960b3e3d08cade2b23c91251b80650` |
| `src/node/replica-handler-create-methods.js` | `a6b9e69077868ccef90ec6c97f30e64251a69d2e63be34817d08d4323593ac0a` |
| `src/rebalancer/operation-workflow-dispatch-ledger-self-move-gate.js` | `66c4abc680ad677420c5445d3c8bf80be319410ffe06e3d8085aa078573d63e4` |
| `src/control-plane/control-plane-system-table-gateway.js` | `6343b65af66e4a188de807af4103ea844eecf969a2a92fbd839f3500100c322b` |
| `src/cache/system-table-cache.js` | `ef707ad0360d7782070280a8e0dad2ebf95d50e12f19c12114b4ac77d7c154d5` |
| `src/cdc/cdc-integration-service.js` | `e677a3e31206f1ad69a9882e857a081eeafb026d192059c0379573702aa4d7af` |

## C3.1 Operation creation owns the initial record

Only a planned message-group `REPLACE` may construct initial membership intent.
ADD, MOVE, REMOVE, partitions, malformed topology, identity-preserving target,
and direct repository callers retain their existing behavior or refuse.

Before the insert, operation creation obtains one authoritative source SERVICES
row through the existing entity/service read owner and one host-bound native
status from that exact replica. The row must identify the planned
`sourceReplicaId` on `sourceNodeId`, be ACTIVE, name the same group, and carry a
positive durable `created_at`. The native status must name the same group,
replica and permanent peer reservation and a nonempty durable raft-rs lifecycle
incarnation. Cache rows may select a route but cannot become either fact.

`create_attempt_token` remains exact when present. Its null value is legal only
for a founder registration whose exact native lifecycle incarnation is present
and ACTIVE. This is not a claim that `created_at` is globally unique:
`service-row-incarnation.js` promises process-lifetime uniqueness only. The
durable lifecycle incarnation is the cross-restart/source-rebirth fence, while
the permanent peer reservation forbids assigning the founder replica identity
to another peer. An ordinary process restart that reopens the same database,
preserves the same lifecycle row/incarnation, and observes the unchanged
SERVICES created-at/token generation matches and resumes the exact operation;
a new runtime generation is expected and must be read afresh. A retired or
recreated lifecycle, deleted or replaced database, reinserted or changed
SERVICES generation, or token-bearing CREATE generation cannot match the
recorded pair even when a clock value repeats. Unavailable or contradictory
SERVICES/native facts prevent minting; they cannot produce an operation with
null membership fields.

The owner then constructs one canonical identity using the existing codec:

- operation, group, source replica/node/SERVICES `created_at`, nullable exact
  create-attempt token, and native lifecycle incarnation from the exact plan
  and the two authoritative reads;
- the already allocated fresh target replica ID and its derived raft peer ID;
- target node and canonical target address from the existing placement/address
  owner;
- a deterministic transition identity bound to the operation and both replica
  generations;
- `messageGroupMembershipLaneKey(groupId)`.

The identity codec therefore adds `sourceReplicaLifecycleIncarnation` and
accepts `sourceCreateAttemptToken` as either nonempty text or exact null. Null
is valid only with that nonempty lifecycle incarnation; the creation owner also
requires the tokenless source to be one of the immutable founder identities and
the founder/native proof above. A replacement target's activation persists the
CREATE admission attempt token into its SERVICES row, so it never takes the
founder-null branch when it becomes R2's source. The source lifecycle claim
stores the same created-at, token and lifecycle incarnation. Every holder
renewal, native action, handoff, absence and cleanup turn rechecks all three
where applicable.

It stores the canonical encoded identity, canonical source lifecycle claim,
lane, `learner_requested`, `intent_recorded`, and null holder/permit/learner,
voter/removal stamps in the same operation insert as ordinary status, source,
target, target claim, and topology. There is no follow-up patch write. The
repository's unique group lane and target-claim constraints choose one winner;
authoritative readback must match every field before creation is reported.

Collision handling is typed:

- same operation and byte-identical complete record is idempotent EXISTING;
- occupied group lane returns the existing lane operation and submits no second
  REPLACE;
- occupied target claim allocates another fresh target only through the current
  allocation owner, never by changing an already inserted membership identity;
- partial, same-ID/different-membership, source-generation, or topology mismatch
  is a conflict, not an idempotent retry.

The initial row contains no permit. Permit issuance remains a later
`OperationWorkflowOwner` action under a current membership holder, boot,
destination lifetime, native leader/configuration, and source identity.

### C3.1a Creation-time hosted native status interaction

There is no current generic pre-insert status request. C3 adds the bounded
read-only `READ_MESSAGE_GROUP_NATIVE_STATUS_FOR_REPLACE` interaction to
`MessageGroupServiceHandler`; it is subordinate to `RebalanceCoordinator`'s
operation-creation decision and creates no new status or lifecycle authority.
It cannot call the operation-bound `READ_COMMITTED_MEMBERSHIP` recorder,
import a lifecycle owner, inspect a raft database, or return a port/service
handle.

The creator captures strict own data for the proposed source and delivers to
`${sourceNodeId}/service/message-group-handler` with the existing 5 s replica
operation dispatch deadline. The request contains exactly the message type,
message-group entity type and group ID, source replica ID, source node ID, and
expected SERVICES generation: positive `created_at` plus exact nullable
`create_attempt_token`. A cached address or node is only a route hint. The
handler rejects a request whose source node is not its own node.

The recipient follows the existing membership recipient's invocation-lifetime
shape, but owns this distinct read:

1. Capture the registered router callback, `delivery.isCurrent`, exact local
   service object and its exact `service.raft` operation port. Require the
   callback/registration, delivery node, service, port, group and replica to be
   current before any read.
2. Through the handler's existing `ControlPlaneSystemTableGateway`, read the
   authoritative SERVICES row and require the exact group, replica, node,
   ACTIVE status, positive created-at and nullable token generation supplied by
   the creator. The handler never treats `SystemTableCache` as this read.
3. Revalidate callback, delivery, service and port after the gateway await,
   then call only that captured port's `readStatus()` operation. Require
   `CORE_OK`, the exact group ID, replica identity and permanent peer ID, a
   nonempty lifecycle incarnation, current runtime generation, open
   participation gate, and a current configuration that contains the exact
   permanent peer identity. Route, role and cached status are not authority.
4. Revalidate callback, delivery, service and port after the port answer; read
   SERVICES through the gateway again; and revalidate the captured invocation
   once more. Return only when the second row is byte-equivalent in its exact
   group/replica/node/status/created-at/token generation.

The handler envelope is `COMPLETED` only to say the request was processed; its
exact `nativeStatus` union is `OBSERVED`, `UNAVAILABLE`, `INVALID` or
`CONFLICT`. `OBSERVED` contains a frozen exact-key projection of `CORE_OK`, node
ID, group ID, replica identity, peer ID, lifecycle incarnation, runtime
generation, term, applied index, membership generation index, configuration
key, gate state and the bounded current configuration. It does not expose the
service, port, lifecycle owner, store or raw status object. `DELIVERED` or outer
`COMPLETED` alone is never acceptance. No connection, `noHandler` and the 5 s
timeout are transport retained outcomes. A lost callback, replaced
service/port, or transient SERVICES/native owner returns semantic `UNAVAILABLE`.
Both paths produce a typed creation skip with a finite retry-after and reenter
through the existing rebalancer next-cycle path; no pre-insert local retry loop
or durable placeholder is added. Malformed own data or response is `INVALID`;
wrong group/replica/node/generation, non-`CORE_OK`, closed gate or contradictory
configuration is `CONFLICT`. Both stop that creation attempt loudly and write
no operation row.

After the response await, the creation owner re-reads authoritative SERVICES,
requires the same generation, and requires the response's node/group/replica,
lifecycle, peer and configuration facts before constructing the atomic insert.
A late response from a retired callback or prior service/port is inert. A
same-database ordinary restart after a completed response may preserve the
SERVICES and lifecycle identity while changing runtime generation; a retry
performs the whole interaction again and uses the new current result. A
retired/reborn lifecycle or SERVICES generation can never resume from the old
answer.

## C3.2 Planner activation is last in the creation slice

The message-group planner park is removed only in the same reviewed increment
that proves C3.1 through the real `createOperation` path. The normal planner may
submit exactly one count-neutral REPLACE for a seed-concentrated group. Existing
batching, per-group lane, target claim, storage admission, membership-publication
epoch, readiness, and operation-owner serialization remain in force.

The obsolete interim assertion “message groups always mint zero operations” is
retained as the original treatment and replaced by these distinct cases:

- a valid spread plan mints one complete membership-bearing REPLACE;
- a second planning turn observes the occupied lane and creates no duplicate;
- unsupported ADD/MOVE/direct or incomplete-source shapes are refused before a
  membership row is written;
- partitions retain their existing planner behavior;
- group retirement, unavailable authority, target-claim collision, storage
  pressure, and membership-publication fences keep their own typed reasons.

The permanent unsupported-refusal vocabulary remains available for direct or
unsupported requests; only the blanket planner park becomes obsolete.

## C3.3 One ordinary driver turn

The existing `OperationWorkflowOwner` operation lane is the sole driver. Its
normal execution/recovery turn re-reads the authoritative operation and invokes
one explicit membership entry appropriate to the phase. It never recursively
acquires its own lane.

The ordered phases are:

1. `learner_requested/intent_recorded`: claim the membership holder and issue
   the first ADD learner permit. Issuance is durable row authorization only.
2. `learner_proposal_in_flight/unknown`: deliver the exact permit to a hosted
   current group member. Delivery lifetime and native apply record the learner.
3. `learner_committed/unknown`: build the authentic join descriptor and send
   CREATE to the target handler under the same operation/generation.
4. target running as exact learner: consume the real target-owned catch-up
   observation and select/issue promotion; native apply plus exact historical
   PROMOTE fact records `voter_committed`.
5. voter committed: request named leadership handoff when the source is the
   leader; wait for fresh committed target leadership before source removal.
6. source removal in flight: record committed configuration absence through
   the current leader/quorum owner. That proof records the removal stamp and
   releases the membership lane. Separately, source-own applied absence permits
   stopping that source port.
7. exact-generation cleanup and reservation release proceed under their own
   terminal cleanup claim after source-own absence. They do not retain the
   membership lane. Ordinary REPLACE settlement remains with its existing owner
   and may occur before cleanup; it neither grants nor waits for cleanup.

Every turn performs at most one new native or physical effect. UNKNOWN,
UNAVAILABLE, stale holder, route loss, lost answer, and restart retain debt and
redrive the same action by exact authoritative read. They do not skip to the
next phase. A receipt already present is read back idempotently and causes no
duplicate native proposal.

## C3.4 CREATE and status handoff

CREATE begins only from the row's recorded learner origin and committed permit.
The workflow owner requests the descriptor from a current hosted leader, and the
target handler rechecks the exact row/CREATE basis before its durable admission.
The existing physical claim owns one worker. Authentic image install or retained
prefix replay opens the target with its fresh local lifecycle incarnation and
committed learner configuration.

The learner CREATE handler never emits `MESSAGE_GROUP_CREATE_ACTIVE`: its
`INITIATED` reply acknowledges only the queued admitted worker, and its
`RUNNING` join result proves caught-up learner state only. After the durable
voter stamp, an explicit target-activation turn through the same handler and
service-row owner emits `MESSAGE_GROUP_CREATE_ACTIVE` only after:

- the installed target opens from authentic group state;
- the operation row's immutable learner stamp/origin, the target's permanent
  reservation, and the CREATE admission all bind the same fresh identity,
  peer, origin index/term and exact learner permit;
- the queued current leader `READ_COMMITTED_MEMBERSHIP` learner-action read for
  PROMOTE returns `COMMITTED`, echoes that exact historical learner receipt,
  and returns the apply-owned immutable promotion fact matching the operation's
  voter stamp and promotion permit;
- that same current leader observation names the target peer as a voter and
  not a learner, names the answering peer itself as leader, and its applied,
  commit and membership-generation indexes have reached the promotion fact's
  exact index;
- the target's own captured current operation port reports `CORE_OK`, the same
  lifecycle/identity/peer, an open participation gate, the same current
  configuration key, and a voter configuration containing itself; and
- the service row owner publishes the same replica, group, node, address,
  lifecycle incarnation, and CREATE generation.

`INITIATED`, `IN_PROGRESS`, `NOT_CAUGHT_UP`, transport ACK, file creation,
snapshot swap, historical learner fact without current voter membership,
current learner-only state, voter membership without the exact promotion fact,
role-only state, or cache visibility cannot emit ACTIVE. The leader read and
target local read each retain their own captured handler/service/port lifetime
through every await; either changing makes the answer unavailable. Lost ACTIVE
is recovered from the authoritative target service/lifecycle and operation
row, not re-created as a new generation. FAILED follows the already accepted
narrow forward-recovery rules and cannot issue a fresh action from ordinary
failure alone.

## C3.5 Handoff, removal, absence, and cleanup

The source stays ACTIVE and its files/reservation stay present until target voter
receipt and named handoff are committed. Leadership observation is a current
native owner fact; a late services role row or cache role is insufficient.

REMOVE uses a permit bound to the same transition and exact source lifecycle.
Its result is recorded from authentic committed membership. The quorum absence
proof releases the group membership lane only when fresh configuration omits
the source. The source-own applied absence separately permits port stop. Either
missing proof retains the source artifacts. BACKSTOP may wake/diagnose but never
stop or delete.

Cleanup rechecks source `created_at`, create-attempt token, cleanup token, source
own absence, and successor generation immediately before deletion. It then uses
the existing cleanup tombstone/artifact and storage reservation owners. A stale
disk, replaced source generation, lost answer, or unreadable authority remains
held. Ordinary operation settlement neither grants cleanup nor waits on it.

## C3.6 Restart and serial replacement

Restart scans use the authoritative operation census and existing operation
lane. Every phase above has an idempotent readback and one permitted forward
action. Pruned ordinary history cannot erase membership debt or the permanent
peer mapping. A current row without its required authentic native/image witness
remains held rather than fabricated.

R2 cannot enter the group lane until R1's current leader/quorum proof records
source removal and releases the membership lane. R2 does not wait for source-own
absence, artifact cleanup, reservation release, or ordinary terminal settlement.
Those owners continue independently, and unavailable old source authority holds
only their effects. The chosen physical acceptance schedule may observe R1
cleanup before starting R2 to make disk provenance easy to inspect; that is a
harness ordering, never a membership admission predicate.

R2 chooses a second fresh target on a different non-seed node/storage root. The
final physical acceptance loses seed storage after the two serial replacements
and proves the surviving off-seed voters elect, commit and read a new
authoritative SQL mutation, deliver CDC, and rebuild routing/cache state. Three
or five logical voters on one machine/storage root do not satisfy this proof.

## C3.7 One driver, typed phase results and guaranteed reentry

The implementation extends
`operation-workflow-message-group-membership-recovery.js` from its present
learner-only scope into the phase dispatcher. This remains an
`OperationWorkflowOwner` segment: it uses the existing per-operation execution
lane, durable membership lane, `transitionRetryTimerByOperationId`, restart
census, periodic incomplete-operation sweep and replicated-row wake. It does
not add another scheduler or durable progress table. A replicated row wake is
a trigger only; every turn begins with the owner-required authoritative
operation read.

The existing constants remain the numeric owners:

- each router delivery uses `REPLICA_OPERATION_DISPATCH_TIMEOUT_MS` (5 s);
- a recoverable immediate refusal reenters through
  `TRANSITION_RETRY_DELAY_MS` (250 ms), at most one timer for the operation;
- a membership holder lasts `REPLICA_OPERATION_OWNER_LEASE_TTL_MS` (30 s) and
  is a scheduling fence, never evidence that an effect did or did not commit;
- learner catch-up spends one
  `MESSAGE_GROUP_LEARNER_JOIN_DEFAULT.CATCH_UP_TIMEOUT_MS` (30 s) window and
  returns `NOT_CAUGHT_UP`; it does not reset the operation or create another
  replica;
- the existing `REBALANCE_OPERATION_BUDGET_MS` (300 s) bounds the ordinary
  operation attempt. Spending it may settle ordinary status as FAILED, but an
  already authorized membership obligation stays UNKNOWN and continues
  through the accepted failed-forward rules. No ACK, cache event, timer or
  holder renewal resets the original ordinary budget.

Every message goes through `classifyTransportDeliveryOutcome`. A delivered
transport ACK means only that the handler returned its typed reply.
`deferRetry:true` with a finite `retryAfterMs`, delivery failure, no connection
and `noHandler` retain the phase and arm the one owner retry. A delivered
malformed reply is `INVALID` and stops that turn loudly while retaining debt.
A nonretryable exact conflict records the diagnostic and requires the existing
operator/terminal owner; it never becomes success. No handler may coexist with
processing success merely because the transport acknowledged the envelope.

| Durable phase | Canonical request and decision owner | Result consumed by the driver | Reentry, restart and late-answer fence |
| --- | --- | --- | --- |
| `learner_requested/intent_recorded` | Repository claims/renews the exact holder, then issues one ADD permit from a current hosted leader/native status. Repository CAS remains the only issuer. | `RECORDED` means permit durable, not proposed. `UNAVAILABLE`, `UNKNOWN`, `STALE_OWNER` and delivery deferral retain; `INVALID`/`CONFLICT` stop loudly. | Row mutation wake plus 250 ms timer; restart debt census. Late selection is inert unless identity, source lifecycle, holder generation/boot, current leader term/configuration and destination lifecycle still match at the repository CAS. |
| `learner_proposal_in_flight` | Existing membership recipient invokes the native transition with the exact permit; recorder reads the exact historical outcome. | Native `CORE_OK` is submission only. Recorder `RECORDED` advances to committed; `NONCOMMITTED` may issue only the accepted ordered successor; `UNKNOWN`/`UNAVAILABLE` retain. | Native membership event, replicated row wake, 250 ms timer and restart census. Recipient selection, operation-owner epoch and permit bytes are rechecked after router await; an old answer cannot replace a newer permit. |
| `learner_committed`, target absent | Exact learner fact builds one `CREATE_REPLICA` learner package; target admission owner and physical worker own materialization/install/open. | `INITIATED`/`IN_PROGRESS` are ACK-only. Retryable ERROR retains. A hard malformed/foreign conflict is loud and retains committed membership debt. | CREATE admission row/event, executor outcome, target SERVICES change, 250 ms timer and restart census. The physical admission owner recovers MATERIALIZED work; driver rereads operation/fact and exact target generation before every resend. A late old-generation reply is ignored. |
| `learner_committed`, target hosted learner | Target/native status read proves exact opened lifecycle and learner configuration; the leader acknowledgement supplies catch-up. | `RUNNING` is observation only and permits promotion selection. `NOT_CAUGHT_UP`, no leader, unavailable route or 30 s catch-up expiry retain. | Native progress/configuration event, target handler outcome, timer and restart census. Status must match the row identity, target lifecycle and current configuration after the await. |
| `promotion_proposal_in_flight` | Existing C2/F1/J1 selection, native proposal and voter recorder entries. | Exact voter `RECORDED` advances. `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED`, `UNKNOWN`, `UNAVAILABLE`, stale owner/configuration/term retain; ordered successor needs the accepted newer-term noncommitment proof. | Native membership event, row wake, timer and restart census. Exact permit bytes plus historical promotion fact fence all late replies and later drift/ABA. |
| `voter_committed`, target not ACTIVE | Explicit target activation reuses `MessageGroupServiceRowOwner`: register the already-open exact lifecycle STOPPED if absent with the same CREATE admission token, then consume the historical learner origin/admission together with a current leader PROMOTE read and captured target-local status before handler-bound activation. | ACTIVE requires exact SERVICES readback, immutable learner origin/permit, matching promotion fact/voter stamp, and current leader plus target-local configurations naming the peer as voter and not learner. ACK, cached ACTIVE, stale learner-only state, bare voter state or executor message retains. | Executor outcome, native membership and SERVICES CDC wakes, timer and restart census. Both captured handler/service/port lifetimes, operation/voter stamp, target lifecycle, CREATE generation and operation-owner epoch are repeated after awaits and at activation; old CREATE generations and stale pre-promotion reads cannot publish. |
| target voter ACTIVE, handoff owed | Existing `STEP_DOWN_REPLICA` transport is extended to the hosted message-group service and its operation port; accepted transfer is a request, not completion. Driver then reads current committed leader evidence. | Transfer `COMPLETED` requests redrive. Only fresh target leadership in the exact term/configuration advances. `NOT_APPLICABLE`, `NOT_SUPPORTED`, `REFUSED`, unavailable and stale role retain. | Leadership/native event, SERVICES role hint, timer and restart census. Cache role is diagnostic. The final native read rechecks target lifecycle, voter stamp, source lifecycle and row holder after every await. |
| source REMOVE in flight | Repository issues exact REMOVE permit; current target/leader native owner proposes and recorder reads applied configuration. | Submission ACK retains. Exact committed removal stamp plus leader/quorum configuration absence advances and releases only the membership lane. UNKNOWN/unavailable/stale keeps it. | Native configuration event, row wake, timer and restart census. Permit/transition/source lifecycle/current leader configuration fence late answers; a newer row phase makes them inert. |
| membership lane released, source-own absence owed | Source handler reads its own applied configuration under the recorded source lifecycle and stops the port only when that configuration omits itself. | Exact source-own absence authorizes stop. Unreachable/unreadable old source retains only source-local debt/artifacts; it cannot reacquire the group lane. | Source handler/native event and source startup recovery. No general operation timer gates R2 after quorum absence. A lifecycle mismatch refuses the old request. |
| source stopped, cleanup owed | Existing exact-generation SERVICES removal, cleanup tombstone and storage reservation owners execute independently. | Only exact row removal plus absent artifacts completes cleanup. BUSY/unreadable/stale generation retains marker and reservation under their current rules. | Cleanup owner retry/startup sweep. Token/lifecycle/source-own-absence are revalidated immediately before deletion. Ordinary terminal status and lane release do not authorize it. |

The phase dispatcher performs at most one remote/native/physical effect per
turn. Immediate failures can therefore produce at most four turns per second
for one operation; the single-flight operation lane and one durable group lane
bound concurrency, and a 5 s router attempt lowers that rate. Logs are emitted
on state/reason change and when an owned bound is spent, not on every retained
tick. Shutdown bumps the existing operation ownership epoch, joins lanes, and
cancels their timers; restart reconstructs them from the authoritative debt
census. A retained phase with no runnable target stays visible and retried; it
does not disappear through timer cancellation.

## C3.8 Effect-time revalidation and immutable inputs

Every public driver entry copies exact own data once before entering the lane,
using the existing strict-own-record pattern. Identity, claim, permit, stamps,
status replies and transport results use exact key sets and primitive values;
no getter, inherited key, boxed primitive, sparse array or caller mutation is
retained. The existing membership codec remains the sole canonical encoder.
Its only C3 shape revision is the lifecycle field and nullable-token rule in
C3.1; there is no second identity decoder.

After every await, and immediately before an effect, the same lane turn proves:

1. operation-owner shutdown epoch and exact operation ID are current;
2. authoritative row identity, phase, obligation, holder generation and exact
   permit/stamp basis still match;
3. source SERVICES created-at/token and native lifecycle incarnation match the
   recorded source claim whenever the source effect is involved;
4. target CREATE evidence/lifecycle and handler generation match whenever the
   target effect is involved;
5. the current native leader, term and configuration authorize that exact
   membership or handoff effect.

The pre-insert native-status interaction applies the same rule without an
operation row: its creator revalidates the planned source and authoritative
SERVICES generation, while its recipient revalidates the registered router
callback, delivery, exact service and exact operation port before and after
each gateway/port await. It returns evidence only; the repository insertion
owner alone decides and performs the atomic insert.

The check is repeated in the repository/native/physical semantic owner, not
accepted as a boolean from the driver. Multiple wakes join the operation lane;
they cannot create parallel snapshots, CREATE workers, native proposals,
handoffs or cleanup claims. A late successful response is only a reason to
reread the current owner; it never writes using its arrival order.

## C3.9 Self-moving formation authority map

Moving `mg-1` does not relocate the `replica_operations` or `services` tables.
Those rows remain in their existing replicated system-table partitions and are
read/written through `ControlPlaneSystemTableGateway` owner RPCs. The
`SystemTableCache` and CDC are disposable projections and wake sources. A cache
miss, stale row or unavailable CDC subscription can delay routing, but cannot
mint identity, authorize a phase or prove completion.

| Required fact during R1, R2 and seed loss | Sole source and degraded-window behavior |
| --- | --- |
| durable operation, lane, phase and receipts | `replica_operations` partition via the gateway's authoritative owner RPC. Existing operation-ledger formation and self-move interlock keep its own partition move serialized. If no leader is reachable, the driver retains debt; it does not consult cache as authority. |
| source/target service generation and node address | `services` partition via authoritative gateway. Cache may propose recipients. Exact operation identity also retains the already admitted source/target node and canonical address so rediscovery can attempt known hosts without declaring them current. A routed host must answer with current lifecycle/native evidence. |
| current `mg-1` membership, leader and applied absence | The surviving `mg-1` raft-rs replicas and their operation ports. During each serial move, two existing voters remain until the new voter and named handoff are proven. After source removal, any surviving hosted voter can answer; permanent peer reservations and retained images carry historical identities. |
| physical CREATE/open/cleanup | Target/source node CREATE admission, lifecycle row, install binding and cleanup tombstone. Their local startup recovery does not depend on cache readiness. Remote unavailability retains the corresponding local debt. |
| routing and SQL service | Current committed `mg-1` leader plus the existing authoritative system-table partitions. A leadership gap returns typed unavailability within the existing request budget. It does not trigger genesis or cache-owned authority. |
| CDC delivery and cache hydration | CDC source positions/obligations and `SystemTableCache` owners. Cache may be empty after seed loss and is rebuilt from authoritative partitions; completion requires the real CDC/cache proof and never feeds back as membership permission. |

The physical acceptance may remove seed storage only after it has independently
proved: R1 and R2 lane release; two distinct off-seed voter database paths;
current off-seed `mg-1` quorum/leader; authoritative off-seed access to the
operation and SERVICES partitions; and the existing formation-release barrier.
It then deletes/renames the seed storage, starts no seed fallback, commits and
reads a new SQL mutation through the off-seed leader, observes its CDC source
position/obligation delivery, clears and rehydrates a recipient cache, and
restarts one off-seed participant. A cache-only read, local direct SQL,
co-located replica, retained seed process, genesis path or skipped consensus
fails the witness.

No synchronous planner or client request waits for both replacements. Each RPC
keeps its existing 5 s bound, startup/formation callers keep their existing
30 s budget without per-chunk reset, and the asynchronous operation owns the
300 s ordinary budget. The test harness may have a larger outer timeout, but
compressed clocks must preserve 250 ms retry, 30 s lease/catch-up, 5 s
delivery and original 300 s ordering. A timeout produces a typed retained or
ordinary failed state; it does not prove absence.

## C3.10 Impact, classification and proof registration

The implementation must add one impact contract,
`message-group-fresh-replace-driver`, rather than widening component contracts
to imply orchestration. Its live coupled pairs are:

- operation creation/repository persistence with
  `test/rebalancer/message-group-membership-change-parked.test.js` and a new
  real creation-owner witness;
- operation creation with the new
  `READ_MESSAGE_GROUP_NATIVE_STATUS_FOR_REPLACE` handler/recipient and a real
  router witness covering current callback, authoritative SERVICES sandwich,
  exact operation-port status and late-answer retirement;
- workflow phase dispatcher with the message-group handler, native read,
  service-row owner and a phase/restart integration witness;
- authoritative gateway/operation-ledger formation with
  `test/integration/message-group-fresh-identity-replacement.integration.test.js`;
- source-own absence/cleanup with the exact cleanup and reservation tests.

It composes, without changing their decision ownership, the existing
`operation-ledger-self-move-interlock`, `formation-release-handoff`,
`sql-engine-system-table-read`, `message-group-learner-authorization-consumption`,
`message-group-learner-delivery-lifetime`,
`message-group-committed-learner-origin`,
`message-group-learner-outcome-recording`,
`message-group-registered-learner-read`,
`message-group-learner-create-admission`, `message-group-learner-join`,
`message-group-learner-successor-ordering`, `message-group-learner-promotion`,
`raft-rs-snapshot-staging-lifecycle`, `replace-owner-membership-observation`,
`replica-durable-generation-cleanup` and
`failed-create-target-authoritative-cleanup` contracts.

Primary/resource/subsystem manifests are generated from the final test bodies.
The current red seed-loss file's provisional `integration/ordinary/
transport-messaging` entries are not acceptance of that classification. Once
it boots multiple physical node/storage owners and removes seed storage it must
run under the generator-selected serialized physical/bootstrap or exclusive
lane, alongside its component ordinary witnesses; an override without the
actual body/resource evidence is refused. The final Quest gate runs static,
then exact changed ordinary/bootstrap/exclusive selections in the sealed order,
then the real two-REPLACE seed-loss proof.

Harness fixtures carry exact operation ID, transition identity, holder
generation/boot/expiry, source SERVICES created-at/token/native lifecycle,
target CREATE generation/lifecycle, permit sequence/stage/term/configuration,
learner/voter/removal indexes and terms, node/storage roots, CDC source
position and cache recipient generation. Required schedule witnesses include
pre-insert `noHandler`/timeout, callback retirement during each SERVICES/status
await, local service/port replacement, ordinary same-database source restart,
source lifecycle rebirth, ACK-before-worker, lost result after each durable
effect, delayed prior generation response, owner restart at every phase, target
restart after image install, source restart before own-absence cleanup,
operation history pruning, unavailable old source after lane release, and seed
loss with no locally hosted source. Direct callback fixtures supplement but
never replace real register/deliver and physical-file witnesses.

## Receipt and discriminator matrix

| Required receipt | C3 proof |
| --- | --- |
| fresh-identity-permanent-registry-and-membership-lane | real planner creates one atomic full row; target identity/peer never reused; second REPLACE waits |
| committed-learner-real-state-transfer-and-create-fence | native ADD learner receipt precedes one physical claim; authentic image/prefix opens target; forged/direct/terminal-first CREATE writes nothing |
| atomic-leader-proof-and-committed-promotion | existing F1/J1 owner proof plus driver invocation; stale term/config/progress and post-commit drift/ABA refuse |
| serial-replace-handoff-and-source-retention | target voter and named leadership precede source REMOVE; R2 waits only for R1 leader/quorum absence and membership-lane release |
| separated-membership-obligation-and-terminal-settlement | ordinary terminal fields may settle while UNKNOWN debt/lane remain; neither grants native or cleanup work |
| committed-and-source-own-absence-exact-cleanup | quorum absence independently releases the lane; source-own applied absence permits port stop and exact cleanup; neither proof substitutes for the other effect |
| lost-answer-restart-pruning-and-stale-disk-recovery | process loss before/after each phase, lost receipt/ACTIVE/REMOVE answers, pruning, successor generation, stale disk |
| distinct-offseed-seedloss-and-owner-censuses | two physical off-seed storage roots survive seed loss and prove SQL/CDC/cache; owner/import/direct-call censuses remain exact |

Required behavior-red mutations include:

1. remove atomic initial membership fields from insert;
2. derive source lifecycle from cache, omit create-attempt token, reuse the
   operation-bound membership recorder pre-insert, or accept native status from
   a retired callback/service/port;
3. reuse source identity or address as identity;
4. issue the first permit during creation;
5. dispatch CREATE before learner receipt;
6. emit ACTIVE on swap/open/transport ACK, on stale current-learner state after
   promotion, or without historical learner origin plus exact current
   promotion fact/voter configurations;
7. promote from role/cache or stale progress;
8. remove source before target voter or named handoff;
9. treat leader/quorum absence as source-own absence, or the inverse;
10. release lane from ordinary terminal settlement;
11. delete on stale generation or unreadable proof;
12. let R2 enter before R1 leader/quorum absence releases the membership lane,
    or make R2 wait on old-source cleanup after that release;
13. satisfy seed loss with co-located/logical-only replicas;
14. restore blanket planner park or bypass it with direct unsupported traffic;
15. refuse ordinary restart with unchanged SERVICES/lifecycle, or resume after
    lifecycle retirement, database replacement, or SERVICES rebirth.

## Evidence order

1. Preserve the current positive planner failure as treatment with exact source
   fingerprint. Do not rewrite it to accept the park.
2. Add real creation-owner tests proving the bounded hosted status interaction,
   authoritative SERVICES sandwich, one complete insert, visibility,
   collision, ordinary restart resume, and source-rebirth negatives before
   removing the park.
3. Add phase-by-phase driver/restart tests using actual explicit owner entries;
   fixture-written SENDING or manual phase changes are not driver proof.
4. Compose real handler/descriptor/image/open/status, promotion, handoff, REMOVE,
   two separately owned absence proofs, and independent cleanup/reservation
   release without making them ordinary settlement or lane gates.
5. Run owner/impact/primary/resource/subsystem generators. Physical seed-loss is
   classified through the canonical exclusive owner; no provisional ordinary
   assignment or serial local diagnostic substitutes.
6. Freeze component source for author-distinct review, then run uninterrupted
   static and exact ordinary/bootstrap/exclusive changed lanes in the Quest's
   gate order. The physical two-REPLACE seed-loss witness runs only after local,
   static, and component receipts are green and independently verified.

## C3.11 Normal retained-install recovery amendment

The immutable round-three subject is retained at
`evidence/design-c3-automatic-replace-driver-round3-ce95ab8e.md`, SHA-256
`ce95ab8eab139aac3296061d42701bad4bb3dd8a15a5b0d0f0a0850a8c794dec`.
This section supersedes only the recovery claims in C3.4, C3.7 and C3.9.

The immutable round-four subject is retained at
`evidence/design-c3-automatic-replace-driver-round4-1522cc0b.md`, SHA-256
`1522cc0b292f72ebe8a676b4db2ce3c5349b3bf3ca740d5ad99fafdf1207a063`.
The author-distinct round-four verdict and its join-owner supplement are
`review-freshmg-c3-design-round4-tx56.md`, SHA-256
`aecb0e54bbe1679e5b5e5d6e84d94c4f88846cb822e9171fa5c5d4bd2aaca3be`,
and `review-freshmg-c3-design-round4-tx56-supplement.md`, SHA-256
`db5aa0fbce20da4cfde8f58d1ab45afbb77b9dc91890e8b13ec3ed0fe49500ce`.
The correction below supersedes the round-four caller placement and HELD
semantics. The artifact decisions and exact recovery identity remain unchanged.

The immutable round-five subject is retained at
`evidence/design-c3-automatic-replace-driver-round5-e5d30b0b.md`, SHA-256
`e5d30b0b0de6bb49b6f28ab817c4ce67b3b3c8384716e060df3dfbd0392d6b26`.
The shared activation-owner dependency is
`solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md`,
SHA-256
`1459f41ae68e973f636453987167e55cb7ba617f54298073a7e40fc5fda80e6c`.
This round aligns C3 to that dependency's durable seed invocation and distinct
checkpoint ordering; it does not create a C3-owned startup interaction.

### Current blocking source fact

The present normal path cannot recover an interrupted learner install:

- `message-group-learner-join.js` is the only production-shaped caller of
  `requestSnapshotInstall`, while `recoverPendingSnapshotInstall` has no
  production caller;
- both seed and join startup construct `MessageGroupServiceHandler` without a
  `messageGroupLearnerJoinHost`, repository or boot incarnation, so the normal
  handler does not receive the learner capability or its CREATE owner fence;
- `targetGenerationPresent` refuses a database, marker or staging file before
  it asks the snapshot owner whether those artifacts belong to the same
  retained CREATE; and
- the only existing retained-admission startup scan is the partition handler's
  entity-filtered scan. It correctly excludes message-group rows and cannot be
  borrowed.

Consequently, a MATERIALIZED operation plus authentic STAGING, STAGED or
installed bytes is a retained obligation, not a running learner. The accepted
two-path marker correction preserves those bytes but does not provide normal
progress.

### One normal caller and one recovery path

`MessageGroupServiceHandlerSetup` still constructs and registers exactly one
handler for the process. It does not start retained recovery. Both startup
owners call the same handler-owned
`recoverRetainedMessageGroupLearnerCreates()` only after `ControlPlaneSetup`
has supplied the canonical `ReplicaOperationRepository` and the authoritative
current NODES row contains this boot incarnation:

- seed calls it inside the existing `CONTROL_PLANE_READY` checkpoint, after
  `registerSeedNodeWithControlPlane()` has durably published the current boot
  and before that checkpoint may complete; and
- join calls it after `MEMBERSHIP_WRITTEN` and message-group row activation,
  at the start of `READY_LEASE_ASSIGNED`, before any READY lease or READY
  signal.

The handler receives the same learner-join host used by ordinary CREATE, that
canonical repository, and the authoritative boot incarnation through this
post-publication interaction. No second handler, repository, startup root or
learner worker is constructed. Recovery reads through
`ControlPlaneSystemTableGateway`; cache hydration, route hints and locally
minted boot values are not authority. `ReplicaCreateAdmissionOwner` still
rereads the current NODES row before and after takeover.

The C3 caller consumes the activation owner's single shared startup hold
contract; it does not define a competing retry mechanism. An awaited recovery
consumer may throw the typed control-plane error `STARTUP_CHECKPOINT_HELD`
with captured own fields `{code, workflowKind, checkpoint, obligationKind,
obligationId, nodeId, bootIncarnation, deadlineAtMs, retryAfterMs,
missingFact}`. The value carries no authority and a fulfilled return can never
mean HELD. `obligationKind` is the retained message-group CREATE/install debt,
`obligationId` is its durable operation ID, and `missingFact` names the exact
authority, transport, pressure or `SQLITE_BUSY`/`SQLITE_LOCKED` fact that
prevented this attempt. Malformed, foreign and conflicting artifacts keep the
existing hard conflict outcomes and do not enter this retry class.

The `StartupPipelineRunner` records the thrown retryable failure and never
advances the checkpoint. Its `shouldRerun` decision is derived from the
authoritative retained CREATE row plus artifact census, never a volatile held
bit. Each reentry uses the same registered handler and admission owner, rereads
the current boot/repository/operation, and revalidates the exact operation,
target, admission identity and physical generation after every await.

Join consumes the error through the existing `NodeJoiningService.join()` outer
loop and `isRetryableControlPlaneError`. The retry decision occurs before
destructive cleanup; RESUME preserves the registered handler, repository and
current-boot resources. Its absolute bound remains the once-captured
`join.startTime + retryableJoinResumePolicy.maxElapsedMs`; neither a retry,
transport ACK nor partial artifact progress resets it. The existing injected
sleep consumes the bounded `retryAfterMs` and reenters the same unsatisfied
checkpoint. Policy disablement, abort, attempt exhaustion or elapsed
exhaustion stops loudly with the complete held identity and leaves the durable
CREATE, membership debt, image, marker, binding and staging bytes nonterminal
for the next boot.

Seed uses the same activation-owned checkpoint error and error shape in its
existing `BootstrapService.bootstrap()` owner. Before the first held-capable
`REGISTRATION_READY` entry, that owner persists one `startupInvocation` with
`seedStartupHoldStartedAtMs` and `deadlineAtMs =
seedStartupHoldStartedAtMs + leadershipWaitTimeoutMs` from the existing
validated bootstrap configuration (default 30 s). Participant activation may
consume this budget at `REGISTRATION_READY` before registration writes and
does not require a NODES row. C3 consumes the remaining budget later, after
`registerSeedNodeWithControlPlane()` publishes the current NODES boot inside
`CONTROL_PLANE_READY`; it never captures a new C3 start or deadline.

The activation change replaces the current unconditional-terminal handling
only for this exact error. The owner waits through its existing injected timing
seam and reruns the same unadvanced checkpoint with the resources valid for
that checkpoint preserved. A retry, ACK or transition from participant
activation to C3 never rewrites the durable invocation or resets its deadline.
It neither creates a join scheduler nor raises that existing budget. Expiry or
shutdown fails seed startup loudly and permits ordinary process cleanup while
preserving the durable startup session as nonterminal and retaining all CREATE,
membership and physical artifact debt for a later boot.

Shutdown/abort retires the current startup invocation before cleanup. A late
transport reply, sleep completion or recovery promise must revalidate the
invocation, current boot and physical claim and therefore cannot advance the
checkpoint, open the database or clean an artifact. Authority publication,
gateway recovery and lock/pressure release are observed on the next bounded
owner retry; the durable row and artifact census are the cross-restart wake.
There is no second timer, ledger, worker registry or READY bypass.

This startup error, seed retry branch and identity/deadline capture are one
shared activation-owner change. C3 implementation must consume its reviewed
exported interaction and impact registration; it must not copy the classifier,
construct a lookalike error, or add another bootstrap retry loop. Until that
activation contract is independently accepted and composed, retained CREATE
recovery remains design-only and C3 source stays held.

The handler obtains its existing `ReplicaCreateAdmissionOwner`, calls
`snapshotTargetAdmissions(SERVICE_TYPE.MESSAGE_GROUP)`, and processes each row
under `owner.runExclusive(operation_id)`. Inside that lane it:

1. calls `takeoverRetained` for the new boot and rereads the authoritative
   operation;
2. requires the same operation ID, target replica/node, admission token,
   attempt token/sequence, replica-created-at, workflow-updated-at,
   `MATERIALIZED` state, recorded learner origin/permit and
   `learner_committed/unknown` phase basis that ordinary CREATE consumed;
3. claims the sole physical worker from that exact taken-over evidence; and
4. invokes the same learner-join owner used by ordinary CREATE in a typed
   resume mode. It never calls `resolvePendingSnapshotInstall` raw and never
   opens a database before the CREATE claim is current.

The owner then orders artifacts as follows:

| Exact state | Required owner action |
| --- | --- |
| No target database, marker, staging or sidecar | Resume ordinary descriptor acquisition and `requestSnapshotInstall` under the retained claim and unchanged operation basis. |
| Authentic STAGING | Call `recoverPendingSnapshotInstall` under `commitSnapshotInstall`; validate current CREATE authority, checkpoint/marker identity, peer reservation, learner origin and full image boundary before reconstruct/swap. |
| Authentic STAGED | Call the same recovery operation; revalidate CREATE at the actual swap and preserve the exact staged image on a hold or conflict. |
| Authentic INSTALLED marker | The same recovery operation validates the installed database and binding, clears only that marker, and returns immutable installed-image evidence. |
| Installed database and binding after the marker was durably cleared but before open | The snapshot-install owner performs a read-only full installed-image validation against the current CREATE authority and returns the same installed-image evidence. Absence, mismatch or unreadability is never treated as installed. |
| Foreign, malformed or successor artifacts | Return typed `MESSAGE_GROUP_CREATE_RECOVERY_CONFLICT`; retain every artifact and perform no open, cleanup or new install. |

`targetGenerationPresent` therefore stops being a blanket refusal. It becomes
an artifact census supplied to this owner decision: only exact absence permits
a new install; exact authentic retained state resumes; anything else holds or
conflicts. Snapshot-install remains the sole binding/image decision owner and
returns an immutable projection only. The handler gains no lifecycle owner,
store, raw runtime or filesystem authority.

After an `INSTALLED` result, the handler rereads the operation, revalidates the
physical claim and exact MATERIALIZED basis, and opens the learner from the
validated installed database. Registration, `initialize`, own committed
learner/`CORE_OK` observation, adoption into the node's canonical
`messageGroupServices` map, and RUNNING reporting occur in that order. Any
awaited failure releases only the volatile claim and retains durable CREATE and
membership debt. ACTIVE remains the later C3.4 voter/promotion decision; an
installed or RUNNING learner does not publish ACTIVE.

### Required recovery witnesses

Implementation approval requires two production-path witnesses in addition to
the existing component proofs:

1. **Normal startup retry.** Drive ordinary dispatched CREATE through the real
   handler and admission owner, interrupt the authentic install separately at
   STAGING, STAGED and post-rename INSTALLED, replace the boot, and enter through
   the real seed/join startup caller. The new boot must take over the same
   durable operation/attempt, recover without a manual test call, open one
   learner, report `CORE_OK`, and preserve exact origin, PROMOTE-capable image,
   reservation and applied-boundary bytes. The paired seed and join schedules
   must observe `STARTUP_CHECKPOINT_HELD`, prove the durable checkpoint does not
   advance, release the named missing fact, and show the existing owner reruns
   that same checkpoint within the original absolute deadline. ACK-only and a
   late response from a retired boot cannot release the hold. Shutdown and
   deadline exhaustion must stop loudly, fence the late promise and retain the
   exact operation, session, marker, staging/database and membership debt for a
   later boot. Foreign authority, unavailable gateway and corrupted retained
   image are paired holds/conflicts.
2. **Cleanup/successor interleaving.** Pause old-generation cleanup after its
   initial artifact census but before deletion; admit and materialize the
   successor CREATE through the normal owner; then release cleanup. Cleanup
   must revalidate immediately before every delete, leave the successor
   database/marker/staging/reservation intact, and retire only the old
   tombstone. A second schedule pauses successor install first and proves old
   cleanup defers rather than deleting its artifacts. The current sequential
   cleanup/successor test and the hand-built probe do not satisfy this witness.

These witnesses must retain exact source fingerprints, use real registration
and dispatch, and classify interruption hooks only as schedule controls. They
do not make the hooks or fixtures an authority. They must also retain both
absence proofs: leader/quorum committed source absence alone releases the
membership lane, while source-own applied absence separately permits port stop.
Cleanup and reservation release remain after source-own absence and can never
hold or reacquire the released membership lane.

## C3.12 Exact startup storage-path correction

The immutable round-six subject is retained at
`evidence/design-c3-automatic-replace-driver-round6-d008c1b0.md`, SHA-256
`d008c1b0fdd8713e0e23c825212ee255ceb1e11ed7539b1956fcbceffed8b659`.
The corrected shared activation dependency is
`solve/quests/replicated-transaction-decision-and-apply/design-participant-release-activation-authority-2026-10-11.md`,
SHA-256
`ed489861e905f1cbdc982d02072679c2709874f0370b881984b0a1f50ebbdc3c`.
This section supersedes only C3.11's implication that a retained FreshMG marker
can fail the seed system-partition initializer. Its operation, authority,
checkpoint, deadline, HOLD and artifact decisions remain unchanged.

The current paths are distinct. `SeedPartitionsPhase` initializes only the
hard-coded initial system-partition replica identities, and their
`PartitionService.initialize` calls own the existing generic
`resolvePendingSnapshotInstall` boundary. `SeedMessageGroupsPhase` separately
constructs the founder `mg-1`. Neither path opens an ordinary FreshMG target
learner. General application-partition snapshot provenance and any founder or
initial-system-partition conflict remain fail-closed under their existing
owners; C3 supplies no defer, cleanup or recovery authority for them.

The reachable FreshMG interruption is inside
`message-group-learner-join.js`. `existingTargetArtifacts` currently refuses an
existing target database, install marker or staging directory before
`installLearnerImage`; exact absence alone reaches `requestSnapshotInstall`.
Only an `INSTALLED` result reaches `openLearner` and then
`MessageGroupService.initialize`, whose consensus port opens the message-group
database directly and has no pending-snapshot resolver. C3 recovery therefore
replaces that exact retained-artifact refusal under a current durable CREATE;
it does not modify or call around `PartitionService.initialize`.

The canonical `replica_operations` row enumerates every retained target. After
seed publishes its current NODES boot inside `CONTROL_PLANE_READY`, or join
completes `MEMBERSHIP_WRITTEN`, the single composed
`MessageGroupServiceHandler` invokes
`recoverRetainedMessageGroupLearnerCreates()`. The method snapshots exact
outstanding message-group admissions, derives database and checkpoint paths
from each operation's target identity, and enters
`ReplicaCreateAdmissionOwner.runExclusive(operationId)`. It never walks storage
to invent an operation or accepts a marker as identity.

Only after current-boot takeover, exact operation/attempt/learner-origin/
physical-generation reread and the sole physical worker claim may the existing
artifact decision table in C3.11 run. Authentic retained bytes route to
`recoverPendingSnapshotInstall` under `commitSnapshotInstall`; exact absence
resumes `requestSnapshotInstall`; foreign or ambiguous bytes remain local
conflict. The learner service is constructed, registered and initialized only
after authenticated installed-image evidence. Thus founder/system partitions
and closed-admission discovery progress before this recovery, while the target
learner remains unopened and unroutable.

The production witness enters through `startLagrangeRuntime` and first creates
the interrupted target through the real ordinary learner handler. Separate
STAGING, STAGED and post-rename INSTALLED restarts must reach the handler method
without a direct test call, retain the same operation/attempt, and open one
learner. A paired initial system-partition conflict remains fail-closed, proving
C3 did not weaken the generic partition boundary. Both seed and join continue
to consume the one shared startup invocation and original deadline described in
C3.11; this correction adds no scan, timer, deferred registry or startup owner.

## C3.13 Operation-local HOLD and healthy node readiness

The immutable round-seven subject is retained at
`evidence/design-c3-automatic-replace-driver-round7-f3e86a9e.md`, SHA-256
`f3e86a9ea608157cebf6a374dba2079e3de6de95ba097b95676620449c9827aa`.
This section supersedes C3.11's use of `STARTUP_CHECKPOINT_HELD` for an
ordinary retained learner. The shared activation dependency above remains the
sole startup-checkpoint HOLD owner.

Seed and join make one immediate bounded call to
`recoverRetainedMessageGroupLearnerCreates()` at the positions stated in C3.12.
Each target returns `RECOVERED`, `HELD` or the existing typed local conflict.
`RECOVERED` opens exactly that learner. `HELD`/conflict retains the operation,
claim basis and every artifact, leaves the target absent and unroutable, and
registers its operation ID with the existing background OperationWorkflowOwner
recovery path. It does not throw the activation-owned checkpoint error, advance
the target workflow, publish target ACTIVE, or withhold unrelated node READY.

This rule is limited to an ordinary durable learner CREATE. Founder `mg-1`, a
join bootstrap founder and hard-coded initial system partitions remain their
existing required startup services; their conflicts keep their existing local
startup result. Participant activation still precedes registration writes and
may hold the whole checkpoint because it gates all mutation admission. C3 does
not become a second whole-node readiness dependency.

The background reentry uses the same canonical operation/repository owner,
current boot takeover, physical claim, artifact decision table and original
CREATE deadline. Repository/NODES publication and the existing recovery timer
are its wakes; ACK or node readiness is never progress. A healthy-start witness
retains one ordinary target at STAGING, proves the founder/control services and
node reach READY while that target remains unroutable, releases the named fact,
and proves the same operation opens one learner without another CREATE or user
action. The paired required-founder conflict still prevents that required
service from being called healthy.

## Non-claims

This note does not approve current F1/image source, lifecycle staging source,
C17 CDC implementation, TX1 composition, whole-corpus status, five-node
execution, merge, publication, or Quest landing. It defines C3 implementation
order under the sealed Quest and accepted component contracts.
