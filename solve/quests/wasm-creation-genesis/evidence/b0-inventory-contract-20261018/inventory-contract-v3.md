# B0 restart inventory, exact continuation and retirement contract — v3 draft

**DRAFT FOR INDEPENDENT REVIEW — NOT APPROVED.** Author: `/root/rsraft_b0_contract`, 2026-10-18. This is a concrete design proposal within the existing `wasm-creation-genesis` Quest. It is not an accepted Harnessd task, implementation permission, a dynamic pass, or parent completion.

## 1. Subject, predecessors and meaning of this document

Source subject is **`a251ce4fd9c980a78c0fd33d8a5f873161f90870`** (U1). Proposed planning base is **`a1c3cde54fcb46471791062bcae4a6000ae484e0`**; their `src/` and `test/` bytes were compared and match. Source references below are at U1, not the dirty primary. The primary remains `2b863e4f300fc8ebdfb80e2752606187eed1436c`, with its 18 unrelated staged paths untouched.

This draft prospectively replaces the complete proposed contract in `u1-inventory-continuation-contract-v2.md` (SHA256 `b871e38a5307933e32c085e55e47b0a650c42319da85073b67e028116594858f`). It does not modify that file or its stopped review (`1b9295a3d4e29beec1107adf6dfb9b778244fcf66358a1d3fb5d7eeacadde5d9`, **INCOMPLETE / REVISE**). U1's independent verdict remains **REJECT**, hash `aa5ec206809b76613f55b7547b318a3d4994757d7379d71dbd83fcc5c9b2f168`.

These preserved files are under `solve/quests/wasm-creation-genesis/evidence/recovery-20261017/`. The paired proposed acceptance oracle is `oracle-matrix-v3.md`; neither document is approved by its existence. An independent reviewer must bind a verdict to both exact contents and this exact source.

V3 chooses the **exact retained-plan precedence** resolution of D1. It does not choose restart-only progress. It retains v2's journal-only observation, distinct original obligations, physical-owner currentness, shared CREATE/REMOVE gate, separate physical/journal finality and shutdown join. It makes their ambiguous routing, trigger, completion and settlement cases explicit. No production or test file is changed by this draft.

## 2. Authority, identity and state

There is one owner for each fact:

| Fact | Owner | What the handler may retain |
| --- | --- | --- |
| Original immutable creation intent and admission token; terminal row | Original `wasm_operations` journal through `service-consensus-creation-intent.js` | A validated continuation reference, never a replacement journal |
| Reservation, resource phase, exact-token finality | Resource-state owner through metadata interaction | Raw owner answer; no finality reconstructed from outcome names |
| Local opening/tombstone identity | Opening module and its by-path reader | Validated inspection evidence; not opening permission |
| Current physical replica and admitted physical retirement work | `WasmServiceLifecycle` | Its synchronous observation or task result; no copied physical registry |
| Bound scheduling, request replies and canonical memo | `RuntimeServiceHandler` and its bound route | One startup task, exact plans, one admission gate |
| Canonical lifecycle-state presentation | `ServiceLifecycleManager` | One ownership-bearing state record per canonical replica |
| Discovery effects | Existing runtime projection/endpoint owners | Exact physical-identity requests and their actual acknowledgments |

An **origin** is the original operation ID plus the canonical captured creation intent, node, entity and canonical replica. An admission token is either explicitly absent or the exact token persisted for that origin. Token absence may become present only from the original journal's authoritative continuation/reread. Once present, a different token or intent is a conflict; it never silently replaces the plan. The existing capture/identity owners perform comparisons.

The canonical replica is a scheduling/presentation key, not a winner-selection rule. Selected and retiring bindings both retain obligations (`service-instance-state.js:198–207,240–249`). Array order, timestamps, lexical IDs, selection versions, PUBLISHED/ADMITTED phase and memo absence cannot discard or authorize an origin.

A plan holds origin, token state, opening evidence, local inspection, continuation mode `REENTER` or `RETIREMENT_ONLY`, last typed result, and these independent facts. An initial local RETIRED observation selects `RETIREMENT_ONLY` (startup action `REDRIVE_RETIRED`); the additional admitted-REMOVE handoff below can select that same mode later:

