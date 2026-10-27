# Independent creation-to-genesis contract and oracle review

Reviewer: subagent:/root/completion_consumers. Date: 2026-10-16.

## Identity and verdict

Base inspected: `f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9`.

| Artifact | SHA256 |
| --- | --- |
| CONTRACT.md | c633673f6acad0fb72364cca98507e7d19c823c6541308fdd897114f03c17a63 |
| TEST-PLAN.md | 4dd2f339e4cf78b1451789596581a86e420e5bb12bc14136675dfe8833b6d04d |
| test/entrypoint/creation-recovery-process-custody.test.js | 0c74a25cb936900d1357f7a3745d3c3860a43e74df02b21b860c512921c00a54 |

**REVISE the contract before production edits. APPROVE the exact process-custody test for its first locked component execution, with the limits below.** No tests were executed in this review. No source or test was edited. The tracked diff was empty; the proposed Quest and new test were untracked. This is a content/source-compatibility review, not approval of an implemented protocol.

The user has authorized creating the missing distributed currentness mechanism. Its prior absence is not a STOP reason. The four issues below are concrete gaps in this particular proposed mechanism and need resolution within the named existing owners. This review does not reopen the chosen writer sequencing policy or demand a second authority.

## What the proposal gets right

The single ServiceDefinitionsOwner currentness row, immutable installation history versus mutable activation permission, application-time SQL CAS, and common persisted genesis are coherent ownership choices. A metadata pointer cannot revoke an isolated old quorum. CONTRACT 87–112 instead keeps a granted predecessor as an outstanding serving obligation and holds the successor closed until actual release. That distinction should be retained.

The proposed CAS has a plausible existing path: SystemMetadataOwnerBase.executeMutation (417–447) uses the existing gateway; guarded UPDATE remains an UPDATE, and the CDC mutation owner builds its SQL WHERE from the supplied predicate (`cdc-integration-service-mutation-operations.js:367–430`). This is not a claim of distributed validation: C3 must establish affected-row and exact-resolution behavior through real QueryEngine/RF3. Existing catalog uniqueness is durable (`system-table-runtime-schema-definitions.js:401–406`), rather than merely the catalog's local serialization map.

Keeping catalog activation unsupported is source-compatible with `ServiceInstallationReconciler._reconcileUnsupportedActivation` (242–265). The direct consensus route is explicitly separate from request Cells. Snapshot claims are appropriately held at the shared application-image/native-import boundary.

## B1 — Directory acquisition is not presently proof that old effects ended

CONTRACT 131–139 relies on reacquisition of the retained directory plus cleanup as the recovery discriminator. The present owner voluntarily releases its lock after a rejected shutdown:

- `storage/data-directory-process-owner.js:57–66`: `bindDataDirectoryProcessOwner` calls `owner.release()` in `finally`.
- `entrypoint-runtime-shutdown-lifecycle.js:281–310`: `createRuntimeShutdown` caches its Promise, and failure of application-database close or drain intent skips later steps.
- The skipped `ownerCleanup` and `bootstrapAPI.shutdown` are at 349–355. A second invocation returns the same rejected Promise (284), not a cleanup retry.
- Startup is another exit: `lagrange-runtime-startup.js:724–726` registers process-lock release in the acquisition ledger. `entrypoint-startup-acquisition-ledger.js:24–36` continues popping all cleanup callbacks after one fails, then throws. It does not retain failed cleanup custody.

Minimal schedule: old runtime owns directory and live resource → early shutdown step rejects → later resource cleanup never executes → wrapper releases lock → another process acquires the same directory while the original resource remains open. If acquisition is treated as proof that the prior resource can be declared CLOSED, J may receive permission while an I owner remains live. This is a source-backed counterexample to the proposed recovery premise; no native overlap or data-loss execution is claimed.

Required contract correction: explicitly include the existing process-owner, shutdown and startup-acquisition handoff in the source scope and oracle. Failed or uncertain cleanup must retain custody; reacquisition must distinguish successful exact teardown/process death from voluntary early release. Specify how failed shutdown and failed startup cleanup retain or eventually discharge their obligations. Merely removing `finally`, increasing a boot counter, or caching a failed cleanup Promise is not a complete progress contract. A bounded extension of these existing owners is a necessary handoff for the selected creation unit, not a new permit service or unrelated product policy.

The new three-test component witness accurately isolates the first path. C9 must additionally exercise actual process death/restart, and the startup-unwind path needs its own failure control before recovery is certified.

