# Binding architectural direction: replica-membership model reduction (owner, 2026-09-20)

**Status: binding** for the formation / replica-membership work. It supersedes,
where they differ, the step list and the `PartitionTransitionIdentity`
candidate in
[owner-decision-transition-identity-2026-09-20.md](owner-decision-transition-identity-2026-09-20.md):
no separate transition abstraction is presumed any longer. The owner's text
follows, unabridged in substance.

The objective is now explicitly **complexity reduction**.

Do not continue adding authority, transition, ceiling, epoch, producer, or
audit abstractions merely because the current implementation exposes another
edge case. The default rule is:

> Before adding a new durable concept, try to represent the requirement using
> the existing partition policy, committed Raft membership, placement
> observations, and durable replica-operation machinery.

The intended minimal model is:

`PartitionPolicy` + `PlacementObservations` + `CommittedMembership` +
`zero-or-one unresolved ReplicaOperation per partition`

A separate `MembershipTransition` subsystem is **not authorized** unless this
simpler model is falsified by a real Lagrange requirement. A separate permanent
authorization object is likewise not the target. If possible, the durable
replica operation itself carries the control-plane authority for the membership
change.

## 0. What this direction states

- The goal is to reduce concepts, not merely reorganize them.
- The existing audit is forensic evidence, not the future semantic model.
- No separate MembershipTransition abstraction is presumed.
- No membership ceiling is presumed.
- No separate ADD/REPLACE authority kinds are presumed.
- There should be one owner of partition replica-membership changes.
- Placement observations are inputs and never membership authority.
- Committed consensus membership remains distinct from planner intent.
- Implementation must first attempt to falsify the minimal model.

The verified evidence from the stopped overflow-budget work is preserved as
historical evidence
([verified evidence packet](evidence/overflow-budget-audit-verified-packet-2026-09-20/README.md)).
Its 27-row matrix is not structurally frozen and nobody claims it is.

## 1. A read-only model-reduction quest comes first

`replica-membership-model-reduction`. Its question:

> Can every legitimate membership-changing behavior Lagrange currently requires
> be represented by one replica-placement owner producing at most one
> unresolved durable ReplicaOperation per partition, fenced by committed
> membership generation?

No new subsystem is designed in this quest. It maps current concepts into
exactly four buckets: **KEEP**, **DERIVE**, **FOLD INTO EXISTING OWNER**,
**DELETE CANDIDATE**. It audits at least: declared replication factor;
placement constraints; Raft voters; learners; incoming/outgoing or equivalent
roles; replica operation rows; replacement operations; ADD operations;
follow-up moves; spread repair; formation/bootstrap; authorization carrier;
overflow budget; membership ceiling/count logic; active-voter count;
in-flight-active count; SYNCING state; planner epoch/version reads; publication
revision concepts; guard semantic logic; producer identity; readiness; node
health; lease/liveness observations.

The quest prefers deletion. For every concept proposed to remain durable it
states why it cannot be derived from the smaller set.

## 2. Model A before Model B

**Model A - preferred.** Existing machinery: `PartitionPolicy` +
`PlacementObservations` + `CommittedMembership` + `ReplicaOperation?`, where
`ReplicaOperation?` is zero or one unresolved membership-changing operation for
the partition. The planner produces one change. The durable operation executes
it to completion. Then the planner re-evaluates from fresh authoritative state.

**Model B - only if Model A is falsified.** A longer-lived multi-step
`MembershipTransition` which owns child operations. Not because TiKV/PD has
Operators, nor because it looks conceptually clean: only if a production-shaped
Lagrange case cannot be represented correctly by Model A. The falsifier is
recorded explicitly.

## 3. The hard cases that try to falsify Model A

Production-shaped drives for at least:

1. Initial formation from one replica toward RF=3.
2. Under-replication.
3. Distinct-node spread repair.
4. Learner creation and catch-up.
5. Learner promotion.
6. Ordinary replica relocation.
7. Node failure during relocation.
8. Chained REPLACE with previous target ACTIVE.
9. Chained REPLACE with previous target SYNCING.
10. Crash between operation phases.
11. Process restart during an operation.
12. Raft leadership change during an operation.
13. Planner retry from stale state.
14. Membership-generation mismatch.
15. Operation row re-materialization/recovery.
16. Planner/cache disagreement.
17. Partition split/merge interaction if membership work can overlap it.
18. Formation while nodes join asynchronously.

For each case: What is the committed membership? What observations exist? Is
there already an unresolved ReplicaOperation? What operation may be created?
What prevents a second conflicting operation? What durable fact permits
recovery after restart? What membership generation fences stale execution?

A failing case is not solved by immediately adding another concept. First
determine whether existing ReplicaOperation state is merely missing a field or
lifecycle boundary.

## 4. The primary invariant

> At most one unresolved membership-changing ReplicaOperation exists per
> partition.

This replaces the weaker idea of allowing an arbitrary number of membership
operations and trying to reconstruct their aggregate legality. It is tested
directly against current production behavior, with particular attention to the
verified chained-REPLACE case (previous target ACTIVE suppresses the second
REPLACE; previous target SYNCING allows it):

