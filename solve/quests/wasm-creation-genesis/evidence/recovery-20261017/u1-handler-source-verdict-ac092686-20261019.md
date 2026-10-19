# U1 handler, inventory and execution-gate source review

Reviewer: `agent:/root`, 2026-10-19. Implementation owner:
`subagent:/root/u1_inventory_finish`. The reviewer authored separate test
oracles and contract clarifications, but did not author this production
implementation. The physical/runtime/manager half has its own independent
source review by `subagent:/root/f1_independent_review`.

## Verdict and immutable subject

**APPROVE the bounded handler/inventory/hydration/shared-gate production
source at remote `ac092686975dd22b4843be8df8e2e1d3663c0b7f`. There is no
remaining source-repair finding in this half. Combined U1 acceptance is
still OPEN: the corrected source needs exact-SHA positive lab execution,
decisive post-await lifetime oracles, and meaningful source-only controls
with frozen tests. This source verdict authorizes none of the later merge,
U2, activation or distributed-certification gates.**

| Binding | Identity |
| --- | --- |
| Remote checkpoint | `ac092686975dd22b4843be8df8e2e1d3663c0b7f` |
| Remote branch | `probe/u1-coherent-candidate-20261019` |
| Author's equivalent local checkpoint | `ed9c5ccc72873e9fd49b55d0ed523ec281beca5c` |
| Exact full Git tree, independently compared before publication and after fetch | `17a66242048c7d8d782290c05297703ddafeb457` |
| Production source tree | `10a9c9d676d5b71e1b5d522f84882c596440e26a` |
| Test tree at this source freeze | `b251c60c3aad02069895b82e411fca0b6d9db69a` |
| Recovered U1 source before F2-F6 reconstruction | `8c9b14141f89872938d21cc35472b262929818d6` |
| Binding companion | `u1-handler-source-bindings-ac092686-20261019.json` |

The approval is to the production bytes. Any later test-only correction or
oracle extension must prove the source tree remains identical and record
its own test tree and execution. It does not retrospectively change the
subject or results of the preserved red checkpoints.

The governing contract is `u1-inventory-continuation-contract-v3.md`, its
mandatory bounded-observer and physical-currentness addendum, the journal
hydration addendum, the physical-state clarification, the ordinary memo-wake
clarification, and the two retirement-projection debt clarifications. These
are one coherent U1 correction; F1's prior approval alone was insufficient.

## Canonical owner paths and complete writer census

The reviewed handler paths are `runtime-service-handler.js`,
`runtime-service-restart-inventory.js`, `runtime-service-bound-creation-route.js`,
`runtime-service-creation-execution.js`, `runtime-service-generic-replica.js`,
`runtime-service-message-dispatch.js`, and the shared handler constants.
The reader and identity boundary includes `service-lifecycle-manager.js`,
`service-lifecycle-recovery.js`, `operation-lifecycle.js`, and
`service-consensus-creation-origin.js`. The manager/physical result boundary
includes `service-consensus-bootstrap.js` and the journal completion paths
in `service-consensus-creation-intent.js`.

A production census finds exactly one setter and one per-entry deleter of
`inProgressOperations`, both in `runtime-service-creation-execution.js`.
Handler shutdown is its lifetime-wide clear. There is no retirement waiter
map, parallel queue, second operation-ID registry, or shadow physical
authority. Startup plans remain in the one applied task; the one ordinary
HELD wake bit remains on the existing memo.

All handler memo writes were examined: initial applied inventory; the
ordinary nameless CREATING tracker; actual generic create/remove settlement;
the bound CREATE settle; bound REMOVE admission and settle; the existing
services-row hint recovery; explicit existing-replica registration; and
lifetime shutdown. The generic and hint paths do not claim a retained
origin's physical currentness. A production caller census finds no caller
of the runtime handler's explicit `registerExistingReplica` method; the
similarly named partition-handler methods are a different owner. Its new
stopped fence prevents a direct registration from reviving a dead handler.

The two manager-state setters are consolidated in
`service-lifecycle-state-record.js`: generic records and full-origin bound
records share the existing map representation. Its detailed physical
permission table is covered by the independent physical review. This
review checked the reader and generic-recovery consumers of that change;
the getter continues returning the original state string.