## B2 — The bounded result scheme depends on unbounded request-identity history

CONTRACT 30–38 requires immutable catalog creation intents for request matching, but explicitly excludes that history from the bound and forbids removal while it supplies replay identity. The 16-decision ring does not bound this dependency.

Minimal schedule: hold one expected V fixed → submit N distinct valid installation/operation identities with bounded creation contents → catalog persists N immutable intents → one creation wins, N−1 receive derived conflicts from the same retained decision. N is unbounded even though the currentness row retains only one winner. Every losing intent is required by the stated exact-identity/conflicting-content rule.

Actual catalog insertion occurs in `ServiceInstallCatalogOwner.requestInstallationSerialized` (480–514), after exact operation/installation lookup (517–543). The inspected owner has no finite creation-intent admission/retirement mechanism. Its unique operation ID prevents concurrent duplicate rows but does not limit distinct IDs. Calling this existing catalog history does not establish the user-required finite history/fence behavior for the new creation protocol.

The converse schedule also needs a decision: erase an old request identity to make room → reuse that operation identity with changed contents/current expected V. Without an independent bounded replay fence or identity construction rule, immutable-request matching has evaporated. Historical unavailability cannot silently become fresh admission.

Required correction: select an explicit bounded identity/retirement contract within the existing owners, including losing, never-selected and unknown requests. Preserve the separation between history and current authority. Do not fix this by an unbounded tombstone table, assuming catalog retention that has not been identified, or choosing a larger ring. The existing global catalog/database need not become a total-quota project; the particular identity history this protocol needs must have a finite, non-reexecution explanation.

## B3 — Resource-attempt allocation and finite reuse are not yet defined

CONTRACT 94–101 and 123–139 defines attempt ordinals and forbids reopening the same ordinal, but does not define who durably allocates the original ordinal before delivery, what a delayed old CREATE carries, or how CLOSED records are replaced under the 9-resource/instance bound (210–218).

Two schedules expose the missing transition:

1. CREATE A registers attempt a, completes, then closes. Its record is compacted/reused. A delayed duplicate of A reaches the still-selected instance. If the receiver mints the next ordinal, the old request acquires fresh permission. If it merely uses a missing local entry, the same problem occurs after restart.
2. A selected instance repeatedly restarts/replaces one replica. Retaining every CLOSED attempt makes the record bound false; refusing every subsequent attempt eventually prevents legitimate recovery. Replacing them is safe only with an explicit monotonic high-water/original-request binding and stale-response rule.

The existing lifecycle journal is not automatically that proof: `ServiceLifecycleManager._journalCreate` (412–451) is optional (returns null with no writer), and the shown operation creation does not itself bind B/resource ordinal. The receiver cannot repair this by treating today's journal/cache as the original command. The existing replica operation admission/recovery owner is a possible handoff to extend, but the proposal must choose its exact durable producer, receiver token and replay rule before implementation.

Required correction: name the originating operation owner, durable token allocation/commit point, fields carried in CREATE and its recovery journal, exact-late-retry response, and the finite CLOSED-record reuse/high-water rule. Specify how a successful CLOSED transition re-drives the successor through the existing owner-key reconcile path (`RuntimeServiceHandler.emitExecutorOutcome`, 764–781), rather than merely saying existing wakes suffice. Add an original-CREATE replay after slot reuse/restart and lost allocation/release response to the oracle. No new queue or independent registry is needed.

## B4 — Intact local restart must not be silently changed into fresh activation

CONTRACT 55 calls metadata availability a creation/recovery prerequisite; 134–138 and transition 156 require original current B, release, and a new attempt. As written this also requires live currentness access for an intact local restart. The preserved `seed-control-current-proof-amortization/evidence/release-decision-closeout-20261015/SNAPSHOT-DECISION.md:90–93` explicitly separates fresh CREATE, intact restart and destructive loss, and requires intact voter cold restart without a live majority/control token. Its lines 77–79 exclude source-local serving authority from an imported image.

Minimal incompatibility: all metadata/currentness replicas are temporarily unavailable; an intact service voter has its original root, membership, log and application state. The draft's fresh-currentness/new-attempt rule prevents the existing intact restart. Conversely, allowing its creation root alone to authorize serving permits a resource whose CLOSED acknowledgement enabled J to reopen as I. Common genesis is identity, not sufficient evidence of an unretired local serving grant.

