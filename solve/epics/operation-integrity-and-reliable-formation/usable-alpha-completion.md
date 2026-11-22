---
audience: agent
documentClass: planning
---

# Usable alpha completion: the implemented SQL and WASI product

Approved by the user on 22 November 2026 after independent source review of
the recommendations. This document supplies the execution sequence within
[operation integrity](../operation-integrity-and-reliable-formation.md).
Start with the [implementing-agent note](usable-alpha-start-here.md) to fit
the plan to work already in progress.

## Objective and authority

A developer can install an identified candidate, use every capability admitted
into the completion scope through its ordinary public interface, preserve the
application through supported interruptions and same-version restarts, and
continue useful SQL and WASI work within measured resource limits.

The twelve packages below are required completion work for that objective,
not a priority list whose later entries can silently disappear. They are
navigation and scheduling labels, not twelve new Quest IDs, a second capability
declaration, a new receipt format or replacement acceptance authority.
Continue existing open owners; a demonstrated gap in completed work uses a
bounded successor with preserved lineage. A package closes only through its
applicable existing acceptance, or an explicit scope decision that records the
remaining obligation. A temporary refusal can repair false success without
completing the refused feature.

The [feature map](../../../docs/development/agpl-feature-map.md) retains the
ordered 0.4.1 correctness/claim repairs and 0.5 remaining composed Queryable Core,
service and pilot acceptance. Historical numeric task prefixes do not change
that allocation. This usable-alpha view neither closes the whole 0.5 release
nor waives its comparative, security, locality or upgrade obligations. New OCI,
transport, cross-region, backup/PITR and broader SQL capabilities retain their
existing milestones. Current admitted correctness cannot be deferred by moving
a broader qualification label.

One integration owner maintains the current summary in the parent epic; each
changing interaction has one writer. The workflow, feature specifications,
sealed predicates and original evidence remain with their existing owners.
No rule-set revision, runtime permission or automatic reassignment is introduced.

## Evidence baseline and limits