- Execution: `INITIAL_PENDING`, `WAITING_GATE`, `IN_FLIGHT`, `WAITING_TRIGGER`, or `TERMINAL_OBSERVED`.
- Retry class after an attempted REENTER: `EVENT_OR_REDELIVERY` for HELD/deferred results; `REDELIVERY_ONLY` for permanent CREATE refusals whose journal remains nonterminal. Initial plans have one initial attempt regardless of this later class.
- Retirement: physical finality `NOT_CONFIRMED` or `CONFIRMED`; original journal completion `NOT_CONFIRMED` or `CONFIRMED`. Physical confirmation never implies the latter.

These are semantic states; implementation constants belong to the named existing vocabulary owners. A permanent CREATE presentation does not make a nonterminal journal terminal. `TERMINAL_OBSERVED` requires an authoritative terminal row and retains its exact state for replay replies; COMPLETED/CANCELLED and FAILED do not become the same success.

## 3. One complete journal observation and one applied startup task

`recoverPendingOperations` remains the single entry point. Its SQL owner builds one query selecting PENDING and IN_PROGRESS with bound canonical values. Existing single-state builder semantics remain available to other callers. The manager requires an array; absent/malformed/unavailable whole results fail visibly rather than becoming an empty inventory.

One SQL statement is atomic only at the journal reader's actual storage boundary. It does not atomically observe local files or metadata. The source has no production `setRecoveryReader` composition yet; activation must prove its eventual owner-RPC reader has this observation contract. A cached multi-shard aggregate is not automatically equivalent.

Before application, exact duplicate rows for one operation fold once; conflicting duplicate observations fail the whole inventory and do not open ready. Validation uses canonical row/intent identity, not ordering. Distinct operations sharing a replica never fold. `inventoryConsensusCreationRow` retains its current total per-row semantics: undecodable origin becomes a typed nonreenterable diagnostic; decodable admission/opening corruption remains a typed exact-origin entry. Generic rows retain the existing generic resolver behavior; the handler's startup scan continues to opt out of generic reruns.

The handler installs its startup promise synchronously before the first await. Concurrent calls join that same attempt and completion. The promise covers observation and application, not eventual resolution of every durable debt. A failed pre-application attempt may be replaced by one explicit retry while the handler remains live. A successful application remains retained for the lifetime; later calls return its result, never rescan over live state. Failures during later individual continuations do not clear it.

Local inspection stays behind the existing adapter/opening reader, which closes its read-only connection before returning. No metadata read, reservation, physical open or tombstone occurs during the journal/local inventory phase. After the entire observation validates, the handler synchronously installs every exact plan and initial memo projection, opens ready once, then schedules initial attempts. No partial observation starts effects.

Shutdown sets an irreversible stopped lifetime before clearing projections. Each owner await, deferred callback, gate wait and settle checks that same lifetime immediately before handler mutation/admission/emission. A late read-only scan may settle after stop without effects; shutdown need not wait indefinitely for it. It cannot apply a plan, open ready, emit an outcome or enqueue work. A replacement handler has a separate lifetime. Local resources acquired by inspection still close in their owning reader.

## 4. Initial canonical memo and later ownership

A singleton REENTER plan seeds the existing named HELD projection; a singleton RETIRED plan seeds named REMOVING. These are provisional routing states, not a claim that a physical object currently exists.

A canonical key with multiple different origins initially receives the named state `CREATION_CONTINUATION_PENDING` with no claimed current origin. The exact plans remain separately indexed. This explicitly amends Recovery R1-A/R1-B/R1-H's one-named-memo assumption. It is not corrupt nameless HELD. A canonical REMOVE or genuinely foreign CREATE against this state returns the existing ERROR carrier with a new owner-defined `CREATION_CURRENT_UNRESOLVED` code and `deferRetry:true`, emitting no executor outcome. A known original CREATE follows section 5.

Every initial plan gets one attempt through the shared gate, independent of memo ownership. There is no REENTER-first winner policy. If the first attempt establishes a physical current creation, only that exact origin may take the routed memo. Every other plan remains separately owed. If none establishes currentness, the collision state remains unresolved; no version or row-order tiebreaker is introduced.

For a noncurrent origin, failures, future reservation refusals and historical retirement settlements update only its plan/result and appropriate original request outcome. They cannot replace a current J memo. A successful currentness observation is checked at the one bound-route settle writer immediately before taking a memo. A stale pre-await success is insufficient.

## 5. D1 amendment: exact original CREATE dispatch

