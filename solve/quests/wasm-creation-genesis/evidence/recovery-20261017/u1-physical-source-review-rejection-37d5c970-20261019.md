# U1 physical/runtime/manager independent source review: rejected WIP

Reviewer: `subagent:/root/f1_independent_review`, 2026-10-19.

## Verdict and exact content

**REJECT `37d5c9700c88c2079fe4ae2326a5af5322b17a0f` for U1 acceptance.**
The new STOPPED-projection completion check accepts a real zero-effect
stopped-owner refusal. The interaction registry also still describes the
superseded U1 behavior and omits new semantic owners and the physical witness.
Two other findings discovered during this review were corrected before this
WIP was frozen; their source repairs are present at this SHA and still need
their independent executed witnesses.

The frozen tree is `16f5e1a1d977c58cbf4ee4c044791c8143865d20`, based on
`8c9b14141f89872938d21cc35472b262929818d6`. The adjacent
`u1-physical-source-bindings-37d5c970-20261019.json` binds 33 source, dependency,
test and registry files by Git blob and SHA256. Its SHA256 is
`b22f70190699b3afae2e98fa8c9ac77c599937266935a35d0aef986bf695431a`.
Immutable review snapshots are in `u1-physical-source-37d5c970/`.

This is the physical-lifecycle, driver, runtime and manager half of the
coherent F2–F6 review. Root independently owns handler, restart inventory,
hydration and shared-gate review and must consolidate both parts at the final
same source. No production or test file was edited by this reviewer and no
behavioral test was run locally. This verdict is a source verdict; positive
or negative lab execution is not implied by static path inspection.

## Findings

### P1. A stopped projection owner is mistaken for completed STOPPED work

Categories: owner interaction, admission gating, recovery replay, harness
fidelity. **Unresolved in the frozen SHA; blocks acceptance.**

The actual SQL-engine wiring always constructs a
`RuntimeReplicaStateProjectionOwner` unless an explicit owner is supplied
(`src/query/sql-query-engine-instance-initializer.js:49–65`) and wires its
`submit` as the runtime writer
(`src/query/sql-query-engine-lifecycle-and-callback-dispatch.js:379–399`).
When that owner is stopped, `submit` returns
`{retained: false, state: 'stopped', serviceId, status}` without invoking its
queue or changing a services row
(`src/query/runtime-replica-state-projection-owner.js:94–110`).

`ServiceRuntimeLifecycle._projectReplicaState` constructs the requested
STOPPED row, receives this refusal, and returns
`{stateRow, projectionResult}`
(`src/runtime/service-runtime-lifecycle.js:473–506`). The new
`withdrawRetiredConsensus` checks only that the *requested* row says STOPPED
and that `retained !== true`
(`src/runtime/service-runtime-consensus-publication.js:142–153`). It therefore
returns the raw physical FINAL without RETIRED_UNPROJECTED. The manager then
calls `completeConsensusCreation`
(`src/service/service-consensus-bootstrap.js:133–142`), permitting the original
journal to complete while the old active services row remains.

This is not an invented fake-owner response. It is the existing production
projection owner's refusal, already explicitly named by the
`activation-prerequisite-audit.md` section 4 warning. The three approved
throw/retained/absent writer cases do not cover it. U1 needs to preserve debt
for this known zero-effect refusal through the existing canonical projection
handoff, with a witness using the real stopped owner. A private runtime list
of guessed refusal strings would recreate the owner-interpretation defect.

The same production owner always returns RETAINED for live calls and emits
APPLIED later, including on explicit resubmission. The audit assigns actual
RETAINED→APPLIED continuation to activation A5. That liveness work remains A5;
it is not silently pulled into this U1 correction. U1's bounded claim must
remain truthful that the synchronous component embedding supplies a
completed-writer interaction, and that real retained results preserve debt.
Superseded in-flight ACTIVE/endpoint completion versus STOPPED also stays in
the audit's named A5 lifetime work; immediate currentness checks alone do not
prove cancellation of an already admitted projection write.

