# Independent design verdict: recovery unit 1 correction

Reviewer: `subagent:/root/prepare_recovery_u2`

Verdict: **REVISE — corrective design only, content-bound to the digest below.**

Proposal: `/workspace/scratch/6d2a7b72384f/lagrange/solve/quests/wasm-creation-genesis/evidence/recovery-20261017/u1-correction-proposal.md`

SHA-256: `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`

Source reviewed: lane `a251ce4fd9c980a78c0fd33d8a5f873161f90870`. The proposal digest was checked both before and after review. No production source or test changes were made; no tests or lab jobs were run. This is not an implementation verification of either the original unit or a future correction. The original unit remains under the separate full review.

## Findings

The resource-finality and physical-retirement-custody corrections are sound in design. The inventory/memo correction and completion propagation have three blocking omissions identified below. A draft approval was prepared before the independent original-code census supplied the multiple-creation case; it was not delivered and is superseded by this complete REVISE verdict. A separate bounded approval of reservation finality is recorded in `u1-reservation-finality-bounded-verdict.md`.

### Blocking F1: one current memo cannot be a condition for every retained obligation

Proposal lines 70–73 require startup retirement to proceed only while the canonical-replica memo names that creation and is REMOVING. A valid crash after old creation CLOSED but before its journal completion leaves its old IN_PROGRESS row and RETIRED local record. A successor can legitimately use the same canonical `S-rN` while having a different instance-qualified physical identity (`src/rebalancer/runtime-service-replica-identity.js:78–87`). Its inventory entry or later activity owns the sole current memo. The proposed guard skips the old retirement forever, leaving its journal obligation unfinished.

The scan also performs separate PENDING and IN_PROGRESS reads (`src/service/service-lifecycle-manager.js:526–532`), so the same operation can occur twice if it transitions between those reads. The current handler writes every entry into one canonical-key memo and starts every plan (`src/node/runtime-service-restart-inventory.js:159–174`). The proposal does not define duplicate identity folding, multiple distinct creations sharing a canonical key, or retaining a startup retirement behind an already owned removal gate. Skipping a busy or non-current plan is not convergence.

Required amendment: keep each exact journal obligation through completion independently of the current memo; deduplicate the same immutable operation; serialize admitted retirements through the existing per-replica removal owner; and condition only memo writes, not historical exact retirement, on current memo identity. An old RETIRED plan must still use its exact token/path and complete its original journal while leaving a successor's memo untouched. If the gate is busy, the retained plan must be resumed when that same gate releases, or remain explicitly owed with a defined retry; it must not disappear when the successful inventory result is cached.

### Blocking F2: successor safety extends through manager state projection

Even with a handler memo guard, `src/service/service-consensus-bootstrap.js:124,128` unconditionally writes STOPPING/STOPPED to `manager._replicaStateById[descriptor.replicaId]`. That key is the canonical replica ID. Historical exact retirement can therefore overwrite a successor's manager RUNNING/STARTING state. The driver already guards its bookkeeping by exact origin (`src/runtime/wasm-component-driver-consensus.js:84–115`), and the physical lifecycle matches exact intent/token (`src/wasm-service/wasm-creation-retirement.js:43–54`); manager projection needs the corresponding ownership rule.

Required amendment: historical retirement remains permitted for its exact origin, but any manager state projection over the canonical key is conditional on exact current-creation ownership, or is omitted for the explicitly historical cleanup path. Do not create another physical-ownership authority. The witness must include successor handler memo, manager state, driver bookkeeping, endpoint/services rows, and live replica identity, while the old journal reaches its correct terminal completion.

### Blocking F3: a terminal historical retirement needs one result at its owning interaction

The handler alone currently treats durable local retirement plus `close.outcome === HISTORY_UNAVAILABLE` as completed (`src/node/runtime-service-bound-creation-route.js:373–382`). The physical retirement helper reports that same result as `CLOSE_UNRESOLVED` with `closed: false` (`src/wasm-service/wasm-creation-retirement.js:139–147`). Runtime STOPPED projection and manager journal completion run only on `closed === true` (`src/runtime/service-runtime-consensus-publication.js:123–126`; `src/service/service-consensus-bootstrap.js:127–131`). Thus an old binding whose owner history has advanced can appear completed at the handler while retaining its physical services row and IN_PROGRESS creation journal forever.

Required amendment: the existing retirement interaction owns one terminal-retirement fact when the exact durable local RETIRED evidence and authoritative resource history establish that the old exact resource cannot be live. Preserve the raw owner close answer and do not claim a CAS happened if it did not. Runtime, manager and handler must consume the same terminal fact for their existing ordered STOPPED projection, journal completion and outcome; none independently reclassifies HISTORY_UNAVAILABLE. The oracle must advance binding/slot history far enough to produce the actual owner HISTORY_UNAVAILABLE result, then verify old rows and journal completion while preserving the successor.

