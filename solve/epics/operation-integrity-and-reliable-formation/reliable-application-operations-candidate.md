---
audience: agent
documentClass: planning
status: proposed
---

# Epic candidate: reliable application operations

Proposed on 23 November 2026. This is a candidate decomposition within
[operation integrity](../operation-integrity-and-reliable-formation.md), with
six new unsealed Quest records and two existing work units. The
[start note](reliable-application-operations-start-here.md) explains the first
bounded actions and how to preserve work already underway.

The user requested a candidate and scaffolds. This document does not adopt
the proposal, assign a competing writer, seal acceptance, start runtime work
or establish an execution result. Existing task authority remains valid.
The integration owner's current summary and actual owner records remain the
single source for the active candidate, assignments, branches and next action.

## 1. Objective and completion boundary

A developer using the identified distribution can complete an admitted
application operation, understand its result, and continue the application
after supported interruptions. Accepted work retains an owner until its
effects and cleanup are settled or explicitly retained for recovery.
Formation and ordinary foreground work progress within a measured operating
envelope, and public success corresponds to achieved behavior.

All eight units below need a concrete disposition: applicable existing proof,
completed bounded work, or an explicit remaining obligation under its owner.
The order does not permit later units to disappear.

This candidate consumes the approved
[twelve-package alpha plan](usable-alpha-completion.md) and
[implementation-safety P1-P6](implementation-safety-proposal.md). It does not
replace their scope or introduce another release acceptance. Bounded repairs
to already admitted behavior retain the 0.4.1 correction allocation; wider
application and operating-envelope qualification retain 0.5. Existing feature,
pilot, comparison, security and upgrade obligations keep their owners and
version allocations in the [feature map](../../../docs/development/agpl-feature-map.md).

The representative application organizes proof; it cannot silently exclude
an admitted SQL, index, live-query, WASI or service capability. A scoped repair,
the original formation milestone, this application witness and full release
acceptance are distinct claims.

## 2. Source baseline and evidence limits

