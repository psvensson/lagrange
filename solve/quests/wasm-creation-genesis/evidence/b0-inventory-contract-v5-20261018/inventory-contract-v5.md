# B0 restart inventory, exact continuation and retirement contract — v5 draft

**DRAFT FOR INDEPENDENT REVIEW — NOT APPROVED.** Author: `/root/rsraft_b0_contract`, 2026-10-18. This is a concrete design proposal within the existing `wasm-creation-genesis` Quest. It is not an accepted Harnessd task, implementation permission, a dynamic pass, or parent completion.

## 1. Subject, predecessors and meaning of this document

Source subject is **`a251ce4fd9c980a78c0fd33d8a5f873161f90870`** (U1). Proposed planning base is **`a1c3cde54fcb46471791062bcae4a6000ae484e0`**; their `src/` and `test/` bytes were compared and match. Source references below are at U1, not the dirty primary. The primary remains `2b863e4f300fc8ebdfb80e2752606187eed1436c`, with its 18 unrelated staged paths untouched.

This successor preserves v3 at commit `8d4145064671a5b400e12eb226ffddf0b22b97b7` and its independent **REVISE** (`7c34c42a2c86a5b05d3ec6df87b67d28babcd34f5bd4416ec72176e45516fb81`, retained in `../b0-inventory-contract-20261018/independent-review-v3.md`). It prospectively supersedes v3 in full, proposing corrections for its three named gaps: durable REMOVE target/replay, token exposure before native wakes, and every generic/bound canonical writer. V3 and all older evidence remain immutable.

V5 additionally preserves v4 at `f21875950648a2a3fe1c1e50330d53012be18a31`
and its category-complete independent **REVISE**, SHA256
`68adea662a4c0ddd52b68bcd69b9eaf83387f324a33027cb64837b2f90ac65cb`,
retained in `../b0-inventory-contract-v4-20261018/independent-review-v4.md`.
This complete successor retains the reviewed v3 corrections and adds the bounded
B04 correction: fresh UNBOUND nomination must observe actual currentness or one
complete journal-owned absent-origin candidate. Known durable replay remains
pinned to its earlier exact target. Neither predecessor verdict is rewritten.

This draft also prospectively replaces the complete proposed contract in `u1-inventory-continuation-contract-v2.md` (SHA256 `b871e38a5307933e32c085e55e47b0a650c42319da85073b67e028116594858f`). It does not modify that file or its stopped review (`1b9295a3d4e29beec1107adf6dfb9b778244fcf66358a1d3fb5d7eeacadde5d9`, **INCOMPLETE / REVISE**). U1's independent verdict remains **REJECT**, hash `aa5ec206809b76613f55b7547b318a3d4994757d7379d71dbd83fcc5c9b2f168`.

These preserved files are under `solve/quests/wasm-creation-genesis/evidence/recovery-20261017/`. The paired proposed acceptance oracle is `oracle-matrix-v5.md`; neither document is approved by its existence. An independent reviewer must bind a verdict to both exact contents and this exact source.

V5 chooses the **exact retained-plan precedence** resolution of D1. It does not choose restart-only progress. It retains v2's journal-only observation, distinct original obligations, physical-owner currentness, shared CREATE/REMOVE gate, separate physical/journal finality and shutdown join. It makes their ambiguous routing, trigger, completion and settlement cases explicit. No production or test file is changed by this draft.

## 2. Authority, identity and state

There is one owner for each fact:

| Fact | Owner | What the handler may retain |
| --- | --- | --- |
| Immutable coordinator REMOVE target | Existing replica-operation authority and its `replica_operations` row | Read-only exact owner observation; no handler authority or memo-derived replay |
| Original immutable creation intent, admission token and retirement handoff; terminal row | Original `wasm_operations` journal through `service-consensus-creation-intent.js` | A validated continuation reference, never a replacement journal |
| Reservation, resource phase, exact-token finality | Resource-state owner through metadata interaction | Raw owner answer; no finality reconstructed from outcome names |
| Local opening/tombstone identity | Opening module and its by-path reader | Validated inspection evidence; not opening permission |
| Current physical replica and admitted physical retirement work | `WasmServiceLifecycle` | Its synchronous observation or task result; no copied physical registry |
| Bound scheduling, request replies and canonical memo | `RuntimeServiceHandler` and its bound route | One startup task, exact plans, one admission gate |
| Canonical lifecycle-state presentation | `ServiceLifecycleManager` | One ownership-bearing state record per canonical replica |
| Discovery effects | Existing runtime projection/endpoint owners | Exact physical-identity requests and their actual acknowledgments |