This section explicitly supersedes the relevant **RV6.2, RV6.3, RV7.2 and RV7.3 custody-table cells**. Original owner text is `ACTIVATION-DISCOVERY-DESIGN-20261017.md:1020–1026,1076–1107`; original source is handler `:282–305`, bound route `:227–301`.

The decision order is:

1. Enforce stopped/ready state and normal request/canonical identity validation. A stopped handler refuses typed and admits nothing; pre-ready behavior remains NOT_READY with retry and no emitted outcome.
2. Look for an exact retained startup plan under the request's original operation and matching identity. A matching operation with conflicting entity/replica/node/intent is a typed conflict, no continuation. A terminal plan produces the ordinary original terminal CREATE disposition, with no physical effect and no takeover of J.
3. A matching **REENTER** plan routes its own origin, subject to the table below and the common gate. Matching **REDRIVE_RETIRED** is handled by its separate row below. Retained-plan lookup is not admission/opening authority.
4. Only if there is no matching retained plan use the original memo custody table, subject to the strengthened common gate and currentness guards. A foreign request never borrows a different creation's success.

| Memo at dispatch | Known nonterminal REENTER F | Known retirement-only F | No matching retained plan |
| --- | --- | --- | --- |
| ACTIVE J, F differs | Admit/queue F's own route; IN_PROGRESS; no immediate CONTENT_CONFLICT from J's memo | IN_PROGRESS; emit CREATE_FAILED with `deferRetry:true` and RETIREMENT_IN_PROGRESS under F; no CREATE and no new retirement trigger | Original RV7.3: ALREADY_EXISTS plus CREATE_FAILED CONTENT_CONFLICT under foreign request; J untouched |
| ACTIVE F, exact current F | Preserve same-id ALREADY_EXISTS plus CREATE_ACTIVE; no redundant continuation | RETIREMENT_IN_PROGRESS deferral; an admitted REMOVE may precede physical stop. If exact local RETIRED evidence contradicts a live eligible object, retain the typed identity/custody conflict; never announce CREATE success | Same-id ACTIVE duplicate stays as originally specified, provided the physical owner still confirms it is current and projection-eligible |
| HELD J or deferred-FAILED J, F differs | Admit/queue F, never substitute `existing.operationId = J`; IN_PROGRESS | Same RETIRED disposition above | Original RV6.2 resumes J and emits only under J; request ID remains diagnostic |
| HELD F or deferred-FAILED F | Coalesce/reenter F through one gate; IN_PROGRESS | Same RETIRED disposition above | Original RV6.2 |
| REMOVING J or F | Queue REENTER F behind the admitted retirement gate; no concurrent CREATE, no memo write. If no retirement attempt is in flight, an explicit CREATE F may attempt its authoritative continuation; lifecycle/journal decide whether it is allowed | Same RETIRED disposition above; original CREATE is not a new REMOVE | RV6.3 remains deferred typed RETIREMENT_IN_PROGRESS under the request; no route |
| Permanent FAILED, REMOVED, absent, or initial pending-current | Admit/queue REENTER F under F's original identity; no automatic loop. Prior permanent presentation does not erase nonterminal journal custody | Same RETIRED disposition above | RV7.2/normal routing remains, except pending-current defers unknown requests as section 4 specifies |
| Unavailable currentness for purported ACTIVE same-origin success | No success from the memo; route/coalesce exact F for fresh authoritative disposition, with state writes fenced | Retain debt and typed retirement deferral | Typed retryable currentness unavailable; do not emit borrowed or unconfirmed CREATE_ACTIVE |

The same-current ACTIVE fast reply requires a synchronous physical-owner observation that confirms both exact origin and creation-projection eligibility. This narrows the old same-id fast reply when direct manager work has invalidated its memo; a stale memo cannot manufacture current success. No journal/token is minted by this check.

A known retirement-only plan's CREATE reply does not itself retry physical retirement. Its already queued startup attempt, matching exact REMOVE/redrive, historical housekeeping trigger, or restart owns that action. The same rule applies to a REENTER plan transferred to retirement-only custody by an admitted exact REMOVE (§7). Once a terminal journal observation exists, future CREATE uses the terminal-row answer instead of retirement deferral. Startup retirement never emits a CREATE or REMOVE executor outcome merely because it ran.

