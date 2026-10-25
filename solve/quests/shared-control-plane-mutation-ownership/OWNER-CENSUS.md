# Mutation owner and caller migration census

Baseline: `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`.
Author: `subagent:/root/admin_review`, 2026-10-25.

This is a source-derived migration map for the proposed contract, not a runtime
acceptance verdict. The independent review of the earlier bounded admin
commits remains separate. No production source has changed in this worktree.

## Census method and limits

`evidence/current-interface-census.json` binds paths and SHA256 values for
every match of four literal method/property patterns under `src/**/*.js`:
59 `.submitMutation(` calls, 63 system-table mutation method calls, 18 nested
affected-count reads and 18 `result`/`response`/`executionResult.changes`
reads, in 72 files. Newlines between a receiver and its method are included.
Forwarding wrappers are counted. This is not a dynamic call graph, and the
counts overlap; they must not be added as a count of logical operations.

The earlier direct classifier census is 27 calls in 19 files. Following the
result interfaces exposed additional consumers that do not call the
classifier. Their authority requirements are included below. The physical
SQLite result consumers at the end are explicitly distinguished from
control-plane result aliases. A matching name alone does not justify removal.

All paths below are relative to `src/`. Line locations in the JSON refer to
the baseline and will move after implementation.

## 1. Producers and the application boundary

| Owner and source | Actual baseline fact | Migration requirement |
| --- | --- | --- |
| `partition/partition-service-entry-apply-base.js` committed-statement callback | After the application transaction, replies with `success:true`, physical `changes`, rowid and committed identity. Before that callback, the physical statement info is used to record outcome/CDC facts. | Project the canonical public count from this actual physical result. Do not move application publication before the commit callback or alter D2 owed-work recording. |
| `partition/partition-committed-statement-outcome.js` | Durable APPLIED replay supplies retained `changes`, or explicit `OUTCOME_NOT_RETAINED`; deterministic statement failure supplies `committed:true` with failure code/text. | Preserve named replay/count absence and original term/index/entry witness. A committed failed statement is settled without positive row effect. |
| `partition/partition-write-kernel.js` | Released/proposed failures can be `OUTCOME_UNKNOWN`; a failed answer can carry the identity of an entry that may commit. Explicit pre-proposal refusal is separate. | Preserve this causal distinction and all earlier uncertainty. No mapping based only on `success:false`, thrown versus returned, or transport delivery. |
| `partition/partition-participant-transaction-staging.js` | `success:true, provisional:true, changes` is validation over the transaction session's replay, before the durable transaction decision. | A count is not a committed-application fact. Keep this transaction receipt provisional and owned by the participant session; it cannot become control-plane `APPLIED`. |
| `partition/partition-participant-transaction-apply.js` | COMMIT operation results come from committed per-operation outcome rows; their physical counts can be null. | Preserve COMMIT/ABORT and operation ordering, immutable transaction identity and count-unknown semantics. Do not interpret staging and commit receipts through a shared success/count shortcut. |
| `partition/partition-service-remote-query-methods.js` | Remote reply forwards `changes`, replay state and durable witness; failures copy typed write facts. | Project the same supported partition result, including unknown replay and the true application stage. Preserve Q6 answer ownership and failure causes. |
| `query/query-executor-partition-request-builders.js` | Default successful request result copies physical `changes`, replay and witness from the application answer after transport delivery is confirmed. | Delivery is only the prerequisite for reading that answer. Preserve application/replay facts; no positive count or successful transport alone establishes commit. |
| `query/query-executor-sql-command-rendering.js` | Single and multi-partition outputs translate `changes` to `affectedRows`; named unknown replay suppresses the count. | Consume the one producer projection; retain exact zero versus absent count. Preserve partial-failure status, participant identities and statement semantics. |
| `query/distributed/parallel-query-partition-outcomes.js`, `straggler-detector.js` | Parallel result construction copies `changes`; the speculative result shown in `straggler-detector` does not copy replay state. | Trace actual speculative write admission before editing; a reached write result must carry the canonical application/replay facts, never a partial success-only projection. |
| `query/distributed/distributed-write-coordinator.js` | Aggregates canonical participant affected counts; named unknown replay among successful primary participants keeps aggregate count unknown. Mirror participants are distinct. | Preserve primary/mirror identity, participant failures and original write identity. Do not sum unknown as zero or treat a failed aggregate's partial count as completed mutation. |
| `cdc/cdc-integration-service-mutation-operations.js`, `cdc-integration-service-mutations.js` | INSERT/UPDATE/DELETE/UPSERT wrap lower results, update counters, emit events and expose visibility; count locations differ. | Build the sole canonical control-plane receipt from an actually committed lower fact. Classify uncertainty before success effects. Counters must describe the fact actually confirmed. |
| `cdc/cdc-integration-service-shared.js` and cache visibility owner | No-options visibility currently defaults to visible; bootstrap/no-cache paths may skip observation. | Preserve separate application and observation facts. Skipping a wait cannot publish cache or authoritative visibility. |
| `cdc/cdc-integration-service-authoritative-read-flow.js`; `bootstrap/system-table-writer.js` | Local and bootstrap adapters select `changes`/nested/root `affectedRows`. | Remove these downstream alternatives after the actual producer emits the supported field. No dual-shape transition period. |
| Gateway constants/classifier, mutation contracts/submission, request coalescing and telemetry | Can infer application from missing fields; produces explicit supersession/readiness outcomes; telemetry also guesses count and defaults to zero. | Extend the sole vocabulary with `UNCONFIRMED`; all metadata derives from its normalized snapshot. No side-channel applied/zero inference. |
| `control-plane/control-plane-write-identity.js` | `judgeAttempt` treats a nonthrown `success !== false` answer as SETTLED; `resolvePendingInstance` uses the same rule to name a prior instance APPLIED. | Consume canonical application/settlement facts. Preserve unresolved instances after malformed/unknown answers and preserve committed failure as settled. Completed zero, no-op, and prior positive row application remain different. Do not mint a new key to resolve an old uncertain write. |
| `control-plane/owners/system-metadata-owner-base.js` | Six generic row methods forward through the gateway under one retry owner; resolved `success:false` is wrapped as a metadata error. | Preserve the single retry/cause owner and canonical result. Generic owner completion cannot replace a specific row owner's exact predicate/readback. A typed thrown unconfirmed receipt must retain its identity and cause. |

