# Placement owner repair — tenure, wakes, construction (brief, 2026-11-21)

Subject: the production placement owner (`ReplicaPlacementOwner`, `src/rebalancer/replica-placement-owner*.js`), the
END STATE for placement scheduling (owner decision). Executed witnesses on branch
`work/placement-owner-witnesses-20261121` (head 974320ad3) demonstrate specific defects; each repair below is
authorized ONLY by its executed red witness. A witness that already passes needs no repair.

Design and evidence to read first:
- `/mnt/data/peter/projects/lagrange-takeover-20261121/reports/placement-owner-proof-transfer.md` (what the owner's
  authority is in code, gap table, proof plan, retirement stages A and B).
- The witness writer's report is summarised in this file; lab outputs:
  `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/pow-run3-bf0c6310` (all files) and `pow-run5-efd35b4b`
  (disruptions). Fixture: `test/rebalancer/placement-owner-authority-fixture.js` (its header states its evidence
  ceiling: transfers use a fixture-owned controllable log, not a real raft election).
- Owner's binding decisions: the END of `/mnt/data/peter/projects/lagrange-takeover-20261121/reports/lead-rulings.md`
  (sections "OWNER DECISIONS (binding): placement owner as end state", "transfer contract, five-node proof,
  evidence and repair sequence", "placement owner proof transfer").

## The owner's transfer contract (binding, verbatim sense)
Bounded-and-counted stale work is acceptable; zero is not required. Required:
- No fresh placement decision authorized by an expired tenure.
- No duplicate admitted operation, capacity allocation or placement effect.
- A defined and tested bound on obsolete planning work and outstanding tasks; repeated transfers must not accumulate
  obsolete tasks.
- Progress by the successor without waiting indefinitely for obsolete work to finish.
Mechanism: a token identifying the leadership TENURE, captured by each pass and retained by its asynchronous
continuations. Losing and later regaining leadership must not make an old pass valid again. The new leader's first
pass waits until its own term-start entry is COMMITTED AND LOCALLY APPLIED, then verifies the same tenure is still
current; the barrier is established through the ledger's own consensus progress, never through SERVICES publication
or formation readiness. The captured tenure is checked after asynchronous waits and before authoritative actions,
and the fence is enforced at the ACTUAL ADMISSION BOUNDARY (a check earlier in the planning loop is insufficient).
"Bounded" is concrete: identify the checkpoints, the maximum work between them, and how outstanding waits terminate
or become harmless. Stale work and rejected attempts are counted separately from proposals and admitted operations.
Preserve legitimate inherited work: operations already admitted into the authoritative ledger history may finish
after transfer; earlier proposals may become committed before the successor's barrier; recover those outcomes under
their existing identities; never recreate them or treat their completion as a violation. Tenure identity is
separate from the durable operation identity used for replay. Scheduling authority is single for its scope and
tenure, from the ledger's EXISTING consensus authority: no new election table or service; a declaration recomputed
from a local cache grants nothing; with no published owner the placement owner on the ledger leader acts from live
consensus authority; a target partition's leader never schedules; missing evidence is explicit pending work with an
owned wake.

## Executed witnesses (tv-dator) and what each demands
Tenure (`test/rebalancer/placement-owner-authority-tenure.test.js`), RED today:
 3. a pass suspended at await A1 across a graceful transfer constructs a move and reads capacity after its tenure
    ended;
 4. A->B->A with an old continuation held at A1: the pass started under the first tenure ADMITS under the second;
 5. same schedule: the current tenure cannot start a pass while the obsolete continuation is suspended (single drain
    queues the new tenure behind the obsolete pass);
 6. admission-boundary fence: decided under the first tenure, admitted under the second;
 8. term-start barrier: the new leader planned and proposed for a deficit already admitted by a committed entry it
    had not applied;
 11. new term without a role edge: decided under term 2, admitted under term 3;
 12. graceful transfer of an idle leader: a pass starts on the deposed owner after its tenure ended (the demotion
     clears the node's own leader projection, the resulting PARTITIONS_CHANGED starts a pass before the owner's
     boolean is lowered).
 PASSING today (must stay green, unchanged): 1, 2, 7, 9 (vacuous until a barrier exists: it guards the barrier
 against depending on publication), 10, 13.
Wakes (`test/rebalancer/placement-owner-authority-wakes.test.js`), RED today:
 - explicit pending work: `lastPassSnapshot` does not name the wait; the declared clearing trigger for
   LEADER_UNKNOWN is SERVICES_CHANGED while the event that ends it is PARTITIONS_CHANGED;
 - missed wake: the 60 s resync the sealed contract requires is not armed in production (factory passes no timer);
 - a pass that throws loses its pending triggers (`drainQueue` has no catch);
 - start path: no admission while the LEADERSHIP_START CDC drive is unanswered.
 PASSING: the ownerless priority partition resumes on the real PARTITIONS leader publication alone.
Construction (`test/partition/placement-owner-construction-orders.test.js`): seed, join and late-ledger-replica
orders PASS; RED: an existing coordinator with user/priority partitions initialized before the ledger keeps
per-partition `UnifiedRebalancer`s after the factory is bound; RED beyond prediction: with the ledger first, the
ledger partition itself builds a `UnifiedRebalancer` AND later gets a placement owner (the attach returns null while
the coordinator's lazily created `serveEligibilityOwner` is not yet instantiated).
Negatives, disruptions, five nodes in process: all PASS (no repair). Provisioner witness: NOT ESTABLISHED (fixture
gap), not registered.
Counts: never more than one admitted operation per deficit in any schedule; the defect is authorization by an
obsolete tenure and unbounded/unfenced work, not duplicate admission.
Today's checkpoints in a pass: `isLeader` at pass start, the drain-loop check, the per-candidate check, the kernel's
core-role check at propose. Await points in `runPass`: A1 (CDC drive), A2 (hold release), A3
(`isCandidateAdmissibleNow` / `canAdmitRemove`), A4 (admission), A4' (retained-REFUSED re-admission), A5
(ledger-class hold release). Witnesses cover A1 and the A3/A4 boundary; A2, A5 and the REMOVE awaits of A3 are not
covered.
Existing building block to check before inventing anything: `mintReplicaLeadershipTenure` /
`applyReplicaLeadership` in `src/raft/replica-leadership-state.js` (:38-69) already mint a frozen `{term}` tenure
object per leadership edge or term, null when not leading, ended on demotion or shutdown; it is process-local and
compared by identity. If it is the owner-defined leadership tenure, USE it; do not create a second tenure notion.

## Stages (STOP and report after each)
Stage 1 — tenure (witnesses 3, 4, 5, 6, 8, 11, 12 green; 1, 2, 7, 9, 10, 13 stay green; 9 becomes non-vacuous):
 the tenure token per pass and continuation; checks after every await (A1-A5 and A4') and before every authoritative
 action (including the hold-release proposal); the fence at the actual admission boundary; the term-start barrier
 from the ledger's own consensus progress; the successor not queued behind an obsolete pass (obsolete continuations
 terminate or become harmless at their next checkpoint; state the bound); demotion ordering so no pass starts with
 no tenure; cumulative counters on `lastPassSnapshot` ({passSequence, triggers, tenure identity/term, evaluated,
 candidates, waiting by reason, capacityChecks, proposals, admitted, refused by reason, stoppedAt}) with stale work
 and rejected attempts counted separately: this is the owner-side observation that makes the contract assertable on
 a real node (diagnostics rehomed to the actual placement owner). Add witnesses for the uncovered await points A2,
 A5 and the REMOVE awaits of A3.
Stage 2 — wakes (the four red wake witnesses green): the resync armed in production as the sealed contract says;
 a throwing pass keeps its triggers and its obligation (typed, visible, bounded; no spin); LEADER_UNKNOWN retained
 as explicit pending work whose declared clearing trigger is the event that actually ends it; the start path does
 not wait for its own publication/CDC drive.
Stage 3 — construction invariant, then removal of the retired per-partition scheduler (design "stage B": the
 construction path in `src/partition/partition-service-rebalancer-methods.js`, the optional-factory branch, the
 existing-rebalancer branch, the 13 flag read sites): exactly one scheduler for partition placement in EVERY
 construction order; the message-group and runtime-service uses of `UnifiedRebalancer` are NOT part of this removal.
 Do not touch the old scheduling-owner policy (`priority-recovery-scheduling-owner-policy.js`): its retirement is
 "stage A" and comes after, by a separate decision.