For known REENTER, original CREATE redelivery is a trigger even after a permanent CREATE refusal, because the journal may still be PENDING/IN_PROGRESS. The same ordinary route rereads authority and may return the same refusal; there is no promise of success or fabricated prerequisite event. This specifically permits future PENDING F to retry after the real selection/ordinal prerequisite changes without resuming J. It does **not** change which reserve answers map to permanent/deferred CREATE outcomes.

## 6. Applicable wake dispatch and bounded retry

Wake lookup uses original operation, service/entity and exact binding/token identity, with the existing capture/identity owner. It checks the exact in-flight origin first, then retained plan, then the original named-memo fallback. A retained tokenless F cannot match a token-bearing native wake until its original authoritative continuation has persisted and exposed that exact token. Mismatching token/binding never schedules a plan merely because the operation ID matches.

| Wake/plan condition | Result and effect |
| --- | --- |
| Stopped lifetime | Typed closed/refused answer; no pending work |
| Missing/mismatched operation, service or identity | Existing NO_LOCAL_OPERATION (or typed identity conflict for conflicting known origin); no effect |
| CREATION_GRANT_HELD with grant.outcome UNAVAILABLE | RECORDED, no queued or pending reentry, independent of memo/plan state; Recovery Revision 5 preserved |
| CREATION_RESOURCE_CLOSED | RECORDED, no CREATE reentry; does not authorize unrelated retirement |
| Exact CREATE attempt in flight; allowed genesis/grant-held reason | Set one pending wake on that exact admitted entry; RECORDED |
| Known REENTER waiting gate | Coalesce one pending wake with that plan; no second queue record |
| Known REENTER waiting trigger, EVENT_OR_REDELIVERY | Queue one exact continuation through gate; QUEUED, even when J owns the memo |
| Known REENTER waiting trigger, REDELIVERY_ONLY | RECORDED only; permanent refusal cannot create an event-driven retry loop |
| Known RETIRED or terminal plan | RECORDED, no CREATE reentry |
| No plan, existing named HELD/in-flight memo target | Original RV2.4/RV5.3 fallback semantics, now using stable common gate |

Only the existing allowed genesis/grant-held wake reasons can request a pending reentry. Pending wake consumption occurs after settlement, and only if the resulting plan is EVENT_OR_REDELIVERY and nonterminal. It joins the queue tail, behind already waiting initial plans; no recursive immediate execution. Repeated wakes coalesce to one outstanding follow-up per exact origin. UNAVAILABLE grants never set this bit.

Nonterminal REENTER debt retries on its original CREATE redelivery, an applicable wake under this table, or restart. F with no native object has **only original CREATE redelivery or restart**. Retirement-only debt retries on matching exact REMOVE/redrive, one initially queued gate resumption, an admitted canonical REMOVE's bounded historical pass, or restart. A later exact CREATE remains a typed deferral and is not itself a retirement trigger. No timer, polling loop, new metadata watcher, fresh operation identity or second durable debt journal is introduced. Progress is conditional on these named triggers and restored owner prerequisites.

## 7. One handler admission gate, captured targets and exact settlement

The existing `inProgressOperations` owner is the only execution gate. It checks canonical replica conflicts and installs a stable entry synchronously before `setImmediate`, callback, await or owner call. Entries carry kind, request operation (if any), original creation, canonical replica, lifetime and settlement identity/promise. All bound startup, CREATE/redelivery/wake and coordinator REMOVE paths use it. There is no separate startup/remove registry that can admit conflicting work.

An initial/retained plan waiting on a busy canonical key remains in the retained inventory collection; the already-applied startup promise does not wait for that debt to finish. There is one queued record per exact plan plus one coalesced pending wake. Queue order is admission order, with already queued initial work ahead of newly generated follow-ups. It is scheduling order only, never winner authority. Each initial plan runs at most once in the initial pass. A settled unresolved attempt releases the gate and becomes WAITING_TRIGGER; it cannot insert itself ahead of J. No timeout guesses resource finality.

Coordinator REMOVE captures its original creation from the owned named memo **at admission**, before queuing physical work. It carries that origin through `removeReplicaAsync`; that function may not look at a later memo to choose a target. If canonical currentness is unresolved, REMOVE returns the typed retry from section 4. A historical RETIRED plan does not become the canonical target just because it is the last array entry.

Busy request behavior is explicit:

- Same already admitted coordinator request with the same immutable request/target: existing IN_PROGRESS reply, no second work/outcome obligation.
- A different coordinator request while the canonical gate is busy: ERROR with owner-defined `BOUND_OPERATION_BUSY`, `deferRetry:true`, no admission and no executor outcome. The existing caller retry path must consume this carrier; it must not interpret the refusal as an accepted REMOVE. This is a prospective amendment of the old different-request busy response, avoiding an unbounded queue of newly accepted requests.
- Known original CREATE/plan retry: IN_PROGRESS while its one retained plan waits/coalesces. Its eventual CREATE result still belongs to that original operation.
- Same-origin startup retirement waiting on admitted coordinator retirement: it consumes that exact settlement result, including separate journal completion, rather than launching a second retirement. Different origins share only scheduling, never completion authority.

The admitted entry owns one attempt. Settlement first records the plan/result and any permitted memo/outcome while lifetime and entry identity still match, then removes only that exact installed entry and resolves its settlement promise, then admits the next waiter. An old finally/late callback cannot delete a newer entry with the same request ID or canonical key. Every queued waiter rechecks lifetime and terminal state. Physical work admitted below remains lifecycle-owned even if handler settlement is suppressed by shutdown.

Admitting an exact coordinator REMOVE for a retained REENTER origin transfers that plan monotonically to `RETIREMENT_ONLY` before the first owner await. The admitted REMOVE request/target identity is retained with that plan. This records an already-authorized retirement, not a conclusion from metadata phase or local absence. A refusal, unknown reserve result, physical terminal result or failed completion does not switch the plan back to CREATE. Original CREATE redelivery thereafter uses the RETIRED/retirement-in-progress cell in section 5; native wakes cannot reopen it. The existing exact bound retirement path resolves PENDING reservation under lane A's SEALED/UNRESOLVED contract, then continues physical/projection/original-row completion when authorized. Terminal journal observation settles the plan as stated earlier.

This mode handoff is essential when a plan began as REENTER but its later admitted REMOVE physically closed it and original completion stayed UNKNOWN. If J subsequently becomes current, the old plan remains a separately owed retirement continuation and cannot become invisible merely because its initial scan classification was not RETIRED.

A successful coordinator REMOVE for current J may schedule one housekeeping pass over historical `RETIREMENT_ONLY` plans captured for that canonical key. Each must carry either the original exact local RETIRED inventory evidence or the exact earlier admitted REMOVE target/request handoff. The pass is bounded by those plans, gives each at most one attempt, and emits no executor outcomes. It never changes J's captured target/result or retires a REENTER origin without that existing custody. A failed/held J attempt may still release its gate; it does not recursively trigger unbounded housekeeping passes.

## 8. Current physical observation and local projection ownership

Expose one synchronous read-only current-creation observation through the existing adapter/runtime/driver chain, supplied by `WasmServiceLifecycle`. It validates exact captured origin and returns canonical `CURRENT`, `ABSENT`, `DIFFERENT`, or `UNAVAILABLE`. `CURRENT` means the registered active object matches the complete immutable origin/token, including if it is now stopping. The owner also returns `creationProjection: ELIGIBLE | FENCED`: ELIGIBLE only while its admission is open and that exact object is CREATED/STARTING/READY, not STOPPING/CLEANUP_REQUIRED/STOPPED. This is eligibility for a local CREATE projection, not metadata grant or serving permission. The lifecycle owns this state classification; callers do not copy its phase table.

ABSENT means no registered physical current object, not permission to open. DIFFERENT means a different exact creation occupies the entry. UNAVAILABLE names an absent/unsupported observation dependency or invalid/unreadable observation, never an implicit CURRENT. The observation performs no I/O, open, reservation, stop, or state mutation and returns no traversable replica object. No alternate copied-token registry is introduced.

Manager `_replicaStateById` becomes one canonical record `{state, ownershipKind, origin}`; generic records use a named generic ownership kind in the same representation. `getReplicaState` still returns the state string. Convert every generic writer mechanically; no mixed strings/objects or second identity map. The record is presentation only.

For bound CREATE, manager does not write STARTING before prepare. After prepare, it observes CURRENT/ELIGIBLE synchronously before projecting STARTING. It repeats this check after start and metadata-confirmation awaits before local state writes; prior READY/PUBLISHED replies are insufficient. Unknown currentness returns typed unresolved currentness without claiming J's state. Existing HELD/PUBLISHED_UNPROJECTED/RUNNING semantics remain; physical-currentness is an additional necessary condition, not a substitute for grant confirmation.

