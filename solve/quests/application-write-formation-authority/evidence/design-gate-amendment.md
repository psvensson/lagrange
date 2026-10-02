# Application-write formation authority: challenged design gate

Date: 2026-09-27

Product base: `75147d7439de82d72de857aadd48c6b0eccf3059`

The authority/state and interleaving challenges agree that the reproduced
handoff is false, but narrow the initial causal classification.  The defect is
one unowned, unversioned interaction between SQL formation and
`RebalanceCoordinator.createOperation()`, not a reason to change the existing
repair-only topology policy or the routine ledger deadlock exception.

## Amended mechanism verdict

`checkProvisioningAdmission()` says it predicts operation creation, but today
it checks only the routine ledger interlock and storage admission.  SQL reduces
the answer to admitted node IDs and later passes the boolean
`skipProvisioningAdmissionRecheck`.  `createOperation()` nevertheless consults
additional authoritative state before and during the first durable
`replica_operations` write:

- existing deterministic/in-flight operation identity;
- authoritative entity-operation visibility and add-like serialization;
- create-time topology guards;
- storage admission and reservation inputs;
- the canonical `replica_operations` leader, service, participation,
  transport and gateway route.

Formation neither owns nor versions that composition.  In the captured
failure it declared `READY/PROCEED` from its direct-publication target view,
then the actual routed operation write found no recovery-eligible route.  A
stable-state direct reproduction additionally proves that an unreadable ledger
can be represented as `empty` while the partial precheck still returns
`ADMITTED`.

The initial D (A+B) label therefore becomes:

- **primary A:** formation omits the canonical operation-creation/persistence
  admission predicate;
- **contributing B:** formation discards the identity of the readiness view it
  did consume, so the effect-side owner cannot establish that it is consuming
  the same generation.

The ledger repository's routine fail-open is not itself the defect: that
exception prevents a sealed control-plane recovery deadlock, and creation is
the intended downstream enforcer.  Likewise, repair-only target selection is
an intentional internal-topology contract.  The repair must preserve both.

## Single owner model

`RebalanceCoordinator` owns one immutable operation-creation admission
observation.  It composes existing owners rather than duplicating their
predicates:

1. current readiness-planning identity;
2. authoritative entity-operation visibility and deterministic intent;
3. routine ledger-interlock policy;
4. storage admission;
5. side-effect-free canonical routed-mutation availability for
   `replica_operations`;
6. create-time topology predicates that can reject before persistence;
7. a structured outcome (`contractState`, `nextAction`, blocking reasons and
   retry hint).

SQL constructs the already-existing deterministic operation and replica intent
IDs before probing and retains the coordinator's observation per target.
`waitForProvisionTargetNodeIds()` polls that owner outcome.  The naked
`skipProvisioningAdmissionRecheck` boolean is replaced by consumption of that
observation at the final pre-persistence boundary.

If the observation is current and the same predicates remain admissible, the
first durable operation insert proceeds once.  If the identity changed, the
coordinator re-adjudicates once from current authoritative evidence and either
proceeds or returns a typed pre-effect `REENTER`/wait outcome.  This is
observation repetition, not mutation replay.

Once persistence submission begins, the result is potentially applied.  Any
lost response or timeout is resolved internally through the existing
deterministic operation ID and authoritative collision lookup; it is never
reported as a clean pre-effect refusal and never tells the application to
submit another CREATE.

## Identity and first-effect boundary

No new global token namespace is needed.  Reuse the current readiness-planning
token, which already covers nodes, services, partitions, `replica_operations`,
storage reservations, recovery epoch and transport topology.  Positive
formation observations must expose that existing token instead of retaining
only node IDs.  Membership epoch, partition-version fences and deterministic
operation/replica intent IDs remain their current owners' identities.

For this repair, the first effect governed by the formation handoff is the
durable `replica_operations` insert.  Table metadata and the durable schema job
exist before this handoff and are recovered by their existing owner.  The
reservation is written after the operation insert and is explicitly non-atomic;
reservation failure therefore cannot be described as a pre-effect refusal.

An unrelated operation racing atomically between the final observation and
the remote insert cannot be fenced by a local readiness token.  The direct
witnesses must prove that known/current authoritative changes cannot be
overridden by a stale observation and that deterministic insert ambiguity is
reconciled by operation identity.  They must not claim a new remote
compare-and-insert guarantee that the current ledger owner does not provide.

## Required temporal witnesses

### F1 — stable READY admits the first effect

With readiness identity, ledger visibility, route, storage and topology held
stable, consume one admitted observation and assert one operation-insert
attempt, with no contradictory creation-time refusal and no caller retry.  A
mutant that omits the newly composed routed-write predicate must fail.

### F2 — blocking operation state prevents false READY

Keep a weaker/cached view clear while the authoritative entity-operation owner
reports pending/deferred state, or the canonical mutation route is unavailable.
Formation returns the canonical structured wait/re-entry outcome and insert,
reservation and dispatch counts stay zero.  Routine ledger-read fail-open
remains intact; the operation-creation owner supplies the missing enforcement.

### F3 — a post-READY transition is safe

Between observation and consumption, table-drive route loss, a current pending
operation, target occupancy, a leader move and (where owned by this boundary)
holder loss.  Current admissible evidence proceeds; current blocked evidence
returns typed pre-effect re-entry with zero operation insert.  A result lost
after submission takes the deterministic-ID reconciliation path instead.

### F4 — stale generation cannot win

Capture READY at G, publish blocking authoritative G+1, then release the G
consumer.  G cannot insert or dispatch.  After the blocker clears, re-enter the
same coordinator owner at G+2 and continue the same durable schema intent.
This is a stale-view fence, not a claim that the planning token is a remote
ledger CAS.

F5 is not required unless implementation changes a durable/restart owner.

## Explicit non-goals and stop lines

- Do not change repair-eligible provisioning to serve-eligible provisioning.
- Do not fail-close the routine ledger-read deadlock exception.
- Do not widen timeouts, add sleeps, or retry CREATE.
- Do not treat a post-submission timeout as a pre-effect refusal.
- Do not claim reservation failure is pre-effect without redesigning the
  operation/reservation transaction.
- Stop for owner direction if correctness requires a durable atomic
  compare-and-insert across an unrelated operation race, or if schema-holder
  fencing must be extended across ledger persistence rather than checked by
  the existing schema-job owner.

Within these lines the repair is an owner-level consistency correction, not a
product-policy change, so implementation may proceed from direct red witnesses.