### P2. Registry/contract/proof alignment still names the pre-U1 behavior

Category: owner interaction, item 10. **Unresolved in the frozen SHA; blocks
the combined checkpoint's acceptance.**

`test/shards/impact-contracts.json` still describes the bound route as using
the HELD memo's creation rather than the exact retained-plan-first route, and
restart as memos-first rather than retained original plans plus physically
authorized canonical projections. The new semantic owners
`service-consensus-creation-origin.js`, `service-lifecycle-state-record.js`
and `wasm-creation-custody.js` are absent from the corresponding contract and
coupled endpoint owner lists. The new physical-custody test is absent from
both contract tests and coupled witnessTests. Root also owns the analogous
new handler helper registration.

The generated import graph and subsystem classification are useful but do
not amend this named interaction registry. The revised description, owner
paths, primary witness classifications and coupled witness entries must ride
with the integrated source/test checkpoint. Root has been notified and owns
this consolidation; do not create a second competing interaction.

### P3. Broad direct-STOPPING fix also blocked legitimate CREATED replacement

Category: admission gating. **Repaired before the frozen SHA.**

The reviewed working draft used `current.lifecycleState !== STOPPED` in
`boundCustody`, which also rejected a different CREATED object. The approved
physical-state clarification explicitly preserves the existing CREATED
replacement semantics. An admission fix for directly STOPPING custody must
not make an object that never opened a permanent new veto.

At this SHA, `src/wasm-service/wasm-service-lifecycle.js:225–245` reuses an
exact CURRENT origin, guards directly STOPPING plus admitted same-service
retirement tasks, and retains the original `.live` and prior-stop guards.
Different CREATED replacement is again reachable. The API comment now
distinguishes the generic successor allowance from the bound stop-settlement
fence. This narrow source correction is satisfactory. Root's real direct
STOPPING test also requires explicit recreation after cleanup, excluding a
permanent-refusal implementation.

### P4. Changed full origin could retire an active same-token file by path

Categories: admission gating, owner interaction, concurrency serialization.
**Repaired before the frozen SHA; new direct witness still required.**

Before this review repair, admission checked same-operation changed content
only against an in-flight retirement task. A valid changed runtimeRef with
the active creation's original operation ID and unchanged token passed
capture. `retiringTarget` correctly failed full-intent equality, but then
treated this as no exact object. The by-path local identity checks token and
storage, not full original descriptor, so this request could tombstone the
active object's open file and close its metadata without stopping that object
(`src/wasm-service/wasm-creation-retirement.js:44–55,121–139` and
`src/wasm-service/wasm-creation-opening.js:112–117,150–189`). The same request
therefore crossed a physical effect boundary despite failing full origin
identity.

The new `requireRetirementOrigin`
(`src/wasm-service/wasm-creation-custody.js:43–63`) examines the union of
active and still-retiring exact objects before task installation or any
collaborator invocation. A matching original operation ID must match the
complete captured intent/token or receives CONTENT_CONFLICT with no effect.
Legitimate older, different-operation by-path retirement remains reachable.
The existing in-flight same-operation comparison remains before joining an
existing task. I independently reread this repair and found no equivalent
bypass in the examined path. The author is adding an actual component
object/file/metadata witness; the previous in-flight coalescing test alone
does not cover the no-task active-object case.

## Complete path census and positive source findings

### Physical currentness and task custody

`captureRetainedCreationOrigin` uses the existing bounded JSON/canonical
intent capture, validates optional operation ID against the original request,
and validates token against that request. Explicit token absence remains a
PENDING hint; physical capture rejects it. Node identity is checked by the
physical owner (`wasm-creation-custody.js:17–23`). Equality compares both
intent and token, excluding mutable opening/projection facts from identity.

