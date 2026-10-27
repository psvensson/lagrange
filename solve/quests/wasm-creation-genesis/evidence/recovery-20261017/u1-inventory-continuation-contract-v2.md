# Proposed complete restart-inventory continuation contract

Status: **DRAFT for owner judgment and independent review. Not approval or implementation.**

This expands the inventory recommendation in `u1-correction-inventory-amendment-draft.md`. The original proposal reviewed was SHA256 `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`. Its reservation-finality section has a separate bounded approval. None of the changes below is covered by that approval.

Source references below use `/workspace/scratch/6d2a7b72384f/lagrange/` as the root and the uncorrected U1 source at `a251ce4fd9c980a78c0fd33d8a5f873161f90870`. No source or test was edited or run for this draft.

## 1. Facts and owners

The original creation journal owns each admitted or unresolved creation obligation. The instance resource owner owns reservation, phase and exact-token finality. The opening module owns the local record. `WasmServiceLifecycle.activeReplicas` and its retained exact replica objects own current physical custody. The handler owns volatile scheduling and the canonical replica memo; the manager owns its canonical lifecycle-state projection. Neither canonical map chooses which historical resource is permitted to exist.

The startup task must therefore retain entries by original operation identity, while the canonical memo can name at most one currently routed creation. A creation can stop owning that memo without its original journal becoming terminal. A future PENDING request can remain an obligation without becoming the current physical creation. These are ordinary distinct facts, not inconsistent states.

The canonical replica key is only a scheduling and presentation key. Neither scan order, `created_at`, operation ID, binding selection version, local PUBLISHED versus ADMITTED, nor the absence of a current memo chooses a winner. In particular, `getCurrentInstance().selected` is not permission to discard a retiring binding's still-admitted resources: the resource owner explicitly retains selected and retiring bindings, and resolves either exact token (`service-instance-state.js:198–207,240–249`).

## 2. One journal observation

Prefer one SQL statement through the existing manager recovery reader:

```sql
SELECT * FROM wasm_operations WHERE state IN ($1, $2)
```

The existing operation SQL owner should build the statement, with the two canonical PENDING/IN_PROGRESS values as bound parameters. It can add a dedicated recoverable-list builder or support a state-list filter without changing existing single-state list semantics. The manager keeps the same `recoverPendingOperations` entry point and generic row behavior.

This is narrower than repairing an unavoidable race between two independent queries. The schema already has `operation_id` as its primary key and a state index (`bootstrap/system-table-runtime-schema-definitions.js:591–629`); the SQL vocabulary already owns `IN` (`constants/sql.js:15`). A single statement over the journal database cannot return two physical versions of one primary-key row merely because it changes PENDING to IN_PROGRESS between separate SELECTs. It does not claim a cross-table transaction or an atomic journal-plus-local-file observation.

The reader must return an array or fail visibly. An unavailable or malformed whole observation does not open readiness. Defensive validation still detects duplicate operation IDs in an injected or broken reader result: identical rows fold once; conflicting rows are not ordered into a winner. The latter fail the inventory observation as corrupt, leaving the startup unapplied and retryable after the reader defect is corrected. Normal authoritative storage cannot produce that shape. This avoids an extra per-entry reader fallback and its separate ordering semantics.

Per-row immutable intent/admission/opening validation remains with `inventoryConsensusCreationRow`; undecodable rows remain typed, non-reenterable entries. The scan remains journal-only. Local inspection follows through the existing adapter and closes each read-only connection before continuation. A journal transition after the snapshot is handled by the ordinary creation continuation's authoritative reread, not by treating the snapshot as an effect permit.

Current source: `service-lifecycle-manager.js:522–543`; `service-lifecycle-recovery.js:99–110,316–343`; `service-consensus-creation-intent.js:312–335`; `wasm-service/operation-lifecycle.js:186–221`.

**Production limitation:** no production `setRecoveryReader` wiring exists in the lane yet; that belongs to the activation charter. The one-statement contract must be tested through the real SQLite owner now, and through its required owner-RPC production reader when that composition is implemented. Do not call a cached multi-shard aggregation an atomic journal observation without an owner contract proving it.