## Inventory is one applied observation, followed by owner continuations

`buildRecoverableOperationsSQL` selects PENDING and IN_PROGRESS in one SQL
statement. The manager executes that statement once, requires an array,
captures each row through the existing bounded JSON owner, folds identical
duplicate operation IDs and rejects conflicting duplicate content. The
existing deterministic ordering only orders attempts; it is not a choice
of current physical creation. Existing generic recovery still receives
both unfinished states through its existing operation interpreter.

`recoverRetainedCreations` synchronously installs one task and public
promise before entering the async inventory path. Concurrent callers reuse
that exact promise. An exception before application clears only that
unapplied task, permitting an explicit live retry. A successful task is
retained for the whole handler lifetime and cannot be rescanned into a
later stale inventory. Stopping does not clear it into a reusable lifetime.

Every eligible row is fully captured and locally inspected before any
inventory memo is installed. The continuation checks handler lifetime and
task identity after the journal call and after each local inspection.
Application, plan indexing, and opening readiness have no intervening
await. Only the deferred initial pass admits physical continuation. A
stopped readiness latch never opens, even to resolve a shutdown wait.

One row seeds its existing HELD or REMOVING projection. Multiple different
origins for a canonical replica seed CREATION_CONTINUATION_PENDING with no
invented winner. Every original remains in `plansById`; neither metadata
version nor iteration order discards one. A collision defers a canonical
REMOVE or unknown CREATE until actual continuation establishes a current
origin. All valid plans receive one initial attempt, serialized through the
shared gate. Local inspection does not grant opening, reservation or journal
completion.

## Identity is captured before dispatch and before physical continuation

Every public CREATE captures the request before deciding its route. An
exact applied plan is looked up before all ordinary memo branches,
including ACTIVE, HELD, REMOVING and a collision that has already resolved.
`matchesCreationRequest` checks original operation, service, canonical
replica, current handler node, and every supplied immutable origin/body
field through the existing digest owner. A mismatch returns CONTENT_CONFLICT
without waking the plan or modifying its memo.

Unknown IDs intentionally retain the earlier RV6/RV7 memo behavior. This is
the explicit contract boundary: the correction does not claim that an
unknown request was present in the startup snapshot. In-flight operation
ID conflicts are checked before these memo answers, including an ID held
by a startup retirement's bounded observer.

The first ordinary CREATE ACK remains prompt. Its installed entry exists
before `setImmediate`; the async route reads the original journal before
resume. A retained answer is fully captured and matched to the original
request before the manager can reserve or prepare. A missing/unknown read
uses the declared generic-versus-bound-class route table. A supplied token
does not become authority. The manager's later actual admitted result may
fill a formerly null token only after matching the original binding and
slot, and cannot replace an already captured token with another origin.

A settled startup plan may obtain the ordinary terminal journal answer on
CREATE redelivery, but is never treated as a fresh physical grant. A
permanent nonterminal refusal leaves the plan and original journal owed;
only an explicit matching request retries it, and native wakes do not
autonomously retry a plan whose last result was a permanent failure.

## One execution entry preserves ordering and coordinator identity

`installExecution` refuses a closed handler, a busy canonical replica, or
an operation ID already held by an entry or its one observer. It installs
the stable entry before any deferred callback or owner call. Every
post-await route and settlement tests the installed object, not just its
operation ID. `releaseExecution` deletes only that same object, then
considers already queued plans and the existing HELD memo wake.

A coordinator REMOVE captures its creation target at admission. The async
path consumes that field and the captured origin; it never rereads a
mutable memo to choose the resource. Startup and coordinator-first
retirement both use the same entry. A silent startup retirement can attach
one exact coordinator observer. Repeated identical requests coalesce;
changed content under the same ID conflicts; a different observer receives
a typed retryable deferral. No unbounded list of promises, callbacks or
later outcomes is retained. The original silent attempt emits no invented
executor result, while its one observer receives its own request ID.