The handler's one bound-settle writer uses the same observation immediately before any named current memo takeover. It may write a provisional singleton result if no different current owner exists and the memo still belongs to that same origin, but never replace a proven different/current J on a noncurrent refusal. Collision pending-current remains until an eligible exact current continuation establishes ownership.

For bound retirement, manager may mark STOPPING only when both its record and the immediate physical observation identify the retiring origin. Historical cleanup proceeds even when neither map belongs to it. After physical terminal completion it may mark STOPPED only if its canonical record still belongs to that origin and no successor is current; ABSENT is acceptable for this exact former record, DIFFERENT/UNAVAILABLE is not. Completion of I's original journal does not depend on I owning the canonical record.

Driver prepared/running/lifecycle/context mutations are included in this interaction. Prepare installs bookkeeping only after exact physical admission; start cannot use J's prepared record to start I; stale bound results cannot mark J running or delete J's bookkeeping. Retirement cleanup retains the existing exact-token check, strengthened to complete captured origin where required. Publication requests continue using original instance-qualified physical IDs; rechecking currentness before issuing a new CREATE publication prevents a stale local answer from authorizing a new one. Already submitted external effects retain their existing exact-identity/incarnation owner contract; B0 does not claim cancellation of accepted external writes.

## 9. Physical retirement result and strict original-journal completion

The physical retirement owner defines one canonical fact carried unchanged through driver/runtime/manager/handler:

| Physical finality | Required evidence | Meaning |
| --- | --- | --- |
| `TERMINAL`, proof `CLOSED_ACKNOWLEDGED` | Existing exact retirement path completed local non-serving work and authority returned CLOSED for the exact token | Normal closure, including existing valid missing-storage + CLOSED behavior |
| `TERMINAL`, proof `LOCAL_RETIRED_HISTORY` | Exact local tombstone outcome RETIRED or ALREADY, with full local/storage identity validation, plus exact authority HISTORY_UNAVAILABLE | Historical physical finality, not a claimed CLOSED CAS |
| `PENDING` | Unknown/unavailable close, incomplete cleanup, or insufficient historical local proof | Durable original obligation remains |
| `REFUSED` | Existing permanent identity/content/corruption refusal | No unsafe tombstone/close inferred; original diagnostic/custody remains |

Only the retirement owner derives this fact. Raw release/tombstone/close answers are retained beside it. Raw `closed`/`retired` booleans are diagnostic, never separate downstream completion predicates. In particular, `retired:true` includes CREATION_STORAGE_MISSING in current source and cannot prove the history case. Unknown, absent, corrupt or conflicting local evidence plus HISTORY_UNAVAILABLE is not terminal.

Endpoint withdrawal keeps its existing position before physical retirement and exact identity/incarnation behavior. Its raw result remains visible. This amendment does not turn current best-effort endpoint cleanup into a proof of endpoint absence; activation owns its production stale-incarnation completion path.

After physical TERMINAL, the runtime requests STOPPED for the exact old physical services row. **Awaiting a callback is not an applied receipt.** U1 `_projectReplicaState` (`service-runtime-lifecycle.js:473–502`) can return undefined for absent writer or swallowed STOPPED failure, and can return RETAINED. The bound retirement path therefore requires the configured writer's explicit applied acknowledgment (`projectionResult.applied === true`, not RETAINED or `applied:false`) for that exact submitted physical-row STOPPED request before claiming its projection complete. A no-op acknowledgment must mean the exact row is already absent under that owner's idempotent contract. A missing/failed/retained/malformed reply is typed projection-pending, and journal completion is not attempted.

This uses the existing bound projection interaction and preserves generic best-effort behavior elsewhere. The embedding already has an `applied:true` projection sink. Production RETAINED-to-APPLIED continuation remains activation-owned; B0 makes no claim that it is presently wired. A later retry may obtain the actual applied acknowledgment. No success is inferred from nonthrowing undefined.

The ordered retirement stages are:

1. Existing endpoint withdrawal attempt, recorded honestly.
2. Exact physical terminal retirement, including joined local cleanup.
3. Applied exact physical STOPPED acknowledgment.
4. `completeConsensusCreation` CAS and authoritative reread confirm the original journal COMPLETED.
5. Fully completed handler/plan settlement.