## 3. One applied startup task with exact plans

The handler keeps one startup task for its lifetime. Concurrent inventory calls share it. A failed read before application clears only that failed task so an explicit retry can start one new attempt. A successful application is retained and never rescans over live state.

The task contains a bounded-by-inventory collection of exact plans, each retaining operation ID, immutable intent identity, original token or explicit absence, opening record, local inspection, action, and execution state. It is a volatile continuation of the original journal, not a second durable journal or a new authority. Retaining several plans for one canonical replica is necessary; overwriting a map entry is not discharge of any plan.

Each plan has one named execution state: waiting for its initial attempt, admitted attempt in flight, awaiting a stated later trigger, or settled for this handler lifetime. RETIRED plans additionally distinguish physical retirement complete from original-journal completion complete. A nonfinal result returns its plan to the waiting-for-trigger state; it cannot recursively schedule itself. The task retains the last typed result for diagnostics and exact continuation.

No inventory effect starts until the full journal/local observation has been applied and readiness is opened. Before that point every owner await is followed by the handler's one stopped-lifetime check. A stopped handler cannot apply plans, write memos, open ready, or schedule an attempt. A late read can settle without being joined by shutdown because it has no effects.

## 4. Initial memo rule, including collisions

The approved single-entry behavior remains: one REENTER entry seeds the creation's HELD memo; one RETIRED entry seeds its REMOVING memo, then its ordinary route determines the next state.

**A group containing several different creation identities requires an explicit narrow amendment to R1-A/R1-B/R1-H.** Before the first authoritative continuation establishes a current routed creation, its canonical memo is a named `CREATION_CONTINUATION_PENDING` projection with no claimed current operation. Its plans retain every original operation separately. This is a valid inventory state, not a corrupt nameless HELD memo. The carrier and error constant belong to the handler's existing vocabulary; do not encode the distinction using a raw null sentinel or by overloading a failed named memo.

For this collision-only state, a coordinator request that names a known original CREATE queues/coalesces that exact continuation. A canonical REMOVE, or a foreign CREATE requiring a current-creation decision, receives a typed retryable error naming the unresolved current-creation fact; it does not choose an operation from an array and does not emit another operation's executor outcome. The original startup pass continues independently. Once an exact current physical continuation is established, normal memo routing applies.

If no continuation can currently establish one physical creation, this state remains explicitly unresolved. There is no invented winner merely to make REMOVE routable. The original journal rows, the plan results and each named retry prerequisite remain visible. This is deliberate fail-closed behavior for multiple unresolved origins, not a claim that their recovery is already complete.

An already current memo is replaced only by a continuation the physical owner now recognizes as the current exact creation. A historical failure, a future PENDING refusal, or old retirement settlement cannot replace it. A retirement may update its own REMOVING memo; otherwise it only updates its exact plan.

## 5. Continue every original entry through the existing route

The handler uses the existing `scheduleBoundReentry` / `routeRuntimeServiceCreate` path for every REENTER plan. The collision amendment permits a queued startup entry to enter that path without falsely owning the canonical memo first. The path still resumes the original journal, applies runtime policy, resolves or reserves only the original request, and uses the existing physical opening and publication owners. It emits the result only under that creation's operation ID. Local inspection does not replace any of those decisions.

