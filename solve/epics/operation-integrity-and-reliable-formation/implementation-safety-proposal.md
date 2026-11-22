---
audience: agent
documentClass: planning
status: proposed
---

# Implementation safety and prevention of recurring bugs: epic proposal

**Status: proposed, 22 November 2026.** This is a proposed work programme within
[operation integrity](../operation-integrity-and-reliable-formation.md).
It makes the recent prevention recommendations concrete without registering a
new Solver epic, changing a sealed predicate or assigning another runtime writer.
The [agent start note](implementation-safety-start-here.md) explains how to fit it
to current work.

## 1. Objective and completion claim

Make the supported way of implementing an owner interaction carry its authority,
identity, ordering and lifetime obligations, so fewer correctness conditions
depend on a caller remembering a convention.

For every recurring bug class in this proposal, demonstrate:

1. One formerly plausible invalid implementation or construction that the new
   boundary rejects before integration.
2. One correct path through actual production construction that preserves safety
   and resumes useful work after a finite failure.
3. Bounded outstanding work, retry activity and cleanup, with evidence tied to
   the source and interaction actually reviewed.

Some mistakes can become unavailable through the supported interface: a consumer
cannot directly delete durable reservations when it receives no deletion
capability. Temporal mistakes require both a smaller implementation and adverse
schedules. This does not claim protection against arbitrary trusted-host
JavaScript or prove every distributed execution.

All six packages below are required for this proposed scope. Their numbering is
a dependency map, not permission to drop later work. An already-satisfied item
may receive an evidence-backed no-change disposition through its existing owner.
An explicit scope decision must identify any obligation left outstanding.

## 2. Authority, baseline and fit