The ordered currentness table (`:25–40`) first rejects closed lifetime or
capture failure, then distinguishes absent registration, different full
origin, current CREATED/STARTING/READY, and exact registered unavailable
states. It performs no file, reservation or journal operation. Manager,
adapter, runtime and driver forward this one synchronous result. Missing
capabilities return UNAVAILABLE or are caught as unavailable; no caller
derives CURRENT from a memo, prior READY, token alone or `.live`.

Retirement admission (`:53–86`) captures first, checks conflicting identities,
constructs the task promise and installs the entry before invoking
`retireWasmCreation`. Reentrant release therefore observes the admitted task.
Equal calls share the one physical promise; changed content cannot join.
Both fulfillment and rejection remove only the same installed entry and
settle its public promise. There is no permanent per-origin completed-task
cache to suppress a later debt retry.

`shutdownAll` (`wasm-service-lifecycle.js:763–780`) closes admission
synchronously, snapshots admitted tasks and exact active/retiring objects,
then awaits both. `stopOwnedReplica` (`:655–674`) keeps rejected cleanup in
retiring custody and deletes active registration only by exact object.
Driver-wide shutdown clears its maps only after joined physical success
(`wasm-component-driver-shutdown-methods.js:26–45`). No admitted by-path
retirement depends on a lock held by shutdown, and neither the retirement
helper nor its metadata-release continuation awaits the lifecycle-wide
shutdown it may cause to begin.

The retained shutdown intent is captured before the STOPPING join return
(`wasm-service-replica-lifecycle.js:319–348`). A joining retirement does not
pretend the already running ordinary stop writes a tombstone. If that stop
fails, the retry chooses the retained RETIRE_RESOURCE intent; its original
metadata attempt only needs to have settled, not to have returned success
(`:234–245`). A successful ordinary stop is followed by the admitted
retirement's by-path tombstone before close. The real failed-stop and
direct-STOPPING witnesses exercise these two distinct cases.

### Physical finality and original-journal completion

All refusal and cleanup-blocked retirement paths carry UNRESOLVED
(`wasm-creation-retirement.js:161–177`). The owner grants FINAL only after
local retirement/absence permits close and either authoritative CLOSED
arrives, or exact local RETIRED/ALREADY is paired with authoritative
HISTORY_UNAVAILABLE (`:140–155`). Raw close, tombstone and release results
remain visible; history does not set `closed: true`. Missing storage with
history is explicitly UNRESOLVED. A conflicting/corrupt local record cannot
reach close through the local-outcome table.

Runtime consumes that finality before attempting the exact old services-row
STOPPED projection, under physical identity rather than canonical service
ID (`service-runtime-consensus-publication.js:128–161`). Throw, absent writer,
undefined projection and retained work are kept as RETIRED_UNPROJECTED; P1
is the remaining hole in this table. Endpoint withdrawal retains its existing
exact binding/physical identity and raw result; endpoint sweep/receipt
completion remains the explicitly separate activation owner obligation.

Manager retirement is independent of canonical state-map ownership
(`service-consensus-bootstrap.js:123–149`): it always retires the captured
original and can complete the old original journal even when J owns the
canonical map. A nonfinal result returns without journal completion. The
typed unprojected result also returns without completion. Actual completion
is still the original IN_PROGRESS→COMPLETED CAS followed by exact intent and
terminal-state reread (`service-consensus-creation-intent.js:401–415`). The
stored completion payload carries factual closed/finality/raw-close reason;
it does not manufacture a CLOSED acknowledgment for history finality.

### Driver, runtime and manager stale continuations

The driver captures the incoming retained descriptor and origin, then
compares the full prepared descriptor and asks CURRENT immediately before
the service-keyed physical start
(`wasm-component-driver-consensus.js:102–117`). Prepare stores `_prepared`
and `_lifecycles` only after the physical owner confirms that exact
registration (`:27–44`). A returned PUBLISHED start writes `_running` and
`_replicaContexts` only after a fresh CURRENT observation (`:63–85`). HELD
and refusal paths do not delete or overwrite another origin's bookkeeping.
Retirement cleanup requires both full prepared descriptor equality and an
immediate ABSENT result before deleting any of the four driver collections
(`:121–133`). Closed lifetime and fenced registered objects refuse that
deletion; whole-driver successful shutdown owns eventual map clearing.