An **origin** is the original operation ID plus the canonical captured creation intent, node, entity and canonical replica. An admission token is either explicitly absent or the exact token persisted for that origin. Token absence may become present only from the original journal's authoritative continuation/reread at the section-6 exposure point. Once present, a different token or intent is a conflict; it never silently replaces the plan. The existing capture/identity owners perform comparisons.

The canonical replica is a scheduling/presentation key, not a winner-selection rule. Selected and retiring bindings both retain obligations (`service-instance-state.js:198–207,240–249`). Array order, timestamps, lexical IDs, selection versions, PUBLISHED/ADMITTED phase and memo absence cannot discard or authorize an origin.

A plan holds origin, token state, opening evidence, local inspection, continuation mode `REENTER` or `RETIREMENT_ONLY`, last typed result, and these independent facts. An original-journal retirement handoff or initial local RETIRED observation selects `RETIREMENT_ONLY` (startup action `REDRIVE_RETIRED`); the additional admitted-REMOVE handoff below can select that same mode later:

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

A singleton REENTER plan seeds the existing named HELD projection; a singleton retirement-only plan seeds named REMOVING. These are provisional routing states, not a claim that a physical object currently exists.

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

The exposure point is part of the manager/handler interaction, not an inference
from a wake. `resumeConsensusCreation` passes the exact validated
ADMISSION_RETAINED answer to a synchronous, per-call handler continuation observer
**after** `recoverConsensusCreation` has confirmed its original journal identity
and token and **before** `continueRetainedCreation` calls adapter create/start.
The existing manager performs this sequencing; the handler does not split the
operation into a competing recover/open path. The observer captures through the
existing identity owner, checks the still-installed gate entry and live handler,
and installs the exact origin/token on that entry and its plan. It returns a
named accepted/refused result synchronously, never a promise. A malformed,
conflicting, stopped or replaced entry refuses continuation before physical work;
absence of the optional observer for a direct manager caller does not invent a
handler observation. This is identity handoff, not an additional resource grant.
Every manager physical continuation still uses its original admission authority.

Thus a newly retained token is visible before either a binding/genesis or
allowed grant-held native wake emitted by that **same** continuation. Both events
may occur within the manager await and coalesce to one pending bit. Native wakes
are enqueue-only and never await the run that emitted them. An event carrying a
wrong token before or after exposure is not journal authority and cannot populate
the plan. A wake from independent work before this invocation has exposed an
identity may return NO_LOCAL_OPERATION; the contract promises no replay of such
an unmatched pre-exposure event. Its original CREATE redelivery/restart remains
the named trigger. The decisive guarantee is that this invocation cannot create
its own token-exposure gap. No untrusted wake buffer or second journal read is
needed for that guarantee.

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

Coordinator REMOVE first resolves the immutable target through the existing
replica-operation owner as specified in §7a. The stable canonical gate is installed
before that asynchronous read, but this is a **pre-admission** attempt: no
INITIATED/accepted reply, retirement effect or executor outcome exists yet. A
known durable binding takes precedence over the memo, retained-plan order and
current J. Only an explicitly new, owner-confirmed UNBOUND operation may nominate
an origin using the fresh physical/unique-origin selection rule in §7a. The memo alone is never nomination authority; the original creation journal validates its identity. A missing legacy binding is not UNBOUND. An unresolved current
origin refuses typed. `removeReplicaAsync` receives the exact confirmed target;
it never rereads a later memo to choose one.

Busy request behavior is explicit:

- Same coordinator request while its exact pre-admission/admitted gate entry is running: IN_PROGRESS only when the original attempt has actually been admitted; otherwise the same typed binding/handoff-pending reply. No second work/outcome obligation. After settlement, re-read its durable binding before retry; do not recapture the memo.
- A different coordinator request while the canonical gate is busy: ERROR with owner-defined `BOUND_OPERATION_BUSY`, `deferRetry:true`, no admission and no executor outcome. The existing caller retry path must consume this carrier; it must not interpret the refusal as an accepted REMOVE. This is a prospective amendment of the old different-request busy response, avoiding an unbounded queue of newly accepted requests.
- Known original CREATE/plan retry: IN_PROGRESS while its one retained plan waits/coalesces. Its eventual CREATE result still belongs to that original operation.
- Same-origin startup retirement waiting on admitted coordinator retirement: it consumes that exact settlement result, including separate journal completion, rather than launching a second retirement. Different origins share only scheduling, never completion authority.