The source analysis is pinned to runtime candidate
[6a292acfd07c7384286296ef0c2693907b7f0e39](https://github.com/psvensson/lagrange/commit/6a292acfd07c7384286296ef0c2693907b7f0e39).
Main was independently resolved to
[223a9e30c0238b6ace2fa05ec703c5d6f75761e4](https://github.com/psvensson/lagrange/commit/223a9e30c0238b6ace2fa05ec703c5d6f75761e4),
the base of this documentation change. These refs were checked on 22 November
2026; they are a dated checkpoint, not a live assignment table.

Rule-set revision 5 applies. Loaded owners include AGENTS, rules/router, Quest
workflow, documentation lifecycle, delegation/review guidance, the alpha plan,
ES6 owner safety and the core-convergence activation boundary. This proposal
contains source-derived findings and design recommendations, not new runtime
executions or proof of a failure on a later candidate.

| Concern | Existing authority | Contribution of this proposal |
| --- | --- | --- |
| Current candidate, assignments and integration | Parent epic's integration owner and current summary | A bounded prevention programme; no second queue or replacement branch table |
| Public feature completion | [Approved twelve-package alpha plan](usable-alpha-completion.md) and feature specifications | Improve delivery of packages 5, 6, 7 and 9, with proof/evidence support across the plan; retain all twelve packages |
| Implementation method | [ES6 owner safety](../es6-owner-safety.md) | Narrow capabilities, validated runtime records and real producer/construction tests |
| Locking and participant ordering | Current locking writer and TX1/participant owner | One committed exclusion invariant and transaction-owned release |
| Global indexes | Current GSI writer, IndexService, schema/placement and TX1 owners | Actual workflow identity and canonical partition execution |
| Live queries and retained readers | Current J6/live-query, partition CDC, transport and retained-view owners | Explicit lifecycle, ordered delivery, retained recovery/cleanup |
| Static enforcement and proof selection | Existing [navigability](../code-navigability-and-mistake-resistance.md), contract-check and interaction-selection owners | Extend existing selected checks and coupled-pair registrations |
| Evidence facts and applicability | Existing candidate-binding, receipt and publication owners | Generate factual summaries from their original records |
| Broad convergence | [Core architecture convergence](../core-architecture-convergence.md#status-and-activation) | No activation of Q1+; its cutover and Q0 READY conditions remain intact |

Implementation uses ordinary ES6 and the supported Node runtime. The approved
[ES6 constraints](../es6-owner-safety.md#fixed-implementation-constraints)
exclude TypeScript, checkJs, generated declarations, compiler-dependent contracts,
transpilation and a new build step. They supersede the earlier suggestion to
add checked-JS islands. Use owner-built records, runtime validation and narrowly
specified extensions to existing ES6 AST/import checks. State the actual coverage;
do not promise whole-repository static exhaustiveness.

Also excluded: a new DI/schema/state-machine framework, generic outbox, duplicate
ledger, simulator project, broad syntax rewrite, opt-in safe mode beside an old
semantic path, or another approval tier. Small private ES6 transition functions
are in scope. Existing acceptance and release allocation remain authoritative.

## 3. Motivating failure mechanisms

These are source-derived mechanisms at the pinned baseline. Reconcile each with
later source, original failures and current owner work before assigning a repair.

| Mechanism | Concrete baseline evidence | Prevention package |
| --- | --- | --- |
| Consumers can bypass the owner | GSI reads and backfill reach hosted DB handles; unscoped reservation release can visit registered partition DBs | P1, P2, P3 |
| A precheck loses validity across an await | Lock ACQUIRE checks before proposal; reciprocal exclusion must hold when PREPARE becomes durable | P2 |
| A required identity is omitted in normal construction | GSI provisioning context omits the workflow identity required by the actual provisioner; the witness substitutes direct partition construction | P1, P3, P5 |
| Flags and nullable results lose recovery meaning | A subscription handshake can mark progress before catch-up; refresh returns null for failure, coalescing and stale work | P1, P4 |
| Initial work bypasses retry ownership | Initial remote CDC sends can bypass the pending drain's single-flight lane | P4, P5 |
| Cancellation drops custody before effects settle | A late accepted subscription can require cleanup after user-facing removal; failed close requires an owned wake | P4 |
| Fixtures/proof describe a different system | A shared cache or replaced semantic owner cannot prove peer propagation or ordinary production provisioning; observation must not cause progress | P5 |
| Summaries drift from source and original runs | Handwritten full hashes, pushed status and topology claims can diverge from actual refs and job records | P6 |

Pinned source: [GSI read/provisioning](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/index-management/global-index-distributed-execution.js#L71-L77),
[backfill](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/index-management/global-index-production-wiring.js#L402-L422),
[reservation release](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-locking-read-reservation.js#L615-L655),
[ACQUIRE](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-locking-read-service.js#L258-L402),
[PREPARE](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-participant-transaction-apply.js#L315-L369),
[provisioner identity](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/query/sql-query-engine-initial-partition-provisioning.js#L43-L54),
[substituted GSI construction](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/index-management/global-index-production-tx1-distributed.test.js#L513-L560),
[refresh outcomes](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/live-query/live-query-group.js#L575-L617),
[subscription lifecycle](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/live-query/live-query-remote-cdc.js#L348-L473),
and [remote sender](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-live-query-cdc-remote.js#L185-L255).

## 4. P0: reconcile before selecting implementation

**Owner:** existing integration owner, with current writers and verifier.
**Output:** a bounded assignment in the existing active work record.

Resolve actual main/candidate/owner refs and local WIP, outstanding review
conditions, original run results and pending jobs. For each proposed item record
one disposition: already implemented with applicable proof; implementation
present with proof/composition outstanding; demonstrated remaining gap; or
unclassified pending a named discriminating observation.

Use the current open Quest where its seal permits. A completed predecessor stays
closed; a demonstrated new cause uses a bounded successor with preserved lineage.
Do not fabricate a red probe for already-green work, recreate branch names as
Quest IDs, or substitute a setup failure for a behavioral counterexample.

P0 completes when each selected interaction has one writer, exact candidate/base,
writable scope, original evidence, dependencies, independent reviewer and next
bounded action. It need not delay independent work already authorized and owned.

## 5. P1: enforce narrow capabilities and complete ES6 contracts

**Owner:** current runtime owner for each interface, assisted by the existing
static-tooling owner. **Dependencies:** P0; deliver alongside the relevant P2-P4
slice rather than as a prerequisite repository-wide rewrite.

### Deliverables

1. Give consumers only canonical operations and necessary metadata. IndexService
   receives partition read/write/provisioning operations, not hosted DB handles.
   Gateway cleanup receives local bookkeeping plus transaction release/recovery,
   not a durable-delete primitive. Co-located optimization stays inside the
   canonical owner and preserves its admission/currentness checks.
2. Make replicated application depend on validated commands, committed position
   and narrow store/effect operations. Do not pass a full mutable service or
   process-local caches into the authoritative decision. Give pure observation
   consumers an observation-only surface, without repair or progress operations.
3. Separate authoritative effects from local mirrors. Remove authority-changing
   flags such as a missing `authoritativeDbOnly` option selecting another
   algorithm. Remove replaced exports and migrate their affected callers.
4. Build required records at their owner and validate actual construction.
   Provisioning carries exactly one existing workflow kind/identity or uses a
   workflow-bound operation. Recovery results distinguish completed, deferred,
   stale and retired semantics using canonical owner outcomes; preserve refusal,
   identity, retry deadline and retained-obligation information across adapters.
5. Extend the existing AST/import checks over the named producer, all selected
   callers, production factory and fixtures. The enforcement inventory must say
   what is static, runtime-validated, or established only by execution. Narrow
   imports alone do not reject a broad mutable object passed as an argument.

The current
[contract-fidelity checker](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/scripts/checks/check-contract-authoring-fidelity.js#L65-L106)
is an ES6 AST checker for selected records, not general TypeScript/checkJs.
Extend its explicit scope where justified; do not relabel it as a compiler.
The existing
[dependency rules](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/dependency-cruiser.config.cjs#L44-L76)
are the place to extend import ownership.

### Acceptance and controls

- A consumer attempting a forbidden durable mutation or importing its private
  primitive is rejected by the applicable boundary check.
- Missing/both workflow identities and unsupported result shapes are rejected
  at the selected actual construction/call boundary. Dynamic input validation
  remains active; a nonempty identity string alone does not prove a workflow.
- Normal production construction still works, including explicit unavailable
  authority and valid local/remote owner execution.
- No replaced raw capability or alternate authority mode remains in the
  selected caller closure. Record any broader unexamined scope honestly.

An expected static rejection is authoring evidence. It does not count as a
product red/green witness or prove durable semantics.

## 6. P2: decide lock/write exclusion in committed partition order

**Owner:** current locking writer with the TX1/participant owner; alpha package 5.
**Dependencies:** P0 and the applicable P1 boundary changes. Serialize shared
participant edits with P3.

**Invariant:** no protected row is simultaneously held FOR_UPDATE by transaction
T and durably PREPARED for a conflicting writer W.

### Deliverables

1. Enforce reciprocal conflict checks in the same partition's committed order.
   PREPARE first makes conflicting ACQUIRE refuse; ACQUIRE first makes
   conflicting PREPARE refuse before a global COMMIT decision. Staging is
   provisional, and the leader precheck is an early refusal only.
2. Preserve same-transaction reentrancy, disjoint-row concurrency, actual SQLite
   conflict semantics and the owner's declared treatment of unknown/broader
   footprints. Do not invent a second uniqueness/conflict evaluator.
3. Keep all replicas' decisions determined by durable state and committed input.
   Retain authoritative reservations and their transaction-owned release through
   reopen/recovery. Gateway shutdown/error cleanup may clear only its local
   bookkeeping; durable release uses the existing committed owner operation.
4. Migrate the affected apply/admission/release callers as one interaction.
   Do not restore volatile-map decisions, add a global staging mutex, or defer
   the critical refusal until after a durable global COMMIT.

**Primary surfaces:** the linked ACQUIRE/PREPARE/reservation owners above and
their participant request/session/store and query cleanup callers. Reconfirm
exact writable files with the current TX1 writer.

### Acceptance and controls

Run the real participant application with both committed orders, duplicate
delivery, reopen/replay, same-transaction operations and disjoint-row progress.
The decisive overlap uses an already-open writer W: hold ACQUIRE after its
precheck/proposal but before quorum/application, stage W, then resume committed
application and PREPARE. Assert that the forbidden joint state and conflicting
commit are impossible. A synchronous single-replica proposal cannot by itself
establish this overlap.

Use a controlled consensus seam for deterministic ordering and retain the
required native/multi-replica witness. A known-bad reciprocal-check removal must
fail the conflict assertion, while the legal winner and an unrelated row still
progress. Release must affect only the actual participant/transaction scope.

## 7. P3: bind GSI to actual workflow and partition owners

**Owner:** current GSI writer with schema/placement and TX1 owners; alpha package 6.
**Dependencies:** P0, relevant P1 contracts; P2 before conflicting shared
participant edits integrate.

### Deliverables

1. Trace ordinary SQL engine/IndexService construction to the real provisioner.
   Bind it to the actual durable schema job or partition workflow. Have that
   owner validate identity, generation and lifetime; never manufacture an ID
   solely to satisfy a shape check.
2. Route index reads and backfill writes through the canonical partition owners.
   Resolve metadata discovery through the existing catalog/placement contracts;
   expose metadata, not hosted DB handles or a new discovery authority. A local
   follower DB handle must not create a second authority/read path. A local fast
   path may remain inside the owning operation with the same checks, outcomes
   and transaction semantics.
3. Preserve the existing real-participant TX1 maintenance and base-row images.
   Index population, catalog state and supported query behavior must agree
   through interruption, duplicate/retry and retained-state recovery.
4. Reuse ordinary production assembly in acceptance. Retain the real provisioner
   and workflow; replace only declared environmental effects. Separate peer
   caches and exchange updates through the real transport path for a peer
   propagation claim.

### Acceptance and controls

A public CREATE/populate/query journey establishes an actual owned workflow,
index partition, correct indexed results and recovery through supported finite
failure. Missing/conflicting workflow identities refuse explicitly. With a
hosted local follower handle available and canonical authority unavailable, the
operation must not read or commit through that handle. Restoring the raw bypass
or omitting the workflow binding must fail its named assertion.

Tests that replace provisioning with direct partition creation or share one
cache between engines retain their narrower component meaning. They cannot
close normal-construction or cross-node propagation acceptance.

## 8. P4: make asynchronous work an owned lifecycle

**Owner:** current live-query writer with partition CDC/query-group/transport
owners; alpha package 7. The retained-view owner retains package 9 and its
completed correction. **Dependencies:** P0 and the relevant P1 outcome contract.

### Deliverables

1. Put lifecycle state behind a small private ES6 transition function. A
   synchronous transition chooses next state and owned effects; effect
   completion returns an event with its exact registration identity. Avoid
   independent mutable flags/maps that can each declare completion.
2. Register owner key, binding/generation, attempt, outstanding obligation and
   raw completion/cleanup custody before starting an effect. Cancellation stops
   admission while retaining custody of effects already started. Ignore stale
   results for current-state mutation, but clean up resources they actually
   created using the old binding, without deleting a replacement registration.
3. Put initial CDC delivery and retries through the same per-subscriber ordered
   lane. Enqueue and claim the attempt before the first await. Unrelated
   subscribers remain concurrent; cancellation and completion transitions must
   remain processable while delivery I/O is outstanding.
4. Replace nullable refresh completion with explicit owner outcomes.
   Handshake acceptance is not completed catch-up. A coalesced request may join
   a completion only if its actual snapshot/binding/frontier covers the new
   requirement. Failed, stale or insufficient refresh retains catch-up/reset
   debt and its continuation. ACK/frontier advancement must represent delivered
   work or a successfully completed replacement snapshot under the contract.
5. Derive wake scheduling from retained obligations. A pending obligation has
   execution in flight, an owned wake, or explicit transfer to its retirement
   owner. Use an absolute not-before decision shared by timer and event triggers;
   new input cannot reset or evade retry-after. Preserve queue/attempt/cleanup
   bounds and the existing event-driven progression.
6. Apply the cleanup invariant to the retained-reader owner only where a
   remaining gap is established. Preserve the already-corrected failed-first-
   acquisition reaper witness. Shutdown settles or transfers custody; it does
   not require an immortal timer or a new durable live-subscription ledger.

The following phases describe obligations; exact names belong to the runtime
owner and do not introduce a shared state-machine framework.

| Transition | Required evidence or retained obligation |
| --- | --- |
| Connecting to catching up | Matching subscription accepted; required snapshot remains owed |
| Catching up to live | Matching successful snapshot covers the required binding/frontier |
| Catching up after unavailable/coalesced work | Remain pending unless an adequate joined completion arrives |
| Live to catching up | Gap/overflow retains a reset obligation |
| Any active phase to retiring | Stop new admission; retain raw children and remote cleanup |
| Retiring after late success | Dispose that actual old registration; retain custody meanwhile |
| Retiring to closed | All owned children/resources settled or validly transferred |

Reuse existing patterns where their semantics fit:
[raw delivery custody](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/transport/message-router-delivery-lifetime.js#L183-L217),
[exact registration identity](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-service-raft-write-commit.js#L82-L89),
[dispatch versus child settlement](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/cdc/cdc-delivery-invocation.js#L128-L187),
and [owned due time](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/src/partition/partition-cdc-obligation-delivery.js#L307-L338).

### Acceptance and controls

Hold the first send while the next event arrives; inject typed DEFERRED;
fail/coalesce catch-up and then heal while otherwise idle; apply a long retry
deadline while new events arrive; cancel after remote registration but before
its response; complete an old attempt after a replacement exists. Retain the
applicable failed-first-reader-close proof, re-executing only where a changed
interaction or required gate invalidates reuse. Assert ordering, no false
ACK/frontier, eventual useful delivery/recovery, no deletion of the replacement,
bounded attempts/queues and eventual cleanup. Reinstating the direct-send or
nullable-completion shortcut must fail a behavioral assertion.

## 9. P5: make verification follow real construction and adverse schedules

**Owner:** current implementation writers and independent verifier, with existing
test-helper, pure-status and interaction-selection owners.
**Dependencies:** P0; develop each witness with its P1-P4 slice.

### Deliverables

1. Use the ordinary production assembly for the owner being certified.
   Substitute controlled storage/network/clock effects only at declared seams.
   Allowed doubles consume canonical records and pass the applicable conformance
   cases; expected semantic results come from independent assertions, not the
   predicate under test.
2. Exercise the small set of events that can invalidate a precondition across
   each relevant await. Use controlled promises and the existing clock seam,
   with explicit finite-failure/fairness assumptions, rather than a sleep that
   accidentally removes the overlap.
3. Explore small bounded models for lock/PREPARE exclusion, recovery/frontier
   debt and retirement/cleanup. Either explore the actual production transition
   with an independent invariant, or replay model-generated schedules through
   actual production and compare outcomes. Existing model tools are sufficient;
   JSON statechart reachability or declared owner traces alone are not runtime
   conformance.
4. Extend existing `coupledPairs` in
   [impact contracts](../../../test/shards/impact-contracts.json) for acquisition/
   PREPARE, GSI/workflow, GSI/partition execution, remote delivery/refresh and
   subscription/retirement. Include the construction surface and exact witnesses.
   A change at either endpoint must select the required proof. Register these
   within the product work, without a second registry or separate tracking Quest.

| Await under control | Material interleaving | Required observations |
| --- | --- | --- |
| ACQUIRE proposal/application | Conflicting stage/PREPARE; leadership change | Exclusion, deterministic replay, legal/disjoint progress |
| First CDC send | Next event; refusal; cancellation | Per-stream order, retained obligation, bounded cleanup |
| Subscribe response | Remote acceptance; removal/replacement | Exact old-registration cleanup; replacement survives |
| Catch-up read | Failure/coalescing; newer binding | Debt persists until a covering successful snapshot |
| Close/release | Failure; idle period; next acquisition | Handle remains owned, scheduled cleanup, eventual release |

Every behavioral schedule asserts safety, useful progress after the finite fault
clears, and resource bounds. Static negative controls may fail authoring checks;
behavioral controls must reach and fail the intended assertion. Neither a broken
import nor failed fixture setup establishes product discrimination.

### Preserve all four composition findings and their proof

These are retention/applicability obligations, not a declaration that their
earlier defects remain open. Bind actual original results and review disposition
before carrying acceptance onto a changed composition.

| Existing group and owner | Conditions that must survive |
| --- | --- |
| Placement fixture owner: [authority barrier case 2](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/rebalancer/placement-owner-authority-barrier.test.js#L43-L127) | Correct applied-term definition; quiet-ledger progress witness; negative barrier. Preserve the canonical owner's correction and applicable execution evidence. |
| Task I owner: [execution mirror case 13](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/partition/placement-create-dispatch-execution-mirror.test.js#L497-L582) | Retain the original assertion line, expected/actual values and which of its three schedules failed in the existing failure record; typed refusal, bounded redrive, wait cleanup and delivery assertions. An unexplained residual stays unclassified. |
| Dispatch fixture/status owners: [reservation dispatch harness](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/rebalancer/reservation-dispatch-gate-test-harness.js#L206-L235) | Production `readOwnRaftStatus` seam, matching group/replica identity and actual role, following the existing [cache-observation pattern](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/cache/system-table-cache-observation.test.js#L47-L70); reservation, unavailable-authority and identity negatives. |
| CDC fixture and pure-status owners: [receiver read-point](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/test/cdc/cdc-owner-fact-receiver-read-point.test.js) | Retained actual failure, the specific `APPLY_BEHIND_COMMIT` witness, then successful read after explicit application; observer calls provide no hidden progress. |

Continue approved W1/T2 work through its existing owner. Preserve its term-only
tenure and post-pure-status composition obligations. Do not reopen completed
Task I, pure-status, placement or CDC corrections merely to give this proposal
fresh work.

## 10. P6: generate evidence facts and close the composed claim

**Owner:** existing candidate-binding/report/proof owners and current integration
owner/verifier. **Dependencies:** P0 for reporting work; P1-P5 results for closure.

### Deliverables

1. Extend the existing report producer to consume actual resolved refs and
   original job records: full source SHA, remote presence at observation time,
   run/job ID, execution source, exit/per-file result, and original artifact
   location. Missing data stays unavailable or unmeasured.
2. Record topology and substitutions alongside the claim. Several hosts running
   independent test files are not proof of one distributed product; separate
   node caches/processes must exist for the corresponding claim.
3. Bind independent review and affected execution to the resulting composed
   SHA/content. Reuse earlier evidence only through existing applicability
   rules, including unchanged production/test inputs and their interaction.
   A table renderer or digest alone does not establish semantic correctness.
4. Generate factual branch/result sections while retaining reviewed human
   interpretation, unresolved obligations and the next owner/action. Update the
   existing current summary, preserving newer integration text and append-only
   history. Corrections to old records are appended through their current owner.

Reuse [candidate binding](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/scripts/solve/candidate-review.js#L148-L178),
[probe applicability](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/scripts/solve/probes.js#L101-L158),
[interaction-proof selection](https://github.com/psvensson/lagrange/blob/6a292acfd07c7384286296ef0c2693907b7f0e39/scripts/quest-evidence/content-bound-review-and-interaction-proof.js),
and the existing [durable proof receipt contract](../../../docs/development/durable-proof-receipts.md).
No second success ledger or universal proof-equivalence rule is introduced.

### Acceptance and controls

A moving ref cannot substitute for the measured SHA, and an unpushed commit
cannot be reported as pushed; neither fact alone invalidates genuine retained
execution on its exact source. A mismatched execution SHA, a failed original
job, or a shared-cache substitution cannot establish the claimed composed or
cross-node proof. Known invalid inputs must produce an explicit
unavailable/mismatch/refusal under the existing evidence contract. Verify
one-sided interaction selection and rejection of a missing required witness.

Historical GCP measurements at f580579a5 remain historical, separate from current
candidate acceptance. This work does not change the existing three consecutive
fresh-state passes on the original named three-host profile within 420 seconds,
or its spread, quietness, public SQL, observation and cleanup predicates.
Physical/corpus/comparative work remains with the approved alpha sequence and
authorized runner. Creating or adopting this proposal starts none of those jobs.

## 11. Integration sequence and reviewable slices

| Order | Bounded result | Coordination |
| --- | --- | --- |
| P0 | Reconciled current candidate and disposition of each selected gap | Current integration owner; preserve all local WIP and pending jobs |
| First locking slice | Reciprocal committed exclusion, genuine pending-ACQUIRE witness and required capability closure | Current locking/TX1 writer; independent review before dependent participant changes |
| First GSI slice | Ordinary provisioner binding and a real production construction witness | GSI/schema owner; coordinate shared TX1 edits after locking |
| First live-query slice | One ordered initial/retry lane with held-first-send witness | Existing live-query writer may work independently of participant edits |
| Remaining owner slices | Raw-capability removal, explicit recovery/retirement outcomes, wake/cleanup invariants | Each owner carries its P1 and P5 checks; migrate callers and delete replaced path together |
| Evidence and final composition | Registered witnesses, generated facts, applicable proof and exact composed review | P6 can begin independently; final closure waits for all required owner slices |

This sequence sets dependencies, not new personnel assignments. It does not
interrupt an already-approved bounded repair or demand a large cleanup before
fixing a proven defect. P1/P5 are part of each affected slice. Locking and GSI
share participant semantics, so separate worktrees do not authorize concurrent
writers on that interaction. Read-only review and independent lifecycle/report
work may proceed in parallel.

Before an implementation slice, use the existing
[transition/design record](../../../docs/development/verification-templates/design-note-template.md)
to name producer/consumer, shape, identity, ordering, durable decision, unavailable
outcome, retained obligation, wake/cleanup, exact writable scope and falsifier.
The existing independent-review route applies; this adds no ceremony for routine
local hypotheses.

## 12. Proposed completion checklist

- P0-P6 each have a disposition in existing work records, with all scoped
  obligations completed or explicitly narrowed by a recorded scope decision.
- Forbidden raw authority and alternate semantic paths are absent from the
  declared consumer closures; selected contract/negative checks reject their
  attempted reintroduction.
- Both lock/PREPARE orders, ordinary GSI provisioning/execution, and live-query
  ordering/catch-up/retirement satisfy their safety and finite-failure progress
  contracts with resource bounds.
- Real construction and controlled schedules cover each repaired interaction;
  applicable bounded models connect to production. Negative controls
  discriminate the intended defect.
- All four composition groups and approved W1/T2 retain their required
  assertions, classified original failures, applicable execution and review.
- Existing selection includes the affected endpoint/construction witnesses;
  independent approval and affected execution cover the final composition,
  retaining earlier proof only where applicable.
- Current summary facts are derived from original refs/jobs and include actual
  scope; historical measurements remain separate. No feature or release is
  declared accepted beyond its existing contract.

This checklist is proposed completion meaning, not a sealed executable
`doneWhen`. Adoption and subsequent implementation bind it to existing owners
and genuine probes under the current workflow. Broad convergence and full alpha
acceptance retain their separate conditions.