Changing a count field is therefore insufficient. The producer projection
must be conditional on its actual execution stage. A provisional transaction
count, a physical local SQLite result and a committed partition receipt are
not interchangeable even when all contain the number one.

## 2. Exact identity and row-effect consumers

| Semantic owner and current source | Current completion gate | Required current-interface migration |
| --- | --- | --- |
| `bootstrap/owners/service-registration-handoff-owner.js` | Classifier applied shortcut, then exact service registration observation when needed | Canonical exact-one effect or that exact identity/version readback; keep handoff/cleanup custody. |
| `control-plane/node-terminal-transition-fence.js` | Applied shortcut or authoritative destination/incarnation observation | Exact-one conditional effect or existing readback; no terminal-state grant from unknown-count replay alone. |
| `control-plane/owners/endpoint-incarnation-authority.js` | Applied shortcut or exact endpoint incarnation readback | Preserve the endpoint generation guard, current/stale distinction and authoritative resolution. |
| `control-plane/owners/node-registration-incarnation-write.js` | Applied or named prior-instance completion, otherwise readback | Preserve genuine same-registration prior-instance proof. Do not label a zero/no-op pending instance as a positive birth. |
| `control-plane/owners/membership-publication-runtime-owner.js`; `rebalancer/node-storage-budget-service.js` | Forward birth/advance to the incarnation owner; budget publication consumes ACCEPTED/CURRENT semantic outcomes | These forwarding calls inherit the repaired canonical result. Keep the semantic owner outcomes; they are not control-plane receipt aliases. |
| `bootstrap/shared/node-registration-owner-durable-rejoin-methods.js` | Nested positive count shortcut, otherwise exact boot-incarnation readback | Use canonical exact-one effect, retaining the existing readback and original node identity. |
| `control-plane/node-lifecycle-publication.js` | Positive nested count completes an exact source-predicate publication; errors/zero/unknown go to authoritative readback | Require the exact-one canonical effect and preserve origin HLC. Keep mandatory readback when effect is unconfirmed or count is unknown. |
| `message-group/message-group-service-row-owner.js` | Activation/registration can return intended row on applied; removal always observes authoritative state | Exact-one effect or exact row reconciliation. Keep D2 service-handler custody and existing removal authority. |
| `partition/partition-service-row-owner.js` | Successful registration can mint evidence and publish leader | Exact-one registration or authoritative exact same-value read; never infer original seed transfer from receipt alone. |
| `node/replica-create-lifecycle-close.js`, `replica-recovery-service-row-admission.js`, `replica-state-machine-registered-activation.js` | Applied shortcuts precede lifecycle/identity readback | Same canonical exact-one or exact readback decision. Preserve create/cleanup tokens and current handler generation. |
| `node/replica-create-admission-owner.js` | Mandatory advancement/readback; classification largely chooses retry/errors or ends an attempt sequence | Preserve readback as admission authority, original boot incarnation and existing attempt ownership. |
| `node/replica-cleanup-tombstone-owner.js`, `replica-state-machine-failed-create-claim.js` | Acquisition, takeover, completion and release read the exact authoritative cleanup token after submission | Do not replace those reads with count shortcuts. Carry explicit uncertainty into diagnostics; an ignored mutation result is safe here only because the required subsequent read actually remains. |
| `node/replica-state-machine-durability.js`, `replica-state-machine-create-persistence.js`, `replica-state-machine-transition.js`, `replica-state-machine-leader-clear.js` | Boolean true or an applied envelope can clear local-only debt or complete lifecycle transition | Return one owned completion shape while preserving actual readback-resolved completion. Keep effect-handler/D2 gates; do not reject a real semantic owner success just because it used to be boolean. |
| `query/runtime-replica-state-projection.js` | ServicesOwner-versus-gateway method presence, success-only validation, count-positive UPDATE shortcut then INSERT | Wire the supported ServicesOwner capability, preserve exact identity guards and authoritative insert reconciliation, and remove the compatibility ingress. Unknown UPDATE cannot cause a new INSERT. |
| `control-plane/lease-service.js` | Lease-expiry path reads nested count; terminal reaper uses classifier before endpoint cleanup | Both need the observed node's exact guarded transition before destructive follow-up. Preserve no-op/superseded lease observations and exact terminal fences. |
| `node/failure-detector-control-plane-guards.js`, `failure-detector.js`, `failure-detector-replica-failures.js` | `guardedUpdateApplied` treats nonfinite/missing nested count as applied; four guarded node/replica writes use it | Replace the duplicated effect inference with canonical exact-one or owner reconciliation. No failure/recovery event or repair intent from unconfirmed application. Preserve original observed predicates and repair workflow ownership. |
| `node/node-reintegration-service.js` | Another copy of the nonfinite-count success rule; marks reintegration completed and emits progress | Same strict evidence requirement. Unconfirmed completion cannot clear pending reintegration or increment its success counter. |
| `control-plane/owners/service-instance-metadata.js` | Exact serialized-state CAS; one/zero/unknown count controls settlement and authoritative reread | Preserve A2' exact state predicates and unknown reconciliation. Select only canonical count plus confirmed application; no nested/root alternatives. |
| `control-plane/owners/service-install-catalog-owner.js` | Installation CAS accepts one, rereads on zero; invalid/missing count is treated as corrupt gateway record | Preserve installation identity and compare fields. Distinguish an unconfirmed write from a corrupt stored record; reconcile without assuming noncommit. |
| `partition/managed-workflow-record-store.js` | Exact metadata/state/generation CAS, followed by readback when not landed | Canonical exact-one effect; preserve fencing, encoded bytes and existing reconciliation. |
| `partition/managed-split-workflow-persistence-methods.js`, `managed-merge-workflow-persistence-methods.js` | Epoch/sibling changes require exactly one; partition birth helpers may only await; deletion returns the receipt | Migrate all methods, including birth helpers. No epoch advance or child/merged-partition publication from unconfirmed results. Keep existing workflow and ownership-fence authority. |
| `partition/managed-split-workflow-dissolution-methods.js`, `managed-merge-workflow-dissolution-methods.js` | Exact-one deletion produces SOURCE_DISSOLVED witness | Preserve exact-one and fence-token obligations. Unknown/replay-unknown cannot be converted to zero or accepted as a dissolution witness without the defined authoritative resolution. |
| `query/schema-provisioning-job-repository.js` | INSERT trusts non-success:false; workflow CAS accepts root/nested/changes aliases and count one | Require exact intent insertion or exact immutable-identity readback; workflow advance requires the fenced row version's exact-one effect/readback. Never update local workflow rows on an unconfirmed result. |
| `query/sql-query-engine-transaction-persistence-methods.js` | Generic persistence accepts success:true; INSERT can shortcut immutable-row readback; decision checks completion-state zero | Preserve one-shot transaction identity, participant records and decision-null/frozen-participant predicates. Consume canonical effect; missing/unknown count requires existing transaction authority resolution. Preserve collisions and no decision overwrite. |
| `query/sql-query-engine-transaction-set-methods.js` | Always reads back exact participant-set fields after CAS | Keep that exact authoritative read as the decision. Preserve session/transaction epoch, frozen set and decision guard. Original thrown cause must not be reduced to text if it carries uncertainty identity. |