The admitted entry owns one attempt. Settlement first records the plan/result and any permitted memo/outcome while lifetime and entry identity still match, then removes only that exact installed entry and resolves its settlement promise, then admits the next waiter. An old finally/late callback cannot delete a newer entry with the same request ID or canonical key. Every queued waiter rechecks lifetime and terminal state. Physical work admitted below remains lifecycle-owned even if handler settlement is suppressed by shutdown.

An exact coordinator REMOVE becomes admitted only after §7a confirms the durable target and original-journal retirement handoff. Before replying INITIATED or scheduling physical work, it transfers the exact plan monotonically to `RETIREMENT_ONLY` and installs the physical owner's exact-origin admission fence. The original journal supplies this mode on restart. The admitted REMOVE request/target identity may be retained with the plan as an observation, never as its only replay authority. This records an already-authorized retirement, not a conclusion from metadata phase or local absence. A refusal, unknown reserve result, physical terminal result or failed completion does not switch the plan back to CREATE. Original CREATE redelivery thereafter uses the RETIRED/retirement-in-progress cell in section 5; native wakes cannot reopen it. The existing exact bound retirement path resolves PENDING reservation under lane A's SEALED/UNRESOLVED contract, then continues physical/projection/original-row completion when authorized. Terminal journal observation settles the plan as stated earlier.

This mode handoff is essential when a plan began as REENTER but its later admitted REMOVE physically closed it and original completion stayed UNKNOWN. If J subsequently becomes current, the old plan remains a separately owed retirement continuation and cannot become invisible merely because its initial scan classification was not RETIRED.

A successful coordinator REMOVE for current J may schedule one housekeeping pass over historical `RETIREMENT_ONLY` plans captured for that canonical key. Each must carry either the original exact local RETIRED inventory evidence or the exact original-journal retirement handoff, validated against its original intent. The pass is bounded by those plans, gives each at most one attempt, and emits no executor outcomes. It never changes J's captured target/result or retires a REENTER origin without that existing custody. A failed/held J attempt may still release its gate; it does not recursively trigger unbounded housekeeping passes.

## 7a. Durable REMOVE target and original-journal custody handoff

This is an explicit expansion of B1's declared interaction, required by v3 review
B01 and the parent's 2026-10-18 scope judgment. Ordinary production dispatch must
use it; a component-only callback or an activation TODO does not satisfy B1.
It extends two existing rows for two different facts, with no new STOP operation,
new table, handler ledger, generic removal framework or resource grant algorithm.

**Request owner and representation.** The replica-operation authority owns one
canonical nullable `runtime_remove_target_json` field on `replica_operations`,
with a closed versioned shape. New runtime-service REMOVE operations, and the
REMOVE side of runtime-service REPLACE operations, initialize it atomically with
their original operation insert to `{format:1, kind:UNBOUND}`. This marker means
that this protocol has never admitted a removal effect for the request. Existing
NULL/missing records are `LEGACY_TARGET_UNKNOWN`, never automatically migrated to
UNBOUND. This is an explicit compatibility refusal for already-existing
unqualified requests; no target can be recovered from their current memo alone.
The ordinary planner may create a new operator/owner-authorized operation when
that old obligation is resolved by its owner; B1 cannot silently rename/reissue it.

The only write-once target transitions are UNBOUND→BOUND or UNBOUND→GENERIC.
BOUND contains the original creation operation ID, canonical immutable-intent
SHA256, service/entity ID, canonical replica ID and target node ID. Its enclosing
operation row supplies request ID, REMOVE/REPLACE type and immutable workflow
identity. The admission token is **not** a mutable copy in this target: the
creation journal owns absence→exact-token retention and full token validation.
GENERIC records that this original request was admitted to the existing unbound
runtime path; it can never later become BOUND if that canonical key is reused by
a bound creation. Its later generic attempt must refuse before physical action
when an exact bound owner now occupies the key. This classification protects the
bound target; it does not redesign generic generation authority or partition/MG
removal. Each value is canonical encoded, closed-field validated and byte-bounded
using the existing identity/string/digest limits; SQL NULL has the distinct legacy
meaning. No diagnostic `steps_history` entry is the target authority.