> Why can a second membership-changing operation begin while effects of the
> prior operation remain visible as SYNCING?

Determine whether this is: legitimate composition inside one operation;
premature terminal/completion state on the first operation; stale membership
observation; operation recovery/re-materialization artifact; or another real
requirement. Concurrent REPLACE is not authorized merely to preserve current
compatibility-budget behavior. If the one-operation invariant is falsified, the
exact minimal composition requirement is recorded before anything changes.

## 5. One owner of replica-membership changes

Converge the current decision paths under one semantic owner, provisionally
`ReplicaPlacementOwner` (the name is not binding; the ownership is). Its
concern: *what membership should this partition move toward next?* Inputs may
include PartitionPolicy; committed Raft membership; node health; readiness;
topology/locality; load; catch-up state; existing ReplicaOperation. It alone
may create a new membership-changing ReplicaOperation.

Components that discover conditions may remain separate - spread-gap detector;
under-replication detector; failed-replica detector; formation detector;
load-imbalance detector - but they produce observations/proposals and never
independently authorize membership changes. Specifically remove the semantic
split between the ADD spread cure and the follow-up REPLACE if they are both
responses to the same spread condition. Mechanism must not create a second
semantic owner.

## 6. The existing ReplicaOperation is the transition if possible

No new `MembershipTransition` table/object until disproven. Test whether the
current durable replica operation can carry the minimal additional identity
required. Conceptually it may need some subset of: operation id; partition id;
reason; base membership generation; source/current membership or relevant
delta; target/destination membership change; current execution phase; status.
Not all pre-emptively: start from existing fields and add only what a falsifier
demonstrates is necessary. The operation may internally perform multiple
execution phases, such as `ADD_LEARNER` -> catch up -> `PROMOTE` ->
`REMOVE_OLD`; that still counts as one unresolved membership-changing
operation.

## 7. Raft membership and control-plane intent stay distinct

The control plane owns *which membership change Lagrange intends to perform*.
Raft owns *which membership configuration has actually committed*. Preferred
shape: `ReplicaOperation` = control-plane intent / durable workflow;
`CommittedMembership` = consensus truth. No third permanent authorization layer
between them unless falsified. The control plane never infers that a membership
change committed merely because an operation advanced. Raft membership remains
authoritative for actual consensus membership.

## 8. Observations are explicitly non-authoritative

A clear conceptual boundary for `PlacementObservations`: node ready/unready;
lease/liveness; load; locality; SYNCING/catch-up progress; temporary routing
visibility; storage pressure. They can influence the placement owner. They do
not redefine committed membership. Investigate whether the current
SYNCING/census disagreement exists because lifecycle state is being treated as
a second membership authority. If yes, eliminate that ambiguity rather than
inventing a formula reconciling the two views.

## 9. The membership ceiling is not a primary protocol

`max(inFlightActiveCount, activeVoterCount)` is not an authorized architectural
endpoint. `authorizedMembershipCeiling` is a DELETE CANDIDATE unless the
model-reduction quest proves that member identities and operation phase are
insufficient. Preferred: committed members are explicit; the active operation
says which member is being introduced or removed; its current phase explains
the legitimate temporary membership shape. Any count/ceiling is then a derived
safety assertion or diagnostic: `assert observedMembership <=
expectedMembershipForOperationPhase` is acceptable; `membershipCount <=
authorizationCeiling` as the primary legality rule is not preferred.

## 10. ADD and REPLACE are execution mechanisms, not authority kinds

Keep the execution semantics Raft/workflow correctness requires, but stop
treating them as reasons for authority. Preferred: `reason =
repair_distinct_node_spread`; execution may use ADD learner, promote learner,
remove replica, or a current REPLACE implementation if retained. The semantic
decision is the target membership change; the mechanism is how it is executed.
No `ADD authority`. No `REPLACE authority`. No second authority merely because
a different module currently produces REPLACE.

## 11. Bootstrap uses the same operation machinery unless falsified

Bootstrap/formation is a distinct reason, not automatically a separate
protocol. Test `current membership = {seed}`, `policy = RF3`: the placement
owner issues one ordinary membership-changing ReplicaOperation, completes it,
re-evaluates, and issues another until policy is satisfied. Bootstrap-specific
membership machinery only if production evidence proves formation requires
different consensus semantics. Preserved invariant:

> desired replication policy does not change merely because current membership
> is incomplete during bootstrap.

## 12. The version/epoch work is narrowed

No repository-wide effort to normalize every variable that resembles an epoch.
Work outward from the membership operation boundary:

> What authoritative version identity is minimally necessary to ensure that a
> ReplicaOperation planned against membership M cannot execute against a later
> incompatible membership M'?

Investigate a single `membership_generation` first: authoritative writer; when
it advances; how it corresponds to committed Raft membership; whether it is
monotonic; whether operation creation records it; whether execution checks it;
behavior after restart; behavior after leader change. Another generation domain
only if a concrete distinct semantic requires it (split/merge/partition-shape
may). Unrelated versions are not combined because they share names. The
membership simplification is not delayed to inventory every version-like token.

