# Activation prerequisite audit and proposed unit boundaries

Status: **preparation only**. No activation quest was started; no production/test edits, tests or lab jobs were made for this audit. The governing charter is `solve/epics/raft-rs-full-cutover/activation-quest-charter-2026-10-17.md`, with owner rulings at lines 5–11. Source references below are relative to `/workspace/scratch/6d2a7b72384f/lagrange/`, read from lane `a251ce4fd9c980a78c0fd33d8a5f873161f90870` before the concurrent finality correction. This is a work partition and dependency audit, not an independent approval of an activation design.

## Outcome

The activation stage is a new production composition/producer quest. It cannot be completed merely by enabling the bound handler path already present in the lane. The source lacks the production journal/host composition, installed-catalog activation handoff, durable caller custody of pre-selection K, bound cohort producer, HELD workflow budget behavior, and the completion handoff from RETAINED services-row projection. The charter explicitly assigns most of these; the first two subsections below make two upstream prerequisites concrete so they are not missed in the implementation plan.

The new quest is started only once its design note and measured red-probe evidence exist, as the charter says. The probe itself reads evidence; it must not start the cluster. The learner cleanup-custody finding F3 is a precondition before a production root composes `messageGroupLearnerJoinHost`, and deletion of the unbound alpha shape is the final separately reviewed unit.

## 1. Two upstream contracts to name before implementing the planner

### Catalog installation currently ends as activation unsupported

The current production install command internalizes an artifact, records package/revision/installation, and returns (`src/service/service-lifecycle-command-owner.js:495–529`). The installation row already carries authoritative `service_definition_id` and `revision_id` (`src/control-plane/owners/service-install-catalog-owner.js:494–515`). It is initially RECORDED_NOT_RUNNING.

The actual production `ServiceInstallationReconciler` routes eligible ACTIVE/INSTALLED rows in its supported rollout states to `_reconcileUnsupportedActivation` (`src/service/service-installation-reconciler.js:207–220`). It explicitly records `ACTIVATION_UNSUPPORTED`, retryable false, then RECORDED_NOT_RUNNING (`:242–285,310–315`). Its production setup injects only catalog owner, partition services, clock and logger (`src/bootstrap/shared/service-installation-reconciler-setup.js:109–127`). It has no service-definition publisher or bound formation caller.

Consequently, the activation design must name how the existing installation owner hands an installed WASM service and its immutable revision to the existing desired-definition/runtime-reconcile owner, and explicitly supersede the unsupported behavior for this class. The service-definition model has no creation-revision field (`src/wasm-service/wasm-service-models.js:18–68`); this is not an instruction to invent a column. The existing catalog installation relation is available, and the design should choose the canonical lineage handoff rather than deriving revision from a mutable cache row. Request Cells and OCI keep their scoped behavior.

The installation reconciler listens to the SERVICE_INSTALLATIONS partition's leadership (`src/bootstrap/shared/service-installation-reconciler-setup.js:41–72`). The runtime placement owner listens to its own desired-state partition leadership. An installation-to-placement handoff cannot assume the two leaders are the same process or duplicate placement authority in the installer.

**First decisive witness:** a catalog install through the actual production command/reconciler produces the exact desired-definition/lineage input consumed by the runtime leader; it no longer produces activation-unsupported for that bound class. An inert fixture that inserts a prepared service-definition row cannot prove this seam.

### The complete selection request needs an existing durable caller owner

CONTRACT-R2:35–41 requires the caller to persist complete K and canonical request before its first `selectConsensusInstance` delivery, and retain it across UNKNOWN. K includes the nonce and the request includes the exact chosen founding peers. `ServiceLifecycleCommandOwner.prepareConsensusInstanceRequest` validates/captures bytes only; it does not persist anything (`src/service/service-lifecycle-command-owner.js:348–354`). There are no production callers of this helper or `selectConsensusInstance` in the lane.

The charter names the manager's per-founder `wasm_operations` origins and the referencing workflow rows after a binding exists. Those rows do not by themselves name who retained the complete pre-selection K before binding selection. The design must identify an existing durable operation intent which owns this caller request, its recovery on leader death, and unknown-result redelivery. It must not restore a new per-creation catalog row: CONTRACT-R2:27–41 expressly replaced that shape and says internal producers use their existing durable operation intent.

**First decisive witness:** stop the planning leader after an applied selection whose reply was lost; its successor recovers and redelivers the original K/request bytes, not a reconstructed new nonce or changed cohort. Include the never-applied branch with the same durable caller request. Existing selection decision-ring resolution and later per-founder creation retention remain their existing owners.

## 2. Charter-to-owner map