**Owner operation, not a browser/request assertion.** The handler consumes a
narrow operation-owner `read/bindRuntimeRemovalTarget` interaction through the
existing authoritative control-plane gateway (`OWNER_RPC_REQUIRED`, leader
required), following the existing exact row CAS + authoritative reread discipline
used by `replica-create-admission-owner.js:346–377,534–590`. This does not route
runtime removal through the partition CREATE owner. Implement the bounded target
interaction at the replica-operation semantic owner and reuse the gateway.
Request-carried target data, if any, is only a comparison value and never grant.
The owner validates original request/type/entity/replica/node and the actual REMOVE
workflow phase through `replica-operation-step-policy.js`, not a copied consumer table: a new named runtime binding row covers REMOVE at SENDING/ACTIVE/STOPPING and REPLACE at ACTIVE/STOPPING. PENDING has not completed dispatch claim, and REPLACE SENDING still creates its target, so neither permits binding. Existing remove-safety and source-removal ownership checks remain mandatory; this binding adds no permission to bypass them. It never accepts
a cached row as absence, uses the REPLACE source replica/node rather than its
replacement target, and refuses a terminal operation for new target binding.

**Fresh nomination has its own physical selection point.** This paragraph
applies only to an owner-confirmed genuinely UNBOUND request. Known BOUND replay
uses the stored target and must not be subjected to a new current-winner test.
While holding its canonical pre-admission gate, the handler obtains/validates the
candidate's original immutable identity through the creation journal owner. A
memo is a nomination hint only. Immediately before choosing the candidate, with
no intervening await or collaborator call, it synchronously consumes the physical
owner's exact observation from §8:

| Physical observation at fresh nomination | Permitted target choice |
| --- | --- |
| CURRENT matching the complete nominated original origin | Choose exactly that I. CURRENT may be stopping/FENCED; retirement does not require CREATE-projection ELIGIBLE. The journal identity must still match. |
| DIFFERENT, including already-current J behind a stale ACTIVE-I memo | Refuse CREATION_CURRENT_UNRESOLVED before target CAS, handoff, physical effect or executor outcome. Do not silently nominate J from the discrepancy. |
| UNAVAILABLE/malformed/mismatching CURRENT | Same typed no-admission refusal; a memo cannot substitute for owner observation. |
| ABSENT and the journal owner has supplied exactly one recoverable original obligation for this node/entity/canonical replica | Choose only that exact I after its immutable identity validates; tokenless PENDING and retirement-only I are allowed. ABSENT alone supplies no authority. |
| ABSENT with zero, multiple, truncated, unavailable or undecodable candidate evidence | Typed CREATION_CURRENT_UNRESOLVED; no target CAS, handoff, effect, success/NOT_FOUND or arbitrary winner. |

For the ABSENT case, the original creation-journal owner performs one complete
storage-bound PENDING/IN_PROGRESS observation for the requested canonical scope,
using the existing SQL/inventory validation owners. It counts **distinct original
origins** after exact duplicate folding, not rows, handler plans or memo entries.
Every candidate must have validated node/entity/canonical-replica identity; an
undecodable relevant identity or any inability to prove the observation complete
refuses. Missing owner wiring, non-array/error, paging/truncation, conflicting
duplicates and partial failure cannot become an empty or singleton result. Valid
foreign-node/entity/replica rows do not become candidates. A uniqueness result
may select neither by timestamp, array order, phase, ordinal nor selection
version. This is a bounded read triggered by one explicit request, at the
existing journal owner; it makes no resource metadata/reserve/open/tombstone call,
creates no journal, and does not reapply the startup inventory. B1 includes this
query and its real production owner read boundary; a complete handler inventory
snapshot is not a substitute for current owner completeness. The reader's actual
storage atomicity is the limit; no cross-shard aggregate is assumed atomic.

The journal identity/uniqueness observation completes **before** the synchronous
physical nomination check. If physical I appears, CURRENT must still match the
candidate; if J is already current the request refuses. This defines the target
selection snapshot, not atomicity across journal/physical owners. Once I is
validly chosen, a J arriving later does not retarget this request. The subsequent
CAS makes that exact selection durable; losing/unknown CAS still follows the
rules below. Successful R completion means its selected I has completed the
required retirement, not that the canonical key can never have a later J.
Never rerun fresh selection for an already-bound R, even if its earlier answer
was lost or its target is now historical.

