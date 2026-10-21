---
audience: development
documentClass: current
---

# Original handoff: activation span and native callback correction

Date: 2026-10-21. Product input is
`393f411ca09449898465cc3cb7320c03fba2aba8`; evidence HEAD is
`e69db481f37ab5633d64de7b6e7345426d9286b3`.
This adds the two finite corrections requested by the
[complete independent review](independent-complete-pre-source-review-2026-10-21.md).
It preserves all earlier proposal bytes, the ACTIVE requirement, the complete
intact ESTABLISHED/all-UNUSED positive extent, and the actual public witness.
No source, test, seal, receipt, timeout or baseline changes accompany it.

## R1: one existing activation claim through final handoff

The current partition row owner leaves the lifecycle lane before its canonical
leader update (`src/partition/partition-service-row-owner.js:352`); that update
guards only partition ID (`:259`). Its return is insufficient for the proposed
original handoff. The correction uses the existing ReplicaStateMachine lane and
activation-effect section, plus the existing exact-runtime lifecycle retirement
barrier. It adds no second mutex or current-name owner lookup.

The original invocation is one narrowly named operation on the existing
registered-activation owner. Its order is:

1. Enter `runSerializedReplicaMutation` for the captured replica once. Resolve
   its exact reserved SERVICES source through the existing row owner and the
   admitted read route. Resolve the exact declared PARTITIONS foundation and
   current leadership tenure when this member must publish the leader.
2. In the same synchronous step as the final exact service/handler/lifetime
   checks, acquire the exact native runtime's existing lifecycle `execute`
   participation claim and open `runActivationEffectSection`. The lifecycle
   owner resolves its already registered runtime identity internally; it does
   not expose a raw owner/core or retarget by logical name. Admission refusal,
   pending retirement, changed generation, closed original attempt or absent
   exact handler prevents the effect.
3. Reuse the registered-activation owner's source matching, generation CAS,
   uncertain-answer readback and local lifecycle installation **inside that
   same lane and effect section**. Factor its existing in-lane implementation;
   do not call the public lane-acquiring activation method from inside the lane.
   Ordinary callers retain their existing wrapper and semantics.
4. For the current leader member, perform the existing row owner's canonical
   leader publication with a predicate bound to the authoritative foundation's
   partition/table identity, original created_at, partition version, state and
   observed update version. Never use a partition-ID-only predicate here.
   Recheck the captured service, original admission and leadership-tenure object
   immediately before submission and after awaits. The immutable tenure object
   from `src/raft/replica-leadership-state.js:29` binds role and term; a numeric
   term guessed from cache cannot substitute for it. The update changes only
   leader_node_id and its owned update stamp, never foundation identity or
   transition state. Exact authoritative readback must confirm the actual
   foundation and leader publication; zero rows, different generation, changed
   tenure or unavailable readback remains unresolved.
5. Still inside the same section and claim, verify the exact ACTIVE birth and
   required leader acknowledgment, then synchronously commit this member's
   original SUBMITTED→TRANSFERRED fact through its lifecycle storage owner.
   Followers do not publish a competing leader. Final operation completion
   additionally verifies all declared ACTIVE members and each partition's
   current exact declared leader publication. A partially transferred cohort is
   not a complete operation and remains the already named cold-mid-handoff HOLD.
6. Release the activation section, native participation claim and node lane
   only after this sequence settles. A different generation cannot use them.

The node lane serializes lifecycle replacement/transition for that replica;
the exact-runtime active-count barrier prevents durable native retirement
from committing through an active claim. That barrier remains an active-count
barrier, not a mutex, so real native protocol/SQL progress can continue. A
retirement request closes native admission immediately; subsequent handoff
checks then refuse and release their claim so retirement can finish. No nested
lane acquisition or waiting for all unrelated lifecycle work is allowed.