The approved review inspected candidate
[9aa1aed42](https://github.com/psvensson/lagrange/commit/9aa1aed420f3e4427cda3f100a801b7af7579133).
The source check for this adoption also inspected its successor
[b3985c9e7](https://github.com/psvensson/lagrange/commit/b3985c9e721636173b79771d29b2e951c688b816),
the withheld-dispatch red-witness commit, under rule-set revision 5. Documentation
is prepared independently from main
[1c66f6df4](https://github.com/psvensson/lagrange/commit/1c66f6df4d37a79d31ef321b54c6865ee7a8a87a);
these are different source identities. This adoption contains no executed
runtime proof. Dated branch findings require reconciliation before implementation.

Preserve the existing distinction between implemented components, integrated
public behavior, measured behavior and supported operating claims. In particular:

- The kernel tenure fence is already in the candidate. Hono, typed selectors,
  paging, structured partials and direct-call keys have implementations and
  historical completion records. Their remaining composition must be measured.
- The seed-restart scenario can catch restart failure, omit post-restart checks
  and write the final marker through another node. The scale/failure scenario's
  run method constructs default success evidence without performing the named
  workload or node failure. These are source-verified acceptance-path defects,
  not newly measured production incidents.
- Ordinary global-index construction supplies only a logger to its lifecycle
  coordinator, whose defaults include empty backfill input and no-op writes.
  That source finding requires a public production-construction witness; a
  manually wired coordinator fixture cannot close the missing interaction.
- Current PostgreSQL Describe and retained-reader custody findings already
  have open follow-up owners. Preserve their original source findings and
  obtain discriminating executed witnesses rather than inventing a passing
  receipt or rewriting a predecessor's solved record.

Pinned source references for those findings: [seed restart](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/test/distributed/scenarios/seed-restart-under-load.js),
[scale/failure run](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/test/distributed/scenarios/public-path-scale-and-failure-certification.js),
[global-index construction](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/src/index-management/index-service-global-methods.js),
[backfill defaults](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/src/index-management/global-index-backfill-coordinator.js),
[Describe](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/src/runtime/pgwire-extended-query-handler.js),
and [retained readers](https://github.com/psvensson/lagrange/blob/b3985c9e721636173b79771d29b2e951c688b816/src/service/call-shard-read-view-manager.js).

## 1. Reconcile the completion scope and candidate

**Owner:** integration, capability/documentation owners and each existing feature
owner. Consume the [Queryable Core pickup map](../../specs/release-0-3-queryable-core/tasks.md)
and [documentation lifecycle](../../../docs/development/documentation-lifecycle.md).

1. Record actual main, candidate, branch inputs, dependencies and intended
   distributable artifacts; reconcile local unpushed work with its writer.
2. Inspect materially advertised capabilities through their actual public call
   paths. For each, link the entrypoint, implementation owner, current behavior,
   applicable original evidence, specific gap and continuation owner in the
   existing capability/feature records and epic summary.
3. Resolve disagreements between release prose, generated labels and source.
   Retain implemented features and unfinished contracts; identify declaration-only
   paths and genuine future capabilities without silently dropping obligations.
4. Establish evidence applicability by source/content and dependency identity.
   A version string, green marker or historical solved status is insufficient.

**Completion:** a finite target with a disposition for every material claim and
a concrete next owner/action for each unfinished included capability. No runtime
support is graduated by this planning reconciliation alone.

**Dependencies:** begins immediately; its decisions bind packages 5-11.

## 2. Repair acceptance paths that can produce unsupported success

**Owner:** [quest-evidence-and-candidate-binding](../../quests/quest-evidence-and-candidate-binding/quest.json),
the existing proof authority and affected scenario owners. Consume the
[release-gate policy](../../../test/guidelines/release-gate.md).

1. Make seed-restart acceptance require the interrupted node to reopen original
   storage, rejoin and complete the required post-restart checks. Record
   surviving-node availability separately from recovery of that node.
2. Keep simulated scale/failure data in its fixture role. Physical admission
   requires actual workload execution, fault action, client outcomes, recovery
   observations and host telemetry; absent values never become default success.
3. Reject wrong source/artifact identities, missing phases, health-only responses,
   missing final answers, default executed flags and synthetic physical metrics
   at the same boundary that admits a claim.
4. Prove rejection with known-bad inputs and retain a valid executed positive
   path. Source-marker guards remain structural checks.
5. Start exact candidate package/image consumer startup checks here so packaging
   is diagnosed before final application qualification.

**Completion:** a failed restart cannot satisfy a recovery receipt, an unexecuted
drill cannot satisfy physical acceptance, and genuine execution remains admissible.
This bounded repair does not itself certify every pilot topology or security cell.

**Dependencies:** package 1 identities. Independent causal repairs may continue
while this owner works; revised aggregate claims must consume the repaired admission.

## 3. Finish current authority and continuation repairs

**Owner:** existing Raft, transport, placement, operation-repository, workflow,
TX1 and CDC interactions. Consume [authority and recovery](../../../architecture/contracts/authority-and-recovery.md),
[runtime contracts](../../../architecture/runtime-contracts.md) and
[replica settlement fencing](../../quests/replica-settlement-generation-fencing/quest.json).

1. Continue the current bounded assignment described in the start note before
   selecting another source-changing unit. Reconcile newer branch implementations
   and proof; do not recreate repairs already present.
2. Finish pure-status/current-authority composition. Every authority-sensitive
   caller names its consumed fact and the later boundary authorizing its effect.
   Explicit advancement/recovery owners must make progress without observer kicks.
3. Compose the existing kernel fence with Raft proposal/authority behavior.
   Cover queued higher-term input, candidate submission, configuration changes,
   stale continuations and legitimate current-owner success.
4. Complete retained-operation continuation through unavailable reads, lost
   replies, leadership loss/reacquisition and restart. Repair withheld-dispatch
   re-entry and canonical clearing-event wakes through the existing owners.
5. Preserve original operation identity, remaining budgets and obligations.
   Name what remains owed, its owner, clearing event and restart rediscovery.
6. Complete transport semantics through its current owner. Consensus envelopes
   and application request/response obligations retain their distinct contracts.

**Completion:** stale authority cannot produce effects; the legitimate current
owner can complete; finite blocker removal resumes the original obligation;
completion releases exactly its owned resources. No second ledger, scheduler,
authority facade or alternate decision algorithm is introduced.

**Dependencies:** package 1 and trustworthy evidence handling. Consumers may
prepare witnesses concurrently, but integrate against settled shared contracts.

## 4. Reduce background cost and pass unchanged formation

**Owner:** current Raft/transport/CDC work and
[fresh formation](../../quests/fresh-formation-user-table-routability/quest.json),
consumed by [canonical authority acceptance](../../quests/canonical-authority-formation-acceptance/quest.json).

1. Measure idle, formation and modest foreground work on the actual composition.
   Earlier GCP traces identify causes to investigate, not current performance.
2. Observe protocol frames, queued work, event-loop delay, persistence activity
   and CDC cost; finish measured redundant-work corrections through their owners.
3. Verify the existing empty-Ready change only skips persistence when there is
   no snapshot, entry or hard-state mutation to persist. Preserve the complete
   Ready/message/apply/advance lifecycle; mustSync alone is not this test.
4. Demonstrate useful SQL progress during replication and catch-up. Measure an
   actual native SQL/interrupt obstruction before proposing broader isolation;
   consume existing worker mechanisms and retain their milestone boundaries.
5. Freeze the composition and run the original physical formation acceptance.

**Completion:** three consecutive fresh-state successes on the original named
three-host profile within 420 seconds, preserving all original serving, priority
spread, quiet-window, CREATE/COUNT, every-node INSERT/readback, learner-address,
projection and observation predicates. Satisfy Q9 natural-exit/cleanup proof,
the applicable aggregate receipts and full gates as additional obligations;
they do not rewrite the original formation seal. A different-resource diagnostic
cannot replace that seal.

**Dependencies:** relevant package 3 contracts and package 2 evidence admission.
This early resource check does not establish final foreground lifetime/capacity.

## 5. Complete public SQL, transactions, locking and Describe

**Owner:** Queryable Core J2/J4, TX1, participant apply/release, and existing
[Describe](../../quests/postgres-wire-description-contract/quest.json) and
[locking](../../quests/locking-read-authoritative-reservations/quest.json) follow-ups.
Use the [public SQL/locking journeys](../../specs/release-0-3-queryable-core/user-journeys.md).

1. Exercise the supported SQL slice through pinned ordinary drivers on separate
   nodes: parameters, empty/NULL results, precision, text/compound keys and
   partition-boundary behavior, with independent expected results.
2. Derive Describe parameter/result metadata through the existing parser/catalog
   and adapter without executing effects. Bind, formats, OIDs and DataRow must
   agree; unsupported behavior is explicitly refused.
3. Prove prepare-first single/multiple-participant TX1, durable decision before
   fanout, settlement, lost replies and reopened replicated participant state.
4. Use two public sessions on different processes for locking and conflicting
   writes, indexed/scan discovery, omitted or aliased PK projection, intervening
   writes before acquisition and disjoint-row progress.
5. Exercise commit, rollback, disconnect/cancellation, partial acquisition,
   participant restart and leader change; prove release and successor progress.
6. Preserve refusal, rollback, commit and unknown outcomes as distinct results.
   No blind retry or new attempt identity may erase an unresolved mutation.

**Completion:** actual public clients observe the admitted contract and every
conflicting write consumer honors authoritative reservations. Unsupported modes
are refused before effects or implied success. A temporary refusal repair keeps
the broader feature obligation open. New general public mutation keys retain
their existing 0.5 owner; no new global snapshot/isolation contract is implied.

**Dependencies:** package 3 contracts; package 4 for composed physical runs.
Split source changes at the demonstrated owner interaction.

## 6. Complete index production integration and lifecycle

**Owner:** Queryable Core J3/J5, IndexService, partition lifecycle, planner and
TX1. Consume the [index journeys](../../specs/release-0-3-queryable-core/user-journeys.md)
and [existing synchronous nonunique GSI contract](../../specs/global-secondary-indexes/requirements.md).

First preserve local/compound index work and exercise public create, an eligible
query, key-changing writes, restart, a subsequently provisioned partition, another
query and drop. Check physical index presence and actual index engagement in
the same accepted query, alongside independent complete-result equality.

Continue global indexes through three bounded interactions:

| Continuation | Required production result | Completion evidence |
| --- | --- | --- |
| Durable lifecycle | Ordinary DDL uses the existing catalog and replicated partition provisioning; restart reconstructs state. | Partial provisioning cannot advertise readable completion; durable objects match the declared lifecycle. |
| Synchronous maintenance | Ordinary INSERT/UPDATE/DELETE joins base and index participants to the existing TX1 before its participant set freezes. | Commit/abort/recovery independently reconcile both states; unavailable index participants cannot be skipped. |
| Backfill and read integration | Real partition enumeration, reads, writes, checkpoints, activation and planner/routing use the current lifecycle generation. | Concurrent changes remain covered; interrupted backfill resumes; stale dropped generations cannot affect recreation; eligible queries engage the index and equal a complete independent result. |

Start with ordinary default production construction, not another fixture that
injects the missing dependencies. Preserve the already-selected synchronous
maintenance mode. Measure required index fanout/cost without inventing a new
performance-win threshold. An unreadable index must preserve the canonical
complete-query behavior, never imply coverage it does not have.

**Completion:** each included index type provides its promised public behavior
and lifecycle. A false-success refusal alone does not complete GSI support.

**Dependencies:** packages 3/5 and settled key/planner/TX1 contracts; one writer
owns shared participant-admission changes.

## 7. Complete live queries through real producers and subscribers

**Owner:** Queryable Core J6 and the
[live-query task sequence](../../specs/generic-live-query-data-plane/tasks.md),
with SQL, partition CDC, topology and subscription owners.

1. Subscribe through the supported public interface on node A and commit an
   ordinary SQL change to a partition elsewhere; observe the unsolicited result.
2. Use actual SQL/CDC snapshot/frontier and occurrence identities for initial
   subscription, initially empty results, concurrent writes and reconnect.
3. Exercise leader changes and supported split/merge lineage.
4. Exercise slow consumers, disconnect and unsubscribe, including final-interest
   cleanup, bounded queues and explicit reset where continuity is unavailable.
5. Prove useful current results after finite interruptions and no idle
   change-discovery polling. Do not propagate user tables into every system cache.

**Completion:** remote committed changes produce correct public live results,
handoffs preserve the declared continuity contract and resources remain owned
and bounded. Injected callback events and in-memory query fixtures retain only
their component scope. External user-table CDC streaming remains separately
disabled; this work does not enable that API by implication.

**Dependencies:** packages 3/5 and applicable topology/retention contracts.

## 8. Complete the current public WASI and artifact journey

**Owner:** developer-journey J1-J3, current Hono/service owners, pilot Q2-Q5 and
artifact lifecycle. Consume the [developer journey](../../specs/developer-journey-and-measured-comparisons/requirements.md)
and [standard HTTP contract](../../specs/standard-http-service-api/requirements.md).

1. Build with the supported installed authoring package; publish canonical bytes
   through ordinary ingestion; remove publisher source/build outputs and stop it.
2. From a clean second client, deploy by registered identity and activate on
   another eligible node. Surviving canonical bytes must support activation after
   the applicable ingress/artifact-leader interruption within the declared quorum.
3. Exercise authenticated HTTP request and direct-call entry, genuine compiled
   WASI, actual partition-local reads and an independent business-result oracle.
4. Exercise implemented typed selectors and multi-shard input well above the
   old 4096-row per-shard batch limit under the
   [existing Q3 acceptance](../../quests/call-shard-paged-execution/quest.json),
   bounded paging, structured partials, repeated grouping keys, multiple
   operations and declared
   cancellation/replay/uncertainty behavior. No silent result truncation.
5. Update a stable endpoint during in-flight work; verify revision pinning,
   concurrent update conflict and interrupted/failed update recovery.

**Completion:** installed clients use the current public service contract with
real distributed execution, durable artifact activation and correct updates.
Historical narrower numeric-partial/fixed-selector examples cannot cap current
implemented behavior. Hono/selector/paging/partial implementations are reused;
their terminal records are not reopened to fabricate a stronger old verdict.

**Dependencies:** packages 3-5 and relevant package 9 physical-reader corrections.
Full comparison remains with its existing owner and is not discharged here.

## 9. Close physical resource custody and retained-state bounds

**Owner:** [retained-reader custody](../../quests/retained-read-view-generation-custody/quest.json),
existing cancellation/storage/transaction/CDC/outcome owners and
[stabilization J8/Q08-Q11](../../specs/release-0-2-7-stabilization/requirements.md).

1. Keep a reader owned by its exact storage incarnation until acknowledged
   closure. Exercise failed close, same-path replacement and sidecar retirement;
   derive snapshot metadata from the same pinned view as its rows.
2. Measure actual retained WAL/native bytes, shared-file attribution, count and
   age. Fixed per-view charges or forgotten handles cannot establish the bound.
3. Exercise cancellation during admitted SQL/WASI work; distinguish cancelled
   waiters, stopped execution, released resources and already committed effects.
4. Measure queues, waiters, readers, threads, diagnostics, user/control/message-group
   logs, CDC debt, transaction/reservation state and outcome/retired-identity debt
   under the declared workload and duration.
5. Complete existing retention/replay corrections and their safe horizons,
   compaction cycles and reconstruction through current owners. Generic TTL
   deletion cannot authorize reclamation of an unresolved obligation.
6. Enforce pressure/refusal before correctness or acknowledged work is lost,
   then prove useful progress after finite blockers clear.

**Completion:** declared finite operating bounds are observed and enforced,
required retention/reconstruction obligations hold and physical cleanup remains
owned. Do not promise constant disk usage for intentionally retained history,
or silently replace an existing mandatory retention correction with a caveat.
Query-attempt and CDC-image logical lifetimes remain separate.

**Dependencies:** package 3 lifetimes and the feature contracts exercised in
5-8. Start the bounded reader correction early; final workload qualification
combines this package with package 4's control-plane resource behavior.

## 10. Prove whole-application recovery on retained storage

**Owner:** integration and existing recovery/feature owners. Consume
[stabilization J8/Q17](../../specs/release-0-2-7-stabilization/requirements.md),
[seed recovery](../../quests/seed-restart-recovery-mode-v2/quest.json) and
[retained original handoff](../../quests/retained-seed-original-handoff/quest.json).

1. Create a representative application through public interfaces with real
   rows/schema/indexes, transactions, subscriptions, artifact bytes and revisions.
2. Record acknowledged results independently; interrupt a non-seed, seed,
   relevant leader and connection at defined boundaries.
3. Perform full-cluster stop/start through the supported same-version procedure
   with the same artifact and original data directories; no re-founding reset.
4. Include selected outstanding transaction, placement, propagation and service
   lifecycle obligations, lost replies and pending cleanup.
5. After recovery, verify prior results and perform fresh SQL/WASI work. Verify
   natural shutdown and failed-start resource release separately.

**Completion:** new processes reopen the retained application, preserve
acknowledged work, resolve or explicitly retain unfinished obligations and
return to useful service within the declared fault conditions. Recovery of the
interrupted node requires that node's evidence, not another writer's marker.

A completed seed already has a durable-peer rejoin path subject to identity
and revision fences. The deferred-serving frontier in interrupted original-seed
cold handoff is a narrower state, not a claim that every seed restart is
unsupported. Component reopen and snapshot tests remain useful but cannot alone
certify whole-application recovery. Cross-version upgrades, wiped-storage repair,
backup/PITR and power-loss claims retain their distinct existing contracts.

**Dependencies:** begin focused restart investigation with package 3; the final
application proof consumes 5-9 and repaired evidence handling from 2.

## 11. Complete the installed developer and operator workflow

**Owner:** CLI/management/diagnostics, installed-consumer journey and
[developer-journey documentation/onboarding](../../specs/developer-journey-and-measured-comparisons/requirements.md).

1. Use actual candidate distributions from a clean client with documented
   prerequisites and credentials; packaging checks began in package 2.
2. Complete start/join, connect, inspect readiness, create data, author/build,
   publish/deploy/invoke/update, diagnose, drain/stop and retained restart.
3. Measure the existing thirty-minute onboarding requirement with its recorded
   prerequisites and expected results; use an independent walkthrough.
4. Trigger a real failure and verify a useful supported next action. Status
   distinguishes starting, usable, unavailable, refused, failed and unknown;
   include the remaining obligation and recovery progress where relevant.
5. Reconcile canonical capabilities, generated output, examples, API/typings,
   current operations explanations and release instructions from measured facts.

**Completion:** a user succeeds without private metadata repair, server-side
author files, source-checkout dependencies or branch-history knowledge. Advice
does not imply rollback or safe blind retry for an unknown mutation. A polished
new dashboard is not required; truthful existing commands and outcomes are.

**Dependencies:** relevant mechanisms from 5-10. Prepare documentation throughout;
the final walkthrough uses the qualified installed composition.

## 12. Qualify, publish and confirm exact artifacts

**Owner:** release integration and
[stabilization J10/Q16/Q17](../../specs/release-0-2-7-stabilization/requirements.md),
using [RELEASE.md](../../../RELEASE.md) and the existing proof authority.

**Candidate verdict:** freeze source, dependencies, runtime/build identities,
artifacts, topology, configuration, workload, fault plan and resource bars before
acceptance. Run applicable focused/composed/full-corpus/release gates. Admit
prior proof only where the existing owner establishes applicability. Every
included capability has its required public and recovery/resource evidence.
A later source change or rebuild receives the applicable revalidation.

**Publication verdict:** after normal authorized publication, independently
retrieve artifacts and compare bytes/digests with the qualified candidates;
run the bounded installed-consumer check and verify registry metadata and public
instructions. Do not rebuild different bytes and relabel them as tested.
Preserve each successful external action if another artifact or metadata action
fails, while keeping its incomplete obligation visible.

**Completion:** both verdicts pass through their existing owners. No manual
green oracle, synthetic receipt or second certification ledger is introduced.

**Dependencies:** all applicable earlier packages and existing full release
requirements. This plan is not permission to publish a package version, spend
on cloud provisioning or bypass a gate whose authority is absent.

## Execution dependencies and test cadence

| Checkpoint | Parallel preparation allowed | Required composed result |
| --- | --- | --- |
| Establish target | Package 1, proof diagnosis/packaged startup in 2, existing owner reproducers. | Finite scope, actual candidate and owners, trustworthy claim admission. |
| Complete foundation | 3-4, focused retained-directory restart and feature investigations. | Settled shared contracts and unchanged physical formation acceptance. |
| Complete public features | Nonconflicting 5-8 work, early reader/retention corrections in 9, documentation. | Real public paths and resource custody through the shared contracts. |
| Continue after interruption | Whole-application 10 and fresh-client completion in 11. | Preserved state, useful successor work, measured limits and usable diagnostics. |
| Release | 12 and existing release-owner work. | Qualified candidate artifacts, then confirmed published artifacts. |

This orders integration and acceptance, not all investigation. In particular,
TX1, locking, global-index maintenance and recovery must share one writer for
changing participant admission/apply. Do not defer basic package startup or
restart investigation until the final checkpoint.

Use a measured causal witness, bounded repair, affected-consumer proof,
independent review, integration and then composed verification. Use the
[managed lab entrypoints](../../../docs/development/home-lab.md) and existing
selection/receipt owners; the [start note](usable-alpha-start-here.md) names the
current command route. Focused change selection does not replace final proof
of the full unpublished range or required statistical/endurance gates.

Documentation adoption runs applicable documentation, link, audience, roadmap
and generated-consistency checks plus review. It does not submit runtime or lab
work. Runtime, fixture, verifier and operative acceptance changes receive their
own affected proof. Re-run only for changed inputs, an unresolved risk, a missing
fault domain or an existing required gate.

## Completion and history

The milestone is complete when every capability admitted by package 1 works
through its ordinary public entrypoint on the qualified composition; required
interruption/recovery/resource behavior is demonstrated; a clean client can
install and use the published artifacts; and all applicable existing acceptance
obligations are satisfied. Formation alone is not that verdict. The parent's
existing formation receipt cannot stand in for the feature owners' wider claims.

Preserve terminal Quest records, seals, receipts and original failed results.
This includes Queryable Core journey completion, H1-H6, pilot selector/paging/
partials/service-v2, historical compatibility/scale/upgrade certification,
developer-journey acceptance and packaging closures. Continue actual open owners
and use bounded successors for new gaps. Correct current explanations and append
new evidence; do not rewrite history or reopen a solved record.

The integration owner's current summary records the actual next owner/action,
first demonstrated blocker, reviewed but unintegrated work and remaining
evidence. Labels in this execution view never substitute for those records.