For an owner-confirmed UNBOUND request, these checks precede its target write.
The read is journal-only and works for PENDING/tokenless origins; it does not
reserve or choose a new ordinal. The
replica-operation owner CAS includes the complete immutable request identity,
nonterminal authorized REMOVE phase and exact prior UNBOUND bytes. The write
response alone is not proof: its following authoritative read must return the
same BOUND bytes. If another candidate won, only that original stored target can
be used after full validation; the losing nomination is never an effect target.
A changed request/intent or malformed stored target refuses CONTENT_CONFLICT.
The node/boot owner and stopped handler are rechecked after authority awaits;
no lost/stale process receives permission for physical work. Later ordinary
workflow updates, terminal settlement, takeover and repair must preserve the
field byte-for-byte. No generic upsert or divergence reinsertion can clear,
replace or synthesize a missing binding from a stale in-memory operation.

A lost write/read answer is `REMOVE_TARGET_UNRESOLVED`, ERROR/deferRetry with no
executor outcome and no physical action. An authoritative absent operation,
legacy NULL or unavailable owner is likewise an explicit no-admission result
(`REMOVE_TARGET_UNKNOWN` or UNRESOLVED); it is never NOT_FOUND-as-complete. The
legacy code is a named owner attention condition, not a promise that blind retry
will repair it. Missing gateway wiring/schema is a real B1 blocker. Bound targets
survive HELD, terminal settlement, coordinator/handler restart and current-J
takeover. A confirmed terminal request does not authorize new physical effects;
its existing terminal disposition is returned without recapturing J. While a
request remains nonterminal, the exact old target may re-drive its pending
retirement even if J owns the current memo.

**Distinct original continuation fact.** Target binding alone is not retirement
admission. Before INITIATED or any release/tombstone/close, the original creation
journal owner persists and authoritatively observes a monotone retirement handoff
in that same `wasm_operations` row (`retirement_json`, a closed format-1 record
with kind RETIREMENT_ONLY, original intent digest, requesting operation ID and
canonical request-target digest). Its CAS checks the original immutable intent,
PENDING/IN_PROGRESS and absent handoff; a matching existing handoff is reused,
never cleared. A second independently bound REMOVE for the same exact origin may
join the existing retirement-only custody without replacing its first handoff.
It emits only its own request's eventual outcome. A conflicting origin/digest is
refused, not overwritten. Terminal original rows use their existing terminal
answer with no new handoff or physical effect.

The creation owner obtains/validates the authoritative operation binding through
the same narrow owner interaction before writing this handoff; a caller-supplied
boolean/digest alone is insufficient. The handoff records authorized continuation
mode, not resource finality. It may exist while original reservation is still
unknown, and consumes lane A's SEALED/UNRESOLVED result when continuing. A failed
handoff write/read remains unadmitted and retryable under the same request; no
physical effect may be justified by the target-binding write alone.

Inventory consumes this field in its existing journal query: no extra metadata
read during scan. Both prepare/recover and every direct manager continuation
must consult the original row's mode before opening; RETIREMENT_ONLY returns the
named retirement-pending disposition and cannot enter the CREATE path. Once the
handoff is confirmed, the manager synchronously gives the exact-origin fence to
the existing physical lifecycle before handler acceptance. That fence prevents
old in-flight/direct CREATE continuation from admitting a new open for I. It is
retained after a physical task returns unresolved, until lifecycle shutdown;
the fence is keyed by original operation plus immutable intent digest even while its token is absent (never by canonical ID alone). It validates a later complete physical origin against that identity; no token is minted. Settled fence records hold no file/native resource and do not prevent directory
transfer. A different J is governed by the actual same-service task/live-object
fences, not permanently blocked by I's settled exact-origin fence. Reconstructed
journal handoff installs the same fence before scheduling any initial plan.
Existing I that was admitted before the fence remains an owed retirement; the
fence does not claim it already stopped. Capture-before-effect and direct-caller
races must be measured at this precise physical boundary.