Manager returns separate named projection and completion states, preserving physical proof even when a later stage is pending. `completeConsensusCreation` accepts the canonical terminal proof, not a caller-supplied bare boolean. Its journal completion payload records the proof kind and raw close/local outcomes; HISTORY_UNAVAILABLE must not be serialized as `{closed:true}` or an applied CLOSED CAS. The original row identity and token are revalidated. Repeated completion is idempotent and requires the same authoritative terminal observation.

`{physical:TERMINAL, completion:UNKNOWN}` and legacy `{closed:true, completion:UNKNOWN}` both mean pending debt, never fully complete. Coordinator REMOVE stays HELD with the precise reason; historical startup plan stays WAITING_TRIGGER. Retry uses the same original retirement/projection/completion path, creates no STOP journal and no new physical creation. Loss of old authority history cannot make the original journal unreachable. A confirmed original terminal row can settle from that row directly; COMPLETED/CANCELLED satisfy REMOVE, FAILED produces its existing typed failure. No terminal observation is fabricated from a physical boolean.

## 10. Physical task custody, direct callers and shutdown

`WasmServiceLifecycle.retireReplica` synchronously captures/validates and registers an exact retirement task **before the first asynchronous collaborator**, including by-path work with no active object. Registry entries identify full origin/token and settlement. Exact duplicates coalesce; different origins never do. It invokes the existing retirement mechanism; the registry is lifetime custody, not another semantic retirement path.

Lifecycle create admission observes both its existing active/retiring replica fence and admitted retirement tasks for that service. A new bound physical open cannot pass a by-path retirement that is still able to touch its path/service. Existing J need not be destroyed for historical I cleanup, and I never retires J. Direct manager callers obey this physical fence even if they bypass the handler scheduler.

`shutdownAll` sets `consensusClosing` irreversibly before taking/joining obligations. It refuses new retirement/create admission, joins all already admitted exact retirement tasks, and joins active/retiring replica shutdowns. Task registration before invocation ensures a synchronous collaborator/reentrant shutdown cannot miss an admitted task. Tasks added before the closing linearization are included; none may be added afterward. The process/directory owner cannot be released until this joined cleanup succeeds. A by-path await cannot later resume into a tombstone after custody transfer.

Physical task lifetime ends when it can perform no more path/native effects. A settled typed metadata-unresolved result leaves the original durable journal debt; it need not keep a physical task forever. A cleanup rejection that leaves native/file resources open remains in the existing retained cleanup custody and makes shutdown reject. Repeated shutdown may retry that retained cleanup; admission stays closed. No finally block releases a process owner on failed cleanup. At U1 the real directory wrapper `src/storage/data-directory-process-owner.js:64–72` releases only after `shutdownRuntime` fulfills; `src/lagrange-runtime-startup.js:715–719,769` registers failure-sensitive cleanup and binds that wrapper. Preserve those existing fences. The embedding shutdown at `test/wasm-service/bound-creation-handler-embedding-fixture.js:179,283` must await the newly joined lifecycle operation before releasing its actual owner. Implementation review must inspect both compositions, not only a lifecycle stub; no additional directory-owner repair is presumed.

## 11. Supersession and owner-change ledger

| Existing term | Prospective v3 change |
| --- | --- |
| V2 section 4 says normal memo routing resumes once J is current | Replaced by section 5's retained-plan precedence on every later applicable original CREATE, and section 6 on wakes |
| RV6.2 different request reenters memo creation | Preserved only when request has no matching retained plan; exact F goes to F |
| RV6.3 every CREATE during named REMOVING merely defers | Known REENTER F queues behind admitted retirement; known RETIRED F still defers; genuinely foreign fallback unchanged |
| RV7.2 permanent memo may not capture a later request | Preserved; retained plan is indexed by original request, never selected by another origin's memo. Explicit redelivery may retry its own nonterminal debt; permanent outcomes do not event-loop |
| RV7.3 different request at ACTIVE definitively conflicts | Preserved for no retained-plan match; distinct known F reaches authoritative continuation. Same-id fast success additionally requires current physical eligibility |
| R1-A/R1-B/R1-H named memo for each inventory entry | One exact plan per origin; collision-only pending-current memo; one application/lifetime |
| R1-E startup redrive registers separate removal entry | Same canonical gate as coordinator CREATE/REMOVE, stable entry identity, no startup outcome |
| R1-D/R1-E closed boolean means retirement completion | One physical proof, applied exact STOPPED acknowledgment, separately confirmed original journal, then full settlement |
| Old different-request busy REMOVE response | Typed retryable unadmitted BOUND_OPERATION_BUSY; same admitted request remains IN_PROGRESS |
| A retained REENTER later receives an admitted exact REMOVE | Its plan transfers monotonically to retirement-only custody before the owner await; UNKNOWN completion survives loss of the current memo and is included in the bounded already-authorized historical pass. This does not authorize retiring a merely selected or superseded REENTER origin. |
| V2 task lifecycle/currentness language | Explicit trigger classes, exact token refresh, physical task join, typed observation, stable settlement ordering |