Physical bound continuation checks exact object registration and CURRENT
before and after reconciliation (`wasm-service-lifecycle.js:431–444`). The
physical services mark also checks CURRENT and exact token (`:455–467`).
Runtime publication checks CURRENT before the first projection, after the
services await and after the endpoint await before its next step
(`service-runtime-consensus-publication.js:90–115`). This protects later
steps and projections from a stale returned observation; it is not a claim
to cancel an already submitted asynchronous writer effect (A5 above).

Manager has one record shape, `{state, ownership, origin?}`, in its existing
map (`service-lifecycle-state-record.js`). A bound STARTING/RUNNING write
requires immediate CURRENT. STOPPING additionally requires ownership of the
record; STOPPED requires ownership plus ABSENT. The manager calls this after
prepare and after authoritative publication confirmation, and again after
retirement. An older origin cannot change a successor record even if its own
physical/journal retirement succeeds. All production generic map writers
were mechanically converted to the same generic record shape; the public
`getReplicaState` still returns a string. The only direct production map
writers found by source census are the two functions in that record module.

The journal recovery read now uses one SQL statement for PENDING and
IN_PROGRESS, canonical-captures returned rows, folds exact duplicate IDs and
rejects conflicting duplicate content
(`service-lifecycle-manager.js:531–564`, `operation-lifecycle.js:221–226`).
Detailed application, handler-lifetime/gate sequencing and generic recovery
effects remain root's review half; this source review does not claim their
acceptance by inspecting only the shared reader.

## Nine verification-template categories

Every category below was considered in this review scope. The matching
templates were read in full. “No further source finding” is not a substitute
for the final executed corpus and source-only controls.