The review found and required three corrections during reconstruction:
coordinator comparison must read the entry's actual creationOperationId;
operation-ID conflict lookup must include the bounded observer; and both
known-plan and ordinary memo routing must consult that global identity
before producing a response. Those repairs are in this freeze. The two
independent cross-replica observer-ID tests establish a real ACTIVE generic
target and occupied startup observer before attempting CREATE or REMOVE
reuse; neither false outcome nor a replacement execution entry is allowed.

Each admitted attempt settles the gate on success, typed refusal or thrown
owner error. An unresolved old retirement does not retain the gate for all
future attempts. A queued successor can proceed after that attempt while
the old plan retains debt. There is no timer or recursive retry of the same
unresolved result. A coordinator may trigger one housekeeping pass over
already-RETIRED historical debt for the same replica, but that pass cannot
turn an unrelated non-RETIRED origin into a removal target.

## Wake hints and canonical memo settlement

Wake lookup is exact-plan-first, then an exact in-flight entry, then a
matching ordinary memo. Full binding, token and immutable slot identity
must match. A PENDING plan can use the payload only as an exact-request
hint; its token remains null until the original journal continuation
actually supplies admission. Foreign/malformed wakes have no matching
target. RESOURCE_CLOSED and an unavailable GRANT_HELD are recorded without
adding a retry bit, before any target-state-specific action is considered.

A qualifying wake creates at most one pending bit on the active CREATE,
retained plan, or ordinary HELD memo. Gate release considers queued plans
first. An ordinary HELD bit can be consumed only while the same memo object
and full origin still exist and the physical owner immediately answers
CURRENT. The review required this explicit ordinary-memo rule because a
newly created J need not be a member of the applied startup plan set. The
native tests pair progress after F releases the gate with memo and physical
replacement negatives. Unavailability retains the bounded hint without
inventing an additional event source or polling loop.

The bound CREATE settle observes current physical origin before replacing
the canonical memo. A noncurrent historical failure cannot replace J. The
entry and handler must remain current as well. Existing per-request CREATE
result mapping is preserved, as the contract explicitly requires; this
review does not silently broaden the definition of a retryable CREATE
failure or change the workflow's disposition of an old answer.

## Physical retirement and journal completion remain distinct facts

The handler reads and validates the original journal for bound REMOVE. A
PENDING row goes through the F1 reservation-resolution owner rather than
being treated as absent. An admitted origin is passed unchanged through
the manager/runtime/driver chain. A result can complete removal only when
physical finality is FINAL and the original journal completion is confirmed
ROW_COMPLETED, or the authoritative journal read already proves the named
terminal state. `closed: true` alone never discharges startup debt.

Physical FINAL with a failed, retained, absent or stopped projection writer
keeps RETIRED_UNPROJECTED and the original journal. Actual STOPPED projection
precedes its original completion CAS and confirming reread. Missing that
reread keeps the plan owed. The shared currentness/identity check prevents
an old removal from altering a successor memo even when the old resource
and journal can independently finish. No generic STOP journal is inserted.

The physical review separately establishes FINAL's actual CLOSED or exact
local RETIRED plus HISTORY_UNAVAILABLE proof. It also records the narrow
actual-stopped-owner repair and its new native witness. Runtime preserves
the approved endpoint-before-retirement order. A fabricated direct manager
handle can attempt exact endpoint withdrawal before the physical full-body
guard refuses it; normal handler ingress validates the retained journal
origin. No new upper-layer preflight authority is approved by this review.

## All nine verification categories