Source owner scope for a later B1 implementation: handler/restart/bound route and existing vocabularies; manager/recovery/state writers; operation SQL builder; original creation intent/completion; consensus bootstrap; existing service adapter/runtime/driver chain and driver bookkeeping; lifecycle/retirement; bound runtime publication and its existing projection result contract. New concepts remain in their existing semantic owners; no parallel journal, generic recovery engine, public physical-replica traversal or selection policy is introduced.

Lane A's finality correction owns constants/service-instance, resource state, metadata and `service-consensus-creation-intent.js`. B consumes its SEALED/UNRESOLVED negative reserve contract. B must not infer sealing from names or reinterpret CREATE dispositions. **Serialize all writers to shared `service-consensus-creation-intent.js` and any shared handler/runtime expansion.** A0/B0 can overlap. A1/B1 composition needs fresh exact-head verification including F pending reservation plus REMOVE/retirement.

## 12. Review decisions, exclusions and exit

The author has made concrete design choices; they await independent judgment, not a menu of routine implementation questions. The reviewer must accept or reject the following as one coherent interaction:

1. Exact-plan precedence and every section-5/6 cell, including same-current duplicate, RETIRED CREATE, permanent nonterminal plan, token transition, and real wake eligibility.
2. Collision-only pending-current state, single observation/application and stopped lifetime.
3. Common gate, unadmitted busy request carrier, queue fairness, captured REMOVE origin and exact settlement/coalescing identity.
4. Synchronous physical observation, its eligibility distinction, canonical manager record and full stale-writer census.
5. Exact historical physical-finality proof, applied STOPPED acknowledgment, truthful journal payload and UNKNOWN completion retention.
6. Physical task registration/join, direct create fence and actual directory release coupling.
7. Conditional retry/liveness limits, the later admitted-REMOVE retirement-only handoff, and explicit multiple-origin unresolved state; no automatic retirement of a REENTER origin without that handoff.

Potential rejection should name an actual missing interleaving, conflicting sealed term or owner/proof mismatch, with a proposed bounded correction. None of these choices has author-issued approval. Changes to this draft's exact contents invalidate any prior content verdict.

The full F2–F6/D1 matrix is mandatory. Both predecessor/successor orders, multiple historical debts, real owner history advancement, real directory transfer, unknown completion, no-op applied projection, and all original no-plan custody controls must be covered. A design review traces source and oracle; it does not claim those tests have run. Later implementation requires meaningful red witnesses, independent verification, applicable static/corpus/lab evidence and composed-head review under the existing Quest.

Out of scope: U2 grant progress bound/C9, production recovery reader wiring, automatic policy for choosing/retiring legitimately admitted origins, production endpoint/projection continuation activation, new Quest/seal, task-v2 proof substitutions, lab submissions, parent closure, publishing/merge. These exclusions are not closure claims. The missing production wiring and remaining durable obligations stay explicit.

B0 exits only with a separate complete exact-content APPROVE or retained REVISE with counterexamples. Only APPROVE allows preparing B1 at its actual new base. U1 remains REJECT until its corrected source is independently verified; no Harnessd PROVEN status follows from this draft.

## 13. B0 review transport and first executable handoff

This artifact is a GUIDING design-review request within the existing Quest. Its
review result is an independent, exact-content verdict. It is not an executable
task-v2 definition, and no document-existence command may translate it to PROVEN.
`guiding-review-request.md` names the exact review subject and acceptance checklist;
`source-manifest.json` pins every source/evidence input. `first-executable-b1-inputs.md`
records the conditional test-only checkpoint and production-task inputs, without
pre-accepting either. The original U1 REJECT and v2 INCOMPLETE/REVISE remain intact.