### 1. Resource-owner finality is the correct boundary

The current caller's `SEALED_RESERVATION_REFUSALS` list includes `INVALID_EXPECTED_STATE` and `TARGET_ALREADY_OWNED` (`src/service/service-consensus-creation-intent.js:48–52,359–375`). Both can be temporary: reservation checks the current resource phase/ordinal and other live slots, while close is monotone and permits their occupancy to end (`src/control-plane/owners/service-instance-state.js:212–238,255–295`). The proposed canonical `reservationRefusal` tag, produced as SEALED only by the state owner and defaulted to UNRESOLVED by the metadata interaction, correctly replaces outcome-name inference.

Each proposed SEALED decision has a monotone fact:

| Fact | Source basis | Review result |
| --- | --- | --- |
| Exact binding absent at a selection version no later than the retained state version | Selection increments the version and retains its decision; new selected/retiring instances are formed from the previous selected state, never restored by historical result replay (`service-instance-state.js:134–165,178–207`). Metadata rows are not deleted (`service-instance-metadata.js:160–167`). | Sound. A missing future selection must remain UNRESOLVED. |
| Requested next ordinal below the current ordinal | Resource ordinals are replaced only by the next admitted request; phase transitions never lower the ordinal (`service-instance-state.js:212–238,282–298`). | Sound. |
| Same ordinal occupied by a different operation or immutable request | The exact recorded request/token is the winner, including at CLOSED (`service-instance-state.js:217–224`). | Sound. The exact matching request must still resolve ADMITTED with its existing phase/token before finality classification. |
| Retiring binding would require a fresh reservation | Historical exact admissions resolve first; a new reservation is allowed only on `state.selected` (`service-instance-state.js:218–226`). | Sound. |
| Exact requested next ordinal is outside the supported counter range | A valid expected ordinal can have an unrepresentable successor; the state owner checks this independently of metadata encoding (`service-instance-state.js:42–50,225–228`). | Sound. Distinct from encoded-size exhaustion. |

Metadata read failure, failed encoding, an unknown submission, and exhausted CAS contention do not themselves prove temporal finality. Their current origins are distinct (`service-instance-metadata.js:35–45,55–76,84–96,169–205`). A later authoritative state observation may supply its own SEALED fact; an unknown submission alone may not. No new durable state is needed.

### 2. REMOVE-time failure mapping preserves custody

The approved design requires PENDING to remain recoverable until the exact request is admitted and its token persisted, or an owner proves it can never admit (`RECOVERY-DESIGN-20261017.md:593–617,832–845`). Proposal lines 38–46 preserve this: nonfinal reservation refusals become `UNKNOWN` with the original reason, which already maps to REMOVE_HELD (`runtime-service-bound-creation-route.js:49–56,397–405`). SEALED retains the PENDING-to-CANCELLED CAS and confirming reread (`service-consensus-creation-intent.js:337–346`). Exact ADMITTED retains the existing admission persistence and subsequent retirement path (`service-consensus-creation-intent.js:157–177,359–378`).

Implementation must keep journal corruption distinct from resource-owner uncertainty. The proposal's normalization applies to a reservation refusal; an invalid retained journal row remains its existing typed journal failure. The current `terminalAnswer` path remains authoritative for observed COMPLETED/CANCELLED/FAILED rows (`service-consensus-creation-intent.js:53–56,97–105,359–378`).

### 3. One stopped handler lifetime and one inventory application are necessary and coherent

The current restart latch can be opened after shutdown, scans can overlap or reapply, and delayed plans run without a stopped-lifetime check (`runtime-service-restart-inventory.js:42–49,159–178`; `runtime-service-handler.js:961–968`). Closing the same latch's lifetime before clearing maps, checking it after each await and before application/queued execution, and coalescing the startup task correct these races without making read-only observations a shutdown barrier.

Retry belongs only to a failed pre-application observation while the same handler is alive; successful application is retained and cannot later overwrite ACTIVE or REMOVING state. Typed per-entry local outcomes remain inventory data, as required by R1-A/R1-B; they are not a reason to bypass the normal typed re-entry or manufacture success. A stopped engaged handler's unresolved `ready` promise must stay unresolved. If `ready` already resolved, the stopped state still makes message admission false; a promise cannot be made unresolved again.

The same lifetime must gate scheduling, execution, wake acceptance, and late memo/outcome writes. Existing concrete sites are `runtime-service-bound-creation-route.js:115–168,182–207,368–370,446–455`. A late physical answer is not undone by ignoring its handler settlement; the proposal correctly gives the physical work separate lifecycle custody.