The handoff survives terminal workflow failure or lost coordinator reply: it is
now the creation owner's owed retirement continuation and cannot revert to
REENTER. It does not create an independent completion algorithm. The same original
retirement/projection/journal completion route remains authoritative. A DELETE or
retention sweep of replica operations cannot erase an unresolved request target;
B1 must prevent deletion while its target's original completion is unconfirmed,
or retain the existing operation row as unresolved custody. After both owners
confirm terminal settlement, existing retention may remove the operation row;
a later old request then refuses UNKNOWN with zero effects. It never becomes a
new UNBOUND request. No forever-growing handler replay map is required: active
gate entries and finite startup plans cache only observed bindings, and every
settled request re-reads its row. Their lifetime ends at stopped handler cleanup;
the durable row's existing retention owner, not a timer in the handler, controls
replay horizon. Losing retained evidence degrades to refusal, not successor
retirement.

The ordered crash cuts are explicit: (a) before target CAS: no target/admission;
(b) target CAS applied but answer lost: reread same row, zero physical work;
(c) target bound, handoff not committed: no accepted retirement; recovery may
still continue I's existing creation until this same request completes handoff;
(d) handoff committed but answer/ACK lost: restart sees RETIREMENT_ONLY, same R
reuses I, no CREATE reopening; (e) physical terminal/projection/completion unknown:
section 9 retains separate debt; (f) original and request terminal: terminal replay
or evidence-expired refusal, never fresh targeting. These are two monotone owner
facts with an ordered handoff, not a distributed transaction or atomicity claim
across the two tables. The operation binding supplies routing; the original row
supplies the durable remaining obligation.

## 8. Current physical observation and local projection ownership

Expose one synchronous read-only current-creation observation through the existing adapter/runtime/driver chain, supplied by `WasmServiceLifecycle`. It validates exact captured origin and returns canonical `CURRENT`, `ABSENT`, `DIFFERENT`, or `UNAVAILABLE`. `CURRENT` means the registered active object matches the complete immutable origin/token, including if it is now stopping. The owner also returns `creationProjection: ELIGIBLE | FENCED`: ELIGIBLE only while its admission is open and that exact object is CREATED/STARTING/READY, not STOPPING/CLEANUP_REQUIRED/STOPPED. This is eligibility for a local CREATE projection, not metadata grant or serving permission. The lifecycle owns this state classification; callers do not copy its phase table.

ABSENT means no registered physical current object, not permission to open. DIFFERENT means a different exact creation occupies the entry. UNAVAILABLE names an absent/unsupported observation dependency or invalid/unreadable observation, never an implicit CURRENT. The observation performs no I/O, open, reservation, stop, or state mutation and returns no traversable replica object. No alternate copied-token registry is introduced.

Manager `_replicaStateById` becomes one canonical record `{state, ownershipKind, origin}`; generic records use a named generic ownership kind in the same representation. `getReplicaState` still returns the state string. There is no mixed string/object representation or second identity map. The
record is presentation only, and every writer—generic as well as bound—uses the
same captured-entry/ownership discipline. Each normal, recovery and failure
attempt captures the actual canonical record entry (or explicit absence) before
its first await. It may update/delete only while that exact entry and ownership
still match; successful writes return the replacement entry for its next step.
A late generic result never reacquires from the newer map merely to make its own
write succeed. Installing a first generic record additionally requires that no
bound physical current owner or installed bound admission owns the canonical key.
A failed generic attempt with no physical admission cannot fabricate FAILED over
an existing bound record. If ownership changed, its journal/outcome retains its
own honest result, but canonical presentation is unchanged and further actions
against the reused key refuse typed. Uncontended generic state/return behavior
remains the same. This is an explicit cross-kind writer amendment, not mechanical
shape conversion. It includes pre/post-journal writes, every adapter await,
recovery completion, catch/failure and cleanup/delete; no disjoint-key assumption
is made.

For bound CREATE, manager does not write STARTING before prepare. After prepare, it observes CURRENT/ELIGIBLE synchronously before projecting STARTING. It repeats this check after start and metadata-confirmation awaits before local state writes; prior READY/PUBLISHED replies are insufficient. Unknown currentness returns typed unresolved currentness without claiming J's state. Existing HELD/PUBLISHED_UNPROJECTED/RUNNING semantics remain; physical-currentness is an additional necessary condition, not a substitute for grant confirmation.