Required correction: distinguish new/missing-origin activation from intact same-resource recovery and specify the durable local permission/retirement facts, their ordering relative to global CLOSED, and who reconstructs them. A retained local grant cannot be copied in a shared snapshot; a stale directory restored after acknowledged retirement must not evade its local fence. If the chosen route cannot preserve the existing intact-restart contract, that is an explicit recovery-owner decision, not a silently added metadata prerequisite. Add paired isolated intact-restart and retired-resource-restart controls. This review does not prescribe the unreviewed local-grant design suggested during discussion.

## Exact new process-custody test review

**Approved for first execution as a component counterexample witness.** It uses the production lock owner and production `createRuntimeShutdown`, a real SQLite resource, and a distinct child process acquiring the actual lock. The pre-shutdown contender must fail with the exact ownership code (100–103), so an ineffective lock cannot make the main check vacuous. The named failure object, skipped cleanup, open resource and second acquisition are recorded before the semantic assertion (104–120). The healthy control requires real cleanup and subsequent acquisition (124–136). No artificial authoritative incarnation, transfer or consensus result is manufactured.

Scope: injected shutdown callbacks are component actuation. No actual whole-runtime startup, recreation, successor activation, RF3, data loss, or startup-ledger unwind is exercised. Child acquisition has synchronous SQLite busy-timeout zero; the enclosing normal executor remains responsible for its ordinary whole-file bound. Cleanup kills a remaining child and closes/releases the local resources; it is not evidence of production recovery.

Important future-proof limitation: lines 110–112 require the current early failure to skip cleanup and leave the old resource open. A valid future correction that completes cleanup despite reporting the initial error could fail these setup expectations. Preserve this first-result witness; do not silently label it a universal conformance test for every safe shutdown implementation. Any later superseding control must explicitly test the intended alternative: retain exclusive custody while resources remain, or release only after exact cleanup.

## Category-complete pre-source assessment

The seven repository templates were read. “Planned” below is an oracle obligation, not an executed green or source approval. No actual test bytes exist yet for C1–C13, so their final fidelity and registry binding require the normal exact-byte review.

### Owner interaction (10 items)

1. Sole semantic owner: CONTRACT 10–21/40–56 assigns currentness to ServiceDefinitionsOwner; catalog supplies immutable intent. Sound direction; B2 remains.
2. Typed boundary: binding/resource phases at 24–27/94–112; B3 must complete original attempt production and reply semantics.
3. Paired invariants: C1 and C6 jointly require stale refusal and valid successor progress, with predecessor shutdown first. Planned, not certified; B1 matters.
4. Stale→fresh replay: C1/C4/C5/C7/C10 cover historical receipts versus current permission. B2/B3 must fence compacted identities.
5. Pressure/backoff: 2 bindings/9 resources/16 decisions and TRANSITION_HELD are explicit. B2/B3 prevent approval of the asserted finite profile.
6. Wake/release: exact CLOSED is the release event; B3 requires its concrete owner-key re-drive and lost-response coverage.
7. Projection versus authority: 114–121 retains PUBLISHED resource authority separately from selected pointer, ACTIVE projection and cached discovery. Good; actual consumers must carry exact identity.
8. Treatment fidelity: TEST-PLAN mutations retain codec/profile/owner API and require named stale effects. No missing-symbol RED accepted.
9. No local escape: 161–170 forbids cache substitution and combines local stale-object check with durable CAS. Actual touched-callers audit remains source-review work.
10. Registry/proof alignment: TEST-PLAN requires changed-path coverage; no impact entry or native witnesses exist yet. Cannot claim completed integration.

### Admission/gating (7 items)

1. Enforcement: guarded currentness CAS and stored application root, not local precheck. C3/C6 planned.
2. Transient/terminal: TRANSITION_HELD/UNKNOWN versus conflict/history/format refusal stated; concrete consumer typed classification must be preserved in source.
3. Budget: one attempt plus one resolution per invocation (53–54); existing metadata retry owner at SystemMetadataOwnerBase 417–439 must implement that without hidden retries/raised budgets. No autonomous unbounded wait authorized.
4. Reason shape: named results only at proposal level; actual result schema and transport classifier fidelity are implementation proof obligations, not inferred from names.
5. Release: predecessor CLOSED, not timeout/heartbeat; B1/B3 block proof of release and re-drive.
6. Freshness: actual SQL application predicate and persisted genesis. No cached currentness used in deterministic service apply.
7. Message identity: original B and attempt required in command/outcome; C5/C7/C10 planned; B3 incomplete.

### Concurrency/serialization (5 items)

