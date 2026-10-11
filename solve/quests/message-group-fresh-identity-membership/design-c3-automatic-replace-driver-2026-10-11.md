# C3 automatic fresh-identity REPLACE driver

Date: 2026-10-11  
Author: `subagent:freshmg_implementation_56` (GPT-5.6-sol, high)  
Status: source-bound implementation plan; existing C0/Quest decisions only  
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
| `src/raft/snapshot-install.js` | `1412fe0c5e66afb51b17f9911e201a9b45ec781175016e7f81ce76bde73500c1` |
| `test/rebalancer/message-group-membership-change-parked.test.js` | `e7d3f578092dbbdb4c2e59ef55e215a0f2da42d93eb85bcd25fd49fd01cafeeb` |

## C3.1 Operation creation owns the initial record

Only a planned message-group `REPLACE` may construct initial membership intent.
ADD, MOVE, REMOVE, partitions, malformed topology, identity-preserving target,
and direct repository callers retain their existing behavior or refuse.

Before the insert, operation creation obtains one authoritative source SERVICES
row through the existing entity/service read owner. The row must identify the
planned `sourceReplicaId` on `sourceNodeId`, be ACTIVE, name the same group, and
carry positive durable `created_at` and nonempty create-attempt token. Cache rows
may select a route but cannot become the lifecycle claim. An unavailable or
contradictory authoritative source prevents minting; it cannot produce an
operation with null membership fields.

The owner then constructs one canonical identity using the existing codec:

- operation, group, source replica/node/incarnation fields from the exact plan
  and authoritative SERVICES row;
- the already allocated fresh target replica ID and its derived raft peer ID;
- target node and canonical target address from the existing placement/address
  owner;
- a deterministic transition identity bound to the operation and both replica
  generations;
- `messageGroupMembershipLaneKey(groupId)`.

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

The target handler emits `MESSAGE_GROUP_CREATE_ACTIVE` only after:

- the installed target opens from authentic group state;
- its own committed membership names its exact fresh identity as learner;
- its applied index reaches the installed boundary;
- the leader's exact acknowledgement names the same target/configuration;
- the service row owner publishes the same replica, group, node, address,
  lifecycle incarnation, and CREATE generation.

`NOT_CAUGHT_UP`, transport ACK, file creation, snapshot swap, role-only learner,
or cache visibility cannot emit ACTIVE. Lost ACTIVE is recovered from the
authoritative target service/lifecycle and operation row, not re-created as a
new generation. FAILED follows the already accepted narrow forward-recovery
rules and cannot issue a fresh action from ordinary failure alone.

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
2. derive source lifecycle from cache or omit create-attempt token;
3. reuse source identity or address as identity;
4. issue the first permit during creation;
5. dispatch CREATE before learner receipt;
6. emit ACTIVE on swap/open/transport ACK without exact learner observation;
7. promote from role/cache or stale progress;
8. remove source before target voter or named handoff;
9. treat leader/quorum absence as source-own absence, or the inverse;
10. release lane from ordinary terminal settlement;
11. delete on stale generation or unreadable proof;
12. let R2 enter before R1 leader/quorum absence releases the membership lane,
    or make R2 wait on old-source cleanup after that release;
13. satisfy seed loss with co-located/logical-only replicas;
14. restore blanket planner park or bypass it with direct unsupported traffic.

## Evidence order

1. Preserve the current positive planner failure as treatment with exact source
   fingerprint. Do not rewrite it to accept the park.
2. Add real creation-owner tests proving one complete insert, visibility,
   collision, and source-lifecycle negatives before removing the park.
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

## Non-claims

This note does not approve current F1/image source, lifecycle staging source,
C17 CDC implementation, TX1 composition, whole-corpus status, five-node
execution, merge, publication, or Quest landing. It defines C3 implementation
order under the sealed Quest and accepted component contracts.