### 4. Startup retirement shares the existing removal gate, subject to F1/F2

The current startup redrive writes/deletes its operation entry unconditionally (`runtime-service-restart-inventory.js:109–125`), unlike the coordinator's replica-wide removal check (`runtime-service-handler.js:525–543,644–661`). Sharing that gate is correct. Requiring the current memo to name the old creation is not: see F1. Either a startup plan or coordinator request owns each admitted removal; startup emits no executor outcome, as required by R1-E (`RECOVERY-DESIGN-20261017.md:451–462`).

Implementation should preserve exact ownership of the in-flight entry through settlement: a stale continuation must not delete or replace another request's entry. The specified prohibition on overwriting in-flight work and stopped-lifetime checks require this behavior, without another registry or durable owner.

### 5. Lifecycle retirement admission and shutdown join close the by-path custody gap

`WasmServiceLifecycle.retireReplica` currently calls the by-path retirement helper without task custody, while `shutdownAll` snapshots only live/retiring replica objects (`wasm-service-lifecycle.js:483–484,748–757`). A by-path call can therefore suspend in metadata release and later reach the local tombstone/metadata close (`wasm-creation-retirement.js:120–147`) after the lifecycle's current shutdown has finished.

Registering the exact intent/token task before invoking collaborators, coalescing only that immutable identity, fencing new tasks synchronously with `consensusClosing`, and joining admitted tasks closes that gap. Existing live retirement already fences the exact replica synchronously and repeated replica shutdown joins the current settlement (`wasm-creation-retirement.js:43–54,70–75,120–128`; `wasm-service-replica-lifecycle.js:319–344`). Joining the retirement task together with those shutdowns does not introduce an ownership cycle: the release attempt resolves the captured metadata-release promise, and the live shutdown consumes it before tombstoning (`wasm-service-replica-lifecycle.js:234–245`).

A typed unresolved close may settle the task once it has no further effects; durable debt stays with the original journal. Failed live cleanup must remain in `retiringReplicas` and continue to make shutdown unsuccessful. The existing composition releases the process owner only after successful runtime shutdown (`storage/data-directory-process-owner.js:64–73`); the startup ledger similarly withholds exclusive release after failed ordinary cleanup (`entrypoint-startup-acquisition-ledger.js:45–51`). The proposal preserves those rules.

## Witness obligations carried into implementation review

The proposed oracle set is appropriate. Its discriminators should be recorded explicitly:

1. For both temporary refusal classes, hold a real original reservation request, observe REMOVE_HELD/PENDING, clear the blocking live occupancy, then deliver/retry the exact original request and verify token persistence and exact retirement. A fake refusal-name result alone is insufficient.
2. Check every monotone SEALED distinction, including missing old versus future binding, exact same closed admission versus conflicting ordinal, and counter exhaustion versus encoding failure. Malformed/failed input must not acquire a SEALED tag merely from an outcome name.
3. Suspend the journal scan and separately the local inspection across handler shutdown and actual process-owner handoff; release observations afterward. Assert no memos, ready opening, queued creation/retirement, wake-driven re-entry, or executor settlement from the old handler.
4. Concurrent inventory calls make one scan; an unavailable scan retries sequentially; successful inventory is reused after a memo becomes ACTIVE or REMOVING. No duplicate physical work or readiness publication follows.
5. Exercise both startup/coordinator REMOVE acquisition orders with exact operation-entry custody. Assert one admitted retirement, no startup executor outcome, and the coordinator's appropriate IN_PROGRESS/completion protocol.
   Add multiple distinct inventoried creations for one canonical replica, including old RETIRED/IN_PROGRESS plus a successor, with both scan orders and coordinator overlap. Add a duplicate operation crossing PENDING-to-IN_PROGRESS between the two scan reads. Assert every old exact obligation is preserved and executed once, and successor state is untouched at every owner listed in F2.
6. Suspend an already admitted by-path retirement in metadata release and then in metadata close. Shutdown and directory-owner release must not finish until that task settles. A late new retirement after the fence must answer typed UNAVAILABLE with zero local/metadata effects. Repeat with live cleanup failure and same-identity coalescing; a different intent/token is never joined as the same task.
7. Mutation evidence must kill finality-name inference, handler lifetime checks, inventory coalescing, shared removal admission, and lifecycle retirement joining separately. Classified owner-cone verification remains required; this approval grants no code or lab acceptance.

## Decision

REVISE this exact proposal for F1, F2 and F3, then obtain a new content-bound review before the affected corrective implementation. The finality taxonomy has separate bounded approval; the stopped lifetime, successful-inventory coalescing, and physical retirement shutdown join are otherwise sound as specified above. No user permission is needed for this design checkpoint. Recovery unit 2 remains behind the parent’s unit-1 verification gate.