Shutdown is part of this interaction. The current partition shutdown closes
consensus before waiting on handler retirement
(`src/partition/partition-service-lifecycle-methods.js:184`); relying only on its
later handler wait is insufficient. For an admitted original handoff, shutdown
first revokes the live original attempt synchronously, then joins only the
existing active activation-effect section before closing its exact consensus
resources. Top-level seed cleanup performs that bounded join before releasing
dependencies used by the section. It must not join queued unrelated lifecycle
writes. Handler retirement continues through the existing exact handler API.

An accepted SQL effect may commit after its answer is lost or shutdown begins.
Revocation forbids subsequent submissions and TRANSFERRED; it does not cancel
or undo an accepted effect. The existing write/row owner settles or records its
unknown result within the unchanged operation budget. Joining that result is
not proof native work was cancelled. Preserve the submitted right and exact
resource debt; close only through the existing physical owner, retaining failed
handles and errors. Do not clear a right or infer absence because the read
context has been revoked. No public success is returned in that case.

Required focused controls hold the actual ACTIVE answer or leader publication
readback, request exact handler retirement/native retirement/shutdown, and prove
the ordering above. Replacement, term change and a newer foundation between
reads must refuse further publication/TRANSFERRED. A lost real leader update
must resolve only by exact readback. Ordinary activation and cleanup cases
remain unchanged controls, including absence of an unrelated-lane deadlock.

## R2: classify native replay and fence autonomous effects at their owners

Native leader events are not passive. Shared leadership application queues
role and leader updates before the later activation gate
(`src/raft/replica-leadership-state.js:62`). Partition activation then queues
leader publication, considers rebalancing and schedules split/merge resumers
(`src/partition/partition-service-leader-activation-methods.js:90`). Both MG and
partition mutation-helper terminal submissions and retries therefore consume
the same original-operation mode; gating only the leader callback is inadequate.

While original handoff remains nonserving, keep actual native role/tenure changes,
committed application, exact-cohort events and participant release/recovery.
Queue observations may remain volatile hints. Ordinary asynchronous role/leader
helpers do not submit metadata effects in this extent. The existing original
row/activation owners alone publish the reserved SERVICES generation and exact
foundation leader under R1. Their proofs cannot be replaced by a helper's
diagnostic success. On a successful fresh ordinary startup, the normal owner
reasserts current facts after the existing later handoff; retained recovery
instead cleans up and never opens that continuation. Abort/shutdown prevents
any queued callback from acquiring a new effect, including one scheduled before
the mode changed. Existing retry/cadence semantics outside this extent remain.

The bounded composition supplies no rebalanceCoordinator, existing rebalancer
or leadership sink and never constructs ControlPlaneSetup. The current
`buildRebalancerDependencyBundle` refuses a missing coordinator
(`src/partition/partition-service-rebalancer-methods.js:25`), but that alone
does not protect an already installed rebalancer or sink. The original-mode
consumer at the construction/rebind/sink boundary refuses such unexpected
ordinary writer acquisition. This is an explicit owner outcome, not merely
an assertion that an empty cache or false readiness happens to stop it.

Cold inspection reads every required TABLES/PARTITIONS member through the
existing readonly lifecycle/storage inspection before native opening. A
positive transition state/metadata/generation, nonoriginal foundation, retired
source or other contrary obligation is a typed original-recovery HOLD, with the
existing split/merge/workflow owner retaining the obligation. Missing/unreadable
required observations are unavailable. These local reads can veto the original
extent; they never confer current SERVICES or serving authority.

Pending native application is inspected, not discarded or required to be empty.
Use the already available DDL-free
`RaftRsDurableStore.readDurableRecordIn(db, groupId)` in
`src/raft/raft-rs-durable-store.js:586`. Its owner returns exact decimal
hardState.commit, appliedIndex and ordered entries. Compare those exact positions
without lossy Number conversion. Keep the applied prefix, committed-but-unapplied
suffix and uncommitted suffix distinct. There is **no committed==applied
prerequisite** and no new replay engine.

The existing application/command owners classify retained payloads against the
same canonical original operation producers and immutable allocation identities:

- Empty NORMAL entries remain the native owner's no-op. Configuration entries
  remain the native membership owner’s work and must match the exact declared
  cohort and its valid opening history; no fabricated genesis or imported grant.