| Category | Reviewed evidence and disposition |
| --- | --- |
| Owner interaction | One atomic journal reader, one full-origin capture owner, one handler gate, one physical currentness/finality owner and one original journal completion owner. The two existing interaction-registry contracts and paired witnesses describe the corrected composition. No competing registry or shadow authority was introduced. APPROVE source; executed paired witnesses remain required. |
| Admission gating | Exact plan/request/wake matching precedes continuation. Gate installation precedes all owner calls; stopped/task/entry guards follow awaits. Known-plan routing precedes current memo routing for the full lifetime. No copied wake token or prior ACTIVE memo grants physical admission. APPROVE source. |
| Concurrency serialization | Same-replica CREATE and REMOVE serialize through the canonical entry. Captured target and exact settlement protect against stale replies; bounded same-origin observer preserves coordinator identity. All exits release the exact gate and reconsider only already queued work. APPROVE source; designated source-only controls pending. |
| Recovery replay | One applied snapshot retains every original row and collision, with one initial attempt. Identical duplicates fold, conflicting duplicates fail application, and an unapplied live failure can retry. Physical absence is not a tombstone; physical finality is not journal completion. Generic map readers/writers retain their original semantics through one representation. APPROVE source. |
| Transport delivery | ACK precedes async hydration/continuation. Correlation IDs and existing executor IDs are preserved; startup housekeeping stays silent except for its one explicit observer. Wake delivery is an enqueue hint, never reservation or finality evidence. No transport budget or acknowledgment classifier changed. Component tests do not prove physical cross-node transport. |
| Harness fidelity | Independent root oracles use actual journal/handler/gate and native C6 owners where claimed, with labelled suspension/refusal seams and cleanup. Consumer-scripted RETIRED/currentness fixtures are not native authority proof. Historical missing-interface and carrier-only failures are distinguished from forbidden-effect assertions. Additional decisive post-await lifetime tests are explicitly pending. |
| Formation circularity | The handler never writes around unavailable journal/metadata owners or treats cache as reservation authority. No new native event source is promised for future PENDING rows. The original consistency, founding and process-custody owners remain prerequisites. Distributed metadata formation and production startup wiring are separate open activation work. |
| Retry loops | Each startup attempt has one gate lifetime; explicit requests and eligible wakes are the named retriggers. Per-plan and per-memo bits are bounded. Unavailable grant and RESOURCE_CLOSED cannot produce self-reentry. A failed retirement can wait while J proceeds; there is no new polling loop, timeout finality or silent debt deletion. APPROVE source. |
| Sweep/timer | No new sweep, interval or retry timer. setImmediate only schedules an already installed entry and checks lifetime before execution. Shutdown closes readiness and admission irreversibly before clearing projections, and late callbacks cannot emit or repopulate. Physical directory-release joining is covered by the other review half, not inferred from handler shutdown. |

## Evidence state at this review

The author reports scoped fast-static PASS in 21,705 ms over 69 changed
paths/34 JavaScript files, zero new cycles, zero new decision/literal
findings and strict checks on the six new helper modules. Root verified the
published and fetched full tree equals that frozen subject. No behavioral
test was run locally. A scoped static pass is not a full-corpus or merge
gate.

Harnessd's preserved unchanged-source baseline #247 failed 20 leaves across
the original bound-route and restart files. The independent physical
baseline #266 failed all 14 leaves: the first three are missing-interface
prerequisites, two are finality vocabulary checks, the pre-start case first
fails its carrier assertion, and the remaining cases include actual
reentrancy, duplicate execution, lost tombstone debt, direct STOPPING and
premature journal-completion effects. Those ceilings are retained; a red
count alone is not complete mutation coverage.

All three F1 source-only controls have independently rehashed complete logs
and fail their intended preserved assertions. They belong to F1's bounded
owner-finality guarantee. They do not certify new F2-F6 behavior. The
corrected combined source has not yet been executed at this review time.

The focused candidate selection also uncovered an existing generic manager
recovery fixture that dispatches on params[0] instead of handling the
approved single query's two state parameters. A test-only fixture repair
and fresh test-tree binding are required before that selection is run;
production is not changed to accommodate an obsolete fixture.

## Consolidated disposition and remaining gates

Together with `u1-physical-source-verdict-ed9c5ccc-20261019.md` and the
unchanged F1 owner-finality source review, the coherent production correction
has independent source approval at the exact shared source tree. Preserve
the earlier rejected WIP and all first observations; this is an append-only
superseding source verdict.

Acceptance still requires the corrected focused native/consumer corpus,
new post-await driver/manager/runtime oracles and source-only negative
controls at frozen test bytes. The pre-start physical test is not evidence
for a post-return guard. Already submitted asynchronous projection effects
and the production RETAINED-to-APPLIED continuation remain activation A5;
immediate currentness checks are not a cancellation protocol. Production
startup composition, U2's progress-bound implementation, real crash cuts,
Set A/Set B closure, full-corpus gates and the required five-machine
certification remain separate obligations. No main branch was changed.