| Charter item | Existing owner / exact source seam | Work required before production activation |
| --- | --- | --- |
| B1 journal and service definitions | `src/bootstrap/shared/startup-service-lifecycle-owner.js:20–56`; manager setters `src/service/service-lifecycle-manager.js:130–159` | Bind manager writer/idempotency/recovery reads through the real system-table gateway, OWNER_RPC_REQUIRED and CONTROL_NO_INTERNAL_PROPAGATION. Inject the existing serviceDefinitionsOwner on both seed and joiner. No cache reader or local pretend journal. |
| B2 host dependencies | `src/runtime/runtime-startup-wiring.js:44–67,90–98`; physical dependency getters `src/wasm-service/wasm-service-lifecycle.js:143–181` | Supply node-owned port allocator, module mirror, time source, data-directory manager, service definitions, role/leader writers. Keep lazy getters where owners appear later in startup. Explicitly record this quest's scoped supersession of CONTRACT-R2:217–220. |
| B2 module availability | `src/wasm-service/module-mirror.js:48–76,139–162`; `wasm-service-lifecycle.js:691–718` | Merely injecting an empty ModuleMirror does not make a handler module available. Name the installed-artifact-to-local-module loading owner/provider and its completion before START. Existing production `new ModuleMirror()` at `src/entrypoint-runtime-admin-composition.js:75–78` belongs to SQL callbacks, not the WASM host. |
| B3 resource inventory | `src/control-plane/owners/service-definitions-owner.js:88–114`; `service-instance-metadata.js:139–152`; `service-instance-state.js:198–249` | Add owner read `readInstanceResources(S)` for selected/retiring bindings and bounded resource slots. Planner consumes canonical facts; it must not parse private row JSON or treat cache absence as no resource. |
| B5 bound-class discriminator | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js:77–118`; `runtime-service-policy.js:18–31` | Consume installed catalog WASM creation lineage through the named handoff. Request Cells/built-in meta are excluded. A bare runtime_kind is not enough for the production planner. |
| Cohort K and revision | `src/service/service-lifecycle-command-owner.js:348–354`; `src/control-plane/owners/service-install-catalog-owner.js:394–404` | Use command owner's constructor, authoritative catalog definition, exact current selection version, existing durable caller custody, one retained K across uncertainty. Rebalancer currently lacks these injected capabilities and authenticated/system-owned caller context. |
| Founder count/placement | `src/rebalancer/unified-rebalancer-rebalance-loop.js:241–283` and spread-policy owner | N is odd and >=3; >9 is CAPACITY_EXHAUSTED; distinct-node shortage is COHORT_NODES_INSUFFICIENT. Invalid counts are typed, never silently clamped. The owner must resolve the zero-replica desired-state case explicitly rather than inherit the generic policy's nonnegative count convention. |
| One original creation ID | `src/rebalancer/rebalance-coordinator-operation-creation.js:610,798–807,900–906`; manager `prepareConsensusCreation` | `move.operationIntentId` equals original slot operation ID. Planning node retains original creation/admission before that founder's CREATE dispatch; workflow row references it. Record which runtime policy checks run on planner and receiver. |
| Partial dispatch / leader replacement | resource view above plus existing operation creation owner | Converge per slot: retained admission with missing workflow is dispatched under its existing operation ID. Do not promise all-or-none dispatch: each created workflow currently arms itself. New leader reads slot token, recovers the original manager journal authoritatively, and re-dispatches unchanged. |
| B9 HELD step | `src/constants/workflow.js`; `src/rebalancer/executor-outcome-constants.js:120–125`; `operation-workflow-executor-outcome-reconcile-methods.js:35–46,60–69`; `replica-operation-liveness.js:72–83` | Add actual HELD workflow state and owner timeout constant; update transition/rank/step consumers and typed failure deferral. The handler currently emits CREATE_HELD with CREATING. A string rename alone cannot satisfy the live-slot invariant. |
| B9 top-level timer | `src/rebalancer/operation-workflow-recovery-status-reconcile.js:701–775` | Reaper checks both per-step time and whole operation budget. Preserve no-FAILED while exact slot ADMITTED/PUBLISHED under both paths, including metadata unavailable and typed deferRetry. Re-anchor legitimate held wait at its owner; do not reset arbitrary timestamps to hide time spent. |
| R14 cross-node wake | `src/bootstrap/shared/runtime-service-rebalancer-setup.js:135–145,355–386` | SERVICE_INSTANCES cache change wakes the rebalancer for that exact `record.service_id`. Events are triggers; periodic re-evaluation already exists, and resource facts still come from the owner read. |
| R2 identity readers | Section 3 below | Canonical replica_id and group_id identify bound rows; physical service_id must not disappear at SQL prefilter or be counted as a new logical canonical replica. |
| Deleted definition / dead founder | runtime reconcile-set owner `src/bootstrap/shared/runtime-service-rebalancer-setup.js:185–203`; existing selection/retirement owners | Dropping a removed definition's rebalancer does not retire its resource slots. Give ACTION.RETIRE its caller. A dead node's local retirement cannot be forged by another node; route to named recovery/operator-retirement fact owner. |
| F3 learner cleanup precondition | Candidate composition finding, not lane implementation | Route candidate learner CREATE failure through host cleanup custody before composing its learner join host in production. See Section 5 for local source limitation. |
| RV4.5 RETAINED→PRESENT | `src/query/runtime-replica-state-projection-owner.js:94–143`; `src/query/sql-query-engine-lifecycle-and-callback-dispatch.js:379–395`; `src/runtime/service-runtime-consensus-publication.js:46–52,97–104` | Real projection submit always answers RETAINED. Consume its exact APPLIED completion through the existing projector before endpoint/PRESENT/ACTIVE. Repeating START alone never returns an applied receipt from submit. |
| Startup inventory | `src/bootstrap/shared/runtime-service-handler-setup.js:177–196`; `guarded-runtime-service-handler.js:13–37`; seed/joiner callers below | Construct handler with engaged restart latch, apply corrected recovery task, then register transport. Propagate awaits through both startup roots and cleanup ownership. Decide generic-row recovery before wiring. |
| Endpoint currentness sweep | `src/control-plane/owners/endpoint-incarnation-currentness.js:6–7,54–76`; runtime endpoint remover | Currentness view is pure and filters stale rows; it does not delete them. Name actual production cleanup caller and ownership, including REMOVE before restart re-projection leaves old-incarnation row. |
| B8 final alpha deletion | Charter:69–73; stage-1c vet measured inventory | Delete old unbound WASM group/OPEN shape only after bound production E2E proof, as a separate independently reviewed unit. Append superseding witness records; do not erase prior evidence. |

## 3. Exact identity-consumer census

The existing classifier `runtimeServiceReplicaBelongsToEntity` consumes a string (`src/rebalancer/runtime-service-replica-identity.js:52–55`), while bound runtime projection uses a physical row primary key and retains canonical `replica_id` plus `group_id`. The following consumers need individually reviewed behavior:

| Consumer | Why it matters |
| --- | --- |
| `src/rebalancer/unified-rebalancer-replica-state.js:273–311` | Actual placement inventory must see existing bound founders. |
| `src/rebalancer/rebalance-coordinator-replica-identity-methods.js:434–474` | Canonical allocation must exclude founders' canonical IDs; line 463 currently prefers `row.service_id` over `row.replica_id`. |
| `src/rebalancer/priority-publication-safety-rows.js:106–136` via shared entity read | REMOVE safety must see the real bound physical resources. |
| `src/rebalancer/rebalance-replace-intent-identity.js:150–154` | Replacement source/target identity must not reject or conflate physical rows. |
| `src/rebalancer/operation-workflow-recovery-status-reconcile.js:141` | Workflow recovery must match the intended canonical replica. |
| `src/service/binding-route-actuals.js:51` | Review whether this request-binding route can see bound group rows; do not widen request Cell routing accidentally. |
| `src/runtime/runtime-endpoint-publication-wiring.js:62–65` | Logical-to-actual identity resolution must understand the row's canonical identity while writes remain physical/exact-incarnation. |
| `src/rebalancer/replica-operation-repository-entity-read-methods.js:289` | Operation/actual association must use the same canonical rule. |

Shared SQL owner: `src/rebalancer/entity-service-row-read.js:27–29,49,70–73`. `service_id LIKE 'S-r%'` filters out bound physical IDs before a corrected classifier can run. The SQL and its row classifier must be one unit. Do not introduce a permissive physical-prefix heuristic that accepts another service or incarnation; consume canonical row fields and exact retained binding where that decision needs authority.

## 4. Startup and projection ordering details

### Startup await chain

`RuntimeServiceHandlerSetup.create` currently constructs, initializes and registers the handler synchronously (`src/bootstrap/shared/runtime-service-handler-setup.js:177–196`). Its safety-gate wrapper is also synchronous and attaches the runtime rebalancer immediately (`src/bootstrap/shared/guarded-runtime-service-handler.js:13–37`). Seed startup calls `initializeRuntimeServiceHandler()` without awaiting it at `src/bootstrap/bootstrap-service-seed-workflow.js:487`; joiner does likewise at `src/bootstrap/node-joining-admission-readiness.js:189`.

Adding an async scan inside the setup alone would therefore permit startup/dispatch to continue before inventory and would alter safety-gate error handling. The entire one setup chain must await readiness under the already-acquired data-directory owner. Failed startup cleanup must retain the acquisition ledger's directory custody; the corrected U1 physical lifecycle must join admitted by-path tasks before release. R2-G's generic rows are presently skipped by the recovery handler's `SKIP_GENERIC_ROWS` resolver. Production must deliberately decide whether and how generic PENDING/IN_PROGRESS operations re-run; do not silently invoke generic effects as a side effect of enabling bound recovery.

Quorum-loss journal recovery is a separate production prerequisite from U2's local PUBLISHED reopen on unavailable instance metadata. The original journal is still required to identify the creation; OWNER_RPC_REQUIRED can be unavailable during metadata formation. The production recovery design must name the minimal authoritative journal availability it relies on and avoid a circular requirement for full serving readiness or a cache substitution.

### RETAINED projection receipt

`RuntimeReplicaStateProjectionOwner.submit` enqueues by physical service ID and returns `retained: true` on every live call (`:94–124`), including repeated requests after a previous apply. Its `APPLIED` event is emitted after the actual row write (`:127–143`). The runtime bound projector currently returns PUBLISHED_UNPROJECTED immediately when the submit answer is retained, before endpoint publication or PRESENT marking.

The activation design should expose/consume the existing APPLIED result for the exact physical row, original creation/cause identity and current runtime lifetime. Register interest before submission or provide an owned replayable completion receipt so a fast apply cannot be missed. After apply, continue the existing runtime projector's endpoint and exact-token PRESENT steps; do not add a second confirmation or publication algorithm. Superseding STOPPED, shutdown, replacement and an obsolete APPLIED receipt must be covered. A stopped projection owner returns `{retained: false, state: STOPPED}`: absence of `retained: true` must not be accepted as an applied success by a widened boolean test.

U2's late-confirmation-to-existing-projector seam remains part of the recovery work. This production receipt mechanism is explicitly charter RV4.5 and must not be mistaken for proof already supplied by the embedding's synchronous writer.

## 5. Proposed reviewable units and dependency order

The order below keeps changes coherent at their owner interactions. Independent preparation can overlap; source units still follow approved contracts and independent verification.

| Unit | Bounded deliverable | Decisive proof | Depends on |
| --- | --- | --- | --- |
| P0 design/probe and learner-custody prerequisite | Freeze activation design and measurable claim. Repair candidate F3 through existing cleanup owner before production learner-host composition. | Real learner CREATE failure retains/joins exact failed host cleanup; shutdown cannot release custody early. Red evidence exists before new quest start. | Candidate source and named cleanup owner available; U1/U2 acceptance available for final composed proof. |
| A1 installation lineage and durable selection-caller intent | Existing catalog install hands immutable WASM lineage to existing desired/reconcile owner; existing durable operation owner retains pre-selection K/request. Explicit supersession of activation-unsupported only for intended class. | Actual production install reaches planned bound input; lost selection reply/leader death uses byte-identical retained K and no new catalog row. | Design must resolve exact handoff and caller-intent owner first. |
| A2 authoritative resource/identity views | Bounded `readInstanceResources`, canonical bound-class input, all eight identity consumers and shared SQL filter. No cohort dispatch yet. | Real selected/retiring resource table; bound physical row observed by planner/safety/allocation, foreign row rejected; request Cell/meta routing preserved. | A1 lineage shape; current immutable binding/slot contracts. |
| A3 production node lifecycle/startup composition | Manager real journal + owner injection; port/module/artifact dependencies; corrected inventory before transport on seed/joiner; explicit generic recovery choice. | Actual root uses gateway owner reads/writes, admits no message before inventory, recovers under directory lock, failed cleanup retains ledger lock; actual installed handler module available without fixture injection. | Corrected U1 and U2; F3 before learner-host production composition; journal-under-quorum decision. |
| A4 HELD workflow and live-slot failure ownership | Canonical HELD step, own timeout, step transitions/ranks, reaper budget rule, bound deferRetry. | Advance both step and total budgets while exact slot ADMITTED/PUBLISHED: no FAILED; owner unavailable remains explicit; closed/sealed counterexamples may take correct terminal path. | A2 authoritative resource/operation identity; no dependency on full production formation. |
| A5 retained projection completion and endpoint cleanup | Real RETAINED→APPLIED→endpoint→PRESENT continuation plus exact-incarnation cleanup owner. | Production projection owner yields RETAINED, then actual APPLIED completes same origin once; old/superseded completion cannot publish J or revive STOPPED; stale endpoint row removed by named sweep. | U2 projector seam and A3 lifetimes. |
| A6 cohort producer and production formation/retirement | Leader bound branch before generic calculateMoves; one K, N distinct founders, per-founder intent/token before dispatch, partial-dispatch and leader-replacement reconciliation, SERVICE_INSTANCES wakes, deleted-definition RETIRE caller, dead-founder routing. | Actual installed service forms native RF3 on production roots, serves only after grants, projects actual rows, survives partial dispatch and leader change with no fresh token; retires through exact owners. N/type/capacity negatives and unavailable-read controls. | A1–A5 and F3. |
| A7 final alpha deletion | Delete unbound WASM formation/OPEN branch and its dead meta helpers; append superseded witness inventory; preserve request Cells/other runtimes. | Bound production E2E stays green; no production or test reachable unbound consensus shape remains except explicitly retained distinct request-Cell paths; named old witnesses superseded, not weakened. | A6 E2E proof and separate owner/verifier approval. |

This partition does not require an arbitrary number of commits: a unit may be adjusted by the owner if one interaction cannot be safely split, but P0/F3 precedence and A7 separation are ruled requirements.

### Candidate F3 source limitation

The candidate commit `e7a3525a5` tree is present, but the relevant message-group learner/handler blobs were absent in this partial clone. Read-only `git show` attempted the configured promisor fetch and failed because the proxy endpoint was unavailable. I did not escalate access, execute tests, or infer the missing implementation. The F3 requirement above comes from the approved charter and closeout composition finding; it is **not independently source-verified in this audit**. The implementer must read the actual candidate's learner CREATE failure, `releaseLearner`, and host cleanup-custody owners before authoring that correction.

## 6. Decisions still needed in the activation design

- Exact existing owner for durable pre-selection K/request and its leader-recovery protocol; no per-creation catalog row and no reconstructed UNKNOWN request.
- Installed-catalog to desired-definition/creation-revision handoff, plus rollout state behavior after the former activation-unsupported result. Identify leader handoff rather than assume one leader owns both concerns.
- Whether a desired replica count of zero means no formation/retirement or is an invalid bound formation request. Charter odd >=3 and generic nonnegative-count behavior must not silently disagree. Same question for write-time validation versus typed planner refusal.
- Named authenticated/system-owned command context for internal `prepareConsensusInstanceRequest`; the existing helper validates nonempty tenant/principal and roles (`service-lifecycle-command-owner.js:121–135`). Do not fabricate a fixture security context in production.
- Generic startup recovery policy and authoritative journal availability during quorum loss, with the exact async startup/cleanup chain.
- Actual module bytes/provider/validation handoff from installed artifact storage to each founder's node-owned ModuleMirror. No production pullModule caller currently fills that cache automatically; SQL callback cache population is a different owner.
- HELD timeout scope across both child step budget and parent operation budget, and the no-live-slot-failure owner interaction for unknown authority answers.
- Exact RETAINED/APPLIED receipt lifetime, cancellation/supersession and endpoint-currentness cleanup caller.
- Route for an unreachable founder whose local resource cannot be retired by another node. Keep the named operator-retirement fact follow-up explicit if recovery cannot supply it; no forged local tombstone.

## 7. Completion after activation

The root still owns stage-1c queued-lab classification, the two lane regression bisections, final composition and the merge path. Passing isolated activation witnesses is not the certification formation record.

The closeout plan requires the full corpus and static gates on the exact frozen candidate, then **three consecutive certification formations at that same SHA on five distinct eligible machines**, with independently observed publication convergence/stability, no spent wait, committed manifests/verdicts/gates and node-log digests (`solve/epics/raft-rs-full-cutover/closeout-plan-2026-10-17.md:124–134`). A red run resets the consecutive count after correction. The integrated report then receives category-complete independent approval before merge/publish (`:136–148`). This audit starts none of those jobs and claims none passed.

## Prepared artifacts to reuse

- `u2-owner-plan.md`: exact recovery U2 owner seams and witnesses.
- `u2-progress-bound-amendment-draft.md`: approved K-write/event wording and implementation/revision choices.
- `u1-reservation-finality-bounded-verdict.md`: digest-bound approval of finality alone.
- `u1-inventory-continuation-contract-v2.md`: draft complete collision/debt/currentness/lifetime contract for remaining U1 correction; awaits owner judgment and independent review.

The substantive activation owners listed above have been read sufficiently to map their current behavior; implementation still requires a fresh full read of each unit's touched owners at its reviewed head, including the candidate-only F3 source that is presently missing locally.