| Inventoried entry | Exact continuation and result | Canonical ownership / remaining obligation |
| --- | --- | --- |
| RETIRED I, successor J also inventoried | I uses journal-only retirement redrive; J uses ordinary REENTER. | Every I debt survives independently. J can own the memo after its accepted current continuation. I never needs J's memo to complete. |
| Older I is ABSENT_UNCLAIMED, its admitted token is now CLOSED or no longer retained by metadata | Ordinary resume returns the current typed RESOURCE_CLOSED or HISTORY_UNAVAILABLE refusal; no fresh opening is authorized. | Emit I's existing typed CREATE result. Do not overwrite J. Do not infer a local tombstone or auto-retire a non-RETIRED entry. Original journal remains available for the existing exact bound STOP/recovery owner. |
| Older I is ABSENT_UNCLAIMED and still has a valid live admission | Ordinary opening remains allowed by its existing owner contract. | Its actual physical continuation may own the local entry. It is not discarded because a higher-version journal exists. A different creation competes through the same physical owner and receives its existing deferral if a live resource already holds the service. |
| PENDING F names a future selection or future ordinal | Retry its same immutable reservation through ordinary recovery. UNRESOLVED reservation finality is not absence or cancellation. | A refusal cannot take J's memo or manager state. Preserve F's original PENDING row and typed result. A later CREATE redelivery/restart re-enters that same F after its owner prerequisite changes. No scan-time reservation and no new request ID. |
| PENDING F becomes ADMITTED during continuation | The manager records the exact token before physical continuation, as today. | Only a successful current physical continuation can take current ownership. A live J remains protected by the existing lifecycle admission fence. |
| Several ADMITTED/PUBLISHED local records, no current in-memory physical owner | Attempt every original continuation once, serialized for the canonical key; owner answers determine physical effects. | Do not sort by version or local phase. At most one physical creation may become current; other admitted resources remain distinct obligations. Recovery does not invent selection or retirement policy. A still-retiring predecessor may legitimately have to be retired by its existing owner before a successor can progress. |
| CORRUPT_STATE, CONTENT_CONFLICT or ABSENT_CLAIMED | Ordinary route produces the approved permanent typed refusal. | Preserve its exact diagnostic/journal obligation. No inferred tombstone. A different current creation's memo/state stays unchanged. |
| Journal became terminal after the snapshot | Ordinary authoritative reread returns the terminal row-state answer. | No physical effect. Retire that startup plan's continuation debt after confirming the terminal observation; no fabricated success for another workflow. |

The existing CREATE result mapping is not silently changed by this proposal. In particular, reservation finality and CREATE workflow disposition are separate contracts: the approved narrow finality correction governs REMOVE cancellation. If the owner wants all UNRESOLVED reserve refusals to become retryable CREATE outcomes, that is an explicit additional route-table amendment and needs its own witness. Retaining the journal is required either way.

## 6. One admission gate and exact settlement

Keep the existing `inProgressOperations` map as the handler's execution gate. Introduce one atomic admission operation over it that checks the canonical replica and installs a stable entry before any `setImmediate` or owner call. All bound continuation triggers—startup, CREATE redelivery, creation wakes and coordinator REMOVE—use that admission owner. A bound CREATE and a bound REMOVE for the same canonical replica cannot concurrently replace each other's execution entry. This is a narrow strengthening of the current REMOVE-only single-flight check, needed because collision-safe memo ownership cannot be obtained by racing several CREATE continuations.

The entry retains execution kind, request operation ID, original creation operation ID, canonical replica, and a settlement promise/identity. Same-creation CREATE wakes retain the existing one-pending-wake behavior. A coordinator REMOVE captures the target creation from the owned memo at admission, before queuing. `removeReplicaAsync` must not look up a possibly changed memo later to choose its target (`runtime-service-handler.js:723–727`).

A startup plan finding the gate busy stays in the existing startup task, registered to resume after that exact gate entry settles. A stale settlement removes an entry only if that map slot still holds the same object; it cannot delete a newer request's entry. A waiter checks the handler lifetime again before admission. A plan already satisfied by the admitted coordinator's same-creation work consumes that exact result rather than starting a duplicate retirement. Different creations only share scheduling, never result identity or completion authority.

The gate is held for one admitted attempt, not for all future retries of an unresolved resource. After an old I close returns unresolved, release the gate and continue the already queued J attempt. Each initial plan receives at most one attempt in that pass, so an unresolved I does not immediately enqueue itself ahead of J. A hanging collaborator remains subject to that collaborator's existing bounded operation/transport contract; this unit adds no timeout that guesses resource finality.

This does not create another removal registry or another physical admission authority. The handler serializes its calls; `WasmServiceLifecycle` remains authoritative for exact physical admission, including direct manager callers.