| Category and checklist items | Source/contract evidence and disposition |
| --- | --- |
| Owner interaction 1–2, 7, 9 | Currentness is decided only in custody; physical finality only in retirement; journal completion only by original CAS/reread. Forwarding chain, full map-writer census and source call census are above. P1 shows a remaining competing interpretation of projection-owner refusal. No direct bypass caller of exported retireWasmCreation exists beyond custody. |
| Owner interaction 3–6, 8, 10 | Root's physical oracle supplies paired safety/liveness cases: CREATED remains startable, direct STOPPING blocks then releases, old retirement completes without changing J, and withholding/restoring STOPPED keeps/completes the original journal. Exact controls and same-candidate execution are pending. Same-origin physical single flight, settled-entry deletion and explicit retry preserve existing owner pressure. Wake delivery is a hint, never finality. P2 records registry alignment still required. |
| Admission gating 1–2, 4, 6–7 | Observation and enforcement read the same exact active object; table order and post-await checks are enumerated above. Tokenless/capture/closed/conflict refusals remain typed UNRESOLVED; permanent or historical evidence does not infer future reservation authority. P3 and P4 were direct findings here and are repaired in this SHA. P1 remains a false terminal classification. |
| Admission gating 3, 5 | No new timeout or enlarged retry budget is introduced. Each physical task lasts one admitted owner attempt plus local effects. Existing metadata/transport budget owners bound calls; arbitrary collaborator hangs are not converted into guessed finality. Explicit exact retry/start/recovery is the release path; no claim of measured production release latency is made. A5 owns delayed projection receipt progression. |
| Concurrency serialization 1, 3–5 | Task registration is synchronous before invocation; exact durable owner CAS remains the resource/journal backstop. The key is the original operation ID with full-content conflict checking; same-service bound creation also sees admitted retirements. Shutdown fences admission then joins tasks/objects and does not hold a needed lock. Root reviews shared handler gate and coordinator observer bounds. There are no new timers in this scope. |
| Concurrency serialization 2 | All changed canonical manager/driver/runtime writes and service-keyed start admissions are traced above, including checks after prepare, physical reconciliation, start, services/endpoint projection and manager metadata confirmation. Old physical IDs qualify row effects. Already submitted projection-effect cancellation is an explicit A5 limit, not an asserted post-await guarantee. |
| Recovery replay 1–2 | Immediate physical observation protects the canonical record; no pre-await STARTING/STOPPING claim grants ownership. Driver late-answer/deletion checks preserve J. One canonical record shape replaces mixed strings rather than adding a shadow map. Root owns startup-versus-live inventory application discrimination and every handler memo writer. |
| Recovery replay 3–5 | Opening retains the existing actual founding set, original opening claim and exact local record; no empty participant fallback is added. Resource CAS, terminal local RETIRED and original journal CAS make retries idempotent. Missing storage/history remains nonfinal. Retained shutdown intent survives a failed ordinary-stop join. P1 prevents acceptance because the zero-effect projection refusal can still lose journal debt. |
| Transport delivery 1–5 | No router or ACK classifier is changed in this half. `wasm-creation-wake.js:19–47` hands an enqueue-only hint to the existing consumer and retains DELIVERED/UNDELIVERED/CONSUMER_ABSENT; physical/journal finality never branches on wake delivery. Metadata unknown/throw remains explicit. Root owns late handler responses and per-request executor identity. The component loopback fixture's limited network claim is recorded in the independent oracle report. |
| Harness fidelity 1–6 | The 14-case physical test received a separate independent content-bound oracle review. Actual lifecycle/native/SQLite/metadata owners and named seams are identified there, with direct engagement assertions and released/joined gates. First-three missing-method failures are only interface prerequisites; arbitrary setup/timeout failures cannot count as behavioral controls. Root's two observer-ID cases were separately checked for a genuinely ACTIVE generic target, one occupied observer, no wrong effect/outcome, and a successful original settlement. No native claim is made for their scripted RETIRED seam. P1 requires an actual stopped projection-owner witness. |
| Formation circularity 1–5 | Original journal, metadata reservation/close and services projection remain with their existing owners. Unavailability keeps the original identity/debt and never reads cache as authority or writes around consistency. Physical retirement does not require successful metadata release before fencing/cleanup; it waits only for the attempt's settlement before durable tombstone. Native grant/genesis algorithms and timing budgets are unchanged. Production journal formation availability and A5 are explicitly not closed by the component corpus. |
| Retry loops 1–7 | No new retry loop, attempt counter or timer exists in custody/driver/runtime/manager changes. Equal physical calls coalesce; settlement removes the task so an explicit retry can enter again. Typed nonfinal/unprojected/completion refusal propagates to the original debt owner; root reviews one initial plan attempt, explicit later triggers, bounded marker/wake handling and no recursive self-retry. Physical/journal CAS protects late successes. The known production retained projection release path remains A5, not falsely called complete. |
| Sweep/timer 1–5 | No new sweep, interval or timer appears in this scope. Existing injected time supplies tombstone timestamps and is not used to infer finality. Native role/authority predicates and existing recovery budgets are unchanged; no crash-equivalence claim is made. Closing lifetime blocks new physical admissions and later canonical writes. Directory release remains owned by successful joined shutdown. |

## Required follow-up

Preserve this rejected source and report. Implement and independently review
the narrow projection-owner refusal handoff, add its actual-owner witness,
retain the new active same-ID/full-body refusal witness, and align the
interaction registry in the combined checkpoint. Bind the repair delta and
all review coverage to that full SHA before any positive source verdict.
Executed unchanged historical counterexamples, corrected-source corpus and
meaningful frozen-test negative controls remain separate acceptance gates.

This report does not approve U2, production activation, source landing,
multi-host metadata behavior or crash recovery.