The architecture assessment inspected integration source
[b85ba795076b9457b68b83698bc74898b4724cc9](https://github.com/psvensson/lagrange/commit/b85ba795076b9457b68b83698bc74898b4724cc9),
with runtime candidate
[a3dcbe8c742a0b25551fdb145a6b5a877d0a3aa9](https://github.com/psvensson/lagrange/commit/a3dcbe8c742a0b25551fdb145a6b5a877d0a3aa9).
This documentation branch starts at main
[4f37cc542f4bbf13c810732b8c8431a94d6e2dfd](https://github.com/psvensson/lagrange/commit/4f37cc542f4bbf13c810732b8c8431a94d6e2dfd).
Main and integration are different inputs; this change imports no runtime
composition or integration-summary snapshot from the integration branch.

Rule-set revision 5 applies. Loaded sources include AGENTS, rules/router,
Quest workflow/schema/artifact owners, roadmap policy, the adopted alpha and
implementation-safety plans, and the current runtime/source owners. Main and
integration have different steering text; implementation must reload the
owners from its actual selected candidate, not treat this dated note as a
replacement instruction set.

The current integration report records 62 selected files and 2,720 assertions
passing on a3dcbe8c7. That is selected execution evidence, not execution of the
whole classified corpus. It records a failed strict GCP smoke at
readiness_exhausted and a separate 244.3-second diagnostic against the unchanged
240-second comparative formation budget. The measured 84.6-second seed and
129-second spread/quiet stages prioritize investigation; they do not establish
event-loop blocking or serialization as their cause.
[Original report checkpoint](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/solve/epics/operation-integrity-and-reliable-formation.md#L163-L194).

Historical GCP observations at f580579a5 remain historical. Developer smoke,
lenient physical diagnostics, static classification, a scoped repair pass and
a successful public write probe do not substitute for the original physical
formation acceptance or a completed comparative workload.

### Findings to reconcile before assignment

| Finding at the reviewed source | Classification and bounded next action |
| --- | --- |
| Identical concurrent GSI CREATE can redrive physical reconciliation outside the completion promise; a late DROP/CREATE can reset a readable dataset. | Source-derived schedule. Q1 must establish the actual production-path red and current writer disposition. |
| Schema provisioning persists SUCCEEDED before GSI continuation; restart scans only nonterminal schema jobs. | Source-derived recovery cut. Q2 must interrupt after that durable transition and inspect the successor's actual index/data state. |
| Remote CDC shutdown clears retained cleanup scheduling and records while a producer may remain live. | Source-derived lifetime gap. Q3 must observe the producer's retained resource, not only local map cleanup. |
| Service inspect accepts desired active as ready, including initial recorded_not_running. | Source-confirmed decision defect; Q4 must prove actual public construction and invocation. |
| P6 merged NDJSON fallback can supply required-file coverage without equivalent original-execution validation. | Existing evidence-owner gap, routed to Q7; preserve valid per-host proof. |
| Seed/spread are expensive; synchronous work can share cooperative scheduling; some retained logs lack a compaction bound. | Measurement and qualification concerns, not a classified cause of the GCP failure. Q5/Q6 identify actual waits, costs and contract gaps before choosing a repair. |

If newer code already resolves a schedule, record the exact source and
applicable original proof. Preserve that work rather than reproduce a second
implementation. A refuted source hypothesis receives a reasoned disposition;
it is not replaced by a fabricated failure.

## 3. Quest and owner map

Q labels are navigation within this proposal, not new Solver state or ownership.
Each new record is discoverable as open/unsealed with zero attempts. Existing
unsealed records may already contain substantial implementation and review.

| Unit | Record and incumbent owner | Existing completion scope |
| --- | --- | --- |
| Q1: GSI creation effect ownership | New [gsi-creation-effect-ownership](../../quests/gsi-creation-effect-ownership/quest.json); current GSI writer, IndexService/lifecycle, schema and partition owners | Alpha 6; safety P1/P3/P5; 0.4.1 |
| Q2: Durable GSI completion handoff | New [gsi-completion-handoff-recovery](../../quests/gsi-completion-handoff-recovery/quest.json); same GSI/schema writer, serialized with Q1 | Alpha 6/10; safety P3/P5; 0.4.1 |
| Q3: Shutdown cleanup custody | New [remote-cdc-shutdown-cleanup-custody](../../quests/remote-cdc-shutdown-cleanup-custody/quest.json); current J6/live-query, transport and runtime-shutdown owners | Alpha 7/9/10; safety P4/P5; 0.4.1 |
| Q4: Achieved service readiness | New [service-inspect-achieved-readiness](../../quests/service-inspect-achieved-readiness/quest.json); CLI, service lifecycle/catalog and actual Cell/readiness owners | Alpha 2/8/11; safety P1/P5; 0.4.1 |
| Q5: Formation cost and original gate | Reuse [fresh-formation-user-table-routability](../../quests/fresh-formation-user-table-routability/quest.json); current formation/bootstrap/placement writer and integrator | Alpha 3/4; existing sealed physical acceptance |
| Q6: Operating envelope | New [application-operating-envelope](../../quests/application-operating-envelope/quest.json); runtime, query/partition, retained-resource and stabilization owners | Alpha 4/9; existing stabilization resource contracts; 0.5 qualification |
| Q7: Original evidence provenance | Reuse [quest-evidence-and-candidate-binding](../../quests/quest-evidence-and-candidate-binding/quest.json); current P6/evidence/proof writer | Alpha 2/12; safety P6; 0.4.1 |
| Q8: Installed application and retained restart | New [installed-application-retained-restart](../../quests/installed-application-retained-restart/quest.json); J1-J3/H5, stabilization J8/Q17, feature recovery and integration owners | Alpha 5-11 composition, consumed by 12; 0.5 |

Q1-Q3 preserve the solved
[Queryable Core J5/J6 predecessor](../../quests/queryable-core-0-3-2-journeys-completion/quest.json).
Q3 also preserves [natural shutdown](../../quests/node-startup-natural-shutdown/quest.json).
Q4/Q8 preserve completed
[service CLI](../../quests/service-install-lifecycle-cli-final/quest.json),
[developer-journey acceptance](../../quests/developer-journey-and-measured-comparisons-acceptance/quest.json)
and [compiled Hono journey](../../quests/h5-compiled-public-hono-journey/quest.json).
These are bounded successors for the stated gaps, not reopened terminal records.

Q5 is sealed and nonterminal. The solved
[formation-at-cause repair](../../quests/formation-spread-progress-at-cause/quest.json)
cannot be rewritten to absorb a different measured cause; use a bounded successor
if its existing seal does not cover the new repair.
Q7 is unsealed but has implementation and review evidence; continue its owner.
The [retained reader](../../quests/retained-read-view-generation-custody/quest.json),
[TX1](../../quests/replicated-transaction-decision-and-apply/quest.json) and
[retained original-seed handoff](../../quests/retained-seed-original-handoff/quest.json)
keep their current work and evidence. Completed seed rejoin is not generally
unsupported; Q8 must identify the exact interruption state it is exercising.

## 4. Structural requirements within the bounded repairs

These requirements are mandatory where applicable to Q1-Q4/Q6, using existing
[ES6 owner safety](../es6-owner-safety.md) and
[code navigability](../code-navigability-and-mistake-resistance.md) owners.
They do not create an independent repository-wide refactor.

1. Name producer, consumer, normal production construction, canonical request
   and outcome, and the exact authority/operation/incarnation domain.
2. Keep durable transition, remaining obligation and next continuation
   reviewable together. Closing a local promise or component step does not
   settle another owner's outstanding obligation.
3. Pass only necessary capabilities across a claimed owner boundary.
   Whole-owner helpers remain internal organization; file extraction alone is
   not an encapsulation result. Demonstrate the particular invalid access or
   decision that the changed interface rejects.
4. Validate current ownership where the physical effect occurs. A stale
   pre-await check, cache row or same logical index ID cannot substitute for
   the owner proof required by the effect.
5. Preserve explicit accepted, pending/deferred, completed, refused, failed
   and unknown meanings through public adapters. An unknown COMMIT is not
   an abort or permission for a blind new mutation.
6. Keep progress enabled while work remains: canonical event or bounded
   retry, identity-preserving redrive, and a supported shutdown/restart
   disposition. Observers remain passive.
7. Prove real owner construction, adverse boundary histories and the next
   consumer's data/resource state. A reducer alone or hand-built semantic
   substitute cannot establish production composition.
8. Remove replaced alternative decision paths. Use ordinary supported ES6;
   preserve the approved exclusions on TypeScript/checkJs, new build steps,
   generic workflow/outbox/schema/DI frameworks and duplicate ledgers.

Broad Q1+ [core convergence](../core-architecture-convergence.md#status-and-activation)
retains its cutover and fresh Q0 READY conditions. This proposal does not
activate it or approve a worker-pool redesign in advance of a measured cause.

## 5. Bounded quest specifications

### Q1. GSI creation effect ownership

**Interaction:** public CREATE INDEX through IndexService and
GlobalIndexLifecycleCoordinator into distributed dataset reconciliation.
Writable responsibility is creation admission/identity, the reconciliation
port, and necessary producer/consumer witnesses; unrelated index or SQL
restructuring remains outside the assignment.

**Red schedule:** use a populated base table and the production schema/partition
construction. A publishes an index in CREATING with a usable replica route.
Identical CREATE B enters redrive and pauses immediately before destructive
reconciliation. Let A finish backfill and reach READ_WRITE, then release B.
Assert the actual index dataset and indexed query result. Repeat the same
logical generation so a generation-only check cannot accidentally hide the gap.
[Source path](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/index-management/global-index-provisioning-lifecycle.js#L210-L225),
[effect boundary](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/index-management/global-index-distributed-execution.js#L253-L291).

**Required outcomes:** the duplicate joins/reconciles the same owned operation;
no delayed effect can reset completed data; the physical replacement boundary
rejects stale or wrong operation authority. Preserve actual changed-definition
DROP/recreate, empty/populated cases, zero-replica deferral, later writes and
normal readable-index progress. Do not turn required replacement into a no-op.

Proposed receipt meanings: concurrent-create-data-preserved covers the adverse
schedule and actual rows; destructive-effect-owner-bound covers stale/wrong
operation negatives; legitimate-replacement-and-redrive-preserved covers the
existing useful paths; independent-verification covers the reviewed composition
and original execution applicability. The initial red remains original evidence
in the Quest log; a green receipt must not label that failure as a passing run.

### Q2. Durable schema-to-GSI completion handoff

**Interaction:** schema provisioning terminal persistence, GSI catalog
transition/backfill, and startup recovery. Q1 and Q2 retain the same writer
and shared identity contract; integrate them in dependency order.

**Red schedule:** use normal engine construction, persist schema SUCCEEDED,
then terminate before GSI completion is invoked. Reconstruct new owners from
the original durable state and require the index to become useful without a
new client CREATE or observer-induced progress. Include interruption after
backfill starts, not only before replicas exist.
[Terminal cut](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/query/schema-provisioning-job-owner.js#L615-L631),
[recovery scan](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/query/schema-provisioning-job-owner.js#L731-L748).

**Required outcomes:** the existing durable schema/GSI owners retain and
rediscover unfinished completion. Their public result distinguishes component
provisioning from readable index completion. Late completion for a dropped or
replaced incarnation cannot act; unavailable authority retains bounded retry.
Preserve recovered physical IDs, changed definitions and previously proven
pre-provisioning recovery.

Proposed receipts: durable-handoff-rediscovered; recovered-index-data-correct;
replacement-and-unavailability-fenced; independent-verification. Each records
the exact durable cut, original/new process identities, actual data and resource
settlement. The implementation may use the existing catalog's unfinished state;
the proposal does not require another durable job system.

### Q3. Remote CDC cleanup at graceful shutdown

**Interaction:** live-query lifecycle, remote subscribe/unsubscribe transport,
producer registration, and runtime shutdown.

**Red schedule:** retain a deferred unsubscribe or an uncertain registration
whose producer may have accepted it. Enter consumer graceful shutdown while the
producer stays live and quiet. Clear the finite blocker and verify actual
producer-side removal. The existing shutdown clears the timer and retiring
records; an empty consumer map is not a completion oracle.
[Shutdown path](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/live-query/live-query-remote-cdc.js#L754-L766).

**Required outcomes:** use the supported bounded drain, existing transfer or
existing durable continuation that actually retains cleanup custody. Specify
what happens if shutdown's budget ends; do not promise retries after process
death without a supported surviving owner. Preserve ordinary retirement,
replacement, typed refusal, bounded redrive, wait cleanup, delivery assertions,
the CDC-superseded snapshot guard and successful quiet progress. Avoid adding
unrelated CDC events solely to make cleanup happen.

Proposed receipts: shutdown-producer-cleanup-settled;
uncertain-registration-custody-preserved; ordinary-delivery-and-retirement-preserved;
independent-verification. Measure producer resources and pending work, including
the finite-blocker and shutdown-deadline dispositions.

### Q4. Service inspect reports achieved readiness

**Interaction:** CLI inspection, SHOW SERVICE projection, installation catalog,
canonical lifecycle/Cell readiness, and the real public invocation path.

**Red schedule:** create an installation through its production command owner.
It requests desired active while rollout is recorded_not_running. Inspect
currently reports ready because desired state is treated as achieved state.
The rollout vocabulary has no active state. The old J1-J3 integration witness
asserts readiness before loading the handler into its dispatcher.
[CLI decision](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/cli/service-pipeline-command.js#L725-L760),
[catalog states](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/src/control-plane/owners/service-install-catalog-contract.js#L8-L21).

**Required outcomes:** requested intent stays distinct from observed usable
state. Initial/no-Cell, pending, reconciling, failed and unavailable-route
cases cannot report ready. Identify the canonical owner proving an invocable
route before replacing a string or adding another readiness derivation.
Preserve status identity, failure information, deploy idempotence and ordinary
SQL/CLI compatibility. The positive case publishes/deploys the actual compiled
artifact and invokes it through ordinary ingress after readiness; the witness
must not install a handler manually.

Proposed receipts: intent-is-not-readiness; unavailable-and-failed-service-not-ready;
ready-service-public-invocation; independent-verification. Coordinate any
canonical status/projection change with all affected consumers and current
capability/documentation producers.

### Q5. Formation critical path and unchanged physical acceptance

Continue the existing sealed formation unit; no new draft duplicates its gate.
Read original stage traces for seed readiness and system-partition spread.
For the first expensive wait, name owner, required authority/resource, admitted
work, concurrency bound, wake and genuinely dependent successors. Measure
repeated authoritative reads, unnecessary serialization and long synchronous
turns before selecting a cause.

The current bootstrap/placement owner owns the bounded correction. Preserve
repairEligible versus serveEligible, pure status, current applied-term
authority, quiet-ledger progress, identity/reservation negatives, and the
specific CDC APPLY_BEHIND_COMMIT refusal followed by success after application.
Do not regain progress through polling or fixtures that invent production facts.

The original named-three-host fresh-state gate remains three consecutive
passes within 420 seconds, with its full serving, spread and routability
predicates. The comparative harness's 240-second formation contract is
separate and unchanged. Record actual timing/headroom; a faster diagnostic
with altered hardware, deadline or acceptance is not either gate's pass.

### Q6. Qualify a bounded application operating envelope

**Interaction:** foreground SQL/WASI work, control progress, scheduling,
cancellation, retained readers/transactions/CDC, storage reclamation and replay.
Initial completion is 0.5 qualification. A discovered violation of already
admitted correctness stays a current correction under its existing owner.

Before a measured attempt, freeze the existing owning profile's hardware,
topology, dataset, offered/concurrent work, result limits, subscription and
background-operation counts, duration, interruption schedule, limits and
oracles. Consume the stabilization Q08-Q11 and alpha package 9 requirements;
do not choose thresholds after observing a result.

Measure longest execution turns and owner waits, foreground/control completion,
queue depth/age, retained obligations, cleanup settlement, memory/storage/log
growth and restart/replay cost. Include finite pressure, a slow replica,
cancellation and finite-blocker removal followed by useful work. Unsupported
evidence is a gap, not a zero-work pass.

**Required outcomes:** correct acknowledged effects; bounded admission and
owned queues/resources; control and foreground progress within declared
contracts; actual reclamation and reconstruction under the existing owners.
Preserve mandatory two-cycle physical compaction/retention and reconstruction
proof where required. Merely documenting growth cannot waive those obligations.

Source shows cooperative Promise dispatch and synchronous partition work;
it does not prove either caused the observed GCP delay. Use measurement to
choose bounded batches, safe yielding or a necessary worker boundary. Any
native/SQLite ownership change requires its own bounded transition and proof;
this proposal does not activate broad threading convergence.

Proposed receipts: declared-envelope-executed; pressure-preserves-obligations-and-progress;
retention-cleanup-and-replay-bounded; independent-verification. Bind the
declared profile and original execution, including supported limits and any
remaining unsupported workload. Use the existing resource and workload owners.

### Q7. Admit coverage only from original execution

Continue the existing P6/evidence Quest and writer; do not add another receipt
ledger or replace its acceptance. The source schedule is a valid original host
execution for required file A, no per-host NDJSON, and a merged summary adding
required file B with success/assertions despite no corresponding validated
original B execution. The fallback imports B into coverage.
[Fallback](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/scripts/checks/lab-evidence-report-inputs.js#L592-L599),
[coverage consumer](https://github.com/psvensson/lagrange/blob/b85ba795076b9457b68b83698bc74898b4724cc9/scripts/checks/lab-evidence-report.js#L377-L402).

Exercise missing-original coverage, retry-marked merged rows, wrong source or
identity, conflicting totals and a valid complete original execution. Preserve
supported valid input forms through the canonical validation path; derived
summaries cannot create execution authority. Retain actual complete per-host
Batch-L evidence and applicable earlier proof. Refusal correctness and valid
admission both require the real report producer and next acceptance consumer.

### Q8. Installed application and retained-state restart

**Interaction:** clean installed client, public SQL/service ingress, actual
artifact deployment, feature owners, same-version startup/recovery and shutdown.
Use the existing J1-J3/H5 application and Queryable Core journey material as
the starting fixture. Freeze one representative application's schema/data,
artifact revisions, operations, expected results and independent oracle in
the existing feature/acceptance specification before implementation.

The application must create and use real rows, transactions, admitted indexes
and subscriptions; publish/deploy/invoke/update a compiled WASI service; expose
truthful status; and complete new useful work after interruption. Record
acknowledged business results independently. Cover the declared non-seed,
seed/relevant-leader and client-disconnect cuts, plus supported full-cluster
same-version stop/start on original directories. Include selected pending
transactions, schema completion, propagation and cleanup.

**Required outcomes:** existing acknowledged results survive; in-flight work
settles or remains explicitly owned with supported continuation; fresh SQL
and WASI operations succeed; natural shutdown and failed-start resources settle.
Verify the interrupted node itself, not another writer's marker. Keep unknown
mutation outcomes explicit and use only proven reconciliation/idempotency.

The clean client must succeed without source checkout, author-side artifact
files, private metadata repair, in-memory handler injection or re-founding.
Measure the existing onboarding requirement under its declared prerequisites.
Document supported limits and next actions through existing capability and
operations producers. A reloadable evaluation remains distinct from a sole
authoritative datastore; backup/restore/PITR and whole-cluster disaster recovery
retain their later existing milestones.

Proposed receipts: installed-public-application-journey;
acknowledged-state-survives-retained-restart; unfinished-operations-resume-or-remain-owned;
post-restart-work-and-resource-settlement; independent-verification.
Consume Q1-Q4/Q6/Q7 applicability and feature-owner acceptance without turning
one reference application into the sole proof of every admitted capability.

## 6. Dependencies and execution cadence

| Stage | Work and dependency | Required handoff |
| --- | --- | --- |
| Reconcile | Integration owner checks actual refs, current writers, source schedules and original results. | Reuse, new bounded successor, refuted or awaiting concrete evidence for every unit; no competing writer. |
| Current corrections | Q1 then Q2 through the same GSI writer; Q3/Q4 and Q7 can progress independently where paths do not overlap. Q5 causal investigation continues with its incumbent owner. | Concrete transition, genuine red, affected positive/negative proof and independent review for each changing interaction. |
| Compose and qualify the base | Integration owner serializes merges and preserves applicable earlier proof. | Exact resulting SHA, affected execution, required full classified corpus and unchanged physical formation acceptance. |
| Smoke and measurement | Existing comparison owner consumes the qualified base. | Canonical local comparative smoke, then current-candidate GCP smoke and actual comparative measurement using original observations and declared profiles. Historical runs stay separate. |
| Complete useful-alpha qualification | Q6/Q8 preparation and focused investigations can proceed independently; final composed witnesses consume stable interfaces and required feature proof. | Measured operating limits, installed retained-application recovery, all twelve alpha packages accounted for, remaining full-release obligations explicit. |

This preserves the approved base-system -> physical formation -> comparative
smoke -> measurement sequence. It does not hold the current measurement attempt
behind a new universal refactor, whole-application framework or backup project.
Known correctness/false-success findings cannot be waived merely to obtain a
measurement. Broader feature/recovery owners continue already authorized work.

## 7. Scaffold, evidence and review discipline

Each new Quest has a schema-valid record, an initial decision finding and one
proposed test-receipt doneWhen. Its planned receipt does not exist yet. Missing
evidence is unavailable measurement, not a genuine red or a passing result;
start must not manufacture a seal from that absence.

Before implementation, the incumbent owner records the actual writable
interaction, dependencies and exclusions, then establishes a real
discriminating red through existing execution/proof machinery and follows
the [Quest workflow](../../../docs/steering/workflow-guidelines/solver-quests.md).
For already-correct current code, retain actual proof and use the supported
adoption/successor route; never revert active work merely to get a red.
For qualification, missing evidence alone is not a measured failing behavior:
the existing proof owner must establish the actual baseline or record the
unavailable input while other authorized work continues.

Receipt names above denote required meanings, not hand-authored pass flags.
Use existing producers to bind original output, source/artifact/runtime,
topology, profile, complete selection, retries and terminal outcome. Keep the
red and all applicable earlier evidence. Independent review covers the exact
changed interaction and proof inputs; after integration, bind affected execution
and review applicability to the composed SHA. Record pending runs with their
real IDs and an owner that will observe them.

This candidate's review checks owner fit, complete scope, genuine falsifiers,
evidence semantics, links and record validity. It creates no runtime acceptance.
The parent doneWhen, existing seals/logs and current integration summary are
preserved. Drafting requires documentation checks and independent proposal
review, not a new runtime, lab or corpus run.