## 7. Current manager state comes from the physical owner

Use one canonical record in the existing `_replicaStateById` map: lifecycle state plus a named ownership kind and original creation identity. Generic records use the same representation with the generic ownership kind; `getReplicaState` continues returning the state string. Convert existing generic map writers mechanically so there is no parallel identity map or mixed representation.

The existing continuation currently writes STARTING before `adapter.createReplica` and retirement writes STOPPING before `adapter.stopReplica` (`service-consensus-bootstrap.js:124,176`). An older attempt must not claim this map merely by beginning an awaited operation.

Recommended narrow interaction: expose a synchronous, read-only current-creation observation through the existing adapter/runtime/driver chain from `WasmServiceLifecycle.activeReplicas`. The observation has canonical named CURRENT, ABSENT, DIFFERENT and UNAVAILABLE states and compares the full original intent/token against the registered exact object. It performs no file, metadata, reservation, start or stop operation. It does not read the handler memo. The physical owner already performs the comparison at `createReplica` / `continueBoundStart` / retirement capture; this operation exposes that fact instead of restating it at the manager.

After prepare returns, the manager may project STARTING only if this synchronous observation still names that exact creation. After each start/confirmation await it rechecks before updating its record. Accepted HELD/PUBLISHED/PUBLISHED_UNPROJECTED answers continue using their existing state semantics; a different or absent physical owner cannot be overwritten by a stale answer. The record is diagnostic ownership, never a replacement for the physical check or metadata grant.

On retirement, STOPPING applies only to the exact currently owned record/physical object. Historical by-path cleanup still runs when it owns neither map. After physical retirement, STOPPED may update the same original record if it remains owned and no successor is now current; every successor record remains unchanged. The original I journal completion proceeds regardless of whether I owns the canonical projection.

The handler's one settle writer similarly consumes an immediate current-creation observation when deciding whether a successful continuation may take the canonical memo. Its gate entry and lifetime must still match. A stale/noncurrent failure emits only its own result and leaves J's memo untouched. No pre-await claim establishes this ownership.

The synchronous observation avoids an async snapshot that can itself become stale before the manager writes. If an implementation instead returns a live currentness capability as part of the existing physical continuation, its exact lifetime and canonical representation require explicit review; do not substitute a copied token map or an unchecked past READY result.

## 8. One physical terminal-retirement fact; journal completion remains separate

The existing retirement interaction owns a canonical terminal-retirement result. It is terminal when the authoritative close acknowledges CLOSED, or when exact durable local RETIRED plus authoritative HISTORY_UNAVAILABLE proves that the old resource cannot still be live. Preserve the raw `close` answer and the local tombstone evidence; never describe HISTORY_UNAVAILABLE as an applied CLOSED CAS.

Use exact tombstone RETIRED/ALREADY evidence for the history case. The current `retired: true` flag also covers CREATION_STORAGE_MISSING (`wasm-creation-retirement.js:25–26`); that boolean alone is not the explicitly proposed local-RETIRED proof. Extending the history rule to another local outcome requires an explicit owner rationale and review.

Runtime, manager and handler consume that one physical result rather than independently deriving finality from `closed` or a different outcome list. The continuation order is: physical terminal retirement; old physical services-row STOPPED projection; original creation-journal completion by CAS and authoritative reread; handler settlement. Endpoint withdrawal keeps its existing exact-incarnation behavior; production stale-incarnation cleanup remains the activation quest's obligation.

**A physical terminal fact is not proof that the journal completion landed.** `completeConsensusCreation` returns a typed failure if its CAS/reread cannot confirm COMPLETED (`service-consensus-creation-intent.js:391–403`), while the current manager retains `closed: true` and the current handler ignores that failure. The corrected startup plan must remain owed until ROW_COMPLETED or an authoritative terminal-row observation confirms the original journal. A retry reuses the same idempotent retirement/projection/completion path. No fresh STOP journal is created.