## 3. Publication, counters and capability consumers

| Source | Side effect or supported capability | Required migration |
| --- | --- | --- |
| `raft/authoritative-row-mutation-vocabulary.js`, `authoritative-row-mutation-helper.js` | Records persisted value, clears pending and reports cache visibility | Require actual effect/readback and the independent observation needed by the caller; retain the same logical key/content across uncertainty. The small predecessor engages this seam. |
| `partition/partition-service-metadata-mutation-helpers.js`, `message-group/message-group-service-metadata-publication.js`, `wasm-service/wasm-service-metadata-mutation-helpers.js`, `wasm-service/wasm-service-replica.js` | Six helper constructors; WASM custom delegates return gateway results | One canonical result contract; preserve role/leader guards. Replace cache-equality/missing-read-capability fallback only with supported authoritative observation or typed hold; a locally seeded cache row is not durable authority. |
| `config/dynamic-config-service.js` | Direct CDC seeding chooses seeded/skipped; config mutation may await without checking effect | One confirmed insert is seeded, confirmed ignore-existing zero is skipped; uncertainty is neither. Preserve incoming reviewed config exact-one completion and side-effect ordering. |
| `policy/table-policy-service.js` | Policy mutation currently awaits before cache/event publication | Compose the separately reviewed exact-one completion helper with canonical count and explicit observation; no return to success-only behavior. |
| `bootstrap/bootstrap-api-control-plane-methods.js` | Invalidates bootstrap snapshot on non-success:false | Invalidate only after the required mutation fact. Phase scope cannot choose raw SQL when CDC is absent. |
| `bootstrap/shared/node-registration-owner-publication-methods.js` | Join admission/withdrawal derives accepted/success/deferred, with owner-contract fallback | Preserve logical work separately from admission/application. `UNCONFIRMED` retains work despite `accepted:false`; pending/deferred contract fields cannot fabricate acceptance. |
| `bootstrap/phases/create-message-group-phase.js`, `query-system-state-phase.js`, `node-joining-cdc-subscription-and-backfill.js`, `node-joining-delegate-bundles.js`, `node-joining-owner-construction.js` | Optional retry delegate versus raw upsert/SQL chain; successful response clears deferred self-hosted metadata | Wire the one existing retrying publication owner. Preserve deferred row and original group identity until exact publication completion; delete alternate delegates/SQL after that capability is wired. |
| `bootstrap/phases/seed-registration-phase.js`, `system-table-writer.js`, `seed-original-registration.js` | Message group, service definitions/endpoints, tables/partitions, sizes/config/epoch and original births | Preserve the original local Raft capability, per-cohort readiness and single original-right submission. Every awaited non-birth write also needs canonical effect; original births always transfer through exact committed readback. |
| `control-plane/heartbeat-service-publication-methods.js`, `heartbeat-service-lifecycle-methods.js` | Incarnation-bound endpoint, lease expiry and graceful-shutdown writes | Keep endpoint/terminal semantic owners. Replace `outcome.result || {success:true}` with the actual semantic completion evidence; do not invent an applied mutation receipt for a readback result. |
| `node/node-lifecycle-service.js` | Emits NODE_REGISTERED, HEARTBEAT_UPDATED, NODE_REMOVED immediately after returned gateway call | Require the corresponding canonical effect/semantic owner completion before each event. Retain observed-incarnation deletion authority when composing the approved conditional node-removal owner; do not preserve a parallel unguarded deletion capability. |
| `query/table-creation-service-create-table.js`, `table-creation-service-existing-table-reconciliation.js`, `table-creation-service-completion.js` | Table/partition registration, metadata-created flags and visibility fallback | Confirm each exact registration, preserve provisioning fence and entire partition-cohort readback. Missing receipt/visibility cannot default to ready/visible; apply/visibility states remain separate. |
| `query/service-partition-access-publisher.js` | Drains a metric snapshot; merges it back only on false/superseded/throw | Use canonical publication effect. Unknown, deferred, no-op or absent result retains the exact drained metrics for the existing next attempt. |
| `topology/latency-group-manager.js`, `latency-measurement-service.js` | Group creation/assignment, leadership action, sample counters/events | Canonical confirmed effect before reporting publication. Preserve background coalescing and owner-driven future samples; a superseded write cannot publish its own effect. |
| `function/context-manager.js` | Returns/logs saved/deleted context after unchecked await | Exact context row effect or authoritative same-identity/absence resolution before successful completion. |
| `index-management/index-service.js` | Unchecked metadata result precedes SQLite index action and local index-cache update | Require the metadata owner's confirmed completion before follow-on state. Missing metadata capability must be explicit; retain actual index operation requirements. |
| `partition/partition-service-split-accessor-base.js` | Size publication through existing bounded retry helper | Consume canonical outcome; retain size publication work on unconfirmed/no-op and preserve existing retry bounds. |
| `rebalancer/storage-capacity-migration.js` | Increments backfill count after unchecked metadata upsert | Only count confirmed exact node-budget mutation; use current node identity owner. Unknown result is outstanding work, not skipped or backfilled. |
| `rebalancer/replica-operation-repository-mutation-gateway-methods.js`, `replica-operation-repository-mutation-persistence-methods.js`, `replica-operation-repository-mutation-update-methods.js` | Creation/step/terminal CAS, recovery witness and lease heartbeat; method-presence/raw-SQL alternatives and four count aliases | Canonical ingress only. Preserve operation-creation uncertainty, exact step/completed-at/create-admission guards, host submission fence, existing retry budget, recovery witness and original key. Lease touch is already expressible as canonical UPDATE `{operation_id,completed_at:null}` with only `lease_expires_at`; preserve its fail-soft capability without raw SQL. |
| `runtime/request-cell-invocation-owner.js` | Invocation journal consumes internal SQL results, currently accepts nested/root/changes counts | It is a SQL journal consumer, not a system-table result owner. Consume the SQL engine's declared canonical count at its actual executor seam; retain exact invocation identity, claim/rearm/settlement predicates and readback. Never clear the journal or turn a provisional result into a completed invocation. |