## 13. The guard reduces to a membership-operation fence

The long-term guard does not reconstruct placement semantics. It does not
decide whether spread repair is needed; whether a node is unhealthy; whether
temporary overflow is acceptable; what membership ceiling applies; why a target
was chosen; which planner produced the action. Approximately: `activeOp =
unresolvedMembershipOperation(partition)`, then verify operation id matches;
partition matches; requested phase/step is permitted; base membership
generation is still valid; operation is still active. If these hold, the fence
produces the control-plane `honoured` result. Raft still validates/applies the
actual consensus change. The API is not prescribed; the narrow responsibility
is.

## 14. The authorization carrier is transitional evidence

Not discarded while the old guard depends on it; not evolved into a richer
permanent authorization protocol while model reduction is underway. Classified
as one of: folded into ReplicaOperation; temporarily retained during migration;
delete after enforcement cutover. If the durable operation can carry all
required identity, folding is preferred.

## 15. The old audit ontology is replaced once structural identity exists

No further investment in the 27-row hand-maintained matrix as the future
protocol specification; it is forensic/historical evidence. Once operations
have production-owned structural identities, generated state-machine tests come
directly from the operation lifecycle, covering at least: each valid operation
phase; each valid next phase; wrong operation id; wrong partition; stale
membership generation; second concurrent operation; restart at each phase;
leader change; operation completion; operation abort/recovery; wrong replica
identity; duplicate execution. The test discovers or drives the production
representation; it never declares a parallel semantic row model.

## 16. No universal event abstraction

Semantic observability types stay separate: membership operations expose typed
operation state/history; readiness exposes readiness transitions; query
failures eventually use their own structured failure envelope. Shared mechanics
(correlation id, timestamp, subject id) are fine. No universal `SystemEvent`
bag.

## 17. Implementation phases, if Model A survives all falsifiers

- **Phase A - ownership.** Establish the one replica-membership planning owner;
  route spread repair, replacement, bootstrap and similar decisions through it.
  No behavior change beyond ownership unification unless separately authorized.
  Differential tests required.
- **Phase B - operation serialization.** Zero or one unresolved
  membership-changing ReplicaOperation per partition; no second independent
  operation until the first is terminal. Drive the ACTIVE/SYNCING
  chained-REPLACE reproducer: the old second REPLACE becomes a phase of the
  current operation or is suppressed until re-planning after completion.
- **Phase C - membership generation.** Add or formalize the minimal
  committed-membership generation; bind new operations to the generation they
  were planned against; stale execution fails closed and causes re-planning,
  never a patched old operation.
- **Phase D - operation fence.** Move remaining semantic checks out of the
  guard; it validates operation identity, phase and generation only. Current
  decisions preserved until the later enforcement cutover.
- **Phase E - remove compatibility authority.** Retire overflow budget
  admission; the separate authorization carrier if fully folded; the
  membership-ceiling authority; duplicated ADD/REPLACE semantic ownership;
  inferred producer legitimacy in the guard. Deletion is an explicit acceptance
  criterion.
- **Phase F - generated protocol tests.** Replace the semantic role of the old
  matrix with operation-state-machine tests; keep the historical audit/evidence
  packet for comparison.

## 18. Every phase carries a complexity ledger

Per implementation quest: concepts added; concepts deleted; decision owners
added; decision owners removed; authoritative state sources added;
authoritative state sources removed; persistent fields added; persistent fields
removed; guard branches added/removed. A phase that only adds concepts and
removes none must justify why the simpler representation was falsified. The
desired trend is fewer semantic concepts and fewer decision owners.
Simplification is not judged solely by line count.

## 19. Acceptance target for the whole refactor

> Partition policy says what membership should look like.
>
> Placement observations describe the environment but carry no authority.
>
> Raft exposes the committed membership and its generation.
>
> One replica-placement owner compares policy with committed membership and
> observations.
>
> It creates at most one durable membership-changing ReplicaOperation for a
> partition.
>
> That operation executes its phases and is fenced against the membership
> generation on which it was planned.
>
> When it finishes, the owner re-evaluates from fresh state.
>
> No guard reconstructs why the change is legitimate.

If the final architecture requires substantially more durable concepts than
this, every additional concept has a recorded falsifier showing why this model
was insufficient.

## 20. Stop conditions

Stop and report rather than adding another abstraction if: Model A is
falsified by a production-shaped case; an existing ReplicaOperation cannot
represent a required transition without becoming ambiguous; more than one
concurrent membership operation is genuinely required; Raft membership
generation cannot provide the necessary stale-operation fence; operation phases
cannot distinguish the current SYNCING/ACTIVE case safely; ownership
unification reveals genuinely separate semantic decisions that cannot share one
placement owner. Bring back the falsifier and the smallest additional concept
needed. Never leap directly to Model B.

The governing rule:

> **Prefer one authoritative operation over several inferred permissions.
> Prefer identities and explicit state over counts. Prefer one decision owner
> over cooperating decision owners. Prefer re-planning from fresh committed
> state over carrying increasingly rich historical authorization.**