1. Synchronous gate versus asynchronous observer: local exact-attempt join complements durable CAS; local gates alone do not select. B3 needs exact key allocation.
2. Await TOCTOU: ADMITTED owns preparation; PUBLISHED CAS authorizes later effects; CLOSED waits all continuations. B1 invalidates assumed process takeover.
3. Single winner: guarded canonical-row UPDATE/INSERT and durable installation uniqueness; C3 required through real RF3.
4. Timer reentry: no new timer is selected. Existing re-drive duplicates must consume original attempt; B3 and C10 cover this rather than new timer semantics.
5. Lock scope: S is currentness key, instance/replica/attempt is effect key, retained directory is process key. Directory lock only proves exclusivity while actually retained (B1).

### Recovery/replay (5 items)

1. Stale/live: original B across all journal/adapter/recovery paths (158–170), exact object cleanup, C7/C10. No present-cache reinterpretation.
2. Restart discrimination: retained directory plus completed cleanup, not boot count. Current source contradicts premise: B1. B4 identifies the distinct intact-restart versus new-activation contract conflict.
3. Lost enlistment: outstanding resource records are the analogous monotonic obligation. Empty local maps cannot discharge them (123–139); C5 and B3.
4. Replay: exact decisions and attempts; rollback/unknown cannot imply absence. B2/B3 need bounded identity treatment; C4 and lost grant/release planned.
5. Absence: authoritative never-created versus cache miss (21–22), missing old format refuses (192–199). Shared snapshot is explicitly unproved.

### Retry loops (7 items)

1. Retry fires: B3 requires exact CLOSED wake handoff; existing generic reconcile wording is not proof.
2. Frozen bound: immutable intent and one invocation attempt/resolution; unknown keeps identity. No infinite unreadable loop proposed.
3. Loud stops: named UNKNOWN/HELD/conflict/history/format refusals; actual exception-to-result handling remains source proof.
4. Mutual suppression: bootstrap runs before serving; no serve-to-INIT cycle. Old-resource cleanup must remain possible while J held; B1 covers failed shutdown.
5. Storm ceiling: no new retry scheduler; finite per-invocation work does not imply a global ingress quota. B2/B3 identify unresolved identity/resource pressure.
6. Duplicate effect safety: CAS and original token required; B3 specifically rejects receiver-reminted retry.
7. Reset: only authoritative application/CLOSED resolution, not ACK or historical selection success; C4 and lost grant/release schedules planned.

### Transport/delivery (5 items)

1. ACK versus processing: selection/registration success requires affected rows or authoritative resolution; ACTIVE/transport ACK is not grant or closure. C4/C6 planned.
2. Late response: original identity/attempt, no latest-object cleanup; C4/C10 plus B3 reuse control.
3. Classification: typed HELD/UNKNOWN/refusal must traverse actual outcome emitter/consumer; no new boolean ACK interpretation approved.
4. Missing recipient: retain existing delivery budget and uncertainty; no new indefinite wait. C5/C10 must not turn unavailable authority into success.
5. Stub fidelity: TEST-PLAN real gateway/QueryEngine/RF3 and lossless callee wraps; exact fixtures pending. The new shutdown test deliberately has no message-router claim.

### Harness fidelity (6 items)

1. Right-reason RED: proposed new-format mutations retain callable symbols; new component test checks actual preconditions before named assertion. No execution claimed.
2. Honest seam: actual production lock/shutdown owners, injected early failure clearly labeled; C1–C13 demand production creation outputs rather than injected expectedIncarnation.
3. Time: no altered timeout/observer rescue in plan; component child acquires with real zero SQLite busy timeout. Final schedules/budgets still need exact-byte inspection.
4. Fields: binding/attempt fields explicit but B3 incomplete; exact integers at SQL read in plan. Component test reports child PID, exit/code, error and resource state.
5. Vacuity: before-lock rejection and healthy release prevent empty-resource/ineffective-lock passes; C1/C3/C6 demand valid matched positive paths.
6. Live binding: no new native evidence yet. SQL component, process-lock component, actual metadata RF3, service RF3 and snapshot import remain distinct proof domains.

## Disposition

Retain the selected single-owner direction and the proposed C1–C13 structure. Resolve B1–B4 in the same compact contract and oracle before source work; they are necessary owner handoffs or a specific existing recovery-contract reconciliation within the newly authorized unit. The component test may execute now under the normal locked executor, retaining its first result. No supersession of the original recreation, writer, F1 or W07 evidence; no merge, release claim or complete successor activation.