The generic `SystemMetadataOwnerBase` descendants are also part of the
interface review: `services-owner`, `nodes-owner`, `partitions-owner`,
`message-groups-owner`, `replica-operations-owner`, `logs-owner`,
`endpoint-metadata-owner-base`, `service-definitions-owner`,
`service-instance-metadata`, `service-install-catalog-owner`,
`control-plane-publications-owner`, `deployment-binding-owner` and
`runtime-access-policy-owner`. Thin forwarders preserve the one canonical
receipt; semantic methods remain responsible for their own fixed operation,
predicate, readback and capability contract. This list does not authorize
bulk replacement of their semantic outcomes with mutation outcomes.

## 4. Physical result owners outside alias migration

These are not legacy result alternatives merely because they use `changes`:

- `raft/raft-rs-replica-lifecycle-owner.js:260` consumes the direct SQLite
  result of its exact opening-history CAS inside the owning synced
  transaction. It is not a gateway result and retains that physical check.
- `partition/partition-cdc-obligation.js` consumes physical statement/operation
  info while recording owed events in the same application transaction. Its
  count decides whether a real mutation owes notification. Preserve this
  physical fact and D2 recording order.
- `_partition_statement_outcomes.changes`, `committedStatementResult`, and
  transaction COMMIT operation-result reconstruction remain durable physical
  statement facts. Renaming the public count does not require a storage
  migration or filling absent historical data with zero.