The handler's one bound-settle writer uses the same observation immediately before any named current memo takeover. It may write a provisional singleton result if no different current owner exists and the memo still belongs to that same origin, but never replace a proven different/current J on a noncurrent refusal. Collision pending-current remains until an eligible exact current continuation establishes ownership.

For bound retirement, manager may mark STOPPING only when both its record and the immediate physical observation identify the retiring origin. Historical cleanup proceeds even when neither map belongs to it. After physical terminal completion it may mark STOPPED only if its canonical record still belongs to that origin and no successor is current; ABSENT is acceptable for this exact former record, DIFFERENT/UNAVAILABLE is not. Completion of I's original journal does not depend on I owning the canonical record.

Driver prepared/running/lifecycle/context mutations are included in this
interaction for **every** generic and bound path. Capture the exact installed
prepared/lifecycle/context entries before asynchronous start/stop/health work;
set/delete only if those same entries and ownership still match. Running-set
updates must be conditional on that existing prepared/context ownership, not an
independent service-ID success. A failed generic prepare that installed nothing
may not delete J's entries. New generic preparation may not overwrite a live bound
prepared/current object merely because the IDs match. Recheck before the next
physical call as well as after it; a stale generic continuation cannot use J's
prepared object. No extra currentness registry is introduced. Prepare installs bookkeeping only after exact physical admission; start cannot use J's prepared record to start I; stale bound results cannot mark J running or delete J's bookkeeping. Retirement cleanup retains the existing exact-token check, strengthened to complete captured origin where required. Publication requests continue using original instance-qualified physical IDs; rechecking currentness before issuing a new CREATE publication prevents a stale local answer from authorizing a new one. Already submitted external effects retain their existing exact-identity/incarnation owner contract; B0 does not claim cancellation of accepted external writes.

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

| Existing term | Prospective v5 change |
| --- | --- |
| V2 section 4 says normal memo routing resumes once J is current | Replaced by section 5's retained-plan precedence on every later applicable original CREATE, and section 6 on wakes |
| RV6.2 different request reenters memo creation | Preserved only when request has no matching retained plan; exact F goes to F |
| RV6.3 every CREATE during named REMOVING merely defers | Known REENTER F queues behind admitted retirement; known RETIRED F still defers; genuinely foreign fallback unchanged |
| RV7.2 permanent memo may not capture a later request | Preserved; retained plan is indexed by original request, never selected by another origin's memo. Explicit redelivery may retry its own nonterminal debt; permanent outcomes do not event-loop |
| RV7.3 different request at ACTIVE definitively conflicts | Preserved for no retained-plan match; distinct known F reaches authoritative continuation. Same-id fast success additionally requires current physical eligibility |
| R1-A/R1-B/R1-H named memo for each inventory entry | One exact plan per origin; collision-only pending-current memo; one application/lifetime |
| R1-E startup redrive registers separate removal entry | Same canonical gate as coordinator CREATE/REMOVE, stable entry identity, no startup outcome |
| R1-D/R1-E closed boolean means retirement completion | One physical proof, applied exact STOPPED acknowledgment, separately confirmed original journal, then full settlement |
| Fresh UNBOUND target nomination | Immediate exact physical CURRENT check, or ABSENT plus one complete journal-owned unique original obligation; stale memo/DIFFERENT/UNAVAILABLE/ambiguous evidence refuses. Selection snapshot is distinct from immutable replay. |
| Settled REMOVE replay and original retirement-only restart | Existing replica-operation row durably binds the target; original creation row durably retains retirement-only handoff. Legacy/missing binding refuses; every later delivery resolves the same target before memo. This expands B1 to ordinary production ingress, schema/row writers, CAS/read and retention, with no new table or STOP journal. |
| Tokenless plan awaiting whole resume | Synchronous validated retained-origin exposure before physical continuation makes in-flight native wakes match the journal-authoritative token. |
| Mechanical generic record conversion | Every generic/bound canonical manager and driver writer uses captured entry/ownership and physical-effect guards; late generic success/failure cannot overwrite J. |
| Old different-request busy REMOVE response | Typed retryable unadmitted BOUND_OPERATION_BUSY; same admitted request remains IN_PROGRESS |
| A retained REENTER later receives an admitted exact REMOVE | Its original journal confirms retirement-only handoff before admission/physical effects; UNKNOWN completion survives loss of the current memo and is included in the bounded already-authorized historical pass. This does not authorize retiring a merely selected or superseded REENTER origin. |
| V2 task lifecycle/currentness language | Explicit trigger classes, exact token refresh, physical task join, typed observation, stable settlement ordering |