For coordinator settlement, keep the same distinction visible: a result whose physical resource is gone but whose required original-journal completion is unresolved is held with that precise reason, not silently declared the fully completed correction. If an owner elects to allow the REMOVE workflow to complete before the original journal, it must explicitly name the independent debt owner and supersede the completion-order claim; this draft recommends preserving the stronger order.

## 9. Exact debt retry triggers

For a RETIRED startup plan, a gate-busy result resumes after that exact gate settles. After an admitted attempt returns unresolved, the plan waits for the next existing matching REMOVE/re-drive trigger or a later process restart. A coordinator REMOVE for current J may trigger one housekeeping pass over already-RETIRED historical debts for the same canonical replica, but its own target is captured as J and its own result never inherits I's answer. The historical pass emits no executor outcomes. This is a trigger of an already-authorized retirement continuation, not authorization to retire another non-RETIRED entry.

For a REENTER plan, matching original CREATE redelivery and applicable creation wakes use the same existing route and coalescing. Gate release resumes a plan already waiting for that pass; it does not make a permanent refusal retry forever. The special UNAVAILABLE grant wake remains RECORDED with no pending reentry per Recovery Revision 5. A future PENDING intent with no native object has no native event source: its stated retry is the original CREATE redelivery or restart, not an invented native-progress guarantee.

No new timer, polling loop, durable debt record or metadata watcher is introduced. Progress is claimed only when the named existing trigger occurs and its owner prerequisites have returned. A noncurrent non-RETIRED resource needing removal still requires its existing exact bound STOP/retirement owner to be invoked with the journal origin; a canonical REMOVE for J is not permission to retire it automatically.

## 10. Lifetime and physical join

The handler's stopped state is irreversible. Shutdown closes it before clearing projections. Late owner answers, deferred callbacks, wakes, gate waiters and route settlements cannot write memos, emit outcomes, or admit more work. All exact deletion/settlement guards use the installed entry object, not only an operation ID. A stopped ready latch is never reopened to settle shutdown.

Already admitted physical work belongs to `WasmServiceLifecycle`. It captures and registers each exact intent/token retirement task before the first asynchronous collaborator, coalesces only the same immutable identity, and retains the task until settlement. `shutdownAll` sets `consensusClosing` first, preventing new admission, then joins its admitted tasks and existing exact replica shutdowns. The data-directory process owner is released only after that join settles. A by-path release await cannot resume into a tombstone after directory custody is released.

An unresolved metadata answer after local work settles leaves durable journal debt, not an unbounded physical task. Failed live cleanup keeps the existing retiring-replica custody and makes shutdown fail visibly. A shutdown failure does not reopen creation admission. Repeated shutdown may retry retained cleanup according to the existing owner contract.

## 11. Witness matrix and required mutations

| Witness | Required oracle / mutation |
| --- | --- |
| Old RETIRED I plus current J, both row orders; then two old I debts plus J | Every original I journal completes exactly once. J's handler memo, manager state record, driver prepared/running state, exact live object, endpoint and services rows remain J. Mutate memo ownership into a prerequisite for old cleanup; unconditional STOPPED must also fail. |
| I is old ABSENT_UNCLAIMED with CLOSED/history owner answer, J intact PUBLISHED/ADMITTED | Both initial enumeration orders and a suspended I answer after J ownership leave J current. I emits only its own refusal and never opens storage or overwrites state. Mutate pre-await STARTING/memo claim. |
| Future PENDING F plus J, including F listed last and a later real owner admission of F | F is not silently dropped, cancelled or made current by its version. Its original row and request survive unresolved refusal. J remains current. After the declared owner prerequisite and trigger, F retries unchanged and respects the real physical live fence. |
| Several valid non-RETIRED candidates | Every candidate gets one initial route attempt; at most one exact physical current owner. No comparison of versions/array order is treated as authority; no automatic retirement. If none establishes current ownership, typed unresolved collision routing remains visible and preserves all plans. |
| One atomic recoverable SELECT while a real row changes PENDING to IN_PROGRESS | One entry and one continuation, no two-query duplication. Exact duplicate-reader control folds; conflicting reader result fails application without ready. Generic recovery still sees both states and retains existing semantics. |
| Startup retirement overlaps coordinator REMOVE in both admission orders | One installed gate entry, target creation captured at admission, no stale deletion, no duplicated exact retirement, coordinator retains request identity, startup emits nothing. Mutate late memo lookup in removeReplicaAsync. |
| Old close unavailable plus safely reopenable J | Old admitted attempt settles unresolved, releases its gate, and J receives its normal HELD continuation in the same pass. I remains waiting on the explicit later trigger. Mutate immediate retry/forever-held gate/drop-debt. |
| Actual owner HISTORY_UNAVAILABLE after exact local RETIRED | One physical terminal fact reaches runtime STOPPED and original journal completion. Raw history answer is retained; no claimed CLOSED CAS. Negative control: corrupt/conflicting local record is not terminal. |
| Physical terminal but completion CAS/reread unavailable | No startup debt discharge or fully completed handler settlement. Retry confirms only the original journal and produces no extra physical object or STOP journal. Mutate closed-boolean shortcut. |
| Stop during journal/local read, setImmediate, gate wait and retirement owner await | No late handler mutation/admission; an already admitted by-path task is joined before directory release. A replacement handler has independent lifetime. Mutate stopped fence, task-registration order and join. |