- `partition-write-kernel` split-mirror planning and
  `partition-service-entry-apply-base` internal apply metrics must be traced
  at their actual input boundary. Carry the real physical count where that
  plan needs it; do not change an event's identity, durability or replay
  semantics to satisfy a field-name census.
- `query/application-database-result.js` already declares `affectedRows` as
  the engine field and rejects `changes`/`rowCount` aliases. Its downstream
  `projectAffectedRows` nevertheless converts missing count to zero. The
  proposed public result uses `affectedRows:null` for named applied DML replay
  with unknown count, preserves numeric known counts, and retains read/DDL
  presentation under the existing SQL statement-kind owner. Malformed DML
  evidence is a typed invalid result. The PG-wire command-tag owner already
  refuses a missing DML count; retain known-application/replay cause there.
  This is a transitive consumer beyond the text census and requires its own
  public contract/caller proof before production, not a claimed first-witness
  result.

## 5. Remaining capability decisions inside this repair

### Earliest seed

The admitted capability is `RaftRsOriginalAllocationPreparation` plus its
original declared partition cohort and current continuation, reaching
partition Raft `executeQuery`. No SQL engine or populated cache is required.
`CDCIntegrationService.executeSQL` is the common call boundary before phase
routing; a supplied key remains supplied and a key absent on a direct CDC
call is minted once for that call, before either route. Use the existing
`deriveParticipantEntryId` derivation for both local and ordinary routing.
Remove the current bootstrap option discard and the second per-route key
mint, rather than add another identity owner.