- Payload NORMAL entries use the existing strict proposal codec. Actual
  PARTICIPANT_GENERATION_ORIGIN is ENABLE's command: the participant byte/apply
  owner validates its pinned form, target partition and exact admitted native
  generation. Legitimate pending original ENABLE is replayed by that owner.
- SQL/application commands are not permitted merely because their type is QUERY
  or WRITE. Match the canonical original registration/publication producer's
  statement, parameters, immutable row identity and allowed effect against the
  declaration and its durable right state. A SERVICES/CONFIG send with UNUSED
  would contradict consume-before-send; original MESSAGE_GROUPS or foundation
  prefix work can legitimately remain pending with all those rights UNUSED.
- MG CDC/BATCH replay remains the existing committed-cache application owner's
  work. Classify its rows against those same allowed original effects; retain
  exact recorded delivery/ack obligations through their existing owners. An
  unrelated message, mutation, transition, transaction or undecodable payload
  is not implicitly admitted by its recognized command type.

The classifier is a readonly consumer of existing native bytes and the same
original effect definitions, not a second SQL policy, mutation planner or
ledger. Unknown or contrary payloads produce named HOLD before opening and
preserve bytes/obligations. An uncommitted suffix is never called committed or
truncated to obtain admission. A valid pending original command is restored and
applied through the existing native transaction, with its existing apply/commit
atomicity, rather than applied by the inspector. The native positive must
include actual pending legitimate original work, not only an already-applied
record. The cold public positive's sealed scope is unchanged.

MG committed CDC can populate TABLES even when its subscription is absent
(`src/message-group/message-group-service-raft-timing.js:35`). The split/merge
resumer's cache scan is consequently neither a pre-native durable proof nor an
effect permit. The existing resumer and source-replication start/ack sinks
consume the original-mode exclusion before starting or resuming workers,
sending retiring-source completion acknowledgments or creating a mirror handle.
Check again after scheduling/awaits. Unexpected transition work exposed during
restoration records a typed remaining obligation on the existing original
attempt, revokes further handoff effects and prevents final TRANSFERRED/complete
publication; it does not delete, acknowledge, retire or forget the transition.
If admission is already revoked, retain/report that same debt through cleanup
without attempting new work. Ordinary current-authority recovery remains its
owner's later obligation, outside this original-only unit.

The leader determinism self-check remains the existing connection-local
transaction-admission owner action
(`src/partition/partition-participant-transaction-self-check.js:68`), including
its failed-BEGIN behavior. It is not an ordinary rebalance/transition worker and
is not suppressed. Real consensus and participant progress must stay engaged.

Required additional controls: real pending original ENABLE/foundation replay
continues; genuine contradictory TABLES transition or pending nonoriginal payload
refuses before native entry; actual MG replay repopulates a transition view yet
no resumer/start/retiring-source ACK acts; queued callbacks run after revocation
and retain the owned HOLD; ordinary mode still resumes its existing work.
No generic failed setup or absence of a worker counts as these negatives.

## Finite work accounting

The unchanged catalog declares 46 system-table partitions, 138 partition
replicas and three MG replicas: 141 exact native resources. The original
registration pass has 141 SERVICES births and one reserved cluster-ID birth;
those 142 rights allow at most one submission each. The foundation is one group,
46 TABLES rows and 46 PARTITIONS rows. Only two boot-owned meta definitions and
their two endpoints are in this extent; any current-boot membership/endpoint
effects retain their existing owner counts. ACTIVE work is bounded by 141
members and at most one current leader publication per declared partition in a
first pass. Implementation/witness accounting must record each logical owner
read/birth/CAS and actual delivery attempt, including extra exact readback after
uncertainty; logical calls are not the same as internal transport retries.
Use the existing absolute request budgets and retry cadences, including the
actual issued public release deadline. No deadline/count ratchet is increased.

This correction requests independent review of R1/R2 only. Native implementation,
complete source review, real operation and semantic-negative proof, applicable
gates, Quest landing and public serving remain unproved.