## 12. Source seams for implementation review

- `src/service/service-lifecycle-manager.js:522–543`: replace dual observation; `:80,191–194` and all existing `_replicaStateById` writers: one canonical state record.
- `src/service/service-lifecycle-recovery.js:99–110,316–343`: preserve total per-row bound inventory and generic semantics.
- `src/wasm-service/operation-lifecycle.js:186–221`: SQL builder owner; do not put SQL construction in the handler.
- `src/node/runtime-service-restart-inventory.js:87–178`: exact plans, collision memo, task application, one initial continuation per exact row, retained debt.
- `src/node/runtime-service-handler.js:159–168,208–214,525–543,627–701,723–727,961–968`: one gate, captured REMOVE target, lifetime fence.
- `src/node/runtime-service-bound-creation-route.js:108–168,182–209,299–366,373–462`: sole settle writer, queued reentry, wake predicate, retirement completion and exact settlement.
- `src/service/service-consensus-bootstrap.js:118–188`: physical current observation, state projection, physical terminal fact and original journal completion.
- `src/runtime/service-runtime-consensus-bootstrap.js`, `src/service/adapters/runtime-service-adapter.js`, `src/runtime/wasm-component-driver-consensus.js`: expose only the existing physical current observation, preserve exact origin through the existing chain.
- `src/wasm-service/wasm-service-lifecycle.js:93–96,222–280,426–434,476–495,640–766`: physical current owner, live admission, exact retirement tasks and shutdown join.
- `src/wasm-service/wasm-creation-retirement.js:25–26,30–54,118–172`: one terminal physical fact and raw proof detail.
- `src/runtime/service-runtime-consensus-publication.js:117–127`: STOPPED consumes the shared fact.
- `src/service/service-consensus-creation-intent.js:391–403`: confirm original journal completion distinctly from physical completion; history-case completion payload must not falsely claim a CLOSED CAS.

## Explicit review decisions this draft requires

1. Approve the collision-only pending-current memo and typed request deferral, superseding the impossible assumption that every different original entry can simultaneously own one canonical memo before ready.
2. Approve serial admission of bound CREATE and REMOVE through the existing handler gate, including exact target capture and pending-plan continuation.
3. Approve one canonical manager state record plus the synchronous physical-owner observation; avoid a shadow identity map or an earlier reply treated as current forever.
4. Approve the shared physical-retirement finality with its precise local proof, and require original-journal completion before discharging startup debt.
5. Accept the stated existing retry triggers and the explicit unresolved multiple-origin case. This recovery correction does not invent new selection/retirement policy for two legitimately still-admitted incarnations; that remains an owner action with an exact origin.

These are proposed boundary changes for one corrective U1 round. They should be reviewed as a coherent contract before source edits, not inferred from the already-approved reservation-finality subunit.