The original preparation can check continuation at the chosen replica via
`assertContinuation(replicaId)`. Binding that preparation to the existing
bootstrap writer/route preserves capability; `bootstrapMode:true` plus an
arbitrary map alone must not authorize original publication. Consume the
existing per-partition leadership gate before first use of later config/meta
cohorts, and preserve the partition owner's adjacent current-role admission.
Do not widen the early election cohort, create local writes, reset rights or
introduce a second original INSERT when the role changes.

### `SYSTEM_TABLE_WRITE`

The current partition dispatcher accepts this enum at two dispatch points
and invokes `handleSystemTableWrite`. The handler itself executes partition
insert/update/delete/upsert, then reduces the reply to
`{success:result.success,changes:result.changes||0}`, losing replay uncertainty
and causes. The 2026-10-10 transaction design states that this handler has no
sender, and the current literal/enum-member search finds no sender. Those
observations do **not** prove that dynamic/exported message construction is
absent. Before removal, inspect dynamic enum access, transport message
constructors and the current capability/grammar registry; document the
supported capability disposition. If retained as a supported ingress, it
must delegate to the same canonical partition mutation owner and preserve
its identity/result without a second execution interpretation. A historical
unused claim alone does not authorize a compatibility branch or removal.

### Rebalancer and runtime projection

The rebalancer's fallback comment explicitly retains raw SQL for reduced test
harnesses. That is not a product capability: migrate the harness to the actual
gateway, then remove the alternative. The production step/terminal guards
already have a canonical object predicate; the owner-lease touch has the
canonical form stated above. Preserve their original host/replicated
admission distinction and prior-uncertain creation answer.

Runtime replica projection declares ServicesOwner as production authority
and a gateway path for compatibility callers. Trace those callers and wire
the current owner; a missing owner becomes typed unavailable with the caller
retaining the projection. Do not replace exact service identity readback
with another generic helper.

## 6. Evidence and edit ordering

The predecessor packet measures one recurrent false-progress path using real
gateway and consumer ownership. Full correctness requires the producer and
semantic groups above, including definite zero, positive count, named replay
with unknown count, provisional transaction, lost answer, explicit pre-route
refusal, post-submission uncertainty, pending visibility and genuine later
completion. Existing exact-row readbacks and staged-transaction tests must
remain engaged; merely adding fields to test doubles is not evidence.

Root has authorized preservation of the unsealed design and intentionally red
packet pending independent source review. Root explicitly has not authorized
production edits, Quest sealing or proof execution at this stage. The lab
coordinator owns eventual submission and original output collection. Hook
windows are serialized; no intentionally red proof is composed into the
integration candidate.