Source owner scope for a later B1 implementation includes the existing replica-operation authority/gateway binding interaction, runtime REMOVE dispatch/ack/retry, operation insert/schema/canonical row serializers, every repair/upsert/retention writer of that field, original creation-journal schema and handoff, their ordinary runtime composition, and: handler/restart/bound route and existing vocabularies; manager/recovery/state writers; operation SQL builder; original creation intent/completion; consensus bootstrap; existing service adapter/runtime/driver chain and driver bookkeeping; lifecycle/retirement; bound runtime publication and its existing projection result contract. New concepts remain in their existing semantic owners; no parallel journal, generic recovery engine, public physical-replica traversal or selection policy is introduced.

Lane A's finality correction owns constants/service-instance, resource state, metadata and `service-consensus-creation-intent.js`. B consumes its SEALED/UNRESOLVED negative reserve contract. B must not infer sealing from names or reinterpret CREATE dispositions. **Serialize all writers to shared `service-consensus-creation-intent.js` and any shared handler/runtime expansion.** A0/B0 can overlap. A1/B1 composition needs fresh exact-head verification including F pending reservation plus REMOVE/retirement.

## 12. Review decisions, exclusions and exit

The author has made concrete design choices; they await independent judgment, not a menu of routine implementation questions. The reviewer must accept or reject the following as one coherent interaction:

1. Exact-plan precedence and every section-5/6 cell, including same-current duplicate, RETIRED CREATE, permanent nonterminal plan, token transition/exposure before own native wake, and real wake eligibility.
2. Collision-only pending-current state, single observation/application and stopped lifetime.
3. Common gate, unadmitted busy request carrier, queue fairness, fresh physical/unique-origin nomination, durably bound REMOVE origin, original retirement-only handoff, legacy/lost-evidence refusal, exact settlement/coalescing identity, row retention and every crash cut in §7a.
4. Synchronous physical observation, its eligibility distinction, canonical manager record, and every bound/generic stale-writer and direct-effect guard.
5. Exact historical physical-finality proof, applied STOPPED acknowledgment, truthful journal payload and UNKNOWN completion retention.
6. Physical task registration/join, direct create fence and actual directory release coupling.
7. Conditional retry/liveness limits, the later admitted-REMOVE retirement-only handoff, and explicit multiple-origin unresolved state; no automatic retirement of a REENTER origin without that handoff.

Potential rejection should name an actual missing interleaving, conflicting sealed term or owner/proof mismatch, with a proposed bounded correction. None of these choices has author-issued approval. Changes to this draft's exact contents invalidate any prior content verdict.

The full F2–F6/D1 matrix is mandatory. Both predecessor/successor orders, multiple historical debts, real owner history advancement, real directory transfer, unknown completion, no-op applied projection, and all original no-plan custody controls must be covered. A design review traces source and oracle; it does not claim those tests have run. Later implementation requires meaningful red witnesses, independent verification, applicable static/corpus/lab evidence and composed-head review under the existing Quest.

Out of scope: U2 grant progress bound/C9, production startup recovery-reader wiring (distinct from B1's required REMOVE binding ingress), automatic policy for choosing/retiring legitimately admitted origins, production endpoint/projection continuation activation, new Quest/seal, task-v2 proof substitutions, lab submissions, parent closure, publishing/merge. These exclusions are not closure claims. The missing production wiring and remaining durable obligations stay explicit.

B0 exits only with a separate complete exact-content APPROVE or retained REVISE with counterexamples. Only APPROVE allows accepting B1 at its actual new base; its source scope includes §7a, not merely an injected component consumer. U1 remains REJECT until its corrected source is independently verified; no Harnessd PROVEN status follows from this draft.

## 13. B0 review transport and first executable handoff

This artifact is a GUIDING design-review request within the existing Quest. Its
review result is an independent, exact-content verdict. It is not an executable
task-v2 definition, and no document-existence command may translate it to PROVEN.
`guiding-review-request.md` names the exact review subject and acceptance checklist;
`source-manifest.json` pins every source/evidence input. `first-executable-b1-inputs.md`
records the conditional test-only checkpoint and production-task inputs, without
pre-accepting either. The original U1 REJECT and v2 INCOMPLETE/REVISE remain intact.
